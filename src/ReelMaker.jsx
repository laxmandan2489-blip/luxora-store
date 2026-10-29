import { useEffect, useMemo, useRef, useState } from "react";
import { loadFonts, productVariants, absoluteUrl } from "./AdMaker";
import { STUDIO_BACKGROUNDS } from "./studioDesign";
import { renderReel, drawPreview, REEL_W, REEL_H } from "./reelEngine";

/*
 * ADMIN > REEL MAKER (2026-10-29)
 * Pick bags -> one tap -> a ready 9:16 MP4 reel (Studio look, slow zoom,
 * soft fades, text). Made fully on the phone (reelEngine.js): nothing is
 * uploaded or stored on Supabase / Render / Vercel. Save the video, then
 * add a song in Instagram.
 */

const STYLES = {
  newin: { label: "New in", hint: "3 se 6 bags chuno.", min: 3, max: 6, hook: "new in this week" },
  colours: { label: "Kaunsa colour? 1-2-3", hint: "Ek bag chuno jiske 2-4 colour hon.", min: 1, max: 1, hook: "kaunsa colour lenge?" },
  guess: { label: "Guess the price", hint: "Ek bag chuno (uski 1-3 photos use hongi).", min: 1, max: 1, hook: "guess the price 👀" },
};

function captionFor(style, bags) {
  const first = bags[0] || {};
  const tags = "#handbags #bagsforwomen #handbagsindia #newin #shrimoh #officebag #bagsofinstagram";
  if (style === "colours") {
    return [`${first.name || "new bag"} 🤍`, "kaunsa colour aapka? comment karo 👇", "", "free delivery on prepaid orders · cash on delivery available", "shop via the link in bio ✦", "", tags].join("\n");
  }
  if (style === "guess") {
    return [`${first.name || "new bag"}`, "guess kiya? price video ke end mein 👀", "", "free delivery on prepaid orders · cash on delivery available", "shop via the link in bio ✦", "", tags].join("\n");
  }
  const names = bags.map((bag) => `— ${bag.name}`).filter((line) => line.length > 2);
  return ["new in this week ✨", "", ...names, "", "free delivery on prepaid orders · cash on delivery available", "shop via the link in bio ✦", "", tags].join("\n");
}

export default function ReelMaker({ API, adminFetch, products }) {
  const previewRef = useRef(null);
  const cache = useRef(new Map());
  const [style, setStyle] = useState("newin");
  const [bg, setBg] = useState("beige");
  const [hook, setHook] = useState(STYLES.newin.hook);
  const [showPrice, setShowPrice] = useState(true);
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

  // Load the photos the chosen style needs.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const chosen = pickedIds.map((id) => list.find((product) => product.id === id) || (products || []).find((product) => product.id === id)).filter(Boolean);
      if (!chosen.length) {
        setBags([]);
        return;
      }
      setLoading(true);
      setNotice("");
      try {
        let next = [];
        if (style === "newin") {
          for (const product of chosen) {
            const first = productVariants(API, product)[0];
            const source = (first && first.urls[0]) || product.image;
            next.push({ img: await loadPhoto(product, source), name: product.name || "", price: Number(product.price) || 0, mrp: Number(product.oldPrice) || 0 });
          }
        } else if (style === "colours") {
          const product = chosen[0];
          const variants = productVariants(API, product).filter((variant) => variant.urls[0]).slice(0, 4);
          if (variants.length < 2) setNotice("⚠️ Is bag ka ek hi colour hai. “Kaunsa colour” ke liye 2-4 colour wala bag chuno.");
          for (const variant of variants) {
            next.push({ img: await loadPhoto(product, variant.urls[0]), name: product.name || "", label: variant.label, price: Number(product.price) || 0, mrp: Number(product.oldPrice) || 0 });
          }
        } else {
          const product = chosen[0];
          const urls = Array.from(new Set(productVariants(API, product).flatMap((variant) => variant.urls))).slice(0, 3);
          for (const url of urls) {
            next.push({ img: await loadPhoto(product, url), name: product.name || "", price: Number(product.price) || 0, mrp: Number(product.oldPrice) || 0 });
          }
          if (next.length && !(Number(product.price) > 0)) setNotice("⚠️ Is bag ka price khaali hai - Products mein price bharo.");
        }
        if (!cancelled) setBags(next);
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
  }, [pickedIds, style]);

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
    drawPreview(ctx, style, bags, { bg, hook, showPrice });
  }, [bags, style, bg, hook, showPrice, fontsReady, video]);

  function chooseStyle(value) {
    setStyle(value);
    setHook(STYLES[value].hook);
    setVideo(null);
    setPickedIds((ids) => ids.slice(0, STYLES[value].max));
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

  const enough = style === "newin" ? bags.length >= rule.min : style === "colours" ? bags.length >= 2 : bags.length >= 1;

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
        options: { bg, hook, showPrice },
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
        .rm-bags { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; max-height: 340px; overflow-y: auto; margin-bottom: 14px; }
        .rm-bag { position: relative; padding: 0; border: 2px solid transparent; border-radius: 10px; overflow: hidden; background: #f4f1ea; cursor: pointer; aspect-ratio: 1; }
        .rm-bag img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
          <label className="form-label">Reel type</label>
          <div className="rm-row">{Object.entries(STYLES).map(([value, item]) => chip(style === value, item.label, () => chooseStyle(value), value))}</div>

          <label className="form-label">Background</label>
          <div className="rm-row">
            {Object.entries(STUDIO_BACKGROUNDS).map(([value, item]) => chip(bg === value, item.label, () => { setBg(value); setVideo(null); }, value))}
          </div>

          <div className="form-group">
            <label className="form-label">Shuru ka text (pehle 2 second)</label>
            <input className="form-input" value={hook} onChange={(event) => { setHook(event.target.value); setVideo(null); }} disabled={busy} />
          </div>

          {style === "newin" ? (
            <label className="form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={showPrice} onChange={(event) => { setShowPrice(event.target.checked); setVideo(null); }} disabled={busy} />
              Har bag ke saath price chhota sa dikhao
            </label>
          ) : null}

          <label className="form-label">
            Bags · {rule.hint} {style === "newin" ? `(${pickedIds.length}/${rule.max})` : ""}
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
                  {index >= 0 ? <span className="rm-num">{style === "newin" ? index + 1 : "✓"}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="rm-small">💡 White / plain background wali photo wale bags sabse premium dikhte hain.</div>
        </div>
      </div>
    </div>
  );
}
