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

const CHECK_AT_ONCE = 4;
const SAVE_AT_ONCE = 2; // free Render server - 2 at a time is safe
// Clean copies kept in memory from the check step, so saving doesn't
// download + clean every photo again. Above this many, the rest are
// redone at save time (keeps the iPhone from running out of memory).
const KEEP_CLEAN_COPIES = 120;

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

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Photo ban nahi payi"))), "image/jpeg", 0.9)
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Photo padh nahi paye"));
    reader.readAsDataURL(blob);
  });
}

// Phone internet / free Render server sometimes drops a request
// ("Load failed" on iPhone). Try again a couple of times before giving up.
async function withRetry(task, tries = 3) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function friendlyError(error) {
  const message = String(error?.message || error || "");
  if (/load failed|failed to fetch|networkerror|network/i.test(message)) {
    return "internet ya server ne jawab nahi diya";
  }
  return message || "pata nahi kyun fail hua";
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
  const cleanCopies = useRef(new Map()); // key -> clean JPEG blob

  async function startCheck() {
    stopRef.current = false;
    const jobs = [];
    for (const product of products || []) {
      for (const image of productPhotos(product)) {
        jobs.push({ product, image });
      }
    }
    cleanCopies.current = new Map();
    let kept = 0;
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
          const bitmap = await withRetry(() => loadBitmap(API, adminFetch, image), 2);
          const W = bitmap.width, H = bitmap.height;
          const cleaned = removeGeminiMarkFromImage(bitmap, W, H);
          if (cleaned) {
            const key = `${product.id}::${image}`;
            if (kept < KEEP_CLEAN_COPIES) {
              kept += 1;
              cleanCopies.current.set(key, await canvasToBlob(cleaned));
            }
            const item = {
              key,
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
    const report = { photosSaved: 0, productsSaved: 0, errors: [], failedKeys: new Set() };
    let done = 0;
    setProgress({ done: 0, total: selected.length });

    // 1) Save the clean photos, a few at a time.
    const swapByProduct = new Map();
    await runWithLimit(
      selected,
      SAVE_AT_ONCE,
      async (item) => {
        try {
          let blob = cleanCopies.current.get(item.key);
          if (!blob) {
            const bitmap = await withRetry(() => loadBitmap(API, adminFetch, item.image));
            const cleaned = removeGeminiMarkFromImage(bitmap, bitmap.width, bitmap.height);
            bitmap.close?.();
            if (!cleaned) throw new Error("✦ dobara nahi mila, photo nahi badli");
            blob = await canvasToBlob(cleaned);
          }
          const dataUrl = await blobToDataUrl(blob);
          const data = await withRetry(async () => {
            const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json?.url) throw new Error(json?.message || `Server error ${response.status}`);
            return json;
          });
          if (!swapByProduct.has(item.productId)) swapByProduct.set(item.productId, {});
          swapByProduct.get(item.productId)[item.image] = data.url;
        } catch (error) {
          report.errors.push(`${item.productName}: ${friendlyError(error)}`);
          report.failedKeys.add(item.key);
        }
        done += 1;
        setProgress({ done, total: selected.length });
      },
      stopRef
    );

    // 2) Swap the links in each product (same order as before).
    const productIds = [...swapByProduct.keys()];
    await runWithLimit(
      productIds,
      2,
      async (productId) => {
        const product = (products || []).find((entry) => entry.id === productId);
        const swap = swapByProduct.get(productId);
        if (!product || !swap) return;
        try {
          const images = (product.images || []).map((url) => swap[url] || url);
          const colorImages = {};
          for (const [color, urls] of Object.entries(product.colorImages || {})) {
            colorImages[color] = (urls || []).map((url) => swap[url] || url);
          }
          const formData = new FormData();
          if (images.length) formData.append("keepImages", JSON.stringify(images));
          formData.append("colorImages", JSON.stringify(colorImages));
          await withRetry(async () => {
            const response = await adminFetch(`${API}/api/products/${productId}`, {
              method: "PUT",
              body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data?.success === false) {
              throw new Error(data?.message || `Server error ${response.status}`);
            }
          });
          report.photosSaved += Object.keys(swap).length;
          report.productsSaved += 1;
        } catch (error) {
          report.errors.push(`${product.name || productId}: ${friendlyError(error)}`);
          for (const item of selected) {
            if (item.productId === productId) report.failedKeys.add(item.key);
          }
        }
      },
      { current: false } // always finish swapping photos already saved
    );

    for (const item of selected) {
      if (!report.failedKeys.has(item.key)) cleanCopies.current.delete(item.key);
    }
    setSaveReport(report);
    // Photos that failed stay in the list - just press save again.
    const failedItems = selected.filter((item) => report.failedKeys.has(item.key));
    setFound(failedItems);
    setPhase(failedItems.length ? "checked" : "done");
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

      {phase === "checked" && !saveReport && (
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
            <p style={{ margin: "0 0 6px" }}>
              Ye photos abhi save nahi hui (neeche list mein hain). Thodi der baad save button phir dabao:
            </p>
          )}
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
