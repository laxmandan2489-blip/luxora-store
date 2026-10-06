# SHRIMOH – SEO Implementation Report

Live site: **https://shrimoh-store-phi.vercel.app** (Vercel project: shrimoh-store)

## A. Files changed

| File | Change |
|---|---|
| `index.html` | Title, meta description, canonical, robots, Open Graph, Twitter card, Organization + WebSite JSON-LD, favicon/manifest links, Search Console placeholder, fonts moved here, plain-HTML brand summary inside `#root` |
| `package.json` | `build` = `vite build && node scripts/prerender-seo.mjs` |
| `vercel.json` | Explicit routes instead of catch-all, legacy category redirects, real 404, trailing-slash fix, cache headers |
| `src/App.jsx` | Per-page SEO (title/meta/canonical/robots/JSON-LD), brand line in homepage H1, real `<a>` links (logo, product names, footer, breadcrumb), visible product breadcrumb, alt-text fixes |
| `src/App.css` | Styles for the new links/brand line/breadcrumb only; Google-Fonts `@import` removed (now in index.html) |
| `src/seo.js` (new) | All titles, descriptions, URLs and JSON-LD builders in one place |
| `src/useSeo.js` (new) | Tiny hook that updates `<head>` per page (no extra library) |
| `scripts/prerender-seo.mjs` (new) | At build: writes per-page HTML, `sitemap.xml`, `404.html` |
| `robots.txt` (generated at build) | Allow all + sitemap link, built from SITE_URL |
| `public/site.webmanifest` (new) | Name, colours, icons |
| `public/favicon.ico`, `public/icon-192.png` (new) | Favicon in sizes Google uses (from your existing SHRIMOH crown logo) |
| `public/og-image.png` (new) | 1200×630 share image with SHRIMOH logo |
| `server/server.js` | New orders numbered `SHR-...` (was `LUX-...`); SHRIMOH address added to CORS list |
| `public/favicon.svg` (deleted) | It was the Vite logo, not SHRIMOH |

## B. What was implemented

- **Titles/meta:** unique for homepage, Shop, 8 categories + All Bags, every product (`[Product Name] | SHRIMOH`). Descriptions 100–160 chars, no keyword stuffing.
- **Canonical:** every page points to itself; `?color=`, tracking and other query parameters are dropped; `/new-arrivals` and `/bestsellers` (same products, different sort) point to `/shop`; trailing slash `/shop/` → `/shop`.
- **Robots:** indexable – home, shop, categories, products. `noindex` – track-order, admin, product-not-found, empty categories (automatically indexed once they get products).
- **Sitemap:** generated on every deploy from the live `/api/products`. Contains home, `/shop`, non-empty categories, all active products with `lastmod`. If the backend is asleep during build, the build still succeeds with static pages only.
- **Schema:** Organization + WebSite (home), CollectionPage + ItemList + BreadcrumbList (categories), Product + Offer + BreadcrumbList (products). Brand = SHRIMOH. No ratings, reviews, SKU or LocalBusiness were invented. No `sameAs` because no official social links exist in the project.
- **Crawlability:** each category/collection URL has its own HTML with the correct head tags and a short text + links, readable before JavaScript. Footer now links to every category; product names are real links.
- **404:** unknown URLs now return a real HTTP 404 with a SHRIMOH-branded page and category links (previously every wrong URL showed the homepage with 200).
- **Legacy URLs:** `/category/sling-bags`, `/bags`, `/laptop-bags`, `/travel-bags` etc. 308-redirect to the current category.
- **Images:** product photos already used product-name alt text and lazy loading; duplicate hover images are now marked decorative; hero image is not lazy-loaded (kept `fetchPriority=high`).
- **Performance:** fonts no longer wait for the CSS file; long-term caching for hashed `/assets/*`. Bundle size essentially unchanged (+~10 KB raw, +3 KB gzip).
- **Mobile:** tested at 390 px – no horizontal overflow, breadcrumb wraps correctly.
- **Accessibility:** logo link has an accessible name; breadcrumb uses `nav` + `aria-current`.

## Website address

All SEO uses **https://shrimoh-store-phi.vercel.app** (one line: `SITE_URL` in `src/seo.js`). The backend (`luxora-store-mkva.onrender.com`) is internal only - customers and Google never see it.

## C. Google Search Console setup

1. Open **https://search.google.com/search-console** and sign in with your Google account.
2. Click **Add property** → choose **URL prefix** → enter `https://shrimoh-store-phi.vercel.app/` → Continue.
3. Choose **HTML tag**. Copy only the value inside `content="..."`.
4. In `index.html`, find `PASTE_REAL_TOKEN_HERE`, remove the `<!--` and `-->` around that line, paste your value. Commit + push, wait for Vercel to finish, then click **Verify**.
5. Left menu → **Sitemaps** → enter `sitemap.xml` → **Submit**. Status should become "Success".
6. Top search bar (**URL Inspection**) → paste `https://shrimoh-store-phi.vercel.app/` → **Request indexing**.
7. Repeat step 6 for `/shop` and your most important category pages (Handbags, Tote Bags, Shoulder Bags, Crossbody Bags). There is a daily limit, so do the important ones first.
8. Monitor: **Pages** report (indexed / not indexed and why), **Sitemaps** (discovered URLs), **Performance** (searches like "shrimoh"), **Enhancements → Products / Breadcrumbs** for schema errors. Check weekly.

## D. URLs to test after deploy

- https://shrimoh-store-phi.vercel.app/
- https://shrimoh-store-phi.vercel.app/robots.txt
- https://shrimoh-store-phi.vercel.app/sitemap.xml
- https://shrimoh-store-phi.vercel.app/shop
- https://shrimoh-store-phi.vercel.app/category/handbags
- https://shrimoh-store-phi.vercel.app/category/tote-bags
- https://shrimoh-store-phi.vercel.app/category/shoulder-bags
- https://shrimoh-store-phi.vercel.app/category/crossbody-bags
- Product pages: open any product from the site, or copy `/product/...` URLs from sitemap.xml
- Should be 404: https://shrimoh-store-phi.vercel.app/this-page-does-not-exist
- Should redirect: https://shrimoh-store-phi.vercel.app/category/sling-bags

## E. Manual checklist

- [ ] Vercel build log shows `[seo] N live products loaded` and `wrote sitemap.xml`
- [ ] Homepage, shop, category and product pages open directly (paste URL in a new tab) and on refresh
- [ ] Wrong URL shows the SHRIMOH "Page not found" page
- [ ] `/sitemap.xml` opens as XML and lists your products
- [ ] `/robots.txt` shows `Allow: /` and the sitemap line
- [ ] View page source of `/category/handbags`: correct `<title>` and canonical
- [ ] https://search.google.com/test/rich-results with a product URL → Product + Breadcrumb detected, no errors
- [ ] Share the homepage link on WhatsApp → SHRIMOH preview image appears
- [ ] Browser tab shows the SHRIMOH crown icon
- [ ] Add to bag, cart, checkout, Razorpay and COD still work
- [ ] /admin login still works
- [ ] Mobile: menu, product cards, product page, checkout look the same as before

## F. Deployment

**Option 1 – GitHub website (how you uploaded before)**
1. Download the zip and extract it.
2. In your repo on GitHub → **Add file → Upload files** → drag in all the extracted folders/files (`index.html`, `package.json`, `vercel.json`, `public`, `src`, `scripts`, `server`) keeping the same folder structure → **Commit changes**.
3. Delete in GitHub (open the file → ⋯ → Delete file → Commit): `public/favicon.svg`, `public/robots.txt` if it exists, `App-copy.txt`, `src/Admin.backup.jsx`, `server/data/orders.json`, `backend/data/orders.json`.

**Option 2 – Git on your computer**
```
git pull
git apply shrimoh-seo.patch
npm install
npm run build        # should end with "[seo] wrote sitemap.xml ..."
git add -A
git commit -m "SEO: meta, canonical, sitemap, schema, 404, crawlable links"
git push
```

Then: Vercel deploys automatically from the push → wait for **Ready** → test the URLs in section D → Search Console (section C).

**After adding new products in Admin:** the sitemap updates on the next deploy. Easiest: Vercel → Project → Settings → Git → **Deploy Hooks** → create one; open its URL whenever you add products (or just push any small change).

## G. What is NOT guaranteed

- Google indexing is not instant; it usually takes days to a few weeks.
- No ranking, including #1 for "SHRIMOH", can be guaranteed by anyone.
- Search results change over time.
- A `.vercel.app` address works fine for indexing; what helps most now is real signals: the site being linked from your Instagram/WhatsApp Business/marketplace profiles and genuine customer visits.

## Other issues found (not SEO, please fix)

1. **Customer data is public on GitHub:** `server/data/orders.json` and `backend/data/orders.json` contain names, phone numbers and addresses. Delete them from the repo (and from Render if unused). No API keys/passwords were found in the code.
2. **WhatsApp button:** `WHATSAPP_NUMBER` in `src/App.jsx` has no country code. For India it should be `91` + the 10-digit number, otherwise wa.me links don't open the chat.
3. **About / Shipping / Returns pages** open as pop-ups without their own URL, so Google can't index them. Giving them real URLs (e.g. `/about`) is a good next step.
4. Unused leftovers in repo: `App-copy.txt`, `src/Admin.backup.jsx`, `src/server/`, `backend/` (if Render uses `server/`). Not harmful for SEO.
