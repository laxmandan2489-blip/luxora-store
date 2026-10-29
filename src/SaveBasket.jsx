import { useEffect, useState } from "react";

/*
 * SAVE BASKET (2026-10-29) - Ad Maker + Story Maker
 * --------------------------------------------------
 * Only for saving photos to the phone - has nothing to do with the
 * Instagram / Facebook posting box.
 * "➕ Basket mein jodo" keeps the design exactly as it looks now (text /
 * no text, cream / black, any bag). Make the next one, add it too.
 * "⬇ Saari photos save karo" opens the iPhone share sheet once ->
 * "Save N Images" -> all go to Photos together, in basket order.
 * The basket stays while you move around Admin (until the page reloads).
 */

const MAX = 30;
const store = {}; // key -> items, survives switching Admin tabs
const listeners = {};

function setStore(key, items) {
  store[key] = items;
  (listeners[key] || []).forEach((fn) => fn(items));
}

function dataUrlToFile(dataUrl, name) {
  const [head, data] = String(dataUrl).split(",");
  const type = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const binary = atob(data || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type });
}

function slug(text) {
  return String(text || "shrimoh").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 30).toLowerCase() || "shrimoh";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export default function SaveBasket({ basketKey, getImage, canAdd = true, label = "", getLink, word = "photo" }) {
  const [items, setItems] = useState(() => store[basketKey] || []);
  const [note, setNote] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    const fn = (next) => setItems(next);
    listeners[basketKey] = [...(listeners[basketKey] || []), fn];
    return () => {
      listeners[basketKey] = (listeners[basketKey] || []).filter((entry) => entry !== fn);
    };
  }, [basketKey]);

  function add() {
    const dataUrl = getImage && getImage();
    if (!dataUrl || items.length >= MAX) return;
    setStore(basketKey, [
      ...items,
      { id: `${Date.now()}-${Math.random()}`, dataUrl, label: String(label || "").trim() || "shrimoh", link: (getLink && getLink()) || "" },
    ]);
    setNote(`✓ Jud gayi (${items.length + 1}). Agla design banao aur phir jodo.`);
  }

  function move(index, step) {
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setStore(basketKey, next);
  }

  async function saveAll() {
    if (!items.length) return;
    try {
      const files = items.map((item, index) => dataUrlToFile(item.dataUrl, `${String(index + 1).padStart(2, "0")}-${slug(item.label)}.jpg`));
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files });
        setNote(`✅ “Save ${files.length} Images” chuno - sab Photos mein aa jayengi. Basket khaali karna ho to “Sab hatao”.`);
        return;
      }
      for (const file of files) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      setNote(`✅ ${files.length} photos download ho gayi.`);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setNote(`❌ Save nahi hua: ${error?.message || "dobara try karo"}`);
    }
  }

  async function copyLink(item) {
    const ok = await copyText(item.link);
    setCopiedId(ok ? item.id : null);
    if (ok) window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 2000);
  }

  return (
    <div className="sb-box">
      <style>{`
        .sb-box { margin: 10px 0 14px; padding: 12px; border: 1px solid #e8e2d6; border-radius: 12px; background: #fcfbf8; }
        .sb-title { font-weight: 700; font-size: 14px; }
        .sb-small { font-size: 12px; color: #666; line-height: 1.5; margin-top: 4px; }
        .sb-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
        .sb-btn { padding: 9px 14px; border-radius: 10px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .sb-btn.main { background: #1c150d; color: #fff; }
        .sb-btn:disabled { opacity: 0.45; cursor: default; }
        .sb-list { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 6px; }
        .sb-item { flex: 0 0 76px; text-align: center; }
        .sb-item img { width: 76px; height: auto; border-radius: 6px; border: 1px solid #ddd; display: block; }
        .sb-num { font-size: 11px; color: #555; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sb-tools { display: flex; gap: 2px; justify-content: center; margin-top: 3px; flex-wrap: wrap; }
        .sb-mini { padding: 3px 6px; border-radius: 6px; border: 1px solid #ccc; background: #fff; color: #111; font-size: 11px; cursor: pointer; }
      `}</style>
      <div className="sb-title">📱 Phone mein ek saath save</div>
      <div className="sb-small">
        Har design ko “Basket mein jodo”, phir ek baar “Saari save karo”. Jaisa design dikh raha hai waisa hi save hoga.
      </div>
      <div className="sb-row">
        <button type="button" className="sb-btn" onClick={add} disabled={!canAdd || items.length >= MAX}>
          ➕ Basket mein jodo ({items.length})
        </button>
        <button type="button" className="sb-btn main" onClick={saveAll} disabled={!items.length}>
          ⬇ Saari {items.length || ""} {word} save karo
        </button>
      </div>
      {items.length > 0 && (
        <>
          <div className="sb-list">
            {items.map((item, index) => (
              <div className="sb-item" key={item.id}>
                <img src={item.dataUrl} alt="" />
                <div className="sb-num">
                  {index + 1}. {item.label}
                </div>
                <div className="sb-tools">
                  <button type="button" className="sb-mini" onClick={() => move(index, -1)} disabled={index === 0}>◀</button>
                  <button type="button" className="sb-mini" onClick={() => setStore(basketKey, items.filter((entry) => entry.id !== item.id))}>✕</button>
                  <button type="button" className="sb-mini" onClick={() => move(index, 1)} disabled={index === items.length - 1}>▶</button>
                </div>
                {item.link && (
                  <div className="sb-tools">
                    <button type="button" className="sb-mini" onClick={() => copyLink(item)}>
                      {copiedId === item.id ? "✓ Copy" : "📋 Link"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="sb-mini" onClick={() => window.confirm("Basket khaali kar dun?") && setStore(basketKey, [])}>
            🗑 Sab hatao
          </button>
        </>
      )}
      {note && <div className="sb-small">{note}</div>}
    </div>
  );
}
