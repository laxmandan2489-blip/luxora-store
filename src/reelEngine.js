/*
 * REEL ENGINE (2026-10-29) - used by ReelMaker.jsx
 * --------------------------------------------------
 * Makes a 1080x1920 MP4 reel ENTIRELY ON THE PHONE:
 *   - every scene = the real bag photo on a Studio backdrop (studioDesign.js)
 *   - slow zoom ("Ken Burns"), soft cross-fade, text that fades/slides in
 *   - encoded with the phone's own video encoder (WebCodecs, H.264)
 *     and packed into an .mp4 by the vendored mp4-muxer.
 * Nothing is uploaded: no Supabase / Render / Vercel storage or work is
 * used. If the phone has no WebCodecs (old iOS), a slower fallback
 * records the canvas in real time (MediaRecorder).
 * No sound: the song is added in Instagram (library music).
 */

import { drawStudio, drawStudioBackdrop, STUDIO_BACKGROUNDS } from "./studioDesign";

export const REEL_W = 1080;
export const REEL_H = 1920;
const FPS = 30;
const FADE = 0.45; // seconds of cross-fade between scenes

const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const SANS = '"AdUrbanist", "Helvetica Neue", Arial, sans-serif';

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function spaced(ctx, text, x, y, spacing) {
  const chars = String(text).split("");
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);
  let cursor = x - total / 2;
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + spacing;
  });
  ctx.textAlign = "center";
}

function fitSize(ctx, text, style, size, family, maxWidth) {
  let current = size;
  ctx.font = `${style} ${current}px ${family}`;
  while (current > 14 && ctx.measureText(String(text)).width > maxWidth) {
    current -= 2;
    ctx.font = `${style} ${current}px ${family}`;
  }
  return current;
}

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

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
function makePlates(scenes, bgKey) {
  const plates = [];
  let busy = 0;
  for (const scene of scenes) {
    const plate = makeCanvas(REEL_W, REEL_H);
    const ctx = plate.getContext("2d");
    if (scene.img) {
      const result = drawStudio(ctx, { W: REEL_W, H: REEL_H, img: scene.img, d: { studioBg: bgKey, storyLayout: true, bare: true, reel: true } });
      if (result && result.cutout === false) busy += 1;
    } else {
      drawStudioBackdrop(ctx, REEL_W, REEL_H, bgKey);
    }
    plates.push(plate);
  }
  return { plates, busy };
}

function drawPlate(ctx, plate, zoom, alpha) {
  if (alpha <= 0) return;
  const w = REEL_W * zoom;
  const h = REEL_H * zoom;
  ctx.save();
  ctx.globalAlpha = alpha;
  // zoom towards the bag (a bit above the middle)
  ctx.drawImage(plate, (REEL_W - w) / 2, (REEL_H * 0.46) * (1 - zoom), w, h);
  ctx.restore();
}

function drawFrame(ctx, t, scenes, plates, starts, theme) {
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
  if (index > 0 && local < FADE) {
    const previous = index - 1;
    drawPlate(ctx, plates[previous], zoomFor(previous, t - starts[previous]), 1);
    drawPlate(ctx, plates[index], zoomFor(index, local), easeInOut(local / FADE));
  } else {
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

async function pickCodec() {
  if (typeof window.VideoEncoder === "undefined" || typeof window.VideoFrame === "undefined") return null;
  for (const codec of CODECS) {
    try {
      const { supported } = await window.VideoEncoder.isConfigSupported({ codec, width: REEL_W, height: REEL_H, bitrate: 8_000_000, framerate: FPS });
      if (supported) return codec;
    } catch {
      // try the next one
    }
  }
  return null;
}

async function encodeWebCodecs(codec, totalFrames, draw, canvas, onProgress) {
  const { Muxer, ArrayBufferTarget } = await import("./vendor/mp4-muxer.mjs");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: REEL_W, height: REEL_H, frameRate: FPS }, fastStart: "in-memory" });
  let failure = null;
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure({ codec, width: REEL_W, height: REEL_H, bitrate: 8_000_000, framerate: FPS, avc: { format: "avc" } });
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
    if (frameIndex % 6 === 0) {
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

async function encodeRealtime(totalSeconds, draw, canvas, onProgress) {
  if (typeof canvas.captureStream !== "function" || typeof window.MediaRecorder === "undefined") {
    throw new Error("Is phone/browser mein video banana support nahi hai. iPhone ka iOS update karke try karo.");
  }
  const type = window.MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
  const stream = canvas.captureStream(FPS);
  const recorder = new window.MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
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

/**
 * Renders the reel. Returns { blob, seconds, busy, method }.
 */
export async function renderReel({ style, bags, options, onProgress = () => {} }) {
  const bgKey = STUDIO_BACKGROUNDS[options.bg] ? options.bg : "beige";
  const theme = STUDIO_BACKGROUNDS[bgKey];
  const scenes = buildTimeline(style, bags, options);
  onProgress(0, "Bags taiyar ho rahe hain...");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const { plates, busy } = makePlates(scenes, bgKey);
  const starts = [];
  let total = 0;
  for (const scene of scenes) {
    starts.push(total);
    total += scene.duration;
  }
  const canvas = makeCanvas(REEL_W, REEL_H);
  const ctx = canvas.getContext("2d");
  const draw = (t) => drawFrame(ctx, Math.min(t, total - 0.001), scenes, plates, starts, theme);

  const codec = await pickCodec();
  let blob;
  let method;
  if (codec) {
    try {
      method = "fast";
      blob = await encodeWebCodecs(codec, Math.round(total * FPS), draw, canvas, (p) => onProgress(p, "Video ban rahi hai..."));
    } catch {
      blob = null; // phone's fast encoder refused - use the slower way below
    }
  }
  if (!blob) {
    method = "realtime";
    blob = await encodeRealtime(total, draw, canvas, (p) => onProgress(p, "Video ban rahi hai (purane iOS par thoda dheere)..."));
  }
  // free the big canvases right away (phone memory)
  plates.forEach((plate) => {
    plate.width = 1;
    plate.height = 1;
  });
  canvas.width = 1;
  canvas.height = 1;
  onProgress(1, "");
  return { blob, seconds: total, busy, method };
}

/* Still preview of the first frame (shown before making the video). */
export function drawPreview(ctx, style, bags, options) {
  const bgKey = STUDIO_BACKGROUNDS[options.bg] ? options.bg : "beige";
  const theme = STUDIO_BACKGROUNDS[bgKey];
  const scenes = buildTimeline(style, bags, options);
  const { plates } = makePlates(scenes.slice(0, 1), bgKey);
  drawFrame(ctx, scenes[0].duration * 0.9, scenes.slice(0, 1), plates, [0], theme);
  plates[0].width = 1;
  plates[0].height = 1;
}
