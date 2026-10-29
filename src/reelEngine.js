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
 *
 * (2026-10-29 v2) FASTER: "⚡ Tez" quality renders at 720x1280 (2.25x fewer
 * pixels - Instagram shows reels at about this size anyway), bag cut-outs
 * are prepared while you pick bags (prepareCutouts), and all drawing uses
 * 1080x1920 coordinates scaled to the output size.
 */

import { drawStudio, drawStudioBackdrop, cutoutBag, STUDIO_BACKGROUNDS } from "./studioDesign";

export const REEL_W = 1080;
export const REEL_H = 1920;
const FPS = 30;
export const QUALITIES = {
  fast: { label: "⚡ Tez (HD 720p)", w: 720, h: 1280, bitrate: 5_000_000 },
  full: { label: "💎 Full HD 1080p (thoda dheere)", w: 1080, h: 1920, bitrate: 8_000_000 },
};
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
async function makePlates(scenes, bgKey, OW = REEL_W, OH = REEL_H, onStep = () => {}, noCutout = false) {
  const plates = [];
  let busy = 0;
  // one plate per different photo (the same photo is reused, not redrawn)
  const byImage = new Map();
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const key = scene.img || "__backdrop";
    if (byImage.has(key)) {
      plates.push(byImage.get(key));
      continue;
    }
    const plate = makeCanvas(OW, OH);
    const ctx = plate.getContext("2d");
    if (scene.img) {
      const result = drawStudio(ctx, { W: OW, H: OH, img: scene.img, d: { studioBg: bgKey, storyLayout: true, bare: true, reel: true, noCutout } });
      if (result && result.cutout === false && !noCutout) busy += 1;
    } else {
      drawStudioBackdrop(ctx, OW, OH, bgKey);
    }
    byImage.set(key, plate);
    plates.push(plate);
    onStep((index + 1) / scenes.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { plates, busy };
}

/** Cut the bags out ahead of time (while the person is still picking). */
export async function prepareCutouts(images) {
  for (const img of images) {
    if (!img) continue;
    cutoutBag(img);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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

function drawFrame(ctx, t, scenes, plates, starts, theme, scale = 1) {
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

const BG_ORDER = ["beige", "sage", "blush", "stone", "mocha", "noir"];
const easeOutBack = (t) => {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const inkOf = (theme, a = 0.95) => (theme.dark ? `rgba(245,239,228,${a})` : `rgba(28,21,13,${a})`);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function rotateBgs(first, count) {
  const start = Math.max(0, BG_ORDER.indexOf(first));
  return Array.from({ length: count }, (_, index) => BG_ORDER[(start + index) % BG_ORDER.length]);
}

function brandMark(ctx, theme, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = inkOf(theme);
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${Math.round(REEL_W * 0.026)}px ${SERIF}`;
  spaced(ctx, "SHRIMOH", REEL_W / 2, 270, REEL_W * 0.017);
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function boldText(ctx, text, x, y, size, color, maxWidth = REEL_W * 0.86) {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitSize(ctx, text, "600", size, SANS, maxWidth);
  ctx.fillText(text, x, y);
}

/* ---- classic (New in / Kaunsa colour / Guess the price) as a plan ---- */
async function classicPlan(style, bags, options, OW, OH, onStep) {
  const bgKey = STUDIO_BACKGROUNDS[options.bg] ? options.bg : "beige";
  const theme = STUDIO_BACKGROUNDS[bgKey];
  const scenes = buildTimeline(style, bags, options);
  const { plates, busy } = await makePlates(scenes, bgKey, OW, OH, onStep, options.noCutout);
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
    draw: (ctx, t, scale) => drawFrame(ctx, Math.min(t, total - 0.001), scenes, plates, starts, theme, scale),
    dispose: () => new Set(plates).forEach((plate) => ((plate.width = 1), (plate.height = 1))),
  };
}

/* ---- ⚡ FAST CUTS: quick beat-style cuts, punch zoom, colour changes ---- */
async function fastCutsPlan(bags, options, OW, OH, onStep) {
  const bgs = rotateBgs(options.bg || "beige", bags.length + 1);
  const plates = [];
  let busy = 0;
  for (let index = 0; index < bags.length; index++) {
    const plate = makeCanvas(OW, OH);
    const result = drawStudio(plate.getContext("2d"), {
      W: OW,
      H: OH,
      img: bags[index].img,
      d: { studioBg: bgs[index], storyLayout: true, bare: true, reel: true, noCutout: options.noCutout },
    });
    if (result && result.cutout === false && !options.noCutout) busy += 1;
    plates.push(plate);
    onStep((index + 1) / (bags.length + 1));
    await tick();
  }
  const introTheme = STUDIO_BACKGROUNDS[bgs[0]];
  const intro = makeCanvas(OW, OH);
  drawStudioBackdrop(intro.getContext("2d"), OW, OH, bgs[0]);
  const outroTheme = STUDIO_BACKGROUNDS.noir;
  const outro = makeCanvas(OW, OH);
  drawStudioBackdrop(outro.getContext("2d"), OW, OH, "noir");

  const INTRO = 1.0;
  const CUT = 0.8;
  const OUTRO = 1.7;
  const total = INTRO + CUT * bags.length + OUTRO;
  const hook = String(options.hook || "new drop").trim().toUpperCase();
  const words = hook.split(/\s+/).filter(Boolean);

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (t < INTRO) {
      ctx.drawImage(intro, 0, 0, REEL_W, REEL_H);
      brandMark(ctx, introTheme);
      // words pop in one after another
      const lineH = 150;
      const top = REEL_H * 0.47 - ((words.length - 1) * lineH) / 2;
      words.forEach((word, index) => {
        const local = (t - 0.12 - index * 0.16) / 0.3;
        if (local <= 0) return;
        const k = easeOutBack(local);
        ctx.save();
        ctx.globalAlpha = Math.min(1, local * 2);
        ctx.translate(REEL_W / 2, top + index * lineH);
        ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        boldText(ctx, word, 0, 0, 150, inkOf(introTheme));
        ctx.restore();
      });
      return;
    }
    const tc = t - INTRO;
    if (tc < CUT * bags.length) {
      const index = Math.min(bags.length - 1, Math.floor(tc / CUT));
      const local = tc - index * CUT;
      const theme = STUDIO_BACKGROUNDS[bgs[index]];
      // punch-in zoom: starts big, settles fast
      const zoom = 1.16 - 0.16 * easeOut(local / 0.32);
      const w = REEL_W * zoom;
      const h = REEL_H * zoom;
      ctx.drawImage(plates[index], (REEL_W - w) / 2, REEL_H * 0.46 * (1 - zoom), w, h);
      // white flash on the cut
      if (local < 0.12) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - local / 0.12)})`;
        ctx.fillRect(0, 0, REEL_W, REEL_H);
      }
      brandMark(ctx, theme);
      // progress segments
      const segW = (REEL_W * 0.7) / bags.length;
      for (let s2 = 0; s2 < bags.length; s2++) {
        const fill = s2 < index ? 1 : s2 === index ? Math.min(1, local / CUT) : 0;
        const x = REEL_W * 0.15 + s2 * segW + 4;
        ctx.fillStyle = inkOf(theme, 0.18);
        ctx.fillRect(x, 300, segW - 8, 5);
        ctx.fillStyle = inkOf(theme, 0.85);
        ctx.fillRect(x, 300, (segW - 8) * fill, 5);
      }
      // name slides in from the left, price pill pops
      const e = easeOut((local - 0.05) / 0.3);
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(-70 * (1 - e), 0);
      boldText(ctx, String(bags[index].name || "").toUpperCase(), REEL_W / 2, REEL_H * 0.2, 60, inkOf(theme));
      ctx.restore();
      const price = Number(bags[index].price) || 0;
      if (options.showPrice && price > 0) {
        const p2 = easeOutBack((local - 0.18) / 0.3);
        if (p2 > 0) {
          const label = rupees(price);
          ctx.save();
          ctx.font = `600 44px ${SANS}`;
          const pw = ctx.measureText(label).width + 56;
          ctx.translate(REEL_W / 2, REEL_H * 0.235);
          ctx.scale(p2, p2);
          ctx.fillStyle = inkOf(theme, 0.92);
          roundRectPath(ctx, -pw / 2, -46, pw, 66, 33);
          ctx.fill();
          ctx.fillStyle = theme.dark ? "#1c150d" : "#f6f1e7";
          ctx.textAlign = "center";
          ctx.fillText(label, 0, 2);
          ctx.restore();
        }
      }
      return;
    }
    const to = t - INTRO - CUT * bags.length;
    ctx.drawImage(outro, 0, 0, REEL_W, REEL_H);
    if (to < 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - to / 0.12)})`;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
    }
    brandMark(ctx, outroTheme);
    const a = easeOutBack(to / 0.35);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H * 0.46);
    ctx.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a);
    ctx.globalAlpha = Math.min(1, to * 4);
    boldText(ctx, "LINK IN BIO", 0, 0, 130, inkOf(outroTheme));
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = easeOut((to - 0.35) / 0.4);
    ctx.fillStyle = inkOf(outroTheme, 0.75);
    ctx.font = `600 30px ${SANS}`;
    spaced(ctx, "FREE DELIVERY (PREPAID)  ·  COD AVAILABLE", REEL_W / 2, REEL_H * 0.51, 5);
    ctx.restore();
  }

  return {
    total,
    busy,
    previewAt: INTRO + 0.6,
    draw,
    dispose: () => [...plates, intro, outro].forEach((c) => ((c.width = 1), (c.height = 1))),
  };
}

/* ---- 🖼 COLLAGE: mood-board grid, tiles pop in, then a spotlight on each ---- */
function collageLayout(count) {
  const left = 70;
  const right = REEL_W - 70;
  const top = 430;
  const gap = 30;
  const tileW = (right - left - gap) / 2;
  if (count <= 2) {
    const h = 760;
    return [0, 1].slice(0, count).map((i) => ({ x: left + i * (tileW + gap), y: top + 80, w: tileW, h }));
  }
  const h = 500;
  const boxes = [
    { x: left, y: top, w: tileW, h },
    { x: left + tileW + gap, y: top, w: tileW, h },
  ];
  if (count === 3) boxes.push({ x: (REEL_W - tileW) / 2, y: top + h + gap, w: tileW, h });
  else boxes.push({ x: left, y: top + h + gap, w: tileW, h }, { x: left + tileW + gap, y: top + h + gap, w: tileW, h });
  return boxes;
}

async function collagePlan(bags, options, OW, OH, onStep) {
  const list = bags.slice(0, 4);
  const k = OW / REEL_W;
  const boxes = collageLayout(list.length);
  const tileBgs = rotateBgs(options.bg || "beige", list.length + 1).slice(1);
  const pageKey = options.bg || "beige";
  const page = makeCanvas(OW, OH);
  drawStudioBackdrop(page.getContext("2d"), OW, OH, pageKey);
  const theme = STUDIO_BACKGROUNDS[pageKey] || STUDIO_BACKGROUNDS.beige;
  const tiles = [];
  let busy = 0;
  for (let index = 0; index < list.length; index++) {
    const box = boxes[index];
    const tile = makeCanvas(Math.round(box.w * k), Math.round(box.h * k));
    const result = drawStudio(tile.getContext("2d"), {
      W: tile.width,
      H: tile.height,
      img: list[index].img,
      d: { studioBg: tileBgs[index], bare: true, noCutout: options.noCutout },
    });
    if (result && result.cutout === false && !options.noCutout) busy += 1;
    tiles.push(tile);
    onStep((index + 1) / list.length);
    await tick();
  }
  const POP = 0.3;
  const IN_START = 0.35;
  const inEnd = IN_START + POP * list.length + 0.45;
  const SPOT = 0.9;
  const OUTRO = 1.7;
  const total = inEnd + SPOT * list.length + OUTRO;
  const hook = String(options.hook || "which one is you?").trim();
  const tilts = [-3, 2.5, 2, -2.5];

  function drawTile(ctx, index, scaleBoost, alpha, tiltFactor) {
    const box = boxes[index];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate(((tilts[index] || 0) * tiltFactor * Math.PI) / 180);
    ctx.scale(scaleBoost, scaleBoost);
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    roundRectPath(ctx, -box.w / 2, -box.h / 2, box.w, box.h, 28);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.drawImage(tiles[index], -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(page, 0, 0, REEL_W, REEL_H);
    brandMark(ctx, theme);
    const outroStart = inEnd + SPOT * list.length;
    const fadeAll = t > outroStart ? 1 - easeOut((t - outroStart) / 0.4) : 1;
    // title
    ctx.save();
    ctx.globalAlpha = easeOut((t - 0.05) / 0.4) * fadeAll;
    ctx.fillStyle = inkOf(theme);
    ctx.textAlign = "center";
    fitSize(ctx, hook, "italic 500", 84, SERIF, REEL_W * 0.86);
    ctx.fillText(hook, REEL_W / 2, 390);
    ctx.restore();

    const spotIndex = t >= inEnd && t < outroStart ? Math.floor((t - inEnd) / SPOT) : -1;
    list.forEach((_, index) => {
      const local = (t - IN_START - index * POP) / 0.45;
      if (local <= 0) return;
      const pop = easeOutBack(local);
      let boost = 0.8 + 0.2 * pop;
      let alpha = Math.min(1, local * 1.6) * fadeAll;
      if (spotIndex >= 0) {
        const sl = (t - inEnd - spotIndex * SPOT) / 0.25;
        if (index === spotIndex) boost *= 1 + 0.05 * easeOut(sl);
        else alpha *= 1 - 0.55 * easeOut(sl);
      }
      if (alpha > 0) drawTile(ctx, index, boost, alpha, 1 - 0.4 * pop);
    });
    // spotlight label
    if (spotIndex >= 0) {
      const sl = easeOut((t - inEnd - spotIndex * SPOT) / 0.3);
      const bag = list[spotIndex];
      const y = boxes[boxes.length - 1].y + boxes[boxes.length - 1].h + 110;
      ctx.save();
      ctx.globalAlpha = sl;
      ctx.translate(0, 20 * (1 - sl));
      ctx.fillStyle = inkOf(theme);
      ctx.textAlign = "center";
      fitSize(ctx, bag.name || "", "italic 500", 56, SERIF, REEL_W * 0.86);
      ctx.fillText(bag.name || "", REEL_W / 2, y);
      if (options.showPrice && Number(bag.price) > 0) {
        ctx.fillStyle = inkOf(theme, 0.7);
        ctx.font = `600 32px ${SANS}`;
        spaced(ctx, rupees(bag.price), REEL_W / 2, y + 56, 4);
      }
      ctx.restore();
    }
    if (t >= outroStart) {
      const to = t - outroStart;
      ctx.save();
      ctx.globalAlpha = easeOut((to - 0.2) / 0.45);
      ctx.fillStyle = inkOf(theme);
      ctx.textAlign = "center";
      fitSize(ctx, "comment your pick 👇", "italic 500", 88, SERIF, REEL_W * 0.86);
      ctx.fillText("comment your pick 👇", REEL_W / 2, REEL_H * 0.45);
      ctx.fillStyle = inkOf(theme, 0.7);
      ctx.font = `600 30px ${SANS}`;
      spaced(ctx, "SHOP VIA THE LINK IN BIO", REEL_W / 2, REEL_H * 0.5, 6);
      ctx.restore();
    }
  }

  return {
    total,
    busy,
    previewAt: inEnd + 0.05,
    draw,
    dispose: () => [...tiles, page].forEach((c) => ((c.width = 1), (c.height = 1))),
  };
}

/* ---- 📸 POLAROID: real photos drop in as polaroid prints and stack ---- */
async function polaroidPlan(bags, options, OW, OH, onStep) {
  const list = bags.slice(0, 5);
  const k = OW / REEL_W;
  const pageKey = options.bg || "beige";
  const theme = STUDIO_BACKGROUNDS[pageKey] || STUDIO_BACKGROUNDS.beige;
  const page = makeCanvas(OW, OH);
  drawStudioBackdrop(page.getContext("2d"), OW, OH, pageKey);
  const CARD_W = 620;
  const CARD_H = 760;
  const PAD = 34;
  const PHOTO_H = 590;
  const cards = [];
  for (let index = 0; index < list.length; index++) {
    // the card is drawn once: white paper, the real photo, a caption
    const card = makeCanvas(Math.round(CARD_W * k), Math.round(CARD_H * k));
    const c = card.getContext("2d");
    c.scale(k, k);
    c.fillStyle = "#fbfaf6";
    c.fillRect(0, 0, CARD_W, CARD_H);
    const img = list[index].img;
    const boxW = CARD_W - PAD * 2;
    const fit = Math.min(boxW / img.width, PHOTO_H / img.height);
    const dw = img.width * fit;
    const dh = img.height * fit;
    c.fillStyle = "#ffffff";
    c.fillRect(PAD, PAD, boxW, PHOTO_H);
    c.drawImage(img, PAD + (boxW - dw) / 2, PAD + (PHOTO_H - dh) / 2, dw, dh);
    c.strokeStyle = "rgba(0,0,0,0.06)";
    c.strokeRect(PAD, PAD, boxW, PHOTO_H);
    const caption = list[index].label || list[index].name || "";
    c.fillStyle = "rgba(28,21,13,0.85)";
    c.textAlign = "center";
    fitSize(c, caption, "italic 500", 44, SERIF, CARD_W - PAD * 2);
    c.fillText(caption, CARD_W / 2, PAD + PHOTO_H + 82);
    cards.push(card);
    onStep((index + 1) / list.length);
    await tick();
  }
  const DROP = 1.0;
  const START = 0.5;
  const HOLD = 1.1;
  const OUTRO = 1.8;
  const dropsEnd = START + DROP * list.length;
  const total = dropsEnd + HOLD + OUTRO;
  const angles = [-6, 5, -3, 7, -4];
  const shifts = [
    [-30, 10],
    [35, -20],
    [-10, 25],
    [25, 5],
    [0, -10],
  ];
  const hook = String(options.hook || "my bag edit ✨").trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(page, 0, 0, REEL_W, REEL_H);
    brandMark(ctx, theme);
    const outroStart = dropsEnd + HOLD;
    const dim = t > outroStart ? easeOut((t - outroStart) / 0.5) : 0;
    ctx.save();
    ctx.globalAlpha = easeOut((t - 0.05) / 0.4) * (1 - dim);
    ctx.fillStyle = inkOf(theme);
    ctx.textAlign = "center";
    fitSize(ctx, hook, "italic 500", 84, SERIF, REEL_W * 0.86);
    ctx.fillText(hook, REEL_W / 2, 400);
    ctx.restore();
    list.forEach((_, index) => {
      const local = (t - START - index * DROP) / 0.65;
      if (local <= 0) return;
      const e = easeOutBack(local);
      const [sx, sy] = shifts[index % shifts.length];
      const cx = REEL_W / 2 + sx;
      const cy = 1040 + sy - (1 - e) * 1100;
      const angle = ((angles[index % angles.length] + (1 - e) * 14) * Math.PI) / 180;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 18;
      ctx.drawImage(cards[index], -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
      ctx.restore();
    });
    if (dim > 0) {
      ctx.fillStyle = `rgba(${theme.dark ? "28,24,21" : "246,241,231"},${0.82 * dim})`;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.save();
      ctx.globalAlpha = easeOut((t - outroStart - 0.2) / 0.45);
      ctx.fillStyle = inkOf(theme);
      ctx.textAlign = "center";
      fitSize(ctx, "which one would you carry?", "italic 500", 80, SERIF, REEL_W * 0.86);
      ctx.fillText("which one would you carry?", REEL_W / 2, REEL_H * 0.45);
      ctx.fillStyle = inkOf(theme, 0.7);
      ctx.font = `600 30px ${SANS}`;
      spaced(ctx, "SHOP VIA THE LINK IN BIO", REEL_W / 2, REEL_H * 0.5, 6);
      ctx.restore();
      brandMark(ctx, theme);
    }
  }

  return {
    total,
    busy: 0,
    previewAt: dropsEnd + 0.3,
    draw,
    dispose: () => [...cards, page].forEach((c) => ((c.width = 1), (c.height = 1))),
  };
}

async function createPlan(style, bags, options, OW, OH, onStep = () => {}) {
  if (style === "fastcuts") return fastCutsPlan(bags, options, OW, OH, onStep);
  if (style === "collage") return collagePlan(bags, options, OW, OH, onStep);
  if (style === "polaroid") return polaroidPlan(bags, options, OW, OH, onStep);
  return classicPlan(style, bags, options, OW, OH, onStep);
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

export const STYLE_NAMES = ["newin", "colours", "guess", "fastcuts", "collage", "polaroid"];
