const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

function createAdminToken() {
  const payload = { role: "admin", email: ADMIN_EMAIL, exp: Date.now() + 8 * 60 * 60 * 1000 };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_JWT_SECRET).update(encodedPayload).digest("base64url");
  return encodedPayload + "." + signature;
}

function verifyAdminToken(token) {
  try {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encodedPayload, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", ADMIN_JWT_SECRET).update(encodedPayload).digest("base64url");
    if (signature.length !== expectedSignature.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return false;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.role !== "admin") return false;
    if (!payload.exp || payload.exp < Date.now()) return false;
    return payload;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Admin authentication required." });
  }
  const token = authHeader.slice(7);
  const admin = verifyAdminToken(token);
  if (!admin) {
    return res.status(401).json({ success: false, message: "Invalid or expired admin token." });
  }
  req.admin = admin;
  next();
}

const app = express();

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

/*
 * Optional - only needed for the "✨ Generate Premium Content" AI
 * writer button in Import Product. Everything else keeps working
 * fine without it; that one button just shows a clear error until
 * this is set in Render's environment variables. Uses Google's
 * Gemini API because it has a genuine no-card free tier - get a
 * key at aistudio.google.com. If Google renames/retires the model
 * below, override it with a GEMINI_MODEL env var (no code change
 * needed) - current model names are listed at
 * ai.google.dev/gemini-api/docs/models.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
/*
 * Image-generation model (separate from the text model above).
 * "gemini-2.5-flash-image" (aka "Nano Banana") is the model name
 * confirmed at the time this was written - Google ships new image
 * models fairly often, so if this stops working, check the exact
 * current model id at ai.google.dev/gemini-api/docs/models and put
 * it in a GEMINI_IMAGE_MODEL env var on Render (no code change
 * needed). Image generation is billed separately from text and is
 * often NOT covered by the free tier - check
 * ai.google.dev/gemini-api/docs/pricing before generating in bulk.
 */
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

const requiredEnv = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY],
  ["RAZORPAY_KEY_ID", RAZORPAY_KEY_ID],
  ["RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET]
];

const missingEnv = requiredEnv.filter(([, value]) => !value).map(([name]) => name);
if (missingEnv.length > 0) {
  console.error("❌ Missing environment variables:", missingEnv.join(", "));
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const razorpay = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

/*
 * ORDER CONFIRMATION EMAIL
 *
 * TWO WAYS to send this, tried in this order:
 *
 * 1) BREVO_API_KEY (recommended - this is what actually works on
 *    Render). Render's outbound network blocks/hangs on raw SMTP
 *    connections (port 465/587) even with a 100% correct Gmail
 *    account + App Password - that's the "Connection timeout" /
 *    ETIMEDOUT error. Brevo's API is plain HTTPS (port 443, same as
 *    any normal web request), so it is NOT affected by that block.
 *    Free plan: ~300 emails/day, no credit card needed.
 *      1. Sign up free at brevo.com
 *      2. Settings -> Senders, Domains & Dedicated IPs -> add
 *         GMAIL_USER (below) as a sender -> click the confirmation
 *         link Brevo emails to that address
 *      3. SMTP & API -> API Keys -> generate a new key
 *      4. Set BREVO_API_KEY on Render to that key
 *
 * 2) GMAIL_USER / GMAIL_APP_PASSWORD via raw Gmail SMTP - only used
 *    when BREVO_API_KEY is not set. Works fine when running this
 *    server somewhere that doesn't block outbound SMTP (e.g. your
 *    own machine), but do NOT rely on this on Render.
 *
 * Either way GMAIL_USER doubles as the "from" address shown to the
 * customer (display name is always forced to "SHRIMOH" below,
 * regardless of which one is used).
 *
 * If neither is configured, email sending is silently skipped
 * (order saving is never affected either way).
 */
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

/*
 * Kept as a fallback (see comment above) - not used on Render once
 * BREVO_API_KEY is set, but harmless to leave configured.
 */
const mailTransporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
      })
    : null;

/*
 * Sends one transactional email through Brevo's HTTPS API
 * (api.brevo.com) - see the big comment above for why this is used
 * instead of SMTP on Render. Throws on failure so the caller's
 * try/catch can log it exactly like a failed SMTP send.
 */
async function sendViaBrevoApi({ to, customerName, subject, html }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: "SHRIMOH", email: GMAIL_USER },
      to: [{ email: to, name: customerName || undefined }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Brevo API error ${response.status}: ${errorBody}`);
  }
}

/*
 * Shared "actually send this email" step - both the order
 * confirmation email and the shipping-update email below build
 * their own HTML, then hand it to this one function so the
 * Brevo-vs-SMTP branching only lives in one place.
 */
async function sendTransactionalEmail({ to, customerName, subject, html }) {
  if (!to) return;
  if (!BREVO_API_KEY && !mailTransporter) {
    console.warn("Email skipped: set BREVO_API_KEY (recommended), or GMAIL_USER / GMAIL_APP_PASSWORD.");
    return;
  }

  if (BREVO_API_KEY) {
    await sendViaBrevoApi({ to, customerName, subject, html });
    return;
  }

  await mailTransporter.sendMail({
    from: `"SHRIMOH" <${GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

/*
 * SHARED EMAIL "SHELL" - the cream/ink/gold look, matching the
 * storefront's own colors (see App.css --lux-* variables). Both
 * emails below build their own middle section, then wrap it with
 * this so every customer email looks like one consistent brand
 * instead of a plain system notification.
 */
const EMAIL_BRAND = {
  cream: "#fbf7ee",
  paper: "#ffffff",
  ink: "#1c150d",
  text: "#3a2f20",
  muted: "#7d6c4f",
  gold: "#b1a181",
  line: "#e7ddc4",
  soft: "#f5f0e2"
};

function emailShell({ eyebrow, heading, bodyHtml }) {
  return `
  <div style="background:${EMAIL_BRAND.cream};padding:32px 12px;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:560px;margin:0 auto;background:${EMAIL_BRAND.paper};border:1px solid ${EMAIL_BRAND.line};border-radius:10px;overflow:hidden;">
      <div style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid ${EMAIL_BRAND.line};">
        <div style="font-size:22px;letter-spacing:6px;color:${EMAIL_BRAND.ink};font-weight:bold;">SHRIMOH</div>
        <div style="font-size:9px;letter-spacing:2px;color:${EMAIL_BRAND.gold};margin-top:6px;">THE LUXURY STORE</div>
      </div>
      <div style="padding:36px 40px;font-family:Arial,Helvetica,sans-serif;color:${EMAIL_BRAND.text};">
        ${
          eyebrow
            ? `<div style="font-size:9px;letter-spacing:2px;color:${EMAIL_BRAND.gold};margin-bottom:10px;">${eyebrow}</div>`
            : ""
        }
        ${
          heading
            ? `<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:${EMAIL_BRAND.ink};">${heading}</h1>`
            : ""
        }
        ${bodyHtml}
      </div>
      <div style="padding:22px 40px;background:${EMAIL_BRAND.soft};text-align:center;">
        <div style="font-size:10px;letter-spacing:1.5px;color:${EMAIL_BRAND.gold};">SHRIMOH &middot; THE LUXURY STORE</div>
        <div style="font-size:11px;color:${EMAIL_BRAND.muted};margin-top:6px;">Thank you for shopping with us.</div>
      </div>
    </div>
  </div>`;
}

async function sendOrderConfirmationEmail({
  to,
  customerName,
  orderReference,
  items,
  subtotal,
  delivery,
  discount,
  total,
  paymentMethod
}) {
  const itemsHtml = (Array.isArray(items) ? items : [])
    .map((item) => {
      const image = String(item.image || "").trim();
      const imageCell = image
        ? `<img src="${image}" alt="" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:8px;display:block;border:1px solid ${EMAIL_BRAND.line};" />`
        : `<div style="width:56px;height:56px;border-radius:8px;background:${EMAIL_BRAND.soft};"></div>`;
      const colorLine = item.selectedColor
        ? `<br /><span style="font-size:11px;color:${EMAIL_BRAND.gold};">Color: ${item.selectedColor}</span>`
        : "";
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${EMAIL_BRAND.line};width:56px;">${imageCell}</td>
          <td style="padding:14px 14px;border-bottom:1px solid ${EMAIL_BRAND.line};font-size:14px;">${item.name || "Product"}${colorLine}</td>
          <td style="padding:14px 0;border-bottom:1px solid ${EMAIL_BRAND.line};text-align:center;font-size:13px;color:${EMAIL_BRAND.muted};">${item.quantity}</td>
          <td style="padding:14px 0;border-bottom:1px solid ${EMAIL_BRAND.line};text-align:right;font-size:14px;">${formatMoney(
            item.lineTotal ?? item.price * item.quantity
          )}</td>
        </tr>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:14px;">Hi ${customerName || "there"},</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.muted};">Thank you for your order - we've received it and it's already being prepared with care.</p>

    <div style="display:inline-block;padding:10px 16px;background:${EMAIL_BRAND.soft};border-radius:6px;font-size:11px;letter-spacing:0.5px;color:${EMAIL_BRAND.muted};margin-bottom:28px;">
      ORDER REFERENCE&nbsp; <strong style="color:${EMAIL_BRAND.ink};">${orderReference}</strong>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr>
          <th colspan="2" style="text-align:left;padding:0 0 10px;border-bottom:1px solid ${EMAIL_BRAND.ink};font-size:10px;letter-spacing:1px;color:${EMAIL_BRAND.muted};font-weight:normal;">ITEM</th>
          <th style="text-align:center;padding:0 0 10px;border-bottom:1px solid ${EMAIL_BRAND.ink};font-size:10px;letter-spacing:1px;color:${EMAIL_BRAND.muted};font-weight:normal;">QTY</th>
          <th style="text-align:right;padding:0 0 10px;border-bottom:1px solid ${EMAIL_BRAND.ink};font-size:10px;letter-spacing:1px;color:${EMAIL_BRAND.muted};font-weight:normal;">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:4px 0;color:${EMAIL_BRAND.muted};">Subtotal</td><td style="text-align:right;padding:4px 0;">${formatMoney(subtotal)}</td></tr>
      ${
        discount > 0
          ? `<tr><td style="padding:4px 0;color:${EMAIL_BRAND.muted};">Discount</td><td style="text-align:right;padding:4px 0;">-${formatMoney(discount)}</td></tr>`
          : ""
      }
      <tr><td style="padding:4px 0;color:${EMAIL_BRAND.muted};">Delivery</td><td style="text-align:right;padding:4px 0;">${delivery === 0 ? "FREE" : formatMoney(delivery)}</td></tr>
      <tr><td style="padding-top:12px;border-top:1px solid ${EMAIL_BRAND.line};font-weight:bold;font-size:16px;">Total</td><td style="text-align:right;padding-top:12px;border-top:1px solid ${EMAIL_BRAND.line};font-weight:bold;font-size:16px;">${formatMoney(
        total
      )}</td></tr>
    </table>

    <p style="font-size:12px;color:${EMAIL_BRAND.muted};margin:20px 0 0;">Payment method: ${paymentMethod}</p>
    <p style="font-size:13px;line-height:1.6;margin-top:22px;">We'll send you another email the moment your order ships, with the courier name and tracking details.</p>
  `;

  await sendTransactionalEmail({
    to,
    customerName,
    subject: `Order Confirmed - ${orderReference}`,
    html: emailShell({ eyebrow: "ORDER CONFIRMED", heading: "Thank you for your order", bodyHtml })
  });
}

/*
 * SHIPPING UPDATE EMAIL
 * Sent whenever the admin panel's "Save Shipping Info" saves a
 * courier name / tracking number against an order (see the
 * /api/orders/:id/status handler below) - tells the customer their
 * order has shipped and gives them the courier + tracking details,
 * plus a link to the site's own Track Order page.
 */
async function sendShippingUpdateEmail({
  to,
  customerName,
  orderReference,
  status,
  courierName,
  trackingNumber,
  trackingUrl
}) {
  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:14px;">Hi ${customerName || "there"},</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.muted};">Good news - your order is on its way to you.</p>

    <div style="display:inline-block;padding:10px 16px;background:${EMAIL_BRAND.soft};border-radius:6px;font-size:11px;letter-spacing:0.5px;color:${EMAIL_BRAND.muted};margin-bottom:12px;">
      ORDER REFERENCE&nbsp; <strong style="color:${EMAIL_BRAND.ink};">${orderReference}</strong>
    </div>
    <div style="font-size:11px;letter-spacing:1px;color:${EMAIL_BRAND.gold};margin-bottom:26px;">STATUS: <strong>${String(status || "").toUpperCase()}</strong></div>

    ${
      courierName || trackingNumber
        ? `<table style="width:100%;font-size:13px;margin-bottom:24px;border:1px solid ${EMAIL_BRAND.line};border-radius:6px;border-collapse:collapse;">
      ${
        courierName
          ? `<tr><td style="padding:12px 16px;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.line};">Courier</td><td style="padding:12px 16px;text-align:right;font-weight:bold;border-bottom:1px solid ${EMAIL_BRAND.line};">${courierName}</td></tr>`
          : ""
      }
      ${
        trackingNumber
          ? `<tr><td style="padding:12px 16px;color:${EMAIL_BRAND.muted};">Tracking Number</td><td style="padding:12px 16px;text-align:right;font-weight:bold;">${trackingNumber}</td></tr>`
          : ""
      }
    </table>`
        : ""
    }

    ${
      trackingUrl
        ? `<p style="text-align:center;margin:0 0 26px;"><a href="${trackingUrl}" style="display:inline-block;padding:13px 30px;background:${EMAIL_BRAND.ink};color:#fff;text-decoration:none;font-size:10px;letter-spacing:1.5px;border-radius:4px;">TRACK WITH COURIER</a></p>`
        : ""
    }

    <p style="font-size:12px;color:${EMAIL_BRAND.muted};line-height:1.6;">You can also check your order status anytime on the SHRIMOH website using "Track Order" with this reference number and your mobile number or email.</p>
  `;

  await sendTransactionalEmail({
    to,
    customerName,
    subject: `Your SHRIMOH Order Has Shipped - ${orderReference}`,
    html: emailShell({ eyebrow: "ON ITS WAY", heading: "Your order has shipped", bodyHtml })
  });
}

const ORDER_STATUSES = ["Received", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
const PAYMENT_METHODS = ["Razorpay", "COD"];
const STORAGE_BUCKET = "product-images";

const allowedOrigins = [
  "https://luxora-store-phi.vercel.app",
  "https://luxora-store-mkva.onrender.com"
];

// Any custom domain the store is (or will be) served from — add new ones here
// whenever you point a domain at Vercel (Settings -> Domains). This does NOT
// need to be touched for renames within *.vercel.app, since those are
// auto-allowed below.
const allowedCustomDomains = [
  // "https://www.shrimoh.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (allowedCustomDomains.includes(origin)) return callback(null, true);
      // Any Vercel-hosted address (e.g. after renaming the Vercel project,
      // or a Vercel preview URL) is auto-allowed so store renames never
      // break the storefront again.
      try {
        const hostname = new URL(origin).hostname;
        if (hostname.endsWith(".vercel.app")) return callback(null, true);
      } catch (err) {
        // fall through to reject below
      }
      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  // No cap on how many images can be uploaded at once (admin asked for unlimited photos per product).
  // fileSize keeps a per-photo ceiling only so one giant file can't crash the server's memory.
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  }
});

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueImages(images) {
  if (!Array.isArray(images)) return [];
  return [...new Set(images.filter(Boolean))];
}

function normalizeColors(colors) {
  if (Array.isArray(colors)) return colors.map((color) => String(color).trim()).filter(Boolean);
  if (typeof colors === "string") return colors.split(",").map((color) => color.trim()).filter(Boolean);
  return [];
}

/*
 * COLOR -> PHOTO MAP
 * { "Black": "https://.../black.jpg", "Tan": "https://.../tan.jpg" }
 * Only keeps entries whose value is a real, non-empty string url -
 * anything else (null, numbers, nested objects) is dropped rather
 * than stored, since this is written straight into the product's
 * public API response.
 */
function normalizeColorImages(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const result = {};
  for (const key of Object.keys(parsed)) {
    const color = String(key).trim();
    const url = parsed[key];
    if (color && typeof url === "string" && url.trim()) {
      result[color] = url.trim();
    }
  }
  return result;
}

function normalizeImages(images) {
  if (Array.isArray(images)) return uniqueImages(images);
  if (typeof images === "string" && images.trim()) {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) return uniqueImages(parsed);
    } catch {
      return uniqueImages(images.split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return [];
}

function getStoragePathFromUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) return null;
  return imageUrl.slice(index + marker.length).split("?")[0];
}

async function uploadImage(file) {
  const extension = path.extname(file.originalname || "") || ".jpg";
  const originalName = path.basename(file.originalname || "product", extension);
  const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const filename = `${Date.now()}-${Math.round(Math.random() * 1000000)}-${safeName || "product"}${extension}`;
  const storagePath = `products/${filename}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file.buffer, {
    contentType: file.mimetype,
    upsert: true
  });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function deleteStorageImages(images) {
  const paths = uniqueImages(images).map(getStoragePathFromUrl).filter(Boolean);
  if (!paths.length) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) console.error("STORAGE DELETE ERROR:", error);
}

function formatProduct(product) {
  if (!product) return null;
  const images = normalizeImages(product.images);
  const mainImage = images[0] || "";
  return {
    id: product.id,
    name: product.name || "",
    category: product.category || "Bags",
    price: safeNumber(product.price),
    oldPrice: safeNumber(product.old_price ?? product.oldPrice),
    stock: Math.max(0, Math.floor(safeNumber(product.stock))),
    description: product.description || "",
    colors: normalizeColors(product.colors),
    colorImages: normalizeColorImages(product.color_images),
    images,
    image: mainImage,
    createdAt: product.created_at || product.createdAt || null,
    updatedAt: product.updated_at || product.updatedAt || null,
    active: product.active !== false
  };
}

/*
 * ADMIN-ONLY product formatter. Includes dropshipping/supplier
 * fields (cost, supplier name, supplier product ID, supplier
 * link, shipping time). This must ONLY ever be sent to a
 * requireAdmin-protected route - never to the public
 * /api/products or /api/products/:id routes, which use the
 * regular formatProduct() above instead.
 */
function formatProductAdmin(product) {
  const base = formatProduct(product);
  if (!base) return null;
  return {
    ...base,
    supplierName: product.supplier_name || "",
    supplierProductId: product.supplier_product_id || "",
    supplierLink: product.supplier_link || "",
    supplierCost: product.supplier_cost === null || product.supplier_cost === undefined
      ? null
      : safeNumber(product.supplier_cost),
    shippingTime: product.shipping_time || "",
    margin: product.margin === null || product.margin === undefined ? null : safeNumber(product.margin),
    status: product.status || "published"
  };
}

function formatCoupon(coupon) {
  if (!coupon) return null;
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: safeNumber(coupon.discount_value),
    minOrderAmount: safeNumber(coupon.min_order_amount),
    maxDiscountAmount:
      coupon.max_discount_amount === null || coupon.max_discount_amount === undefined
        ? null
        : safeNumber(coupon.max_discount_amount),
    expiryDate: coupon.expiry_date || null,
    usageLimit:
      coupon.usage_limit === null || coupon.usage_limit === undefined
        ? null
        : Math.floor(safeNumber(coupon.usage_limit)),
    timesUsed: Math.floor(safeNumber(coupon.times_used)),
    active: coupon.active !== false,
    createdAt: coupon.created_at || null,
    updatedAt: coupon.updated_at || null
  };
}

/*
 * Validates a coupon code against a given subtotal and returns
 * the coupon row plus the discount amount to apply. Throws a
 * user-facing Error on any invalid/expired/exhausted coupon so
 * the caller can show a clear message. This is the ONLY place
 * that computes discount - the frontend never decides this.
 */
async function getValidCoupon(code, subtotal) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) throw new Error("Please enter a coupon code.");

  const { data: coupon, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!coupon) throw new Error("Invalid coupon code.");
  if (!coupon.active) throw new Error("This coupon is no longer active.");

  if (coupon.expiry_date && new Date(coupon.expiry_date).getTime() < Date.now()) {
    throw new Error("This coupon has expired.");
  }

  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
    if (Math.floor(safeNumber(coupon.times_used)) >= Math.floor(safeNumber(coupon.usage_limit))) {
      throw new Error("This coupon has reached its usage limit.");
    }
  }

  const minOrderAmount = safeNumber(coupon.min_order_amount);
  if (subtotal < minOrderAmount) {
    throw new Error(`Minimum order of ₹${minOrderAmount.toLocaleString("en-IN")} required for this coupon.`);
  }

  let discountAmount = 0;
  if (coupon.discount_type === "percentage") {
    discountAmount = (subtotal * safeNumber(coupon.discount_value)) / 100;
    if (coupon.max_discount_amount !== null && coupon.max_discount_amount !== undefined) {
      discountAmount = Math.min(discountAmount, safeNumber(coupon.max_discount_amount));
    }
  } else {
    discountAmount = safeNumber(coupon.discount_value);
  }

  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
  discountAmount = Math.round(discountAmount * 100) / 100;

  return { coupon, discountAmount };
}

/*
 * Increments a coupon's times_used counter after an order that
 * used it has been successfully saved. Best-effort: logged but
 * never allowed to fail the order itself.
 */
async function incrementCouponUsage(couponCode) {
  if (!couponCode) return;
  try {
    const { data: coupon, error: readError } = await supabase
      .from("coupons")
      .select("id, times_used")
      .eq("code", couponCode)
      .maybeSingle();
    if (readError) throw readError;
    if (!coupon) return;

    const { error: updateError } = await supabase
      .from("coupons")
      .update({
        times_used: Math.floor(safeNumber(coupon.times_used)) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", coupon.id);
    if (updateError) throw updateError;
  } catch (error) {
    console.error("COUPON USAGE UPDATE ERROR:", error);
  }
}

function formatOrder(order) {
  if (!order) return null;

  let customer = order.customer || null;
  if (typeof customer === "string") {
    try {
      customer = JSON.parse(customer);
    } catch {
      customer = null;
    }
  }

  return {
    id: order.id,
    orderId: order.order_number || order.orderId || "",
    orderReference: order.order_number || order.orderReference || order.reference || "",
    reference: order.order_number || order.reference || order.orderReference || "",
    status: order.status || "Received",
    paymentStatus: order.payment_status || order.paymentStatus || "Pending",
    paymentMethod: order.payment_method || order.paymentMethod || "",
    subtotal: safeNumber(order.subtotal),
    delivery: safeNumber(order.delivery_charge ?? order.delivery),
    discount: safeNumber(order.discount),
    total: safeNumber(order.total_amount ?? order.total),
    customer,
    items: Array.isArray(order.items) ? order.items : [],
    courierName: order.courier_name || order.courierName || "",
    trackingNumber: order.tracking_number || order.trackingNumber || "",
    trackingUrl: order.tracking_url || order.trackingUrl || "",
    createdAt: order.created_at || order.createdAt || null,
    updatedAt: order.updated_at || order.updatedAt || null
  };
}

function validateCustomer(customer) {
  if (!customer || typeof customer !== "object") return "Customer details are required.";
  const required = ["name", "mobile", "email", "address", "city", "state", "pincode"];
  for (const field of required) {
    if (!String(customer[field] || "").trim()) return `${field} is required.`;
  }
  const mobile = String(customer.mobile).replace(/\D/g, "");
  if (!/^[0-9]{10}$/.test(mobile)) return "Please enter a valid 10 digit mobile number.";
  const pincode = String(customer.pincode).replace(/\D/g, "");
  if (!/^[0-9]{6}$/.test(pincode)) return "Please enter a valid 6 digit pincode.";
  return null;
}

async function calculateCart(items, couponCode) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Cart is empty.");

  const normalizedItems = items.map(function (item) {
    return {
      id: Number(item.id),
      quantity: Math.floor(Number(item.quantity)),
      color: item.color !== undefined && item.color !== null ? String(item.color).trim() : ""
    };
  });

  for (const item of normalizedItems) {
    if (!Number.isFinite(item.id) || item.id <= 0) throw new Error("Invalid product ID.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Invalid product quantity.");
  }

  const productIds = [...new Set(normalizedItems.map((item) => item.id))];

  const { data: products, error } = await supabase.from("products").select("*").in("id", productIds);
  if (error) throw error;
  if (!Array.isArray(products)) throw new Error("Unable to load products.");

  const productMap = new Map(products.map((product) => [String(product.id), product]));

  const cartItems = [];
  let subtotal = 0;

  for (const requestedItem of normalizedItems) {
    const product = productMap.get(String(requestedItem.id));
    if (!product) throw new Error(`Product ${requestedItem.id} not found.`);
    if (product.active === false) throw new Error(`${product.name} is no longer available.`);

    const stock = Math.max(0, Math.floor(safeNumber(product.stock)));
    if (stock < requestedItem.quantity) {
      throw new Error(`${product.name} has only ${stock} item(s) left in stock.`);
    }

    const price = safeNumber(product.price);
    if (price <= 0) throw new Error(`${product.name} has an invalid price.`);

    const lineTotal = price * requestedItem.quantity;
    subtotal += lineTotal;

    const images = normalizeImages(product.images);

    /*
     * COLOR VALIDATION
     * If the product has a colors list, the requested color must
     * be one of them - this stops a tampered request from writing
     * an arbitrary string into the order. If the product has no
     * colors configured, we ignore whatever was sent.
     */
    const availableColors = normalizeColors(product.colors);
    let selectedColor = "";
    if (availableColors.length > 0) {
      const requestedColor = requestedItem.color || "";
      const match = availableColors.find(
        (c) => c.toLowerCase() === requestedColor.toLowerCase()
      );
      if (!match) {
        throw new Error(`Please select a valid color for ${product.name}.`);
      }
      selectedColor = match;
    }

    cartItems.push({
      productId: product.id,
      name: product.name,
      price,
      quantity: requestedItem.quantity,
      selectedColor,
      image: images[0] || "",
      lineTotal
    });
  }

  let discount = 0;
  let appliedCouponCode = null;

  if (couponCode) {
    const { coupon, discountAmount } = await getValidCoupon(couponCode, subtotal);
    discount = discountAmount;
    appliedCouponCode = coupon.code;
  }

  const delivery = 0;
  const total = subtotal + delivery - discount;

  if (!Number.isFinite(total) || total <= 0) throw new Error("Order total must be greater than zero.");

  return { items: cartItems, subtotal, delivery, discount, total, couponCode: appliedCouponCode };
}

app.get("/", function (req, res) {
  res.json({
    success: true,
    message: "SHRIMOH server is running",
    database: "Supabase",
    payment: "Razorpay",
    storage: "Supabase Storage",
    port: PORT
  });
});

app.post("/api/admin/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
      return res.status(500).json({ success: false, message: "Admin authentication is not configured." });
    }
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Invalid admin email or password." });
    }
    const token = createAdminToken();
    return res.json({ success: true, token, admin: { email: ADMIN_EMAIL, role: "admin" } });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ success: false, message: "Admin login failed." });
  }
});

app.get("/api/health", async function (req, res) {
  try {
    const { error } = await supabase.from("products").select("id").limit(1);
    if (error) throw error;
    return res.json({
      success: true,
      database: "connected",
      storage: "Supabase Storage",
      razorpay: razorpay ? "configured" : "missing"
    });
  } catch (error) {
    console.error("HEALTH ERROR:", error);
    return res.status(500).json({ success: false, message: "Database connection failed." });
  }
});

/*
 * COUPON VALIDATE (public)
 * Lets the checkout page show a discount preview before the
 * order is placed. This does NOT reserve/consume the coupon -
 * it only checks validity and computes the discount amount.
 * The real, final discount is always recalculated server-side
 * again inside calculateCart() when the order is actually
 * created, so the frontend can never manipulate the price.
 */
app.post("/api/coupons/validate", async function (req, res) {
  try {
    const code = req.body?.code;
    const items = req.body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty." });
    }

    const cart = await calculateCart(items, null);
    const { coupon, discountAmount } = await getValidCoupon(code, cart.subtotal);

    return res.json({
      success: true,
      code: coupon.code,
      discountAmount,
      subtotal: cart.subtotal,
      total: Math.max(0, cart.subtotal - discountAmount)
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Invalid coupon code." });
  }
});

/* =====================================================
   SITE SETTINGS (hero banner + brand-story images)
   =====================================================
   One single row (id=1) holding homepage images the owner can
   change from Admin -> Site Content without ever touching code.
   Requires this table to exist in Supabase - see the SQL in
   apply-instructions.md. Until the owner uploads an image, these
   URLs are null and the frontend falls back to its old behaviour
   (auto-using the first product photo / a plain monogram).
   ===================================================== */

async function getSiteSettingsRow() {
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return data || { hero_image_url: null, brand_story_image_url: null };
}

function formatSiteSettings(row) {
  return {
    heroImageUrl: row?.hero_image_url || "",
    brandStoryImageUrl: row?.brand_story_image_url || ""
  };
}

app.get("/api/site-settings", async function (req, res) {
  try {
    const row = await getSiteSettingsRow();
    return res.json({ success: true, settings: formatSiteSettings(row) });
  } catch (error) {
    console.error("GET SITE SETTINGS ERROR:", error);
    // Non-fatal for the storefront - it just falls back to defaults.
    return res.json({ success: true, settings: { heroImageUrl: "", brandStoryImageUrl: "" } });
  }
});

app.put("/api/admin/site-settings", requireAdmin, upload.any(), async function (req, res) {
  const uploadedUrls = [];

  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const heroFile = files.find((file) => file.fieldname === "heroImage");
    const brandStoryFile = files.find((file) => file.fieldname === "brandStoryImage");

    const updateData = { updated_at: new Date().toISOString() };

    if (heroFile) {
      const url = await uploadImage(heroFile);
      uploadedUrls.push(url);
      updateData.hero_image_url = url;
    }

    if (brandStoryFile) {
      const url = await uploadImage(brandStoryFile);
      uploadedUrls.push(url);
      updateData.brand_story_image_url = url;
    }

    if (!heroFile && !brandStoryFile) {
      return res.status(400).json({
        success: false,
        message: "Please choose at least one image to upload."
      });
    }

    const { data, error } = await supabase
      .from("site_settings")
      .upsert({ id: 1, ...updateData })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: "Site images updated successfully.",
      settings: formatSiteSettings(data)
    });
  } catch (error) {
    console.error("UPDATE SITE SETTINGS ERROR:", error);

    if (uploadedUrls.length) {
      await deleteStorageImages(uploadedUrls);
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to update site images."
    });
  }
});

/*
 * NEWSLETTER SIGNUP (homepage form, above the footer)
 * Public - anyone can subscribe. Silently treats an email that's
 * already subscribed as a success (no error shown to the visitor,
 * no duplicate row created) since a unique constraint on the
 * "email" column is what actually prevents duplicates.
 */
app.post("/api/newsletter", async function (req, res) {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailPattern.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    const { error } = await supabase.from("newsletter_subscribers").insert({ email });
    // Postgres unique-violation code is 23505 - that just means they were
    // already subscribed, which is fine, not an error worth showing.
    if (error && error.code !== "23505") throw error;

    return res.status(201).json({ success: true, message: "Subscribed successfully." });
  } catch (error) {
    console.error("NEWSLETTER SIGNUP ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to subscribe right now. Please try again." });
  }
});

/*
 * ADMIN: list newsletter subscribers (for exporting/emailing later).
 * Not wired to a dedicated Admin.jsx tab yet - the data collects
 * safely in Supabase either way, can add a UI for it whenever
 * useful.
 */
app.get("/api/admin/newsletter", requireAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ success: true, subscribers: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error("GET NEWSLETTER SUBSCRIBERS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load subscribers." });
  }
});

app.get("/api/products", async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ success: true, products: Array.isArray(data) ? data.map(formatProduct) : [] });
  } catch (error) {
    console.error("GET PRODUCTS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load products." });
  }
});

/*
 * BESTSELLERS
 * Aggregates real quantity sold per product from the order_items
 * table (genuine sales data, not a hardcoded/fake list), and
 * returns the top N active products sorted by units sold.
 * Path is "/api/bestsellers" (NOT "/api/products/bestsellers")
 * so it never collides with the "/api/products/:id" route below.
 */
app.get("/api/bestsellers", async function (req, res) {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));

    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("product_id, quantity");
    if (itemsError) throw itemsError;

    const soldByProduct = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const productId = String(item.product_id);
      const quantity = Math.max(0, Math.floor(safeNumber(item.quantity)));
      soldByProduct.set(productId, (soldByProduct.get(productId) || 0) + quantity);
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("active", true);
    if (productsError) throw productsError;

    const ranked = (Array.isArray(products) ? products : [])
      .map((product) => ({
        product,
        sold: soldByProduct.get(String(product.id)) || 0
      }))
      .sort((a, b) => b.sold - a.sold)
      .filter((entry) => entry.sold > 0)
      .slice(0, limit)
      .map((entry) => formatProduct(entry.product));

    return res.json({ success: true, products: ranked });
  } catch (error) {
    console.error("GET BESTSELLERS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load bestsellers." });
  }
});

app.get("/api/products/:id", async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, product: formatProduct(data) });
  } catch (error) {
    console.error("GET PRODUCT ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load product." });
  }
});

app.post("/api/products", requireAdmin, upload.any(), async function (req, res) {
  const uploadedUrls = [];
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const category = String(body.category || "Bags").trim();
    const price = safeNumber(body.price);
    const oldPrice = safeNumber(body.oldPrice ?? body.old_price);
    const stock = Math.max(0, Math.floor(safeNumber(body.stock)));
    const description = String(body.description || "");
    const colors = normalizeColors(body.colors);

    /*
     * Dropshipping / supplier fields. ADMIN-ONLY - these are
     * never returned by the public product endpoints, only by
     * admin-authenticated routes (formatProductAdmin).
     */
    const supplierName = body.supplierName !== undefined ? String(body.supplierName).trim() : null;
    const supplierProductId =
      body.supplierProductId !== undefined ? String(body.supplierProductId).trim() : null;
    const supplierLink = body.supplierLink !== undefined ? String(body.supplierLink).trim() : null;
    const supplierCost = body.supplierCost !== undefined ? safeNumber(body.supplierCost) : null;
    const shippingTime = body.shippingTime !== undefined ? String(body.shippingTime).trim() : null;

    if (!name) return res.status(400).json({ success: false, message: "Product name is required." });
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ success: false, message: "Valid product price is required." });
    }

    const allFiles = Array.isArray(req.files) ? req.files : [];
    /*
     * COLOR PHOTOS
     * A file for a specific color's swatch photo is sent with
     * fieldname "colorImage__<Color Name>" (e.g. "colorImage__Black"),
     * separate from the regular gallery files (fieldname "images").
     */
    const galleryFiles = allFiles.filter((file) => file.fieldname === "images");
    const colorFiles = allFiles.filter((file) => file.fieldname.startsWith("colorImage__"));

    if (galleryFiles.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one product image." });
    }

    for (const file of galleryFiles) {
      const url = await uploadImage(file);
      uploadedUrls.push(url);
    }

    const colorImages = normalizeColorImages(body.colorImages);
    for (const file of colorFiles) {
      const color = decodeURIComponent(file.fieldname.slice("colorImage__".length)).trim();
      if (!color) continue;
      const url = await uploadImage(file);
      uploadedUrls.push(url); // tracked for cleanup-on-error, NOT part of the main gallery
      colorImages[color] = url;
    }

    const productId = Date.now();
    const galleryImageUrls = uploadedUrls.slice(0, galleryFiles.length);

    const { data, error } = await supabase
      .from("products")
      .insert({
        id: productId,
        name,
        category,
        price,
        old_price: oldPrice,
        stock,
        description,
        colors,
        images: uniqueImages(galleryImageUrls),
        color_images: colorImages,
        active: true,
        supplier_name: supplierName,
        supplier_product_id: supplierProductId,
        supplier_link: supplierLink,
        supplier_cost: supplierCost,
        shipping_time: shippingTime
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, message: "Product added successfully.", product: formatProductAdmin(data) });
  } catch (error) {
    console.error("ADD PRODUCT ERROR:", error);
    if (uploadedUrls.length) await deleteStorageImages(uploadedUrls);
    return res.status(500).json({ success: false, message: error.message || "Unable to add product." });
  }
});

/*
 * BULK PRODUCT IMPORT
 * Lets the admin add many products at once - e.g. from a CSV they
 * filled in via the admin panel's "Bulk Upload" section - instead
 * of one at a time through the form above. Unlike the single-add
 * route, this one takes plain JSON (no file upload): each row
 * supplies image URLs (real public links) rather than an image
 * file, since a spreadsheet cell can't hold an attached photo.
 * Every row is validated and inserted independently, so one bad
 * row never blocks the rest - the response reports a clear
 * success/failure per row for the admin panel to display.
 */
app.post("/api/products/bulk", requireAdmin, async function (req, res) {
  const rows = Array.isArray((req.body || {}).products) ? req.body.products : [];
  if (!rows.length) {
    return res.status(400).json({ success: false, message: "No products were sent." });
  }
  if (rows.length > 500) {
    return res.status(400).json({ success: false, message: "Please upload 500 products or fewer at a time." });
  }

  const results = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {};
    const rowNumber = index + 1;
    const name = String(row.name || "").trim();
    try {
      const price = safeNumber(row.price);
      if (!name) throw new Error("Product name is required.");
      if (!Number.isFinite(price) || price <= 0) throw new Error("A valid price is required.");

      const category = String(row.category || "Bags").trim() || "Bags";
      const oldPrice = row.oldPrice !== undefined && row.oldPrice !== "" ? safeNumber(row.oldPrice) : 0;
      const stock = Math.max(0, Math.floor(safeNumber(row.stock)));
      const description = String(row.description || "");
      const colors = normalizeColors(row.colors);
      const images = uniqueImages(normalizeImages(row.images));
      // row.colorImages arrives as { "Black": "https://...", "Brown": "https://..." }
      // (built client-side from the CSV's "Color Images" column) - same shape the
      // single-add form already sends, so the same normalizer applies here.
      const colorImages = normalizeColorImages(row.colorImages);

      // Supplier/dropshipping fields - admin-only, mirrors the
      // single-add route below. A blank cell stores null, same as
      // that route treats a field the admin left untouched.
      const strOrNull = (value) => {
        const text = String(value || "").trim();
        return text || null;
      };
      const supplierName = strOrNull(row.supplierName);
      const supplierProductId = strOrNull(row.supplierProductId);
      const supplierLink = strOrNull(row.supplierLink);
      const supplierCost =
        row.supplierCost !== null && row.supplierCost !== undefined && row.supplierCost !== ""
          ? safeNumber(row.supplierCost)
          : null;
      const shippingTime = strOrNull(row.shippingTime);

      if (images.length === 0) throw new Error("At least one image URL is required.");

      // Offset by row index so a fast loop never produces duplicate
      // millisecond-timestamp IDs across rows in the same request.
      const productId = Date.now() + index;

      const { data, error } = await supabase
        .from("products")
        .insert({
          id: productId,
          name,
          category,
          price,
          old_price: oldPrice,
          stock,
          description,
          colors,
          images,
          color_images: colorImages,
          active: true,
          supplier_name: supplierName,
          supplier_product_id: supplierProductId,
          supplier_link: supplierLink,
          supplier_cost: supplierCost,
          shipping_time: shippingTime
        })
        .select()
        .single();

      if (error) throw error;

      results.push({ row: rowNumber, name, success: true, product: formatProductAdmin(data) });
    } catch (error) {
      results.push({
        row: rowNumber,
        name: name || `Row ${rowNumber}`,
        success: false,
        message: error.message || "Could not add this product."
      });
    }
  }

  const addedCount = results.filter((result) => result.success).length;
  return res.json({
    success: true,
    addedCount,
    failedCount: results.length - addedCount,
    results
  });
});

/*
 * AI PRODUCT PHOTOGRAPHY (Google Gemini image generation)
 * Takes ONE real source photo of the product and asks Gemini to
 * recreate it - preserving the exact shape/colour/material/logo -
 * as 4 premium studio-style shots plus 1 lifestyle shot with an
 * AI-generated female model. Nothing is saved to Supabase Storage
 * here; the admin previews all 5 first and only the ones they
 * pick get saved (via /save-generated-image below) and added to
 * the product's image list.
 */
const PREMIUM_IMAGE_PROMPTS = [
  "Recreate this exact product - preserve its precise shape, colour, material, hardware, logo, stitching and proportions, do not redesign it - as a premium e-commerce hero shot: centered, straight-on angle, soft studio lighting, seamless off-white background, subtle soft shadow beneath, sharp focus, no props, no text, no watermark.",
  "Recreate this exact product - preserve its precise shape, colour, material, hardware, logo, stitching and proportions, do not redesign it - as a premium e-commerce shot from a three-quarter angle, soft studio lighting, seamless neutral beige background, subtle shadow, sharp focus, no props, no text, no watermark.",
  "Recreate this exact product - preserve its precise shape, colour, material, hardware, logo, stitching and proportions, do not redesign it - as a premium close-up detail shot highlighting texture, material quality and craftsmanship, soft studio lighting, softly blurred neutral background, sharp focus, no props, no text, no watermark.",
  "Recreate this exact product - preserve its precise shape, colour, material, hardware, logo, stitching and proportions, do not redesign it - as a premium flat-lay editorial shot on a neutral textured surface with soft natural light, minimal styling, nothing competing with the product, no text, no watermark."
];

const LIFESTYLE_IMAGE_PROMPT =
  "Using this exact product - preserve its precise shape, colour, material, hardware, logo and proportions exactly, do not redesign it - create a photorealistic premium fashion lifestyle photograph: an elegant female model naturally carrying or wearing the product in a sophisticated modern setting (an upscale interior or a clean city street), editorial fashion-photography style, realistic skin texture and lighting, high-end e-commerce campaign aesthetic, no text, no watermark.";

async function generateOneImage(base64Data, mimeType, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]
          }
        ]
      })
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini image API returned ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData || part.inline_data);
  const inline = imagePart?.inlineData || imagePart?.inline_data;
  if (!inline?.data) {
    throw new Error("Gemini did not return an image (it may have declined the prompt).");
  }
  return { data: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" };
}

app.post(
  "/api/admin/products/generate-images",
  requireAdmin,
  upload.single("sourceImage"),
  async function (req, res) {
    try {
      if (!GEMINI_API_KEY) {
        return res.status(400).json({
          success: false,
          message: "AI image generation isn't set up yet - add GEMINI_API_KEY in Render's environment variables and redeploy."
        });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: "Please choose a source product photo first." });
      }

      const base64Data = file.buffer.toString("base64");
      const mimeType = file.mimetype || "image/jpeg";

      const jobs = [
        ...PREMIUM_IMAGE_PROMPTS.map((prompt) => ({ type: "premium", prompt })),
        { type: "lifestyle", prompt: LIFESTYLE_IMAGE_PROMPT }
      ];

      const results = [];
      for (const job of jobs) {
        try {
          const generated = await generateOneImage(base64Data, mimeType, job.prompt);
          results.push({
            type: job.type,
            success: true,
            dataUrl: `data:${generated.mimeType};base64,${generated.data}`
          });
        } catch (error) {
          console.error(`GENERATE ${job.type.toUpperCase()} IMAGE ERROR:`, error.message);
          results.push({ type: job.type, success: false, message: error.message });
        }
      }

      return res.json({ success: true, images: results });
    } catch (error) {
      console.error("GENERATE IMAGES ERROR:", error.message);
      return res.status(500).json({ success: false, message: "Unable to generate AI images right now." });
    }
  }
);

/*
 * Saves ONE admin-approved generated image (sent as a base64 data
 * URL) into Supabase Storage, exactly like an uploaded file. Kept
 * separate from generate-images above so nothing is stored until
 * the admin has actually picked which images to keep.
 */
app.post("/api/admin/products/save-generated-image", requireAdmin, async function (req, res) {
  try {
    const dataUrl = String((req.body || {}).dataUrl || "");
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid image data." });
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const extension = (mimeType.split("/")[1] || "png").split(";")[0];
    const url = await uploadImage({ originalname: `ai-image.${extension}`, buffer, mimetype: mimeType });
    return res.json({ success: true, url });
  } catch (error) {
    console.error("SAVE GENERATED IMAGE ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Unable to save this image." });
  }
});

/*
 * Move an imported (or any) product between draft / review /
 * published. Setting "published" also flips active=true so it
 * shows on the live site immediately - moving it out of
 * "published" flips active=false so it disappears again without
 * deleting anything.
 */
app.patch("/api/admin/products/:id/status", requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const status = String((req.body || {}).status || "").trim();
    if (!["draft", "review", "published"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be draft, review or published." });
    }

    const { data, error } = await supabase
      .from("products")
      .update({ status, active: status === "published", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: "Product not found." });

    return res.json({ success: true, message: "Product status updated.", product: formatProductAdmin(data) });
  } catch (error) {
    console.error("UPDATE PRODUCT STATUS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to update product status." });
  }
});

async function updateProduct(req, res) {
  const newUploadedUrls = [];
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ success: false, message: "Product not found." });

    const body = req.body || {};
    const updateData = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return res.status(400).json({ success: false, message: "Product name cannot be empty." });
      updateData.name = name;
    }

    if (body.category !== undefined) updateData.category = String(body.category).trim();

    if (body.price !== undefined) {
      const price = safeNumber(body.price);
      if (price <= 0) {
        return res.status(400).json({ success: false, message: "Product price must be greater than zero." });
      }
      updateData.price = price;
    }

    if (body.oldPrice !== undefined || body.old_price !== undefined) {
      updateData.old_price = safeNumber(body.oldPrice ?? body.old_price);
    }

    if (body.stock !== undefined) {
      updateData.stock = Math.max(0, Math.floor(safeNumber(body.stock)));
    }

    if (body.description !== undefined) updateData.description = String(body.description);

    if (body.colors !== undefined) updateData.colors = normalizeColors(body.colors);

    if (body.active !== undefined) {
      if (typeof body.active === "string") {
        updateData.active = body.active.toLowerCase() === "true";
      } else {
        updateData.active = Boolean(body.active);
      }
    }

    if (body.supplierName !== undefined) updateData.supplier_name = String(body.supplierName).trim();
    if (body.supplierProductId !== undefined) {
      updateData.supplier_product_id = String(body.supplierProductId).trim();
    }
    if (body.supplierLink !== undefined) updateData.supplier_link = String(body.supplierLink).trim();
    if (body.supplierCost !== undefined) updateData.supplier_cost = safeNumber(body.supplierCost);
    if (body.shippingTime !== undefined) updateData.shipping_time = String(body.shippingTime).trim();

    const allFiles = Array.isArray(req.files) ? req.files : [];
    const galleryFiles = allFiles.filter((file) => file.fieldname === "images");
    const colorFiles = allFiles.filter((file) => file.fieldname.startsWith("colorImage__"));
    let oldImages = [];

    if (galleryFiles.length > 0) {
      oldImages = normalizeImages(existing.images);
      const galleryUrls = [];
      for (const file of galleryFiles) {
        const url = await uploadImage(file);
        newUploadedUrls.push(url);
        galleryUrls.push(url);
      }
      updateData.images = uniqueImages(galleryUrls);
    }

    /*
     * COLOR PHOTOS
     * Starts from whatever color photos the product already has,
     * then layers on any URL overrides sent in body.colorImages
     * and finally any freshly-uploaded colorImage__<Color> files -
     * so editing one color's photo never wipes out the others.
     */
    if (body.colorImages !== undefined || colorFiles.length > 0) {
      const colorImages = {
        ...normalizeColorImages(existing.color_images),
        ...normalizeColorImages(body.colorImages)
      };
      for (const file of colorFiles) {
        const color = decodeURIComponent(file.fieldname.slice("colorImage__".length)).trim();
        if (!color) continue;
        const url = await uploadImage(file);
        newUploadedUrls.push(url);
        colorImages[color] = url;
      }
      updateData.color_images = colorImages;
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (galleryFiles.length > 0 && oldImages.length) {
      await deleteStorageImages(oldImages);
    }

    return res.json({ success: true, message: "Product updated successfully.", product: formatProductAdmin(data) });
  } catch (error) {
    console.error("UPDATE PRODUCT ERROR:", error);
    if (newUploadedUrls.length) await deleteStorageImages(newUploadedUrls);
    return res.status(500).json({ success: false, message: error.message || "Unable to update product." });
  }
}

app.put("/api/products/:id", requireAdmin, upload.any(), updateProduct);
app.patch("/api/products/:id", requireAdmin, upload.any(), updateProduct);

app.delete("/api/products/:id", requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });

    const { error } = await supabase
      .from("products")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    return res.json({ success: true, message: "Product deleted successfully." });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to delete product." });
  }
});

/*
 * ADMIN PRODUCTS LIST
 * Same data as the public /api/products, but admin-only and
 * includes supplier/dropshipping fields, plus inactive
 * (soft-deleted) products so the admin can still see/restore
 * them. The Admin panel should use THIS endpoint, not the
 * public one, for its product management screen.
 */
app.get("/api/admin/products", requireAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ success: true, products: Array.isArray(data) ? data.map(formatProductAdmin) : [] });
  } catch (error) {
    console.error("GET ADMIN PRODUCTS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load products." });
  }
});

/*
 * ADMIN CUSTOMERS LIST
 */
app.get("/api/admin/customers", requireAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const customers = (Array.isArray(data) ? data : []).map((customer) => ({
      id: customer.id,
      name: customer.name || "",
      mobile: customer.mobile || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      createdAt: customer.created_at || null,
      updatedAt: customer.updated_at || null
    }));

    return res.json({ success: true, customers });
  } catch (error) {
    console.error("GET ADMIN CUSTOMERS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load customers." });
  }
});

/*
 * ADMIN COUPONS - full CRUD
 */
app.get("/api/admin/coupons", requireAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ success: true, coupons: (Array.isArray(data) ? data : []).map(formatCoupon) });
  } catch (error) {
    console.error("GET COUPONS ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load coupons." });
  }
});

app.post("/api/admin/coupons", requireAdmin, async function (req, res) {
  try {
    const body = req.body || {};
    const code = String(body.code || "").trim().toUpperCase();
    const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
    const discountValue = safeNumber(body.discountValue);

    if (!code) return res.status(400).json({ success: false, message: "Coupon code is required." });
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ success: false, message: "Valid discount value is required." });
    }

    const { data, error } = await supabase
      .from("coupons")
      .insert({
        code,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: safeNumber(body.minOrderAmount),
        max_discount_amount:
          body.maxDiscountAmount !== undefined && body.maxDiscountAmount !== null && body.maxDiscountAmount !== ""
            ? safeNumber(body.maxDiscountAmount)
            : null,
        expiry_date: body.expiryDate || null,
        usage_limit:
          body.usageLimit !== undefined && body.usageLimit !== null && body.usageLimit !== ""
            ? Math.floor(safeNumber(body.usageLimit))
            : null,
        active: body.active !== undefined ? Boolean(body.active) : true
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ success: false, message: "A coupon with this code already exists." });
      }
      throw error;
    }

    return res.status(201).json({ success: true, message: "Coupon created.", coupon: formatCoupon(data) });
  } catch (error) {
    console.error("CREATE COUPON ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to create coupon." });
  }
});

app.put("/api/admin/coupons/:id", requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID." });
    }

    const body = req.body || {};
    const updateData = { updated_at: new Date().toISOString() };

    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase();
    if (body.discountType !== undefined) updateData.discount_type = body.discountType === "fixed" ? "fixed" : "percentage";
    if (body.discountValue !== undefined) updateData.discount_value = safeNumber(body.discountValue);
    if (body.minOrderAmount !== undefined) updateData.min_order_amount = safeNumber(body.minOrderAmount);
    if (body.maxDiscountAmount !== undefined) {
      updateData.max_discount_amount =
        body.maxDiscountAmount === null || body.maxDiscountAmount === "" ? null : safeNumber(body.maxDiscountAmount);
    }
    if (body.expiryDate !== undefined) updateData.expiry_date = body.expiryDate || null;
    if (body.usageLimit !== undefined) {
      updateData.usage_limit =
        body.usageLimit === null || body.usageLimit === "" ? null : Math.floor(safeNumber(body.usageLimit));
    }
    if (body.active !== undefined) updateData.active = Boolean(body.active);

    const { data, error } = await supabase
      .from("coupons")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return res.json({ success: true, message: "Coupon updated.", coupon: formatCoupon(data) });
  } catch (error) {
    console.error("UPDATE COUPON ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to update coupon." });
  }
});

app.delete("/api/admin/coupons/:id", requireAdmin, async function (req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID." });
    }

    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) throw error;

    return res.json({ success: true, message: "Coupon deleted." });
  } catch (error) {
    console.error("DELETE COUPON ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to delete coupon." });
  }
});

/*
 * ADMIN DASHBOARD
 * Sales totals + a profit estimate. Profit is only calculated
 * for order_items whose product still has a supplier_cost set
 * (older items without one are excluded from the profit sum,
 * not treated as zero-cost, since that would overstate profit).
 */
app.get("/api/admin/dashboard", requireAdmin, async function (req, res) {
  try {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, status, payment_status, total_amount, created_at");
    if (ordersError) throw ordersError;

    const allOrders = Array.isArray(orders) ? orders : [];
    const paidOrders = allOrders.filter((order) => order.payment_status === "Paid");
    const cancelledOrders = allOrders.filter((order) => order.status === "Cancelled");

    const totalRevenue = paidOrders.reduce((sum, order) => sum + safeNumber(order.total_amount), 0);

    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id, product_id, price, quantity");
    if (itemsError) throw itemsError;

    const paidOrderIds = new Set(paidOrders.map((order) => String(order.id)));
    const relevantItems = (Array.isArray(items) ? items : []).filter((item) =>
      paidOrderIds.has(String(item.order_id))
    );

    const productIds = [...new Set(relevantItems.map((item) => item.product_id))];
    let supplierCostByProduct = new Map();
    if (productIds.length) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, supplier_cost")
        .in("id", productIds);
      if (productsError) throw productsError;
      for (const product of Array.isArray(products) ? products : []) {
        if (product.supplier_cost !== null && product.supplier_cost !== undefined) {
          supplierCostByProduct.set(String(product.id), safeNumber(product.supplier_cost));
        }
      }
    }

    let totalProfit = 0;
    let itemsWithKnownCost = 0;
    for (const item of relevantItems) {
      const cost = supplierCostByProduct.get(String(item.product_id));
      if (cost === undefined) continue;
      const quantity = Math.max(0, Math.floor(safeNumber(item.quantity)));
      const price = safeNumber(item.price);
      totalProfit += (price - cost) * quantity;
      itemsWithKnownCost += 1;
    }

    return res.json({
      success: true,
      dashboard: {
        totalOrders: allOrders.length,
        paidOrders: paidOrders.length,
        cancelledOrders: cancelledOrders.length,
        totalRevenue,
        totalProfit: itemsWithKnownCost > 0 ? Math.round(totalProfit * 100) / 100 : null,
        profitDataAvailable: itemsWithKnownCost > 0
      }
    });
  } catch (error) {
    console.error("GET DASHBOARD ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to load dashboard." });
  }
});

app.post("/api/create-order", async function (req, res) {
  try {
    if (!razorpay) {
      return res.status(500).json({ success: false, message: "Razorpay is not configured on the server." });
    }

    const items = req.body?.items;
    const couponCode = req.body?.couponCode || null;
    const cart = await calculateCart(items, couponCode);
    const amountPaise = Math.round(cart.total * 100);

    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ success: false, message: "Order amount must be at least ₹1." });
    }

    const receipt = `SHRIMOH_${Date.now()}`;

    console.log("RAZORPAY CREATE:", {
      subtotal: cart.subtotal,
      delivery: cart.delivery,
      discount: cart.discount,
      total: cart.total,
      amountPaise
    });

    const razorpayOrder = await razorpay.orders.create({ amount: amountPaise, currency: "INR", receipt });

    return res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt
    });
  } catch (error) {
    console.error("RAZORPAY CREATE ORDER ERROR:", error);
    if (error && error.statusCode === 401) {
      return res.status(401).json({ success: false, message: "Razorpay authentication failed. Please check Razorpay API keys." });
    }
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || "Unable to create Razorpay order."
    });
  }
});

app.post("/api/verify-payment", async function (req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment verification fields." });
    }

    if (!RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: "Razorpay secret key is not configured on the server." });
    }

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id")
      .eq("payment_id", razorpay_payment_id)
      .maybeSingle();
    if (existingPaymentError) console.error("PAYMENT LOOKUP ERROR:", existingPaymentError);

    if (existingPayment) {
      return res.json({
        success: true,
        message: "Payment already verified.",
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        alreadyVerified: true
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(generatedSignature, "utf8");
    const receivedBuffer = Buffer.from(razorpay_signature, "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed." });
    }

    const valid = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    if (!valid) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed." });
    }

    console.log("RAZORPAY PAYMENT VERIFIED:", razorpay_payment_id);

    return res.json({
      success: true,
      message: "Payment verified successfully.",
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id
    });
  } catch (error) {
    console.error("RAZORPAY VERIFY ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to verify payment." });
  }
});

app.post("/api/orders", async function (req, res) {
  try {
    const body = req.body || {};
    const customer = body.customer;
    const customerError = validateCustomer(customer);
    if (customerError) return res.status(400).json({ success: false, message: customerError });

    const items = body.items;
    const couponCode = body.couponCode || null;
    const payment = body.payment || {};
    const paymentMethod = payment.method || "Razorpay";

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method." });
    }

    const cart = await calculateCart(items, couponCode);
    let paymentStatus = "Pending";

    let razorpayOrderId = null;
    let razorpayPaymentId = null;
    let razorpaySignature = null;

    if (paymentMethod === "Razorpay") {
      razorpayOrderId = payment.razorpayOrderId || payment.razorpay_order_id;
      razorpayPaymentId = payment.razorpayPaymentId || payment.razorpay_payment_id;
      razorpaySignature = payment.razorpaySignature || payment.razorpay_signature;

      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ success: false, message: "Razorpay payment details are required." });
      }

      const generatedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      const a = Buffer.from(generatedSignature, "utf8");
      const b = Buffer.from(razorpaySignature, "utf8");

      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(400).json({ success: false, message: "Payment verification failed." });
      }

      const { data: duplicatePayment, error: duplicatePaymentError } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("payment_id", razorpayPaymentId)
        .maybeSingle();
      if (duplicatePaymentError) throw duplicatePaymentError;

      if (duplicatePayment) {
        return res.status(409).json({ success: false, message: "This payment has already been used for an order." });
      }

      paymentStatus = "Paid";
    }

    if (paymentMethod === "COD") paymentStatus = "Pending";

    const cleanCustomer = {
      name: String(customer.name).trim(),
      mobile: String(customer.mobile).replace(/\D/g, ""),
      email: String(customer.email).trim().toLowerCase(),
      address: String(customer.address).trim(),
      city: String(customer.city).trim(),
      state: String(customer.state).trim(),
      pincode: String(customer.pincode).replace(/\D/g, "")
    };

    let customerRecord = null;

    const { data: existingCustomer, error: customerLookupError } = await supabase
      .from("customers")
      .select("*")
      .eq("email", cleanCustomer.email)
      .maybeSingle();
    if (customerLookupError) throw customerLookupError;

    if (existingCustomer) {
      const { data: updatedCustomer, error: updateCustomerError } = await supabase
        .from("customers")
        .update({
          name: cleanCustomer.name,
          mobile: cleanCustomer.mobile,
          address: cleanCustomer.address,
          city: cleanCustomer.city,
          state: cleanCustomer.state,
          pincode: cleanCustomer.pincode,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingCustomer.id)
        .select()
        .single();
      if (updateCustomerError) throw updateCustomerError;
      customerRecord = updatedCustomer;
    } else {
      const { data: newCustomer, error: createCustomerError } = await supabase
        .from("customers")
        .insert({
          name: cleanCustomer.name,
          mobile: cleanCustomer.mobile,
          email: cleanCustomer.email,
          address: cleanCustomer.address,
          city: cleanCustomer.city,
          state: cleanCustomer.state,
          pincode: cleanCustomer.pincode
        })
        .select()
        .single();
      if (createCustomerError) throw createCustomerError;
      customerRecord = newCustomer;
    }

    const orderReference = `LUX-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    /*
     * IMPORTANT: this must match the ACTUAL columns in the
     * Supabase "orders" table, which are:
     *   id, order_number, customer_id, status, payment_method,
     *   payment_status, subtotal, delivery_charge, discount,
     *   total_amount, coupon_code, razorpay_order_id,
     *   razorpay_payment_id, razorpay_signature, courier_name,
     *   tracking_number, tracking_url, notes, created_at, updated_at
     * (there is no "customer" JSON column and no "order_reference"
     * / "reference" / "total" / "delivery" column - using those
     * names caused every order to fail to save with a
     * "Could not find the column ... in the schema cache" error.
     * Customer details are stored only in the separate "customers"
     * table, linked via customer_id.)
     */
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id: customerRecord.id,
        order_number: orderReference,
        status: "Received",
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        subtotal: cart.subtotal,
        delivery_charge: cart.delivery,
        discount: cart.discount,
        total_amount: cart.total,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        coupon_code: cart.couponCode,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (orderError) throw orderError;

    if (cart.couponCode) {
      await incrementCouponUsage(cart.couponCode);
    }

    /*
     * IMPORTANT: this must match the ACTUAL columns in the
     * Supabase "order_items" table, which are:
     *   id, order_id, product_id, product_name, product_image,
     *   price, quantity, color, created_at
     * (there is no "product_price" / "selected_color" /
     * "line_total" column - using those names caused every order
     * to fail to save with a "column does not exist" error.
     * line_total is calculated on read instead, from price * quantity.)
     */
    const orderItems = cart.items.map(function (item) {
      return {
        order_id: order.id,
        product_id: item.productId,
        product_name: item.name,
        price: item.price,
        quantity: item.quantity,
        color: item.selectedColor,
        product_image: item.image
      };
    });

    const { error: orderItemsError } = await supabase.from("order_items").insert(orderItems);
    if (orderItemsError) throw orderItemsError;

    /*
     * IMPORTANT: this must match the ACTUAL columns in the
     * Supabase "payments" table, which are:
     *   order_id, provider, payment_id, order_id_external,
     *   amount, currency, status, method
     * (there is no razorpay_order_id / razorpay_payment_id /
     * razorpay_signature column - using those names caused
     * every order to fail to save with a "column does not
     * exist" error.)
     */
    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      provider: paymentMethod,
      method: paymentMethod,
      status: paymentStatus,
      amount: cart.total,
      currency: "INR",
      payment_id: razorpayPaymentId,
      order_id_external: razorpayOrderId
    });
    if (paymentError) throw paymentError;

    for (const item of cart.items) {
      const { data: currentProduct, error: stockReadError } = await supabase
        .from("products")
        .select("id, name, stock")
        .eq("id", item.productId)
        .maybeSingle();
      if (stockReadError) throw stockReadError;
      if (!currentProduct) throw new Error(`Product ${item.productId} no longer exists.`);

      const currentStock = Math.floor(safeNumber(currentProduct.stock));
      if (currentStock < item.quantity) {
        throw new Error(`${currentProduct.name} is no longer available in the requested quantity.`);
      }

      const { error: stockUpdateError } = await supabase
        .from("products")
        .update({ stock: currentStock - item.quantity, updated_at: new Date().toISOString() })
        .eq("id", item.productId)
        .eq("stock", currentStock);
      if (stockUpdateError) throw stockUpdateError;
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({ order_id: order.id, status: "Received" });
    if (historyError) console.error("STATUS HISTORY ERROR:", historyError);

    /*
     * ORDER CONFIRMATION EMAIL
     * Best-effort only: if email sending fails for any reason
     * (missing credentials, Gmail hiccup, etc.) the order has
     * ALREADY been saved successfully above, so we must never
     * let an email problem turn into a failed order response.
     */
    sendOrderConfirmationEmail({
      to: cleanCustomer.email,
      customerName: cleanCustomer.name,
      orderReference,
      items: cart.items,
      subtotal: cart.subtotal,
      delivery: cart.delivery,
      discount: cart.discount,
      total: cart.total,
      paymentMethod
    }).catch((error) => {
      console.error("ORDER EMAIL ERROR:", error);
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order: {
        id: order.id,
        orderId: order.id,
        orderReference: orderReference,
        reference: orderReference,
        status: "Received",
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        subtotal: cart.subtotal,
        delivery: cart.delivery,
        discount: cart.discount,
        total: cart.total
      },
      orderId: order.id,
      reference: orderReference
    });
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to create order." });
  }
});

/*
 * PUBLIC ORDER TRACKING
 * Lets a customer check their own order's status without logging in.
 * Requires the order reference PLUS the mobile number or email they
 * placed the order with, so knowing/guessing just the reference
 * (which is shown on-screen and emailed after checkout) is not
 * enough to look up someone else's order. Never returns the full
 * saved address - only what's needed to show a status timeline.
 */
app.get("/api/track-order", async function (req, res) {
  try {
    const reference = String(req.query.reference || req.query.orderReference || "").trim();
    const mobileInput = String(req.query.mobile || "").replace(/\D/g, "");
    const emailInput = String(req.query.email || "").trim().toLowerCase();

    if (!reference) {
      return res.status(400).json({ success: false, message: "Order reference is required." });
    }
    if (!mobileInput && !emailInput) {
      return res.status(400).json({ success: false, message: "Enter the mobile number or email used for this order." });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", reference)
      .maybeSingle();
    if (error) throw error;
    if (!order) {
      return res.status(404).json({ success: false, message: "No order found for that reference. Please check and try again." });
    }

    let customer = order.customer;
    if (typeof customer === "string") {
      try {
        customer = JSON.parse(customer);
      } catch {
        customer = null;
      }
    }
    if (order.customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (customerError) throw customerError;
      if (customerData) customer = { ...customerData, ...(customer || {}) };
    }

    const orderMobile = String((customer && customer.mobile) || "").replace(/\D/g, "");
    const orderEmail = String((customer && customer.email) || "").trim().toLowerCase();

    const mobileMatches = Boolean(mobileInput) && Boolean(orderMobile) && mobileInput === orderMobile;
    const emailMatches = Boolean(emailInput) && Boolean(orderEmail) && emailInput === orderEmail;

    if (!mobileMatches && !emailMatches) {
      return res.status(404).json({ success: false, message: "No order found for that reference. Please check and try again." });
    }

    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    if (itemsError) throw itemsError;

    const formattedItems = (Array.isArray(items) ? items : []).map(function (item) {
      const price = safeNumber(item.price);
      const quantity = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
      return {
        id: item.product_id,
        name: item.product_name || "Product",
        price,
        quantity,
        selectedColor: item.color || "",
        image: item.product_image || "",
        lineTotal: safeNumber(item.line_total, price * quantity)
      };
    });

    const { data: history, error: historyError } = await supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (historyError) console.error("STATUS HISTORY READ ERROR:", historyError);

    const calculatedTotal = formattedItems.reduce((sum, item) => sum + safeNumber(item.lineTotal), 0);
    const storedTotal = safeNumber(order.total_amount);
    const finalTotal = storedTotal > 0 ? storedTotal : calculatedTotal;
    const storedSubtotal = safeNumber(order.subtotal);
    const finalSubtotal = storedSubtotal > 0 ? storedSubtotal : calculatedTotal;

    return res.json({
      success: true,
      order: formatOrder({
        ...order,
        customer: null,
        items: formattedItems,
        total: finalTotal,
        subtotal: finalSubtotal
      }),
      customerName: (customer && customer.name) || "",
      statusHistory: (Array.isArray(history) ? history : []).map((row) => ({
        status: row.status,
        at: row.created_at
      }))
    });
  } catch (error) {
    console.error("TRACK ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to look up this order right now. Please try again shortly." });
  }
});

app.get("/api/orders", requireAdmin, async function (req, res) {
  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const orderIds = orders.map((order) => order.id);
    let orderItems = [];

    if (orderIds.length) {
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);
      if (itemsError) throw itemsError;
      orderItems = Array.isArray(items) ? items : [];
    }

    const itemsByOrder = new Map();
    for (const item of orderItems) {
      const key = String(item.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      const price = safeNumber(item.price);
      const quantity = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
      const lineTotal = safeNumber(item.line_total, price * quantity);
      itemsByOrder.get(key).push({
        id: item.product_id,
        name: item.product_name || "Product",
        price,
        quantity,
        selectedColor: item.color || "",
        image: item.product_image || "",
        lineTotal
      });
    }

    /*
     * Fallback: load customers by customer_id, in case order.customer
     * is missing on some older rows.
     */
    const customerIds = [
      ...new Set(orders.map((order) => order.customer_id).filter(Boolean).map((id) => String(id)))
    ];

    let customersById = new Map();
    if (customerIds.length) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .in("id", customerIds);
      if (customerError) throw customerError;
      for (const customer of Array.isArray(customerData) ? customerData : []) {
        customersById.set(String(customer.id), customer);
      }
    }

    const formatted = orders.map(function (order) {
      const items = itemsByOrder.get(String(order.id)) || [];

      let customer = order.customer;
      if (typeof customer === "string") {
        try {
          customer = JSON.parse(customer);
        } catch {
          customer = null;
        }
      }

      const customerFromDb = customersById.get(String(order.customer_id)) || null;
      if (customerFromDb) {
        customer = { ...customerFromDb, ...(customer || {}) };
      }

      const calculatedTotal = items.reduce((sum, item) => sum + safeNumber(item.lineTotal), 0);
      const storedTotal = safeNumber(order.total_amount);
      const finalTotal = storedTotal > 0 ? storedTotal : calculatedTotal;

      const storedSubtotal = safeNumber(order.subtotal);
      const finalSubtotal = storedSubtotal > 0 ? storedSubtotal : calculatedTotal;

      return formatOrder({
        ...order,
        customer: customer || null,
        items,
        subtotal: finalSubtotal,
        total: finalTotal
      });
    });

    return res.json({ success: true, orders: formatted });
  } catch (error) {
    console.error("GET ORDERS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to load orders." });
  }
});

app.get("/api/orders/:id", requireAdmin, async function (req, res) {
  try {
    const identifier = String(req.params.id);
    let query = supabase.from("orders").select("*");

    if (/^\d+$/.test(identifier)) {
      query = query.eq("id", Number(identifier));
    } else {
      query = query.eq("order_number", identifier);
    }

    const { data: order, error } = await query.maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    if (itemsError) throw itemsError;

    const formattedItems = (Array.isArray(items) ? items : []).map(function (item) {
      const price = safeNumber(item.price);
      const quantity = Math.max(1, Math.floor(safeNumber(item.quantity, 1)));
      return {
        id: item.product_id,
        name: item.product_name || "Product",
        price,
        quantity,
        selectedColor: item.color || "",
        image: item.product_image || "",
        lineTotal: safeNumber(item.line_total, price * quantity)
      };
    });

    /*
     * Fallback: merge customer from the customers table
     * in case order.customer is missing.
     */
    let customer = order.customer;
    if (typeof customer === "string") {
      try {
        customer = JSON.parse(customer);
      } catch {
        customer = null;
      }
    }

    if (order.customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (customerError) throw customerError;
      if (customerData) {
        customer = { ...customerData, ...(customer || {}) };
      }
    }

    const calculatedTotal = formattedItems.reduce((sum, item) => sum + safeNumber(item.lineTotal), 0);
    const storedTotal = safeNumber(order.total_amount);
    const finalTotal = storedTotal > 0 ? storedTotal : calculatedTotal;
    const storedSubtotal = safeNumber(order.subtotal);
    const finalSubtotal = storedSubtotal > 0 ? storedSubtotal : calculatedTotal;

    return res.json({
      success: true,
      order: formatOrder({
        ...order,
        customer: customer || null,
        items: formattedItems,
        total: finalTotal,
        subtotal: finalSubtotal
      })
    });
  } catch (error) {
    console.error("GET ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to load order." });
  }
});

async function updateOrder(req, res) {
  try {
    const identifier = String(req.params.id);
    const body = req.body || {};
    const status = body.status || body.orderStatus;
    const paymentStatus = body.paymentStatus;

    if (status && !ORDER_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, message: "Invalid order status." });
    }

    if (paymentStatus && !PAYMENT_STATUSES.includes(String(paymentStatus))) {
      return res.status(400).json({ success: false, message: "Invalid payment status." });
    }

    let query = supabase.from("orders").select("*");
    if (/^\d+$/.test(identifier)) {
      query = query.eq("id", Number(identifier));
    } else {
      query = query.eq("order_number", identifier);
    }

    const { data: existing, error: findError } = await query.maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ success: false, message: "Order not found." });

    const updateData = { updated_at: new Date().toISOString() };
    if (status) updateData.status = String(status);
    if (paymentStatus) updateData.payment_status = String(paymentStatus);
    if (body.courierName !== undefined) updateData.courier_name = String(body.courierName);
    if (body.trackingNumber !== undefined) updateData.tracking_number = String(body.trackingNumber);
    if (body.trackingUrl !== undefined) updateData.tracking_url = String(body.trackingUrl);

    const { data: updated, error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;

    if (status) {
      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({ order_id: existing.id, status: String(status) });
      if (historyError) console.error("STATUS HISTORY ERROR:", historyError);
    }

    /*
     * SHIPPING UPDATE EMAIL (best-effort, never fails the request)
     * Only fires when THIS request actually included courier/tracking
     * fields and the order now has something worth telling the
     * customer - a plain status change (e.g. Received -> Confirmed)
     * with no courier/tracking fields in the body does not re-send it.
     */
    const shippingInfoSubmitted =
      body.courierName !== undefined || body.trackingNumber !== undefined || body.trackingUrl !== undefined;
    const updatedCourierName = String(updated.courier_name || "").trim();
    const updatedTrackingNumber = String(updated.tracking_number || "").trim();
    const updatedTrackingUrl = String(updated.tracking_url || "").trim();

    if (shippingInfoSubmitted && (updatedCourierName || updatedTrackingNumber)) {
      let shippingCustomer = existing.customer;
      if (typeof shippingCustomer === "string") {
        try {
          shippingCustomer = JSON.parse(shippingCustomer);
        } catch {
          shippingCustomer = null;
        }
      }
      if (existing.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("*")
          .eq("id", existing.customer_id)
          .maybeSingle();
        if (customerError) console.error("SHIPPING EMAIL CUSTOMER LOOKUP ERROR:", customerError);
        if (customerData) shippingCustomer = { ...customerData, ...(shippingCustomer || {}) };
      }

      sendShippingUpdateEmail({
        to: (shippingCustomer && shippingCustomer.email) || "",
        customerName: (shippingCustomer && shippingCustomer.name) || "",
        orderReference: updated.order_number || String(updated.id),
        status: updated.status || existing.status || "Shipped",
        courierName: updatedCourierName,
        trackingNumber: updatedTrackingNumber,
        trackingUrl: updatedTrackingUrl
      }).catch((error) => {
        console.error("SHIPPING EMAIL ERROR:", error);
      });
    }

    return res.json({ success: true, message: "Order updated successfully.", order: formatOrder(updated) });
  } catch (error) {
    console.error("UPDATE ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to update order." });
  }
}

app.put("/api/orders/:id/status", requireAdmin, updateOrder);
app.patch("/api/orders/:id/status", requireAdmin, updateOrder);
app.put("/api/orders/:id", requireAdmin, updateOrder);
app.patch("/api/orders/:id", requireAdmin, updateOrder);

app.delete("/api/orders/:id", requireAdmin, async function (req, res) {
  try {
    const identifier = String(req.params.id);
    let query = supabase.from("orders").select("id");

    if (/^\d+$/.test(identifier)) {
      query = query.eq("id", Number(identifier));
    } else {
      query = query.eq("order_number", identifier);
    }

    const { data: order, error: findError } = await query.maybeSingle();
    if (findError) throw findError;
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const { error } = await supabase
      .from("orders")
      .update({ status: "Cancelled", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) throw error;

    return res.json({ success: true, message: "Order cancelled successfully." });
  } catch (error) {
    console.error("DELETE ORDER ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to cancel order." });
  }
});

app.use(function (error, req, res, next) {
  console.error("SERVER ERROR:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: "Upload error: " + error.message });
  }

  if (error) {
    return res.status(400).json({ success: false, message: error.message || "Server error." });
  }

  next();
});

app.use(function (req, res) {
  res.status(404).json({ success: false, message: "API route not found.", path: req.originalUrl });
});

app.listen(PORT, HOST, async function () {
  console.log("");
  console.log("========================================");
  console.log("          SHRIMOH SERVER");
  console.log("========================================");
  console.log(`PORT: ${PORT}`);
  console.log("DATABASE: SUPABASE");
  console.log("STORAGE: SUPABASE STORAGE");
  console.log("PAYMENT: RAZORPAY");
  console.log("Products: /api/products");
  console.log("Orders: /api/orders");
  console.log("Create Payment: /api/create-order");
  console.log("Verify Payment: /api/verify-payment");
  console.log("Health: /api/health");
  console.log("========================================");
  console.log("");

  try {
    const { error } = await supabase.from("products").select("id").limit(1);
    if (error) {
      console.error("❌ SUPABASE CONNECTION ERROR:", error.message);
    } else {
      console.log("✅ SUPABASE DATABASE CONNECTED");
    }
  } catch (error) {
    console.error("❌ SUPABASE TEST ERROR:", error.message);
  }

  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error("❌ STORAGE CONNECTION ERROR:", error.message);
    } else {
      const bucket = data?.find((item) => item.name === STORAGE_BUCKET);
      console.log(bucket ? "✅ STORAGE CONNECTED" : "⚠️ product-images bucket not found");
    }
  } catch (error) {
    console.error("❌ STORAGE TEST ERROR:", error.message);
  }

  console.log("");
});
