const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

/* =================================
   FOLDERS & FILES
================================= */

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");

const PRODUCTS_FILE = path.join(
  DATA_DIR,
  "products.json"
);

const ORDERS_FILE = path.join(
  DATA_DIR,
  "orders.json"
);

/* =================================
   CREATE FOLDERS
================================= */

fs.mkdirSync(DATA_DIR, {
  recursive: true,
});

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true,
});

/* =================================
   CREATE JSON FILES
================================= */

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(
    PRODUCTS_FILE,
    "[]",
    "utf8"
  );
}

if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(
    ORDERS_FILE,
    "[]",
    "utf8"
  );
}

/* =================================
   MIDDLEWARE
================================= */

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

/* =================================
   STATIC UPLOADS
================================= */

app.use(
  "/uploads",
  express.static(UPLOAD_DIR)
);

/* =================================
   HELPERS
================================= */

function cleanText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/\s+/g, " ");
}

function getProducts() {
  try {
    const data = fs.readFileSync(
      PRODUCTS_FILE,
      "utf8"
    );

    const products = JSON.parse(data);

    return Array.isArray(products)
      ? products
      : [];
  } catch (error) {
    console.error(
      "Products read error:",
      error
    );

    return [];
  }
}

function saveProducts(products) {
  fs.writeFileSync(
    PRODUCTS_FILE,
    JSON.stringify(
      products,
      null,
      2
    ),
    "utf8"
  );
}

function getOrders() {
  try {
    const data = fs.readFileSync(
      ORDERS_FILE,
      "utf8"
    );

    const orders = JSON.parse(data);

    return Array.isArray(orders)
      ? orders
      : [];
  } catch (error) {
    console.error(
      "Orders read error:",
      error
    );

    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(
    ORDERS_FILE,
    JSON.stringify(
      orders,
      null,
      2
    ),
    "utf8"
  );
}

/* =================================
   VALIDATION
================================= */

function validateName(name) {
  return /^[A-Za-z][A-Za-z .']{1,99}$/.test(
    name
  );
}

function validateMobile(mobile) {
  return /^[6-9][0-9]{9}$/.test(
    mobile
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
    email
  );
}

function validateAddress(address) {
  if (
    address.length < 5 ||
    address.length > 300
  ) {
    return false;
  }

  return !/[<>{}[\]\\]/.test(
    address
  );
}

function validateCity(city) {
  return /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(
    city
  );
}

function validateState(state) {
  return /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(
    state
  );
}

function validatePincode(pincode) {
  return /^[1-9][0-9]{5}$/.test(
    pincode
  );
}

/* =================================
   ORDER ID
================================= */

function generateOrderId() {
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

  return `LUX-${year}${month}${day}-${random}`;
}

/* =================================
   IMAGE UPLOAD
================================= */

const storage =
  multer.diskStorage({
    destination: function (
      req,
      file,
      cb
    ) {
      cb(
        null,
        UPLOAD_DIR
      );
    },

    filename: function (
      req,
      file,
      cb
    ) {
      const ext =
        path.extname(
          file.originalname
        );

      const filename =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .substring(2, 8) +
        ext;

      cb(
        null,
        filename
      );
    },
  });

const upload = multer({
  storage,

  limits: {
    fileSize:
      5 * 1024 * 1024,
  },

  fileFilter: function (
    req,
    file,
    cb
  ) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (
      allowed.includes(
        file.mimetype
      )
    ) {
      cb(
        null,
        true
      );
    } else {
      cb(
        new Error(
          "Only JPG, PNG and WEBP images are allowed."
        )
      );
    }
  },
});

/* =================================
   HOME
================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      message:
        "LUXORA BACKEND WORKING",
    });
  }
);

/* =================================
   PRODUCTS - GET
================================= */

app.get(
  "/api/products",
  (req, res) => {
    try {
      res.json({
        success: true,
        products:
          getProducts(),
      });
    } catch (error) {
      console.error(
        "GET PRODUCTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Products load nahi ho rahe.",
      });
    }
  }
);

/* =================================
   PRODUCTS - POST
================================= */

app.post(
  "/api/products",
  upload.single("image"),
  (req, res) => {
    try {
      const name =
        cleanText(
          req.body.name
        );

      const category =
        cleanText(
          req.body.category
        );

      const price =
        cleanText(
          req.body.price
        );

      const oldPrice =
        cleanText(
          req.body.oldPrice
        );

      const stock =
        cleanText(
          req.body.stock
        ) || "0";

      const description =
        cleanText(
          req.body.description
        );

      /* NAME */

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            "Product name is required.",
        });
      }

      /* CATEGORY */

      if (!category) {
        return res.status(400).json({
          success: false,
          message:
            "Product category is required.",
        });
      }

      /* PRICE */

      if (!price) {
        return res.status(400).json({
          success: false,
          message:
            "Product price is required.",
        });
      }

      const priceNumber =
        Number(price);

      const stockNumber =
        Number(stock);

      if (
        !Number.isFinite(
          priceNumber
        ) ||
        priceNumber <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Product price is invalid.",
        });
      }

      if (
        !Number.isFinite(
          stockNumber
        ) ||
        stockNumber < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Product stock is invalid.",
        });
      }

      /* OLD PRICE */

      let oldPriceNumber =
        priceNumber;

      if (oldPrice !== "") {
        oldPriceNumber =
          Number(oldPrice);

        if (
          !Number.isFinite(
            oldPriceNumber
          ) ||
          oldPriceNumber < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Old price is invalid.",
          });
        }
      }

      /* PRODUCTS */

      const products =
        getProducts();

      const product = {
        id: Date.now(),

        name,

        category,

        price:
          priceNumber,

        oldPrice:
          oldPriceNumber,

        stock:
          stockNumber,

        description,

        image:
          req.file
            ? "/uploads/" +
              req.file.filename
            : "",

        createdAt:
          new Date().toISOString(),
      };

      products.push(
        product
      );

      saveProducts(
        products
      );

      return res.status(201).json({
        success: true,

        message:
          "Product added successfully.",

        product,
      });
    } catch (error) {
      console.error(
        "PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Product add nahi hua.",
      });
    }
  }
);

/* =================================
   PRODUCTS - DELETE
================================= */

app.delete(
  "/api/products/:id",
  (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      const products =
        getProducts();

      const product =
        products.find(
          (item) =>
            Number(item.id) ===
            id
        );

      if (!product) {
        return res.status(404).json({
          success: false,

          message:
            "Product not found.",
        });
      }

      const updatedProducts =
        products.filter(
          (item) =>
            Number(item.id) !==
            id
        );

      saveProducts(
        updatedProducts
      );

      /* DELETE IMAGE */

      if (
        product.image
      ) {
        const filename =
          path.basename(
            product.image
          );

        const imagePath =
          path.join(
            UPLOAD_DIR,
            filename
          );

        if (
          fs.existsSync(
            imagePath
          )
        ) {
          fs.unlinkSync(
            imagePath
          );
        }
      }

      return res.json({
        success: true,

        message:
          "Product deleted successfully.",
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
          "Product delete nahi hua.",
      });
    }
  }
);

/* =================================
   ORDERS - GET ALL
================================= */

app.get(
  "/api/orders",
  (req, res) => {
    try {
      const orders =
        getOrders();

      return res.json({
        success: true,
        orders,
      });
    } catch (error) {
      console.error(
        "GET ORDERS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Orders load nahi ho rahe.",
      });
    }
  }
);

/* =================================
   CREATE ORDER
================================= */

app.post(
  "/api/orders",
  (req, res) => {
    try {
      const customer =
        req.body.customer ||
        {};

      const items =
        req.body.items ||
        [];

      /*
        PAYMENT METHOD
        UPI / CREDIT_CARD /
        DEBIT_CARD / NET_BANKING / COD
      */

      const paymentMethod =
        cleanText(
          req.body.paymentMethod
        ) || "UPI";

      const allowedPaymentMethods = [
        "UPI",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "NET_BANKING",
        "COD",
      ];

      if (
        !allowedPaymentMethods.includes(
          paymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          field:
            "paymentMethod",
          message:
            "Invalid payment method.",
        });
      }

      /* =================================
         CUSTOMER
      ================================= */

      const name =
        cleanText(
          customer.name
        );

      const mobile =
        cleanText(
          customer.mobile
        ).replace(
          /\s+/g,
          ""
        );

      const email =
        cleanText(
          customer.email
        ).toLowerCase();

      const address =
        cleanText(
          customer.address
        );

      const city =
        cleanText(
          customer.city
        );

      const state =
        cleanText(
          customer.state
        );

      const pincode =
        cleanText(
          customer.pincode
        );

      /* =================================
         NAME
      ================================= */

      if (!name) {
        return res.status(400).json({
          success: false,

          field: "name",

          message:
            "Please enter your full name.",
        });
      }

      if (
        !validateName(
          name
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "name",

          message:
            "Name is invalid.",
        });
      }

      /* =================================
         MOBILE
      ================================= */

      if (!mobile) {
        return res.status(400).json({
          success: false,

          field: "mobile",

          message:
            "Please enter your mobile number.",
        });
      }

      if (
        !validateMobile(
          mobile
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "mobile",

          message:
            "Please enter a valid 10-digit Indian mobile number.",
        });
      }

      /* =================================
         EMAIL
      ================================= */

      if (!email) {
        return res.status(400).json({
          success: false,

          field: "email",

          message:
            "Please enter your email address.",
        });
      }

      if (
        !validateEmail(
          email
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "email",

          message:
            "Please enter a valid email address.",
        });
      }

      /* =================================
         ADDRESS
      ================================= */

      if (!address) {
        return res.status(400).json({
          success: false,

          field: "address",

          message:
            "Please enter your complete delivery address.",
        });
      }

      if (
        !validateAddress(
          address
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "address",

          message:
            "Address contains invalid characters.",
        });
      }

      /* =================================
         CITY
      ================================= */

      if (!city) {
        return res.status(400).json({
          success: false,

          field: "city",

          message:
            "Please enter your city.",
        });
      }

      if (
        !validateCity(
          city
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "city",

          message:
            "Please enter a valid city name.",
        });
      }

      /* =================================
         STATE
      ================================= */

      if (!state) {
        return res.status(400).json({
          success: false,

          field: "state",

          message:
            "Please enter your state.",
        });
      }

      if (
        !validateState(
          state
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "state",

          message:
            "Please enter a valid state name.",
        });
      }

      /* =================================
         PINCODE
      ================================= */

      if (!pincode) {
        return res.status(400).json({
          success: false,

          field: "pincode",

          message:
            "Please enter your PIN code.",
        });
      }

      if (
        !validatePincode(
          pincode
        )
      ) {
        return res.status(400).json({
          success: false,

          field: "pincode",

          message:
            "Please enter a valid 6-digit PIN code.",
        });
      }

      /* =================================
         CART
      ================================= */

      if (
        !Array.isArray(
          items
        ) ||
        items.length === 0
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Your cart is empty.",
        });
      }

      /* =================================
         PRODUCTS
      ================================= */

      const products =
        getProducts();

      const finalItems = [];

      let totalAmount = 0;

      for (
        const item of items
      ) {
        /*
          IMPORTANT FIX:

          Cart may send either:
          item.productId

          OR

          item.id
        */

        const cartProductId =
          item.productId ??
          item.id;

        const product =
          products.find(
            (product) =>
              String(
                product.id
              ) ===
              String(
                cartProductId
              )
          );

        if (!product) {
          return res.status(400).json({
            success: false,

            message:
              "One of the selected products is no longer available.",
          });
        }

        /* =================================
           QUANTITY
        ================================= */

        const quantity =
          Number(
            item.quantity
          );

        if (
          !Number.isInteger(
            quantity
          ) ||
          quantity < 1
        ) {
          return res.status(400).json({
            success: false,

            message:
              "Invalid product quantity.",
          });
        }

        /* =================================
           STOCK
        ================================= */

        if (
          Number(
            product.stock
          ) < quantity
        ) {
          return res.status(400).json({
            success: false,

            message:
              `${product.name} does not have enough stock.`,
          });
        }

        /* =================================
           COLOR
        ================================= */

        const color =
          cleanText(
            item.color
          ) || "Black";

        /* =================================
           PRICE
        ================================= */

        const itemPrice =
          Number(
            product.price
          );

        const itemTotal =
          itemPrice *
          quantity;

        totalAmount +=
          itemTotal;

        /* =================================
           FINAL ITEM
        ================================= */

        finalItems.push({
          productId:
            product.id,

          name:
            product.name,

          category:
            product.category,

          price:
            itemPrice,

          quantity,

          color,

          image:
            product.image,

          itemTotal,
        });
      }

      /* =================================
         REDUCE STOCK
      ================================= */

      const updatedProducts =
        products.map(
          (product) => {
            const orderedItem =
              finalItems.find(
                (item) =>
                  String(
                    item.productId
                  ) ===
                  String(
                    product.id
                  )
              );

            if (
              orderedItem
            ) {
              return {
                ...product,

                stock:
                  Number(
                    product.stock
                  ) -
                  orderedItem.quantity,
              };
            }

            return product;
          }
        );

      /* =================================
         ORDER ID
      ================================= */

      const orderId =
        generateOrderId();

      const now =
        new Date().toISOString();

      /* =================================
         PAYMENT STATUS
      ================================= */

      let paymentStatus =
        "Pending";

      if (
        paymentMethod ===
        "COD"
      ) {
        paymentStatus =
          "Cash on Delivery";
      }

      /* =================================
         CREATE ORDER
      ================================= */

      const order = {
        orderId,

        status:
          "Order Received",

        paymentStatus,

        paymentMethod,

        customer: {
          name,
          mobile,
          email,
          address,
          city,
          state,
          pincode,
        },

        items:
          finalItems,

        totalAmount,

        currency:
          "INR",

        createdAt:
          now,

        updatedAt:
          now,
      };

      /* =================================
         SAVE ORDER
      ================================= */

      const orders =
        getOrders();

      orders.unshift(
        order
      );

      saveProducts(
        updatedProducts
      );

      saveOrders(
        orders
      );

      /* =================================
         RESPONSE
      ================================= */

      return res.status(201).json({
        success: true,

        message:
          "Order placed successfully.",

        orderId,

        order,
      });
    } catch (error) {
      console.error(
        "ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Order process nahi ho saka. Please try again.",
      });
    }
  }
);

/* =================================
   GET SINGLE ORDER
================================= */

app.get(
  "/api/orders/:orderId",
  (req, res) => {
    try {
      const orderId =
        cleanText(
          req.params.orderId
        );

      const orders =
        getOrders();

      const order =
        orders.find(
          (item) =>
            item.orderId ===
            orderId
        );

      if (!order) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

      return res.json({
        success: true,

        order,
      });
    } catch (error) {
      console.error(
        "GET SINGLE ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Order load nahi ho saka.",
      });
    }
  }
);

/* =================================
   UPDATE ORDER STATUS
================================= */

app.patch(
  "/api/orders/:orderId/status",
  (req, res) => {
    try {
      const orderId =
        cleanText(
          req.params.orderId
        );

      const status =
        cleanText(
          req.body.status
        );

      const allowedStatuses = [
        "Order Received",
        "Confirmed",
        "Processing",
        "Packed",
        "Shipped",
        "Out for Delivery",
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
            "Invalid order status.",
        });
      }

      const orders =
        getOrders();

      const index =
        orders.findIndex(
          (order) =>
            order.orderId ===
            orderId
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

      orders[index] = {
        ...orders[index],

        status,

        updatedAt:
          new Date().toISOString(),
      };

      saveOrders(
        orders
      );

      return res.json({
        success: true,

        message:
          "Order status updated.",

        order:
          orders[index],
      });
    } catch (error) {
      console.error(
        "STATUS UPDATE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Status update nahi ho saka.",
      });
    }
  }
);

/* =================================
   UPDATE PAYMENT STATUS
================================= */

app.patch(
  "/api/orders/:orderId/payment",
  (req, res) => {
    try {
      const orderId =
        cleanText(
          req.params.orderId
        );

      const paymentStatus =
        cleanText(
          req.body.paymentStatus
        );

      const allowedPaymentStatuses = [
        "Pending",
        "Paid",
        "Failed",
        "Refunded",
        "Cash on Delivery",
      ];

      if (
        !allowedPaymentStatuses.includes(
          paymentStatus
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid payment status.",
        });
      }

      const orders =
        getOrders();

      const index =
        orders.findIndex(
          (order) =>
            order.orderId ===
            orderId
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

      orders[index] = {
        ...orders[index],

        paymentStatus,

        updatedAt:
          new Date().toISOString(),
      };

      saveOrders(
        orders
      );

      return res.json({
        success: true,

        message:
          "Payment status updated.",

        order:
          orders[index],
      });
    } catch (error) {
      console.error(
        "PAYMENT UPDATE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Payment status update nahi ho saka.",
      });
    }
  }
);

/* =================================
   GENERAL ERROR HANDLER
================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
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

    return res.status(400).json({
      success: false,

      message:
        error.message ||
        "Request failed.",
    });
  }
);

/* =================================
   START SERVER
================================= */

app.listen(
  PORT,
  "127.0.0.1",
  () => {
    console.log("");

    console.log(
      "================================"
    );

    console.log(
      "        LUXORA BACKEND"
    );

    console.log(
      "================================"
    );

    console.log(
      "Server:"
    );

    console.log(
      "http://127.0.0.1:5000"
    );

    console.log("");

    console.log(
      "Products:"
    );

    console.log(
      "http://127.0.0.1:5000/api/products"
    );

    console.log("");

    console.log(
      "Orders:"
    );

    console.log(
      "http://127.0.0.1:5000/api/orders"
    );

    console.log("");

    console.log(
      "================================"
    );

    console.log("");
  }
);