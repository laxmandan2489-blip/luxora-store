/*
 * META PIXEL HELPERS
 * The Pixel base code itself is in index.html (id 2238820053352784).
 * These helpers send the shopping events Meta needs for ads:
 * PageView, ViewContent, AddToCart, InitiateCheckout and Purchase.
 *
 * Item ids MUST match the catalog feed (server.js -> catalogItemId):
 * the product id, or "<id>-<color>" for one color of a product that
 * has 2+ colors. That match is what lets catalog ads show each visitor
 * the exact bag they looked at.
 */

export function pixelItemId(product, color) {
  if (!product) return "";
  const colors = Array.isArray(product.colors) ? product.colors : [];
  if (colors.length < 2 || !color) return String(product.id);
  const slug = String(color).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${product.id}-${slug || "color"}`;
}

export function trackPixel(eventName, params, options) {
  try {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    if (options) window.fbq("track", eventName, params || {}, options);
    else if (params) window.fbq("track", eventName, params);
    else window.fbq("track", eventName);
  } catch {
    // Tracking must never break the shop.
  }
}

// Cart / checkout items -> Pixel "contents" list.
export function pixelContents(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: pixelItemId(item, item.selectedColor),
    quantity: Math.max(1, Number(item.quantity || 1)),
    item_price: Number(item.price || 0),
  }));
}
