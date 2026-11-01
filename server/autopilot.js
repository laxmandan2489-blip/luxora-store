/*
 * AUTOPILOT (2026-11-01) - Instagram + Facebook, bina kuch dabaye.
 * ------------------------------------------------------------------
 * cron-job.org already calls /api/cron/social-post 4 times a day. When the
 * Auto Post line is EMPTY and Autopilot is ON, that same call now lets the
 * bot make and post the next post by itself:
 *
 *   order:  Bag (Cream) -> Model -> Bag (Black) -> Model -> ...
 *   Bag post   = one bag, its colours in one carousel. Per colour:
 *                slide "Clean · text below" (name + price), then 1-2
 *                "No text · only bag" slides. One background per post.
 *   Model post = slide 1 AI lifestyle photo of the SAME bag, slide 2 the
 *                bag's real photo with name + price. Background: Cream for
 *                a dark bag, Black for a light bag.
 *
 * Lifestyle photos: Gemini makes 3 (hand / shoulder / cafe table) from the
 * bag's real first photo. Gemini then compares each one with the real
 * photo (same bag, colour, shape, hardware, strap, no text, natural hands)
 * and only a photo that passes every check is used. If none passes, a
 * normal bag post goes instead - a wrong-looking bag is never posted.
 * Unused passing photos are kept for that bag's next model post.
 *
 * Honest by design: the caption says photo 1 is an AI styled look and
 * photo 2 is the real product. Nothing is added to the website's product
 * photos. Each post also gets a "New in" story. An email report goes to
 * ADMIN_EMAIL (or GMAIL_USER) after every post.
 *
 * State: social/autopilot.json in the same Supabase bucket (no new table).
 * Nothing in the old Auto Post / Social Poster code changes.
 */
const path = require("path");
const sharp = require("sharp");

const STATE_PATH = "social/autopilot.json";
const SITE = String(process.env.SITE_URL || "https://shrimoh.vercel.app").replace(/\/+$/, "");
const FONT_DIR = __dirname; // font files sit next to server.js (easy upload)
const SERIF_FILE = path.join(FONT_DIR, "CormorantGaramond.ttf");
const SANS_FILE = path.join(FONT_DIR, "Urbanist.ttf");

const BACKGROUNDS = {
  cream: { rgb: { r: 246, g: 243, b: 238 }, ink: "#1c150d", muted: "#8f877c", soft: "#8a7650" },
  black: { rgb: { r: 28, g: 21, b: 13 }, ink: "#ffffff", muted: "#a59d92", soft: "#d9d2c6" },
};
const TINY_LINE = "FREE DELIVERY (PREPAID)  ·  COD AVAILABLE";
// order of posts: 0 bag cream, 1 model, 2 bag black, 3 model
const PATTERN = ["bag-cream", "model", "bag-black", "model"];

const SCENES = [
  {
    key: "hand",
    text: "a stylish young Indian woman holding this exact bag by its handle at her side, framed from shoulders to knees, wearing a simple elegant outfit in soft neutral tones, standing in a bright, minimal, modern interior with soft daylight",
  },
  {
    key: "shoulder",
    text: "a stylish young Indian woman carrying this exact bag on her shoulder while walking on a clean, softly blurred city street in warm golden-hour light, framed from the waist up, face turned slightly away from the camera",
  },
  {
    key: "table",
    text: "this exact bag standing on a light marble cafe table next to a cup of coffee and a pair of sunglasses, a woman's hand with neat nude nails resting lightly on the table beside it, soft natural window light, shallow depth of field",
  },
];

const HOOKS = [
  "the one you'll reach for every day.",
  "simple, classy, and easy to style.",
  "for office days and dinner plans.",
  "a little classic, a little modern.",
  "pairs with a kurti, jeans or a dress.",
  "your everyday essentials, neatly in one place.",
];

const CATEGORY_TAGS = {
  handbags: ["#handbag", "#handbagsforwomen"],
  "shoulder bags": ["#shoulderbag", "#everydaybag"],
  "crossbody bags": ["#slingbag", "#crossbodybag"],
  "tote bags": ["#totebag", "#officebag"],
  backpacks: ["#backpack", "#backpackforgirls"],
  clutches: ["#clutch", "#partybag"],
  wallets: ["#wallet", "#walletforwomen"],
};
const WORD_TAGS = [
  [/sling/i, "#slingbag"],
  [/tote/i, "#totebag"],
  [/clutch/i, "#clutchbag"],
  [/potli/i, "#potlibag"],
  [/hobo/i, "#hobobag"],
  [/shoulder/i, "#shoulderbag"],
  [/cross\s*body/i, "#crossbodybag"],
  [/mini/i, "#minibag"],
  [/party|festive|embellish|sequin|pearl/i, "#partybag"],
  [/office|work|laptop/i, "#officebag"],
];
const BASE_TAGS = ["#shrimoh", "#handbags", "#bagsforwomen", "#womenfashion", "#stylishbags", "#bagsofinstagram"];

function rupees(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function escapeMarkup(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// AI lifestyle photos that were added to a product's website gallery
function isLifestyleUrl(url) {
  return String(url || "").includes("/autopilot/lifestyle/");
}

module.exports = function setupAutopilot(app, deps) {
  const {
    supabase,
    STORAGE_BUCKET,
    requireAdmin,
    formatProduct,
    readAutoQueue,
    writeAutoQueue,
    publishAutoItem,
    getMetaIds,
    publishInstagram,
    publishFacebook,
    deleteStorageImages,
    sendTransactionalEmail,
  } = deps;
  const GEMINI_API_KEY = deps.GEMINI_API_KEY;
  const TEXT_MODEL = deps.GEMINI_MODEL || "gemini-2.5-flash";
  const IMAGE_MODEL = deps.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const REPORT_TO = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "infoshrimoh@gmail.com";

  let running = null; // { startedAt, stage, dryRun }

  /* ---------------- state ---------------- */
  function emptyState() {
    return {
      enabled: false,
      perWeek: 4,
      story: true,
      step: 0,
      lastAutoAt: 0,
      recent: [],
      postedAt: {},
      lifestyle: {},
      skipModel: {},
      log: [],
      preview: null,
    };
  }

  async function readState() {
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STATE_PATH);
      if (error || !data) return emptyState();
      return { ...emptyState(), ...JSON.parse(await data.text()) };
    } catch {
      return emptyState();
    }
  }

  async function writeState(state) {
    const clean = { ...state, log: (state.log || []).slice(0, 40), recent: (state.recent || []).slice(0, 8) };
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STATE_PATH, Buffer.from(JSON.stringify(clean)), { contentType: "application/json", upsert: true, cacheControl: "0" });
    if (error) throw new Error(`Autopilot save nahi hua: ${error.message}`);
  }

  function setStage(text) {
    if (running) running.stage = text;
    console.log("AUTOPILOT:", text);
  }

  /* ---------------- files ---------------- */
  async function fetchBuffer(url) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Photo download error ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        lastError = error;
        await sleep(attempt * 800);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  async function saveJpeg(buffer, folder) {
    const storagePath = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
        if (error) throw error;
        return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      } catch (error) {
        lastError = error;
        await sleep(attempt * 600);
      }
    }
    throw lastError;
  }

  /* ---------------- design (same look as Ad Maker "Clean") ---------------- */
  async function textImage(text, { serif = false, weight = "Medium", size, color, width, spacing = 0, strike = false, align = "centre" }) {
    const markup =
      `<span foreground="${color}"${spacing ? ` letter_spacing="${Math.round(spacing * 1024)}"` : ""}` +
      `${strike ? ' strikethrough="true"' : ""}>${escapeMarkup(text)}</span>`;
    const buffer = await sharp({
      text: {
        text: markup,
        fontfile: serif ? SERIF_FILE : SANS_FILE,
        font: `${serif ? "Cormorant Garamond" : "Urbanist"} ${weight} ${size}`,
        width: width || undefined,
        align,
        rgba: true,
        dpi: 72,
        wrap: "word",
      },
    })
      .png()
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return { input: buffer, width: meta.width, height: meta.height };
  }

  /*
   * White photo background -> melts into Cream / Black (no white box).
   * Flood-fills the near-white area that touches the photo's border; soft
   * grey shadows under the bag stay as a light shadow. If the photo's
   * border is not plain white, or the fill would eat the bag, the photo is
   * used as it is (framed) - safe fallback.
   */
  async function meltBackground(resized, bgName, strict) {
    const { data, info } = await sharp(resized).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const total = w * h;
    const lum = new Float32Array(total);
    const flat = new Uint8Array(total); // low colour = white / grey
    for (let i = 0, p = 0; i < total; i++, p += 3) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      flat[i] = Math.max(r, g, b) - Math.min(r, g, b) < (strict ? 12 : 22) ? 1 : 0;
    }
    const whiteCut = strict ? 246 : 238;
    const greyCut = strict ? 205 : 190;
    // border must be mostly plain white
    let border = 0;
    let borderWhite = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { border++; if (flat[y * w + x] && lum[y * w + x] >= whiteCut) borderWhite++; }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { border++; if (flat[y * w + x] && lum[y * w + x] >= whiteCut) borderWhite++; }
    if (borderWhite / border < 0.8) return null;

    const inBg = new Uint8Array(total);
    const stack = new Int32Array(total);
    let top = 0;
    const tryPush = (i) => {
      if (!inBg[i] && flat[i] && lum[i] >= greyCut) {
        inBg[i] = 1;
        stack[top++] = i;
      }
    };
    for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1); }
    while (top) {
      const i = stack[--top];
      const x = i % w;
      if (x > 0) tryPush(i - 1);
      if (x < w - 1) tryPush(i + 1);
      if (i >= w) tryPush(i - w);
      if (i < total - w) tryPush(i + w);
    }
    // pure-white holes inside the bag (e.g. inside a handle) are background too
    let fgCount = 0;
    for (let i = 0; i < total; i++) fgCount += inBg[i] ? 0 : 1;
    const seen = new Uint8Array(total);
    const hole = (i) => !inBg[i] && !seen[i] && flat[i] && lum[i] >= 248;
    for (let start = 0; start < total; start++) {
      if (!hole(start)) continue;
      const members = [];
      let sum = 0;
      seen[start] = 1;
      stack[0] = start;
      top = 1;
      while (top) {
        const i = stack[--top];
        members.push(i);
        sum += lum[i];
        const x = i % w;
        for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (n >= 0 && n < total && hole(n)) {
            seen[n] = 1;
            stack[top++] = n;
          }
        }
      }
      if (members.length >= 30 && members.length <= fgCount * 0.25 && sum / members.length >= 251) {
        for (const i of members) inBg[i] = 1;
      }
    }
    let bgCount = 0;
    for (let i = 0; i < total; i++) bgCount += inBg[i];
    if (bgCount / total > 0.93 || bgCount / total < 0.05) return null;

    // bag mask (eroded ~1px so no white rim), shadow strength for grey bg pixels
    const mask = Buffer.alloc(total);
    const shadow = Buffer.alloc(total);
    for (let i = 0; i < total; i++) {
      if (!inBg[i]) mask[i] = 255;
      else if (lum[i] < whiteCut) shadow[i] = Math.round(Math.min(1, (whiteCut - lum[i]) / (whiteCut - greyCut)) * (bgName === "black" ? 0 : 150));
    }
    const softMask = await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).blur(1.1).linear(1.6, -150).blur(0.7).toColourspace("b-w").raw().toBuffer();
    const softShadow = await sharp(shadow, { raw: { width: w, height: h, channels: 1 } }).blur(2).toColourspace("b-w").raw().toBuffer();
    if (softMask.length !== total || softShadow.length !== total) return null;
    const theme = BACKGROUNDS[bgName] || BACKGROUNDS.cream;
    const out = Buffer.alloc(total * 4);
    for (let i = 0, p = 0, q = 0; i < total; i++, p += 3, q += 4) {
      const a = softMask[i] / 255;
      const s = (softShadow[i] / 255) * (1 - a);
      // shadow = darker version of the background colour
      const sr = theme.rgb.r * 0.55;
      const sg = theme.rgb.g * 0.52;
      const sb = theme.rgb.b * 0.48;
      const alpha = a + s;
      out[q] = alpha ? Math.round((data[p] * a + sr * s) / alpha) : 0;
      out[q + 1] = alpha ? Math.round((data[p + 1] * a + sg * s) / alpha) : 0;
      out[q + 2] = alpha ? Math.round((data[p + 2] * a + sb * s) / alpha) : 0;
      out[q + 3] = Math.round(Math.min(1, alpha) * 255);
    }
    return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }

  async function fitPhoto(photoBuffer, boxW, boxH, bgName, light) {
    const resized = await sharp(photoBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: Math.round(boxW), height: Math.round(boxH), fit: "inside", withoutEnlargement: false })
      .jpeg({ quality: 94 })
      .toBuffer();
    let buffer = resized;
    if (bgName) {
      try {
        const melted = await meltBackground(resized, bgName, light && bgName === "black");
        if (melted) buffer = melted;
      } catch (error) {
        console.error("AUTOPILOT MELT SKIPPED:", error.message);
      }
    }
    const meta = await sharp(buffer).metadata();
    return { input: buffer, width: meta.width, height: meta.height };
  }

  // kind: "below" (name + price) | "only" (just the bag) | "story" (9:16 New in)
  async function renderSlide(photoBuffer, { kind, bg, name, price, mrp, label = "New in", tiny: tinyText = null }) {
    const W = 1080;
    const H = kind === "story" ? 1920 : 1350;
    const theme = BACKGROUNDS[bg] || BACKGROUNDS.cream;
    const m = Math.round(W * 0.07);
    const layers = [];
    const light = bg === "black" ? await bagIsLight(photoBuffer) : false;

    if (kind === "only") {
      const photo = await fitPhoto(photoBuffer, W - m * 2, H - m * 2, bg, light);
      layers.push({ ...photo, left: Math.round((W - photo.width) / 2), top: Math.round((H - photo.height) / 2) });
    } else {
      const story = kind === "story";
      const top = story ? Math.round(H * 0.07) : m;
      const bottom = H - (story ? Math.round(H * 0.07) : Math.round(m * 0.85));
      const wordmark = await textImage("SHRIMOH", { serif: true, weight: "SemiBold", size: 34, color: theme.ink, spacing: 17 });
      layers.push({ ...wordmark, left: Math.round((W - wordmark.width) / 2), top });
      let photoTop = top + wordmark.height + 46;
      if (story && label) {
        const labelImg = await textImage(label, { serif: true, weight: "Medium", size: 46, color: theme.soft, spacing: 2 });
        layers.push({ ...labelImg, left: Math.round((W - labelImg.width) / 2), top: photoTop + 10 });
        photoTop += labelImg.height + 60;
      }

      const tiny = await textImage(tinyText || (story ? `${TINY_LINE}  ·  LINK IN BIO` : TINY_LINE), { weight: "SemiBold", size: story ? 19 : 18, color: theme.soft, spacing: 5 });
      const tinyTop = bottom - tiny.height;
      layers.push({ ...tiny, left: Math.round((W - tiny.width) / 2), top: tinyTop });

      let cursor = tinyTop - (story ? 56 : 42);
      if (Number(price) > 0) {
        const priceImg = await textImage(rupees(price), { weight: "SemiBold", size: story ? 46 : 39, color: theme.ink });
        const showMrp = Number(mrp) > Number(price);
        const mrpImg = showMrp ? await textImage(rupees(mrp), { weight: "Medium", size: story ? 23 : 19, color: theme.muted, strike: true }) : null;
        const gap = showMrp ? 14 : 0;
        const total = priceImg.width + gap + (mrpImg ? mrpImg.width : 0);
        const priceTop = cursor - priceImg.height;
        const startX = Math.round((W - total) / 2);
        layers.push({ ...priceImg, left: startX, top: priceTop });
        if (mrpImg) layers.push({ ...mrpImg, left: startX + priceImg.width + gap, top: priceTop + priceImg.height - mrpImg.height - 2 });
        cursor = priceTop - 22;
      }
      const nameImg = await textImage(name, { serif: true, weight: "Medium", size: story ? 62 : 54, color: theme.ink, width: W - m * 2 });
      const nameTop = cursor - nameImg.height;
      layers.push({ ...nameImg, left: Math.round((W - nameImg.width) / 2), top: nameTop });

      const photoBottom = nameTop - (story ? 70 : 52);
      const photo = await fitPhoto(photoBuffer, W - m * 2, Math.max(200, photoBottom - photoTop), bg, light);
      layers.push({ ...photo, left: Math.round((W - photo.width) / 2), top: Math.round(photoTop + (photoBottom - photoTop - photo.height) / 2) });
    }

    return sharp({ create: { width: W, height: H, channels: 3, background: theme.rgb } })
      .composite(layers.map((layer) => ({ input: layer.input, left: layer.left, top: layer.top })))
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  async function renderModelSlide(lifestyleBuffer) {
    return sharp(lifestyleBuffer)
      .rotate()
      .resize({ width: 1080, height: 1350, fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  // Light bag -> Black background, dark bag -> Cream (only the bag's own
  // pixels are measured, the white photo background is ignored).
  async function bagIsLight(photoBuffer) {
    try {
      const { data, info } = await sharp(photoBuffer).resize(120, 120, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 238 && g > 238 && b > 238) continue;
        sum += 0.299 * r + 0.587 * g + 0.114 * b;
        count += 1;
      }
      return count > 50 ? sum / count > 150 : false;
    } catch {
      return false;
    }
  }

  /* ---------------- products ---------------- */
  async function loadProducts() {
    const { data, error } = await supabase.from("products").select("*").eq("active", true);
    if (error) throw new Error(`Products nahi mile: ${error.message}`);
    const list = (data || [])
      .filter((row) => !row.status || row.status === "published")
      .map((row) => formatProduct(row))
      .map((p) => p && stripLifestyle(p))
      .filter((p) => p && p.images.length && p.name);
    const inStock = list.filter((p) => p.stock > 0);
    return inStock.length >= 3 ? inStock : list;
  }

  function stripLifestyle(p) {
    const colorImages = {};
    for (const [colour, urls] of Object.entries(p.colorImages || {})) {
      const real = urls.filter((url) => !isLifestyleUrl(url));
      if (real.length) colorImages[colour] = real;
    }
    return { ...p, images: (p.images || []).filter((url) => !isLifestyleUrl(url)), colorImages };
  }

  // one checked lifestyle photo for a bag (reuses a saved one, else makes new)
  async function ensureLifestyle(product, colour) {
    if (running) return null;
    const real = stripLifestyle(product);
    const variant = variantsOf(real).find((v) => !colour || v.colour === colour) || variantsOf(real)[0];
    if (!variant || !variant.photos[0]) return null;
    const state = await readState();
    const result = await lifestyleFor(real, variant.photos[0], state, variant.colour);
    const latest = await readState();
    latest.lifestyle = { ...(latest.lifestyle || {}), [product.id]: state.lifestyle?.[product.id] || latest.lifestyle?.[product.id] || [] };
    if (!latest.lifestyle[product.id].length) delete latest.lifestyle[product.id];
    if (!result || !result.url) latest.skipModel = { ...(latest.skipModel || {}), [product.id]: Date.now() + 14 * 24 * 3600 * 1000 };
    await writeState(latest);
    return result && result.url ? { url: result.url, colour: variant.colour, report: result.report || [] } : { url: null, report: result?.report || [] };
  }

  async function loadProductsAll() {
    const { data, error } = await supabase.from("products").select("*").eq("active", true);
    if (error) throw new Error(`Products nahi mile: ${error.message}`);
    return (data || []).map((row) => formatProduct(row)).filter((p) => p && p.images.length);
  }

  function variantsOf(product) {
    const variants = [];
    for (const [colour, urls] of Object.entries(product.colorImages || {})) {
      if (urls.length) variants.push({ colour, name: product.colorNames?.[colour] || product.name, photos: urls });
    }
    if (!variants.length) variants.push({ colour: (product.colors || [])[0] || "", name: product.name, photos: product.images });
    return variants;
  }

  function colourNames(product) {
    const seen = new Set();
    return [...(product.colors || []), ...Object.keys(product.colorImages || {})]
      .map((c) => String(c || "").trim())
      .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
  }

  function pickProduct(products, state, queue, kind) {
    const recent = new Set([...(state.recent || []), ...(queue.history || []).slice(0, 5).map((h) => h.productId)].filter((id) => id != null).map(String));
    const lastPosted = (id) => Math.max(Number(queue.posted?.[id]) || 0, Number(state.postedAt?.[id]) || 0);
    let pool = products.filter((p) => !recent.has(String(p.id)));
    if (!pool.length) pool = products.filter((p) => String(p.id) !== String((state.recent || [])[0]));
    if (kind === "model") {
      const now = Date.now();
      const ok = pool.filter((p) => !(Number(state.skipModel?.[p.id]) > now));
      if (ok.length) pool = ok;
      // bags that already have a checked lifestyle photo go first (no Gemini cost)
      const ready = pool.filter((p) => (state.lifestyle?.[p.id] || []).some((item) => !item.usedAt));
      if (ready.length) pool = ready;
    }
    pool.sort((a, b) => lastPosted(a.id) - lastPosted(b.id) || Math.random() - 0.5);
    return pool[0] || null;
  }

  /* ---------------- captions (short, honest - like Caption Maker) ---------------- */
  function hashtags(product) {
    const text = `${product.name} ${product.category} ${colourNames(product).join(" ")}`;
    const tags = [...(CATEGORY_TAGS[String(product.category || "").toLowerCase()] || [])];
    for (const [pattern, tag] of WORD_TAGS) if (pattern.test(text)) tags.push(tag);
    tags.push(...BASE_TAGS);
    return [...new Set(tags)].slice(0, 6).join(" ");
  }

  function captions(product, name, kind, hookIndex) {
    const colours = colourNames(product);
    const link = `${SITE}/product/${product.id}?utm_source=facebook&utm_medium=social&utm_campaign=autopilot`;
    const build = (platform) => {
      const lines = [`${name} 🤍`, HOOKS[hookIndex % HOOKS.length]];
      if (Number(product.price) > 0) {
        lines.push(`${rupees(product.price)}${colours.length >= 2 ? ` · ${colours.length} colours` : ""}`);
      }
      lines.push("Free delivery (prepaid) · COD available");
      if (kind === "model") lines.push("Photo 1: styled look (AI) · Photo 2: real product photo");
      lines.push(platform === "facebook" ? `Shop: ${link}` : "Link in bio 🛍");
      lines.push("", hashtags(product));
      return lines.join("\n");
    };
    return { instagram: build("instagram").slice(0, 2200), facebook: build("facebook") };
  }

  /* ---------------- Gemini: make + check lifestyle photos ---------------- */
  async function geminiCall(model, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`Gemini ${response.status}: ${text.slice(0, 200)}`);
        error.status = response.status;
        throw error;
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  async function makeLifestyle(refJpeg, product, scene) {
    const kind = String(product.category || "handbag").toLowerCase();
    const size = product.dimensions ? ` Its real size is ${product.dimensions}; keep that size realistic against the body.` : " Keep its real size realistic against the body.";
    const prompt =
      `Use the bag in the reference photo (a ${kind}). It must stay exactly the same bag: same shape, same proportions, ` +
      "same colour and shade, same material texture, same stitching, same hardware (buckles, zips, chains, clasp) and the same strap or handle. " +
      `Do not redesign, recolour, add or remove any part, and do not put any logo or text on it.${size} ` +
      `Create a photorealistic premium fashion photograph: ${scene.text}. ` +
      "Vertical 4:5 composition, the whole bag clearly visible and in sharp focus, natural realistic hands and body, " +
      "high-end Instagram brand aesthetic, no text, no watermark, no logos.";
    const parts = [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: refJpeg.toString("base64") } }];
    let data;
    try {
      data = await geminiCall(IMAGE_MODEL, {
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
      });
    } catch (error) {
      if (error.status !== 400) throw error;
      data = await geminiCall(IMAGE_MODEL, { contents: [{ parts }] }); // older model: no aspect setting
    }
    const found = (data?.candidates?.[0]?.content?.parts || []).find((part) => part.inlineData || part.inline_data);
    const inline = found && (found.inlineData || found.inline_data);
    if (!inline?.data) throw new Error("Gemini ne photo nahi di");
    return Buffer.from(inline.data, "base64");
  }

  async function checkLifestyle(refJpeg, madeJpeg) {
    const prompt =
      "Image 1 is the real product photo of a handbag we sell. Image 2 is an AI-made lifestyle photo that must show the very same bag. " +
      "A customer will receive the bag in Image 1, so Image 2 must not mislead them in any way. Be strict. " +
      "Score 0-10: same_bag (overall the same product), colour (same colour and shade), shape (same silhouette and proportions), " +
      "hardware (same buckles, zips, chain, clasp, metal colour), strap (same handle/strap type and length), bag_visible (bag is clearly visible and in focus), " +
      "premium_look (would look premium on a fashion brand's Instagram). Also: extra_text (true if any text, logo, letters or watermark appear anywhere in Image 2), " +
      "body_ok (true only if hands, fingers, face and body look natural with no extra or missing fingers or deformities). " +
      'Reply ONLY with JSON: {"same_bag":0,"colour":0,"shape":0,"hardware":0,"strap":0,"bag_visible":0,"premium_look":0,"extra_text":false,"body_ok":true,"problems":"short"}';
    const small = await sharp(madeJpeg).resize(900, 900, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const data = await geminiCall(TEXT_MODEL, {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: refJpeg.toString("base64") } },
            { inline_data: { mime_type: "image/jpeg", data: small.toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const r = JSON.parse(text.replace(/```json|```/g, "").trim());
    const n = (v) => Math.max(0, Math.min(10, Number(v) || 0));
    const scores = { same_bag: n(r.same_bag), colour: n(r.colour), shape: n(r.shape), hardware: n(r.hardware), strap: n(r.strap), bag_visible: n(r.bag_visible), premium_look: n(r.premium_look) };
    const pass =
      Math.min(scores.same_bag, scores.colour, scores.shape, scores.hardware, scores.strap) >= 8 &&
      scores.bag_visible >= 7 &&
      scores.premium_look >= 6 &&
      r.extra_text !== true &&
      r.body_ok === true;
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    return { pass, total, scores, problems: String(r.problems || "").slice(0, 160) };
  }

  // Returns { url, buffer, check } of a passing lifestyle photo, or null.
  async function lifestyleFor(product, refUrl, state, colour) {
    const saved = (state.lifestyle?.[product.id] || []).filter((item) => !item.usedAt && (!colour || item.colour === colour));
    if (saved.length) {
      const best = saved.sort((a, b) => (b.total || 0) - (a.total || 0))[0];
      try {
        return { url: best.url, buffer: await fetchBuffer(best.url), check: best.check || null, reused: true };
      } catch {
        // photo gone - make new ones below
      }
    }
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY Render mein nahi hai");
    const refJpeg = await sharp(await fetchBuffer(refUrl)).rotate().resize(1024, 1024, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();

    setStage(`Lifestyle photos ban rahi hain: ${product.name}`);
    const made = await Promise.all(
      SCENES.map(async (scene) => {
        try {
          return { scene: scene.key, buffer: await makeLifestyle(refJpeg, product, scene) };
        } catch (error) {
          console.error("AUTOPILOT LIFESTYLE ERROR:", scene.key, error.message);
          return null;
        }
      })
    );
    setStage("Photos asli bag se mila ke check ho rahi hain");
    const checked = [];
    for (const item of made.filter(Boolean)) {
      try {
        checked.push({ ...item, check: await checkLifestyle(refJpeg, item.buffer) });
      } catch (error) {
        console.error("AUTOPILOT CHECK ERROR:", error.message);
      }
    }
    const passing = checked.filter((item) => item.check.pass).sort((a, b) => b.check.total - a.check.total);
    const report = checked.map((item) => ({ scene: item.scene, pass: item.check.pass, total: item.check.total, problems: item.check.problems }));
    if (!passing.length) return { url: null, report, made: made.filter(Boolean).length };

    state.lifestyle = state.lifestyle || {};
    const library = state.lifestyle[product.id] || [];
    let first = null;
    for (const item of passing) {
      const jpeg = await sharp(item.buffer).jpeg({ quality: 90 }).toBuffer();
      const url = await saveJpeg(jpeg, "autopilot/lifestyle");
      const entry = { url, colour: colour || "", scene: item.scene, total: item.check.total, check: item.check, at: Date.now(), usedAt: null };
      library.push(entry);
      if (!first) first = { url, buffer: jpeg, check: item.check };
    }
    state.lifestyle[product.id] = library.slice(-9);
    return { ...first, report };
  }

  /* ---------------- build one post ---------------- */
  async function buildPost(state, queue, wantKind, notes) {
    const products = await loadProducts();
    if (!products.length) throw new Error("Koi active bag nahi mila");
    const kind = wantKind === "model" ? "model" : "bag";
    const product = pickProduct(products, state, queue, kind);
    if (!product) throw new Error("Post ke liye bag nahi mila");
    const hookIndex = Math.floor(Math.random() * HOOKS.length);
    const variants = variantsOf(product);

    if (kind === "model") {
      const variant = variants[0];
      const refUrl = variant.photos[0];
      let result = null;
      try {
        result = await lifestyleFor(product, refUrl, state, variant.colour);
      } catch (error) {
        notes.push(`Lifestyle nahi bani: ${error.message}`);
      }
      if (result && result.report) notes.push(...result.report.map((r) => `${r.scene}: ${r.pass ? "✅ paas" : "❌ fail"} (${r.total}/70)${r.problems ? ` - ${r.problems}` : ""}`));
      if (result && result.url) {
        setStage("Model post ki slides ban rahi hain");
        const realPhoto = await fetchBuffer(refUrl);
        const bg = (await bagIsLight(realPhoto)) ? "black" : "cream";
        const slide1 = await renderModelSlide(result.buffer);
        const slide2 = await renderSlide(realPhoto, { kind: "below", bg, name: variant.name, price: product.price, mrp: product.oldPrice });
        const story = state.story ? await renderSlide(realPhoto, { kind: "story", bg, name: variant.name, price: product.price, mrp: product.oldPrice }) : null;
        const entry = (state.lifestyle[product.id] || []).find((item) => item.url === result.url);
        if (entry) entry.usedAt = Date.now();
        return { kind: "model", product, bg, slides: [slide1, slide2], story, captions: captions(product, variant.name, "model", hookIndex), thumb: result.url, label: `Model · ${variant.name}` };
      }
      // nothing passed -> never post a wrong bag; skip this bag's model post for 14 days
      state.skipModel = { ...(state.skipModel || {}), [product.id]: Date.now() + 14 * 24 * 3600 * 1000 };
      notes.push("Koi lifestyle photo check paas nahi hui - iski jagah bag post jayegi (agli baar phir model post try hogi).");
      const post = await buildBagPost(state, products, queue, product, state.lastBagBg === "cream" ? "black" : "cream", hookIndex);
      return { ...post, fallback: true };
    }
    return buildBagPost(state, products, queue, product, wantKind === "bag-black" ? "black" : "cream", hookIndex);
  }

  async function buildBagPost(state, products, queue, product, bg, hookIndex) {
    setStage(`Bag post ban rahi hai: ${product.name}`);
    const slides = [];
    let storyPhoto = null;
    let firstName = product.name;
    for (const variant of variantsOf(product).slice(0, 4)) {
      if (slides.length >= 10) break;
      const photos = variant.photos.slice(0, Math.min(3, 10 - slides.length));
      for (let i = 0; i < photos.length; i++) {
        let buffer;
        try {
          buffer = await fetchBuffer(photos[i]);
        } catch {
          continue;
        }
        if (!storyPhoto) {
          storyPhoto = buffer;
          firstName = variant.name;
        }
        slides.push(await renderSlide(buffer, { kind: i === 0 ? "below" : "only", bg, name: variant.name, price: product.price, mrp: product.oldPrice }));
      }
    }
    if (!slides.length) throw new Error(`${product.name} ki photos download nahi hui`);
    const story = state.story && storyPhoto ? await renderSlide(storyPhoto, { kind: "story", bg, name: firstName, price: product.price, mrp: product.oldPrice }) : null;
    return { kind: "bag", product, bg, slides, story, captions: captions(product, firstName, "bag", hookIndex), thumb: product.images[0], label: `Bag · ${product.name}` };
  }

  /* ---------------- run ---------------- */
  async function uploadPost(post) {
    const slideUrls = [];
    for (const slide of post.slides) slideUrls.push(await saveJpeg(slide, "social/autopilot"));
    const storyUrl = post.story ? await saveJpeg(post.story, "social/autopilot") : null;
    return { slideUrls, storyUrl };
  }

  async function publishPrepared(state, prepared, targets) {
    const queue = await readAutoQueue();
    const item = {
      id: `auto-${Date.now()}`,
      label: `🤖 ${prepared.label}`,
      productId: prepared.productId,
      bg: prepared.bg,
      imageUrls: prepared.slideUrls,
      captions: prepared.captions,
      targets,
      addedAt: Date.now(),
    };
    queue.items.unshift(item);
    setStage("Instagram + Facebook par post ho rahi hai");
    const results = await publishAutoItem(queue, item);
    const storyResults = {};
    if (prepared.storyUrl && Object.values(results).some((r) => r && r.ok)) {
      setStage("New in story lag rahi hai");
      try {
        const ids = await getMetaIds();
        for (const target of targets) {
          try {
            storyResults[target] = target === "instagram" ? await publishInstagram(ids, "story", [prepared.storyUrl]) : await publishFacebook(ids, "story", [prepared.storyUrl]);
            storyResults[target].ok = true;
          } catch (error) {
            storyResults[target] = { ok: false, message: error.message };
          }
        }
      } catch (error) {
        storyResults.error = { ok: false, message: error.message };
      }
      deleteStorageImages([prepared.storyUrl]).catch(() => {});
    }
    const okAny = Object.values(results).some((r) => r && r.ok);
    if (okAny) {
      if (prepared.kind === "bag") state.lastBagBg = prepared.bg;
      // a model post that fell back to a bag post keeps "model" as the next turn
      if (!prepared.fallback) state.step = ((Number(state.step) || 0) + 1) % PATTERN.length;
      state.lastAutoAt = Date.now();
      state.recent = [prepared.productId, ...(state.recent || []).filter((id) => String(id) !== String(prepared.productId))];
      state.postedAt = { ...(state.postedAt || {}), [prepared.productId]: Date.now() };
    }
    return { results, storyResults, okAny };
  }

  async function sendReport(entry) {
    try {
      const line = (name, r) => (r ? `${name}: ${r.ok ? `✅ ${r.link ? `<a href="${r.link}">dekho</a>` : "live"}` : `❌ ${escapeMarkup(r.message || "")}`}` : "");
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;color:#1c150d">
          <h2 style="font-weight:600">${entry.ok ? "✅ Autopilot ne post daali" : "⚠️ Autopilot: post nahi gayi"}</h2>
          <p><b>${escapeMarkup(entry.label)}</b></p>
          ${entry.thumb ? `<img src="${entry.thumb}" style="width:220px;border-radius:8px;border:1px solid #ddd" />` : ""}
          <p>${[line("Instagram", entry.results?.instagram), line("Facebook", entry.results?.facebook), line("Story (IG)", entry.storyResults?.instagram)].filter(Boolean).join("<br/>")}</p>
          ${entry.message ? `<p>${escapeMarkup(entry.message)}</p>` : ""}
          ${(entry.notes || []).length ? `<p style="font-size:13px;color:#555">${entry.notes.map(escapeMarkup).join("<br/>")}</p>` : ""}
          <p style="font-size:13px;color:#555">Kuch galat lage to Instagram app mein us post par ••• &gt; Archive/Delete. Autopilot band karna ho to Admin &gt; 🤖 Autopilot.</p>
        </div>`;
      await sendTransactionalEmail({ to: REPORT_TO, subject: `SHRIMOH Autopilot: ${entry.ok ? "post live" : "dikkat"} - ${entry.label}`, html });
    } catch (error) {
      console.error("AUTOPILOT EMAIL ERROR:", error.message);
    }
  }

  async function runOnce({ dryRun = false, manual = false } = {}) {
    if (running) return { started: false, message: "Autopilot pehle se chal raha hai" };
    running = { startedAt: Date.now(), stage: "Shuru", dryRun };
    (async () => {
      const notes = [];
      let state = await readState();
      const wantKind = PATTERN[(Number(state.step) || 0) % PATTERN.length];
      let entry = { at: Date.now(), kind: wantKind, label: "", ok: false, dryRun, manual, notes };
      try {
        const queue = await readAutoQueue();
        const post = await buildPost(state, queue, wantKind, notes);
        setStage("Slides save ho rahi hain");
        const { slideUrls, storyUrl } = await uploadPost(post);
        const prepared = {
          kind: post.kind,
          productId: post.product.id,
          label: post.label,
          bg: post.bg,
          slideUrls,
          storyUrl,
          captions: post.captions,
          thumb: post.thumb,
          fallback: Boolean(post.fallback),
          notes,
          createdAt: Date.now(),
        };
        entry = { ...entry, kind: post.kind, label: post.label, productId: post.product.id, thumb: post.thumb };
        state = { ...(await readState()), lifestyle: state.lifestyle, skipModel: state.skipModel };
        if (dryRun) {
          if (state.preview) deleteStorageImages([...(state.preview.slideUrls || []), state.preview.storyUrl].filter(Boolean)).catch(() => {});
          state.preview = prepared;
          entry.ok = true;
          entry.message = "Test post bani (daali nahi). Admin mein dekho.";
        } else {
          const out = await publishPrepared(state, prepared, ["instagram", "facebook"]);
          entry = { ...entry, ok: out.okAny, results: out.results, storyResults: out.storyResults };
        }
      } catch (error) {
        console.error("AUTOPILOT ERROR:", error.message);
        entry.message = error.message;
        state = { ...(await readState()), lifestyle: state.lifestyle, skipModel: state.skipModel };
      }
      state.log = [entry, ...(state.log || [])];
      try {
        await writeState(state);
      } catch (error) {
        console.error("AUTOPILOT SAVE ERROR:", error.message);
      }
      if (!dryRun) await sendReport(entry);
      running = null;
    })().catch((error) => {
      console.error("AUTOPILOT FATAL:", error.message);
      running = null;
    });
    return { started: true };
  }

  // Called by /api/cron/social-post when the Auto Post line is empty.
  async function maybeRunFromCron(queue) {
    const state = await readState();
    if (!state.enabled) return { posted: false, message: "Line khaali hai (Autopilot band hai)" };
    if (running) return { posted: false, message: "Autopilot abhi kaam kar raha hai" };
    const perWeek = Math.min(14, Math.max(1, Number(state.perWeek) || 4));
    const gap = (7 * 24 * 3600 * 1000) / perWeek;
    const since = Date.now() - Math.max(Number(state.lastAutoAt) || 0, Number(queue?.lastPostAt) || 0);
    if (since < gap * 0.85) {
      const hours = Math.ceil((gap * 0.85 - since) / 3600000);
      return { posted: false, message: `Autopilot: agli post lagbhag ${hours} ghante baad` };
    }
    await runOnce({ dryRun: false });
    return { posted: true, message: "Autopilot ne agli post banana shuru kiya" };
  }

  /* ---------------- Admin routes ---------------- */
  function publicState(state) {
    const next = PATTERN[(Number(state.step) || 0) % PATTERN.length];
    const library = Object.entries(state.lifestyle || {}).flatMap(([productId, items]) => (items || []).map((item) => ({ productId, ...item })));
    return {
      enabled: Boolean(state.enabled),
      perWeek: Number(state.perWeek) || 4,
      story: state.story !== false,
      next,
      lastAutoAt: state.lastAutoAt || 0,
      log: (state.log || []).slice(0, 20),
      preview: state.preview || null,
      library: library.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 40),
      running,
      geminiReady: Boolean(GEMINI_API_KEY),
      cronReady: Boolean(process.env.CRON_SECRET),
    };
  }

  app.get("/api/admin/autopilot", requireAdmin, async function (req, res) {
    return res.json({ success: true, ...publicState(await readState()) });
  });

  app.post("/api/admin/autopilot/settings", requireAdmin, async function (req, res) {
    try {
      const body = req.body || {};
      const state = await readState();
      if (typeof body.enabled === "boolean") state.enabled = body.enabled;
      if (body.perWeek != null) state.perWeek = Math.min(14, Math.max(1, Math.round(Number(body.perWeek) || 4)));
      if (typeof body.story === "boolean") state.story = body.story;
      if (body.next && PATTERN.includes(body.next)) state.step = PATTERN.indexOf(body.next);
      await writeState(state);
      return res.json({ success: true, ...publicState(state) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/autopilot/run", requireAdmin, async function (req, res) {
    const result = await runOnce({ dryRun: req.body?.dryRun !== false, manual: true });
    return res.json({ success: true, ...result, ...publicState(await readState()) });
  });

  app.post("/api/admin/autopilot/preview/publish", requireAdmin, async function (req, res) {
    if (running) return res.status(409).json({ success: false, message: "Autopilot abhi kaam kar raha hai, thodi der baad." });
    const state = await readState();
    const prepared = state.preview;
    if (!prepared) return res.status(404).json({ success: false, message: "Koi test post nahi hai." });
    running = { startedAt: Date.now(), stage: "Test post daali ja rahi hai", dryRun: false };
    try {
      const out = await publishPrepared(state, prepared, ["instagram", "facebook"]);
      const entry = { at: Date.now(), kind: prepared.kind, label: prepared.label, productId: prepared.productId, thumb: prepared.thumb, ok: out.okAny, results: out.results, storyResults: out.storyResults, notes: prepared.notes || [], manual: true };
      state.preview = null;
      state.log = [entry, ...(state.log || [])];
      await writeState(state);
      sendReport(entry);
      return res.json({ success: true, results: out.results, ...publicState(state) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    } finally {
      running = null;
    }
  });

  app.delete("/api/admin/autopilot/preview", requireAdmin, async function (req, res) {
    const state = await readState();
    if (state.preview) {
      deleteStorageImages([...(state.preview.slideUrls || []), state.preview.storyUrl].filter(Boolean)).catch(() => {});
      // its lifestyle photo was not posted - keep it for a later model post
      for (const items of Object.values(state.lifestyle || {})) {
        for (const item of items || []) if (item.url === state.preview.thumb) item.usedAt = null;
      }
    }
    state.preview = null;
    await writeState(state);
    return res.json({ success: true, ...publicState(state) });
  });

  app.post("/api/admin/autopilot/lifestyle/delete", requireAdmin, async function (req, res) {
    try {
      const url = String(req.body?.url || "");
      const state = await readState();
      for (const id of Object.keys(state.lifestyle || {})) {
        state.lifestyle[id] = (state.lifestyle[id] || []).filter((item) => item.url !== url);
        if (!state.lifestyle[id].length) delete state.lifestyle[id];
      }
      await writeState(state);
      // (v4) also take it out of any product gallery on the website
      try {
        const { data: rows } = await supabase.from("products").select("id,images,color_images");
        for (const row of rows || []) {
          const images = Array.isArray(row.images) ? row.images : [];
          const colorImages = row.color_images && typeof row.color_images === "object" ? row.color_images : {};
          const inImages = images.includes(url);
          const inColours = Object.values(colorImages).some((list) => Array.isArray(list) && list.includes(url));
          if (!inImages && !inColours) continue;
          const nextColours = {};
          for (const [colour, list] of Object.entries(colorImages)) nextColours[colour] = Array.isArray(list) ? list.filter((u) => u !== url) : list;
          await supabase.from("products").update({ images: images.filter((u) => u !== url), color_images: nextColours, updated_at: new Date().toISOString() }).eq("id", row.id);
        }
      } catch (error) {
        console.error("LIFESTYLE GALLERY REMOVE ERROR:", error.message);
      }
      if (url.includes("/autopilot/lifestyle/")) deleteStorageImages([url]).catch(() => {});
      return res.json({ success: true, ...publicState(state) });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // shared with server/autopilotDaily.js (reels, stories, daily check, replies)
  return {
    maybeRunFromCron,
    isRunning: () => Boolean(running),
    readState,
    renderSlide,
    renderModelSlide,
    textImage,
    fitPhoto,
    bagIsLight,
    captions,
    hashtags,
    colourNames,
    variantsOf,
    pickProduct,
    loadProducts,
    loadProductsAll,
    ensureLifestyle,
    isLifestyleUrl,
    fetchBuffer,
    saveJpeg,
    geminiCall,
    BACKGROUNDS,
    TEXT_MODEL,
    SITE,
  };
};
