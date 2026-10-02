/*
 * SHRIMOH CATEGORY LIST - single source of truth (2026-10-03)
 *
 * Used by BOTH the website (App.jsx) and the admin panel (Admin.jsx),
 * so the two can never drift apart again.
 *
 * Kept deliberately short - only the main categories big bag stores
 * use. Old/extra category names that ended up in the database (from
 * CSV uploads or older versions of the site, e.g. "Bags",
 * "Shoulder Bags & Totes", "Sling Bags", "Satchel Handbags") are
 * mapped onto this list automatically by canonicalizeCategory() below
 * - on the website when products are shown, and in the admin when a
 * product is saved or imported - so no new category can appear on its
 * own any more.
 */

export const BAG_CATEGORIES = [
  "Handbags",
  "Shoulder Bags",
  "Crossbody Bags",
  "Tote Bags",
  "Backpacks",
  "Clutches",
];

export const ACCESSORY_CATEGORIES = ["Wallets", "Accessories"];

export const PRODUCT_CATEGORIES = [...BAG_CATEGORIES, ...ACCESSORY_CATEGORIES];

// The category a bag goes to when nothing in its category or name
// gives a clearer answer.
export const DEFAULT_BAG_CATEGORY = "Handbags";

function clean(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Exact old names -> new category. Checked before keyword guessing. */
const DIRECT_MAP = {
  handbag: "Handbags",
  handbags: "Handbags",
  "satchel handbags": "Handbags",
  satchel: "Handbags",
  satchels: "Handbags",
  "top handle bags": "Handbags",
  "shoulder bag": "Shoulder Bags",
  "shoulder bags": "Shoulder Bags",
  "hobo bags": "Shoulder Bags",
  "crossbody bag": "Crossbody Bags",
  "crossbody bags": "Crossbody Bags",
  "cross body bags": "Crossbody Bags",
  "sling bag": "Crossbody Bags",
  "sling bags": "Crossbody Bags",
  tote: "Tote Bags",
  totes: "Tote Bags",
  "tote bag": "Tote Bags",
  "tote bags": "Tote Bags",
  "travel bags": "Tote Bags",
  "duffle bags": "Tote Bags",
  backpack: "Backpacks",
  backpacks: "Backpacks",
  "laptop bags": "Backpacks",
  "laptop bag": "Backpacks",
  clutch: "Clutches",
  clutches: "Clutches",
  "potli bags": "Clutches",
  wallet: "Wallets",
  wallets: "Wallets",
  accessories: "Accessories",
  accessory: "Accessories",
};

/* Keyword rules, checked in this order against the category text and,
   if that's generic (e.g. just "Bags"), the product's name. */
const KEYWORD_RULES = [
  [/\b(wallet|purse card|card holder|cardholder)\b/, "Wallets"],
  [/\b(belt|keychain|key chain|charm|scarf|bag strap|accessor)/, "Accessories"],
  [/\b(clutch|potli|evening bag|minaudiere)/, "Clutches"],
  [/\b(backpack|laptop|rucksack)/, "Backpacks"],
  [/\b(tote|shopper|travel|duffle|duffel|weekender)/, "Tote Bags"],
  [/\b(sling|cross ?body)/, "Crossbody Bags"],
  [/\b(shoulder|hobo|baguette|bucket)/, "Shoulder Bags"],
  [/\b(handbag|hand bag|satchel|top handle|bowling)/, "Handbags"],
];

function guessFromText(text) {
  const value = clean(text);
  if (!value) return null;
  for (const [pattern, category] of KEYWORD_RULES) {
    if (pattern.test(value)) return category;
  }
  return null;
}

/**
 * Returns one of PRODUCT_CATEGORIES for any category text.
 * - Already-correct names come back unchanged.
 * - Known old names are mapped (Sling Bags -> Crossbody Bags, ...).
 * - Mixed/generic names ("Shoulder Bags & Totes", "Bags") are decided
 *   from the product's NAME when possible (a "... Tote" goes to Tote
 *   Bags, otherwise Shoulder Bags / Handbags).
 */
export function canonicalizeCategory(category, productName = "") {
  const raw = String(category || "").trim();

  const exact = PRODUCT_CATEGORIES.find(
    (item) => item.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  const key = clean(raw);

  // "Shoulder Bags & Totes" (and similar mixes): the name decides.
  if (/shoulder/.test(key) && /tote/.test(key)) {
    return /\btote/.test(clean(productName)) ? "Tote Bags" : "Shoulder Bags";
  }

  if (DIRECT_MAP[key]) return DIRECT_MAP[key];

  // Generic ("Bags", "Women Bags", blank, ...) -> look at the product name
  // first, since the category itself says nothing specific.
  const isGeneric = !key || /^(all )?(women s |womens |ladies )?bags?$/.test(key);
  if (isGeneric) {
    return guessFromText(productName) || DEFAULT_BAG_CATEGORY;
  }

  return guessFromText(key) || guessFromText(productName) || DEFAULT_BAG_CATEGORY;
}

export function isBagCategory(category) {
  return !ACCESSORY_CATEGORIES.includes(category);
}
