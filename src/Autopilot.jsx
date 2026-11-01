import { useEffect, useRef, useState } from "react";

/*
 * ADMIN > 🤖 AUTOPILOT (2026-11-01)
 * One switch. When ON, every time the cron timer runs and the Auto Post
 * line is empty, the server makes and posts the next post by itself:
 * Bag (Cream) -> Model -> Bag (Black) -> Model. Model photos are made by
 * Gemini from the bag's real photo and checked against it before use.
 * "Test post" makes one post WITHOUT putting it live, to see it first.
 * All the work runs on the server (server/autopilot.js) - phone can be off.
 */

const NEXT_LABEL = {
  "bag-cream": "Bag post (Cream)",
  "bag-black": "Bag post (Black)",
  model: "Model photo post",
};

function friendly(error) {
  const text = String(error?.message || error || "");
  if (/load failed|failed to fetch|network/i.test(text)) return "Internet / server se baat nahi ho payi. Dobara try karo.";
  return text || "Kuch gadbad hui.";
}

function when(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function Autopilot({ API, adminFetch }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [openLog, setOpenLog] = useState(null);
  const [daily, setDaily] = useState(null);
  const [pro, setPro] = useState(null);
  const proTimer = useRef(null);
  const timer = useRef(null);
  const dailyTimer = useRef(null);

  async function call(path, options) {
    const response = await adminFetch(`${API}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
    setState(data);
    return data;
  }

  async function refresh() {
    try {
      await call("/api/admin/autopilot");
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    }
  }

  async function dailyCall(path, options) {
    const response = await adminFetch(`${API}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
    setDaily(data);
    return data;
  }

  async function proCall(path, options) {
    const response = await adminFetch(`${API}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
    setPro(data);
    return data;
  }

  async function proAct(path, body) {
    setBusy(true);
    setNotice("");
    try {
      await proCall(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshDaily() {
    try {
      await dailyCall("/api/admin/autopilot/daily");
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    }
  }

  async function dailyAct(path, body, method = "POST") {
    setBusy(true);
    setNotice("");
    try {
      const isForm = typeof FormData !== "undefined" && body instanceof FormData;
      await dailyCall(path, {
        method,
        headers: isForm || !body ? undefined : { "Content-Type": "application/json" },
        body: isForm ? body : body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    refreshDaily();
    proCall("/api/admin/autopilot/pro").catch(() => {});
    return () => {
      clearTimeout(proTimer.current);
      clearTimeout(timer.current);
      clearTimeout(dailyTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    clearTimeout(proTimer.current);
    if (pro?.working) proTimer.current = setTimeout(() => proCall("/api/admin/autopilot/pro").catch(() => {}), 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro]);

  useEffect(() => {
    clearTimeout(dailyTimer.current);
    if (daily?.working) dailyTimer.current = setTimeout(refreshDaily, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily]);

  // while the server is working, check every 4 s
  useEffect(() => {
    clearTimeout(timer.current);
    if (state?.running) timer.current = setTimeout(refresh, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function act(path, body, method = "POST") {
    setBusy(true);
    setNotice("");
    try {
      const data = await call(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return data;
    } catch (error) {
      setNotice(`❌ ${friendly(error)}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const s = state;
  const working = Boolean(s?.running);
  const preview = s?.preview;

  return (
    <div className="panel">
      <style>{`
        .apl-box { border: 1px solid #e8e2d6; border-radius: 14px; padding: 14px; margin-bottom: 16px; background: #fffdf8; }
        .apl-btn { padding: 11px 14px; border-radius: 12px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .apl-btn.main { background: #1c150d; color: #fff; }
        .apl-btn:disabled { opacity: 0.45; }
        .apl-mini { padding: 5px 10px; border-radius: 8px; border: 1px solid #ccc; background: #fff; font-size: 12px; cursor: pointer; color: #111; }
        .apl-mini.on { border-color: #1c150d; background: #1c150d; color: #fff; }
        .apl-small { font-size: 12px; color: #666; line-height: 1.5; }
        .apl-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .apl-toggle { width: 58px; height: 32px; border-radius: 99px; border: none; background: #d8d2c6; position: relative; cursor: pointer; flex: 0 0 auto; transition: background 0.2s; }
        .apl-toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.2s; }
        .apl-toggle.on { background: #2e7d32; }
        .apl-toggle.on::after { transform: translateX(26px); }
        .apl-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
        .apl-slides { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 8px; }
        .apl-slides img { height: 190px; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; flex: 0 0 auto; background: #f3f0ea; }
        .apl-slides img.story { aspect-ratio: 9 / 16; }
        .apl-caption { white-space: pre-wrap; font-size: 13px; background: #f6f3ee; border-radius: 10px; padding: 10px; color: #222; overflow-wrap: anywhere; }
        .apl-item { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0ebe0; }
        .apl-item img { width: 46px; height: 58px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; flex: 0 0 auto; background: #f3f0ea; }
        .apl-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
        .apl-lib div { position: relative; }
        .apl-lib img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; display: block; }
        .apl-lib button { position: absolute; top: 4px; right: 4px; border: none; border-radius: 99px; background: rgba(0,0,0,0.6); color: #fff; font-size: 12px; width: 24px; height: 24px; cursor: pointer; }
        .apl-lib span { position: absolute; left: 4px; bottom: 4px; font-size: 10px; background: rgba(255,255,255,0.9); border-radius: 6px; padding: 1px 5px; color: #333; }
        .apl-working { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #1c150d; background: #f6f3ee; border-radius: 10px; padding: 10px; margin-top: 10px; }
        .apl-dot { width: 9px; height: 9px; border-radius: 50%; background: #8a7650; animation: aplPulse 1s infinite alternate; flex: 0 0 auto; }
        @keyframes aplPulse { from { opacity: 0.25; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .apl-dot { animation: none; } .apl-toggle, .apl-toggle::after { transition: none; } }
      `}</style>

      <div className="panel-header">
        <h2 className="panel-title">🤖 Autopilot</h2>
      </div>

      {notice ? <div className="apl-box" style={{ fontSize: 14 }}>{notice}</div> : null}
      {!s ? <div className="apl-small">Load ho raha hai...</div> : null}

      {s ? (
        <>
          <ActivityCard API={API} adminFetch={adminFetch} />

          <div className="apl-box">
            <div className="apl-switch">
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{s.enabled ? "✅ Autopilot chalu hai" : "⏸ Autopilot band hai"}</div>
                <div className="apl-small">
                  {s.enabled
                    ? "Bot khud post bana ke Instagram + Facebook par daalega. Aapko kuch nahi dabana."
                    : "Chalu karo to bot khud bag aur model posts banayega aur daalega."}
                </div>
              </div>
              <button
                type="button"
                aria-label="Autopilot on / off"
                className={s.enabled ? "apl-toggle on" : "apl-toggle"}
                disabled={busy}
                onClick={() => {
                  if (!s.enabled && !window.confirm("Autopilot chalu karun? Bot apne-aap Instagram + Facebook par post karega.")) return;
                  act("/api/admin/autopilot/settings", { enabled: !s.enabled });
                }}
              />
            </div>

            <div className="apl-small" style={{ marginTop: 10, color: "#333" }}>
              Agli post: <b>{NEXT_LABEL[s.next] || s.next}</b>
              {s.lastAutoAt ? ` · pichhli autopilot post: ${when(s.lastAutoAt)}` : ""}
            </div>

            <div className="apl-row">
              <span className="apl-small" style={{ color: "#333" }}>Posts:</span>
              {[
                [4, "hafte mein 4"],
                [7, "1 roz"],
                [14, "2 roz"],
                [21, "3 roz"],
              ].map(([n, label]) => (
                <button key={n} type="button" className={s.perWeek === n ? "apl-mini on" : "apl-mini"} disabled={busy} onClick={() => act("/api/admin/autopilot/settings", { perWeek: n })}>
                  {label}
                </button>
              ))}
            </div>
            <div className="apl-row">
              <span className="apl-small" style={{ color: "#333" }}>Har post ke saath “New in” story:</span>
              <button type="button" className={s.story ? "apl-mini on" : "apl-mini"} disabled={busy} onClick={() => act("/api/admin/autopilot/settings", { story: !s.story })}>
                {s.story ? "Haan" : "Nahi"}
              </button>
            </div>
            <div className="apl-row">
              <span className="apl-small" style={{ color: "#333" }}>Agli post badlo:</span>
              {Object.entries(NEXT_LABEL).map(([key, label]) => (
                <button key={key} type="button" className={s.next === key ? "apl-mini on" : "apl-mini"} disabled={busy} onClick={() => act("/api/admin/autopilot/settings", { next: key })}>
                  {label}
                </button>
              ))}
            </div>

            {daily ? (
              <div className="apl-small" style={{ marginTop: 8, color: daily.lastTickAt && Date.now() - daily.lastTickAt < 6 * 3600 * 1000 ? "#2e7d32" : "#b23b1e" }}>
                {daily.lastTickAt
                  ? `⏱ Timer aakhri baar chala: ${when(daily.lastTickAt)}${Date.now() - daily.lastTickAt > 6 * 3600 * 1000 ? " - 6 ghante se zyada ho gaye, cron-job.org check karo" : " ✅"}`
                  : "⏱ Timer abhi tak ek baar bhi nahi chala - cron-job.org par social-post wala job check karo"}
              </div>
            ) : null}
            {!s.cronReady ? (
              <div className="apl-small" style={{ marginTop: 10, color: "#b23b1e" }}>
                ⚠️ Timer (CRON_SECRET) set nahi hai - Auto Post tab mein “Setup kaise karein” dekho. Uske bina autopilot apne-aap nahi chalega.
              </div>
            ) : null}
            {!s.geminiReady ? (
              <div className="apl-small" style={{ marginTop: 6, color: "#b23b1e" }}>
                ⚠️ GEMINI_API_KEY Render mein nahi mili - model photos nahi banengi, sirf bag posts jayengi.
              </div>
            ) : null}

            {working ? (
              <div className="apl-working">
                <span className="apl-dot" />
                <span>{s.running.stage || "Kaam chal raha hai"}... (1-3 minute, phone band kar sakte ho)</span>
              </div>
            ) : null}
          </div>

          <details className="apl-box">
            <summary style={{ fontWeight: 700, cursor: "pointer" }}>📋 Switch ON hone par bot kya-kya karta hai</summary>
            <div className="apl-small" style={{ color: "#333", marginTop: 8 }}>
              <b>Din mein 4 baar:</b> naye comments ka jawab (shikayat ho to aapko email) · line khaali ho to agli post.<br />
              <b>Roz:</b> 2 posts (bag / model) · 2 reels gaane ke saath · 3 stories · grid + website check, email report · front photos theek · 4 bags par website lifestyle photo.<br />
              <b>Hafte mein:</b> pro audit (website, products, Instagram, Facebook) · naam / description khud theek.<br />
              <b>Aapke haath:</b> story sticker / link, highlight mein daalna, archive, bio badalna, ✅ dabana.
            </div>
          </details>

          <div className="apl-box">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>🧪 Pehle dekhna hai?</div>
            <div className="apl-small">Bot agli post bana ke yahan dikhayega, Instagram par nahi daalega. Pasand aaye to ek tap mein daal do.</div>
            <div className="apl-row">
              <button type="button" className="apl-btn main" disabled={busy || working} onClick={() => act("/api/admin/autopilot/run", { dryRun: true })}>
                Test post banao
              </button>
            </div>

            {preview ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{preview.label}</div>
                <div className="apl-slides">
                  {(preview.slideUrls || []).map((url) => (
                    <img key={url} src={url} alt="" />
                  ))}
                  {preview.storyUrl ? <img className="story" src={preview.storyUrl} alt="" /> : null}
                </div>
                <div className="apl-caption">{preview.captions?.instagram}</div>
                {(preview.notes || []).length ? (
                  <div className="apl-small" style={{ marginTop: 8 }}>
                    {preview.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                ) : null}
                <div className="apl-row">
                  <button
                    type="button"
                    className="apl-btn main"
                    disabled={busy || working}
                    onClick={() => window.confirm("Ye post Instagram + Facebook par daal dun?") && act("/api/admin/autopilot/preview/publish")}
                  >
                    🚀 Ye post daal do
                  </button>
                  <button type="button" className="apl-btn" disabled={busy || working} onClick={() => act("/api/admin/autopilot/preview", null, "DELETE")}>
                    ✕ Hatao
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="apl-box">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Bot ne kya kiya</div>
            {!s.log.length ? <div className="apl-small">Abhi tak kuch nahi.</div> : null}
            {s.log.map((entry, index) => {
              const ig = entry.results?.instagram;
              const fb = entry.results?.facebook;
              return (
                <div className="apl-item" key={`${entry.at}-${index}`}>
                  {entry.thumb ? <img src={entry.thumb} alt="" loading="lazy" /> : <img alt="" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" }}>
                      {entry.ok ? "✅" : "⚠️"} {entry.label || "Post"} {entry.dryRun ? "(test)" : ""}
                    </div>
                    <div className="apl-small">
                      {when(entry.at)}
                      {ig ? ` · Instagram ${ig.ok ? "✓" : "✗"}` : ""}
                      {fb ? ` · Facebook ${fb.ok ? "✓" : "✗"}` : ""}
                      {ig?.link ? (
                        <>
                          {" · "}
                          <a href={ig.link} target="_blank" rel="noreferrer">
                            dekho
                          </a>
                        </>
                      ) : null}
                    </div>
                    {entry.message ? <div className="apl-small" style={{ color: "#333" }}>{entry.message}</div> : null}
                    {(entry.notes || []).length ? (
                      <button type="button" className="apl-mini" style={{ marginTop: 4 }} onClick={() => setOpenLog(openLog === index ? null : index)}>
                        {openLog === index ? "▲ check band karo" : "🔍 photo check dekho"}
                      </button>
                    ) : null}
                    {openLog === index ? (
                      <div className="apl-small" style={{ marginTop: 4 }}>
                        {entry.notes.map((note) => (
                          <div key={note}>{note}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {pro ? <ProPanel p={pro} busy={busy} act={proAct} /> : null}

          {daily ? <DailyPanel d={daily} busy={busy} act={dailyAct} /> : null}

          <div className="apl-box">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>🖼 Model photos ({s.library.length})</div>
            <div className="apl-small" style={{ marginBottom: 8 }}>
              Ye sab check paas karke bani hain. Koi photo galat lage to ✕ dabao, bot use kabhi nahi lagayega.
            </div>
            <div className="apl-lib">
              {s.library.map((item) => (
                <div key={item.url}>
                  <img src={item.url} alt="" loading="lazy" />
                  <button
                    type="button"
                    aria-label="Photo hatao"
                    disabled={busy}
                    onClick={() => window.confirm("Ye model photo hata dun?") && act("/api/admin/autopilot/lifestyle/delete", { url: item.url })}
                  >
                    ✕
                  </button>
                  <span>{item.usedAt ? "lag chuki" : "baaki"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const STORY_LABEL = { newin: "New in", thisorthat: "This or that", cod: "Easy ordering (COD)", styled: "Styled look" };

function DailyPanel({ d, busy, act }) {
  const report = d.report;
  const review = report?.review || {};
  const issues = report?.website?.issues || [];
  const [showIssues, setShowIssues] = useState(false);
  const working = Boolean(d.working);
  const lock = busy || working;

  return (
    <>
      {working ? (
        <div className="apl-working" style={{ marginBottom: 16 }}>
          <span className="apl-dot" />
          <span>{d.working.stage || "Kaam chal raha hai"}...</span>
        </div>
      ) : null}
      {d.lastError && Date.now() - d.lastError.at < 2 * 24 * 3600 * 1000 ? (
        <div className="apl-box apl-small" style={{ color: "#b23b1e" }}>⚠️ {when(d.lastError.at)}: {d.lastError.message}</div>
      ) : null}

      <div className="apl-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📅 Roz ka check</div>
        <div className="apl-small">Har din bot grid, posts ke numbers, website aur products dekh ke email bhejta hai.</div>
        {report ? (
          <div style={{ marginTop: 10 }}>
            <div className="apl-small" style={{ color: "#333" }}>
              {when(report.at)} · followers <b>{report.followersNow ?? "-"}</b>
              {report.followersWeekAgo != null ? ` (hafte pehle ${report.followersWeekAgo})` : ""}
              {review.score != null ? <> · grid <b>{review.score}/10</b></> : null}
            </div>
            {(report.tasks || []).length ? (
              <div className="apl-caption" style={{ marginTop: 8 }}>
                <b>Aaj ke 3 kaam</b>
                {report.tasks.map((task, i) => (
                  <div key={task}>{i + 1}. {task}</div>
                ))}
                {report.adsNote ? <div style={{ marginTop: 6 }}>Ads: {report.adsReady ? "✅ tayyar" : "⏳ abhi nahi"} - {report.adsNote}</div> : null}
              </div>
            ) : null}
            {report.gridUrl ? <img src={report.gridUrl} alt="Instagram grid" style={{ width: "100%", maxWidth: 360, borderRadius: 10, marginTop: 10, display: "block" }} /> : null}
            {review.verdict ? <div style={{ fontSize: 14, marginTop: 8 }}>{review.verdict}</div> : null}
            {(review.problems || []).map((p) => (
              <div className="apl-small" key={p}>• {p}</div>
            ))}
            {report.archive?.length ? (
              <div className="apl-row">
                <span className="apl-small" style={{ color: "#333" }}>Archive karo:</span>
                {report.archive.map((a, i) => (
                  <a key={a.link} href={a.link} target="_blank" rel="noreferrer">
                    <img src={a.thumb} alt={`Post ${i + 1}`} style={{ width: 40, height: 50, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} />
                  </a>
                ))}
              </div>
            ) : null}
            {review.next_post ? <div className="apl-small" style={{ marginTop: 6, color: "#333" }}>Agli post: {review.next_post}</div> : null}
            <button type="button" className="apl-mini" style={{ marginTop: 8 }} onClick={() => setShowIssues((v) => !v)}>
              🌐 Website: {issues.length ? `${issues.length} dikkatein ${showIssues ? "▲" : "▼"}` : "sab theek ✅"}
            </button>
            {showIssues ? (
              <div className="apl-small" style={{ marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
                {issues.map((issue, i) => (
                  <div key={`${issue.productId}-${i}`}>
                    <b>{issue.name}</b>: {issue.problem}
                  </div>
                ))}
              </div>
            ) : null}
            {report.gridError ? <div className="apl-small" style={{ color: "#b23b1e" }}>Grid: {report.gridError}</div> : null}
          </div>
        ) : (
          <div className="apl-small" style={{ marginTop: 6 }}>Pehla check abhi nahi hua.</div>
        )}
        <div className="apl-row">
          <button type="button" className="apl-btn" disabled={lock} onClick={() => act("/api/admin/autopilot/daily/check")}>Abhi check karo</button>
        </div>
      </div>

      <div className="apl-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🔧 Website photos: bot ne theek kiya / lagaya</div>
        <div className="apl-small">
          Har bag (aur har colour) ki pehli photo poore bag ki saaf front photo honi chahiye. Galat ho to bot sahi photo aage kar deta hai, kuch delete nahi karta.
        </div>
        {d.lastFrontRun ? (
          <div className="apl-small" style={{ marginTop: 6, color: "#333" }}>
            {when(d.lastFrontRun.at)}: {d.lastFrontRun.moved} theek kiye
            {d.lastFrontRun.needPhoto?.length ? ` · nayi front photo chahiye: ${d.lastFrontRun.needPhoto.join(", ")}` : ""}
          </div>
        ) : null}
        {(d.fixLog || []).slice(0, 8).map((f) => (
          <div className="apl-item" key={`${f.at}-${f.productId}-${f.field}`}>
            <img src={f.after?.[0]} alt="" loading="lazy" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" }}>
                {f.name}{f.colour ? ` · ${f.colour}` : ""}
              </div>
              <div className="apl-small">{when(f.at)} · {f.reason}</div>
              {f.undone ? (
                <div className="apl-small">↩️ wapas kar diya</div>
              ) : (
                <button type="button" className="apl-mini" style={{ marginTop: 4 }} disabled={lock} onClick={() => window.confirm("Purani photo wapas pehle laga dun?") && act("/api/admin/autopilot/daily/undo-fix", { at: f.at, productId: f.productId })}>
                  ↩️ Wapas karo
                </button>
              )}
            </div>
          </div>
        ))}
        {d.lastLifestyleRun ? (
          <div className="apl-small" style={{ marginTop: 6, color: "#333" }}>
            {when(d.lastLifestyleRun.at)}: {d.lastLifestyleRun.added} bags par lifestyle photo lagi
            {d.lastLifestyleRun.failed?.length ? ` · check fail: ${d.lastLifestyleRun.failed.join(", ")}` : ""}
          </div>
        ) : null}
        <div className="apl-row">
          <button type="button" className="apl-btn" disabled={lock} onClick={() => act("/api/admin/autopilot/daily/front-photos")}>Saari front photos abhi check karo</button>
          <button type="button" className="apl-btn" disabled={lock} onClick={() => window.confirm("8 bags tak ki lifestyle photo bana ke website gallery mein 2nd number par laga dun? (Gemini ka thoda kharcha)") && act("/api/admin/autopilot/daily/lifestyle-gallery")}>Website pe lifestyle photos lagao</button>
        </div>
        <div className="apl-small" style={{ marginTop: 6 }}>Lifestyle photo par website mein chhota “Styled image” likha aata hai. Roz 2 naye bags apne-aap.</div>
      </div>

      <div className="apl-box">
        <div className="apl-switch">
          <div>
            <div style={{ fontWeight: 700 }}>💬 Comments ke jawab</div>
            <div className="apl-small">Instagram + Facebook ke naye comments ka chhota, sach jawab. Shikayat ho to aapko email.</div>
          </div>
          <button type="button" aria-label="Comment replies on / off" className={d.repliesOn ? "apl-toggle on" : "apl-toggle"} disabled={lock} onClick={() => act("/api/admin/autopilot/daily/settings", { repliesOn: !d.repliesOn })} />
        </div>
        {d.replyError ? <div className="apl-small" style={{ color: "#b23b1e", marginTop: 6 }}>⚠️ {d.replyError}</div> : null}
        <div style={{ marginTop: 8 }}>
          {!d.replyLog.length ? <div className="apl-small">Abhi tak koi jawab nahi.</div> : null}
          {d.replyLog.slice(0, 8).map((r, i) => (
            <div key={`${r.at}-${i}`} className="apl-small" style={{ padding: "6px 0", borderBottom: "1px solid #f0ebe0", color: "#333" }}>
              {r.action === "alert" ? "⚠️" : r.action === "skip" ? "⏭" : "💬"} <b>{r.user}</b> ({r.platform === "instagram" ? "IG" : "FB"}): {r.text}
              {r.reply ? <div style={{ color: "#666" }}>↳ {r.reply}</div> : null}
            </div>
          ))}
        </div>
        <div className="apl-row">
          <button type="button" className="apl-mini" disabled={lock} onClick={() => act("/api/admin/autopilot/daily/replies")}>Abhi comments dekho</button>
        </div>
      </div>

      <div className="apl-box">
        <div className="apl-switch">
          <div>
            <div style={{ fontWeight: 700 }}>📖 Stories</div>
            <div className="apl-small">Baari-baari: New in, This or that, Easy ordering, Styled look. Agli: <b>{STORY_LABEL[d.nextStory]}</b> · aaj {d.todayStories}/{d.storiesPerDay}</div>
          </div>
        </div>
        <div className="apl-row">
          <span className="apl-small" style={{ color: "#333" }}>Roz stories:</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={d.storiesPerDay === n ? "apl-mini on" : "apl-mini"} disabled={lock} onClick={() => act("/api/admin/autopilot/daily/settings", { storiesPerDay: n, storyDaily: n > 0 })}>
              {n === 0 ? "Band" : n}
            </button>
          ))}
        </div>
        {d.storyLog.slice(0, 4).map((st, i) => (
          <div className="apl-item" key={`${st.at}-${i}`}>
            <img src={st.thumb} alt="" loading="lazy" style={{ aspectRatio: "9 / 16", height: 64, width: "auto" }} />
            <div className="apl-small" style={{ color: "#333" }}>
              {STORY_LABEL[st.kind]} · {st.bags.join(" + ")}
              <br />
              {when(st.at)} · IG {st.results?.instagram?.ok ? "✓" : "✗"} · FB {st.results?.facebook?.ok ? "✓" : "✗"}
              <br />
              👉 Highlight: <b>{st.highlight}</b> mein daal do{st.kind === "thisorthat" ? " · poll sticker lagao" : ""}
            </div>
          </div>
        ))}
        <div className="apl-row">
          <button type="button" className="apl-mini" disabled={lock} onClick={() => window.confirm("Abhi ek story Instagram + Facebook par laga dun?") && act("/api/admin/autopilot/daily/story")}>Abhi story lagao</button>
        </div>
      </div>

      <div className="apl-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🎬 Reels</div>
        <div className="apl-small">Server khud reel banata hai (ek bag ya kai bags), aapke gaane ke saath, aur Instagram + Facebook par daalta hai.</div>
        <div className="apl-row">
          <span className="apl-small" style={{ color: "#333" }}>Roz reels:</span>
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className={d.reelsPerDay === n ? "apl-mini on" : "apl-mini"} disabled={lock} onClick={() => act("/api/admin/autopilot/daily/settings", { reelsPerDay: n })}>
              {n === 0 ? "Band" : n}
            </button>
          ))}
          <span className="apl-small"> · aaj {d.todayReels}/{d.reelsPerDay}</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>🎵 Gaane ({d.music.length})</div>
        <div className="apl-small">Pixabay Music se free instrumental gaane daalo. Bot har gaana sun ke dekhta hai: shaant gaane ek bag / model reels par, tez gaane kai bags wali reels par. Jo na jache wo nahi lagega.</div>
        {d.music.map((m) => (
          <div key={m.url} className="apl-row" style={{ marginTop: 4 }}>
            <span className="apl-small" style={{ color: "#333", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
              ♪ {m.name}
              {m.kb ? <span style={{ color: "#888" }}> · {m.kb} KB{m.originalKb && m.originalKb > m.kb ? ` (pehle ${(m.originalKb / 1024).toFixed(1)} MB)` : ""}</span> : null}
              {m.check ? (
                <span style={{ display: "block", color: m.check.use ? "#2e7d32" : "#b23b1e" }}>
                  {m.check.use
                    ? `✅ ${m.check.mood === "upbeat" ? "Tez - kai bags wali reels" : "Shaant - ek bag / model reels"} · ${m.check.fit}/10`
                    : `❌ Reels mein nahi lagega - ${m.check.vocals ? "isme bol (singing) hain" : `jachta nahi (${m.check.fit}/10)`}`}
                  {m.check.note ? ` · ${m.check.note}` : ""}
                </span>
              ) : (
                <span style={{ display: "block", color: "#8a7650" }}>⏳ Bot ne ye gaana abhi suna nahi - neeche “Gaane check karo” dabao</span>
              )}
            </span>
            <button type="button" className="apl-mini" disabled={lock} onClick={() => window.confirm("Ye gaana hata dun?") && act("/api/admin/autopilot/music/delete", { url: m.url })}>✕</button>
          </div>
        ))}
        <label className="apl-mini" style={{ display: "inline-block", marginTop: 8, opacity: lock ? 0.45 : 1 }}>
          ➕ Gaana daalo
          <input
            type="file"
            accept="audio/*,.mp3,.m4a"
            disabled={lock}
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const form = new FormData();
              form.append("song", file);
              act("/api/admin/autopilot/music", form);
            }}
          />
        </label>
        {d.music.some((m) => !m.check || !m.small) ? (
          <button type="button" className="apl-mini" style={{ marginTop: 8, marginLeft: 6 }} disabled={lock} onClick={() => act("/api/admin/autopilot/music/fix")}>
            🎧 Gaane check karo
          </button>
        ) : null}
        {!d.ffmpegReady ? <div className="apl-small" style={{ color: "#b23b1e", marginTop: 6 }}>⚠️ Server par video banane ka tool (ffmpeg) nahi mila - Render deploy dobara karo.</div> : null}

        <div className="apl-row" style={{ marginTop: 12 }}>
          <button type="button" className="apl-btn" disabled={lock} onClick={() => act("/api/admin/autopilot/reel/test")}>Test reel banao</button>
        </div>
        {d.reelPreview ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{d.reelPreview.label}{d.reelPreview.music ? ` · ♪ ${d.reelPreview.music}` : " · bina gaane"}</div>
            <video src={d.reelPreview.videoUrl} poster={d.reelPreview.coverUrl} controls playsInline style={{ width: 200, maxWidth: "100%", aspectRatio: "9 / 16", borderRadius: 10, background: "#000", marginTop: 6, display: "block" }} />
            <div className="apl-caption" style={{ marginTop: 8 }}>{d.reelPreview.caption?.instagram}</div>
            <div className="apl-row">
              <button type="button" className="apl-btn main" disabled={lock} onClick={() => window.confirm("Ye reel Instagram + Facebook par daal dun?") && act("/api/admin/autopilot/reel/publish")}>🚀 Reel daal do</button>
              <button type="button" className="apl-btn" disabled={lock} onClick={() => act("/api/admin/autopilot/reel/preview", null, "DELETE")}>✕ Hatao</button>
            </div>
          </div>
        ) : null}
        {d.reelLog.slice(0, 4).map((rl, i) => (
          <div key={`${rl.at}-${i}`} className="apl-small" style={{ marginTop: 6, color: "#333" }}>
            {rl.ok ? "✅" : "⚠️"} {rl.label} · {when(rl.at)}
            {rl.results?.instagram?.link ? <> · <a href={rl.results.instagram.link} target="_blank" rel="noreferrer">dekho</a></> : null}
            {rl.results?.instagram && !rl.results.instagram.ok ? ` · IG: ${rl.results.instagram.message}` : ""}
          </div>
        ))}
      </div>
    </>
  );
}

const WHO = { bot: "🤖 bot", one_tap: "👆 1 tap", you: "🙋 aap" };
const AREA = { website: "Website", products: "Products", instagram: "Instagram", facebook: "Facebook", trust: "Bharosa" };

function ProPanel({ p, busy, act }) {
  const [showAll, setShowAll] = useState(false);
  const audit = p.audit;
  const t = audit?.thinking || {};
  const lock = busy || Boolean(p.working);
  return (
    <>
      <div className="apl-box">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🧠 Pro audit (hafte mein ek baar)</div>
        <div className="apl-small">Web developer + social media manager ki checklist: website, products, Instagram, Facebook. Phir sochta hai sabse pehle kya theek karna hai.</div>
        <div className="apl-switch" style={{ marginTop: 10 }}>
          <div className="apl-small" style={{ color: "#333" }}>
            <b>Naam / description bot khud theek kare</b>
            <br />
            Sirf bag ki saved jaankari se, bina jhooth ke. Har badlav ↩️ se wapas ho sakta hai.
          </div>
          <button type="button" aria-label="Auto fix on / off" className={p.autoApply ? "apl-toggle on" : "apl-toggle"} disabled={lock} onClick={() => act("/api/admin/autopilot/pro/settings", { autoApply: !p.autoApply })} />
        </div>
        {p.working ? (
          <div className="apl-working">
            <span className="apl-dot" />
            <span>{p.working.stage || "Audit chal raha hai"}... (2-4 minute)</span>
          </div>
        ) : null}
        {audit ? (
          <div style={{ marginTop: 10 }}>
            <div className="apl-small" style={{ color: "#333" }}>
              {when(audit.at)}
              {t.scores
                ? Object.entries(t.scores).map(([k, v]) => (
                    <span key={k}> · {AREA[k] || k} <b>{v}/10</b></span>
                  ))
                : null}
            </div>
            {t.summary ? <div style={{ fontSize: 14, marginTop: 6 }}>{t.summary}</div> : null}
            {(t.actions || []).length ? (
              <div className="apl-caption" style={{ marginTop: 8 }}>
                <b>Is hafte ke kaam</b>
                {t.actions.map((a, i) => (
                  <div key={`${a.text}-${i}`} style={{ marginTop: 4 }}>
                    {i + 1}. {a.text} <span style={{ color: "#8a7650" }}>({WHO[a.who] || a.who}{a.minutes ? `, ~${a.minutes} min` : ""})</span>
                  </div>
                ))}
                {t.ads_note ? <div style={{ marginTop: 6 }}>Ads: {t.ads_ready ? "✅ tayyar" : "⏳ abhi nahi"} - {t.ads_note}</div> : null}
              </div>
            ) : null}
            <button type="button" className="apl-mini" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "▲ poori checklist band karo" : `▼ poori checklist (${audit.findings.length} baatein)`}
            </button>
            {showAll ? (
              <div className="apl-small" style={{ marginTop: 6, color: "#333" }}>
                {audit.findings.map((f, i) => (
                  <div key={i}>{f.level === "done" ? "✅" : f.level === "high" ? "🔴" : f.level === "mid" ? "🟡" : "⚪"} <b>{AREA[f.area] || f.area}:</b> {f.text}</div>
                ))}
                {(audit.perProduct || []).length ? <div style={{ marginTop: 8, fontWeight: 600 }}>Har bag:</div> : null}
                {(audit.perProduct || []).map((x) => (
                  <div key={x.productId}>• <b>{x.name}</b>: {x.problems.map((q) => q.text).join(" · ")}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="apl-small" style={{ marginTop: 6 }}>Pehla audit abhi nahi hua.</div>
        )}
        <div className="apl-row">
          <button type="button" className="apl-btn" disabled={lock} onClick={() => act("/api/admin/autopilot/pro/audit")}>Pura audit abhi karo</button>
        </div>
      </div>

      {p.suggestions.length || p.applied.length ? (
        <div className="apl-box">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>✍️ Naam / description ({p.suggestions.length} baaki)</div>
          <div className="apl-small">Bot ne sirf bag ki saved jaankari se sach-sach naam / description likhe hain. ✅ dabane par hi website par badlega.</div>
          {p.suggestions.map((s) => (
            <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid #f0ebe0" }}>
              <div className="apl-small" style={{ color: "#8a7650" }}>{s.field === "name" ? "Naam" : "Description"} · {s.why}</div>
              <div className="apl-small" style={{ textDecoration: "line-through" }}>{s.before || "(khaali)"}</div>
              <div style={{ fontSize: 14, color: "#1c150d", marginTop: 2 }}>{s.after}</div>
              <div className="apl-row">
                <button type="button" className="apl-mini on" disabled={lock} onClick={() => act("/api/admin/autopilot/pro/suggestion", { id: s.id, action: "apply" })}>✅ Lagao</button>
                <button
                  type="button"
                  className="apl-mini"
                  disabled={lock}
                  onClick={() => {
                    const text = window.prompt("Apne hisaab se badlo:", s.after);
                    if (text && text.trim()) act("/api/admin/autopilot/pro/suggestion", { id: s.id, action: "apply", text });
                  }}
                >
                  ✏️ Badal ke lagao
                </button>
                <button type="button" className="apl-mini" disabled={lock} onClick={() => act("/api/admin/autopilot/pro/suggestion", { id: s.id, action: "dismiss" })}>✕ Nahi</button>
              </div>
            </div>
          ))}
          {p.applied.length ? <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>Lag chuke</div> : null}
          {p.applied.map((a) => (
            <div key={`${a.id}-${a.appliedAt}`} className="apl-row" style={{ marginTop: 4 }}>
              <span className="apl-small" style={{ color: "#333", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {a.auto ? "🤖 " : ""}{a.field === "name" ? "Naam" : "Description"}: {a.after.slice(0, 70)}{a.undone ? " (wapas kiya)" : ""}
              </span>
              {!a.undone ? (
                <button type="button" className="apl-mini" disabled={lock} onClick={() => act("/api/admin/autopilot/pro/undo", { id: a.id })}>↩️</button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/*
 * (v12) TOP CARD - "is the bot working?" in one look: right now, today's
 * counts, timer, and a simple feed of everything it did.
 */
function ActivityCard({ API, adminFetch }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer = null;
    async function load() {
      try {
        const response = await adminFetch(`${API}/api/admin/autopilot/activity`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || `Server error ${response.status}`);
        if (!stop) {
          setA(data);
          setError("");
        }
      } catch (err) {
        if (!stop) setError(friendly(err));
      }
      if (!stop) timer = setTimeout(load, 20000);
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !a) return <div className="apl-box apl-small" style={{ color: "#b23b1e" }}>Bot ki jaankari nahi aayi: {error}</div>;
  if (!a) return <div className="apl-box apl-small">Bot ki jaankari aa rahi hai...</div>;

  const tickOk = a.lastTickAt && Date.now() - a.lastTickAt < 6 * 3600 * 1000;
  const status = !a.enabled
    ? { color: "#b23b1e", text: "⏸ Bot band hai - neeche switch ON karo" }
    : a.now
      ? { color: "#1c150d", text: `⚙️ Abhi kaam kar raha hai: ${a.now}` }
      : tickOk
        ? { color: "#2e7d32", text: "🟢 Bot chalu hai - agle timer par phir kaam karega" }
        : { color: "#b23b1e", text: "🔴 Timer 6 ghante se nahi chala - cron-job.org check karo" };
  const list = more ? a.events : a.events.slice(0, 8);

  return (
    <div className="apl-box" style={{ borderColor: "#1c150d" }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: status.color }}>{status.text}</div>
      <div className="apl-small" style={{ marginTop: 4 }}>
        {a.lastTickAt ? `Timer aakhri baar chala: ${when(a.lastTickAt)}` : "Timer abhi tak nahi chala"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 10, textAlign: "center" }}>
        {[
          ["Posts", a.today.posts],
          ["Reels", a.today.reels],
          ["Stories", a.today.stories],
          ["Jawab", a.today.replies],
          ["Sudhaar", a.today.fixes],
        ].map(([label, n]) => (
          <div key={label} style={{ background: "#f6f3ee", borderRadius: 10, padding: "8px 2px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1c150d" }}>{n}</div>
            <div style={{ fontSize: 10, color: "#666" }}>{label}</div>
          </div>
        ))}
      </div>
      <div className="apl-small" style={{ marginTop: 4, textAlign: "center" }}>aaj</div>
      <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>Bot ne kya kiya</div>
      {!a.events.length ? <div className="apl-small">Abhi tak kuch nahi. Pehla kaam agle timer par hoga.</div> : null}
      {list.map((e, i) => (
        <div key={`${e.at}-${i}`} className="apl-small" style={{ padding: "6px 0", borderBottom: "1px solid #f0ebe0", color: e.ok ? "#333" : "#b23b1e", overflowWrap: "anywhere" }}>
          <span style={{ color: "#999" }}>{when(e.at)}</span> {e.icon} {e.text}
          {e.link ? (
            <>
              {" "}
              <a href={e.link} target="_blank" rel="noreferrer">dekho</a>
            </>
          ) : null}
        </div>
      ))}
      {a.events.length > 8 ? (
        <button type="button" className="apl-mini" style={{ marginTop: 8 }} onClick={() => setMore((v) => !v)}>
          {more ? "▲ kam dikhao" : `▼ sab dikhao (${a.events.length})`}
        </button>
      ) : null}
    </div>
  );
}
