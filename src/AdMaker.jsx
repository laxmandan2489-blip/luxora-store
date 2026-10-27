import { useEffect, useMemo, useRef, useState } from "react";
import urbanist500 from "./assets/urbanist-latin-500-normal.woff2";
import urbanist600 from "./assets/urbanist-latin-600-normal.woff2";
import CaptionMaker from "./CaptionMaker";

/*
 * ADMIN > AD MAKER (2026-10-21)
 * Turns a real product photo into a ready-to-post ad image (Meta feed,
 * portrait or story size). The photo itself is NEVER edited - it is
 * only placed on the design, and text (logo, price, offer, slogan,
 * delivery line) is drawn around/over it. Everything is drawn in the
 * browser on a <canvas>, so nothing new is needed on the server: the
 * photo comes through the existing /api/admin/photo-original route.
 */

const SIZES = {
  square: { label: "Feed 1:1", w: 1080, h: 1080 },
  portrait: { label: "Feed 4:5", w: 1080, h: 1350 },
  story: { label: "Story / Reel 9:16", w: 1080, h: 1920 },
};

const TEMPLATES = {
  below: "Clean · text below",
  above: "Clean · text above",
  only: "No text · only bag",
  editorial: "On photo",
  classic: "Ivory",
  noir: "Noir",
  sale: "Festive Sale",
  minimal: "Photo first",
};

const SLOGANS = [
  "Carry elegance every day",
  "Made to be noticed",
  "Your everyday luxury",
  "Crafted for the modern woman",
  "Style that goes everywhere",
  "The bag you'll reach for daily",
  "Festive ready, always",
  "This Diwali, gift her elegance",
  "Elegance, now within reach",
];

export const INK = "#1c150d";
export const GOLD = "#b1a181";
export const DEEP_GOLD = "#8a7650";
export const IVORY = "#fbf7ee";
const MAROON = "#5e1a24";
export const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
export const SANS = '"AdUrbanist", "Helvetica Neue", Arial, sans-serif';

let fontsPromise = null;
export function loadFonts() {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    try {
      if (!document.getElementById("ad-maker-fonts")) {
        const link = document.createElement("link");
        link.id = "ad-maker-fonts";
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap";
        document.head.appendChild(link);
      }
      const faces = [
        new FontFace("AdUrbanist", `url(${urbanist500}) format("woff2")`, { weight: "500" }),
        new FontFace("AdUrbanist", `url(${urbanist600}) format("woff2")`, { weight: "600" }),
      ];
      for (const face of faces) {
        await face.load();
        document.fonts.add(face);
      }
      await Promise.race([
        Promise.all([
          document.fonts.load(`600 60px "Cormorant Garamond"`),
          document.fonts.load(`italic 500 60px "Cormorant Garamond"`),
        ]),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {
      // Fallback fonts (Georgia / Arial) are used - the ad still works.
    }
  })();
  return fontsPromise;
}

export function rupees(value) {
  const number = Number(value || 0);
  return `₹${number.toLocaleString("en-IN")}`;
}

// Letter-spaced text (canvas letterSpacing isn't on every iPhone yet).
export function spacedText(ctx, text, x, y, spacing, align = "center") {
  const chars = String(text).split("");
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, chars.length - 1);
  let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const saved = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + spacing;
  });
  ctx.textAlign = saved;
  return total;
}

// Sets ctx.font, shrinking the size until the text fits maxWidth.
export function fitFont(ctx, text, style, size, family, maxWidth) {
  let current = size;
  ctx.font = `${style} ${current}px ${family}`;
  while (current > 12 && ctx.measureText(String(text)).width > maxWidth) {
    current -= 1;
    ctx.font = `${style} ${current}px ${family}`;
  }
  return current;
}

export function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trim()}…`;
  }
  return lines;
}

// Colour of the photo's own background (top-left corner), so a
// "fit" photo blends into its panel instead of sitting in a box.
export function photoBackground(img) {
  try {
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    const pctx = probe.getContext("2d");
    pctx.drawImage(img, 0, 0, 8, 8);
    const corners = [pctx.getImageData(0, 0, 1, 1).data, pctx.getImageData(7, 0, 1, 1).data];
    const r = Math.round((corners[0][0] + corners[1][0]) / 2);
    const g = Math.round((corners[0][1] + corners[1][1]) / 2);
    const b = Math.round((corners[0][2] + corners[1][2]) / 2);
    return `rgb(${r},${g},${b})`;
  } catch {
    return "#ffffff";
  }
}

function drawPhoto(ctx, img, x, y, w, h, fit) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = photoBackground(img);
  ctx.fillRect(x, y, w, h);
  const scale = fit === "fill" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
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

// Price row: big price, struck-through MRP. Returns its width.
export function drawPrice(ctx, options) {
  ctx.save();
  const width = drawPriceInner(ctx, options);
  ctx.restore();
  return width;
}

function drawPriceInner(ctx, { price, mrp, x, y, size, color, mutedColor, align = "center" }) {
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${size}px ${SANS}`;
  const priceText = rupees(price);
  const priceWidth = ctx.measureText(priceText).width;
  const showMrp = Number(mrp) > Number(price);
  ctx.font = `500 ${Math.round(size * 0.48)}px ${SANS}`;
  const mrpText = showMrp ? rupees(mrp) : "";
  const mrpWidth = showMrp ? ctx.measureText(mrpText).width : 0;
  const gap = showMrp ? size * 0.35 : 0;
  const total = priceWidth + gap + mrpWidth;
  let start = align === "center" ? x - total / 2 : align === "right" ? x - total : x;

  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.fillText(priceText, start, y);
  if (showMrp) {
    start += priceWidth + gap;
    ctx.fillStyle = mutedColor;
    ctx.font = `500 ${Math.round(size * 0.48)}px ${SANS}`;
    ctx.fillText(mrpText, start, y);
    ctx.strokeStyle = mutedColor;
    ctx.lineWidth = Math.max(2, size * 0.03);
    ctx.beginPath();
    const strikeY = y - size * 0.16;
    ctx.moveTo(start - 2, strikeY);
    ctx.lineTo(start + mrpWidth + 2, strikeY);
    ctx.stroke();
  }
  return total;
}

/* ---------------------------------------------------------------------
   CLEAN TEMPLATES (2026-10-25)
   "Big brand" look: no badges, boxes or labels - just the bag, a small
   SHRIMOH wordmark, the bag name, price (MRP lightly crossed out) and one
   tiny line. Background = the photo's own background colour, so the
   photo blends in instead of sitting in a box.
--------------------------------------------------------------------- */
const CLEAN_LINE = "FREE DELIVERY  ·  COD AVAILABLE";
// Background choices for the clean "text below / above" designs.
const CLEAN_BACKGROUNDS = {
  auto: { label: "Photo colour", color: "" },
  white: { label: "White", color: "rgb(255,255,255)" },
  cream: { label: "Cream", color: "rgb(246,243,238)" },
  beige: { label: "Beige", color: "rgb(233,223,208)" },
  black: { label: "Black", color: "rgb(28,21,13)" },
};

export function parseRgb(color) {
  const match = String(color).match(/(\d+)\D+(\d+)\D+(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [255, 255, 255];
}

export function isLight(color) {
  const [r, g, b] = parseRgb(color);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// Draws the photo and softly fades its edges into the background colour,
// so a photo with a slightly different / uneven background never looks
// like a box pasted on the design.
export function drawPhotoSoft(ctx, img, x, y, w, h, fit, bg) {
  const scale = fit === "fill" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  const [r, g, b] = parseRgb(bg);
  const solid = `rgba(${r},${g},${b},1)`;
  const clear = `rgba(${r},${g},${b},0)`;
  const left = Math.max(x, dx);
  const top = Math.max(y, dy);
  const right = Math.min(x + w, dx + dw);
  const bottom = Math.min(y + h, dy + dh);
  const fade = Math.min(right - left, bottom - top) * 0.09;
  const edges = [
    [left, top, left + fade, top, left, top, fade, bottom - top],
    [right, top, right - fade, top, right - fade, top, fade, bottom - top],
    [left, top, left, top + fade, left, top, right - left, fade],
    [left, bottom, left, bottom - fade, left, bottom - fade, right - left, fade],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, solid);
    gradient.addColorStop(1, clear);
    ctx.fillStyle = gradient;
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.restore();
}

// Auto background: photo melts into the design. Chosen colour
// (white / cream / beige / black): the photo sits as a neat, sharp
// framed picture on that colour - looks intentional, never blurry.
function placeCleanPhoto(ctx, img, x, y, w, h, fit, bg, framed) {
  if (!framed) {
    drawPhotoSoft(ctx, img, x - w * 0.04, y, w * 1.08, h, fit, bg);
    return;
  }
  const scale = Math.min(w / img.width, h / img.height);
  const dw = fit === "fill" ? w : img.width * scale;
  const dh = fit === "fill" ? h : img.height * scale;
  drawPhoto(ctx, img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, fit);
}

function cleanTextBlock(ctx, { W, d, x, y, align, ink, muted, nameSize, maxWidth }) {
  // Bag name (serif, up to 2 lines)
  ctx.textAlign = align;
  ctx.fillStyle = ink;
  ctx.font = `500 ${nameSize}px ${SERIF}`;
  const lines = wrapLines(ctx, d.name, maxWidth, 2);
  let cursor = y;
  for (const line of lines) {
    ctx.fillText(line, x, cursor);
    cursor += nameSize * 1.12;
  }
  // Price + light MRP
  const priceSize = Math.round(W * 0.036);
  cursor += priceSize * 0.25;
  if (Number(d.price) > 0) {
    drawPrice(ctx, { price: d.price, mrp: d.mrp, x, y: cursor, size: priceSize, color: ink, mutedColor: muted, align });
  }
  return cursor;
}

function drawWordmark(ctx, W, x, y, color, align = "center") {
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(W * 0.03)}px ${SERIF}`;
  spacedText(ctx, "SHRIMOH", x, y, W * 0.016, align);
}

function drawTinyLine(ctx, W, x, y, color, align = "center") {
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(W * 0.017)}px ${SANS}`;
  spacedText(ctx, CLEAN_LINE, x, y, W * 0.005, align);
}

function drawClean(ctx, { W, H, img, template, fit }, d) {
  const isStory = H / W > 1.6;
  const isSquare = H / W < 1.1;
  const m = Math.round(W * 0.07);
  ctx.textBaseline = "alphabetic";

  if (template === "editorial") {
    // Photo fills everything; soft shade at the bottom for white text.
    drawPhoto(ctx, img, 0, 0, W, H, "fill");
    const topShade = ctx.createLinearGradient(0, 0, 0, H * 0.16);
    topShade.addColorStop(0, "rgba(0,0,0,0.28)");
    topShade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, W, H * 0.16);
    const shadeTop = H * (isStory ? 0.62 : 0.55);
    const shade = ctx.createLinearGradient(0, shadeTop, 0, H);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, shadeTop, W, H - shadeTop);

    drawWordmark(ctx, W, W / 2, (isStory ? H * 0.07 : m) + W * 0.03, "#ffffff");
    const bottom = H - (isStory ? H * 0.1 : m);
    const nameSize = Math.round(W * (isSquare ? 0.05 : 0.058));
    ctx.font = `500 ${nameSize}px ${SERIF}`;
    const lineCount = wrapLines(ctx, d.name, W - m * 2, 2).length;
    const blockTop = bottom - W * 0.075 - W * 0.055 - (lineCount - 1) * nameSize * 1.12;
    cleanTextBlock(ctx, { W, d, x: m, y: blockTop, align: "left", ink: "#ffffff", muted: "rgba(255,255,255,0.72)", nameSize, maxWidth: W - m * 2 });
    drawTinyLine(ctx, W, m, bottom, "rgba(255,255,255,0.85)", "left");
    return;
  }

  // text below / text above: background = photo's own colour
  const preset = CLEAN_BACKGROUNDS[d.bg] && CLEAN_BACKGROUNDS[d.bg].color;
  const bg = preset || photoBackground(img);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // (2026-10-26) "No text · only bag": same background, just the bag - for
  // slides 2, 3, 4 of a carousel (price stays on slide 1 only).
  if (template === "only") {
    const pad = isStory ? H * 0.1 : m;
    placeCleanPhoto(ctx, img, m, pad, W - m * 2, H - pad * 2, fit, bg, Boolean(preset));
    return;
  }
  const light = isLight(bg);
  const ink = light ? INK : "#ffffff";
  const muted = light ? "rgba(28,21,13,0.45)" : "rgba(255,255,255,0.6)";
  const soft = light ? DEEP_GOLD : "rgba(255,255,255,0.8)";

  const top = isStory ? H * 0.07 : m;
  const bottom = H - (isStory ? H * 0.07 : m * 0.85);
  const nameSize = Math.round(W * (isSquare ? 0.045 : 0.05));
  ctx.font = `500 ${nameSize}px ${SERIF}`;
  const lineCount = wrapLines(ctx, d.name, W - m * 2, 2).length;
  const textHeight = nameSize * 1.12 * lineCount + W * 0.06;

  drawWordmark(ctx, W, W / 2, top + W * 0.025, ink);

  if (template === "above") {
    const textTop = top + W * 0.025 + W * (isStory ? 0.13 : 0.1);
    cleanTextBlock(ctx, { W, d, x: W / 2, y: textTop, align: "center", ink, muted, nameSize, maxWidth: W - m * 2 });
    const photoTop = textTop + textHeight;
    const photoBottom = bottom - W * 0.05;
    placeCleanPhoto(ctx, img, m, photoTop, W - m * 2, photoBottom - photoTop, fit, bg, Boolean(preset));
    drawTinyLine(ctx, W, W / 2, bottom, soft);
    return;
  }

  // "below"
  const photoTop = top + W * 0.06;
  const textTop = bottom - W * 0.06 - textHeight + nameSize * 0.6;
  const photoBottom = textTop - nameSize * 1.5;
  placeCleanPhoto(ctx, img, m, photoTop, W - m * 2, photoBottom - photoTop, fit, bg, Boolean(preset));
  cleanTextBlock(ctx, { W, d, x: W / 2, y: textTop, align: "center", ink, muted, nameSize, maxWidth: W - m * 2 });
  drawTinyLine(ctx, W, W / 2, bottom, soft);
}

function drawAd(ctx, { W, H, img, template, fit, d }) {
  if (template === "below" || template === "above" || template === "editorial" || template === "only") {
    drawClean(ctx, { W, H, img, template, fit }, d);
    return;
  }
  const off = Number(d.mrp) > Number(d.price) ? Math.round(((d.mrp - d.price) / d.mrp) * 100) : 0;
  const showOff = d.showBadge && off >= 5;
  const isStory = H / W > 1.6;
  const m = Math.round(W * 0.06);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  if (template === "classic") {
    ctx.fillStyle = IVORY;
    ctx.fillRect(0, 0, W, H);
    const top = isStory ? H * 0.1 : m * 1.25;
    ctx.fillStyle = INK;
    ctx.font = `600 ${Math.round(W * 0.04)}px ${SANS}`;
    spacedText(ctx, "SHRIMOH", W / 2, top, W * 0.022);

    const textBlock = isStory ? H * 0.3 : W * 0.31;
    const photoY = top + W * 0.035;
    const photoH = H - photoY - textBlock;
    drawPhoto(ctx, img, m, photoY, W - m * 2, photoH, fit);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(m + 14, photoY + 14, W - m * 2 - 28, photoH - 28);

    if (showOff) {
      const r = W * 0.08;
      const cx = W - m - r * 0.9;
      const cy = photoY + r * 0.9;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = IVORY;
      ctx.font = `600 ${Math.round(r * 0.62)}px ${SANS}`;
      ctx.fillText(`${off}%`, cx, cy + r * 0.12);
      ctx.font = `500 ${Math.round(r * 0.3)}px ${SANS}`;
      spacedText(ctx, "OFF", cx, cy + r * 0.48, r * 0.06);
    }

    let y = photoY + photoH + W * 0.065;
    ctx.fillStyle = DEEP_GOLD;
    fitFont(ctx, d.slogan, "italic 500", Math.round(W * 0.042), SERIF, W - m * 2);
    ctx.fillText(d.slogan, W / 2, y);
    y += W * 0.062;
    ctx.fillStyle = INK;
    ctx.font = `600 ${Math.round(W * 0.046)}px ${SERIF}`;
    ctx.fillText(wrapLines(ctx, d.name, W - m * 2, 1)[0] || "", W / 2, y);
    y += W * 0.085;
    drawPrice(ctx, { price: d.price, mrp: d.mrp, x: W / 2, y, size: Math.round(W * 0.066), color: INK, mutedColor: "#9a8b70" });
    const footY = isStory ? H - H * 0.14 : H - m * 0.75;
    ctx.fillStyle = "#6f6250";
    fitFont(ctx, d.footer, "500", Math.round(W * 0.025), SANS, W - m * 2);
    ctx.fillText(d.footer, W / 2, footY);
    return;
  }

  if (template === "noir") {
    const panelH = isStory ? H * 0.34 : W * 0.4;
    drawPhoto(ctx, img, 0, 0, W, H - panelH, fit);
    ctx.fillStyle = INK;
    ctx.fillRect(0, H - panelH, W, panelH);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, H - panelH, W, 4);

    // small logo plate on the photo
    ctx.font = `600 ${Math.round(W * 0.03)}px ${SANS}`;
    const plateW = W * 0.3;
    const plateY = isStory ? H * 0.08 : m;
    ctx.fillStyle = "rgba(28,21,13,0.85)";
    roundRect(ctx, m, plateY, plateW, W * 0.07, W * 0.035);
    ctx.fill();
    ctx.fillStyle = IVORY;
    spacedText(ctx, "SHRIMOH", m + plateW / 2, plateY + W * 0.046, W * 0.014);

    const footY = isStory ? H - H * 0.12 : H - m * 0.8;
    const priceY = footY - W * 0.085;
    const nameY = priceY - W * 0.1;
    ctx.textAlign = "left";
    ctx.fillStyle = GOLD;
    const sloganLines = (() => {
      ctx.font = `italic 500 ${Math.round(W * 0.058)}px ${SERIF}`;
      return wrapLines(ctx, d.slogan, W - m * 2, isStory ? 2 : 1);
    })();
    let sy = nameY - W * 0.075 - (sloganLines.length - 1) * W * 0.064;
    for (const line of sloganLines) {
      ctx.fillText(line, m, sy);
      sy += W * 0.064;
    }
    ctx.fillStyle = "#d9cfb9";
    ctx.font = `500 ${Math.round(W * 0.03)}px ${SANS}`;
    ctx.fillText(wrapLines(ctx, d.name, W - m * 2, 1)[0] || "", m, nameY);
    drawPrice(ctx, { price: d.price, mrp: d.mrp, x: m, y: priceY, size: Math.round(W * 0.066), color: IVORY, mutedColor: "#9a8b70", align: "left" });
    if (showOff) {
      ctx.font = `600 ${Math.round(W * 0.032)}px ${SANS}`;
      const label = `${off}% OFF`;
      const bw = ctx.measureText(label).width + W * 0.06;
      const bh = W * 0.065;
      ctx.fillStyle = GOLD;
      roundRect(ctx, W - m - bw, priceY - bh * 0.78, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.fillText(label, W - m - bw / 2, priceY - bh * 0.78 + bh * 0.66);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#a89a7f";
    fitFont(ctx, d.footer, "500", Math.round(W * 0.025), SANS, W - m * 2);
    ctx.fillText(d.footer, m, footY);
    return;
  }

  if (template === "sale") {
    ctx.fillStyle = MAROON;
    ctx.fillRect(0, 0, W, H);
    const top = isStory ? H * 0.09 : m;
    ctx.fillStyle = "#f3e6c8";
    ctx.font = `600 ${Math.round(W * 0.034)}px ${SANS}`;
    spacedText(ctx, "SHRIMOH", W / 2, top + W * 0.02, W * 0.018);
    const photoY = top + W * 0.055;
    const bottomBlock = isStory ? H * 0.36 : W * 0.36;
    const photoH = H - photoY - bottomBlock;
    const inset = m * 0.8;
    drawPhoto(ctx, img, inset, photoY, W - inset * 2, photoH, fit);

    if (showOff) {
      const r = W * 0.105;
      const cx = W - inset - r * 1.05;
      const cy = photoY + photoH - r * 0.75;
      ctx.fillStyle = "#d8b56a";
      ctx.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const angle = (Math.PI * 2 * i) / 24;
        const radius = i % 2 === 0 ? r : r * 0.88;
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = MAROON;
      ctx.font = `600 ${Math.round(r * 0.56)}px ${SANS}`;
      ctx.fillText(`${off}%`, cx, cy + r * 0.1);
      ctx.font = `600 ${Math.round(r * 0.26)}px ${SANS}`;
      spacedText(ctx, "OFF", cx, cy + r * 0.44, r * 0.05);
    }

    let y = photoY + photoH + W * 0.095;
    ctx.fillStyle = "#f3e6c8";
    ctx.font = `600 ${Math.round(W * 0.066)}px ${SERIF}`;
    const lines = wrapLines(ctx, d.slogan, W - m * 2, isStory ? 2 : 1);
    if (lines.length === 1) fitFont(ctx, lines[0], "600", Math.round(W * 0.066), SERIF, W - m * 2);
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += W * 0.072;
    }
    y += W * 0.025;
    drawPrice(ctx, { price: d.price, mrp: d.mrp, x: W / 2, y, size: Math.round(W * 0.07), color: "#ffffff", mutedColor: "#d3a9ae" });
    y += W * 0.045;
    const pillText = d.footer;
    fitFont(ctx, pillText, "600", Math.round(W * 0.026), SANS, W - m * 3);
    const pw = Math.min(W - m * 2, ctx.measureText(pillText).width + W * 0.08);
    const ph = W * 0.058;
    ctx.fillStyle = "#d8b56a";
    roundRect(ctx, W / 2 - pw / 2, y, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = MAROON;
    ctx.fillText(pillText, W / 2, y + ph * 0.66);
    return;
  }

  // minimal: the photo is the whole ad
  drawPhoto(ctx, img, 0, 0, W, H, fit);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
  const top = isStory ? H * 0.08 : m * 1.1;
  ctx.font = `600 ${Math.round(W * 0.03)}px ${SANS}`;
  const plateW = W * 0.29;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(m, top, plateW, W * 0.066);
  ctx.fillStyle = INK;
  spacedText(ctx, "SHRIMOH", m + plateW / 2, top + W * 0.044, W * 0.013);

  const cardW = W - m * 2;
  const cardH = W * 0.22;
  const cardY = isStory ? H - H * 0.17 - cardH : H - m - cardH;
  ctx.fillStyle = "rgba(251,247,238,0.95)";
  ctx.fillRect(m, cardY, cardW, cardH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(m, cardY, 6, cardH);
  const left = m + W * 0.05;
  const inner = cardW - W * 0.09;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  fitFont(ctx, d.slogan, "italic 500", Math.round(W * 0.048), SERIF, inner);
  ctx.fillText(d.slogan, left, cardY + W * 0.075);
  const priceWidth = drawPrice(ctx, { price: d.price, mrp: d.mrp, x: left, y: cardY + W * 0.155, size: Math.round(W * 0.058), color: INK, mutedColor: "#9a8b70", align: "left" });
  if (showOff) {
    ctx.font = `600 ${Math.round(W * 0.028)}px ${SANS}`;
    const label = `${off}% OFF`;
    const bw = ctx.measureText(label).width + W * 0.05;
    const bh = W * 0.055;
    const bx = left + priceWidth + W * 0.03;
    ctx.fillStyle = INK;
    roundRect(ctx, bx, cardY + W * 0.155 - bh * 0.78, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = IVORY;
    ctx.textAlign = "center";
    ctx.fillText(label, bx + bw / 2, cardY + W * 0.155 - bh * 0.78 + bh * 0.68);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = DEEP_GOLD;
  fitFont(ctx, d.footer, "600", Math.round(W * 0.024), SANS, inner);
  ctx.fillText(d.footer, left, cardY + W * 0.198);
}

// (2026-10-26) Every colour variant of a bag, each with its own photos and
// name (from Products > colours / colour names / colour photos), so a
// variant like "Ira Noir" can get its own ad. Bags without colours get
// one group with all their photos.
export function absoluteUrl(API, value) {
  const raw = value && typeof value === "object" ? value.url || value.src || "" : value;
  const source = String(raw || "").trim();
  if (!source) return "";
  if (/^(https?:|data:)/i.test(source)) return source;
  return `${API}${source.startsWith("/") ? "" : "/"}${source}`;
}

export function productVariants(API, product) {
  if (!product) return [];
  const toList = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  const colorImages = product.colorImages && typeof product.colorImages === "object" ? product.colorImages : {};
  const colorNames = product.colorNames && typeof product.colorNames === "object" ? product.colorNames : {};
  const colors = Array.from(new Set([...(Array.isArray(product.colors) ? product.colors : []), ...Object.keys(colorImages)])).filter(Boolean);
  const general = [product.image, ...toList(product.images)].map((url) => absoluteUrl(API, url)).filter(Boolean);
  const variants = [];
  // (2026-10-26) Photos saved on the bag but not under any colour (e.g. the
  // AI lifestyle / model shots) are shown under EVERY colour, after that
  // colour's own photos - before, they were hidden for bags with colours.
  const colourUrls = new Set();
  for (const color of colors) toList(colorImages[color]).forEach((url) => colourUrls.add(absoluteUrl(API, url)));
  const shared = Array.from(new Set(general)).filter((url) => !colourUrls.has(url));
  for (const color of colors) {
    const own = toList(colorImages[color]).map((url) => absoluteUrl(API, url)).filter(Boolean);
    const urls = Array.from(new Set([...own, ...(own.length ? shared : general)]));
    const custom = String(colorNames[color] || "").trim();
    variants.push({ key: color, label: custom || color, name: custom || product.name || "", urls });
  }
  if (!variants.length) variants.push({ key: "__main", label: "Main", name: product.name || "", urls: Array.from(new Set(general)) });
  return variants;
}

export default function AdMaker({ API, adminFetch, products }) {
  const canvasRef = useRef(null);
  const [productId, setProductId] = useState("");
  const [variantKey, setVariantKey] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [search, setSearch] = useState("");
  const [img, setImg] = useState(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState("below");
  const [size, setSize] = useState("portrait");
  const [fit, setFit] = useState("fit");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [slogan, setSlogan] = useState(SLOGANS[0]);
  const [footer, setFooter] = useState("Free delivery across India  •  shrimoh.vercel.app");
  const [showBadge, setShowBadge] = useState(true);
  const [cleanBg, setCleanBg] = useState("auto");
  const [fontsReady, setFontsReady] = useState(false);
  // (2026-10-22) Every photo load gets a number; only the LATEST one is
  // allowed to show. Fixes "picked another bag but the old photo stays"
  // when an earlier, slower photo load finished after a newer one.
  const loadSeq = useRef(0);
  // Photos already opened once are kept here, so going back to a bag is instant.
  const photoCache = useRef(new Map());

  const list = useMemo(() => {
    const active = (Array.isArray(products) ? products : []).filter((product) => product && product.active !== false && (product.image || (Array.isArray(product.images) && product.images.length)));
    const query = search.trim().toLowerCase();
    return (query ? active.filter((product) => String(product.name || "").toLowerCase().includes(query)) : active).slice(0, 200);
  }, [products, search]);

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true));
  }, []);

  // Newest bag is picked automatically.
  useEffect(() => {
    if (!productId && list.length) chooseProduct(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  async function loadImageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return image;
  }

  const currentProduct = (Array.isArray(products) ? products : []).find((item) => item.id === productId) || null;
  const variants = useMemo(() => productVariants(API, currentProduct), [API, currentProduct]);
  const currentVariant = variants.find((item) => item.key === variantKey) || variants[0] || null;

  function chooseProduct(product) {
    setProductId(product.id);
    setPrice(String(product.price || ""));
    setMrp(product.oldPrice ? String(product.oldPrice) : "");
    const first = productVariants(API, product)[0];
    chooseVariant(product, first);
  }

  function chooseVariant(product, variant) {
    setVariantKey(variant ? variant.key : "");
    setName((variant && variant.name) || product.name || "");
    const url = (variant && variant.urls[0]) || absoluteUrl(API, product.image);
    loadPhoto(product, url);
  }

  async function loadPhoto(product, sourceUrl) {
    const seq = ++loadSeq.current;
    setPhotoUrl(sourceUrl);
    setNotice("");
    const cacheKey = String(product.id) + "|" + String(sourceUrl || "");
    const cached = photoCache.current.get(cacheKey);
    if (cached) {
      setLoadingPhoto(false);
      setImg(cached);
      return;
    }
    setImg(null); // clear the old bag right away
    setLoadingPhoto(true);
    try {
      const source = String(sourceUrl || "");
      let blob;
      if (source.startsWith("data:")) {
        blob = await (await fetch(source)).blob();
      } else {
        const absolute = absoluteUrl(API, source);
        try {
          // FAST: straight from the photo's own storage link (CDN).
          const direct = await fetch(absolute, { mode: "cors" });
          if (!direct.ok) throw new Error("direct failed");
          blob = await direct.blob();
          if (!blob.type.startsWith("image/")) throw new Error("not an image");
        } catch {
          // Slower fallback: through our own server.
          const response = await adminFetch(`${API}/api/admin/photo-original?url=${encodeURIComponent(absolute)}`);
          if (!response.ok) throw new Error("Photo could not be loaded.");
          blob = await response.blob();
        }
      }
      const image = await loadImageFromBlob(blob);
      photoCache.current.set(cacheKey, image);
      if (seq !== loadSeq.current) return; // a newer bag was picked meanwhile
      setImg(image);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setImg(null);
      setNotice(`❌ ${error.message || "Photo could not be loaded."} Try again or upload the photo.`);
    } finally {
      if (seq === loadSeq.current) setLoadingPhoto(false);
    }
  }

  async function uploadOwnPhoto(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const seq = ++loadSeq.current;
    try {
      const image = await loadImageFromBlob(file);
      if (seq !== loadSeq.current) return;
      setPhotoUrl("");
      setLoadingPhoto(false);
      setImg(image);
      setNotice("✅ Your photo is in. Type the name and price below.");
    } catch {
      setNotice("❌ This photo could not be opened.");
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!img) {
      // No photo (loading / failed): blank the canvas so the previous
      // bag's ad never stays on screen.
      const blank = canvas.getContext("2d");
      blank.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const { w, h } = SIZES[size];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    drawAd(ctx, {
      W: w,
      H: h,
      img,
      template,
      fit,
      d: { name, price: Number(price) || 0, mrp: Number(mrp) || 0, slogan, footer, showBadge, bg: cleanBg },
    });
  }, [img, template, size, fit, name, price, mrp, slogan, footer, showBadge, cleanBg, fontsReady]);

  async function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) {
      setNotice("❌ Could not create the image.");
      return;
    }
    const safeName = (name || "shrimoh-ad").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
    const file = new File([blob], `${safeName}-${size}.jpg`, { type: "image/jpeg" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNotice("✅ Choose “Save Image” to put it in Photos.");
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("✅ Image downloaded.");
  }

  const isCleanTemplate = template === "below" || template === "above" || template === "editorial" || template === "only";

  const choice = (current, value, setter, label) => (
    <button
      type="button"
      key={value}
      className={current === value ? "am-chip on" : "am-chip"}
      onClick={() => setter(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="panel">
      <style>{`
        .am-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
        .am-layout > * { min-width: 0; }
        /* (2026-10-26) Phone fix: one column that never gets wider than the
           screen (the canvas is 1080px inside, so plain "1fr" pushed the page
           sideways), and the preview is NOT sticky on phones - when it was,
           the tall preview stayed on top and hid the bags, designs and form. */
        @media (max-width: 860px) { .am-layout { grid-template-columns: minmax(0, 1fr); } }
        @media (min-width: 861px) { .am-preview { position: sticky; top: 12px; } }
        .am-canvas { width: 100%; height: auto; display: block; border-radius: 10px; border: 1px solid #ddd; background: #f4f4f4; }
        .am-empty { padding: 60px 20px; text-align: center; color: #777; border: 1px dashed #ccc; border-radius: 10px; }
        .am-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
        .am-chip { padding: 9px 14px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: #111; }
        .am-chip.on { background: #1c150d; color: #fff; border-color: #1c150d; }
        .am-bags { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin: 8px 0 16px; }
        .am-bag { flex: 0 0 84px; border: 2px solid transparent; border-radius: 9px; padding: 0; background: none; cursor: pointer; }
        .am-bag.on { border-color: #1c150d; }
        .am-bag img { width: 80px; height: 80px; object-fit: cover; border-radius: 7px; display: block; }
        .am-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .am-notice { padding: 12px 14px; background: #f6f3ea; border-radius: 9px; font-size: 14px; margin-bottom: 14px; }
      `}</style>

      <div className="panel-header">
        <h2 className="panel-title">Ad Maker</h2>
      </div>

      {notice ? <div className="am-notice">{notice}</div> : null}

      <div className="am-layout">
        <div className="am-preview">
          {img ? (
            <canvas ref={canvasRef} className="am-canvas" />
          ) : (
            <div className="am-empty">{loadingPhoto ? "Loading photo..." : "Pick a bag to start"}</div>
          )}
          <div className="am-row">
            <button type="button" className="save-product-button" onClick={saveImage} disabled={!img}>
              ⬇ Save image
            </button>
          </div>
          <CaptionMaker
            product={currentProduct}
            name={name}
            price={price}
            mrp={mrp}
          />
        </div>

        <div>
          <label className="form-label">Bag</label>
          <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bags..." />
          <div className="am-bags">
            {list.map((product) => (
              <button
                type="button"
                key={product.id}
                className={product.id === productId ? "am-bag on" : "am-bag"}
                onClick={() => chooseProduct(product)}
                title={product.name}
              >
                <img src={absoluteUrl(API, product.image || (Array.isArray(product.images) ? product.images[0] : ""))} alt={product.name} loading="lazy" />
              </button>
            ))}
          </div>
          {currentProduct && variants.length > 1 ? (
            <>
              <label className="form-label">Colour / variant ({variants.length})</label>
              <div className="am-row">
                {variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.key}
                    className={currentVariant && currentVariant.key === variant.key ? "am-chip on" : "am-chip"}
                    onClick={() => chooseVariant(currentProduct, variant)}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {currentProduct && currentVariant && currentVariant.urls.length > 1 ? (
            <>
              <label className="form-label">Which photo ({currentVariant.urls.length})</label>
              <div className="am-bags">
                {currentVariant.urls.map((url) => (
                  <button
                    type="button"
                    key={url}
                    className={url === photoUrl ? "am-bag on" : "am-bag"}
                    onClick={() => loadPhoto(currentProduct, url)}
                  >
                    <img src={url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div style={{ marginBottom: 16 }}>
            <label className="secondary-button" style={{ display: "inline-block", cursor: "pointer" }}>
              📷 Use my own photo
              <input type="file" accept="image/*" onChange={uploadOwnPhoto} style={{ display: "none" }} />
            </label>
          </div>

          <label className="form-label">Design</label>
          <div className="am-row">{Object.entries(TEMPLATES).map(([value, label]) => choice(template, value, setTemplate, label))}</div>

          <label className="form-label">Size</label>
          <div className="am-row">{Object.entries(SIZES).map(([value, item]) => choice(size, value, setSize, item.label))}</div>

          {template === "below" || template === "above" || template === "only" ? (
            <>
              <label className="form-label">Background</label>
              <div className="am-row">
                {Object.entries(CLEAN_BACKGROUNDS).map(([value, item]) => choice(cleanBg, value, setCleanBg, item.label))}
              </div>
            </>
          ) : null}

          <label className="form-label">Photo</label>
          <div className="am-row">
            {choice(fit, "fit", setFit, "Show whole bag")}
            {choice(fit, "fill", setFit, "Fill the space")}
          </div>

          {!isCleanTemplate ? (
          <div className="form-group">
            <label className="form-label">Slogan</label>
            <select className="form-select" value={SLOGANS.includes(slogan) ? slogan : "__custom"} onChange={(event) => setSlogan(event.target.value === "__custom" ? "" : event.target.value)}>
              {SLOGANS.map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
              <option value="__custom">Write my own...</option>
            </select>
            {!SLOGANS.includes(slogan) ? (
              <input className="form-input" style={{ marginTop: 8 }} value={slogan} onChange={(event) => setSlogan(event.target.value)} placeholder="Your slogan" />
            ) : null}
          </div>
          ) : null}

          <div className="form-group">
            <label className="form-label">Bag name</label>
            <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="am-two">
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input className="form-input" type="number" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">MRP (₹, crossed out)</label>
              <input className="form-input" type="number" inputMode="numeric" value={mrp} onChange={(event) => setMrp(event.target.value)} />
            </div>
          </div>

          {!isCleanTemplate ? (
          <>
          <label className="form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <input type="checkbox" checked={showBadge} onChange={(event) => setShowBadge(event.target.checked)} />
            Show “% OFF” badge
          </label>

          <div className="form-group">
            <label className="form-label">Bottom line</label>
            <input className="form-input" value={footer} onChange={(event) => setFooter(event.target.value)} />
          </div>
          </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
