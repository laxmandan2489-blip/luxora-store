/*
 * SITE ANALYTICS (2026-10-25)
 * Sends small anonymous events to our own server so Admin > Analytics
 * can show visitors, most-viewed bags, wishlist adds, add-to-cart,
 * checkout, orders, and WHERE visitors came from (Meta ads, Instagram,
 * Facebook, WhatsApp, Google, direct...). No names / phone / email are
 * sent - only a random visitor id kept in this browser.
 * Tracking must never break the shop.
 */
const TRACK_URL = "https://luxora-store-mkva.onrender.com/api/track";
const VISITOR_KEY = "shrimoh_visitor_id";
const SOURCE_KEY = "shrimoh_visit_source";

function getVisitorId() {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// Works out where this visit came from. Decided once, on the first page
// of the visit, and reused for every event of that visit.
function detectSource() {
  const params = new URLSearchParams(window.location.search);
  const utmSource = (params.get("utm_source") || "").toLowerCase().trim();
  const utmMedium = (params.get("utm_medium") || "").toLowerCase().trim();
  const userAgent = navigator.userAgent || "";
  let referrerHost = "";
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
  } catch {
    referrerHost = "";
  }
  if (referrerHost === window.location.hostname) referrerHost = "";

  const isPaid = /paid|cpc|ads?$|ppc/.test(utmMedium);
  if (utmSource) {
    if (/^(meta|facebook|fb|instagram|ig)$/.test(utmSource)) return isPaid ? "Meta Ads" : utmSource.startsWith("i") ? "Instagram" : "Facebook";
    if (utmSource.includes("whatsapp") || utmSource === "wa") return "WhatsApp";
    if (utmSource.includes("google")) return isPaid ? "Google Ads" : "Google";
    if (utmSource.includes("email") || utmSource.includes("brevo")) return "Email";
    return utmSource.charAt(0).toUpperCase() + utmSource.slice(1, 30);
  }
  if (params.get("fbclid")) {
    if (/Instagram/i.test(userAgent)) return "Instagram (ad / link)";
    return "Facebook (ad / link)";
  }
  if (params.get("gclid")) return "Google Ads";
  if (/Instagram/i.test(userAgent) || referrerHost.includes("instagram")) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent) || referrerHost.includes("facebook") || referrerHost === "fb.com") return "Facebook";
  if (referrerHost.includes("whatsapp")) return "WhatsApp";
  if (referrerHost.includes("google")) return "Google";
  if (referrerHost.includes("youtube")) return "YouTube";
  if (referrerHost.includes("bing") || referrerHost.includes("yahoo")) return "Other search";
  if (referrerHost) return referrerHost.replace(/^www\./, "").slice(0, 30);
  return "Direct / WhatsApp";
}

function getSource() {
  try {
    let source = window.sessionStorage.getItem(SOURCE_KEY);
    if (!source) {
      source = detectSource();
      window.sessionStorage.setItem(SOURCE_KEY, source);
    }
    return source;
  } catch {
    try {
      return detectSource();
    } catch {
      return "";
    }
  }
}

export function trackSite(event, productId, extra) {
  try {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    if (window.location.pathname.startsWith("/admin")) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;
    fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event,
        productId: productId || null,
        visitorId,
        source: getSource(),
        value: extra && Number.isFinite(Number(extra.value)) ? Number(extra.value) : null,
        path: window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
