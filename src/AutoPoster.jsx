import { useEffect, useMemo, useState } from "react";
import { absoluteUrl, drawAd, loadFonts, productVariants } from "./AdMaker";
import { buildCaption } from "./CaptionMaker";

/*
 * ADMIN > AUTO POST (2026-10-29)
 * Pick bags -> Admin makes each bag's carousel by itself and puts it in
 * the auto line:
 *   for every colour:  slide = that colour's front photo WITH name + price
 *                      (Clean · text below), then 1-2 more photos of that
 *                      colour WITHOUT text (No text · only bag)
 *   max 10 slides, one background per post, Cream and Black take turns,
 *   short caption added automatically.
 * The server puts the next post live every time cron-job.org calls it
 * (e.g. 4 times a day). Photos are deleted from storage after posting.
 */

const SERVER_URL = "https://luxora-store-mkva.onrender.com";

function friendly(error) {
  const text = String(error?.message || error || "");
  if (/load failed|failed to fetch|network/i.test(text)) return "Internet / server se baat nahi ho payi. Dobara try karo.";
  return text || "Kuch gadbad hui.";
}

export default function AutoPoster({ API, adminFetch, products }) {
  const [queue, setQueue] = useState(null); // { items, history, lastPostAt, lastBg, cronReady }
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  async function refresh() {
    try {
      const response = await adminFetch(`${API}/api/admin/social/auto`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
      setQueue(data);
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    }
  }

  useEffect(() => {
    refresh();
    loadFonts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queuedIds = useMemo(() => new Set((queue?.items || []).map((item) => String(item.productId))), [queue]);
  const list = useMemo(() => {
    const active = (Array.isArray(products) ? products : []).filter((p) => p && p.active !== false);
    const q = search.trim().toLowerCase();
    return q ? active.filter((p) => String(p.name || "").toLowerCase().includes(q)) : active;
  }, [products, search]);

  async function loadImage(url) {
    let blob;
    try {
      const direct = await fetch(url, { mode: "cors" });
      if (!direct.ok) throw new Error("direct");
      blob = await direct.blob();
    } catch {
      const response = await adminFetch(`${API}/api/admin/photo-original?url=${encodeURIComponent(url)}`);
      if (!response.ok) throw new Error("Photo load nahi hui");
      blob = await response.blob();
    }
    const objectUrl = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });
    return { img, objectUrl };
  }

  async function upload(dataUrl) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, direct: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) throw new Error(data.message || `Server error ${response.status}`);
        return data.url;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return "";
  }

  // One bag -> slide plan (colour front WITH price, then photos WITHOUT text)
  function slidesFor(product) {
    const slides = [];
    for (const variant of productVariants(API, product)) {
      if (!variant.urls.length || slides.length >= 10) continue;
      slides.push({ url: variant.urls[0], template: "below", colour: variant.label });
      for (const url of variant.urls.slice(1, 3)) {
        if (slides.length >= 10) break;
        slides.push({ url, template: "only", colour: variant.label });
      }
    }
    return slides;
  }

  // (v2) Admin picks the bags itself: bags that were never posted first,
  // then the ones that waited longest; bags already in the line are skipped.
  function autoPick(count) {
    const posted = queue?.posted || {};
    const inLine = new Set((queue?.items || []).map((item) => String(item.productId)));
    const active = (Array.isArray(products) ? products : []).filter(
      (p) => p && p.active !== false && !inLine.has(String(p.id)) && productVariants(API, p).some((v) => v.urls.length)
    );
    return active
      .map((p, index) => ({ p, index, at: Number(posted[String(p.id)]) || 0 }))
      .sort((a, b) => a.at - b.at || a.index - b.index)
      .slice(0, count)
      .map((entry) => entry.p);
  }

  async function makePosts(list) {
    const chosen = list || picked.map((id) => (products || []).find((p) => p.id === id)).filter(Boolean);
    if (!chosen.length || busy) return;
    setBusy(true);
    setNotice("");
    await loadFonts();
    let bg = queue?.lastBg === "cream" ? "black" : "cream";
    const items = [];
    try {
      for (let index = 0; index < chosen.length; index++) {
        const product = chosen[index];
        const plan = slidesFor(product);
        if (!plan.length) continue;
        const urls = [];
        for (let s = 0; s < plan.length; s++) {
          setProgress(`${index + 1}/${chosen.length} “${product.name}” · slide ${s + 1}/${plan.length} ban rahi hai...`);
          const { img, objectUrl } = await loadImage(plan[s].url);
          const canvas = document.createElement("canvas");
          canvas.width = 1080;
          canvas.height = 1350;
          drawAd(canvas.getContext("2d"), {
            W: 1080,
            H: 1350,
            img,
            template: plan[s].template,
            fit: "fit",
            d: { name: product.name || "", price: Number(product.price) || 0, mrp: Number(product.oldPrice) || 0, slogan: "", footer: "", showBadge: false, bg },
          });
          URL.revokeObjectURL(objectUrl);
          urls.push(await upload(canvas.toDataURL("image/jpeg", 0.92)));
          canvas.width = 1;
          canvas.height = 1;
        }
        const hookIndex = Math.floor(Math.random() * 6);
        const args = { product, name: product.name || "", price: product.price, mrp: product.oldPrice, hookIndex };
        items.push({
          label: product.name || "Post",
          productId: product.id,
          bg,
          imageUrls: urls,
          captions: { instagram: buildCaption("instagram", args), facebook: buildCaption("facebook", args) },
          targets: ["instagram", "facebook"],
        });
        bg = bg === "cream" ? "black" : "cream";
      }
      setProgress("Line mein daal rahe hain...");
      const response = await adminFetch(`${API}/api/admin/social/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
      setQueue((current) => ({ ...current, ...data }));
      setPicked([]);
      setNotice(`✅ ${items.length} posts auto line mein daal di. Ye apne-aap time par lagengi.`);
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function action(path, options = {}) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch(`${API}${path}`, options);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
      setQueue((current) => ({ ...current, ...data }));
      if (data.results) {
        const ok = Object.values(data.results).every((r) => r.ok);
        setNotice(ok ? "✅ Post lag gayi!" : `⚠️ ${Object.entries(data.results).map(([k, r]) => `${k}: ${r.ok ? "✅" : r.message}`).join(" · ")}`);
      }
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const items = queue?.items || [];
  const history = queue?.history || [];
  const cronUrl = `${SERVER_URL}/api/cron/social-post?key=APNA-SECRET`;

  return (
    <div className="panel">
      <style>{`
        .ap-box { border: 1px solid #e8e2d6; border-radius: 14px; padding: 14px; margin-bottom: 16px; background: #fffdf8; }
        .ap-btn { padding: 11px 14px; border-radius: 12px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .ap-btn.main { background: #1c150d; color: #fff; }
        .ap-btn:disabled { opacity: 0.45; }
        .ap-mini { padding: 4px 9px; border-radius: 8px; border: 1px solid #ccc; background: #fff; font-size: 12px; cursor: pointer; color: #111; }
        .ap-bags { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; max-height: 380px; overflow-y: auto; margin: 10px 0; }
        .ap-bag { position: relative; padding: 0 0 4px; border: 2px solid #eee; border-radius: 10px; background: #fff; cursor: pointer; overflow: hidden; display: flex; flex-direction: column; }
        .ap-bag img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #fff; }
        .ap-bag span { font-size: 10px; line-height: 1.2; padding: 2px 4px 0; text-align: left; color: #333; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .ap-bag.on { border-color: #1c150d; }
        .ap-bag .n { position: absolute; top: 4px; left: 4px; background: #1c150d; color: #fff; border-radius: 99px; font-size: 11px; padding: 1px 7px; }
        .ap-bag .q { position: absolute; top: 4px; right: 4px; background: #e8f5e9; color: #1b5e20; border-radius: 99px; font-size: 10px; padding: 1px 6px; }
        .ap-item { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0ebe0; }
        .ap-thumbs { display: flex; gap: 3px; flex: 0 0 auto; max-width: 150px; flex-wrap: wrap; }
        .ap-thumbs img { width: 34px; height: 42px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
        .ap-small { font-size: 12px; color: #666; line-height: 1.5; }
        .ap-code { font-family: monospace; font-size: 12px; background: #f3f0ea; padding: 6px 8px; border-radius: 8px; overflow-wrap: anywhere; display: block; margin: 4px 0; }
      `}</style>
      <div className="panel-header">
        <h2 className="panel-title">Auto Post</h2>
      </div>

      <div className="ap-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {queue?.cronReady ? "✅ Auto post chalu hai" : "⚙️ Auto post ka setup baaki hai"}
        </div>
        <div className="ap-small">
          Line mein {items.length} posts hain. Har baar timer chalne par line ki pehli post Instagram + Facebook par lag jaati hai
          (do posts ke beech kam se kam 1 ghanta). Post lagne ke baad uski photos server se hat jaati hain.
        </div>
        <button type="button" className="ap-mini" style={{ marginTop: 8 }} onClick={() => setShowSetup((v) => !v)}>
          {showSetup ? "▲ Setup band karo" : "🔧 Setup kaise karein (ek baar)"}
        </button>
        {showSetup ? (
          <div className="ap-small" style={{ marginTop: 8, color: "#333" }}>
            <b>1. Render:</b> server → Environment → Add: <span className="ap-code">CRON_SECRET = koi bhi lamba secret (jaise shrimoh-auto-4829xk)</span>
            <b>2. cron-job.org:</b> Create cronjob → URL:
            <span className="ap-code">{cronUrl}</span>
            (APNA-SECRET ki jagah wahi secret) → Schedule: Every day, hours <b>10, 13, 17, 20</b>, minute <b>0</b>, timezone <b>Asia/Kolkata</b> → Save.
            <br />
            Bas. Din mein 4 baar line ki agli post apne-aap lagegi.
          </div>
        ) : null}
      </div>

      {notice ? <div className="ap-box" style={{ fontSize: 14 }}>{notice}</div> : null}

      <div className="ap-box" style={{ borderColor: "#1c150d", borderWidth: 2 }}>
        <div style={{ fontWeight: 700 }}>🪄 Bags khud chuno aur posts banao</div>
        <div className="ap-small" style={{ marginBottom: 8 }}>
          Ek tap: Admin khud bags chunta hai (jo kabhi post nahi hue wo pehle, phir jinko sabse zyada din ho gaye), post banata hai aur
          line mein daal deta hai. Hafte mein bas ek baar dabana hai.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            [8, "8 posts"],
            [14, "14 posts (1 hafta, din mein 2)"],
            [28, "28 posts (1 hafta, din mein 4)"],
          ].map(([count, label]) => (
            <button type="button" key={count} className="ap-btn" disabled={busy} onClick={() => makePosts(autoPick(count))}>
              {label}
            </button>
          ))}
        </div>
        {progress ? <div className="ap-small" style={{ marginTop: 6 }}>{progress} · screen on rakho</div> : null}
      </div>

      <div className="ap-box">
        <div style={{ fontWeight: 700 }}>➕ Ya khud bags chuno</div>
        <div className="ap-small">
          Bags chuno. Har bag ki post apne-aap banegi: har colour ki pehli photo naam + price ke saath, phir 1-2 photos bina text.
          Ek post Cream, agli Black. Caption bhi khud lagega.
        </div>
        <input className="form-input" style={{ marginTop: 10 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bags..." />
        <div className="ap-bags">
          {list.map((product) => {
            const index = picked.indexOf(product.id);
            return (
              <button
                type="button"
                key={product.id}
                className={index >= 0 ? "ap-bag on" : "ap-bag"}
                disabled={busy}
                onClick={() => setPicked((ids) => (ids.includes(product.id) ? ids.filter((id) => id !== product.id) : [...ids, product.id]))}
              >
                <img src={absoluteUrl(API, product.image || (Array.isArray(product.images) ? product.images[0] : ""))} alt="" loading="lazy" />
                <span>{product.name}</span>
                {index >= 0 ? <b className="n">{index + 1}</b> : null}
                {queuedIds.has(String(product.id)) ? <b className="q">line mein</b> : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="ap-btn main" onClick={() => makePosts()} disabled={busy || !picked.length}>
          {busy && progress ? "Ban rahi hain..." : `🪄 ${picked.length || ""} posts banao aur line mein daalo`}
        </button>
        {progress ? <div className="ap-small" style={{ marginTop: 6 }}>{progress} · screen on rakho</div> : null}
      </div>

      <div className="ap-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Auto line ({items.length})</div>
        {!items.length ? <div className="ap-small">Line khaali hai. Upar se bags chuno.</div> : null}
        {items.map((item, index) => (
          <div className="ap-item" key={item.id}>
            <div className="ap-thumbs">
              {item.imageUrls.slice(0, 4).map((url) => (
                <img key={url} src={url} alt="" />
              ))}
              {item.imageUrls.length > 4 ? <span className="ap-small">+{item.imageUrls.length - 4}</span> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" }}>
                {index + 1}. {item.label}
              </div>
              <div className="ap-small">
                {item.imageUrls.length} slides · {item.bg === "black" ? "Black" : "Cream"}
                {item.tries ? ` · dobara try: ${item.targets.join(", ")}` : ""}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                <button type="button" className="ap-mini" disabled={busy || index === 0} onClick={() => action(`/api/admin/social/auto/${item.id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: -1 }) })}>▲</button>
                <button type="button" className="ap-mini" disabled={busy || index === items.length - 1} onClick={() => action(`/api/admin/social/auto/${item.id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: 1 }) })}>▼</button>
                <button type="button" className="ap-mini" disabled={busy} onClick={() => window.confirm("Ye post abhi Instagram + Facebook par daal dun?") && action(`/api/admin/social/auto/${item.id}/now`, { method: "POST" })}>🚀 Abhi daalo</button>
                <button type="button" className="ap-mini" disabled={busy} onClick={() => window.confirm("Line se hata dun?") && action(`/api/admin/social/auto/${item.id}`, { method: "DELETE" })}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {history.length ? (
        <div className="ap-box">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Lag chuki posts</div>
          {history.slice(0, 10).map((entry) => (
            <div className="ap-small" key={`${entry.at}-${entry.label}`} style={{ padding: "4px 0" }}>
              {new Date(entry.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {entry.label} ·{" "}
              {Object.entries(entry.results || {})
                .map(([k, r]) => `${k === "instagram" ? "IG" : "FB"} ${r.ok ? "✅" : "❌"}`)
                .join(" ")}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
