/*
 * REEL STYLES (2026-10-29 v3) - extra Reel Maker templates
 * ---------------------------------------------------------
 * Every template is a "plan": { total, busy, previewAt, draw(ctx, t, scale),
 * dispose() }. Items = [{ img, name, label, price, mrp }]:
 *   - many-bag reels: one item per bag
 *   - one-bag reels (options.single): one item per chosen photo of that bag
 * Bags are always the real product photos (cut out onto backdrops or shown
 * as they are). Text never claims anything about material or quality.
 */

import { drawStudio, drawStudioBackdrop, STUDIO_BACKGROUNDS } from "./studioDesign";
import {
  REEL_W, REEL_H, SERIF, SANS, easeOut, easeInOut, easeOutBack, makeCanvas, spaced, fitSize, rupees,
  inkOf, tick, rotateBgs, brandMark, roundRectPath, boldText,
} from "./reelKit";

const BAG_CY = REEL_H * 0.515; // centre of the bag inside a reel sprite

/* ------------------------------ helpers ----------------------------- */

// Bag only (transparent background), placed like the other reels.
async function makeSprites(items, OW, OH, options, onStep) {
  const byImg = new Map();
  const sprites = [];
  let busy = 0;
  for (let index = 0; index < items.length; index++) {
    const img = items[index].img;
    if (!byImg.has(img)) {
      const sprite = makeCanvas(OW, OH);
      const result = drawStudio(sprite.getContext("2d"), {
        W: OW,
        H: OH,
        img,
        d: { studioBg: options.bg || "beige", storyLayout: true, bare: true, reel: true, noBackdrop: true, noCutout: options.noCutout },
      });
      if (result && result.cutout === false && !options.noCutout) busy += 1;
      byImg.set(img, sprite);
    }
    sprites.push(byImg.get(img));
    onStep((index + 1) / items.length);
    await tick();
  }
  return { sprites, busy, all: [...byImg.values()] };
}

function backdropCanvas(OW, OH, key) {
  const canvas = makeCanvas(OW, OH);
  drawStudioBackdrop(canvas.getContext("2d"), OW, OH, key);
  return canvas;
}

// sprite drawn scaled around the bag's centre, moved to (cx, cy)
function drawSprite(ctx, sprite, { cx = REEL_W / 2, cy = BAG_CY, scale = 1, alpha = 1, rotate = 0 } = {}) {
  if (!sprite || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(cx, cy);
  if (rotate) ctx.rotate(rotate);
  ctx.scale(scale, scale);
  ctx.drawImage(sprite, -REEL_W / 2, -BAG_CY, REEL_W, REEL_H);
  ctx.restore();
}

function italic(ctx, text, y, size, color, alpha = 1, maxWidth = REEL_W * 0.86, x = REEL_W / 2, align = "center") {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  fitSize(ctx, text, "italic 500", size, SERIF, maxWidth);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function caps(ctx, text, y, color, alpha = 1, size = 30, spacing = 6) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  let current = size;
  const upper = String(text).toUpperCase();
  ctx.font = `600 ${current}px ${SANS}`;
  while (current > 14 && ctx.measureText(upper).width + upper.length * spacing > REEL_W * 0.86) {
    current -= 1;
    ctx.font = `600 ${current}px ${SANS}`;
  }
  spaced(ctx, upper, REEL_W / 2, y, spacing);
  ctx.restore();
}

function pricePill(ctx, price, y, theme, k = 1) {
  if (!(Number(price) > 0) || k <= 0) return;
  const label = rupees(price);
  ctx.save();
  ctx.font = `600 44px ${SANS}`;
  const width = ctx.measureText(label).width + 56;
  ctx.translate(REEL_W / 2, y);
  ctx.scale(k, k);
  ctx.fillStyle = inkOf(theme, 0.92);
  roundRectPath(ctx, -width / 2, -46, width, 66, 33);
  ctx.fill();
  ctx.fillStyle = theme.dark ? "#1c150d" : "#f6f1e7";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

// Single-bag reels: what to write on each photo.
export const SINGLE_LINES = ["every angle", "the details", "office se dinner tak", "your new favourite"];
function lineFor(items, index, options, hook) {
  if (index === 0) return hook;
  if (options.single) return SINGLE_LINES[(index - 1) % SINGLE_LINES.length];
  return items[index].name || "";
}

function outroLines(options, items) {
  const first = items[0] || {};
  return {
    title: options.single ? first.name || "" : "shop the edit",
    price: options.single && options.showPrice !== false ? first.price : 0,
  };
}

function drawOutro(ctx, theme, local, options, items, title = null) {
  const lines = outroLines(options, items);
  italic(ctx, title || lines.title, REEL_H * 0.44, 84, inkOf(theme), easeOut(local / 0.4));
  if (lines.price > 0) caps(ctx, rupees(lines.price), REEL_H * 0.485, inkOf(theme, 0.75), easeOut((local - 0.2) / 0.4), 34, 4);
  caps(ctx, "shop via the link in bio", REEL_H * (lines.price > 0 ? 0.53 : 0.49), inkOf(theme, 0.75), easeOut((local - 0.35) / 0.4));
  caps(ctx, "free delivery (prepaid) · cod available", REEL_H * (lines.price > 0 ? 0.56 : 0.52), inkOf(theme, 0.6), easeOut((local - 0.5) / 0.4), 24, 4);
}

const disposeAll = (list) => () => list.forEach((c) => c && ((c.width = 1), (c.height = 1)));

/* -------------------------------- SWIPE ------------------------------ */
// Bags glide in like swiping through a carousel, dots at the bottom.
export async function swipePlan(items, options, OW, OH, onStep) {
  const key = options.bg || "beige";
  const theme = STUDIO_BACKGROUNDS[key];
  const back = backdropCanvas(OW, OH, key);
  const { sprites, busy, all } = await makeSprites(items, OW, OH, options, onStep);
  const PER = 1.45;
  const MOVE = 0.42;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const hook = String(options.hook || "swipe through ➡️").trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(back, 0, 0, REEL_W, REEL_H);
    brandMark(ctx, theme);
    const end = PER * items.length;
    if (t >= end) {
      drawOutro(ctx, theme, t - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    const bob = Math.sin(local * 2.2) * 6;
    if (index > 0 && local < MOVE) {
      const p = easeInOut(local / MOVE);
      const squash = 1 - 0.07 * Math.sin(Math.PI * p);
      drawSprite(ctx, sprites[index - 1], { cx: REEL_W / 2 - REEL_W * 0.95 * p, scale: squash, rotate: -0.06 * p });
      drawSprite(ctx, sprites[index], { cx: REEL_W / 2 + REEL_W * 0.95 * (1 - p), scale: squash, rotate: 0.06 * (1 - p) });
    } else {
      drawSprite(ctx, sprites[index], { cy: BAG_CY + bob });
    }
    const textIn = easeOut((local - (index > 0 ? MOVE * 0.6 : 0.1)) / 0.35);
    italic(ctx, lineFor(items, index, options, hook), REEL_H * 0.2, index === 0 ? 86 : 64, inkOf(theme), textIn);
    if (!options.single && index > 0 && options.showPrice) caps(ctx, rupees(items[index].price), REEL_H * 0.235, inkOf(theme, 0.7), textIn, 30, 4);
    // dots
    const gap = 30;
    const start = REEL_W / 2 - ((items.length - 1) * gap) / 2;
    for (let d = 0; d < items.length; d++) {
      ctx.beginPath();
      ctx.fillStyle = inkOf(theme, d === index ? 0.9 : 0.25);
      ctx.arc(start + d * gap, REEL_H * 0.765, d === index ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { total, busy, previewAt: 1.0, draw, dispose: disposeAll([...all, back]) };
}

/* ------------------------------ SPOTLIGHT ---------------------------- */
// Dark stage, a warm spotlight opens on each bag.
export async function spotlightPlan(items, options, OW, OH, onStep) {
  const theme = STUDIO_BACKGROUNDS.noir;
  const back = backdropCanvas(OW, OH, "noir");
  const { sprites, busy, all } = await makeSprites(items, OW, OH, { ...options, bg: "noir" }, onStep);
  const INTRO = 1.2;
  const PER = 1.65;
  const OUTRO = 1.8;
  const total = INTRO + PER * items.length + OUTRO;
  const gold = (a) => `rgba(222,199,150,${a})`;
  const hook = String(options.hook || "in the spotlight").trim();

  function light(ctx, radius) {
    // everything outside the circle goes dark
    const g = ctx.createRadialGradient(REEL_W / 2, BAG_CY, Math.max(1, radius * 0.45), REEL_W / 2, BAG_CY, Math.max(2, radius));
    g.addColorStop(0, "rgba(10,8,6,0)");
    g.addColorStop(1, "rgba(10,8,6,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, REEL_W, REEL_H);
    const warm = ctx.createRadialGradient(REEL_W / 2, BAG_CY - 200, 0, REEL_W / 2, BAG_CY - 200, Math.max(2, radius));
    warm.addColorStop(0, "rgba(255,226,180,0.12)");
    warm.addColorStop(1, "rgba(255,226,180,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, REEL_W, REEL_H);
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(back, 0, 0, REEL_W, REEL_H);
    if (t < INTRO) {
      ctx.fillStyle = "rgba(10,8,6,0.75)";
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      // a thin light sweeps across the title
      const sweep = -300 + (REEL_W + 600) * easeInOut(t / INTRO);
      const g = ctx.createLinearGradient(sweep - 200, 0, sweep + 200, 0);
      g.addColorStop(0, "rgba(255,226,180,0)");
      g.addColorStop(0.5, "rgba(255,226,180,0.16)");
      g.addColorStop(1, "rgba(255,226,180,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      italic(ctx, hook, REEL_H * 0.46, 96, gold(0.95), easeOut(t / 0.5));
      brandMark(ctx, theme, easeOut(t / 0.5));
      return;
    }
    const tt = t - INTRO;
    const end = PER * items.length;
    if (tt >= end) {
      ctx.fillStyle = "rgba(10,8,6,0.75)";
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      brandMark(ctx, theme);
      drawOutro(ctx, { dark: true }, tt - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(tt / PER));
    const local = tt - index * PER;
    const open = easeOut(local / 0.45);
    const close = local > PER - 0.3 ? easeInOut((local - (PER - 0.3)) / 0.3) : 0;
    const radius = 60 + 760 * open * (1 - close);
    drawSprite(ctx, sprites[index], { scale: 1 + 0.04 * (local / PER) });
    light(ctx, radius);
    brandMark(ctx, theme);
    const textA = easeOut((local - 0.25) / 0.35) * (1 - close);
    italic(ctx, options.single ? lineFor(items, index + 1, options, hook) : items[index].name, REEL_H * 0.2, 64, gold(0.95), textA);
    if (options.showPrice && !options.single) caps(ctx, rupees(items[index].price), REEL_H * 0.235, gold(0.8), textA, 30, 4);
  }
  return { total, busy, previewAt: INTRO + 0.9, draw, dispose: disposeAll([...all, back]) };
}

/* ------------------------------ MAGAZINE ----------------------------- */
// Each bag becomes a fashion magazine cover; covers flip like pages.
export async function magazinePlan(items, options, OW, OH, onStep) {
  const keys = rotateBgs(options.bg || "blush", items.length);
  const backs = keys.map((key) => backdropCanvas(OW, OH, key));
  const { sprites, busy, all } = await makeSprites(items, OW, OH, options, onStep);
  const PER = 1.9;
  const FLIP = 0.36;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const month = new Date().toLocaleString("en-US", { month: "short" }).toUpperCase();

  function cover(ctx, index) {
    const theme = STUDIO_BACKGROUNDS[keys[index]];
    ctx.drawImage(backs[index], 0, 0, REEL_W, REEL_H);
    // masthead
    ctx.save();
    ctx.fillStyle = inkOf(theme, 0.92);
    ctx.textAlign = "center";
    fitSize(ctx, "SHRIMOH", "600", 250, SERIF, REEL_W * 0.92);
    ctx.fillText("SHRIMOH", REEL_W / 2, REEL_H * 0.29);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = inkOf(theme, 0.75);
    ctx.font = `600 26px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText(`ISSUE ${String(index + 1).padStart(2, "0")} · ${month}`, 70, REEL_H * 0.155);
    ctx.textAlign = "right";
    ctx.fillText(options.single ? "ONE BAG, EVERY LOOK" : "THE NEW EDIT", REEL_W - 70, REEL_H * 0.155);
    ctx.restore();
    // bag overlaps the masthead a little, like a real cover
    drawSprite(ctx, sprites[index], { cy: BAG_CY - REEL_H * 0.045, scale: 1.04 });
    // cover lines
    const item = items[index];
    const title = options.single ? (index === 0 ? item.name : SINGLE_LINES[(index - 1) % SINGLE_LINES.length]) : item.name;
    italic(ctx, title, REEL_H * 0.735, 58, inkOf(theme), 1, REEL_W * 0.6, 70, "left");
    if (options.showPrice !== false && Number(item.price) > 0) {
      ctx.save();
      ctx.fillStyle = inkOf(theme, 0.8);
      ctx.font = `600 32px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(rupees(item.price), 72, REEL_H * 0.765);
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = inkOf(theme, 0.7);
    ctx.font = `600 22px ${SANS}`;
    ctx.textAlign = "right";
    ctx.fillText("FREE DELIVERY (PREPAID)", REEL_W - 70, REEL_H * 0.735);
    ctx.fillText("COD AVAILABLE", REEL_W - 70, REEL_H * 0.755);
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const end = PER * items.length;
    if (t >= end) {
      const key = keys[keys.length - 1];
      const theme = STUDIO_BACKGROUNDS[key];
      ctx.drawImage(backs[backs.length - 1], 0, 0, REEL_W, REEL_H);
      brandMark(ctx, theme);
      drawOutro(ctx, theme, t - end, options, items, options.single ? null : "read it, love it, own it");
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    if (index > 0 && local < FLIP) {
      // page flip: old cover narrows away, new cover opens
      const p = local / FLIP;
      const which = p < 0.5 ? index - 1 : index;
      const sx = p < 0.5 ? 1 - easeInOut(p * 2) : easeInOut((p - 0.5) * 2);
      ctx.fillStyle = "#1c150d";
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.save();
      ctx.translate(REEL_W / 2, 0);
      ctx.scale(Math.max(0.02, sx), 1);
      ctx.translate(-REEL_W / 2, 0);
      cover(ctx, which);
      ctx.restore();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return;
    }
    // slow push-in on the cover
    const z = 1 + 0.035 * easeInOut(local / PER);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H / 2);
    ctx.scale(z, z);
    ctx.translate(-REEL_W / 2, -REEL_H / 2);
    cover(ctx, index);
    ctx.restore();
  }
  return { total, busy, previewAt: 0.8, draw, dispose: disposeAll([...all, ...backs]) };
}

/* -------------------------------- SPLIT ------------------------------ */
// Two bags side by side (this or that), halves slide in from top/bottom.
export async function splitPlan(items, options, OW, OH, onStep) {
  const list = items.length % 2 ? [...items, items[0]] : items;
  const pairs = [];
  for (let index = 0; index < list.length; index += 2) pairs.push([list[index], list[index + 1]]);
  const keys = rotateBgs(options.bg || "beige", 4);
  const backs = [backdropCanvas(OW, OH, keys[0]), backdropCanvas(OW, OH, keys[1])];
  const { sprites, busy, all } = await makeSprites(list, OW, OH, options, onStep);
  const PER = 2.1;
  const IN = 0.5;
  const OUTRO = 1.8;
  const total = PER * pairs.length + OUTRO;
  const hook = String(options.hook || "this or that?").trim();
  const themeL = STUDIO_BACKGROUNDS[keys[0]];
  const themeR = STUDIO_BACKGROUNDS[keys[1]];

  function half(ctx, side, sprite, item, offsetY, number) {
    const x = side === 0 ? 0 : REEL_W / 2;
    const theme = side === 0 ? themeL : themeR;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, REEL_W / 2, REEL_H);
    ctx.clip();
    ctx.translate(0, offsetY);
    ctx.drawImage(backs[side], 0, 0, REEL_W, REEL_H);
    drawSprite(ctx, sprite, { cx: x + REEL_W / 4, scale: 0.6 });
    ctx.fillStyle = inkOf(theme, 0.9);
    ctx.textAlign = "center";
    ctx.font = `600 120px ${SERIF}`;
    ctx.fillText(String(number), x + REEL_W / 4, REEL_H * 0.36);
    if (!options.single) italic(ctx, item.name, REEL_H * 0.68, 40, inkOf(theme), 1, REEL_W * 0.44, x + REEL_W / 4);
    if (options.showPrice && Number(item.price) > 0) {
      ctx.fillStyle = inkOf(theme, 0.7);
      ctx.font = `600 28px ${SANS}`;
      ctx.fillText(rupees(item.price), x + REEL_W / 4, REEL_H * 0.71);
    }
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const end = PER * pairs.length;
    if (t >= end) {
      ctx.drawImage(backs[0], 0, 0, REEL_W, REEL_H);
      brandMark(ctx, themeL);
      drawOutro(ctx, themeL, t - end, options, items, "comment 1 or 2 👇");
      return;
    }
    const index = Math.min(pairs.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    const enter = easeOut(local / IN);
    const leave = local > PER - 0.3 ? easeInOut((local - (PER - 0.3)) / 0.3) : 0;
    ctx.drawImage(backs[0], 0, 0, REEL_W, REEL_H);
    const [a, b] = pairs[index];
    half(ctx, 0, sprites[index * 2], a, -REEL_H * (1 - enter) + REEL_H * leave, 1);
    half(ctx, 1, sprites[index * 2 + 1], b, REEL_H * (1 - enter) - REEL_H * leave, 2);
    // thin divider + title band
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(REEL_W / 2 - 1, REEL_H * 0.3, 2, REEL_H * 0.45 * enter);
    italic(ctx, hook, REEL_H * 0.2, 80, inkOf(themeL), easeOut((t - 0.2) / 0.4));
    brandMark(ctx, themeL);
  }
  return { total, busy, previewAt: 1.0, draw, dispose: disposeAll([...all, ...backs]) };
}

/* ------------------------------ TOP LIST ----------------------------- */
// "top 5 picks": big outline numbers count down behind each bag.
export async function topListPlan(items, options, OW, OH, onStep) {
  const key = options.bg || "beige";
  const theme = STUDIO_BACKGROUNDS[key];
  const back = backdropCanvas(OW, OH, key);
  const order = [...items].reverse();
  const { sprites, busy, all } = await makeSprites(order, OW, OH, options, onStep);
  const INTRO = 1.3;
  const PER = 1.55;
  const OUTRO = 1.8;
  const total = INTRO + PER * order.length + OUTRO;
  const hook = String(options.hook || `top ${items.length} picks`).trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(back, 0, 0, REEL_W, REEL_H);
    brandMark(ctx, theme);
    if (t < INTRO) {
      const k = easeOutBack(t / 0.5);
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H * 0.45);
      ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      italic(ctx, hook, 0, 104, inkOf(theme), Math.min(1, t * 3), REEL_W * 0.86, 0);
      ctx.restore();
      caps(ctx, "this week at shrimoh", REEL_H * 0.5, inkOf(theme, 0.7), easeOut((t - 0.4) / 0.4));
      return;
    }
    const tt = t - INTRO;
    const end = PER * order.length;
    if (tt >= end) {
      drawOutro(ctx, theme, tt - end, options, items, "which is your no. 1?");
      return;
    }
    const index = Math.min(order.length - 1, Math.floor(tt / PER));
    const local = tt - index * PER;
    const number = order.length - index;
    // giant outline number
    const k = easeOut(local / 0.45);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H * 0.66);
    ctx.scale(1.25 - 0.25 * k, 1.25 - 0.25 * k);
    ctx.globalAlpha = 0.9 * k;
    ctx.strokeStyle = inkOf(theme, 0.22);
    ctx.lineWidth = 5;
    ctx.textAlign = "center";
    ctx.font = `600 900px ${SERIF}`;
    ctx.strokeText(String(number), 0, 0);
    ctx.restore();
    const up = easeOut((local - 0.1) / 0.45);
    drawSprite(ctx, sprites[index], { cy: BAG_CY + 90 * (1 - up), alpha: up });
    caps(ctx, `no. ${number}`, REEL_H * 0.165, inkOf(theme, 0.7), up, 30, 6);
    italic(ctx, order[index].name, REEL_H * 0.205, 62, inkOf(theme), up);
    if (options.showPrice) caps(ctx, rupees(order[index].price), REEL_H * 0.237, inkOf(theme, 0.7), up, 30, 4);
  }
  return { total, busy, previewAt: INTRO + 0.9, draw, dispose: disposeAll([...all, back]) };
}

/* ------------------------------ COLOR POP ---------------------------- */
// Bold colour for each bag, moving SHRIMOH text behind, circle wipes.
const POP_COLORS = ["#c96f4a", "#e3c46f", "#9fbcd6", "#97a886", "#e3aea4", "#6e4b3b"];
function isLightHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

export async function colorPopPlan(items, options, OW, OH, onStep) {
  const { sprites, busy, all } = await makeSprites(items, OW, OH, options, onStep);
  const INTRO = 0.9;
  const PER = 1.2;
  const WIPE = 0.36;
  const OUTRO = 1.7;
  const total = INTRO + PER * items.length + OUTRO;
  const hook = String(options.hook || "new drop").trim().toUpperCase();
  const colorFor = (i) => POP_COLORS[i % POP_COLORS.length];
  const inkFor = (hex, a = 1) => (isLightHex(hex) ? `rgba(28,21,13,${a})` : `rgba(255,255,255,${a})`);

  function scene(ctx, i, t) {
    // i = -1 intro, items.length = outro
    const color = i < 0 ? colorFor(0) : i >= items.length ? "#1c150d" : colorFor(i + 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, REEL_W, REEL_H);
    // moving marquee rows
    ctx.save();
    ctx.font = `600 170px ${SANS}`;
    ctx.fillStyle = inkFor(color, 0.13);
    ctx.textBaseline = "middle";
    const word = "SHRIMOH · ";
    const w = ctx.measureText(word).width;
    [0.36, 0.52, 0.68].forEach((row, r) => {
      const dir = r % 2 ? 1 : -1;
      let x = ((t * 240 * dir) % w) - w;
      while (x < REEL_W + w) {
        ctx.fillText(word, x, REEL_H * row);
        x += w;
      }
    });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = inkFor(color, 0.95);
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${Math.round(REEL_W * 0.026)}px ${SERIF}`;
    spaced(ctx, "SHRIMOH", REEL_W / 2, 270, REEL_W * 0.017);
    ctx.restore();
    if (i < 0) {
      const k = easeOutBack(t / 0.4);
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H * 0.5);
      ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      boldText(ctx, hook, 0, 50, 170, inkFor(color));
      ctx.restore();
      return;
    }
    if (i >= items.length) {
      const k = easeOutBack(t / 0.4);
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H * 0.46);
      ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      boldText(ctx, "LINK IN BIO", 0, 0, 130, inkFor(color));
      ctx.restore();
      caps(ctx, "free delivery (prepaid) · cod available", REEL_H * 0.51, inkFor(color, 0.8), easeOut((t - 0.3) / 0.4), 28, 5);
      return;
    }
    const pop = easeOutBack(t / 0.4);
    drawSprite(ctx, sprites[i], { scale: 0.92 + 0.08 * pop });
    const textIn = easeOut((t - 0.1) / 0.3);
    const label = options.single ? (i === 0 ? items[i].name : SINGLE_LINES[(i - 1) % SINGLE_LINES.length]) : items[i].name;
    ctx.save();
    ctx.globalAlpha = textIn;
    ctx.translate(-60 * (1 - textIn), 0);
    boldText(ctx, String(label || "").toUpperCase(), REEL_W / 2, REEL_H * 0.2, 62, inkFor(color));
    ctx.restore();
    if (options.showPrice && Number(items[i].price) > 0 && (!options.single || i === 0)) {
      pricePill(ctx, items[i].price, REEL_H * 0.235, { dark: !isLightHex(color) }, easeOutBack((t - 0.2) / 0.3));
    }
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    let i;
    let start;
    if (t < INTRO) {
      i = -1;
      start = 0;
    } else if (t < INTRO + PER * items.length) {
      i = Math.floor((t - INTRO) / PER);
      start = INTRO + i * PER;
    } else {
      i = items.length;
      start = INTRO + PER * items.length;
    }
    const local = t - start;
    if (i >= 0 && local < WIPE) {
      // circle wipe from the centre
      scene(ctx, i - 1, t - (i === 0 ? 0 : start - PER) || 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(REEL_W / 2, REEL_H / 2, 1200 * easeInOut(local / WIPE), 0, Math.PI * 2);
      ctx.clip();
      scene(ctx, i, local);
      ctx.restore();
    } else {
      scene(ctx, i, local);
    }
  }
  return { total, busy, previewAt: INTRO + 0.7, draw, dispose: disposeAll(all) };
}

/* ------------------------- DETAILS (one bag) ------------------------- */
// Slow zoom into different parts of the bag, photo after photo.
export async function detailsPlan(items, options, OW, OH, onStep) {
  const key = options.bg || "stone";
  const theme = STUDIO_BACKGROUNDS[key];
  const back = backdropCanvas(OW, OH, key);
  const { sprites, busy, all } = await makeSprites(items, OW, OH, options, onStep);
  const PER = 1.9;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const focus = [
    [REEL_W / 2, REEL_H * 0.5, 1.0],
    [REEL_W / 2, REEL_H * 0.38, 1.7],
    [REEL_W / 2, REEL_H * 0.6, 1.6],
    [REEL_W * 0.42, REEL_H * 0.5, 1.7],
    [REEL_W * 0.58, REEL_H * 0.45, 1.6],
  ];
  const words = [String(options.hook || "zoom in 🔍").trim(), "closer look", "the details", "the finish", "up close"];

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(back, 0, 0, REEL_W, REEL_H);
    const end = PER * items.length;
    if (t >= end) {
      brandMark(ctx, theme);
      drawOutro(ctx, theme, t - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    const [fx, fy, zmax] = focus[index % focus.length];
    const p = easeInOut(local / PER);
    const z = index === 0 ? 1 + 0.12 * p : 1 + (zmax - 1) * p;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(z, z);
    ctx.translate(-fx, -fy);
    drawSprite(ctx, sprites[index]);
    ctx.restore();
    if (local < 0.12 && index > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - local / 0.12)})`;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
    }
    brandMark(ctx, theme);
    italic(ctx, words[index % words.length], REEL_H * 0.2, index === 0 ? 88 : 66, inkOf(theme), easeOut((local - 0.1) / 0.35));
  }
  return { total, busy, previewAt: 1.2, draw, dispose: disposeAll([...all, back]) };
}

/* -------------------------- ANGLES (one bag) ------------------------- */
// Stop-motion: photos flick fast like turning the bag around, then rest.
export async function anglesPlan(items, options, OW, OH, onStep) {
  const key = options.bg || "beige";
  const theme = STUDIO_BACKGROUNDS[key];
  const back = backdropCanvas(OW, OH, key);
  const { sprites, busy, all } = await makeSprites(items, OW, OH, options, onStep);
  const FLICK = 0.3;
  const SPIN = Math.max(2.4, FLICK * items.length * 2);
  const HOLD = 1.7;
  const OUTRO = 1.7;
  const total = SPIN + HOLD + OUTRO;
  const hook = String(options.hook || "every angle 🔄").trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(back, 0, 0, REEL_W, REEL_H);
    brandMark(ctx, theme);
    if (t < SPIN) {
      const step = Math.floor(t / FLICK);
      const local = t - step * FLICK;
      const bounce = 1.04 - 0.04 * easeOut(local / 0.15);
      drawSprite(ctx, sprites[step % sprites.length], { scale: bounce });
      italic(ctx, hook, REEL_H * 0.2, 88, inkOf(theme), easeOut(t / 0.35));
      return;
    }
    if (t < SPIN + HOLD) {
      const local = t - SPIN;
      drawSprite(ctx, sprites[0], { scale: 1 + 0.05 * easeInOut(local / HOLD) });
      const a = easeOut(local / 0.35);
      italic(ctx, items[0].name, REEL_H * 0.2, 66, inkOf(theme), a);
      if (options.showPrice !== false && Number(items[0].price) > 0) pricePill(ctx, items[0].price, REEL_H * 0.237, theme, easeOutBack((local - 0.15) / 0.35));
      return;
    }
    drawOutro(ctx, theme, t - SPIN - HOLD, options, items, "which side do you like? 👀");
  }
  return { total, busy, previewAt: SPIN + 0.6, draw, dispose: disposeAll([...all, back]) };
}
