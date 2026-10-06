/*
 * SHRIMOH build-time SEO step - runs automatically after `vite build`
 * (see "build" in package.json; this file sits in the project root), so it also runs on every Vercel deploy.
 *
 * What it writes into dist/:
 *   index.html                 homepage (title/meta/canonical/JSON-LD + a
 *                              plain-HTML summary with links to every
 *                              category and product)
 *   seo/shop.html, seo/new-arrivals.html, seo/bestsellers.html
 *   seo/category/<slug>.html   one per real category
 *   app-shell.html             used for /product/:id (tags set in-app
 *                              once the product has loaded)
 *   private-shell.html         /admin and /track-order (noindex)
 *   404.html                   real "page not found" page (HTTP 404)
 *   sitemap.xml                homepage + /shop + categories + products
 *
 * vercel.json maps the clean URLs (/category/handbags ...) to these
 * files. Products are read live from the backend (/api/products). If
 * the backend can't be reached during the build, the build still
 * succeeds - the sitemap then just lists the homepage/shop/categories.
 * Every new product is added to the sitemap on the next deploy.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeCategory, isBagCategory } from "./src/categories.js";
import {
  ALL_BAGS_LABEL,
  API_URL,
  BRAND,
  CATEGORY_SEO,
  COLLECTION_SEO,
  DEFAULT_OG_IMAGE,
  HOME_SEO,
  SEO_CATEGORIES,
  SITE_URL,
  absoluteUrl,
  breadcrumbJsonLd,
  collectionJsonLd,
  organizationJsonLd,
  productPath,
  slugifyCategory,
  websiteJsonLd,
} from "./src/seo.js";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const template = readFileSync(join(dist, "index.html"), "utf8");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLdScript(data, id) {
  const list = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (!list.length) return "";
  const json = JSON.stringify(list.length === 1 ? list[0] : list).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" id="${id}">${json}</script>`;
}

function write(relPath, html) {
  const file = join(dist, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

/* ------------------------- product data ------------------------- */

function prepare(list) {
  return list
    .filter((product) => product && product.id !== undefined && product.name && product.active !== false)
    .map((product) => ({
      ...product,
      category: canonicalizeCategory(product.category, product.name),
    }));
}

async function fetchProducts() {
  if (process.env.SEO_SKIP_PRODUCTS === "1") return null;
  // Local testing only: SEO_PRODUCTS_FILE=path/to/products.json
  if (process.env.SEO_PRODUCTS_FILE) {
    const data = JSON.parse(readFileSync(process.env.SEO_PRODUCTS_FILE, "utf8"));
    return prepare(Array.isArray(data) ? data : data.products || []);
  }
  // The backend sleeps on Render's free plan: first call may only wake it.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(`${API_URL}/api/products`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.products)) throw new Error("unexpected response");
      return prepare(data.products);
    } catch (error) {
      console.warn(`[seo] products fetch attempt ${attempt} failed: ${error.message}`);
    }
  }
  return null;
}

const products = await fetchProducts();
const haveProducts = Array.isArray(products);
console.log(
  haveProducts
    ? `[seo] ${products.length} live products loaded for sitemap/pages`
    : "[seo] products not available - sitemap will contain static pages only"
);

function productsIn(category) {
  if (!haveProducts) return [];
  if (category === ALL_BAGS_LABEL) return products.filter((p) => isBagCategory(p.category));
  return products.filter((p) => p.category === category);
}

/* --------------------------- HTML bits --------------------------- */

const categoryNav = SEO_CATEGORIES.map(
  (category) => `<a href="/category/${slugifyCategory(category)}">${esc(category)}</a>`
).join("");

function productList(list, heading) {
  if (!list.length) return "";
  const items = list
    .slice(0, 48)
    .map((p) => `<li><a href="${esc(productPath(p))}">${esc(p.name)}</a></li>`)
    .join("");
  return `<h2>${esc(heading)}</h2><ul>${items}</ul>`;
}

function fallback({ h1, intro, extra = "" }) {
  return (
    `<div class="seo-fallback"><a class="seo-logo" href="/">SHRIMOH</a>` +
    (h1 ? `<h1>${esc(h1)}</h1>` : "") +
    (intro ? `<p>${esc(intro)}</p>` : "") +
    `<nav aria-label="Shop by category"><a href="/shop">Shop All</a>${categoryNav}</nav>` +
    extra +
    `</div>`
  );
}

function headTags({ title, description, canonicalPath, robots, image, type = "website" }) {
  const canonical = canonicalPath ? absoluteUrl(canonicalPath) : null;
  const img = image || DEFAULT_OG_IMAGE;
  return [
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}" />` : "",
    canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : "",
    `<meta name="robots" content="${esc(robots || "index, follow, max-image-preview:large")}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}" />` : "",
    `<meta property="og:title" content="${esc(title)}" />`,
    description ? `<meta property="og:description" content="${esc(description)}" />` : "",
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    description ? `<meta name="twitter:description" content="${esc(description)}" />` : "",
    `<meta name="twitter:image" content="${esc(img)}" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

function replaceBetween(html, start, end, content) {
  const re = new RegExp(`<!--${start}-->[\\s\\S]*?<!--${end}-->`);
  if (!re.test(html)) throw new Error(`[seo] marker ${start} missing from dist/index.html`);
  return html.replace(re, () => `<!--${start}-->${content}<!--${end}-->`);
}

function page({ head, jsonLd, siteJsonLd = false, body }) {
  let html = replaceBetween(template, "SEO_HEAD_START", "SEO_HEAD_END", `\n    ${headTags(head)}\n    `);
  const ld = siteJsonLd
    ? jsonLdScript([organizationJsonLd(), websiteJsonLd()], "seo-site-jsonld")
    : jsonLdScript(jsonLd, "seo-page-jsonld");
  html = replaceBetween(html, "SEO_SITE_JSONLD_START", "SEO_SITE_JSONLD_END", ld);
  html = replaceBetween(html, "SEO_FALLBACK_START", "SEO_FALLBACK_END", body);
  return html;
}

/* ----------------------------- pages ----------------------------- */

// Homepage
write(
  "index.html",
  page({
    head: { title: HOME_SEO.title, description: HOME_SEO.description, canonicalPath: "/" },
    siteJsonLd: true,
    body: fallback({
      h1: "SHRIMOH – Premium Women's Handbags & Bags",
      intro:
        "SHRIMOH is the official online store for premium women's handbags and bags – structured handbags, shoulder bags, crossbody bags, tote bags, backpacks, clutches and wallets designed for everyday elegance. Free delivery on all orders.",
      extra: haveProducts ? productList(products, "New at SHRIMOH") : "",
    }),
  })
);

// Collection pages
for (const [path, meta] of Object.entries(COLLECTION_SEO)) {
  write(
    `seo${path}.html`,
    page({
      head: { title: meta.title, description: meta.description, canonicalPath: meta.canonicalPath },
      jsonLd: [
        collectionJsonLd({
          name: meta.heading,
          description: meta.description,
          path: meta.canonicalPath,
          products: path === "/shop" && haveProducts ? products : [],
        }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: meta.heading, path: meta.canonicalPath },
        ]),
      ],
      body: fallback({
        h1: meta.heading,
        intro: meta.description,
        extra: haveProducts ? productList(products, "Products") : "",
      }),
    })
  );
}

// Category pages
const indexableCategories = [];
for (const category of SEO_CATEGORIES) {
  const meta = CATEGORY_SEO[category];
  const slug = slugifyCategory(category);
  const path = `/category/${slug}`;
  const list = productsIn(category);
  const empty = haveProducts && list.length === 0;
  if (!empty) indexableCategories.push(path);
  write(
    `seo/category/${slug}.html`,
    page({
      head: {
        title: meta.title,
        description: meta.description,
        canonicalPath: path,
        // Empty category = thin page: not indexed until it has products.
        robots: empty ? "noindex, follow" : undefined,
      },
      jsonLd: [
        collectionJsonLd({ name: meta.heading, description: meta.description, path, products: list }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: meta.heading, path },
        ]),
      ],
      body: fallback({
        h1: meta.heading,
        intro: meta.description,
        extra: productList(list, `${meta.heading} at SHRIMOH`),
      }),
    })
  );
}

// Product pages: one shared shell; the app fills in the product's own
// title, description, canonical and Product JSON-LD once it loads.
write(
  "app-shell.html",
  page({
    head: { title: BRAND, description: HOME_SEO.description, canonicalPath: null, type: "product" },
    jsonLd: null,
    body: fallback({}),
  })
);

// Admin + order tracking: never indexed.
write(
  "private-shell.html",
  page({
    head: { title: BRAND, description: "", canonicalPath: null, robots: "noindex, nofollow" },
    jsonLd: null,
    body: fallback({}),
  })
);

// Real 404 page (Vercel serves dist/404.html with status 404 for any
// URL that is not a file and not in vercel.json's rewrites).
write(
  "404.html",
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page not found | SHRIMOH</title>
    <meta name="robots" content="noindex, follow" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#f7f4ef" />
    <style>
      body{margin:0;background:#f7f4ef;color:#1a1a1a;font-family:Urbanist,Manrope,Arial,sans-serif}
      main{min-height:100vh;box-sizing:border-box;padding:56px 6vw;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
      img{width:72px;height:72px}
      .logo{font-family:Georgia,"Times New Roman",serif;font-size:26px;letter-spacing:6px;color:#1a1a1a;text-decoration:none;margin-top:8px}
      small{display:block;margin-top:6px;color:#8f7d5e;font-size:9px;letter-spacing:2.8px}
      h1{margin:40px 0 10px;font-size:clamp(26px,4vw,40px);font-weight:300}
      p{margin:0 0 26px;color:#555;font-size:15px;line-height:1.6;max-width:520px}
      .home{display:inline-block;padding:13px 26px;border-radius:999px;background:#1a1a1a;color:#fff;text-decoration:none;font-size:12px;letter-spacing:1.5px;text-transform:uppercase}
      nav{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 22px;margin-top:34px;max-width:760px}
      nav a{color:#7d6c4f;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;padding:6px 0}
      nav a:hover,.logo:hover{color:#1a1a1a}
    </style>
  </head>
  <body>
    <main>
      <img src="/icon-192.png" alt="" width="72" height="72" />
      <a class="logo" href="/">SHRIMOH</a>
      <small>THE LUXURY STORE</small>
      <h1>Page not found</h1>
      <p>Sorry, we couldn't find the page you were looking for. It may have been moved, or the link may be incorrect.</p>
      <a class="home" href="/">Back to homepage</a>
      <nav aria-label="Shop by category"><a href="/shop">Shop All</a>${categoryNav}</nav>
    </main>
  </body>
</html>
`
);

/* ---------------------------- sitemap ---------------------------- */

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

const urls = [
  { path: "/" },
  { path: "/shop" },
  ...indexableCategories.map((path) => ({ path })),
  ...(haveProducts
    ? products.map((p) => ({ path: productPath(p), lastmod: isoDate(p.updatedAt || p.createdAt) }))
    : []),
];

const seen = new Set();
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .filter((u) => (seen.has(u.path) ? false : seen.add(u.path)))
    .map(
      (u) =>
        `  <url>\n    <loc>${esc(`${SITE_URL}${u.path === "/" ? "/" : u.path}`)}</loc>\n` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
        `  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

write("sitemap.xml", sitemap);

// robots.txt is generated too, so it always uses SITE_URL from src/seo.js.
write(
  "robots.txt",
  `# ${BRAND} - ${SITE_URL}\n` +
    `# Everything public may be crawled. Private pages (admin, order\n` +
    `# tracking) carry a "noindex" tag instead of being blocked here.\n` +
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
);
console.log(`[seo] wrote sitemap.xml with ${seen.size} URLs, 404.html and per-page HTML`);
