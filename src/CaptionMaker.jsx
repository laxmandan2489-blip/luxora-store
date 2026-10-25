import { useMemo, useState } from "react";
import { canonicalizeCategory } from "./categories";

/*
 * CAPTION MAKER (2026-10-25) - shown inside Admin > Ad Maker.
 * Builds a ready-to-paste caption for the selected bag (Instagram,
 * Facebook or WhatsApp): hook line, name, price / MRP / % off, the bag's
 * own key features (only what is saved on the product - nothing made
 * up), delivery + COD line, link and hashtags picked from the bag's
 * name, colour and category. "New style" gives a different hook.
 */

const SITE = "https://shrimoh.vercel.app";

const HOOKS = [
  "New in at SHRIMOH ✨",
  "The bag your outfit was waiting for 👜",
  "Everyday elegance, made simple 🤍",
  "Your new favourite bag is here ✨",
  "Style it for work, brunch or date night 💫",
  "Small details, big style ✨",
  "Made to be noticed 👀",
  "Classic today, classic forever 🤍",
];

const CATEGORY_TAGS = {
  "Handbags": ["#handbag", "#handbagsforwomen"],
  "Shoulder Bags": ["#shoulderbag", "#everydaybag"],
  "Crossbody Bags": ["#slingbag", "#crossbodybag"],
  "Tote Bags": ["#totebag", "#officebag"],
  "Backpacks": ["#backpack", "#backpackforgirls"],
  "Clutches": ["#clutch", "#partybag"],
  "Wallets": ["#wallet", "#walletforwomen"],
  "Accessories": ["#bagaccessories"],
};

const WORD_TAGS = [
  [/sling/i, "#slingbag"],
  [/tote/i, "#totebag"],
  [/clutch/i, "#clutchbag"],
  [/potli/i, "#potlibag"],
  [/hobo/i, "#hobobag"],
  [/top\s*handle/i, "#tophandlebag"],
  [/shoulder/i, "#shoulderbag"],
  [/cross\s*body/i, "#crossbodybag"],
  [/backpack/i, "#backpack"],
  [/mini/i, "#minibag"],
  [/wallet/i, "#wallet"],
  [/party|festive|embellish|sequin|pearl/i, "#partybag"],
  [/office|work|laptop/i, "#officebag"],
  [/black/i, "#blackbag"],
  [/white|ivory|cream|beige|off.?white|nude/i, "#neutralbag"],
  [/brown|tan|camel|coffee/i, "#brownbag"],
  [/pink|blush|peach/i, "#pinkbag"],
  [/red|maroon|wine/i, "#redbag"],
  [/green|olive/i, "#greenbag"],
  [/blue|navy/i, "#bluebag"],
  [/gold|golden/i, "#goldenbag"],
  [/silver/i, "#silverbag"],
];

const BASE_TAGS = ["#shrimoh", "#handbags", "#bagsforwomen", "#womenfashion", "#stylishbags", "#trendingbags", "#onlineshopping", "#bagsofinstagram"];

function rupees(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function hashtagsFor(product, name) {
  const text = `${name} ${product?.category || ""} ${(Array.isArray(product?.colors) ? product.colors.join(" ") : "")}`;
  const tags = [];
  const category = canonicalizeCategory(product?.category, name);
  tags.push(...(CATEGORY_TAGS[category] || []));
  for (const [pattern, tag] of WORD_TAGS) if (pattern.test(text)) tags.push(tag);
  tags.push(...BASE_TAGS);
  return [...new Set(tags)].slice(0, 15).join(" ");
}

function featureLines(product) {
  const lines = [];
  const features = Array.isArray(product?.keyFeatures) ? product.keyFeatures : [];
  for (const feature of features) {
    const clean = String(feature || "").trim();
    if (clean) lines.push(clean);
    if (lines.length >= 3) break;
  }
  if (product?.materials && lines.length < 3) lines.push(`Material: ${String(product.materials).trim()}`);
  if (product?.dimensions && lines.length < 3) lines.push(`Size: ${String(product.dimensions).trim()}`);
  return lines.slice(0, 3);
}

function buildCaption(platform, { product, name, price, mrp, hookIndex }) {
  const hook = HOOKS[hookIndex % HOOKS.length];
  const priceNumber = Number(price) || 0;
  const mrpNumber = Number(mrp) || 0;
  const off = mrpNumber > priceNumber && priceNumber > 0 ? Math.round(((mrpNumber - priceNumber) / mrpNumber) * 100) : 0;
  const priceLine = priceNumber > 0
    ? `✨ Just ${rupees(priceNumber)}${off > 0 ? ` (MRP ${rupees(mrpNumber)} · ${off}% OFF)` : ""}`
    : "";
  const features = featureLines(product);
  const productLink = product?.id ? `${SITE}/product/${product.id}` : SITE;

  if (platform === "whatsapp") {
    return [
      `${hook}`,
      "",
      `*${name}*`,
      priceLine,
      "🚚 Free Delivery | 💵 COD Available",
      "",
      `Order here 👉 ${productLink}?utm_source=whatsapp`,
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  }

  const lines = [`${name} 👜`, "", hook];
  if (features.length) {
    lines.push("");
    for (const feature of features) lines.push(`• ${feature}`);
  }
  lines.push("");
  if (priceLine) lines.push(priceLine);
  lines.push("🚚 Free Delivery | 💵 COD Available", "🇮🇳 Shipping all over India", "");
  if (platform === "facebook") {
    lines.push(`Order now 👉 ${productLink}?utm_source=facebook`);
  } else {
    lines.push("Shop now 👉 link in bio");
  }
  lines.push("", hashtagsFor(product, name));
  return lines.join("\n");
}

export default function CaptionMaker({ product, name, price, mrp }) {
  const [platform, setPlatform] = useState("instagram");
  const [hookIndex, setHookIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const caption = useMemo(
    () => (name ? buildCaption(platform, { product, name, price, mrp, hookIndex }) : ""),
    [platform, product, name, price, mrp, hookIndex]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      const area = document.createElement("textarea");
      area.value = caption;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!name) return null;

  const tab = (value, label) => (
    <button
      type="button"
      key={value}
      className={platform === value ? "cm-tab on" : "cm-tab"}
      onClick={() => setPlatform(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="cm-box">
      <style>{`
        .cm-box { margin-top: 16px; border: 1px solid #e8e2d6; border-radius: 14px; padding: 14px; background: #fcfbf8; }
        .cm-title { font-weight: 700; font-size: 15px; margin-bottom: 10px; }
        .cm-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .cm-tab { padding: 7px 12px; border-radius: 999px; border: 1px solid #ccc; background: #fff; font-size: 13px; cursor: pointer; color: #111; }
        .cm-tab.on { background: #1c150d; border-color: #1c150d; color: #fff; }
        .cm-text { white-space: pre-wrap; font-size: 13px; line-height: 1.55; background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 12px; color: #222; max-height: 320px; overflow-y: auto; }
        .cm-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .cm-btn { padding: 9px 14px; border-radius: 10px; border: 1px solid #1c150d; background: #fff; color: #1c150d; font-size: 14px; cursor: pointer; }
        .cm-btn.main { background: #1c150d; color: #fff; }
      `}</style>
      <div className="cm-title">Caption</div>
      <div className="cm-tabs">
        {tab("instagram", "Instagram")}
        {tab("facebook", "Facebook")}
        {tab("whatsapp", "WhatsApp")}
      </div>
      <div className="cm-text">{caption}</div>
      <div className="cm-actions">
        <button type="button" className="cm-btn main" onClick={copy}>
          {copied ? "Copied ✓" : "Copy caption"}
        </button>
        <button type="button" className="cm-btn" onClick={() => setHookIndex((value) => value + 1)}>
          🔄 New style
        </button>
      </div>
    </div>
  );
}
