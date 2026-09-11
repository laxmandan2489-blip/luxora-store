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

/* =====================================================
   MEESHO / SUPPLIER IMPORTER helpers
   ===================================================== */
const IMPORT_DESCRIPTION_TEMPLATE = `Highlights:
-

Material:
-

Size:
-

What's Included:
-

Shipping & Returns:
- Ships in 5-9 days. Easy 7-day returns.`;

function calcSellingPrice(costPrice, margin, marginType) {
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
  const [colors, setColors] =
    useState("Black");
  const [images, setImages] =
    useState([]);
  const [loading, setLoading] =
    useState(false);
  const [message, setMessage] =
    useState("");

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
  const [editColors, setEditColors] =
    useState("");
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

  /* =====================================================
     MEESHO / SUPPLIER IMPORT (new "Import Product" tab)
     Nothing here goes live automatically - every import lands
     as a "draft" until you deliberately publish it.
     ===================================================== */
  const [importSourceUrl, setImportSourceUrl] = useState("");
  const [importImages, setImportImages] = useState([]);
  const [importName, setImportName] = useState("");
  const [importCategory, setImportCategory] = useState(categories[0]);
  const [importCostPrice, setImportCostPrice] = useState("");
  const [importMarginType, setImportMarginType] = useState("fixed");
  const [importMargin, setImportMargin] = useState("");
  const [importColors, setImportColors] = useState("Black");
  const [importStock, setImportStock] = useState("");
  const [importDescription, setImportDescription] = useState(IMPORT_DESCRIPTION_TEMPLATE);
  const [importingProduct, setImportingProduct] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  // Images auto-fetched by URL (either from "Fetch from Link" or a
  // pasted "Copy Image Address" link) — stored as already-uploaded
  // Supabase Storage URLs, separate from importImages (raw files
  // picked with the file input below).
  const [importFetchedImages, setImportFetchedImages] = useState([]);
  const [importPasteImageUrl, setImportPasteImageUrl] = useState("");
  const [fetchingFromLink, setFetchingFromLink] = useState(false);
  const [fetchingImageUrl, setFetchingImageUrl] = useState(false);
  const [fetchLinkMessage, setFetchLinkMessage] = useState("");
  const [generatingPremium, setGeneratingPremium] = useState(false);
  const [premiumMessage, setPremiumMessage] = useState("");
  // AI product photography (4 premium shots + 1 lifestyle shot),
  // generated from one real source photo. Nothing is uploaded to
  // Supabase until the admin picks which generated images to keep.
  const [aiSourceFile, setAiSourceFile] = useState(null);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [aiGeneratedImages, setAiGeneratedImages] = useState([]);
  const [aiImagesMessage, setAiImagesMessage] = useState("");
  const [savingSelectedImages, setSavingSelectedImages] = useState(false);

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

  function handleImportImagesChange(event) {
    setImportImages(Array.from(event.target.files || []));
  }

  function resetImportForm() {
    setImportSourceUrl("");
    setImportImages([]);
    setImportName("");
    setImportCategory(categories[0]);
    setImportCostPrice("");
    setImportMarginType("fixed");
    setImportMargin("");
    setImportColors("Black");
    setImportStock("");
    setImportDescription(IMPORT_DESCRIPTION_TEMPLATE);
    setImportFetchedImages([]);
    setImportPasteImageUrl("");
    setFetchLinkMessage("");
    setPremiumMessage("");
    setAiSourceFile(null);
    setAiGeneratedImages([]);
    setAiImagesMessage("");
  }

  /*
   * Best-effort auto-fill: tries to read the pasted link's public
   * title/description/image (the same info WhatsApp/Google would
   * show as a link preview). Many supplier sites — Meesho included
   * — block automated requests, so this can fail; when it does,
   * it says so plainly and you just fill the fields in yourself.
   * It never overwrites anything you've already typed.
   */
  async function fetchFromLink() {
    if (!importSourceUrl.trim()) {
      setFetchLinkMessage("Paste the product link first.");
      return;
    }
    setFetchingFromLink(true);
    setFetchLinkMessage("");
    try {
      const response = await adminFetch(`${API}/api/admin/products/fetch-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importSourceUrl.trim() }),
      });
      const data = await response.json();
      if (!data.success) {
        setFetchLinkMessage(data.message || "Couldn't auto-fill from this link — please fill the fields manually.");
        return;
      }
      if (data.title && !importName.trim()) setImportName(data.title);
      if (data.description && importDescription === IMPORT_DESCRIPTION_TEMPLATE) {
        setImportDescription(data.description);
      }
      if (data.image) {
        await fetchImageFromUrl(data.image);
      }
      setFetchLinkMessage("Auto-filled from the link — please review everything below before publishing.");
    } catch (error) {
      setFetchLinkMessage(error.message || "Couldn't auto-fill from this link — please fill the fields manually.");
    } finally {
      setFetchingFromLink(false);
    }
  }

  /*
   * Downloads one image from a direct image URL (e.g. right-click
   * → "Copy Image Address" on a Meesho photo) into Supabase
   * Storage. Used both by fetchFromLink() above and by the manual
   * "paste image link" box in the Import tab.
   */
  async function fetchImageFromUrl(imageUrl) {
    if (!imageUrl || !imageUrl.trim()) return;
    setFetchingImageUrl(true);
    setFetchLinkMessage("");
    try {
      const response = await adminFetch(`${API}/api/admin/products/fetch-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: imageUrl.trim() }),
      });
      const data = await response.json();
      if (!data.success) {
        setFetchLinkMessage(data.message || "Couldn't download that image — please upload it as a file instead.");
        return;
      }
      setImportFetchedImages((prev) => (prev.includes(data.url) ? prev : [...prev, data.url]));
    } catch (error) {
      setFetchLinkMessage(error.message || "Couldn't download that image.");
    } finally {
      setFetchingImageUrl(false);
    }
  }

  async function addPastedImageUrl() {
    await fetchImageFromUrl(importPasteImageUrl);
    setImportPasteImageUrl("");
  }

  function removeFetchedImage(url) {
    setImportFetchedImages((prev) => prev.filter((item) => item !== url));
  }

  /*
   * Sends whatever is currently in the title/description fields
   * (auto-fetched or typed by hand) to the AI writer, which
   * returns a SHRIMOH-branded premium version specific to THIS
   * product — not a generic template. Requires ANTHROPIC_API_KEY
   * to be configured on the backend.
   */
  async function generatePremiumContent() {
    if (!importName.trim() && importDescription.trim() === IMPORT_DESCRIPTION_TEMPLATE.trim()) {
      setPremiumMessage("Paste or fetch a title/description first, then generate.");
      return;
    }
    setGeneratingPremium(true);
    setPremiumMessage("");
    try {
      const response = await adminFetch(`${API}/api/admin/products/generate-premium`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: importName,
          description: importDescription === IMPORT_DESCRIPTION_TEMPLATE ? "" : importDescription,
          category: importCategory,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        setPremiumMessage(data.message || "AI content generation failed.");
        return;
      }
      if (data.title) setImportName(data.title);
      if (data.description) setImportDescription(data.description);
      setPremiumMessage("Premium content generated — review and edit anything before publishing.");
    } catch (error) {
      setPremiumMessage(error.message || "AI content generation failed.");
    } finally {
      setGeneratingPremium(false);
    }
  }

  function handleAiSourceFileChange(event) {
    setAiSourceFile(event.target.files?.[0] || null);
    setAiGeneratedImages([]);
    setAiImagesMessage("");
  }

  /*
   * Sends one real product photo to the backend, which asks
   * Gemini's image model to recreate it as 4 premium studio shots
   * + 1 lifestyle shot. Results come back as base64 previews only
   * - nothing is saved yet, so a bad generation costs nothing to
   * discard.
   */
  async function generateAiImages() {
    if (!aiSourceFile) {
      setAiImagesMessage("Pehle ek source product photo choose karo.");
      return;
    }
    setGeneratingImages(true);
    setAiImagesMessage("");
    setAiGeneratedImages([]);
    try {
      const formData = new FormData();
      formData.append("sourceImage", aiSourceFile);
      const response = await adminFetch(`${API}/api/admin/products/generate-images`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!data.success) {
        setAiImagesMessage(data.message || "AI image generation failed.");
        return;
      }
      const images = data.images || [];
      setAiGeneratedImages(images.map((img) => ({ ...img, selected: img.success })));
      const failedCount = images.filter((img) => !img.success).length;
      setAiImagesMessage(
        failedCount > 0
          ? `${images.length - failedCount} of ${images.length} images generated — ${failedCount} failed (you can retry). Review below, then add the ones you like.`
          : "All 5 images generated — review below, then add the ones you like."
      );
    } catch (error) {
      setAiImagesMessage(error.message || "AI image generation failed.");
    } finally {
      setGeneratingImages(false);
    }
  }

  function toggleAiImageSelected(index) {
    setAiGeneratedImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, selected: !img.selected } : img))
    );
  }

  /*
   * Uploads every checked generated image to Supabase Storage and
   * drops its URL into importFetchedImages - the same list used by
   * "Fetch from Link" / "paste image link", so it flows into the
   * product exactly the same way at submit time.
   */
  async function addSelectedAiImages() {
    const selected = aiGeneratedImages.filter((img) => img.success && img.selected);
    if (selected.length === 0) {
      setAiImagesMessage("Koi image select nahi ki — checkbox tick karke phir try karo.");
      return;
    }
    setSavingSelectedImages(true);
    try {
      for (const img of selected) {
        const response = await adminFetch(`${API}/api/admin/products/save-generated-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl }),
        });
        const data = await response.json();
        if (data.success) {
          setImportFetchedImages((prev) => (prev.includes(data.url) ? prev : [...prev, data.url]));
        }
      }
      setAiGeneratedImages([]);
      setAiImagesMessage("Selected images product ke Images list mein add ho gayi — neeche dekh lo.");
    } catch (error) {
      setAiImagesMessage(error.message || "Unable to save selected images.");
    } finally {
      setSavingSelectedImages(false);
    }
  }

  async function submitImportProduct(targetStatus) {
    if (!adminLoggedIn) {
      alert("Please login as admin first.");
      return;
    }
    if (!importName.trim()) {
      alert("Product name required.");
      return;
    }
    if (importImages.length === 0 && importFetchedImages.length === 0) {
      alert("Please select at least one product image (upload a file, or fetch/paste one from the link).");
      return;
    }
    const cost = Number(importCostPrice);
    if (!cost || cost <= 0) {
      alert("Valid cost price is required.");
      return;
    }

    try {
      setImportingProduct(true);
      setImportMessage("");

      const formData = new FormData();
      formData.append("name", importName.trim());
      formData.append("category", importCategory);
      formData.append("costPrice", importCostPrice);
      formData.append("margin", importMargin || 0);
      formData.append("marginType", importMarginType);
      formData.append("sourceUrl", importSourceUrl);
      formData.append("stock", importStock || 0);
      formData.append("description", importDescription);
      formData.append("colors", importColors);
      formData.append("status", targetStatus);
      formData.append("imageUrls", JSON.stringify(importFetchedImages));
      importImages.forEach((file) => formData.append("images", file));

      const response = await adminFetch(`${API}/api/admin/products/import`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Server error ${response.status}`);
      }

      setImportMessage(
        targetStatus === "published"
          ? "Imported and published — it's live on the site now."
          : "Saved as a draft. Review it in the Products tab, then publish whenever you're ready."
      );
      resetImportForm();
      loadProducts();
    } catch (error) {
      setImportMessage(error.message || "Import failed.");
    } finally {
      setImportingProduct(false);
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
      setColors("Black");
      setImages([]);
      setSupplierName("");
      setSupplierProductId("");
      setSupplierLink("");
      setSupplierCost("");
      setShippingTime("");
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
    setEditColors(
      Array.isArray(product?.colors)
        ? product.colors.join(", ")
        : product?.colors || "Black"
    );
    setEditImages([]);
    setEditSupplierName(product?.supplierName || "");
    setEditSupplierProductId(product?.supplierProductId || "");
    setEditSupplierLink(product?.supplierLink || "");
    setEditSupplierCost(
      product?.supplierCost === null || product?.supplierCost === undefined
        ? ""
        : product.supplierCost
    );
    setEditShippingTime(product?.shippingTime || "");
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
        `Delete "${product.name}"?\n\nThis product will be removed from the store.`
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
        "Product successfully deleted."
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
          padding: 7px;
          font-size: 11px;
          text-align: center;
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
          <button
            className={
              activeTab === "import"
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setActiveTab("import")}
          >
            Import Product
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

        {activeTab === "import" && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Import Product (Meesho / any supplier)</h2>
            </div>

            <p className="customer-info" style={{ marginBottom: 20 }}>
              Paste the details from a Meesho (or any other) listing here manually — this
              does not scrape Meesho automatically. Fill this in once, and it works out
              your selling price and a ready-made description template for you. Nothing
              goes live on its own: every import is saved as a <strong>Draft</strong> first
              so you can review photos, price and wording — go to the Products tab and hit
              "Publish" whenever you're happy with it.
            </p>

            <div className="product-form-grid">
              <div className="form-group full">
                <label className="form-label">Meesho / Supplier Product URL (internal reference only, never shown to customers)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    className="form-input"
                    value={importSourceUrl}
                    onChange={(event) => setImportSourceUrl(event.target.value)}
                    placeholder="https://www.meesho.com/..."
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="status-action-button"
                    disabled={fetchingFromLink || fetchingImageUrl}
                    onClick={fetchFromLink}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {fetchingFromLink || fetchingImageUrl ? "Fetching..." : "🔍 Try Auto-Fill from Link"}
                  </button>
                </div>
                <p className="customer-info" style={{ marginTop: 8, fontSize: 13 }}>
                  Best-effort only — many supplier sites (Meesho included) block automated
                  requests, so this can fail. If it does, just fill the fields below by hand.
                </p>
                {fetchLinkMessage && (
                  <p className="customer-info" style={{ marginTop: 4, fontSize: 13 }}>{fetchLinkMessage}</p>
                )}
              </div>

              <div className="form-group full">
                <label className="form-label">Product Title (how it'll show on SHRIMOH)</label>
                <input
                  className="form-input"
                  value={importName}
                  onChange={(event) => setImportName(event.target.value)}
                  placeholder="e.g. Premium Women's Everyday Shoulder Bag"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-input"
                  value={importCategory}
                  onChange={(event) => setImportCategory(event.target.value)}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Stock</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={importStock}
                  onChange={(event) => setImportStock(event.target.value)}
                  placeholder="10"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Colors (comma separated)</label>
                <input
                  className="form-input"
                  value={importColors}
                  onChange={(event) => setImportColors(event.target.value)}
                  placeholder="Black, Tan"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cost Price (₹) — what you pay the supplier</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={importCostPrice}
                  onChange={(event) => setImportCostPrice(event.target.value)}
                  placeholder="399"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Margin</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select
                    className="form-input"
                    style={{ maxWidth: 110 }}
                    value={importMarginType}
                    onChange={(event) => setImportMarginType(event.target.value)}
                  >
                    <option value="fixed">₹ Fixed</option>
                    <option value="percent">% Percent</option>
                  </select>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={importMargin}
                    onChange={(event) => setImportMargin(event.target.value)}
                    placeholder={importMarginType === "percent" ? "40" : "220"}
                  />
                </div>
              </div>

              <div className="form-group full">
                <div className="supplier-info-box" style={{ fontSize: 14 }}>
                  <strong>Selling price (auto-calculated)</strong>
                  <div style={{ fontSize: 20, marginTop: 6 }}>
                    {formatMoney(calcSellingPrice(importCostPrice, importMargin, importMarginType))}
                  </div>
                </div>
              </div>

              <div className="form-group full">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={9}
                  value={importDescription}
                  onChange={(event) => setImportDescription(event.target.value)}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    className="status-action-button"
                    disabled={generatingPremium}
                    onClick={generatePremiumContent}
                  >
                    {generatingPremium ? "Generating..." : "✨ Generate Premium Content"}
                  </button>
                  <span className="customer-info" style={{ fontSize: 13 }}>
                    Rewrites the title + description above into a SHRIMOH-premium version
                    specific to this product (uses Google Gemini — needs GEMINI_API_KEY set up once, free tier).
                  </span>
                </div>
                {premiumMessage && (
                  <p className="customer-info" style={{ marginTop: 4, fontSize: 13 }}>{premiumMessage}</p>
                )}
              </div>

              <div className="form-group full">
                <label className="form-label">Product Images *</label>
                <input
                  className="form-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImportImagesChange}
                />
                {importImages.length > 0 && (
                  <div className="image-preview">
                    {importImages.map((file, index) => (
                      <div className="image-preview-card" key={`${file.name}-${index}`}>
                        <img src={URL.createObjectURL(file)} alt={file.name} />
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <label className="form-label">
                    Or paste an image link (right-click a Meesho photo → "Copy Image Address")
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      className="form-input"
                      value={importPasteImageUrl}
                      onChange={(event) => setImportPasteImageUrl(event.target.value)}
                      placeholder="https://images.meesho.com/..."
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="status-action-button"
                      disabled={fetchingImageUrl || !importPasteImageUrl.trim()}
                      onClick={addPastedImageUrl}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {fetchingImageUrl ? "Fetching..." : "+ Add Image"}
                    </button>
                  </div>
                </div>

                {importFetchedImages.length > 0 && (
                  <div className="image-preview">
                    {importFetchedImages.map((url) => (
                      <div className="image-preview-card" key={url} style={{ position: "relative" }}>
                        <img src={url} alt="Fetched product" />
                        <button
                          type="button"
                          onClick={() => removeFetchedImage(url)}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "50%",
                            width: 22,
                            height: 22,
                            cursor: "pointer",
                          }}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.12)" }}>
                  <label className="form-label">✨ Generate AI Images (4 premium + 1 lifestyle)</label>
                  <p className="customer-info" style={{ fontSize: 13, marginBottom: 8 }}>
                    Ek clear product photo choose karo — AI usi product ko preserve karte hue
                    4 premium studio-style images aur 1 female-model lifestyle image banayega.
                    Ye Google Gemini ki image-generation use karta hai (same GEMINI_API_KEY),
                    lekin isme text-generation jaisa free tier nahi milta — per-image thodi
                    si cost lag sakti hai, current pricing ai.google.dev par check kar lena.
                  </p>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="form-input"
                      type="file"
                      accept="image/*"
                      onChange={handleAiSourceFileChange}
                      style={{ maxWidth: 260 }}
                    />
                    <button
                      type="button"
                      className="status-action-button"
                      disabled={generatingImages || !aiSourceFile}
                      onClick={generateAiImages}
                    >
                      {generatingImages ? "Generating..." : "✨ Generate 4 Premium + 1 Lifestyle"}
                    </button>
                  </div>
                  {aiImagesMessage && (
                    <p className="customer-info" style={{ marginTop: 8, fontSize: 13 }}>{aiImagesMessage}</p>
                  )}

                  {aiGeneratedImages.length > 0 && (
                    <>
                      <div className="image-preview" style={{ marginTop: 12 }}>
                        {aiGeneratedImages.map((img, index) => (
                          <div
                            className="image-preview-card"
                            key={`${img.type}-${index}`}
                            style={{ position: "relative", opacity: img.success ? 1 : 0.5 }}
                          >
                            {img.success ? (
                              <>
                                <img src={img.dataUrl} alt={img.type} />
                                <label
                                  style={{
                                    position: "absolute",
                                    top: 4,
                                    left: 4,
                                    background: "rgba(0,0,0,0.65)",
                                    color: "#fff",
                                    fontSize: 11,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={img.selected}
                                    onChange={() => toggleAiImageSelected(index)}
                                  />
                                  {img.type === "lifestyle" ? "Lifestyle" : "Premium"}
                                </label>
                              </>
                            ) : (
                              <div style={{ padding: 10, fontSize: 12 }}>
                                {img.type === "lifestyle" ? "Lifestyle" : "Premium"} failed:{" "}
                                {img.message || "unknown error"}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="status-action-button"
                        disabled={savingSelectedImages}
                        onClick={addSelectedAiImages}
                        style={{ marginTop: 10 }}
                      >
                        {savingSelectedImages ? "Saving..." : "+ Add Selected Images to Product"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {importMessage && (
              <p className="customer-info" style={{ marginTop: 16 }}>
                {importMessage}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                type="button"
                className="cancel-product-button"
                disabled={importingProduct}
                onClick={() => submitImportProduct("draft")}
              >
                {importingProduct ? "SAVING..." : "SAVE AS DRAFT"}
              </button>
              <button
                type="button"
                className="save-product-button"
                disabled={importingProduct}
                onClick={() => submitImportProduct("published")}
              >
                {importingProduct ? "PUBLISHING..." : "PUBLISH NOW"}
              </button>
            </div>
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
                              </span>
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
                                    <div>Cost: {formatMoney(product.supplierCost)}</div>
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
                            </span>
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
