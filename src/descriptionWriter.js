/*
 * HONEST DESCRIPTION WRITER (2026-10-28) - used by DescriptionCheck.jsx
 * --------------------------------------------------------------------
 * Writes a short product description ONLY from what is already saved on
 * the product (name, category, colours, key features, size) plus
 * styling ideas. It never claims material, quality, handmade, warranty,
 * brand or delivery promises. Many sentence choices are mixed by the
 * product's id (and "🔄 Dusri likho"), so no two bags read the same.
 */

const TYPES = [
  {
    test: /sling|cross[\s-]?body/i,
    intro: [
      "The {name} is a hands-free sling for days when you want your phone, keys and cards close by.",
      "Meet the {name} – a crossbody bag that keeps your hands free and your essentials within reach.",
      "Easy and light on the shoulder, the {name} is made for shopping trips, travel and quick plans.",
      "The {name} is a compact crossbody pick that goes from errands to evening outings without fuss.",
    ],
  },
  {
    test: /tote/i,
    intro: [
      "The {name} is a roomy tote for days when you carry a little bit of everything.",
      "Meet the {name} – an easy tote that holds your daily essentials for work, college or travel.",
      "Spacious and simple, the {name} is a tote you can grab for office days and weekend errands.",
      "The {name} gives you an open, easy-to-pack tote shape for busy days.",
    ],
  },
  {
    test: /clutch|potli|evening/i,
    intro: [
      "The {name} is a small statement piece for weddings, parties and festive evenings.",
      "Meet the {name} – an evening clutch that holds the basics and finishes your look.",
      "Made to be carried in hand, the {name} adds a dressy touch to festive and party outfits.",
    ],
  },
  {
    test: /backpack/i,
    intro: [
      "The {name} is a neat backpack for college, office and day trips.",
      "Meet the {name} – a backpack that keeps your hands free and your things organised.",
      "Easy to carry all day, the {name} suits daily commutes and weekend outings.",
    ],
  },
  {
    test: /wallet|purse|card/i,
    intro: [
      "The {name} keeps your cards, cash and coins sorted in one slim piece.",
      "Meet the {name} – a handy wallet that slips easily into any bag.",
      "Simple and practical, the {name} is an everyday wallet for cards and cash.",
    ],
  },
  {
    test: /shoulder|hobo|baguette/i,
    intro: [
      "The {name} sits comfortably on the shoulder and pairs easily with everyday outfits.",
      "Meet the {name} – a shoulder bag you can reach for every day, from office to outings.",
      "Easy to carry and easy to style, the {name} is a shoulder bag for daily plans.",
      "The {name} brings a clean shoulder-bag shape to your work and weekend looks.",
    ],
  },
  {
    test: /./,
    intro: [
      "The {name} is a neat handbag for office days and outings.",
      "Meet the {name} – an everyday handbag that keeps your essentials together.",
      "With its clean shape, the {name} adds a polished touch to everyday outfits.",
      "The {name} is an easy-to-carry handbag that works from desk to dinner.",
      "Carry the {name} to work, shopping or a family get-together – it fits right in.",
    ],
  },
];

const STYLE_WORDS = [
  [/quilt/i, ["Its quilted pattern adds soft texture to the look.", "The quilted finish gives it a rich, textured look."]],
  [/structur|box/i, ["Its structured shape gives a smart, tidy look.", "The firm, structured silhouette gives a smart, put-together feel."]],
  [/chain/i, ["The chain detail adds a dressy touch.", "A chain detail makes it easy to dress up."]],
  [/top[\s-]?handle|handle/i, ["Carry it by the top handle or style it your way.", "The top handle makes it easy to carry in hand."]],
  [/mini|small|compact/i, ["Its compact size is just right for the essentials.", "Small in size, it holds what you need for the day."]],
  [/croc|embossed|textured/i, ["The textured finish adds interest to simple outfits.", "Its textured look stands out without being loud."]],
  [/bow/i, ["A bow detail adds a sweet, feminine touch.", "The bow detail makes it a little playful."]],
  [/moon|crescent|half/i, ["Its curved half-moon shape feels modern and soft.", "The curved shape gives it a fresh, modern look."]],
  [/bucket/i, ["The bucket shape gives you easy access to your things.", "Its bucket shape is relaxed and roomy."]],
  [/vegan|pu\b|faux/i, ["It comes in a vegan / faux-leather finish.", "The finish is vegan / faux leather."]],
];

const FEATURE_LEADS = ["Details: ", "Key details: ", "What you get: ", "Good to know: "];

const COLOUR_LINES = [
  "Available in {n} colours – {list}.",
  "Pick from {n} shades: {list}.",
  "Comes in {n} colours: {list}.",
];

const CLOSERS = [
  "Pair it with a kurti, jeans or a dress – it works with both.",
  "A handy pick for college, shopping trips and weekend plans.",
  "Style it with western or ethnic outfits for an easy, polished look.",
  "A simple way to lift a plain outfit for work or a day out.",
  "Easy to match with everyday outfits, from casual to festive.",
  "A good pick to gift a sister, friend or mom.",
  "Keep it as your go-to bag for daily plans.",
];

function seededRandom(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function colourList(product) {
  const fromPhotos = product?.colorImages && typeof product.colorImages === "object" ? Object.keys(product.colorImages) : [];
  const seen = new Set();
  return [...(Array.isArray(product?.colors) ? product.colors : []), ...fromPhotos]
    .map((colour) => String(colour || "").trim())
    .filter((colour) => colour && !/^#/.test(colour))
    .filter((colour) => {
      const key = colour.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function joinNice(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/**
 * product: { id, name, category, colors, colorImages, keyFeatures, dimensions }
 * keep: honest sentences already there (kept after cleaning) - added in.
 * round: 0, 1, 2 ... ("🔄 Dusri likho" gives a new mix)
 */
export function writeDescription(product, keep = "", round = 0) {
  const rand = seededRandom(`${product?.id || product?.name || "bag"}#${round}`);
  const name = String(product?.name || "bag").trim();
  const lookup = `${name} ${product?.category || ""}`;
  const type = TYPES.find((entry) => entry.test.test(lookup)) || TYPES[TYPES.length - 1];
  const parts = [pick(type.intro, rand).replace("{name}", name)];

  const styles = STYLE_WORDS.filter(([re]) => re.test(name)).slice(0, 2);
  for (const [, lines] of styles) parts.push(pick(lines, rand));

  const kept = String(keep || "").replace(/\s+/g, " ").trim();
  if (kept) parts.push(/[.!?]$/.test(kept) ? kept : `${kept}.`);

  const features = (Array.isArray(product?.keyFeatures) ? product.keyFeatures : [])
    .map((item) => String(item).trim().replace(/[.;,]+$/, ""))
    .filter((item) => item && item.length < 80)
    .filter((item) => !kept.toLowerCase().includes(item.toLowerCase()))
    .slice(0, 3);
  if (features.length) parts.push(`${pick(FEATURE_LEADS, rand)}${joinNice(features.map(lowerFirst))}.`);

  const colours = colourList(product);
  if (colours.length >= 2) {
    parts.push(pick(COLOUR_LINES, rand).replace("{n}", colours.length).replace("{list}", joinNice(colours)));
  }

  const size = String(product?.dimensions || "").trim();
  if (size) parts.push(`Size: ${size.replace(/[.]+$/, "")}.`);

  parts.push(pick(CLOSERS, rand));
  return parts.join(" ");
}
