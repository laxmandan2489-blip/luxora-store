/*
 * REEL STYLES (2026-10-29 v4 - WHITE BACKGROUND) - Reel Maker templates
 * ----------------------------------------------------------------------
 * Every template is a "plan": { total, busy, previewAt, draw(ctx, t, scale),
 * dispose() }. Items = [{ img, name, label, price, mrp }]:
 *   - many-bag reels: one item per bag
 *   - one-bag reels (options.single): one item per chosen photo of that bag
 * The page is always white and the bag photo is used as it is (its own
 * white background melts into the page - reelPhoto.js). Movement,
 * transitions and text make it feel edited. Text never claims anything
 * about material or quality.
 */

import { REEL_W, REEL_H, SERIF, SANS, easeOut, easeInOut, easeOutBack, makeCanvas, spaced, fitSize, rupees, inkOf, tick, brandMark, roundRectPath } from "./reelKit";
import { WHITE, PHOTO_CY, photoSprite, drawPhotoInBox } from "./reelPhoto";

const INK = (a = 0.95) => inkOf(WHITE, a);

/* ------------------------------ helpers ----------------------------- */

export async function makeSprites(items, OW, OH, onStep = () => {}) {
  const byImg = new Map();
  const sprites = [];
  for (let index = 0; index < items.length; index++) {
    const img = items[index].img;
    if (!byImg.has(img)) byImg.set(img, photoSprite(img, OW, OH).sprite);
    sprites.push(byImg.get(img));
    onStep((index + 1) / items.length);
    await tick();
  }
  return { sprites, all: [...byImg.values()] };
}

// sprite drawn scaled around the photo's centre, moved to (cx, cy)
export function drawSprite(ctx, sprite, { cx = REEL_W / 2, cy = PHOTO_CY, scale = 1, sx = null, sy = null, alpha = 1, rotate = 0, multiply = false } = {}) {
  if (!sprite || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  if (multiply) ctx.globalCompositeOperation = "multiply";
  ctx.translate(cx, cy);
  if (rotate) ctx.rotate(rotate);
  ctx.scale(sx ?? scale, sy ?? scale);
  ctx.drawImage(sprite, -REEL_W / 2, -PHOTO_CY, REEL_W, REEL_H);
  ctx.restore();
}

export function italic(ctx, text, y, size, color = INK(), alpha = 1, maxWidth = REEL_W * 0.86, x = REEL_W / 2, align = "center") {
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

export function caps(ctx, text, y, color = INK(0.7), alpha = 1, size = 30, spacing = 6) {
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

export function pricePill(ctx, price, y, k = 1) {
  if (!(Number(price) > 0) || k <= 0) return;
  const label = rupees(price);
  ctx.save();
  ctx.font = `600 44px ${SANS}`;
  const width = ctx.measureText(label).width + 56;
  ctx.translate(REEL_W / 2, y);
  ctx.scale(k, k);
  ctx.fillStyle = INK(0.92);
  roundRectPath(ctx, -width / 2, -46, width, 66, 33);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

// Single-bag reels: what to write on each photo.
export const SINGLE_LINES = ["every angle", "the details", "office se dinner tak", "your new favourite"];
export function lineFor(items, index, options, hook) {
  if (index === 0) return hook;
  if (options.single) return SINGLE_LINES[(index - 1) % SINGLE_LINES.length];
  return items[index].name || "";
}

export function drawOutro(ctx, local, options, items, title = null) {
  const first = items[0] || {};
  const name = title || (options.single ? first.name || "" : "shop the edit");
  const price = options.single && options.showPrice !== false ? Number(first.price) || 0 : 0;
  italic(ctx, name, REEL_H * 0.44, 84, INK(), easeOut(local / 0.4));
  if (price > 0) caps(ctx, rupees(price), REEL_H * 0.485, INK(0.75), easeOut((local - 0.2) / 0.4), 34, 4);
  caps(ctx, "shop via the link in bio", REEL_H * (price > 0 ? 0.53 : 0.49), INK(0.75), easeOut((local - 0.35) / 0.4));
  caps(ctx, "free delivery (prepaid) · cod available", REEL_H * (price > 0 ? 0.56 : 0.52), INK(0.6), easeOut((local - 0.5) / 0.4), 24, 4);
}

const disposeAll = (list) => () => list.forEach((c) => c && ((c.width = 1), (c.height = 1)));
const white = (ctx) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, REEL_W, REEL_H);
};

/* -------------------------------- SWIPE ------------------------------ */
// Photos glide in like swiping through a carousel, dots underneath.
export async function swipePlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const PER = 1.45;
  const MOVE = 0.42;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const hook = String(options.hook || "swipe through ➡️").trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    const end = PER * items.length;
    if (t >= end) {
      drawOutro(ctx, t - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    if (index > 0 && local < MOVE) {
      const p = easeInOut(local / MOVE);
      const squash = 1 - 0.08 * Math.sin(Math.PI * p);
      drawSprite(ctx, sprites[index - 1], { cx: REEL_W / 2 - REEL_W * 0.95 * p, scale: squash, rotate: -0.05 * p });
      drawSprite(ctx, sprites[index], { cx: REEL_W / 2 + REEL_W * 0.95 * (1 - p), scale: squash, rotate: 0.05 * (1 - p) });
    } else {
      drawSprite(ctx, sprites[index], { cy: PHOTO_CY + Math.sin(local * 2.2) * 6 });
    }
    const textIn = easeOut((local - (index > 0 ? MOVE * 0.6 : 0.1)) / 0.35);
    italic(ctx, lineFor(items, index, options, hook), REEL_H * 0.2, index === 0 ? 86 : 64, INK(), textIn);
    if (!options.single && index > 0 && options.showPrice) caps(ctx, rupees(items[index].price), REEL_H * 0.235, INK(0.7), textIn, 30, 4);
    const gap = 30;
    const start = REEL_W / 2 - ((items.length - 1) * gap) / 2;
    for (let d = 0; d < items.length; d++) {
      ctx.beginPath();
      ctx.fillStyle = INK(d === index ? 0.9 : 0.2);
      ctx.arc(start + d * gap, REEL_H * 0.79, d === index ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { total, busy: 0, previewAt: 1.0, draw, dispose: disposeAll(all) };
}

/* ------------------------------ MAGAZINE ----------------------------- */
// Each photo is a clean white magazine cover; covers flip like pages.
export async function magazinePlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const PER = 1.9;
  const FLIP = 0.36;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const month = new Date().toLocaleString("en-US", { month: "short" }).toUpperCase();

  function cover(ctx, index) {
    white(ctx);
    ctx.save();
    ctx.fillStyle = INK(0.94);
    ctx.textAlign = "center";
    fitSize(ctx, "SHRIMOH", "600", 250, SERIF, REEL_W * 0.92);
    ctx.fillText("SHRIMOH", REEL_W / 2, REEL_H * 0.29);
    ctx.fillStyle = INK(0.7);
    ctx.font = `600 26px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText(`ISSUE ${String(index + 1).padStart(2, "0")} · ${month}`, 70, REEL_H * 0.155);
    ctx.textAlign = "right";
    ctx.fillText(options.single ? "ONE BAG, EVERY LOOK" : "THE NEW EDIT", REEL_W - 70, REEL_H * 0.155);
    ctx.restore();
    // multiply: the photo's white melts away, the bag sits over the title
    drawSprite(ctx, sprites[index], { cy: PHOTO_CY + REEL_H * 0.02, scale: 1.02, multiply: true });
    const item = items[index];
    const title = options.single ? (index === 0 ? item.name : SINGLE_LINES[(index - 1) % SINGLE_LINES.length]) : item.name;
    italic(ctx, title, REEL_H * 0.8, 56, INK(), 1, REEL_W * 0.6, 70, "left");
    if (options.showPrice !== false && Number(item.price) > 0) {
      ctx.save();
      ctx.fillStyle = INK(0.8);
      ctx.font = `600 32px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(rupees(item.price), 72, REEL_H * 0.83);
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = INK(0.65);
    ctx.font = `600 22px ${SANS}`;
    ctx.textAlign = "right";
    ctx.fillText("FREE DELIVERY (PREPAID)", REEL_W - 70, REEL_H * 0.8);
    ctx.fillText("COD AVAILABLE", REEL_W - 70, REEL_H * 0.82);
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const end = PER * items.length;
    if (t >= end) {
      white(ctx);
      brandMark(ctx, WHITE);
      drawOutro(ctx, t - end, options, items, options.single ? null : "read it, love it, own it");
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    if (index > 0 && local < FLIP) {
      const p = local / FLIP;
      const which = p < 0.5 ? index - 1 : index;
      const sx = p < 0.5 ? 1 - easeInOut(p * 2) : easeInOut((p - 0.5) * 2);
      ctx.fillStyle = "#ece9e4";
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.save();
      ctx.translate(REEL_W / 2, 0);
      ctx.scale(Math.max(0.02, sx), 1);
      ctx.translate(-REEL_W / 2, 0);
      cover(ctx, which);
      ctx.restore();
      return;
    }
    const z = 1 + 0.035 * easeInOut(local / PER);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H / 2);
    ctx.scale(z, z);
    ctx.translate(-REEL_W / 2, -REEL_H / 2);
    cover(ctx, index);
    ctx.restore();
  }
  return { total, busy: 0, previewAt: 0.8, draw, dispose: disposeAll(all) };
}

/* -------------------------------- SPLIT ------------------------------ */
// Two bags side by side (this or that), halves slide in from top/bottom.
export async function splitPlan(items, options, OW, OH, onStep) {
  const list = items.length % 2 ? [...items, items[0]] : items;
  const pairs = [];
  for (let index = 0; index < list.length; index += 2) pairs.push([list[index], list[index + 1]]);
  const { sprites, all } = await makeSprites(list, OW, OH, onStep);
  const PER = 2.1;
  const IN = 0.5;
  const OUTRO = 1.8;
  const total = PER * pairs.length + OUTRO;
  const hook = String(options.hook || "this or that?").trim();

  function half(ctx, side, sprite, item, offsetY, number) {
    const x = side === 0 ? 0 : REEL_W / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, REEL_W / 2, REEL_H);
    ctx.clip();
    ctx.translate(0, offsetY);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 0, REEL_W / 2, REEL_H);
    drawSprite(ctx, sprite, { cx: x + REEL_W / 4, scale: 0.5 });
    ctx.fillStyle = INK(0.9);
    ctx.textAlign = "center";
    ctx.font = `600 120px ${SERIF}`;
    ctx.fillText(String(number), x + REEL_W / 4, REEL_H * 0.36);
    if (!options.single) italic(ctx, item.name, REEL_H * 0.68, 40, INK(), 1, REEL_W * 0.44, x + REEL_W / 4);
    if (options.showPrice && Number(item.price) > 0) {
      ctx.fillStyle = INK(0.7);
      ctx.font = `600 28px ${SANS}`;
      ctx.fillText(rupees(item.price), x + REEL_W / 4, REEL_H * 0.71);
    }
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    const end = PER * pairs.length;
    if (t >= end) {
      brandMark(ctx, WHITE);
      drawOutro(ctx, t - end, options, items, "comment 1 or 2 👇");
      return;
    }
    const index = Math.min(pairs.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    const enter = easeOut(local / IN);
    const leave = local > PER - 0.3 ? easeInOut((local - (PER - 0.3)) / 0.3) : 0;
    const [a, b] = pairs[index];
    half(ctx, 0, sprites[index * 2], a, -REEL_H * (1 - enter) + REEL_H * leave, 1);
    half(ctx, 1, sprites[index * 2 + 1], b, REEL_H * (1 - enter) - REEL_H * leave, 2);
    ctx.fillStyle = INK(0.15);
    ctx.fillRect(REEL_W / 2 - 1, REEL_H * 0.3, 2, REEL_H * 0.42 * enter * (1 - leave));
    italic(ctx, hook, REEL_H * 0.2, 80, INK(), easeOut((t - 0.2) / 0.4));
    brandMark(ctx, WHITE);
  }
  return { total, busy: 0, previewAt: 1.0, draw, dispose: disposeAll(all) };
}

/* ------------------------------ TOP LIST ----------------------------- */
// "top 5 picks": big outline numbers count down behind each bag.
export async function topListPlan(items, options, OW, OH, onStep) {
  const order = [...items].reverse();
  const { sprites, all } = await makeSprites(order, OW, OH, onStep);
  const INTRO = 1.3;
  const PER = 1.55;
  const OUTRO = 1.8;
  const total = INTRO + PER * order.length + OUTRO;
  const hook = String(options.hook || `top ${items.length} picks`).trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    if (t < INTRO) {
      const k = easeOutBack(t / 0.5);
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H * 0.45);
      ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      italic(ctx, hook, 0, 104, INK(), Math.min(1, t * 3), REEL_W * 0.86, 0);
      ctx.restore();
      caps(ctx, "this week at shrimoh", REEL_H * 0.5, INK(0.7), easeOut((t - 0.4) / 0.4));
      return;
    }
    const tt = t - INTRO;
    const end = PER * order.length;
    if (tt >= end) {
      drawOutro(ctx, tt - end, options, items, "which is your no. 1?");
      return;
    }
    const index = Math.min(order.length - 1, Math.floor(tt / PER));
    const local = tt - index * PER;
    const number = order.length - index;
    const k = easeOut(local / 0.45);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H * 0.68);
    ctx.scale(1.25 - 0.25 * k, 1.25 - 0.25 * k);
    ctx.globalAlpha = 0.9 * k;
    ctx.strokeStyle = INK(0.14);
    ctx.lineWidth = 5;
    ctx.textAlign = "center";
    ctx.font = `600 900px ${SERIF}`;
    ctx.strokeText(String(number), 0, 0);
    ctx.restore();
    const up = easeOut((local - 0.1) / 0.45);
    drawSprite(ctx, sprites[index], { cy: PHOTO_CY + 90 * (1 - up), alpha: up, multiply: true });
    caps(ctx, `no. ${number}`, REEL_H * 0.165, INK(0.7), up, 30, 6);
    italic(ctx, order[index].name, REEL_H * 0.205, 62, INK(), up);
    if (options.showPrice) caps(ctx, rupees(order[index].price), REEL_H * 0.237, INK(0.7), up, 30, 4);
  }
  return { total, busy: 0, previewAt: INTRO + 0.9, draw, dispose: disposeAll(all) };
}

/* ------------------------------- BOUNCE ------------------------------ */
// Each bag drops in with a playful bounce and a soft shadow.
const bounceEase = (x) => {
  const t = Math.min(1, Math.max(0, x));
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t - 1.5 / d) * (t - 1.5 / d) + 0.75;
  if (t < 2.5 / d) return n * (t - 2.25 / d) * (t - 2.25 / d) + 0.9375;
  return n * (t - 2.625 / d) * (t - 2.625 / d) + 0.984375;
};

export async function bouncePlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const PER = 1.5;
  const DROP = 0.75;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const hook = String(options.hook || "just landed ✨").trim();
  const ground = REEL_H * 0.78;

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    const end = PER * items.length;
    if (t >= end) {
      drawOutro(ctx, t - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(t / PER));
    const local = t - index * PER;
    const fall = bounceEase(local / DROP);
    const leave = local > PER - 0.28 ? easeInOut((local - (PER - 0.28)) / 0.28) : 0;
    const x = local / DROP;
    const impact = x > 0.36 && x < 0.55 ? Math.sin(((x - 0.36) / 0.19) * Math.PI) : 0;
    const cy = PHOTO_CY - (1 - fall) * 1300 - leave * 1500;
    const shadowK = Math.max(0, fall * (1 - leave));
    ctx.save();
    ctx.translate(REEL_W / 2, ground);
    ctx.scale(1, 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 360);
    g.addColorStop(0, `rgba(0,0,0,${0.2 * shadowK})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 360, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawSprite(ctx, sprites[index], { cy, sx: 1 + 0.06 * impact, sy: 1 - 0.07 * impact });
    const text = lineFor(items, index, options, hook);
    const pop = easeOutBack((local - 0.35) / 0.35) * (1 - leave);
    if (pop > 0.01) {
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H * 0.2);
      ctx.scale(pop, pop);
      italic(ctx, text, 0, index === 0 ? 86 : 64, INK(), Math.min(1, pop * 1.5), REEL_W * 0.86, 0);
      ctx.restore();
    }
    if (options.showPrice && (!options.single || index === 0)) pricePill(ctx, items[index].price, REEL_H * 0.238, easeOutBack((local - 0.5) / 0.35) * (1 - leave));
  }
  return { total, busy: 0, previewAt: 1.0, draw, dispose: disposeAll(all) };
}

/* ------------------------------ FILM STRIP --------------------------- */
// A film strip of all the bags rolls by, then each frame zooms to full.
export async function filmStripPlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const k = OW / REEL_W;
  const FW = 330;
  const FH = 420;
  const thumbs = [];
  for (const item of items) {
    const c = makeCanvas(Math.round(FW * k), Math.round(FH * k));
    const x = c.getContext("2d");
    x.scale(k, k);
    x.fillStyle = "#fff";
    x.fillRect(0, 0, FW, FH);
    drawPhotoInBox(x, item.img, { x: 12, y: 12, w: FW - 24, h: FH - 24 });
    thumbs.push(c);
    await tick();
  }
  const ROLL = 2.2;
  const PER = 1.3;
  const OUTRO = 1.8;
  const total = ROLL + PER * items.length + OUTRO;
  const hook = String(options.hook || "the new edit 🎞").trim();
  const stripY = REEL_H * 0.5;

  function strip(ctx, offset, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#1c150d";
    ctx.fillRect(0, stripY - FH / 2 - 50, REEL_W, FH + 100);
    ctx.fillStyle = "#ffffff";
    for (let x = (offset % 60) - 60; x < REEL_W + 60; x += 60) {
      roundRectPath(ctx, x, stripY - FH / 2 - 38, 30, 18, 4);
      ctx.fill();
      roundRectPath(ctx, x, stripY + FH / 2 + 20, 30, 18, 4);
      ctx.fill();
    }
    const span = FW + 30;
    const count = Math.ceil(REEL_W / span) + 3;
    const first = Math.floor(-offset / span) - 1;
    for (let n = first; n < first + count; n++) {
      const x = n * span + offset;
      const thumb = thumbs[((n % thumbs.length) + thumbs.length) % thumbs.length];
      ctx.drawImage(thumb, x, stripY - FH / 2, FW, FH);
    }
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    if (t < ROLL) {
      strip(ctx, -t * 520, 1);
      italic(ctx, hook, REEL_H * 0.2, 88, INK(), easeOut(t / 0.4));
      return;
    }
    const tt = t - ROLL;
    const end = PER * items.length;
    if (tt >= end) {
      drawOutro(ctx, tt - end, options, items);
      return;
    }
    const index = Math.min(items.length - 1, Math.floor(tt / PER));
    const local = tt - index * PER;
    if (index === 0 && local < 0.45) strip(ctx, -ROLL * 520 - local * 200, 1 - easeOut(local / 0.45));
    const grow = easeOutBack(local / 0.45);
    drawSprite(ctx, sprites[index], { scale: 0.45 + 0.55 * grow, alpha: Math.min(1, local / 0.2) });
    const textIn = easeOut((local - 0.25) / 0.3);
    italic(ctx, index === 0 ? items[0].name : lineFor(items, index, options, hook), REEL_H * 0.2, 64, INK(), textIn);
    if (!options.single && options.showPrice) caps(ctx, rupees(items[index].price), REEL_H * 0.235, INK(0.7), textIn, 30, 4);
  }
  return { total, busy: 0, previewAt: 1.0, draw, dispose: disposeAll([...all, ...thumbs]) };
}

/* ------------------------- DETAILS (one bag) ------------------------- */
// Slow zoom into different parts of the bag, photo after photo.
export async function detailsPlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const PER = 1.9;
  const OUTRO = 1.8;
  const total = PER * items.length + OUTRO;
  const focus = [
    [REEL_W / 2, PHOTO_CY, 1.0],
    [REEL_W / 2, PHOTO_CY - 200, 1.7],
    [REEL_W / 2, PHOTO_CY + 180, 1.6],
    [REEL_W * 0.42, PHOTO_CY, 1.7],
    [REEL_W * 0.58, PHOTO_CY - 80, 1.6],
  ];
  const words = [String(options.hook || "zoom in 🔍").trim(), "closer look", "the details", "the finish", "up close"];

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    const end = PER * items.length;
    if (t >= end) {
      brandMark(ctx, WHITE);
      drawOutro(ctx, t - end, options, items);
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
    if (local < 0.14 && index > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - local / 0.14)})`;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
    }
    // top stays white so the words are always clear
    const band = ctx.createLinearGradient(0, REEL_H * 0.1, 0, REEL_H * 0.27);
    band.addColorStop(0, "rgba(255,255,255,1)");
    band.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, REEL_W, REEL_H * 0.27);
    brandMark(ctx, WHITE);
    italic(ctx, words[index % words.length], REEL_H * 0.2, index === 0 ? 88 : 66, INK(), easeOut((local - 0.1) / 0.35));
  }
  return { total, busy: 0, previewAt: 1.2, draw, dispose: disposeAll(all) };
}

/* -------------------------- ANGLES (one bag) ------------------------- */
// Stop-motion: photos flick fast like turning the bag around, then rest.
export async function anglesPlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const FLICK = 0.3;
  const SPIN = Math.max(2.4, FLICK * items.length * 2);
  const HOLD = 1.7;
  const OUTRO = 1.7;
  const total = SPIN + HOLD + OUTRO;
  const hook = String(options.hook || "every angle 🔄").trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    if (t < SPIN) {
      const step = Math.floor(t / FLICK);
      const local = t - step * FLICK;
      drawSprite(ctx, sprites[step % sprites.length], { scale: 1.04 - 0.04 * easeOut(local / 0.15) });
      italic(ctx, hook, REEL_H * 0.2, 88, INK(), easeOut(t / 0.35));
      return;
    }
    if (t < SPIN + HOLD) {
      const local = t - SPIN;
      drawSprite(ctx, sprites[0], { scale: 1 + 0.05 * easeInOut(local / HOLD) });
      italic(ctx, items[0].name, REEL_H * 0.2, 66, INK(), easeOut(local / 0.35));
      if (options.showPrice !== false) pricePill(ctx, items[0].price, REEL_H * 0.237, easeOutBack((local - 0.15) / 0.35));
      return;
    }
    drawOutro(ctx, t - SPIN - HOLD, options, items, "which side do you like? 👀");
  }
  return { total, busy: 0, previewAt: SPIN + 0.6, draw, dispose: disposeAll(all) };
}

/* ------------------------------ FAST CUTS ---------------------------- */
// Quick beat-style cuts: whip in from alternating sides, punch zoom,
// progress bar on top, bold words.
export async function fastCutsPlan(items, options, OW, OH, onStep) {
  const { sprites, all } = await makeSprites(items, OW, OH, onStep);
  const INTRO = 1.0;
  const CUT = 0.8;
  const OUTRO = 1.7;
  const total = INTRO + CUT * items.length + OUTRO;
  const words = String(options.hook || "new drop").trim().toUpperCase().split(/\s+/).filter(Boolean);

  function bigWord(ctx, text, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = INK();
    ctx.textAlign = "center";
    fitSize(ctx, text, "600", size, SANS, REEL_W * 0.86);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    if (t < INTRO) {
      const lineH = 150;
      const top = REEL_H * 0.47 - ((words.length - 1) * lineH) / 2;
      words.forEach((word, index) => {
        const local = (t - 0.12 - index * 0.16) / 0.3;
        if (local <= 0) return;
        const k = easeOutBack(local);
        ctx.save();
        ctx.translate(REEL_W / 2, top + index * lineH);
        ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        bigWord(ctx, word, 0, 0, 150, local * 2);
        ctx.restore();
      });
      return;
    }
    const tc = t - INTRO;
    if (tc < CUT * items.length) {
      const index = Math.min(items.length - 1, Math.floor(tc / CUT));
      const local = tc - index * CUT;
      const dir = index % 2 ? -1 : 1;
      const whip = easeOut(local / 0.22);
      const zoom = 1.14 - 0.14 * easeOut(local / 0.32);
      const cx = REEL_W / 2 + dir * 700 * (1 - whip);
      // motion trail while whipping in
      if (whip < 1) {
        for (let trail = 3; trail >= 1; trail--) {
          drawSprite(ctx, sprites[index], { cx: cx + dir * trail * 70 * (1 - whip), scale: zoom, alpha: 0.12 * (1 - whip) });
        }
      }
      drawSprite(ctx, sprites[index], { cx, scale: zoom });
      // progress segments
      const segW = (REEL_W * 0.7) / items.length;
      for (let s2 = 0; s2 < items.length; s2++) {
        const fill = s2 < index ? 1 : s2 === index ? Math.min(1, local / CUT) : 0;
        const x = REEL_W * 0.15 + s2 * segW + 4;
        ctx.fillStyle = INK(0.12);
        ctx.fillRect(x, 300, segW - 8, 5);
        ctx.fillStyle = INK(0.85);
        ctx.fillRect(x, 300, (segW - 8) * fill, 5);
      }
      const label = options.single && index > 0 ? SINGLE_LINES[(index - 1) % SINGLE_LINES.length] : items[index].name;
      const e = easeOut((local - 0.05) / 0.3);
      ctx.save();
      ctx.translate(-70 * dir * (1 - e), 0);
      bigWord(ctx, String(label || "").toUpperCase(), REEL_W / 2, REEL_H * 0.2, 60, e);
      ctx.restore();
      if (options.showPrice && (!options.single || index === 0)) pricePill(ctx, items[index].price, REEL_H * 0.235, easeOutBack((local - 0.18) / 0.3));
      return;
    }
    const to = t - INTRO - CUT * items.length;
    const a = easeOutBack(to / 0.35);
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H * 0.46);
    ctx.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a);
    bigWord(ctx, "LINK IN BIO", 0, 0, 130, Math.min(1, to * 4));
    ctx.restore();
    caps(ctx, "free delivery (prepaid) · cod available", REEL_H * 0.51, INK(0.7), easeOut((to - 0.35) / 0.4), 28, 5);
  }
  return { total, busy: 0, previewAt: INTRO + 0.6, draw, dispose: disposeAll(all) };
}

/* ------------------------------- COLLAGE ----------------------------- */
// Mood-board grid of white cards; tiles pop in, then a spotlight on each.
function collageLayout(count) {
  const left = 70;
  const right = REEL_W - 70;
  const top = 430;
  const gap = 30;
  const tileW = (right - left - gap) / 2;
  if (count <= 2) return [0, 1].slice(0, count).map((i) => ({ x: left + i * (tileW + gap), y: top + 80, w: tileW, h: 760 }));
  const h = 500;
  const boxes = [
    { x: left, y: top, w: tileW, h },
    { x: left + tileW + gap, y: top, w: tileW, h },
  ];
  if (count === 3) boxes.push({ x: (REEL_W - tileW) / 2, y: top + h + gap, w: tileW, h });
  else boxes.push({ x: left, y: top + h + gap, w: tileW, h }, { x: left + tileW + gap, y: top + h + gap, w: tileW, h });
  return boxes;
}

export async function collagePlan(items, options, OW, OH, onStep) {
  const list = items.slice(0, 4);
  const k = OW / REEL_W;
  const boxes = collageLayout(list.length);
  const tiles = [];
  for (let index = 0; index < list.length; index++) {
    const box = boxes[index];
    const tile = makeCanvas(Math.round(box.w * k), Math.round(box.h * k));
    const c = tile.getContext("2d");
    c.scale(k, k);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, box.w, box.h);
    drawPhotoInBox(c, list[index].img, { x: 16, y: 16, w: box.w - 32, h: box.h - 32 });
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
  const hook = String(options.hook || (options.single ? "one bag, 4 looks" : "which one is you?")).trim();
  const tilts = [-3, 2.5, 2, -2.5];

  function drawTile(ctx, index, boost, alpha, tiltFactor) {
    const box = boxes[index];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate(((tilts[index] || 0) * tiltFactor * Math.PI) / 180);
    ctx.scale(boost, boost);
    ctx.shadowColor = "rgba(0,0,0,0.14)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    roundRectPath(ctx, -box.w / 2, -box.h / 2, box.w, box.h, 26);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(tiles[index], -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
  }

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    const outroStart = inEnd + SPOT * list.length;
    const fadeAll = t > outroStart ? 1 - easeOut((t - outroStart) / 0.4) : 1;
    italic(ctx, hook, 390, 84, INK(), easeOut((t - 0.05) / 0.4) * fadeAll);
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
        else alpha *= 1 - 0.6 * easeOut(sl);
      }
      if (alpha > 0) drawTile(ctx, index, boost, alpha, 1 - 0.4 * pop);
    });
    if (spotIndex >= 0) {
      const sl = easeOut((t - inEnd - spotIndex * SPOT) / 0.3);
      const bag = list[spotIndex];
      const y = boxes[boxes.length - 1].y + boxes[boxes.length - 1].h + 110;
      const label = options.single ? `look ${spotIndex + 1} of ${list.length}` : bag.name || "";
      italic(ctx, label, y, 56, INK(), sl);
      if (options.showPrice && !options.single) caps(ctx, rupees(bag.price), y + 56, INK(0.7), sl, 32, 4);
    }
    if (t >= outroStart) drawOutro(ctx, t - outroStart - 0.2, options, list, options.single ? null : "comment your pick 👇");
  }
  return { total, busy: 0, previewAt: inEnd + 0.05, draw, dispose: disposeAll(tiles) };
}

/* ------------------------------- POLAROID ---------------------------- */
// Real photos drop in as polaroid prints and stack up on a white table.
export async function polaroidPlan(items, options, OW, OH, onStep) {
  const list = items.slice(0, 5);
  const k = OW / REEL_W;
  const CARD_W = 620;
  const CARD_H = 760;
  const PAD = 34;
  const PHOTO_H = 590;
  const singleCaptions = [
    list[0].name || "",
    Number(list[0].price) > 0 ? `only ${rupees(list[0].price)}` : "every angle",
    "free delivery (prepaid)",
    "cash on delivery",
    "5-day returns",
  ];
  const cards = [];
  for (let index = 0; index < list.length; index++) {
    const card = makeCanvas(Math.round(CARD_W * k), Math.round(CARD_H * k));
    const c = card.getContext("2d");
    c.scale(k, k);
    c.fillStyle = "#fdfcfa";
    c.fillRect(0, 0, CARD_W, CARD_H);
    c.fillStyle = "#ffffff";
    c.fillRect(PAD, PAD, CARD_W - PAD * 2, PHOTO_H);
    drawPhotoInBox(c, list[index].img, { x: PAD, y: PAD, w: CARD_W - PAD * 2, h: PHOTO_H });
    c.strokeStyle = "rgba(0,0,0,0.06)";
    c.strokeRect(PAD, PAD, CARD_W - PAD * 2, PHOTO_H);
    const caption = options.single ? singleCaptions[index % singleCaptions.length] : list[index].label || list[index].name || "";
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
  const hook = String(options.hook || (options.single ? "one bag, every look" : "my bag edit ✨")).trim();

  function draw(ctx, t, scale) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    white(ctx);
    brandMark(ctx, WHITE);
    const outroStart = dropsEnd + HOLD;
    const dim = t > outroStart ? easeOut((t - outroStart) / 0.5) : 0;
    italic(ctx, hook, 400, 84, INK(), easeOut((t - 0.05) / 0.4) * (1 - dim));
    list.forEach((_, index) => {
      const local = (t - START - index * DROP) / 0.65;
      if (local <= 0) return;
      const e = easeOutBack(local);
      const [sx, sy] = shifts[index % shifts.length];
      const angle = ((angles[index % angles.length] + (1 - e) * 14) * Math.PI) / 180;
      ctx.save();
      ctx.translate(REEL_W / 2 + sx, 1040 + sy - (1 - e) * 1100);
      ctx.rotate(angle);
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 16;
      ctx.drawImage(cards[index], -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
      ctx.restore();
    });
    if (dim > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.88 * dim})`;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      brandMark(ctx, WHITE);
      drawOutro(ctx, t - outroStart - 0.2, options, list, options.single ? null : "which one would you carry?");
    }
  }
  return { total, busy: 0, previewAt: dropsEnd + 0.3, draw, dispose: disposeAll(cards) };
}
