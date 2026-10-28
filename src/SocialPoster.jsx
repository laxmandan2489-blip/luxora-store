import { useEffect, useState } from "react";

/*
 * SOCIAL POSTER (2026-10-28) - Admin se seedha Instagram + Facebook.
 * ------------------------------------------------------------------
 * mode="post"  (Ad Maker):  "➕ Post mein jodo" adds the current design
 *   to a tray (up to 10 = carousel, same order as the tray). Captions
 *   for Instagram / Facebook come from Caption Maker and can be edited.
 * mode="story" (Story Maker): posts the current story (9:16).
 * Flow: each photo -> /api/admin/products/save-generated-image (public
 * link) -> /api/admin/social/publish (server talks to Meta).
 * Nothing is posted without the confirm box.
 *
 * (2026-10-29) LINE / QUEUE: "📥 Line mein rakho" saves a ready post
 * (all its slides + captions) or a story, then you make the next one.
 * "🚀 Line ki saari ... daalo" puts them all live one after another.
 * Photos are saved to the server when they join the line, so the line
 * is only small links and stays in this phone (localStorage) even if
 * the Admin page reloads.
 */

let statusCache = null; // shared by Ad Maker + Story Maker for this session

const QUEUE_KEY = "shrimoh-social-line-v1";
const QUEUE_MAX = 10;

function readQueue(mode) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "{}");
    return Array.isArray(saved?.[mode]) ? saved[mode] : [];
  } catch {
    return [];
  }
}

// (2026-10-29) "Line mein rakho" is instant: photos save in the background.
// pending: item id -> promise of saved links. Only saved items go to storage.
const pending = new Map();

// At most 4 photo saves at the same time across the whole line (free
// Render server stays fast instead of choking on 12 at once).
let running = 0;
const waiting = [];
async function limited(task) {
  if (running >= 4) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

async function inBatches(list, size, task) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next++;
      out[index] = await task(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
  return out;
}

function writeQueue(mode, list) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "{}") || {};
    saved[mode] = list
      .filter((item) => Array.isArray(item.urls) && item.urls.length)
      .map((item) => ({ id: item.id, label: item.label, urls: item.urls, captions: item.captions, targets: item.targets, error: item.error }));
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(saved));
  } catch {
    // storage full / blocked - the line still works until the page reloads
  }
}

function targetText(targets) {
  return Object.keys(targets || {})
    .filter((key) => targets[key])
    .map((key) => (key === "instagram" ? "Instagram" : "Facebook"))
    .join(" + ");
}

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

function friendly(error) {
  const message = String(error?.message || error || "");
  if (/load failed|failed to fetch|network/i.test(message)) return "internet ya server ne jawab nahi diya, dobara try karo";
  return message || "kuch gadbad hui";
}

export default function SocialPoster({ API, adminFetch, mode = "post", getImage, canAdd = true, addHint = "", buildCaption, label = "" }) {
  const [status, setStatus] = useState(statusCache);
  const [tray, setTray] = useState([]); // [{ id, dataUrl }]
  const [targets, setTargets] = useState({ instagram: true, facebook: true });
  const [captions, setCaptions] = useState({ instagram: "", facebook: "" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [queue, setQueueState] = useState(() => readQueue(mode)); // [{ id, label, urls, captions, targets, error? }]
  const [queueResults, setQueueResults] = useState(null);

  function setQueue(update) {
    setQueueState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      writeQueue(mode, next);
      return next;
    });
  }

  function moveQueue(index, step) {
    setQueue((list) => {
      const next = [...list];
      const target = index + step;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  useEffect(() => {
    if (!open || statusCache) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await adminFetch(`${API}/api/admin/social/status`);
        const data = await response.json().catch(() => ({}));
        statusCache = data;
        if (!cancelled) setStatus(data);
      } catch (error) {
        if (!cancelled) setStatus({ success: false, message: friendly(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, API, adminFetch]);

  function fillCaptions(force = false) {
    if (!buildCaption) return;
    setCaptions((current) => ({
      instagram: force || !current.instagram ? buildCaption("instagram") || current.instagram : current.instagram,
      facebook: force || !current.facebook ? buildCaption("facebook") || current.facebook : current.facebook,
    }));
  }

  function addCurrent() {
    const dataUrl = getImage && getImage();
    if (!dataUrl) return;
    setResults(null);
    setTray((list) => (list.length >= 10 ? list : [...list, { id: `${Date.now()}-${Math.random()}`, dataUrl }]));
    fillCaptions(false);
  }

  function move(index, step) {
    setTray((list) => {
      const next = [...list];
      const target = index + step;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function uploadOne(dataUrl) {
    if (/^https?:/i.test(dataUrl)) return dataUrl; // already saved (opened back from the line)
    return limited(() => withRetry(async () => {
      const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, direct: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) throw new Error(data?.message || `Server error ${response.status}`);
      return data.url;
    }));
  }

  async function publish() {
    const chosen = Object.keys(targets).filter((key) => targets[key]);
    if (!chosen.length) return;
    const images = mode === "story" ? [getImage && getImage()].filter(Boolean) : tray.map((item) => item.dataUrl || item.url);
    if (!images.length) return;
    const where = chosen.map((key) => (key === "instagram" ? "Instagram" : "Facebook")).join(" + ");
    const what = mode === "story" ? "story" : images.length > 1 ? `${images.length} photos ki carousel post` : "post";
    if (!window.confirm(`${where} par ye ${what} abhi live kar dun?`)) return;

    setBusy(true);
    setResults(null);
    try {
      let saved = 0;
      setProgress(`Photos save ho rahi hain 0/${images.length}...`);
      const urls = await inBatches(images, 4, async (image) => {
        const url = await uploadOne(image);
        saved += 1;
        setProgress(`Photos save ho rahi hain ${saved}/${images.length}...`);
        return url;
      });
      setProgress(`${where} par ${mode === "story" ? "story" : "post"} lag rahi hai... (1-2 minute lag sakte hain)`);
      const response = await adminFetch(`${API}/api/admin/social/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: mode === "story" ? "story" : "post", imageUrls: urls, targets: chosen, captions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.message || `Server error ${response.status}`);
      setResults(data.results || {});
      const allOk = chosen.every((key) => data.results?.[key]?.ok);
      if (allOk && mode === "post") setTray([]);
      // Partly done: untick the one that worked, so pressing again only
      // retries the failed one (no double post).
      if (!allOk) {
        setTargets((current) => {
          const next = { ...current };
          for (const key of chosen) if (data.results?.[key]?.ok) next[key] = false;
          return next;
        });
      }
    } catch (error) {
      setResults({ error: friendly(error) });
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  // ---- LINE (queue) ----
  function addToQueue() {
    const chosen = Object.keys(targets).filter((key) => targets[key]);
    if (!chosen.length || queue.length >= QUEUE_MAX) return;
    const images = mode === "story" ? [getImage && getImage()].filter(Boolean) : tray.map((item) => item.dataUrl || item.url);
    if (!images.length) return;
    setResults(null);
    setQueueResults(null);
    setProgress("");
    const id = `${Date.now()}-${Math.random()}`;
    const item = {
      id,
      label: String(label || "").trim() || (mode === "story" ? "Story" : "Post"),
      urls: null,
      dataUrls: images,
      saving: true,
      captions: mode === "story" ? {} : { ...captions },
      targets: { ...targets },
    };
    setQueue((list) => [...list, item]);
    if (mode === "post") {
      setTray([]);
      setCaptions({ instagram: "", facebook: "" }); // next bag gets its own caption
    }
    saveInBackground(item);
  }

  function saveInBackground(item) {
    const job = inBatches(item.dataUrls, 4, (image) => uploadOne(image))
      .then((urls) => {
        setQueue((list) => list.map((entry) => (entry.id === item.id ? { ...entry, urls, dataUrls: null, saving: false, error: "" } : entry)));
        return urls;
      })
      .catch((error) => {
        setQueue((list) => list.map((entry) => (entry.id === item.id ? { ...entry, saving: false, error: `Photo save nahi hui: ${friendly(error)}` } : entry)));
        return null;
      })
      .finally(() => pending.delete(item.id));
    pending.set(item.id, job);
    return job;
  }

  async function linksFor(item) {
    if (item.urls?.length) return item.urls;
    if (pending.has(item.id)) return pending.get(item.id);
    if (item.dataUrls?.length) return saveInBackground(item); // earlier save failed - try again
    return null;
  }

  function openFromQueue(item) {
    if (busy) return;
    if (tray.length && !window.confirm("Abhi wali tray hat jayegi. Line wali post wapas kholun?")) return;
    const images = item.urls || item.dataUrls || [];
    setTray(images.map((image, index) => (/^data:/.test(image) ? { id: `${item.id}-${index}`, dataUrl: image } : { id: `${item.id}-${index}`, url: image })));
    setCaptions({ instagram: item.captions?.instagram || "", facebook: item.captions?.facebook || "" });
    setTargets({ instagram: !!item.targets?.instagram, facebook: !!item.targets?.facebook });
    setQueue((list) => list.filter((entry) => entry.id !== item.id));
  }

  async function publishQueue() {
    if (!queue.length) return;
    const what = mode === "story" ? `${queue.length} stories` : `${queue.length} posts`;
    if (!window.confirm(`Line ki saari ${what} ek ke baad ek abhi live kar dun?\n\nJab tak chal raha hai, phone ki screen on rakho aur app mat badlo.`)) return;
    const started = Date.now();
    setBusy(true);
    setResults(null);
    setQueueResults(null);
    const summary = [];
    const items = [...queue];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const chosen = Object.keys(item.targets || {}).filter((key) => item.targets[key]);
      try {
        if (!item.urls?.length) setProgress(`${index + 1}/${items.length}: “${item.label}” ki photos save ho rahi hain...`);
        const urls = await linksFor(item);
        if (!urls?.length) throw new Error("photos save nahi ho payi, dobara dabao");
        setProgress(`${index + 1}/${items.length}: “${item.label}” lag rahi hai...`);
        const response = await adminFetch(`${API}/api/admin/social/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: mode === "story" ? "story" : "post", imageUrls: urls, targets: chosen, captions: item.captions || {} }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) throw new Error(data?.message || `Server error ${response.status}`);
        const failed = chosen.filter((key) => !data.results?.[key]?.ok);
        summary.push({ label: item.label, results: data.results || {} });
        if (!failed.length) {
          setQueue((list) => list.filter((entry) => entry.id !== item.id));
        } else {
          // keep only the failed platform in the line (no double post)
          const left = { instagram: failed.includes("instagram"), facebook: failed.includes("facebook") };
          setQueue((list) => list.map((entry) => (entry.id === item.id ? { ...entry, targets: left, error: failed.map((key) => data.results?.[key]?.message).join(" / ") } : entry)));
        }
      } catch (error) {
        summary.push({ label: item.label, error: friendly(error) });
        setQueue((list) => list.map((entry) => (entry.id === item.id ? { ...entry, error: friendly(error) } : entry)));
      }
      setQueueResults([...summary]);
    }
    setBusy(false);
    setProgress(`Ho gaya - ${Math.round((Date.now() - started) / 1000)} second laga.`);
  }

  const connectedText = status?.success
    ? `✅ Juda hai: ${status.instagram ? `Instagram @${status.instagram.username}` : "Instagram nahi mila"} · Facebook ${status.page?.name || ""}`
    : status
      ? `⚠️ Meta se connect nahi hua: ${status.message || ""}`
      : "Check ho raha hai...";

  const canPublish =
    !busy && Object.values(targets).some(Boolean) && (mode === "story" ? canAdd : tray.length > 0) && status?.success;

  return (
    <div className="sp-box">
      <style>{`
        .sp-box { margin-top: 16px; border: 1px solid #e8e2d6; border-radius: 14px; padding: 14px; background: #fcfbf8; }
        .sp-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; font-size: 15px; }
        .sp-small { font-size: 13px; color: #666; margin: 8px 0; line-height: 1.5; }
        .sp-tray { display: flex; gap: 8px; overflow-x: auto; padding: 6px 0 10px; }
        .sp-item { flex: 0 0 92px; text-align: center; }
        .sp-item img { width: 92px; height: auto; border-radius: 8px; border: 1px solid #ddd; display: block; }
        .sp-item-tools { display: flex; justify-content: center; gap: 4px; margin-top: 4px; }
        .sp-mini { border: 1px solid #ccc; background: #fff; border-radius: 6px; font-size: 12px; padding: 3px 7px; cursor: pointer; color: #111; }
        .sp-num { font-size: 11px; color: #666; }
        .sp-targets { display: flex; gap: 14px; flex-wrap: wrap; margin: 10px 0; font-size: 14px; }
        .sp-text { width: 100%; min-height: 110px; box-sizing: border-box; font: inherit; font-size: 13px; line-height: 1.5; border: 1px solid #ddd; border-radius: 10px; padding: 10px; margin: 4px 0 10px; }
        .sp-btn { padding: 10px 14px; border-radius: 10px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .sp-btn.main { background: #1c150d; color: #fff; }
        .sp-btn:disabled { opacity: 0.45; cursor: default; }
        .sp-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
        .sp-queue { margin-top: 12px; padding: 10px; border: 1px dashed #c9bfa9; border-radius: 12px; background: #fff; }
        .sp-qitem { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #f0ebe0; }
        .sp-qthumbs { display: flex; gap: 3px; align-items: center; flex: 0 0 auto; max-width: 140px; flex-wrap: wrap; }
        .sp-qthumbs img { width: 32px; height: auto; border-radius: 4px; border: 1px solid #ddd; }
        .sp-qinfo { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
        .sp-result { font-size: 14px; line-height: 1.6; margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #fff; border: 1px solid #eee; overflow-wrap: anywhere; }
      `}</style>

      <div className="sp-head" onClick={() => setOpen((value) => !value)}>
        <span>{mode === "story" ? "📲 Story seedha lagao (Instagram / Facebook)" : "🚀 Seedha post karo (Instagram / Facebook)"}</span>
        <span>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <>
          <div className="sp-small">{connectedText}</div>

          {mode === "post" && (
            <>
              <div className="sp-small">
                Design banao, phir <b>“Post mein jodo”</b> dabao. Agla design (No text · only bag, dusra colour) banao aur
                phir jodo. Jis kram mein jodoge, carousel mein wahi kram rahega (max 10).
              </div>
              <div className="sp-row">
                <button type="button" className="sp-btn" onClick={addCurrent} disabled={!canAdd || busy || tray.length >= 10}>
                  ➕ Post mein jodo ({tray.length}/10)
                </button>
                {tray.length > 0 && (
                  <button type="button" className="sp-btn" onClick={() => setTray([])} disabled={busy}>
                    Sab hatao
                  </button>
                )}
              </div>
              {!canAdd && addHint && <div className="sp-small">⚠️ {addHint}</div>}
              {tray.length > 0 && (
                <div className="sp-tray">
                  {tray.map((item, index) => (
                    <div className="sp-item" key={item.id}>
                      <img src={item.dataUrl || item.url} alt={`Slide ${index + 1}`} />
                      <div className="sp-num">Slide {index + 1}</div>
                      <div className="sp-item-tools">
                        <button type="button" className="sp-mini" onClick={() => move(index, -1)} disabled={busy || index === 0}>◀</button>
                        <button type="button" className="sp-mini" onClick={() => setTray((list) => list.filter((entry) => entry.id !== item.id))} disabled={busy}>✕</button>
                        <button type="button" className="sp-mini" onClick={() => move(index, 1)} disabled={busy || index === tray.length - 1}>▶</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === "story" && (
            <div className="sp-small">
              Upar jo story dikh rahi hai wahi lagegi. Instagram API se story par link/poll sticker nahi lagta, aur
              story 24 ghante rehti hai.
            </div>
          )}

          <div className="sp-targets">
            <label>
              <input type="checkbox" checked={targets.instagram} onChange={(event) => setTargets((t) => ({ ...t, instagram: event.target.checked }))} disabled={busy} />{" "}
              Instagram
            </label>
            <label>
              <input type="checkbox" checked={targets.facebook} onChange={(event) => setTargets((t) => ({ ...t, facebook: event.target.checked }))} disabled={busy} />{" "}
              Facebook Page
            </label>
          </div>

          {mode === "post" && (
            <>
              {buildCaption && (
                <div className="sp-row">
                  <button type="button" className="sp-mini" onClick={() => fillCaptions(true)} disabled={busy}>
                    🔄 Caption Maker se dobara bharo
                  </button>
                </div>
              )}
              {targets.instagram && (
                <>
                  <label className="form-label">Instagram caption</label>
                  <textarea className="sp-text" value={captions.instagram} onChange={(event) => setCaptions((c) => ({ ...c, instagram: event.target.value }))} disabled={busy} />
                </>
              )}
              {targets.facebook && (
                <>
                  <label className="form-label">Facebook caption</label>
                  <textarea className="sp-text" value={captions.facebook} onChange={(event) => setCaptions((c) => ({ ...c, facebook: event.target.value }))} disabled={busy} />
                </>
              )}
            </>
          )}

          <div className="sp-row">
            <button type="button" className="sp-btn main" onClick={publish} disabled={!canPublish}>
              {busy ? "Lag raha hai..." : mode === "story" ? "📲 Story lagao" : "🚀 Abhi post karo"}
            </button>
          </div>
          <div className="sp-row">
            <button
              type="button"
              className="sp-btn"
              onClick={addToQueue}
              disabled={busy || !Object.values(targets).some(Boolean) || queue.length >= QUEUE_MAX || (mode === "story" ? !canAdd : !tray.length)}
            >
              {mode === "story" ? `📥 Story line mein rakho (${queue.length}/${QUEUE_MAX})` : `📥 Ye post line mein rakho (${queue.length}/${QUEUE_MAX})`}
            </button>
          </div>
          <div className="sp-small">
            {mode === "story"
              ? "Ek-ek karke stories line mein rakho (dusra bag chuno, phir rakho), phir sab ek saath lagao. Jo line mein upar hai wo pehle dikhegi."
              : "Ek bag ki post (saare slides + caption) line mein rakho, phir agle bag ki banao. Last mein sab ek saath daalo. Line mein upar wali pehle lagegi, isliye profile grid mein sabse upar aakhri wali dikhegi."}
          </div>
          {mode === "story" && !canAdd && addHint && <div className="sp-small">⚠️ {addHint}</div>}
          {progress && <div className="sp-small">{progress}</div>}

          {queue.length > 0 && (
            <div className="sp-queue">
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                📋 Line mein {queue.length} {mode === "story" ? "stories" : "posts"}
              </div>
              {queue.map((item, index) => (
                <div className="sp-qitem" key={item.id}>
                  <div className="sp-qthumbs">
                    {(item.urls || item.dataUrls || []).slice(0, 4).map((image, imageIndex) => (
                      <img key={imageIndex} src={image} alt="" />
                    ))}
                    {(item.urls || item.dataUrls || []).length > 4 && <span className="sp-num">+{(item.urls || item.dataUrls).length - 4}</span>}
                  </div>
                  <div className="sp-qinfo">
                    <b>{index + 1}. {item.label}</b>
                    <div className="sp-num">
                      {mode === "post" ? `${(item.urls || item.dataUrls || []).length} photo · ` : ""}
                      {targetText(item.targets)}
                      {item.saving ? " · ⏳ save ho rahi hai" : item.urls?.length ? " · ✓ tayyar" : ""}
                    </div>
                    {item.error && <div style={{ color: "#b42318", fontSize: 12 }}>❌ {item.error}</div>}
                    <div className="sp-item-tools" style={{ justifyContent: "flex-start" }}>
                      <button type="button" className="sp-mini" onClick={() => moveQueue(index, -1)} disabled={busy || index === 0}>▲</button>
                      <button type="button" className="sp-mini" onClick={() => moveQueue(index, 1)} disabled={busy || index === queue.length - 1}>▼</button>
                      {mode === "post" && (
                        <button type="button" className="sp-mini" onClick={() => openFromQueue(item)} disabled={busy}>✏️ Kholo</button>
                      )}
                      <button
                        type="button"
                        className="sp-mini"
                        onClick={() => window.confirm("Line se hata dun?") && setQueue((list) => list.filter((entry) => entry.id !== item.id))}
                        disabled={busy}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="sp-row">
                <button type="button" className="sp-btn main" onClick={publishQueue} disabled={busy || !status?.success}>
                  {busy ? "Lag raha hai..." : mode === "story" ? `📲 Line ki saari ${queue.length} stories lagao` : `🚀 Line ki saari ${queue.length} posts daalo`}
                </button>
              </div>
            </div>
          )}

          {queueResults && (
            <div className="sp-result">
              {queueResults.map((entry, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  <b>{entry.label}:</b>{" "}
                  {entry.error ? (
                    <span style={{ color: "#b42318" }}>❌ {entry.error}</span>
                  ) : (
                    Object.entries(entry.results).map(([key, value]) => (
                      <span key={key} style={{ marginRight: 8 }}>
                        {value.ok ? "✅" : "❌"} {key === "instagram" ? "Instagram" : "Facebook"}{" "}
                        {value.ok && value.link ? <a href={value.link} target="_blank" rel="noreferrer">dekho</a> : null}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}

          {results && (
            <div className="sp-result">
              {results.error ? (
                <span style={{ color: "#b42318" }}>❌ {results.error}</span>
              ) : (
                Object.entries(results).map(([key, value]) => (
                  <div key={key}>
                    {value.ok ? "✅" : "❌"} {key === "instagram" ? "Instagram" : "Facebook"}:{" "}
                    {value.ok ? (
                      value.link ? (
                        <a href={value.link} target="_blank" rel="noreferrer">dekho</a>
                      ) : (
                        "lag gaya"
                      )
                    ) : (
                      <span style={{ color: "#b42318" }}>{value.message}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
