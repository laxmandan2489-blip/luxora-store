/*
 * SHRIMOH SEO CONFIG - single source of truth (2026-10-06)
 *
 * Plain JavaScript (no JSX, no asset imports) on purpose: it is used by
 * BOTH the website (src/App.jsx, via src/useSeo.js) and the build-time
 * script scripts/prerender-seo.mjs that writes sitemap.xml and the
 * per-page HTML files Google sees before any JavaScript runs.
 *
 * SITE_URL is the live production address found in the project
 * (server/server.js allowedOrigins). If you ever connect a custom
 * domain, change it here only - every canonical, sitemap entry,
 * Open Graph URL and JSON-LD URL follows automatically.
 */

import { ACCESSORY_CATEGORIES, BAG_CATEGORIES, PRODUCT_CATEGORIES } from "./categories.js";

// ============================================================
// YOUR WEBSITE ADDRESS - the only line to change when the store
// moves to a SHRIMOH address (e.g. https://shrimoh.vercel.app).
// Canonicals, sitemap.xml, robots.txt, Open Graph and JSON-LD are
// all built from this one value.
// ============================================================
export const SITE_URL = "https://shrimoh-store-phi.vercel.app";
export const BRAND = "SHRIMOH";
export const API_URL = "https://luxora-store-mkva.onrender.com";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const LOGO_URL = `${SITE_URL}/icon-192.png`;
export const SUPPORT_EMAIL = "infoshrimoh@gmail.com";
export const ALL_BAGS_LABEL = "All Bags";

export const HOME_SEO = {
  title: "SHRIMOH – Premium Women's Handbags & Bags | Official Store",
  description:
    "Official SHRIMOH online store for premium women's handbags – tote, shoulder and crossbody bags, clutches and wallets. Free delivery on all orders.",
};

/* Same slug rule the app uses for /category/:slug URLs. */
export function slugifyCategory(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/* One title/description/heading per real category page. Only the
   categories that exist in src/categories.js (+ "All Bags"). */
export const CATEGORY_SEO = {
  Handbags: {
    title: "Women's Handbags – Structured Everyday Styles | SHRIMOH",
    heading: "Women's Handbags",
    description:
      "Shop SHRIMOH women's handbags – polished, structured styles made for the commute, the office and dinner plans. Free delivery on all orders.",
  },
  "Shoulder Bags": {
    title: "Shoulder Bags for Women | SHRIMOH",
    heading: "Shoulder Bags",
    description:
      "Discover SHRIMOH shoulder bags for women – soft curves, clean lines and everyday sizes that pair with everything. Free delivery on all orders.",
  },
  "Crossbody Bags": {
    title: "Crossbody & Sling Bags for Women | SHRIMOH",
    heading: "Crossbody Bags",
    description:
      "Shop SHRIMOH crossbody and sling bags – hands-free, versatile styles for city days, errands and weekend plans. Free delivery on all orders.",
  },
  "Tote Bags": {
    title: "Tote Bags for Women – Work & Travel | SHRIMOH",
    heading: "Tote Bags",
    description:
      "Roomy, refined SHRIMOH tote bags for work days, travel and weekends – spacious inside, elegant outside. Free delivery on all orders.",
  },
  Backpacks: {
    title: "Women's Backpacks & Laptop Bags | SHRIMOH",
    heading: "Backpacks",
    description:
      "Shop SHRIMOH backpacks for women – smart compartments, comfortable straps and a polished finish for busy days. Free delivery on all orders.",
  },
  Clutches: {
    title: "Clutches & Evening Bags for Women | SHRIMOH",
    heading: "Clutches",
    description:
      "SHRIMOH clutches and evening bags – small, striking styles for weddings, festive evenings and special dinners. Free delivery on all orders.",
  },
  Wallets: {
    title: "Women's Wallets & Card Holders | SHRIMOH",
    heading: "Wallets",
    description:
      "Slim SHRIMOH wallets and card holders for women, thoughtfully organised to match the bag you carry every day. Free delivery on all orders.",
  },
  Accessories: {
    title: "Bag Accessories | SHRIMOH",
    heading: "Accessories",
    description:
      "Finishing touches from SHRIMOH, designed to pair beautifully with your handbag. Shop bag accessories online with free delivery.",
  },
  [ALL_BAGS_LABEL]: {
    title: "All Women's Bags – Handbags, Totes & More | SHRIMOH",
    heading: "All Bags",
    description:
      "Every SHRIMOH bag in one place – handbags, shoulder bags, crossbody bags, totes, backpacks and clutches for women. Free delivery on all orders.",
  },
};

/* Collection pages. /new-arrivals and /bestsellers show the same
   products as /shop in a different order, so they point their
   canonical at /shop instead of competing with it. */
export const COLLECTION_SEO = {
  "/shop": {
    title: "Shop All Women's Bags & Accessories | SHRIMOH",
    heading: "Shop All",
    description:
      "Browse the full SHRIMOH collection of premium women's handbags, totes, shoulder and crossbody bags, clutches and wallets. Free delivery on all orders.",
    canonicalPath: "/shop",
  },
  "/new-arrivals": {
    title: "New Arrivals – Women's Bags | SHRIMOH",
    heading: "New Arrivals",
    description:
      "The newest SHRIMOH handbags and bags for women, freshest designs first. Free delivery on all orders.",
    canonicalPath: "/shop",
  },
  "/bestsellers": {
    title: "Bestselling Women's Bags | SHRIMOH",
    heading: "Bestsellers",
    description:
      "SHRIMOH's most-loved women's bags – the styles customers reorder and carry every day. Free delivery on all orders.",
    canonicalPath: "/shop",
  },
};

/* Every category that gets its own indexable /category/:slug page. */
export const SEO_CATEGORIES = [ALL_BAGS_LABEL, ...PRODUCT_CATEGORIES];
export { ACCESSORY_CATEGORIES, BAG_CATEGORIES, PRODUCT_CATEGORIES };

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/* Product photos are stored as full https URLs (Supabase) or, for very
   old products, as /uploads/... paths on the backend. */
export function absoluteImageUrl(image) {
  if (!image || typeof image !== "string") return "";
  if (image.startsWith("data:")) return "";
  if (/^https?:\/\//.test(image)) return image.replace(/^http:\/\//, "https://");
  return `${API_URL}${image.startsWith("/") ? "" : "/"}${image}`;
}

export function productPath(product) {
  return `/product/${encodeURIComponent(String(product.id))}`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Cuts at a word boundary so descriptions don't end mid-word. */
export function truncate(value, max = 158) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export function productImages(product) {
  const list = [];
  if (Array.isArray(product?.images)) list.push(...product.images);
  if (product?.image) list.push(product.image);
  if (product?.colorImages && typeof product.colorImages === "object") {
    for (const value of Object.values(product.colorImages)) {
      if (Array.isArray(value)) list.push(...value);
      else if (value) list.push(value);
    }
  }
  return Array.from(new Set(list.map(absoluteImageUrl).filter(Boolean)));
}

/* Real description only when it is real text (some test products have
   descriptions like "10" or "sjfn"); otherwise a plain factual line. */
export function productMetaDescription(product) {
  const own = cleanText(product?.description);
  if (own.split(" ").length >= 6) return truncate(own, 158);
  const singular = {
    Handbags: "handbag",
    "Shoulder Bags": "shoulder bag",
    "Crossbody Bags": "crossbody bag",
    "Tote Bags": "tote bag",
    Backpacks: "backpack",
    Clutches: "clutch",
    Wallets: "wallet",
    Accessories: "bag accessory",
  }[product?.category] || "bag";
  return truncate(
    `Shop the ${cleanText(product?.name)} from SHRIMOH – a women's ${singular}. Free delivery on all orders.`,
    158
  );
}

export function productTitle(product) {
  return `${cleanText(product?.name) || "Product"} | ${BRAND}`;
}

/* ---------------------------- JSON-LD ---------------------------- */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND,
    url: `${SITE_URL}/`,
    logo: LOGO_URL,
    email: SUPPORT_EMAIL,
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND,
    url: `${SITE_URL}/`,
    inLanguage: "en-IN",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function collectionJsonLd({ name, description, path, products = [] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };
  if (products.length > 0) {
    data.mainEntity = {
      "@type": "ItemList",
      itemListElement: products.slice(0, 30).map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(productPath(product)),
        name: cleanText(product.name),
      })),
    };
  }
  return data;
}

/* Product + Offer from real product data only. No ratings/reviews
   (the store has none yet), no invented SKU. */
export function productJsonLd(product) {
  const url = absoluteUrl(productPath(product));
  const price = Number(product?.price);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: cleanText(product?.name),
    url,
    brand: { "@type": "Brand", name: BRAND },
  };
  const images = productImages(product);
  if (images.length) data.image = images.slice(0, 6);
  const description = cleanText(product?.description);
  if (description.split(" ").length >= 6) data.description = truncate(description, 500);
  if (product?.category) data.category = cleanText(product.category);
  if (product?.materials) data.material = cleanText(product.materials);
  if (Array.isArray(product?.colors) && product.colors.length) data.color = product.colors.join(", ");
  if (Number.isFinite(price) && price > 0) {
    data.offers = {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: price.toFixed(2),
      availability:
        Number(product?.stock || 0) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${SITE_URL}/#organization` },
    };
  }
  return data;
}
