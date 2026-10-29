/*
 * STUDIO DESIGN (2026-10-29) - Ad Maker "✨ Studio"
 * --------------------------------------------------
 * Premium "big brand" look from the supplier photo: the bag is lifted off
 * its plain (white / grey) photo background and placed on a soft studio
 * backdrop (wall + floor sweep, light from the top, real-looking shadow),
 * with a small SHRIMOH mark and one short lowercase line. No price.
 *
 * Honest: the bag itself is NOT changed - only the plain background
 * behind it is swapped. No AI, no fake model / room.
 *
 * If the photo's background is not plain (a room, a model, a busy
 * scene), the bag can't be lifted cleanly - then the photo is placed as
 * a neat framed print on the same backdrop, and the caller is told
 * (result.cutout === false) so Admin can suggest a white-background photo.
 */

const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const SANS = '"AdUrbanist", "Helvetica Neue", Arial, sans-serif';

export const STUDIO_BACKGROUNDS = {
  beige: { label: "Beige", wall: [233, 223, 208], floor: [214, 199, 178], dark: false },
  sage: { label: "Sage green", wall: [176, 184, 162], floor: [150, 159, 136], dark: false },
  stone: { label: "Stone grey", wall: [220, 218, 213], floor: [199, 196, 189], dark: false },
  blush: { label: "Blush", wall: [236, 219, 212], floor: [219, 196, 187], dark: false },
  mocha: { label: "Mocha", wall: [125, 98, 80], floor: [99, 76, 61], dark: true },
  noir: { label: "Noir", wall: [44, 38, 34], floor: [28, 24, 21], dark: true },
};

export const STUDIO_LINES = [
  "the everyday bag",
  "office se dinner tak",
  "your new favourite",
  "simple. classy. yours.",
  "one bag, every outfit",
  "carry it your way",
  "new in",
  "mentally on vacation",
];

/* ------------------------------ CUTOUT ------------------------------ */

const cache = new WeakMap(); // img -> cutout result

function colorDistance(data, i, r, g, b) {
  const dr = data[i] - r;
  const dg = data[i + 1] - g;
  const db = data[i + 2] - b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

/**
 * Returns { ok, canvas, box } where canvas holds the bag with a
 * transparent background and box = tight bounds of the bag inside it.
 */
export function cutoutBag(img) {
  if (cache.has(img)) return cache.get(img);
  const result = makeCutout(img);
  cache.set(img, result);
  return result;
}

function makeCutout(img) {
  const fail = (reason) => ({ ok: false, reason });
  try {
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const W = Math.max(8, Math.round(img.width * scale));
    const H = Math.max(8, Math.round(img.height * scale));
    const work = document.createElement("canvas");
    work.width = W;
    work.height = H;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    wctx.drawImage(img, 0, 0, W, H);
    const data = wctx.getImageData(0, 0, W, H).data;
    const N = W * H;

    // 1. Background colour from the photo's border.
    const rs = [];
    const gs = [];
    const bs = [];
    const border = [];
    const band = 3;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x >= band && x < W - band && y >= band && y < H - band) continue;
        const i = (y * W + x) * 4;
        border.push(i);
        rs.push(data[i]);
        gs.push(data[i + 1]);
        bs.push(data[i + 2]);
      }
    }
    const br = median(rs);
    const bg = median(gs);
    const bb = median(bs);
    // Plain background = the border changes only smoothly (white, grey,
    // or a soft gradient). A room / model / scene has busy borders.
    let rough = 0;
    let steps = 0;
    const perimeter = [];
    for (let x = 0; x < W; x++) perimeter.push(x);
    for (let y = 1; y < H; y++) perimeter.push(y * W + W - 1);
    for (let x = W - 2; x >= 0; x--) perimeter.push((H - 1) * W + x);
    for (let y = H - 2; y > 0; y--) perimeter.push(y * W);
    for (let k = 1; k < perimeter.length; k++) {
      const a = perimeter[k - 1] * 4;
      const b = perimeter[k] * 4;
      steps++;
      if (colorDistance(data, b, data[a], data[a + 1], data[a + 2]) > 14) rough++;
    }
    let farBorder = 0;
    for (const i of border) if (colorDistance(data, i, br, bg, bb) > 110) farBorder++;
    if (rough / steps > 0.12 || farBorder / border.length > 0.35) return fail("busy");

    // 2. Edge strength (Sobel on brightness) - the fill stops at edges.
    const lum = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const grad = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const gx = lum[p - W + 1] + 2 * lum[p + 1] + lum[p + W + 1] - lum[p - W - 1] - 2 * lum[p - 1] - lum[p + W - 1];
        const gy = lum[p + W - 1] + 2 * lum[p + W] + lum[p + W + 1] - lum[p - W - 1] - 2 * lum[p - W] - lum[p - W + 1];
        grad[p] = Math.sqrt(gx * gx + gy * gy) / 4;
      }
    }

    // 3. Flood fill the background from the border. A pixel joins if it
    //    looks like its neighbour (smooth shading, soft shadow) and is not
    //    far from the background colour, and is not on a strong edge.
    const isBg = new Uint8Array(N);
    const queue = new Int32Array(N);
    let head = 0;
    let tail = 0;
    const globalTol = 70;
    const stepTol = 9;
    const edgeStop = 22;
    for (let x = 0; x < W; x++) {
      for (const y of [0, H - 1]) {
        const p = y * W + x;
        if (!isBg[p] && colorDistance(data, p * 4, br, bg, bb) < globalTol) {
          isBg[p] = 1;
          queue[tail++] = p;
        }
      }
    }
    for (let y = 0; y < H; y++) {
      for (const x of [0, W - 1]) {
        const p = y * W + x;
        if (!isBg[p] && colorDistance(data, p * 4, br, bg, bb) < globalTol) {
          isBg[p] = 1;
          queue[tail++] = p;
        }
      }
    }
    while (head < tail) {
      const p = queue[head++];
      const x = p % W;
      const y = (p - x) / W;
      const pi = p * 4;
      const neighbours = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of neighbours) {
        if (q < 0 || isBg[q]) continue;
        const qi = q * 4;
        if (grad[q] > edgeStop) continue;
        if (colorDistance(data, qi, data[pi], data[pi + 1], data[pi + 2]) > stepTol) continue;
        // Old photo shadow = smooth, grey (no colour) and not too dark:
        // allowed further from the background colour than other pixels.
        const chroma = Math.max(data[qi], data[qi + 1], data[qi + 2]) - Math.min(data[qi], data[qi + 1], data[qi + 2]);
        const shadowLike = chroma < 12 && lum[q] > 110 && grad[q] < 10;
        if (colorDistance(data, qi, br, bg, bb) > (shadowLike ? 220 : globalTol)) continue;
        isBg[q] = 1;
        queue[tail++] = q;
      }
    }

    // 3b. Peel: light, background-coloured pixels still stuck to the
    //     background (old photo shadow, JPEG fuzz at the bag's foot).
    head = 0;
    tail = 0;
    const peelTol = 34;
    for (let p = 0; p < N; p++) {
      if (isBg[p]) continue;
      const x = p % W;
      const y = (p - x) / W;
      const touches = (x > 0 && isBg[p - 1]) || (x < W - 1 && isBg[p + 1]) || (y > 0 && isBg[p - W]) || (y < H - 1 && isBg[p + W]);
      if (touches && colorDistance(data, p * 4, br, bg, bb) < peelTol) {
        isBg[p] = 1;
        queue[tail++] = p;
      }
    }
    while (head < tail) {
      const p = queue[head++];
      const x = p % W;
      const y = (p - x) / W;
      const neighbours = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of neighbours) {
        if (q < 0 || isBg[q]) continue;
        if (colorDistance(data, q * 4, br, bg, bb) >= peelTol) continue;
        isBg[q] = 1;
        queue[tail++] = q;
      }
    }

    // 4. Holes (inside a handle loop): enclosed patches that are clearly
    //    the same plain background colour (or its soft grey shading).
    const holeLike = (p, maxGrad) => {
      if (grad[p] > maxGrad) return false;
      const i = p * 4;
      if (colorDistance(data, i, br, bg, bb) <= 16) return true;
      const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      const bgLum = br * 0.299 + bg * 0.587 + bb * 0.114;
      return chroma < 10 && lum[p] > 150 && Math.abs(lum[p] - bgLum) < 70;
    };
    const seen = new Uint8Array(N);
    const comp = new Int32Array(N);
    for (let start = 0; start < N; start++) {
      if (isBg[start] || seen[start]) continue;
      if (!holeLike(start, 6)) continue;
      let ch = 0;
      let ct = 0;
      comp[ct++] = start;
      seen[start] = 1;
      while (ch < ct) {
        const p = comp[ch++];
        const x = p % W;
        const y = (p - x) / W;
        const neighbours = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of neighbours) {
          if (q < 0 || seen[q] || isBg[q]) continue;
          if (!holeLike(q, 12)) continue;
          seen[q] = 1;
          comp[ct++] = q;
        }
      }
      if (ct > N * 0.0015) for (let k = 0; k < ct; k++) isBg[comp[k]] = 1;
    }

    // 4b. Thin grey fuzz left from the old shadow: peel at most 4 pixels
    //     of light, colourless pixels touching the background.
    for (let pass = 0; pass < 4; pass++) {
      const peel = [];
      for (let p = 0; p < N; p++) {
        if (isBg[p]) continue;
        const i = p * 4;
        const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        if (chroma >= 12 || lum[p] <= 120) continue;
        const x = p % W;
        const y = (p - x) / W;
        if ((x > 0 && isBg[p - 1]) || (x < W - 1 && isBg[p + 1]) || (y > 0 && isBg[p - W]) || (y < H - 1 && isBg[p + W])) peel.push(p);
      }
      if (!peel.length) break;
      for (const p of peel) isBg[p] = 1;
    }

    // 5. Keep the bag: biggest solid part (+ big pieces like a strap).
    const label = new Int32Array(N).fill(-1);
    const sizes = [];
    for (let start = 0; start < N; start++) {
      if (isBg[start] || label[start] >= 0) continue;
      const id = sizes.length;
      let ch = 0;
      let ct = 0;
      comp[ct++] = start;
      label[start] = id;
      while (ch < ct) {
        const p = comp[ch++];
        const x = p % W;
        const y = (p - x) / W;
        const neighbours = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of neighbours) {
          if (q < 0 || isBg[q] || label[q] >= 0) continue;
          label[q] = id;
          comp[ct++] = q;
        }
      }
      sizes.push(ct);
    }
    if (!sizes.length) return fail("empty");
    const biggest = Math.max(...sizes);
    const keep = sizes.map((size) => size >= biggest * 0.04);
    let area = 0;
    let minX = W;
    let minY = H;
    let maxX = 0;
    let maxY = 0;
    const alpha = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      if (label[p] >= 0 && keep[label[p]]) {
        alpha[p] = 1;
        area++;
        const x = p % W;
        const y = (p - x) / W;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const fraction = area / N;
    if (fraction < 0.04) return fail("small");
    if (fraction > 0.9) return fail("busy");

    // 6. Clean edge: shave 2px (removes the light halo), then soften.
    let shaved = alpha;
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(N);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          next[p] = shaved[p] && shaved[p - 1] && shaved[p + 1] && shaved[p - W] && shaved[p + W] ? 1 : 0;
        }
      }
      shaved = next;
    }
    const soft = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        soft[p] =
          (shaved[p] * 4 +
            (shaved[p - 1] + shaved[p + 1] + shaved[p - W] + shaved[p + W]) * 2 +
            shaved[p - W - 1] + shaved[p - W + 1] + shaved[p + W - 1] + shaved[p + W + 1]) /
          16;
      }
    }

    // 7. Mask at small size -> full-size bag with transparent background.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = W;
    maskCanvas.height = H;
    const mctx = maskCanvas.getContext("2d");
    const maskData = mctx.createImageData(W, H);
    for (let p = 0; p < N; p++) {
      maskData.data[p * 4] = 0;
      maskData.data[p * 4 + 1] = 0;
      maskData.data[p * 4 + 2] = 0;
      maskData.data[p * 4 + 3] = Math.round(soft[p] * 255);
    }
    mctx.putImageData(maskData, 0, 0);

    const outScale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const OW = Math.round(img.width * outScale);
    const OH = Math.round(img.height * outScale);
    const out = document.createElement("canvas");
    out.width = OW;
    out.height = OH;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, 0, 0, OW, OH);
    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(maskCanvas, 0, 0, OW, OH);
    octx.globalCompositeOperation = "source-over";

    const k = OW / W;
    const box = {
      x: Math.max(0, (minX - 1) * k),
      y: Math.max(0, (minY - 1) * k),
      w: Math.min(OW, (maxX - minX + 3) * k),
      h: Math.min(OH, (maxY - minY + 3) * k),
    };
    return { ok: true, canvas: out, box };
  } catch (error) {
    return fail(error?.message || "error");
  }
}

/* ------------------------------ BACKDROP ---------------------------- */

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

let grain = null;
function grainPattern(ctx) {
  if (!grain) {
    grain = document.createElement("canvas");
    grain.width = 160;
    grain.height = 160;
    const g = grain.getContext("2d");
    const pixels = g.createImageData(160, 160);
    let seed = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = seed % 255;
      pixels.data[i] = v;
      pixels.data[i + 1] = v;
      pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    g.putImageData(pixels, 0, 0);
  }
  return ctx.createPattern(grain, "repeat");
}

function drawBackdrop(ctx, W, H, theme, floorY) {
  // wall -> floor sweep (soft, like a paper studio backdrop)
  const sweep = ctx.createLinearGradient(0, 0, 0, H);
  const wallTop = mix(theme.wall, [255, 255, 255], theme.dark ? 0.04 : 0.1);
  sweep.addColorStop(0, rgb(wallTop));
  sweep.addColorStop(Math.max(0, floorY / H - 0.16), rgb(theme.wall));
  sweep.addColorStop(Math.min(1, floorY / H + 0.04), rgb(mix(theme.wall, theme.floor, 0.85)));
  sweep.addColorStop(1, rgb(theme.floor));
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, W, H);

  // window light from the top-left
  const light = ctx.createRadialGradient(W * 0.22, H * 0.08, 0, W * 0.22, H * 0.08, Math.max(W, H) * 0.85);
  light.addColorStop(0, `rgba(255,250,240,${theme.dark ? 0.1 : 0.22})`);
  light.addColorStop(1, "rgba(255,250,240,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  // soft vignette
  const vignette = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${theme.dark ? 0.35 : 0.12})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // fine grain - real paper/plaster feel, not flat digital colour
  ctx.save();
  ctx.globalAlpha = theme.dark ? 0.05 : 0.035;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ------------------------------ DESIGN ------------------------------ */

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

/**
 * d: { studioBg, line, showName, name }
 * returns { cutout: boolean }
 */
export function drawStudio(ctx, { W, H, img, d }) {
  const theme = STUDIO_BACKGROUNDS[d.studioBg] || STUDIO_BACKGROUNDS.beige;
  const isStory = H / W > 1.6;
  const isSquare = H / W < 1.1;
  // (2026-10-29) Story Maker layout: text at the top (under Instagram's
  // profile bar), bag in the middle, empty floor below for the LINK sticker.
  const storyLayout = Boolean(d.storyLayout) && isStory;
  const floorY = storyLayout ? H * 0.63 : H * (isStory ? 0.7 : isSquare ? 0.72 : 0.74);
  drawBackdrop(ctx, W, H, theme, floorY);

  const ink = theme.dark ? "rgba(245,239,228,0.95)" : "rgba(28,21,13,0.92)";
  const muted = theme.dark ? "rgba(245,239,228,0.7)" : "rgba(28,21,13,0.6)";

  // Space for the bag
  const lineText = String(d.line || "").trim();
  const top = storyLayout ? H * 0.29 : H * (isStory ? 0.17 : isSquare ? 0.13 : 0.13);
  const textSpace = storyLayout ? 0 : lineText || d.showName ? H * 0.17 : H * 0.08;
  const bottomLimit = H - textSpace;
  const maxW = W * (isSquare ? 0.62 : 0.7);
  const result = cutoutBag(img);

  if (result.ok) {
    const { canvas, box } = result;
    // bag stands on the floor line
    const base = storyLayout ? floorY + H * 0.03 : Math.min(floorY + H * 0.03, bottomLimit - H * 0.02);
    const maxH = base - top;
    const scale = Math.min(maxW / box.w, maxH / box.h);
    const dw = box.w * scale;
    const dh = box.h * scale;
    const dx = (W - dw) / 2;
    const dy = base - dh;

    // contact shadow on the floor
    ctx.save();
    const cx = W / 2;
    const cy = base - dh * 0.005;
    ctx.translate(cx, cy);
    ctx.scale(1, 0.09);
    const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, dw * 0.55);
    contact.addColorStop(0, `rgba(0,0,0,${theme.dark ? 0.55 : 0.32})`);
    contact.addColorStop(0.6, `rgba(0,0,0,${theme.dark ? 0.2 : 0.1})`);
    contact.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = contact;
    ctx.beginPath();
    ctx.arc(0, 0, dw * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // soft cast shadow (light from top-left -> falls right) + the bag
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${theme.dark ? 0.45 : 0.22})`;
    ctx.shadowBlur = W * 0.045;
    ctx.shadowOffsetX = W * 0.018;
    ctx.shadowOffsetY = W * 0.012;
    ctx.drawImage(canvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
    ctx.restore();
  } else {
    // Busy photo: neat framed print on the backdrop.
    const frameMaxH = (storyLayout ? floorY + H * 0.03 : bottomLimit) - top;
    const scale = Math.min(maxW / img.width, frameMaxH / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (W - dw) / 2;
    const dy = top + (frameMaxH - dh) / 2;
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${theme.dark ? 0.5 : 0.25})`;
    ctx.shadowBlur = W * 0.04;
    ctx.shadowOffsetY = W * 0.015;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(dx, dy, dw, dh);
    ctx.restore();
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Small SHRIMOH mark
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(W * 0.026)}px ${SERIF}`;
  spaced(ctx, "SHRIMOH", W / 2, storyLayout ? 270 * (H / 1920) : H * (isStory ? 0.1 : 0.075), W * 0.017);

  if (storyLayout) {
    let y = H * 0.2;
    if (lineText) {
      ctx.fillStyle = ink;
      let size = Math.round(W * 0.056);
      ctx.font = `italic 500 ${size}px ${SERIF}`;
      while (size > 20 && ctx.measureText(lineText).width > W * 0.84) {
        size -= 2;
        ctx.font = `italic 500 ${size}px ${SERIF}`;
      }
      ctx.fillText(lineText, W / 2, y);
      y += W * 0.055;
    }
    const smallBits = [d.showName && d.name ? String(d.name).toUpperCase() : "", Number(d.price) > 0 ? `₹${Number(d.price).toLocaleString("en-IN")}` : ""].filter(Boolean);
    if (smallBits.length) {
      ctx.fillStyle = muted;
      let size = Math.round(W * 0.022);
      const text = smallBits.join("  ·  ");
      ctx.font = `600 ${size}px ${SANS}`;
      while (size > 12 && ctx.measureText(text).width + text.length * W * 0.004 > W * 0.86) {
        size -= 1;
        ctx.font = `600 ${size}px ${SANS}`;
      }
      spaced(ctx, text, W / 2, y, W * 0.004);
    }
    // bottom: empty floor for the LINK sticker, tiny honest line at the end
    ctx.fillStyle = muted;
    ctx.font = `600 ${Math.round(W * 0.02)}px ${SANS}`;
    spaced(ctx, "FREE DELIVERY (PREPAID)  ·  COD AVAILABLE", W / 2, H * 0.895, W * 0.005);
    return { cutout: result.ok };
  }

  // One short lowercase line (+ optional bag name)
  let y = H - textSpace + H * (isStory ? 0.075 : 0.085);
  if (lineText) {
    ctx.fillStyle = ink;
    ctx.font = `italic 500 ${Math.round(W * 0.05)}px ${SERIF}`;
    let size = Math.round(W * 0.05);
    while (size > 20 && ctx.measureText(lineText).width > W * 0.84) {
      size -= 2;
      ctx.font = `italic 500 ${size}px ${SERIF}`;
    }
    ctx.fillText(lineText, W / 2, y);
    y += W * 0.055;
  }
  if (d.showName && d.name) {
    ctx.fillStyle = muted;
    let size = Math.round(W * 0.019);
    ctx.font = `600 ${size}px ${SANS}`;
    const nameText = String(d.name).toUpperCase();
    while (size > 12 && ctx.measureText(nameText).width + nameText.length * W * 0.004 > W * 0.84) {
      size -= 1;
      ctx.font = `600 ${size}px ${SANS}`;
    }
    spaced(ctx, nameText, W / 2, y, W * 0.004);
  }
  return { cutout: result.ok };
}
