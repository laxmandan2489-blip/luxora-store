import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import shrimohIcon from "./assets/shrimoh-icon-square.png";

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
const PRODUCT_CATEGORIES = [
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

const BAG_CATEGORIES = [
  "Bags",
  "Handbags",
  "Sling Bags",
  "Tote Bags",
  "Backpacks",
  "Laptop Bags",
  "Travel Bags",
  "Clutches",
];

const ALL_BAGS_LABEL = "All Bags";

const API = "https://luxora-store-mkva.onrender.com";

/*
 * SUPPORT CONTACT DETAILS
 * Edit these two lines with your real details. WHATSAPP_NUMBER
 * must be in international format with country code and no
 * "+", spaces or dashes (India example: 91 followed by the
 * 10 digit mobile number) - this exact string is used to build
 * the wa.me link for the floating WhatsApp button.
 */
const SUPPORT_EMAIL = "getluxorastore@gmail.com";
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

        <div className="lux-info-stats">
          <div>
            <strong>1000+</strong>
            <span>Happy Customers</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>Vegan Materials</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>Cruelty Free</span>
          </div>
        </div>

        <h2 className="lux-info-subheading">Our Values</h2>

        <div className="lux-values-strip lux-info-values">
          <div>
            <span>🌿</span>
            <strong>100% VEGAN</strong>
            <p>No animal-derived materials, ever.</p>
          </div>

          <div>
            <span>✦</span>
            <strong>CRUELTY FREE</strong>
            <p>Ethically made, start to finish.</p>
          </div>

          <div>
            <span>♻</span>
            <strong>RESPONSIBLE MATERIALS</strong>
            <p>Considered sourcing at every step.</p>
          </div>

          <div>
            <span>✎</span>
            <strong>HANDCRAFTED</strong>
            <p>Made with care, not mass produced.</p>
          </div>
        </div>

        <h2 className="lux-info-subheading">Our Mission</h2>

        <p>
          Our mission is simple: create stylish, vegan, cruelty-free pieces that make you feel
          good about what you carry - inside and out. We believe fashion and ethics belong
          together, and that thoughtful design should be accessible, not exclusive.
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
          <strong>Free delivery</strong> is available on all orders above ₹1,999. Orders below
          this amount may carry a small delivery charge shown clearly at checkout before you pay.
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

function getImageUrl(image) {
  if (!image) return "";

  if (
    image.startsWith("http://") ||
    image.startsWith("https://") ||
    image.startsWith("data:")
  ) {
    return image;
  }

  return `${API}${image.startsWith("/") ? "" : "/"}${image}`;
}

function normalizeProduct(product) {
  return {
    ...product,
    price: Number(product.price || 0),
    oldPrice: Number(product.oldPrice || 0),
    stock: Number(product.stock || 0),
  };
}

function App() {
  /* =========================================================
     PRODUCTS
  ========================================================= */

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
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

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  /*
   * MOBILE NAV
   * The "☰" button in the header only makes sense on mobile
   * (where the full category nav is hidden by CSS). It opens
   * this slide-in drawer so mobile customers can still reach
   * every category, the wishlist and the bag - previously this
   * button had no handler at all and did nothing when tapped.
   */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    document.body.style.overflow = "";
  }

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

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [detailQuantity, setDetailQuantity] = useState(1);
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

  const [bestsellers, setBestsellers] = useState([]);

  useEffect(() => {
    async function loadBestsellers() {
      try {
        const response = await fetch(`${API}/api/bestsellers?limit=8`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setBestsellers(data.products.map(normalizeProduct));
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

  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [brandStoryImageUrl, setBrandStoryImageUrl] = useState("");

  useEffect(() => {
    async function loadSiteSettings() {
      try {
        const response = await fetch(`${API}/api/site-settings`);
        if (!response.ok) return;

        const data = await response.json();

        if (data.success && data.settings) {
          setHeroImageUrl(data.settings.heroImageUrl || "");
          setBrandStoryImageUrl(data.settings.brandStoryImageUrl || "");
        }
      } catch (error) {
        console.error("Site settings load error:", error);
      }
    }

    loadSiteSettings();
  }, []);

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

  const [customer, setCustomer] = useState({
    name: "",
    mobile: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

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
     LOAD PRODUCTS
  ========================================================= */

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setApiError("");

        const response = await fetch(`${API}/api/products`);

        if (!response.ok) {
          throw new Error("Unable to load products");
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products.map(normalizeProduct));
        } else {
          setProducts([]);
        }
      } catch (error) {
        console.error(error);

        setApiError(
          "Products could not be loaded. Please make sure the backend server is running."
        );
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

    return match || "All";
  }, [categorySlugFromUrl, categories]);

  function goToCategory(category) {
    if (!category || category === "All") {
      navigate("/");
    } else {
      navigate(`/category/${slugifyCategory(category)}`);
    }
  }

  /*
   * Every time the URL changes (home <-> a category page, or between
   * two categories), jump to the top of the new page. A single-page
   * app doesn't do this automatically the way a real multi-page site
   * does, and without it a category "page" felt like it was just
   * scrolling down inside the homepage instead of opening its own page.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  /* =========================================================
     FILTER PRODUCTS
  ========================================================= */

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const categoryMatch =
        selectedCategory === "All" ||
        (selectedCategory === ALL_BAGS_LABEL
          ? BAG_CATEGORIES.includes(product.category)
          : product.category === selectedCategory);

      const searchMatch =
        !searchText.trim() ||
        product.name?.toLowerCase().includes(searchText.toLowerCase());

      return categoryMatch && searchMatch;
    });
  }, [products, selectedCategory, searchText]);

  /* =========================================================
     PRODUCT IMAGES
  ========================================================= */

  function getProductImages(product) {
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

    return Array.from(new Set(images.filter(Boolean).map(getImageUrl)));
  }

  /* =========================================================
     OPEN PRODUCT
  ========================================================= */

  function openProduct(product) {
    const images = getProductImages(product);

    setSelectedProduct(product);
    setSelectedImage(images[0] || "");
    setSelectedImageIndex(0);
    setDetailQuantity(1);

    document.body.style.overflow = "hidden";
  }

  function closeProduct() {
    setSelectedProduct(null);
    setSelectedImage("");
    setSelectedImageIndex(0);
    setTouchStartX(null);

    if (!checkoutOpen) {
      document.body.style.overflow = "";
    }
  }

  /* =========================================================
     PRODUCT SLIDER
  ========================================================= */

  function selectProductImage(index) {
    if (!selectedProduct) return;

    const images = getProductImages(selectedProduct);

    if (!images.length) return;

    const safeIndex = ((index % images.length) + images.length) % images.length;

    setSelectedImageIndex(safeIndex);
    setSelectedImage(images[safeIndex]);
  }

  function changeProductImage(direction) {
    if (!selectedProduct) return;

    const images = getProductImages(selectedProduct);

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

  const deliveryCharge = totalPrice === 0 || totalPrice >= 1999 ? 0 : 0;

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

  const checkoutDeliveryCharge =
    checkoutSubtotal === 0 || checkoutSubtotal >= 1999 ? 0 : 0;

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

  function addToCart(product, quantity = 1) {
    if (!product) return;

    const safeQuantity = Math.max(1, Number(quantity || 1));
    const stock = Number(product.stock || 0);

    if (stock <= 0) {
      alert("This product is currently sold out.");
      return;
    }

    setCart((previousCart) => {
      const existingIndex = previousCart.findIndex((item) => item.id === product.id);

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
          quantity: Math.min(safeQuantity, stock || 99),
        },
      ];
    });
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
      quantity,
    });

    closeProduct();

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

      if (selectedProduct) {
        closeProduct();
      } else if (checkoutOpen) {
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
  }, [selectedProduct, checkoutOpen, cartOpen, wishlistOpen, mobileMenuOpen, activePage]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="shrimoh-app">
      {/* ANNOUNCEMENT BAR */}
      <div className="lux-announcement">
        <div>✦ FREE DELIVERY ON ORDERS ABOVE ₹1,999</div>
        <div className="lux-announcement-center">PREMIUM COLLECTION · SECURE SHOPPING</div>
        <div>HANDCRAFTED STYLE · MADE FOR YOU</div>
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

          <nav className="lux-nav">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? "active" : ""}
                onClick={() => goToCategory(category)}
              >
                {category === "All" ? "SHOP ALL" : category}
              </button>
            ))}
          </nav>

          <div className="lux-header-actions">
            <button type="button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search">
              ⌕
            </button>

            <button
              type="button"
              onClick={() => setWishlistOpen(true)}
              className={`lux-wishlist-icon${wishlist.length > 0 ? " has-items" : ""}`}
              aria-label="Wishlist"
            >
              ♥{wishlist.length > 0 && <span>{wishlist.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="lux-cart-icon"
              aria-label="Shopping bag"
            >
              🛍{totalItems > 0 && <span>{totalItems}</span>}
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
          </div>
        )}
      </header>

      {/*
        HOMEPAGE-ONLY SECTIONS
        Hero, editorial/values strips, bestsellers and new-arrivals only
        belong on the homepage. When a category is open (a real
        /category/:slug page), we skip straight to that category's own
        collection header + grid below, instead of stacking the whole
        homepage above it. This is what makes a category feel like its
        own page instead of a scroll-down section of the homepage.
      */}
      {selectedCategory === "All" && (
        <>
      {/* HERO */}
      <section className="lux-hero">
        <div className="lux-hero-image">
          {heroImageUrl ? (
            <img src={heroImageUrl} alt="SHRIMOH collection" />
          ) : filteredProducts[0] && getProductImages(filteredProducts[0])[0] ? (
            <img src={getProductImages(filteredProducts[0])[0]} alt="SHRIMOH collection" />
          ) : (
            <div className="lux-hero-placeholder">SHRIMOH</div>
          )}
          <div className="lux-hero-image-shade" />
        </div>

        <div className="lux-hero-content">
          <div className="lux-hero-kicker">NEW SEASON · 2026</div>

          <h1>
            Crafted
            <br />
            for distinction.
          </h1>

          <p>
            Timeless silhouettes.
            <br />
            Refined details.
            <br />
            Everyday luxury.
          </p>

          <button
            type="button"
            onClick={() =>
              document.getElementById("lux-products")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            SHOP THE COLLECTION
            <span>→</span>
          </button>
        </div>

        <div className="lux-hero-bottom">
          <span>SHRIMOH / 2026</span>
          <span>DISCOVER YOUR SIGNATURE</span>
        </div>
      </section>

      {/* EDITORIAL STRIP */}
      <section className="lux-editorial-strip">
        <div>
          <span>01</span>
          <strong>TIMELESS DESIGN</strong>
          <p>Pieces created beyond seasons.</p>
        </div>

        <div>
          <span>02</span>
          <strong>REFINED QUALITY</strong>
          <p>Details that make the difference.</p>
        </div>

        <div>
          <span>03</span>
          <strong>EVERYDAY LUXURY</strong>
          <p>Designed to become your favourite.</p>
        </div>
      </section>

      {/* VALUES STRIP */}
      <section className="lux-values-strip">
        <div>
          <span>🌿</span>
          <strong>100% VEGAN</strong>
          <p>No animal-derived materials, ever.</p>
        </div>

        <div>
          <span>✦</span>
          <strong>CRUELTY FREE</strong>
          <p>Ethically made, start to finish.</p>
        </div>

        <div>
          <span>♻</span>
          <strong>RESPONSIBLE MATERIALS</strong>
          <p>Considered sourcing at every step.</p>
        </div>

        <div>
          <span>✎</span>
          <strong>HANDCRAFTED</strong>
          <p>Made with care, not mass produced.</p>
        </div>
      </section>

      {/* BESTSELLERS */}
      {bestsellers.length > 0 && (
        <>
          <section className="lux-section-header">
            <div>
              <span>MOST LOVED</span>
              <h2>Bestsellers</h2>
            </div>

            <div className="lux-collection-right">
              <p>Real favourites, chosen by our customers</p>
            </div>
          </section>

          <div className="lux-product-grid lux-scroll-row">
            {bestsellers.map((product) => {
              const image = getProductImages(product)[0];
              const isSoldOut = Number(product.stock || 0) <= 0;

              return (
                <article
                  className="lux-product-card"
                  key={`bestseller-${product.id}`}
                  onClick={() => openProduct(product)}
                >
                  <div className="lux-card-image">
                    {image ? (
                      <img src={image} alt={product.name} loading="lazy" />
                    ) : (
                      <div className="lux-card-placeholder">SHRIMOH</div>
                    )}

                    <div className="lux-card-badge lux-badge-best">BESTSELLER</div>

                    {isSoldOut && <div className="lux-card-sold">SOLD OUT</div>}

                    <button
                      type="button"
                      className={`lux-wishlist-heart${
                        isWishlisted(product.id) ? " active" : ""
                      }`}
                      onClick={(e) => toggleWishlist(product, e)}
                      aria-label={
                        isWishlisted(product.id)
                          ? "Remove from wishlist"
                          : "Add to wishlist"
                      }
                    >
                      {isWishlisted(product.id) ? "♥" : "♡"}
                    </button>
                  </div>

                  <div className="lux-card-info">
                    <div>
                      <span>{product.category || "COLLECTION"}</span>
                      <h3>{product.name}</h3>
                    </div>

                    <div className="lux-card-price">
                      <strong>₹{product.price.toLocaleString("en-IN")}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* NEW ARRIVALS */}
      {newArrivals.length > 0 && (
        <>
          <section className="lux-section-header">
            <div>
              <span>JUST IN</span>
              <h2>New Arrivals</h2>
            </div>

            <div className="lux-collection-right">
              <p>The latest additions to the edit</p>
            </div>
          </section>

          <div className="lux-product-grid lux-scroll-row">
            {newArrivals.map((product) => {
              const image = getProductImages(product)[0];
              const isSoldOut = Number(product.stock || 0) <= 0;
              const hasDiscount = product.oldPrice > product.price;

              return (
                <article
                  className="lux-product-card"
                  key={`new-${product.id}`}
                  onClick={() => openProduct(product)}
                >
                  <div className="lux-card-image">
                    {image ? (
                      <img src={image} alt={product.name} loading="lazy" />
                    ) : (
                      <div className="lux-card-placeholder">SHRIMOH</div>
                    )}

                    {hasDiscount && <div className="lux-card-badge">SALE</div>}

                    {isSoldOut && <div className="lux-card-sold">SOLD OUT</div>}

                    <button
                      type="button"
                      className={`lux-wishlist-heart${
                        isWishlisted(product.id) ? " active" : ""
                      }`}
                      onClick={(e) => toggleWishlist(product, e)}
                      aria-label={
                        isWishlisted(product.id)
                          ? "Remove from wishlist"
                          : "Add to wishlist"
                      }
                    >
                      {isWishlisted(product.id) ? "♥" : "♡"}
                    </button>
                  </div>

                  <div className="lux-card-info">
                    <div>
                      <span>{product.category || "COLLECTION"}</span>
                      <h3>{product.name}</h3>
                    </div>

                    <div className="lux-card-price">
                      <strong>₹{product.price.toLocaleString("en-IN")}</strong>
                      {hasDiscount && (
                        <del>₹{product.oldPrice.toLocaleString("en-IN")}</del>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
        </>
      )}

      {/* CATEGORY PAGE BREADCRUMB - only shown when a category page is open */}
      {selectedCategory !== "All" && (
        <nav className="lux-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => goToCategory("All")}>
            Home
          </button>
          <span>/</span>
          <span>{selectedCategory}</span>
        </nav>
      )}

      {/* COLLECTION HEADER (doubles as the category page's own header) */}
      <section className="lux-collection-header" id="lux-products">
        <div>
          <span>THE SHRIMOH EDIT</span>
          <h2>{selectedCategory === "All" ? "Curated Collection" : selectedCategory}</h2>
        </div>

        <div className="lux-collection-right">
          <p>
            {filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}
          </p>
          <span>PREMIUM · TIMELESS · REFINED</span>
        </div>
      </section>

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
              goToCategory("All");
              setSearchText("");
            }}
          >
            VIEW ALL PRODUCTS
          </button>
        </div>
      ) : (
        <main className="lux-product-grid">
          {filteredProducts.map((product, index) => {
            const image = getProductImages(product)[0];
            const hasDiscount = product.oldPrice > product.price;
            const isSoldOut = Number(product.stock || 0) <= 0;

            return (
              <article
                className="lux-product-card"
                key={product.id}
                onClick={() => openProduct(product)}
              >
                <div className="lux-card-image">
                  {image ? (
                    <img
                      src={image}
                      alt={product.name}
                      loading={index < 4 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="lux-card-placeholder">SHRIMOH</div>
                  )}

                  {hasDiscount && <div className="lux-card-badge">SALE</div>}

                  {isSoldOut && <div className="lux-card-sold">SOLD OUT</div>}

                  <button
                    type="button"
                    className={`lux-wishlist-heart${isWishlisted(product.id) ? " active" : ""}`}
                    onClick={(e) => toggleWishlist(product, e)}
                    aria-label={
                      isWishlisted(product.id) ? "Remove from wishlist" : "Add to wishlist"
                    }
                  >
                    {isWishlisted(product.id) ? "♥" : "♡"}
                  </button>

                  <div className="lux-card-overlay" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={isSoldOut}
                      onClick={() => {
                        addToCart(product, 1);
                        setCartOpen(true);
                      }}
                    >
                      {isSoldOut ? "SOLD OUT" : "ADD TO CART"}
                    </button>

                    <button type="button" onClick={() => openProduct(product)}>
                      VIEW
                      <span>→</span>
                    </button>
                  </div>
                </div>

                <div className="lux-card-info">
                  <div>
                    <span>{product.category || "COLLECTION"}</span>
                    <h3>{product.name}</h3>
                  </div>

                  <div className="lux-card-price">
                    <strong>₹{product.price.toLocaleString("en-IN")}</strong>
                    {hasDiscount && <del>₹{product.oldPrice.toLocaleString("en-IN")}</del>}
                  </div>
                </div>
              </article>
            );
          })}
        </main>
      )}

      {/* BRAND STORY */}
      <section className="lux-brand-story">
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
            onClick={() =>
              document.getElementById("lux-products")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            EXPLORE SHRIMOH
            <span>→</span>
          </button>
        </div>

        <div className="lux-brand-story-mark">
          {brandStoryImageUrl ? (
            <img src={brandStoryImageUrl} alt="SHRIMOH" className="lux-brand-story-photo" />
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

      {/* GUARANTEE / TRUST STRIP */}
      <section className="lux-guarantee-strip">
        <div>
          <span className="lux-guarantee-icon">🔒</span>
          <strong>SECURE PAYMENTS</strong>
          <p>100% safe checkout via Razorpay.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">↺</span>
          <strong>EASY 7-DAY RETURNS</strong>
          <p>Not the right fit? Send it back, hassle-free.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">✦</span>
          <strong>AUTHENTIC &amp; HANDCRAFTED</strong>
          <p>Every piece checked before it ships.</p>
        </div>

        <div>
          <span className="lux-guarantee-icon">📦</span>
          <strong>PAN-INDIA SHIPPING</strong>
          <p>Delivered safely, wherever you are.</p>
        </div>
      </section>

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
              <button onClick={() => goToCategory("All")}>All Products</button>

              {categories.slice(1, 5).map((category) => (
                <button key={category} onClick={() => goToCategory(category)}>
                  {category}
                </button>
              ))}
            </div>

            <div>
              <strong>ABOUT</strong>
              <button type="button" onClick={() => openInfoPage("about")}>
                Our Story
              </button>
              <button type="button" onClick={() => openInfoPage("shipping")}>
                Shipping
              </button>
              <button type="button" onClick={() => openInfoPage("returns")}>
                Returns
              </button>
            </div>

            <div>
              <strong>CONNECT</strong>
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              <button type="button" onClick={() => openInfoPage("contact")}>
                Contact Us
              </button>
            </div>
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

      {/* NEW CUSTOMER WELCOME OFFER (small corner popup, first visit only) */}
      {showWelcomeOffer && (
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

      {/* PRODUCT DETAIL */}
      {selectedProduct && (
        <div
          className="lux-product-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeProduct();
            }
          }}
        >
          <div className="lux-product-page">
            <button
              type="button"
              className="lux-product-close"
              onClick={closeProduct}
              aria-label="Close product"
            >
              ×
            </button>

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
                const images = getProductImages(selectedProduct);

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
                            src={selectedImage}
                            alt={selectedProduct.name}
                            draggable="false"
                            onError={(e) => {
                              e.currentTarget.style.opacity = "0.25";
                            }}
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

              <h1 className="lux-product-title">{selectedProduct.name}</h1>

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

              <p className="lux-price-note">Tax included · Free delivery above ₹1,999</p>

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
                    addToCart(selectedProduct, detailQuantity);
                    setCartOpen(true);
                    closeProduct();
                  }}
                >
                  ADD TO CART
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
                    <p>On orders above ₹1,999.</p>
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
                    </div>
                  </div>
                </details>

                <details>
                  <summary>
                    SHIPPING & RETURNS
                    <span>+</span>
                  </summary>

                  <div className="lux-details-content">
                    <p>Free delivery is available on orders above ₹1,999.</p>
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
                      Keep your product away from moisture and direct sunlight. Clean gently using
                      a soft cloth.
                    </p>
                  </div>
                </details>
              </div>
            </section>
          </div>
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
                    const image = getProductImages(item)[0];

                    return (
                      <div className="lux-cart-item" key={`${item.id}-${index}`}>
                        <div className="lux-cart-item-image">
                          {image && <img src={image} alt={item.name} />}
                        </div>

                        <div className="lux-cart-item-info">
                          <span>{item.category || "COLLECTION"}</span>
                          <h3>{item.name}</h3>
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

            <nav className="lux-mobile-nav-links">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={selectedCategory === category ? "active" : ""}
                  onClick={() => {
                    goToCategory(category);
                    closeMobileMenu();
                  }}
                >
                  {category === "All" ? "SHOP ALL" : category}
                </button>
              ))}
            </nav>

            <div className="lux-mobile-nav-actions">
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  setWishlistOpen(true);
                  document.body.style.overflow = "hidden";
                }}
              >
                ♡ WISHLIST{wishlist.length > 0 ? ` (${wishlist.length})` : ""}
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  setCartOpen(true);
                  document.body.style.overflow = "hidden";
                }}
              >
                🛍 SHOPPING BAG{totalItems > 0 ? ` (${totalItems})` : ""}
              </button>
            </div>
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
                        const image = getProductImages(item)[0];

                        return (
                          <div className="lux-summary-item" key={`${item.id}-${index}`}>
                            <div className="lux-summary-image">
                              {image && <img src={image} alt={item.name} />}
                              <span>{item.quantity}</span>
                            </div>

                            <section>
                              <span>{item.category || "COLLECTION"}</span>
                              <h3>{item.name}</h3>
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

export default App;
