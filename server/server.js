const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

/* =====================================================
   PORT
   ===================================================== */

const PORT = process.env.PORT || 5000;

/* =====================================================
   CORS
   ===================================================== */

app.use(
  cors({
    origin: true,
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
   DIRECTORIES
   ===================================================== */

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(__dirname, "uploads");

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
   JSON FILES
   ===================================================== */

const PRODUCTS_FILE = path.join(
  DATA_DIR,
  "products.json"
);

const ORDERS_FILE = path.join(
  DATA_DIR,
  "orders.json"
);

function ensureJsonFile(file, defaultValue) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(defaultValue, null, 2),
      "utf8"
    );
  }
}

ensureJsonFile(PRODUCTS_FILE, []);
ensureJsonFile(ORDERS_FILE, []);

/* =====================================================
   JSON HELPERS
   ===================================================== */

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    const content = fs
      .readFileSync(file, "utf8")
      .trim();

    if (!content) {
      return fallback;
    }

    return JSON.parse(content);
  } catch (error) {
    console.error(
      "JSON READ ERROR:",
      error
    );

    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* =====================================================
   IMAGE UPLOAD
   ===================================================== */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },

  filename: function (req, file, cb) {
    const ext =
      path.extname(file.originalname) || ".jpg";

    const originalName =
      path.basename(
        file.originalname,
        ext
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
      Date.now() +
      "-" +
      Math.round(
        Math.random() * 1000000
      ) +
      "-" +
      (safeName || "product") +
      ext;

    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: function (
    req,
    file,
    cb
  ) {
    if (
      file.mimetype &&
      file.mimetype.startsWith("image/")
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
   STATIC UPLOADS
   ===================================================== */

app.use(
  "/uploads",
  express.static(UPLOADS_DIR)
);

/* =====================================================
   HEALTH CHECK
   ===================================================== */

app.get(
  "/",
  function (req, res) {
    res.json({
      success: true,
      message: "LUXORA server is running",
      port: PORT
    });
  }
);

/* =====================================================
   GET ALL PRODUCTS
   ===================================================== */

app.get(
  "/api/products",
  function (req, res) {
    try {
      const products =
        readJson(
          PRODUCTS_FILE,
          []
        );

      res.json({
        success: true,

        products:
          Array.isArray(products)
            ? products
            : []
      });
    } catch (error) {
      console.error(
        "GET PRODUCTS ERROR:",
        error
      );

      res.status(500).json({
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
  function (req, res) {
    try {
      const products =
        readJson(
          PRODUCTS_FILE,
          []
        );

      const id =
        String(req.params.id);

      const product =
        products.find(
          function (item) {
            return (
              String(item.id) === id
            );
          }
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      res.json({
        success: true,
        product: product
      });
    } catch (error) {
      console.error(
        "GET PRODUCT ERROR:",
        error
      );

      res.status(500).json({
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

  function (req, res) {
    try {
      console.log("");
      console.log(
        "========== ADD PRODUCT =========="
      );

      console.log(
        "BODY:",
        req.body
      );

      console.log(
        "FILES:",
        req.files
          ? req.files.map(
              function (file) {
                return {
                  field:
                    file.fieldname,
                  name:
                    file.originalname,
                  filename:
                    file.filename,
                  mimetype:
                    file.mimetype
                };
              }
            )
          : []
      );

      const products =
        readJson(
          PRODUCTS_FILE,
          []
        );

      const body =
        req.body || {};

      const name =
        body.name;

      const category =
        body.category ||
        "Bags";

      const price =
        body.price;

      const oldPrice =
        body.oldPrice;

      const stock =
        body.stock;

      const description =
        body.description ||
        "";

      const colors =
        body.colors ||
        "Black";

      /* -----------------------------------------
         PRODUCT NAME CHECK
         ----------------------------------------- */

      if (
        !name ||
        !String(name).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Product name is required."
        });
      }

      /* -----------------------------------------
         GET UPLOADED FILES
         ----------------------------------------- */

      const uploadedFiles =
        Array.isArray(req.files)
          ? req.files
          : [];

      if (
        uploadedFiles.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please upload at least one product image."
        });
      }

      /* -----------------------------------------
         IMAGE PATHS
         ----------------------------------------- */

      const imagePaths =
        uploadedFiles.map(
          function (file) {
            return (
              "/uploads/" +
              file.filename
            );
          }
        );

      /* -----------------------------------------
         PRODUCT OBJECT
         ----------------------------------------- */

      const product = {
        id: Date.now(),

        name:
          String(name).trim(),

        category:
          String(category),

        price:
          Number(price) || 0,

        oldPrice:
          Number(oldPrice) || 0,

        stock:
          Number(stock) || 0,

        description:
          String(description),

        colors:
          String(colors),

        images:
          imagePaths,

        image:
          imagePaths[0] || "",

        createdAt:
          new Date().toISOString()
      };

      /* -----------------------------------------
         SAVE PRODUCT
         ----------------------------------------- */

      products.push(product);

      writeJson(
        PRODUCTS_FILE,
        products
      );

      console.log(
        "PRODUCT ADDED:",
        product.name
      );

      console.log(
        "IMAGES:",
        product.images
      );

      console.log(
        "================================="
      );

      res.status(201).json({
        success: true,

        message:
          "Product added successfully.",

        product: product
      });
    } catch (error) {
      console.error(
        "ADD PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          error.message ||
          "Unable to add product."
      });
    }
  }
);

/* =====================================================
   DELETE PRODUCT
   ===================================================== */

app.delete(
  "/api/products/:id",

  function (req, res) {
    try {
      const products =
        readJson(
          PRODUCTS_FILE,
          []
        );

      const id =
        String(req.params.id);

      const index =
        products.findIndex(
          function (item) {
            return (
              String(item.id) === id
            );
          }
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      const product =
        products[index];

      let images = [];

      if (
        Array.isArray(
          product.images
        )
      ) {
        images =
          product.images;
      } else if (
        product.image
      ) {
        images = [
          product.image
        ];
      }

      /* -----------------------------------------
         DELETE PRODUCT IMAGES
         ----------------------------------------- */

      images.forEach(
        function (imagePath) {
          try {
            if (
              imagePath &&
              imagePath.startsWith(
                "/uploads/"
              )
            ) {
              const filename =
                path.basename(
                  imagePath
                );

              const fullPath =
                path.join(
                  UPLOADS_DIR,
                  filename
                );

              if (
                fs.existsSync(
                  fullPath
                )
              ) {
                fs.unlinkSync(
                  fullPath
                );

                console.log(
                  "IMAGE DELETED:",
                  filename
                );
              }
            }
          } catch (error) {
            console.error(
              "IMAGE DELETE ERROR:",
              error
            );
          }
        }
      );

      products.splice(
        index,
        1
      );

      writeJson(
        PRODUCTS_FILE,
        products
      );

      res.json({
        success: true,
        message:
          "Product deleted successfully."
      });
    } catch (error) {
      console.error(
        "DELETE PRODUCT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to delete product."
      });
    }
  }
);

/* =====================================================
   GET ALL ORDERS
   ===================================================== */

app.get(
  "/api/orders",

  function (req, res) {
    try {
      const orders =
        readJson(
          ORDERS_FILE,
          []
        );

      const safeOrders =
        Array.isArray(orders)
          ? orders
          : [];

      safeOrders.sort(
        function (a, b) {
          const dateA =
            new Date(
              a.createdAt ||
              a.date ||
              0
            ).getTime();

          const dateB =
            new Date(
              b.createdAt ||
              b.date ||
              0
            ).getTime();

          return (
            dateB - dateA
          );
        }
      );

      res.json({
        success: true,
        orders: safeOrders
      });
    } catch (error) {
      console.error(
        "GET ORDERS ERROR:",
        error
      );

      res.status(500).json({
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

  function (req, res) {
    try {
      const orders =
        readJson(
          ORDERS_FILE,
          []
        );

      const id =
        String(
          req.params.id
        );

      const order =
        orders.find(
          function (item) {
            return (
              String(item.id) ===
                id ||

              String(
                item.orderId
              ) === id ||

              String(
                item.reference
              ) === id ||

              String(
                item.orderReference
              ) === id
            );
          }
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found."
        });
      }

      res.json({
        success: true,
        order: order
      });
    } catch (error) {
      console.error(
        "GET ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load order."
      });
    }
  }
);

/* =====================================================
   CREATE ORDER
   ===================================================== */

app.post(
  "/api/orders",

  function (req, res) {
    try {
      const orders =
        readJson(
          ORDERS_FILE,
          []
        );

      const body =
        req.body || {};

      const now =
        new Date().toISOString();

      const orderId =
        body.orderId ||
        body.id ||
        "LX-" +
          Date.now();

      const orderReference =
        body.orderReference ||
        body.reference ||
        orderId;

      const newOrder = {
        ...body,

        id:
          body.id ||
          Date.now(),

        orderId:
          orderId,

        orderReference:
          orderReference,

        reference:
          body.reference ||
          orderReference,

        status:
          body.status ||
          "Pending",

        createdAt:
          body.createdAt ||
          now,

        updatedAt:
          now
      };

      orders.push(
        newOrder
      );

      writeJson(
        ORDERS_FILE,
        orders
      );

      res.status(201).json({
        success: true,

        message:
          "Order placed successfully.",

        order:
          newOrder,

        orderId:
          newOrder.orderId,

        reference:
          newOrder.reference
      });
    } catch (error) {
      console.error(
        "CREATE ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to create order."
      });
    }
  }
);

/* =====================================================
   UPDATE ORDER STATUS
   ===================================================== */

function updateOrderStatus(
  req,
  res
) {
  try {
    const orders =
      readJson(
        ORDERS_FILE,
        []
      );

    const id =
      String(
        req.params.id
      );

    const body =
      req.body || {};

    const status =
      body.status ||
      body.orderStatus;

    if (!status) {
      return res.status(400).json({
        success: false,
        message:
          "Status is required."
      });
    }

    const index =
      orders.findIndex(
        function (item) {
          return (
            String(item.id) ===
              id ||

            String(
              item.orderId
            ) === id ||

            String(
              item.reference
            ) === id ||

            String(
              item.orderReference
            ) === id
          );
        }
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found."
      });
    }

    orders[index] = {
      ...orders[index],

      status:
        String(status),

      orderStatus:
        String(status),

      updatedAt:
        new Date().toISOString()
    };

    writeJson(
      ORDERS_FILE,
      orders
    );

    res.json({
      success: true,

      message:
        "Order status updated.",

      order:
        orders[index]
    });
  } catch (error) {
    console.error(
      "UPDATE ORDER STATUS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to update order status."
    });
  }
}

app.put(
  "/api/orders/:id/status",
  updateOrderStatus
);

app.patch(
  "/api/orders/:id/status",
  updateOrderStatus
);

app.put(
  "/api/orders/:id",
  updateOrderStatus
);

/* =====================================================
   DELETE ORDER
   ===================================================== */

app.delete(
  "/api/orders/:id",

  function (req, res) {
    try {
      const orders =
        readJson(
          ORDERS_FILE,
          []
        );

      const id =
        String(
          req.params.id
        );

      const index =
        orders.findIndex(
          function (item) {
            return (
              String(item.id) ===
                id ||

              String(
                item.orderId
              ) === id ||

              String(
                item.reference
              ) === id ||

              String(
                item.orderReference
              ) === id
            );
          }
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found."
        });
      }

      orders.splice(
        index,
        1
      );

      writeJson(
        ORDERS_FILE,
        orders
      );

      res.json({
        success: true,
        message:
          "Order deleted successfully."
      });
    } catch (error) {
      console.error(
        "DELETE ORDER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to delete order."
      });
    }
  }
);

/* =====================================================
   MULTER / SERVER ERROR
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
  function (req, res) {
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

const HOST = "0.0.0.0";

app.listen(
  PORT,
  HOST,

  function () {
    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "        LUXORA SERVER STARTED"
    );

    console.log(
      "========================================"
    );

    console.log(
      "PORT: " +
        PORT
    );

    console.log(
      "Products API: /api/products"
    );

    console.log(
      "Orders API: /api/orders"
    );

    console.log(
      "Uploads: /uploads"
    );

    console.log(
      "========================================"
    );

    console.log("");
  }
);