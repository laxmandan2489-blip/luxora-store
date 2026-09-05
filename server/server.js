const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();

/* =====================================================
   CONFIG
   ===================================================== */

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID;

const RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET;

/* =====================================================
   ENV VALIDATION
   ===================================================== */

const requiredEnv = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY],
  ["RAZORPAY_KEY_ID", RAZORPAY_KEY_ID],
  ["RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET]
];

const missingEnv = requiredEnv
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnv.length > 0) {
  console.error(
    "❌ Missing environment variables:",
    missingEnv.join(", ")
  );
}

/* =====================================================
   SUPABASE
   ===================================================== */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/* =====================================================
   RAZORPAY
   ===================================================== */

const razorpay =
  RAZORPAY_KEY_ID &&
  RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET
      })
    : null;

/* =====================================================
   CONSTANTS
   ===================================================== */

const ORDER_STATUSES = [
  "Received",
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled"
];

const PAYMENT_STATUSES = [
  "Pending",
  "Paid",
  "Failed",
  "Refunded"
];

const PAYMENT_METHODS = [
  "Razorpay",
  "COD"
];

const STORAGE_BUCKET =
  "product-images";

/* =====================================================
   CORS
   ===================================================== */

const allowedOrigins = [
  "https://luxora-store-phi.vercel.app",
  "https://luxora-store-mkva.onrender.com"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server / Postman requests.
      if (!origin) {
        return callback(null, true);
      }

      // Development localhost.
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS origin not allowed.")
      );
    },
    credentials: true
  })
);

/* =====================================================
   BODY PARSER
   ===================================================== */

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

/* =====================================================
   OLD LOCAL DIRECTORIES
   ===================================================== */

const DATA_DIR =
  path.join(__dirname, "data");

const UPLOADS_DIR =
  path.join(__dirname, "uploads");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true
  });
}

/* =====================================================
   MULTER
   ===================================================== */

const storage =
  multer.memoryStorage();

const upload =
  multer({
    storage,
    limits: {
      files: 20,
      fileSize:
        10 * 1024 * 1024
    },
    fileFilter:
      function (
        req,
        file,
        cb
      ) {
        if (
          file.mimetype &&
          file.mimetype.startsWith(
            "image/"
          )
        ) {
          cb(null, true);
        } else {
          cb(
            new Error(
              "Only image files are allowed."
            )
          );
        }
      }
  });

/* =====================================================
   HELPERS
   ===================================================== */

function safeNumber(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function uniqueImages(
  images
) {
  if (!Array.isArray(images)) {
    return [];
  }

  return [
    ...new Set(
      images.filter(Boolean)
    )
  ];
}

function normalizeColors(
  colors
) {
  if (
    Array.isArray(colors)
  ) {
    return colors
      .map((color) =>
        String(color).trim()
      )
      .filter(Boolean);
  }

  if (
    typeof colors === "string"
  ) {
    return colors
      .split(",")
      .map((color) =>
        color.trim()
      )
      .filter(Boolean);
  }

  return [];
}

function normalizeImages(
  images
) {
  if (
    Array.isArray(images)
  ) {
    return uniqueImages(
      images
    );
  }

  if (
    typeof images === "string" &&
    images.trim()
  ) {
    try {
      const parsed =
        JSON.parse(images);

      if (
        Array.isArray(parsed)
      ) {
        return uniqueImages(
          parsed
        );
      }
    } catch {
      return uniqueImages(
        images
          .split(",")
          .map((item) =>
            item.trim()
          )
          .filter(Boolean)
      );
    }
  }

  return [];
}

/* =====================================================
   STORAGE HELPERS
   ===================================================== */

function getStoragePathFromUrl(
  imageUrl
) {
  if (
    !imageUrl ||
    typeof imageUrl !==
      "string"
  ) {
    return null;
  }

  const marker =
    `/storage/v1/object/public/${STORAGE_BUCKET}/`;

  const index =
    imageUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return imageUrl
    .slice(
      index + marker.length
    )
    .split("?")[0];
}

async function uploadImage(
  file
) {
  const extension =
    path.extname(
      file.originalname || ""
    ) || ".jpg";

  const originalName =
    path.basename(
      file.originalname || "product",
      extension
    );

  const safeName =
    originalName
      .replace(
        /[^a-zA-Z0-9-_]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  const filename =
    `${Date.now()}-${Math.round(
      Math.random() * 1000000
    )}-${safeName || "product"}${extension}`;

  const storagePath =
    `products/${filename}`;

  const { error } =
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(
        storagePath,
        file.buffer,
        {
          contentType:
            file.mimetype,
          upsert: true
        }
      );

  if (error) {
    throw error;
  }

  const {
    data
  } =
    supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(
        storagePath
      );

  return data.publicUrl;
}

async function deleteStorageImages(
  images
) {
  const paths =
    uniqueImages(images)
      .map(
        getStoragePathFromUrl
      )
      .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const { error } =
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(paths);

  if (error) {
    console.error(
      "STORAGE DELETE ERROR:",
      error
    );
  }
}

/* =====================================================
   PRODUCT FORMATTER
   ===================================================== */

function formatProduct(
  product
) {
  if (!product) {
    return null;
  }

  const images =
    normalizeImages(
      product.images
    );

  /*
   * IMPORTANT:
   * Database does NOT have an "image" column.
   * Frontend still receives "image" from images[0].
   */

  const mainImage =
    images[0] ||
    "";

  return {
    id:
      product.id,

    name:
      product.name || "",

    category:
      product.category || "Bags",

    price:
      safeNumber(
        product.price
      ),

    oldPrice:
      safeNumber(
        product.old_price ??
          product.oldPrice
      ),

    stock:
      Math.max(
        0,
        Math.floor(
          safeNumber(
            product.stock
          )
        )
      ),

    description:
      product.description || "",

    colors:
      normalizeColors(
        product.colors
      ),

    images,

    /*
     * Frontend compatibility.
     * This is generated from images[0].
     */

    image:
      mainImage,

    createdAt:
      product.created_at ||
      product.createdAt ||
      null,

    updatedAt:
      product.updated_at ||
      product.updatedAt ||
      null,

    active:
      product.active !== false
  };
}

/* =====================================================
   ORDER FORMATTER
   ===================================================== */

function formatOrder(
  order
) {
  if (!order) {
    return null;
  }

  return {
    id:
      order.id,

    orderId:
      order.order_id ||
      order.orderId ||
      "",

    orderReference:
      order.order_reference ||
      order.orderReference ||
      order.reference ||
      "",

    reference:
      order.reference ||
      order.order_reference ||
      order.orderReference ||
      "",

    status:
      order.status ||
      "Received",

    paymentStatus:
      order.payment_status ||
      order.paymentStatus ||
      "Pending",

    paymentMethod:
      order.payment_method ||
      order.paymentMethod ||
      "",

    subtotal:
      safeNumber(
        order.subtotal
      ),

    delivery:
      safeNumber(
        order.delivery
      ),

    discount:
      safeNumber(
        order.discount
      ),

    total:
      safeNumber(
        order.total
      ),

    customer:
      order.customer || null,

    items:
      order.items || [],

    courierName:
      order.courier_name ||
      order.courierName ||
      "",

    trackingNumber:
      order.tracking_number ||
      order.trackingNumber ||
      "",

    trackingUrl:
      order.tracking_url ||
      order.trackingUrl ||
      "",

    createdAt:
      order.created_at ||
      order.createdAt ||
      null,

    updatedAt:
      order.updated_at ||
      order.updatedAt ||
      null
  };
}

/* =====================================================
   CUSTOMER VALIDATION
   ===================================================== */

function validateCustomer(
  customer
) {
  if (
    !customer ||
    typeof customer !==
      "object"
  ) {
    return "Customer details are required.";
  }

  const required = [
    "name",
    "mobile",
    "email",
    "address",
    "city",
    "state",
    "pincode"
  ];

  for (
    const field of required
  ) {
    if (
      !String(
        customer[field] || ""
      ).trim()
    ) {
      return `${field} is required.`;
    }
  }

  const mobile =
    String(
      customer.mobile
    ).replace(/\D/g, "");

  if (
    !/^[0-9]{10}$/.test(
      mobile
    )
  ) {
    return "Please enter a valid 10 digit mobile number.";
  }

  const pincode =
    String(
      customer.pincode
    ).replace(/\D/g, "");

  if (
    !/^[0-9]{6}$/.test(
      pincode
    )
  ) {
    return "Please enter a valid 6 digit pincode.";
  }

  return null;
}

/* =====================================================
   SECURE CART CALCULATION
   ===================================================== */

async function calculateCart(
  items
) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Cart is empty."
    );
  }

  const normalizedItems =
    items.map(
      function (item) {
        return {
          id:
            Number(item.id),

          quantity:
            Math.floor(
              Number(
                item.quantity
              )
            )
        };
      }
    );

  for (
    const item of normalizedItems
  ) {
    if (
      !Number.isFinite(item.id) ||
      item.id <= 0
    ) {
      throw new Error(
        "Invalid product ID."
      );
    }

    if (
      !Number.isFinite(
        item.quantity
      ) ||
      item.quantity <= 0
    ) {
      throw new Error(
        "Invalid product quantity."
      );
    }
  }

  const productIds =
    [
      ...new Set(
        normalizedItems.map(
          (item) => item.id
        )
      )
    ];

  const {
    data: products,
    error
  } =
    await supabase
      .from("products")
      .select("*")
      .in(
        "id",
        productIds
      );

  if (error) {
    throw error;
  }

  if (
    !Array.isArray(products)
  ) {
    throw new Error(
      "Unable to load products."
    );
  }

  const productMap =
    new Map(
      products.map(
        (product) => [
          String(product.id),
          product
        ]
      )
    );

  const cartItems = [];

  let subtotal = 0;

  for (
    const requestedItem
      of normalizedItems
  ) {
    const product =
      productMap.get(
        String(
          requestedItem.id
        )
      );

    if (!product) {
      throw new Error(
        `Product ${requestedItem.id} not found.`
      );
    }

    if (
      product.active === false
    ) {
      throw new Error(
        `${product.name} is no longer available.`
      );
    }

    const stock =
      Math.max(
        0,
        Math.floor(
          safeNumber(
            product.stock
          )
        )
      );

    if (
      stock <
      requestedItem.quantity
    ) {
      throw new Error(
        `${product.name} has only ${stock} item(s) left in stock.`
      );
    }

    const price =
      safeNumber(
        product.price
      );

    if (
      price <= 0
    ) {
      throw new Error(
        `${product.name} has an invalid price.`
      );
    }

    const lineTotal =
      price *
      requestedItem.quantity;

    subtotal +=
      lineTotal;

    const images =
      normalizeImages(
        product.images
      );

    cartItems.push({
      productId:
        product.id,

      name:
        product.name,

      price,

      quantity:
        requestedItem.quantity,

      selectedColor:
        "",

      image:
        images[0] ||
        "",

      lineTotal
    });
  }

  const discount = 0;

  const delivery = 0;

  const total =
    subtotal +
    delivery -
    discount;

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    throw new Error(
      "Order total must be greater than zero."
    );
  }

  return {
    items:
      cartItems,

    subtotal,

    delivery,

    discount,

    total
  };
}

/* =====================================================
   HEALTH CHECK
   ===================================================== */

app.get(
  "/",
  function (req, res) {
    res.json({
      success: true,
      message:
        "LUXORA server is running",
      database:
        "Supabase",
      payment:
        "Razorpay",
      storage:
        "Supabase Storage",
      port:
        PORT
    });
  }
);

/* =====================================================
   DATABASE HEALTH CHECK
   ===================================================== */

app.get(
  "/api/health",
  async function (
    req,
    res
  ) {
    try {
      const {
        error
      } =
        await supabase
          .from("products")
          .select("id")
          .limit(1);

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        database:
          "connected",
        storage:
          "Supabase Storage",
        razorpay:
          razorpay
            ? "configured"
            : "missing"
      });
    } catch (error) {
      console.error(
        "HEALTH ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Database connection failed."
      });
    }
  }
);

/* =====================================================
   GET ALL PRODUCTS
   ===================================================== */

app.get(
  "/api/products",
  async function (
    req,
    res
  ) {
    try {
      const {
        data,
        error
      } =
        await supabase
          .from("products")
          .select("*")
          .eq(
            "active",
            true
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      return res.json({
        success: true,

        products:
          Array.isArray(data)
            ? data.map(
                formatProduct
              )
            : []
      });
    } catch (error) {
      console.error(
        "GET PRODUCTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load products."
      });
    }
  }
);

/* =====================================================
   GET SINGLE PRODUCT
   ===================================================== */

app.get(
  "/api/products/:id",
  async function (
    req,
    res
  ) {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isFinite(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid product ID."
        });
      }

      const {
        data,
        error
      } =
        await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      return res.json({
        success: true,
        product:
          formatProduct(data)
      });
    } catch (error) {
      console.error(
        "GET PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load product."
      });
    }
  }
);

/* =====================================================
   ADD PRODUCT
   ===================================================== */

app.post(
  "/api/products",
  upload.any(),
  async function (
    req,
    res
  ) {
    const uploadedUrls = [];

    try {
      const body =
        req.body || {};

      const name =
        String(
          body.name || ""
        ).trim();

      const category =
        String(
          body.category ||
            "Bags"
        ).trim();

      const price =
        safeNumber(
          body.price
        );

      const oldPrice =
        safeNumber(
          body.oldPrice ??
            body.old_price
        );

      const stock =
        Math.max(
          0,
          Math.floor(
            safeNumber(
              body.stock
            )
          )
        );

      const description =
        String(
          body.description ||
            ""
        );

      const colors =
        normalizeColors(
          body.colors
        );

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Product name is required."
        });
      }

      if (
        !Number.isFinite(
          price
        ) ||
        price <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid product price is required."
        });
      }

      const files =
        Array.isArray(
          req.files
        )
          ? req.files
          : [];

      if (
        files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please upload at least one product image."
        });
      }

      /*
       * UPLOAD IMAGES TO SUPABASE STORAGE
       */

      for (
        const file of files
      ) {
        const url =
          await uploadImage(
            file
          );

        uploadedUrls.push(
          url
        );
      }

      const productId =
        Date.now();

      /*
       * IMPORTANT:
       *
       * products table does NOT contain
       * an "image" column.
       *
       * Therefore we ONLY save images
       * into the JSONB "images" column.
       */

      const {
        data,
        error
      } =
        await supabase
          .from("products")
          .insert({
            id:
              productId,

            name,

            category,

            price,

            old_price:
              oldPrice,

            stock,

            description,

            colors,

            images:
              uniqueImages(
                uploadedUrls
              ),

            active:
              true
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      return res.status(201).json({
        success: true,

        message:
          "Product added successfully.",

        product:
          formatProduct(data)
      });
    } catch (error) {
      console.error(
        "ADD PRODUCT ERROR:",
        error
      );

      /*
       * If database insert failed after
       * image upload, remove uploaded files.
       */

      if (
        uploadedUrls.length
      ) {
        await deleteStorageImages(
          uploadedUrls
        );
      }

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to add product."
      });
    }
  }
);

/* =====================================================
   UPDATE PRODUCT
   ===================================================== */

async function updateProduct(
  req,
  res
) {
  const newUploadedUrls = [];

  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isFinite(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID."
      });
    }

    const {
      data: existing,
      error:
        existingError
    } =
      await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found."
      });
    }

    const body =
      req.body || {};

    const updateData = {};

    if (
      body.name !== undefined
    ) {
      const name =
        String(
          body.name
        ).trim();

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Product name cannot be empty."
        });
      }

      updateData.name =
        name;
    }

    if (
      body.category !==
      undefined
    ) {
      updateData.category =
        String(
          body.category
        ).trim();
    }

    if (
      body.price !==
      undefined
    ) {
      const price =
        safeNumber(
          body.price
        );

      if (price <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Product price must be greater than zero."
        });
      }

      updateData.price =
        price;
    }

    if (
      body.oldPrice !==
        undefined ||
      body.old_price !==
        undefined
    ) {
      updateData.old_price =
        safeNumber(
          body.oldPrice ??
            body.old_price
        );
    }

    if (
      body.stock !==
      undefined
    ) {
      updateData.stock =
        Math.max(
          0,
          Math.floor(
            safeNumber(
              body.stock
            )
          )
        );
    }

    if (
      body.description !==
      undefined
    ) {
      updateData.description =
        String(
          body.description
        );
    }

    if (
      body.colors !==
      undefined
    ) {
      updateData.colors =
        normalizeColors(
          body.colors
        );
    }

    if (
      body.active !==
      undefined
    ) {
      /*
       * Correct handling for both:
       * true / false
       * "true" / "false"
       */

      if (
        typeof body.active ===
        "string"
      ) {
        updateData.active =
          body.active.toLowerCase() ===
          "true";
      } else {
        updateData.active =
          Boolean(
            body.active
          );
      }
    }

    const files =
      Array.isArray(
        req.files
      )
        ? req.files
        : [];

    let oldImages = [];

    /*
     * REPLACE PRODUCT IMAGES
     */

    if (
      files.length > 0
    ) {
      oldImages =
        normalizeImages(
          existing.images
        );

      /*
       * Upload new images.
       */

      for (
        const file of files
      ) {
        const url =
          await uploadImage(
            file
          );

        newUploadedUrls.push(
          url
        );
      }

      /*
       * IMPORTANT:
       * Only update "images".
       * There is NO "image" DB column.
       */

      updateData.images =
        uniqueImages(
          newUploadedUrls
        );
    }

    updateData.updated_at =
      new Date().toISOString();

    const {
      data,
      error
    } =
      await supabase
        .from("products")
        .update(
          updateData
        )
        .eq("id", id)
        .select()
        .single();

    if (error) {
      throw error;
    }

    /*
     * Delete old images only after
     * successful DB update.
     */

    if (
      files.length > 0 &&
      oldImages.length
    ) {
      await deleteStorageImages(
        oldImages
      );
    }

    return res.json({
      success: true,

      message:
        "Product updated successfully.",

      product:
        formatProduct(data)
    });
  } catch (error) {
    console.error(
      "UPDATE PRODUCT ERROR:",
      error
    );

    /*
     * If update failed after new
     * images were uploaded, clean them.
     */

    if (
      newUploadedUrls.length
    ) {
      await deleteStorageImages(
        newUploadedUrls
      );
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update product."
    });
  }
}

app.put(
  "/api/products/:id",
  upload.any(),
  updateProduct
);

app.patch(
  "/api/products/:id",
  upload.any(),
  updateProduct
);

/* =====================================================
   DELETE PRODUCT
   ===================================================== */

app.delete(
  "/api/products/:id",
  async function (
    req,
    res
  ) {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isFinite(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid product ID."
        });
      }

      const {
        data: product,
        error:
          productError
      } =
        await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .maybeSingle();

      if (productError) {
        throw productError;
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      /*
       * SOFT DELETE
       */

      const {
        error
      } =
        await supabase
          .from("products")
          .update({
            active:
              false,

            updated_at:
              new Date().toISOString()
          })
          .eq("id", id);

      if (error) {
        throw error;
      }

      /*
       * Product images are NOT immediately
       * deleted because old orders may still
       * need their image URLs.
       */

      return res.json({
        success: true,
        message:
          "Product deleted successfully."
      });
    } catch (error) {
      console.error(
        "DELETE PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to delete product."
      });
    }
  }
);

/* =====================================================
   RAZORPAY CREATE ORDER
   ===================================================== */

app.post(
  "/api/create-order",
  async function (
    req,
    res
  ) {
    try {
      if (!razorpay) {
        return res.status(500).json({
          success: false,
          message:
            "Razorpay is not configured on the server."
        });
      }

      const items =
        req.body?.items;

      /*
       * IMPORTANT:
       * We intentionally DO NOT accept
       * req.body.amount anymore.
       */

      const cart =
        await calculateCart(
          items
        );

      const amountPaise =
        Math.round(
          cart.total * 100
        );

      if (
        !Number.isInteger(
          amountPaise
        ) ||
        amountPaise < 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Order amount must be at least ₹1."
        });
      }

      const receipt =
        `LUXORA_${Date.now()}`;

      console.log(
        "RAZORPAY CREATE:",
        {
          subtotal:
            cart.subtotal,

          delivery:
            cart.delivery,

          discount:
            cart.discount,

          total:
            cart.total,

          amountPaise
        }
      );

      const razorpayOrder =
        await razorpay.orders.create({
          amount:
            amountPaise,

          currency:
            "INR",

          receipt
        });

      return res.json({
        success: true,

        order_id:
          razorpayOrder.id,

        amount:
          razorpayOrder.amount,

        currency:
          razorpayOrder.currency,

        receipt:
          razorpayOrder.receipt
      });
    } catch (error) {
      console.error(
        "RAZORPAY CREATE ORDER ERROR:",
        error
      );

      if (
        error &&
        error.statusCode ===
          401
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Razorpay authentication failed. Please check Razorpay API keys."
        });
      }

      return res.status(500).json({
        success: false,
        message:
          error?.error?.description ||
          error?.message ||
          "Unable to create Razorpay order."
      });
    }
  }
);

/* =====================================================
   RAZORPAY VERIFY PAYMENT
   ===================================================== */

app.post(
  "/api/verify-payment",
  async function (
    req,
    res
  ) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } =
        req.body || {};

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing payment verification fields."
        });
      }

      if (
        !RAZORPAY_KEY_SECRET
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Razorpay secret key is not configured on the server."
        });
      }

      /*
       * Prevent duplicate payment records.
       */

      const {
        data:
          existingPayment,
        error:
          existingPaymentError
      } =
        await supabase
          .from("payments")
          .select("id")
          .eq(
            "razorpay_payment_id",
            razorpay_payment_id
          )
          .maybeSingle();

      if (
        existingPaymentError
      ) {
        console.error(
          "PAYMENT LOOKUP ERROR:",
          existingPaymentError
        );
      }

      if (
        existingPayment
      ) {
        return res.json({
          success: true,
          message:
            "Payment already verified.",
          payment_id:
            razorpay_payment_id,
          order_id:
            razorpay_order_id,
          alreadyVerified:
            true
        });
      }

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_KEY_SECRET
          )
          .update(
            `${razorpay_order_id}|${razorpay_payment_id}`
          )
          .digest("hex");

      const expectedBuffer =
        Buffer.from(
          generatedSignature,
          "utf8"
        );

      const receivedBuffer =
        Buffer.from(
          razorpay_signature,
          "utf8"
        );

      if (
        expectedBuffer.length !==
        receivedBuffer.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment signature verification failed."
        });
      }

      const valid =
        crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        );

      if (!valid) {
        return res.status(400).json({
          success: false,
          message:
            "Payment signature verification failed."
        });
      }

      console.log(
        "RAZORPAY PAYMENT VERIFIED:",
        razorpay_payment_id
      );

      return res.json({
        success: true,

        message:
          "Payment verified successfully.",

        payment_id:
          razorpay_payment_id,

        order_id:
          razorpay_order_id
      });
    } catch (error) {
      console.error(
        "RAZORPAY VERIFY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to verify payment."
      });
    }
  }
);

/* =====================================================
   CREATE FINAL ORDER
   ===================================================== */

app.post(
  "/api/orders",
  async function (
    req,
    res
  ) {
    let createdOrderId =
      null;

    try {
      const body =
        req.body || {};

      const customer =
        body.customer;

      const customerError =
        validateCustomer(
          customer
        );

      if (
        customerError
      ) {
        return res.status(400).json({
          success: false,
          message:
            customerError
        });
      }

      const items =
        body.items;

      const payment =
        body.payment || {};

      const paymentMethod =
        payment.method ||
        "Razorpay";

      if (
        !PAYMENT_METHODS.includes(
          paymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment method."
        });
      }

      /*
       * SERVER-SIDE PRICE CALCULATION
       */

      const cart =
        await calculateCart(
          items
        );

      let paymentStatus =
        "Pending";

      if (
        paymentMethod ===
        "Razorpay"
      ) {
        const razorpayOrderId =
          payment.razorpayOrderId ||
          payment.razorpay_order_id;

        const razorpayPaymentId =
          payment.razorpayPaymentId ||
          payment.razorpay_payment_id;

        const razorpaySignature =
          payment.razorpaySignature ||
          payment.razorpay_signature;

        if (
          !razorpayOrderId ||
          !razorpayPaymentId ||
          !razorpaySignature
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Razorpay payment details are required."
          });
        }

        /*
         * Verify signature again before
         * creating permanent order.
         */

        const generatedSignature =
          crypto
            .createHmac(
              "sha256",
              RAZORPAY_KEY_SECRET
            )
            .update(
              `${razorpayOrderId}|${razorpayPaymentId}`
            )
            .digest("hex");

        const a =
          Buffer.from(
            generatedSignature,
            "utf8"
          );

        const b =
          Buffer.from(
            razorpaySignature,
            "utf8"
          );

        if (
          a.length !==
          b.length ||
          !crypto.timingSafeEqual(
            a,
            b
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Payment verification failed."
          });
        }

        /*
         * Duplicate payment protection.
         */

        const {
          data:
            duplicatePayment,
          error:
            duplicatePaymentError
        } =
          await supabase
            .from("payments")
            .select("id, order_id")
            .eq(
              "razorpay_payment_id",
              razorpayPaymentId
            )
            .maybeSingle();

        if (
          duplicatePaymentError
        ) {
          throw duplicatePaymentError;
        }

        if (
          duplicatePayment
        ) {
          return res.status(409).json({
            success: false,
            message:
              "This payment has already been used for an order."
          });
        }

        paymentStatus =
          "Paid";
      }

      if (
        paymentMethod ===
        "COD"
      ) {
        paymentStatus =
          "Pending";
      }

      /*
       * CUSTOMER
       */

      const cleanCustomer = {
        name:
          String(
            customer.name
          ).trim(),

        mobile:
          String(
            customer.mobile
          ).replace(
            /\D/g,
            ""
          ),

        email:
          String(
            customer.email
          ).trim()
          .toLowerCase(),

        address:
          String(
            customer.address
          ).trim(),

        city:
          String(
            customer.city
          ).trim(),

        state:
          String(
            customer.state
          ).trim(),

        pincode:
          String(
            customer.pincode
          ).replace(
            /\D/g,
            ""
          )
      };

      /*
       * FIND / CREATE CUSTOMER
       */

      let customerRecord =
        null;

      const {
        data:
          existingCustomer,
        error:
          customerLookupError
      } =
        await supabase
          .from("customers")
          .select("*")
          .eq(
            "email",
            cleanCustomer.email
          )
          .maybeSingle();

      if (
        customerLookupError
      ) {
        throw customerLookupError;
      }

      if (
        existingCustomer
      ) {
        customerRecord =
          existingCustomer;

        const {
          data:
            updatedCustomer,
          error:
            updateCustomerError
        } =
          await supabase
            .from("customers")
            .update({
              name:
                cleanCustomer.name,

              mobile:
                cleanCustomer.mobile,

              address:
                cleanCustomer.address,

              city:
                cleanCustomer.city,

              state:
                cleanCustomer.state,

              pincode:
                cleanCustomer.pincode,

              updated_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              existingCustomer.id
            )
            .select()
            .single();

        if (
          updateCustomerError
        ) {
          throw updateCustomerError;
        }

        customerRecord =
          updatedCustomer;
      } else {
        const {
          data:
            newCustomer,
          error:
            createCustomerError
        } =
          await supabase
            .from("customers")
            .insert({
              name:
                cleanCustomer.name,

              mobile:
                cleanCustomer.mobile,

              email:
                cleanCustomer.email,

              address:
                cleanCustomer.address,

              city:
                cleanCustomer.city,

              state:
                cleanCustomer.state,

              pincode:
                cleanCustomer.pincode
            })
            .select()
            .single();

        if (
          createCustomerError
        ) {
          throw createCustomerError;
        }

        customerRecord =
          newCustomer;
      }

      /*
       * ORDER REFERENCE
       */

      const orderReference =
        `LUX-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 7)
          .toUpperCase()}`;

      /*
       * CREATE ORDER
       */

      const {
        data:
          order,
        error:
          orderError
      } =
        await supabase
          .from("orders")
          .insert({
            customer_id:
              customerRecord.id,

            order_reference:
              orderReference,

            reference:
              orderReference,

            status:
              "Received",

            payment_status:
              paymentStatus,

            payment_method:
              paymentMethod,

            subtotal:
              cart.subtotal,

            delivery:
              cart.delivery,

            discount:
              cart.discount,

            total:
              cart.total,

            customer:
              cleanCustomer,

            updated_at:
              new Date().toISOString()
          })
          .select()
          .single();

      if (orderError) {
        throw orderError;
      }

      createdOrderId =
        order.id;

      /*
       * ORDER ITEMS
       */

      const orderItems =
        cart.items.map(
          function (item) {
            return {
              order_id:
                order.id,

              product_id:
                item.productId,

              product_name:
                item.name,

              product_price:
                item.price,

              quantity:
                item.quantity,

              selected_color:
                item.selectedColor,

              product_image:
                item.image,

              line_total:
                item.lineTotal
            };
          }
        );

      const {
        error:
          orderItemsError
      } =
        await supabase
          .from("order_items")
          .insert(
            orderItems
          );

      if (
        orderItemsError
      ) {
        throw orderItemsError;
      }

      /*
       * PAYMENT RECORD
       */

      const razorpayOrderId =
        payment.razorpayOrderId ||
        payment.razorpay_order_id ||
        null;

      const razorpayPaymentId =
        payment.razorpayPaymentId ||
        payment.razorpay_payment_id ||
        null;

      const razorpaySignature =
        payment.razorpaySignature ||
        payment.razorpay_signature ||
        null;

      const {
        error:
          paymentError
      } =
        await supabase
          .from("payments")
          .insert({
            order_id:
              order.id,

            method:
              paymentMethod,

            status:
              paymentStatus,

            amount:
              cart.total,

            razorpay_order_id:
              razorpayOrderId,

            razorpay_payment_id:
              razorpayPaymentId,

            razorpay_signature:
              razorpaySignature
          });

      if (
        paymentError
      ) {
        throw paymentError;
      }

      /*
       * STOCK UPDATE
       */

      for (
        const item
          of cart.items
      ) {
        const {
          data:
            currentProduct,
          error:
            stockReadError
        } =
          await supabase
            .from("products")
            .select(
              "id, name, stock"
            )
            .eq(
              "id",
              item.productId
            )
            .maybeSingle();

        if (
          stockReadError
        ) {
          throw stockReadError;
        }

        if (
          !currentProduct
        ) {
          throw new Error(
            `Product ${item.productId} no longer exists.`
          );
        }

        const currentStock =
          Math.floor(
            safeNumber(
              currentProduct.stock
            )
          );

        if (
          currentStock <
          item.quantity
        ) {
          throw new Error(
            `${currentProduct.name} is no longer available in the requested quantity.`
          );
        }

        const {
          error:
            stockUpdateError
        } =
          await supabase
            .from("products")
            .update({
              stock:
                currentStock -
                item.quantity,

              updated_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              item.productId
            )
            .eq(
              "stock",
              currentStock
            );

        if (
          stockUpdateError
        ) {
          throw stockUpdateError;
        }
      }

      /*
       * STATUS HISTORY
       */

      const {
        error:
          historyError
      } =
        await supabase
          .from(
            "order_status_history"
          )
          .insert({
            order_id:
              order.id,

            status:
              "Received"
          });

      if (
        historyError
      ) {
        console.error(
          "STATUS HISTORY ERROR:",
          historyError
        );
      }

      return res.status(201).json({
        success: true,

        message:
          "Order placed successfully.",

        order: {
          id:
            order.id,

          orderId:
            order.id,

          orderReference:
            orderReference,

          reference:
            orderReference,

          status:
            "Received",

          paymentStatus:
            paymentStatus,

          paymentMethod:
            paymentMethod,

          subtotal:
            cart.subtotal,

          delivery:
            cart.delivery,

          discount:
            cart.discount,

          total:
            cart.total
        },

        orderId:
          order.id,

        reference:
          orderReference
      });
    } catch (error) {
      console.error(
        "CREATE ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to create order."
      });
    }
  }
);

/* =====================================================
   GET ALL ORDERS
   ===================================================== */

app.get(
  "/api/orders",
  async function (
    req,
    res
  ) {
    try {
      const {
        data: orders,
        error
      } =
        await supabase
          .from("orders")
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      if (
        !Array.isArray(
          orders
        )
      ) {
        return res.json({
          success: true,
          orders: []
        });
      }

      const orderIds =
        orders.map(
          (order) =>
            order.id
        );

      let orderItems =
        [];

      if (
        orderIds.length
      ) {
        const {
          data:
            items,
          error:
            itemsError
        } =
          await supabase
            .from(
              "order_items"
            )
            .select("*")
            .in(
              "order_id",
              orderIds
            );

        if (
          itemsError
        ) {
          throw itemsError;
        }

        orderItems =
          Array.isArray(
            items
          )
            ? items
            : [];
      }

      const itemsByOrder =
        new Map();

      for (
        const item
          of orderItems
      ) {
        const key =
          String(
            item.order_id
          );

        if (
          !itemsByOrder.has(
            key
          )
        ) {
          itemsByOrder.set(
            key,
            []
          );
        }

        itemsByOrder
          .get(key)
          .push({
            id:
              item.product_id,

            name:
              item.product_name,

            price:
              safeNumber(
                item.product_price
              ),

            quantity:
              safeNumber(
                item.quantity
              ),

            selectedColor:
              item.selected_color ||
              "",

            image:
              item.product_image ||
              "",

            lineTotal:
              safeNumber(
                item.line_total
              )
          });
      }

      const formatted =
        orders.map(
          function (order) {
            return formatOrder({
              ...order,

              items:
                itemsByOrder.get(
                  String(
                    order.id
                  )
                ) || []
            });
          }
        );

      return res.json({
        success: true,
        orders:
          formatted
      });
    } catch (error) {
      console.error(
        "GET ORDERS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load orders."
      });
    }
  }
);

/* =====================================================
   GET SINGLE ORDER
   ===================================================== */

app.get(
  "/api/orders/:id",
  async function (
    req,
    res
  ) {
    try {
      const identifier =
        String(
          req.params.id
        );

      let query =
        supabase
          .from("orders")
          .select("*");

      if (
        /^\d+$/.test(
          identifier
        )
      ) {
        query =
          query.eq(
            "id",
            Number(
              identifier
            )
          );
      } else {
        query =
          query.eq(
            "order_reference",
            identifier
          );
      }

      const {
        data: order,
        error
      } =
        await query
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found."
        });
      }

      const {
        data: items,
        error:
          itemsError
      } =
        await supabase
          .from(
            "order_items"
          )
          .select("*")
          .eq(
            "order_id",
            order.id
          );

      if (
        itemsError
      ) {
        throw itemsError;
      }

      const formattedItems =
        (
          Array.isArray(
            items
          )
            ? items
            : []
        ).map(
          function (item) {
            return {
              id:
                item.product_id,

              name:
                item.product_name,

              price:
                safeNumber(
                  item.product_price
                ),

              quantity:
                safeNumber(
                  item.quantity
                ),

              selectedColor:
                item.selected_color ||
                "",

              image:
                item.product_image ||
                "",

              lineTotal:
                safeNumber(
                  item.line_total
                )
            };
          }
        );

      return res.json({
        success: true,

        order:
          formatOrder({
            ...order,
            items:
              formattedItems
          })
      });
    } catch (error) {
      console.error(
        "GET ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load order."
      });
    }
  }
);

/* =====================================================
   UPDATE ORDER
   ===================================================== */

async function updateOrder(
  req,
  res
) {
  try {
    const identifier =
      String(
        req.params.id
      );

    const body =
      req.body || {};

    const status =
      body.status ||
      body.orderStatus;

    const paymentStatus =
      body.paymentStatus;

    if (
      status &&
      !ORDER_STATUSES.includes(
        String(status)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order status."
      });
    }

    if (
      paymentStatus &&
      !PAYMENT_STATUSES.includes(
        String(
          paymentStatus
        )
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment status."
      });
    }

    let query =
      supabase
        .from("orders")
        .select("*");

    if (
      /^\d+$/.test(
        identifier
      )
    ) {
      query =
        query.eq(
          "id",
          Number(
            identifier
          )
        );
    } else {
      query =
        query.eq(
          "order_reference",
          identifier
        );
    }

    const {
      data: existing,
      error:
        findError
    } =
      await query
        .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found."
      });
    }

    const updateData = {
      updated_at:
        new Date().toISOString()
    };

    if (status) {
      updateData.status =
        String(status);
    }

    if (paymentStatus) {
      updateData.payment_status =
        String(
          paymentStatus
        );
    }

    if (
      body.courierName !==
      undefined
    ) {
      updateData.courier_name =
        String(
          body.courierName
        );
    }

    if (
      body.trackingNumber !==
      undefined
    ) {
      updateData.tracking_number =
        String(
          body.trackingNumber
        );
    }

    if (
      body.trackingUrl !==
      undefined
    ) {
      updateData.tracking_url =
        String(
          body.trackingUrl
        );
    }

    const {
      data: updated,
      error
    } =
      await supabase
        .from("orders")
        .update(
          updateData
        )
        .eq(
          "id",
          existing.id
        )
        .select()
        .single();

    if (error) {
      throw error;
    }

    /*
     * Save status history.
     */

    if (status) {
      const {
        error:
          historyError
      } =
        await supabase
          .from(
            "order_status_history"
          )
          .insert({
            order_id:
              existing.id,

            status:
              String(status)
          });

      if (
        historyError
      ) {
        console.error(
          "STATUS HISTORY ERROR:",
          historyError
        );
      }
    }

    return res.json({
      success: true,

      message:
        "Order updated successfully.",

      order:
        formatOrder(
          updated
        )
    });
  } catch (error) {
    console.error(
      "UPDATE ORDER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update order."
    });
  }
}

app.put(
  "/api/orders/:id/status",
  updateOrder
);

app.patch(
  "/api/orders/:id/status",
  updateOrder
);

app.put(
  "/api/orders/:id",
  updateOrder
);

app.patch(
  "/api/orders/:id",
  updateOrder
);

/* =====================================================
   DELETE ORDER
   ===================================================== */

app.delete(
  "/api/orders/:id",
  async function (
    req,
    res
  ) {
    try {
      const identifier =
        String(
          req.params.id
        );

      let query =
        supabase
          .from("orders")
          .select("id");

      if (
        /^\d+$/.test(
          identifier
        )
      ) {
        query =
          query.eq(
            "id",
            Number(
              identifier
            )
          );
      } else {
        query =
          query.eq(
            "order_reference",
            identifier
          );
      }

      const {
        data: order,
        error:
          findError
      } =
        await query
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found."
        });
      }

      /*
       * For permanent order history,
       * we prefer cancellation instead
       * of hard deletion.
       */

      const {
        error
      } =
        await supabase
          .from("orders")
          .update({
            status:
              "Cancelled",

            updated_at:
              new Date().toISOString()
          })
          .eq(
            "id",
            order.id
          );

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        message:
          "Order cancelled successfully."
      });
    } catch (error) {
      console.error(
        "DELETE ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to cancel order."
      });
    }
  }
);

/* =====================================================
   ERROR HANDLER
   ===================================================== */

app.use(
  function (
    error,
    req,
    res,
    next
  ) {
    console.error(
      "SERVER ERROR:",
      error
    );

    if (
      error instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Upload error: " +
          error.message
      });
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Server error."
      });
    }

    next();
  }
);

/* =====================================================
   404
   ===================================================== */

app.use(
  function (
    req,
    res
  ) {
    res.status(404).json({
      success: false,

      message:
        "API route not found.",

      path:
        req.originalUrl
    });
  }
);

/* =====================================================
   START SERVER
   ===================================================== */

app.listen(
  PORT,
  HOST,
  async function () {
    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "          LUXORA SERVER"
    );
    console.log(
      "========================================"
    );
    console.log(
      `PORT: ${PORT}`
    );
    console.log(
      "DATABASE: SUPABASE"
    );
    console.log(
      "STORAGE: SUPABASE STORAGE"
    );
    console.log(
      "PAYMENT: RAZORPAY"
    );
    console.log(
      "Products: /api/products"
    );
    console.log(
      "Orders: /api/orders"
    );
    console.log(
      "Create Payment: /api/create-order"
    );
    console.log(
      "Verify Payment: /api/verify-payment"
    );
    console.log(
      "Health: /api/health"
    );
    console.log(
      "========================================"
    );
    console.log("");

    try {
      const {
        error
      } =
        await supabase
          .from("products")
          .select("id")
          .limit(1);

      if (error) {
        console.error(
          "❌ SUPABASE CONNECTION ERROR:",
          error.message
        );
      } else {
        console.log(
          "✅ SUPABASE DATABASE CONNECTED"
        );
      }
    } catch (error) {
      console.error(
        "❌ SUPABASE TEST ERROR:",
        error.message
      );
    }

    try {
      const {
        data,
        error
      } =
        await supabase.storage
          .listBuckets();

      if (error) {
        console.error(
          "❌ STORAGE CONNECTION ERROR:",
          error.message
        );
      } else {
        const bucket =
          data?.find(
            (item) =>
              item.name ===
              STORAGE_BUCKET
          );

        console.log(
          bucket
            ? "✅ STORAGE CONNECTED"
            : "⚠️ product-images bucket not found"
        );
      }
    } catch (error) {
      console.error(
        "❌ STORAGE TEST ERROR:",
        error.message
      );
    }

    console.log("");
  }
);