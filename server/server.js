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
const sharp = require("sharp");

/*
 * MEMORY SAFETY (small Render instances have very little RAM)
 * sharp/libvips by default caches decoded image data in memory and can
 * spin up one native worker thread per CPU core, both of which add up
 * fast when several photo uploads are being compressed around the same
 * time - exactly what got much more likely once uploads were sped up
 * to run several at once. Turning the cache off and capping libvips to
 * a couple of threads keeps peak memory well below a small instance's
 * limit, at the cost of a little raw CPU throughput (not something a
 * small server has much of anyway).
 */
sharp.cache(false);
sharp.concurrency(2);


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
        <img src="https://shrimoh.vercel.app/icon-192.png" alt="SHRIMOH" width="64" height="64" style="width:64px;height:64px;display:block;margin:0 auto 10px;border:0;" />
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

/*
 * ORDER NUMBER (2026-10-22)
 * New orders get simple running numbers - 1001, 1002, 1003... -
 * instead of the old long "SHR-1729...-ABCDE" references. Old orders
 * keep their old reference unchanged. The number is saved in the same
 * "order_number" column, so Track Order / Admin keep working.
 * A small in-memory lock makes sure two orders arriving at the same
 * moment can never get the same number (the server runs as one
 * instance on Render).
 */
const ORDER_NUMBER_START = 1001;
let orderNumberLock = Promise.resolve();

function withOrderNumberLock(task) {
  const run = orderNumberLock.then(task, task);
  orderNumberLock = run.catch(function () {});
  return run;
}

async function getNextOrderNumber() {
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .order("id", { ascending: false })
    .limit(500);
  if (error) throw error;
  let highest = ORDER_NUMBER_START - 1;
  (Array.isArray(data) ? data : []).forEach(function (row) {
    const value = String((row && row.order_number) || "").trim();
    if (/^\d+$/.test(value)) highest = Math.max(highest, Number(value));
  });
  return String(highest + 1);
}

// "1001" -> "#1001" for emails; old "SHR-..." references stay as they are.
function displayOrderNumber(reference) {
  const value = String(reference || "").trim();
  return /^\d+$/.test(value) ? `#${value}` : value;
}

const NTFY_TOPIC = String(process.env.NTFY_TOPIC || "").trim();

async function sendNewOrderPhoneAlert({ orderReference, total, paymentMethod, items, customerName, city }) {
  if (!NTFY_TOPIC) return;
  const list = Array.isArray(items) ? items : [];
  const itemLines = list
    .slice(0, 5)
    .map((item) => `• ${item.name || "Product"}${item.selectedColor ? ` (${item.selectedColor})` : ""} x${item.quantity || 1}`)
    .join("\n");
  const more = list.length > 5 ? `\n+${list.length - 5} more` : "";
  const isCod = String(paymentMethod || "").toUpperCase() === "COD";
  const response = await fetch("https://ntfy.sh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: NTFY_TOPIC,
      title: `New Order ${displayOrderNumber(orderReference)} - Rs. ${Number(total || 0).toLocaleString("en-IN")} (${isCod ? "COD" : "Prepaid"})`,
      message: `${customerName || "Customer"}${city ? `, ${city}` : ""}\n${itemLines}${more}`,
      tags: [isCod ? "package" : "moneybag"],
      priority: 5,
      click: "https://shrimoh.vercel.app/admin"
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ntfy error ${response.status}: ${text}`);
  }
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
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.muted};">Thank you for your order - we've received it and it's already being prepared with care. Your order number is <strong style="color:${EMAIL_BRAND.ink};">${displayOrderNumber(orderReference)}</strong>.</p>

    <div style="display:inline-block;padding:10px 16px;background:${EMAIL_BRAND.soft};border-radius:6px;font-size:11px;letter-spacing:0.5px;color:${EMAIL_BRAND.muted};margin-bottom:28px;">
      ORDER NUMBER&nbsp; <strong style="color:${EMAIL_BRAND.ink};">${displayOrderNumber(orderReference)}</strong>
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
    subject: `Order Confirmed - Order ${displayOrderNumber(orderReference)}`,
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
      ORDER NUMBER&nbsp; <strong style="color:${EMAIL_BRAND.ink};">${displayOrderNumber(orderReference)}</strong>
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

    <p style="font-size:12px;color:${EMAIL_BRAND.muted};line-height:1.6;">You can also check your order status anytime on the SHRIMOH website using "Track Order" with this order number and your mobile number or email.</p>
  `;

  await sendTransactionalEmail({
    to,
    customerName,
    subject: `Your SHRIMOH Order ${displayOrderNumber(orderReference)} Has Shipped`,
    html: emailShell({ eyebrow: "ON ITS WAY", heading: "Your order has shipped", bodyHtml })
  });
}

const ORDER_STATUSES = ["Received", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
const PAYMENT_METHODS = ["Razorpay"]; // prepaid only - COD switched off
/*
 * CASH ON DELIVERY via Razorpay Magic Checkout (2026-10-20)
 * COD is offered ONLY inside the Magic Checkout popup (Razorpay does the
 * COD OTP + RTO risk check). The customer pays the order total plus
 * COD_FEE_RUPEES in cash at delivery. Razorpay must have COD switched on
 * for the account, otherwise the option simply doesn't show.
 * Set MAGIC_COD_ENABLED to false to go back to prepaid only.
 */
const MAGIC_COD_ENABLED = true;
const COD_FEE_RUPEES = 150;
const STORAGE_BUCKET = "product-images";

const allowedOrigins = [
  "https://shrimoh-store-phi.vercel.app",
  "https://luxora-store-phi.vercel.app", // old address, kept so old links keep working
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
 * GENERIC STRING LIST NORMALIZER
 * Same shape as normalizeColors (array, or a delimited string, ->
 * trimmed non-empty strings) but used for Key Features / Trust
 * Signals, which come in as a JS array from the admin form, a
 * "|"-separated string from a CSV cell, or a newline-separated
 * string from the AI Quick Add textarea - all three are accepted.
 */
function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[|\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/*
 * COLOR -> PHOTO GALLERY MAP
 * { "Black": ["https://.../black-1.jpg", "https://.../black-2.jpg"], "Tan": [...] }
 * Each color maps to an ARRAY of photo URLs (a full mini-gallery for
 * that variant), not just one photo - lets the storefront show the
 * variant "like its own product" instead of swapping a single hero
 * image. Also accepts a plain string per color for backwards
 * compatibility with color photos saved before this was an array
 * (those just come back as a 1-item array). Anything that isn't a
 * real, non-empty URL string is dropped rather than stored.
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
    if (!color) continue;
    const value = parsed[key];

    let urls = [];
    if (Array.isArray(value)) {
      urls = value.filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim());
    } else if (typeof value === "string" && value.trim()) {
      urls = [value.trim()];
    }
    urls = uniqueImages(urls);
    if (urls.length) result[color] = urls;
  }
  return result;
}

/*
 * PER-COLOR DISPLAY NAME
 * Lets a color variant show its own name (e.g. "Ira Structured
 * Handbag - Noir" for Black) instead of the plain product name -
 * without needing a whole separate product record for it. Same
 * shape/parsing pattern as normalizeColorImages, but each color maps
 * to a single trimmed string instead of an array of URLs.
 */
function normalizeColorNames(raw) {
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
    if (!color) continue;
    const name = String(parsed[key] || "").trim();
    if (name) result[color] = name;
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

/*
 * Shrinks a product photo's FILE SIZE without a visible quality
 * drop: only downscales if it's larger than a normal e-commerce
 * photo needs to be (2000px on the long edge is already bigger
 * than most screens will ever display), and re-encodes at a high
 * quality setting (JPEG 88 / PNG for anything with transparency).
 * This is what actually cuts a 5MB phone/AI photo down to a few
 * hundred KB while still looking sharp - the resize step matters
 * far more for size than the quality number does.
 * Falls back to the original, uncompressed file if anything about
 * this goes wrong, so a bad/corrupt image never blocks an upload.
 */
async function compressImageForWeb(buffer, mimetype) {
  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const resized = image.resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true
    });

    if (metadata.hasAlpha) {
      // Has real transparency (e.g. a logo/graphic) - keep it as PNG so
      // transparency isn't lost, just compress it as much as PNG allows.
      const outBuffer = await resized.png({ quality: 90, compressionLevel: 9 }).toBuffer();
      return { buffer: outBuffer, mimetype: "image/png", extension: ".png" };
    }

    // Real photos (studio + lifestyle shots) have no transparency, so JPEG
    // at a high quality setting gives by far the best size-for-quality result.
    const outBuffer = await resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { buffer: outBuffer, mimetype: "image/jpeg", extension: ".jpg" };
  } catch (error) {
    console.error("IMAGE COMPRESSION SKIPPED (uploading original instead):", error.message);
    return null;
  }
}

async function uploadImage(file) {
  let buffer = file.buffer;
  let mimetype = file.mimetype;
  let extension = path.extname(file.originalname || "") || ".jpg";

  const compressed = await compressImageForWeb(file.buffer, file.mimetype);
  if (compressed) {
    buffer = compressed.buffer;
    mimetype = compressed.mimetype;
    extension = compressed.extension;
  }

  const originalName = path.basename(file.originalname || "product", path.extname(file.originalname || ""));
  const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const filename = `${Date.now()}-${Math.round(Math.random() * 1000000)}-${safeName || "product"}${extension}`;
  const storagePath = `products/${filename}`;

  // Uploading to Supabase Storage is a network call and can occasionally
  // fail with a transient "fetch failed" (a dropped/reset connection,
  // not a real problem with the file or the account) - retry a couple of
  // times with a short pause before giving up, instead of failing the
  // whole "Add Product" for one flaky request.
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: true
      });
      if (error) throw error;

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      return data.publicUrl;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

/*
 * Runs async work over a list with at most `limit` items in flight at
 * once, instead of either one-at-a-time (slow) or all-at-once (which
 * can overwhelm Supabase/Render's connection limits when a product has
 * many photos and briefly show up as a generic "fetch failed"). Order
 * of the returned results always matches the order of `items`.
 */
async function mapWithConcurrencyLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Kept modest on purpose - each in-flight upload holds a full-size photo
// buffer (up to 25MB) in memory while it's being compressed, so this is a
// speed/memory trade-off, not just a speed knob. 2 is a safe default for
// a small Render instance; still much faster than one at a time.
const IMAGE_UPLOAD_CONCURRENCY = 2;

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
    colorNames: normalizeColorNames(product.color_names),
    keyFeatures: normalizeStringList(product.key_features),
    dimensions: product.dimensions || "",
    materials: product.materials || "",
    careInstructions: product.care_instructions || "",
    trustSignals: normalizeStringList(product.trust_signals),
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

    // If this color has its own display name (set in Admin), use that
    // for the order instead of the base product name - this is how an
    // order can be identified by name (e.g. "Ira Noir" vs "Ira Sand")
    // without needing two separate product listings.
    const colorNames = normalizeColorNames(product.color_names);
    const displayName =
      (selectedColor && colorNames[selectedColor]) || product.name;

    // Likewise, use that color's own photo for the order record when
    // one is set, so the order/email/admin view shows the right photo
    // for what was actually ordered.
    const colorImagesForOrder = normalizeColorImages(product.color_images);
    const colorImageList = selectedColor ? colorImagesForOrder[selectedColor] || [] : [];
    const orderImage = colorImageList[0] || images[0] || "";

    cartItems.push({
      productId: product.id,
      name: displayName,
      price,
      quantity: requestedItem.quantity,
      selectedColor,
      image: orderImage,
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

  return data || { hero_image_urls: [], hero_image_url: null, brand_story_image_url: null };
}

function formatSiteSettings(row) {
  /*
   * hero_image_urls (jsonb array) is the current shape, supporting the
   * homepage's rotating hero banner (3-5 photos). hero_image_url (the
   * old single-photo column) is still read as a fallback so a site
   * that only ever had that one column keeps working - see the SQL
   * migration in apply-instructions.md for both columns.
   */
  const heroImageUrls = Array.isArray(row?.hero_image_urls) && row.hero_image_urls.length > 0
    ? row.hero_image_urls
    : row?.hero_image_url
    ? [row.hero_image_url]
    : [];

  return {
    heroImageUrls,
    brandStoryImageUrl: row?.brand_story_image_url || "",
    categoryImages: normalizeCategoryImages(row?.category_images)
  };
}

/*
 * CATEGORY LIFESTYLE PHOTOS (2026-10-05)
 * { "Handbags": "https://...", "Shoulder Bags": "https://...", ... }
 * One owner-chosen lifestyle photo per category, used by the
 * storefront's category tiles (homepage banners, "Explore Our
 * Collections", and the "Shop by categories" thumbnails on every
 * category page) instead of a plain product shot. Stored in the
 * site_settings.category_images jsonb column - see the SQL in the
 * apply instructions.
 */
function normalizeCategoryImages(raw) {
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
    const category = String(key).trim();
    const url = typeof parsed[key] === "string" ? parsed[key].trim() : "";
    if (category && url && /^https?:\/\//i.test(url)) result[category] = url;
  }
  return result;
}

app.get("/api/site-settings", async function (req, res) {
  try {
    const row = await getSiteSettingsRow();
    return res.json({ success: true, settings: formatSiteSettings(row) });
  } catch (error) {
    console.error("GET SITE SETTINGS ERROR:", error);
    // Non-fatal for the storefront - it just falls back to defaults.
    return res.json({ success: true, settings: { heroImageUrls: [], brandStoryImageUrl: "", categoryImages: {} } });
  }
});

/*
 * Save category lifestyle photos. Body (multipart or JSON):
 *   categoryImages: JSON map { category: url } - the full desired map
 *                   (a category left out / set to "" is cleared)
 *   files named categoryImage__<encoded category> - an uploaded photo
 *                   for that category (wins over its url above)
 */
app.put("/api/admin/category-images", requireAdmin, upload.any(), async function (req, res) {
  const uploadedUrls = [];
  try {
    const body = req.body || {};
    const categoryImages = normalizeCategoryImages(body.categoryImages);
    const files = (Array.isArray(req.files) ? req.files : []).filter((file) =>
      file.fieldname.startsWith("categoryImage__")
    );
    for (const file of files) {
      const category = decodeURIComponent(file.fieldname.slice("categoryImage__".length)).trim();
      if (!category) continue;
      const url = await uploadImage(file);
      uploadedUrls.push(url);
      categoryImages[category] = url;
    }

    const { data, error } = await supabase
      .from("site_settings")
      .upsert({ id: 1, category_images: categoryImages, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) {
      if (/category_images/.test(error.message || "")) {
        throw new Error(
          "Database column missing: run the one-line SQL from the apply instructions in Supabase (site_settings.category_images)."
        );
      }
      throw error;
    }

    // Old category photos are deliberately NOT deleted from storage: a
    // category photo is often one of a product's own photos, and
    // deleting it would break that product.

    return res.json({
      success: true,
      message: "Category photos saved.",
      settings: formatSiteSettings(data)
    });
  } catch (error) {
    console.error("UPDATE CATEGORY IMAGES ERROR:", error);
    if (uploadedUrls.length) await deleteStorageImages(uploadedUrls);
    return res.status(500).json({ success: false, message: error.message || "Unable to save category photos." });
  }
});

app.put("/api/admin/site-settings", requireAdmin, upload.any(), async function (req, res) {
  const uploadedUrls = [];

  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const heroFiles = files.filter((file) => file.fieldname === "heroImage").slice(0, 5);
    const brandStoryFile = files.find((file) => file.fieldname === "brandStoryImage");

    const updateData = { updated_at: new Date().toISOString() };

    if (heroFiles.length > 0) {
      const heroUrls = [];
      for (const file of heroFiles) {
        const url = await uploadImage(file);
        uploadedUrls.push(url);
        heroUrls.push(url);
      }
      updateData.hero_image_urls = heroUrls;
    }

    if (brandStoryFile) {
      const url = await uploadImage(brandStoryFile);
      uploadedUrls.push(url);
      updateData.brand_story_image_url = url;
    }

    if (heroFiles.length === 0 && !brandStoryFile) {
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
 * FACEBOOK / META CATALOG FEED
 * Meta Commerce Manager reads this link once a day ("scheduled feed")
 * and keeps the SHRIMOH catalog in sync with the store automatically:
 * new products appear, price / stock changes update, deleted or
 * hidden products disappear. One row per active product; the "id"
 * column is the same product id the Meta Pixel sends, so catalog ads
 * can show each visitor the exact bag they looked at.
 */
const CATALOG_SITE_URL = "https://shrimoh.vercel.app";

function catalogCsvCell(value) {
  const text = String(value === null || value === undefined ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `"${text.replace(/"/g, '""')}"`;
}

// Catalog item id: the product id, or "<id>-<color>" for one color of a
// multi-color product. The Meta Pixel must send the SAME ids.
function catalogItemId(productId, color) {
  if (!color) return String(productId);
  const slug = String(color).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${productId}-${slug || "color"}`;
}

function catalogPrice(amount) {
  return `${Number(amount || 0).toFixed(2)} INR`;
}

app.get("/api/facebook-catalog.csv", async function (req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const header = [
      "id", "item_group_id", "title", "description", "availability", "condition",
      "price", "sale_price", "link", "image_link", "additional_image_link",
      "brand", "color", "product_type", "google_product_category"
    ];
    const rows = [header.join(",")];
    const isHttpUrl = (url) => typeof url === "string" && /^https?:\/\//.test(url);

    for (const raw of Array.isArray(data) ? data : []) {
      const product = formatProduct(raw);
      if (!product || !(product.price > 0)) continue;

      const hasSale = product.oldPrice > product.price;
      const baseLink = `${CATALOG_SITE_URL}/product/${encodeURIComponent(String(product.id))}`;

      // Same rule as the website's listing grid: a product with 2+
      // colors shows one card per color, so the catalog gets one item
      // per color too (grouped together with item_group_id).
      const colors = product.colors.length > 1 ? product.colors : [null];

      for (const color of colors) {
        const colorPhotos = color && Array.isArray(product.colorImages[color])
          ? product.colorImages[color].filter(isHttpUrl)
          : [];
        const photos = colorPhotos.length ? colorPhotos : product.images.filter(isHttpUrl);
        if (!photos.length) continue;

        const colorLabel = color ? (product.colorNames[color] || color) : "";
        const looksLikeCode = /^#|^rgb/i.test(colorLabel);
        const title = color
          ? (product.colorNames[color] || (looksLikeCode ? product.name : `${product.name} - ${colorLabel}`))
          : product.name;

        rows.push([
          catalogCsvCell(catalogItemId(product.id, color)),
          catalogCsvCell(color ? product.id : ""),
          catalogCsvCell(title.slice(0, 150)),
          catalogCsvCell((product.description || product.name).slice(0, 5000)),
          catalogCsvCell(product.stock > 0 ? "in stock" : "out of stock"),
          catalogCsvCell("new"),
          catalogCsvCell(catalogPrice(hasSale ? product.oldPrice : product.price)),
          catalogCsvCell(hasSale ? catalogPrice(product.price) : ""),
          catalogCsvCell(color ? `${baseLink}?color=${encodeURIComponent(color)}` : baseLink),
          catalogCsvCell(photos[0]),
          catalogCsvCell(photos.slice(1, 10).join(",")),
          catalogCsvCell("SHRIMOH"),
          catalogCsvCell(color && !/^#|^rgb/i.test(color) ? color : ""),
          catalogCsvCell(product.category || "Bags"),
          catalogCsvCell("Apparel & Accessories > Handbags, Wallets & Cases > Handbags")
        ].join(","));
      }
    }

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Cache-Control", "public, max-age=900");
    return res.send(rows.join("\n"));
  } catch (feedError) {
    console.error("FACEBOOK CATALOG FEED ERROR:", feedError);
    return res.status(500).type("text/plain").send("Catalog feed unavailable.");
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
    const keyFeatures = normalizeStringList(body.keyFeatures);
    const dimensions = String(body.dimensions || "").trim();
    const materials = String(body.materials || "").trim();
    const careInstructions = String(body.careInstructions || "").trim();
    const trustSignals = normalizeStringList(body.trustSignals);

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

    // Upload gallery photos with a few in flight at once instead of one at a
    // time (much faster) or all at once (which can overwhelm Supabase/Render's
    // connection limit and show up as a generic "fetch failed"). Order is
    // preserved either way.
    const galleryUploadedUrls = await mapWithConcurrencyLimit(
      galleryFiles,
      IMAGE_UPLOAD_CONCURRENCY,
      (file) => uploadImage(file)
    );
    uploadedUrls.push(...galleryUploadedUrls);

    const colorImages = normalizeColorImages(body.colorImages);
    const colorNames = normalizeColorNames(body.colorNames);
    // Multiple files can arrive under the same "colorImage__<Color>" fieldname
    // (one color can have several photos) - group them first so every photo
    // for a color lands in that color's array instead of overwriting the last.
    const colorFilesByColor = {};
    for (const file of colorFiles) {
      const color = decodeURIComponent(file.fieldname.slice("colorImage__".length)).trim();
      if (!color) continue;
      if (!colorFilesByColor[color]) colorFilesByColor[color] = [];
      colorFilesByColor[color].push(file);
    }
    // Flatten every color's files into ONE list (tagged with their color) so
    // the concurrency limit applies across ALL of them together, not per
    // color - otherwise 3 colors x 4 photos could still mean 12 uploads
    // in flight at once.
    const colorFileEntries = [];
    for (const color of Object.keys(colorFilesByColor)) {
      for (const file of colorFilesByColor[color]) {
        colorFileEntries.push({ color, file });
      }
    }
    const colorUploadResults = await mapWithConcurrencyLimit(
      colorFileEntries,
      IMAGE_UPLOAD_CONCURRENCY,
      async ({ color, file }) => ({ color, url: await uploadImage(file) })
    );
    for (const { color, url } of colorUploadResults) {
      uploadedUrls.push(url); // tracked for cleanup-on-error, NOT part of the main gallery
      if (!colorImages[color]) colorImages[color] = [];
      colorImages[color].push(url);
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
        color_names: colorNames,
        key_features: keyFeatures,
        dimensions,
        materials,
        care_instructions: careInstructions,
        trust_signals: trustSignals,
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

  /*
   * DUPLICATE PROTECTION
   * A Google Sheet import (or a re-uploaded CSV) is normally run again
   * and again as new rows get added below the old ones - without this,
   * every earlier row would get inserted as a brand new product every
   * single time. A row is treated as "already added" - and skipped
   * rather than re-inserted - when either its Supplier Product ID
   * matches an existing product's, or (when it has no Supplier Product
   * ID) its name matches an existing product's name exactly
   * (case-insensitive, ignoring extra spaces). Both sets also get
   * updated as rows in THIS batch are added, so two duplicate rows
   * pasted in the same sheet don't create two copies of each other.
   */
  // Only ACTIVE products should block a re-add by name/supplier ID - a
  // soft-deleted (active: false) product must never permanently "reserve"
  // its name, or re-adding it after deleting it would silently get
  // skipped as a false duplicate forever.
  const { data: existingProducts, error: existingError } = await supabase
    .from("products")
    .select("name, supplier_product_id")
    .eq("active", true);
  if (existingError) console.error("BULK DUPLICATE CHECK ERROR:", existingError);
  const seenNames = new Set(
    (existingProducts || [])
      .map((product) => String(product.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const seenSupplierIds = new Set(
    (existingProducts || [])
      .map((product) => String(product.supplier_product_id || "").trim().toLowerCase())
      .filter(Boolean)
  );

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
      // row.colorNames arrives as { "Black": "Ira Noir", "Tan": "Ira Sand" } -
      // built client-side from the CSV's "Color Names" column, same shape the
      // single-add form sends, so the same normalizer applies here.
      const colorNames = normalizeColorNames(row.colorNames);
      const keyFeatures = normalizeStringList(row.keyFeatures);
      const dimensions = String(row.dimensions || "").trim();
      const materials = String(row.materials || "").trim();
      const careInstructions = String(row.careInstructions || "").trim();
      const trustSignals = normalizeStringList(row.trustSignals);

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

      const nameKey = name.toLowerCase();
      const supplierIdKey = supplierProductId ? supplierProductId.toLowerCase() : null;
      const isDuplicate = (supplierIdKey && seenSupplierIds.has(supplierIdKey)) || seenNames.has(nameKey);
      if (isDuplicate) {
        results.push({
          row: rowNumber,
          name,
          success: false,
          skipped: true,
          message: "Already added earlier - skipped so it wouldn't be listed twice."
        });
        continue;
      }

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
          color_names: colorNames,
          key_features: keyFeatures,
          dimensions,
          materials,
          care_instructions: careInstructions,
          trust_signals: trustSignals,
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

      seenNames.add(nameKey);
      if (supplierIdKey) seenSupplierIds.add(supplierIdKey);

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
  const skippedCount = results.filter((result) => result.skipped).length;
  return res.json({
    success: true,
    addedCount,
    skippedCount,
    failedCount: results.length - addedCount - skippedCount,
    results
  });
});

/*
 * QUICK ADD WITH AI (parses pasted, unstructured product text)
 * Lets the admin paste a raw, messy description of one or more
 * products - copied from WhatsApp, a supplier catalog, anything -
 * instead of typing a CSV row by hand. Gemini pulls out the
 * structured fields (name, price, colors, image links, description,
 * etc.). This route only EXTRACTS what is already in the text - it
 * must never invent details, especially image links, that aren't
 * actually present - and it never inserts a product itself; the
 * parsed rows just get added to the same Bulk Upload preview table
 * for the admin to review before clicking "Upload".
 */
app.post("/api/admin/quick-add-parse", requireAdmin, async function (req, res) {
  const text = String((req.body || {}).text || "").trim();
  if (!text) {
    return res.status(400).json({ success: false, message: "Please paste some product details first." });
  }
  if (text.length > 20000) {
    return res.status(400).json({
      success: false,
      message: "That's too much text for one go - please paste fewer products at a time."
    });
  }
  if (!GEMINI_API_KEY) {
    return res.status(400).json({
      success: false,
      message: "AI parsing isn't set up yet - add GEMINI_API_KEY in Render's environment variables and redeploy."
    });
  }

  const prompt = `You extract structured product data from raw, messy text (copy-pasted from WhatsApp, a supplier catalog, or notes) for an e-commerce bags/accessories store.

Read the text below and return a JSON array, one object per distinct product mentioned. Each object must have exactly these fields:
- "name": string (product name/title)
- "category": string (one of: Bags, Handbags, Sling Bags, Tote Bags, Backpacks, Laptop Bags, Travel Bags, Clutches, Wallets, Accessories - pick the closest match, default "Bags" if unclear)
- "price": number (selling price; if only one price is mentioned, use it; if a supplier cost and a margin/markup percent are both mentioned, compute price = cost + that % of cost)
- "oldPrice": number or null (a "before"/MRP/strike-through price if mentioned, else null)
- "stock": number (quantity available; default 10 if not mentioned)
- "description": string (an opening/mood line plus a 2-4 sentence description, combined into one flowing paragraph if both are present, else just whatever description text is given, else "")
- "colors": array of strings (color names mentioned)
- "images": array of strings (any image URLs that are NOT tied to one specific color)
- "colorImages": object mapping each color name to an array of its image URL(s) - ONLY include a color here if the text actually ties a URL to that color
- "keyFeatures": array of strings (one short phrase per bullet/feature mentioned, e.g. under a "Key Features" heading; empty array if none)
- "dimensions": string (measurements as given, e.g. "Width 12in · Height 9in · Depth 4.5in"; else "")
- "materials": string (materials/composition as given, e.g. "Vegan leather (PU) exterior · Polyester lining"; else "")
- "careInstructions": string (care instructions as given; else "")
- "trustSignals": array of strings (short trust/warranty/return/certification lines, e.g. "100% Vegan & Cruelty-Free", "7-Day Easy Returns"; empty array if none)
- "supplierName": string or null
- "supplierProductId": string or null
- "supplierLink": string or null
- "supplierCost": number or null
- "shippingTime": string or null

CRITICAL RULES:
- Only use image URLs that literally appear in the text. NEVER invent, guess, or complete a URL. If a product has no image URL in the text, "images" and "colorImages" must be empty.
- Only report a color under "colorImages" if its URL is clearly stated in the text next to it - do not assume or guess which photo belongs to which color.
- If the text has a line starting with "Color Images:" (or very close to it) in the exact format "ColorA=url1,url2|ColorB=url1,url2" - parse this line MECHANICALLY, character by character, like a machine, not by "understanding" the product: split the line on "|" to get one segment per color; for each segment, split on the FIRST "=" only - everything before it is that segment's color name (use it verbatim, do not rename/reorder/normalize it), everything after it is that color's own url list, split on ",". NEVER let one color's URLs end up under a different color's key, and NEVER change the order colors appear in. This is the single most common and most costly mistake to make - re-check your own colorImages object against this line before finalizing your answer.
- If nothing in the text indicates a field, use an empty string, empty array, or null as appropriate (never omit the key).
- Return ONLY the JSON array, no markdown code fences, no commentary.

TEXT:
"""
${text}
"""`;

  try {
    /*
     * Gemini's free-tier models occasionally return 503 UNAVAILABLE
     * ("This model is currently experiencing high demand") or 429 rate
     * limit errors - both are Google-side, temporary, and usually clear
     * up within a few seconds. Retry a few times with a short growing
     * delay before giving up, instead of failing on the first blip.
     */
    let response;
    let lastErrText = "";
    const RETRYABLE_STATUSES = [503, 429];
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
          })
        }
      );
      if (response.ok) break;

      lastErrText = await response.text().catch(() => "");
      console.error("QUICK ADD PARSE ERROR:", response.status, lastErrText);

      const shouldRetry = RETRYABLE_STATUSES.includes(response.status) && attempt < MAX_ATTEMPTS;
      if (!shouldRetry) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }

    if (!response.ok) {
      const message = RETRYABLE_STATUSES.includes(response.status)
        ? "Google's AI service is overloaded right now (this is on Google's side, not your site) - please wait a minute and try again."
        : "AI couldn't process that text. Please try again.";
      return res.status(500).json({ success: false, message });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(parsed)) {
      return res.status(500).json({
        success: false,
        message: "AI response wasn't in the expected format. Please try rephrasing and try again."
      });
    }

    /*
     * DETERMINISTIC OVERRIDE FOR "Color Images:" LINES
     * Gemini has shown a real, repeatable failure mode here: given a line
     * like "Color Images: Black=url1,url2|Tan=url1,url2", it can scramble
     * which URLs it assigns to which color when building the colorImages
     * JSON - a mistake plain string-splitting code never makes (the CSV
     * upload path uses the exact same split-on-"|"-then-first-"=" logic
     * and has never shown this problem). So for the common case of a
     * SINGLE product with a SINGLE "Color Images:" line in the pasted
     * text, don't trust the AI's colorImages at all - parse that line
     * ourselves and use it instead, letting the AI only handle the
     * fields that are genuinely free text (name, description, etc).
     * With multiple products/lines in one paste, this 1:1 mapping isn't
     * safe to assume, so it's left to the AI (with the stricter prompt
     * instructions above) in that case.
     */
    const colorImagesLineMatches = [...text.matchAll(/color images\s*:\s*(.+)/gi)];
    if (parsed.length === 1 && colorImagesLineMatches.length === 1) {
      const deterministicColorImages = {};
      colorImagesLineMatches[0][1]
        .split("|")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const eqIndex = pair.indexOf("=");
          if (eqIndex === -1) return;
          const color = pair.slice(0, eqIndex).trim();
          const urls = pair.slice(eqIndex + 1).split(",").map((url) => url.trim()).filter(Boolean);
          if (color && urls.length) deterministicColorImages[color] = urls;
        });

      if (Object.keys(deterministicColorImages).length > 0) {
        parsed[0].colorImages = deterministicColorImages;
        // Make sure every color named in the deterministic map is also
        // listed in "colors" (AI-extracted plain color names are reliable,
        // this just guards against it missing one).
        const existingColors = new Set(
          (Array.isArray(parsed[0].colors) ? parsed[0].colors : []).map((c) => String(c).toLowerCase())
        );
        for (const color of Object.keys(deterministicColorImages)) {
          if (!existingColors.has(color.toLowerCase())) {
            parsed[0].colors = [...(Array.isArray(parsed[0].colors) ? parsed[0].colors : []), color];
          }
        }
      }
    }

    return res.json({ success: true, products: parsed });
  } catch (error) {
    console.error("QUICK ADD PARSE ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not reach the AI service. Please try again." });
  }
});

/*
 * IMPORT FROM GOOGLE SHEET (published CSV link)
 * Lets the admin paste a Google Sheet's "Publish to web" CSV link
 * instead of downloading + re-uploading a .csv file every time they
 * change the sheet. A browser fetch of that link would usually be
 * blocked by CORS, so this route fetches the CSV text server-side
 * and just hands it back - the admin panel then parses it with the
 * exact same column logic as the "Bulk Upload" CSV file feature, so
 * the sheet needs the same columns as the downloadable template.
 */
app.post("/api/admin/fetch-sheet-csv", requireAdmin, async function (req, res) {
  const rawUrl = String((req.body || {}).url || "").trim();
  if (!rawUrl) {
    return res.status(400).json({ success: false, message: "Please paste a Google Sheet link." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ success: false, message: "That doesn't look like a valid link." });
  }

  if (parsedUrl.protocol !== "https:") {
    return res.status(400).json({ success: false, message: "The link must start with https://." });
  }
  const allowedHosts = ["docs.google.com", "spreadsheets.google.com"];
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    return res.status(400).json({
      success: false,
      message:
        "This only accepts a Google Sheets link (docs.google.com). In your sheet use File > Share > Publish to web, choose 'Comma-separated values (.csv)', then paste that link here."
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(parsedUrl.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Google Sheets returned an error (${response.status}). Make sure the sheet is published to the web as CSV and the link is correct.`
      });
    }

    const csvText = await response.text();
    if (csvText.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "This sheet is too large to import (over 5MB)." });
    }
    // A "Publish to web" link that wasn't actually set to CSV output
    // often still returns an HTML page (Google's normal viewer) with
    // a 200 status - catch that here with a clear message instead of
    // a confusing parse error later.
    const trimmed = csvText.trim().toLowerCase();
    if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
      return res.status(400).json({
        success: false,
        message:
          "That link returned a web page, not CSV data. In Google Sheets use File > Share > Publish to web, choose your sheet and 'Comma-separated values (.csv)', click Publish, then copy that link."
      });
    }

    return res.json({ success: true, csv: csvText });
  } catch (error) {
    console.error("FETCH SHEET CSV ERROR:", error);
    const message =
      error.name === "AbortError"
        ? "Google Sheets took too long to respond. Please try again."
        : "Could not fetch that link. Please check it and try again.";
    return res.status(500).json({ success: false, message });
  }
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

    if (body.keyFeatures !== undefined) updateData.key_features = normalizeStringList(body.keyFeatures);
    if (body.dimensions !== undefined) updateData.dimensions = String(body.dimensions).trim();
    if (body.materials !== undefined) updateData.materials = String(body.materials).trim();
    if (body.careInstructions !== undefined) {
      updateData.care_instructions = String(body.careInstructions).trim();
    }
    if (body.trustSignals !== undefined) updateData.trust_signals = normalizeStringList(body.trustSignals);

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

    /*
     * REORDER / REMOVE SAVED PHOTOS (2026-10-05)
     * body.keepImages = JSON array of the product's EXISTING photo URLs
     * in the exact order the admin arranged them (any left out were
     * removed with ✕). This works the same for photos that were
     * uploaded and photos that came in as links (CSV / Quick Add /
     * imgbb), which before could never be re-ordered after saving.
     * Any newly uploaded "images" files are added AFTER the kept ones.
     * When keepImages is not sent, the old behaviour stays: uploaded
     * files replace the whole gallery.
     */
    if (body.keepImages !== undefined) {
      const previousImages = normalizeImages(existing.images);
      const keptImages = normalizeImages(body.keepImages);
      let addedUrls = [];
      if (galleryFiles.length > 0) {
        addedUrls = await mapWithConcurrencyLimit(
          galleryFiles,
          IMAGE_UPLOAD_CONCURRENCY,
          (file) => uploadImage(file)
        );
        newUploadedUrls.push(...addedUrls);
      }
      const finalImages = uniqueImages([...keptImages, ...addedUrls]);
      if (finalImages.length === 0) {
        if (newUploadedUrls.length) await deleteStorageImages(newUploadedUrls);
        return res.status(400).json({ success: false, message: "A product needs at least one photo." });
      }
      updateData.images = finalImages;
      oldImages = previousImages.filter((url) => !finalImages.includes(url));
    } else if (galleryFiles.length > 0) {
      oldImages = normalizeImages(existing.images);
      // Upload a few replacement photos at a time - same speed-up (and
      // same connection-limit safety) as the "Add Product" route.
      const galleryUrls = await mapWithConcurrencyLimit(
        galleryFiles,
        IMAGE_UPLOAD_CONCURRENCY,
        (file) => uploadImage(file)
      );
      newUploadedUrls.push(...galleryUrls);
      updateData.images = uniqueImages(galleryUrls);
    }

    /*
     * COLOR PHOTOS
     * Starts from whatever color photos the product already has, then
     * layers on body.colorImages - which the admin panel now sends as
     * "here's exactly which of the EXISTING photos to keep for each
     * color" (any the admin removed with the ✕ button are simply left
     * out) - and finally APPENDS any freshly-uploaded colorImage__<Color>
     * files on top of whatever was kept, so adding new photos for one
     * color never wipes out the others, and no longer wipes out that
     * color's own kept photos either.
     */
    if (body.colorImages !== undefined || colorFiles.length > 0) {
      const colorImages = {
        ...normalizeColorImages(existing.color_images),
        ...normalizeColorImages(body.colorImages)
      };
      const colorFilesByColor = {};
      for (const file of colorFiles) {
        const color = decodeURIComponent(file.fieldname.slice("colorImage__".length)).trim();
        if (!color) continue;
        if (!colorFilesByColor[color]) colorFilesByColor[color] = [];
        colorFilesByColor[color].push(file);
      }
      // Flatten every color's files into one list (tagged with their color)
      // so the concurrency limit applies across ALL of them together - same
      // connection-limit safety as the "Add Product" route above.
      const colorFileEntries = [];
      for (const color of Object.keys(colorFilesByColor)) {
        for (const file of colorFilesByColor[color]) {
          colorFileEntries.push({ color, file });
        }
      }
      const colorUploadResults = await mapWithConcurrencyLimit(
        colorFileEntries,
        IMAGE_UPLOAD_CONCURRENCY,
        async ({ color, file }) => ({ color, url: await uploadImage(file) })
      );
      const newUrlsByColor = {};
      for (const { color, url } of colorUploadResults) {
        newUploadedUrls.push(url);
        if (!newUrlsByColor[color]) newUrlsByColor[color] = [];
        newUrlsByColor[color].push(url);
      }
      for (const color of Object.keys(newUrlsByColor)) {
        colorImages[color] = uniqueImages([...(colorImages[color] || []), ...newUrlsByColor[color]]);
      }
      updateData.color_images = colorImages;
    }

    if (body.colorNames !== undefined) {
      // Full replace (like color_images above) - the admin form always
      // sends every color's current name, blank or not, so this is how
      // a name gets cleared, not just how one gets added/changed.
      updateData.color_names = normalizeColorNames(body.colorNames);
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (oldImages.length) {
      // Only files in our own Supabase storage are deleted - external
      // links (imgbb etc.) are simply dropped from the product. A photo
      // still used as a color photo is never deleted.
      const colorImageMap = normalizeColorImages(data?.color_images ?? existing.color_images);
      const stillUsed = new Set(Object.values(colorImageMap).flat());
      const removable = oldImages.filter((url) => !stillUsed.has(url));
      if (removable.length) await deleteStorageImages(removable);
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

    /*
     * PERMANENT DELETE - the admin explicitly asked for this instead of
     * the old soft-delete (which kept the row forever with active:false,
     * silently reserving its name and wasting storage). This removes the
     * row for good, plus any of its photos that were actually uploaded
     * to Supabase Storage (deleteStorageImages harmlessly ignores any
     * external URLs, like imgbb links pasted via CSV/Quick Add, since
     * those were never stored here in the first place).
     */
    const colorImageUrls = product.color_images && typeof product.color_images === "object"
      ? Object.values(product.color_images).flat()
      : [];
    const allImages = uniqueImages([...normalizeImages(product.images), ...colorImageUrls]);

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      // Postgres foreign-key violation (23503): this product is referenced
      // by past orders (order_items.product_id), so the database won't
      // allow a hard delete - that history has to stay intact. Fall back
      // to hiding it instead (same as the old behaviour) rather than
      // failing outright, and say why so it's not confusing.
      if (error.code === "23503") {
        const { error: hideError } = await supabase
          .from("products")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (hideError) throw hideError;
        return res.json({
          success: true,
          message: "This product has past orders, so it can't be fully erased without losing that order history - it's been hidden from the store instead."
        });
      }
      throw error;
    }

    // Only clean up Storage photos once the row itself is actually gone -
    // deleteStorageImages harmlessly ignores any external URLs (like
    // imgbb links pasted via CSV/Quick Add), since those were never
    // stored here in the first place.
    if (allImages.length) await deleteStorageImages(allImages);

    return res.json({ success: true, message: "Product permanently deleted." });
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
/*
 * DOWNLOAD ALL PRODUCT PHOTOS (admin only)
 * Returns one ZIP with every product photo (all colors) converted to
 * JPG, named after the product - for ads, Instagram posts etc., so the
 * owner never needs to keep separate copies of the photos.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Minimal "stored" (no compression - JPGs are already compressed) ZIP.
function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const data = file.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function safeFileName(text) {
  return String(text || "photo")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "photo";
}

app.get("/api/admin/download-images", requireAdmin, async function (req, res) {
  try {
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    // One job per photo: product name (+ color name) and the image URL.
    const jobs = [];
    const seenUrls = new Set();
    for (const raw of Array.isArray(data) ? data : []) {
      const product = formatProduct(raw);
      if (!product) continue;
      const folder = safeFileName(product.name);
      const groups = [];
      for (const color of product.colors) {
        const urls = product.colorImages[color];
        if (Array.isArray(urls) && urls.length) {
          groups.push({ label: product.colorNames[color] || `${product.name} ${color}`, urls });
        }
      }
      groups.push({ label: product.name, urls: product.images });
      for (const group of groups) {
        let index = 0;
        for (const url of group.urls) {
          if (typeof url !== "string" || !/^https?:\/\//.test(url) || seenUrls.has(url)) continue;
          seenUrls.add(url);
          index += 1;
          jobs.push({ url, name: `${folder}/${safeFileName(group.label)} ${index}.jpg` });
        }
      }
    }

    if (!jobs.length) {
      return res.status(404).json({ success: false, message: "No product photos found." });
    }

    const files = [];
    const usedNames = new Set();
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          const response = await fetch(job.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const original = Buffer.from(await response.arrayBuffer());
          const jpg = await sharp(original).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
          let name = job.name;
          let n = 2;
          while (usedNames.has(name)) name = job.name.replace(/\.jpg$/, ` (${n++}).jpg`);
          usedNames.add(name);
          files.push({ name, data: jpg });
        } catch (photoError) {
          console.error("PHOTO DOWNLOAD SKIPPED:", job.url, photoError?.message);
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));

    if (!files.length) {
      return res.status(502).json({ success: false, message: "Could not read the product photos. Please try again." });
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    const zip = buildZip(files);
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", 'attachment; filename="shrimoh-product-photos.zip"');
    res.set("Cache-Control", "no-store");
    return res.send(zip);
  } catch (zipError) {
    console.error("DOWNLOAD IMAGES ERROR:", zipError);
    return res.status(500).json({ success: false, message: zipError?.message || "Unable to prepare photos." });
  }
});

/*
 * SINGLE PRODUCT PHOTO - ORIGINAL QUALITY (admin only, 2026-10-19)
 * Backup route for the per-product "Photos" button in Admin. The admin
 * page first downloads each photo straight from its own link (fastest);
 * only if a photo's site blocks that, it comes through here. The bytes
 * are passed through exactly as stored - no resize, no re-compression -
 * so the quality is the same as the saved photo.
 */
app.get("/api/admin/photo-original", requireAdmin, async function (req, res) {
  try {
    const url = String(req.query.url || "");
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, message: "Invalid photo link." });
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      return res.status(415).json({ success: false, message: "This link is not a photo." });
    }
    const data = Buffer.from(await response.arrayBuffer());
    res.set("Content-Type", type);
    res.set("Cache-Control", "no-store");
    return res.send(data);
  } catch (photoError) {
    console.error("PHOTO ORIGINAL ERROR:", photoError?.message);
    return res.status(502).json({ success: false, message: "Could not get this photo. Please try again." });
  }
});

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

/* =========================================================
   RAZORPAY MAGIC CHECKOUT
   One-click checkout: the customer logs in with an OTP inside the
   Razorpay popup and their saved address is filled in automatically.
   Razorpay calls the three public endpoints below (set them in the
   Razorpay Dashboard -> Magic Checkout settings):
     Shipping info URL:      /api/magic/shipping-info
     URL for get promotions: /api/magic/promotions
     URL for apply promotions: /api/magic/apply-promotion
   After payment, /api/orders (with payment.magic = true) reads the
   customer's name/address straight from the Razorpay order.
========================================================= */

// Coupons listed inside the Magic Checkout popup. Any other valid
// coupon still works if the customer types it in.
const MAGIC_LISTED_COUPONS = ["NEW15"];
const MAGIC_SITE_URL = "https://shrimoh.vercel.app";

function magicBody(req) {
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length) return req.body;
  return req.query || {};
}

function magicVariantId(productId, color) {
  if (!color) return String(productId);
  const slug = String(color).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${productId}-${slug || "color"}`;
}

function couponSummary(coupon) {
  const value = safeNumber(coupon.discount_value);
  const min = safeNumber(coupon.min_order_amount);
  const main = coupon.discount_type === "percentage"
    ? `${value}% off on your order`
    : `₹${value.toLocaleString("en-IN")} off on your order`;
  return {
    summary: main,
    description: min > 0 ? `${main} above ₹${min.toLocaleString("en-IN")}` : main
  };
}

// Finds the cart value (in rupees, before coupon) of a Magic order
// from its receipt, which is what Razorpay sends as "order_id".
async function magicCartValueFromReceipt(receipt) {
  if (!receipt) return null;
  try {
    const list = await razorpay.orders.all({ receipt: String(receipt), count: 1 });
    const order = list && Array.isArray(list.items) ? list.items[0] : null;
    if (!order) return null;
    const paise = safeNumber(order.line_items_total) || safeNumber(order.amount);
    return paise > 0 ? paise / 100 : null;
  } catch (error) {
    console.error("MAGIC RECEIPT LOOKUP ERROR:", error);
    return null;
  }
}

app.post("/api/magic/create-order", async function (req, res) {
  try {
    if (!razorpay) {
      return res.status(500).json({ success: false, message: "Razorpay is not configured on the server." });
    }

    const cart = await calculateCart(req.body?.items, null);

    const lineItems = cart.items.map(function (item) {
      const pricePaise = Math.round(item.price * 100);
      return {
        type: "e-commerce",
        sku: String(item.productId),
        variant_id: magicVariantId(item.productId, item.selectedColor),
        price: pricePaise,
        offer_price: pricePaise,
        tax_amount: 0,
        quantity: item.quantity,
        name: String(item.name || "SHRIMOH Bag").slice(0, 120),
        description: String(
          item.selectedColor ? `${item.name} - ${item.selectedColor}` : item.name || "SHRIMOH Bag"
        ).slice(0, 250),
        image_url: item.image || "",
        product_url: `${MAGIC_SITE_URL}/product/${encodeURIComponent(String(item.productId))}`
      };
    });

    const lineItemsTotal = lineItems.reduce((total, item) => total + item.offer_price * item.quantity, 0);
    if (!Number.isInteger(lineItemsTotal) || lineItemsTotal < 100) {
      return res.status(400).json({ success: false, message: "Order amount must be at least ₹1." });
    }

    const receipt = `SHRIMOH_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: lineItemsTotal,
      currency: "INR",
      receipt,
      line_items_total: lineItemsTotal,
      line_items: lineItems,
      notes: { source: "magic_checkout" }
    });

    return res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt
    });
  } catch (error) {
    console.error("MAGIC CREATE ORDER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || "Unable to start checkout."
    });
  }
});

// Free delivery to every Indian pincode; COD (with COD_FEE_RUPEES) when MAGIC_COD_ENABLED.
app.all("/api/magic/shipping-info", function (req, res) {
  const body = magicBody(req);
  const addresses = Array.isArray(body.addresses) ? body.addresses : [];
  return res.json({
    addresses: addresses.map(function (address) {
      const country = String(address.country || "IN").toUpperCase();
      const serviceable = country === "IN";
      return {
        id: String(address.id ?? "0"),
        zipcode: String(address.zipcode || ""),
        state_code: address.state_code || undefined,
        country,
        shipping_methods: [
          {
            id: "free_delivery",
            name: "Free Delivery",
            description: "Delivered in 5-9 business days",
            serviceable,
            shipping_fee: 0,
            cod: serviceable && MAGIC_COD_ENABLED,
            cod_fee: serviceable && MAGIC_COD_ENABLED ? COD_FEE_RUPEES * 100 : 0
          }
        ]
      };
    })
  });
});

app.all("/api/magic/promotions", async function (req, res) {
  try {
    const { data: coupons, error } = await supabase
      .from("coupons")
      .select("*")
      .in("code", MAGIC_LISTED_COUPONS);
    if (error) throw error;

    const now = Date.now();
    const promotions = (Array.isArray(coupons) ? coupons : [])
      .filter(function (coupon) {
        if (!coupon.active) return false;
        if (coupon.expiry_date && new Date(coupon.expiry_date).getTime() < now) return false;
        if (coupon.usage_limit !== null && coupon.usage_limit !== undefined &&
            Math.floor(safeNumber(coupon.times_used)) >= Math.floor(safeNumber(coupon.usage_limit))) return false;
        return true;
      })
      .map(function (coupon) {
        return { code: coupon.code, ...couponSummary(coupon) };
      });

    return res.json({ promotions });
  } catch (error) {
    console.error("MAGIC PROMOTIONS ERROR:", error);
    return res.json({ promotions: [] });
  }
});

app.all("/api/magic/apply-promotion", async function (req, res) {
  const body = magicBody(req);
  const code = String(body.code || "").trim().toUpperCase();
  try {
    if (!code) {
      return res.status(400).json({ failure_code: "INVALID_PROMOTION", failure_reason: "Please enter a coupon code." });
    }
    const cartValue = await magicCartValueFromReceipt(body.order_id);
    if (!cartValue) {
      return res.status(400).json({ failure_code: "INVALID_PROMOTION", failure_reason: "Could not read this order. Please try again." });
    }
    const { coupon, discountAmount } = await getValidCoupon(code, cartValue);
    return res.json({
      promotion: {
        reference_id: String(coupon.id || coupon.code),
        type: "coupon",
        code: coupon.code,
        value: Math.round(discountAmount * 100),
        value_type: "fixed_amount",
        description: couponSummary(coupon).summary
      }
    });
  } catch (error) {
    const message = error?.message || "This coupon cannot be applied.";
    const failureCode = /minimum order/i.test(message) ? "REQUIREMENT_NOT_MET" : "INVALID_PROMOTION";
    return res.status(400).json({ failure_code: failureCode, failure_reason: message });
  }
});

// Turns the address Magic Checkout collected into this store's
// customer format. Missing pieces get safe placeholders so the order
// is never lost after a successful payment.
function customerFromMagicOrder(rzpOrder, rzpPayment) {
  const details = (rzpOrder && rzpOrder.customer_details) || {};
  const address = details.shipping_address || details.billing_address || {};
  const contact = String(details.contact || address.contact || (rzpPayment && rzpPayment.contact) || "");
  const mobile = contact.replace(/\D/g, "").slice(-10);
  const email = String(details.email || (rzpPayment && rzpPayment.email) || "").trim().toLowerCase();
  const lines = [address.line1, address.line2].filter(Boolean).map((part) => String(part).trim());
  return {
    name: String(address.name || "SHRIMOH Customer").trim(),
    mobile: /^[0-9]{10}$/.test(mobile) ? mobile : "0000000000",
    email: email && email.includes("@") ? email : `guest-${mobile || Date.now()}@guest.shrimoh.invalid`,
    address: lines.join(", ") || "Address not received - please contact customer",
    city: String(address.city || "-").trim(),
    state: String(address.state || "-").trim(),
    pincode: String(address.zipcode || "").replace(/\D/g, "").slice(0, 6) || "000000"
  };
}

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
    const items = body.items;
    const payment = body.payment || {};
    let paymentMethod = payment.method || "Razorpay";
    const isMagic = payment.magic === true;
    let isMagicCod = false;

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method." });
    }

    let customer = body.customer;
    let couponCode = body.couponCode || null;
    let magicOrder = null;
    let magicPayment = null;

    if (isMagic) {
      // Magic Checkout: the address and any coupon live on the
      // Razorpay order, not in the request.
      const magicOrderId = payment.razorpayOrderId || payment.razorpay_order_id;
      const magicPaymentId = payment.razorpayPaymentId || payment.razorpay_payment_id;
      if (!magicOrderId || (!magicPaymentId && !MAGIC_COD_ENABLED)) {
        return res.status(400).json({ success: false, message: "Razorpay payment details are required." });
      }
      try {
        magicOrder = await razorpay.orders.fetch(magicOrderId);
        if (magicPaymentId) {
          magicPayment = await razorpay.payments.fetch(magicPaymentId);
        } else {
          // A COD order may come back without a payment ID - look it up
          // on Razorpay's side (server-to-server, so it can't be faked).
          const list = await razorpay.orders.fetchPayments(magicOrderId);
          const items = list && Array.isArray(list.items) ? list.items : [];
          magicPayment = items.find((item) => String(item.method || "").toLowerCase() === "cod") || null;
        }
      } catch (fetchError) {
        console.error("MAGIC ORDER FETCH ERROR:", fetchError);
        return res.status(502).json({ success: false, message: "Could not confirm payment with Razorpay. Please contact support with your payment ID." });
      }
      if (!magicPayment || magicPayment.order_id !== magicOrderId) {
        return res.status(400).json({ success: false, message: "Razorpay payment details are required." });
      }
      if (String(magicPayment.method || "").toLowerCase() === "cod") {
        if (!MAGIC_COD_ENABLED) {
          return res.status(400).json({ success: false, message: "Cash on Delivery is not available." });
        }
        isMagicCod = true;
        paymentMethod = "COD";
      }
      customer = customerFromMagicOrder(magicOrder, magicPayment);
      const promotions = Array.isArray(magicOrder.promotions) ? magicOrder.promotions : [];
      couponCode = promotions.length && promotions[0].code ? String(promotions[0].code) : null;
    } else {
      const customerError = validateCustomer(customer);
      if (customerError) return res.status(400).json({ success: false, message: customerError });
    }

    let cart;
    try {
      cart = await calculateCart(items, couponCode);
    } catch (cartError) {
      // A coupon that was valid inside Magic Checkout may have just
      // run out; the customer has already paid, so price it without
      // the coupon and let the amount check below decide.
      if (!isMagic || !couponCode) throw cartError;
      console.error("MAGIC COUPON RECHECK FAILED:", cartError?.message);
      cart = await calculateCart(items, null);
      const paidRupees = safeNumber(magicPayment && magicPayment.amount) / 100;
      if (paidRupees > 0 && paidRupees < cart.total) {
        // Record what was actually paid, keeping the coupon on the order.
        cart.discount = Math.round((cart.subtotal + cart.delivery - paidRupees) * 100) / 100;
        cart.total = paidRupees;
        cart.couponCode = String(couponCode).toUpperCase();
      }
    }
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

      // Security: make sure the money actually paid matches THIS cart's
      // total, so a cheap payment can never be reused for costly items.
      const expectedPaise = Math.round(cart.total * 100);
      let razorpayPayment = magicPayment;
      if (!razorpayPayment) {
        try {
          razorpayPayment = await razorpay.payments.fetch(razorpayPaymentId);
        } catch (fetchError) {
          console.error("RAZORPAY PAYMENT FETCH ERROR:", fetchError);
          return res.status(502).json({ success: false, message: "Could not confirm payment with Razorpay. Please contact support with your payment ID." });
        }
      }
      // Magic Checkout: the paid amount can never be below this cart's
      // price after a coupon this store itself allows (Re 1 rounding room).
      const amountOk = isMagic
        ? Number(razorpayPayment && razorpayPayment.amount) >= expectedPaise - 100
        : Number(razorpayPayment && razorpayPayment.amount) === expectedPaise;
      if (
        !razorpayPayment ||
        razorpayPayment.order_id !== razorpayOrderId ||
        !amountOk ||
        !["captured", "authorized"].includes(razorpayPayment.status)
      ) {
        console.error("RAZORPAY AMOUNT MISMATCH:", {
          paymentId: razorpayPaymentId,
          paidPaise: razorpayPayment && razorpayPayment.amount,
          expectedPaise,
          status: razorpayPayment && razorpayPayment.status
        });
        return res.status(400).json({ success: false, message: "Payment amount does not match the order total." });
      }

      paymentStatus = "Paid";
    }

    if (paymentMethod === "COD") paymentStatus = "Pending";

    if (isMagicCod) {
      // COD placed inside Magic Checkout: Razorpay already ran the COD
      // OTP / RTO check. Nothing is paid online, cash is collected at
      // delivery = order total + COD fee.
      razorpayOrderId = magicPayment.order_id;
      razorpayPaymentId = magicPayment.id;
      razorpaySignature = payment.razorpaySignature || payment.razorpay_signature || null;

      const { data: duplicateCod, error: duplicateCodError } = await supabase
        .from("payments")
        .select("id")
        .eq("payment_id", razorpayPaymentId)
        .maybeSingle();
      if (duplicateCodError) throw duplicateCodError;
      if (duplicateCod) {
        return res.status(409).json({ success: false, message: "This order has already been placed." });
      }

      const expectedPaise = Math.round(cart.total * 100);
      if (
        Number(magicPayment.amount) < expectedPaise - 100 ||
        String(magicPayment.status || "").toLowerCase() === "failed"
      ) {
        console.error("MAGIC COD AMOUNT MISMATCH:", {
          paymentId: razorpayPaymentId,
          paise: magicPayment.amount,
          expectedPaise,
          status: magicPayment.status
        });
        return res.status(400).json({ success: false, message: "Order amount does not match. Please try again." });
      }

      cart.delivery = Math.round((safeNumber(cart.delivery) + COD_FEE_RUPEES) * 100) / 100;
      cart.total = Math.round((safeNumber(cart.total) + COD_FEE_RUPEES) * 100) / 100;
      paymentStatus = "Pending";
    }

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

    let orderReference = "";

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
    const { data: order, error: orderError } = await withOrderNumberLock(async function () {
      orderReference = await getNextOrderNumber();
      return supabase
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
    });
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
    if (!cleanCustomer.email.endsWith(".invalid")) sendOrderConfirmationEmail({
      to: cleanCustomer.email,
      customerName: cleanCustomer.name,
      orderReference,
      items: cart.items,
      subtotal: cart.subtotal,
      delivery: cart.delivery,
      discount: cart.discount,
      total: cart.total,
      paymentMethod: paymentMethod === "COD"
        ? `Cash on Delivery - please keep Rs. ${Number(cart.total).toLocaleString("en-IN")} ready (includes Rs. ${COD_FEE_RUPEES} COD charge)`
        : paymentMethod
    }).catch((error) => {
      console.error("ORDER EMAIL ERROR:", error);
    });

    /*
     * NEW ORDER PHONE ALERT (2026-10-22) - free "ntfy" app push
     * notification to the owner's phone. Only runs when NTFY_TOPIC is
     * set on Render. Best-effort: never affects the order. Kept short
     * on purpose (no phone number / full address in the alert).
     */
    sendNewOrderPhoneAlert({
      orderReference,
      total: cart.total,
      paymentMethod,
      items: cart.items,
      customerName: cleanCustomer.name,
      city: cleanCustomer.city
    }).catch((error) => {
      console.error("ORDER PHONE ALERT ERROR:", error);
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
    const reference = String(req.query.reference || req.query.orderReference || "").trim().replace(/^#\s*/, "");
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

/*
 * =========================================================
 * EMAIL MARKETING CAMPAIGN (2026-10-21)
 * =========================================================
 * Admin > Email Campaign sends one promotional email (message +
 * chosen bags + optional coupon) to a list of old customers, through
 * the SAME Gmail account + App Password the order emails already use.
 *
 * Gmail safety:
 *  - emails go out one by one with a pause (MARKETING_DELAY_MS), never
 *    all at once, so Gmail doesn't treat it as spam
 *  - at most MARKETING_DAILY_LIMIT marketing emails in any 24 hours
 *    (Gmail's own limit is ~500/day incl. order emails)
 *  - every email has an Unsubscribe link + one-click unsubscribe
 *    header; unsubscribed addresses are skipped forever
 *  - pressing Send again with the SAME subject skips everyone who
 *    already got it (so a stopped campaign can just be resumed)
 *
 * Needs two Supabase tables - run once in Supabase > SQL Editor:
 *
 *   create table if not exists email_unsubscribes (
 *     email text primary key,
 *     created_at timestamptz not null default now()
 *   );
 *   create table if not exists email_campaign_sends (
 *     id bigserial primary key,
 *     campaign_id text not null,
 *     email text not null,
 *     status text not null,
 *     error text,
 *     created_at timestamptz not null default now(),
 *     unique (campaign_id, email)
 *   );
 *   alter table email_unsubscribes enable row level security;
 *   alter table email_campaign_sends enable row level security;
 */
// Brevo free plan = 300 emails/day (shared with order emails), so keep
// some room for order confirmations. Gmail allows ~500/day.
const MARKETING_DAILY_LIMIT = BREVO_API_KEY ? 250 : 400;
const MARKETING_DELAY_MS = 4000;
const MARKETING_MAX_PRODUCTS = 6;
const MARKETING_SITE_URL = "https://shrimoh.vercel.app";
const MARKETING_API_URL = process.env.PUBLIC_API_URL || "https://luxora-store-mkva.onrender.com";
const MARKETING_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let marketingJob = null; // { running, campaignId, subject, total, sent, failed, ... }

function marketingEscape(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function marketingCampaignId(subject) {
  return crypto.createHash("sha256").update(String(subject || "").trim().toLowerCase()).digest("hex").slice(0, 16);
}

function marketingUnsubscribeToken(email) {
  return crypto
    .createHmac("sha256", String(ADMIN_JWT_SECRET || "shrimoh-unsubscribe"))
    .update(`unsubscribe:${String(email).trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 24);
}

function marketingUnsubscribeUrl(email) {
  const clean = String(email).trim().toLowerCase();
  return `${MARKETING_API_URL}/api/unsubscribe?e=${encodeURIComponent(clean)}&t=${marketingUnsubscribeToken(clean)}`;
}

// Small, email-friendly copy of a product photo, served from our OWN
// server (/api/email-image/<id>.jpg). An image link that hides another
// link inside it (like an image proxy) is a common spam signal, and
// some email apps refuse to load it.
function marketingImageUrl(product) {
  if (!product || !/^https?:\/\//i.test(String(product.image || ""))) return "";
  const version = encodeURIComponent(String(product.updatedAt || "").replace(/\D/g, "").slice(0, 14) || "1");
  return `${MARKETING_API_URL}/api/email-image/${encodeURIComponent(product.id)}.jpg?v=${version}`;
}

function marketingCleanRecipients(list) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(list) ? list : []) {
    const email = String((item && item.email) || item || "").trim().toLowerCase();
    if (!email || !MARKETING_EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    const name = item && typeof item === "object" ? String(item.name || "").trim().slice(0, 60) : "";
    result.push({ email, name });
  }
  return result;
}

function marketingCleanContent(body) {
  const subject = String(body.subject || "").trim().slice(0, 150);
  const heading = String(body.heading || "").trim().slice(0, 120);
  const message = String(body.message || "").trim().slice(0, 3000);
  const couponCode = String(body.couponCode || "").trim().toUpperCase().slice(0, 30);
  const productIds = (Array.isArray(body.productIds) ? body.productIds : [])
    .map((id) => String(id).trim())
    .filter(Boolean)
    .slice(0, MARKETING_MAX_PRODUCTS);
  const festive = body.festive !== false;
  if (!subject) return { error: "Please write a subject." };
  if (!message) return { error: "Please write a message." };
  return { subject, heading, message, couponCode, productIds, festive };
}

const MARKETING_AUTO_PRODUCTS = 4;

async function marketingLoadProducts(productIds) {
  if (!productIds.length) {
    // Nothing chosen: automatically show the newest bags that are in
    // stock and have a photo.
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map(formatProduct)
      .filter((product) => product && product.stock > 0 && /^https?:\/\//i.test(product.image || ""))
      .slice(0, 12)
      .map((product, index) => ({ product, index, off: marketingDiscountPercent(product) }))
      // newest bags, the ones with the biggest real saving first
      .sort((a, b) => b.off - a.off || a.index - b.index)
      .slice(0, MARKETING_AUTO_PRODUCTS)
      .map((item) => item.product);
  }
  const { data, error } = await supabase.from("products").select("*").in("id", productIds).eq("active", true);
  if (error) throw error;
  const byId = new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), formatProduct(row)]));
  return productIds.map((id) => byId.get(String(id))).filter(Boolean);
}

// Real discount from the product's own MRP (old price) - never made up.
function marketingDiscountPercent(product) {
  const price = safeNumber(product && product.price);
  const oldPrice = safeNumber(product && product.oldPrice);
  if (!(oldPrice > price && price > 0)) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function marketingEmailHtml({ content, products, recipientName, unsubscribeUrl, campaignId }) {
  const utm = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaignId)}`;
  const shopUrl = `${MARKETING_SITE_URL}/?${utm}`;
  const messageHtml = marketingEscape(content.message)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:${EMAIL_BRAND.text};">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  const cards = products.map((product) => {
    const link = `${MARKETING_SITE_URL}/product/${encodeURIComponent(product.id)}?${utm}`;
    const image = marketingImageUrl(product);
    const off = marketingDiscountPercent(product);
    const oldPrice = off
      ? `<span style="text-decoration:line-through;color:${EMAIL_BRAND.muted};font-size:13px;margin-left:6px;font-weight:normal;">${formatMoney(product.oldPrice)}</span>`
      : "";
    const saving = off
      ? `<div style="display:inline-block;margin-top:6px;padding:4px 9px;background:#5e1a24;color:#f3e6c8;border-radius:4px;font-size:11px;letter-spacing:0.5px;">${off}% OFF &middot; SAVE ${formatMoney(product.oldPrice - product.price)}</div>`
      : "";
    return `
      <td valign="top" width="50%" style="padding:8px;">
        <a href="${link}" style="text-decoration:none;color:${EMAIL_BRAND.ink};">
          ${image ? `<img src="${image}" alt="${marketingEscape(product.name)}" width="220" style="width:100%;max-width:220px;height:auto;border-radius:8px;display:block;border:1px solid ${EMAIL_BRAND.line};" />` : ""}
          <div style="font-size:13px;line-height:1.4;margin-top:10px;color:${EMAIL_BRAND.ink};">${marketingEscape(product.name)}</div>
          <div style="font-size:16px;margin-top:4px;color:${EMAIL_BRAND.ink};font-weight:bold;">${formatMoney(product.price)}${oldPrice}</div>
          ${saving}
        </a>
      </td>`;
  });
  let rows = "";
  for (let index = 0; index < cards.length; index += 2) {
    rows += `<tr>${cards[index]}${cards[index + 1] || '<td width="50%" style="padding:8px;"></td>'}</tr>`;
  }
  const productsHtml = rows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 20px;">${rows}</table>`
    : "";

  const couponHtml = content.couponCode
    ? `<div style="text-align:center;margin:6px 0 24px;padding:16px;border:1px dashed ${EMAIL_BRAND.gold};border-radius:8px;background:${EMAIL_BRAND.soft};">
         <div style="font-size:10px;letter-spacing:2px;color:${EMAIL_BRAND.muted};">USE CODE AT CHECKOUT</div>
         <div style="font-size:22px;letter-spacing:3px;color:${EMAIL_BRAND.ink};font-weight:bold;margin-top:6px;">${marketingEscape(content.couponCode)}</div>
       </div>`
    : "";

  const bestOff = products.reduce((max, product) => Math.max(max, marketingDiscountPercent(product)), 0);
  const festiveHtml = content.festive
    ? `<div style="margin:0 0 26px;padding:26px 18px;background:#5e1a24;border-radius:8px;text-align:center;">
         <div style="font-size:20px;line-height:1;color:#d8b56a;">&#10022; &#10022; &#10022;</div>
         <div style="font-family:Georgia,serif;font-size:28px;color:#f3e6c8;margin-top:12px;">Diwali Festive Sale</div>
         ${bestOff ? `<div style="font-size:15px;color:#d8b56a;margin-top:10px;letter-spacing:1px;">UP TO <strong style="font-size:22px;">${bestOff}% OFF</strong></div>` : ""}
         <div style="font-size:12px;color:#e8d3d6;margin-top:10px;">Free delivery across India &middot; Limited festive stock</div>
       </div>`
    : "";

  const bodyHtml = `
    ${festiveHtml}
    <p style="margin:0 0 14px;font-size:14px;">Hi ${marketingEscape(recipientName || "there")},</p>
    ${messageHtml}
    ${couponHtml}
    ${productsHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;background:${EMAIL_BRAND.soft};border-radius:8px;">
      <tr>
        <td align="center" width="33%" style="padding:14px 6px;font-size:12px;line-height:1.4;color:${EMAIL_BRAND.ink};">&#128666;<br />Free delivery<br />all India</td>
        <td align="center" width="34%" style="padding:14px 6px;font-size:12px;line-height:1.4;color:${EMAIL_BRAND.ink};">&#8617;&#65039;<br />Easy 5-day<br />returns</td>
        <td align="center" width="33%" style="padding:14px 6px;font-size:12px;line-height:1.4;color:${EMAIL_BRAND.ink};">&#128274;<br />Safe payment<br />by Razorpay</td>
      </tr>
    </table>
    <div style="text-align:center;margin:10px 0 8px;">
      <a href="${shopUrl}" style="display:inline-block;padding:14px 34px;background:${content.festive ? "#5e1a24" : EMAIL_BRAND.ink};color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;letter-spacing:2px;">${content.festive ? "SHOP THE DIWALI SALE" : "SHOP NOW"}</a>
    </div>
    <p style="margin:26px 0 0;font-size:11px;line-height:1.6;color:${EMAIL_BRAND.muted};text-align:center;">
      Shrimoh Craft, Kudi Bhagtasni, Sector 4, Jodhpur, Rajasthan<br />
      You are receiving this because you shopped with SHRIMOH.
      <a href="${unsubscribeUrl}" style="color:${EMAIL_BRAND.muted};">Unsubscribe</a>
    </p>`;

  return emailShell({ eyebrow: "SHRIMOH", heading: marketingEscape(content.heading), bodyHtml });
}

// Plain-text copy of the email. Emails with only HTML and no text part
// are more likely to be put in spam.
function marketingPlainText(html) {
  return String(html || "")
    .replace(/<a [^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, label) => {
      const text = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return text ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&middot;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function marketingSendOne({ to, subject, html, unsubscribeUrl }) {
  /*
   * (2026-10-22) Brevo first: Render blocks / times out raw Gmail SMTP
   * (port 465/587), so campaign emails go through Brevo's HTTPS API
   * whenever BREVO_API_KEY is set on Render. Gmail SMTP stays as the
   * fallback only when Brevo isn't set up.
   */
  if (BREVO_API_KEY) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "SHRIMOH", email: GMAIL_USER },
        replyTo: { email: GMAIL_USER, name: "SHRIMOH" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: marketingPlainText(html),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${GMAIL_USER}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      })
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Brevo API error ${response.status}: ${errorBody}`);
    }
    return;
  }
  if (!mailTransporter) throw new Error("Email is not set up (set BREVO_API_KEY on Render).");
  await mailTransporter.sendMail({
    from: `"SHRIMOH" <${GMAIL_USER}>`,
    replyTo: GMAIL_USER,
    to,
    subject,
    html,
    text: marketingPlainText(html),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${GMAIL_USER}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });
}

async function marketingSentInLast24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("email_campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", since);
  if (error) throw error;
  return count || 0;
}

function marketingIsGmailLimitError(error) {
  const text = String((error && (error.response || error.message)) || "");
  return /quota|limit exceeded|5\.4\.5|too many|rate limit|421|454|Brevo API error (402|429)/i.test(text);
}

async function runMarketingJob({ content, products, recipients, campaignId }) {
  for (const recipient of recipients) {
    if (!marketingJob || marketingJob.stopRequested) break;
    const unsubscribeUrl = marketingUnsubscribeUrl(recipient.email);
    let status = "sent";
    let errorText = null;
    try {
      const html = marketingEmailHtml({ content, products, recipientName: recipient.name, unsubscribeUrl, campaignId });
      await marketingSendOne({ to: recipient.email, subject: content.subject, html, unsubscribeUrl });
      marketingJob.sent += 1;
    } catch (error) {
      status = "failed";
      errorText = String((error && error.message) || error).slice(0, 300);
      marketingJob.failed += 1;
      marketingJob.lastError = errorText;
      console.error("MARKETING EMAIL ERROR:", recipient.email, errorText);
      if (marketingIsGmailLimitError(error)) {
        marketingJob.stoppedReason = "Gmail daily limit reached - press Send again tomorrow with the same subject to continue.";
        marketingJob.stopRequested = true;
      }
    }
    const { error: logError } = await supabase
      .from("email_campaign_sends")
      .upsert({ campaign_id: campaignId, email: recipient.email, status, error: errorText }, { onConflict: "campaign_id,email" });
    if (logError) console.error("MARKETING LOG ERROR:", logError);
    await new Promise((resolve) => setTimeout(resolve, MARKETING_DELAY_MS));
  }
  if (marketingJob) {
    marketingJob.running = false;
    marketingJob.finishedAt = new Date().toISOString();
  }
}

// Preview: the exact email HTML, shown in the admin page.
app.post("/api/admin/email-campaign/preview", requireAdmin, async function (req, res) {
  try {
    const content = marketingCleanContent(req.body || {});
    if (content.error) return res.status(400).json({ success: false, message: content.error });
    const products = await marketingLoadProducts(content.productIds);
    const html = marketingEmailHtml({
      content,
      products,
      recipientName: "Priya",
      unsubscribeUrl: "#",
      campaignId: marketingCampaignId(content.subject)
    });
    return res.json({ success: true, html });
  } catch (error) {
    console.error("MARKETING PREVIEW ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not build the preview." });
  }
});

// Test: send the email to one address (yourself) - not logged, not counted.
app.post("/api/admin/email-campaign/test", requireAdmin, async function (req, res) {
  try {
    const body = req.body || {};
    const content = marketingCleanContent(body);
    if (content.error) return res.status(400).json({ success: false, message: content.error });
    const to = String(body.testEmail || GMAIL_USER || "").trim().toLowerCase();
    if (!MARKETING_EMAIL_PATTERN.test(to)) return res.status(400).json({ success: false, message: "Please enter a valid test email." });
    const products = await marketingLoadProducts(content.productIds);
    const unsubscribeUrl = marketingUnsubscribeUrl(to);
    const html = marketingEmailHtml({ content, products, recipientName: "", unsubscribeUrl, campaignId: marketingCampaignId(content.subject) });
    await marketingSendOne({ to, subject: content.subject, html, unsubscribeUrl });
    return res.json({ success: true, message: `Test email sent to ${to}.` });
  } catch (error) {
    console.error("MARKETING TEST ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not send the test email." });
  }
});

// Start sending to the whole list (runs in the background).
app.post("/api/admin/email-campaign/send", requireAdmin, async function (req, res) {
  try {
    if (marketingJob && marketingJob.running) {
      return res.status(409).json({ success: false, message: "A campaign is already sending. Please wait for it to finish." });
    }
    const body = req.body || {};
    const content = marketingCleanContent(body);
    if (content.error) return res.status(400).json({ success: false, message: content.error });
    if (!BREVO_API_KEY && !mailTransporter) {
      return res.status(400).json({ success: false, message: "Email is not set up on the server (set BREVO_API_KEY on Render)." });
    }

    let recipients = marketingCleanRecipients(body.recipients).slice(0, 2000);
    if (!recipients.length) return res.status(400).json({ success: false, message: "Please add at least one valid email." });
    const totalGiven = recipients.length;
    const campaignId = marketingCampaignId(content.subject);

    const emails = recipients.map((item) => item.email);
    const [{ data: unsubRows, error: unsubError }, { data: sentRows, error: sentError }] = await Promise.all([
      supabase.from("email_unsubscribes").select("email").in("email", emails),
      supabase.from("email_campaign_sends").select("email").eq("campaign_id", campaignId).eq("status", "sent").in("email", emails)
    ]);
    if (unsubError || sentError) {
      const dbError = unsubError || sentError;
      console.error("MARKETING DB ERROR:", dbError);
      return res.status(500).json({
        success: false,
        message: "Email tables not found. Please run the Email Campaign SQL in Supabase first."
      });
    }
    const unsubscribed = new Set((unsubRows || []).map((row) => String(row.email).toLowerCase()));
    const alreadySent = new Set((sentRows || []).map((row) => String(row.email).toLowerCase()));
    recipients = recipients.filter((item) => !unsubscribed.has(item.email) && !alreadySent.has(item.email));

    const sentToday = await marketingSentInLast24h();
    const remainingToday = Math.max(0, MARKETING_DAILY_LIMIT - sentToday);
    const laterCount = Math.max(0, recipients.length - remainingToday);
    recipients = recipients.slice(0, remainingToday);

    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: remainingToday === 0
          ? `Today's limit of ${MARKETING_DAILY_LIMIT} emails is used up. Please send again tomorrow with the same subject.`
          : "Everyone on this list has already received this email (or unsubscribed)."
      });
    }

    const products = await marketingLoadProducts(content.productIds);
    marketingJob = {
      running: true,
      stopRequested: false,
      campaignId,
      subject: content.subject,
      total: recipients.length,
      sent: 0,
      failed: 0,
      skippedUnsubscribed: unsubscribed.size,
      skippedAlreadySent: alreadySent.size,
      leftForTomorrow: laterCount,
      totalGiven,
      lastError: "",
      stoppedReason: "",
      startedAt: new Date().toISOString(),
      finishedAt: null
    };
    runMarketingJob({ content, products, recipients, campaignId }).catch((error) => {
      console.error("MARKETING JOB ERROR:", error);
      if (marketingJob) {
        marketingJob.running = false;
        marketingJob.lastError = String(error.message || error);
      }
    });

    const { stopRequested, ...publicJob } = marketingJob;
    return res.json({ success: true, job: publicJob });
  } catch (error) {
    console.error("MARKETING SEND ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not start the campaign." });
  }
});

app.get("/api/admin/email-campaign/status", requireAdmin, async function (req, res) {
  let sentToday = null;
  try {
    sentToday = await marketingSentInLast24h();
  } catch (error) {
    sentToday = null;
  }
  const job = marketingJob ? (({ stopRequested, ...rest }) => rest)(marketingJob) : null;
  return res.json({ success: true, job, sentToday, dailyLimit: MARKETING_DAILY_LIMIT });
});

app.post("/api/admin/email-campaign/stop", requireAdmin, function (req, res) {
  if (marketingJob && marketingJob.running) {
    marketingJob.stopRequested = true;
    marketingJob.stoppedReason = "Stopped by admin. Press Send again with the same subject to continue.";
  }
  return res.json({ success: true });
});

// Product photo for emails: 560x560 JPG made from the product's main
// photo. Kept in memory for a while so repeat opens are instant.
const marketingImageCache = new Map();
app.get("/api/email-image/:file", async function (req, res) {
  try {
    const id = String(req.params.file || "").replace(/\.jpg$/i, "");
    const cached = marketingImageCache.get(id);
    if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) {
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=604800");
      return res.send(cached.buffer);
    }
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    const product = data ? formatProduct(data) : null;
    if (!product || !/^https?:\/\//i.test(product.image || "")) return res.status(404).send("Not found");
    const response = await fetch(product.image);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const buffer = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: 560, height: 560, fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    if (marketingImageCache.size > 60) marketingImageCache.delete(marketingImageCache.keys().next().value);
    marketingImageCache.set(id, { buffer, at: Date.now() });
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800");
    return res.send(buffer);
  } catch (imageError) {
    console.error("EMAIL IMAGE ERROR:", imageError?.message);
    return res.status(502).send("Image error");
  }
});

// Unsubscribe link inside every campaign email (GET = link click,
// POST = Gmail's one-click "Unsubscribe" button).
async function handleUnsubscribe(req, res) {
  const email = String((req.query && req.query.e) || "").trim().toLowerCase();
  const token = String((req.query && req.query.t) || "");
  const valid = MARKETING_EMAIL_PATTERN.test(email) && token && token === marketingUnsubscribeToken(email);
  let ok = false;
  if (valid) {
    const { error } = await supabase.from("email_unsubscribes").upsert({ email }, { onConflict: "email" });
    if (error) console.error("UNSUBSCRIBE ERROR:", error);
    ok = !error;
  }
  if (req.method === "POST") return res.status(ok ? 200 : 400).send(ok ? "Unsubscribed" : "Invalid link");
  res.set("Content-Type", "text/html; charset=utf-8");
  return res.status(ok ? 200 : 400).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>SHRIMOH</title></head>
<body style="margin:0;background:#fbf7ee;font-family:Arial,Helvetica,sans-serif;color:#1c150d;">
<div style="max-width:460px;margin:60px auto;padding:32px 24px;background:#fff;border:1px solid #e7ddc4;border-radius:10px;text-align:center;">
<div style="font-size:20px;letter-spacing:6px;font-weight:bold;">SHRIMOH</div>
<p style="font-size:15px;line-height:1.6;margin:24px 0 8px;">${ok ? "You have been unsubscribed. You will not receive marketing emails from SHRIMOH again." : "This unsubscribe link is not valid. Please email infoshrimoh@gmail.com and we will remove you."}</p>
<a href="${MARKETING_SITE_URL}" style="display:inline-block;margin-top:16px;color:#7d6c4f;">Visit SHRIMOH</a>
</div></body></html>`);
}
app.get("/api/unsubscribe", handleUnsubscribe);
app.post("/api/unsubscribe", handleUnsubscribe);

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
