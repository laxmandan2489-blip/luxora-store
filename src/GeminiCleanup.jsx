import { useRef, useState } from "react";
import { removeGeminiMarkFromImage } from "./geminiMark";

/*
 * ADMIN > PRODUCTS > "Purani photos - Gemini ✦ check" (2026-10-27)
 * -----------------------------------------------------------------
 * Step 1 (Check): looks at every saved product photo (gallery + every
 *   colour) in the browser and lists the ones that still have Gemini's
 *   ✦, with a before / after preview of the corner. Nothing is changed.
 * Step 2 (Save): only for the ticked photos - cleans them again, saves
 *   the clean copy (same route the AI photos use:
 *   /api/admin/products/save-generated-image) and swaps the link in that
 *   product's gallery / colour photos, keeping the same order. All other
 *   product details are not sent, so they can't change.
 * Uses geminiMark.js - photos without a ✦ are never touched.
 */

const CHECK_AT_ONCE = 3;

function fullUrl(API, image) {
  const value = String(image || "").trim();
  if (!value) return "";
  if (/^(https?:|data:)/.test(value)) return value;
  return value.startsWith("/") ? `${API}${value}` : `${API}/${value}`;
}

function productPhotos(product) {
  const list = [...(Array.isArray(product?.images) ? product.images : [])];
  const colorImages = product?.colorImages || {};
  for (const urls of Object.values(colorImages)) {
    if (Array.isArray(urls)) list.push(...urls);
  }
  return [...new Set(list.filter(Boolean))];
}

async function loadBitmap(API, adminFetch, image) {
  const url = fullUrl(API, image);
  let blob = null;
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    blob = await response.blob();
  } catch {
    // Photo's site doesn't allow direct reading - go through our server.
    const response = await adminFetch(
      `${API}/api/admin/photo-original?url=${encodeURIComponent(url)}`
    );
    if (!response.ok) throw new Error("Photo load nahi hui");
    blob = await response.blob();
  }
  return createImageBitmap(blob);
}

// Small preview of the bottom-right corner (where the ✦ sits).
function cornerThumb(source, W, H) {
  const box = Math.min(W, H, Math.max(160, Math.round(Math.max(W, H) * 0.22)));
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  canvas.getContext("2d").drawImage(source, W - box, H - box, box, box, 0, 0, 120, 120);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function runWithLimit(items, limit, worker, stopRef) {
  let next = 0;
  async function lane() {
    while (next < items.length && !stopRef.current) {
      const current = next++;
      await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

export default function GeminiCleanup({ API, adminFetch, products, onDone }) {
  const [phase, setPhase] = useState("idle"); // idle | checking | checked | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [found, setFound] = useState([]);
  const [failed, setFailed] = useState(0);
  const [saveReport, setSaveReport] = useState(null);
  const stopRef = useRef(false);

  async function startCheck() {
    stopRef.current = false;
    const jobs = [];
    for (const product of products || []) {
      for (const image of productPhotos(product)) {
        jobs.push({ product, image });
      }
    }
    setFound([]);
    setFailed(0);
    setSaveReport(null);
    setProgress({ done: 0, total: jobs.length });
    setPhase("checking");

    let done = 0;
    await runWithLimit(
      jobs,
      CHECK_AT_ONCE,
      async ({ product, image }) => {
        try {
          const bitmap = await loadBitmap(API, adminFetch, image);
          const W = bitmap.width, H = bitmap.height;
          const cleaned = removeGeminiMarkFromImage(bitmap, W, H);
          if (cleaned) {
            const item = {
              key: `${product.id}::${image}`,
              productId: product.id,
              productName: product.name || `Product ${product.id}`,
              image,
              before: cornerThumb(bitmap, W, H),
              after: cornerThumb(cleaned, W, H),
              selected: true,
            };
            setFound((list) => [...list, item]);
          }
          bitmap.close?.();
        } catch (error) {
          console.warn("Gemini check failed for", image, error);
          setFailed((count) => count + 1);
        }
        done += 1;
        setProgress({ done, total: jobs.length });
      },
      stopRef
    );
    setPhase("checked");
  }

  function toggle(key) {
    setFound((list) => list.map((item) => (item.key === key ? { ...item, selected: !item.selected } : item)));
  }

  async function saveSelected() {
    const selected = found.filter((item) => item.selected);
    if (!selected.length) return;
    if (!window.confirm(`${selected.length} photos saaf karke website par badal dun?`)) return;

    stopRef.current = false;
    setPhase("saving");
    const byProduct = new Map();
    for (const item of selected) {
      if (!byProduct.has(item.productId)) byProduct.set(item.productId, []);
      byProduct.get(item.productId).push(item);
    }
    const report = { photosSaved: 0, productsSaved: 0, errors: [] };
    let done = 0;
    setProgress({ done: 0, total: selected.length });

    for (const [productId, items] of byProduct) {
      if (stopRef.current) break;
      const product = (products || []).find((entry) => entry.id === productId);
      if (!product) continue;
      const swap = {};
      for (const item of items) {
        try {
          const bitmap = await loadBitmap(API, adminFetch, item.image);
          const cleaned = removeGeminiMarkFromImage(bitmap, bitmap.width, bitmap.height);
          bitmap.close?.();
          if (cleaned) {
            const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: canvasToDataUrl(cleaned) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.url) throw new Error(data?.message || "Save nahi hui");
            swap[item.image] = data.url;
          }
        } catch (error) {
          report.errors.push(`${item.productName}: ${error.message}`);
        }
        done += 1;
        setProgress({ done, total: selected.length });
      }
      if (!Object.keys(swap).length) continue;

      try {
        // Same order as before, only the cleaned links are swapped.
        const images = (product.images || []).map((url) => swap[url] || url);
        const colorImages = {};
        for (const [color, urls] of Object.entries(product.colorImages || {})) {
          colorImages[color] = (urls || []).map((url) => swap[url] || url);
        }
        const formData = new FormData();
        if (images.length) formData.append("keepImages", JSON.stringify(images));
        formData.append("colorImages", JSON.stringify(colorImages));
        const response = await adminFetch(`${API}/api/products/${productId}`, {
          method: "PUT",
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
          throw new Error(data?.message || `Server error ${response.status}`);
        }
        report.photosSaved += Object.keys(swap).length;
        report.productsSaved += 1;
      } catch (error) {
        report.errors.push(`${product.name || productId}: ${error.message}`);
      }
    }

    setSaveReport(report);
    setFound([]);
    setPhase("done");
    onDone?.();
  }

  const busy = phase === "checking" || phase === "saving";
  const selectedCount = found.filter((item) => item.selected).length;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Purani photos - Gemini ✦ check</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "#666", fontSize: 14, lineHeight: 1.5 }}>
        Website par lagi saari product photos (har colour ki bhi) check karta hai. Pehle sirf
        list dikhayega, kuch nahi badlega. Phir aap tick wali photos saaf karke save kar sakte ho.
        Jitni der chale, screen on rakhna.
      </p>

      {!busy && (
        <button type="button" className="secondary-button" onClick={startCheck} disabled={!products?.length}>
          {phase === "idle" || phase === "done" ? "🔍 Purani photos check karo" : "🔍 Dobara check karo"}
        </button>
      )}

      {busy && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>
            {phase === "checking" ? "Check ho raha hai" : "Save ho raha hai"}: {progress.done} / {progress.total}
            {phase === "checking" ? ` · ✦ mila: ${found.length}` : ""}
          </span>
          <button type="button" className="secondary-button" onClick={() => { stopRef.current = true; }}>
            Rok do
          </button>
        </div>
      )}

      {phase === "checked" && (
        <p style={{ fontSize: 14, margin: "12px 0" }}>
          {progress.done} photos check hui. {found.length ? `${found.length} mein ✦ mila.` : "Kisi mein ✦ nahi mila. 👍"}
          {failed ? ` (${failed} photos load nahi hui, unhe chhod diya.)` : ""}
        </p>
      )}

      {saveReport && (
        <div style={{ fontSize: 14, margin: "12px 0" }}>
          <p style={{ margin: "0 0 6px" }}>
            ✅ {saveReport.photosSaved} photos saaf ho gayi ({saveReport.productsSaved} products).
          </p>
          {saveReport.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#b42318" }}>
              {saveReport.errors.map((message, index) => <li key={index}>{message}</li>)}
            </ul>
          )}
        </div>
      )}

      {found.length > 0 && (
        <>
          {phase === "checked" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 12px" }}>
              <button type="button" className="add-button" onClick={saveSelected} disabled={!selectedCount}>
                ✨ {selectedCount} photos saaf karke save karo
              </button>
            </div>
          )}
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>
            Har photo ka neeche-daaya kona: pehle → baad mein. Jo nahi badalni, uska tick hata do.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {found.map((item) => (
              <label
                key={item.key}
                style={{
                  display: "block",
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 8,
                  opacity: item.selected ? 1 : 0.5,
                  cursor: phase === "checked" ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <img src={item.before} alt="pehle" style={{ width: "50%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }} />
                  <img src={item.after} alt="baad mein" style={{ width: "50%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    disabled={phase !== "checked"}
                    onChange={() => toggle(item.key)}
                  />
                  <span style={{ overflowWrap: "anywhere" }}>{item.productName}</span>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
