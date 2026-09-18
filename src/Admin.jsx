import { useEffect, useState } from "react";

const API = "https://luxora-store-mkva.onrender.com";

const categories = [
  "Bags",
  "Handbags",
  "Sling Bags",
  "Tote Bags",
  "Backpacks",
  "Laptop Bags",
  "Travel Bags",
  "Clutches",
  "Wallets",
  "Accessories",
];

const ORDER_STATUSES = [
  "Received",
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

/*
 * BULK UPLOAD (CSV) HELPERS
 * Everything below is used only by the "Bulk Upload" section of
 * the Products tab, to let the admin add many products at once
 * from a CSV file instead of filling the form one product at a
 * time. Kept at module scope since none of it depends on component
 * state - it's pure parsing/formatting.
 */
const BULK_TEMPLATE_HEADERS = [
  "Product Name",
  "Category",
  "Price",
  "Old Price",
  "Stock",
  "Description",
  "Colors",
  "Image URLs",
  "Color Images",
  "Key Features",
  "Dimensions",
  "Materials",
  "Care Instructions",
  "Trust Signals",
  "Supplier Name",
  "Supplier Cost",
  "Margin %",
  "Supplier Product ID",
  "Supplier Link",
  "Shipping Time",
];

const BULK_COLUMN_ALIASES = {
  name: ["product name", "name"],
  category: ["category"],
  price: ["price"],
  oldPrice: ["old price", "oldprice", "mrp"],
  stock: ["stock", "quantity"],
  description: ["description", "desc"],
  colors: ["colors", "color"],
  images: ["image urls", "images", "image url", "photo urls", "photos"],
  // Optional: one or more specific photos per color (e.g. so choosing
  // "Black" shows different photos than "Brown"). Format per cell:
  // "Black=<url1>,<url2>|Brown=<url1>" - "|" separates colors (same
  // convention as multi-value cells elsewhere), "=" pairs a color name
  // to its photos, and "," separates multiple photos for that color.
  colorImages: ["color images", "colorimages", "color photos", "photo per color"],
  // Rich product-detail fields shown on the product page (Key Features
  // as bullet list, Dimensions/Materials as single lines, Care
  // Instructions as its own guide text, Trust Signals as short badges).
  // Key Features and Trust Signals accept multiple lines in one cell,
  // "|"-separated (same convention as Colors/Images above).
  keyFeatures: ["key features", "features", "keyfeatures"],
  dimensions: ["dimensions", "size", "dimension"],
  materials: ["materials", "material"],
  careInstructions: ["care instructions", "care", "care guide"],
  trustSignals: ["trust signals", "trustsignals", "trust badges"],
  // Supplier/dropshipping fields - admin-only, never shown to
  // customers, same as the single "Add Product" form's own section.
  supplierName: ["supplier name"],
  supplierCost: ["supplier cost", "cost", "cost price"],
  // If Price is left blank, Supplier Cost + Margin % fills it in
  // automatically (Price = cost + that % of cost) - the bulk
  // equivalent of the single form's "Fill Price" margin calculator.
  marginPercent: ["margin %", "margin percent", "margin"],
  supplierProductId: ["supplier product id", "supplier id"],
  supplierLink: ["supplier link"],
  shippingTime: ["shipping time"],
};

// A small hand-written CSV parser (not a library) so it handles the
// normal Excel-exported CSV cases correctly: quoted fields, commas
// or newlines inside a quoted cell, and escaped ("") quotes.
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell || "").trim() !== ""));
}

function findBulkColumnIndex(headerRow, aliases) {
  const normalized = headerRow.map((header) => String(header || "").trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

function csvEscapeCell(value) {
  const text = String(value ?? "");
  if (/["\n,]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Labels for the AI Photo Studio's 5 generated shots - matches the
// fixed order the backend generates them in (4 premium studio shots,
// then 1 lifestyle shot).
const AI_STUDIO_SHOT_LABELS = [
  "Studio Shot 1 (Hero)",
  "Studio Shot 2 (3/4 Angle)",
  "Studio Shot 3 (Close-up)",
  "Studio Shot 4 (Flat Lay)",
];
function labelForAiImage(image, index) {
  if (image.type === "lifestyle") return "Lifestyle Shot";
  return AI_STUDIO_SHOT_LABELS[index] || `Studio Shot ${index + 1}`;
}

function getImageUrl(image) {
  if (!image) return "";
  const value = String(image).trim();
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${API}${value}`;
  }
  return `${API}/${value}`;
}

function parseColorList(colorsString) {
  return String(colorsString || "")
    .split(",")
    .map((color) => color.trim())
    .filter(Boolean);
}

function getProductImages(product) {
  if (Array.isArray(product?.images)) {
    return product.images.filter(Boolean);
  }
  if (product?.image) {
    return [product.image];
  }
  return [];
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

/*
 * PROFIT HELPERS
 * Nothing here is saved anywhere new - price and supplierCost are
 * already stored on every product, so profit is just computed live
 * from the two fields already on screen, both while adding/editing
 * a product and in the product list card.
 */
function computeProfit(price, cost) {
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  const profit = p - c;
  const percent = c > 0 ? (profit / c) * 100 : 0;
  return { profit, percent };
}

// Given a cost price and a margin (either a flat ₹ amount or a
// percentage on top of cost), returns the selling price that
// margin implies - used only to help fill the Price field, never
// stored or sent anywhere itself.
function computeSellingPriceFromMargin(costPrice, margin, marginType) {
  const cost = Number(costPrice) || 0;
  const marginValue = Number(margin) || 0;
  if (marginType === "percent") {
    return Math.round(cost * (1 + marginValue / 100));
  }
  return Math.round(cost + marginValue);
}

function getStatusLabel(status) {
  if (status === "draft") return "Draft";
  if (status === "review") return "In Review";
  return "Published";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOrderStatus(order) {
  return (
    order?.status ||
    order?.orderStatus ||
    order?.order_status ||
    "Received"
  );
}

function getOrderId(order) {
  return (
    order?.id ||
    order?.orderId ||
    order?.orderReference ||
    order?.reference ||
    "—"
  );
}

function getOrderCourierName(order) {
  return (
    order?.courierName ||
    order?.courier_name ||
    ""
  );
}

function getOrderTrackingNumber(order) {
  return (
    order?.trackingNumber ||
    order?.tracking_number ||
    ""
  );
}

function getOrderTrackingUrl(order) {
  return (
    order?.trackingUrl ||
    order?.tracking_url ||
    ""
  );
}

/* =====================================================
   CUSTOMER DETAILS
   ===================================================== */
function getCustomerDetails(order) {
  let details =
    order?.customerDetails ||
    order?.customer_details ||
    order?.customer ||
    {};
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = {};
    }
  }
  return details || {};
}

function getCustomerName(order) {
  const customer =
    getCustomerDetails(order);
  return (
    customer?.name ||
    customer?.fullName ||
    customer?.full_name ||
    order?.customerName ||
    order?.customer_name ||
    order?.name ||
    "Customer"
  );
}

function getCustomerMobile(order) {
  const customer =
    getCustomerDetails(order);
  return (
    customer?.mobile ||
    customer?.phone ||
    customer?.phoneNumber ||
    customer?.phone_number ||
    customer?.mobileNumber ||
    customer?.mobile_number ||
    order?.customerMobile ||
    order?.customer_mobile ||
    order?.mobile ||
    order?.phone ||
    "—"
  );
}

function getCustomerEmail(order) {
  const customer =
    getCustomerDetails(order);
  return (
    customer?.email ||
    customer?.emailAddress ||
    customer?.email_address ||
    order?.customerEmail ||
    order?.customer_email ||
    order?.email ||
    "—"
  );
}

function getCustomerAddress(order) {
  const customer =
    getCustomerDetails(order);
  const parts = [
    customer?.address ||
      customer?.fullAddress ||
      customer?.full_address ||
      order?.address ||
      order?.customerAddress ||
      order?.customer_address,
    customer?.city ||
      order?.city,
    customer?.state ||
      order?.state,
    customer?.pincode ||
      customer?.pinCode ||
      customer?.pin_code ||
      order?.pincode ||
      order?.pinCode ||
      order?.pin_code,
  ].filter(Boolean);
  return parts.length
    ? parts.join(", ")
    : "—";
}

function getOrderItems(order) {
  if (Array.isArray(order?.items)) {
    return order.items;
  }
  if (Array.isArray(order?.products)) {
    return order.products;
  }
  if (Array.isArray(order?.cart)) {
    return order.cart;
  }
  return [];
}

function getItemName(item) {
  return (
    item?.name ||
    item?.productName ||
    "Product"
  );
}

function getItemQuantity(item) {
  return Number(
    item?.quantity ||
      item?.qty ||
      1
  );
}

function getItemPrice(item) {
  return Number(
    item?.price ||
      item?.finalPrice ||
      0
  );
}

function Admin() {
  const [activeTab, setActiveTab] =
    useState("orders");

  /* =====================================================
     ADMIN AUTH
     ===================================================== */
  const [adminToken, setAdminToken] =
    useState(
      () =>
        localStorage.getItem(
          "shrimoh_admin_token"
        ) || ""
    );
  const [adminLoggedIn, setAdminLoggedIn] =
    useState(
      () =>
        !!localStorage.getItem(
          "shrimoh_admin_token"
        )
    );
  const [loginEmail, setLoginEmail] =
    useState("");
  const [loginPassword, setLoginPassword] =
    useState("");
  const [loginLoading, setLoginLoading] =
    useState(false);
  const [loginError, setLoginError] =
    useState("");

  const [products, setProducts] =
    useState([]);
  const [orders, setOrders] =
    useState([]);
  const [selectedOrder, setSelectedOrder] =
    useState(null);
  const [loadingProducts, setLoadingProducts] =
    useState(false);
  const [loadingOrders, setLoadingOrders] =
    useState(false);
  const [savingStatus, setSavingStatus] =
    useState(false);

  /* =====================================================
     SHIPPING / COURIER DETAILS (per order)
     Feeds the customer-facing Track Order page - these
     fields are what shows up there once saved here.
     ===================================================== */
  const [shipCourier, setShipCourier] =
    useState("");
  const [shipTrackingNumber, setShipTrackingNumber] =
    useState("");
  const [shipTrackingUrl, setShipTrackingUrl] =
    useState("");
  const [savingShipping, setSavingShipping] =
    useState(false);

  useEffect(() => {
    setShipCourier(getOrderCourierName(selectedOrder));
    setShipTrackingNumber(getOrderTrackingNumber(selectedOrder));
    setShipTrackingUrl(getOrderTrackingUrl(selectedOrder));
  }, [selectedOrder]);

  const [name, setName] =
    useState("");
  const [category, setCategory] =
    useState("Bags");
  const [price, setPrice] =
    useState("");
  const [oldPrice, setOldPrice] =
    useState("");
  const [stock, setStock] =
    useState("");
  const [description, setDescription] =
    useState("");
  const [keyFeatures, setKeyFeatures] =
    useState("");
  const [dimensions, setDimensions] =
    useState("");
  const [materials, setMaterials] =
    useState("");
  const [careInstructions, setCareInstructions] =
    useState("");
  const [trustSignals, setTrustSignals] =
    useState("");
  const [colors, setColors] =
    useState("Black");
  const [colorImageFiles, setColorImageFiles] =
    useState({});
  const [images, setImages] =
    useState([]);
  const [loading, setLoading] =
    useState(false);
  const [message, setMessage] =
    useState("");

  /* =====================================================
     BULK UPLOAD (CSV) STATE
     ===================================================== */
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkParseError, setBulkParseError] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetImporting, setSheetImporting] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddParsing, setQuickAddParsing] = useState(false);

  /* =====================================================
     AI PHOTO STUDIO STATE
     (helper for Bulk Upload - generates premium product
     photos with Gemini and hands back copyable URLs to
     paste into the CSV's "Image URLs" column)
     ===================================================== */
  const [aiSourceFile, setAiSourceFile] = useState(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerateError, setAiGenerateError] = useState("");
  const [aiGeneratedImages, setAiGeneratedImages] = useState([]);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiHistory, setAiHistory] = useState([]);
  const [aiCopiedId, setAiCopiedId] = useState("");

  // Manual path (no AI/Gemini involved, free): admin already has
  // finished photos on their device and just wants public links to
  // paste into the CSV. Shares the same "aiHistory" results list
  // above, since both paths end in the same "links ready to copy"
  // outcome.
  const [manualFiles, setManualFiles] = useState([]);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualUploadError, setManualUploadError] = useState("");

  const [orderSearch, setOrderSearch] =
    useState("");
  const [productSearch, setProductSearch] =
    useState("");

  /* =====================================================
     DROPSHIPPING / SUPPLIER FIELDS (new product)
     Internal only - never shown to customers.
     ===================================================== */
  const [supplierName, setSupplierName] =
    useState("");
  const [supplierProductId, setSupplierProductId] =
    useState("");
  const [supplierLink, setSupplierLink] =
    useState("");
  const [supplierCost, setSupplierCost] =
    useState("");
  const [shippingTime, setShippingTime] =
    useState("");
  const [marginType, setMarginType] =
    useState("percent");
  const [marginValue, setMarginValue] =
    useState("");

  /* =====================================================
     PRODUCT EDIT / DELETE
     ===================================================== */
  const [editingProduct, setEditingProduct] =
    useState(null);
  const [editName, setEditName] =
    useState("");
  const [editCategory, setEditCategory] =
    useState("Bags");
  const [editPrice, setEditPrice] =
    useState("");
  const [editOldPrice, setEditOldPrice] =
    useState("");
  const [editStock, setEditStock] =
    useState("");
  const [editDescription, setEditDescription] =
    useState("");
  const [editKeyFeatures, setEditKeyFeatures] =
    useState("");
  const [editDimensions, setEditDimensions] =
    useState("");
  const [editMaterials, setEditMaterials] =
    useState("");
  const [editCareInstructions, setEditCareInstructions] =
    useState("");
  const [editTrustSignals, setEditTrustSignals] =
    useState("");
  const [editColors, setEditColors] =
    useState("");
  const [editColorImageFiles, setEditColorImageFiles] =
    useState({});
  // Existing (already-uploaded) photos per color for the product being
  // edited - the admin can remove individual ones here; whatever's left
  // is kept, and any newly chosen files above get added on top of it.
  const [editExistingColorImages, setEditExistingColorImages] =
    useState({});
  const [editImages, setEditImages] =
    useState([]);
  const [editingLoading, setEditingLoading] =
    useState(false);

  const [editSupplierName, setEditSupplierName] =
    useState("");
  const [editSupplierProductId, setEditSupplierProductId] =
    useState("");
  const [editSupplierLink, setEditSupplierLink] =
    useState("");
  const [editSupplierCost, setEditSupplierCost] =
    useState("");
  const [editShippingTime, setEditShippingTime] =
    useState("");
  const [editMarginType, setEditMarginType] =
    useState("percent");
  const [editMarginValue, setEditMarginValue] =
    useState("");

  /* =====================================================
     DASHBOARD
     ===================================================== */
  const [dashboard, setDashboard] =
    useState(null);
  const [loadingDashboard, setLoadingDashboard] =
    useState(false);

  /* =====================================================
     SITE CONTENT (homepage hero + brand-story images)
     Lets the owner drop in real photos later without touching
     any code - both fall back to the current placeholder look
     until something is uploaded here.
     ===================================================== */
  const [siteSettings, setSiteSettings] = useState({
    heroImageUrl: "",
    brandStoryImageUrl: "",
  });
  const [loadingSiteSettings, setLoadingSiteSettings] = useState(false);
  const [siteHeroFile, setSiteHeroFile] = useState(null);
  const [siteHeroPreview, setSiteHeroPreview] = useState("");
  const [siteBrandStoryFile, setSiteBrandStoryFile] = useState(null);
  const [siteBrandStoryPreview, setSiteBrandStoryPreview] = useState("");
  const [savingSiteContent, setSavingSiteContent] = useState(false);
  const [siteContentMessage, setSiteContentMessage] = useState("");

  async function loadSiteSettings() {
    setLoadingSiteSettings(true);
    try {
      const response = await fetch(`${API}/api/site-settings`);
      const data = await response.json();
      if (data.success && data.settings) {
        setSiteSettings(data.settings);
      }
    } catch (error) {
      console.error("Load site settings error:", error);
    } finally {
      setLoadingSiteSettings(false);
    }
  }

  function handleSiteHeroChange(e) {
    const file = e.target.files?.[0] || null;
    setSiteHeroFile(file);
    setSiteHeroPreview(file ? URL.createObjectURL(file) : "");
  }

  function handleSiteBrandStoryChange(e) {
    const file = e.target.files?.[0] || null;
    setSiteBrandStoryFile(file);
    setSiteBrandStoryPreview(file ? URL.createObjectURL(file) : "");
  }

  async function saveSiteContent() {
    if (!siteHeroFile && !siteBrandStoryFile) {
      setSiteContentMessage("Choose at least one image first.");
      return;
    }

    setSavingSiteContent(true);
    setSiteContentMessage("");

    try {
      const formData = new FormData();
      if (siteHeroFile) formData.append("heroImage", siteHeroFile);
      if (siteBrandStoryFile) formData.append("brandStoryImage", siteBrandStoryFile);

      const response = await adminFetch(`${API}/api/admin/site-settings`, {
        method: "PUT",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update site images.");
      }

      setSiteSettings(data.settings);
      setSiteHeroFile(null);
      setSiteHeroPreview("");
      setSiteBrandStoryFile(null);
      setSiteBrandStoryPreview("");
      setSiteContentMessage("Saved. Your live site now shows these images.");
    } catch (error) {
      setSiteContentMessage(error.message || "Unable to update site images.");
    } finally {
      setSavingSiteContent(false);
    }
  }

  async function updateProductStatus(product, status) {
    try {
      const response = await adminFetch(`${API}/api/admin/products/${product.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }
      loadProducts();
    } catch (error) {
      alert(error.message || "Could not update product status.");
    }
  }

  /* =====================================================
     CUSTOMERS
     ===================================================== */
  const [customers, setCustomers] =
    useState([]);
  const [loadingCustomers, setLoadingCustomers] =
    useState(false);
  const [customerSearch, setCustomerSearch] =
    useState("");

  /* =====================================================
     COUPONS
     ===================================================== */
  const [coupons, setCoupons] =
    useState([]);
  const [loadingCoupons, setLoadingCoupons] =
    useState(false);
  const [couponCode, setCouponCode] =
    useState("");
  const [couponDiscountType, setCouponDiscountType] =
    useState("percentage");
  const [couponDiscountValue, setCouponDiscountValue] =
    useState("");
  const [couponMinOrder, setCouponMinOrder] =
    useState("");
  const [couponMaxDiscount, setCouponMaxDiscount] =
    useState("");
  const [couponExpiry, setCouponExpiry] =
    useState("");
  const [couponUsageLimit, setCouponUsageLimit] =
    useState("");
  const [couponSaving, setCouponSaving] =
    useState(false);
  const [editingCoupon, setEditingCoupon] =
    useState(null);

  /* =====================================================
     AUTH HELPERS
     ===================================================== */
  function logoutAdmin() {
    localStorage.removeItem(
      "shrimoh_admin_token"
    );
    setAdminToken("");
    setAdminLoggedIn(false);
    setOrders([]);
    setSelectedOrder(null);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
  }

  async function adminLogin(event) {
    event.preventDefault();
    if (!loginEmail.trim()) {
      setLoginError(
        "Admin email required."
      );
      return;
    }
    if (!loginPassword) {
      setLoginError(
        "Admin password required."
      );
      return;
    }
    try {
      setLoginLoading(true);
      setLoginError("");
      const response = await fetch(
        `${API}/api/admin/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email: loginEmail.trim(),
            password: loginPassword,
          }),
        }
      );
      const data =
        await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message ||
            "Invalid admin credentials."
        );
      }
      if (!data?.token) {
        throw new Error(
          "Admin token was not received."
        );
      }
      localStorage.setItem(
        "shrimoh_admin_token",
        data.token
      );
      setAdminToken(data.token);
      setAdminLoggedIn(true);
      setLoginPassword("");
      setLoginError("");
    } catch (error) {
      console.error(
        "ADMIN LOGIN ERROR:",
        error
      );
      setLoginError(
        error.message ||
          "Admin login failed."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function adminFetch(
    url,
    options = {}
  ) {
    const token =
      localStorage.getItem(
        "shrimoh_admin_token"
      );
    if (!token) {
      logoutAdmin();
      throw new Error(
        "Admin authentication required."
      );
    }
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const response = await fetch(
      url,
      {
        ...options,
        headers,
      }
    );
    if (response.status === 401) {
      logoutAdmin();
      throw new Error(
        "Admin session expired. Please login again."
      );
    }
    return response;
  }

  /* =====================================================
     INITIAL LOAD
     ===================================================== */
  useEffect(() => {
    if (adminLoggedIn) {
      loadProducts();
      loadOrders();
    }
  }, [adminLoggedIn]);

  useEffect(() => {
    if (!adminLoggedIn) return;
    if (activeTab === "dashboard") loadDashboard();
    if (activeTab === "customers") loadCustomers();
    if (activeTab === "coupons") loadCoupons();
    if (activeTab === "content") loadSiteSettings();
  }, [activeTab, adminLoggedIn]);

  /* =====================================================
     LOAD PRODUCTS (admin view - includes supplier fields
     and inactive/soft-deleted products)
     ===================================================== */
  async function loadProducts() {
    try {
      setLoadingProducts(true);
      const response = await adminFetch(
        `${API}/api/admin/products`
      );
      const data =
        await response.json();
      if (
        data.success &&
        Array.isArray(data.products)
      ) {
        setProducts(data.products);
      } else if (Array.isArray(data)) {
        setProducts(data);
      }
    } catch (error) {
      console.error(
        "PRODUCT LOAD ERROR:",
        error
      );
    } finally {
      setLoadingProducts(false);
    }
  }

  /* =====================================================
     LOAD ORDERS
     ===================================================== */
  async function loadOrders() {
    if (!adminLoggedIn) {
      return;
    }
    try {
      setLoadingOrders(true);
      const possibleUrls = [
        `${API}/api/orders`,
        `${API}/orders`,
      ];
      let loaded = false;
      for (const url of possibleUrls) {
        try {
          const response =
            await adminFetch(url);
          if (!response.ok) {
            continue;
          }
          const data =
            await response.json();
          let receivedOrders = [];
          if (Array.isArray(data)) {
            receivedOrders = data;
          } else if (
            Array.isArray(
              data?.orders
            )
          ) {
            receivedOrders =
              data.orders;
          } else if (
            Array.isArray(
              data?.data
            )
          ) {
            receivedOrders =
              data.data;
          }
          if (
            Array.isArray(
              receivedOrders
            )
          ) {
            setOrders(
              receivedOrders
            );
            loaded = true;
            break;
          }
        } catch (error) {
          console.log(
            `ORDER URL FAILED: ${url}`,
            error
          );
          if (
            error.message?.includes(
              "session expired"
            )
          ) {
            break;
          }
        }
      }
      if (!loaded) {
        console.log(
          "No order endpoint returned orders."
        );
      }
    } catch (error) {
      console.error(
        "ORDER LOAD ERROR:",
        error
      );
    } finally {
      setLoadingOrders(false);
    }
  }

  /* =====================================================
     LOAD DASHBOARD
     ===================================================== */
  async function loadDashboard() {
    try {
      setLoadingDashboard(true);
      const response = await adminFetch(
        `${API}/api/admin/dashboard`
      );
      const data = await response.json();
      if (data?.success) {
        setDashboard(data.dashboard);
      }
    } catch (error) {
      console.error("DASHBOARD LOAD ERROR:", error);
    } finally {
      setLoadingDashboard(false);
    }
  }

  /* =====================================================
     LOAD CUSTOMERS
     ===================================================== */
  async function loadCustomers() {
    try {
      setLoadingCustomers(true);
      const response = await adminFetch(
        `${API}/api/admin/customers`
      );
      const data = await response.json();
      if (data?.success && Array.isArray(data.customers)) {
        setCustomers(data.customers);
      }
    } catch (error) {
      console.error("CUSTOMERS LOAD ERROR:", error);
    } finally {
      setLoadingCustomers(false);
    }
  }

  /* =====================================================
     LOAD COUPONS
     ===================================================== */
  async function loadCoupons() {
    try {
      setLoadingCoupons(true);
      const response = await adminFetch(
        `${API}/api/admin/coupons`
      );
      const data = await response.json();
      if (data?.success && Array.isArray(data.coupons)) {
        setCoupons(data.coupons);
      }
    } catch (error) {
      console.error("COUPONS LOAD ERROR:", error);
    } finally {
      setLoadingCoupons(false);
    }
  }

  function resetCouponForm() {
    setEditingCoupon(null);
    setCouponCode("");
    setCouponDiscountType("percentage");
    setCouponDiscountValue("");
    setCouponMinOrder("");
    setCouponMaxDiscount("");
    setCouponExpiry("");
    setCouponUsageLimit("");
  }

  function openEditCoupon(coupon) {
    setEditingCoupon(coupon);
    setCouponCode(coupon.code || "");
    setCouponDiscountType(coupon.discountType || "percentage");
    setCouponDiscountValue(coupon.discountValue ?? "");
    setCouponMinOrder(coupon.minOrderAmount ?? "");
    setCouponMaxDiscount(
      coupon.maxDiscountAmount === null || coupon.maxDiscountAmount === undefined
        ? ""
        : coupon.maxDiscountAmount
    );
    setCouponExpiry(
      coupon.expiryDate ? String(coupon.expiryDate).slice(0, 10) : ""
    );
    setCouponUsageLimit(
      coupon.usageLimit === null || coupon.usageLimit === undefined ? "" : coupon.usageLimit
    );
  }

  async function saveCoupon(event) {
    event.preventDefault();
    if (!couponCode.trim()) {
      alert("Coupon code required.");
      return;
    }
    if (!couponDiscountValue || Number(couponDiscountValue) <= 0) {
      alert("Valid discount value required.");
      return;
    }
    try {
      setCouponSaving(true);
      const payload = {
        code: couponCode.trim(),
        discountType: couponDiscountType,
        discountValue: Number(couponDiscountValue),
        minOrderAmount: couponMinOrder ? Number(couponMinOrder) : 0,
        maxDiscountAmount: couponMaxDiscount ? Number(couponMaxDiscount) : null,
        expiryDate: couponExpiry
          ? new Date(couponExpiry).toISOString()
          : null,
        usageLimit: couponUsageLimit ? Number(couponUsageLimit) : null,
      };
      const url = editingCoupon
        ? `${API}/api/admin/coupons/${editingCoupon.id}`
        : `${API}/api/admin/coupons`;
      const response = await adminFetch(url, {
        method: editingCoupon ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Coupon could not be saved.");
      }
      resetCouponForm();
      await loadCoupons();
    } catch (error) {
      console.error("SAVE COUPON ERROR:", error);
      alert(error.message || "Coupon save nahi hua.");
    } finally {
      setCouponSaving(false);
    }
  }

  async function toggleCouponActive(coupon) {
    try {
      const response = await adminFetch(
        `${API}/api/admin/coupons/${coupon.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !coupon.active }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Coupon could not be updated.");
      }
      await loadCoupons();
    } catch (error) {
      console.error("TOGGLE COUPON ERROR:", error);
      alert(error.message || "Coupon update nahi hua.");
    }
  }

  async function deleteCoupon(coupon) {
    const confirmed = window.confirm(
      `Delete coupon "${coupon.code}"? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const response = await adminFetch(
        `${API}/api/admin/coupons/${coupon.id}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Coupon could not be deleted.");
      }
      await loadCoupons();
    } catch (error) {
      console.error("DELETE COUPON ERROR:", error);
      alert(error.message || "Coupon delete nahi hua.");
    }
  }

  /* =====================================================
     IMAGE SELECTION
     ===================================================== */
  function handleImagesChange(event) {
    const selectedFiles =
      Array.from(
        event.target.files || []
      );
    setImages(selectedFiles);
  }

  /*
   * Swaps an image with its neighbour so the admin can reorder photos
   * before uploading (Image 1 becomes the product's main photo). direction
   * is -1 to move a photo earlier or +1 to move it later; out-of-range
   * moves (already first/last) are simply ignored.
   */
  function moveImage(index, direction) {
    setImages((previous) => {
      const next = [...previous];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return previous;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function removeImage(index) {
    setImages((previous) => previous.filter((_, i) => i !== index));
  }

  /*
   * PER-COLOR PHOTOS (Add Product)
   * Each color can now have several photos, not just one - these
   * three helpers add/reorder/remove within one color's own list,
   * the same ◀ ▶ ✕ pattern already used for the main gallery above.
   */
  function addColorImageFiles(color, fileList) {
    const selected = Array.from(fileList || []);
    if (selected.length === 0) return;
    setColorImageFiles((previous) => ({
      ...previous,
      [color]: [...(previous[color] || []), ...selected],
    }));
  }

  function moveColorImage(color, index, direction) {
    setColorImageFiles((previous) => {
      const list = previous[color] || [];
      const next = [...list];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return previous;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...previous, [color]: next };
    });
  }

  function removeColorImage(color, index) {
    setColorImageFiles((previous) => ({
      ...previous,
      [color]: (previous[color] || []).filter((_, i) => i !== index),
    }));
  }

  /* =====================================================
     ADD PRODUCT
     ===================================================== */
  async function addProduct(event) {
    event.preventDefault();
    if (!adminLoggedIn) {
      alert(
        "Please login as admin first."
      );
      return;
    }
    if (!name.trim()) {
      alert(
        "Product name required."
      );
      return;
    }
    if (images.length === 0) {
      alert(
        "Please select at least one product image."
      );
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const formData =
        new FormData();
      formData.append(
        "name",
        name.trim()
      );
      formData.append(
        "category",
        category
      );
      formData.append(
        "price",
        price
      );
      formData.append(
        "oldPrice",
        oldPrice
      );
      formData.append(
        "stock",
        stock
      );
      formData.append(
        "description",
        description
      );
      formData.append(
        "colors",
        colors
      );
      formData.append("keyFeatures", keyFeatures);
      formData.append("dimensions", dimensions);
      formData.append("materials", materials);
      formData.append("careInstructions", careInstructions);
      formData.append("trustSignals", trustSignals);
      formData.append("supplierName", supplierName);
      formData.append("supplierProductId", supplierProductId);
      formData.append("supplierLink", supplierLink);
      formData.append("supplierCost", supplierCost);
      formData.append("shippingTime", shippingTime);
      images.forEach((file) => {
        formData.append(
          "images",
          file
        );
      });
      parseColorList(colors).forEach((color) => {
        (colorImageFiles[color] || []).forEach((file) => {
          formData.append(`colorImage__${encodeURIComponent(color)}`, file);
        });
      });
      const response =
        await adminFetch(
          `${API}/api/products`,
          {
            method: "POST",
            body: formData,
          }
        );
      const data =
        await response.json();
      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Server error ${response.status}`
        );
      }
      if (data?.success === false) {
        throw new Error(
          data.message ||
            "Product could not be added."
        );
      }
      setMessage(
        "Product successfully added."
      );
      setName("");
      setCategory("Bags");
      setPrice("");
      setOldPrice("");
      setStock("");
      setDescription("");
      setKeyFeatures("");
      setDimensions("");
      setMaterials("");
      setCareInstructions("");
      setTrustSignals("");
      setColors("Black");
      setColorImageFiles({});
      setImages([]);
      setSupplierName("");
      setSupplierProductId("");
      setSupplierLink("");
      setSupplierCost("");
      setShippingTime("");
      setMarginType("percent");
      setMarginValue("");
      if (event.target) {
        event.target.reset();
      }
      await loadProducts();
    } catch (error) {
      console.error(
        "ADD PRODUCT ERROR:",
        error
      );
      setMessage(
        error.message ||
          "Product add nahi hua."
      );
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     BULK UPLOAD (CSV)
     ===================================================== */
  function downloadBulkTemplate() {
    const exampleRows = [
      [
        "Tan Leather Tote Bag",
        "Tote Bags",
        "2999",
        "3999",
        "15",
        "Premium leather tote bag with an adjustable strap.",
        "Tan|Black",
        "https://example.com/image1.jpg|https://example.com/image2.jpg",
        "Tan=https://example.com/tan-photo1.jpg,https://example.com/tan-photo2.jpg|Black=https://example.com/black-photo.jpg",
        "Genuine top-grain leather|Adjustable & detachable strap|Fits a 14-inch laptop|Reinforced stitched handles",
        "32cm (W) x 28cm (H) x 12cm (D)",
        "Top-grain genuine leather, brass-tone hardware",
        "Wipe with a soft dry cloth. Avoid water & direct sunlight. Store in the dust bag when not in use.",
        "100% Genuine Leather|7-Day Easy Returns|1-Year Warranty",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "Classic Sling Bag (price auto-filled from cost + margin)",
        "Sling Bags",
        "", // Price left blank on purpose - filled in from Supplier Cost + Margin % below
        "",
        "20",
        "Everyday sling bag.",
        "Black",
        "https://example.com/image3.jpg",
        "",
        "Lightweight & water-resistant canvas|Adjustable sling strap|Zippered main compartment",
        "24cm (W) x 20cm (H) x 8cm (D)",
        "Durable canvas fabric, matte gold hardware",
        "Spot clean with a damp cloth. Do not machine wash.",
        "7-Day Easy Returns",
        "AliExpress Seller XYZ",
        "800",
        "40",
        "SUP-12345",
        "https://supplier-site.com/product/12345",
        "7-12 days",
      ],
    ];
    const csvContent = [BULK_TEMPLATE_HEADERS, ...exampleRows]
      .map((row) => row.map(csvEscapeCell).join(","))
      .join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shrimoh-bulk-products-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /*
   * Shared CSV-row parser used by BOTH the "Choose CSV File" path
   * (reads a File the admin picked) and the "Import from Google
   * Sheet" path (reads text fetched from a published Google Sheet
   * link via the server) - same column logic, same validation, same
   * preview-table shape either way. Returns { error, rows }: error
   * is a user-facing message (or null), rows is the parsed row list
   * (empty when error is set).
   */
  function parseBulkCsvRows(csvText) {
    const allRows = parseCsvText(String(csvText || ""));
    if (allRows.length < 2) {
      return { error: "This file has no product rows below the header row.", rows: [] };
    }

    const headerRow = allRows[0];
    const dataRows = allRows.slice(1);

    const columnIndex = {
      name: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.name),
      category: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.category),
      price: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.price),
      oldPrice: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.oldPrice),
      stock: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.stock),
      description: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.description),
      colors: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.colors),
      images: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.images),
      colorImages: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.colorImages),
      keyFeatures: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.keyFeatures),
      dimensions: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.dimensions),
      materials: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.materials),
      careInstructions: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.careInstructions),
      trustSignals: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.trustSignals),
      supplierName: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.supplierName),
      supplierCost: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.supplierCost),
      marginPercent: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.marginPercent),
      supplierProductId: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.supplierProductId),
      supplierLink: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.supplierLink),
      shippingTime: findBulkColumnIndex(headerRow, BULK_COLUMN_ALIASES.shippingTime),
    };

    if (columnIndex.name === -1 || columnIndex.price === -1 || columnIndex.images === -1) {
      return {
        error:
          "Couldn't find the required columns. Please use the downloaded template - it needs 'Product Name', 'Price' and 'Image URLs' columns.",
        rows: [],
      };
    }

    const cell = (row, index) => (index === -1 ? "" : String(row[index] ?? "").trim());

    const parsedRows = dataRows.map((row, index) => {
          const name = cell(row, columnIndex.name);
          const priceRaw = cell(row, columnIndex.price);
          let price = Number(priceRaw);
          const oldPriceRaw = cell(row, columnIndex.oldPrice);
          const stockRaw = cell(row, columnIndex.stock);
          const supplierName = cell(row, columnIndex.supplierName);
          const supplierCostRaw = cell(row, columnIndex.supplierCost);
          const supplierCost = supplierCostRaw ? Number(supplierCostRaw) : null;
          const marginPercentRaw = cell(row, columnIndex.marginPercent);
          const marginPercent = marginPercentRaw ? Number(marginPercentRaw) : null;
          const supplierProductId = cell(row, columnIndex.supplierProductId);
          const supplierLink = cell(row, columnIndex.supplierLink);
          const shippingTime = cell(row, columnIndex.shippingTime);
          const images = cell(row, columnIndex.images)
            .split("|")
            .map((url) => url.trim())
            .filter(Boolean);
          const colors = cell(row, columnIndex.colors)
            .split("|")
            .map((color) => color.trim())
            .filter(Boolean);
          const dimensions = cell(row, columnIndex.dimensions);
          const materials = cell(row, columnIndex.materials);
          const careInstructions = cell(row, columnIndex.careInstructions);
          const keyFeatures = cell(row, columnIndex.keyFeatures)
            .split("|")
            .map((line) => line.trim())
            .filter(Boolean);
          const trustSignals = cell(row, columnIndex.trustSignals)
            .split("|")
            .map((line) => line.trim())
            .filter(Boolean);

          // "Color Images" cell format: "Black=<url1>,<url2>|Brown=<url1>"
          // - one or more photos per color name, "|"-separated pairs,
          // "=" splitting each pair (only the first "=" counts, so a URL
          // with its own "=" in a query string still parses correctly),
          // and "," separating multiple photo links for the same color.
          const colorImages = {};
          const warnings = [];
          cell(row, columnIndex.colorImages)
            .split("|")
            .map((pair) => pair.trim())
            .filter(Boolean)
            .forEach((pair) => {
              const equalsIndex = pair.indexOf("=");
              if (equalsIndex === -1) {
                warnings.push(`"${pair}" in Color Images is missing "=" between the color name and its link(s).`);
                return;
              }
              const colorName = pair.slice(0, equalsIndex).trim();
              const urls = pair
                .slice(equalsIndex + 1)
                .split(",")
                .map((url) => url.trim())
                .filter(Boolean);
              if (!colorName || urls.length === 0) return;
              colorImages[colorName] = urls;
              if (!colors.some((c) => c.toLowerCase() === colorName.toLowerCase())) {
                warnings.push(`"${colorName}" in Color Images doesn't match any color in the Colors column.`);
              }
            });

          // If Price is left blank but Supplier Cost + Margin % are
          // both given, fill it in automatically - same formula as
          // the single "Add Product" form's "Fill Price" button
          // (percent-on-cost only; a fixed-₹ margin can just be typed
          // straight into Price instead).
          let priceAutoFilled = false;
          if (
            (!priceRaw || !Number.isFinite(price) || price <= 0) &&
            Number.isFinite(supplierCost) &&
            supplierCost > 0 &&
            Number.isFinite(marginPercent)
          ) {
            price = Math.round(supplierCost * (1 + marginPercent / 100));
            priceAutoFilled = true;
          }

          const errors = [];
          if (!name) errors.push("Product name is missing.");
          if (!Number.isFinite(price) || price <= 0) {
            errors.push(
              "A valid price is missing (or fill in Supplier Cost + Margin % to calculate it automatically)."
            );
          }
          if (images.length === 0) errors.push("At least one image URL is missing.");

          if (priceAutoFilled) {
            warnings.push(`Price auto-calculated as ₹${price} from Supplier Cost + Margin %.`);
          }

          return {
            rowNumber: index + 2, // spreadsheet row number: row 1 is the header
            name,
            category: cell(row, columnIndex.category) || "Bags",
            price,
            oldPrice: oldPriceRaw ? Number(oldPriceRaw) : 0,
            stock: stockRaw ? Math.max(0, Math.floor(Number(stockRaw))) : 0,
            description: cell(row, columnIndex.description),
            colors,
            images,
            colorImages,
            keyFeatures,
            dimensions,
            materials,
            careInstructions,
            trustSignals,
            supplierName,
            supplierCost,
            supplierProductId,
            supplierLink,
            shippingTime,
            valid: errors.length === 0,
            errors,
            warnings,
          };
        });

    return { error: null, rows: parsedRows };
  }

  function handleBulkFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkResults(null);
    setBulkParseError("");
    setBulkFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { error, rows } = parseBulkCsvRows(String(reader.result || ""));
        if (error) {
          setBulkParseError(error);
          setBulkRows([]);
          return;
        }
        setBulkRows(rows);
      } catch (error) {
        console.error("BULK CSV PARSE ERROR:", error);
        setBulkParseError("Could not read this file. Please make sure it's a valid CSV file.");
        setBulkRows([]);
      }
    };
    reader.onerror = () => {
      setBulkParseError("Could not read this file.");
      setBulkRows([]);
    };
    reader.readAsText(file);
  }

  /*
   * "Import from Google Sheet" - the admin pastes a sheet's
   * "Publish to web" CSV link, the server fetches that link's raw
   * CSV text (a browser fetch would normally be blocked by CORS),
   * and it's parsed with the exact same column logic as a CSV file
   * upload above. Re-clicking this after editing the sheet just
   * re-fetches it fresh - no download/upload step needed.
   */
  async function importFromGoogleSheet() {
    const url = sheetUrl.trim();
    if (!url) {
      setBulkParseError("Please paste your Google Sheet's published CSV link first.");
      return;
    }
    setSheetImporting(true);
    setBulkResults(null);
    setBulkParseError("");
    try {
      const response = await adminFetch(`${API}/api/admin/fetch-sheet-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }
      const { error, rows } = parseBulkCsvRows(data.csv);
      if (error) {
        setBulkParseError(error);
        setBulkRows([]);
        return;
      }
      setBulkFileName("Imported from Google Sheet");
      setBulkRows(rows);
    } catch (error) {
      console.error("GOOGLE SHEET IMPORT ERROR:", error);
      setBulkParseError(error.message || "Could not import that Google Sheet.");
      setBulkRows([]);
    } finally {
      setSheetImporting(false);
    }
  }

  /*
   * "Quick Add with AI" - the admin pastes raw, unformatted product
   * details (name, price, colors, image links, description - however
   * they have it, e.g. copied from WhatsApp) and the server asks
   * Gemini to pull out the structured fields. The parsed row(s) are
   * appended to the SAME bulkRows preview list used by the CSV file
   * and Google Sheet paths above, so the admin reviews them in the
   * exact same table (and gets the same duplicate-skip protection)
   * before clicking "Upload" - nothing is added to the site directly
   * from this step.
   */
  async function quickAddParseProducts() {
    const text = quickAddText.trim();
    if (!text) {
      setBulkParseError("Please paste some product details first.");
      return;
    }
    setQuickAddParsing(true);
    setBulkResults(null);
    setBulkParseError("");
    try {
      const response = await adminFetch(`${API}/api/admin/quick-add-parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }

      const startRowNumber =
        bulkRows.length > 0 ? Math.max(...bulkRows.map((row) => row.rowNumber)) + 1 : 1;

      const newRows = (Array.isArray(data.products) ? data.products : []).map((product, index) => {
        const name = String(product.name || "").trim();
        const price = Number(product.price);
        const colors = Array.isArray(product.colors)
          ? product.colors.map((color) => String(color || "").trim()).filter(Boolean)
          : [];
        const looseImages = Array.isArray(product.images)
          ? product.images.map((url) => String(url || "").trim()).filter(Boolean)
          : [];

        const colorImages = {};
        if (product.colorImages && typeof product.colorImages === "object") {
          Object.entries(product.colorImages).forEach(([color, urls]) => {
            const list = (Array.isArray(urls) ? urls : [urls])
              .map((url) => String(url || "").trim())
              .filter(Boolean);
            if (list.length === 0) return;
            colorImages[color] = list;
            if (!colors.some((c) => c.toLowerCase() === color.toLowerCase())) colors.push(color);
          });
        }

        const images = looseImages.length > 0 ? looseImages : Object.values(colorImages).flat();

        const errors = [];
        if (!name) errors.push("Product name is missing.");
        if (!Number.isFinite(price) || price <= 0) errors.push("A valid price is missing.");
        if (images.length === 0) {
          errors.push("No image link was found for this product in the text you pasted.");
        }

        return {
          rowNumber: startRowNumber + index,
          name,
          category: String(product.category || "Bags").trim() || "Bags",
          price,
          oldPrice: Number.isFinite(Number(product.oldPrice)) ? Number(product.oldPrice) : 0,
          stock: Number.isFinite(Number(product.stock)) ? Math.max(0, Math.floor(Number(product.stock))) : 0,
          description: String(product.description || ""),
          colors,
          images,
          colorImages,
          keyFeatures: Array.isArray(product.keyFeatures)
            ? product.keyFeatures.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
          dimensions: String(product.dimensions || "").trim(),
          materials: String(product.materials || "").trim(),
          careInstructions: String(product.careInstructions || "").trim(),
          trustSignals: Array.isArray(product.trustSignals)
            ? product.trustSignals.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
          supplierName: product.supplierName || "",
          supplierCost: Number.isFinite(Number(product.supplierCost)) ? Number(product.supplierCost) : null,
          supplierProductId: product.supplierProductId || "",
          supplierLink: product.supplierLink || "",
          shippingTime: product.shippingTime || "",
          valid: errors.length === 0,
          errors,
          warnings: [],
        };
      });

      if (newRows.length === 0) {
        setBulkParseError("AI couldn't find any product details in that text. Please check it and try again.");
        return;
      }

      setBulkFileName((previous) => previous || "Added via AI Quick Add");
      setBulkRows((previous) => [...previous, ...newRows]);
      setQuickAddText("");
    } catch (error) {
      console.error("QUICK ADD PARSE ERROR:", error);
      setBulkParseError(error.message || "Could not parse that text.");
    } finally {
      setQuickAddParsing(false);
    }
  }

  async function bulkUploadProducts() {
    const validRows = bulkRows.filter((row) => row.valid);
    if (validRows.length === 0) {
      alert("No valid rows to upload. Please fix the errors shown below first.");
      return;
    }
    try {
      setBulkUploading(true);
      setBulkResults(null);
      const response = await adminFetch(`${API}/api/products/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: validRows.map((row) => ({
            name: row.name,
            category: row.category,
            price: row.price,
            oldPrice: row.oldPrice,
            stock: row.stock,
            description: row.description,
            colors: row.colors,
            images: row.images,
            colorImages: row.colorImages,
            keyFeatures: row.keyFeatures,
            dimensions: row.dimensions,
            materials: row.materials,
            careInstructions: row.careInstructions,
            trustSignals: row.trustSignals,
            supplierName: row.supplierName,
            supplierCost: row.supplierCost,
            supplierProductId: row.supplierProductId,
            supplierLink: row.supplierLink,
            shippingTime: row.shippingTime,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }
      setBulkResults(data);
      loadProducts();
    } catch (error) {
      console.error("BULK UPLOAD ERROR:", error);
      setBulkResults({
        success: false,
        addedCount: 0,
        failedCount: validRows.length,
        results: [],
        errorMessage: error.message || "Bulk upload failed.",
      });
    } finally {
      setBulkUploading(false);
    }
  }

  function resetBulkUpload() {
    setBulkRows([]);
    setBulkFileName("");
    setBulkParseError("");
    setBulkResults(null);
  }

  /* =====================================================
     AI PHOTO STUDIO
     Helper for Bulk Upload - takes one real source photo,
     asks the backend (Gemini) to generate 4 premium studio
     shots + 1 lifestyle shot, lets the admin pick which to
     keep, saves the picked ones to Supabase Storage, and
     hands back copyable "|"-joined URLs ready to paste
     straight into the CSV's Image URLs column.
     ===================================================== */
  function handleAiSourceFileChange(event) {
    const file = event.target.files?.[0] || null;
    setAiSourceFile(file);
    setAiGeneratedImages([]);
    setAiGenerateError("");
  }

  async function generateAiPhotos() {
    if (!aiSourceFile) {
      alert("Please choose a source photo first.");
      return;
    }
    try {
      setAiGenerating(true);
      setAiGenerateError("");
      setAiGeneratedImages([]);
      const formData = new FormData();
      formData.append("sourceImage", aiSourceFile);
      const response = await adminFetch(`${API}/api/admin/products/generate-images`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }
      setAiGeneratedImages(
        (data.images || []).map((image, index) => ({
          ...image,
          id: `${Date.now()}-${index}`,
          selected: image.success,
        }))
      );
    } catch (error) {
      console.error("AI GENERATE ERROR:", error);
      setAiGenerateError(error.message || "Could not generate photos.");
    } finally {
      setAiGenerating(false);
    }
  }

  function toggleAiImageSelected(id) {
    setAiGeneratedImages((previous) =>
      previous.map((image) => (image.id === id ? { ...image, selected: !image.selected } : image))
    );
  }

  async function saveSelectedAiPhotos() {
    const toSave = aiGeneratedImages.filter((image) => image.success && image.selected);
    if (toSave.length === 0) {
      alert("Select at least one photo to save first.");
      return;
    }
    try {
      setAiSaving(true);
      const savedUrls = [];
      for (const image of toSave) {
        const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: image.dataUrl }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data?.message || `Server error ${response.status}`);
        }
        savedUrls.push(data.url);
      }
      setAiHistory((previous) => [
        {
          id: `${Date.now()}`,
          sourceFileName: aiSourceFile?.name || "photo",
          urls: savedUrls,
          thumbnail: toSave[0]?.dataUrl || "",
        },
        ...previous,
      ]);
      setAiSourceFile(null);
      setAiGeneratedImages([]);
    } catch (error) {
      console.error("AI SAVE ERROR:", error);
      alert(error.message || "Could not save the selected photos.");
    } finally {
      setAiSaving(false);
    }
  }

  async function copyAiUrls(id, urls) {
    const text = urls.join("|");
    try {
      await navigator.clipboard.writeText(text);
      setAiCopiedId(id);
      setTimeout(() => setAiCopiedId((current) => (current === id ? "" : current)), 2000);
    } catch (error) {
      console.error("CLIPBOARD ERROR:", error);
      alert("Could not copy automatically - please select and copy the text manually.");
    }
  }

  /* =====================================================
     MANUAL PHOTO UPLOAD (no AI, free)
     For photos the admin already has ready on their device
     (e.g. made elsewhere, like Gemini's own free app) - just
     uploads them as-is and hands back public links, same as
     the AI path above but without generating anything.
     ===================================================== */
  function handleManualFilesChange(event) {
    setManualFiles(Array.from(event.target.files || []));
    setManualUploadError("");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read this file."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadManualPhotos() {
    if (manualFiles.length === 0) {
      alert("Please choose at least one photo first.");
      return;
    }
    try {
      setManualUploading(true);
      setManualUploadError("");
      const savedUrls = [];
      for (const file of manualFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data?.message || `Server error ${response.status}`);
        }
        savedUrls.push(data.url);
      }
      const thumbnail = await readFileAsDataUrl(manualFiles[0]);
      setAiHistory((previous) => [
        {
          id: `${Date.now()}`,
          sourceFileName:
            manualFiles.length === 1 ? manualFiles[0].name : `${manualFiles.length} photos`,
          urls: savedUrls,
          thumbnail,
        },
        ...previous,
      ]);
      setManualFiles([]);
    } catch (error) {
      console.error("MANUAL PHOTO UPLOAD ERROR:", error);
      setManualUploadError(error.message || "Could not upload these photos.");
    } finally {
      setManualUploading(false);
    }
  }

  /* =====================================================
     EDIT PRODUCT
     ===================================================== */
  function openEditProduct(product) {
    setEditingProduct(product);
    setEditName(
      product?.name || ""
    );
    setEditCategory(
      product?.category || "Bags"
    );
    setEditPrice(
      product?.price ?? ""
    );
    setEditOldPrice(
      product?.oldPrice ?? ""
    );
    setEditStock(
      product?.stock ?? ""
    );
    setEditDescription(
      product?.description || ""
    );
    setEditKeyFeatures(
      Array.isArray(product?.keyFeatures) ? product.keyFeatures.join("\n") : ""
    );
    setEditDimensions(product?.dimensions || "");
    setEditMaterials(product?.materials || "");
    setEditCareInstructions(product?.careInstructions || "");
    setEditTrustSignals(
      Array.isArray(product?.trustSignals) ? product.trustSignals.join("\n") : ""
    );
    setEditColors(
      Array.isArray(product?.colors)
        ? product.colors.join(", ")
        : product?.colors || "Black"
    );
    setEditImages([]);
    setEditColorImageFiles({});
    setEditExistingColorImages(() => {
      const source = product?.colorImages || {};
      const normalized = {};
      for (const color of Object.keys(source)) {
        const value = source[color];
        normalized[color] = Array.isArray(value) ? [...value] : value ? [value] : [];
      }
      return normalized;
    });
    setEditSupplierName(product?.supplierName || "");
    setEditSupplierProductId(product?.supplierProductId || "");
    setEditSupplierLink(product?.supplierLink || "");
    setEditSupplierCost(
      product?.supplierCost === null || product?.supplierCost === undefined
        ? ""
        : product.supplierCost
    );
    setEditShippingTime(product?.shippingTime || "");
    setEditMarginType("percent");
    setEditMarginValue("");
  }
  function closeEditProduct() {
    if (editingLoading) {
      return;
    }
    setEditingProduct(null);
    setEditImages([]);
  }
  function handleEditImagesChange(event) {
    const selectedFiles =
      Array.from(
        event.target.files || []
      );
    setEditImages(selectedFiles);
  }

  function moveEditImage(index, direction) {
    setEditImages((previous) => {
      const next = [...previous];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return previous;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function removeEditImage(index) {
    setEditImages((previous) => previous.filter((_, i) => i !== index));
  }

  /*
   * PER-COLOR PHOTOS (Edit Product)
   * Same idea as the Add Product helpers above, but for newly queued
   * files in the edit form. Uploading new photos for a color replaces
   * that color's whole photo set on save (see server.js) - existing
   * photos are shown separately, read-only, so the admin can see
   * what's already there before deciding to replace it.
   */
  function addEditColorImageFiles(color, fileList) {
    const selected = Array.from(fileList || []);
    if (selected.length === 0) return;
    setEditColorImageFiles((previous) => ({
      ...previous,
      [color]: [...(previous[color] || []), ...selected],
    }));
  }

  function moveEditColorImage(color, index, direction) {
    setEditColorImageFiles((previous) => {
      const list = previous[color] || [];
      const next = [...list];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return previous;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...previous, [color]: next };
    });
  }

  function removeEditColorImage(color, index) {
    setEditColorImageFiles((previous) => ({
      ...previous,
      [color]: (previous[color] || []).filter((_, i) => i !== index),
    }));
  }

  // Removes one of a color's EXISTING (already-uploaded) photos - it's
  // just dropped from what gets kept on save, nothing is deleted until
  // the admin actually saves the product.
  function removeEditExistingColorImage(color, index) {
    setEditExistingColorImages((previous) => ({
      ...previous,
      [color]: (previous[color] || []).filter((_, i) => i !== index),
    }));
  }

  async function updateProduct(event) {
    event.preventDefault();
    if (!editingProduct?.id) {
      alert(
        "Product ID not found."
      );
      return;
    }
    if (!editName.trim()) {
      alert(
        "Product name required."
      );
      return;
    }
    try {
      setEditingLoading(true);
      const formData =
        new FormData();
      formData.append(
        "name",
        editName.trim()
      );
      formData.append(
        "category",
        editCategory
      );
      formData.append(
        "price",
        editPrice
      );
      formData.append(
        "oldPrice",
        editOldPrice
      );
      formData.append(
        "stock",
        editStock
      );
      formData.append(
        "description",
        editDescription
      );
      formData.append(
        "colors",
        editColors
      );
      formData.append("keyFeatures", editKeyFeatures);
      formData.append("dimensions", editDimensions);
      formData.append("materials", editMaterials);
      formData.append("careInstructions", editCareInstructions);
      formData.append("trustSignals", editTrustSignals);
      formData.append("supplierName", editSupplierName);
      formData.append("supplierProductId", editSupplierProductId);
      formData.append("supplierLink", editSupplierLink);
      formData.append("supplierCost", editSupplierCost);
      formData.append("shippingTime", editShippingTime);
      editImages.forEach((file) => {
        formData.append(
          "images",
          file
        );
      });
      // Existing photos the admin chose to KEEP (after any ✕ removals)
      // for every color shown in the form - the server keeps exactly
      // these and then adds any newly uploaded photos on top of them.
      formData.append("colorImages", JSON.stringify(editExistingColorImages));
      parseColorList(editColors).forEach((color) => {
        (editColorImageFiles[color] || []).forEach((file) => {
          formData.append(`colorImage__${encodeURIComponent(color)}`, file);
        });
      });
      const response =
        await adminFetch(
          `${API}/api/products/${editingProduct.id}`,
          {
            method: "PUT",
            body: formData,
          }
        );
      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Server error ${response.status}`
        );
      }
      if (data?.success === false) {
        throw new Error(
          data?.message ||
            "Product update failed."
        );
      }
      alert(
        "Product successfully updated."
      );
      setEditingProduct(null);
      setEditImages([]);
      setEditColorImageFiles({});
      await loadProducts();
    } catch (error) {
      console.error(
        "UPDATE PRODUCT ERROR:",
        error
      );
      alert(
        error.message ||
          "Product update nahi hua."
      );
    } finally {
      setEditingLoading(false);
    }
  }

  /* =====================================================
     DELETE PRODUCT
     ===================================================== */
  async function deleteProduct(product) {
    if (!product?.id) {
      alert(
        "Product ID not found."
      );
      return;
    }
    const confirmed =
      window.confirm(
        `Delete "${product.name}"?\n\nThis PERMANENTLY erases the product and its uploaded photos - this cannot be undone. (If it has past orders, it'll be hidden instead so that order history stays intact.)`
      );
    if (!confirmed) {
      return;
    }
    try {
      const response =
        await adminFetch(
          `${API}/api/products/${product.id}`,
          {
            method: "DELETE",
          }
        );
      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Server error ${response.status}`
        );
      }
      if (data?.success === false) {
        throw new Error(
          data?.message ||
            "Product delete failed."
        );
      }
      setProducts(
        (previous) =>
          previous.filter(
            (item) =>
              String(item.id) !==
              String(product.id)
          )
      );
      alert(
        data?.message || "Product successfully deleted."
      );
    } catch (error) {
      console.error(
        "DELETE PRODUCT ERROR:",
        error
      );
      alert(
        error.message ||
          "Product delete nahi hua."
      );
    }
  }

  /* =====================================================
     UPDATE ORDER STATUS
     ===================================================== */
  async function updateOrderStatus(
    order,
    newStatus
  ) {
    const id =
      getOrderId(order);
    if (
      !id ||
      id === "—"
    ) {
      alert(
        "Order ID not found."
      );
      return;
    }
    try {
      setSavingStatus(true);
      const response =
        await adminFetch(
          `${API}/api/orders/${id}/status`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              status: newStatus,
              orderStatus:
                newStatus,
            }),
          }
        );
      const data =
        await response
          .json()
          .catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Server error ${response.status}`
        );
      }
      setOrders(
        (previous) =>
          previous.map(
            (item) => {
              if (
                String(
                  getOrderId(
                    item
                  )
                ) ===
                String(id)
              ) {
                return {
                  ...item,
                  status:
                    newStatus,
                  orderStatus:
                    newStatus,
                };
              }
              return item;
            }
          )
      );
      setSelectedOrder(
        (previous) => {
          if (
            previous &&
            String(
              getOrderId(
                previous
              )
            ) ===
              String(id)
          ) {
            return {
              ...previous,
              status:
                newStatus,
              orderStatus:
                newStatus,
            };
          }
          return previous;
        }
      );
    } catch (error) {
      console.error(
        "UPDATE ORDER STATUS ERROR:",
        error
      );
      alert(
        error.message ||
          "Order status update nahi hua."
      );
    } finally {
      setSavingStatus(false);
    }
  }

  /* =====================================================
     UPDATE SHIPPING / COURIER DETAILS
     Saves courier name + tracking number/link against the
     order - this is exactly what the customer-facing Track
     Order page reads back, so this is how a courier update
     "shows up" on the website once entered here.
     ===================================================== */
  async function updateOrderShipping(order) {
    const id = getOrderId(order);
    if (!id || id === "—") {
      alert("Order ID not found.");
      return;
    }
    try {
      setSavingShipping(true);
      const response = await adminFetch(
        `${API}/api/orders/${id}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courierName: shipCourier.trim(),
            trackingNumber: shipTrackingNumber.trim(),
            trackingUrl: shipTrackingUrl.trim(),
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.message || `Server error ${response.status}`
        );
      }

      const patch = {
        courierName: shipCourier.trim(),
        courier_name: shipCourier.trim(),
        trackingNumber: shipTrackingNumber.trim(),
        tracking_number: shipTrackingNumber.trim(),
        trackingUrl: shipTrackingUrl.trim(),
        tracking_url: shipTrackingUrl.trim(),
      };

      setOrders((previous) =>
        previous.map((item) =>
          String(getOrderId(item)) === String(id)
            ? { ...item, ...patch }
            : item
        )
      );
      setSelectedOrder((previous) =>
        previous && String(getOrderId(previous)) === String(id)
          ? { ...previous, ...patch }
          : previous
      );
      alert("Shipping details saved. Customer's Track Order page will show this, and they'll get an email with the courier + tracking details.");
    } catch (error) {
      console.error("UPDATE ORDER SHIPPING ERROR:", error);
      alert(error.message || "Shipping details save nahi hue.");
    } finally {
      setSavingShipping(false);
    }
  }

  /* =====================================================
     FILTERED ORDERS
     ===================================================== */
  const filteredOrders =
    orders.filter((order) => {
      const search =
        orderSearch
          .trim()
          .toLowerCase();
      if (!search) {
        return true;
      }
      const text = [
        getOrderId(order),
        getCustomerName(
          order
        ),
        getCustomerMobile(
          order
        ),
        getCustomerEmail(
          order
        ),
        getOrderStatus(
          order
        ),
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(
        search
      );
    });

  /* =====================================================
     FILTERED PRODUCTS
     ===================================================== */
  const filteredProducts =
    products.filter(
      (product) => {
        const search =
          productSearch
            .trim()
            .toLowerCase();
        if (!search) {
          return true;
        }
        return [
          product.name,
          product.category,
          product.description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      }
    );

  const filteredCustomers = customers.filter((customer) => {
    const search = customerSearch.trim().toLowerCase();
    if (!search) return true;
    return [customer.name, customer.mobile, customer.email, customer.city]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  /* =====================================================
     ORDER COUNTS
     ===================================================== */
  const pendingCount =
    orders.filter(
      (order) =>
        getOrderStatus(
          order
        ) === "Received"
    ).length;
  const confirmedCount =
    orders.filter(
      (order) =>
        getOrderStatus(
          order
        ) === "Confirmed"
    ).length;
  const shippedCount =
    orders.filter(
      (order) =>
        getOrderStatus(
          order
        ) === "Shipped"
    ).length;
  const deliveredCount =
    orders.filter(
      (order) =>
        getOrderStatus(
          order
        ) === "Delivered"
    ).length;

  /* =====================================================
     LOGIN SCREEN
     ===================================================== */
  if (!adminLoggedIn) {
    return (
      <div className="admin-login-page">
        <style>{`
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
          }
          .admin-login-page {
            min-height: 100vh;
            background:
              radial-gradient(
                circle at top,
                #292929 0%,
                #111111 45%,
                #050505 100%
              );
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }
          .admin-login-card {
            width: 440px;
            max-width: 100%;
            background: #ffffff;
            border-radius: 22px;
            padding: 38px;
            box-shadow:
              0 30px 80px
              rgba(0, 0, 0, 0.45);
          }
          .login-logo {
            width: 62px;
            height: 62px;
            margin: 0 auto 20px;
            border-radius: 18px;
            background: #111111;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 25px;
            font-weight: 900;
            letter-spacing: 2px;
          }
          .login-title {
            text-align: center;
            margin: 0;
            font-size: 27px;
            letter-spacing: 4px;
          }
          .login-subtitle {
            text-align: center;
            color: #777777;
            font-size: 12px;
            letter-spacing: 1.5px;
            margin: 8px 0 30px;
          }
          .login-group {
            margin-bottom: 18px;
          }
          .login-label {
            display: block;
            font-size: 13px;
            font-weight: 800;
            margin-bottom: 7px;
          }
          .login-input {
            width: 100%;
            padding: 14px 15px;
            border:
              1px solid #dddddd;
            border-radius: 10px;
            outline: none;
            font-size: 14px;
          }
          .login-input:focus {
            border-color: #111111;
            box-shadow:
              0 0 0 3px
              rgba(0, 0, 0, 0.06);
          }
          .login-button {
            width: 100%;
            border: 0;
            border-radius: 10px;
            background: #111111;
            color: #ffffff;
            padding: 14px;
            font-weight: 800;
            font-size: 14px;
            cursor: pointer;
            margin-top: 8px;
          }
          .login-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .login-error {
            background: #fee2e2;
            color: #991b1b;
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 18px;
            font-size: 13px;
            font-weight: 700;
          }
          .login-security {
            margin-top: 20px;
            text-align: center;
            color: #888888;
            font-size: 11px;
          }
          @media (max-width: 500px) {
            .admin-login-card {
              padding: 28px 22px;
            }
          }
        `}</style>
        <div className="admin-login-card">
          <div className="login-logo">
            LX
          </div>
          <h1 className="login-title">
            SHRIMOH
          </h1>
          <p className="login-subtitle">
            SECURE ADMIN PANEL
          </p>
          <form
            onSubmit={adminLogin}
          >
            {loginError && (
              <div className="login-error">
                {loginError}
              </div>
            )}
            <div className="login-group">
              <label className="login-label">
                ADMIN EMAIL
              </label>
              <input
                className="login-input"
                type="email"
                value={loginEmail}
                onChange={(event) =>
                  setLoginEmail(
                    event.target.value
                  )
                }
                placeholder="Enter admin email"
                autoComplete="username"
                required
              />
            </div>
            <div className="login-group">
              <label className="login-label">
                ADMIN PASSWORD
              </label>
              <input
                className="login-input"
                type="password"
                value={loginPassword}
                onChange={(event) =>
                  setLoginPassword(
                    event.target.value
                  )
                }
                placeholder="Enter admin password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              className="login-button"
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading
                ? "AUTHENTICATING..."
                : "LOGIN TO ADMIN"}
            </button>
          </form>
          <div className="login-security">
            🔒 Secure administrator access
          </div>
        </div>
      </div>
    );
  }

  /* =====================================================
     ADMIN PANEL
     ===================================================== */
  return (
    <div className="admin-page">
      <style>{`
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          background: #f4f5f7;
        }
        .admin-page {
          min-height: 100vh;
          background: #f4f5f7;
          color: #171717;
          font-family: Arial, Helvetica, sans-serif;
        }
        .admin-header {
          background: #111111;
          color: white;
          padding: 22px 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .brand-title {
          margin: 0;
          font-size: 25px;
          letter-spacing: 3px;
        }
        .brand-subtitle {
          margin: 5px 0 0;
          color: #bdbdbd;
          font-size: 12px;
          letter-spacing: 1px;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .admin-badge {
          border: 1px solid #444;
          color: #d8d8d8;
          padding: 10px 13px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .admin-logout-button {
          background: #ffffff;
          color: #111111;
          border: 0;
          border-radius: 8px;
          padding: 10px 15px;
          cursor: pointer;
          font-weight: 800;
        }
        .admin-container {
          max-width: 1450px;
          margin: 0 auto;
          padding: 30px;
        }
        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 25px;
          flex-wrap: wrap;
        }
        .tab-button {
          border: 1px solid #ddd;
          background: white;
          padding: 13px 22px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
        }
        .tab-button.active {
          background: #111;
          color: white;
          border-color: #111;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 25px;
        }
        .stat-card {
          background: white;
          border-radius: 15px;
          padding: 20px;
          border: 1px solid #e8e8e8;
        }
        .stat-label {
          color: #777;
          font-size: 13px;
          margin-bottom: 8px;
        }
        .stat-number {
          font-size: 28px;
          font-weight: 800;
        }
        .panel {
          background: white;
          border: 1px solid #e5e5e5;
          border-radius: 18px;
          padding: 25px;
          margin-bottom: 25px;
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .panel-title {
          margin: 0;
          font-size: 22px;
        }
        .search-input {
          width: 300px;
          max-width: 100%;
          padding: 12px 14px;
          border: 1px solid #ddd;
          border-radius: 9px;
          outline: none;
        }
        .orders-table-wrap {
          width: 100%;
          overflow-x: auto;
        }
        .orders-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 850px;
        }
        .orders-table th {
          background: #f7f7f7;
          text-align: left;
          padding: 14px;
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
        }
        .orders-table td {
          padding: 15px 14px;
          border-top: 1px solid #eee;
          vertical-align: middle;
        }
        .customer-name {
          font-weight: 700;
        }
        .customer-info {
          color: #777;
          font-size: 12px;
          margin-top: 4px;
        }
        .site-content-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 20px;
        }
        .site-content-card {
          border: 1px solid #e8e8e8;
          border-radius: 14px;
          padding: 18px;
        }
        .site-content-card h3 {
          margin: 0 0 6px;
          font-size: 15px;
        }
        .site-content-preview {
          width: 100%;
          height: 150px;
          margin: 14px 0;
          border-radius: 10px;
          background: #f5f3ee;
          border: 1px dashed #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #999;
          font-size: 12px;
        }
        .site-content-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .site-content-preview-round {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          margin-left: auto;
          margin-right: auto;
        }
        .status {
          display: inline-block;
          padding: 7px 10px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 800;
        }
        .status-received {
          background: #fff3cd;
          color: #856404;
        }
        .status-confirmed {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .status-processing {
          background: #ede9fe;
          color: #6d28d9;
        }
        .status-shipped {
          background: #e0f2fe;
          color: #0369a1;
        }
        .status-delivered {
          background: #dcfce7;
          color: #166534;
        }
        .status-cancelled {
          background: #fee2e2;
          color: #991b1b;
        }
        .view-button {
          background: #111;
          color: white;
          border: 0;
          border-radius: 8px;
          padding: 9px 13px;
          cursor: pointer;
          font-weight: 700;
        }
        .refresh-button {
          background: white;
          color: #111;
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 10px 15px;
          cursor: pointer;
          font-weight: 700;
        }
        .product-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
        }
        .form-group.full {
          grid-column: 1 / -1;
        }
        .form-label {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 7px;
        }
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 12px 13px;
          border: 1px solid #ddd;
          border-radius: 9px;
          outline: none;
          font-size: 14px;
        }
        .form-textarea {
          resize: vertical;
        }
        .form-hint {
          font-size: 12px;
          color: #777;
          margin: -4px 0 10px;
        }
        .color-photo-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 4px;
        }
        .color-photo-slot {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          width: 220px;
          padding: 10px;
          border: 1px solid #e6e6e6;
          border-radius: 10px;
          background: #fafafa;
        }
        .color-photo-name {
          font-size: 12px;
          font-weight: 600;
        }
        .color-photo-preview-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .color-photo-preview-card {
          width: 82px;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          background: white;
          position: relative;
        }
        .color-photo-preview {
          width: 80px;
          height: 80px;
          object-fit: cover;
          display: block;
        }
        .color-photo-placeholder {
          width: 100%;
          padding: 18px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed #ccc;
          border-radius: 8px;
          font-size: 10px;
          color: #999;
          text-align: center;
        }
        .color-photo-existing-tag,
        .color-photo-new-tag {
          display: block;
          padding: 2px 4px;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-align: center;
          text-transform: uppercase;
        }
        .color-photo-existing-tag {
          color: #4a7a4a;
        }
        .color-photo-new-tag {
          color: #a06a1f;
        }
        .color-photo-slot input[type="file"] {
          width: 100%;
          font-size: 10px;
        }
        .image-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 15px;
        }
        .image-preview-card {
          width: 105px;
          border: 1px solid #ddd;
          border-radius: 9px;
          overflow: hidden;
          background: white;
        }
        .image-preview-card img {
          width: 105px;
          height: 90px;
          object-fit: cover;
          display: block;
        }
        .image-number {
          display: block;
          padding: 7px 7px 0;
          font-size: 11px;
          text-align: center;
        }
        .image-reorder-row {
          display: flex;
          gap: 4px;
          padding: 6px 7px 7px;
        }
        .image-reorder-button {
          flex: 1;
          padding: 4px 0;
          font-size: 12px;
          font-weight: 700;
          background: #f3f3f3;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          line-height: 1;
        }
        .image-reorder-button:hover:not(:disabled) {
          background: #e6e6e6;
        }
        .image-reorder-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .image-remove-button {
          display: block;
          width: 100%;
          padding: 5px 0 8px;
          font-size: 11px;
          font-weight: 600;
          color: #b91c1c;
          background: none;
          border: 0;
          border-top: 1px solid #eee;
          cursor: pointer;
        }
        .image-remove-button:hover {
          background: #fef2f2;
        }
        .add-button {
          margin-top: 22px;
          padding: 13px 24px;
          background: #111;
          color: white;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
          font-weight: 800;
        }
        .add-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .success-message {
          margin-top: 15px;
          font-weight: 700;
          color: #166534;
        }
        .error-message {
          margin-top: 15px;
          font-weight: 700;
          color: #b91c1c;
        }
        .secondary-button {
          padding: 11px 20px;
          background: white;
          color: #111;
          border: 1px solid #ccc;
          border-radius: 9px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .secondary-button:hover {
          background: #f4f5f7;
        }
        .quick-add-section {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid #e7ddc4;
          border-radius: 10px;
          background: #fbf8f0;
        }
        .quick-add-label {
          font-size: 12px;
          color: #555;
          margin: 0 0 10px;
          line-height: 1.6;
        }
        .quick-add-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 13px;
          font-family: inherit;
          resize: vertical;
          box-sizing: border-box;
        }
        .sheet-import-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 14px;
        }
        .sheet-import-input {
          flex: 1 1 320px;
          min-width: 220px;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 13px;
        }
        .bulk-or-divider {
          font-size: 12px;
          color: #888;
          text-align: center;
          margin: 14px 0 0;
        }
        .bulk-upload-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-top: 10px;
        }
        .bulk-file-label {
          cursor: pointer;
        }
        .bulk-file-name {
          font-size: 12px;
          color: #555;
        }
        .bulk-summary-line {
          font-size: 13px;
          font-weight: 600;
          margin-top: 18px;
          margin-bottom: 10px;
        }
        .bulk-preview-table-wrap {
          overflow-x: auto;
          border: 1px solid #e5e5e5;
          border-radius: 10px;
        }
        .bulk-preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .bulk-preview-table th,
        .bulk-preview-table td {
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid #eee;
          white-space: nowrap;
        }
        .bulk-preview-table th {
          background: #fafafa;
          font-size: 11px;
          letter-spacing: 0.4px;
          color: #666;
        }
        .bulk-row-error {
          background: #fef2f2;
        }
        .bulk-status-ok {
          color: #166534;
          font-weight: 700;
        }
        .bulk-status-error {
          color: #b91c1c;
          font-weight: 600;
          white-space: normal;
        }
        .bulk-status-warning {
          color: #92620a;
          font-weight: 500;
          white-space: normal;
        }
        .bulk-fail-list {
          margin: 8px 0 0;
          padding-left: 18px;
          font-weight: 400;
          font-size: 13px;
        }
        .ai-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 14px;
          margin-top: 16px;
        }
        .ai-photo-card {
          border: 2px solid #e5e5e5;
          border-radius: 10px;
          overflow: hidden;
          background: white;
        }
        .ai-photo-card.ai-photo-selected {
          border-color: #111;
        }
        .ai-photo-card img {
          width: 100%;
          height: 130px;
          object-fit: cover;
          display: block;
        }
        .ai-photo-check {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .ai-photo-failed {
          padding: 14px 10px;
          min-height: 130px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          text-align: center;
        }
        .ai-photo-failed span {
          font-weight: 700;
          font-size: 12px;
          color: #b91c1c;
        }
        .ai-photo-failed p {
          font-size: 11px;
          color: #777;
          margin: 0;
        }
        .ai-history {
          margin-top: 20px;
          border-top: 1px solid #eee;
          padding-top: 16px;
        }
        .ai-history-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .ai-history-row img {
          width: 48px;
          height: 48px;
          object-fit: cover;
          border-radius: 8px;
          flex-shrink: 0;
        }
        .ai-history-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          font-size: 12px;
        }
        .ai-history-info span {
          color: #777;
        }
        .product-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        .product-card {
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          overflow: hidden;
          background: white;
        }
        .product-image {
          width: 100%;
          height: 230px;
          object-fit: cover;
          display: block;
          background: #eee;
        }
        .product-info {
          padding: 15px;
        }
        .product-info h3 {
          margin: 0 0 7px;
          font-size: 16px;
        }
        .product-category {
          color: #777;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .product-price {
          font-size: 17px;
          font-weight: 800;
        }
        .supplier-info-box {
          margin-top: 10px;
          padding: 10px;
          background: #fef9c3;
          border-radius: 8px;
          font-size: 11px;
          color: #713f12;
        }
        .supplier-info-box strong {
          display: block;
          margin-bottom: 3px;
          font-size: 10px;
          letter-spacing: 0.5px;
        }
        .margin-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 9px;
          padding: 12px 13px;
        }
        .margin-row {
          display: flex;
          gap: 10px;
        }
        .margin-row .form-input {
          flex: 1;
        }
        .margin-row .form-select {
          width: auto;
        }
        .margin-apply-button {
          padding: 0 14px;
          border: 1px solid #16a34a;
          border-radius: 9px;
          background: #16a34a;
          color: white;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .margin-apply-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .margin-profit-line {
          margin: 10px 0 0;
          font-size: 13px;
          font-weight: 600;
          color: #15803d;
        }
        /* =================================================
           IMPORT STATUS BADGE (draft / review / published)
           ================================================= */
        .status-badge {
          display: inline-block;
          margin: 4px 0 2px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .status-draft {
          background: #f3f4f6;
          color: #4b5563;
        }
        .status-review {
          background: #dbeafe;
          color: #1e40af;
        }
        .status-published {
          background: #dcfce7;
          color: #166534;
        }
        .status-action-button {
          flex: 1;
          border: 0;
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
          background: #eef2ff;
          color: #3730a3;
        }
        .status-action-button:hover {
          background: #e0e7ff;
        }
        .status-action-button.publish {
          background: #dcfce7;
          color: #166534;
        }
        .status-action-button.publish:hover {
          background: #bbf7d0;
        }
        /* =================================================
           PRODUCT EDIT / DELETE BUTTONS
           ================================================= */
        .product-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          padding: 0 15px 15px;
        }
        .product-actions .status-action-button {
          flex-basis: calc(50% - 5px);
        }
        .edit-product-button,
        .delete-product-button {
          flex: 1;
          border: 0;
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
        }
        .edit-product-button {
          background: #111111;
          color: #ffffff;
        }
        .edit-product-button:hover {
          background: #2b2b2b;
        }
        .delete-product-button {
          background: #fee2e2;
          color: #991b1b;
        }
        .delete-product-button:hover {
          background: #fecaca;
        }
        .product-edit-modal {
          width: 850px;
          max-width: 100%;
          max-height: 92vh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 18px;
          padding: 25px;
        }
        .edit-modal-title {
          margin: 0;
          font-size: 22px;
        }
        .edit-modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 22px;
        }
        .save-product-button {
          flex: 1;
          padding: 13px 20px;
          border: 0;
          border-radius: 9px;
          background: #111111;
          color: #ffffff;
          cursor: pointer;
          font-weight: 800;
        }
        .cancel-product-button {
          flex: 1;
          padding: 13px 20px;
          border: 1px solid #cccccc;
          border-radius: 9px;
          background: #ffffff;
          color: #111111;
          cursor: pointer;
          font-weight: 800;
        }
        .save-product-button:disabled,
        .cancel-product-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
        }
        .order-modal {
          width: 900px;
          max-width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 18px;
          padding: 25px;
        }
        .modal-top {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: flex-start;
          border-bottom: 1px solid #eee;
          padding-bottom: 18px;
          margin-bottom: 20px;
        }
        .close-button {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 50%;
          background: #f0f0f0;
          cursor: pointer;
          font-size: 20px;
        }
        .close-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin-bottom: 25px;
        }
        .detail-box {
          background: #f7f7f7;
          border-radius: 12px;
          padding: 15px;
        }
        .detail-label {
          color: #777;
          font-size: 11px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .detail-value {
          font-weight: 700;
          word-break: break-word;
        }
        .status-controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 15px 0 25px;
        }
        .status-select {
          padding: 11px;
          border: 1px solid #ccc;
          border-radius: 8px;
          min-width: 190px;
        }
        .shipping-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 15px 0 15px;
        }
        .shipping-grid .form-group.full {
          grid-column: 1 / -1;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table th,
        .items-table td {
          padding: 12px;
          border-bottom: 1px solid #eee;
          text-align: left;
        }
        .empty-state {
          text-align: center;
          padding: 50px 20px;
          color: #777;
        }
        .coupon-form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        .coupon-table th {
          background: #f7f7f7;
          text-align: left;
          padding: 12px;
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
        }
        .coupon-table td {
          padding: 13px 12px;
          border-top: 1px solid #eee;
        }
        .coupon-active-badge {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 800;
        }
        .coupon-active-yes {
          background: #dcfce7;
          color: #166534;
        }
        .coupon-active-no {
          background: #f3f4f6;
          color: #6b7280;
        }
        .coupon-row-actions {
          display: flex;
          gap: 8px;
        }
        .coupon-action-button {
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .coupon-action-button.danger {
          border-color: #fca5a5;
          color: #991b1b;
        }
        @media (max-width: 1000px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .product-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .coupon-form-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 700px) {
          .admin-container {
            padding: 15px;
          }
          .admin-header {
            padding: 18px;
          }
          .header-actions {
            width: 100%;
          }
          .admin-badge {
            flex: 1;
          }
          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }
          .product-form-grid {
            grid-template-columns: 1fr;
          }
          .coupon-form-grid {
            grid-template-columns: 1fr;
          }
          .form-group.full {
            grid-column: auto;
          }
          .product-grid {
            grid-template-columns: 1fr;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
          .search-input {
            width: 100%;
          }
          .product-actions {
            flex-direction: column;
          }
          .edit-modal-actions {
            flex-direction: column;
          }
        }
      `}</style>
      <header className="admin-header">
        <div>
          <h1 className="brand-title">
            SHRIMOH ADMIN
          </h1>
          <p className="brand-subtitle">
            THE LUXURY STORE • ADMIN PANEL
          </p>
        </div>
        <div className="header-actions">
          <div className="admin-badge">
            🔒 ADMIN ACCESS
          </div>
          <button
            className="refresh-button"
            onClick={() => {
              loadOrders();
              loadProducts();
              if (activeTab === "dashboard") loadDashboard();
              if (activeTab === "customers") loadCustomers();
              if (activeTab === "coupons") loadCoupons();
            }}
          >
            ↻ Refresh
          </button>
          <button
            className="admin-logout-button"
            onClick={logoutAdmin}
          >
            Logout
          </button>
        </div>
      </header>
      <main className="admin-container">
        <div className="tabs">
          <button
            className={
              activeTab === "dashboard"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={
              activeTab === "orders"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() =>
              setActiveTab("orders")
            }
          >
            Orders
          </button>
          <button
            className={
              activeTab === "products"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() =>
              setActiveTab("products")
            }
          >
            Products
          </button>
          <button
            className={
              activeTab === "customers"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setActiveTab("customers")}
          >
            Customers
          </button>
          <button
            className={
              activeTab === "coupons"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setActiveTab("coupons")}
          >
            Coupons
          </button>
          <button
            className={
              activeTab === "content"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setActiveTab("content")}
          >
            Site Content
          </button>
        </div>

        {activeTab === "dashboard" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Business Overview</h2>
            </div>
            {loadingDashboard || !dashboard ? (
              <div className="empty-state">Loading dashboard...</div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">TOTAL ORDERS</div>
                  <div className="stat-number">{dashboard.totalOrders}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">PAID ORDERS</div>
                  <div className="stat-number">{dashboard.paidOrders}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">CANCELLED</div>
                  <div className="stat-number">{dashboard.cancelledOrders}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">TOTAL REVENUE</div>
                  <div className="stat-number">{formatMoney(dashboard.totalRevenue)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">ESTIMATED PROFIT</div>
                  <div className="stat-number">
                    {dashboard.profitDataAvailable
                      ? formatMoney(dashboard.totalProfit)
                      : "—"}
                  </div>
                  {!dashboard.profitDataAvailable && (
                    <div className="customer-info">
                      Add supplier cost to products to see profit.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "orders" && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">
                  TOTAL ORDERS
                </div>
                <div className="stat-number">
                  {orders.length}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  RECEIVED
                </div>
                <div className="stat-number">
                  {pendingCount}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  SHIPPED
                </div>
                <div className="stat-number">
                  {shippedCount}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  DELIVERED
                </div>
                <div className="stat-number">
                  {deliveredCount}
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  Customer Orders
                </h2>
                <input
                  className="search-input"
                  value={orderSearch}
                  onChange={(event) =>
                    setOrderSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search order, customer, mobile..."
                />
              </div>
              {loadingOrders ? (
                <div className="empty-state">
                  Loading orders...
                </div>
              ) : filteredOrders.length ===
                0 ? (
                <div className="empty-state">
                  No orders found.
                </div>
              ) : (
                <div className="orders-table-wrap">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map(
                        (
                          order,
                          index
                        ) => {
                          const items =
                            getOrderItems(
                              order
                            );
                          const amount =
                            order?.totalAmount ??
                            order?.total ??
                            order?.grandTotal ??
                            order?.amount ??
                            0;
                          const status =
                            getOrderStatus(
                              order
                            );
                          return (
                            <tr
                              key={`${getOrderId(
                                order
                              )}-${index}`}
                            >
                              <td>
                                <strong>
                                  #
                                  {getOrderId(
                                    order
                                  )}
                                </strong>
                              </td>
                              <td>
                                <div className="customer-name">
                                  {getCustomerName(
                                    order
                                  )}
                                </div>
                                <div className="customer-info">
                                  {getCustomerMobile(
                                    order
                                  )}
                                </div>
                                <div className="customer-info">
                                  {getCustomerEmail(
                                    order
                                  )}
                                </div>
                              </td>
                              <td>
                                {items.length}
                              </td>
                              <td>
                                <strong>
                                  {formatMoney(
                                    amount
                                  )}
                                </strong>
                              </td>
                              <td>
                                <span
                                  className={`status status-${status
                                    .toLowerCase()
                                    .replace(
                                      /\s+/g,
                                      "-"
                                    )}`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td>
                                {formatDate(
                                  order?.createdAt ||
                                    order?.date ||
                                    order?.orderDate
                                )}
                              </td>
                              <td>
                                <button
                                  className="view-button"
                                  onClick={() =>
                                    setSelectedOrder(
                                      order
                                    )
                                  }
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "customers" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Customers</h2>
              <input
                className="search-input"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search name, mobile, email, city..."
              />
            </div>
            {loadingCustomers ? (
              <div className="empty-state">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="empty-state">No customers found.</div>
            ) : (
              <div className="orders-table-wrap">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mobile</th>
                      <th>Email</th>
                      <th>City / State</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <div className="customer-name">{customer.name}</div>
                        </td>
                        <td>{customer.mobile}</td>
                        <td>{customer.email}</td>
                        <td>
                          {customer.city}
                          {customer.state ? `, ${customer.state}` : ""}
                        </td>
                        <td>{formatDate(customer.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "coupons" && (
          <>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  {editingCoupon ? "Edit Coupon" : "Create Coupon"}
                </h2>
              </div>
              <form onSubmit={saveCoupon}>
                <div className="coupon-form-grid">
                  <div className="form-group">
                    <label className="form-label">Coupon Code *</label>
                    <input
                      className="form-input"
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                      placeholder="WELCOME10"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discount Type *</label>
                    <select
                      className="form-select"
                      value={couponDiscountType}
                      onChange={(event) => setCouponDiscountType(event.target.value)}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Discount Value * {couponDiscountType === "percentage" ? "(%)" : "(₹)"}
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={couponDiscountValue}
                      onChange={(event) => setCouponDiscountValue(event.target.value)}
                      placeholder={couponDiscountType === "percentage" ? "10" : "200"}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Minimum Order Amount (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={couponMinOrder}
                      onChange={(event) => setCouponMinOrder(event.target.value)}
                      placeholder="999"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Maximum Discount (₹, optional)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={couponMaxDiscount}
                      onChange={(event) => setCouponMaxDiscount(event.target.value)}
                      placeholder="500"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expiry Date (optional)</label>
                    <input
                      className="form-input"
                      type="date"
                      value={couponExpiry}
                      onChange={(event) => setCouponExpiry(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Usage Limit (optional)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={couponUsageLimit}
                      onChange={(event) => setCouponUsageLimit(event.target.value)}
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="add-button" type="submit" disabled={couponSaving}>
                    {couponSaving
                      ? "SAVING..."
                      : editingCoupon
                      ? "UPDATE COUPON"
                      : "CREATE COUPON"}
                  </button>
                  {editingCoupon && (
                    <button
                      type="button"
                      className="cancel-product-button"
                      style={{ marginTop: "22px", flex: "none", padding: "13px 24px" }}
                      onClick={resetCouponForm}
                    >
                      CANCEL EDIT
                    </button>
                  )}
                </div>
              </form>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">All Coupons</h2>
              </div>
              {loadingCoupons ? (
                <div className="empty-state">Loading coupons...</div>
              ) : coupons.length === 0 ? (
                <div className="empty-state">No coupons created yet.</div>
              ) : (
                <div className="orders-table-wrap">
                  <table className="orders-table coupon-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Discount</th>
                        <th>Min Order</th>
                        <th>Usage</th>
                        <th>Expiry</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((coupon) => (
                        <tr key={coupon.id}>
                          <td>
                            <strong>{coupon.code}</strong>
                          </td>
                          <td>
                            {coupon.discountType === "percentage"
                              ? `${coupon.discountValue}%`
                              : formatMoney(coupon.discountValue)}
                            {coupon.maxDiscountAmount
                              ? ` (max ${formatMoney(coupon.maxDiscountAmount)})`
                              : ""}
                          </td>
                          <td>{formatMoney(coupon.minOrderAmount)}</td>
                          <td>
                            {coupon.timesUsed}
                            {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : " / ∞"}
                          </td>
                          <td>
                            {coupon.expiryDate
                              ? formatDate(coupon.expiryDate)
                              : "No expiry"}
                          </td>
                          <td>
                            <span
                              className={
                                coupon.active
                                  ? "coupon-active-badge coupon-active-yes"
                                  : "coupon-active-badge coupon-active-no"
                              }
                            >
                              {coupon.active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </td>
                          <td>
                            <div className="coupon-row-actions">
                              <button
                                type="button"
                                className="coupon-action-button"
                                onClick={() => openEditCoupon(coupon)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="coupon-action-button"
                                onClick={() => toggleCouponActive(coupon)}
                              >
                                {coupon.active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="coupon-action-button danger"
                                onClick={() => deleteCoupon(coupon)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "content" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Site Content</h2>
            </div>

            <p className="customer-info" style={{ marginBottom: 20 }}>
              Upload photos here whenever you have good ones ready - the homepage
              automatically switches to them. Until then it keeps using its current
              placeholder look, so nothing breaks if you leave this empty.
            </p>

            {loadingSiteSettings ? (
              <div className="empty-state">Loading...</div>
            ) : (
              <div className="site-content-grid">
                <div className="site-content-card">
                  <h3>Homepage Hero Banner</h3>
                  <p className="customer-info">
                    The large image behind "Crafted for distinction" at the top of
                    the homepage.
                  </p>

                  <div className="site-content-preview">
                    {siteHeroPreview || siteSettings.heroImageUrl ? (
                      <img
                        src={siteHeroPreview || siteSettings.heroImageUrl}
                        alt="Hero preview"
                      />
                    ) : (
                      <span>No image uploaded yet</span>
                    )}
                  </div>

                  <input type="file" accept="image/*" onChange={handleSiteHeroChange} />
                </div>

                <div className="site-content-card">
                  <h3>Brand Story Photo</h3>
                  <p className="customer-info">
                    The round photo next to "Luxury doesn't need to shout" further
                    down the homepage. Use a square-ish photo - it's cropped into a
                    circle.
                  </p>

                  <div className="site-content-preview site-content-preview-round">
                    {siteBrandStoryPreview || siteSettings.brandStoryImageUrl ? (
                      <img
                        src={siteBrandStoryPreview || siteSettings.brandStoryImageUrl}
                        alt="Brand story preview"
                      />
                    ) : (
                      <span>No image uploaded yet</span>
                    )}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSiteBrandStoryChange}
                  />
                </div>
              </div>
            )}

            {siteContentMessage && (
              <p className="customer-info" style={{ marginTop: 16 }}>
                {siteContentMessage}
              </p>
            )}

            <button
              type="button"
              className="save-product-button"
              style={{ marginTop: 20 }}
              disabled={savingSiteContent || (!siteHeroFile && !siteBrandStoryFile)}
              onClick={saveSiteContent}
            >
              {savingSiteContent ? "SAVING..." : "SAVE CHANGES"}
            </button>
          </div>
        )}

        {activeTab === "products" && (
          <>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  Add New Product
                </h2>
              </div>
              <form
                onSubmit={addProduct}
              >
                <div className="product-form-grid">
                  <div className="form-group">
                    <label className="form-label">
                      Product Name *
                    </label>
                    <input
                      className="form-input"
                      value={name}
                      onChange={(event) =>
                        setName(
                          event.target.value
                        )
                      }
                      placeholder="Luxury Handbag"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Category *
                    </label>
                    <select
                      className="form-select"
                      value={category}
                      onChange={(event) =>
                        setCategory(
                          event.target.value
                        )
                      }
                    >
                      {categories.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                          >
                            {item}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Price *
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={price}
                      onChange={(event) =>
                        setPrice(
                          event.target.value
                        )
                      }
                      placeholder="2999"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Old Price
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={oldPrice}
                      onChange={(event) =>
                        setOldPrice(
                          event.target.value
                        )
                      }
                      placeholder="4499"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Stock *
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      value={stock}
                      onChange={(event) =>
                        setStock(
                          event.target.value
                        )
                      }
                      placeholder="10"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Colors
                    </label>
                    <input
                      className="form-input"
                      value={colors}
                      onChange={(event) =>
                        setColors(
                          event.target.value
                        )
                      }
                      placeholder="Black, Brown, White"
                    />
                  </div>
                  {parseColorList(colors).length > 1 && (
                    <div className="form-group full">
                      <label className="form-label">
                        Photos for each color (optional, recommended)
                      </label>
                      <p className="form-hint">
                        Upload one or more photos of the bag in each color - customers
                        will see these photos when they click that color on the
                        product page. Leave any color blank to just show the main
                        photos above for it.
                      </p>
                      <div className="color-photo-grid">
                        {parseColorList(colors).map((color) => {
                          const files = colorImageFiles[color] || [];
                          return (
                            <div className="color-photo-slot" key={color}>
                              <span className="color-photo-name">{color}</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(event) => {
                                  addColorImageFiles(color, event.target.files);
                                  event.target.value = "";
                                }}
                              />
                              {files.length > 0 ? (
                                <div className="color-photo-preview-list">
                                  {files.map((file, index) => (
                                    <div
                                      className="color-photo-preview-card"
                                      key={`${color}-${file.name}-${index}`}
                                    >
                                      <img
                                        className="color-photo-preview"
                                        src={URL.createObjectURL(file)}
                                        alt={`${color} preview ${index + 1}`}
                                      />
                                      <div className="image-reorder-row">
                                        <button
                                          type="button"
                                          className="image-reorder-button"
                                          onClick={() => moveColorImage(color, index, -1)}
                                          disabled={index === 0}
                                          title="Move earlier"
                                        >
                                          ◀
                                        </button>
                                        <button
                                          type="button"
                                          className="image-reorder-button"
                                          onClick={() => moveColorImage(color, index, 1)}
                                          disabled={index === files.length - 1}
                                          title="Move later"
                                        >
                                          ▶
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        className="image-remove-button"
                                        onClick={() => removeColorImage(color, index)}
                                        title="Remove this photo"
                                      >
                                        ✕ Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="color-photo-placeholder">No photo yet</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="form-group full">
                    <label className="form-label">
                      Description
                    </label>
                    <textarea
                      className="form-textarea"
                      rows="5"
                      value={description}
                      onChange={(event) =>
                        setDescription(
                          event.target.value
                        )
                      }
                      placeholder="Premium quality luxury product..."
                    />
                  </div>

                  <div className="form-group full">
                    <label className="form-label">
                      ✨ Product Detail Page Content (shown to customers on the product page)
                    </label>
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Key Features (one per line)</label>
                    <textarea
                      className="form-textarea"
                      rows="4"
                      value={keyFeatures}
                      onChange={(event) => setKeyFeatures(event.target.value)}
                      placeholder={"Genuine top-grain leather\nAdjustable & detachable strap\nFits a 14-inch laptop"}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dimensions</label>
                    <input
                      className="form-input"
                      value={dimensions}
                      onChange={(event) => setDimensions(event.target.value)}
                      placeholder="e.g. 32cm (W) x 28cm (H) x 12cm (D)"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Materials</label>
                    <input
                      className="form-input"
                      value={materials}
                      onChange={(event) => setMaterials(event.target.value)}
                      placeholder="e.g. Top-grain genuine leather, brass-tone hardware"
                    />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Care Instructions</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      value={careInstructions}
                      onChange={(event) => setCareInstructions(event.target.value)}
                      placeholder="Wipe with a soft dry cloth. Avoid water & direct sunlight."
                    />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Trust Signals (one per line, e.g. warranty/returns)</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      value={trustSignals}
                      onChange={(event) => setTrustSignals(event.target.value)}
                      placeholder={"100% Genuine Leather\n7-Day Easy Returns\n1-Year Warranty"}
                    />
                  </div>

                  <div className="form-group full">
                    <label className="form-label">
                      🔒 Supplier / Dropshipping Info (internal only - never shown to customers)
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Supplier Name</label>
                    <input
                      className="form-input"
                      value={supplierName}
                      onChange={(event) => setSupplierName(event.target.value)}
                      placeholder="e.g. AliExpress Seller XYZ"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Supplier Product ID</label>
                    <input
                      className="form-input"
                      value={supplierProductId}
                      onChange={(event) => setSupplierProductId(event.target.value)}
                      placeholder="Supplier's product code"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Supplier Cost (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={supplierCost}
                      onChange={(event) => setSupplierCost(event.target.value)}
                      placeholder="What you pay the supplier"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shipping Time</label>
                    <input
                      className="form-input"
                      value={shippingTime}
                      onChange={(event) => setShippingTime(event.target.value)}
                      placeholder="e.g. 7-12 days"
                    />
                  </div>

                  {supplierCost !== "" && (
                    <div className="form-group full margin-box">
                      <label className="form-label">Margin / Profit</label>
                      <div className="margin-row">
                        <input
                          className="form-input"
                          type="number"
                          value={marginValue}
                          onChange={(event) => setMarginValue(event.target.value)}
                          placeholder="e.g. 30"
                        />
                        <select
                          className="form-select"
                          value={marginType}
                          onChange={(event) => setMarginType(event.target.value)}
                        >
                          <option value="percent">% on cost</option>
                          <option value="fixed">₹ on cost</option>
                        </select>
                        <button
                          type="button"
                          className="margin-apply-button"
                          disabled={!marginValue}
                          onClick={() =>
                            setPrice(
                              String(computeSellingPriceFromMargin(supplierCost, marginValue, marginType))
                            )
                          }
                        >
                          Fill Price
                        </button>
                      </div>
                      {price !== "" && (
                        <p className="margin-profit-line">
                          {(() => {
                            const { profit, percent } = computeProfit(price, supplierCost);
                            return `Selling at ${formatMoney(price)} → profit ${formatMoney(profit)} (${percent.toFixed(0)}% on cost)`;
                          })()}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="form-group full">
                    <label className="form-label">Supplier Link</label>
                    <input
                      className="form-input"
                      value={supplierLink}
                      onChange={(event) => setSupplierLink(event.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="form-group full">
                    <label className="form-label">
                      Product Images *
                    </label>
                    <input
                      className="form-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={
                        handleImagesChange
                      }
                    />
                    {images.length > 0 && (
                      <div className="image-preview">
                        {images.map(
                          (
                            file,
                            index
                          ) => (
                            <div
                              className="image-preview-card"
                              key={`${file.name}-${index}`}
                            >
                              <img
                                src={URL.createObjectURL(
                                  file
                                )}
                                alt={`Preview ${
                                  index + 1
                                }`}
                              />
                              <span className="image-number">
                                Image{" "}
                                {index + 1}
                                {index === 0 ? " (main)" : ""}
                              </span>
                              <div className="image-reorder-row">
                                <button
                                  type="button"
                                  className="image-reorder-button"
                                  onClick={() => moveImage(index, -1)}
                                  disabled={index === 0}
                                  title="Move earlier"
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  className="image-reorder-button"
                                  onClick={() => moveImage(index, 1)}
                                  disabled={index === images.length - 1}
                                  title="Move later"
                                >
                                  ▶
                                </button>
                              </div>
                              <button
                                type="button"
                                className="image-remove-button"
                                onClick={() => removeImage(index)}
                                title="Remove this image"
                              >
                                ✕ Remove
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="add-button"
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "UPLOADING..."
                    : "ADD PRODUCT"}
                </button>
                {message && (
                  <div className="success-message">
                    {message}
                  </div>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Get Image Links for Your CSV</h2>
              </div>
              <p className="form-hint">
                Your bulk CSV needs a public link for each photo, not an uploaded file. If you
                already have your product photos ready (however you made them), upload them here
                and get back a link for each one to paste into that product's "Image URLs" column
                - no AI, nothing generated, just hosting your own photos so they have a link.
              </p>

              <div className="bulk-upload-actions">
                <label className="secondary-button bulk-file-label">
                  🖼 Choose Photo(s)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleManualFilesChange}
                    hidden
                  />
                </label>
                {manualFiles.length > 0 && (
                  <span className="bulk-file-name">
                    {manualFiles.length} photo{manualFiles.length === 1 ? "" : "s"} selected
                  </span>
                )}
                <button
                  type="button"
                  className="add-button"
                  disabled={manualFiles.length === 0 || manualUploading}
                  onClick={uploadManualPhotos}
                >
                  {manualUploading ? "UPLOADING..." : "UPLOAD & GET LINKS"}
                </button>
              </div>

              {manualUploadError && <div className="error-message">{manualUploadError}</div>}

              <p className="form-hint" style={{ marginTop: 22 }}>
                Don't have photos ready yet? This optional tool can generate 4 premium studio
                shots plus 1 lifestyle shot from one real photo using AI (uses your Gemini API
                usage on Render, separate from this site's own cost) - only use it if you want
                that.
              </p>

              <div className="bulk-upload-actions">
                <label className="secondary-button bulk-file-label">
                  📷 Choose Source Photo
                  <input type="file" accept="image/*" onChange={handleAiSourceFileChange} hidden />
                </label>
                {aiSourceFile && <span className="bulk-file-name">{aiSourceFile.name}</span>}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!aiSourceFile || aiGenerating}
                  onClick={generateAiPhotos}
                >
                  {aiGenerating ? "GENERATING..." : "✨ GENERATE PREMIUM PHOTOS (AI)"}
                </button>
              </div>

              {aiGenerateError && <div className="error-message">{aiGenerateError}</div>}

              {aiGeneratedImages.length > 0 && (
                <>
                  <div className="ai-photo-grid">
                    {aiGeneratedImages.map((image, index) => (
                      <div
                        key={image.id}
                        className={`ai-photo-card${image.selected ? " ai-photo-selected" : ""}`}
                      >
                        {image.success ? (
                          <>
                            <img src={image.dataUrl} alt={labelForAiImage(image, index)} />
                            <label className="ai-photo-check">
                              <input
                                type="checkbox"
                                checked={image.selected}
                                onChange={() => toggleAiImageSelected(image.id)}
                              />
                              {labelForAiImage(image, index)}
                            </label>
                          </>
                        ) : (
                          <div className="ai-photo-failed">
                            <span>⚠ {labelForAiImage(image, index)}</span>
                            <p>{image.message || "Could not generate this shot."}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="bulk-upload-actions">
                    <button
                      type="button"
                      className="add-button"
                      disabled={aiSaving || aiGeneratedImages.every((image) => !image.selected)}
                      onClick={saveSelectedAiPhotos}
                    >
                      {aiSaving ? "SAVING..." : "SAVE SELECTED PHOTOS"}
                    </button>
                  </div>
                </>
              )}

              {aiHistory.length > 0 && (
                <div className="ai-history">
                  <p className="bulk-summary-line">Saved photo links (newest first)</p>
                  {aiHistory.map((entry) => (
                    <div className="ai-history-row" key={entry.id}>
                      {entry.thumbnail && <img src={entry.thumbnail} alt="" />}
                      <div className="ai-history-info">
                        <strong>{entry.sourceFileName}</strong>
                        <span>{entry.urls.length} photo{entry.urls.length === 1 ? "" : "s"} saved</span>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => copyAiUrls(entry.id, entry.urls)}
                      >
                        {aiCopiedId === entry.id ? "✅ Copied!" : "📋 Copy for CSV"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Bulk Upload Products (CSV)</h2>
              </div>
              <p className="form-hint">
                Add many products at once from a CSV file instead of filling the form above one
                by one. Each row needs a product name, a price, and at least one image URL (a
                real public photo link - a spreadsheet cell can't hold an uploaded photo file
                directly, so paste a link to each photo instead, for example from your supplier's
                page or a photo you've already uploaded). The optional "Color Images" column lets
                one or more photos show for each color - format each cell as
                "Black=&lt;link1&gt;,&lt;link2&gt;|Brown=&lt;link1&gt;" (color name, then "=",
                then that color's photo link(s) separated by commas if there's more than one;
                "|" between colors). "Supplier Name", "Supplier Cost", "Supplier
                Product ID", "Supplier Link" and "Shipping Time" are optional, admin-only fields
                (never shown to customers) for tracking dropshipping details - same as the single
                form's Supplier section above. If you leave "Price" blank, filling in "Supplier
                Cost" and "Margin %" calculates it for you automatically (cost plus that % on
                top), just like the "Fill Price" button in the form above. Safe to re-run: if a
                row's product name (or Supplier Product ID) already exists on the site, it's
                automatically skipped instead of being added again - so you can keep adding new
                rows to the same sheet/file and re-import it anytime without creating duplicates.
              </p>

              <div className="quick-add-section">
                <p className="quick-add-label">
                  ✨ Quick Add with AI - paste product details however you have them (name, price,
                  colors, image links, description - copied from WhatsApp, a supplier list,
                  anything) and AI will read it and add row(s) below for you to review. It only
                  uses image links that are actually in your text - it never makes up a photo link.
                </p>
                <textarea
                  className="quick-add-textarea"
                  rows={5}
                  placeholder={
                    "Example:\nBrown Tote Bag, price 1499, colors Brown and Black\nBrown photo: https://...\nBlack photo: https://...\nSpacious everyday tote with adjustable strap."
                  }
                  value={quickAddText}
                  onChange={(event) => setQuickAddText(event.target.value)}
                />
                <div className="bulk-upload-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={quickAddParseProducts}
                    disabled={quickAddParsing}
                  >
                    {quickAddParsing ? "Reading..." : "✨ Add to Preview with AI"}
                  </button>
                </div>
              </div>

              <p className="bulk-or-divider">— or import from a Google Sheet —</p>

              <div className="sheet-import-row">
                <input
                  type="text"
                  className="sheet-import-input"
                  placeholder="Paste your Google Sheet's published CSV link here"
                  value={sheetUrl}
                  onChange={(event) => setSheetUrl(event.target.value)}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={importFromGoogleSheet}
                  disabled={sheetImporting}
                >
                  {sheetImporting ? "Importing..." : "📥 Import from Google Sheet"}
                </button>
              </div>
              <p className="form-hint">
                To get this link: in your Google Sheet go to File → Share → Publish to web, choose
                the sheet and "Comma-separated values (.csv)", click Publish, then copy the link
                shown and paste it above. The sheet needs the exact same columns as the CSV
                template below (download it once to see the column names). Every click on
                "Import from Google Sheet" re-reads the sheet fresh - so update the sheet, click
                this again, and the new rows show up below, no downloading or uploading a file
                needed.
              </p>
              <p className="bulk-or-divider">— or upload a CSV file instead —</p>

              <div className="bulk-upload-actions">
                <button type="button" className="secondary-button" onClick={downloadBulkTemplate}>
                  ⬇ Download CSV Template
                </button>
                <label className="secondary-button bulk-file-label">
                  📄 Choose CSV File
                  <input type="file" accept=".csv,text/csv" onChange={handleBulkFileChange} hidden />
                </label>
                {bulkFileName && <span className="bulk-file-name">{bulkFileName}</span>}
              </div>

              {bulkParseError && <div className="error-message">{bulkParseError}</div>}

              {bulkRows.length > 0 && (
                <>
                  <p className="bulk-summary-line">
                    {bulkRows.filter((row) => row.valid).length} of {bulkRows.length} row
                    {bulkRows.length === 1 ? "" : "s"} ready to upload
                    {bulkRows.some((row) => !row.valid) &&
                      ` - ${bulkRows.filter((row) => !row.valid).length} need fixing (see below)`}
                    .
                  </p>
                  <div className="bulk-preview-table-wrap">
                    <table className="bulk-preview-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Cost</th>
                          <th>Stock</th>
                          <th>Images</th>
                          <th>Color Photos</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row) => (
                          <tr key={row.rowNumber} className={row.valid ? "" : "bulk-row-error"}>
                            <td>{row.rowNumber}</td>
                            <td>{row.name || "—"}</td>
                            <td>{row.category}</td>
                            <td>{Number.isFinite(row.price) ? formatMoney(row.price) : "—"}</td>
                            <td>{Number.isFinite(row.supplierCost) ? formatMoney(row.supplierCost) : "—"}</td>
                            <td>{row.stock}</td>
                            <td>{row.images.length}</td>
                            <td>
                              {Object.keys(row.colorImages || {}).length > 0
                                ? `${Object.keys(row.colorImages).length} of ${row.colors.length}`
                                : "—"}
                            </td>
                            <td>
                              {row.valid ? (
                                <span className="bulk-status-ok">
                                  ✅ Ready
                                  {row.warnings?.length > 0 && (
                                    <span className="bulk-status-warning"> ⚠ {row.warnings.join(" ")}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="bulk-status-error">⚠ {row.errors.join(" ")}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bulk-upload-actions">
                    <button
                      type="button"
                      className="add-button"
                      disabled={bulkUploading || bulkRows.every((row) => !row.valid)}
                      onClick={bulkUploadProducts}
                    >
                      {bulkUploading
                        ? "UPLOADING..."
                        : `UPLOAD ${bulkRows.filter((row) => row.valid).length} PRODUCT${
                            bulkRows.filter((row) => row.valid).length === 1 ? "" : "S"
                          }`}
                    </button>
                    <button type="button" className="secondary-button" onClick={resetBulkUpload}>
                      Clear
                    </button>
                  </div>
                </>
              )}

              {bulkResults && (
                <div className={bulkResults.success ? "success-message" : "error-message"}>
                  {bulkResults.success ? (
                    <>
                      <p>
                        ✅ Added {bulkResults.addedCount} product{bulkResults.addedCount === 1 ? "" : "s"}
                        {bulkResults.skippedCount > 0 &&
                          `, ${bulkResults.skippedCount} already existed (skipped, not added again)`}
                        {bulkResults.failedCount > 0 &&
                          `, ${bulkResults.failedCount} failed (see reasons below)`}
                        .
                      </p>
                      {(bulkResults.failedCount > 0 || bulkResults.skippedCount > 0) && (
                        <ul className="bulk-fail-list">
                          {bulkResults.results
                            .filter((result) => !result.success)
                            .map((result) => (
                              <li key={result.row}>
                                Row {result.row} ({result.name}): {result.message}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p>{bulkResults.errorMessage || "Bulk upload failed."}</p>
                  )}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  Existing Products
                </h2>
                <input
                  className="search-input"
                  value={productSearch}
                  onChange={(event) =>
                    setProductSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search products..."
                />
              </div>
              {loadingProducts ? (
                <div className="empty-state">
                  Loading products...
                </div>
              ) : filteredProducts.length ===
                0 ? (
                <div className="empty-state">
                  No products found.
                </div>
              ) : (
                <div className="product-grid">
                  {filteredProducts.map(
                    (product) => {
                      const productImages =
                        getProductImages(
                          product
                        );
                      return (
                        <div
                          className="product-card"
                          key={product.id}
                        >
                          {productImages.length >
                          0 ? (
                            <img
                              className="product-image"
                              src={getImageUrl(
                                productImages[0]
                              )}
                              alt={
                                product.name
                              }
                            />
                          ) : (
                            <div className="product-image" />
                          )}
                          <div className="product-info">
                            <h3>
                              {product.name}
                            </h3>
                            <span
                              className={`status-badge status-${product.status || "published"}`}
                            >
                              {getStatusLabel(product.status)}
                            </span>
                            <div className="product-category">
                              {
                                product.category
                              }
                            </div>
                            <div className="product-price">
                              {formatMoney(
                                product.price
                              )}
                            </div>
                            <div className="customer-info">
                              Stock:{" "}
                              {product.stock ?? 0}
                            </div>
                            <div className="customer-info">
                              Images:{" "}
                              {
                                productImages.length
                              }
                            </div>
                            {(product.supplierName || product.supplierCost) && (
                              <div className="supplier-info-box">
                                <strong>SUPPLIER (internal)</strong>
                                {product.supplierName && <div>{product.supplierName}</div>}
                                {product.supplierCost !== null &&
                                  product.supplierCost !== undefined && (
                                    <>
                                      <div>Cost: {formatMoney(product.supplierCost)}</div>
                                      {(() => {
                                        const { profit, percent } = computeProfit(
                                          product.price,
                                          product.supplierCost
                                        );
                                        return (
                                          <div>
                                            Profit: {formatMoney(profit)} ({percent.toFixed(0)}%)
                                          </div>
                                        );
                                      })()}
                                    </>
                                  )}
                                {product.shippingTime && <div>Ships in: {product.shippingTime}</div>}
                              </div>
                            )}
                          </div>
                          <div className="product-actions">
                            {product.status !== "published" && (
                              <button
                                type="button"
                                className="status-action-button publish"
                                onClick={() =>
                                  updateProductStatus(product, "published")
                                }
                              >
                                ✅ PUBLISH
                              </button>
                            )}
                            {product.status === "draft" && (
                              <button
                                type="button"
                                className="status-action-button"
                                onClick={() =>
                                  updateProductStatus(product, "review")
                                }
                              >
                                👀 MOVE TO REVIEW
                              </button>
                            )}
                            {product.status === "published" && (
                              <button
                                type="button"
                                className="status-action-button"
                                onClick={() =>
                                  updateProductStatus(product, "draft")
                                }
                              >
                                ⏸️ UNPUBLISH
                              </button>
                            )}
                            <button
                              type="button"
                              className="edit-product-button"
                              onClick={() =>
                                openEditProduct(
                                  product
                                )
                              }
                            >
                              ✏️ EDIT
                            </button>
                            <button
                              type="button"
                              className="delete-product-button"
                              onClick={() =>
                                deleteProduct(
                                  product
                                )
                              }
                            >
                              🗑️ DELETE
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
      {selectedOrder && (
        <div
          className="modal-overlay"
          onClick={() =>
            setSelectedOrder(null)
          }
        >
          <div
            className="order-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-top">
              <div>
                <h2 className="panel-title">
                  Order #
                  {getOrderId(
                    selectedOrder
                  )}
                </h2>
                <p className="customer-info">
                  {formatDate(
                    selectedOrder?.createdAt ||
                      selectedOrder?.date ||
                      selectedOrder?.orderDate
                  )}
                </p>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() =>
                  setSelectedOrder(null)
                }
              >
                ×
              </button>
            </div>
            <div className="detail-grid">
              <div className="detail-box">
                <div className="detail-label">
                  Customer Name
                </div>
                <div className="detail-value">
                  {getCustomerName(
                    selectedOrder
                  )}
                </div>
              </div>
              <div className="detail-box">
                <div className="detail-label">
                  Mobile
                </div>
                <div className="detail-value">
                  {getCustomerMobile(
                    selectedOrder
                  )}
                </div>
              </div>
              <div className="detail-box">
                <div className="detail-label">
                  Email
                </div>
                <div className="detail-value">
                  {getCustomerEmail(
                    selectedOrder
                  )}
                </div>
              </div>
              <div className="detail-box">
                <div className="detail-label">
                  Payment Method
                </div>
                <div className="detail-value">
                  {selectedOrder?.paymentMethod ||
                    selectedOrder?.payment_method ||
                    selectedOrder?.payment?.method ||
                    "—"}
                </div>
              </div>
              <div className="detail-box">
                <div className="detail-label">
                  Address
                </div>
                <div className="detail-value">
                  {getCustomerAddress(
                    selectedOrder
                  )}
                </div>
              </div>
              <div className="detail-box">
                <div className="detail-label">
                  Total Amount
                </div>
                <div className="detail-value">
                  {formatMoney(
                    selectedOrder?.totalAmount ??
                      selectedOrder?.total ??
                      selectedOrder?.grandTotal ??
                      selectedOrder?.amount ??
                      0
                  )}
                </div>
              </div>
            </div>
            <h3>
              Order Status
            </h3>
            <div className="status-controls">
              <select
                className="status-select"
                value={getOrderStatus(
                  selectedOrder
                )}
                disabled={savingStatus}
                onChange={(event) =>
                  updateOrderStatus(
                    selectedOrder,
                    event.target.value
                  )
                }
              >
                {ORDER_STATUSES.map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {status}
                    </option>
                  )
                )}
              </select>
              {savingStatus && (
                <span>
                  Saving...
                </span>
              )}
            </div>

            <h3>
              Shipping / Courier Details
            </h3>
            <p className="form-hint">
              Customer ka "Track Order" page yahi dikhaega - jab courier ko order de do, ye bhar do.
            </p>
            <div className="shipping-grid">
              <div className="form-group">
                <label className="form-label">
                  Courier Name
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Delhivery"
                  value={shipCourier}
                  onChange={(event) =>
                    setShipCourier(event.target.value)
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Tracking Number
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. DL998877665"
                  value={shipTrackingNumber}
                  onChange={(event) =>
                    setShipTrackingNumber(event.target.value)
                  }
                />
              </div>
              <div className="form-group full">
                <label className="form-label">
                  Tracking Link
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="https://www.delhivery.com/track/..."
                  value={shipTrackingUrl}
                  onChange={(event) =>
                    setShipTrackingUrl(event.target.value)
                  }
                />
              </div>
            </div>
            <button
              type="button"
              className="add-button"
              disabled={savingShipping}
              onClick={() => updateOrderShipping(selectedOrder)}
            >
              {savingShipping ? "Saving..." : "Save Shipping Info"}
            </button>

            <h3>
              Order Items
            </h3>
            {getOrderItems(
              selectedOrder
            ).length === 0 ? (
              <div className="empty-state">
                No item details available.
              </div>
            ) : (
              <div className="orders-table-wrap">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>
                        Product
                      </th>
                      <th>
                        Quantity
                      </th>
                      <th>
                        Price
                      </th>
                      <th>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getOrderItems(
                      selectedOrder
                    ).map(
                      (
                        item,
                        index
                      ) => {
                        const quantity =
                          getItemQuantity(
                            item
                          );
                        const price =
                          getItemPrice(
                            item
                          );
                        return (
                          <tr
                            key={index}
                          >
                            <td>
                              {getItemName(
                                item
                              )}
                            </td>
                            <td>
                              {quantity}
                            </td>
                            <td>
                              {formatMoney(
                                price
                              )}
                            </td>
                            <td>
                              {formatMoney(
                                price *
                                  quantity
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {editingProduct && (
        <div
          className="modal-overlay"
          onClick={closeEditProduct}
        >
          <div
            className="product-edit-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-top">
              <div>
                <h2 className="edit-modal-title">
                  Edit Product
                </h2>
                <p className="customer-info">
                  Update product details
                </p>
              </div>
              <button
                className="close-button"
                type="button"
                disabled={editingLoading}
                onClick={closeEditProduct}
              >
                ×
              </button>
            </div>
            <form
              onSubmit={updateProduct}
            >
              <div className="product-form-grid">
                <div className="form-group">
                  <label className="form-label">
                    Product Name *
                  </label>
                  <input
                    className="form-input"
                    value={editName}
                    onChange={(event) =>
                      setEditName(
                        event.target.value
                      )
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Category *
                  </label>
                  <select
                    className="form-select"
                    value={editCategory}
                    onChange={(event) =>
                      setEditCategory(
                        event.target.value
                      )
                    }
                  >
                    {categories.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Price *
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    value={editPrice}
                    onChange={(event) =>
                      setEditPrice(
                        event.target.value
                      )
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Old Price
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    value={editOldPrice}
                    onChange={(event) =>
                      setEditOldPrice(
                        event.target.value
                      )
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Stock *
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    value={editStock}
                    onChange={(event) =>
                      setEditStock(
                        event.target.value
                      )
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Colors
                  </label>
                  <input
                    className="form-input"
                    value={editColors}
                    onChange={(event) =>
                      setEditColors(
                        event.target.value
                      )
                    }
                    placeholder="Black, Brown, White"
                  />
                </div>
                {parseColorList(editColors).length > 1 && (
                  <div className="form-group full">
                    <label className="form-label">
                      Photos for each color (optional, recommended)
                    </label>
                    <p className="form-hint">
                      Each color can have several photos. Remove any existing
                      photo with its ✕, and/or add new ones below - customers see
                      these when they click that color on the product page.
                      Colors with no photo just show the main photos above.
                    </p>
                    <div className="color-photo-grid">
                      {parseColorList(editColors).map((color) => {
                        const existingUrls = editExistingColorImages[color] || [];
                        const newFiles = editColorImageFiles[color] || [];
                        return (
                          <div className="color-photo-slot" key={color}>
                            <span className="color-photo-name">{color}</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(event) => {
                                addEditColorImageFiles(color, event.target.files);
                                event.target.value = "";
                              }}
                            />
                            {existingUrls.length === 0 && newFiles.length === 0 && (
                              <div className="color-photo-placeholder">No photo yet</div>
                            )}
                            {existingUrls.length > 0 && (
                              <div className="color-photo-preview-list">
                                {existingUrls.map((url, index) => (
                                  <div className="color-photo-preview-card" key={`${color}-existing-${url}-${index}`}>
                                    <img
                                      className="color-photo-preview"
                                      src={getImageUrl(url)}
                                      alt={`${color} photo ${index + 1}`}
                                    />
                                    <span className="color-photo-existing-tag">Saved</span>
                                    <button
                                      type="button"
                                      className="image-remove-button"
                                      onClick={() => removeEditExistingColorImage(color, index)}
                                      title="Remove this saved photo"
                                    >
                                      ✕ Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {newFiles.length > 0 && (
                              <div className="color-photo-preview-list">
                                {newFiles.map((file, index) => (
                                  <div
                                    className="color-photo-preview-card"
                                    key={`${color}-new-${file.name}-${index}`}
                                  >
                                    <img
                                      className="color-photo-preview"
                                      src={URL.createObjectURL(file)}
                                      alt={`${color} new photo ${index + 1}`}
                                    />
                                    <span className="color-photo-new-tag">New</span>
                                    <div className="image-reorder-row">
                                      <button
                                        type="button"
                                        className="image-reorder-button"
                                        onClick={() => moveEditColorImage(color, index, -1)}
                                        disabled={index === 0}
                                        title="Move earlier"
                                      >
                                        ◀
                                      </button>
                                      <button
                                        type="button"
                                        className="image-reorder-button"
                                        onClick={() => moveEditColorImage(color, index, 1)}
                                        disabled={index === newFiles.length - 1}
                                        title="Move later"
                                      >
                                        ▶
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      className="image-remove-button"
                                      onClick={() => removeEditColorImage(color, index)}
                                      title="Remove this new photo"
                                    >
                                      ✕ Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="form-group full">
                  <label className="form-label">
                    Description
                  </label>
                  <textarea
                    className="form-textarea"
                    rows="5"
                    value={editDescription}
                    onChange={(event) =>
                      setEditDescription(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="form-group full">
                  <label className="form-label">
                    ✨ Product Detail Page Content (shown to customers on the product page)
                  </label>
                </div>
                <div className="form-group full">
                  <label className="form-label">Key Features (one per line)</label>
                  <textarea
                    className="form-textarea"
                    rows="4"
                    value={editKeyFeatures}
                    onChange={(event) => setEditKeyFeatures(event.target.value)}
                    placeholder={"Genuine top-grain leather\nAdjustable & detachable strap\nFits a 14-inch laptop"}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dimensions</label>
                  <input
                    className="form-input"
                    value={editDimensions}
                    onChange={(event) => setEditDimensions(event.target.value)}
                    placeholder="e.g. 32cm (W) x 28cm (H) x 12cm (D)"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Materials</label>
                  <input
                    className="form-input"
                    value={editMaterials}
                    onChange={(event) => setEditMaterials(event.target.value)}
                    placeholder="e.g. Top-grain genuine leather, brass-tone hardware"
                  />
                </div>
                <div className="form-group full">
                  <label className="form-label">Care Instructions</label>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    value={editCareInstructions}
                    onChange={(event) => setEditCareInstructions(event.target.value)}
                    placeholder="Wipe with a soft dry cloth. Avoid water & direct sunlight."
                  />
                </div>
                <div className="form-group full">
                  <label className="form-label">Trust Signals (one per line)</label>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    value={editTrustSignals}
                    onChange={(event) => setEditTrustSignals(event.target.value)}
                    placeholder={"100% Genuine Leather\n7-Day Easy Returns\n1-Year Warranty"}
                  />
                </div>

                <div className="form-group full">
                  <label className="form-label">
                    🔒 Supplier / Dropshipping Info (internal only)
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier Name</label>
                  <input
                    className="form-input"
                    value={editSupplierName}
                    onChange={(event) => setEditSupplierName(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier Product ID</label>
                  <input
                    className="form-input"
                    value={editSupplierProductId}
                    onChange={(event) => setEditSupplierProductId(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier Cost (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={editSupplierCost}
                    onChange={(event) => setEditSupplierCost(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Shipping Time</label>
                  <input
                    className="form-input"
                    value={editShippingTime}
                    onChange={(event) => setEditShippingTime(event.target.value)}
                  />
                </div>

                {editSupplierCost !== "" && (
                  <div className="form-group full margin-box">
                    <label className="form-label">Margin / Profit</label>
                    <div className="margin-row">
                      <input
                        className="form-input"
                        type="number"
                        value={editMarginValue}
                        onChange={(event) => setEditMarginValue(event.target.value)}
                        placeholder="e.g. 30"
                      />
                      <select
                        className="form-select"
                        value={editMarginType}
                        onChange={(event) => setEditMarginType(event.target.value)}
                      >
                        <option value="percent">% on cost</option>
                        <option value="fixed">₹ on cost</option>
                      </select>
                      <button
                        type="button"
                        className="margin-apply-button"
                        disabled={!editMarginValue}
                        onClick={() =>
                          setEditPrice(
                            String(
                              computeSellingPriceFromMargin(editSupplierCost, editMarginValue, editMarginType)
                            )
                          )
                        }
                      >
                        Fill Price
                      </button>
                    </div>
                    {editPrice !== "" && (
                      <p className="margin-profit-line">
                        {(() => {
                          const { profit, percent } = computeProfit(editPrice, editSupplierCost);
                          return `Selling at ${formatMoney(editPrice)} → profit ${formatMoney(profit)} (${percent.toFixed(0)}% on cost)`;
                        })()}
                      </p>
                    )}
                  </div>
                )}

                <div className="form-group full">
                  <label className="form-label">Supplier Link</label>
                  <input
                    className="form-input"
                    value={editSupplierLink}
                    onChange={(event) => setEditSupplierLink(event.target.value)}
                  />
                </div>

                <div className="form-group full">
                  <label className="form-label">
                    Replace Product Images
                  </label>
                  <input
                    className="form-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={
                      handleEditImagesChange
                    }
                  />
                  <div className="customer-info">
                    Leave empty to keep the
                    existing images.
                  </div>
                  {editImages.length > 0 && (
                    <div className="image-preview">
                      {editImages.map(
                        (
                          file,
                          index
                        ) => (
                          <div
                            className="image-preview-card"
                            key={`${file.name}-${index}`}
                          >
                            <img
                              src={URL.createObjectURL(
                                file
                              )}
                              alt={`Edit Preview ${
                                index + 1
                              }`}
                            />
                            <span className="image-number">
                              New Image{" "}
                              {index + 1}
                              {index === 0 ? " (main)" : ""}
                            </span>
                            <div className="image-reorder-row">
                              <button
                                type="button"
                                className="image-reorder-button"
                                onClick={() => moveEditImage(index, -1)}
                                disabled={index === 0}
                                title="Move earlier"
                              >
                                ◀
                              </button>
                              <button
                                type="button"
                                className="image-reorder-button"
                                onClick={() => moveEditImage(index, 1)}
                                disabled={index === editImages.length - 1}
                                title="Move later"
                              >
                                ▶
                              </button>
                            </div>
                            <button
                              type="button"
                              className="image-remove-button"
                              onClick={() => removeEditImage(index)}
                              title="Remove this image"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="edit-modal-actions">
                <button
                  type="button"
                  className="cancel-product-button"
                  disabled={editingLoading}
                  onClick={
                    closeEditProduct
                  }
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="save-product-button"
                  disabled={editingLoading}
                >
                  {editingLoading
                    ? "SAVING..."
                    : "SAVE CHANGES"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
