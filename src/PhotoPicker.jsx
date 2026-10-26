import { useEffect, useMemo, useState } from "react";
import { canonicalizeCategory } from "./categories";

/*
 * PRODUCT PHOTO PICKER (2026-10-25)
 * Lets the owner pick photos that are ALREADY uploaded on product pages
 * (hero banner, brand story, category tiles) instead of uploading again.
 * "Lifestyle only" hides plain-background product shots: each photo's
 * border is checked in the browser - a plain studio background has a
 * very even border, a lifestyle / model photo does not.
 */

const classifyCache = new Map(); // url -> true (lifestyle) | false (plain) | null (unknown)

function classifyPhoto(src) {
  if (classifyCache.has(src)) return Promise.resolve(classifyCache.get(src));
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      let result = null;
      try {
        const size = 40;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const values = [];
        for (let i = 0; i < size; i += 1) {
          for (const [x, y] of [[i, 0], [i, 1], [i, size - 1], [0, i], [1, i], [size - 1, i], [size - 2, i]]) {
            const index = (y * size + x) * 4;
            values.push(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
          }
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
        result = deviation > 16;
      } catch {
        result = null; // photo host does not allow reading pixels
      }
      classifyCache.set(src, result);
      resolve(result);
    };
    image.onerror = () => {
      classifyCache.set(src, null);
      resolve(null);
    };
    image.src = src;
  });
}

export default function PhotoPicker({ products, category, selectedUrls = [], onPick, getImageUrl }) {
  const [search, setSearch] = useState("");
  const [lifestyleOnly, setLifestyleOnly] = useState(true);
  const [limit, setLimit] = useState(36);
  const [, setVersion] = useState(0);

  const allPhotos = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (Array.isArray(products) ? products : [])
      .filter((product) => product && product.active !== false)
      .filter((product) => !category || category === "All" || canonicalizeCategory(product.category, product.name) === category)
      .filter((product) => !query || String(product.name || "").toLowerCase().includes(query))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const seen = new Set();
    const photos = [];
    for (const product of list) {
      const urls = [...(Array.isArray(product.images) ? product.images : [])];
      const colorImages = product.colorImages || {};
      for (const key of Object.keys(colorImages)) {
        const value = colorImages[key];
        if (Array.isArray(value)) urls.push(...value);
        else if (value) urls.push(value);
      }
      for (const url of urls) {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        photos.push({ url, name: product.name || "" });
      }
    }
    return photos;
  }, [products, category, search]);

  // Check photos (a few at a time) until enough lifestyle ones are known.
  useEffect(() => {
    if (!lifestyleOnly) return undefined;
    let cancelled = false;
    (async () => {
      const keyOf = (photo) => getImageUrl(photo.url);
      for (;;) {
        if (cancelled) return;
        const found = allPhotos.filter((photo) => {
          const result = classifyCache.get(keyOf(photo));
          return result === true || result === null;
        }).length;
        const pending = allPhotos.filter((photo) => !classifyCache.has(keyOf(photo)));
        if (!pending.length || found >= limit) return;
        await Promise.all(pending.slice(0, 6).map((photo) => classifyPhoto(keyOf(photo))));
        if (!cancelled) setVersion((value) => value + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allPhotos, lifestyleOnly, limit, getImageUrl]);

  const visible = lifestyleOnly
    ? allPhotos.filter((photo) => {
        const result = classifyCache.get(getImageUrl(photo.url));
        return result === true || result === null; // unknown = show (never hide by mistake)
      })
    : allPhotos.filter(() => true);
  const checking = lifestyleOnly && allPhotos.some((photo) => !classifyCache.has(getImageUrl(photo.url)));
  const shown = visible.slice(0, limit);
  const selected = new Set((selectedUrls || []).filter(Boolean));

  return (
    <div className="pp-wrap">
      <style>{`
        .pp-wrap { margin-top: 12px; border: 1px solid #e8e2d6; border-radius: 12px; padding: 12px; background: #fcfbf8; }
        .pp-top { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
        .pp-top input { flex: 1 1 160px; min-width: 0; }
        .pp-chip { padding: 8px 12px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font-size: 13px; cursor: pointer; color: #111; }
        .pp-chip.on { background: #1c150d; border-color: #1c150d; color: #fff; }
        /* (2026-10-26) iPhone fix: Safari mis-sized the square tiles (aspect-ratio
           inside a scrolling grid), so photos piled on top of each other. Now
           each tile is a fixed square box (padding trick) and only the outer
           box scrolls - works the same on every phone. */
        .pp-scroll { max-height: 420px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .pp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
        @media (min-width: 600px) { .pp-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); } }
        .pp-item { -webkit-appearance: none; appearance: none; display: block; width: 100%; min-width: 0; margin: 0; padding: 0; border: 3px solid transparent; border-radius: 10px; overflow: hidden; background: #f1ede5; cursor: pointer; }
        .pp-item.on { border-color: #1c150d; }
        .pp-box { display: block; position: relative; width: 100%; height: 0; padding-top: 100%; }
        .pp-box img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
        .pp-item .pp-tick { position: absolute; top: 4px; right: 4px; background: #1c150d; color: #fff; border-radius: 999px; width: 22px; height: 22px; font-size: 13px; line-height: 22px; text-align: center; }
        .pp-note { font-size: 12px; color: #888; margin-top: 8px; }
      `}</style>
      <div className="pp-top">
        <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bag ka naam search karo..." />
        <button type="button" className={lifestyleOnly ? "pp-chip on" : "pp-chip"} onClick={() => setLifestyleOnly(true)}>
          Lifestyle only
        </button>
        <button type="button" className={!lifestyleOnly ? "pp-chip on" : "pp-chip"} onClick={() => setLifestyleOnly(false)}>
          All photos
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="customer-info">
          {checking ? "Photos check ho rahi hain..." : "Koi photo nahi mili. “All photos” dabakar dekho."}
        </div>
      ) : (
        <div className="pp-scroll">
          <div className="pp-grid">
            {shown.map((photo) => (
              <button
                type="button"
                key={photo.url}
                className={selected.has(photo.url) ? "pp-item on" : "pp-item"}
                title={photo.name}
                onClick={() => onPick(photo.url)}
              >
                <span className="pp-box">
                  <img src={getImageUrl(photo.url)} alt={photo.name} loading="lazy" />
                  {selected.has(photo.url) ? <span className="pp-tick">✓</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="pp-note">
        {checking ? "Lifestyle photos dhoondhi ja rahi hain... " : ""}
        {visible.length > limit ? (
          <button type="button" className="pp-chip" style={{ marginTop: 8 }} onClick={() => setLimit((value) => value + 36)}>
            Aur photos dikhao
          </button>
        ) : null}
      </div>
    </div>
  );
}
