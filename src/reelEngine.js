/*
 * REEL ENGINE (2026-10-29) - used by ReelMaker.jsx
 * --------------------------------------------------
 * Makes a 1080x1920 MP4 reel ENTIRELY ON THE PHONE:
 *   - every scene = the real bag photo on a WHITE page (reelPhoto.js, v4:
 *     no background removal any more, so no leftover white bits)
 *   - slow zoom ("Ken Burns"), soft cross-fade, text that fades/slides in
 *   - encoded with the phone's own video encoder (WebCodecs, H.264)
 *     and packed into an .mp4 by the vendored mp4-muxer.
 * Nothing is uploaded: no Supabase / Render / Vercel storage or work is
 * used. If the phone has no WebCodecs (old iOS), a slower fallback
 * records the canvas in real time (MediaRecorder).
 * No sound: the song is added in Instagram (library music).
 *
 * (2026-10-29 v2) FASTER: "⚡ Tez" quality renders at 720x1280 (2.25x fewer
 * pixels - Instagram shows reels at about this size anyway), bag cut-outs
 * are prepared while you pick bags (prepareCutouts), and all drawing uses
 * 1080x1920 coordinates scaled to the output size.
 */

import { WHITE, PHOTO_CY, photoSprite, whitePage, preparePhoto } from "./reelPhoto";
import { REEL_W, REEL_H, SERIF, SANS, easeOut, easeInOut, makeCanvas, spaced, fitSize, rupees, tick } from "./reelKit";
export { REEL_W, REEL_H };
import {
  SINGLE_LINES, swipePlan, magazinePlan, splitPlan, topListPlan, bouncePlan, filmStripPlan, detailsPlan, anglesPlan,
  fastCutsPlan, collagePlan, polaroidPlan,
} from "./reelStyles";

const FPS = 30;
export const QUALITIES = {
  fast: { label: "⚡ Tez (HD 720p)", w: 720, h: 1280, bitrate: 5_000_000 },
  full: { label: "💎 Full HD 1080p (thoda dheere)", w: 1080, h: 1920, bitrate: 8_000_000 },
};
const FADE = 0.45; // seconds of cross-fade between scenes

/* -------------------------- text styles ---------------------------- */
// Every text item: { text, kind, y (0..1 of height), delay (s) }
function drawText(ctx, item, alpha, theme) {
  if (!item.text || alpha <= 0) return;
  const W = REEL_W;
  const H = REEL_H;
  const ink = theme.dark ? "245,239,228" : "28,21,13";
  const rise = (1 - alpha) * 26;
  const y = item.y * H + rise;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (item.kind === "hook") {
    ctx.fillStyle = `rgba(${ink},0.96)`;
    fitSize(ctx, item.text, "italic 500", 92, SERIF, W * 0.86);
    ctx.fillText(item.text, W / 2, y);
  } else if (item.kind === "line") {
    ctx.fillStyle = `rgba(${ink},0.92)`;
    fitSize(ctx, item.text, "italic 500", 64, SERIF, W * 0.86);
    ctx.fillText(item.text, W / 2, y);
  } else if (item.kind === "number") {
    ctx.fillStyle = `rgba(${ink},0.95)`;
    ctx.font = `600 190px ${SERIF}`;
    ctx.fillText(item.text, W / 2, y);
  } else if (item.kind === "price") {
    ctx.fillStyle = `rgba(${ink},0.97)`;
    fitSize(ctx, item.text, "600", 130, SANS, W * 0.8);
    ctx.fillText(item.text, W / 2, y);
  } else if (item.kind === "strike") {
    ctx.fillStyle = `rgba(${ink},0.55)`;
    ctx.font = `500 46px ${SANS}`;
    const width = ctx.measureText(item.text).width;
    ctx.fillText(item.text, W / 2, y);
    ctx.strokeStyle = `rgba(${ink},0.55)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - width / 2 - 4, y - 15);
    ctx.lineTo(W / 2 + width / 2 + 4, y - 15);
    ctx.stroke();
  } else {
    // "caps": small letter-spaced line
    ctx.fillStyle = `rgba(${ink},0.7)`;
    let size = 30;
    ctx.font = `600 ${size}px ${SANS}`;
    const text = String(item.text).toUpperCase();
    while (size > 14 && ctx.measureText(text).width + text.length * 6 > W * 0.86) {
      size -= 1;
      ctx.font = `600 ${size}px ${SANS}`;
    }
    spaced(ctx, text, W / 2, y, 6);
  }
  ctx.restore();
}

/* --------------------------- timeline ------------------------------ */
/**
 * style: "newin" | "colours" | "guess"
 * bags: [{ img, name, price, mrp, label }]  (colours: one entry per colour)
 * options: { bg, hook, showPrice }
 * -> scenes: [{ img|null, duration, texts: [...] }]
 */
export function buildTimeline(style, bags, options) {
  const hook = String(options.hook || "").trim();
  const scenes = [];
  const outro = (lines) => ({ img: null, duration: 2.4, texts: lines });
  if (style === "showcase") {
    // one bag, its chosen photos, calm and elegant
    const first = bags[0];
    bags.forEach((bag, index) => {
      const text = index === 0 ? hook || `meet the ${first.name || "bag"}` : SINGLE_LINES[(index - 1) % SINGLE_LINES.length];
      scenes.push({ img: bag.img, duration: index === 0 ? 2.2 : 1.7, texts: [{ text, kind: index === 0 ? "hook" : "line", y: 0.2, delay: 0.12 }] });
    });
    const end = [{ text: first.name || "", kind: "line", y: 0.42, delay: 0.1 }];
    if (options.showPrice !== false && Number(first.price) > 0) end.push({ text: rupees(first.price), kind: "caps", y: 0.46, delay: 0.3 });
    end.push({ text: "shop via the link in bio", kind: "caps", y: 0.5, delay: 0.45 }, { text: "free delivery (prepaid) · cod available", kind: "caps", y: 0.53, delay: 0.6 });
    scenes.push(outro(end));
    return scenes;
  }
  if (style === "colours") {
    const first = bags[0];
    scenes.push({ img: first.img, duration: 2.2, texts: [{ text: hook || "kaunsa colour lenge?", kind: "hook", y: 0.2, delay: 0.15 }] });
    bags.forEach((bag, index) => {
      scenes.push({
        img: bag.img,
        duration: 1.7,
        texts: [
          { text: String(index + 1), kind: "number", y: 0.245, delay: 0.1 },
          { text: bag.label || "", kind: "caps", y: 0.28, delay: 0.3 },
        ],
      });
    });
    scenes.push(
      outro([
        { text: "comment karo 👇", kind: "hook", y: 0.42, delay: 0.1 },
        { text: bags.map((_, index) => index + 1).join(", "), kind: "line", y: 0.48, delay: 0.35 },
        { text: "shop via the link in bio", kind: "caps", y: 0.56, delay: 0.6 },
      ])
    );
  } else if (style === "guess") {
    const first = bags[0];
    const photos = bags.slice(0, 3);
    scenes.push({ img: photos[0].img, duration: 2.2, texts: [{ text: hook || "guess the price 👀", kind: "hook", y: 0.2, delay: 0.15 }] });
    if (photos[1]) scenes.push({ img: photos[1].img, duration: 1.5, texts: [{ text: "kitne ka hoga?", kind: "line", y: 0.2, delay: 0.1 }] });
    if (photos[2]) scenes.push({ img: photos[2].img, duration: 1.5, texts: [{ text: "comment mein guess karo", kind: "caps", y: 0.2, delay: 0.1 }] });
    const reveal = [
      { text: "only", kind: "line", y: 0.18, delay: 0.05 },
      { text: rupees(first.price), kind: "price", y: 0.248, delay: 0.25 },
    ];
    if (Number(first.mrp) > Number(first.price)) reveal.push({ text: `MRP ${rupees(first.mrp)}`, kind: "strike", y: 0.282, delay: 0.55 });
    scenes.push({ img: photos[0].img, duration: 2.6, texts: reveal });
    scenes.push(
      outro([
        { text: first.name || "", kind: "line", y: 0.42, delay: 0.1 },
        { text: "shop via the link in bio", kind: "caps", y: 0.48, delay: 0.4 },
        { text: "free delivery (prepaid) · cod available", kind: "caps", y: 0.52, delay: 0.6 },
      ])
    );
  } else {
    bags.forEach((bag, index) => {
      const texts = [];
      if (index === 0) texts.push({ text: hook || "new in this week", kind: "hook", y: 0.2, delay: 0.15 });
      else texts.push({ text: bag.name || "", kind: "line", y: 0.2, delay: 0.1 });
      if (index > 0 && options.showPrice && Number(bag.price) > 0) texts.push({ text: rupees(bag.price), kind: "caps", y: 0.235, delay: 0.3 });
      scenes.push({ img: bag.img, duration: index === 0 ? 2.2 : 1.6, texts });
    });
    scenes.push(
      outro([
        { text: "shop the new edit", kind: "hook", y: 0.42, delay: 0.1 },
        { text: "shop via the link in bio", kind: "caps", y: 0.48, delay: 0.4 },
        { text: "free delivery (prepaid) · cod available", kind: "caps", y: 0.52, delay: 0.6 },
      ])
    );
  }
  return scenes;
}

/* ---------------------------- drawing ------------------------------ */

// Pre-draw each scene's background + bag once ("plate").
async function makePlates(scenes, OW = REEL_W, OH = REEL_H, onStep = () => {}) {
  const plates = [];
  // one sprite per different photo (the same photo is reused, not redrawn)
  const byImage = new Map();
  for (let index = 0; index < scenes.length; index++) {
    const img = scenes[index].img;
    if (!img) {
      plates.push(null);
      continue;
    }
    if (!byImage.has(img)) {
      // (v4) the photo as it is - its white background melts into the white page
      byImage.set(img, photoSprite(img, OW, OH).sprite);
      onStep((index + 1) / scenes.length);
      await tick();
    }
    plates.push(byImage.get(img));
  }
  return { plates, busy: 0 };
}

/** Prepare the photos ahead of time (while the person is still picking). */
export async function prepareCutouts(images) {
  for (const img of images) {
    if (!img) continue;
    preparePhoto(img);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function drawPlate(ctx, plate, zoom, alpha, dx = 0) {
  if (alpha <= 0) return;
  const w = REEL_W * zoom;
  const h = REEL_H * zoom;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  // zoom towards the bag (a bit above the middle)
  ctx.drawImage(plate, (REEL_W - w) / 2 + dx, PHOTO_CY * (1 - zoom), w, h);
  ctx.restore();
}

function drawFrame(ctx, t, scenes, plates, starts, theme, scale = 1, backdrop = null) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  let index = scenes.length - 1;
  for (let i = 0; i < scenes.length; i++) {
    if (t < starts[i] + scenes[i].duration) {
      index = i;
      break;
    }
  }
  const local = t - starts[index];
  const scene = scenes[index];
  const zoomFor = (i, at) => 1 + 0.07 * easeInOut(Math.min(1, Math.max(0, at / (scenes[i].duration + FADE))));

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  if (backdrop) ctx.drawImage(backdrop, 0, 0, REEL_W, REEL_H);
  if (index > 0 && local < FADE) {
    // old bag glides out to the left, new one glides in from the right
    const previous = index - 1;
    const out = easeInOut(Math.min(1, local / (FADE * 0.6)));
    const inn = easeInOut(Math.max(0, (local - FADE * 0.3) / (FADE * 0.7)));
    if (plates[previous]) drawPlate(ctx, plates[previous], zoomFor(previous, t - starts[previous]), 1 - out, -60 * out);
    if (plates[index]) drawPlate(ctx, plates[index], zoomFor(index, local), inn, 60 * (1 - inn));
  } else if (plates[index]) {
    drawPlate(ctx, plates[index], zoomFor(index, local), 1);
  }

  // SHRIMOH mark stays still on top
  ctx.save();
  ctx.fillStyle = theme.dark ? "rgba(245,239,228,0.95)" : "rgba(28,21,13,0.92)";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${Math.round(REEL_W * 0.026)}px ${SERIF}`;
  spaced(ctx, "SHRIMOH", REEL_W / 2, 270, REEL_W * 0.017);
  ctx.restore();

  // previous scene's text fades out, this scene's fades/slides in
  if (index > 0 && local < FADE) {
    for (const item of scenes[index - 1].texts) drawText(ctx, item, 1 - local / FADE, theme);
  }
  for (const item of scene.texts) {
    const appear = (local - (item.delay || 0) - (index > 0 ? FADE * 0.5 : 0)) / 0.45;
    drawText(ctx, item, easeOut(appear), theme);
  }
}

/* ---------------------------- encoding ----------------------------- */

const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.640033", "avc1.4d0033"];

async function pickCodec(q) {
  if (typeof window.VideoEncoder === "undefined" || typeof window.VideoFrame === "undefined") return null;
  for (const codec of CODECS) {
    try {
      const { supported } = await window.VideoEncoder.isConfigSupported({ codec, width: q.w, height: q.h, bitrate: q.bitrate, framerate: FPS });
      if (supported) return codec;
    } catch {
      // try the next one
    }
  }
  return null;
}

async function encodeWebCodecs(codec, q, totalFrames, draw, canvas, onProgress) {
  const { Muxer, ArrayBufferTarget } = await import("./mp4-muxer.mjs");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: q.w, height: q.h, frameRate: FPS }, fastStart: "in-memory" });
  let failure = null;
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure({ codec, width: q.w, height: q.h, bitrate: q.bitrate, framerate: FPS, avc: { format: "avc" } });
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (failure) throw failure;
    draw(frameIndex / FPS);
    const frame = new window.VideoFrame(canvas, { timestamp: Math.round((frameIndex * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    encoder.encode(frame, { keyFrame: frameIndex % (FPS * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) {
      await new Promise((resolve) => {
        const check = () => (encoder.encodeQueueSize > 2 ? setTimeout(check, 5) : resolve());
        check();
      });
    }
    if (frameIndex % 10 === 0) {
      onProgress(frameIndex / totalFrames);
      await new Promise((resolve) => setTimeout(resolve, 0)); // keep the screen alive
    }
  }
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

async function encodeRealtime(q, totalSeconds, draw, canvas, onProgress) {
  if (typeof canvas.captureStream !== "function" || typeof window.MediaRecorder === "undefined") {
    throw new Error("Is phone/browser mein video banana support nahi hai. iPhone ka iOS update karke try karo.");
  }
  const type = window.MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
  const stream = canvas.captureStream(FPS);
  const recorder = new window.MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: q.bitrate });
  const parts = [];
  recorder.ondataavailable = (event) => event.data && event.data.size && parts.push(event.data);
  const done = new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  draw(0);
  recorder.start(250);
  const started = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (t >= totalSeconds) return resolve();
      draw(t);
      onProgress(t / totalSeconds);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await done;
  stream.getTracks().forEach((track) => track.stop());
  return new Blob(parts, { type });
}

/* ======================= NEW STYLES (2026-10-29) ======================= */
/* Every style is a "plan": { total, busy, draw(ctx, t, scale), dispose() }.
   Drawing always uses 1080x1920 coordinates; scale fits the output size. */

/* ---- classic (New in / Kaunsa colour / Guess the price) as a plan ---- */
async function classicPlan(style, bags, options, OW, OH, onStep) {
  const theme = WHITE;
  const scenes = buildTimeline(style, bags, options);
  const { plates, busy } = await makePlates(scenes, OW, OH, onStep);
  const backdrop = whitePage(OW, OH);
  const starts = [];
  let total = 0;
  for (const scene of scenes) {
    starts.push(total);
    total += scene.duration;
  }
  return {
    total,
    busy,
    previewAt: scenes[0].duration * 0.9,
    draw: (ctx, t, scale) => drawFrame(ctx, Math.min(t, total - 0.001), scenes, plates, starts, theme, scale, backdrop),
    dispose: () => [...new Set(plates), backdrop].forEach((plate) => plate && ((plate.width = 1), (plate.height = 1))),
  };
}

// Style ids ending in "1" are the ONE-BAG versions (photos of one bag).
const PLANS = {
  fastcuts: fastCutsPlan,
  collage: collagePlan,
  grid: collagePlan,
  polaroid: polaroidPlan,
  swipe: swipePlan,
  magazine: magazinePlan,
  split: splitPlan,
  toplist: topListPlan,
  bounce: bouncePlan,
  filmstrip: filmStripPlan,
  details: detailsPlan,
  angles: anglesPlan,
};

async function createPlan(style, bags, options, OW, OH, onStep = () => {}) {
  const single = /1$/.test(style) || ["showcase", "details", "angles", "grid", "guess", "colours"].includes(style);
  const base = style.replace(/1$/, "");
  const opts = { ...options, single };
  if (PLANS[base]) return PLANS[base](bags, opts, OW, OH, onStep);
  return classicPlan(base, bags, opts, OW, OH, onStep);
}

/**
 * Renders the reel. Returns { blob, seconds, busy, method }.
 */
export async function renderReel({ style, bags, options, onProgress = () => {} }) {
  const q = QUALITIES[options.quality] || QUALITIES.fast;
  onProgress(0, "Bags taiyar ho rahe hain...");
  await tick();
  const plan = await createPlan(style, bags, options, q.w, q.h, (p) => onProgress(p * 0.1, "Bags taiyar ho rahe hain..."));
  const total = plan.total;
  const canvas = makeCanvas(q.w, q.h);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "medium";
  const scale = q.w / REEL_W;
  const draw = (t) => plan.draw(ctx, Math.min(t, total - 0.001), scale);
  const later = (p, text) => onProgress(0.1 + p * 0.9, text);

  const codec = await pickCodec(q);
  let blob;
  let method;
  try {
    if (codec) {
      try {
        method = "fast";
        blob = await encodeWebCodecs(codec, q, Math.round(total * FPS), draw, canvas, (p) => later(p, "Video ban rahi hai..."));
      } catch {
        blob = null; // phone's fast encoder refused - use the slower way below
      }
    }
    if (!blob) {
      method = "realtime";
      blob = await encodeRealtime(q, total, draw, canvas, (p) => later(p, "Video ban rahi hai (reel jitna time lagega)..."));
    }
  } finally {
    // free the big canvases right away (phone memory)
    plan.dispose();
    canvas.width = 1;
    canvas.height = 1;
  }
  onProgress(1, "");
  return { blob, seconds: total, busy: plan.busy, method };
}

/* Still preview (shown before making the video) - small and quick. */
export async function drawPreview(ctx, style, bags, options) {
  const plan = await createPlan(style, bags, options, REEL_W / 2, REEL_H / 2);
  plan.draw(ctx, Math.min(plan.previewAt, plan.total - 0.01), 1);
  plan.dispose();
}


