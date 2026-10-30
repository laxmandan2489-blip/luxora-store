import { useEffect, useMemo, useState } from "react";
import { absoluteUrl, loadFonts, productVariants } from "./AdMaker";
import { renderReel } from "./reelEngine";

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
// (v5) Post looks rotate so two posts in a row never look the same.
// kind: studio = Ad Maker "✨ Studio"; clean = "Clean · text below".
const POST_LOOKS = [
  // (v6) Studio removed - simple Clean design, Cream and Black take turns
  { kind: "clean", bg: "Cream", short: "Clean · Cream" },
  { kind: "clean", bg: "Black", short: "Clean · Black" },
];
const LIFE_LOOKS = [
  { design: "On photo", short: "Model photo · On photo" },
  { design: "Clean · text below (White)", short: "Model photo · Clean White" },
];

// [id, label, how many bags that template takes]
const MULTI = [
  ["newin", "New in", 6],
  ["fastcuts", "⚡ Fast cuts", 6],
  ["filmstrip", "🎞 Film strip", 6],
  ["toplist", "🏆 Top picks", 5],
  ["collage", "🖼 Collage", 4],
  ["swipe", "👉 Swipe", 6],
  ["bounce", "🏀 Bounce", 6],
  ["magazine", "📰 Magazine", 5],
  ["split", "↔️ This or that", 6],
  ["polaroid", "📸 Polaroid", 5],
];

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return { done: saved.done || {}, later: saved.later || [], life: saved.life || {}, scanned: saved.scanned || {}, reelsOnly: saved.reelsOnly !== false, perDay: Number(saved.perDay) || 3 };
  } catch {
    return { done: {}, later: [], life: {}, scanned: {}, reelsOnly: true, perDay: 3 };
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
  // (v8) one-tap reel: { key, url, blob, caption } for the current job
  const [reel, setReel] = useState(null);
  const [reelBusy, setReelBusy] = useState("");
  const [copied, setCopied] = useState(false);
  // (v9) today's two reels (one bag + many bags): { [jobKey]: { url, blob, caption } }
  const [today2, setToday2] = useState({});
  const [today2Busy, setToday2Busy] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

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
    let posts = 0;
    let lifes = 0;
    const nextLook = () => POST_LOOKS[posts++ % POST_LOOKS.length];
    const nextLife = () => LIFE_LOOKS[lifes++ % LIFE_LOOKS.length];
    const nextSingle = () => {
      const pick = SINGLE[single++ % SINGLE.length];
      lastSingleBase = pick[0].replace(/1$/, "");
      return pick;
    };
    let lastSingleBase = "";
    const nextMulti = () => {
      // never the same style as the one-bag reel just before it
      let pick = MULTI[multi++ % MULTI.length];
      if (pick[0] === lastSingleBase) pick = MULTI[multi++ % MULTI.length];
      return pick;
    };
    // (v4) many-bag reel = the bag just done + the next bags in line
    // (as many as the template takes), so it always includes that bag
    const group = (order, anchor, size) => {
      const start = Math.max(0, order.indexOf(anchor));
      const out = [];
      for (let k = 0; k < Math.min(size, order.length); k++) out.push(order[(start + k) % order.length]);
      return out;
    };
    for (let cycle = 0; cycle < 60; cycle++) {
      const shift = (cycle * 4) % bags.length;
      const queue = [...bags.slice(shift), ...bags.slice(0, shift)];
      const order = [...queue];
      const design = cycle % 2 === 0 ? "studio" : "clean";
      let round = 0;
      while (queue.length) {
        const a = queue.shift();
        const bIndex = queue.findIndex((bag) => lifeOf(bag).length);
        const b = bIndex >= 0 ? queue.splice(bIndex, 1)[0] : queue.shift();
        const c = queue.shift();
        const r = `c${cycle}r${round++}`;
        jobs.push({ key: `${r}-post-${a.id}`, type: "post", design, look: nextLook(), cycle, bags: [a] });
        jobs.push({ key: `${r}-reel-${a.id}`, type: "reel", cycle, bags: [a], template: nextSingle() });
        if (bags.length >= 3) {
          const t = nextMulti();
          jobs.push({ key: `${r}-multi1`, type: "multi", cycle, bags: group(order, a, t[2]), template: t });
        }
        if (b) {
          const isLife = lifeOf(b).length > 0;
          jobs.push({ key: `${r}-life-${b.id}`, type: isLife ? "life" : "post", design, look: isLife ? nextLife() : nextLook(), cycle, bags: [b] });
          jobs.push({ key: `${r}-reel-${b.id}`, type: "reel", cycle, bags: [b], template: nextSingle() });
        }
        if (c) {
          jobs.push({ key: `${r}-reel-${c.id}`, type: "reel", cycle, bags: [c], template: nextSingle() });
          jobs.push({ key: `${r}-post-${c.id}`, type: "post", design, look: nextLook(), cycle, bags: [c] });
        }
        if (bags.length >= 3 && (b || c)) {
          const t = nextMulti();
          jobs.push({ key: `${r}-multi2`, type: "multi", cycle, bags: group(order, c || b, t[2]), template: t });
        }
      }
      // stop once there are plenty of jobs ahead of the next open one
      const open = jobs.findIndex((job) => !state.done[job.key]);
      if (open >= 0 && jobs.length > open + 24) break;
    }
    return jobs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bags, state.life, state.done]);

  // (v7) Posts go out by themselves (Auto Post tab) -> planner only gives reels
  const skip = (job) => state.reelsOnly && (job.type === "post" || job.type === "life");
  const nextIndex = plan.findIndex((job) => !state.done[job.key] && !skip(job));
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
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  function reelCaption(job) {
    const first = job.bags[0] || {};
    const end = ["Free delivery (prepaid) · COD available", "Link in bio 🛍", "", "#handbags #bagsforwomen #handbagsindia #newin #shrimoh #bagsofinstagram"];
    if (job.type === "multi") {
      const hook = /collage|split/.test(job.template[0]) ? "Which one is you? Comment karo 👇" : job.template[0] === "toplist" ? "This week's top picks 🏆" : "New in this week ✨";
      return [hook, `${job.bags.length} new bags · swipe the reel`, ...end].join("\n");
    }
    const price = Number(first.price) > 0 ? `₹${Number(first.price).toLocaleString("en-IN")}` : "";
    const line = job.template[0] === "guess" ? "Guess kiya? Price end mein 👀" : price;
    return [`${first.name || "New bag"} 🤍`, line, ...end].filter((x, i) => x !== "" || i === 4).join("\n");
  }

  async function buildReel(job, onProgress) {
    await loadFonts();
    let items = [];
    if (job.type === "multi") {
      for (const bag of job.bags) {
        const first = productVariants(API, bag).find((v) => v.urls.length);
        if (!first) continue;
        items.push({ img: await loadImage(first.urls[0]), name: bag.name || "", price: Number(bag.price) || 0, mrp: Number(bag.oldPrice) || 0, label: "" });
      }
    } else {
      const bag = job.bags[0];
      const urls = Array.from(new Set(productVariants(API, bag).flatMap((v) => v.urls))).slice(0, job.template[0] === "guess" ? 3 : 4);
      for (const url of urls) items.push({ img: await loadImage(url), name: bag.name || "", price: Number(bag.price) || 0, mrp: Number(bag.oldPrice) || 0, label: "" });
    }
    if (!items.length) throw new Error("Is bag ki photo nahi mili");
    const { blob } = await renderReel({ style: job.template[0], bags: items, options: { hook: "", showPrice: true, quality: "fast" }, onProgress });
    return { url: URL.createObjectURL(blob), blob, caption: reelCaption(job) };
  }

  // today's pair: the next one-bag reel + the next many-bag reel
  // (v11) Fixed daily plan that fits the 2 auto posts (11 am + 7 pm):
  //   1 pm one-bag reel · 4 pm many-bag reel · 9 pm one-bag reel
  // -> grid reads: post, reel, reel, post, reel (like the big brand pages)
  const REEL_TIMES = ["Dopahar 1 baje", "Shaam 4 baje", "Raat 9 baje"];
  const todayJobs = useMemo(() => {
    const open = plan.filter((job) => !state.done[job.key] && (job.type === "reel" || job.type === "multi"));
    const singles = open.filter((job) => job.type === "reel");
    const multis = open.filter((job) => job.type === "multi");
    const out = [];
    const used = new Set();
    const take = (list) => {
      const job = list.find((entry) => !out.includes(entry) && !used.has(entry.template[0].replace(/1$/, "")));
      if (job) {
        used.add(job.template[0].replace(/1$/, ""));
        out.push(job);
      }
    };
    take(singles);
    take(multis);
    take(singles);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, state.done]);

  async function saveAll() {
    const files = todayJobs
      .map((job, i) => today2[job.key] && new File([today2[job.key].blob], `shrimoh-reel-${i + 1}.mp4`, { type: today2[job.key].blob.type || "video/mp4" }))
      .filter(Boolean);
    if (!files.length) return;
    try {
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files });
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    for (const job of todayJobs) if (today2[job.key]) await saveFile(today2[job.key]);
  }

  async function makeToday() {
    if (today2Busy) return;
    const made = {};
    try {
      for (let i = 0; i < todayJobs.length; i++) {
        const job = todayJobs[i];
        if (today2[job.key]) {
          made[job.key] = today2[job.key];
          continue;
        }
        setToday2Busy(`Reel ${i + 1}/${todayJobs.length} ban rahi hai...`);
        made[job.key] = await buildReel(job, (p) => setToday2Busy(`Reel ${i + 1}/${todayJobs.length} ban rahi hai ${Math.round(p * 100)}%...`));
        setToday2((current) => ({ ...current, [job.key]: made[job.key] }));
      }
    } catch (error) {
      window.alert(`Reel nahi bani: ${error?.message || "dobara try karo"}`);
    }
    setToday2Busy("");
  }

  async function saveFile(item) {
    const type = item.blob.type || "video/mp4";
    const file = new File([item.blob], `shrimoh-reel.${type.includes("webm") ? "webm" : "mp4"}`, { type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = item.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyText(text, key) {
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
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1500);
  }

  // (v8) Make the planned reel by itself: photos picked automatically
  async function makeReel() {
    const job = next;
    if (!job || reelBusy) return;
    setReel(null);
    setCopied(false);
    try {
      setReelBusy("Photos aa rahi hain...");
      await loadFonts();
      let items = [];
      if (job.type === "multi") {
        for (const bag of job.bags) {
          const first = productVariants(API, bag).find((v) => v.urls.length);
          if (!first) continue;
          items.push({ img: await loadImage(first.urls[0]), name: bag.name || "", price: Number(bag.price) || 0, mrp: Number(bag.oldPrice) || 0, label: "" });
        }
      } else {
        const bag = job.bags[0];
        const urls = Array.from(new Set(productVariants(API, bag).flatMap((v) => v.urls))).slice(0, job.template[0] === "guess" ? 3 : 4);
        for (const url of urls) items.push({ img: await loadImage(url), name: bag.name || "", price: Number(bag.price) || 0, mrp: Number(bag.oldPrice) || 0, label: "" });
      }
      if (!items.length) throw new Error("Is bag ki photo nahi mili");
      const { blob } = await renderReel({
        style: job.template[0],
        bags: items,
        options: { hook: "", showPrice: true, quality: "fast" },
        onProgress: (p) => setReelBusy(`Reel ban rahi hai ${Math.round(p * 100)}%...`),
      });
      setReel({ key: job.key, url: URL.createObjectURL(blob), blob, caption: reelCaption(job) });
    } catch (error) {
      setReelBusy("");
      window.alert(`Reel nahi bani: ${error?.message || "dobara try karo"}`);
      return;
    }
    setReelBusy("");
  }

  async function saveReel() {
    if (!reel) return;
    const type = reel.blob.type || "video/mp4";
    const file = new File([reel.blob], `shrimoh-reel.${type.includes("webm") ? "webm" : "mp4"}`, { type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = reel.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyCaption() {
    if (!reel) return;
    try {
      await navigator.clipboard.writeText(reel.caption);
    } catch {
      const area = document.createElement("textarea");
      area.value = reel.caption;
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

  function card(job) {
    const bag = job.bags[0];
    if (job.type === "post" || job.type === "life") {
      const isLife = job.type === "life";
      const look = job.look || POST_LOOKS[0];
      const lines = isLife
        ? [
            "Ad Maker → is bag ko search karo → Photo mein neeche wali MODEL photo chuno",
            `Design: “${look.design}” → Size: Feed 4:5 → Post mein jodo`,
            "Slide 2: wahi bag, white background wali photo, “Clean · text below” (naam + price) → jodo",
            "Post karo. Caption mein ise apna photoshoot mat batana",
            "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
          ]
        : look.kind === "clean"
          ? [
              "Ad Maker → is bag ko search karo → Size: Feed 4:5",
              `Slide 1: Design “Clean · text below” (naam + price ke saath) → Background: ${look.bg} → Post mein jodo`,
              `Slide 2-3: dusre colours → Design “No text · only bag” → Background: ${look.bg} → jodo`,
              "Post karo (caption apne-aap aata hai)",
              "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
            ]
          : [
              "Ad Maker → is bag ko search karo → Size: Feed 4:5",
              `Slide 1: Design “✨ Studio” → Studio background: ${look.bg} → Line: “${look.line}” → Post mein jodo`,
              `Slide 2-3: dusre colours → wahi ${look.bg} → Line: “Koi line nahi” → jodo`,
              "Post karo (caption apne-aap aata hai)",
              "Phir: post ko Story mein share + 📋 link sticker → ⭐ NEW IN highlight",
            ];
      return {
        icon: isLife ? "👩" : "📷",
        title: isLife ? `MODEL photo POST · ${look.short}` : `POST · ${look.short}`,
        tool: "ads",
        toolLabel: "Ad Maker kholo",
        lines,
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
          "Instagram: + → Reel → gaana → cover = is bag ki post wali pehli photo",
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
        `Neeche dikhe ${job.bags.length} bags isi kram mein chuno (pehla = jiski abhi post/reel hui) → 🎬 Reel banao → Save`,
        "Instagram: + → Reel → gaana → cover = pehle bag ki post wali photo",
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
        .ip-cell.todo { opacity: 0.55; border-style: dashed; }
        .ip-cell .num { position: absolute; left: 4px; top: 4px; background: #1c150d; color: #fff; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 2px 7px; }
        .ip-next { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0ebe0; font-size: 14px; }
        .ip-next img { width: 44px; height: 44px; object-fit: contain; background: #fff; border: 1px solid #eee; border-radius: 8px; flex: 0 0 44px; }
        .ip-next b { flex: 0 0 26px; text-align: center; }
        .ip-cell.now { outline: 3px solid #1c150d; opacity: 1; }
        .ip-rules { background: #f6f3ea; border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.6; margin-bottom: 14px; }
        .ip-small { font-size: 12px; color: #777; line-height: 1.5; }
      `}</style>
      <div className="panel-header">
        <h2 className="panel-title">Insta Planner</h2>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 12, padding: "10px 12px", background: "#f6f3ea", borderRadius: 12 }}>
        <input type="checkbox" checked={state.reelsOnly} onChange={(e) => setState((current) => ({ ...current, reelsOnly: e.target.checked }))} />
        📮 Posts “Auto Post” se apne-aap lag rahi hain – mujhe sirf REELS batao
      </label>

      <div className="ip-stats">
        <div className="ip-stat"><b>{doneJobs.filter((j) => j.type === "post" || j.type === "life").length}</b>posts</div>
        <div className="ip-stat"><b>{doneJobs.filter((j) => j.type === "reel" || j.type === "multi").length}</b>reels</div>
        <div className="ip-stat"><b>{doneJobs.length}</b>kaam ho gaye · round {next ? next.cycle + 1 : 1}</div>
      </div>

      {state.reelsOnly && todayJobs.length ? (
        <div className="ip-card">
          <h3>🎬 Aaj ki reels ({todayJobs.length})</h3>
          <div className="ip-small" style={{ marginBottom: 8 }}>
            Roz 3 reels (2 posts apne-aap lagti hain, unke beech ye 3). Ek tap: Admin khud bags, photos aur alag style chunkar teeno bana dega. Aapko bas save, caption copy aur diye time par post karna hai.
          </div>

          {todayJobs.some((job) => !today2[job.key]) ? (
            <button type="button" className="ip-btn main" onClick={makeToday} disabled={Boolean(today2Busy)}>
              {today2Busy || (Object.keys(today2).length ? "🎬 Baaki videos phir se bana do" : `🎬 Aaj ki ${todayJobs.length} reels bana do`)}
            </button>
          ) : null}
          {todayJobs.every((job) => today2[job.key]) ? (
            <button type="button" className="ip-btn main" onClick={saveAll}>
              ⬇ Saari {todayJobs.length} videos ek saath save karo
            </button>
          ) : null}
          {todayJobs.map((job, i) => {
            const made = today2[job.key];
            return (
              <div key={job.key} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee5d6" }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                  ⏰ {REEL_TIMES[i] || ""} · {job.type === "multi" ? `🎞 Kai bags · ${job.template[1]}` : `🎬 ${job.bags[0].name} · ${job.template[1]}`}
                </div>
                <div className="ip-bags">
                  {job.bags.map((bag) => (
                    <div className="ip-b" key={bag.id}>
                      <img src={thumb(bag)} alt="" />
                    </div>
                  ))}
                </div>
                {made ? (
                  <video src={made.url} controls playsInline muted loop style={{ width: "100%", maxWidth: 220, borderRadius: 12, display: "block", margin: "0 auto 10px" }} />
                ) : (
                  <div className="ip-small" style={{ marginBottom: 6 }}>
                    {today2Busy ? "Video ban rahi hai..." : "Video pehle save kar li hai? To bas neeche se caption copy karo."}
                  </div>
                )}
                {/* (v12) caption ALWAYS shown - even after coming back from Instagram */}
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#444", background: "#fff", borderRadius: 10, padding: 10, margin: "0 0 8px", fontFamily: "inherit", border: "1px solid #eee" }}>
                  {reelCaption(job)}
                </pre>
                <div className="ip-row">
                  {made ? (
                    <button type="button" className="ip-btn" onClick={() => saveFile(made)}>⬇ Video save</button>
                  ) : null}
                  <button type="button" className="ip-btn main" onClick={() => copyText(reelCaption(job), job.key)}>
                    {copiedKey === job.key ? "✓ Copy ho gaya" : "📋 Caption copy"}
                  </button>
                  <button type="button" className="ip-btn" onClick={() => markDone(job)}>✓ Ye reel daal di</button>
                </div>
              </div>
            );
          })}
          <div className="ip-small" style={{ marginTop: 12 }}>
            Instagram: + → Reel → video → 🎵 Saved gaana → caption paste → Share. Har reel uske likhe time par daalo. Teeno daal kar ✓ dabao, kal yahan 3 nayi reels (naye bags, naye style) ek tap mein ban jayengi.
          </div>
        </div>
      ) : null}

      {!state.reelsOnly && next && c ? (
        <div className="ip-card">
          <h3>
            👉 Aaj ka kaam: {c.icon} {c.title}
          </h3>
          <div className="ip-bags">
            {next.bags.map((bag, i) => (
              <div className="ip-b" key={bag.id}>
                <img src={thumb(bag)} alt="" />
                <span>{next.bags.length > 1 ? `${i + 1}. ` : ""}{bag.name}</span>
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
          {(() => {
            const kinds = next.type === "multi" ? ["multi"] : next.type === "reel" ? ["reel"] : ["post", "life"];
            const before = plan.slice(0, nextIndex).reverse().find((job) => kinds.includes(job.type));
            if (!before) return null;
            const was = before.type === "reel" || before.type === "multi" ? before.template[1] : before.look ? before.look.short : "";
            return (
              <div className="ip-small" style={{ marginBottom: 4 }}>
                Pichhli baar: {was} ({before.bags[0].name}) → is baar alag 👇
              </div>
            );
          })()}
          <ol className="ip-steps">
            {c.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          {next.type === "reel" || next.type === "multi" ? (
            <div style={{ margin: "4px 0 12px", padding: 12, borderRadius: 12, background: "#f6f3ea" }}>
              {reel && reel.key === next.key ? (
                <>
                  <video src={reel.url} controls playsInline muted loop autoPlay style={{ width: "100%", maxWidth: 240, borderRadius: 12, display: "block", margin: "0 auto 10px" }} />
                  <div className="ip-row" style={{ justifyContent: "center" }}>
                    <button type="button" className="ip-btn main" onClick={saveReel}>
                      ⬇ 1. Video save karo
                    </button>
                    <button type="button" className="ip-btn" onClick={copyCaption}>
                      {copied ? "✓ Copy ho gaya" : "📋 2. Caption copy karo"}
                    </button>
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#444", background: "#fff", borderRadius: 10, padding: 10, marginTop: 10, fontFamily: "inherit" }}>
                    {reel.caption}
                  </pre>
                  <div className="ip-small">3. Instagram: + → Reel → video → 🎵 Saved gaana → caption paste → Share. Phir neeche ✓ dabao.</div>
                </>
              ) : (
                <>
                  <button type="button" className="ip-btn main" onClick={makeReel} disabled={Boolean(reelBusy)}>
                    {reelBusy || "🎬 Reel khud bana do (caption ke saath)"}
                  </button>
                  <div className="ip-small" style={{ marginTop: 6 }}>
                    Admin khud photos chunkar “{next.template[1]}” reel bana dega. Screen on rakho.
                  </div>
                </>
              )}
            </div>
          ) : null}
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
      ) : state.reelsOnly ? null : (
        <div className="ip-card">
          <h3>🎉 Plan pura ho gaya!</h3>
          <div style={{ fontSize: 14 }}>Naye bags add karo, planner unka plan apne-aap bana dega.</div>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📅 Agle kaam (ek din mein ek)</div>
      <div style={{ marginBottom: 16 }}>
        {plan.slice(nextIndex >= 0 ? nextIndex : plan.length).filter((job) => !skip(job) && !state.done[job.key]).slice(0, 6).map((job, i) => {
          const what =
            job.type === "post" ? `📷 Post · ${job.look ? job.look.short : ""}` : job.type === "life" ? `👩 Model photo post` : job.type === "reel" ? `🎬 Reel (${job.template[1]})` : `🎞 Kai bags reel (${job.template[1]})`;
          return (
            <div className="ip-next" key={job.key}>
              <b>{i === 0 ? "Aaj" : `${i + 1}`}</b>
              <img src={job.type === "life" && lifeOf(job.bags[0])[0] ? lifeOf(job.bags[0])[0] : thumb(job.bags[0])} alt="" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{what}</div>
                <div style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.type === "multi" ? `${job.bags.length} bags: ${job.bags.map((b) => b.name).join(", ")}` : job.bags[0].name}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14 }}>Aapka grid aisa dikhega (upar = sabse naya)</div>
      <div className="ip-small">📷 post · 🎬 ek bag ki reel · 🎞 kai bags ki reel · 👩 model post. “AAJ” wala aaj ka kaam hai, 2, 3... agle dino ke. Instagram mein nayi post sabse upar aati hai, isliye number neeche se upar badhte hain.</div>
      <div className="ip-grid">
        {preview.map((job) => {
          const index = plan.indexOf(job);
          const cls = state.done[job.key] ? "ip-cell" : index === nextIndex ? "ip-cell now" : "ip-cell todo";
          const tag = job.type === "post" ? "📷" : job.type === "life" ? "👩" : job.type === "reel" ? "🎬" : "🎞";
          const img = job.type === "life" && lifeOf(job.bags[0])[0] ? lifeOf(job.bags[0])[0] : thumb(job.bags[0]);
          const order = index >= nextIndex && nextIndex >= 0 ? index - nextIndex + 1 : 0;
          return (
            <div className={cls} key={job.key}>
              <img src={img} alt="" loading="lazy" />
              <span className="tag">{tag}</span>
              {order ? <span className="num">{order === 1 ? "AAJ" : order}</span> : null}
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
          <b>Reel cover:</b> hamesha us bag ki post wali pehli photo (Clean design), taaki grid saaf dikhe.
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
