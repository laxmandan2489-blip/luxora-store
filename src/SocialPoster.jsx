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
 */

let statusCache = null; // shared by Ad Maker + Story Maker for this session

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

export default function SocialPoster({ API, adminFetch, mode = "post", getImage, canAdd = true, addHint = "", buildCaption }) {
  const [status, setStatus] = useState(statusCache);
  const [tray, setTray] = useState([]); // [{ id, dataUrl }]
  const [targets, setTargets] = useState({ instagram: true, facebook: true });
  const [captions, setCaptions] = useState({ instagram: "", facebook: "" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);

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
    return withRetry(async () => {
      const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) throw new Error(data?.message || `Server error ${response.status}`);
      return data.url;
    });
  }

  async function publish() {
    const chosen = Object.keys(targets).filter((key) => targets[key]);
    if (!chosen.length) return;
    const images = mode === "story" ? [getImage && getImage()].filter(Boolean) : tray.map((item) => item.dataUrl);
    if (!images.length) return;
    const where = chosen.map((key) => (key === "instagram" ? "Instagram" : "Facebook")).join(" + ");
    const what = mode === "story" ? "story" : images.length > 1 ? `${images.length} photos ki carousel post` : "post";
    if (!window.confirm(`${where} par ye ${what} abhi live kar dun?`)) return;

    setBusy(true);
    setResults(null);
    try {
      const urls = [];
      for (let index = 0; index < images.length; index++) {
        setProgress(`Photo save ho rahi hai ${index + 1}/${images.length}...`);
        urls.push(await uploadOne(images[index]));
      }
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
                      <img src={item.dataUrl} alt={`Slide ${index + 1}`} />
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
          {mode === "story" && !canAdd && addHint && <div className="sp-small">⚠️ {addHint}</div>}
          {progress && <div className="sp-small">{progress}</div>}

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
