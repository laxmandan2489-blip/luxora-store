import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import shrimohIcon from "./assets/shrimoh-icon-square.png";
import {
  BAG_CATEGORIES,
  ACCESSORY_CATEGORIES,
  PRODUCT_CATEGORIES,
  canonicalizeCategory,
  isBagCategory,
} from "./categories";

/*
 * LUX ICON SET
 * Header/menu icons (search, track order, wishlist, shopping bag) used
 * to mix plain text glyphs (⌕ ♥) with full-colour emoji (📦 🛍). Text
 * glyphs pick up the site's text color, but emoji render in their own
 * fixed OS colours no matter what CSS says - so on the header row two
 * icons looked like the elegant cream/gold/black brand and two looked
 * like generic colourful clip-art. This is one small line-art icon set
 * (single stroke, no fill by default) so every icon in the header and
 * mobile menu shares the exact same premium look.
 */
function LuxIcon({ name, size = 18, filled = false, style }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: { verticalAlign: "-4px", flexShrink: 0, ...style },
    "aria-hidden": true,
  };

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7.5" />
        <line x1="21" y1="21" x2="16.2" y2="16.2" />
      </svg>
    );
  }

  if (name === "box") {
    return (
      <svg {...common}>
        <path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5v-9Z" />
        <path d="M3 7.5 12 12l9-4.5" />
        <path d="M12 12v9" />
      </svg>
    );
  }

  if (name === "heart") {
    return (
      <svg {...common} fill={filled ? "currentColor" : "none"}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>
    );
  }

  if (name === "bag") {
    return (
      <svg {...common}>
        <path d="M6 8h12l1 12H5L6 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    );
  }

  /*
   * The four icons below (lock / refresh / badge-check / box) are used
   * together in the homepage "guarantee strip" (Secure Payments, Easy
   * Returns, Authentic & Handcrafted, Pan-India Shipping) - added so all
   * four share the exact same stroke style/weight instead of mixing
   * emoji (🔒📦) with text symbols (↺✦), which looked inconsistent.
   */
  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" />
      </svg>
    );
  }

  if (name === "badge-check") {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
        <path d="M9 12.3l2 2 4-4.5" />
      </svg>
    );
  }

  if (name === "chevron-down") {
    return (
      <svg {...common}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    );
  }

  /*
   * "chevron-right" / "chevron-left" - the mobile nav drawer's
   * "BAGS"/"ACCESSORIES" rows and their slide-in submenu's back
   * button (see the MOBILE NAV DRAWER section below).
   */
  if (name === "chevron-right") {
    return (
      <svg {...common}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    );
  }

  if (name === "chevron-left") {
    return (
      <svg {...common}>
        <path d="M15 6l-6 6 6 6" />
      </svg>
    );
  }

  /*
   * "arrow-right" / "arrow-left" - the plain, un-boxed prev/next row
   * arrows (New Arrivals, Bestsellers, category rows, Featured
   * Products, the Shop-by-Category slider). Replaced the old circular
   * bordered-button arrows with these per direct user feedback
   * comparing them to miramoss.com's minimal, borderless arrows - a
   * long shaft with a soft curved hook for the head, no chevron/circle.
   */
  if (name === "arrow-right") {
    return (
      <svg {...common}>
        <path d="M3 12h15" />
        <path d="M13 6c3.5 2 6 4 6 6s-2.5 4-6 6" />
      </svg>
    );
  }

  if (name === "arrow-left") {
    return (
      <svg {...common}>
        <path d="M21 12H6" />
        <path d="M11 6c-3.5 2-6 4-6 6s2.5 4 6 6" />
      </svg>
    );
  }

  /*
   * "home" and "menu" - originally added for the mobile bottom
   * navigation bar (Home / Search / Wishlist / Bag / Menu), which was
   * removed 2026-09-30 per direct user feedback. Left here unused
   * (same stroke set as everything above) in case a future icon need
   * comes up - harmless either way, nothing renders them right now.
   */
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10v9.5a.5.5 0 0 0 .5.5H10v-5a2 2 0 0 1 4 0v5h3.5a.5.5 0 0 0 .5-.5V10" />
      </svg>
    );
  }

  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 6.5h16" />
        <path d="M4 12h16" />
        <path d="M4 17.5h16" />
      </svg>
    );
  }

  /* "check" - used by the Add to Bag success toast. */
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }

  /*
   * "filter" / "sort" - used by the category/shop page's Filters and
   * Sort controls, restyled as a matched pair of plain bordered boxes
   * (miramoss.com reference: a simple sliders icon for Filters, a
   * up/down arrows icon for Sort, sitting to the right of each label).
   */
  if (name === "filter") {
    return (
      <svg {...common}>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "sort") {
    return (
      <svg {...common}>
        <path d="M7 4v16" />
        <path d="M4 7l3-3 3 3" />
        <path d="M17 20V4" />
        <path d="M20 17l-3 3-3-3" />
      </svg>
    );
  }

  return null;
}

/*
 * CATEGORY URL SLUGS
 * Turns a category name like "Ladies Bags" into a URL-safe
 * slug like "ladies-bags", so every category gets its own
 * real, shareable page at /category/ladies-bags instead of
 * everything living on one page behind a client-side filter.
 */
function slugifyCategory(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/*
 * PAGINATION NUMBER LIST
 * Builds a compact list like [1, 2, 3, "...", 9] for the listing
 * pagination bar - always shows page 1, the last page, and a small
 * window around the current page, collapsing everything else into a
 * single "..." instead of listing every page number (miramoss.com's
 * own collection pages use this same "1 2 3 ... 7" pattern).
 */
function getPaginationItems(current, total) {
  const items = [1];
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);

  if (windowStart > 2) items.push("...");
  for (let page = windowStart; page <= windowEnd; page += 1) items.push(page);
  if (windowEnd < total - 1) items.push("...");
  if (total > 1) items.push(total);

  return items;
}

/*
 * COLOR SWATCH -> CSS COLOR
 * Admin types color names as free text (e.g. "Rose Gold", "Camel"),
 * and most of those are not valid CSS color keywords. This maps the
 * common fashion/bag color names we expect to a real hex so the
 * swatch renders correctly, and falls back to a neutral grey (never
 * an invalid/blank CSS value) for anything not in the list - the
 * color's name is always shown as text next to the swatches too, so
 * the swatch itself is a visual aid, not the only source of truth.
 */
const COLOR_NAME_MAP = {
  black: "#111111",
  white: "#ffffff",
  ivory: "#fffff0",
  cream: "#f5f0e6",
  beige: "#e8dcc8",
  tan: "#d2b48c",
  camel: "#c19a6b",
  brown: "#6b4423",
  "dark brown": "#4a2c17",
  chocolate: "#3d2314",
  maroon: "#722f37",
  burgundy: "#6d1a2f",
  red: "#b3282d",
  pink: "#e8b4bc",
  "dusty rose": "#c48a92",
  "rose gold": "#b76e79",
  gold: "#c9a24b",
  mustard: "#c8a951",
  yellow: "#e8c547",
  orange: "#c46a2b",
  olive: "#6b6b3a",
  green: "#3f5d3a",
  "bottle green": "#254636",
  navy: "#1f2a44",
  blue: "#2f4d7a",
  grey: "#8a8a8a",
  gray: "#8a8a8a",
  charcoal: "#3a3a3a",
  silver: "#c0c0c0",
  purple: "#5b3a5e",
  lavender: "#9a8fc2",
  nude: "#dfc1a3"
};

function colorToCss(colorName) {
  const key = String(colorName || "").trim().toLowerCase();
  return COLOR_NAME_MAP[key] || "#b8b8b8";
}

/*
 * CATEGORY TAXONOMY
 * This is the same fixed category list used in the Admin panel's
 * "add/edit product" dropdown (src/Admin.jsx) - keeping one shared
 * list here means the storefront nav always shows every category
 * you can actually assign to a product, not just whichever
 * categories happen to have products in them right now.
 *
 * "All Bags" is NOT a real product category (you never assign a
 * product's category to "All Bags") - it's a storefront-only filter
 * that shows every product whose category is one of BAG_CATEGORIES
 * below. Add a new category to PRODUCT_CATEGORIES, and to
 * BAG_CATEGORIES too if it's a type of bag, and it will show up
 * everywhere automatically (nav, mobile menu, footer, "All Bags").
 */
/* Category list + old-name mapping now live in ./categories.js (shared
   with the admin panel). Only 6 main bag categories + Wallets/Accessories. */
const ALL_BAGS_LABEL = "All Bags";

/* Category page copy (miramoss.com style: "The Crossbody Edit" on the
   banner, then a short paragraph under the category name). */
const CATEGORY_PAGE_COPY = {
  Handbags: {
    edit: "The Handbag Edit",
    line: "Structured silhouettes for every day and every occasion.",
    description:
      "Polished, structured and easy to carry - our handbags move with you from the morning commute to dinner plans, with the details that make them feel quietly special.",
  },
  "Shoulder Bags": {
    edit: "The Shoulder Bag Edit",
    line: "Effortless shapes that sit beautifully on the shoulder.",
    description:
      "Soft curves, clean lines and just the right size - shoulder bags designed to be reached for every day and styled with everything.",
  },
  "Crossbody Bags": {
    edit: "The Crossbody Edit",
    line: "Beautifully designed crossbody bags for wherever life takes you.",
    description:
      "Chic, hands-free and versatile - our crossbody bags bring modern minimalism to city strolls, daily errands and weekend plans.",
  },
  "Tote Bags": {
    edit: "The Tote Edit",
    line: "Roomy, refined and ready for everything.",
    description:
      "From work days to weekend escapes, our totes carry it all - spacious inside, elegant outside, made for women who are always on the move.",
  },
  Backpacks: {
    edit: "The Backpack Edit",
    line: "Polished backpacks for days that go everywhere.",
    description:
      "Smart compartments, comfortable straps and a refined finish - backpacks that keep you organised without giving up on style.",
  },
  Clutches: {
    edit: "The Clutch Edit",
    line: "Small, striking and made for the evening.",
    description:
      "Statement clutches that finish every look - from festive evenings and weddings to dinners that call for something a little special.",
  },
  Wallets: {
    edit: "The Wallet Edit",
    line: "Slim essentials with a quietly luxurious finish.",
    description:
      "Thoughtfully organised wallets and card holders, made to match the bag you carry every day.",
  },
  Accessories: {
    edit: "The Accessories Edit",
    line: "The small details that complete your style.",
    description:
      "Finishing touches designed to pair beautifully with your SHRIMOH bag.",
  },
  [ALL_BAGS_LABEL]: {
    edit: "Bags for Every Moment",
    line: "Thoughtfully designed styles for work, weekends, travel and everything in between.",
    description:
      "Every SHRIMOH bag in one place - handbags, shoulder bags, crossbody bags, totes and more, each designed for everyday elegance.",
  },
  All: {
    edit: "The SHRIMOH Collection",
    line: "Every piece, thoughtfully designed for modern moments.",
    description:
      "Browse the full SHRIMOH collection - bags and accessories designed to feel considered, refined and made to be carried every day.",
  },
};

/* One short line under each homepage category banner (miramoss.com
   style: "Best-selling crossbody styles for modern women."). */
const CATEGORY_TAGLINES = {
  Handbags: "Structured everyday handbags, made to be carried with confidence.",
  "Shoulder Bags": "Timeless shoulder bag designs crafted for elegance.",
  "Crossbody Bags": "Hands-free crossbody styles for the modern woman.",
  "Tote Bags": "Roomy totes for work, weekends and everything in between.",
  Backpacks: "Polished backpacks that carry your day in style.",
  Clutches: "Evening clutches that finish every look.",
  Wallets: "Slim wallets with a quietly luxurious finish.",
  Accessories: "Small details that complete your style.",
};

/*
 * HEADER MEGA-MENU GROUPING
 * The header nav used to show every single category as one long flat
 * row of pills (10+ buttons) - it worked, but didn't look like a
 * premium store. Mira & Moss-style sites instead show a few broad
 * links (New / Bags / Accessories) and reveal the specific categories
 * in a small dropdown panel when you click one. These two lists just
 * decide which side of that split each category falls on - "Bags" gets
 * everything except the two truly non-bag categories below, so any new
 * category (fixed or typed straight into the admin panel) still shows
 * up somewhere automatically.
 */
const ACCESSORY_ONLY_CATEGORIES = ACCESSORY_CATEGORIES;

/* The announcement bar's real, existing claims - unchanged text, just
   now shown one at a time with rotation instead of all three at once. */
const ANNOUNCEMENT_MESSAGES = [
  "✦ FREE DELIVERY ON ALL ORDERS",
  "PREMIUM COLLECTION · SECURE SHOPPING",
  "HANDCRAFTED STYLE · MADE FOR YOU",
];

const API = "https://luxora-store-mkva.onrender.com";

/*
 * SUPPORT CONTACT DETAILS
 * Edit these two lines with your real details. WHATSAPP_NUMBER
 * must be in international format with country code and no
 * "+", spaces or dashes (India example: 91 followed by the
 * 10 digit mobile number) - this exact string is used to build
 * the wa.me link for the floating WhatsApp button.
 */
const SUPPORT_EMAIL = "infoshrimoh@gmail.com";
const WHATSAPP_NUMBER = "9461515979"; // TODO: replace with your real WhatsApp business number

/*
 * NEW CUSTOMER WELCOME POPUP
 * Shown once (per browser) to first-time visitors, offering a
 * discount code. Change the code/percentage text below to match
 * whatever coupon you actually create in Admin -> Coupons - this
 * popup is just the announcement, the real discount only works if
 * a coupon with this exact code exists and is active in the admin
 * panel's coupon list.
 */
const NEW_CUSTOMER_OFFER_CODE = "NEW15";
const NEW_CUSTOMER_OFFER_TEXT = "15% OFF";
const NEW_CUSTOMER_OFFER_SEEN_KEY = "shrimoh_seen_welcome_offer";

/*
 * TRUST / INFO PAGES
 * About, Contact, Shipping, Returns, Privacy and Terms are
 * shown as full-page overlays inside the app (no separate
 * routing setup needed) so customers can read them before
 * they buy without ever leaving the store.
 */
const INFO_PAGES = {
  about: {
    eyebrow: "OUR STORY",
    title: "About SHRIMOH",
    body: (
      <>
        <p>
          SHRIMOH was created with a simple idea: luxury doesn't need to shout. We design and
          curate pieces that quietly become part of your everyday life - thoughtful in
          construction, refined in detail, and made to last well beyond the first impression.
        </p>

        <h2 className="lux-info-subheading">Our Values</h2>

        <div className="lux-values-strip lux-info-values">
          <div>
            <span>✎</span>
            <strong>HANDCRAFTED</strong>
            <p>Every piece checked before it ships.</p>
          </div>

          <div>
            <span>✦</span>
            <strong>SECURE PAYMENTS</strong>
            <p>100% safe checkout via Razorpay.</p>
          </div>

          <div>
            <span>↺</span>
            <strong>EASY 7-DAY RETURNS</strong>
            <p>Not the right fit? Send it back, hassle-free.</p>
          </div>

          <div>
            <span>✧</span>
            <strong>PAN-INDIA SHIPPING</strong>
            <p>Delivered safely, wherever you are.</p>
          </div>
        </div>

        <h2 className="lux-info-subheading">Our Mission</h2>

        <p>
          Our mission is simple: create stylish, thoughtfully-made pieces that make you feel good
          about what you carry. We believe good design should be accessible, not exclusive - and
          every product is checked before it ships, not mass-produced without care.
        </p>

        <p>
          We're a small, growing team and every order matters to us. If you ever have a question
          about a product, your order, or just want to say hello, our support team is genuinely
          happy to help - reach out any time through our Contact page.
        </p>
      </>
    ),
  },
  contact: {
    eyebrow: "GET IN TOUCH",
    title: "Contact Us",
    body: (
      <>
        <p>
          We'd love to hear from you. Whether it's a question about a product, help with an
          order, or just feedback on your experience - here's how to reach us.
        </p>
        <div className="lux-info-contact-grid">
          <div>
            <span>EMAIL</span>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
          <div>
            <span>WHATSAPP</span>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
            >
              Chat with us
            </a>
          </div>
          <div>
            <span>SUPPORT HOURS</span>
            <p>Monday - Saturday, 10:00 AM - 6:00 PM IST</p>
          </div>
        </div>
        <p>We typically reply within 24 hours on business days.</p>
      </>
    ),
  },
  shipping: {
    eyebrow: "SHIPPING",
    title: "Shipping Policy",
    body: (
      <>
        <p>
          Orders are processed within 1-3 business days of payment confirmation. Once shipped,
          delivery across India typically takes 5-9 business days depending on your location.
        </p>
        <p>
          <strong>Free delivery</strong> is available on all orders, with no minimum order value.
        </p>
        <p>
          You will receive your order confirmation and shipping updates over email. Delivery
          timelines may be slightly longer during sale periods, festive seasons, or due to
          courier delays outside our control - we'll keep you posted if this happens.
        </p>
        <p>
          For any shipping question, write to us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number.
        </p>
      </>
    ),
  },
  returns: {
    eyebrow: "RETURNS",
    title: "Returns & Exchange Policy",
    body: (
      <>
        <p>
          We want you to love what you ordered. If something isn't right, you can request a
          return or exchange within <strong>7 days</strong> of delivery.
        </p>
        <p>
          To be eligible, the item must be unused, in its original packaging, with all tags
          intact. Items that show signs of use, damage caused after delivery, or are missing
          original packaging may not qualify for a return.
        </p>
        <p>
          To start a return or exchange, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number and a
          photo of the item. Once approved, we'll share pickup/return instructions.
        </p>
        <p>
          Refunds are processed to your original payment method within 5-7 business days after
          we receive and inspect the returned item.
        </p>
      </>
    ),
  },
  privacy: {
    eyebrow: "PRIVACY",
    title: "Privacy Policy",
    body: (
      <>
        <p>
          We collect only the information needed to process and deliver your order: your name,
          mobile number, email address, and delivery address. This information is used solely for
          order processing, delivery, payment verification, and customer support.
        </p>
        <p>
          Payments are processed securely through Razorpay. We do not store your card, UPI, or
          banking details on our servers at any point.
        </p>
        <p>
          Your cart and wishlist are stored locally in your own browser for convenience and are
          never shared with anyone. We do not sell or rent your personal information to third
          parties. Your details are shared only with the delivery and payment partners strictly
          necessary to fulfil your order.
        </p>
        <p>
          If you have any questions about how your data is handled, write to us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </>
    ),
  },
  terms: {
    eyebrow: "LEGAL",
    title: "Terms & Conditions",
    body: (
      <>
        <p>
          By using the SHRIMOH website and placing an order, you agree to the following terms.
          We make every effort to display product information, images, and pricing accurately,
          but errors may occasionally occur - in such cases we reserve the right to correct
          pricing or cancel an affected order, with a full refund.
        </p>
        <p>
          All orders are subject to acceptance and product availability. Prices are listed in
          Indian Rupees (₹) and are inclusive of applicable taxes unless stated otherwise.
        </p>
        <p>
          Payments are accepted via UPI, credit/debit cards, and net banking through our secure
          payment partner, Razorpay.
        </p>
        <p>
          All content on this website - including the SHRIMOH name, logo, product photography, and
          descriptions - is the property of SHRIMOH and may not be reproduced without permission.
        </p>
        <p>
          These terms are governed by the laws of India. For any queries regarding these terms,
          contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </>
    ),
  },
};

/*
 * IMAGE SPEED FIX
 * Product photos (especially Gemini-generated ones) often arrive as
 * huge, uncompressed multi-MB PNGs from an external host (imgbb) - that
 * raw file size, not anything in our own code, is what makes the site
 * feel slow/"dhire dhire khulti hai". Instead of asking every future
 * photo to be manually compressed before upload, every externally-hosted
 * photo is routed through images.weserv.nl (a free, public image proxy/
 * CDN) which resizes it to a sensible max width and re-encodes it as
 * WebP on the fly - typically shrinking a 2-4MB PNG down to well under
 * 200KB with no visible quality loss, and its own CDN caches the result
 * so repeat visits are instant. This needs no new backend dependency and
 * applies automatically to every photo already in the database, past and
 * future - nothing else has to change.
 */
/*
 * width defaults to 1000 (full product-page gallery size). Grid/card
 * thumbnails never actually render that big on screen (a grid card is
 * a few hundred px wide at most) so they now ask weserv.nl for a
 * smaller image instead (see THUMB_IMAGE_WIDTH below) - a noticeably
 * smaller file downloads and decodes faster, which is most of what
 * made photos feel slow to appear on the shop grid and product cards.
 */
function getImageUrl(image, width = 1000) {
  if (!image) return "";

  if (image.startsWith("data:")) {
    return image;
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    const withoutProtocol = image.replace(/^https?:\/\//, "");
    return `https://images.weserv.nl/?url=${encodeURIComponent(withoutProtocol)}&w=${width}&q=78&output=webp`;
  }

  return `${API}${image.startsWith("/") ? "" : "/"}${image}`;
}

const THUMB_IMAGE_WIDTH = 480;

/*
 * If the weserv.nl compression proxy above ever fails to fetch/serve a
 * photo (rare, but it's a third-party service), fall back to the
 * original un-compressed URL once before giving up and dimming the
 * image - so a proxy hiccup never means a customer sees a broken photo.
 */
function handleImageFallback(event) {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied) {
    img.style.opacity = "0.25";
    return;
  }
  img.dataset.fallbackApplied = "1";
  try {
    const url = new URL(img.src);
    if (url.hostname === "images.weserv.nl") {
      const original = url.searchParams.get("url");
      if (original) {
        img.src = original.startsWith("http") ? original : `https://${original}`;
        return;
      }
    }
  } catch {
    /* fall through to dimming below */
  }
  img.style.opacity = "0.25";
}

/*
 * INSTANT-LOAD CACHE (2026-10-02)
 * The backend runs on Render's free plan, which "sleeps" after ~15 min
 * with no visitors - the next visitor then waits 30-60 seconds while it
 * wakes up, and until now the whole homepage (products, Shop by
 * Category, hero photos) stayed empty/skeleton for that entire wait.
 * That was the main "website bahut time leti hai, phir dhire dhire
 * product dikhati hai" problem.
 *
 * Fix: the last successful API response is saved in this browser
 * (localStorage). On the next visit the page renders immediately from
 * that saved copy, and the fresh data is still fetched in the
 * background and swapped in the moment it arrives - so prices/stock
 * are never stuck stale, they just stop blocking the first paint.
 * Saved copies older than CACHE_MAX_AGE_MS are ignored. Every
 * read/write is wrapped in try/catch (private mode, full storage etc.)
 * and simply falls back to the old behaviour.
 */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    const raw = JSON.stringify({ savedAt: Date.now(), data });
    // Skip absurdly large payloads (e.g. base64 photos) instead of
    // filling up the browser's ~5MB storage quota.
    if (raw.length > 3_500_000) return;
    window.localStorage.setItem(key, raw);
  } catch {
    /* storage unavailable or full - just skip caching */
  }
}

const PRODUCTS_CACHE_KEY = "shrimoh_cache_products_v1";
const BESTSELLERS_CACHE_KEY = "shrimoh_cache_bestsellers_v1";
const SITE_SETTINGS_CACHE_KEY = "shrimoh_cache_site_settings_v1";

/* Hero / brand-story photos are owner-uploaded full-size files - route
   them through the same weserv.nl compressor as product photos, at a
   larger width suited to a full-width banner. */
const BANNER_IMAGE_WIDTH = 1600;

function normalizeProduct(product) {
  return {
    ...product,
    // Old/extra category names ("Bags", "Shoulder Bags & Totes",
    // "Sling Bags", ...) are shown under one of the main categories -
    // see ./categories.js.
    category: canonicalizeCategory(product.category, product.name),
    price: Number(product.price || 0),
    oldPrice: Number(product.oldPrice || 0),
    stock: Number(product.stock || 0),
  };
}

function App() {
  /* =========================================================
     PRODUCTS
  ========================================================= */

  // Start from this browser's saved copy (see INSTANT-LOAD CACHE above)
  // so a returning visitor sees products immediately, even while the
  // backend is still waking up.
  const [products, setProducts] = useState(() => {
    const cached = readCache(PRODUCTS_CACHE_KEY);
    return Array.isArray(cached) ? cached.map(normalizeProduct) : [];
  });
  const [loadingProducts, setLoadingProducts] = useState(() => {
    const cached = readCache(PRODUCTS_CACHE_KEY);
    return !(Array.isArray(cached) && cached.length > 0);
  });
  const [apiError, setApiError] = useState("");

  /* =========================================================
     NAVIGATION
  ========================================================= */

  const location = useLocation();
  const navigate = useNavigate();

  /*
   * The selected category now lives in the URL (/category/:slug)
   * instead of only in memory, so every category is a real,
   * shareable, back/forward-friendly page. "goToCategory" is the
   * single place that changes it - everywhere in this file that
   * used to call setSelectedCategory(...) now calls this instead.
   */
  const categorySlugFromUrl = location.pathname.startsWith("/category/")
    ? decodeURIComponent(location.pathname.replace("/category/", "").split("/")[0])
    : null;

  /*
   * SHOP ALL PAGE (/shop)
   * A real, dedicated "every product" page - separate from the
   * homepage. Mira & Moss's homepage never shows the full catalog
   * inline; it only ever shows a few curated rows with "View All"
   * links, and the full grid lives on its own page. selectedCategory
   * still resolves to "All" here (no /category/ prefix), so all the
   * existing "All" filtering logic below just works unchanged - this
   * flag only controls which JSX renders (homepage teasers vs the
   * full listing).
   */
  const isShopAllPage = location.pathname === "/shop";

  /*
   * TRACK ORDER PAGE
   * A real, full page at its own URL (/track-order) instead of a
   * small popup/modal - this is what makes it feel like a page on
   * a proper e-commerce site rather than a cramped overlay, and it
   * also completely sidesteps any stacking/overlap with other
   * on-page popups (e.g. the welcome offer).
   */
  const isTrackOrderPage = location.pathname === "/track-order" || location.pathname.startsWith("/track-order/");

  /*
   * PRODUCT DETAIL PAGE
   * A real, full page at its own URL (/product/:id) instead of a
   * popup/modal - this is what makes a product feel like an actual
   * page on the site (shareable link, works with back/forward)
   * rather than an overlay. "openProduct" navigates here instead of
   * setting local state, and "selectedProduct" below is derived
   * straight from this URL id.
   */
  const productIdFromUrl = location.pathname.startsWith("/product/")
    ? decodeURIComponent(location.pathname.replace("/product/", "").split("/")[0])
    : null;
  const isProductPage = Boolean(productIdFromUrl);

  /*
   * SELECTED COLOR - ALSO LIVES IN THE URL (?color=)
   * Same idea as the product id above: picking a color is now a real
   * navigation (/product/:id?color=Black), not just local state. That's
   * what makes it feel like its own page - the browser's Back button
   * steps back to the previous color/photos, the link is shareable at
   * that exact color, and it plugs into the same "scroll to top on a
   * new page" behaviour product-opening already has - without it being
   * a whole different route/layout the way opening a product from the
   * grid is.
   */
  const colorFromUrlRaw = new URLSearchParams(location.search).get("color");
  const colorFromUrl = colorFromUrlRaw ? decodeURIComponent(colorFromUrlRaw) : null;

  /*
   * ADD-TO-BAG SUCCESS TOAST - a small, auto-dismissing confirmation
   * shown from the single addToCart() function below, so every
   * add-to-cart path (grid card, quick view, product page) gets the
   * same real confirmation instead of no feedback at all.
   */
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeoutRef = useRef(null);

  function showToast(message) {
    setToastMessage(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(""), 2500);
  }

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  /* ANNOUNCEMENT BAR rotation - see ANNOUNCEMENT_MESSAGES above. */
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [announcementPaused, setAnnouncementPaused] = useState(false);

  useEffect(() => {
    if (ANNOUNCEMENT_MESSAGES.length < 2 || announcementPaused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timer = window.setInterval(() => {
      setAnnouncementIndex((current) => (current + 1) % ANNOUNCEMENT_MESSAGES.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [announcementPaused]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  /*
   * LISTING FILTERS (price range + color) - shown on the shop/category
   * grid, inspired by miramoss.com's collection-page sidebar. Empty
   * values/array mean "no filter applied".
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [colorFilter, setColorFilter] = useState([]);

  function toggleColorFilter(color) {
    setColorFilter((previous) =>
      previous.includes(color) ? previous.filter((c) => c !== color) : [...previous, color]
    );
  }

  function clearListingFilters() {
    setPriceMin("");
    setPriceMax("");
    setColorFilter([]);
  }

  const listingFilterCount =
    (priceMin !== "" ? 1 : 0) + (priceMax !== "" ? 1 : 0) + colorFilter.length;

  /*
   * PER-CARD COLOR PICKER (product grid)
   * Lets a customer pick a color right on the grid card, same as
   * miramoss.com's listing cards - the card's photo/name switch to
   * that color without opening the full product page. Keyed by
   * product id since many cards render at once. Falls back to that
   * product's first color when nothing's been picked yet.
   */
  const [cardColorSelection, setCardColorSelection] = useState({});

  function getCardColor(product) {
    const colors = Array.isArray(product?.colors) ? product.colors : [];
    const chosen = cardColorSelection[product?.id];
    if (chosen) {
      const match = colors.find((c) => c.toLowerCase() === chosen.toLowerCase());
      if (match) return match;
    }
    return colors[0] || "";
  }

  function setCardColor(product, color, event) {
    if (event) event.stopPropagation();
    setCardColorSelection((previous) => ({ ...previous, [product.id]: color }));
  }

  /*
   * QUICK VIEW MODAL (main shop grid only)
   * A lightweight preview popup - photo, name, price, color swatches,
   * Add to Cart - so a customer can decide without leaving the grid,
   * same idea as miramoss.com's "Quick View". "View full details"
   * inside it still goes to the real /product/:id page for everything
   * else (description, gallery, trust badges, etc).
   */
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [quickViewColor, setQuickViewColor] = useState("");
  const [quickViewQuantity, setQuickViewQuantity] = useState(1);

  function openQuickView(product, event) {
    if (event) event.stopPropagation();
    if (!product) return;
    setQuickViewProduct(product);
    setQuickViewColor(getCardColor(product));
    setQuickViewQuantity(1);
    document.body.style.overflow = "hidden";
  }

  function closeQuickView() {
    setQuickViewProduct(null);
    document.body.style.overflow = "";
  }

  function addToCartFromQuickView() {
    if (!quickViewProduct) return;
    addToCart(quickViewProduct, quickViewQuantity, quickViewColor);
    setCartOpen(true);
    closeQuickView();
  }

  /*
   * MOBILE NAV
   * The "☰" button in the header only makes sense on mobile
   * (where the full category nav is hidden by CSS). It opens
   * this slide-in drawer so mobile customers can still reach
   * every category, the wishlist and the bag - previously this
   * button had no handler at all and did nothing when tapped.
   */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /*
   * MOBILE NAV - "BAGS" / "ACCESSORIES" SLIDE-IN SUBMENU
   * null | "bags" | "accessories" - mirrors miramoss.com's mobile
   * menu, where tapping a top-level group slides in a second screen
   * listing that group's actual categories instead of navigating
   * away immediately. Reset whenever the drawer itself closes so it
   * doesn't reopen mid-panel next time.
   */
  const [mobileNavPanel, setMobileNavPanel] = useState(null);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setMobileNavPanel(null);
    document.body.style.overflow = "";
  }

  /*
   * DESKTOP HEADER MEGA-MENU
   * "bags" | "accessories" | null - which dropdown panel (if any) is
   * currently open under the header nav. Closes itself on an outside
   * click, same as a normal site nav.
   */
  const [openMegaMenu, setOpenMegaMenu] = useState(null);

  useEffect(() => {
    if (!openMegaMenu) return;

    function handleOutsideClick(event) {
      if (!event.target.closest?.(".lux-nav-item")) {
        setOpenMegaMenu(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openMegaMenu]);

  /* =========================================================
     NEW CUSTOMER WELCOME OFFER
     A small corner popup shown once per browser to first-time
     visitors (checked via localStorage, so returning customers
     don't see it again). Purely a client-side announcement - the
     actual discount is whatever coupon code matches
     NEW_CUSTOMER_OFFER_CODE in Admin -> Coupons.
  ========================================================= */

  const [showWelcomeOffer, setShowWelcomeOffer] = useState(false);

  useEffect(() => {
    let alreadySeen = true;

    try {
      alreadySeen = window.localStorage.getItem(NEW_CUSTOMER_OFFER_SEEN_KEY) === "1";
    } catch {
      alreadySeen = true;
    }

    if (alreadySeen) return;

    const timer = setTimeout(() => setShowWelcomeOffer(true), 1500);

    return () => clearTimeout(timer);
  }, []);

  function dismissWelcomeOffer() {
    setShowWelcomeOffer(false);

    try {
      window.localStorage.setItem(NEW_CUSTOMER_OFFER_SEEN_KEY, "1");
    } catch {
      /* localStorage unavailable - safe to ignore, popup just won't persist as dismissed */
    }
  }

  /* =========================================================
     INFO / TRUST PAGES
     (About, Contact, Shipping, Returns, Privacy, Terms)
  ========================================================= */

  const [activePage, setActivePage] = useState(null);

  function openInfoPage(page) {
    setActivePage(page);
    document.body.style.overflow = "hidden";
  }

  function closeInfoPage() {
    setActivePage(null);
    document.body.style.overflow = "";
  }

  /* =========================================================
     PRODUCT DETAIL
  ========================================================= */

  /*
   * selectedProduct is now derived straight from the URL
   * (/product/:id) instead of being its own piece of state - the
   * page you land on IS the product, so there's nothing to set.
   */
  const selectedProduct = isProductPage
    ? products.find((product) => String(product.id) === String(productIdFromUrl)) || null
    : null;
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [detailQuantity, setDetailQuantity] = useState(1);
  /*
   * detailColor is derived from the URL's ?color= (see colorFromUrl
   * above), not its own state - so a color pick is a real navigation.
   * Falls back to the product's first color when the URL has none, or
   * has one that doesn't match this product's colors.
   */
  const detailColorList = Array.isArray(selectedProduct?.colors) ? selectedProduct.colors : [];
  const detailColor = selectedProduct
    ? (colorFromUrl &&
        detailColorList.find((c) => c.toLowerCase() === colorFromUrl.toLowerCase())) ||
      detailColorList[0] ||
      ""
    : "";
  const [touchStartX, setTouchStartX] = useState(null);

  /* =========================================================
     CART
  ========================================================= */

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* =========================================================
     WISHLIST
     Client-side only (no customer login exists in this app),
     so the wishlist is stored as an array of product IDs in
     localStorage under "shrimoh_wishlist". It survives page
     refreshes on the same device/browser.
  ========================================================= */

  const [wishlist, setWishlist] = useState(() => {
    try {
      const stored = window.localStorage.getItem("shrimoh_wishlist");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  });

  const [wishlistOpen, setWishlistOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("shrimoh_wishlist", JSON.stringify(wishlist));
    } catch {
      /* ignore storage errors (private browsing, quota, etc.) */
    }
  }, [wishlist]);

  function isWishlisted(productId) {
    return wishlist.includes(Number(productId));
  }

  function toggleWishlist(product, event) {
    if (event) event.stopPropagation();

    if (!product) return;

    const id = Number(product.id);

    setWishlist((previous) =>
      previous.includes(id)
        ? previous.filter((itemId) => itemId !== id)
        : [...previous, id]
    );
  }

  function removeFromWishlist(productId) {
    const id = Number(productId);

    setWishlist((previous) => previous.filter((itemId) => itemId !== id));
  }

  const wishlistItems = useMemo(() => {
    return wishlist
      .map((id) => products.find((product) => Number(product.id) === Number(id)))
      .filter(Boolean);
  }, [wishlist, products]);

  function moveWishlistItemToCart(product) {
    addToCart(product, 1);
    removeFromWishlist(product.id);
  }

  /* =========================================================
     BESTSELLERS
     Real sales-based ranking from the backend (not fake data).
  ========================================================= */

  const [bestsellers, setBestsellers] = useState(() => {
    const cached = readCache(BESTSELLERS_CACHE_KEY);
    return Array.isArray(cached) ? cached.map(normalizeProduct) : [];
  });

  useEffect(() => {
    async function loadBestsellers() {
      try {
        const response = await fetch(`${API}/api/bestsellers?limit=8`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setBestsellers(data.products.map(normalizeProduct));
          writeCache(BESTSELLERS_CACHE_KEY, data.products);
        }
      } catch (error) {
        console.error("Bestsellers load error:", error);
      }
    }

    loadBestsellers();
  }, []);

  /* =========================================================
     SITE SETTINGS (owner-uploaded hero + brand-story images)
     Comes from Admin -> Site Content. Both fall back to the old
     look (a product photo / a plain monogram) until the owner
     uploads something, so nothing changes for anyone until they
     actually add images.
  ========================================================= */

  /*
   * heroImages is an ARRAY now (used to be a single heroImageUrl) so
   * the hero banner can rotate through 3-5 owner-uploaded photos like
   * miramoss.com's homepage does, instead of showing just one static
   * image. Backend still tolerates the old single-image shape (see
   * loadSiteSettings below), so this keeps working even before the
   * owner re-saves Site Content with multiple photos.
   */
  /* Hero + brand-story photos: start from this browser's saved copy
     (INSTANT-LOAD CACHE) and compress through weserv.nl at banner size
     (BANNER_IMAGE_WIDTH) instead of downloading the owner's original
     multi-MB uploads. */
  const extractSiteImages = (settings) => {
    if (!settings) return { hero: [], story: "" };
    const raw = Array.isArray(settings.heroImageUrls)
      ? settings.heroImageUrls.filter(Boolean)
      : settings.heroImageUrl
      ? [settings.heroImageUrl]
      : [];
    return {
      hero: raw.map((image) => getImageUrl(image, BANNER_IMAGE_WIDTH)),
      story: settings.brandStoryImageUrl
        ? getImageUrl(settings.brandStoryImageUrl, BANNER_IMAGE_WIDTH)
        : "",
    };
  };

  const [heroImages, setHeroImages] = useState(
    () => extractSiteImages(readCache(SITE_SETTINGS_CACHE_KEY)).hero
  );
  const [brandStoryImageUrl, setBrandStoryImageUrl] = useState(
    () => extractSiteImages(readCache(SITE_SETTINGS_CACHE_KEY)).story
  );
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);

  useEffect(() => {
    async function loadSiteSettings() {
      try {
        const response = await fetch(`${API}/api/site-settings`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.success && data.settings) {
          const { hero, story } = extractSiteImages(data.settings);
          setHeroImages(hero);
          setBrandStoryImageUrl(story);
          writeCache(SITE_SETTINGS_CACHE_KEY, data.settings);
        }
      } catch (error) {
        console.error("Site settings load error:", error);
      }
    }

    loadSiteSettings();
  }, []);

  /*
   * Auto-rotate the hero banner every 5 seconds when there's more than
   * one photo to show - same idea as miramoss.com's homepage banner.
   * A single photo (or none) never starts this timer. Pauses while a
   * finger/mouse is on the hero (heroPaused, set by hover/touch
   * handlers below) and stays off entirely for prefers-reduced-motion,
   * same as every other animation on the site - the dots/arrows still
   * work fine either way, this only controls the automatic rotation.
   */
  const [heroPaused, setHeroPaused] = useState(false);

  useEffect(() => {
    if (heroImages.length < 2 || heroPaused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timer = window.setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [heroImages.length, heroPaused]);

  function goToHeroSlide(direction) {
    if (heroImages.length < 2) return;
    setActiveHeroSlide((current) => (current + direction + heroImages.length) % heroImages.length);
  }

  /* Swipe support (mobile) - a plain touchstart/touchend delta on the
     hero image area, no library needed for a single left/right swipe. */
  const heroTouchStartX = useRef(null);

  function handleHeroTouchStart(event) {
    heroTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleHeroTouchEnd(event) {
    if (heroTouchStartX.current === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? heroTouchStartX.current) - heroTouchStartX.current;
    heroTouchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    goToHeroSlide(deltaX < 0 ? 1 : -1);
  }

  /*
   * HERO SLIDE COPY - a small set of taglines that cycle per slide
   * (by index, wrapping) when there's more than one hero photo. Slide
   * 0's copy is exactly the site's existing approved hero copy
   * unchanged. With 0-1 hero photos the old single fixed heading is
   * used as-is below, so a store with just one banner photo sees no
   * change at all.
   */
  const HERO_SLIDE_COPY = [
    {
      lines: ["Carry Your", "Everyday Elegance."],
      text: "Curated bags designed for the woman who carries confidence everywhere.",
      primaryLabel: "Discover Products",
      primaryTarget: "lux-new-arrivals",
    },
    {
      lines: ["Structured Shapes.", "Quiet Luxury."],
      text: "Refined silhouettes designed for everyday elegance, from desk to dinner.",
      primaryLabel: "Shop Bestsellers",
      primaryTarget: "lux-bestsellers",
    },
    {
      lines: ["Details That", "Feel Considered."],
      text: "Thoughtful hardware and honest materials, made to be carried every day.",
      primaryLabel: "Explore Collections",
      primaryTarget: "lux-shop-by-category",
    },
  ];

  const activeHeroCopy = HERO_SLIDE_COPY[activeHeroSlide % HERO_SLIDE_COPY.length];

  const newArrivals = useMemo(() => products.slice(0, 8), [products]);

  /*
   * BUY NOW FIX:
   *
   * "Buy Now" used to overwrite the entire cart with a single
   * product, which permanently deleted whatever the customer
   * already had in their bag.
   *
   * Instead, a Buy Now purchase is kept completely separate
   * from the persistent cart in this "directBuyItem" state.
   * When it is set, checkout uses ONLY this item. The real
   * cart is never touched. When checkout is closed/cancelled,
   * or the order completes, this is cleared and the customer's
   * cart is exactly as it was before they clicked Buy Now.
   */
  const [directBuyItem, setDirectBuyItem] = useState(null);

  /* =========================================================
     CHECKOUT
  ========================================================= */

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderReference, setOrderReference] = useState("");

  /*
   * "REMEMBER MY DETAILS" - free, no-backend version of the
   * OTP-autofill checkout the owner asked about (GoKwik/Razorpay
   * Magic Checkout). Those services can recognise a phone number
   * that has NEVER shopped here before because they share one big
   * database of customers across many stores - something we don't
   * have and can't safely fake (looking up a stranger's saved
   * address just from a phone number they type in, with no
   * verification, would leak past customers' name/address to
   * anyone who tries their number - a real privacy risk).
   *
   * What we CAN do for free, safely: after someone successfully
   * places an order on THIS device/browser, remember their name +
   * address in this browser only (localStorage). Next time they
   * open checkout on the same device, the form is already filled
   * in - still fully editable - instead of starting blank. This
   * covers the very common case of a repeat customer ordering again
   * from their own phone/laptop, without exposing anyone else's data.
   */
  const SAVED_CUSTOMER_KEY = "shrimoh_saved_customer";

  function loadSavedCustomer() {
    try {
      const raw = window.localStorage.getItem(SAVED_CUSTOMER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        name: parsed.name || "",
        mobile: parsed.mobile || "",
        email: parsed.email || "",
        address: parsed.address || "",
        city: parsed.city || "",
        state: parsed.state || "",
        pincode: parsed.pincode || "",
      };
    } catch {
      // localStorage can be unavailable (private browsing, blocked
      // storage, etc.) - just fall back to a blank form, same as before.
      return null;
    }
  }

  const [customer, setCustomer] = useState(
    () =>
      loadSavedCustomer() || {
        name: "",
        mobile: "",
        email: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
      }
  );

  // True only when the form above was pre-filled from a remembered
  // order on this device - drives the small "saved from your last
  // order" note in the checkout form, and clears the moment the
  // customer edits anything themselves.
  const [customerAutofilled, setCustomerAutofilled] = useState(() => Boolean(loadSavedCustomer()));

  /* =========================================================
     COUPON
     The discount amount is always whatever the backend's
     /api/coupons/validate endpoint returns for the current
     cart - the frontend never calculates a discount itself.
     The final, real discount is recalculated again server-side
     when the order is actually created, so this is only a
     preview.
  ========================================================= */

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discountAmount }
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  /* =========================================================
     NEWSLETTER
     Posts to the real /api/newsletter endpoint (Supabase
     "newsletter_subscribers" table) - no fake "subscribed!"
     confirmation without an actual write happening.
  ========================================================= */

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState("idle"); // idle | loading | success | error
  const [newsletterMessage, setNewsletterMessage] = useState("");

  async function submitNewsletter(event) {
    event.preventDefault();
    const email = newsletterEmail.trim();

    if (!email) {
      setNewsletterStatus("error");
      setNewsletterMessage("Please enter your email address.");
      return;
    }

    setNewsletterStatus("loading");
    setNewsletterMessage("");

    try {
      const response = await fetch(`${API}/api/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to subscribe right now.");
      }

      setNewsletterStatus("success");
      setNewsletterMessage("You're on the list. Welcome to SHRIMOH.");
      setNewsletterEmail("");
    } catch (error) {
      setNewsletterStatus("error");
      setNewsletterMessage(error.message || "Unable to subscribe right now. Please try again.");
    }
  }

  /* =========================================================
     ORDER TRACKING
     Customer-facing "where is my order" lookup - independent of
     admin login. Needs the order reference + the mobile/email used
     at checkout (enforced server-side in /api/track-order).
  ========================================================= */

  const [trackReference, setTrackReference] = useState("");
  const [trackContact, setTrackContact] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackResult, setTrackResult] = useState(null); // { order, customerName, statusHistory }

  function resetTrackSearch() {
    setTrackResult(null);
    setTrackError("");
  }

  async function lookupOrder(event) {
    if (event) event.preventDefault();
    const reference = trackReference.trim();
    const contact = trackContact.trim();

    if (!reference) {
      setTrackError("Please enter your order reference (e.g. LUX-...).");
      return;
    }
    if (!contact) {
      setTrackError("Please enter the mobile number or email used for this order.");
      return;
    }

    setTrackLoading(true);
    setTrackError("");
    setTrackResult(null);

    try {
      const params = new URLSearchParams({ reference });
      if (/^[0-9+\-\s()]{6,}$/.test(contact) && /\d{7,}/.test(contact.replace(/\D/g, ""))) {
        params.set("mobile", contact);
      } else {
        params.set("email", contact);
      }

      const response = await fetch(`${API}/api/track-order?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setTrackError(data.message || "No order found for those details.");
        return;
      }

      setTrackResult({
        order: data.order,
        customerName: data.customerName || "",
        statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
      });
    } catch (err) {
      console.error("TRACK ORDER ERROR:", err);
      setTrackError("Unable to look up this order right now. Please try again shortly.");
    } finally {
      setTrackLoading(false);
    }
  }

  /* =========================================================
     LOAD PRODUCTS
  ========================================================= */

  useEffect(() => {
    async function loadProducts() {
      const hadCachedProducts = Array.isArray(readCache(PRODUCTS_CACHE_KEY));

      try {
        setApiError("");

        const response = await fetch(`${API}/api/products`);

        if (!response.ok) {
          throw new Error("Unable to load products");
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products.map(normalizeProduct));
          writeCache(PRODUCTS_CACHE_KEY, data.products);
        } else {
          setProducts([]);
        }
      } catch (error) {
        console.error(error);

        // If we're already showing this browser's saved copy, keep it
        // quietly instead of flashing an error over a working page.
        if (!hadCachedProducts) {
          setApiError(
            "Products could not be loaded. Please make sure the backend server is running."
          );
        }
      } finally {
        setLoadingProducts(false);
      }
    }

    loadProducts();
  }, []);

  /* =========================================================
     CATEGORIES
  ========================================================= */

  const categories = useMemo(() => {
    /*
     * Fixed taxonomy first (so every category shows up in the nav
     * even before any product exists in it), then any category a
     * product actually uses that isn't in the fixed list (so
     * nothing typed directly into the admin panel gets hidden).
     */
    const values = products.map((product) => product.category).filter(Boolean);
    const extra = Array.from(new Set(values)).filter(
      (value) => !PRODUCT_CATEGORIES.includes(value)
    );

    return ["All", ALL_BAGS_LABEL, ...PRODUCT_CATEGORIES, ...extra];
  }, [products]);

  const selectedCategory = useMemo(() => {
    if (!categorySlugFromUrl) return "All";

    const match = categories.find(
      (category) => slugifyCategory(category) === categorySlugFromUrl
    );
    if (match) return match;

    // Old links (e.g. /category/bags, /category/sling-bags,
    // /category/shoulder-bags-totes) still land somewhere sensible.
    if (categorySlugFromUrl === "bags") return ALL_BAGS_LABEL;
    const words = categorySlugFromUrl.replace(/-/g, " ");
    if (/shoulder/.test(words) && /tote/.test(words)) return ALL_BAGS_LABEL;
    return canonicalizeCategory(words);
  }, [categorySlugFromUrl, categories]);

  function goToCategory(category) {
    if (!category || category === "All") {
      navigate("/");
    } else {
      navigate(`/category/${slugifyCategory(category)}`);
    }
    setOpenMegaMenu(null);
  }

  /*
   * "SHOP ALL" now goes to the dedicated /shop page (the full catalog,
   * with filters/sort) instead of the homepage - see isShopAllPage
   * above for why.
   */
  function goToShopAll() {
    navigate("/shop");
    setOpenMegaMenu(null);
  }

  /* Same as goToShopAll, but also pre-sets the sort dropdown - used by
     a homepage row's "View All" link (e.g. Bestsellers -> shows the
     full shop already sorted "Best Selling") so the destination page
     actually matches what the row promised. */
  function goToShopAllSorted(sortValue) {
    if (sortValue) setSortBy(sortValue);
    goToShopAll();
  }

  /* Scrolls a horizontally-scrolling product row (New Arrivals,
     Bestsellers, category teaser rows) by ~80% of its own visible
     width - used by the small prev/next arrow buttons under each row,
     mirroring miramoss.com's homepage row controls. Looked up by id
     instead of a ref per row since there can be several of these rows
     on the page at once. */
  function scrollRowBy(rowId, direction) {
    const element = document.getElementById(rowId);
    if (!element) return;
    element.scrollBy({ left: element.clientWidth * 0.8 * direction, behavior: "smooth" });
  }

  /*
   * HEADER MEGA-MENU - splits the full "categories" list (used above)
   * into the two dropdown panels the header nav shows: "Bags" gets
   * every category that isn't specifically an accessory/wallet.
   */
  /* Only categories that actually have products are listed (so a
     customer never clicks into an empty page). Until products have
     loaded, the full fixed list is shown so the menu isn't empty. */
  const usedCategories = useMemo(
    () => new Set(products.map((product) => product.category)),
    [products]
  );

  const bagNavCategories = useMemo(
    () =>
      products.length === 0
        ? BAG_CATEGORIES
        : BAG_CATEGORIES.filter((category) => usedCategories.has(category)),
    [products.length, usedCategories]
  );

  const accessoryNavCategories = useMemo(
    () =>
      products.length === 0
        ? ACCESSORY_ONLY_CATEGORIES
        : ACCESSORY_ONLY_CATEGORIES.filter((category) => usedCategories.has(category)),
    [products.length, usedCategories]
  );

  /*
   * "SHOP BY CATEGORY" / "EXPLORE OUR COLLECTIONS" BANNERS (homepage,
   * below New Arrivals). Large 2-up banner tiles, shown as a slider -
   * only 2 categories visible at a time, with prev/next arrows to page
   * through the rest, matching Mira & Moss's "Explore Our Collections"
   * slider instead of a full grid of every category at once. Capped at
   * 6 categories (3 pages of 2) so the slider stays reasonably short.
   * A category is eligible as soon as it has at least one product - it
   * does NOT require a resolvable product photo. If no photo is
   * available (or the image fails to load), the tile just falls back
   * to a dark "noimg" banner with the category name instead of
   * disappearing entirely - a category with real products should never
   * turn into a blank gap on the homepage just because of an image
   * issue.
   */
  const categoryShowcase = useMemo(() => {
    const real = categories.filter(
      (category) => category !== "All" && category !== ALL_BAGS_LABEL
    );

    return real
      .map((category) => {
        const productsInCategory = products.filter((product) => product.category === category);
        const withImage = productsInCategory.find(
          (product) => getProductImages(product, THUMB_IMAGE_WIDTH)[0]
        );
        const firstImage = withImage ? getProductImages(withImage, THUMB_IMAGE_WIDTH)[0] : null;

        return {
          category,
          count: productsInCategory.length,
          image: firstImage,
        };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [categories, products]);

  /*
   * CATEGORY PAGE TOP (banner + "Shop by categories" thumbnails).
   * The banner uses the owner's own lifestyle hero photos (Admin ->
   * Site Content), a different one per category so pages don't all
   * look the same; if none are uploaded it falls back to a photo of a
   * product from that category.
   */
  const listingTitle = isShopAllPage
    ? "Shop All"
    : selectedCategory === "All"
    ? "Shop All"
    : selectedCategory;

  const listingCopy =
    CATEGORY_PAGE_COPY[isShopAllPage ? "All" : selectedCategory] || {
      edit: `The ${selectedCategory} Edit`,
      line: "Thoughtfully designed for everyday elegance.",
      description: "",
    };

  const listingBannerImage = useMemo(() => {
    const key = isShopAllPage ? "All" : selectedCategory;
    const order = ["All", ALL_BAGS_LABEL, ...PRODUCT_CATEGORIES];
    const index = Math.max(0, order.indexOf(key));
    if (heroImages.length > 0) return heroImages[index % heroImages.length];
    const inListing = products.find((product) =>
      key === "All"
        ? true
        : key === ALL_BAGS_LABEL
        ? isBagCategory(product.category)
        : product.category === key
    );
    return inListing ? getProductImages(inListing, BANNER_IMAGE_WIDTH)[0] || "" : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShopAllPage, selectedCategory, heroImages, products]);

  const shopByCategoryTiles = useMemo(() => {
    const firstImageFor = (predicate) => {
      const product = products.find(predicate);
      return product ? getProductImages(product, THUMB_IMAGE_WIDTH)[0] || "" : "";
    };
    const withProducts = (list) =>
      list.filter((category) => products.some((product) => product.category === category));

    const isAccessoryPage = ACCESSORY_ONLY_CATEGORIES.includes(selectedCategory);
    let names;
    // (2026-10-03) No "All Bags" thumbnail in this row - only the real
    // categories, per user feedback.
    if (isShopAllPage || selectedCategory === "All") {
      names = ["All", ...withProducts(PRODUCT_CATEGORIES)];
    } else if (isAccessoryPage) {
      names = withProducts(ACCESSORY_ONLY_CATEGORIES);
    } else {
      names = withProducts(BAG_CATEGORIES);
    }

    return names.map((category) => ({
      category,
      label: category === "All" ? "Shop All" : category,
      active: isShopAllPage ? category === "All" : category === selectedCategory,
      image:
        category === "All"
          ? firstImageFor(() => true)
          : category === ALL_BAGS_LABEL
          ? firstImageFor((product) => isBagCategory(product.category))
          : firstImageFor((product) => product.category === category),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selectedCategory, isShopAllPage]);

  /*
   * (2026-10-02) The old one-pair-at-a-time slider (categorySlidePairs +
   * categorySlideIndex) was replaced by a real horizontally scrolling
   * row - see the "SHOP BY CATEGORY" JSX below. Customers can now
   * swipe it on mobile and scroll it with a trackpad/mouse on desktop,
   * and the arrows just scroll the row (scrollRowBy).
   */
  const CATEGORY_SCROLL_ID = "lux-category-scroll";

  /*
   * HOMEPAGE CATEGORY TEASER ROWS - one short product row per top
   * category (e.g. "Sling Bags", "Handbags"), each with its own
   * prev/next arrows + "View All". Mira & Moss's homepage does this
   * instead of only a couple of banner tiles, so the homepage shows a
   * real taste of each category's products (not just a photo), while
   * "View All" still opens that category's own full page rather than
   * stacking the whole catalog on the homepage. Only the top 2
   * categories (by product count) get a teaser row, even though the
   * "Explore Our Collections" slider above now cycles through more.
   */
  const categoryTeaserRows = useMemo(() => {
    return categoryShowcase
      .slice(0, 2)
      .map((entry) => ({
        category: entry.category,
        products: products.filter((product) => product.category === entry.category).slice(0, 8),
      }))
      .filter((row) => row.products.length > 0);
  }, [categoryShowcase, products]);

  /*
   * FEATURED PRODUCTS TABS - "Featured" + up to 5 real categories,
   * ranked by how many products they actually have (never a hardcoded
   * category list, so a tab is never empty). Tab state is local/
   * client-only - switching tabs just swaps the product row below,
   * no navigation and no page reload.
   */
  const [featuredTab, setFeaturedTab] = useState("Featured");

  const featuredTabCategories = useMemo(() => {
    return categories
      .filter((category) => category !== "All" && category !== ALL_BAGS_LABEL)
      .map((category) => ({
        category,
        count: products.filter((product) => product.category === category).length,
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((entry) => entry.category);
  }, [categories, products]);

  const featuredTabProducts = useMemo(() => {
    if (featuredTab === "Featured") {
      return (bestsellers.length > 0 ? bestsellers : newArrivals).slice(0, 8);
    }
    return products.filter((product) => product.category === featuredTab).slice(0, 8);
  }, [featuredTab, bestsellers, newArrivals, products]);

  /* =========================================================
     SCROLL REVEAL
     Lightweight fade-up-on-scroll for a handful of major section
     wrappers (marked with className="lux-reveal" in the JSX below).
     One shared IntersectionObserver, re-run whenever a data-driven
     section could have just mounted for the first time (bestsellers/
     new-arrivals/category-showcase all load async after the initial
     render). Fully inert for anyone with prefers-reduced-motion - see
     the @media guard in App.css, which is what actually turns this
     off, not this effect.
  ========================================================= */
  useEffect(() => {
    const elements = document.querySelectorAll(".lux-reveal:not(.lux-reveal-visible)");
    if (!elements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("lux-reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((element) => observer.observe(element));

    // Safety net (2026-10-02): whatever happens with the observer
    // (route change remount, fast scroll, very tall section, browser
    // quirk), never leave a section stuck at opacity 0 - after 1.5s
    // everything still pending is simply shown.
    const safety = window.setTimeout(() => {
      document
        .querySelectorAll(".lux-reveal:not(.lux-reveal-visible)")
        .forEach((element) => element.classList.add("lux-reveal-visible"));
    }, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(safety);
    };
    // location.pathname: sections remount when coming back to the
    // homepage from a product/category page and must be re-observed.
  }, [bestsellers, newArrivals, categoryShowcase, location.pathname]);

  function scrollToSection(sectionId) {
    setOpenMegaMenu(null);
    // Opens the section directly (no scrolling animation), even when
    // coming from another page.
    if (location.pathname !== "/") {
      navigate("/");
      // Wait one tick for the homepage sections to actually mount
      // before jumping to them.
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "instant", block: "start" });
      }, 50);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }

  /*
   * Every time the URL changes (home <-> a category page, or between
   * two categories), jump to the top of the new page. A single-page
   * app doesn't do this automatically the way a real multi-page site
   * does, and without it a category "page" felt like it was just
   * scrolling down inside the homepage instead of opening its own page.
   */
  //
  // (2026-10-03) Now an INSTANT jump that happens before the new page is
  // painted (useLayoutEffect + behavior "instant"). Before, the site-wide
  // CSS "scroll-behavior: smooth" turned this into a visible scroll-up
  // animation every time a category was opened.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  /* Keeps --lux-header-h equal to the real (sticky) header height, so the
     sticky Filters/Sort bar on category pages sits right under it. */
  useEffect(() => {
    const header = document.querySelector(".lux-header");
    if (!header) return undefined;
    const update = () =>
      document.documentElement.style.setProperty("--lux-header-h", `${header.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  /* =========================================================
     FILTER PRODUCTS
  ========================================================= */

  /*
   * Category + search only (no price/color yet) - this is what the
   * COLOR FILTER CHECKBOXES are built from, so the list of colors on
   * offer reflects the category/search you're browsing, but doesn't
   * shrink away as you tick color checkboxes on top of it.
   */
  const categorySearchProducts = useMemo(() => {
    return products.filter((product) => {
      const categoryMatch =
        selectedCategory === "All" ||
        (selectedCategory === ALL_BAGS_LABEL
          ? // Every bag, from every bag category (anything not an accessory).
            isBagCategory(product.category)
          : product.category === selectedCategory);

      const searchMatch =
        !searchText.trim() ||
        product.name?.toLowerCase().includes(searchText.toLowerCase());

      return categoryMatch && searchMatch;
    });
  }, [products, selectedCategory, searchText]);

  /*
   * LISTING FILTERS - price range + color, applied on top of the
   * category/search match above. Inspired by miramoss.com's collection
   * sidebar (price slider + color swatches).
   */
  const availableFilterColors = useMemo(() => {
    const seen = new Map();
    categorySearchProducts.forEach((product) => {
      (Array.isArray(product.colors) ? product.colors : []).forEach((color) => {
        const key = color.toLowerCase();
        if (!seen.has(key)) seen.set(key, color);
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [categorySearchProducts]);

  const filteredProducts = useMemo(() => {
    const minValue = priceMin !== "" && !Number.isNaN(Number(priceMin)) ? Number(priceMin) : null;
    const maxValue = priceMax !== "" && !Number.isNaN(Number(priceMax)) ? Number(priceMax) : null;

    return categorySearchProducts.filter((product) => {
      const price = Number(product.price || 0);
      const priceMatch = (minValue === null || price >= minValue) && (maxValue === null || price <= maxValue);

      const colorMatch =
        colorFilter.length === 0 ||
        (Array.isArray(product.colors) &&
          product.colors.some((color) =>
            colorFilter.some((selected) => selected.toLowerCase() === color.toLowerCase())
          ));

      return priceMatch && colorMatch;
    });
  }, [categorySearchProducts, priceMin, priceMax, colorFilter]);

  /*
   * SORT
   * Applied on top of filteredProducts, right before the grid
   * renders it - "featured" keeps the server's natural order,
   * everything else re-orders a copy (never mutates the original
   * products array, which other parts of the page still rely on
   * being in server order).
   */
  const sortedProducts = useMemo(() => {
    if (sortBy === "price-asc") {
      return [...filteredProducts].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    }
    if (sortBy === "price-desc") {
      return [...filteredProducts].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
    if (sortBy === "newest") {
      // Product IDs are created from Date.now(), so a higher ID is a newer product.
      return [...filteredProducts].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    }
    if (sortBy === "best-selling") {
      // Ranked using the real /api/bestsellers order (already the
      // server's own bestseller ranking) - products not in that list
      // keep their existing relative order after all the bestsellers.
      const rank = new Map(bestsellers.map((product, index) => [product.id, index]));
      return [...filteredProducts].sort((a, b) => {
        const rankA = rank.has(a.id) ? rank.get(a.id) : Infinity;
        const rankB = rank.has(b.id) ? rank.get(b.id) : Infinity;
        return rankA - rankB;
      });
    }
    return filteredProducts;
  }, [filteredProducts, sortBy, bestsellers]);

  /*
   * LISTING PAGINATION - miramoss.com's "View All"/category pages show
   * numbered pages (1 2 3 ... 7 ›) at the bottom instead of one long
   * grid with everything in it. Paginates the already-expanded (one
   * card per color variant) list so the page count matches what's
   * actually visible in the grid, not the raw product count.
   */
  const LISTING_PAGE_SIZE = 12;
  const [listingPage, setListingPage] = useState(1);

  const expandedListingProducts = useMemo(
    () => expandProductVariants(sortedProducts),
    [sortedProducts]
  );

  const listingTotalPages = Math.max(
    1,
    Math.ceil(expandedListingProducts.length / LISTING_PAGE_SIZE)
  );

  // Any change to what's being shown (category, filters, sort, search)
  // jumps back to page 1 - otherwise switching categories could leave
  // you stranded on "page 4" of a collection that only has 1 page.
  useEffect(() => {
    setListingPage(1);
  }, [selectedCategory, isShopAllPage, sortBy, priceMin, priceMax, colorFilter, searchText]);

  // Guards against being stuck on a page number that no longer exists
  // (e.g. a filter just shrank the results from 3 pages down to 1).
  useEffect(() => {
    if (listingPage > listingTotalPages) setListingPage(listingTotalPages);
  }, [listingPage, listingTotalPages]);

  const pagedListingProducts = useMemo(() => {
    const start = (listingPage - 1) * LISTING_PAGE_SIZE;
    return expandedListingProducts.slice(start, start + LISTING_PAGE_SIZE);
  }, [expandedListingProducts, listingPage]);

  function goToListingPage(page) {
    setListingPage(page);
    document.getElementById("lux-products")?.scrollIntoView({ behavior: "instant", block: "start" });
  }

  /*
   * SEARCH SUGGESTIONS
   * Live "as you type" matches shown in a dropdown under the
   * search bar - searches every product regardless of which
   * category is currently open, so typing a product name always
   * finds it even if you're browsing a different category.
   */
  const searchSuggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) => product.name?.toLowerCase().includes(query)).slice(0, 5);
  }, [products, searchText]);

  /* =========================================================
     PRODUCT IMAGES
  ========================================================= */

  function getProductImages(product, width = 1000) {
    if (!product) return [];

    let images = [];

    if (Array.isArray(product.images)) {
      images = product.images;
    }

    if (typeof product.images === "string" && product.images.trim()) {
      try {
        const parsed = JSON.parse(product.images);

        if (Array.isArray(parsed)) {
          images = parsed;
        }
      } catch {
        images = product.images
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    if (product.image && !images.includes(product.image)) {
      images.unshift(product.image);
    }

    return Array.from(new Set(images.filter(Boolean).map((img) => getImageUrl(img, width))));
  }

  /*
   * DISPLAY IMAGES FOR A GIVEN COLOR
   * If the product has its own photo gallery saved for the currently
   * selected color (product.colorImages[color], an array of one or
   * more photos), that whole gallery replaces the default photos -
   * so clicking a color swatch opens that variant "like its own
   * product" with all of its own angles/shots, not just one swapped
   * hero image. Falls back to the normal shared photo set for any
   * color that has no dedicated photos of its own yet.
   *
   * width is passed straight through to getImageUrl - callers showing
   * a small thumbnail (grid cards, category tiles) pass
   * THUMB_IMAGE_WIDTH so weserv.nl serves a smaller, faster-loading
   * file instead of the full 1000px version those spots never needed.
   */
  function getDisplayImages(product, color, width = 1000) {
    const baseImages = getProductImages(product, width);
    const colorPhotos = color && product?.colorImages ? product.colorImages[color] : null;

    if (!Array.isArray(colorPhotos) || colorPhotos.length === 0) return baseImages;

    return Array.from(new Set(colorPhotos.map((img) => getImageUrl(img, width)).filter(Boolean)));
  }

  // A color variant can have its own display name (set in Admin), so
  // the product page can show "Ira Noir" for Black and "Ira Sand" for
  // Tan while everything else on the page (price, description, other
  // colors' swatches, etc.) stays exactly the same as the base product.
  // Falls back to the product's normal name when that color has none.
  function getDisplayName(product, color) {
    if (!product) return "";
    const override = color && product.colorNames ? product.colorNames[color] : null;
    return (override && String(override).trim()) || product.name;
  }

  /*
   * "YOU MAY ALSO LIKE" - shown at the bottom of the product detail
   * view so customers keep browsing instead of leaving after one
   * item. Prefers other products in the same category, then fills
   * any remaining slots with other products so it's never empty.
   */
  function getRelatedProducts(product, limit = 8) {
    if (!product) return [];
    const others = products.filter((candidate) => candidate.id !== product.id);
    const sameCategory = others.filter((candidate) => candidate.category === product.category);
    const rest = others.filter((candidate) => candidate.category !== product.category);
    return [...sameCategory, ...rest].slice(0, limit);
  }

  /*
   * SHARED PRODUCT CARD (grid/scroll-row listings)
   * One render function used by every product grid on the site
   * (main shop grid, Bestsellers, New Arrivals, Related Products) so
   * the color-swatch-on-card and hover-second-photo behaviour (added
   * 2026-09-20, inspired by miramoss.com's collection page) works the
   * same way everywhere instead of being copy-pasted four times.
   *
   * options:
   *   keyPrefix          - makes React keys unique across sections
   *   badge              - "bestseller" | "sale" | "none" (default "sale")
   *   showDiscountPrice  - show the struck-through old price (default true)
   *   showOverlayActions - show the hover Add-to-cart/View buttons
   *                        (only the main shop grid has room for this)
   */
  function renderProductCard(product, options = {}) {
    const {
      keyPrefix = "product",
      badge = "sale",
      showDiscountPrice = true,
      showOverlayActions = false,
      eager = false,
      /*
       * forceColor pins this card to ONE specific color instead of the
       * shared "last clicked swatch" state from getCardColor/setCardColor.
       * expandProductVariants() below passes this so that a 3-color
       * product renders as 3 separate cards (one per color, each with
       * its own photo/name) - like miramoss.com's search results - and
       * each one keeps showing that same color even if another card
       * for the same product changes its own swatch. Swatch clicks on a
       * forceColor card jump straight to that color's product page
       * instead of swapping the photo in place, since two cards for the
       * same product can't safely share one "currently previewed color".
       */
      forceColor = null,
    } = options;

    const colors = Array.isArray(product.colors) ? product.colors : [];
    const hasMultipleColors = colors.length > 1;
    const activeColor = forceColor || getCardColor(product);
    const images = getDisplayImages(product, activeColor, THUMB_IMAGE_WIDTH);
    const image = images[0];
    const hoverImage = images.find((candidate) => candidate !== image);
    const displayName = getDisplayName(product, activeColor);
    const hasDiscount = product.oldPrice > product.price;
    const isSoldOut = Number(product.stock || 0) <= 0;

    return (
      <article
        className="lux-product-card"
        key={`${keyPrefix}-${product.id}${forceColor ? `-${forceColor}` : ""}`}
        onClick={() => openProduct(product, activeColor)}
      >
        <div className="lux-card-image">
          {image ? (
            <>
              <img
                className="lux-card-image-primary"
                src={image}
                alt={displayName}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={eager ? "high" : "auto"}
              />
              {hoverImage && (
                <img
                  className="lux-card-image-hover"
                  src={hoverImage}
                  alt={displayName}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </>
          ) : (
            <div className="lux-card-placeholder">SHRIMOH</div>
          )}

          {badge === "bestseller" && <div className="lux-card-badge lux-badge-best">BESTSELLER</div>}
          {badge === "sale" && hasDiscount && <div className="lux-card-badge">SALE</div>}

          {isSoldOut && <div className="lux-card-sold">SOLD OUT</div>}

          <button
            type="button"
            className={`lux-wishlist-heart${isWishlisted(product.id) ? " active" : ""}`}
            onClick={(e) => toggleWishlist(product, e)}
            aria-label={isWishlisted(product.id) ? "Remove from wishlist" : "Add to wishlist"}
          >
            {isWishlisted(product.id) ? "♥" : "♡"}
          </button>

          {showOverlayActions && (
            <button
              type="button"
              className="lux-quickview-btn"
              onClick={(e) => openQuickView(product, e)}
              aria-label="Quick view"
              title="Quick view"
            >
              ⌕
            </button>
          )}

          {showOverlayActions && (
            <div className="lux-card-overlay" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={isSoldOut}
                onClick={() => {
                  addToCart(product, 1, activeColor);
                  setCartOpen(true);
                }}
              >
                {isSoldOut ? "SOLD OUT" : "ADD TO BAG"}
              </button>

              <button type="button" onClick={() => openProduct(product, activeColor)}>
                VIEW
                <span>→</span>
              </button>
            </div>
          )}
        </div>

        {hasMultipleColors && (
          <div className="lux-card-swatches" onClick={(e) => e.stopPropagation()}>
            {colors.map((color) => {
              const colorPhotos = product.colorImages?.[color];
              const photo = Array.isArray(colorPhotos) ? colorPhotos[0] : colorPhotos;

              return (
                <button
                  key={color}
                  type="button"
                  className={`lux-card-swatch${activeColor === color ? " active" : ""}`}
                  style={
                    photo
                      ? { backgroundImage: `url(${getImageUrl(photo, 80)})` }
                      : { backgroundColor: colorToCss(color) }
                  }
                  onClick={(e) => {
                    if (forceColor) {
                      // This card is one of several separate per-color
                      // cards for the same product - jump straight to
                      // that color's own page instead of swapping the
                      // photo in place (see forceColor note above).
                      e.stopPropagation();
                      if (color !== activeColor) openProduct(product, color);
                    } else {
                      setCardColor(product, color, e);
                    }
                  }}
                  aria-label={color}
                  aria-pressed={activeColor === color}
                  title={color}
                />
              );
            })}
          </div>
        )}

        <div className="lux-card-info">
          <div>
            <span>{product.category || "COLLECTION"}</span>
            <h3>{displayName}</h3>
          </div>

          {/*
           * One compact line - current price, old price struck through,
           * discount % - same as the quick-view/product-page price row
           * (Mira & Moss keeps all three together on one line in the
           * grid too, instead of stacking price/old-price on separate
           * lines with no % shown, which took up extra vertical space).
           */}
          <div className="lux-card-price">
            <strong>₹{product.price.toLocaleString("en-IN")}</strong>
            {showDiscountPrice && hasDiscount && (
              <del>₹{product.oldPrice.toLocaleString("en-IN")}</del>
            )}
            {showDiscountPrice && hasDiscount && (
              <span className="lux-card-discount">
                {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
              </span>
            )}
          </div>
        </div>

        {/*
         * Mira & Moss-style "ADD TO BAG" - a plain outlined button sitting
         * BELOW the price/swatches, not a dark bar overlaid on the photo.
         * This is mobile-only (see .lux-card-add-mobile in App.css) -
         * on desktop the hover overlay on the image already covers this,
         * matching the phone screenshot the owner sent as the reference.
         */}
        <button
          type="button"
          className="lux-card-add-mobile"
          disabled={isSoldOut}
          onClick={(e) => {
            e.stopPropagation();
            addToCart(product, 1, activeColor);
            setCartOpen(true);
          }}
        >
          <LuxIcon name="bag" size={13} />
          {isSoldOut ? "SOLD OUT" : "ADD TO BAG"}
        </button>
      </article>
    );
  }

  /*
   * EXPAND MULTI-COLOR PRODUCTS INTO SEPARATE CARDS
   * A product with 2+ colors used to render as ONE grid card with a
   * small swatch row to flip through its colors in place. The owner
   * wanted each color to also show up as its OWN separate card, same
   * as miramoss.com's search/collection grid (e.g. "Odette Shoulder
   * Bag - Walnut" and "Odette Shoulder Bag - Noir" both appear as
   * their own tiles). This turns a list of N products into a flat
   * list of { product, color } entries - one per color for a
   * multi-color product, or just one entry (its only/default color)
   * for a single-color product - ready to pass straight into
   * renderProductCard's forceColor option.
   */
  function expandProductVariants(list) {
    return list.flatMap((product) => {
      const colors = Array.isArray(product.colors) ? product.colors : [];
      if (colors.length > 1) {
        return colors.map((color) => ({ product, color }));
      }
      return [{ product, color: colors[0] || null }];
    });
  }

  /* =========================================================
     OPEN PRODUCT
  ========================================================= */

  /*
   * Opening a product is now just navigating to its own real page
   * (/product/:id) - no local state to set, no popup to render.
   * Image/color/quantity get initialised by the effect below,
   * keyed off the URL's product id.
   */
  function openProduct(product, color) {
    if (!product) return;
    const query = color ? `?color=${encodeURIComponent(color)}` : "";
    navigate(`/product/${product.id}${query}`);
  }

  /*
   * "Back" on the product page - goes back in history when there is
   * somewhere to go back to (the normal case: came from the grid,
   * search, a related product, etc.), otherwise falls back to the
   * homepage (e.g. someone opened a shared product link directly).
   */
  function goBackFromProduct() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  /*
   * Whenever a NEW product page loads (id in the URL changes),
   * reset quantity/color back to defaults and scroll up to the top
   * of the page - this replaces what "openProduct" used to do
   * directly, now that opening a product is just a navigation.
   */
  useEffect(() => {
    if (!selectedProduct) return;

    setDetailQuantity(1);
    setTouchStartX(null);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id]);

  /*
   * Picking a color swatch - navigates to this same product's URL
   * with ?color=<name> added/changed, which is what makes it feel
   * like a new page opened in the same window: the browser's Back
   * button steps to the color you were on before, the link at that
   * exact color is shareable, and (matching how opening a product
   * from the grid already behaves) the page quantity resets and
   * scrolls back to the top. It's still the same product-detail
   * layout though, never a full reload/blank page in between.
   */
  function selectDetailColor(color) {
    if (!selectedProduct || !color) return;
    if (color === detailColor) return;
    navigate(`/product/${selectedProduct.id}?color=${encodeURIComponent(color)}`);
    setDetailQuantity(1);
    setTouchStartX(null);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  /*
   * When the customer picks a different color swatch, jump the
   * gallery back to that color's photo (if one is set) so the
   * main image always matches the color currently selected.
   */
  useEffect(() => {
    if (!selectedProduct) return;

    const images = getDisplayImages(selectedProduct, detailColor);
    setSelectedImage(images[0] || "");
    setSelectedImageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailColor, selectedProduct?.id]);

  /* =========================================================
     PRODUCT SLIDER
  ========================================================= */

  /*
   * BUG FIX: these two used to read getProductImages() - the full,
   * every-color-combined photo list - instead of getDisplayImages()
   * for the color currently selected. That's what caused the "wrong
   * color's photo" bug: clicking the gallery arrows/dots advanced
   * through ALL colors' photos together (e.g. index 7 of 11), so once
   * you clicked past a color's own last photo, selectedImage silently
   * became a photo of a completely different color while the "COLOR:"
   * label still correctly said the one you had selected - the label
   * and the photo were being driven by two different arrays. Both now
   * use the same color-filtered array the label/swatches already use.
   */
  function selectProductImage(index) {
    if (!selectedProduct) return;

    const images = getDisplayImages(selectedProduct, detailColor);

    if (!images.length) return;

    const safeIndex = ((index % images.length) + images.length) % images.length;

    setSelectedImageIndex(safeIndex);
    setSelectedImage(images[safeIndex]);
  }

  function changeProductImage(direction) {
    if (!selectedProduct) return;

    const images = getDisplayImages(selectedProduct, detailColor);

    if (images.length <= 1) return;

    const currentIndex = Math.max(0, selectedImageIndex);

    if (direction === "next") {
      selectProductImage(currentIndex + 1);
    } else {
      selectProductImage(currentIndex - 1);
    }
  }

  function handleGalleryTouchStart(event) {
    if (!event.touches?.length) return;

    setTouchStartX(event.touches[0].clientX);
  }

  function handleGalleryTouchEnd(event) {
    if (touchStartX === null || !event.changedTouches?.length) {
      return;
    }

    const endX = event.changedTouches[0].clientX;
    const difference = touchStartX - endX;

    if (Math.abs(difference) > 45) {
      changeProductImage(difference > 0 ? "next" : "prev");
    }

    setTouchStartX(null);
  }

  /* =========================================================
     CART TOTALS
  ========================================================= */

  const totalItems = useMemo(() => {
    return cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
  }, [cart]);

  const totalPrice = useMemo(() => {
    return cart.reduce(
      (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [cart]);

  // Delivery is free on every order, no minimum order value.
  const deliveryCharge = 0;

  const checkoutTotal = totalPrice + deliveryCharge;

  /* =========================================================
     CHECKOUT ITEMS
     (either the real cart, or a single Buy Now item — the
     real cart is never modified by a Buy Now purchase)
  ========================================================= */

  const checkoutItems = useMemo(() => {
    return directBuyItem ? [directBuyItem] : cart;
  }, [directBuyItem, cart]);

  const checkoutSubtotal = useMemo(() => {
    return checkoutItems.reduce(
      (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [checkoutItems]);

  // Delivery is free on every order, no minimum order value.
  const checkoutDeliveryCharge = 0;

  const checkoutDiscount = appliedCoupon
    ? Math.min(Number(appliedCoupon.discountAmount || 0), checkoutSubtotal)
    : 0;

  const checkoutGrandTotal = Math.max(
    0,
    checkoutSubtotal + checkoutDeliveryCharge - checkoutDiscount
  );

  /* =========================================================
     COUPON: APPLY / REMOVE
  ========================================================= */

  function resetCouponState() {
    setCouponCode("");
    setAppliedCoupon(null);
    setCouponError("");
    setCouponLoading(false);
  }

  async function applyCoupon() {
    const code = couponCode.trim();

    if (!code) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    if (!checkoutItems.length) {
      setCouponError("Your cart is empty.");
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    try {
      const secureItems = checkoutItems.map((item) => ({
        id: Number(item.id),
        quantity: Number(item.quantity || 0),
        color: item.selectedColor || "",
      }));

      const response = await fetch(`${API}/api/coupons/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, items: secureItems }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Invalid coupon code.");
      }

      setAppliedCoupon({
        code: data.code,
        discountAmount: Number(data.discountAmount || 0),
      });
      setCouponError("");
    } catch (error) {
      setAppliedCoupon(null);
      setCouponError(error.message || "Invalid coupon code.");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  /*
   * Whenever checkout opens/closes, any previously applied
   * coupon preview is cleared - the customer re-applies it
   * for a fresh cart/session so the discount is never stale.
   */
  useEffect(() => {
    if (!checkoutOpen) {
      resetCouponState();
    }
  }, [checkoutOpen]);

  /* =========================================================
     ADD TO CART
  ========================================================= */

  function addToCart(product, quantity = 1, color = "") {
    if (!product) return;

    const safeQuantity = Math.max(1, Number(quantity || 1));
    const stock = Number(product.stock || 0);
    const safeColor = color || "";
    const displayName = getDisplayName(product, safeColor);

    if (stock <= 0) {
      alert("This product is currently sold out.");
      return;
    }

    setCart((previousCart) => {
      const existingIndex = previousCart.findIndex(
        (item) => item.id === product.id && (item.selectedColor || "") === safeColor
      );

      if (existingIndex >= 0) {
        return previousCart.map((item, index) => {
          if (index !== existingIndex) {
            return item;
          }

          const currentQuantity = Number(item.quantity || 0);

          return {
            ...item,
            quantity: Math.min(currentQuantity + safeQuantity, Number(item.stock || 99)),
          };
        });
      }

      return [
        ...previousCart,
        {
          ...product,
          // Cart/checkout/order-email should show that color's own
          // name when it has one (e.g. "Ira Noir" for Black), same as
          // the product page already shows - so the customer and the
          // order both reflect what was actually picked.
          name: displayName,
          selectedColor: safeColor,
          quantity: Math.min(safeQuantity, stock || 99),
        },
      ];
    });

    // Success toast - a brief, real confirmation ("Added X to bag")
    // shown for every add-to-cart path, since they all funnel through
    // this one function (grid cards, quick view, product page, etc).
    showToast(`Added "${displayName}" to bag`);
  }

  /* =========================================================
     UPDATE CART
  ========================================================= */

  function updateCartQuantity(index, amount) {
    setCart((previousCart) =>
      previousCart.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const currentQuantity = Number(item.quantity || 1);
        const maxStock = Number(item.stock || 99);
        const nextQuantity = currentQuantity + amount;

        return {
          ...item,
          quantity: Math.min(Math.max(1, nextQuantity), maxStock),
        };
      })
    );
  }

  function removeFromCart(index) {
    setCart((previousCart) => previousCart.filter((_, itemIndex) => itemIndex !== index));
  }

  /* =========================================================
     BUY NOW
     FIX: no longer overwrites the real cart. It only sets
     a separate "directBuyItem" that checkout reads from.
  ========================================================= */

  function buyNow() {
    if (!selectedProduct) return;

    const stock = Number(selectedProduct.stock || 0);

    if (stock <= 0) {
      alert("This product is currently sold out.");
      return;
    }

    const quantity = Math.min(Math.max(1, Number(detailQuantity || 1)), stock);

    setDirectBuyItem({
      ...selectedProduct,
      name: getDisplayName(selectedProduct, detailColor || ""),
      selectedColor: detailColor || "",
      quantity,
    });

    setCartOpen(false);
    setCheckoutOpen(true);
    setOrderPlaced(false);

    document.body.style.overflow = "hidden";
  }

  /* =========================================================
     CHECKOUT
  ========================================================= */

  function openCheckout() {
    if (cart.length === 0) return;

    /*
     * This is a normal "checkout from cart" flow, not a
     * Buy Now flow — make sure no leftover Buy Now item
     * is used instead of the cart.
     */
    setDirectBuyItem(null);

    setCartOpen(false);
    setCheckoutOpen(true);
    setOrderPlaced(false);

    document.body.style.overflow = "hidden";
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setOrderPlaced(false);
    setDirectBuyItem(null);
    document.body.style.overflow = "";
  }

  /* =========================================================
     CUSTOMER INPUT
  ========================================================= */

  function handleCustomerChange(field, value) {
    let cleanValue = value;

    if (field === "mobile") {
      cleanValue = value.replace(/\D/g, "").slice(0, 10);
    }

    if (field === "pincode") {
      cleanValue = value.replace(/\D/g, "").slice(0, 6);
    }

    setCustomer((previous) => ({
      ...previous,
      [field]: cleanValue,
    }));

    // Once the customer touches any field themselves, this is no
    // longer just the remembered/pre-filled version - drop the note.
    setCustomerAutofilled(false);
  }

  /* =========================================================
     PLACE ORDER
     SECURE SERVER-SIDE CART CALCULATION
  ========================================================= */

  async function placeOrder(e) {
    e.preventDefault();

    if (orderLoading) return;

    if (!checkoutItems.length) {
      alert("Your cart is empty.");
      return;
    }

    const customerData = {
      name: customer.name.trim(),
      mobile: customer.mobile.trim(),
      email: customer.email.trim(),
      address: customer.address.trim(),
      city: customer.city.trim(),
      state: customer.state.trim(),
      pincode: customer.pincode.trim(),
    };

    if (
      !customerData.name ||
      !customerData.mobile ||
      !customerData.email ||
      !customerData.address ||
      !customerData.city ||
      !customerData.state ||
      !customerData.pincode
    ) {
      alert("Please fill all customer details.");
      return;
    }

    if (!/^[0-9]{10}$/.test(customerData.mobile)) {
      alert("Please enter a valid 10 digit mobile number.");
      return;
    }

    if (!/^[0-9]{6}$/.test(customerData.pincode)) {
      alert("Please enter a valid 6 digit pincode.");
      return;
    }

    setOrderLoading(true);

    try {
      /* =====================================================
         LOAD RAZORPAY
      ===================================================== */

      const razorpayLoaded = await new Promise((resolve) => {
        if (window.Razorpay) {
          resolve(true);
          return;
        }

        const existingScript = document.querySelector(
          'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
        );

        if (existingScript) {
          existingScript.addEventListener("load", () => resolve(true), { once: true });
          existingScript.addEventListener("error", () => resolve(false), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });

      if (!razorpayLoaded || !window.Razorpay) {
        throw new Error("Razorpay checkout failed to load.");
      }

      /* =====================================================
         SECURE CART
         ONLY PRODUCT ID + QUANTITY
         NO CLIENT PRICE
      ===================================================== */

      const secureItems = checkoutItems.map((item) => ({
        id: Number(item.id),
        quantity: Number(item.quantity || 0),
        color: item.selectedColor || "",
      }));

      if (
        secureItems.some(
          (item) =>
            !Number.isFinite(item.id) ||
            item.id <= 0 ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0
        )
      ) {
        throw new Error("One or more cart items are invalid.");
      }

      /* =====================================================
         CREATE RAZORPAY ORDER
         BACKEND CALCULATES REAL PRICE

         IMPORTANT:
         DO NOT SEND amount HERE.
      ===================================================== */

      const createResponse = await fetch(`${API}/api/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: secureItems,
          couponCode: appliedCoupon?.code || null,
        }),
      });

      const createData = await createResponse.json();

      if (!createResponse.ok || !createData.success) {
        throw new Error(createData.message || "Unable to create payment order.");
      }

      if (!createData.order_id) {
        throw new Error("Razorpay order ID was not returned.");
      }

      if (!createData.amount) {
        throw new Error("Invalid payment amount received from server.");
      }

      /* =====================================================
         RAZORPAY OPTIONS
      ===================================================== */

      const razorpayOptions = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,

        amount: createData.amount,

        currency: createData.currency || "INR",

        name: "SHRIMOH",

        description: "SHRIMOH Premium Collection",

        order_id: createData.order_id,

        prefill: {
          name: customerData.name,
          email: customerData.email,
          contact: customerData.mobile,
        },

        notes: {
          customer_name: customerData.name,
        },

        theme: {
          color: "#111111",
        },

        handler: async function (paymentResponse) {
          try {
            /* =============================================
               VERIFY PAYMENT
            ============================================= */

            const verifyResponse = await fetch(`${API}/api/verify-payment`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(verifyData.message || "Payment verification failed.");
            }

            /* =============================================
               SAVE ORDER
               ONLY ID + QUANTITY
            ============================================= */

            const orderResponse = await fetch(`${API}/api/orders`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                customer: customerData,
                items: secureItems,
                couponCode: appliedCoupon?.code || null,
                payment: {
                  method: "Razorpay",
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpaySignature: paymentResponse.razorpay_signature,
                  status: "Paid",
                },
              }),
            });

            const savedOrder = await orderResponse.json();

            if (!orderResponse.ok || !savedOrder.success) {
              throw new Error(savedOrder.message || "Order could not be saved.");
            }

            /* =============================================
               GET REAL ORDER REFERENCE
            ============================================= */

            const finalReference =
              savedOrder.order?.orderReference ||
              savedOrder.order?.orderNumber ||
              savedOrder.order?.orderId ||
              savedOrder.order?.reference ||
              "";

            setOrderReference(finalReference);
            setOrderPlaced(true);

            // Remember these details on THIS device only, so checkout
            // is pre-filled (still fully editable) next time - see the
            // "REMEMBER MY DETAILS" note near the customer state above.
            try {
              window.localStorage.setItem(SAVED_CUSTOMER_KEY, JSON.stringify(customerData));
            } catch {
              // Storage blocked/unavailable - not worth failing the
              // order over, just skip remembering it.
            }

            /*
             * Only clear the persistent cart if this was a
             * cart checkout. A Buy Now purchase must never
             * touch the customer's actual cart.
             */
            if (directBuyItem) {
              setDirectBuyItem(null);
            } else {
              setCart([]);
            }

            resetCouponState();

            setCheckoutOpen(true);
          } catch (error) {
            console.error("Payment verification/order error:", error);

            alert(
              error.message ||
                "Payment was received, but order processing failed. Please contact support."
            );
          } finally {
            setOrderLoading(false);
          }
        },

        modal: {
          ondismiss: function () {
            setOrderLoading(false);
          },
        },
      };

      /* =====================================================
         OPEN RAZORPAY
      ===================================================== */

      const razorpay = new window.Razorpay(razorpayOptions);

      razorpay.on("payment.failed", function (response) {
        console.error("Razorpay payment failed:", response);

        alert(response.error?.description || "Payment failed. Please try again.");

        setOrderLoading(false);
      });

      razorpay.open();
    } catch (error) {
      console.error("Checkout error:", error);

      alert(error.message || "Something went wrong while starting payment.");

      setOrderLoading(false);
    }
  }

  /* =========================================================
     ESCAPE KEY
  ========================================================= */

  useEffect(() => {
    function handleEscape(e) {
      if (e.key !== "Escape") return;

      /*
       * The product view is a real page now (not a popup), so
       * Escape no longer navigates away from it - only the overlay
       * drawers below (checkout, cart, wishlist, mobile menu, info
       * pages) close on Escape.
       */
      if (checkoutOpen) {
        closeCheckout();
      } else if (cartOpen) {
        setCartOpen(false);
        document.body.style.overflow = "";
      } else if (wishlistOpen) {
        setWishlistOpen(false);
        document.body.style.overflow = "";
      } else if (mobileMenuOpen) {
        closeMobileMenu();
      } else if (activePage) {
        closeInfoPage();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [checkoutOpen, cartOpen, wishlistOpen, mobileMenuOpen, activePage]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="shrimoh-app">
      {/* ADD-TO-BAG TOAST */}
      {toastMessage && (
        <div className="lux-toast" role="status" aria-live="polite">
          <LuxIcon name="check" size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ANNOUNCEMENT BAR - rotates one message at a time (same 3 real
          messages the bar always had, just shown one-at-a-time with
          prev/next controls instead of all three side by side), pauses
          on hover/touch, and stays off prefers-reduced-motion. */}
      <div
        className="lux-announcement"
        onMouseEnter={() => setAnnouncementPaused(true)}
        onMouseLeave={() => setAnnouncementPaused(false)}
      >
        <button
          type="button"
          className="lux-announcement-arrow"
          aria-label="Previous announcement"
          onClick={() =>
            setAnnouncementIndex(
              (current) => (current - 1 + ANNOUNCEMENT_MESSAGES.length) % ANNOUNCEMENT_MESSAGES.length
            )
          }
        >
          ‹
        </button>

        <div className="lux-announcement-text" key={announcementIndex}>
          {ANNOUNCEMENT_MESSAGES[announcementIndex]}
        </div>

        <button
          type="button"
          className="lux-announcement-arrow"
          aria-label="Next announcement"
          onClick={() =>
            setAnnouncementIndex((current) => (current + 1) % ANNOUNCEMENT_MESSAGES.length)
          }
        >
          ›
        </button>
      </div>

      {/* OFFER BANNER */}
      <div className="lux-offer-banner">
        <span>🎉</span>
        <p>
          Use code <strong>WELCOME10</strong> at checkout for 10% off your first order
        </p>
      </div>

      {/* HEADER */}
      <header className="lux-header">
        <div className="lux-header-inner">
          <button
            className="lux-mobile-menu"
            type="button"
            aria-label="Menu"
            onClick={() => {
              setMobileMenuOpen(true);
              document.body.style.overflow = "hidden";
            }}
          >
            ☰
          </button>

          <div
            className="lux-logo"
            onClick={() => {
              goToCategory("All");
              setSearchText("");
            }}
          >
            <img src={shrimohIcon} alt="" className="lux-logo-mark" />
            <div className="lux-logo-text">
              <span>SHRIMOH</span>
              <small>THE LUXURY STORE</small>
            </div>
          </div>

          {/*
            HEADER NAV - "Bags" and "Accessories" used to list every
            single category as flat pills in one long row. Now they're
            two click-to-open dropdown panels (mira&moss-style
            mega-menu), so the header itself stays short and the
            specific categories only appear once you click.
          */}
          <nav className="lux-nav">
            <button
              type="button"
              className={isShopAllPage ? "active" : ""}
              onClick={goToShopAll}
            >
              SHOP ALL
            </button>

            <button type="button" onClick={() => scrollToSection("lux-new-arrivals")}>
              NEW ARRIVALS
            </button>

            <div className="lux-nav-item">
              <button
                type="button"
                className={`lux-nav-item-trigger ${
                  selectedCategory === ALL_BAGS_LABEL || bagNavCategories.includes(selectedCategory)
                    ? "active"
                    : ""
                }`}
                onClick={() => setOpenMegaMenu(openMegaMenu === "bags" ? null : "bags")}
              >
                BAGS <LuxIcon name="chevron-down" size={12} />
              </button>

              {openMegaMenu === "bags" && (
                <div className="lux-nav-dropdown">
                  <div className="lux-nav-dropdown-col">
                    <span>SHOP</span>
                    <button type="button" onClick={() => goToCategory(ALL_BAGS_LABEL)}>
                      All Bags
                    </button>
                    <button type="button" onClick={() => scrollToSection("lux-bestsellers")}>
                      Bestsellers
                    </button>
                    <button type="button" onClick={() => scrollToSection("lux-new-arrivals")}>
                      New Arrivals
                    </button>
                  </div>

                  <div className="lux-nav-dropdown-col">
                    <span>CATEGORIES</span>
                    {bagNavCategories.map((category) => (
                      <button key={category} type="button" onClick={() => goToCategory(category)}>
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {accessoryNavCategories.length > 0 && (
              <div className="lux-nav-item">
                <button
                  type="button"
                  className={`lux-nav-item-trigger ${
                    accessoryNavCategories.includes(selectedCategory) ? "active" : ""
                  }`}
                  onClick={() =>
                    setOpenMegaMenu(openMegaMenu === "accessories" ? null : "accessories")
                  }
                >
                  ACCESSORIES <LuxIcon name="chevron-down" size={12} />
                </button>

                {openMegaMenu === "accessories" && (
                  <div className="lux-nav-dropdown lux-nav-dropdown-single">
                    <div className="lux-nav-dropdown-col">
                      <span>CATEGORIES</span>
                      {accessoryNavCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => goToCategory(category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button type="button" onClick={() => openInfoPage("about")}>
              ABOUT
            </button>
          </nav>

          <div className="lux-header-actions">
            <button type="button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search">
              <LuxIcon name="search" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/track-order")}
              className="lux-track-icon"
              aria-label="Track order"
              title="Track your order"
            >
              <LuxIcon name="box" />
            </button>

            <button
              type="button"
              onClick={() => setWishlistOpen(true)}
              className={`lux-wishlist-icon${wishlist.length > 0 ? " has-items" : ""}`}
              aria-label="Wishlist"
            >
              <LuxIcon name="heart" filled={wishlist.length > 0} />
              {wishlist.length > 0 && <span>{wishlist.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="lux-cart-icon"
              aria-label="Shopping bag"
            >
              <LuxIcon name="bag" />
              {totalItems > 0 && <span>{totalItems}</span>}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="lux-search-bar">
            <div className="lux-search-inner">
              <span>SEARCH</span>
              <input
                autoFocus
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search bags, accessories & more..."
              />
              <button
                type="button"
                onClick={() => {
                  setSearchText("");
                  setSearchOpen(false);
                }}
              >
                ×
              </button>
            </div>

            {searchText.trim() && (
              <div className="lux-search-suggestions">
                {searchSuggestions.length > 0 ? (
                  searchSuggestions.map((product) => {
                    const image = getProductImages(product)[0];
                    return (
                      <button
                        type="button"
                        key={product.id}
                        className="lux-search-suggestion"
                        onClick={() => {
                          openProduct(product);
                          setSearchText("");
                          setSearchOpen(false);
                        }}
                      >
                        <span className="lux-search-suggestion-image">
                          {image ? <img src={image} alt={product.name} loading="lazy" decoding="async" /> : null}
                        </span>
                        <span className="lux-search-suggestion-info">
                          <strong>{product.name}</strong>
                          <em>₹{Number(product.price || 0).toLocaleString("en-IN")}</em>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="lux-search-no-results">No products match "{searchText.trim()}"</p>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {isTrackOrderPage && (
        <TrackOrderPage
          trackReference={trackReference}
          setTrackReference={setTrackReference}
          trackContact={trackContact}
          setTrackContact={setTrackContact}
          trackLoading={trackLoading}
          trackError={trackError}
          trackResult={trackResult}
          lookupOrder={lookupOrder}
          resetTrackSearch={resetTrackSearch}
          navigate={navigate}
        />
      )}

      {!isTrackOrderPage && !isProductPage && (
      <>

      {/*
        HOMEPAGE-ONLY SECTIONS
        Hero, editorial/values strips, bestsellers and new-arrivals only
        belong on the homepage. When a category is open (a real
        /category/:slug page), we skip straight to that category's own
        collection header + grid below, instead of stacking the whole
        homepage above it. This is what makes a category feel like its
        own page instead of a scroll-down section of the homepage.
      */}
      {selectedCategory === "All" && !isShopAllPage && (
        <>
      {/* HERO */}
      <section
        className="lux-hero"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
      >
        <div
          className="lux-hero-image"
          onTouchStart={handleHeroTouchStart}
          onTouchEnd={handleHeroTouchEnd}
        >
          {heroImages.length > 0 ? (
            heroImages.map((image, index) => (
              /*
               * Two stacked copies per slide instead of one cropped photo:
               * - lux-hero-slide-bg: same photo, zoomed/blurred, fills the
               *   whole banner edge-to-edge (so there's never an empty/
               *   blank strip whatever the banner's shape is).
               * - lux-hero-slide (foreground): object-fit CONTAIN, so the
               *   full photo - the model, the bag, all of it - is always
               *   completely visible and never cropped, no matter how
               *   wide/short the banner is on a given screen.
               * This is what fixed the "bag/photo getting cut off on
               * laptop" complaint for good, instead of just tuning the
               * banner's aspect ratio, which only ever reduces cropping,
               * never fully removes it for every possible photo shape.
               */
              <Fragment key={image}>
                <img
                  src={image}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  onError={handleImageFallback}
                  className={`lux-hero-slide-bg ${index === activeHeroSlide ? "lux-hero-slide-active" : ""}`}
                />
                <img
                  src={image}
                  alt="SHRIMOH collection"
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  onError={handleImageFallback}
                  className={`lux-hero-slide ${index === activeHeroSlide ? "lux-hero-slide-active" : ""}`}
                />
              </Fragment>
            ))
          ) : filteredProducts[0] && getProductImages(filteredProducts[0])[0] ? (
            <img src={getProductImages(filteredProducts[0])[0]} alt="SHRIMOH collection" />
          ) : (
            <div className="lux-hero-placeholder">SHRIMOH</div>
          )}
          <div className="lux-hero-image-shade" />

          {heroImages.length > 1 && (
            <>
              <button
                type="button"
                className="lux-hero-arrow lux-hero-arrow-prev"
                aria-label="Previous slide"
                onClick={() => goToHeroSlide(-1)}
              >
                ←
              </button>
              <button
                type="button"
                className="lux-hero-arrow lux-hero-arrow-next"
                aria-label="Next slide"
                onClick={() => goToHeroSlide(1)}
              >
                →
              </button>

              <div className="lux-hero-dots">
                {heroImages.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    className={index === activeHeroSlide ? "active" : ""}
                    aria-label={`Show slide ${index + 1}`}
                    onClick={() => setActiveHeroSlide(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/*
          keyed by activeHeroSlide so React remounts this block on every
          slide change - that's what makes the fade-up text animation
          (luxHeroContentIn in App.css) replay per slide instead of only
          once on first page load.
        */}
        <div className="lux-hero-content" key={`hero-copy-${activeHeroSlide % HERO_SLIDE_COPY.length}`}>
          <h1>
            {activeHeroCopy.lines[0]}
            <br />
            {activeHeroCopy.lines[1]}
          </h1>

          <p>{activeHeroCopy.text}</p>

          <div className="lux-hero-buttons">
            <button
              type="button"
              onClick={() =>
                document.getElementById(activeHeroCopy.primaryTarget)?.scrollIntoView({
                  behavior: "instant",
                  block: "start",
                })
              }
            >
              {activeHeroCopy.primaryLabel}
              <LuxIcon name="arrow-right" size={18} />
            </button>
          </div>
        </div>

      </section>

      {/* HOMEPAGE ORDER (2026-10-03) - same top-to-bottom sequence as
          miramoss.com: Hero -> New Arrivals -> 2 category banners ->
          Featured Products (tabs; its "Featured" tab is the real
          bestsellers list, so the separate Bestsellers row was folded
          into it) -> Explore Our Collections (category cards) -> Our
          Journey. */}
      {/* NEW ARRIVALS */}
      {newArrivals.length > 0 && (
        <>
          <section className="lux-section-header lux-section-header-center" id="lux-new-arrivals">
            <div>
              <h2>New Arrivals</h2>
              <p className="lux-section-subtitle">Our most awaited collection is here</p>
            </div>
          </section>

          <div className="lux-product-grid lux-scroll-row" id="lux-row-new-arrivals">
            {expandProductVariants(newArrivals).map(({ product, color }) =>
              renderProductCard(product, { keyPrefix: "new", badge: "sale", forceColor: color })
            )}
          </div>

          <div className="lux-row-controls">
            <button
              type="button"
              className="lux-row-arrow"
              onClick={() => scrollRowBy("lux-row-new-arrivals", -1)}
              aria-label="Scroll new arrivals left"
            >
              <LuxIcon name="arrow-left" size={20} />
            </button>
            <button
              type="button"
              className="lux-row-arrow"
              onClick={() => scrollRowBy("lux-row-new-arrivals", 1)}
              aria-label="Scroll new arrivals right"
            >
              <LuxIcon name="arrow-right" size={20} />
            </button>
            <button
              type="button"
              className="lux-row-viewall"
              onClick={() => goToShopAllSorted("newest")}
            >
              View All <span>→</span>
            </button>
          </div>
        </>
      )}

      {/* CATEGORY BANNERS (2026-10-03) - miramoss.com puts two big
          category banners right after New Arrivals ("Cross Body Bags",
          "Shoulder Bags"): one large photo, the category name, one line
          of text and a "Shop now" button - no product row. Shown for the
          top 2 categories by product count (categoryTeaserRows). */}
      {categoryTeaserRows.length > 0 && (
        <div className="lux-cat-banners">
          {categoryTeaserRows.map((row) => {
            const photo = getProductImages(row.products[0], 1200)[0];
            return (
              <section className="lux-cat-banner lux-reveal" key={row.category}>
                <button
                  type="button"
                  className="lux-cat-banner-photo"
                  onClick={() => goToCategory(row.category)}
                  aria-label={`Shop ${row.category}`}
                >
                  {photo ? (
                    <img src={photo} alt={row.category} loading="lazy" decoding="async" onError={handleImageFallback} />
                  ) : (
                    <span className="lux-card-placeholder">SHRIMOH</span>
                  )}
                </button>
                <h2>{row.category}</h2>
                <p>{CATEGORY_TAGLINES[row.category] || "Thoughtfully designed for everyday elegance."}</p>
                <button type="button" className="lux-shop-now" onClick={() => goToCategory(row.category)}>
                  Shop now <LuxIcon name="arrow-right" size={18} />
                </button>
              </section>
            );
          })}
        </div>
      )}

      {/* FEATURED PRODUCTS - tabbed switcher (Featured + up to 5 real
          categories that actually have products). Switching tabs just
          swaps which products render below - no navigation/reload. */}
      {featuredTabProducts.length > 0 && (
        <>
          <section className="lux-section-header lux-section-header-center" id="lux-bestsellers">
            <div>
              <h2>Featured Products</h2>
              <p className="lux-section-subtitle">
                {bestsellers.length > 0
                  ? "Our Bestsellers — Loved by Customers"
                  : "Curated Favourites — The SHRIMOH Edit"}
              </p>
            </div>
          </section>

          <div className="lux-featured-tabs" role="tablist" aria-label="Featured products category">
              <button
                type="button"
                role="tab"
                aria-selected={featuredTab === "Featured"}
                className={featuredTab === "Featured" ? "active" : ""}
                onClick={() => setFeaturedTab("Featured")}
              >
                Featured
              </button>
              {featuredTabCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={featuredTab === category}
                  className={featuredTab === category ? "active" : ""}
                  onClick={() => setFeaturedTab(category)}
                >
                  {category}
                </button>
              ))}
          </div>

          <div className="lux-product-grid lux-scroll-row" id="lux-row-featured-tabs">
            {expandProductVariants(featuredTabProducts).map(({ product, color }) =>
              renderProductCard(product, {
                keyPrefix: `featured-${featuredTab}`,
                badge: "sale",
                forceColor: color,
              })
            )}
          </div>

          <div className="lux-row-controls">
            <button
              type="button"
              className="lux-row-arrow"
              onClick={() => scrollRowBy("lux-row-featured-tabs", -1)}
              aria-label="Scroll featured products left"
            >
              <LuxIcon name="arrow-left" size={20} />
            </button>
            <button
              type="button"
              className="lux-row-arrow"
              onClick={() => scrollRowBy("lux-row-featured-tabs", 1)}
              aria-label="Scroll featured products right"
            >
              <LuxIcon name="arrow-right" size={20} />
            </button>
            <button
              type="button"
              className="lux-row-viewall"
              onClick={() =>
                featuredTab === "Featured" ? goToShopAll() : goToCategory(featuredTab)
              }
            >
              View All <span>→</span>
            </button>
          </div>
        </>
      )}

      {/* SHOP BY CATEGORY / "EXPLORE OUR COLLECTIONS" - a 2-up slider of
          large banner tiles, right below New Arrivals. Only one pair is
          shown at a time; prev/next arrows below page through the rest
          (up to 3 pairs / 6 categories) - matches Mira & Moss's "Explore
          Our Collections" slider instead of a static grid. */}
      {categoryShowcase.length > 0 && (
        <>
          <section className="lux-section-header lux-section-header-center" id="lux-shop-by-category">
            <div>
              <h2>Explore Our Collections</h2>
              <p className="lux-section-subtitle">Discover timeless pieces designed for modern moments</p>
            </div>
          </section>

          {/* Not wrapped in lux-reveal any more: the fade-in animation
              could leave this whole section stuck invisible (opacity 0)
              when coming back to the homepage, which is why "Shop by
              Category kabhi dikhta hai, kabhi gayab ho jata hai". */}
          <div
            className="lux-category-tiles"
            id={CATEGORY_SCROLL_ID}
            role="list"
            aria-label="Shop by category"
          >
            {categoryShowcase.map((entry, index) => (
              <button
                type="button"
                role="listitem"
                key={entry.category}
                className={`lux-category-tile${entry.image ? "" : " lux-category-tile-noimg"}`}
                onClick={() => goToCategory(entry.category)}
              >
                {entry.image && (
                  <img
                    src={entry.image}
                    alt={entry.category}
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    draggable="false"
                    onLoad={(event) => event.currentTarget.classList.add("lux-img-loaded")}
                    onError={(event) => {
                      const img = event.currentTarget;
                      // First try the original (uncompressed) photo once,
                      // then fall back to the plain dark tile.
                      if (!img.dataset.fallbackApplied && img.src.includes("images.weserv.nl")) {
                        handleImageFallback(event);
                        return;
                      }
                      img.style.display = "none";
                      img.parentElement?.classList.add("lux-category-tile-noimg");
                    }}
                  />
                )}
                <div className="lux-category-tile-label">
                  <strong>Shop {entry.category}</strong>
                  <small>{entry.count} {entry.count === 1 ? "piece" : "pieces"}</small>
                </div>
              </button>
            ))}
          </div>

          {categoryShowcase.length > 2 && (
            <div className="lux-row-controls lux-category-slide-controls">
              <button
                type="button"
                className="lux-row-arrow"
                onClick={() => scrollRowBy(CATEGORY_SCROLL_ID, -1)}
                aria-label="Previous categories"
              >
                <LuxIcon name="arrow-left" size={20} />
              </button>
              <button
                type="button"
                className="lux-row-arrow"
                onClick={() => scrollRowBy(CATEGORY_SCROLL_ID, 1)}
                aria-label="Next categories"
              >
                <LuxIcon name="arrow-right" size={20} />
              </button>
            </div>
          )}
        </>
      )}

      {/* OUR JOURNEY - a short origin-story banner with a "More About
          Us" button, placed right after "Explore Our Collections" (Shop
          by Category). Reuses the same real, already-published brand
          copy from the About page - no invented customer/order numbers
          here, unlike Mira & Moss's stats strip, since there's no real
          figure to back one yet. */}
      <section className="lux-journey lux-reveal">
        {heroImages[0] && (
          <div className="lux-journey-photo">
            <img src={heroImages[0]} alt="SHRIMOH" loading="lazy" decoding="async" onError={handleImageFallback} />
          </div>
        )}

        <div className="lux-journey-copy">
          <span>OUR STORY</span>
          <h2>The SHRIMOH Journey</h2>

          <p>
            SHRIMOH was created with a simple idea: luxury doesn&apos;t need to shout. We design
            and curate pieces that quietly become part of your everyday life - thoughtful in
            construction, refined in detail, and made to last well beyond the first impression.
          </p>

          <p>
            We&apos;re a small, growing team, and every order matters to us - each piece is
            checked before it ships, never mass-produced without care.
          </p>

          <button type="button" onClick={() => openInfoPage("about")}>
            More About Us
            <span>→</span>
          </button>
        </div>
      </section>
        </>
      )}

      {/*
        FULL LISTING (breadcrumb + collection header + filters + grid) -
        only rendered on an actual category page OR the dedicated
        "/shop" (Shop All) page, never stacked underneath the homepage
        itself. Mira & Moss's homepage only ever shows a few curated
        teaser rows with "View All" links - the full catalog grid always
        lives on its own page. Before this, SHRIMOH's homepage used to
        render this ENTIRE block too (unconditionally), which is why the
        homepage felt like "every product dumped in one place" instead
        of curated - this is the fix for that.
      */}
      {(selectedCategory !== "All" || isShopAllPage) && (
        <>
      {/* CATEGORY / COLLECTION PAGE TOP (2026-10-03) - same layout as a
          miramoss.com category page: a big photo banner with "The ...
          Edit" on it, then the category name + a short description,
          then "SHOP BY CATEGORIES" (small photo thumbnails of the sister
          categories), then Filters/Sort and the products. */}
      <section className="lux-cat-hero">
        {listingBannerImage ? (
          <img
            src={listingBannerImage}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
            onError={handleImageFallback}
          />
        ) : null}
        <div className="lux-cat-hero-shade" />
        <div className="lux-cat-hero-copy" key={listingTitle}>
          <h1>{listingCopy.edit}</h1>
          <p>{listingCopy.line}</p>
        </div>
      </section>

      <section className="lux-collection-intro" id="lux-products">
        <h2>{listingTitle}</h2>
        <p>{listingCopy.description}</p>
        <span>
          {filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}
        </span>
      </section>

      {shopByCategoryTiles.length > 1 && (
        <section className="lux-shop-cats" aria-label="Shop by categories">
          <span className="lux-shop-cats-label">SHOP BY CATEGORIES</span>
          <div className="lux-shop-cats-row">
            {shopByCategoryTiles.map((tile) => (
              <button
                type="button"
                key={tile.category}
                className={`lux-shop-cat${tile.active ? " active" : ""}`}
                onClick={() => (tile.category === "All" ? goToShopAll() : goToCategory(tile.category))}
                aria-current={tile.active ? "page" : undefined}
              >
                <span className="lux-shop-cat-photo">
                  {tile.image ? (
                    <img src={tile.image} alt="" loading="lazy" decoding="async" onError={handleImageFallback} />
                  ) : null}
                </span>
                <span className="lux-shop-cat-name">{tile.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/*
       * FILTERS + SORT - a matched pair of plain bordered boxes sitting
       * side by side, full width, right below the header. Replaces the
       * old right-aligned pill button + native-looking dropdown per the
       * miramoss.com reference (its category page shows "Filters"/"Sort"
       * as two equal, plain boxes in their own row, not tucked into a
       * corner).
       */}
      <div className="lux-listing-controls lux-listing-controls-sticky">
        <button
          type="button"
          className={`lux-filter-toggle${listingFilterCount > 0 ? " active" : ""}`}
          onClick={() => setFiltersOpen((previous) => !previous)}
          aria-expanded={filtersOpen}
        >
          <span>Filters{listingFilterCount > 0 ? ` (${listingFilterCount})` : ""}</span>
          <LuxIcon name="filter" size={15} />
        </button>

        <div className="lux-sort-box">
          <select
            className="lux-sort-select"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sort products"
          >
            <option value="featured">Sort: Featured</option>
            {bestsellers.length > 0 && (
              <option value="best-selling">Sort: Best Selling</option>
            )}
            <option value="newest">Sort: Newest First</option>
            <option value="price-asc">Sort: Price - Low to High</option>
            <option value="price-desc">Sort: Price - High to Low</option>
          </select>
          <LuxIcon name="sort" size={14} />
        </div>
      </div>

      {/*
       * LISTING FILTERS PANEL (price range + color) - inspired by
       * miramoss.com's collection-page sidebar, collapsed by default
       * so it doesn't add clutter for anyone who doesn't need it.
       */}
      {filtersOpen && (
        <section className="lux-filter-panel">
          <div className="lux-filter-group">
            <span className="lux-filter-label">PRICE (₹)</span>
            <div className="lux-filter-price-inputs">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Min"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
                aria-label="Minimum price"
              />
              <span>to</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Max"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                aria-label="Maximum price"
              />
            </div>
          </div>

          {availableFilterColors.length > 0 && (
            <div className="lux-filter-group">
              <span className="lux-filter-label">COLOR</span>
              <div className="lux-filter-color-list">
                {availableFilterColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={`lux-filter-color-pill${
                      colorFilter.includes(color) ? " active" : ""
                    }`}
                    onClick={() => toggleColorFilter(color)}
                    aria-pressed={colorFilter.includes(color)}
                  >
                    <span
                      className="lux-filter-color-dot"
                      style={{ backgroundColor: colorToCss(color) }}
                    />
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {listingFilterCount > 0 && (
            <button type="button" className="lux-filter-clear" onClick={clearListingFilters}>
              Clear filters ✕
            </button>
          )}
        </section>
      )}

      {/* API ERROR */}
      {apiError && <div className="lux-api-error">{apiError}</div>}

      {/* PRODUCTS */}
      {loadingProducts ? (
        <main className="lux-product-grid" aria-busy="true" aria-label="Loading products">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="lux-skeleton-card" key={`skeleton-${index}`}>
              <div className="lux-skeleton-image" />
              <div className="lux-skeleton-info">
                <div className="lux-skeleton-line lux-skeleton-line-tag" />
                <div className="lux-skeleton-line lux-skeleton-line-title" />
                <div className="lux-skeleton-line lux-skeleton-line-price" />
              </div>
            </div>
          ))}
        </main>
      ) : filteredProducts.length === 0 ? (
        <div className="lux-empty">
          <span>THE COLLECTION</span>
          <h3>No products found</h3>
          <p>Try another category or search.</p>
          <button
            type="button"
            onClick={() => {
              goToShopAll();
              setSearchText("");
            }}
          >
            VIEW ALL PRODUCTS
          </button>
        </div>
      ) : (
        <>
          <main className="lux-product-grid">
            {pagedListingProducts.map(({ product, color }, index) =>
              renderProductCard(product, {
                keyPrefix: "shop",
                badge: "sale",
                showOverlayActions: true,
                eager: index < 4,
                forceColor: color,
              })
            )}
          </main>

          {/*
           * PAGINATION - numbered pages instead of one endless grid,
           * same "1 2 3 ... 7 ›" pattern miramoss.com uses on its own
           * View All/category pages. Only shown once there's more than
           * one page, so a small collection never shows a pointless
           * lone "1".
           */}
          {listingTotalPages > 1 && (
            <nav className="lux-pagination" aria-label="Product page navigation">
              {getPaginationItems(listingPage, listingTotalPages).map((item, index) =>
                item === "..." ? (
                  <span key={`dots-${index}`} className="lux-pagination-dots">
                    …
                  </span>
                ) : (
                  <button
                    type="button"
                    key={item}
                    className={`lux-pagination-page${item === listingPage ? " active" : ""}`}
                    onClick={() => goToListingPage(item)}
                    aria-current={item === listingPage ? "page" : undefined}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                type="button"
                className="lux-pagination-next"
                onClick={() => goToListingPage(Math.min(listingPage + 1, listingTotalPages))}
                disabled={listingPage >= listingTotalPages}
                aria-label="Next page"
              >
                <LuxIcon name="chevron-right" size={16} />
              </button>
            </nav>
          )}
        </>
      )}
        </>
      )}

      {/* BRAND STORY */}
      <section className="lux-brand-story lux-reveal">
        <div className="lux-brand-story-copy">
          <span>THE SHRIMOH PHILOSOPHY</span>

          <h2>
            Luxury doesn't
            <br />
            need to shout.
          </h2>

          <p>
            We believe the most beautiful pieces are the ones that quietly become part of your
            everyday life. Thoughtful design, refined details and a feeling that lasts beyond the
            first impression.
          </p>

          <button
            type="button"
            onClick={goToShopAll}
          >
            EXPLORE SHRIMOH
            <span>→</span>
          </button>
        </div>

        <div className="lux-brand-story-mark">
          {brandStoryImageUrl ? (
            <img src={brandStoryImageUrl} alt="SHRIMOH" className="lux-brand-story-photo" loading="lazy" decoding="async" onError={handleImageFallback} />
          ) : (
            <>
              <span>S</span>
              <small>
                SHRIMOH
                <br />
                EST. 2026
              </small>
            </>
          )}
        </div>
      </section>

      {/*
        GUARANTEE / TRUST STRIP
        Restored to its original position - right after Brand Story, as
        the last curated section before Newsletter/Footer - per direct
        user feedback after seeing it live at the top of the homepage.
        All four icons come from the same LuxIcon set (same stroke
        weight/size) instead of mixing emoji (🔒📦) with text symbols
        (↺✦), which looked inconsistent next to each other.
      */}
      <section className="lux-guarantee-strip">
        <div>
          <span className="lux-guarantee-icon">
            <LuxIcon name="lock" size={26} />
          </span>
          <strong>Secure Payments</strong>
          <p>100% safe checkout via Razorpay.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">
            <LuxIcon name="refresh" size={26} />
          </span>
          <strong>Easy 7-Day Returns</strong>
          <p>Not the right fit? Send it back, hassle-free.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">
            <LuxIcon name="badge-check" size={26} />
          </span>
          <strong>Authentic &amp; Handcrafted</strong>
          <p>Every piece checked before it ships.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">
            <LuxIcon name="box" size={26} />
          </span>
          <strong>Pan-India Shipping</strong>
          <p>Delivered safely, wherever you are.</p>
        </div>
      </section>

      </>
      )}

      {/* PRODUCT DETAIL PAGE - a real full page at /product/:id, not a popup */}
      {isProductPage && !selectedProduct && (
        <div className="lux-product-page-wrap">
          <div className="lux-product-not-found">
            <h1>Product not found</h1>
            <p>This product may have been removed or the link is incorrect.</p>
            <button type="button" className="lux-product-back" onClick={() => navigate("/")}>
              ← Back to shop
            </button>
          </div>
        </div>
      )}

      {isProductPage && selectedProduct && (
        <div className="lux-product-page-wrap">
          <button
            type="button"
            className="lux-product-back"
            onClick={goBackFromProduct}
          >
            ← Back
          </button>

          <div className="lux-product-page">
            <button
              type="button"
              className={`lux-product-wishlist${
                isWishlisted(selectedProduct.id) ? " active" : ""
              }`}
              onClick={() => toggleWishlist(selectedProduct)}
              aria-label={
                isWishlisted(selectedProduct.id)
                  ? "Remove from wishlist"
                  : "Add to wishlist"
              }
            >
              {isWishlisted(selectedProduct.id) ? "♥" : "♡"}
            </button>

            <section className="lux-gallery">
              {(() => {
                const images = getDisplayImages(selectedProduct, detailColor);

                return (
                  <div
                    className="lux-gallery-stage"
                    onTouchStart={handleGalleryTouchStart}
                    onTouchEnd={handleGalleryTouchEnd}
                  >
                    {images.length > 0 ? (
                      <>
                        <div className="lux-main-image">
                          <img
                            key={selectedImage}
                            className="lux-variant-fade"
                            src={selectedImage}
                            alt={getDisplayName(selectedProduct, detailColor)}
                            draggable="false"
                            decoding="async"
                            fetchPriority="high"
                            onError={handleImageFallback}
                          />
                        </div>

                        {images.length > 1 && (
                          <>
                            <button
                              type="button"
                              className="lux-gallery-arrow lux-gallery-prev"
                              onClick={() => changeProductImage("prev")}
                              aria-label="Previous image"
                            >
                              <span>‹</span>
                            </button>

                            <button
                              type="button"
                              className="lux-gallery-arrow lux-gallery-next"
                              onClick={() => changeProductImage("next")}
                              aria-label="Next image"
                            >
                              <span>›</span>
                            </button>
                          </>
                        )}

                        <div className="lux-gallery-counter">
                          {String(selectedImageIndex + 1).padStart(2, "0")}
                          <span>/</span>
                          {String(images.length).padStart(2, "0")}
                        </div>

                        {images.length > 1 && (
                          <div className="lux-gallery-dots">
                            {images.map((image, index) => (
                              <button
                                type="button"
                                key={`${image}-${index}`}
                                className={index === selectedImageIndex ? "active" : ""}
                                onClick={() => selectProductImage(index)}
                                aria-label={`Image ${index + 1}`}
                              />
                            ))}
                          </div>
                        )}

                        <div className="lux-gallery-brand">SHRIMOH</div>
                        <div className="lux-gallery-swipe-label">SWIPE TO EXPLORE</div>
                      </>
                    ) : (
                      <div className="lux-image-empty">
                        <span>SHRIMOH</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>

            <section className="lux-product-info">
              <div className="lux-product-eyebrow">
                {selectedProduct.category || "SHRIMOH COLLECTION"}
              </div>

              <h1 className="lux-product-title lux-variant-fade" key={`title-${detailColor}`}>
                {getDisplayName(selectedProduct, detailColor)}
              </h1>

              <div className="lux-price-row">
                <span className="lux-current-price">
                  ₹{selectedProduct.price.toLocaleString("en-IN")}
                </span>

                {selectedProduct.oldPrice > selectedProduct.price && (
                  <del className="lux-old-price">
                    ₹{selectedProduct.oldPrice.toLocaleString("en-IN")}
                  </del>
                )}

                {selectedProduct.oldPrice > selectedProduct.price && (
                  <span className="lux-discount">
                    {Math.round(
                      ((selectedProduct.oldPrice - selectedProduct.price) /
                        selectedProduct.oldPrice) *
                        100
                    )}
                    % OFF
                  </span>
                )}
              </div>

              <p className="lux-price-note">Tax included · Free delivery on all orders</p>

              {Array.isArray(selectedProduct.colors) && selectedProduct.colors.length > 1 && (
                <div className="lux-color-section">
                  <span className="lux-option-label">
                    COLOR{detailColor ? `: ${detailColor}` : ""}
                  </span>

                  <div className="lux-color-swatches">
                    {selectedProduct.colors.map((color) => {
                      const colorPhotos = selectedProduct.colorImages?.[color];
                      const photo = Array.isArray(colorPhotos) ? colorPhotos[0] : colorPhotos;

                      return (
                        <button
                          key={color}
                          type="button"
                          className={`lux-color-swatch${
                            detailColor === color ? " active" : ""
                          }${photo ? " has-photo" : ""}`}
                          style={
                            photo
                              ? { backgroundImage: `url(${getImageUrl(photo, 80)})` }
                              : { backgroundColor: colorToCss(color) }
                          }
                          onClick={() => selectDetailColor(color)}
                          aria-label={color}
                          aria-pressed={detailColor === color}
                          title={color}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="lux-divider" />

              {selectedProduct.description && (
                <div className="lux-description">
                  <p>{selectedProduct.description}</p>
                </div>
              )}

              <div className="lux-quantity-section">
                <span className="lux-option-label">QUANTITY</span>

                <div className="lux-quantity">
                  <button
                    type="button"
                    onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>

                  <span>{detailQuantity}</span>

                  <button
                    type="button"
                    onClick={() =>
                      setDetailQuantity(
                        Math.min(Number(selectedProduct.stock || 99), detailQuantity + 1)
                      )
                    }
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="lux-product-actions">
                <button
                  type="button"
                  className="lux-add-button"
                  disabled={Number(selectedProduct.stock || 0) <= 0}
                  onClick={() => {
                    addToCart(selectedProduct, detailQuantity, detailColor);
                    setCartOpen(true);
                  }}
                >
                  ADD TO BAG
                  <span>→</span>
                </button>

                <button
                  type="button"
                  className="lux-buy-button"
                  disabled={Number(selectedProduct.stock || 0) <= 0}
                  onClick={buyNow}
                >
                  BUY NOW
                </button>
              </div>

              {Array.isArray(selectedProduct.trustSignals) && selectedProduct.trustSignals.length > 0 && (
                <div className="lux-trust-signals">
                  {selectedProduct.trustSignals.map((signal, index) => (
                    <span className="lux-trust-badge" key={index}>
                      <span className="lux-trust-badge-tick">✓</span>
                      {signal}
                    </span>
                  ))}
                </div>
              )}

              <div className="lux-service-list">
                <div className="lux-service-item">
                  <span>01</span>
                  <div>
                    <strong>PREMIUM QUALITY</strong>
                    <p>Carefully selected materials and refined finishing.</p>
                  </div>
                </div>

                <div className="lux-service-item">
                  <span>02</span>
                  <div>
                    <strong>FREE DELIVERY</strong>
                    <p>On all orders, every time.</p>
                  </div>
                </div>

                <div className="lux-service-item">
                  <span>03</span>
                  <div>
                    <strong>SECURE SHOPPING</strong>
                    <p>Safe and secure checkout.</p>
                  </div>
                </div>
              </div>

              <div className="lux-details">
                <details open>
                  <summary>
                    PRODUCT DETAILS
                    <span>+</span>
                  </summary>

                  <div className="lux-details-content">
                    <p>
                      {selectedProduct.description ||
                        "A refined SHRIMOH piece designed for everyday elegance."}
                    </p>

                    {Array.isArray(selectedProduct.keyFeatures) && selectedProduct.keyFeatures.length > 0 && (
                      <ul className="lux-key-features">
                        {selectedProduct.keyFeatures.map((feature, index) => (
                          <li key={index}>{feature}</li>
                        ))}
                      </ul>
                    )}

                    <div className="lux-specs">
                      <div>
                        <span>Category</span>
                        <strong>{selectedProduct.category || "—"}</strong>
                      </div>

                      <div>
                        <span>Availability</span>
                        <strong>{selectedProduct.stock > 0 ? "In Stock" : "Sold Out"}</strong>
                      </div>

                      <div>
                        <span>Product ID</span>
                        <strong>#{selectedProduct.id}</strong>
                      </div>

                      {selectedProduct.dimensions && (
                        <div>
                          <span>Dimensions</span>
                          <strong>{selectedProduct.dimensions}</strong>
                        </div>
                      )}

                      {selectedProduct.materials && (
                        <div>
                          <span>Materials</span>
                          <strong>{selectedProduct.materials}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </details>

                <details>
                  <summary>
                    SHIPPING & RETURNS
                    <span>+</span>
                  </summary>

                  <div className="lux-details-content">
                    <p>Free delivery is available on all orders.</p>
                    <p>Orders are securely packed and processed with care.</p>
                  </div>
                </details>

                <details>
                  <summary>
                    CARE GUIDE
                    <span>+</span>
                  </summary>

                  <div className="lux-details-content">
                    <p>
                      {selectedProduct.careInstructions ||
                        "Keep your product away from moisture and direct sunlight. Clean gently using a soft cloth."}
                    </p>
                  </div>
                </details>
              </div>
            </section>
          </div>

          {/* YOU MAY ALSO LIKE - other real product pages, buyable there too */}
          {(() => {
            const relatedProducts = getRelatedProducts(selectedProduct);

            if (relatedProducts.length === 0) return null;

            return (
              <div className="lux-related-section">
                <section className="lux-section-header">
                  <div>
                    <span>KEEP EXPLORING</span>
                    <h2>You May Also Like</h2>
                  </div>
                </section>

                <div className="lux-product-grid lux-scroll-row">
                  {expandProductVariants(relatedProducts).map(({ product, color }) =>
                    renderProductCard(product, {
                      keyPrefix: "related",
                      badge: "none",
                      showDiscountPrice: false,
                      forceColor: color,
                    })
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* NEWSLETTER */}
      {!isTrackOrderPage && (
        <section className="lux-newsletter lux-reveal">
          <div className="lux-newsletter-inner">
            <div className="lux-newsletter-copy">
              <span className="lux-newsletter-kicker">STAY IN THE EDIT</span>
              <h2>A little luxury in your inbox.</h2>
              <p>New drops, private offers and styling inspiration.</p>
            </div>

            <form className="lux-newsletter-form" onSubmit={submitNewsletter}>
              <input
                type="email"
                value={newsletterEmail}
                onChange={(event) => {
                  setNewsletterEmail(event.target.value);
                  if (newsletterStatus !== "idle") {
                    setNewsletterStatus("idle");
                    setNewsletterMessage("");
                  }
                }}
                placeholder="Your email address"
                aria-label="Email address"
                disabled={newsletterStatus === "loading" || newsletterStatus === "success"}
                required
              />
              <button
                type="submit"
                disabled={newsletterStatus === "loading" || newsletterStatus === "success"}
              >
                {newsletterStatus === "loading"
                  ? "JOINING..."
                  : newsletterStatus === "success"
                    ? "✓ JOINED"
                    : "JOIN SHRIMOH"}
              </button>
            </form>

            {newsletterMessage && (
              <p
                className={`lux-newsletter-message${
                  newsletterStatus === "error" ? " is-error" : ""
                }`}
                role="status"
              >
                {newsletterMessage}
              </p>
            )}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="lux-footer">
        <div className="lux-footer-top">
          <div className="lux-footer-brand">
            <div className="lux-footer-logo">
              <img src={shrimohIcon} alt="" className="lux-footer-logo-mark" />
              <span>SHRIMOH</span>
            </div>
            <p>THE LUXURY STORE</p>
            <span>Timeless pieces for modern distinction.</span>
          </div>

          <div className="lux-footer-links">
            <div>
              <strong>SHOP</strong>
              <button onClick={goToShopAll}>All Products</button>

              {categories.slice(1, 5).map((category) => (
                <button key={category} onClick={() => goToCategory(category)}>
                  {category}
                </button>
              ))}
            </div>

            <div>
              <strong>HELP</strong>
              <button type="button" onClick={() => openInfoPage("contact")}>
                Contact Us
              </button>
              <button type="button" onClick={() => navigate("/track-order")}>
                Track Order
              </button>
              <button type="button" onClick={() => openInfoPage("shipping")}>
                Shipping
              </button>
              <button type="button" onClick={() => openInfoPage("returns")}>
                Returns
              </button>
            </div>

            <div>
              <strong>ABOUT</strong>
              <button type="button" onClick={() => openInfoPage("about")}>
                Our Story
              </button>
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </div>

            {/*
             * No separate "CUSTOMER" column (Wishlist/My Bag links) here
             * anymore - per direct user feedback (2026-09-30): both are
             * redundant with the icons already always visible in the top
             * header (search/track-order/wishlist/bag), same reasoning
             * that removed these from the mobile drawer earlier the same
             * day. Grid below changed from 4 to 3 columns to match.
             */}
          </div>
        </div>

        <div className="lux-footer-bottom">
          <span>© 2026 SHRIMOH. ALL RIGHTS RESERVED.</span>

          <div className="lux-footer-legal">
            <button type="button" onClick={() => openInfoPage("privacy")}>
              Privacy Policy
            </button>
            <button type="button" onClick={() => openInfoPage("terms")}>
              Terms & Conditions
            </button>
          </div>
        </div>
      </footer>

      {/*
        WHATSAPP FLOATING BUTTON
        Hidden while the welcome offer popup is showing - both live in the
        same bottom corner area on small phone screens, and stacking them
        looked cramped/overlapping. It reappears the moment the offer is
        dismissed (or was never shown, for returning visitors).
      */}
      {!showWelcomeOffer && (
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noreferrer"
          className="lux-whatsapp-float"
          aria-label="Chat with us on WhatsApp"
        >
          <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M16.004 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.258.59 4.376 1.62 6.213L3.2 28.8l6.77-1.776a12.74 12.74 0 0 0 6.034 1.536h.005c7.07 0 12.8-5.73 12.8-12.8s-5.73-12.56-12.805-12.56zm0 23.36a10.5 10.5 0 0 1-5.353-1.466l-.384-.228-4.017 1.054 1.073-3.916-.25-.402a10.55 10.55 0 0 1-1.616-5.622c0-5.83 4.744-10.573 10.577-10.573 2.826 0 5.48 1.1 7.478 3.098a10.5 10.5 0 0 1 3.096 7.48c0 5.83-4.744 10.575-10.578 10.575zm5.79-7.918c-.317-.16-1.876-.926-2.167-1.032-.29-.107-.502-.16-.714.16-.21.318-.82 1.032-1.005 1.244-.185.213-.37.24-.687.08-.317-.16-1.338-.494-2.548-1.575-.942-.84-1.578-1.877-1.762-2.195-.185-.318-.02-.49.14-.65.143-.142.318-.37.476-.556.16-.185.212-.318.318-.53.106-.213.053-.398-.027-.558-.08-.16-.714-1.723-.978-2.36-.257-.617-.518-.534-.714-.544l-.608-.01c-.213 0-.558.08-.85.398-.29.318-1.11 1.084-1.11 2.646 0 1.562 1.137 3.07 1.296 3.283.16.212 2.238 3.417 5.42 4.79.758.328 1.35.523 1.81.67.76.242 1.452.208 1.998.126.61-.09 1.876-.766 2.14-1.507.264-.74.264-1.375.185-1.507-.08-.133-.29-.213-.607-.373z" />
          </svg>
        </a>
      )}

      {/* NEW CUSTOMER WELCOME OFFER (small corner popup, first visit only) - hidden on the Track Order page, where it just gets in the way */}
      {showWelcomeOffer && !isTrackOrderPage && (
        <div className="lux-welcome-offer" role="dialog" aria-label="New customer offer">
          <button
            type="button"
            className="lux-welcome-offer-close"
            aria-label="Close"
            onClick={dismissWelcomeOffer}
          >
            ×
          </button>

          <span className="lux-welcome-offer-kicker">WELCOME TO SHRIMOH</span>
          <h3>{NEW_CUSTOMER_OFFER_TEXT} for new customers</h3>
          <p>
            Use code <strong>{NEW_CUSTOMER_OFFER_CODE}</strong> at checkout on your first order.
          </p>

          <button type="button" className="lux-welcome-offer-cta" onClick={dismissWelcomeOffer}>
            Shop now
          </button>
        </div>
      )}

      {/* CART DRAWER */}
      {cartOpen && (
        <div
          className="lux-cart-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCartOpen(false);
              document.body.style.overflow = "";
            }
          }}
        >
          <aside className="lux-cart">
            <div className="lux-cart-header">
              <div>
                <span>YOUR SELECTION</span>
                <h2>Shopping Bag</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  document.body.style.overflow = "";
                }}
              >
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="lux-cart-empty">
                <div>♡</div>
                <h3>Your bag is empty</h3>
                <p>Discover something beautiful.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    document.body.style.overflow = "";
                  }}
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            ) : (
              <>
                <div className="lux-cart-items">
                  {cart.map((item, index) => {
                    // BUG FIX (2026-09-20): this used to always show the
                    // FIRST photo across every color (getProductImages),
                    // so a Tan item's cart thumbnail could show Black's
                    // photo while the "Color: Tan" text right next to it
                    // was correct - same class of bug as the earlier
                    // gallery color-swap fix. Now uses that item's own
                    // selected color's photo, same as the product page.
                    const image = getDisplayImages(item, item.selectedColor)[0];

                    return (
                      <div className="lux-cart-item" key={`${item.id}-${index}`}>
                        <div className="lux-cart-item-image">
                          {image && <img src={image} alt={item.name} />}
                        </div>

                        <div className="lux-cart-item-info">
                          <span>{item.category || "COLLECTION"}</span>
                          <h3>{item.name}</h3>
                          {item.selectedColor && (
                            <span className="lux-cart-item-color">
                              Color: {item.selectedColor}
                            </span>
                          )}
                          <strong>₹{(item.price * item.quantity).toLocaleString("en-IN")}</strong>

                          <div className="lux-cart-controls">
                            <button type="button" onClick={() => updateCartQuantity(index, -1)}>
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button type="button" onClick={() => updateCartQuantity(index, 1)}>
                              +
                            </button>
                            <button
                              className="lux-remove"
                              type="button"
                              onClick={() => removeFromCart(index)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="lux-cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>₹{totalPrice.toLocaleString("en-IN")}</strong>
                  </div>

                  <div>
                    <span>Delivery</span>
                    <strong>{deliveryCharge === 0 ? "FREE" : `₹${deliveryCharge}`}</strong>
                  </div>

                  <div className="lux-total">
                    <span>Total</span>
                    <strong>₹{checkoutTotal.toLocaleString("en-IN")}</strong>
                  </div>

                  <button type="button" className="lux-checkout-button" onClick={openCheckout}>
                    PROCEED TO CHECKOUT
                    <span>→</span>
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* WISHLIST DRAWER */}
      {wishlistOpen && (
        <div
          className="lux-wishlist-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setWishlistOpen(false);
              document.body.style.overflow = "";
            }
          }}
        >
          <aside className="lux-wishlist">
            <div className="lux-wishlist-header">
              <div>
                <span>YOUR FAVOURITES</span>
                <h2>Wishlist</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWishlistOpen(false);
                  document.body.style.overflow = "";
                }}
              >
                ×
              </button>
            </div>

            {wishlistItems.length === 0 ? (
              <div className="lux-wishlist-empty">
                <div>♡</div>
                <h3>Your wishlist is empty</h3>
                <p>Save pieces you love for later.</p>
                <button
                  type="button"
                  onClick={() => {
                    setWishlistOpen(false);
                    document.body.style.overflow = "";
                  }}
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            ) : (
              <div className="lux-wishlist-items">
                {wishlistItems.map((item) => {
                  const image = getProductImages(item)[0];
                  const isSoldOut = Number(item.stock || 0) <= 0;

                  return (
                    <div
                      className="lux-wishlist-item"
                      key={item.id}
                      onClick={() => {
                        setWishlistOpen(false);
                        document.body.style.overflow = "";
                        openProduct(item);
                      }}
                    >
                      <div className="lux-wishlist-item-image">
                        {image && <img src={image} alt={item.name} />}
                      </div>

                      <div className="lux-wishlist-item-info">
                        <span>{item.category || "COLLECTION"}</span>
                        <h3>{item.name}</h3>
                        <strong>₹{item.price.toLocaleString("en-IN")}</strong>

                        <div
                          className="lux-wishlist-item-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="lux-wishlist-move-to-cart"
                            disabled={isSoldOut}
                            onClick={() => moveWishlistItemToCart(item)}
                          >
                            {isSoldOut ? "SOLD OUT" : "MOVE TO BAG"}
                          </button>

                          <button
                            type="button"
                            className="lux-wishlist-remove"
                            onClick={() => removeFromWishlist(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {/*
       * QUICK VIEW MODAL - added 2026-09-20. Lets a customer preview a
       * product (photo, name, price, colors, Add to Cart) right from
       * the shop grid without a full page navigation, same idea as
       * miramoss.com's "Quick View". Reuses the same overlay/close
       * pattern as the Info/Trust pages below.
       */}
      {quickViewProduct && (
        <div
          className="lux-info-overlay lux-quickview-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQuickView();
          }}
        >
          <div className="lux-quickview-page">
            <button
              type="button"
              className="lux-info-close"
              onClick={closeQuickView}
              aria-label="Close quick view"
            >
              ×
            </button>

            {(() => {
              const qvColors = Array.isArray(quickViewProduct.colors) ? quickViewProduct.colors : [];
              const qvImages = getDisplayImages(quickViewProduct, quickViewColor);
              const qvImage = qvImages[0];
              const qvName = getDisplayName(quickViewProduct, quickViewColor);
              const qvHasDiscount = quickViewProduct.oldPrice > quickViewProduct.price;
              const qvSoldOut = Number(quickViewProduct.stock || 0) <= 0;
              const qvStock = Number(quickViewProduct.stock || 0);

              return (
                <>
                  <div className="lux-quickview-image">
                    {qvImage ? (
                      <img src={qvImage} alt={qvName} />
                    ) : (
                      <div className="lux-card-placeholder">SHRIMOH</div>
                    )}
                  </div>

                  <div className="lux-quickview-info">
                    <span className="lux-product-eyebrow">
                      {quickViewProduct.category || "SHRIMOH COLLECTION"}
                    </span>
                    <h2>{qvName}</h2>

                    <div className="lux-price-row">
                      <span className="lux-current-price">
                        ₹{quickViewProduct.price.toLocaleString("en-IN")}
                      </span>
                      {qvHasDiscount && (
                        <del className="lux-old-price">
                          ₹{quickViewProduct.oldPrice.toLocaleString("en-IN")}
                        </del>
                      )}
                    </div>

                    {qvColors.length > 1 && (
                      <div className="lux-color-section">
                        <span className="lux-option-label">
                          COLOR{quickViewColor ? `: ${quickViewColor}` : ""}
                        </span>
                        <div className="lux-color-swatches">
                          {qvColors.map((color) => {
                            const colorPhotos = quickViewProduct.colorImages?.[color];
                            const photo = Array.isArray(colorPhotos) ? colorPhotos[0] : colorPhotos;

                            return (
                              <button
                                key={color}
                                type="button"
                                className={`lux-color-swatch${
                                  quickViewColor === color ? " active" : ""
                                }${photo ? " has-photo" : ""}`}
                                style={
                                  photo
                                    ? { backgroundImage: `url(${getImageUrl(photo, 80)})` }
                                    : { backgroundColor: colorToCss(color) }
                                }
                                onClick={() => setQuickViewColor(color)}
                                aria-label={color}
                                aria-pressed={quickViewColor === color}
                                title={color}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="lux-quickview-quantity">
                      <span className="lux-option-label">QUANTITY</span>
                      <div className="lux-quantity-controls">
                        <button
                          type="button"
                          onClick={() => setQuickViewQuantity((q) => Math.max(1, q - 1))}
                          disabled={quickViewQuantity <= 1}
                        >
                          −
                        </button>
                        <span>{quickViewQuantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuickViewQuantity((q) => Math.min(qvStock || 99, q + 1))
                          }
                          disabled={quickViewQuantity >= (qvStock || 99)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="lux-quickview-actions">
                      <button
                        type="button"
                        className="lux-quickview-add"
                        disabled={qvSoldOut}
                        onClick={addToCartFromQuickView}
                      >
                        {qvSoldOut ? "SOLD OUT" : "ADD TO BAG"}
                      </button>

                      <button
                        type="button"
                        className="lux-quickview-full"
                        onClick={() => {
                          closeQuickView();
                          openProduct(quickViewProduct, quickViewColor);
                        }}
                      >
                        View full details →
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* INFO / TRUST PAGE (About, Contact, Shipping, Returns, Privacy, Terms) */}
      {activePage && INFO_PAGES[activePage] && (
        <div
          className="lux-info-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeInfoPage();
            }
          }}
        >
          <div className="lux-info-page">
            <button
              type="button"
              className="lux-info-close"
              onClick={closeInfoPage}
              aria-label="Close"
            >
              ×
            </button>

            <div className="lux-info-content">
              <span className="lux-info-eyebrow">{INFO_PAGES[activePage].eyebrow}</span>
              <h1>{INFO_PAGES[activePage].title}</h1>
              {INFO_PAGES[activePage].body}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE NAV DRAWER */}
      {mobileMenuOpen && (
        <div
          className="lux-mobile-nav-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeMobileMenu();
            }
          }}
        >
          <aside className="lux-mobile-nav">
            <div className="lux-mobile-nav-header">
              <div className="lux-logo">
                <span>SHRIMOH</span>
                <small>THE LUXURY STORE</small>
              </div>

              <button type="button" onClick={closeMobileMenu} aria-label="Close menu">
                ×
              </button>
            </div>

            <nav
              className={`lux-mobile-nav-links ${
                mobileNavPanel ? "lux-mobile-nav-panel-open" : ""
              }`}
            >
              <div className="lux-mobile-nav-screen lux-mobile-nav-screen-main">
                <button
                  type="button"
                  style={{ "--lux-nav-stagger": 0 }}
                  className={isShopAllPage ? "active" : ""}
                  onClick={() => {
                    goToShopAll();
                    closeMobileMenu();
                  }}
                >
                  SHOP ALL
                </button>

                <button
                  type="button"
                  style={{ "--lux-nav-stagger": 1 }}
                  onClick={() => {
                    closeMobileMenu();
                    scrollToSection("lux-new-arrivals");
                  }}
                >
                  NEW ARRIVALS
                </button>

                <button
                  type="button"
                  style={{ "--lux-nav-stagger": 2 }}
                  className={
                    selectedCategory === ALL_BAGS_LABEL ||
                    bagNavCategories.includes(selectedCategory)
                      ? "active"
                      : ""
                  }
                  onClick={() => setMobileNavPanel("bags")}
                >
                  BAGS <LuxIcon name="chevron-right" size={14} />
                </button>

                {accessoryNavCategories.length > 0 && (
                  <button
                    type="button"
                    style={{ "--lux-nav-stagger": 3 }}
                    className={accessoryNavCategories.includes(selectedCategory) ? "active" : ""}
                    onClick={() => setMobileNavPanel("accessories")}
                  >
                    ACCESSORIES <LuxIcon name="chevron-right" size={14} />
                  </button>
                )}

                <button
                  type="button"
                  style={{ "--lux-nav-stagger": 4 }}
                  onClick={() => {
                    closeMobileMenu();
                    openInfoPage("about");
                  }}
                >
                  ABOUT
                </button>
              </div>

              {/*
                SUB-SCREEN - slides in from the right when "BAGS" or
                "ACCESSORIES" is tapped above, exactly like
                miramoss.com's mobile menu: the real categories
                (Handbags, Sling Bags, Tote Bags... / Wallets,
                Clutches...) only show up once you tap into the
                group, with a "Back" row to return to the main list.
              */}
              <div className="lux-mobile-nav-screen lux-mobile-nav-screen-sub">
                <button
                  type="button"
                  className="lux-mobile-nav-back"
                  onClick={() => setMobileNavPanel(null)}
                >
                  <LuxIcon name="chevron-left" size={14} /> Back
                </button>

                {mobileNavPanel && (
                  <>
                    <div className="lux-mobile-nav-sub-title">
                      {mobileNavPanel === "bags" ? "Bags" : "Accessories"}
                    </div>

                    {mobileNavPanel === "bags" && (
                      <>
                        <button
                          type="button"
                          className={selectedCategory === ALL_BAGS_LABEL ? "active" : ""}
                          onClick={() => {
                            goToCategory(ALL_BAGS_LABEL);
                            closeMobileMenu();
                          }}
                        >
                          All Bags
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMobileMenu();
                            scrollToSection("lux-bestsellers");
                          }}
                        >
                          Bestsellers
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMobileMenu();
                            scrollToSection("lux-new-arrivals");
                          }}
                        >
                          New Arrivals
                        </button>
                        <div className="lux-mobile-nav-sub-divider" />
                      </>
                    )}

                    {(mobileNavPanel === "bags" ? bagNavCategories : accessoryNavCategories).map(
                      (category) => (
                        <button
                          key={category}
                          type="button"
                          className={selectedCategory === category ? "active" : ""}
                          onClick={() => {
                            goToCategory(category);
                            closeMobileMenu();
                          }}
                        >
                          {category}
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </nav>

            {/*
             * No Wishlist/Shopping Bag/Track Order buttons here anymore -
             * per direct user feedback (2026-09-30): all three are
             * redundant with the icons already always visible in the top
             * header (search/track-order/wishlist/bag), so repeating them
             * at the bottom of this drawer didn't add anything.
             */}
          </aside>
        </div>
      )}

      {/* CHECKOUT */}
      {checkoutOpen && (
        <div className="lux-checkout-overlay">
          <div className="lux-checkout">
            <div className="lux-checkout-topbar">
              <div className="lux-checkout-logo">SHRIMOH</div>
              <div>SECURE CHECKOUT</div>
              <button type="button" className="lux-checkout-close" onClick={closeCheckout}>
                ×
              </button>
            </div>

            {orderPlaced ? (
              <div className="lux-order-success">
                <div className="lux-success-ring">
                  <span>✓</span>
                </div>

                <span className="lux-success-label">ORDER CONFIRMED</span>

                <h1>Thank you.</h1>

                <p>Your SHRIMOH order has been received successfully.</p>

                {orderReference && (
                  <div className="lux-order-reference">
                    ORDER
                    <strong>#{orderReference}</strong>
                  </div>
                )}

                <div className="lux-success-line" />

                <div className="lux-success-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderPlaced(false);
                      setCheckoutOpen(false);
                      setDirectBuyItem(null);

                      document.body.style.overflow = "";
                    }}
                  >
                    CONTINUE SHOPPING
                  </button>

                  {orderReference && (
                    <button
                      type="button"
                      className="lux-success-track-btn"
                      onClick={() => {
                        resetTrackSearch();
                        setTrackReference(orderReference);
                        setTrackContact(customer.mobile || customer.email || "");
                        setOrderPlaced(false);
                        setCheckoutOpen(false);
                        setDirectBuyItem(null);
                        document.body.style.overflow = "";
                        navigate("/track-order");
                      }}
                    >
                      TRACK YOUR ORDER
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="lux-checkout-heading">
                  <div>
                    <span>01 · DELIVERY</span>
                    <h1>Complete your order</h1>
                    <p>Where should we send your SHRIMOH selection?</p>
                  </div>

                  <div className="lux-checkout-secure">
                    <span>🔒</span>
                    <div>
                      <strong>SECURE</strong>
                      <small>100% protected checkout</small>
                    </div>
                  </div>
                </div>

                <div className="lux-checkout-progress">
                  <div className="active">
                    <span>01</span>
                    <strong>DELIVERY</strong>
                  </div>
                  <div>
                    <span>02</span>
                    <strong>PAYMENT</strong>
                  </div>
                  <div>
                    <span>03</span>
                    <strong>CONFIRMATION</strong>
                  </div>
                </div>

                <form onSubmit={placeOrder} className="lux-checkout-grid">
                  <div className="lux-customer-form">
                    <div className="lux-form-title">
                      <span>SHIPPING DETAILS</span>
                      <h2>Delivery information</h2>
                    </div>

                    {customerAutofilled && (
                      <div className="lux-autofill-note">
                        Filled in from your last order on this device - change anything that's
                        different this time.
                      </div>
                    )}

                    <label>
                      FULL NAME
                      <input
                        required
                        value={customer.name}
                        onChange={(e) => handleCustomerChange("name", e.target.value)}
                        placeholder="Enter your full name"
                        autoComplete="name"
                      />
                    </label>

                    <div className="lux-form-row">
                      <label>
                        MOBILE NUMBER
                        <input
                          required
                          type="tel"
                          value={customer.mobile}
                          onChange={(e) => handleCustomerChange("mobile", e.target.value)}
                          placeholder="10 digit mobile number"
                          inputMode="numeric"
                          maxLength={10}
                          pattern="[0-9]{10}"
                          autoComplete="tel"
                        />
                        <small className="lux-input-help">{customer.mobile.length}/10 digits</small>
                      </label>

                      <label>
                        EMAIL ADDRESS
                        <input
                          required
                          type="email"
                          value={customer.email}
                          onChange={(e) => handleCustomerChange("email", e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                      </label>
                    </div>

                    <label>
                      FULL ADDRESS
                      <textarea
                        required
                        value={customer.address}
                        onChange={(e) => handleCustomerChange("address", e.target.value)}
                        placeholder="House / Flat / Street / Area"
                        autoComplete="street-address"
                      />
                    </label>

                    <div className="lux-form-row three">
                      <label>
                        CITY
                        <input
                          required
                          value={customer.city}
                          onChange={(e) => handleCustomerChange("city", e.target.value)}
                          placeholder="City"
                          autoComplete="address-level2"
                        />
                      </label>

                      <label>
                        STATE
                        <input
                          required
                          value={customer.state}
                          onChange={(e) => handleCustomerChange("state", e.target.value)}
                          placeholder="State"
                          autoComplete="address-level1"
                        />
                      </label>

                      <label>
                        PINCODE
                        <input
                          required
                          type="text"
                          value={customer.pincode}
                          onChange={(e) => handleCustomerChange("pincode", e.target.value)}
                          placeholder="6 digit pincode"
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          autoComplete="postal-code"
                        />
                        <small className="lux-input-help">{customer.pincode.length}/6 digits</small>
                      </label>
                    </div>

                    <div className="lux-checkout-note">
                      <span>✓</span>
                      <p>Your information is used only to process and deliver your order securely.</p>
                    </div>
                  </div>

                  <aside className="lux-order-summary">
                    <div className="lux-summary-heading">
                      <span>YOUR SELECTION</span>
                      <h2>Order summary</h2>
                    </div>

                    <div className="lux-summary-products">
                      {checkoutItems.map((item, index) => {
                        // Same color-aware fix as the cart drawer above -
                        // show this item's own selected color's photo,
                        // not always the first color's photo.
                        const image = getDisplayImages(item, item.selectedColor)[0];

                        return (
                          <div className="lux-summary-item" key={`${item.id}-${index}`}>
                            <div className="lux-summary-image">
                              {image && <img src={image} alt={item.name} />}
                              <span>{item.quantity}</span>
                            </div>

                            <section>
                              <span>{item.category || "COLLECTION"}</span>
                              <h3>{item.name}</h3>
                              {item.selectedColor && (
                                <span className="lux-cart-item-color">
                                  Color: {item.selectedColor}
                                </span>
                              )}
                            </section>

                            <strong>₹{(item.price * item.quantity).toLocaleString("en-IN")}</strong>
                          </div>
                        );
                      })}
                    </div>

                    <div className="lux-coupon-box">
                      {appliedCoupon ? (
                        <div className="lux-coupon-applied">
                          <span>
                            ✓ Coupon <strong>{appliedCoupon.code}</strong> applied
                          </span>
                          <button type="button" onClick={removeCoupon}>
                            REMOVE
                          </button>
                        </div>
                      ) : (
                        <div className="lux-coupon-input-row">
                          <input
                            type="text"
                            value={couponCode}
                            onChange={(e) => {
                              setCouponCode(e.target.value.toUpperCase());
                              if (couponError) setCouponError("");
                            }}
                            placeholder="ENTER COUPON CODE"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                applyCoupon();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={applyCoupon}
                            disabled={couponLoading}
                          >
                            {couponLoading ? "..." : "APPLY"}
                          </button>
                        </div>
                      )}

                      {couponError && <p className="lux-coupon-error">{couponError}</p>}
                    </div>

                    <div className="lux-summary-lines">
                      <div>
                        <span>Subtotal</span>
                        <strong>₹{checkoutSubtotal.toLocaleString("en-IN")}</strong>
                      </div>

                      <div>
                        <span>Delivery</span>
                        <strong>
                          {checkoutDeliveryCharge === 0 ? "FREE" : `₹${checkoutDeliveryCharge}`}
                        </strong>
                      </div>

                      {appliedCoupon && (
                        <div className="lux-summary-discount">
                          <span>Discount ({appliedCoupon.code})</span>
                          <strong>−₹{checkoutDiscount.toLocaleString("en-IN")}</strong>
                        </div>
                      )}

                      <div className="lux-summary-grand">
                        <span>TOTAL</span>
                        <strong>₹{checkoutGrandTotal.toLocaleString("en-IN")}</strong>
                      </div>
                    </div>

                    <button type="submit" className="lux-place-order" disabled={orderLoading}>
                      {orderLoading ? "PROCESSING..." : "PLACE ORDER"}
                      {!orderLoading && <span>→</span>}
                    </button>

                    <div className="lux-payment-trust">
                      <span>🔒</span>
                      <div>
                        <strong>100% SECURE PAYMENT</strong>
                        <p>Your payment details are protected and securely processed.</p>
                      </div>
                    </div>

                    <div className="lux-accepted">
                      <span>WE ACCEPT</span>
                      <div>
                        <b>UPI</b>
                        <b>VISA</b>
                        <b>RuPay</b>
                        <b>MC</b>
                      </div>
                    </div>
                  </aside>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * TRACK ORDER PAGE
 * A real, full page (rendered at /track-order) rather than a
 * popup/modal - gives it room to be as detailed as a proper
 * e-commerce order-tracking page, and can never visually clash
 * with other on-page popups the way an overlay can.
 */
const ORDER_TRACKING_STEPS = ["Received", "Confirmed", "Processing", "Shipped", "Delivered"];

function TrackOrderPage({
  trackReference,
  setTrackReference,
  trackContact,
  setTrackContact,
  trackLoading,
  trackError,
  trackResult,
  lookupOrder,
  resetTrackSearch,
  navigate,
}) {
  return (
    <div className="lux-track-page">
      <section className="lux-track-page-hero">
        <span className="lux-track-page-kicker">WHERE'S MY ORDER</span>
        <h1>Track Your Order</h1>
        <p>
          Enter your order reference and the mobile number or email you used at checkout to see
          live status, courier details and tracking.
        </p>
      </section>

      <div className="lux-track-page-body">
        <div className="lux-track-page-form-card">
          <h2>Find Your Order</h2>

          <form onSubmit={lookupOrder}>
            <label>
              Order Reference
              <input
                type="text"
                value={trackReference}
                onChange={(e) => setTrackReference(e.target.value)}
                placeholder="e.g. LUX-172..."
              />
            </label>

            <label>
              Mobile Number or Email
              <input
                type="text"
                value={trackContact}
                onChange={(e) => setTrackContact(e.target.value)}
                placeholder="9876543210 or you@email.com"
              />
            </label>

            {trackError && <p className="lux-track-page-error">{trackError}</p>}

            <button type="submit" disabled={trackLoading}>
              {trackLoading ? "SEARCHING..." : "TRACK ORDER"}
            </button>
          </form>

          <div className="lux-track-page-help">
            <span>NEED HELP?</span>
            <p>
              Your order reference was emailed to you when you placed the order, and was also
              shown on the order confirmation screen.
            </p>
          </div>
        </div>

        <div className="lux-track-page-results">
          {!trackResult ? (
            <div className="lux-track-page-empty">
              <div className="lux-track-page-steps">
                <div>
                  <span>01</span>
                  <strong>Enter Your Details</strong>
                  <p>Your order reference, plus the mobile number or email used at checkout.</p>
                </div>
                <div>
                  <span>02</span>
                  <strong>See Live Status</strong>
                  <p>Received, Confirmed, Processing, Shipped or Delivered - kept up to date by our team.</p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Track With Courier</strong>
                  <p>Once it ships, get the courier name, tracking number and a direct tracking link.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="lux-track-page-result">
              <button type="button" className="lux-track-page-back" onClick={resetTrackSearch}>
                ← Track another order
              </button>

              <div className="lux-track-page-summary">
                <div>
                  <span>ORDER #{trackResult.order.orderReference}</span>
                  {trackResult.customerName && <h2>Hi {trackResult.customerName},</h2>}
                </div>
                {trackResult.order.createdAt && (
                  <em>
                    Placed on{" "}
                    {new Date(trackResult.order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </em>
                )}
              </div>

              {trackResult.order.status === "Cancelled" ? (
                <div className="lux-track-page-cancelled">This order has been cancelled.</div>
              ) : (
                <div className="lux-track-page-timeline">
                  {ORDER_TRACKING_STEPS.map((step, index) => {
                    const currentIndex = ORDER_TRACKING_STEPS.indexOf(trackResult.order.status);
                    const isDone = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    const historyEntry = trackResult.statusHistory.find((h) => h.status === step);
                    return (
                      <div
                        key={step}
                        className={`lux-track-page-step${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}
                      >
                        <span className="lux-track-page-dot" />
                        <strong>{step}</strong>
                        {historyEntry?.at && (
                          <em>
                            {new Date(historyEntry.at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </em>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(trackResult.order.courierName || trackResult.order.trackingNumber) && (
                <div className="lux-track-page-courier">
                  <div>
                    {trackResult.order.courierName && (
                      <span>
                        Courier <strong>{trackResult.order.courierName}</strong>
                      </span>
                    )}
                    {trackResult.order.trackingNumber && (
                      <span>
                        Tracking No. <strong>{trackResult.order.trackingNumber}</strong>
                      </span>
                    )}
                  </div>
                  {trackResult.order.trackingUrl && (
                    <a href={trackResult.order.trackingUrl} target="_blank" rel="noopener noreferrer">
                      TRACK WITH COURIER →
                    </a>
                  )}
                </div>
              )}

              <h3>Order Summary</h3>

              <div className="lux-track-page-items">
                {trackResult.order.items.map((item, index) => (
                  <div className="lux-track-page-item" key={index}>
                    <div className="lux-track-page-item-image">
                      {item.image && <img src={item.image} alt={item.name} />}
                    </div>
                    <div className="lux-track-page-item-info">
                      <strong>{item.name}</strong>
                      {item.selectedColor && <em>Color: {item.selectedColor}</em>}
                      <span>Qty {item.quantity}</span>
                    </div>
                    <div className="lux-track-page-item-price">
                      ₹{Number(item.lineTotal || item.price * item.quantity).toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>

              <div className="lux-track-page-total">
                <span>Order Total</span>
                <strong>₹{Number(trackResult.order.total).toLocaleString("en-IN")}</strong>
              </div>

              <button type="button" className="lux-track-page-continue" onClick={() => navigate("/")}>
                CONTINUE SHOPPING
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
