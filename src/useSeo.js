/*
 * useSeo - keeps the page <head> in sync with the page being shown.
 *
 * No extra library (react-helmet etc.) - just a few DOM updates, so the
 * bundle stays small. The static HTML files written at build time by
 * scripts/prerender-seo.mjs already contain the right tags for the
 * homepage, every category page and the collection pages; this hook
 * keeps them correct while a visitor (or Google's renderer) moves
 * around the site, and adds the product-page tags, which can only be
 * known once the product data has loaded.
 */
import { useEffect } from "react";
import { BRAND, DEFAULT_OG_IMAGE, absoluteUrl } from "./seo.js";

function upsertMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (content === null || content === undefined || content === "") {
    if (tag) tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  if (tag.getAttribute("content") !== content) tag.setAttribute("content", content);
}

function upsertCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    if (link) link.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

function upsertJsonLd(data) {
  const id = "seo-page-jsonld";
  let script = document.getElementById(id);
  const list = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (list.length === 0) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    document.head.appendChild(script);
  }
  const json = JSON.stringify(list.length === 1 ? list[0] : list).replace(/</g, "\\u003c");
  if (script.textContent !== json) script.textContent = json;
}

/**
 * seo = {
 *   title, description,
 *   canonicalPath   - e.g. "/category/handbags" (null = no canonical)
 *   robots          - e.g. "noindex, follow" (default "index, follow")
 *   image           - absolute image URL for social previews
 *   type            - og:type ("website" | "product")
 *   jsonLd          - object or array of JSON-LD objects for this page
 *   skip            - true while data is still loading: leave tags alone
 * }
 */
export default function useSeo(seo) {
  const key = JSON.stringify(seo || {});

  useEffect(() => {
    if (!seo || seo.skip) return;

    const title = seo.title || BRAND;
    if (document.title !== title) document.title = title;

    const canonical = seo.canonicalPath ? absoluteUrl(seo.canonicalPath) : null;
    const image = seo.image || DEFAULT_OG_IMAGE;

    upsertMeta("name", "description", seo.description || "");
    upsertMeta("name", "robots", seo.robots || "index, follow, max-image-preview:large");
    upsertCanonical(canonical);

    upsertMeta("property", "og:site_name", BRAND);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", seo.description || "");
    upsertMeta("property", "og:type", seo.type || "website");
    upsertMeta("property", "og:url", canonical || absoluteUrl(window.location.pathname));
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", seo.description || "");
    upsertMeta("name", "twitter:image", image);

    upsertJsonLd(seo.jsonLd || null);
    // `key` captures every field of `seo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
