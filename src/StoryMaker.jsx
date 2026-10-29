import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadFonts, rupees, spacedText, fitFont, wrapLines, photoBackground, drawPrice,
  isLight, drawPhotoSoft, INK, DEEP_GOLD, SERIF, SANS, productVariants, absoluteUrl,
} from "./AdMaker";
import SocialPoster from "./SocialPoster";
import SaveBasket from "./SaveBasket";
import { drawStudio, STUDIO_BACKGROUNDS, STUDIO_LINES } from "./studioDesign";

/*
 * ADMIN > STORY MAKER (2026-10-25)
 * Ready Instagram / Facebook STORY images (1080x1920) from the bags:
 *   New In        - bag, name, price. Space at the bottom for the LINK sticker.
 *   This or That  - two bags side by side. Space for the POLL sticker.
 *   Guess price   - bag without price. Space for the QUIZ / SLIDER sticker.
 *   Price reveal  - bag with a big price (post right after "Guess price").
 * Same SHRIMOH look as Ad Maker. Save -> post from the Instagram app,
 * add the sticker + song there.
 */

const W = 1080;
const H = 1920;
const CREAM = "rgb(246,243,238)";

const STORY_TYPES = {
  studio: { label: "✨ Studio", bags: 1, tip: "Premium look. Neeche khaali zameen par LINK sticker lagao (📋 Link copy karo se bag ka link)." },
  newin: { label: "New In", bags: 1, tip: "Instagram mein neeche khaali jagah par LINK sticker lagao (bag ka website link)." },
  thisorthat: { label: "This or That", bags: 2, tip: "Beech ki khaali jagah par POLL sticker lagao: option 1 = Left, option 2 = Right." },
  guess: { label: "Guess the price", bags: 1, tip: "Neeche QUIZ sticker lagao (3 price options, ek sahi). Agle din “Price reveal” wali story daalo." },
  reveal: { label: "Price reveal", bags: 1, tip: "“Guess the price” ke baad daalo. Neeche LINK sticker lagao." },
};

function centerName(ctx, text, y, size, color, maxWidth) {
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px ${SERIF}`;
  const lines = wrapLines(ctx, text, maxWidth, 2);
  lines.forEach((line, index) => ctx.fillText(line, W / 2, y + index * size * 1.12));
  return y + (lines.length - 1) * size * 1.12;
}

function smallCaps(ctx, text, x, y, color, size = 30, spacing = 9, align = "center") {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${SANS}`;
  spacedText(ctx, text, x, y, spacing, align);
}

function wordmark(ctx, y, color) {
  ctx.fillStyle = color;
  ctx.font = `600 34px ${SERIF}`;
  spacedText(ctx, "SHRIMOH", W / 2, y, 18);
}

function drawStory(ctx, type, bags, studio = {}) {
  ctx.textBaseline = "alphabetic";
  const first = bags[0];
  if (type === "studio") {
    return drawStudio(ctx, {
      W,
      H,
      img: first.img,
      d: { studioBg: studio.bg, line: studio.line, showName: true, name: first.name, price: studio.showPrice ? first.price : 0, storyLayout: true },
    });
  }
  const bg = first && type !== "thisorthat" ? photoBackground(first.img) : CREAM;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const light = isLight(bg);
  const ink = light ? INK : "#ffffff";
  const soft = light ? DEEP_GOLD : "rgba(255,255,255,0.85)";
  const muted = light ? "rgba(28,21,13,0.45)" : "rgba(255,255,255,0.6)";

  // Instagram covers ~220px at the top (profile bar) - keep text below it.
  wordmark(ctx, 270, ink);

  if (type === "thisorthat") {
    const [left, right] = bags;
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.font = `italic 500 76px ${SERIF}`;
    ctx.fillText("This or That?", W / 2, 420);
    smallCaps(ctx, "TAP TO VOTE", W / 2, 480, soft, 26, 8);
    const boxW = 470;
    const boxH = 640;
    const top = 560;
    [left, right].forEach((bag, index) => {
      if (!bag) return;
      const x = index === 0 ? 50 : W - 50 - boxW;
      const bagBg = photoBackground(bag.img);
      ctx.fillStyle = bagBg;
      ctx.fillRect(x, top, boxW, boxH);
      drawPhotoSoft(ctx, bag.img, x, top, boxW, boxH, "fit", bagBg);
      ctx.textAlign = "center";
      ctx.fillStyle = ink;
      ctx.font = `500 38px ${SERIF}`;
      const lines = wrapLines(ctx, bag.name, boxW - 20, 2);
      lines.forEach((line, lineIndex) => ctx.fillText(line, x + boxW / 2, top + boxH + 62 + lineIndex * 44));
      if (Number(bag.price) > 0) {
        ctx.fillStyle = ink;
        ctx.font = `600 34px ${SANS}`;
        ctx.fillText(rupees(bag.price), x + boxW / 2, top + boxH + 70 + lines.length * 44);
      }
    });
    // 1400-1700: empty for the POLL sticker
    smallCaps(ctx, "FREE DELIVERY (PREPAID)  ·  COD AVAILABLE", W / 2, 1720, soft, 24, 6);
    return;
  }

  // One-bag stories
  const label = type === "newin" ? "NEW IN" : type === "guess" ? "GUESS THE PRICE" : "PRICE REVEAL";
  smallCaps(ctx, label, W / 2, 350, soft, 30, 12);

  const photoTop = 400;
  const photoBottom = 1180;
  drawPhotoSoft(ctx, first.img, 40, photoTop, W - 80, photoBottom - photoTop, "fit", bg);

  const nameEnd = centerName(ctx, first.name, 1270, 58, ink, W - 160);

  if (type === "newin" && Number(first.price) > 0) {
    drawPrice(ctx, { price: first.price, mrp: first.mrp, x: W / 2, y: nameEnd + 80, size: 46, color: ink, mutedColor: muted, align: "center" });
  }
  if (type === "guess") {
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.font = `italic 500 64px ${SERIF}`;
    ctx.fillText("Kitne ka hoga?", W / 2, nameEnd + 100);
  }
  if (type === "reveal" && Number(first.price) > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    fitFont(ctx, rupees(first.price), "600", 120, SANS, W - 200);
    ctx.fillText(rupees(first.price), W / 2, nameEnd + 150);
    if (Number(first.mrp) > Number(first.price)) {
      const off = Math.round(((first.mrp - first.price) / first.mrp) * 100);
      smallCaps(ctx, `MRP ${rupees(first.mrp)}  ·  ${off}% OFF`, W / 2, nameEnd + 215, muted, 28, 5);
    }
  }
  // ~1500-1700 stays empty for the LINK / QUIZ sticker
  smallCaps(ctx, "FREE DELIVERY (PREPAID)  ·  COD AVAILABLE", W / 2, 1720, soft, 24, 6);
}

export default function StoryMaker({ API, adminFetch, products }) {
  const canvasRef = useRef(null);
  const [type, setType] = useState("newin");
  const [studioBg, setStudioBg] = useState("beige");
  const [studioLine, setStudioLine] = useState(STUDIO_LINES[0]);
  const [studioPrice, setStudioPrice] = useState(true);
  const [studioCut, setStudioCut] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]); // [{ id, name, price, mrp, img }]
  const [loadingId, setLoadingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const cache = useRef(new Map());

  const needed = STORY_TYPES[type].bags;

  const list = useMemo(() => {
    const active = (Array.isArray(products) ? products : []).filter((product) => product && product.active !== false && (product.image || (Array.isArray(product.images) && product.images.length)));
    const query = search.trim().toLowerCase();
    return (query ? active.filter((product) => String(product.name || "").toLowerCase().includes(query)) : active).slice(0, 200);
  }, [products, search]);

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    setPicked((current) => current.slice(0, needed));
  }, [needed]);

  async function loadPhoto(product, sourceUrl) {
    const source = String(sourceUrl || product.image || "");
    const key = `${product.id}|${source}`;
    if (cache.current.has(key)) return cache.current.get(key);
    const absolute = /^https?:\/\//i.test(source) ? source : `${API}${source.startsWith("/") ? "" : "/"}${source}`;
    let blob;
    // (2026-10-26) Photos saved inside the product itself (data: links)
    // are read directly - same as Ad Maker already does.
    if (source.startsWith("data:")) {
      blob = await (await fetch(source)).blob();
    } else try {
      const direct = await fetch(absolute, { mode: "cors" });
      if (!direct.ok) throw new Error("direct failed");
      blob = await direct.blob();
      if (!blob.type.startsWith("image/")) throw new Error("not an image");
    } catch {
      const response = await adminFetch(`${API}/api/admin/photo-original?url=${encodeURIComponent(absolute)}`);
      if (!response.ok) throw new Error("Photo could not be loaded.");
      blob = await response.blob();
    }
    const url = URL.createObjectURL(blob);
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    cache.current.set(key, image);
    return image;
  }

  async function chooseBag(product) {
    setNotice("");
    if (picked.some((bag) => bag.id === product.id)) {
      setPicked((current) => current.filter((bag) => bag.id !== product.id));
      return;
    }
    try {
      setLoadingId(product.id);
      // (2026-10-26) Starts with the bag's first colour variant; the
      // "Colour" row below can switch it.
      const variant = productVariants(API, product)[0];
      const photoUrl = (variant && variant.urls[0]) || product.image;
      const img = await loadPhoto(product, photoUrl);
      const entry = {
        id: product.id,
        name: (variant && variant.name) || product.name || "",
        price: Number(product.price) || 0,
        mrp: Number(product.oldPrice) || 0,
        img,
        variantKey: variant ? variant.key : "",
        photoUrl,
      };
      setPicked((current) => (needed === 1 ? [entry] : [...current, entry].slice(-needed)));
    } catch (error) {
      setNotice(`❌ ${error.message || "Photo could not be loaded."}`);
    } finally {
      setLoadingId(null);
    }
  }

  // (2026-10-26) Switch a picked bag to another colour / photo.
  async function changePhoto(bagId, variant, url) {
    const product = (Array.isArray(products) ? products : []).find((item) => item.id === bagId);
    if (!product || !variant) return;
    const photoUrl = url || variant.urls[0] || product.image;
    setNotice("");
    try {
      setLoadingId(bagId);
      const img = await loadPhoto(product, photoUrl);
      setPicked((current) =>
        current.map((bag) =>
          bag.id === bagId ? { ...bag, img, photoUrl, variantKey: variant.key, name: variant.name || product.name || "" } : bag
        )
      );
    } catch (error) {
      setNotice(`❌ ${error.message || "Photo could not be loaded."}`);
    } finally {
      setLoadingId(null);
    }
  }

  // First bag picked automatically.
  useEffect(() => {
    if (!picked.length && list.length) chooseBag(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const ready = picked.length >= needed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const drawn = drawStory(ctx, type, picked, { bg: studioBg, line: studioLine, showPrice: studioPrice });
    setStudioCut(type !== "studio" || !drawn || drawn.cutout !== false);
  }, [type, picked, ready, fontsReady, studioBg, studioLine, studioPrice]);

  // (2026-10-29) Story link: each picked bag's own page link, ready to
  // paste into Instagram's Link sticker (utm shows it in Analytics).
  const [copiedId, setCopiedId] = useState(null);
  function storyLink(bag) {
    return `https://shrimoh.vercel.app/product/${bag.id}?utm_source=instagram&utm_medium=story`;
  }
  async function copyLink(bag) {
    const text = storyLink(bag);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
    }
    setCopiedId(ok ? bag.id : null);
    if (ok) window.setTimeout(() => setCopiedId((current) => (current === bag.id ? null : current)), 2000);
    else setNotice("Copy nahi hua - link ko daba ke rakho aur Copy chuno.");
  }

  async function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) return;
    const safeName = (picked[0]?.name || "shrimoh-story").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
    const file = new File([blob], `${safeName}-story-${type}.jpg`, { type: "image/jpeg" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNotice("✅ “Save Image” chuno, phir Instagram story mein daalo.");
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

  return (
    <div className="panel">
      <style>{`
        .sm-layout { display: grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); gap: 24px; align-items: start; }
        .sm-layout > * { min-width: 0; }
        /* (2026-10-26) Phone fix: never wider than the screen. */
        @media (max-width: 860px) { .sm-layout { grid-template-columns: minmax(0, 1fr); } }
        .sm-canvas { width: 100%; max-width: 360px; height: auto; display: block; border-radius: 14px; border: 1px solid #ddd; background: #f4f4f4; margin: 0 auto; }
        .sm-empty { padding: 80px 20px; text-align: center; color: #777; border: 1px dashed #ccc; border-radius: 14px; }
        .sm-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
        .sm-chip { padding: 9px 14px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: #111; }
        .sm-chip.on { background: #1c150d; color: #fff; border-color: #1c150d; }
        .sm-bags { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin: 8px 0 16px; }
        .sm-bag { position: relative; flex: 0 0 84px; border: 2px solid transparent; border-radius: 9px; padding: 0; background: none; cursor: pointer; }
        .sm-bag.on { border-color: #1c150d; }
        .sm-bag img { width: 80px; height: 80px; object-fit: cover; border-radius: 7px; display: block; }
        .sm-num { position: absolute; top: 3px; left: 3px; background: #1c150d; color: #fff; border-radius: 999px; width: 22px; height: 22px; font-size: 12px; line-height: 22px; text-align: center; }
        .sm-links { margin: 4px 0 14px; padding: 12px; border: 1px solid #e8e2d6; border-radius: 12px; background: #fcfbf8; }
        .sm-link { padding: 8px 0; border-bottom: 1px solid #f0ebe0; }
        .sm-link:last-of-type { border-bottom: 0; }
        .sm-link-url { font-size: 12px; color: #555; margin: 3px 0 6px; overflow-wrap: anywhere; user-select: all; -webkit-user-select: all; }
        .sm-tip { padding: 12px 14px; background: #f6f3ea; border-radius: 10px; font-size: 14px; line-height: 1.5; margin-bottom: 14px; }
      `}</style>
      <div className="panel-header">
        <h2 className="panel-title">Story Maker</h2>
      </div>
      {notice ? <div className="sm-tip">{notice}</div> : null}

      <div className="sm-layout">
        <div>
          {ready ? (
            <canvas ref={canvasRef} className="sm-canvas" />
          ) : (
            <div className="sm-empty">
              {loadingId ? "Loading photo..." : needed === 2 ? `2 bags chuno (${picked.length}/2)` : "Ek bag chuno"}
            </div>
          )}
          <div className="sm-row" style={{ justifyContent: "center" }}>
            <button type="button" className="save-product-button" onClick={saveImage} disabled={!ready}>
              ⬇ Save story
            </button>
          </div>
          {/* (2026-10-29) Kai stories ek saath phone mein - SaveBasket.jsx */}
          <SaveBasket
            basketKey="story"
            word="stories"
            label={picked.map((bag) => bag.name).filter(Boolean).join(" + ")}
            getImage={() => (ready && canvasRef.current ? canvasRef.current.toDataURL("image/jpeg", 0.92) : "")}
            getLink={() => (picked[0] ? storyLink(picked[0]) : "")}
            canAdd={ready}
          />
          {picked.length > 0 && (
            <div className="sm-links">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔗 Story ka link (Link sticker ke liye)</div>
              {picked.map((bag) => (
                <div className="sm-link" key={bag.id}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{bag.name}</div>
                  <div className="sm-link-url">{storyLink(bag)}</div>
                  <button type="button" className={copiedId === bag.id ? "sm-chip on" : "sm-chip"} onClick={() => copyLink(bag)}>
                    {copiedId === bag.id ? "✓ Copy ho gaya" : "📋 Link copy karo"}
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginTop: 6 }}>
                Tareeka: ⬇ Save story → 📋 Link copy karo → Instagram mein story kholo → photo chuno → sticker (☺) → <b>Link</b> → paste karo. Sticker par “Shop now” likh sakte ho.
              </div>
            </div>
          )}
          {/* (2026-10-28) Story seedha Instagram / Facebook par - SocialPoster.jsx */}
          <SocialPoster
            API={API}
            adminFetch={adminFetch}
            mode="story"
            label={picked.map((bag) => bag.name).filter(Boolean).join(" + ")}
            getImage={() => (ready && canvasRef.current ? canvasRef.current.toDataURL("image/jpeg", 0.92) : "")}
            canAdd={ready}
            addHint="Pehle bag chuno."
          />
        </div>

        <div>
          <label className="form-label">Story type</label>
          <div className="sm-row">
            {Object.entries(STORY_TYPES).map(([value, item]) => (
              <button type="button" key={value} className={type === value ? "sm-chip on" : "sm-chip"} onClick={() => setType(value)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="sm-tip">💡 {STORY_TYPES[type].tip}</div>

          {type === "studio" ? (
            <>
              <label className="form-label">Studio background</label>
              <div className="sm-row">
                {Object.entries(STUDIO_BACKGROUNDS).map(([value, item]) => (
                  <button type="button" key={value} className={studioBg === value ? "sm-chip on" : "sm-chip"} onClick={() => setStudioBg(value)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="form-label">Chhoti line</label>
              <select
                className="form-select"
                style={{ marginBottom: 8 }}
                value={studioLine === "" ? "__none" : STUDIO_LINES.includes(studioLine) ? studioLine : "__custom"}
                onChange={(event) => {
                  const value = event.target.value;
                  setStudioLine(value === "__none" ? "" : value === "__custom" ? " " : value);
                }}
              >
                {STUDIO_LINES.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
                <option value="__custom">Apni line likho...</option>
                <option value="__none">Koi line nahi</option>
              </select>
              {studioLine !== "" && !STUDIO_LINES.includes(studioLine) ? (
                <input
                  className="form-input"
                  style={{ marginBottom: 8 }}
                  value={studioLine.trim() ? studioLine : ""}
                  onChange={(event) => setStudioLine(event.target.value || " ")}
                  placeholder="jaise: office se dinner tak"
                />
              ) : null}
              <label className="form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                <input type="checkbox" checked={studioPrice} onChange={(event) => setStudioPrice(event.target.checked)} />
                Price chhota sa dikhao
              </label>
              {!studioCut ? (
                <div className="sm-tip" style={{ color: "#8a5a00" }}>
                  ⚠️ Is photo ka background saaf (white / grey) nahi hai, isliye photo frame ki tarah lagi hai. Bag ki white background
                  wali photo chuno.
                </div>
              ) : null}
            </>
          ) : null}

          <label className="form-label">{needed === 2 ? "Bags (2 chuno)" : "Bag"}</label>
          <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bags..." />
          <div className="sm-bags">
            {list.map((product) => {
              const index = picked.findIndex((bag) => bag.id === product.id);
              return (
                <button
                  type="button"
                  key={product.id}
                  className={index >= 0 ? "sm-bag on" : "sm-bag"}
                  onClick={() => chooseBag(product)}
                  title={product.name}
                >
                  <img src={absoluteUrl(API, product.image || (Array.isArray(product.images) ? product.images[0] : ""))} alt={product.name} loading="lazy" />
                  {index >= 0 && needed === 2 ? <span className="sm-num">{index + 1}</span> : null}
                </button>
              );
            })}
          </div>

          {picked.map((bag, bagIndex) => {
            const product = (Array.isArray(products) ? products : []).find((item) => item.id === bag.id);
            const variants = productVariants(API, product);
            const variant = variants.find((item) => item.key === bag.variantKey) || variants[0];
            if (!product || (variants.length < 2 && (!variant || variant.urls.length < 2))) return null;
            const prefix = needed === 2 ? `Bag ${bagIndex + 1} - ` : "";
            return (
              <div key={bag.id}>
                {variants.length > 1 ? (
                  <>
                    <label className="form-label">{prefix}Colour / variant ({variants.length})</label>
                    <div className="sm-row">
                      {variants.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={variant && variant.key === item.key ? "sm-chip on" : "sm-chip"}
                          onClick={() => changePhoto(bag.id, item)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {variant && variant.urls.length > 1 ? (
                  <>
                    <label className="form-label">{prefix}Which photo ({variant.urls.length})</label>
                    <div className="sm-bags">
                      {variant.urls.map((url) => (
                        <button
                          type="button"
                          key={url}
                          className={url === bag.photoUrl ? "sm-bag on" : "sm-bag"}
                          onClick={() => changePhoto(bag.id, variant, url)}
                        >
                          <img src={url} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
