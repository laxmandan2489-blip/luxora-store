/*
 * INSTAGRAM SKILL (2026-11-06) - the useful parts of
 * github.com/Jakeschincariol/instagram-agent-skill, turned into code that
 * the Autopilot bot runs on every caption / reel by itself.
 *
 * That repo is a set of Claude "skills" (instructions + small Python tools).
 * It does not post anything and has no API - so it cannot be "connected"
 * like an app. What we take from it (MIT License, (c) 2026 Jake Schincariol):
 *   1. HUMANIZER (ig-human)  - removes AI-sounding words, em dashes and
 *      invisible characters from every caption before it is posted.
 *   2. CAPTION CHECK (ig-caption) - the first ~125 characters are all the
 *      feed shows; max 5 hashtags (Instagram's limit since Dec 2025); no
 *      filler tags like #viral #reels #fyp.
 *   3. HOOKS (ig-reel) - the first 1-2 seconds of a reel need a short
 *      on-screen line (6 words or fewer). Only hook types that fit a bag
 *      shop and stay honest are used (no fake numbers, no fake stories).
 */
const lexicon = require("./igSlop.json");

const TRUNCATE = 125;
const HASHTAG_LIMIT = 5;
const FILLER_TAGS = new Set(["#viral", "#fyp", "#explore", "#explorepage", "#foryou", "#foryoupage", "#trending", "#instagood", "#love", "#follow", "#like4like", "#reels", "#reelsinstagram", "#viralreels", "#instadaily", "#bagreels"]);

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const INVISIBLE = new RegExp(
  `[${lexicon.invisible
    .map((cp) => (cp.includes("-") ? cp.split("-").map((part) => `\\u{${part.replace("U+", "")}}`).join("-") : `\\u{${cp.replace("U+", "")}}`))
    .join("")}]`,
  "gu"
);
const SPACES = new RegExp(`[${lexicon.spaces.map((cp) => `\\u{${cp.replace("U+", "")}}`).join("")}]`, "gu");
// longest first, so "delve into" wins over "delve"
const LEXICAL = [...lexicon.phrases, ...lexicon.words]
  .sort((a, b) => b.find.length - a.find.length)
  .map((entry) => ({ re: new RegExp(`\\b${escapeRegex(entry.find).replace(/\\? /g, "\\s+")}\\b`, "gi"), to: entry.replace }));

function matchCase(src, repl) {
  if (!repl) return repl;
  if (src === src.toUpperCase() && /[A-Z]/.test(src)) return repl.toUpperCase();
  if (src[0] === src[0].toUpperCase() && /[A-Z]/.test(src[0])) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}

// 1. HUMANIZER - same passes as humanize.py (invisible, typographic, lexical, tidy)
function humanize(input) {
  let text = String(input || "");
  text = text.replace(INVISIBLE, "").replace(SPACES, " ");
  const urls = [];
  text = text.replace(/https?:\/\/\S+/g, (url) => {
    urls.push(url);
    return `\uE000${urls.length - 1}\uE001`;
  });
  text = text.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*(?=\d)/g, "-").replace(/\s+–\s+/g, ", ");
  for (const t of lexicon.typographic) if (t.from !== "—" && t.from !== "–") text = text.split(t.from).join(t.to);
  for (const { re, to } of LEXICAL) text = text.replace(re, (found) => matchCase(found, to));
  text = text
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/, "")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/,\s*([,.;:!?])/g, "$1")
        .replace(/\.\s*\.+/g, ".")
        .replace(/^[ \t]+|[ \t]+$/g, "")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
  // a line that became empty in the middle of the text is dropped
  text = text.replace(/(^|\n)(?=\n[^\n#])/g, "$1");
  text = text.replace(/(^|[.!?]\s|\n)([a-z])/g, (all, before, letter) => before + letter.toUpperCase());
  return text.replace(/\uE000(\d+)\uE001/g, (all, i) => urls[Number(i)]);
}

// 2. CAPTION CHECK - max 5 real hashtags, kept on the last line
function tidyHashtags(caption, extra = []) {
  const lines = String(caption || "").split("\n");
  const tags = [];
  const body = [];
  for (const line of lines) {
    const found = line.match(/#[\p{L}0-9_]+/gu) || [];
    const rest = line.replace(/#[\p{L}0-9_]+/gu, "").trim();
    tags.push(...found);
    if (rest || !found.length) body.push(found.length ? rest : line);
  }
  const clean = [...new Set([...tags, ...extra].map((t) => t.toLowerCase()))].filter((t) => !FILLER_TAGS.has(t)).slice(0, HASHTAG_LIMIT);
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return clean.length ? `${body.join("\n")}\n\n${clean.join(" ")}` : body.join("\n");
}

function checkCaption(caption, { name = "", price = 0 } = {}) {
  const text = String(caption || "");
  const visible = text.slice(0, TRUNCATE);
  const problems = [];
  if (text.length > 2200) problems.push("2200 se lamba");
  if (/^\s*#/.test(text)) problems.push("hashtag se shuru");
  if (/^\s*(hi|hello|hey)\b/i.test(text)) problems.push("greeting se shuru");
  if (name && !visible.toLowerCase().includes(String(name).toLowerCase().slice(0, 12))) problems.push("pehli 125 letters mein bag ka naam nahi");
  if (Number(price) > 0 && !visible.includes("₹")) problems.push("pehli 125 letters mein price nahi");
  const tags = text.match(/#[\p{L}0-9_]+/gu) || [];
  if (tags.length > HASHTAG_LIMIT) problems.push(`${tags.length} hashtags (max ${HASHTAG_LIMIT})`);
  return { ok: !problems.length, visible, problems, hashtags: tags.length };
}

// Final pass for every caption the bot writes.
function polishCaption(caption, extraTags = []) {
  return tidyHashtags(humanize(caption), extraTags).slice(0, 2200);
}

// 3. HOOKS - on-screen first line of a reel (<= 6 words, honest, product-safe).
// Picked from the 26 formulas: The Reveal (24), Numbered (11), Head To Head (17),
// Verbatim Question (16), The Callout (14), Cold Open Demo (18).
const HOOKS = {
  look: ["The new one", "Just landed", "Meet the new one", "New in, worth a look"],
  many: ["{n} bags. Which one?", "{n} new bags. Pick one", "New this week: {n} bags"],
  colours: ["1 bag. {n} colours.", "Which colour is yours?", "Same bag, {n} colours"],
  guess: ["Guess the price?", "Price guess karo?", "What would you pay?"],
  thisorthat: ["This or that?", "Left or right?", "1 or 2?"],
  looks: ["How it looks styled", "Office day to dinner", "Styled, start to finish"],
  cod: ["\"COD hai?\" Yes.", "Pay when it arrives", "Cash on Delivery? Yes."],
};

function hookFor(style, n = 0, turn = 0) {
  const list = HOOKS[style] || HOOKS.look;
  return list[Math.abs(Number(turn) || 0) % list.length].replace("{n}", String(n));
}

module.exports = { humanize, tidyHashtags, checkCaption, polishCaption, hookFor, HOOKS, HASHTAG_LIMIT, TRUNCATE };
