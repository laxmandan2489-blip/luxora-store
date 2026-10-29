/*
 * REEL PHOTO (2026-10-29 v4) - "white background" reels
 * -------------------------------------------------------
 * The bag photo is used AS IT IS (no background removal, so no leftover
 * white bits). Its own plain white / light-grey background is lifted to
 * pure white so it melts into the white reel page, and the edges are
 * softened. A photo with a busy background (room, model) is shown as a
 * neat card with a soft shadow instead.
 */

import { REEL_W, REEL_H, makeCanvas } from "./reelKit";

export const WHITE = { dark: false };
export const PHOTO_BOX = { x: 70, y: REEL_H * 0.265, w: REEL_W - 140, h: REEL_H * 0.5 };
export const PHOTO_CY = PHOTO_BOX.y + PHOTO_BOX.h / 2;

const info = new WeakMap();

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

/** { plain, bg: [r,g,b], light: canvas } - cached per photo */
export function preparePhoto(img) {
  if (info.has(img)) return info.get(img);
  let result;
  try {
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const W = Math.max(8, Math.round(img.width * scale));
    const H = Math.max(8, Math.round(img.height * scale));
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const pixels = ctx.getImageData(0, 0, W, H);
    const d = pixels.data;
    const rs = [];
    const gs = [];
    const bs = [];
    let rough = 0;
    let steps = 0;
    let prev = null;
    const visit = (x, y) => {
      const i = (y * W + x) * 4;
      rs.push(d[i]);
      gs.push(d[i + 1]);
      bs.push(d[i + 2]);
      if (prev !== null) {
        steps++;
        if (Math.abs(d[i] - d[prev]) + Math.abs(d[i + 1] - d[prev + 1]) + Math.abs(d[i + 2] - d[prev + 2]) > 24) rough++;
      }
      prev = i;
    };
    for (let x = 0; x < W; x++) visit(x, 0);
    for (let y = 0; y < H; y++) visit(W - 1, y);
    for (let x = W - 1; x >= 0; x--) visit(x, H - 1);
    for (let y = H - 1; y >= 0; y--) visit(0, y);
    const bg = [median(rs), median(gs), median(bs)];
    const lum = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114;
    const plain = rough / Math.max(1, steps) < 0.1 && lum > 205;
    if (plain) {
      // lift the photo's own background to pure white (tiny brightening)
      const k = bg.map((v) => 255 / Math.max(180, v));
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] * k[0];
        let g = d[i + 1] * k[1];
        let b = d[i + 2] * k[2];
        if (r > 247 && g > 247 && b > 247) {
          r = 255;
          g = 255;
          b = 255;
        }
        d[i] = r > 255 ? 255 : r;
        d[i + 1] = g > 255 ? 255 : g;
        d[i + 2] = b > 255 ? 255 : b;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    result = { plain, bg, light: canvas };
  } catch {
    result = { plain: false, bg: [255, 255, 255], light: img };
  }
  info.set(img, result);
  return result;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the photo into a box (1080x1920 coordinates) on ctx.
 * box: { x, y, w, h }. Plain photos melt into white; busy ones become a card.
 */
export function drawPhotoInBox(ctx, img, box = PHOTO_BOX, { cover = false } = {}) {
  const { plain, light } = preparePhoto(img);
  const fit = cover ? Math.max(box.w / img.width, box.h / img.height) : Math.min(box.w / img.width, box.h / img.height);
  const dw = img.width * fit;
  const dh = img.height * fit;
  const dx = box.x + (box.w - dw) / 2;
  const dy = box.y + (box.h - dh) / 2;
  ctx.save();
  if (cover) {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
  }
  if (plain || cover) {
    ctx.drawImage(light, dx, dy, dw, dh);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.16)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    roundRect(ctx, dx, dy, dw, dh, 26);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.drawImage(light, dx, dy, dw, dh);
  }
  ctx.restore();
  return { plain, dx, dy, dw, dh };
}

/** Full-frame transparent canvas with the photo placed in the reel box. */
export function photoSprite(img, OW, OH, box = PHOTO_BOX) {
  const sprite = makeCanvas(OW, OH);
  const ctx = sprite.getContext("2d");
  const k = OW / REEL_W;
  ctx.scale(k, k);
  const placed = drawPhotoInBox(ctx, img, box);
  if (placed.plain) {
    // soften the photo's edges so it never shows as a box
    const f = Math.min(placed.dw, placed.dh) * 0.06;
    ctx.globalCompositeOperation = "destination-out";
    const edges = [
      [placed.dx, 0, placed.dx + f, 0, placed.dx, placed.dy, f, placed.dh],
      [placed.dx + placed.dw, 0, placed.dx + placed.dw - f, 0, placed.dx + placed.dw - f, placed.dy, f, placed.dh],
      [0, placed.dy, 0, placed.dy + f, placed.dx, placed.dy, placed.dw, f],
      [0, placed.dy + placed.dh, 0, placed.dy + placed.dh - f, placed.dx, placed.dy + placed.dh - f, placed.dw, f],
    ];
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  return { sprite, plain: placed.plain };
}

export function whitePage(OW, OH) {
  const page = makeCanvas(OW, OH);
  const ctx = page.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OW, OH);
  return page;
}
