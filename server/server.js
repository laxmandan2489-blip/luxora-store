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
 * ORDER CONFIRMATION EMAIL (free, via Gmail SMTP)
 *
 * Uses a Gmail account + an "App Password" (NOT the normal
 * Gmail login password - Google requires a separate 16-digit
 * App Password for apps like this to send mail).
 *
 * Set these two environment variables on Render:
 *   GMAIL_USER            e.g. getluxorastore@gmail.com
 *   GMAIL_APP_PASSWORD    the 16-digit App Password (no spaces)
 *
 * If these are not set, email sending is silently skipped
 * (order saving is never affected either way).
 */
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const mailTransporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
      })
    : null;

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
  if (!mailTransporter) {
    console.warn("Order email skipped: GMAIL_USER / GMAIL_APP_PASSWORD not configured.");
    return;
  }
  if (!to) return;

  const formatMoney = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

  const itemsHtml = (Array.isArray(items) ? items : [])
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e8dfc9;">${item.name}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e8dfc9;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e8dfc9;text-align:right;">${formatMoney(
            item.lineTotal ?? item.price * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#211a10;">
      <h2 style="letter-spacing:2px;">SHRIMOH</h2>
      <p>Hi ${customerName || "there"},</p>
      <p>Thank you for your order! We've received it and it's being processed.</p>
      <p style="font-size:14px;color:#7d6c4f;">ORDER REFERENCE: <strong>${orderReference}</strong></p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 0;border-bottom:2px solid #211a10;">Item</th>
            <th style="text-align:center;padding:8px 0;border-bottom:2px solid #211a10;">Qty</th>
            <th style="text-align:right;padding:8px 0;border-bottom:2px solid #211a10;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <table style="width:100%;font-size:14px;">
        <tr><td>Subtotal</td><td style="text-align:right;">${formatMoney(subtotal)}</td></tr>
        ${
          discount > 0
            ? `<tr><td>Discount</td><td style="text-align:right;">-${formatMoney(discount)}</td></tr>`
            : ""
        }
        <tr><td>Delivery</td><td style="text-align:right;">${delivery === 0 ? "FREE" : formatMoney(delivery)}</td></tr>
        <tr><td style="font-weight:bold;padding-top:8px;">Total</td><td style="text-align:right;font-weight:bold;padding-top:8px;">${formatMoney(
          total
        )}</td></tr>
      </table>
      <p style="font-size:13px;color:#7d6c4f;">Payment method: ${paymentMethod}</p>
      <p style="margin-top:24px;">We'll notify you again once your order ships.</p>
      <p style="margin-top:24px;font-size:12px;color:#a19070;">SHRIMOH &middot; Thank you for shopping with us.</p>
    </div>`;

  await mailTransporter.sendMail({
    from: `"SHRIMOH" <${GMAIL_USER}>`,
    to,
    subject: `Order Confirmed - ${orderReference}`,
    html
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
  limits: { files: 20, fileSize: 10 * 1024 * 1024 },
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
    return { id: Number(item.id), quantity: Math.floor(Number(item.quantity)) };
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

    cartItems.push({
      productId: product.id,
      name: product.name,
      price,
      quantity: requestedItem.quantity,
      selectedColor: "",
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

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one product image." });
    }

    for (const file of files) {
      const url = await uploadImage(file);
      uploadedUrls.push(url);
    }

    const productId = Date.now();

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
        images: uniqueImages(uploadedUrls),
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
 * MEESHO / SUPPLIER IMPORTER
 * Takes a manually-copied supplier listing (Meesho or any other
 * source) and creates a product row that starts life as a
 * "draft" - it is NEVER visible on the public storefront
 * (active stays false) until you deliberately move its status
 * to "published" via PATCH /api/admin/products/:id/status.
 * This lets you review photos/pricing/wording calmly before
 * anything goes live.
 */
app.post("/api/admin/products/import", requireAdmin, upload.any(), async function (req, res) {
  const uploadedUrls = [];
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const category = String(body.category || "Bags").trim();
    const costPrice = safeNumber(body.costPrice);
    const marginType = body.marginType === "percent" ? "percent" : "fixed";
    const marginValue = safeNumber(body.margin);
    const sourceUrl = body.sourceUrl !== undefined ? String(body.sourceUrl).trim() : "";
    const stock = Math.max(0, Math.floor(safeNumber(body.stock)));
    const description = String(body.description || "");
    const colors = normalizeColors(body.colors);

    if (!name) return res.status(400).json({ success: false, message: "Product name is required." });
    if (!Number.isFinite(costPrice) || costPrice <= 0) {
      return res.status(400).json({ success: false, message: "Valid cost price is required." });
    }

    const price =
      marginType === "percent"
        ? Math.round(costPrice * (1 + marginValue / 100))
        : Math.round(costPrice + marginValue);

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ success: false, message: "Selling price came out invalid - check cost price and margin." });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one product image." });
    }

    for (const file of files) {
      const url = await uploadImage(file);
      uploadedUrls.push(url);
    }

    const productId = Date.now();
    const requestedStatus = body.status === "published" || body.status === "review" ? body.status : "draft";

    const { data, error } = await supabase
      .from("products")
      .insert({
        id: productId,
        name,
        category,
        price,
        old_price: null,
        stock,
        description,
        colors,
        images: uniqueImages(uploadedUrls),
        active: requestedStatus === "published",
        status: requestedStatus,
        margin: marginValue,
        supplier_cost: costPrice,
        supplier_link: sourceUrl || null
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message:
        requestedStatus === "published"
          ? "Product imported and published."
          : "Product imported as draft. Review it, then publish whenever ready.",
      product: formatProductAdmin(data)
    });
  } catch (error) {
    console.error("IMPORT PRODUCT ERROR:", error);
    if (uploadedUrls.length) await deleteStorageImages(uploadedUrls);
    return res.status(500).json({ success: false, message: error.message || "Unable to import product." });
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

    const files = Array.isArray(req.files) ? req.files : [];
    let oldImages = [];

    if (files.length > 0) {
      oldImages = normalizeImages(existing.images);
      for (const file of files) {
        const url = await uploadImage(file);
        newUploadedUrls.push(url);
      }
      updateData.images = uniqueImages(newUploadedUrls);
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (files.length > 0 && oldImages.length) {
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
