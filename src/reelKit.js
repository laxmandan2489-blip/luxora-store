/*
 * REEL KIT (2026-10-29) - small shared helpers for the Reel Maker
 * (reelEngine.js + reelStyles.js). All drawing uses 1080x1920 coordinates.
 */

export const REEL_W = 1080;
export const REEL_H = 1920;

export const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
export const SANS = '"AdUrbanist", "Helvetica Neue", Arial, sans-serif';

export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function spaced(ctx, text, x, y, spacing) {
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

export function fitSize(ctx, text, style, size, family, maxWidth) {
  let current = size;
  ctx.font = `${style} ${current}px ${family}`;
  while (current > 14 && ctx.measureText(String(text)).width > maxWidth) {
    current -= 2;
    ctx.font = `${style} ${current}px ${family}`;
  }
  return current;
}

export const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;


export const BG_ORDER = ["beige", "sage", "blush", "stone", "mocha", "noir"];
export const easeOutBack = (t) => {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const inkOf = (theme, a = 0.95) => (theme.dark ? `rgba(245,239,228,${a})` : `rgba(28,21,13,${a})`);
export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export function rotateBgs(first, count) {
  const start = Math.max(0, BG_ORDER.indexOf(first));
  return Array.from({ length: count }, (_, index) => BG_ORDER[(start + index) % BG_ORDER.length]);
}

export function brandMark(ctx, theme, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = inkOf(theme);
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${Math.round(REEL_W * 0.026)}px ${SERIF}`;
  spaced(ctx, "SHRIMOH", REEL_W / 2, 270, REEL_W * 0.017);
  ctx.restore();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function boldText(ctx, text, x, y, size, color, maxWidth = REEL_W * 0.86) {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitSize(ctx, text, "600", size, SANS, maxWidth);
  ctx.fillText(text, x, y);
}

