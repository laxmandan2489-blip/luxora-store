import { useEffect, useMemo, useRef, useState } from "react";
import { loadFonts, productVariants, absoluteUrl } from "./AdMaker";
import { renderReel, drawPreview, prepareCutouts, QUALITIES, REEL_W, REEL_H } from "./reelEngine";

/*
 * ADMIN > REEL MAKER (2026-10-29)
 * Pick bags -> one tap -> a ready 9:16 MP4 reel (Studio look, slow zoom,
 * soft fades, text). Made fully on the phone (reelEngine.js): nothing is
 * uploaded or stored on Supabase / Render / Vercel. Save the video, then
 * add a song in Instagram.
 */

// (2026-10-29 v3) 10 many-bag + 11 one-bag templates. kind:
//   bags    - one photo per bag (pick several bags)
//   photos  - ONE bag, choose up to `photos` of its photos
//   colours - ONE bag, one photo per colour
const STYLES = {
  // ---- many bags (10) ----
  newin: { group: "multi", label: "New in", hint: "3 se 6 bags.", min: 3, max: 6, hook: "new in this week", kind: "bags" },
  fastcuts: { group: "multi", label: "⚡ Fast cuts", hint: "3 se 6 bags.", min: 3, max: 6, hook: "new drop", kind: "bags" },
  swipe: { group: "multi", label: "👉 Swipe", hint: "3 se 6 bags.", min: 3, max: 6, hook: "swipe through ➡️", kind: "bags" },
  bounce: { group: "multi", label: "🏀 Bounce", hint: "3 se 6 bags.", min: 3, max: 6, hook: "just landed ✨", kind: "bags" },
  filmstrip: { group: "multi", label: "🎞 Film strip", hint: "3 se 6 bags.", min: 3, max: 6, hook: "the new edit 🎞", kind: "bags" },
  magazine: { group: "multi", label: "📰 Magazine", hint: "2 se 5 bags.", min: 2, max: 5, hook: "", kind: "bags" },
  toplist: { group: "multi", label: "🏆 Top picks", hint: "3 se 5 bags.", min: 3, max: 5, hook: "", kind: "bags" },
  split: { group: "multi", label: "↔️ This or that", hint: "2, 4 ya 6 bags (jodiyan).", min: 2, max: 6, hook: "this or that?", kind: "bags" },
  collage: { group: "multi", label: "🖼 Collage", hint: "2 se 4 bags.", min: 2, max: 4, hook: "which one is you?", kind: "bags" },
  polaroid: { group: "multi", label: "📸 Polaroid", hint: "3 se 5 bags.", min: 3, max: 5, hook: "my bag edit ✨", kind: "bags" },
  // ---- one bag (10) ----
  showcase: { group: "single", label: "✨ Showcase", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "", kind: "photos" },
  details: { group: "single", label: "🔍 Zoom details", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "zoom in 🔍", kind: "photos" },
  angles: { group: "single", label: "🔄 Every angle", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "every angle 🔄", kind: "photos" },
  fastcuts1: { group: "single", label: "⚡ Fast cuts", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "new drop", kind: "photos" },
  bounce1: { group: "single", label: "🏀 Bounce", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "just landed ✨", kind: "photos" },
  magazine1: { group: "single", label: "📰 Magazine", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "", kind: "photos" },
  polaroid1: { group: "single", label: "📸 Polaroid", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "one bag, every look", kind: "photos" },
  grid: { group: "single", label: "🖼 Grid", hint: "Ek bag, uski 2-4 photos.", min: 1, max: 1, photos: 4, hook: "one bag, 4 looks", kind: "photos" },
  guess: { group: "single", label: "👀 Guess the price", hint: "Ek bag, uski 1-3 photos.", min: 1, max: 1, photos: 3, hook: "guess the price 👀", kind: "photos" },
  colours: { group: "single", label: "1-2-3 Kaunsa colour", hint: "Ek bag jiske 2-4 colour hon.", min: 1, max: 1, hook: "kaunsa colour lenge?", kind: "colours" },
};

// (2026-10-29) Short captions (4-5 lines), like big brand pages.
function captionFor(style, bags) {
  const first = bags[0] || {};
  const tags = "#handbags #bagsforwomen #handbagsindia #newin #shrimoh #bagsofinstagram";
  const price = Number(first.price) > 0 ? `₹${Number(first.price).toLocaleString("en-IN")}` : "";
  const end = ["Free delivery (prepaid) · COD available", "Link in bio 🛍", "", tags];
  if (style === "colours") return [`${first.name || "New bag"} 🤍`, "Kaunsa colour aapka? Comment karo 👇", ...end].join("\n");
  if (style === "guess") return [`${first.name || "New bag"} 🤍`, "Guess kiya? Price end mein 👀", ...end].join("\n");
  if (STYLES[style] && STYLES[style].group === "single") return [`${first.name || "New bag"} 🤍`, price, ...end].filter(Boolean).join("\n").replace("\n#", "\n\n#");
  const hook = style === "collage" || style === "split" ? "Which one is you? Comment karo 👇" : style === "toplist" ? "This week's top picks 🏆" : "New in this week ✨";
  return [hook, `${bags.length} new bags · swipe the reel`, ...end].join("\n");
}

export default function ReelMaker({ API, adminFetch, products }) {
  const previewRef = useRef(null);
  const cache = useRef(new Map());
  const [style, setStyle] = useState("newin");
  const [hook, setHook] = useState(STYLES.newin.hook);
  const [showPrice, setShowPrice] = useState(true);
  const [quality, setQuality] = useState("fast");
  const [picks, setPicks] = useState({}); // slot key -> chosen photo url
  const [search, setSearch] = useState("");
  const [pickedIds, setPickedIds] = useState([]);
  const [bags, setBags] = useState([]); // loaded: [{ img, name, price, mrp, label }]
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [video, setVideo] = useState(null); // { url, blob, seconds, busy }
  const [notice, setNotice] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const rule = STYLES[style];

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => () => video && URL.revokeObjectURL(video.url), [video]);

  const list = useMemo(() => {
    const active = (Array.isArray(products) ? products : []).filter(
      (product) => product && product.active !== false && (product.image || (Array.isArray(product.images) && product.images.length))
    );
    const query = search.trim().toLowerCase();
    return (query ? active.filter((product) => String(product.name || "").toLowerCase().includes(query)) : active).slice(0, 200);
  }, [products, search]);

  async function loadPhoto(product, source) {
    const key = `${product.id}|${source}`;
    if (cache.current.has(key)) return cache.current.get(key);
    const absolute = absoluteUrl(API, source);
    let blob;
    if (absolute.startsWith("data:")) {
      blob = await (await fetch(absolute)).blob();
    } else {
      try {
        const direct = await fetch(absolute, { mode: "cors" });
        if (!direct.ok) throw new Error("direct failed");
        blob = await direct.blob();
        if (!blob.type.startsWith("image/")) throw new Error("not an image");
      } catch {
        const response = await adminFetch(`${API}/api/admin/photo-original?url=${encodeURIComponent(absolute)}`);
        if (!response.ok) throw new Error("Photo load nahi hui.");
        blob = await response.blob();
      }
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

  const productById = (id) => (products || []).find((product) => product.id === id);
  const allUrls = (product) => Array.from(new Set(productVariants(API, product).flatMap((variant) => variant.urls))).filter(Boolean);

  // (2026-10-29) SLOTS: one per photo in the reel. Each slot has the photos
  // you can choose from; the chosen one is in "picks" (default = first).
  const slots = useMemo(() => {
    const chosen = pickedIds.map(productById).filter(Boolean);
    if (!chosen.length) return [];
    if (rule.kind === "colours") {
      const product = chosen[0];
      return productVariants(API, product)
        .filter((variant) => variant.urls.length)
        .slice(0, 4)
        .map((variant) => ({ key: `${product.id}|c|${variant.key}`, product, title: variant.label, options: variant.urls, label: variant.label }));
    }
    if (rule.kind === "photos") {
      const product = chosen[0];
      const urls = allUrls(product);
      const count = Math.max(1, Math.min(rule.photos || 4, urls.length));
      return Array.from({ length: count }, (_, index) => ({
        key: `${product.id}|p|${index}`,
        product,
        title: `Photo ${index + 1}`,
        options: urls,
        fallback: urls[index],
      }));
    }
    return chosen.map((product) => ({ key: `${product.id}|b`, product, title: product.name, options: allUrls(product) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIds, style, products]);

  const slotUrl = (slot) => picks[slot.key] || slot.fallback || slot.options[0];

  // Load the chosen photos.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!slots.length) {
        setBags([]);
        return;
      }
      setLoading(true);
      setNotice("");
      try {
        const next = [];
        for (const slot of slots) {
          const product = slot.product;
          next.push({
            img: await loadPhoto(product, slotUrl(slot)),
            name: product.name || "",
            label: slot.label || "",
            price: Number(product.price) || 0,
            mrp: Number(product.oldPrice) || 0,
          });
        }
        if (rule.kind === "colours" && next.length < 2) setNotice("⚠️ Is bag ka ek hi colour hai. “Kaunsa colour” ke liye 2-4 colour wala bag chuno.");
        if (style === "guess" && next.length && !(next[0].price > 0)) setNotice("⚠️ Is bag ka price khaali hai - Products mein price bharo.");
        if (rule.kind === "photos" && next.length < 2 && style !== "guess") setNotice("ℹ️ Is bag ki ek hi photo hai - reel ban jayegi, par 2-4 photos wale bag par zyada achhi lagegi.");
        if (!cancelled) setBags(next);
        // cut the bags out now, so "Reel banao" starts straight away
        await prepareCutouts(next.map((bag) => bag.img));
      } catch (error) {
        if (!cancelled) setNotice(`❌ ${error.message || "Photo load nahi hui."} Dobara try karo.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, picks]);

  // Still preview of the first frame
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = REEL_W;
    canvas.height = REEL_H;
    const ctx = canvas.getContext("2d");
    if (!bags.length) {
      ctx.clearRect(0, 0, REEL_W, REEL_H);
      return;
    }
    let stale = false;
    const off = document.createElement("canvas");
    off.width = REEL_W;
    off.height = REEL_H;
    drawPreview(off.getContext("2d"), style, bags, { hook, showPrice })
      .then(() => {
        if (!stale) ctx.drawImage(off, 0, 0);
      })
      .catch(() => {})
      .finally(() => {
        off.width = 1;
        off.height = 1;
      });
    return () => {
      stale = true;
    };
  }, [bags, style, hook, showPrice, fontsReady, video]);

  function chooseStyle(value) {
    setStyle(value);
    setHook(STYLES[value].hook);
    setVideo(null);
    setPickedIds((ids) => ids.slice(0, STYLES[value].max));
  }

  function choosePhoto(slot, url) {
    setVideo(null);
    setPicks((current) => ({ ...current, [slot.key]: url }));
  }

  function toggleBag(product) {
    setVideo(null);
    setPickedIds((ids) => {
      if (ids.includes(product.id)) return ids.filter((id) => id !== product.id);
      if (rule.max === 1) return [product.id];
      if (ids.length >= rule.max) return ids;
      return [...ids, product.id];
    });
  }

  const enough = rule.kind === "bags" ? bags.length >= rule.min : rule.kind === "colours" ? bags.length >= 2 : bags.length >= 1;
  const group = rule.group;

  async function make() {
    if (!enough || busy) return;
    setBusy(true);
    setNotice("");
    setVideo(null);
    setProgress(0);
    try {
      const started = Date.now();
      const result = await renderReel({
        style,
        bags,
        options: { hook, showPrice, quality },
        onProgress: (value, text) => {
          setProgress(value);
          if (text) setStage(text);
        },
      });
      setVideo({ url: URL.createObjectURL(result.blob), blob: result.blob, seconds: result.seconds, busy: result.busy, took: Math.round((Date.now() - started) / 1000) });
    } catch (error) {
      setNotice(`❌ Video nahi bani: ${error?.message || "dobara try karo"}`);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  async function saveVideo() {
    if (!video) return;
    const type = video.blob.type || "video/mp4";
    const ext = type.includes("webm") ? "webm" : "mp4";
    const file = new File([video.blob], `shrimoh-reel-${style}.${ext}`, { type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNotice("✅ “Save Video” chuno - video Photos mein aa jayegi.");
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = video.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("✅ Video download ho gayi.");
  }

  async function copyCaption() {
    const text = captionFor(style, bags);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const chip = (on, label, onClick, key) => (
    <button type="button" key={key || label} className={on ? "rm-chip on" : "rm-chip"} onClick={onClick} disabled={busy}>
      {label}
    </button>
  );

  return (
    <div className="panel">
      <style>{`
        .rm-wrap { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 24px; align-items: start; }
        @media (max-width: 760px) { .rm-wrap { grid-template-columns: minmax(0, 1fr); } }
        .rm-stage { position: relative; width: 100%; max-width: 300px; margin: 0 auto; aspect-ratio: 9 / 16; border-radius: 14px; overflow: hidden; background: #eee; border: 1px solid #e5e0d5; }
        .rm-stage canvas, .rm-stage video { width: 100%; height: 100%; display: block; object-fit: cover; }
        .rm-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px; color: #777; font-size: 14px; }
        .rm-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .rm-chip { padding: 9px 14px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: #111; }
        .rm-chip.on { background: #1c150d; color: #fff; border-color: #1c150d; }
        .rm-btn { padding: 12px 16px; border-radius: 12px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 15px; cursor: pointer; }
        .rm-btn.main { background: #1c150d; color: #fff; }
        .rm-btn:disabled, .rm-chip:disabled { opacity: 0.45; cursor: default; }
        .rm-bags { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; max-height: 360px; overflow-y: auto; margin-bottom: 10px; }
        .rm-bag { position: relative; padding: 0 0 4px; border: 2px solid #eee; border-radius: 10px; overflow: hidden; background: #fff; cursor: pointer; display: flex; flex-direction: column; }
        .rm-bag img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; background: #fff; }
        .rm-name { font-size: 10px; line-height: 1.2; color: #333; padding: 2px 4px 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: left; }
        .rm-slot { margin-bottom: 12px; }
        .rm-slot-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #222; }
        .rm-photos { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
        .rm-photo { flex: 0 0 74px; height: 92px; padding: 0; border: 2px solid #e5e5e5; border-radius: 10px; overflow: hidden; background: #fff; cursor: pointer; }
        .rm-photo img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .rm-photo.on { border-color: #1c150d; box-shadow: 0 0 0 2px #1c150d; }
        .rm-bag.on { border-color: #1c150d; }
        .rm-num { position: absolute; top: 4px; left: 4px; background: #1c150d; color: #fff; border-radius: 999px; font-size: 11px; min-width: 20px; height: 20px; line-height: 20px; text-align: center; }
        .rm-bar { height: 8px; background: #eee; border-radius: 99px; overflow: hidden; margin: 10px 0 4px; }
        .rm-bar div { height: 100%; background: #1c150d; transition: width 0.2s; }
        .rm-small { font-size: 13px; color: #666; line-height: 1.5; }
        .rm-tip { padding: 12px 14px; background: #f6f3ea; border-radius: 10px; font-size: 14px; line-height: 1.55; margin: 12px 0; }
      `}</style>
      <div className="panel-header">
        <h2 className="panel-title">Reel Maker</h2>
      </div>
      <p className="rm-small" style={{ marginTop: 0 }}>
        Bags chuno → “🎬 Reel banao”. Video phone mein hi banti hai (server par kuch upload nahi hota). Save karke Instagram mein gaana lagao.
      </p>
      {notice ? <div className="rm-tip">{notice}</div> : null}

      <div className="rm-wrap">
        <div>
          <div className="rm-stage">
            {video ? (
              <video src={video.url} controls playsInline muted loop autoPlay />
            ) : (
              <canvas ref={previewRef} />
            )}
            {!video && !bags.length ? <div className="rm-empty">{loading ? "Photos load ho rahi hain..." : "Bags chuno"}</div> : null}
          </div>

          {busy ? (
            <>
              <div className="rm-bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="rm-small">
                {stage || "Video ban rahi hai..."} {Math.round(progress * 100)}% · screen on rakho, app mat badlo
              </div>
            </>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
            {!video ? (
              <button type="button" className="rm-btn main" onClick={make} disabled={!enough || busy || loading}>
                🎬 Reel banao
              </button>
            ) : (
              <>
                <button type="button" className="rm-btn main" onClick={saveVideo}>
                  ⬇ Video save karo
                </button>
                <button type="button" className="rm-btn" onClick={() => setVideo(null)}>
                  ✏️ Badlo / nayi
                </button>
              </>
            )}
          </div>
          {video ? (
            <div className="rm-small" style={{ textAlign: "center", marginTop: 6 }}>
              {Math.round(video.seconds)} second ki reel · {video.took} second mein bani
              {video.busy ? " · kuch photos ka background saaf nahi tha (frame ki tarah lagi)" : ""}
            </div>
          ) : null}

          {bags.length ? (
            <div className="rm-tip">
              <b>Instagram mein:</b> + → Reel → video chuno → 🎵 library se gaana → caption paste → “Share to Facebook” on → Share.
              <div style={{ marginTop: 8 }}>
                <button type="button" className="rm-chip" onClick={copyCaption}>
                  {copied ? "✓ Caption copy ho gaya" : "📋 Reel ka caption copy karo"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label className="form-label">Reel kis ki?</label>
          <div className="rm-row">
            {chip(group === "single", "👜 Ek bag (uski photos)", () => group !== "single" && chooseStyle("showcase"), "g1")}
            {chip(group === "multi", "🛍 Kai bags", () => group !== "multi" && chooseStyle("newin"), "g2")}
          </div>
          <label className="form-label">Style ({Object.values(STYLES).filter((item) => item.group === group).length})</label>
          <div className="rm-row">
            {Object.entries(STYLES)
              .filter(([, item]) => item.group === group)
              .map(([value, item]) => chip(style === value, item.label, () => chooseStyle(value), value))}
          </div>

          <label className="form-label">Quality</label>
          <div className="rm-row">
            {Object.entries(QUALITIES).map(([value, item]) => chip(quality === value, item.label, () => { setQuality(value); setVideo(null); }, value))}
          </div>

          <div className="form-group">
            <label className="form-label">Shuru ka text (pehle 2 second)</label>
            <input className="form-input" value={hook} onChange={(event) => { setHook(event.target.value); setVideo(null); }} disabled={busy} />
          </div>

          {style !== "colours" && style !== "guess" ? (
            <label className="form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={showPrice} onChange={(event) => { setShowPrice(event.target.checked); setVideo(null); }} disabled={busy} />
              Har bag ke saath price chhota sa dikhao
            </label>
          ) : null}

          <label className="form-label">
            Bags · {rule.hint} {rule.max > 1 ? `(${pickedIds.length}/${rule.max})` : ""}
          </label>
          <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bags..." style={{ marginBottom: 10 }} />
          <div className="rm-bags">
            {list.map((product) => {
              const index = pickedIds.indexOf(product.id);
              return (
                <button
                  type="button"
                  key={product.id}
                  className={index >= 0 ? "rm-bag on" : "rm-bag"}
                  onClick={() => toggleBag(product)}
                  title={product.name}
                  disabled={busy}
                >
                  <img src={absoluteUrl(API, product.image || (Array.isArray(product.images) ? product.images[0] : ""))} alt={product.name} loading="lazy" />
                  <span className="rm-name">{product.name}</span>
                  {index >= 0 ? <span className="rm-num">{rule.max > 1 ? index + 1 : "✓"}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="rm-small">💡 Reel ka background safed rehta hai aur bag ki photo jaisi hai waisi lagti hai. White background wali photos sabse saaf dikhti hain.</div>

          {slots.length ? (
            <div style={{ marginTop: 16 }}>
              <label className="form-label">📷 Reel mein kaunsi photo aaye? (tap karke chuno)</label>
              {slots.map((slot, slotIndex) => (
                <div key={slot.key} className="rm-slot">
                  <div className="rm-slot-title">
                    {slotIndex + 1}. {slot.title}
                  </div>
                  <div className="rm-photos">
                    {slot.options.map((url) => (
                      <button
                        type="button"
                        key={url}
                        className={slotUrl(slot) === url ? "rm-photo on" : "rm-photo"}
                        onClick={() => choosePhoto(slot, url)}
                        disabled={busy}
                      >
                        <img src={url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
