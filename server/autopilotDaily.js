/*
 * AUTOPILOT DAILY (2026-11-01 v2) - the "roz ka kaam" part of the bot.
 * ------------------------------------------------------------------
 * Runs from the same cron-job.org timer (/api/cron/social-post, 4x a day)
 * whenever Autopilot is ON. Each timer call:
 *   1. COMMENTS  - new comments on Instagram + Facebook posts get a short,
 *                  honest reply (price, COD, delivery, link in bio).
 *                  Complaints / order problems: polite reply + email alert.
 *   2. DAILY CHECK (once a day) - Instagram grid photo + AI review (what
 *                  looks off, which posts to archive), post numbers
 *                  (reach / saves / shares), followers, website + product
 *                  check (broken photos, first photo not the whole bag,
 *                  missing size / material, risky claims, site down).
 *                  Email report with "aaj ke 3 kaam".
 *   3. STORY (once a day) - New in / This or that / Easy ordering /
 *                  Styled look, taking turns. Email says which highlight
 *                  to add it to (stickers, links and highlights: by hand).
 *   4. REEL (2-3 a week) - made on the server with ffmpeg: one-bag reel
 *                  or many-bags reel, with a song from the songs you
 *                  upload in Admin (taking turns). Instagram + Facebook.
 * State: social/daily.json in the same Supabase bucket.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const sharp = require("sharp");
const multer = require("multer");

let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch {
  ffmpegPath = null;
}

const STATE_PATH = "social/daily.json";
const DAY = 24 * 3600 * 1000;
const STORY_KINDS = ["newin", "thisorthat", "cod", "styled"];
const STORY_HIGHLIGHT = { newin: "NEW", thisorthat: "NEW", cod: "COD / ORDER", styled: "LOOKS" };
const RISKY_CLAIMS = /genuine leather|pure leather|real leather|100% leather|hand ?made|handcrafted|warranty|guarantee|lifetime|premium leather|original leather/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rupees(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

module.exports = function setupDaily(app, deps, ap) {
  const { supabase, STORAGE_BUCKET, requireAdmin, metaCall, getMetaIds, publishInstagram, publishFacebook, deleteStorageImages, sendTransactionalEmail } = deps;
  const GEMINI_API_KEY = deps.GEMINI_API_KEY;
  const REPORT_TO = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "infoshrimoh@gmail.com";
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => (/^audio\//.test(file.mimetype || "") || /\.(mp3|m4a|aac|wav)$/i.test(file.originalname || "") ? cb(null, true) : cb(new Error("Sirf gaane ki file (mp3 / m4a)."))),
  });

  let working = null; // { task, stage, startedAt }
  let weekly = null; // pro audit (autopilotPro.js), set from server.js

  /* ---------------- state ---------------- */
  function emptyState() {
    return {
      repliesOn: true,
      storyDaily: true,
      reelsPerWeek: 2,
      storiesPerDay: 3,
      reelsPerDay: 2,
      repliedIds: [],
      replyLog: [],
      replyError: "",
      lastDailyAt: 0,
      lastStoryAt: 0,
      v11: true,
      storyStep: 0,
      storyAt: {},
      lastReelAt: 0,
      reelStep: 0,
      reelAt: {},
      music: [],
      musicIdx: 0,
      photoChecks: {},
      followers: [],
      report: null,
      storyLog: [],
      reelLog: [],
      reelPreview: null,
    };
  }

  async function readDaily() {
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STATE_PATH);
      if (error || !data) return emptyState();
      const saved = { ...emptyState(), ...JSON.parse(await data.text()) };
      if (!saved.v11) {
        // (v11) owner asked for more: 2 reels + 3 stories a day by default
        saved.reelsPerDay = 2;
        saved.storiesPerDay = 3;
        saved.v11 = true;
      }
      return saved;
    } catch {
      return emptyState();
    }
  }

  // how many of a kind went out today (India date)
  function countToday(state, kind) {
    const today = ap.istDay();
    return state.dayKey === today ? Number(state[`day_${kind}`]) || 0 : 0;
  }
  function bumpToday(s, kind) {
    const today = ap.istDay();
    if (s.dayKey !== today) {
      s.dayKey = today;
      s.day_story = 0;
      s.day_reel = 0;
      s.day_lifestyle = 0;
    }
    s[`day_${kind}`] = (Number(s[`day_${kind}`]) || 0) + 1;
  }

  async function writeDaily(state) {
    const clean = {
      ...state,
      repliedIds: (state.repliedIds || []).slice(-800),
      replyLog: (state.replyLog || []).slice(0, 60),
      storyLog: (state.storyLog || []).slice(0, 20),
      reelLog: (state.reelLog || []).slice(0, 20),
      followers: (state.followers || []).slice(-60),
    };
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STATE_PATH, Buffer.from(JSON.stringify(clean)), { contentType: "application/json", upsert: true, cacheControl: "0" });
    if (error) throw new Error(`Daily save nahi hua: ${error.message}`);
  }

  // read -> change -> write, so two tasks never wipe each other's changes
  async function updateDaily(change) {
    const state = await readDaily();
    await change(state);
    await writeDaily(state);
    return state;
  }

  function stage(text) {
    if (working) working.stage = text;
    console.log("AUTOPILOT DAILY:", text);
  }

  async function geminiJson(parts) {
    const data = await ap.geminiCall(ap.TEXT_MODEL, {
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    });
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  }

  async function saveFile(buffer, folder, ext, contentType) {
    const storagePath = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Save nahi hua: ${error.message}`);
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  /* ================================================================
   * 1. COMMENT REPLIES
   * ================================================================ */
  const FACTS = [
    "Brand: SHRIMOH - women's handbags sold online at shrimoh.vercel.app (link in Instagram bio).",
    "Free delivery on prepaid orders. Cash on Delivery (COD) is available for ₹150 extra.",
    "Returns: within 5 days of delivery, refund after the return is received.",
    "Ordering: on the website (link in bio). Colours and price are in the post caption.",
    "Never claim leather, handmade, warranty, guarantee or any quality fact that is not written in the product info below.",
    "Never promise a delivery date. If asked about delivery time, say it is shown at checkout on the website.",
    "If a size / material question is not answered by the product info, ask them to check the product page (link in bio) or DM us.",
  ].join("\n");

  async function collectComments(state) {
    const ids = await getMetaIds();
    const replied = new Set(state.repliedIds || []);
    const since = Date.now() - 10 * DAY;
    const found = [];
    if (ids.igId) {
      const media = await metaCall(`${ids.igId}/media`, { params: { fields: "id,caption,timestamp,comments_count,permalink", limit: 12 } });
      for (const post of media.data || []) {
        if (!post.comments_count) continue;
        const list = await metaCall(`${post.id}/comments`, { params: { fields: "id,text,username,timestamp,replies{username}", limit: 50 } }).catch(() => ({ data: [] }));
        for (const c of list.data || []) {
          if (replied.has(`ig:${c.id}`)) continue;
          if (!c.text || (ids.igUsername && c.username === ids.igUsername)) continue;
          if (new Date(c.timestamp).getTime() < since) continue;
          if ((c.replies?.data || []).some((r) => r.username === ids.igUsername)) continue;
          found.push({ key: `ig:${c.id}`, platform: "instagram", id: c.id, user: c.username || "", text: c.text, caption: post.caption || "", link: post.permalink || "" });
        }
      }
    }
    if (ids.pageId) {
      const token = ids.pageToken || undefined;
      const posts = await metaCall(`${ids.pageId}/posts`, { token, params: { fields: "id,message,created_time,permalink_url", limit: 10 } }).catch(() => ({ data: [] }));
      for (const post of posts.data || []) {
        const list = await metaCall(`${post.id}/comments`, { token, params: { fields: "id,message,from{id,name},created_time,comments.limit(10){from{id}}", limit: 50 } }).catch(() => ({ data: [] }));
        for (const c of list.data || []) {
          if (replied.has(`fb:${c.id}`)) continue;
          if (!c.message || c.from?.id === ids.pageId) continue;
          if (new Date(c.created_time).getTime() < since) continue;
          if ((c.comments?.data || []).some((r) => r.from?.id === ids.pageId)) continue;
          found.push({ key: `fb:${c.id}`, platform: "facebook", id: c.id, user: c.from?.name || "", text: c.message, caption: post.message || "", link: post.permalink_url || "" });
        }
      }
    }
    return found.slice(0, 20);
  }

  async function productInfoFor(comments) {
    let products = [];
    try {
      products = await ap.loadProducts();
    } catch {
      return "";
    }
    const lines = [];
    for (const p of products) {
      const name = String(p.name || "").toLowerCase();
      if (name.length < 3) continue;
      if (!comments.some((c) => String(c.caption || "").toLowerCase().includes(name.slice(0, Math.min(name.length, 18))))) continue;
      lines.push(
        `- ${p.name}: price ${rupees(p.price)}${p.oldPrice > p.price ? ` (MRP ${rupees(p.oldPrice)})` : ""}; colours: ${ap.colourNames(p).join(", ") || "see post"}` +
          `${p.dimensions ? `; size: ${p.dimensions}` : ""}${p.materials ? `; material: ${p.materials}` : ""}; page: ${ap.SITE}/product/${p.id}`
      );
    }
    return lines.slice(0, 12).join("\n");
  }

  async function runReplies() {
    const state = await readDaily();
    if (!state.repliesOn) return { done: 0 };
    stage("Naye comments dekh raha hai");
    let comments;
    try {
      comments = await collectComments(state);
    } catch (error) {
      await updateDaily((s) => {
        s.replyError = error.message;
      });
      return { done: 0, error: error.message };
    }
    if (!comments.length) {
      await updateDaily((s) => {
        s.replyError = "";
      });
      return { done: 0 };
    }
    stage(`${comments.length} comments ke jawab soch raha hai`);
    const info = await productInfoFor(comments);
    const prompt =
      "You reply to comments on the Instagram / Facebook posts of SHRIMOH, a small women's handbag brand in India.\n" +
      `FACTS (only use these, never invent anything):\n${FACTS}\n` +
      (info ? `PRODUCT INFO:\n${info}\n` : "") +
      "For every comment decide:\n" +
      '- "reply": questions (price, colours, COD, delivery, size, how to order), compliments, interest ("want", "nice", heart emojis).\n' +
      '- "alert": complaint, order / delivery / refund problem, angry or upset person. Also write a short polite reply asking them to DM us so we can help right away.\n' +
      '- "skip": spam, links, only tagging friends, abusive, or anything a reply would make worse.\n' +
      "Reply rules: same language and script as the comment (Hindi, Hinglish or English); 1-2 short, warm sentences; at most one emoji; " +
      "start with @username for Instagram; price from the caption or product info if asked; for ordering say link in bio (Instagram) or give the product page link (Facebook). " +
      'Return ONLY a JSON array: [{"key":"...","action":"reply|alert|skip","reply":"...","why":"short"}]\n\nCOMMENTS:\n' +
      comments.map((c) => JSON.stringify({ key: c.key, platform: c.platform, username: c.user, comment: c.text, post_caption: String(c.caption).slice(0, 400) })).join("\n");
    let decisions = [];
    try {
      decisions = await geminiJson([{ text: prompt }]);
      if (!Array.isArray(decisions)) decisions = [];
    } catch (error) {
      return { done: 0, error: `AI: ${error.message}` };
    }
    const ids = await getMetaIds();
    const results = [];
    const alerts = [];
    for (const comment of comments) {
      const decision = decisions.find((d) => d && d.key === comment.key);
      if (!decision) continue;
      const action = ["reply", "alert", "skip"].includes(decision.action) ? decision.action : "skip";
      const reply = String(decision.reply || "").trim().slice(0, 300);
      const entry = { at: Date.now(), platform: comment.platform, user: comment.user, text: comment.text.slice(0, 200), action, reply: "", ok: true, link: comment.link };
      if (action !== "skip" && reply && !(RISKY_CLAIMS.test(reply) && !RISKY_CLAIMS.test(info))) {
        try {
          if (comment.platform === "instagram") await metaCall(`${comment.id}/replies`, { method: "POST", params: { message: reply } });
          else await metaCall(`${comment.id}/comments`, { method: "POST", token: ids.pageToken || undefined, params: { message: reply } });
          entry.reply = reply;
        } catch (error) {
          entry.ok = false;
          entry.reply = `(jawab nahi gaya: ${error.message})`;
        }
      }
      if (action === "alert") alerts.push(entry);
      results.push({ key: comment.key, entry });
    }
    const permissionError = results.find((r) => !r.entry.ok && /permission|\(#10\)|\(#200\)/i.test(r.entry.reply));
    await updateDaily((s) => {
      for (const r of results) if (r.entry.ok) s.repliedIds.push(r.key);
      s.replyLog = [...results.map((r) => r.entry), ...(s.replyLog || [])];
      s.replyError = permissionError ? `Meta token ko comments ki permission chahiye: ${permissionError.entry.reply}` : "";
    });
    if (alerts.length) {
      const html =
        `<div style="font-family:Arial,sans-serif;color:#1c150d"><h2>⚠️ Customer ko aapki zaroorat hai</h2>` +
        alerts.map((a) => `<p><b>${escapeHtml(a.user)}</b> (${a.platform}): ${escapeHtml(a.text)}<br/>Bot ka jawab: ${escapeHtml(a.reply || "-")}<br/><a href="${escapeHtml(a.link)}">post kholo</a></p>`).join("") +
        "<p>Inse DM / WhatsApp par khud baat kar lo.</p></div>";
      sendTransactionalEmail({ to: REPORT_TO, subject: `SHRIMOH: ${alerts.length} customer ko help chahiye`, html }).catch(() => {});
    }
    return { done: results.filter((r) => r.entry.reply && r.entry.ok).length };
  }

  /* ================================================================
   * 2. DAILY CHECK - grid, numbers, website
   * ================================================================ */
  async function gridCheck() {
    const ids = await getMetaIds();
    if (!ids.igId) throw new Error("Instagram account nahi mila");
    const account = await metaCall(ids.igId, { params: { fields: "username,followers_count,follows_count,media_count" } }).catch(() => ({}));
    const media = await metaCall(`${ids.igId}/media`, {
      params: { fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count", limit: 15 },
    });
    const posts = media.data || [];
    stage("Grid ki photo bana raha hai");
    const tileW = 360;
    const tileH = 480;
    const tiles = [];
    for (let i = 0; i < posts.length; i++) {
      const url = posts[i].media_type === "VIDEO" ? posts[i].thumbnail_url : posts[i].media_url;
      try {
        const buffer = await ap.fetchBuffer(url);
        const tile = await sharp(buffer).resize(tileW, tileH, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
        tiles.push({ input: tile, left: (i % 3) * (tileW + 4), top: Math.floor(i / 3) * (tileH + 4) });
      } catch {
        // missing tile stays grey
      }
    }
    const rows = Math.max(1, Math.ceil(posts.length / 3));
    const grid = await sharp({ create: { width: tileW * 3 + 8, height: rows * (tileH + 4) - 4, channels: 3, background: { r: 220, g: 220, b: 220 } } })
      .composite(tiles)
      .jpeg({ quality: 84 })
      .toBuffer();
    const gridUrl = await saveFile(grid, "social/daily", "jpg", "image/jpeg");

    stage("Har post ke numbers le raha hai");
    const numbers = [];
    for (const post of posts.slice(0, 12)) {
      const row = { id: post.id, link: post.permalink, type: post.media_type, likes: post.like_count || 0, comments: post.comments_count || 0, at: post.timestamp };
      try {
        const insights = await metaCall(`${post.id}/insights`, { params: { metric: "reach,saved,shares,total_interactions" } });
        for (const item of insights.data || []) row[item.name] = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
      } catch {
        // numbers are a nice-to-have
      }
      numbers.push(row);
    }

    let review = null;
    if (GEMINI_API_KEY && posts.length) {
      stage("Grid ko AI se jaanch raha hai");
      const prompt =
        "This image is the top of the Instagram grid of SHRIMOH, a small Indian women's handbag brand (newest post is tile 1 at top-left, numbered left to right, row by row). " +
        "Judge it like the creative director of a premium fashion brand that sells through Instagram (like Miraggio or Mira & Moss). " +
        "The owner's grid plan: bag photo and a photo of a woman model with the bag take turns (a calm checkerboard in 3 columns); bag photos switch Cream and Black backgrounds, one background per post; every 9th post is a simple trust card (Cash on Delivery, returns, how to order, real photos) in the same style; reel covers match the grid; one font style, little text, no sale banners, no white boxes, no collages, the whole bag always visible, the same bag never next to itself. Judge the grid against this plan and against what makes a buyer TRUST a small shop. " +
        "Reply in simple Hinglish (Roman script). Return ONLY JSON: " +
        '{"score":0-10,"verdict":"one sentence","problems":["max 4, specific"],"archive":[tile numbers that hurt the grid most, max 4],"good":["max 2"],"next_post":"what the next post should look like to fix the grid"}';
      try {
        review = await geminiJson([{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: grid.toString("base64") } }]);
      } catch (error) {
        review = { error: error.message };
      }
    }
    const archive = (Array.isArray(review?.archive) ? review.archive : [])
      .map((n) => posts[Number(n) - 1])
      .filter(Boolean)
      .map((p) => ({ link: p.permalink, thumb: p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url }));
    return { gridUrl, review, archive, numbers, account, postCount: posts.length };
  }

  async function headOk(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  /*
   * FRONT PHOTO FIXER - every product (and every colour) must open with a
   * photo of the WHOLE bag from the front on a plain background. AI looks
   * at all photos of the list once; if a better front photo is further
   * back, it is moved to the front. Nothing is deleted - only the order
   * changes - and every change can be undone in Admin.
   */
  function listSignature(list) {
    return (list || []).join("|");
  }

  async function bestFrontIndex(urls) {
    const thumbs = [];
    for (const url of urls.slice(0, 8)) {
      try {
        thumbs.push(await sharp(await ap.fetchBuffer(url)).rotate().resize(380, 380, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer());
      } catch {
        thumbs.push(null);
      }
    }
    const parts = [
      {
        text:
          `These are the ${thumbs.length} photos of ONE handbag on an online store, numbered 0 to ${thumbs.length - 1} in their current order. ` +
          "Photo 0 is shown first everywhere (product list, Instagram, ads). The first photo must be the best FRONT photo: the whole bag visible (not cut off, not a close-up or detail), " +
          "front or slight-angle view, plain or clean background, no model / person, no text, no watermark, sharp. " +
          'Return ONLY JSON: {"photos":[{"i":0,"whole_bag":true,"front_view":true,"plain_background":true,"person":false,"text":false,"close_up":false,"quality":0-10}],"best":index,"sure":0-10,"reason":"short Hinglish"}',
      },
    ];
    thumbs.forEach((thumb, i) => {
      parts.push({ text: `Photo ${i}:` });
      if (thumb) parts.push({ inline_data: { mime_type: "image/jpeg", data: thumb.toString("base64") } });
      else parts.push({ text: "(photo could not be loaded)" });
    });
    const r = await geminiJson(parts);
    const photos = Array.isArray(r.photos) ? r.photos : [];
    const good = (p) => p && p.whole_bag === true && p.person !== true && p.text !== true && p.close_up !== true;
    const score = (p) => (good(p) ? 10 : 0) + (p?.front_view ? 3 : 0) + (p?.plain_background ? 3 : 0) + (Number(p?.quality) || 0) / 2;
    const first = photos.find((p) => Number(p.i) === 0);
    const best = Number(r.best);
    const bestPhoto = photos.find((p) => Number(p.i) === best);
    const move =
      Number.isInteger(best) && best > 0 && best < thumbs.length && thumbs[best] &&
      Number(r.sure) >= 7 && good(bestPhoto) && score(bestPhoto) - score(first) >= 4;
    return { move, best, reason: String(r.reason || "").slice(0, 160), firstOk: good(first) };
  }

  async function fixFrontPhotos(state, products, budget) {
    const checked = state.frontChecks || {};
    const fixes = [];
    let used = 0;
    for (const p of products) {
      if (used >= budget) break;
      const lists = [{ field: "images", label: "", urls: p.images }];
      for (const [colour, urls] of Object.entries(p.colorImages || {})) lists.push({ field: `color:${colour}`, label: colour, urls });
      for (const list of lists) {
        if (used >= budget) break;
        if (!list.urls || list.urls.length < 2) continue;
        const key = `${p.id}:${list.field}`;
        const sig = listSignature(list.urls);
        if (checked[key] === sig) continue;
        used += 1;
        stage(`Front photo check: ${p.name}${list.label ? ` (${list.label})` : ""}`);
        let result;
        try {
          result = await bestFrontIndex(list.urls);
        } catch (error) {
          console.error("FRONT PHOTO CHECK ERROR:", error.message);
          continue;
        }
        let after = list.urls;
        if (result.move && ap.isLifestyleUrl(list.urls[result.best])) result.move = false;
        if (result.move) {
          after = [list.urls[result.best], ...list.urls.filter((_, i) => i !== result.best)];
          try {
            await writeProductList(p.id, list.field, after, list.urls);
            fixes.push({ at: Date.now(), productId: p.id, name: p.name, field: list.field, colour: list.label, before: list.urls, after, reason: result.reason });
            if (list.field === "images") p.images = after;
            else p.colorImages[list.label] = after;
          } catch (error) {
            console.error("FRONT PHOTO SAVE ERROR:", error.message);
            continue;
          }
        } else if (!result.firstOk) {
          // no better photo in the list - the owner must add one
          fixes.push({ at: Date.now(), productId: p.id, name: p.name, field: list.field, colour: list.label, needsPhoto: true, reason: result.reason });
        }
        checked[key] = listSignature(after);
      }
    }
    state.frontChecks = checked;
    return fixes;
  }

  // changes ONLY the order of one photo list, and only if nobody changed it meanwhile
  async function writeProductList(productId, field, after, expectedBefore, mode = "reorder") {
    const { data: row, error } = await supabase.from("products").select("id,images,color_images").eq("id", productId).single();
    if (error || !row) throw new Error("Product nahi mila");
    const parse = (v) => (typeof v === "string" ? JSON.parse(v || "null") : v);
    const images = parse(row.images) || [];
    const colorImages = parse(row.color_images) || {};
    const current = field === "images" ? images : (colorImages[field.slice(6)] || []);
    const currentList = (Array.isArray(current) ? current : [current]).filter(Boolean);
    if (listSignature(currentList) !== listSignature(expectedBefore)) throw new Error("Photos beech mein badal gayi - chhod diya");
    if (mode === "reorder" && [...after].sort().join("|") !== [...currentList].sort().join("|")) throw new Error("Photo list match nahi hui");
    if (mode === "add" && Math.abs(after.length - currentList.length) !== 1) throw new Error("Photo list match nahi hui");
    if (mode === "replace" && (after.length !== currentList.length || after.filter((u, i) => u !== currentList[i]).length !== 1)) throw new Error("Photo list match nahi hui");
    const update = { updated_at: new Date().toISOString() };
    if (field === "images") update.images = after;
    else update.color_images = { ...colorImages, [field.slice(6)]: after };
    const { error: saveError } = await supabase.from("products").update(update).eq("id", productId);
    if (saveError) throw new Error(saveError.message);
  }

  /*
   * LIFESTYLE ON THE WEBSITE (v4) - every bag gets one checked lifestyle
   * photo as the 2nd photo of its gallery (front photo stays 1st). The
   * website shows a small "Styled image" label on it. Up to `makeBudget`
   * new photos are made per run (Gemini cost); saved ones are reused.
   */
  let pauseMakingUntil = 0;
  async function addLifestyleToGalleries(products, makeBudget) {
    const added = [];
    let made = 0;
    let apState = await ap.scanAndSave(products, 40).catch(() => ap.readState());
    for (const p of products) {
      if (!p.images || !p.images.length) continue;
      if (p.images.some((url) => ap.isLifestyleUrl(url))) continue;
      if ((apState.ownLife?.[p.id] || []).length) continue; // owner's own lifestyle photo already there
      if (Number(apState.skipModel?.[p.id]) > Date.now()) continue;
      const saved = (apState.lifestyle?.[p.id] || []).filter((item) => item.url);
      let pick = saved.find((item) => !p.images.includes(item.url));
      if (!pick) {
        if (made >= makeBudget || ap.isRunning() || Number(pauseMakingUntil) > Date.now()) continue;
        made += 1;
        stage(`Lifestyle photo ban rahi hai: ${p.name}`);
        const result = await ap.ensureLifestyle(p).catch((error) => ({ url: null, error: error.message }));
        if (result && result.error) pauseMakingUntil = Date.now() + 2 * 3600 * 1000; // Gemini trouble: try again in 2 hours
        if (!result || !result.url) {
          added.push({ at: Date.now(), productId: p.id, name: p.name, needsPhoto: true, kind: "lifestyle", reason: result?.error ? `AI lifestyle photo nahi bani: ${result.error}` : "AI lifestyle photo check paas nahi hui (14 din baad phir try)" });
          continue;
        }
        pick = { url: result.url };
        apState = await ap.readState();
      }
      const before = p.images;
      const after = [before[0], pick.url, ...before.slice(1)];
      try {
        await writeProductList(p.id, "images", after, before, "add");
        p.images = after;
        added.push({ at: Date.now(), productId: p.id, name: p.name, field: "images", colour: "", before, after, kind: "lifestyle", reason: "Lifestyle photo 2nd number par lagayi" });
      } catch (error) {
        console.error("LIFESTYLE GALLERY ERROR:", error.message);
      }
    }
    return added;
  }

  /*
   * HEAVY PHOTOS (v6) - a first photo over ~900 KB makes the shop list slow
   * on phones. The bot makes a lighter copy (same look, max 1600 px) and
   * swaps it in; the old file stays in storage, so ↩️ can bring it back.
   */
  async function lightenHeavyPhotos(products, budget, state) {
    const done = [];
    const checked = (state && state.lightOk) || {};
    for (const p of products) {
      if (done.length >= budget) break;
      const url = p.images[0];
      if (!url || ap.isLifestyleUrl(url) || checked[url]) continue;
      let size = 0;
      try {
        const head = await fetch(url, { method: "HEAD" });
        size = Number(head.headers.get("content-length")) || 0;
      } catch {
        continue;
      }
      if (size <= 900 * 1024) {
        checked[url] = 1;
        continue;
      }
      stage(`Bhaari photo halki kar raha hai: ${p.name}`);
      try {
        const original = await ap.fetchBuffer(url);
        const light = await sharp(original).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
        if (light.length > size * 0.8) continue;
        const newUrl = await saveFile(light, "products", "jpg", "image/jpeg");
        const after = [newUrl, ...p.images.slice(1)];
        await writeProductList(p.id, "images", after, p.images, "replace");
        done.push({ at: Date.now(), productId: p.id, name: p.name, field: "images", colour: "", before: p.images, after, kind: "compress", reason: `Photo ${Math.round(size / 1024)} KB se ${Math.round(light.length / 1024)} KB ki (wahi photo, site tez)` });
        p.images = after;
        checked[newUrl] = 1;
      } catch (error) {
        console.error("LIGHTEN PHOTO ERROR:", error.message);
      }
    }
    if (state) state.lightOk = checked;
    return done;
  }

  async function websiteCheck(state) {
    const issues = [];
    stage("Website khol ke dekh raha hai");
    let siteOk = false;
    try {
      const response = await fetch(ap.SITE, { redirect: "follow" });
      siteOk = response.ok;
      if (!response.ok) issues.push({ name: "Website", problem: `Website khul nahi rahi (error ${response.status})` });
    } catch (error) {
      issues.push({ name: "Website", problem: `Website khul nahi rahi: ${error.message}` });
    }
    const products = await ap.loadProductsAll().catch(() => []);
    if (siteOk && products[0]) {
      const ok = await fetch(`${ap.SITE}/product/${products[0].id}`).then((r) => r.ok).catch(() => false);
      if (!ok) issues.push({ name: "Website", problem: "Product page nahi khul raha" });
    }
    stage("Har product ki details check ho rahi hain");
    for (const p of products) {
      const add = (problem) => issues.push({ productId: p.id, name: p.name, problem });
      if (!(Number(p.price) > 0)) add("Price 0 hai");
      if (!p.dimensions) add("Size (dimensions) khaali hai");
      if (!p.materials) add("Material khaali hai");
      const claim = `${p.name} ${p.description} ${p.materials} ${(p.keyFeatures || []).join(" ")}`.match(RISKY_CLAIMS);
      if (claim) add(`Jhootha lag sakne wala daawa: "${claim[0]}" - hata do`);
      if (Object.keys(p.colorImages || {}).some((c) => /^(colou?r|variant)\s*\d*$/i.test(c.trim()))) add("Colour ka naam sahi nahi (jaise 'Color 1')");
    }
    stage("Photos ke link check ho rahe hain");
    const urls = [];
    for (const p of products) {
      urls.push({ p, url: p.images[0], first: true });
      for (const list of Object.values(p.colorImages || {})) if (list[0]) urls.push({ p, url: list[0], first: false });
    }
    const toCheck = urls.slice(0, 120);
    for (let i = 0; i < toCheck.length; i += 6) {
      const batch = toCheck.slice(i, i + 6);
      const oks = await Promise.all(batch.map((item) => headOk(item.url)));
      oks.forEach((ok, index) => {
        if (!ok) issues.push({ productId: batch[index].p.id, name: batch[index].p.name, problem: "Ek photo ka link toota hai (photo nahi dikhegi)" });
      });
    }
    // front photo order (moves the best whole-bag photo to the front)
    let fixes = [];
    if (GEMINI_API_KEY) {
      fixes = await fixFrontPhotos(state, products, state.frontBudget || 15);
      state.frontBudget = 15;
      fixes.push(...(await addLifestyleToGalleries(products, 4)));
      fixes.push(...(await lightenHeavyPhotos(products, 10, state)));
      for (const fix of fixes) {
        if (!fix.needsPhoto) continue;
        issues.push({ productId: fix.productId, name: fix.name, problem: fix.kind === "lifestyle" ? fix.reason : `${fix.colour ? `${fix.colour}: ` : ""}koi bhi photo poore bag ki saaf front photo nahi - nayi photo daalo` });
      }
    }
    // first photo: AI looks at it once (cached by photo link), 12 new photos a day
    if (GEMINI_API_KEY) {
      stage("Pehli photos AI se dekh raha hai");
      const checks = state.photoChecks || {};
      let budget = 12;
      for (const p of products) {
        const url = p.images[0];
        if (!url) continue;
        if (!checks[url] && budget > 0) {
          budget -= 1;
          try {
            const small = await sharp(await ap.fetchBuffer(url)).resize(700, 700, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
            const r = await geminiJson([
              {
                text:
                  "This is the FIRST photo of a handbag on an online store (the photo shoppers see in the list and on Instagram). " +
                  'Check it. Return ONLY JSON: {"whole_bag":true/false (entire bag inside the frame, not a close-up),"clean_background":true/false,"text_or_watermark":true/false,"sharp":true/false,"looks_premium":0-10,"tip":"short Hinglish tip"}',
              },
              { inline_data: { mime_type: "image/jpeg", data: small.toString("base64") } },
            ]);
            checks[url] = { at: Date.now(), ...r };
          } catch {
            // try again tomorrow
          }
        }
        const c = checks[url];
        if (c) {
          if (c.whole_bag === false) issues.push({ productId: p.id, name: p.name, problem: "Pehli photo mein poora bag nahi dikhta" });
          if (c.text_or_watermark === true) issues.push({ productId: p.id, name: p.name, problem: "Pehli photo par text / watermark hai" });
          if (c.clean_background === false || Number(c.looks_premium) < 5) issues.push({ productId: p.id, name: p.name, problem: `Pehli photo premium nahi lagti - ${c.tip || "saaf background wali photo lagao"}` });
        }
      }
      state.photoChecks = checks;
    }
    return { siteOk, products: products.length, issues, fixes: fixes.filter((f) => !f.needsPhoto) };
  }

  async function runDailyCheck() {
    const state = await readDaily();
    const report = { at: Date.now() };
    try {
      Object.assign(report, await gridCheck());
    } catch (error) {
      report.gridError = error.message;
    }
    try {
      report.website = await websiteCheck(state);
    } catch (error) {
      report.website = { error: error.message, issues: [] };
    }
    const followers = Number(report.account?.followers_count);
    if (Number.isFinite(followers)) state.followers = [...(state.followers || []), { at: Date.now(), n: followers }];
    const weekAgo = (state.followers || []).find((f) => f.at > Date.now() - 8 * DAY);
    report.followersNow = Number.isFinite(followers) ? followers : null;
    report.followersWeekAgo = weekAgo ? weekAgo.n : null;

    const ranked = (report.numbers || []).filter((n) => n.reach != null).sort((a, b) => (b.saved || 0) * 3 + (b.shares || 0) * 3 + (b.reach || 0) - ((a.saved || 0) * 3 + (a.shares || 0) * 3 + (a.reach || 0)));
    report.best = ranked.slice(0, 3);
    report.worst = ranked.slice(-2).reverse();
    report.replies24h = (state.replyLog || []).filter((r) => r.at > Date.now() - DAY && r.reply && r.ok).length;

    if (GEMINI_API_KEY) {
      stage("Aaj ke kaam soch raha hai");
      try {
        const summary = {
          grid: report.review,
          followers: { now: report.followersNow, weekAgo: report.followersWeekAgo },
          best_posts: report.best,
          weak_posts: report.worst,
          website_problems: (report.website?.issues || []).slice(0, 15).map((i) => `${i.name}: ${i.problem}`),
        };
        const r = await geminiJson([
          {
            text:
              "You are the growth manager of SHRIMOH, a small Indian women's handbag brand building a premium Instagram before spending money on ads. " +
              "Based on this daily data, give the owner exactly 3 concrete tasks for today, most important first (each one short, in simple Hinglish, Roman script, doable in under 15 minutes by hand: e.g. archive a post, fix a product photo, add a story to a highlight, reply to someone). " +
              'Also say whether the Instagram is ready for ads yet. Return ONLY JSON: {"tasks":["...","...","..."],"ads_ready":true/false,"ads_note":"one sentence"}\n' +
              JSON.stringify(summary),
          },
        ]);
        report.tasks = Array.isArray(r.tasks) ? r.tasks.slice(0, 3) : [];
        report.adsReady = Boolean(r.ads_ready);
        report.adsNote = String(r.ads_note || "");
      } catch (error) {
        report.tasks = [];
      }
    }
    if (report.gridUrl && state.report?.gridUrl && state.report.gridUrl !== report.gridUrl) deleteStorageImages([state.report.gridUrl]).catch(() => {});
    await updateDaily((s) => {
      s.report = report;
      s.lastDailyAt = Date.now();
      s.photoChecks = state.photoChecks || s.photoChecks;
      s.frontChecks = state.frontChecks || s.frontChecks;
      s.lightOk = state.lightOk || s.lightOk;
      s.frontBudget = state.frontBudget || 15;
      s.fixLog = [...(report.website?.fixes || []), ...(s.fixLog || [])].slice(0, 60);
      s.followers = state.followers;
    });
    await sendDailyEmail(report);
    return report;
  }

  async function sendDailyEmail(report) {
    try {
      const review = report.review || {};
      const issues = report.website?.issues || [];
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;color:#1c150d;line-height:1.5">
          <h2 style="font-weight:600;margin-bottom:4px">SHRIMOH - roz ka check</h2>
          <p style="margin-top:0;color:#666">${new Date(report.at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
          ${(report.tasks || []).length ? `<h3>✅ Aaj ke 3 kaam</h3><ol>${report.tasks.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol>` : ""}
          ${report.adsNote ? `<p><b>Ads ke liye tayyar?</b> ${report.adsReady ? "Haan" : "Abhi nahi"} - ${escapeHtml(report.adsNote)}</p>` : ""}
          <h3>📱 Instagram grid ${review.score != null ? `- ${review.score}/10` : ""}</h3>
          ${review.verdict ? `<p>${escapeHtml(review.verdict)}</p>` : ""}
          ${report.gridUrl ? `<img src="${report.gridUrl}" style="width:100%;max-width:420px;border-radius:8px" />` : ""}
          ${(review.problems || []).length ? `<ul>${review.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
          ${report.archive?.length ? `<p><b>Inhe archive karo:</b><br/>${report.archive.map((a, i) => `<a href="${escapeHtml(a.link)}">Post ${i + 1}</a>`).join(" · ")}</p>` : ""}
          ${review.next_post ? `<p><b>Agli post:</b> ${escapeHtml(review.next_post)}</p>` : ""}
          <p><b>Followers:</b> ${report.followersNow ?? "-"}${report.followersWeekAgo != null ? ` (hafte pehle ${report.followersWeekAgo})` : ""} · <b>Comments ke jawab (24 ghante):</b> ${report.replies24h || 0}</p>
          ${report.best?.length ? `<p><b>Sabse achhi posts:</b> ${report.best.map((b) => `<a href="${escapeHtml(b.link)}">reach ${b.reach || 0}, saves ${b.saved || 0}</a>`).join(" · ")}</p>` : ""}
          ${(report.website?.fixes || []).length ? `<h3>🔧 Bot ne theek kiya</h3><ul>${report.website.fixes.map((f) => `<li><b>${escapeHtml(f.name)}</b>${f.colour ? ` (${escapeHtml(f.colour)})` : ""}: ${f.kind === "lifestyle" ? "lifestyle photo 2nd number par lagayi" : f.kind === "compress" ? escapeHtml(f.reason) : `sahi front photo aage lagayi - ${escapeHtml(f.reason)}`}</li>`).join("")}</ul><p style="font-size:13px;color:#555">Pasand na aaye to Admin &gt; 🤖 Autopilot mein "Wapas karo".</p>` : ""}
          <h3>🌐 Website (${issues.length} dikkatein)</h3>
          ${issues.length ? `<ul>${issues.slice(0, 25).map((i) => `<li><b>${escapeHtml(i.name)}</b>: ${escapeHtml(i.problem)}</li>`).join("")}</ul>${issues.length > 25 ? `<p>...aur ${issues.length - 25}, Admin mein dekho.</p>` : ""}` : "<p>Sab theek ✅</p>"}
          ${report.gridError ? `<p style="color:#b23b1e">Grid check nahi hua: ${escapeHtml(report.gridError)}</p>` : ""}
        </div>`;
      await sendTransactionalEmail({ to: REPORT_TO, subject: `SHRIMOH roz ka check${review.score != null ? ` - grid ${review.score}/10` : ""}`, html });
    } catch (error) {
      console.error("DAILY EMAIL ERROR:", error.message);
    }
  }

  /* ================================================================
   * 3. DAILY STORY
   * ================================================================ */
  function pickBags(products, state, count) {
    const sorted = [...products].sort((a, b) => (Number(state.storyAt?.[a.id]) || 0) - (Number(state.storyAt?.[b.id]) || 0) || Math.random() - 0.5);
    return sorted.slice(0, count);
  }

  async function textLayer(text, options) {
    return ap.textImage(text, options);
  }

  async function renderThisOrThat(bagA, bagB, bg) {
    const W = 1080;
    const H = 1920;
    const theme = ap.BACKGROUNDS[bg];
    const layers = [];
    const wordmark = await textLayer("SHRIMOH", { serif: true, weight: "SemiBold", size: 34, color: theme.ink, spacing: 17 });
    layers.push({ ...wordmark, left: Math.round((W - wordmark.width) / 2), top: 134 });
    const title = await textLayer("This or that?", { serif: true, weight: "Medium", size: 78, color: theme.ink });
    layers.push({ ...title, left: Math.round((W - title.width) / 2), top: 250 });
    const sub = await textLayer("tap your favourite", { weight: "Medium", size: 26, color: theme.soft, spacing: 3 });
    layers.push({ ...sub, left: Math.round((W - sub.width) / 2), top: 250 + title.height + 24 });
    const colW = 460;
    for (const [index, bag] of [bagA, bagB].entries()) {
      const raw = await ap.fetchBuffer(bag.images[0]);
      const photo = await ap.fitPhoto(raw, colW, 760, bg, bg === "black" ? await ap.bagIsLight(raw) : false);
      const x = index === 0 ? 60 : W - 60 - colW;
      layers.push({ ...photo, left: x + Math.round((colW - photo.width) / 2), top: 560 + Math.round((760 - photo.height) / 2) });
      const name = await textLayer(bag.name, { serif: true, weight: "Medium", size: 40, color: theme.ink, width: colW });
      layers.push({ ...name, left: x + Math.round((colW - name.width) / 2), top: 1360 });
      const price = await textLayer(rupees(bag.price), { weight: "SemiBold", size: 34, color: theme.ink });
      layers.push({ ...price, left: x + Math.round((colW - price.width) / 2), top: 1360 + name.height + 18 });
    }
    const tiny = await textLayer("FREE DELIVERY (PREPAID)  ·  COD AVAILABLE  ·  LINK IN BIO", { weight: "SemiBold", size: 19, color: theme.soft, spacing: 5 });
    layers.push({ ...tiny, left: Math.round((W - tiny.width) / 2), top: H - 134 - tiny.height });
    return sharp({ create: { width: W, height: H, channels: 3, background: theme.rgb } })
      .composite(layers.map((l) => ({ input: l.input, left: l.left, top: l.top })))
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  async function renderStyled(lifestyleBuffer, bag) {
    const W = 1080;
    const H = 1920;
    const base = await sharp(lifestyleBuffer).resize(W, H, { fit: "cover", position: sharp.strategy.attention }).toBuffer();
    const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);
    const name = await textLayer(bag.name, { serif: true, weight: "Medium", size: 64, color: "#ffffff", width: W - 160 });
    const price = await textLayer(`${rupees(bag.price)}  ·  link in bio`, { weight: "SemiBold", size: 34, color: "#ffffff" });
    const note = await textLayer("styled look (AI)  ·  real photos on the website", { weight: "Medium", size: 20, color: "#e9e4dc", spacing: 2 });
    const wordmark = await textLayer("SHRIMOH", { serif: true, weight: "SemiBold", size: 34, color: "#ffffff", spacing: 17 });
    const bottom = H - 150;
    return sharp(base)
      .composite([
        { input: shade, left: 0, top: 0 },
        { input: wordmark.input, left: Math.round((W - wordmark.width) / 2), top: 134 },
        { input: note.input, left: 80, top: bottom - note.height },
        { input: price.input, left: 80, top: bottom - note.height - 30 - price.height },
        { input: name.input, left: 80, top: bottom - note.height - 30 - price.height - 20 - name.height },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  async function makeStory(state, kindWanted) {
    const products = await ap.loadProducts();
    if (!products.length) throw new Error("Koi bag nahi mila");
    const apState = await ap.readState();
    let kind = kindWanted;
    let bags = pickBags(products, state, 2);
    let lifestyle = null;
    if (kind === "styled") {
      const withPhoto = products.filter((p) => ap.lifestylePhotos(apState, p.id).length);
      if (withPhoto.length) {
        const bag = pickBags(withPhoto, state, 1)[0];
        const items = ap.lifestylePhotos(apState, bag.id);
        lifestyle = items[Math.floor(Math.random() * items.length)];
        bags = [bag];
      } else kind = "newin";
    }
    if (kind === "thisorthat" && bags.length < 2) kind = "newin";
    const bg = Math.random() < 0.5 ? "cream" : "black";
    let image;
    if (kind === "thisorthat") image = await renderThisOrThat(bags[0], bags[1], bg);
    else if (kind === "styled") image = await renderStyled(await ap.fetchBuffer(lifestyle.url), bags[0]);
    else {
      const bag = bags[0];
      const photo = await ap.fetchBuffer(bag.images[0]);
      const tone = (await ap.bagIsLight(photo)) ? "black" : "cream";
      image = await ap.renderSlide(photo, {
        kind: "story",
        bg: tone,
        name: bag.name,
        price: bag.price,
        mrp: bag.oldPrice,
        label: kind === "cod" ? "Easy ordering" : "New in",
        tiny: kind === "cod" ? "FREE DELIVERY ON PREPAID  ·  COD +₹150  ·  5-DAY RETURN" : null,
      });
      bags = [bag];
    }
    return { kind, image, bags };
  }

  async function postStory(manual = false) {
    const state = await readDaily();
    const kindWanted = STORY_KINDS[(Number(state.storyStep) || 0) % STORY_KINDS.length];
    stage("Aaj ki story ban rahi hai");
    const story = await makeStory(state, kindWanted);
    const url = await saveFile(story.image, "social/autopilot", "jpg", "image/jpeg");
    stage("Story Instagram + Facebook par lag rahi hai");
    const ids = await getMetaIds();
    const results = {};
    for (const target of ["instagram", "facebook"]) {
      try {
        results[target] = { ok: true, ...(target === "instagram" ? await publishInstagram(ids, "story", [url]) : await publishFacebook(ids, "story", [url])) };
      } catch (error) {
        results[target] = { ok: false, message: error.message };
      }
    }
    const thumbUrl = url;
    const ok = Object.values(results).some((r) => r.ok);
    await updateDaily((s) => {
      s.lastStoryAt = Date.now();
      if (ok) {
        s.storyStep = ((Number(s.storyStep) || 0) + 1) % STORY_KINDS.length;
        bumpToday(s, "story");
      }
      for (const bag of story.bags) s.storyAt = { ...(s.storyAt || {}), [bag.id]: Date.now() };
      s.storyLog = [{ at: Date.now(), kind: story.kind, highlight: STORY_HIGHLIGHT[story.kind], bags: story.bags.map((b) => b.name), thumb: thumbUrl, results, manual }, ...(s.storyLog || [])];
    });
    return { ok, kind: story.kind, highlight: STORY_HIGHLIGHT[story.kind], results, url };
  }

  /* ================================================================
   * 4. REELS (server-made with ffmpeg)
   * ================================================================ */
  function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) return reject(new Error("ffmpeg nahi mila (npm install chalao)"));
      execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 8, timeout: 9 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`ffmpeg: ${String(stderr || error.message).slice(-300)}`));
        else resolve();
      });
    });
  }

  async function textFrame(lines, bg) {
    const W = 1080;
    const H = 1920;
    const theme = ap.BACKGROUNDS[bg];
    const layers = [];
    const wordmark = await textLayer("SHRIMOH", { serif: true, weight: "SemiBold", size: 40, color: theme.ink, spacing: 20 });
    layers.push({ ...wordmark, left: Math.round((W - wordmark.width) / 2), top: 134 });
    const images = [];
    for (const line of lines) images.push(await textLayer(line.text, { serif: line.serif !== false, weight: line.weight || "Medium", size: line.size || 72, color: line.soft ? theme.soft : theme.ink, width: W - 160, spacing: line.spacing || 0 }));
    const total = images.reduce((sum, img) => sum + img.height, 0) + (images.length - 1) * 34;
    let y = Math.round((H - total) / 2);
    for (const img of images) {
      layers.push({ ...img, left: Math.round((W - img.width) / 2), top: y });
      y += img.height + 34;
    }
    return sharp({ create: { width: W, height: H, channels: 3, background: theme.rgb } })
      .composite(layers.map((l) => ({ input: l.input, left: l.left, top: l.top })))
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  async function buildReelFrames(state) {
    const products = await ap.loadProducts();
    if (!products.length) throw new Error("Koi bag nahi mila");
    const apState = await ap.readState();
    const kind = (Number(state.reelStep) || 0) % 2 === 0 ? "one" : "many";
    const byReel = [...products].sort((a, b) => (Number(state.reelAt?.[a.id]) || 0) - (Number(state.reelAt?.[b.id]) || 0) || Math.random() - 0.5);
    const frames = [];
    const used = [];
    if (kind === "one") {
      const bag = byReel.find((p) => ap.lifestylePhotos(apState, p.id).length) || byReel[0];
      used.push(bag);
      const realPhoto = await ap.fetchBuffer(bag.images[0]);
      const bg = (await ap.bagIsLight(realPhoto)) ? "black" : "cream";
      const life = ap.lifestylePhotos(apState, bag.id)[0];
      if (life) frames.push({ image: await renderStyled(await ap.fetchBuffer(life.url), bag), seconds: 2.6 });
      const variants = ap.variantsOf(bag).slice(0, 4);
      for (const variant of variants) {
        const photo = variant.photos[0] === bag.images[0] ? realPhoto : await ap.fetchBuffer(variant.photos[0]).catch(() => null);
        if (!photo) continue;
        frames.push({ image: await ap.renderSlide(photo, { kind: "story", bg, name: variant.name, price: bag.price, mrp: bag.oldPrice, label: variant.colour || null }), seconds: 2.2 });
      }
      if (variants.length < 2) {
        for (const url of bag.images.slice(1, 3)) {
          const photo = await ap.fetchBuffer(url).catch(() => null);
          if (photo) frames.push({ image: await ap.renderSlide(photo, { kind: "story", bg, name: bag.name, price: bag.price, mrp: bag.oldPrice, label: null }), seconds: 2 });
        }
      }
      frames.push({ image: await textFrame([{ text: bag.name, size: 66 }, { text: rupees(bag.price), serif: false, weight: "SemiBold", size: 54 }, { text: "COD AVAILABLE  ·  LINK IN BIO", serif: false, weight: "SemiBold", size: 26, soft: true, spacing: 6 }], bg), seconds: 2.4 });
      const caption = ap.captions(bag, bag.name, "bag", Math.floor(Math.random() * 6));
      if (life) {
        const note = "Opening look is AI-styled · real product photos follow";
        caption.instagram = caption.instagram.replace("Free delivery (prepaid) · COD available", `Free delivery (prepaid) · COD available\n${note}`);
        caption.facebook = caption.facebook.replace("Free delivery (prepaid) · COD available", `Free delivery (prepaid) · COD available\n${note}`);
      }
      return { kind, frames, used, caption };
    }
    const bags = byReel.slice(0, 5);
    // one background for the whole reel: Black only when most bags are light
    let light = 0;
    for (const bag of bags) if (await ap.bagIsLight(await ap.fetchBuffer(bag.images[0]).catch(() => Buffer.alloc(0)))) light += 1;
    const bg = light > bags.length / 2 ? "black" : "cream";
    frames.push({ image: await textFrame([{ text: "New this week", size: 84 }, { text: `${bags.length} bags you'll love`, serif: false, weight: "Medium", size: 30, soft: true, spacing: 4 }], bg), seconds: 1.8 });
    for (const bag of bags) {
      const photo = await ap.fetchBuffer(bag.images[0]).catch(() => null);
      if (!photo) continue;
      used.push(bag);
      frames.push({ image: await ap.renderSlide(photo, { kind: "story", bg, name: bag.name, price: bag.price, mrp: bag.oldPrice, label: null }), seconds: 1.9 });
    }
    frames.push({ image: await textFrame([{ text: "Which one is yours?", size: 70 }, { text: "COD AVAILABLE  ·  LINK IN BIO", serif: false, weight: "SemiBold", size: 26, soft: true, spacing: 6 }], bg), seconds: 2.2 });
    const tags = ap.hashtags(bags[0] || {});
    const caption = `New this week 🤍\nWhich one is yours? Comment 1-${used.length}\n${used.map((b, i) => `${i + 1}. ${b.name} - ${rupees(b.price)}`).join("\n")}\nFree delivery (prepaid) · COD available\nLink in bio 🛍\n\n${tags} #reels #bagreels`;
    const fbCaption = caption.replace("Link in bio 🛍", `Shop: ${ap.SITE}/?utm_source=facebook&utm_medium=social&utm_campaign=autopilot-reel`);
    return { kind, frames, used, caption: { instagram: caption.slice(0, 2200), facebook: fbCaption } };
  }

  async function renderReel(frames, musicUrl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
    try {
      const args = ["-y", "-loglevel", "error"];
      const fade = 0.45;
      frames.forEach((frame, i) => {
        const file = path.join(dir, `f${i}.jpg`);
        fs.writeFileSync(file, frame.image);
        args.push("-loop", "1", "-t", String(frame.seconds + fade), "-i", file);
      });
      const total = frames.reduce((sum, f) => sum + f.seconds, 0) + fade;
      let audioIndex = frames.length;
      if (musicUrl) {
        const musicFile = path.join(dir, "music");
        fs.writeFileSync(musicFile, await ap.fetchBuffer(musicUrl));
        args.push("-stream_loop", "-1", "-i", musicFile);
      } else {
        args.push("-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=44100:cl=stereo");
      }
      const transitions = ["fade", "smoothleft", "fade", "slideup", "fade", "smoothright"];
      const parts = frames.map((f, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[v${i}]`);
      let last = "v0";
      let offset = 0;
      for (let i = 1; i < frames.length; i++) {
        offset += frames[i - 1].seconds;
        const out = i === frames.length - 1 ? "vout" : `x${i}`;
        parts.push(`[${last}][v${i}]xfade=transition=${transitions[(i - 1) % transitions.length]}:duration=${fade}:offset=${offset.toFixed(2)}[${out}]`);
        last = out;
      }
      if (frames.length === 1) parts.push("[v0]null[vout]");
      parts.push(`[${audioIndex}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2,volume=0.9[aout]`);
      const outFile = path.join(dir, "reel.mp4");
      args.push(
        "-filter_complex", parts.join(";"),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-t", total.toFixed(2), "-movflags", "+faststart", "-threads", "1",
        outFile
      );
      await runFfmpeg(args);
      return fs.readFileSync(outFile);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  async function waitVideo(id) {
    for (let i = 0; i < 80; i++) {
      const info = await metaCall(id, { params: { fields: "status_code,status" } });
      if (info.status_code === "FINISHED") return;
      if (info.status_code === "ERROR" || info.status_code === "EXPIRED") throw new Error(`Instagram ne reel nahi li (${info.status || info.status_code})`);
      await sleep(5000);
    }
    throw new Error("Instagram reel process karne mein bahut der laga raha hai");
  }

  async function publishReel(prepared) {
    const ids = await getMetaIds();
    const results = {};
    if (ids.igId) {
      try {
        const container = await metaCall(`${ids.igId}/media`, {
          method: "POST",
          params: { media_type: "REELS", video_url: prepared.videoUrl, cover_url: prepared.coverUrl, caption: prepared.caption.instagram, share_to_feed: "true" },
        });
        await waitVideo(container.id);
        const done = await metaCall(`${ids.igId}/media_publish`, { method: "POST", params: { creation_id: container.id } });
        let link = null;
        try {
          link = (await metaCall(done.id, { params: { fields: "permalink" } })).permalink || null;
        } catch {
          // optional
        }
        results.instagram = { ok: true, id: done.id, link };
      } catch (error) {
        results.instagram = { ok: false, message: error.message };
      }
    }
    try {
      const video = await metaCall(`${ids.pageId}/videos`, { method: "POST", token: ids.pageToken || undefined, params: { file_url: prepared.videoUrl, description: prepared.caption.facebook } });
      results.facebook = { ok: true, id: video.id, link: `https://www.facebook.com/${video.id}` };
    } catch (error) {
      results.facebook = { ok: false, message: error.message };
    }
    return results;
  }

  async function makeReel(dryRun) {
    const state = await readDaily();
    stage("Reel ke frames ban rahe hain");
    const built = await buildReelFrames(state);
    const music = pickSong(state, built.kind);
    stage(`Video ban rahi hai${music ? ` (gaana: ${music.name})` : " (bina gaane)"} - 1-3 minute`);
    const video = await renderReel(built.frames, music ? music.url : null);
    const videoUrl = await saveFile(video, "social/autopilot", "mp4", "video/mp4");
    const coverUrl = await saveFile(built.frames[0].image, "social/autopilot", "jpg", "image/jpeg");
    const prepared = { at: Date.now(), kind: built.kind, label: built.kind === "one" ? `Reel · ${built.used[0]?.name}` : `Reel · ${built.used.length} bags`, videoUrl, coverUrl, caption: built.caption, music: music ? music.name : "", musicUrl: music ? music.url : "", bags: built.used.map((b) => b.id) };
    if (dryRun) {
      await updateDaily((s) => {
        if (s.reelPreview) deleteStorageImages([s.reelPreview.videoUrl, s.reelPreview.coverUrl]).catch(() => {});
        s.reelPreview = prepared;
      });
      return { preview: prepared };
    }
    return finishReel(prepared, false);
  }

  async function finishReel(prepared, fromPreview) {
    stage("Reel Instagram + Facebook par ja rahi hai");
    const results = await publishReel(prepared);
    const ok = Object.values(results).some((r) => r.ok);
    if (results.instagram?.ok || !results.instagram) deleteStorageImages([prepared.videoUrl, prepared.coverUrl]).catch(() => {});
    await updateDaily((s) => {
      if (fromPreview) s.reelPreview = null;
      if (ok) {
        bumpToday(s, "reel");
        s.lastReelAt = Date.now();
        s.reelStep = (Number(s.reelStep) || 0) + 1;
        if (prepared.music) {
          s.musicIdx = (Number(s.musicIdx) || 0) + 1;
          s.lastSongUrl = prepared.musicUrl || "";
        }
        for (const id of prepared.bags || []) s.reelAt = { ...(s.reelAt || {}), [id]: Date.now() };
      }
      s.reelLog = [{ at: Date.now(), label: prepared.label, music: prepared.music, ok, results }, ...(s.reelLog || [])];
    });
    const line = (name, r) => (r ? `${name}: ${r.ok ? `✅ ${r.link ? `<a href="${r.link}">dekho</a>` : "live"}` : `❌ ${escapeHtml(r.message)}`}` : "");
    sendTransactionalEmail({
      to: REPORT_TO,
      subject: `SHRIMOH Autopilot: ${ok ? "reel live" : "reel nahi gayi"} - ${prepared.label}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1c150d"><h2>${ok ? "🎬 Reel live" : "⚠️ Reel nahi gayi"}</h2><p>${escapeHtml(prepared.label)}${prepared.music ? ` · gaana: ${escapeHtml(prepared.music)}` : " · bina gaane (Admin mein gaane upload karo)"}</p><p>${[line("Instagram", results.instagram), line("Facebook", results.facebook)].filter(Boolean).join("<br/>")}</p></div>`,
    }).catch(() => {});
    return { ok, results };
  }

  /* ================================================================
   * timer + lock
   * ================================================================ */
  function start(task, fn) {
    if (working) return false;
    working = { task, stage: "Shuru", startedAt: Date.now() };
    (async () => {
      try {
        await fn();
      } catch (error) {
        console.error(`AUTOPILOT DAILY ${task} ERROR:`, error.message);
        await updateDaily((s) => {
          s.lastError = { at: Date.now(), task, message: error.message };
        }).catch(() => {});
      } finally {
        working = null;
      }
    })();
    return true;
  }

  // Called on every cron call (4x a day). Waits a little so a post that
  // the same call started gets the server first.
  /*
   * TWO TIMERS (v16)
   *  - "Kaam wala timer"  /api/cron/autopilot-work  (every 5 minutes):
   *    fixing + checking, little by little - waiting name fixes, comment
   *    replies, songs, front photos, heavy photos, lifestyle photos on the
   *    website, the daily check, the weekly audit. Never posts anything.
   *  - "Post wala timer"  /api/cron/social-post  (fixed times you choose):
   *    post + story + reel go live at those times only (9 am - 10 pm).
   * If the work timer is not set up (or stops), the post timer also does
   * the fixing part, so nothing is ever left undone.
   */
  async function maintenance(full) {
    await shrinkOldSongs();
    if (weekly) await weekly.applyOpen().catch(() => 0);
    const before = await readDaily();
    if (Date.now() - (Number(before.lastRepliesAt) || 0) > 14 * 60 * 1000) {
      await updateDaily((x) => {
        x.lastRepliesAt = Date.now();
      });
      await runReplies();
    }
    const istHour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
    let state = await readDaily();
    if (istHour >= 8 && Date.now() - (Number(state.lastDailyAt) || 0) > 20 * 3600 * 1000) {
      await runDailyCheck();
      return;
    }
    if (weekly && !weekly.isWorking() && !ap.isRunning() && (await weekly.weeklyDue())) {
      stage("Hafte ka pro audit");
      await weekly.runAudit();
      return;
    }
    if (!full || !GEMINI_API_KEY || ap.isRunning()) return;
    // small website fixes, a few at a time
    state = await readDaily();
    const products = await ap.loadProductsAll().catch(() => []);
    if (!products.length) return;
    const fixes = [];
    fixes.push(...(await fixFrontPhotos(state, products, 2)));
    fixes.push(...(await lightenHeavyPhotos(products, 1, state)));
    if (countToday(state, "lifestyle") < 4) {
      const added = await addLifestyleToGalleries(products, 1);
      fixes.push(...added);
    }
    const real = fixes.filter((f) => !f.needsPhoto);
    await updateDaily((s) => {
      s.frontChecks = state.frontChecks || s.frontChecks;
      s.lightOk = state.lightOk || s.lightOk;
      if (real.length) s.fixLog = [...real, ...(s.fixLog || [])].slice(0, 60);
      for (const f of real) if (f.kind === "lifestyle") bumpToday(s, "lifestyle");
    });
  }

  // kaam wala timer (every 5 minutes)
  function workTick() {
    setTimeout(async () => {
      try {
        await updateDaily((s) => {
          s.lastWorkAt = Date.now();
        }).catch(() => {});
        const apState = await ap.readState();
        if (!apState.enabled || working) return;
        start("work", () => maintenance(true));
      } catch (error) {
        console.error("AUTOPILOT WORK ERROR:", error.message);
      }
    }, 200);
  }

  // post wala timer (fixed times)
  function tick() {
    setTimeout(async () => {
      try {
        await updateDaily((s) => {
          s.lastTickAt = Date.now();
        }).catch(() => {});
        const apState = await ap.readState();
        if (!apState.enabled) return;
        // wait (up to 3 min) if the work timer is busy, posting comes first at its time
        for (let i = 0; i < 36 && working; i++) await sleep(5000);
        if (working) return;
        start("tick", async () => {
          let state = await readDaily();
          const workAlive = Date.now() - (Number(state.lastWorkAt) || 0) < 2 * 3600 * 1000;
          if (!workAlive) await maintenance(false);
          if (!ap.isDaytime()) return;
          const gapOk = (at) => Date.now() - (Number(at) || 0) > 2 * 3600 * 1000;
          state = await readDaily();
          const storiesPerDay = state.storyDaily === false ? 0 : Number(state.storiesPerDay ?? 1);
          if (countToday(state, "story") < storiesPerDay && gapOk(state.lastStoryAt)) await postStory();
          state = await readDaily();
          const reelsPerDay = Number(state.reelsPerDay ?? 0);
          if (reelsPerDay > 0 && countToday(state, "reel") < reelsPerDay && gapOk(state.lastReelAt)) {
            for (let i = 0; i < 72 && ap.isRunning(); i++) {
              stage("Post poori hone ka intezaar, phir reel");
              await sleep(5000);
            }
            if (!ap.isRunning()) await makeReel(false);
          }
        });
      } catch (error) {
        console.error("AUTOPILOT TICK ERROR:", error.message);
      }
    }, 5000);
  }

  // (v17) the work timer also runs INSIDE the server every 5 minutes, so no
  // extra cron job is needed - the existing wake-up timer keeps the server
  // awake, and while it is awake this keeps the bot working.
  setTimeout(() => {
    workTick();
    setInterval(workTick, 5 * 60 * 1000);
  }, 60 * 1000);

  app.get("/api/cron/autopilot-work", (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || String(req.query.key || "") !== secret) return res.status(401).json({ success: false, message: "Wrong key" });
    workTick();
    return res.json({ success: true, message: working ? `Bot kaam kar raha hai: ${working.stage || working.task}` : "Bot ko kaam diya" });
  });

  /* ================================================================
   * Admin routes
   * ================================================================ */
  async function publicDaily() {
    const s = await readDaily();
    return {
      repliesOn: s.repliesOn !== false,
      storyDaily: s.storyDaily !== false,
      reelsPerWeek: Number(s.reelsPerWeek) || 0,
      reelsPerDay: Number(s.reelsPerDay ?? 2),
      storiesPerDay: s.storyDaily === false ? 0 : Number(s.storiesPerDay ?? 3),
      todayReels: countToday(s, "reel"),
      lastTickAt: s.lastTickAt || 0,
      lastWorkAt: s.lastWorkAt || 0,
      todayStories: countToday(s, "story"),
      replyLog: (s.replyLog || []).slice(0, 25),
      replyError: s.replyError || "",
      report: s.report,
      storyLog: (s.storyLog || []).slice(0, 8),
      reelLog: (s.reelLog || []).slice(0, 8),
      reelPreview: s.reelPreview,
      music: s.music || [],
      nextStory: STORY_KINDS[(Number(s.storyStep) || 0) % STORY_KINDS.length],
      lastError: s.lastError || null,
      lastFrontRun: s.lastFrontRun || null,
      lastLifestyleRun: s.lastLifestyleRun || null,
      working,
      ffmpegReady: Boolean(ffmpegPath),
      fixLog: (s.fixLog || []).slice(0, 20),
    };
  }

  const ok = async (res, extra = {}) => res.json({ success: true, ...extra, ...(await publicDaily()) });

  app.get("/api/admin/autopilot/daily", requireAdmin, async (req, res) => ok(res));

  /*
   * ACTIVITY (v12) - one simple feed: what the bot did, when, and what it
   * is doing right now. Built from the logs the bot already keeps.
   */
  app.get("/api/admin/autopilot/activity", requireAdmin, async (req, res) => {
    try {
      const d = await readDaily();
      const a = await ap.readState();
      const p = weekly ? await weekly.recent() : { applied: [], lastAuditAt: 0, stage: "" };
      const events = [];
      const push = (at, icon, text, link, ok = true) => at && events.push({ at, icon, text, link: link || "", ok });
      for (const e of a.log || []) {
        if (e.dryRun) continue;
        const ig = e.results?.instagram;
        push(e.at, e.kind === "model" ? "🖼" : e.kind === "trust" ? "🤝" : "👜", `${e.ok ? "Post daali" : "Post nahi gayi"}: ${String(e.label || "").replace(/^(Bag|Model) · /, "")}${e.ok ? "" : ` - ${e.message || ig?.message || ""}`}`, ig?.link, e.ok);
      }
      for (const r of d.reelLog || []) push(r.at, "🎬", `${r.ok ? "Reel daali" : "Reel nahi gayi"}: ${r.label.replace(/^Reel · /, "")}${r.music ? ` (♪ ${r.music})` : ""}`, r.results?.instagram?.link, r.ok);
      for (const st of d.storyLog || []) push(st.at, "📖", `Story lagayi: ${st.bags.join(" + ")} → highlight "${st.highlight}" mein daalo`, "", Boolean(st.results?.instagram?.ok || st.results?.facebook?.ok));
      for (const r of d.replyLog || []) if (r.reply && r.ok) push(r.at, r.action === "alert" ? "⚠️" : "💬", `${r.action === "alert" ? "Shikayat - aapko email bheja" : "Comment ka jawab diya"}: ${r.user} - "${r.text.slice(0, 50)}"`, r.link);
      for (const f of d.fixLog || []) push(f.at, f.kind === "lifestyle" ? "🌿" : f.kind === "compress" ? "🪶" : "🔧", `${f.kind === "lifestyle" ? "Website pe lifestyle photo lagayi" : f.kind === "compress" ? "Bhaari photo halki ki" : "Front photo theek ki"}: ${f.name}${f.undone ? " (aapne wapas kiya)" : ""}`);
      for (const x of p.applied || []) push(x.appliedAt, "✏️", `${x.field === "name" ? "Naam badla" : "Description theek ki"}: ${x.field === "name" ? `"${x.before}" → "${x.after}"` : x.after.slice(0, 60)}${x.undone ? " (wapas kiya)" : ""}`);
      if (d.report?.at) push(d.report.at, "📅", `Roz ka check kiya, email bheja${d.report.review?.score != null ? ` (grid ${d.report.review.score}/10)` : ""}`);
      if (p.lastAuditAt) push(p.lastAuditAt, "🧠", "Hafte ka pro audit kiya, email bheja");
      events.sort((x, y) => y.at - x.at);
      const today = ap.istDay();
      const isToday = (at) => new Date(at + 5.5 * 3600 * 1000).toISOString().slice(0, 10) === today;
      const count = (icon) => events.filter((e) => e.icon === icon && e.ok && isToday(e.at)).length;
      const now = [ap.isRunning() ? "post bana raha hai" : "", working ? working.stage || "kaam kar raha hai" : "", p.stage || ""].filter(Boolean).join(" · ");
      return res.json({
        success: true,
        enabled: Boolean(a.enabled),
        now,
        lastTickAt: d.lastTickAt || 0,
        lastWorkAt: d.lastWorkAt || 0,
        today: {
          posts: count("👜") + count("🖼") + count("🤝"),
          reels: count("🎬"),
          stories: count("📖"),
          replies: count("💬"),
          fixes: count("✏️") + count("🔧") + count("🌿") + count("🪶"),
        },
        events: events.slice(0, 40),
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/autopilot/daily/settings", requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      await updateDaily((s) => {
        if (typeof body.repliesOn === "boolean") s.repliesOn = body.repliesOn;
        if (typeof body.storyDaily === "boolean") s.storyDaily = body.storyDaily;
        if (body.reelsPerWeek != null) s.reelsPerWeek = Math.max(0, Math.min(7, Math.round(Number(body.reelsPerWeek) || 0)));
        if (body.reelsPerDay != null) s.reelsPerDay = Math.max(0, Math.min(4, Math.round(Number(body.reelsPerDay) || 0)));
        if (body.storiesPerDay != null) s.storiesPerDay = Math.max(0, Math.min(5, Math.round(Number(body.storiesPerDay) || 0)));
      });
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  const job = (task, fn) => async (req, res) => {
    const started = start(task, () => fn(req));
    if (!started) return res.status(409).json({ success: false, message: "Bot abhi doosra kaam kar raha hai, 1-2 minute baad." });
    return ok(res, { started: true });
  };
  app.post("/api/admin/autopilot/daily/check", requireAdmin, job("check", () => runDailyCheck()));
  app.post("/api/admin/autopilot/daily/replies", requireAdmin, job("replies", () => runReplies()));
  // check ALL products' front photos now (bigger budget than the daily 15)
  app.post(
    "/api/admin/autopilot/daily/front-photos",
    requireAdmin,
    job("front", async () => {
      const state = await readDaily();
      const products = await ap.loadProductsAll();
      const fixes = await fixFrontPhotos(state, products, 80);
      await updateDaily((s) => {
        s.frontChecks = state.frontChecks;
        s.fixLog = [...fixes.filter((f) => !f.needsPhoto), ...(s.fixLog || [])].slice(0, 60);
        s.lastFrontRun = { at: Date.now(), moved: fixes.filter((f) => !f.needsPhoto).length, needPhoto: fixes.filter((f) => f.needsPhoto).map((f) => `${f.name}${f.colour ? ` (${f.colour})` : ""}`) };
      });
    })
  );
  app.post(
    "/api/admin/autopilot/daily/lifestyle-gallery",
    requireAdmin,
    job("lifestyle", async () => {
      const products = await ap.loadProductsAll();
      const added = await addLifestyleToGalleries(products, 8);
      await updateDaily((s) => {
        s.fixLog = [...added.filter((f) => !f.needsPhoto), ...(s.fixLog || [])].slice(0, 60);
        s.lastLifestyleRun = { at: Date.now(), added: added.filter((f) => !f.needsPhoto).length, failed: added.filter((f) => f.needsPhoto).map((f) => f.name) };
      });
    })
  );

  app.post("/api/admin/autopilot/daily/undo-fix", requireAdmin, async (req, res) => {
    try {
      const at = Number(req.body?.at);
      const productId = req.body?.productId;
      const state = await readDaily();
      const fix = (state.fixLog || []).find((f) => f.at === at && String(f.productId) === String(productId));
      if (!fix || fix.undone) return res.status(404).json({ success: false, message: "Ye badlav nahi mila." });
      await writeProductList(fix.productId, fix.field, fix.before, fix.after, fix.kind === "lifestyle" ? "add" : fix.kind === "compress" ? "replace" : "reorder");
      await updateDaily((s) => {
        for (const f of s.fixLog || []) if (f.at === at && String(f.productId) === String(productId)) f.undone = true;
        // remember the owner's order so the bot does not move it again
        s.frontChecks = { ...(s.frontChecks || {}), [`${fix.productId}:${fix.field}`]: listSignature(fix.before) };
      });
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
  app.post("/api/admin/autopilot/daily/story", requireAdmin, job("story", () => postStory(true)));
  app.post("/api/admin/autopilot/reel/test", requireAdmin, job("reel", () => makeReel(true)));
  app.post(
    "/api/admin/autopilot/reel/publish",
    requireAdmin,
    job("reel", async () => {
      const s = await readDaily();
      if (s.reelPreview) await finishReel(s.reelPreview, true);
    })
  );
  app.delete("/api/admin/autopilot/reel/preview", requireAdmin, async (req, res) => {
    await updateDaily((s) => {
      if (s.reelPreview) deleteStorageImages([s.reelPreview.videoUrl, s.reelPreview.coverUrl]).catch(() => {});
      s.reelPreview = null;
    });
    return ok(res);
  });

  /*
   * SONG CHECK (v8) - AI listens to the first 30 seconds: does it have
   * singing, is it calm or upbeat, does it fit a premium handbag reel?
   * calm songs go on one-bag / model reels, upbeat on many-bag reels;
   * a song that does not fit is kept but never used.
   */
  async function checkSong(buffer, ext) {
    if (!GEMINI_API_KEY || !ffmpegPath) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "song-"));
    try {
      const input = path.join(dir, `in.${ext}`);
      const clip = path.join(dir, "clip.mp3");
      fs.writeFileSync(input, buffer);
      await runFfmpeg(["-y", "-loglevel", "error", "-i", input, "-t", "30", "-ac", "1", "-ar", "22050", "-b:a", "64k", clip]);
      const data = await ap.geminiCall(ap.TEXT_MODEL, {
        contents: [
          {
            parts: [
              {
                text:
                  "Listen to this music clip. It may be used as background music for short Instagram reels of a women's handbag brand that wants to look premium, calm and classy (like Miraggio or Charles & Keith). " +
                  'Return ONLY JSON: {"vocals":true/false (any singing or spoken words),"mood":"calm" or "upbeat","fit":0-10 (how well it suits premium handbag reels),"strong_start":true/false (sounds good from the very first second),"note":"short Hinglish reason"}',
              },
              { inline_data: { mime_type: "audio/mp3", data: fs.readFileSync(clip).toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      const r = JSON.parse(text.replace(/```json|```/g, "").trim());
      const fit = Math.max(0, Math.min(10, Number(r.fit) || 0));
      return { vocals: r.vocals === true, mood: r.mood === "upbeat" ? "upbeat" : "calm", fit, note: String(r.note || "").slice(0, 120), use: fit >= 6 && r.vocals !== true };
    } catch (error) {
      console.error("SONG CHECK ERROR:", error.message);
      return null;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /*
   * SMALL SONGS (v9) - a reel uses 10-20 seconds, so only the first 60
   * seconds are kept (silence at the start removed, soft fade at the end),
   * as a light 96 kbps MP3: a 4-5 MB song becomes ~0.7 MB.
   */
  async function shrinkSong(buffer, ext) {
    if (!ffmpegPath) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shrink-"));
    try {
      const input = path.join(dir, `in.${ext || "mp3"}`);
      const out = path.join(dir, "out.mp3");
      fs.writeFileSync(input, buffer);
      await runFfmpeg([
        "-y", "-loglevel", "error", "-i", input, "-vn",
        "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,atrim=0:60,afade=t=out:st=58:d=2",
        "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", out,
      ]);
      const small = fs.readFileSync(out);
      return small.length > 20000 ? small : null;
    } catch (error) {
      console.error("SONG SHRINK ERROR:", error.message);
      return null;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // songs uploaded earlier: make them small and let the AI listen to them (once)
  async function shrinkOldSongs() {
    const state = await readDaily();
    const todo = (state.music || []).filter((m) => !m.small || !m.check).slice(0, 4);
    for (const song of todo) {
      try {
        const original = await ap.fetchBuffer(song.url);
        const ext = (song.url.split("?")[0].split(".").pop() || "mp3").toLowerCase();
        let url = song.url;
        let buffer = original;
        let kb = song.kb;
        if (!song.small) {
          const small = await shrinkSong(original, ext);
          if (small) {
            buffer = small;
            url = await saveFile(small, "music", "mp3", "audio/mpeg");
            kb = Math.round(small.length / 1024);
          }
        }
        const check = song.check || (await checkSong(buffer, url === song.url ? ext : "mp3"));
        await updateDaily((s) => {
          s.music = (s.music || []).map((m) =>
            m.url === song.url ? { ...m, url, small: url !== song.url || m.small, kb, originalKb: m.originalKb || Math.round(original.length / 1024), check: check || m.check } : m
          );
        });
        if (url !== song.url) deleteStorageImages([song.url]).catch(() => {});
      } catch (error) {
        console.error("OLD SONG FIX ERROR:", error.message);
      }
    }
  }

  // "Gaane theek karo" button in Admin runs the same thing right away
  app.post("/api/admin/autopilot/music/fix", requireAdmin, async (req, res) => {
    const started = start("songs", () => shrinkOldSongs());
    if (!started) return res.status(409).json({ success: false, message: "Bot abhi doosra kaam kar raha hai, 1-2 minute baad." });
    return res.json({ success: true, started: true, ...(await publicDaily()) });
  });

  // calm songs for one-bag / model reels, upbeat for many-bag reels
  function pickSong(state, kind) {
    const usable = (state.music || []).filter((m) => !m.check || m.check.use);
    if (!usable.length) return null;
    const want = kind === "many" ? "upbeat" : "calm";
    const matching = usable.filter((m) => (m.check?.mood || "calm") === want);
    const list = matching.length ? matching : usable;
    const last = state.lastSongUrl || "";
    const options = list.length > 1 ? list.filter((m) => m.url !== last) : list;
    return options[(Number(state.musicIdx) || 0) % options.length];
  }

  app.post("/api/admin/autopilot/music", requireAdmin, audioUpload.single("song"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Gaana nahi mila." });
      const ext = (path.extname(req.file.originalname || "") || ".mp3").replace(".", "").toLowerCase();
      const small = await shrinkSong(req.file.buffer, ext);
      const keep = small || req.file.buffer;
      const check = await checkSong(keep, small ? "mp3" : ext);
      const url = await saveFile(keep, "music", small ? "mp3" : ext, small ? "audio/mpeg" : req.file.mimetype || "audio/mpeg");
      const name = path.basename(req.file.originalname || "song", path.extname(req.file.originalname || "")).slice(0, 60);
      await updateDaily((s) => {
        s.music = [...(s.music || []), { url, name, at: Date.now(), check, small: Boolean(small), kb: Math.round(keep.length / 1024), originalKb: Math.round(req.file.buffer.length / 1024) }].slice(-15);
      });
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/autopilot/music/delete", requireAdmin, async (req, res) => {
    const url = String(req.body?.url || "");
    await updateDaily((s) => {
      s.music = (s.music || []).filter((m) => m.url !== url);
    });
    if (url.includes("/music/")) deleteStorageImages([url]).catch(() => {});
    return ok(res);
  });

  return { tick, setWeekly: (pro) => { weekly = pro; }, renderReel, buildReelFrames, makeStory, renderThisOrThat, renderStyled, textFrame };
};
