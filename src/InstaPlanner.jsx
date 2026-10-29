import { useEffect, useMemo, useState } from "react";
import { absoluteUrl, productVariants } from "./AdMaker";

/*
 * ADMIN > INSTA PLANNER (2026-10-29 v2)
 * One clear job at a time, in an order that makes the Instagram grid look
 * like a big brand page (Miraggio style): a post, then 2-3 reels, then a
 * post again - single-bag reels, many-bag reels and model / lifestyle
 * photo posts mixed, so more bags are seen and nothing repeats.
 *
 * Every 3 bags (A, B, C) make one round of 8 jobs:
 *   1 Post A   2 Reel A   3 Reel many bags   4 Model-photo post B
 *   5 Reel B   6 Reel C   7 Post C           8 Reel many bags
 * Reel templates rotate so two reels never look the same.
 * "🔍 Model photos dhoondo" checks every bag's photos and finds the ones
 * that are not on a plain background (model / lifestyle shots).
 * Everything is saved on this phone (localStorage) - nothing on the server.
 * (v3) The plan never ends: after every bag is done, a new round starts
 * (new order, new templates, other post design). New bags join the next round.
 */

const KEY = "shrimoh-insta-planner-v2";
const SINGLE = [
  ["showcase", "✨ Showcase"],
  ["details", "🔍 Zoom details"],
  ["bounce1", "🏀 Bounce"],
  ["angles", "🔄 Every angle"],
  ["magazine1", "📰 Magazine"],
  ["fastcuts1", "⚡ Fast cuts"],
  ["polaroid1", "📸 Polaroid"],
  ["grid", "🖼 Grid"],
  ["guess", "👀 Guess the price"],
];
const MULTI = [
  ["newin", "New in"],
  ["fastcuts", "⚡ Fast cuts"],
  ["filmstrip", "🎞 Film strip"],
  ["toplist", "🏆 Top picks"],
  ["collage", "🖼 Collage"],
  ["swipe", "👉 Swipe"],
  ["bounce", "🏀 Bounce"],
  ["magazine", "📰 Magazine"],
  ["split", "↔️ This or that"],
  ["polaroid", "📸 Polaroid"],
];

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return { done: saved.done || {}, later: saved.later || [], life: saved.life || {}, scanned: saved.scanned || {} };
  } catch {
    return { done: {}, later: [], life: {}, scanned: {} };
  }
}

const today = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// Is the photo on a plain background? (white / light grey studio photo)
async function plainPhoto(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const W = 96;
    const H = Math.max(8, Math.round((img.height / img.width) * W));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let rough = 0;
    let light = 0;
    let n = 0;
    let prev = null;
    const visit = (x, y) => {
      const i = (y * W + x) * 4;
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 > 205) light++;
      if (prev !== null && Math.abs(d[i] - d[prev]) + Math.abs(d[i + 1] - d[prev + 1]) + Math.abs(d[i + 2] - d[prev + 2]) > 30) rough++;
      prev = i;
      n++;
    };
    for (let x = 0; x < W; x++) visit(x, 0);
    for (let y = 0; y < H; y++) visit(W - 1, y);
    for (let x = W - 1; x >= 0; x--) visit(x, H - 1);
    for (let y = H - 1; y >= 0; y--) visit(0, y);
    return rough / n < 0.12 && light / n > 0.8;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function InstaPlanner({ API, adminFetch, products, onOpen }) {
  const [state, setState] = useState(load);
  const [scan, setScan] = useState(null); // { done, total } while scanning
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage blocked
    }
  }, [state]);

  const bags = useMemo(() => {
    const active = (Array.isArray(products) ? products : []).filter((product) => product && product.active !== false);
    const later = new Set(state.later.map(String));
    return [...active.filter((p) => !later.has(String(p.id))), ...state.later.map((id) => active.find((p) => String(p.id) === String(id))).filter(Boolean)];
  }, [products, state.later]);

  const lifeOf = (bag) => state.life[String(bag.id)] || [];

  // (v3) NEVER ENDS: the plan is made of CYCLES. One cycle = every bag
  // once (rounds of 8 jobs for every 3 bags). When a cycle is finished the
  // next one starts by itself - bags in a new order, new reel templates,
  // a different post design - so there is always a next job, every day.
  const plan = useMemo(() => {
    const jobs = [];
    if (!bags.length) return jobs;
    let single = 0;
    let multi = 0;
    let groupAt = 0;
    const nextSingle = () => SINGLE[single++ % SINGLE.length];
    const nextMulti = () => MULTI[multi++ % MULTI.length];
    const group = () => {
      const out = [];
      for (let k = 0; k < Math.min(5, bags.length); k++) out.push(bags[(groupAt + k) % bags.length]);
      groupAt += Math.min(5, bags.length);
      return out;
    };
    for (let cycle = 0; cycle < 60; cycle++) {
      const shift = (cycle * 4) % bags.length;
      const queue = [...bags.slice(shift), ...bags.slice(0, shift)];
      const design = cycle % 2 === 0 ? "studio" : "clean";
      let round = 0;
      while (queue.length) {
        const a = queue.shift();
        const bIndex = queue.findIndex((bag) => lifeOf(bag).length);
        const b = bIndex >= 0 ? queue.splice(bIndex, 1)[0] : queue.shift();
        const c = queue.shift();
        const r = `c${cycle}r${round++}`;
        jobs.push({ key: `${r}-post-${a.id}`, type: "post", design, cycle, bags: [a] });
        jobs.push({ key: `${r}-reel-${a.id}`, type: "reel", cycle, bags: [a], template: nextSingle() });
        if (bags.length >= 3) jobs.push({ key: `${r}-multi1`, type: "multi", cycle, bags: group(), template: nextMulti() });
        if (b) {
          jobs.push({ key: `${r}-life-${b.id}`, type: lifeOf(b).length ? "life" : "post", design, cycle, bags: [b] });
          jobs.push({ key: `${r}-reel-${b.id}`, type: "reel", cycle, bags: [b], template: nextSingle() });
        }
        if (c) {
          jobs.push({ key: `${r}-reel-${c.id}`, type: "reel", cycle, bags: [c], template: nextSingle() });
          jobs.push({ key: `${r}-post-${c.id}`, type: "post", design, cycle, bags: [c] });
        }
        if (bags.length >= 3 && (b || c)) jobs.push({ key: `${r}-multi2`, type: "multi", cycle, bags: group(), template: nextMulti() });
      }
      // stop once there are plenty of jobs ahead of the next open one
      const open = jobs.findIndex((job) => !state.done[job.key]);
      if (open >= 0 && jobs.length > open + 24) break;
    }
    return jobs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bags, state.life, state.done]);

  const nextIndex = plan.findIndex((job) => !state.done[job.key]);
  const next = nextIndex >= 0 ? plan[nextIndex] : null;
  const doneJobs = plan.filter((job) => state.done[job.key]);

  function markDone(job) {
    setState((current) => ({ ...current, done: { ...current.done, [job.key]: today() } }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function undoLast() {
    const last = [...plan].reverse().find((job) => state.done[job.key]);
    if (!last) return;
    setState((current) => {
      const done = { ...current.done };
      delete done[last.key];
      return { ...current, done };
    });
  }

  function later(job) {
    const id = job.bags[0] && job.bags[0].id;
    if (id == null) return;
    setState((current) => ({ ...current, later: [...current.later.filter((x) => String(x) !== String(id)), id] }));
  }

  async function findLifestyle() {
    if (scan) return;
    const list = bags.filter((bag) => !state.scanned[String(bag.id)]);
    setScan({ done: 0, total: list.length });
    let count = 0;
    for (const bag of list) {
      const urls = Array.from(new Set(productVariants(API, bag).flatMap((variant) => variant.urls))).filter(Boolean);
      const found = [];
      for (const url of urls) {
        try {
          let blob;
          try {
            const direct = await fetch(url, { mode: "cors" });
            if (!direct.ok) throw new Error("direct");
            blob = await direct.blob();
          } catch {
            const response = await adminFetch(`${API}/api/admin/photo-original?url=${encodeURIComponent(url)}`);
            if (!response.ok) continue;
            blob = await response.blob();
          }
          if (!(await plainPhoto(blob))) found.push(url);
        } catch {
          // skip this photo
        }
      }
      count += 1;
      setState((current) => ({
        ...current,
        life: { ...current.life, [String(bag.id)]: found },
        scanned: { ...current.scanned, [String(bag.id)]: true },
      }));
      setScan({ done: count, total: list.length });
    }
    setScan(null);
  }

  const thumb = (bag) => absoluteUrl(API, bag.image || (Array.isArray(bag.images) ? bag.images[0] : ""));
  const lifeCount = bags.filter((bag) => lifeOf(bag).length).length;
  const scannedCount = bags.filter((bag) => state.scanned[String(bag.id)]).length;

  function card(job) {
    const bag = job.bags[0];
    if (job.type === "post" || job.type === "life") {
      const isLife = job.type === "life";
      return {
        icon: "📷",
        title: isLife ? "MODEL / LIFESTYLE photo wali POST" : job.design === "clean" ? "POST (Clean design, carousel)" : "Studio POST (carousel)",
        tool: "ads",
        toolLabel: "Ad Maker kholo",
        lines: isLife
          ? [
              "Ad Maker → is bag ko search karo → neeche wali model photo chuno",
              "Design: “On photo” ya “Clean · text below” → Post mein jodo",
              "Slide 2: Studio design (price) → jodo",
              "Post karo. Caption mein ise apna photoshoot mat batana",
              "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
            ]
          : job.design === "clean"
            ? [
                "Ad Maker → is bag ko search karo",
                "Slide 1: “Clean · text below” (naam + price) → Post mein jodo",
                "Slide 2-3: dusre colours (“No text · only bag”) → jodo",
                "Post karo",
                "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
              ]
            : [
                "Ad Maker → is bag ko search karo",
                "Slide 1: ✨ Studio + chhoti line → Post mein jodo",
                "Slide 2-3: dusre colours (Studio, “Koi line nahi”) → jodo",
                "Post karo",
                "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
              ],
        photos: isLife ? lifeOf(bag).slice(0, 4) : [],
        done: isLife ? "✓ Model post + story + highlight ho gaya" : "✓ Post + story + highlight ho gaya",
      };
    }
    if (job.type === "reel") {
      return {
        icon: "🎬",
        title: `Ek bag ki REEL · ${job.template[1]}`,
        tool: "reels",
        toolLabel: "Reel Maker kholo",
        lines: [
          `Reel Maker → 👜 Ek bag → “${job.template[1]}”`,
          "Is bag ko chuno → 2-4 achhi photos chuno → 🎬 Reel banao → Save",
          "Instagram: + → Reel → gaana → cover = is bag ki Studio photo",
          "Story mein share kar sakte ho (highlight mein NAHI)",
        ],
        photos: [],
        done: "✓ Reel daal di",
      };
    }
    return {
      icon: "🎞",
      title: `KAI BAGS ki REEL · ${job.template[1]}`,
      tool: "reels",
      toolLabel: "Reel Maker kholo",
      lines: [
        `Reel Maker → 🛍 Kai bags → “${job.template[1]}”`,
        `Ye ${job.bags.length} bags chuno (neeche dikhe hain) → 🎬 Reel banao → Save`,
        "Instagram: + → Reel → gaana → cover = pehle bag ki Studio photo",
        "Story mein share kar sakte ho (highlight mein NAHI)",
      ],
      photos: [],
      done: "✓ Reel daal di",
    };
  }

  const c = next ? card(next) : null;
  // grid preview: newest first, like the Instagram profile
  const preview = [...plan.slice(0, Math.max(0, nextIndex === -1 ? plan.length : nextIndex + 6))].reverse().slice(0, 12);

  return (
    <div className="panel">
      <style>{`
        .ip-card { border: 2px solid #1c150d; border-radius: 16px; padding: 14px; margin-bottom: 16px; background: #fffdf8; }
        .ip-card h3 { margin: 0 0 8px; font-size: 17px; line-height: 1.35; }
        .ip-bags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .ip-b { width: 64px; text-align: center; font-size: 10px; color: #444; }
        .ip-b img { width: 64px; height: 64px; object-fit: contain; background: #fff; border-radius: 10px; border: 1px solid #eee; display: block; }
        .ip-b span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
        .ip-steps { margin: 6px 0 12px 18px; padding: 0; font-size: 14px; line-height: 1.6; }
        .ip-btn { padding: 11px 14px; border-radius: 12px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .ip-btn.main { background: #1c150d; color: #fff; }
        .ip-btn:disabled { opacity: 0.5; }
        .ip-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ip-stats { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .ip-stat { flex: 1 1 90px; background: #f6f3ea; border-radius: 12px; padding: 10px; text-align: center; font-size: 12px; color: #555; }
        .ip-stat b { display: block; font-size: 20px; color: #1c150d; }
        .ip-chip { padding: 8px 12px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font-size: 13px; cursor: pointer; color: #111; }
        .ip-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin: 8px 0 16px; max-width: 360px; }
        .ip-cell { position: relative; aspect-ratio: 3 / 4; background: #fff; border: 1px solid #eee; overflow: hidden; }
        .ip-cell img { width: 100%; height: 100%; object-fit: contain; }
        .ip-cell .tag { position: absolute; top: 4px; right: 4px; font-size: 13px; }
        .ip-cell.todo { opacity: 0.45; border-style: dashed; }
        .ip-cell.now { outline: 3px solid #1c150d; opacity: 1; }
        .ip-rules { background: #f6f3ea; border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.6; margin-bottom: 14px; }
        .ip-small { font-size: 12px; color: #777; line-height: 1.5; }
      `}</style>
      <div className="panel-header">
        <h2 className="panel-title">Insta Planner</h2>
      </div>

      <div className="ip-stats">
        <div className="ip-stat"><b>{doneJobs.filter((j) => j.type === "post" || j.type === "life").length}</b>posts</div>
        <div className="ip-stat"><b>{doneJobs.filter((j) => j.type === "reel" || j.type === "multi").length}</b>reels</div>
        <div className="ip-stat"><b>{doneJobs.length}</b>kaam ho gaye · round {next ? next.cycle + 1 : 1}</div>
      </div>

      {next && c ? (
        <div className="ip-card">
          <h3>
            👉 Aaj ka kaam: {c.icon} {c.title}
          </h3>
          <div className="ip-bags">
            {next.bags.map((bag) => (
              <div className="ip-b" key={bag.id}>
                <img src={thumb(bag)} alt="" />
                <span>{bag.name}</span>
              </div>
            ))}
          </div>
          {c.photos.length ? (
            <>
              <div className="ip-small">Is bag ki model / lifestyle photos:</div>
              <div className="ip-bags">
                {c.photos.map((url) => (
                  <div className="ip-b" key={url}>
                    <img src={url} alt="" style={{ objectFit: "cover" }} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <ol className="ip-steps">
            {c.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <div className="ip-row">
            {onOpen ? (
              <button type="button" className="ip-btn" onClick={() => onOpen(c.tool)}>
                {c.toolLabel}
              </button>
            ) : null}
            <button type="button" className="ip-btn main" onClick={() => markDone(next)}>
              {c.done}
            </button>
          </div>
          <div className="ip-row" style={{ marginTop: 8 }}>
            {next.type === "post" || next.type === "life" ? (
              <button type="button" className="ip-chip" onClick={() => later(next)}>
                ⏭ Ye bag baad mein
              </button>
            ) : null}
            {doneJobs.length ? (
              <button type="button" className="ip-chip" onClick={undoLast}>
                ↩ Pichhla tick hatao
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="ip-card">
          <h3>🎉 Plan pura ho gaya!</h3>
          <div style={{ fontSize: 14 }}>Naye bags add karo, planner unka plan apne-aap bana dega.</div>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 14 }}>Aapka grid aisa dikhega (upar = sabse naya)</div>
      <div className="ip-small">📷 post · 🎬 ek bag ki reel · 🎞 kai bags ki reel · 👩 model post. Dhundhle wale abhi baaki hain.</div>
      <div className="ip-grid">
        {preview.map((job) => {
          const index = plan.indexOf(job);
          const cls = state.done[job.key] ? "ip-cell" : index === nextIndex ? "ip-cell now" : "ip-cell todo";
          const tag = job.type === "post" ? "📷" : job.type === "life" ? "👩" : job.type === "reel" ? "🎬" : "🎞";
          const img = job.type === "life" && lifeOf(job.bags[0])[0] ? lifeOf(job.bags[0])[0] : thumb(job.bags[0]);
          return (
            <div className={cls} key={job.key}>
              <img src={img} alt="" loading="lazy" />
              <span className="tag">{tag}</span>
            </div>
          );
        })}
      </div>

      <div className="ip-card" style={{ borderWidth: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>👩 Model / lifestyle photos</div>
        <div className="ip-small" style={{ marginBottom: 8 }}>
          {scannedCount
            ? `${scannedCount}/${bags.length} bags check ho gaye · ${lifeCount} bags mein model/lifestyle photo mili. Planner inki “model post” khud lagata hai.`
            : "Ek baar dabao: Admin saare bags ki photos dekh kar wo photos dhoondh lega jo saade white background par nahi hain (model / lifestyle)."}
        </div>
        <button type="button" className="ip-btn" onClick={findLifestyle} disabled={Boolean(scan) || scannedCount === bags.length}>
          {scan ? `Dhoondh raha hai... ${scan.done}/${scan.total}` : scannedCount === bags.length ? "✓ Saare bags check ho gaye" : "🔍 Model photos dhoondo"}
        </button>
      </div>

      <button type="button" className="ip-chip" style={{ marginBottom: 12 }} onClick={() => setShowRules((v) => !v)}>
        {showRules ? "▲ Niyam band karo" : "📋 Roz ke niyam"}
      </button>
      {showRules ? (
        <div className="ip-rules">
          <b>Roz:</b> planner ka 1 kaam + 1-3 stories. Shaam 7-9 baje daalo.
          <br />
          <b>Highlight:</b> sirf POST wali stories (NEW IN). Reel wali story highlight mein nahi.
          <br />
          <b>Reel cover:</b> hamesha bag ki Studio photo, taaki grid saaf dikhe.
          <br />
          <b>Model photo:</b> ise apna photoshoot mat batana.
          <br />
          <b>Ek din mein</b> ek post ya ek reel - zyada nahi.
        </div>
      ) : null}
      <div className="ip-small">Sab ticks isi phone mein save rehte hain.</div>
    </div>
  );
}
