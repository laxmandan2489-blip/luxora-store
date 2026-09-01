const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

// =========================
// FILES
// =========================

const DATA_DIR = path.join(__dirname, "data");

const PRODUCTS_FILE = path.join(
  DATA_DIR,
  "products.json"
);

const ORDERS_FILE = path.join(
  DATA_DIR,
  "orders.json"
);

// =========================
// MIDDLEWARE
// =========================

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json({ limit: "10mb" }));

// =========================
// FILE HELPERS
// =========================

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }
}

function readJsonFile(file, fallback = []) {
  try {
    ensureDataDirectory();

    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(fallback, null, 2)
      );

      return fallback;
    }

    const data = fs.readFileSync(
      file,
      "utf8"
    );

    if (!data.trim()) {
      return fallback;
    }

    return JSON.parse(data);
  } catch (error) {
    console.error(
      `Error reading ${file}:`,
      error
    );

    return fallback;
  }
}

function writeJsonFile(file, data) {
  ensureDataDirectory();

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

// =========================
// PRODUCTS
// =========================

function readProducts() {
  return readJsonFile(
    PRODUCTS_FILE,
    []
  );
}

function saveProducts(products) {
  writeJsonFile(
    PRODUCTS_FILE,
    products
  );
}

// =========================
// ORDERS
// =========================

function readOrders() {
  return readJsonFile(
    ORDERS_FILE,
    []
  );
}

function saveOrders(orders) {
  writeJsonFile(
    ORDERS_FILE,
    orders
  );
}

// =========================
// ORDER NUMBER
// =========================

function generateOrderNumber() {
  const now = new Date();

  const date =
    now.getFullYear().toString() +
    String(
      now.getMonth() + 1
    ).padStart(2, "0") +
    String(
      now.getDate()
    ).padStart(2, "0");

  const random =
    Math.floor(
      1000 +
        Math.random() * 9000
    );

  return `ORD-${date}-${random}`;
}

// =========================
// HOME / HEALTH CHECK
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "Luxury Store Backend is running",
    port: PORT,
  });
});

// =========================
// GET ALL PRODUCTS
// =========================

app.get(
  "/api/products",
  (req, res) => {
    try {
      const products =
        readProducts();

      res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      console.error(
        "Get products error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get products",
        products: [],
      });
    }
  }
);

// =========================
// GET SINGLE PRODUCT
// =========================

app.get(
  "/api/products/:id",
  (req, res) => {
    try {
      const products =
        readProducts();

      const product =
        products.find(
          (item) =>
            String(item.id) ===
              String(req.params.id) ||
            String(item._id) ===
              String(req.params.id) ||
            String(item.productId) ===
              String(req.params.id)
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      res.json({
        success: true,
        product,
      });
    } catch (error) {
      console.error(
        "Get product error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get product",
      });
    }
  }
);

// =========================
// CREATE PRODUCT
// =========================

app.post(
  "/api/products",
  (req, res) => {
    try {
      const body = req.body || {};

      if (!body.name) {
        return res.status(400).json({
          success: false,
          message:
            "Product name is required",
        });
      }

      const products =
        readProducts();

      const newProduct = {
        id:
          body.id ||
          Date.now().toString(),

        name: body.name,

        category:
          body.category ||
          "Bags",

        description:
          body.description || "",

        price:
          Number(body.price) || 0,

        oldPrice:
          Number(body.oldPrice) ||
          Number(body.price) ||
          0,

        stock:
          Number(body.stock) || 0,

        rating:
          Number(body.rating) ||
          4.8,

        reviews:
          Number(body.reviews) || 0,

        colors:
          Array.isArray(body.colors)
            ? body.colors
            : ["Black"],

        image:
          body.image || "",

        createdAt:
          new Date().toISOString(),
      };

      products.unshift(
        newProduct
      );

      saveProducts(products);

      res.status(201).json({
        success: true,
        message:
          "Product created successfully",
        product: newProduct,
      });
    } catch (error) {
      console.error(
        "Create product error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to create product",
      });
    }
  }
);

// =========================
// UPDATE PRODUCT
// =========================

app.put(
  "/api/products/:id",
  (req, res) => {
    try {
      const products =
        readProducts();

      const index =
        products.findIndex(
          (item) =>
            String(item.id) ===
              String(req.params.id) ||
            String(item._id) ===
              String(req.params.id) ||
            String(item.productId) ===
              String(req.params.id)
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      products[index] = {
        ...products[index],
        ...req.body,
        id:
          products[index].id,
        updatedAt:
          new Date().toISOString(),
      };

      saveProducts(products);

      res.json({
        success: true,
        message:
          "Product updated successfully",
        product:
          products[index],
      });
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update product",
      });
    }
  }
);

// =========================
// DELETE PRODUCT
// =========================

app.delete(
  "/api/products/:id",
  (req, res) => {
    try {
      const products =
        readProducts();

      const filtered =
        products.filter(
          (item) =>
            String(item.id) !==
              String(req.params.id) &&
            String(item._id) !==
              String(req.params.id) &&
            String(item.productId) !==
              String(req.params.id)
        );

      if (
        filtered.length ===
        products.length
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
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
        "Delete product error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete product",
      });
    }
  }
);

// =========================
// CREATE ORDER
// =========================

app.post(
  "/api/orders",
  (req, res) => {
    try {
      const body = req.body || {};

      const customer =
        body.customer || {};

      const items =
        body.items || [];

      if (!customer.name) {
        return res.status(400).json({
          success: false,
          message:
            "Customer name is required",
        });
      }

      const mobile =
        customer.mobile ||
        customer.phone ||
        "";

      if (!mobile) {
        return res.status(400).json({
          success: false,
          message:
            "Mobile number is required",
        });
      }

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Order must contain products",
        });
      }

      const orders =
        readOrders();

      const subtotal =
        Number(
          body.subtotal
        ) || 0;

      const deliveryCharge =
        Number(
          body.deliveryCharge
        ) || 0;

      const totalAmount =
        Number(
          body.totalAmount
        ) ||
        Number(body.total) ||
        subtotal +
          deliveryCharge;

      const newOrder = {
        id:
          Date.now().toString(),

        orderNumber:
          generateOrderNumber(),

        createdAt:
          new Date().toISOString(),

        status:
          body.status ||
          "New",

        customer: {
          name:
            customer.name || "",

          mobile:
            mobile,

          phone:
            mobile,

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
            (item) => ({
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
                Number(
                  item.price
                ) || 0,

              quantity:
                Number(
                  item.quantity
                ) || 1,

              color:
                item.color ||
                "Black",

              image:
                item.image || "",
            })
          ),

        totalItems:
          Number(
            body.totalItems
          ) ||
          items.reduce(
            (sum, item) =>
              sum +
              (Number(
                item.quantity
              ) || 1),
            0
          ),

        subtotal,

        deliveryCharge,

        totalAmount,

        total:
          totalAmount,

        paymentMethod:
          body.paymentMethod ||
          "COD",

        paymentStatus:
          body.paymentStatus ||
          "Pending",

        notes:
          body.notes || "",
      };

      orders.unshift(
        newOrder
      );

      saveOrders(orders);

      console.log(
        "New order created:",
        newOrder.orderNumber
      );

      res.status(201).json({
        success: true,
        message:
          "Order placed successfully",
        order: newOrder,
      });
    } catch (error) {
      console.error(
        "Create order error:",
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

// =========================
// GET ALL ORDERS
// =========================

app.get(
  "/api/orders",
  (req, res) => {
    try {
      const orders =
        readOrders();

      res.json({
        success: true,
        count: orders.length,
        orders,
      });
    } catch (error) {
      console.error(
        "Get orders error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get orders",
      });
    }
  }
);

// =========================
// GET SINGLE ORDER
// =========================

app.get(
  "/api/orders/:id",
  (req, res) => {
    try {
      const orders =
        readOrders();

      const order =
        orders.find(
          (item) =>
            String(item.id) ===
              String(
                req.params.id
              ) ||
            String(
              item.orderNumber
            ) ===
              String(
                req.params.id
              )
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }

      res.json({
        success: true,
        order,
      });
    } catch (error) {
      console.error(
        "Get order error:",
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

// =========================
// UPDATE ORDER STATUS
// =========================

app.patch(
  "/api/orders/:id/status",
  (req, res) => {
    try {
      const { status } =
        req.body;

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

      const orders =
        readOrders();

      const index =
        orders.findIndex(
          (item) =>
            String(item.id) ===
              String(
                req.params.id
              ) ||
            String(
              item.orderNumber
            ) ===
              String(
                req.params.id
              )
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
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
        "Update order status error:",
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

// =========================
// DELETE ORDER
// =========================

app.delete(
  "/api/orders/:id",
  (req, res) => {
    try {
      const orders =
        readOrders();

      const filtered =
        orders.filter(
          (item) =>
            String(item.id) !==
              String(
                req.params.id
              ) &&
            String(
              item.orderNumber
            ) !==
              String(
                req.params.id
              )
        );

      if (
        filtered.length ===
        orders.length
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
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
        "Delete order error:",
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

// =========================
// START SERVER
// =========================

ensureDataDirectory();

console.log(
  "Products file:",
  PRODUCTS_FILE
);

console.log(
  "Orders file:",
  ORDERS_FILE
);

app.listen(PORT, () => {
  console.log(
    `Luxury Store Backend running on http://127.0.0.1:${PORT}`
  );
});