import { useEffect, useState } from "react";

const API = "http://127.0.0.1:5000";

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
  "Girls",
  "Boys",
  "Jewellery",
  "Rings",
  "Bracelets",
  "Accessories",
];

const ORDER_STATUSES = [
  "Pending",
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
    "Pending"
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

function getCustomerName(order) {
  return (
    order?.customer?.name ||
    order?.customerName ||
    order?.name ||
    "Customer"
  );
}

function getCustomerMobile(order) {
  return (
    order?.customer?.mobile ||
    order?.customer?.phone ||
    order?.mobile ||
    order?.phone ||
    "—"
  );
}

function getCustomerEmail(order) {
  return (
    order?.customer?.email ||
    order?.email ||
    "—"
  );
}

function getCustomerAddress(order) {
  const customer = order?.customer || {};

  const parts = [
    customer.address || order?.address,
    customer.city || order?.city,
    customer.state || order?.state,
    customer.pincode || order?.pincode,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "—";
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

  const [name, setName] = useState("");

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

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, []);

  async function loadProducts() {
    try {
      setLoadingProducts(true);

      const response = await fetch(
        `${API}/api/products`
      );

      const data = await response.json();

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

  async function loadOrders() {
    try {
      setLoadingOrders(true);

      const possibleUrls = [
        `${API}/api/orders`,
        `${API}/orders`,
      ];

      let loaded = false;

      for (const url of possibleUrls) {
        try {
          const response = await fetch(url);

          if (!response.ok) {
            continue;
          }

          const data = await response.json();

          let receivedOrders = [];

          if (Array.isArray(data)) {
            receivedOrders = data;
          } else if (
            Array.isArray(data?.orders)
          ) {
            receivedOrders = data.orders;
          } else if (
            Array.isArray(data?.data)
          ) {
            receivedOrders = data.data;
          }

          if (Array.isArray(receivedOrders)) {
            setOrders(receivedOrders);
            loaded = true;
            break;
          }
        } catch (error) {
          console.log(
            `ORDER URL FAILED: ${url}`
          );
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

  function handleImagesChange(event) {
    const selectedFiles = Array.from(
      event.target.files || []
    );

    setImages(selectedFiles);
  }

  async function addProduct(event) {
    event.preventDefault();

    if (!name.trim()) {
      alert("Product name required.");
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

      const formData = new FormData();

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

      images.forEach((file) => {
        formData.append(
          "images",
          file
        );
      });

      const response = await fetch(
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

  async function updateOrderStatus(
    order,
    newStatus
  ) {
    const id = getOrderId(order);

    if (!id || id === "—") {
      alert("Order ID not found.");
      return;
    }

    try {
      setSavingStatus(true);

      const possibleRequests = [
        {
          url: `${API}/api/orders/${id}`,
          method: "PUT",
        },
        {
          url: `${API}/api/orders/${id}/status`,
          method: "PUT",
        },
        {
          url: `${API}/api/orders/${id}/status`,
          method: "PATCH",
        },
      ];

      let success = false;

      for (const request of possibleRequests) {
        try {
          const response = await fetch(
            request.url,
            {
              method: request.method,
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                status: newStatus,
                orderStatus: newStatus,
              }),
            }
          );

          if (response.ok) {
            success = true;
            break;
          }
        } catch (error) {
          console.log(
            "STATUS REQUEST FAILED:",
            request.url
          );
        }
      }

      if (!success) {
        throw new Error(
          "Server status update endpoint not available."
        );
      }

      setOrders((previous) =>
        previous.map((item) => {
          if (
            String(getOrderId(item)) ===
            String(id)
          ) {
            return {
              ...item,
              status: newStatus,
              orderStatus: newStatus,
            };
          }

          return item;
        })
      );

      setSelectedOrder((previous) => {
        if (
          previous &&
          String(getOrderId(previous)) ===
            String(id)
        ) {
          return {
            ...previous,
            status: newStatus,
            orderStatus: newStatus,
          };
        }

        return previous;
      });
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

  const filteredOrders =
    orders.filter((order) => {
      const search =
        orderSearch
          .trim()
          .toLowerCase();

      if (!search) return true;

      const text = [
        getOrderId(order),
        getCustomerName(order),
        getCustomerMobile(order),
        getCustomerEmail(order),
        getOrderStatus(order),
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });

  const filteredProducts =
    products.filter((product) => {
      const search =
        productSearch
          .trim()
          .toLowerCase();

      if (!search) return true;

      return [
        product.name,
        product.category,
        product.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

  const pendingCount =
    orders.filter(
      (order) =>
        getOrderStatus(order) ===
        "Pending"
    ).length;

  const confirmedCount =
    orders.filter(
      (order) =>
        getOrderStatus(order) ===
        "Confirmed"
    ).length;

  const shippedCount =
    orders.filter(
      (order) =>
        getOrderStatus(order) ===
        "Shipped"
    ).length;

  const deliveredCount =
    orders.filter(
      (order) =>
        getOrderStatus(order) ===
        "Delivered"
    ).length;

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

        .status {
          display: inline-block;
          padding: 7px 10px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 800;
        }

        .status-pending {
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

        @media (max-width: 1000px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .product-grid {
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

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .product-form-grid {
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
        }
      `}</style>

      <header className="admin-header">
        <div>
          <h1 className="brand-title">
            LUXORA ADMIN
          </h1>

          <p className="brand-subtitle">
            THE LUXURY STORE • ADMIN PANEL
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={() => {
            loadOrders();
            loadProducts();
          }}
        >
          ↻ Refresh
        </button>
      </header>

      <main className="admin-container">
        <div className="tabs">
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
        </div>

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
                  PENDING
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
              ) : filteredOrders.length === 0 ? (
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
                        (order, index) => {
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
                              {product.stock ??
                                0}
                            </div>

                            <div className="customer-info">
                              Images:{" "}
                              {
                                productImages.length
                              }
                            </div>
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
    </div>
  );
}

export default Admin;