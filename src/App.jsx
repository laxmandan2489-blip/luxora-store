import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "https://luxora-store-mkva.onrender.com";

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

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

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
    const values = products
      .map((product) => product.category)
      .filter(Boolean);

    return ["All", ...Array.from(new Set(values))];
  }, [products]);

  /* =========================================================
     FILTER PRODUCTS
  ========================================================= */

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const categoryMatch =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const searchMatch =
        !searchText.trim() ||
        product.name
          ?.toLowerCase()
          .includes(searchText.toLowerCase());

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

    if (
      typeof product.images === "string" &&
      product.images.trim()
    ) {
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

    if (
      product.image &&
      !images.includes(product.image)
    ) {
      images.unshift(product.image);
    }

    return images
      .filter(Boolean)
      .map(getImageUrl);
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

    const safeIndex =
      ((index % images.length) + images.length) %
      images.length;

    setSelectedImageIndex(safeIndex);
    setSelectedImage(images[safeIndex]);
  }

  function changeProductImage(direction) {
    if (!selectedProduct) return;

    const images = getProductImages(selectedProduct);

    if (images.length <= 1) return;

    const currentIndex = Math.max(
      0,
      selectedImageIndex
    );

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
    if (
      touchStartX === null ||
      !event.changedTouches?.length
    ) {
      return;
    }

    const endX =
      event.changedTouches[0].clientX;

    const difference = touchStartX - endX;

    if (Math.abs(difference) > 45) {
      changeProductImage(
        difference > 0 ? "next" : "prev"
      );
    }

    setTouchStartX(null);
  }

  /* =========================================================
     CART TOTALS
  ========================================================= */

  const totalItems = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total + Number(item.quantity || 0),
      0
    );
  }, [cart]);

  const totalPrice = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total +
        Number(item.price || 0) *
          Number(item.quantity || 0),
      0
    );
  }, [cart]);

  const deliveryCharge =
    totalPrice === 0 || totalPrice >= 1999
      ? 0
      : 0;

  const checkoutTotal =
    totalPrice + deliveryCharge;

  /* =========================================================
     ADD TO CART
     NO COLOR
  ========================================================= */

  function addToCart(product, quantity = 1) {
    if (!product) return;

    const safeQuantity = Math.max(
      1,
      Number(quantity || 1)
    );

    const stock = Number(product.stock || 0);

    if (stock <= 0) {
      alert("This product is currently sold out.");
      return;
    }

    setCart((previousCart) => {
      const existingIndex =
        previousCart.findIndex(
          (item) => item.id === product.id
        );

      if (existingIndex >= 0) {
        return previousCart.map(
          (item, index) => {
            if (index !== existingIndex) {
              return item;
            }

            const currentQuantity =
              Number(item.quantity || 0);

            return {
              ...item,
              quantity: Math.min(
                currentQuantity + safeQuantity,
                Number(item.stock || 99)
              ),
            };
          }
        );
      }

      return [
        ...previousCart,
        {
          ...product,
          quantity: Math.min(
            safeQuantity,
            stock || 99
          ),
        },
      ];
    });
  }

  /* =========================================================
     UPDATE CART
  ========================================================= */

  function updateCartQuantity(index, amount) {
    setCart((previousCart) =>
      previousCart
        .map((item, itemIndex) => {
          if (itemIndex !== index) {
            return item;
          }

          const currentQuantity =
            Number(item.quantity || 1);

          const maxStock =
            Number(item.stock || 99);

          const nextQuantity =
            currentQuantity + amount;

          return {
            ...item,
            quantity: Math.min(
              Math.max(1, nextQuantity),
              maxStock
            ),
          };
        })
    );
  }

  function removeFromCart(index) {
    setCart((previousCart) =>
      previousCart.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );
  }

  /* =========================================================
     BUY NOW
  ========================================================= */

  function buyNow() {
    if (!selectedProduct) return;

    if (Number(selectedProduct.stock || 0) <= 0) {
      alert("This product is currently sold out.");
      return;
    }

    addToCart(
      selectedProduct,
      detailQuantity
    );

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

    setCartOpen(false);
    setCheckoutOpen(true);
    setOrderPlaced(false);

    document.body.style.overflow = "hidden";
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setOrderPlaced(false);
    document.body.style.overflow = "";
  }

  /* =========================================================
     CUSTOMER INPUT
     MOBILE = ONLY 10 DIGITS
     PINCODE = ONLY 6 DIGITS
  ========================================================= */

  function handleCustomerChange(field, value) {
    let cleanValue = value;

    if (field === "mobile") {
      cleanValue = value
        .replace(/\D/g, "")
        .slice(0, 10);
    }

    if (field === "pincode") {
      cleanValue = value
        .replace(/\D/g, "")
        .slice(0, 6);
    }

    setCustomer((previous) => ({
      ...previous,
      [field]: cleanValue,
    }));
  }

  /* =========================================================
     PLACE ORDER
     SAVE ORDER TO BACKEND
  ========================================================= */

  async function placeOrder(e) {
  e.preventDefault();

  if (orderLoading) return;

  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  if (
    !customer.name ||
    !customer.mobile ||
    !customer.email ||
    !customer.address ||
    !customer.city ||
    !customer.state ||
    !customer.pincode
  ) {
    alert("Please fill all customer details.");
    return;
  }

  setOrderLoading(true);

  try {
    // Load Razorpay Checkout
    const razorpayLoaded = await new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });

    if (!razorpayLoaded) {
      throw new Error("Razorpay checkout failed to load.");
    }

    const reference = `LX${Date.now().toString().slice(-8)}`;

    // Create Razorpay order on backend
    const createResponse = await fetch(`${API}/api/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(checkoutTotal * 100),
      }),
    });

    const createData = await createResponse.json();

    if (!createResponse.ok || !createData.success) {
      throw new Error(
        createData.message || "Unable to create payment order."
      );
    }

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,

      amount: createData.amount,
      currency: createData.currency || "INR",

      name: "LUXORA",
      description: `LUXORA Order ${reference}`,

      order_id: createData.order_id,

      prefill: {
        name: customer.name,
        email: customer.email,
        contact: customer.mobile,
      },

      notes: {
        order_reference: reference,
      },

      theme: {
        color: "#111111",
      },

      handler: async function (paymentResponse) {
        try {
          // Verify payment on backend
          const verifyResponse = await fetch(
            `${API}/api/verify-payment`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                razorpay_order_id:
                  paymentResponse.razorpay_order_id,

                razorpay_payment_id:
                  paymentResponse.razorpay_payment_id,

                razorpay_signature:
                  paymentResponse.razorpay_signature,
              }),
            }
          );

          const verifyData = await verifyResponse.json();

          if (!verifyResponse.ok || !verifyData.success) {
            throw new Error(
              verifyData.message || "Payment verification failed."
            );
          }

          const orderItems = cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0),
            selectedColor: item.selectedColor || "",
            image: item.image || "",
          }));

          const orderData = {
            reference,
            customer: {
              name: customer.name,
              mobile: customer.mobile,
              email: customer.email,
              address: customer.address,
              city: customer.city,
              state: customer.state,
              pincode: customer.pincode,
            },

            items: orderItems,

            subtotal: totalPrice,
            delivery: deliveryCharge,
            total: checkoutTotal,

            payment: {
              method: "Razorpay",
              status: "Paid",
              razorpayOrderId:
                paymentResponse.razorpay_order_id,
              razorpayPaymentId:
                paymentResponse.razorpay_payment_id,
              razorpaySignature:
                paymentResponse.razorpay_signature,
            },

            status: "Paid",
          };

          // Save order after successful payment
          const orderResponse = await fetch(`${API}/api/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(orderData),
          });

          const savedOrder = await orderResponse.json();

          if (!orderResponse.ok || !savedOrder.success) {
            throw new Error(
              savedOrder.message || "Order could not be saved."
            );
          }

          setOrderReference(reference);
          setOrderPlaced(true);
          setCart([]);
          setCheckoutOpen(true);
        } catch (error) {
          console.error("Payment verification/order error:", error);
          alert(
            error.message ||
              "Payment successful, but order processing failed. Please contact support."
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

    const razorpay = new window.Razorpay(options);

    razorpay.on("payment.failed", function (response) {
      console.error("Razorpay payment failed:", response);

      alert(
        response.error?.description ||
          "Payment failed. Please try again."
      );

      setOrderLoading(false);
    });

    razorpay.open();
  } catch (error) {
    console.error("Checkout error:", error);

    alert(
      error.message ||
        "Something went wrong while starting payment."
    );

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
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style.overflow = "";
    };
  }, [
    selectedProduct,
    checkoutOpen,
    cartOpen,
  ]);

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="luxora-app">

      {/* =====================================================
          ANNOUNCEMENT BAR
      ===================================================== */}

      <div className="lux-announcement">

        <div>
          ✦ FREE DELIVERY ON ORDERS ABOVE ₹1,999
        </div>

        <div className="lux-announcement-center">
          PREMIUM COLLECTION · SECURE SHOPPING
        </div>

        <div>
          HANDCRAFTED STYLE · MADE FOR YOU
        </div>

      </div>


      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="lux-header">

        <div className="lux-header-inner">

          <button
            className="lux-mobile-menu"
            type="button"
            aria-label="Menu"
          >
            ☰
          </button>

          <div
            className="lux-logo"
            onClick={() => {
              setSelectedCategory("All");
              setSearchText("");

              window.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
          >
            <span>LUXORA</span>
            <small>THE LUXURY STORE</small>
          </div>

          <nav className="lux-nav">

            {categories
              .slice(0, 7)
              .map((category) => (

                <button
                  key={category}
                  type="button"
                  className={
                    selectedCategory === category
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setSelectedCategory(
                      category
                    );

                    document
                      .getElementById(
                        "lux-products"
                      )
                      ?.scrollIntoView({
                        behavior: "smooth",
                      });
                  }}
                >
                  {category === "All"
                    ? "SHOP ALL"
                    : category}
                </button>

              ))}

          </nav>

          <div className="lux-header-actions">

            <button
              type="button"
              onClick={() =>
                setSearchOpen(!searchOpen)
              }
              aria-label="Search"
            >
              ⌕
            </button>

            <button
              type="button"
              onClick={() =>
                setCartOpen(true)
              }
              className="lux-cart-icon"
              aria-label="Shopping bag"
            >
              ♡

              {totalItems > 0 && (
                <span>{totalItems}</span>
              )}

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
                onChange={(e) =>
                  setSearchText(
                    e.target.value
                  )
                }
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


      {/* =====================================================
          HERO
      ===================================================== */}

      <section className="lux-hero">

        <div className="lux-hero-image">

          {filteredProducts[0] &&
          getProductImages(
            filteredProducts[0]
          )[0] ? (

            <img
              src={
                getProductImages(
                  filteredProducts[0]
                )[0]
              }
              alt="LUXORA collection"
            />

          ) : (

            <div className="lux-hero-placeholder">
              LUXORA
            </div>

          )}

          <div className="lux-hero-image-shade" />

        </div>


        <div className="lux-hero-content">

          <div className="lux-hero-kicker">
            NEW SEASON · 2026
          </div>

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
              document
                .getElementById(
                  "lux-products"
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                })
            }
          >
            SHOP THE COLLECTION
            <span>→</span>
          </button>

        </div>


        <div className="lux-hero-bottom">

          <span>
            LUXORA / 2026
          </span>

          <span>
            DISCOVER YOUR SIGNATURE
          </span>

        </div>

      </section>


      {/* =====================================================
          EDITORIAL STRIP
      ===================================================== */}

      <section className="lux-editorial-strip">

        <div>
          <span>01</span>
          <strong>TIMELESS DESIGN</strong>
          <p>
            Pieces created beyond seasons.
          </p>
        </div>

        <div>
          <span>02</span>
          <strong>REFINED QUALITY</strong>
          <p>
            Details that make the difference.
          </p>
        </div>

        <div>
          <span>03</span>
          <strong>EVERYDAY LUXURY</strong>
          <p>
            Designed to become your favourite.
          </p>
        </div>

      </section>


      {/* =====================================================
          COLLECTION HEADER
      ===================================================== */}

      <section
        className="lux-collection-header"
        id="lux-products"
      >

        <div>

          <span>
            THE LUXORA EDIT
          </span>

          <h2>
            {selectedCategory === "All"
              ? "Curated Collection"
              : selectedCategory}
          </h2>

        </div>

        <div className="lux-collection-right">

          <p>
            {filteredProducts.length}{" "}
            {filteredProducts.length === 1
              ? "piece"
              : "pieces"}
          </p>

          <span>
            PREMIUM · TIMELESS · REFINED
          </span>

        </div>

      </section>


      {/* =====================================================
          API ERROR
      ===================================================== */}

      {apiError && (
        <div className="lux-api-error">
          {apiError}
        </div>
      )}


      {/* =====================================================
          LOADING / PRODUCTS
      ===================================================== */}

      {loadingProducts ? (

        <div className="lux-loading">

          <div className="lux-spinner" />

          <span>
            CURATING COLLECTION
          </span>

        </div>

      ) : filteredProducts.length === 0 ? (

        <div className="lux-empty">

          <span>THE COLLECTION</span>

          <h3>
            No products found
          </h3>

          <p>
            Try another category or search.
          </p>

          <button
            type="button"
            onClick={() => {
              setSelectedCategory("All");
              setSearchText("");
            }}
          >
            VIEW ALL PRODUCTS
          </button>

        </div>

      ) : (

        <main className="lux-product-grid">

          {filteredProducts.map(
            (product, index) => {

              const image =
                getProductImages(
                  product
                )[0];

              const hasDiscount =
                product.oldPrice >
                product.price;

              const isSoldOut =
                Number(product.stock || 0) <= 0;

              return (

                <article
                  className="lux-product-card"
                  key={product.id}
                  onClick={() =>
                    openProduct(product)
                  }
                >

                  <div className="lux-card-image">

                    {image ? (

                      <img
                        src={image}
                        alt={product.name}
                        loading={
                          index < 4
                            ? "eager"
                            : "lazy"
                        }
                      />

                    ) : (

                      <div className="lux-card-placeholder">
                        LUXORA
                      </div>

                    )}


                    {hasDiscount && (
                      <div className="lux-card-badge">
                        SALE
                      </div>
                    )}


                    {isSoldOut && (
                      <div className="lux-card-sold">
                        SOLD OUT
                      </div>
                    )}


                    <div
                      className="lux-card-overlay"
                      onClick={(e) =>
                        e.stopPropagation()
                      }
                    >

                      <button
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => {
                          addToCart(
                            product,
                            1
                          );

                          setCartOpen(true);
                        }}
                      >
                        {isSoldOut
                          ? "SOLD OUT"
                          : "ADD TO CART"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openProduct(product)
                        }
                      >
                        VIEW
                        <span>→</span>
                      </button>

                    </div>

                  </div>


                  <div className="lux-card-info">

                    <div>

                      <span>
                        {product.category ||
                          "COLLECTION"}
                      </span>

                      <h3>
                        {product.name}
                      </h3>

                    </div>

                    <div className="lux-card-price">

                      <strong>
                        ₹
                        {product.price.toLocaleString(
                          "en-IN"
                        )}
                      </strong>

                      {hasDiscount && (
                        <del>
                          ₹
                          {product.oldPrice.toLocaleString(
                            "en-IN"
                          )}
                        </del>
                      )}

                    </div>

                  </div>

                </article>

              );
            }
          )}

        </main>

      )}


      {/* =====================================================
          BRAND STORY
      ===================================================== */}

      <section className="lux-brand-story">

        <div className="lux-brand-story-copy">

          <span>
            THE LUXORA PHILOSOPHY
          </span>

          <h2>
            Luxury doesn't
            <br />
            need to shout.
          </h2>

          <p>
            We believe the most beautiful
            pieces are the ones that quietly
            become part of your everyday life.
            Thoughtful design, refined details
            and a feeling that lasts beyond
            the first impression.
          </p>

          <button
            type="button"
            onClick={() =>
              document
                .getElementById(
                  "lux-products"
                )
                ?.scrollIntoView({
                  behavior: "smooth",
                })
            }
          >
            EXPLORE LUXORA
            <span>→</span>
          </button>

        </div>

        <div className="lux-brand-story-mark">

          <span>L</span>

          <small>
            LUXORA
            <br />
            EST. 2026
          </small>

        </div>

      </section>


      {/* =====================================================
          REVIEWS
      ===================================================== */}

      <section className="lux-reviews">

        <div className="lux-reviews-heading">

          <div>

            <span className="lux-eyebrow">
              CUSTOMER STORIES
            </span>

            <h2>
              Reviews
            </h2>

          </div>

          <div className="lux-review-rating">

            <strong>
              4.8
            </strong>

            <div>

              <span>
                ★★★★★
              </span>

              <small>
                Based on 24 reviews
              </small>

            </div>

          </div>

        </div>


        <div className="lux-review-list">

          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Pooja Sharma
              </strong>

              <span>
                ★★★★★
              </span>
            </div>

            <h3>
              Beautiful and elegant
            </h3>

            <p>
              The bag looks beautiful and
              the overall finish feels very
              premium.
            </p>

            <small>
              Sample Review
            </small>

          </article>


          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Jasmin Mehta
              </strong>

              <span>
                ★★★★★
              </span>
            </div>

            <h3>
              Really loved it
            </h3>

            <p>
              Very classy design and
              comfortable to carry.
            </p>

            <small>
              Sample Review
            </small>

          </article>


          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Neha Joshi
              </strong>

              <span>
                ★★★★★
              </span>
            </div>

            <h3>
              Looks premium
            </h3>

            <p>
              The quality and overall look
              are beautiful.
            </p>

            <small>
              Sample Review
            </small>

          </article>


          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Shreya Singh
              </strong>

              <span>
                ★★★★☆
              </span>
            </div>

            <h3>
              Very stylish
            </h3>

            <p>
              Loved the shape and clean
              finishing.
            </p>

            <small>
              Sample Review
            </small>

          </article>


          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Nancy Kapoor
              </strong>

              <span>
                ★★★★★
              </span>
            </div>

            <h3>
              Worth the price
            </h3>

            <p>
              Nice quality, elegant look
              and beautiful presentation.
            </p>

            <small>
              Sample Review
            </small>

          </article>


          <article className="lux-review">

            <div className="lux-review-top">
              <strong>
                Riya Verma
              </strong>

              <span>
                ★★★★★
              </span>
            </div>

            <h3>
              So pretty
            </h3>

            <p>
              The design is simple but
              looks very luxurious.
            </p>

            <small>
              Sample Review
            </small>

          </article>

        </div>

      </section>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer className="lux-footer">

        <div className="lux-footer-top">

          <div className="lux-footer-brand">

            <div className="lux-footer-logo">
              LUXORA
            </div>

            <p>
              THE LUXURY STORE
            </p>

            <span>
              Timeless pieces for modern
              distinction.
            </span>

          </div>


          <div className="lux-footer-links">

            <div>

              <strong>
                SHOP
              </strong>

              <button
                onClick={() => {
                  setSelectedCategory("All");

                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
              >
                All Products
              </button>

              {categories
                .slice(1, 5)
                .map((category) => (

                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(
                        category
                      );

                      document
                        .getElementById(
                          "lux-products"
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                        });
                    }}
                  >
                    {category}
                  </button>

                ))}

            </div>


            <div>

              <strong>
                ABOUT
              </strong>

              <span>
                Our Story
              </span>

              <span>
                Quality
              </span>

              <span>
                Shipping
              </span>

              <span>
                Returns
              </span>

            </div>


            <div>

              <strong>
                CONNECT
              </strong>

              <span>
                Instagram
              </span>

              <span>
                Facebook
              </span>

              <span>
                WhatsApp
              </span>

              <span>
                Contact Us
              </span>

            </div>

          </div>

        </div>


        <div className="lux-footer-bottom">

          <span>
            © 2026 LUXORA. ALL RIGHTS RESERVED.
          </span>

          <span>
            DESIGNED FOR DISTINCTION.
          </span>

        </div>

      </footer>


      {/* =====================================================
          PRODUCT DETAIL
      ===================================================== */}

      {selectedProduct && (

        <div
          className="lux-product-overlay"
          onClick={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
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


            {/* =================================================
                PRODUCT IMAGE GALLERY
            ================================================= */}

            <section className="lux-gallery">

              {(() => {

                const images =
                  getProductImages(
                    selectedProduct
                  );

                return (

                  <div
                    className="lux-gallery-stage"
                    onTouchStart={
                      handleGalleryTouchStart
                    }
                    onTouchEnd={
                      handleGalleryTouchEnd
                    }
                  >

                    {images.length > 0 ? (

                      <>

                        <div className="lux-main-image">

                          <img
                            key={selectedImage}
                            src={selectedImage}
                            alt={
                              selectedProduct.name
                            }
                            draggable="false"
                            onError={(e) => {
                              e.currentTarget.style.opacity =
                                "0.25";
                            }}
                          />

                        </div>


                        {images.length > 1 && (

                          <>

                            <button
                              type="button"
                              className="lux-gallery-arrow lux-gallery-prev"
                              onClick={() =>
                                changeProductImage(
                                  "prev"
                                )
                              }
                              aria-label="Previous image"
                            >
                              <span>
                                ‹
                              </span>
                            </button>


                            <button
                              type="button"
                              className="lux-gallery-arrow lux-gallery-next"
                              onClick={() =>
                                changeProductImage(
                                  "next"
                                )
                              }
                              aria-label="Next image"
                            >
                              <span>
                                ›
                              </span>
                            </button>

                          </>

                        )}


                        <div className="lux-gallery-counter">

                          {String(
                            selectedImageIndex + 1
                          ).padStart(2, "0")}

                          <span>
                            /
                          </span>

                          {String(
                            images.length
                          ).padStart(2, "0")}

                        </div>


                        {images.length > 1 && (

                          <div className="lux-gallery-dots">

                            {images.map(
                              (
                                image,
                                index
                              ) => (

                                <button
                                  type="button"
                                  key={`${image}-${index}`}
                                  className={
                                    index ===
                                    selectedImageIndex
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() =>
                                    selectProductImage(
                                      index
                                    )
                                  }
                                  aria-label={`Image ${
                                    index + 1
                                  }`}
                                />

                              )
                            )}

                          </div>

                        )}


                        <div className="lux-gallery-brand">
                          LUXORA
                        </div>


                        <div className="lux-gallery-swipe-label">
                          SWIPE TO EXPLORE
                        </div>

                      </>

                    ) : (

                      <div className="lux-image-empty">

                        <span>
                          LUXORA
                        </span>

                      </div>

                    )}

                  </div>

                );

              })()}

            </section>


            {/* =================================================
                PRODUCT INFORMATION
            ================================================= */}

            <section className="lux-product-info">

              <div className="lux-product-eyebrow">

                {selectedProduct.category ||
                  "LUXORA COLLECTION"}

              </div>


              <h1 className="lux-product-title">

                {selectedProduct.name}

              </h1>


              <div className="lux-rating-row">

                <span className="lux-stars">
                  ★★★★★
                </span>

                <span>
                  4.8
                </span>

                <span className="lux-review-count">
                  24 Reviews
                </span>

              </div>


              <div className="lux-price-row">

                <span className="lux-current-price">

                  ₹
                  {selectedProduct.price.toLocaleString(
                    "en-IN"
                  )}

                </span>


                {selectedProduct.oldPrice >
                  selectedProduct.price && (

                  <del className="lux-old-price">

                    ₹
                    {selectedProduct.oldPrice.toLocaleString(
                      "en-IN"
                    )}

                  </del>

                )}


                {selectedProduct.oldPrice >
                  selectedProduct.price && (

                  <span className="lux-discount">

                    {Math.round(
                      (
                        (
                          selectedProduct.oldPrice -
                          selectedProduct.price
                        ) /
                        selectedProduct.oldPrice
                      ) * 100
                    )}
                    % OFF

                  </span>

                )}

              </div>


              <p className="lux-price-note">

                Tax included · Free delivery
                above ₹1,999

              </p>


              <div className="lux-divider" />


              {selectedProduct.description && (

                <div className="lux-description">

                  <p>
                    {selectedProduct.description}
                  </p>

                </div>

              )}


              {/* =================================================
                  QUANTITY ONLY
              ================================================= */}

              <div className="lux-quantity-section">

                <span className="lux-option-label">
                  QUANTITY
                </span>

                <div className="lux-quantity">

                  <button
                    type="button"
                    onClick={() =>
                      setDetailQuantity(
                        Math.max(
                          1,
                          detailQuantity - 1
                        )
                      )
                    }
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>

                  <span>
                    {detailQuantity}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setDetailQuantity(
                        Math.min(
                          Number(
                            selectedProduct.stock ||
                              99
                          ),
                          detailQuantity + 1
                        )
                      )
                    }
                    aria-label="Increase quantity"
                  >
                    +
                  </button>

                </div>

              </div>


              {/* =================================================
                  PRODUCT BUTTONS
              ================================================= */}

              <div className="lux-product-actions">

                <button
                  type="button"
                  className="lux-add-button"
                  disabled={
                    selectedProduct.stock <= 0
                  }
                  onClick={() => {

                    addToCart(
                      selectedProduct,
                      detailQuantity
                    );

                    setCartOpen(true);
                    closeProduct();

                  }}
                >
                  ADD TO CART
                  <span>
                    →
                  </span>
                </button>


                <button
                  type="button"
                  className="lux-buy-button"
                  disabled={
                    selectedProduct.stock <= 0
                  }
                  onClick={buyNow}
                >
                  BUY NOW
                </button>

              </div>


              {/* =================================================
                  SERVICES
              ================================================= */}

              <div className="lux-service-list">

                <div className="lux-service-item">

                  <span>
                    01
                  </span>

                  <div>

                    <strong>
                      PREMIUM QUALITY
                    </strong>

                    <p>
                      Carefully selected materials
                      and refined finishing.
                    </p>

                  </div>

                </div>


                <div className="lux-service-item">

                  <span>
                    02
                  </span>

                  <div>

                    <strong>
                      FREE DELIVERY
                    </strong>

                    <p>
                      On orders above ₹1,999.
                    </p>

                  </div>

                </div>


                <div className="lux-service-item">

                  <span>
                    03
                  </span>

                  <div>

                    <strong>
                      SECURE SHOPPING
                    </strong>

                    <p>
                      Safe and secure checkout.
                    </p>

                  </div>

                </div>

              </div>


              {/* =================================================
                  DETAILS
              ================================================= */}

              <div className="lux-details">

                <details open>

                  <summary>
                    PRODUCT DETAILS
                    <span>
                      +
                    </span>
                  </summary>

                  <div className="lux-details-content">

                    <p>
                      {selectedProduct.description ||
                        "A refined LUXORA piece designed for everyday elegance."}
                    </p>

                    <div className="lux-specs">

                      <div>

                        <span>
                          Category
                        </span>

                        <strong>
                          {selectedProduct.category ||
                            "—"}
                        </strong>

                      </div>


                      <div>

                        <span>
                          Availability
                        </span>

                        <strong>
                          {selectedProduct.stock >
                          0
                            ? "In Stock"
                            : "Sold Out"}
                        </strong>

                      </div>


                      <div>

                        <span>
                          Product ID
                        </span>

                        <strong>
                          #{selectedProduct.id}
                        </strong>

                      </div>

                    </div>

                  </div>

                </details>


                <details>

                  <summary>
                    SHIPPING & RETURNS
                    <span>
                      +
                    </span>
                  </summary>

                  <div className="lux-details-content">

                    <p>
                      Free delivery is available
                      on orders above ₹1,999.
                    </p>

                    <p>
                      Orders are securely packed
                      and processed with care.
                    </p>

                  </div>

                </details>


                <details>

                  <summary>
                    CARE GUIDE
                    <span>
                      +
                    </span>
                  </summary>

                  <div className="lux-details-content">

                    <p>
                      Keep your product away from
                      moisture and direct sunlight.
                      Clean gently using a soft cloth.
                    </p>

                  </div>

                </details>

              </div>


              {/* =================================================
                  PRODUCT REVIEWS
              ================================================= */}

              <div className="lux-product-reviews">

                <div className="lux-product-reviews-head">

                  <div>

                    <span>
                      CUSTOMER STORIES
                    </span>

                    <h2>
                      Loved by our customers
                    </h2>

                  </div>

                  <strong>
                    4.8 ★
                  </strong>

                </div>


                <div className="lux-product-review-card">

                  <div>
                    <strong>
                      Pooja Sharma
                    </strong>

                    <span>
                      ★★★★★
                    </span>
                  </div>

                  <h3>
                    Beautiful quality
                  </h3>

                  <p>
                    The finish looks elegant
                    and premium.
                  </p>

                  <small>
                    Sample Review
                  </small>

                </div>

              </div>

            </section>

          </div>

        </div>

      )}


      {/* =====================================================
          CART DRAWER
      ===================================================== */}

      {cartOpen && (

        <div
          className="lux-cart-overlay"
          onClick={(e) => {

            if (
              e.target ===
              e.currentTarget
            ) {
              setCartOpen(false);
              document.body.style.overflow = "";
            }

          }}
        >

          <aside className="lux-cart">

            <div className="lux-cart-header">

              <div>

                <span>
                  YOUR SELECTION
                </span>

                <h2>
                  Shopping Bag
                </h2>

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

                <div>
                  ♡
                </div>

                <h3>
                  Your bag is empty
                </h3>

                <p>
                  Discover something beautiful.
                </p>

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

                  {cart.map(
                    (item, index) => {

                      const image =
                        getProductImages(
                          item
                        )[0];

                      return (

                        <div
                          className="lux-cart-item"
                          key={`${item.id}-${index}`}
                        >

                          <div className="lux-cart-item-image">

                            {image && (

                              <img
                                src={image}
                                alt={item.name}
                              />

                            )}

                          </div>


                          <div className="lux-cart-item-info">

                            <span>
                              {item.category ||
                                "COLLECTION"}
                            </span>

                            <h3>
                              {item.name}
                            </h3>

                            <strong>
                              ₹
                              {(
                                item.price *
                                item.quantity
                              ).toLocaleString(
                                "en-IN"
                              )}
                            </strong>


                            <div className="lux-cart-controls">

                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(
                                    index,
                                    -1
                                  )
                                }
                              >
                                −
                              </button>

                              <span>
                                {item.quantity}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(
                                    index,
                                    1
                                  )
                                }
                              >
                                +
                              </button>

                              <button
                                className="lux-remove"
                                type="button"
                                onClick={() =>
                                  removeFromCart(
                                    index
                                  )
                                }
                              >
                                Remove
                              </button>

                            </div>

                          </div>

                        </div>

                      );

                    }
                  )}

                </div>


                <div className="lux-cart-summary">

                  <div>

                    <span>
                      Subtotal
                    </span>

                    <strong>
                      ₹
                      {totalPrice.toLocaleString(
                        "en-IN"
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      Delivery
                    </span>

                    <strong>
                      {deliveryCharge === 0
                        ? "FREE"
                        : `₹${deliveryCharge}`}
                    </strong>

                  </div>


                  <div className="lux-total">

                    <span>
                      Total
                    </span>

                    <strong>
                      ₹
                      {checkoutTotal.toLocaleString(
                        "en-IN"
                      )}
                    </strong>

                  </div>


                  <button
                    type="button"
                    className="lux-checkout-button"
                    onClick={openCheckout}
                  >
                    PROCEED TO CHECKOUT
                    <span>
                      →
                    </span>
                  </button>

                </div>

              </>

            )}

          </aside>

        </div>

      )}


      {/* =====================================================
          CHECKOUT
      ===================================================== */}

      {checkoutOpen && (

        <div className="lux-checkout-overlay">

          <div className="lux-checkout">

            <div className="lux-checkout-topbar">

              <div className="lux-checkout-logo">
                LUXORA
              </div>

              <div>
                SECURE CHECKOUT
              </div>

              <button
                type="button"
                className="lux-checkout-close"
                onClick={closeCheckout}
              >
                ×
              </button>

            </div>


            {orderPlaced ? (

              <div className="lux-order-success">

                <div className="lux-success-ring">

                  <span>
                    ✓
                  </span>

                </div>

                <span className="lux-success-label">
                  ORDER CONFIRMED
                </span>

                <h1>
                  Thank you.
                </h1>

                <p>
                  Your LUXORA order has been
                  received successfully.
                </p>

                {orderReference && (

                  <div className="lux-order-reference">

                    ORDER
                    <strong>
                      #{orderReference}
                    </strong>

                  </div>

                )}

                <div className="lux-success-line" />

                <button
                  type="button"
                  onClick={() => {

                    setOrderPlaced(false);
                    setCheckoutOpen(false);
                    setCart([]);

                    document.body.style.overflow =
                      "";

                  }}
                >
                  CONTINUE SHOPPING
                </button>

              </div>

            ) : (

              <>

                <div className="lux-checkout-heading">

                  <div>

                    <span>
                      01 · DELIVERY
                    </span>

                    <h1>
                      Complete your order
                    </h1>

                    <p>
                      Where should we send your
                      LUXORA selection?
                    </p>

                  </div>

                  <div className="lux-checkout-secure">

                    <span>
                      🔒
                    </span>

                    <div>

                      <strong>
                        SECURE
                      </strong>

                      <small>
                        100% protected checkout
                      </small>

                    </div>

                  </div>

                </div>


                <div className="lux-checkout-progress">

                  <div className="active">

                    <span>
                      01
                    </span>

                    <strong>
                      DELIVERY
                    </strong>

                  </div>

                  <div>

                    <span>
                      02
                    </span>

                    <strong>
                      PAYMENT
                    </strong>

                  </div>

                  <div>

                    <span>
                      03
                    </span>

                    <strong>
                      CONFIRMATION
                    </strong>

                  </div>

                </div>


                <form
                  onSubmit={placeOrder}
                  className="lux-checkout-grid"
                >

                  {/* =================================================
                      CUSTOMER FORM
                  ================================================= */}

                  <div className="lux-customer-form">

                    <div className="lux-form-title">

                      <span>
                        SHIPPING DETAILS
                      </span>

                      <h2>
                        Delivery information
                      </h2>

                    </div>


                    <label>

                      FULL NAME

                      <input
                        required
                        value={customer.name}
                        onChange={(e) =>
                          handleCustomerChange(
                            "name",
                            e.target.value
                          )
                        }
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
                          value={
                            customer.mobile
                          }
                          onChange={(e) =>
                            handleCustomerChange(
                              "mobile",
                              e.target.value
                            )
                          }
                          placeholder="10 digit mobile number"
                          inputMode="numeric"
                          maxLength={10}
                          pattern="[0-9]{10}"
                          autoComplete="tel"
                        />

                        <small className="lux-input-help">
                          {customer.mobile.length}/10 digits
                        </small>

                      </label>


                      <label>

                        EMAIL ADDRESS

                        <input
                          type="email"
                          value={
                            customer.email
                          }
                          onChange={(e) =>
                            handleCustomerChange(
                              "email",
                              e.target.value
                            )
                          }
                          placeholder="you@example.com"
                          autoComplete="email"
                        />

                      </label>

                    </div>


                    <label>

                      FULL ADDRESS

                      <textarea
                        required
                        value={
                          customer.address
                        }
                        onChange={(e) =>
                          handleCustomerChange(
                            "address",
                            e.target.value
                          )
                        }
                        placeholder="House / Flat / Street / Area"
                        autoComplete="street-address"
                      />

                    </label>


                    <div className="lux-form-row three">

                      <label>

                        CITY

                        <input
                          required
                          value={
                            customer.city
                          }
                          onChange={(e) =>
                            handleCustomerChange(
                              "city",
                              e.target.value
                            )
                          }
                          placeholder="City"
                          autoComplete="address-level2"
                        />

                      </label>


                      <label>

                        STATE

                        <input
                          required
                          value={
                            customer.state
                          }
                          onChange={(e) =>
                            handleCustomerChange(
                              "state",
                              e.target.value
                            )
                          }
                          placeholder="State"
                          autoComplete="address-level1"
                        />

                      </label>


                      <label>

                        PINCODE

                        <input
                          required
                          type="text"
                          value={
                            customer.pincode
                          }
                          onChange={(e) =>
                            handleCustomerChange(
                              "pincode",
                              e.target.value
                            )
                          }
                          placeholder="6 digit pincode"
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          autoComplete="postal-code"
                        />

                        <small className="lux-input-help">
                          {customer.pincode.length}/6 digits
                        </small>

                      </label>

                    </div>


                    <div className="lux-checkout-note">

                      <span>
                        ✓
                      </span>

                      <p>
                        Your information is used
                        only to process and deliver
                        your order securely.
                      </p>

                    </div>

                  </div>


                  {/* =================================================
                      ORDER SUMMARY
                  ================================================= */}

                  <aside className="lux-order-summary">

                    <div className="lux-summary-heading">

                      <span>
                        YOUR SELECTION
                      </span>

                      <h2>
                        Order summary
                      </h2>

                    </div>


                    <div className="lux-summary-products">

                      {cart.map(
                        (item, index) => {

                          const image =
                            getProductImages(
                              item
                            )[0];

                          return (

                            <div
                              className="lux-summary-item"
                              key={`${item.id}-${index}`}
                            >

                              <div className="lux-summary-image">

                                {image && (

                                  <img
                                    src={image}
                                    alt={item.name}
                                  />

                                )}

                                <span>
                                  {item.quantity}
                                </span>

                              </div>


                              <section>

                                <span>
                                  {item.category ||
                                    "COLLECTION"}
                                </span>

                                <h3>
                                  {item.name}
                                </h3>

                              </section>


                              <strong>
                                ₹
                                {(
                                  item.price *
                                  item.quantity
                                ).toLocaleString(
                                  "en-IN"
                                )}
                              </strong>

                            </div>

                          );

                        }
                      )}

                    </div>


                    <div className="lux-summary-lines">

                      <div>

                        <span>
                          Subtotal
                        </span>

                        <strong>
                          ₹
                          {totalPrice.toLocaleString(
                            "en-IN"
                          )}
                        </strong>

                      </div>


                      <div>

                        <span>
                          Delivery
                        </span>

                        <strong>
                          {deliveryCharge === 0
                            ? "FREE"
                            : `₹${deliveryCharge}`}
                        </strong>

                      </div>


                      <div className="lux-summary-grand">

                        <span>
                          TOTAL
                        </span>

                        <strong>
                          ₹
                          {checkoutTotal.toLocaleString(
                            "en-IN"
                          )}
                        </strong>

                      </div>

                    </div>


                    <button
                      type="submit"
                      className="lux-place-order"
                      disabled={orderLoading}
                    >

                      {orderLoading
                        ? "PROCESSING..."
                        : "PLACE ORDER"}

                      {!orderLoading && (
                        <span>
                          →
                        </span>
                      )}

                    </button>


                    <div className="lux-payment-trust">

                      <span>
                        🔒
                      </span>

                      <div>

                        <strong>
                          100% SECURE PAYMENT
                        </strong>

                        <p>
                          Your payment details are
                          protected and securely
                          processed.
                        </p>

                      </div>

                    </div>


                    <div className="lux-accepted">

                      <span>
                        WE ACCEPT
                      </span>

                      <div>
                        <b>
                          UPI
                        </b>

                        <b>
                          VISA
                        </b>

                        <b>
                          RuPay
                        </b>

                        <b>
                          MC
                        </b>
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
