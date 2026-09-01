const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

// =====================================================
// DIRECTORIES / FILES
// =====================================================

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// =====================================================
// CREATE DIRECTORIES
// =====================================================

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(
      PRODUCTS_FILE,
      JSON.stringify([], null, 2),
      "utf8"
    );
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(
      ORDERS_FILE,
      JSON.stringify([], null, 2),
      "utf8"
    );
  }
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: "*",
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

// =====================================================
// STATIC UPLOADS
// =====================================================

app.use(
  "/uploads",
  express.static(UPLOAD_DIR)
);

// =====================================================
// JSON HELPERS
// =====================================================

function readJsonFile(file, fallback = []) {
  try {
    ensureDirectories();

    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );

      return fallback;
    }

    const content = fs.readFileSync(file, "utf8");

    if (!content.trim()) {
      return fallback;
    }

    const parsed = JSON.parse(content);

    return parsed;
  } catch (error) {
    console.error("JSON READ ERROR:", error);

    return fallback;
  }
}

function writeJsonFile(file, data) {
  ensureDirectories();

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

// =====================================================
// PRODUCTS HELPERS
// =====================================================

function readProducts() {
  return readJsonFile(PRODUCTS_FILE, []);
}

function saveProducts(products) {
  writeJsonFile(PRODUCTS_FILE, products);
}

// =====================================================
// ORDERS HELPERS
// =====================================================

function readOrders() {
  return readJsonFile(ORDERS_FILE, []);
}

function saveOrders(orders) {
  writeJsonFile(ORDERS_FILE, orders);
}

// =====================================================
// ORDER NUMBER
// =====================================================

function generateOrderNumber() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `ORD-${year}${month}${day}-${random}`;
}

// =====================================================
// MULTER
// =====================================================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(
      file.originalname
    );

    const uniqueName =
      Date.now() +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 8) +
      extension;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (
      allowedTypes.includes(
        file.mimetype
      )
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, JPEG, PNG and WEBP images are allowed."
        )
      );
    }
  },
});

// =====================================================
// HOME
// =====================================================

app.get("/", function (req, res) {
  res.json({
    success: true,
    message: "Luxury Store Backend is running",
    port: PORT,
  });
});

// =====================================================
// PRODUCTS
// =====================================================

// GET ALL PRODUCTS

app.get(
  "/api/products",
  function (req, res) {
    try {
      const products = readProducts();

      res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      console.error(
        "GET PRODUCTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to get products",
        products: [],
      });
    }
  }
);

// GET SINGLE PRODUCT

app.get(
  "/api/products/:id",
  function (req, res) {
    try {
      const products = readProducts();

      const id = String(
        req.params.id
      );

      const product = products.find(
        function (item) {
          return (
            String(item.id) === id ||
            String(item._id) === id ||
            String(item.productId) === id
          );
        }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      res.json({
        success: true,
        product,
      });
    } catch (error) {
      console.error(
        "GET PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to get product",
      });
    }
  }
);

// CREATE PRODUCT

app.post(
  "/api/products",
  upload.array("images", 5),
  function (req, res) {
    try {
      const body = req.body || {};

      if (
        !body.name ||
        !body.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Product name is required",
        });
      }

      if (
        body.price === undefined ||
        body.price === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Product price is required",
        });
      }

      const products = readProducts();

      const newProduct = {
        id:
          body.id ||
          Date.now().toString(),

        name:
          body.name.trim(),

        category:
          body.category ||
          "Bags",

        description:
          body.description ||
          "",

        price:
          Number(body.price) || 0,

        oldPrice:
          Number(body.oldPrice) ||
          Number(body.price) ||
          0,

        stock:
          Number(body.stock) || 0,

        rating:
          Number(body.rating) || 4.8,

        reviews:
          Number(body.reviews) || 0,

        colors:
          body.colors
            ? Array.isArray(body.colors)
              ? body.colors
              : [body.colors]
            : ["Black"],

 images:
  Array.isArray(req.files)
    ? req.files.map(function (file) {
        return `/uploads/${file.filename}`;
      })
    : [],

        createdAt:
          new Date().toISOString(),
      };

      products.unshift(newProduct);

      saveProducts(products);

      res.status(201).json({
        success: true,
        message:
          "Product created successfully",
        product: newProduct,
      });
    } catch (error) {
      console.error(
        "CREATE PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to create product",
      });
    }
  }
);

// UPDATE PRODUCT

app.put(
  "/api/products/:id",
  upload.array("images", 5),
  function (req, res) {
    try {
      const products = readProducts();

      const id = String(
        req.params.id
      );

      const index =
        products.findIndex(
          function (item) {
            return (
              String(item.id) === id ||
              String(item._id) === id ||
              String(item.productId) === id
            );
          }
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const body = req.body || {};

      let images =
  products[index].images || [];

if (Array.isArray(req.files) && req.files.length > 0) {
  images = req.files.map(
    function (file) {
      return `/uploads/${file.filename}`;
    }
  );
}

      let colors =
        products[index].colors || [
          "Black",
        ];

      if (body.colors) {
        try {
          colors =
            Array.isArray(body.colors)
              ? body.colors
              : JSON.parse(body.colors);
        } catch (error) {
          colors =
            products[index].colors || [
              "Black",
            ];
        }
      }

      products[index] = {
        ...products[index],

        name:
          body.name !== undefined
            ? body.name
            : products[index].name,

        category:
          body.category !== undefined
            ? body.category
            : products[index].category,

        description:
          body.description !== undefined
            ? body.description
            : products[index].description,

        price:
          body.price !== undefined
            ? Number(body.price)
            : products[index].price,

        oldPrice:
          body.oldPrice !== undefined
            ? Number(body.oldPrice)
            : products[index].oldPrice,

        stock:
          body.stock !== undefined
            ? Number(body.stock)
            : products[index].stock,

        colors,

        images,

        updatedAt:
          new Date().toISOString(),
      };

      saveProducts(products);

      res.json({
        success: true,
        message:
          "Product updated successfully",
        product: products[index],
      });
    } catch (error) {
      console.error(
        "UPDATE PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to update product",
      });
    }
  }
);

// DELETE PRODUCT

app.delete(
  "/api/products/:id",
  function (req, res) {
    try {
      const products = readProducts();

      const id = String(
        req.params.id
      );

      const filtered =
        products.filter(
          function (item) {
            return !(
              String(item.id) === id ||
              String(item._id) === id ||
              String(item.productId) === id
            );
          }
        );

      if (
        filtered.length ===
        products.length
      ) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      saveProducts(filtered);

      res.json({
        success: true,
        message:
          "Product deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to delete product",
      });
    }
  }
);

// =====================================================
// ORDERS
// =====================================================

// CREATE ORDER

app.post(
  "/api/orders",
  function (req, res) {
    try {
      const body = req.body || {};

      const customer =
        body.customer || {};

      const items =
        Array.isArray(body.items)
          ? body.items
          : [];

      // CUSTOMER NAME

      if (
        !customer.name ||
        !String(customer.name).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Customer name is required",
        });
      }

      // MOBILE

      const mobile =
        customer.mobile ||
        customer.phone ||
        "";

      if (!String(mobile).trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Mobile number is required",
        });
      }

      // ITEMS

      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Order must contain products",
        });
      }

      const orders = readOrders();

      const subtotal =
        Number(body.subtotal) || 0;

      const deliveryCharge =
        Number(body.deliveryCharge) || 0;

      let totalAmount =
        Number(body.totalAmount);

      if (!totalAmount) {
        totalAmount =
          Number(body.total);
      }

      if (!totalAmount) {
        totalAmount =
          subtotal + deliveryCharge;
      }

      const totalItems =
        items.reduce(
          function (sum, item) {
            return (
              sum +
              (Number(item.quantity) || 1)
            );
          },
          0
        );

      const newOrder = {
        id:
          Date.now().toString(),

        orderNumber:
          generateOrderNumber(),

        createdAt:
          new Date().toISOString(),

        status:
          body.status || "New",

        customer: {
          name:
            String(customer.name || "").trim(),

          mobile:
            String(mobile).trim(),

          phone:
            String(mobile).trim(),

          email:
            customer.email || "",

          address:
            customer.address || "",

          city:
            customer.city || "",

          state:
            customer.state || "",

          pincode:
            customer.pincode || "",
        },

        items:
          items.map(
            function (item) {
              return {
                productId:
                  item.productId ||
                  item.id ||
                  "",

                id:
                  item.id ||
                  item.productId ||
                  "",

                name:
                  item.name || "",

                category:
                  item.category || "",

                price:
                  Number(item.price) || 0,

                quantity:
                  Number(item.quantity) || 1,

                color:
                  item.color || "Black",

                image:
                  item.image || "",
              };
            }
          ),

        totalItems,

        subtotal,

        deliveryCharge,

        totalAmount,

        total: totalAmount,

        paymentMethod:
          body.paymentMethod ||
          "COD",

        paymentStatus:
          body.paymentStatus ||
          "Pending",

        notes:
          body.notes || "",
      };

      orders.unshift(newOrder);

      saveOrders(orders);

      console.log(
        "NEW ORDER:",
        newOrder.orderNumber
      );

      res.status(201).json({
        success: true,

        message:
          "Order placed successfully",

        order:
          newOrder,
      });
    } catch (error) {
      console.error(
        "CREATE ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to create order",
      });
    }
  }
);

// =====================================================
// GET ALL ORDERS
// =====================================================

app.get(
  "/api/orders",
  function (req, res) {
    try {
      const orders = readOrders();

      res.json({
        success: true,

        count:
          orders.length,

        orders,
      });
    } catch (error) {
      console.error(
        "GET ORDERS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get orders",
        orders: [],
      });
    }
  }
);

// =====================================================
// GET SINGLE ORDER
// =====================================================

app.get(
  "/api/orders/:id",
  function (req, res) {
    try {
      const orders = readOrders();

      const id = String(
        req.params.id
      );

      const order =
        orders.find(
          function (item) {
            return (
              String(item.id) === id ||
              String(item.orderNumber) === id
            );
          }
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        order,
      });
    } catch (error) {
      console.error(
        "GET SINGLE ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get order",
      });
    }
  }
);

// =====================================================
// UPDATE ORDER STATUS
// =====================================================

app.patch(
  "/api/orders/:id/status",
  function (req, res) {
    try {
      const status =
        req.body.status;

      const allowedStatuses = [
        "New",
        "Confirmed",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid order status",
        });
      }

      const orders = readOrders();

      const id = String(
        req.params.id
      );

      const index =
        orders.findIndex(
          function (item) {
            return (
              String(item.id) === id ||
              String(item.orderNumber) === id
            );
          }
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      orders[index].status =
        status;

      orders[index].updatedAt =
        new Date().toISOString();

      saveOrders(orders);

      res.json({
        success: true,

        message:
          "Order status updated",

        order:
          orders[index],
      });
    } catch (error) {
      console.error(
        "UPDATE ORDER STATUS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update order",
      });
    }
  }
);

// =====================================================
// DELETE ORDER
// =====================================================

app.delete(
  "/api/orders/:id",
  function (req, res) {
    try {
      const orders = readOrders();

      const id = String(
        req.params.id
      );

      const filtered =
        orders.filter(
          function (item) {
            return !(
              String(item.id) === id ||
              String(item.orderNumber) === id
            );
          }
        );

      if (
        filtered.length ===
        orders.length
      ) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      saveOrders(filtered);

      res.json({
        success: true,

        message:
          "Order deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete order",
      });
    }
  }
);

// =====================================================
// ERROR HANDLER
// =====================================================

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
          error.message,
      });
    }

    if (
      error.message &&
      error.message.includes(
        "Only JPG"
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Something went wrong on server",
    });
  }
);

// =====================================================
// START SERVER
// =====================================================

ensureDirectories();

console.log(
  "Products file:",
  PRODUCTS_FILE
);

console.log(
  "Orders file:",
  ORDERS_FILE
);

console.log(
  "Uploads directory:",
  UPLOAD_DIR
);

app.listen(
  PORT,
  "0.0.0.0",
  function () {
    console.log(
      `Luxury Store Backend running on port ${PORT}`
    );
  }
);