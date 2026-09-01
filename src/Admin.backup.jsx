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

function Admin() {
  const [products, setProducts] = useState([]);

  const [name, setName] = useState("");
  const [category, setCategory] =
    useState("Bags");

  const [price, setPrice] = useState("");
  const [oldPrice, setOldPrice] =
    useState("");

  const [stock, setStock] = useState("");
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

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const response = await fetch(
        `${API}/api/products`
      );

      const data =
        await response.json();

      if (
        data.success &&
        Array.isArray(data.products)
      ) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error(
        "PRODUCT LOAD ERROR:",
        error
      );
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

      console.log(
        "ADD PRODUCT RESPONSE:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Server error ${response.status}`
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "Product could not be added."
        );
      }

      setMessage(
        "Product successfully added!"
      );

      setName("");
      setCategory("Bags");
      setPrice("");
      setOldPrice("");
      setStock("");
      setDescription("");
      setColors("Black");
      setImages([]);

      event.target.reset();

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

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#f5f5f5",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <h1>LUXORA ADMIN</h1>

        <p>
          Add products with multiple images
        </p>

        <form
          onSubmit={addProduct}
          style={{
            background: "#fff",
            padding: "30px",
            borderRadius: "15px",
            marginTop: "25px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, 1fr)",
              gap: "20px",
            }}
          >
            <div>
              <label>
                Product Name *
              </label>

              <input
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value
                  )
                }
                placeholder="Luxury Handbag"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Category *
              </label>

              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value
                  )
                }
                style={inputStyle}
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

            <div>
              <label>
                Price *
              </label>

              <input
                type="number"
                value={price}
                onChange={(event) =>
                  setPrice(
                    event.target.value
                  )
                }
                placeholder="2999"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Old Price
              </label>

              <input
                type="number"
                value={oldPrice}
                onChange={(event) =>
                  setOldPrice(
                    event.target.value
                  )
                }
                placeholder="4499"
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Stock *
              </label>

              <input
                type="number"
                value={stock}
                onChange={(event) =>
                  setStock(
                    event.target.value
                  )
                }
                placeholder="10"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Colors
              </label>

              <input
                value={colors}
                onChange={(event) =>
                  setColors(
                    event.target.value
                  )
                }
                placeholder="Black, Brown, White"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label>
                Description
              </label>

              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value
                  )
                }
                placeholder="Premium quality luxury bag..."
                rows="5"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label>
                Product Images *
              </label>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={
                  handleImagesChange
                }
                style={{
                  display: "block",
                  marginTop: "10px",
                }}
              />

              {images.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "20px",
                  }}
                >
                  {images.map(
                    (file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        style={{
                          width: "100px",
                          height: "120px",
                          border:
                            "1px solid #ddd",
                          padding: "5px",
                        }}
                      >
                        <img
                          src={URL.createObjectURL(
                            file
                          )}
                          alt={`Preview ${
                            index + 1
                          }`}
                          style={{
                            width: "100%",
                            height: "90px",
                            objectFit:
                              "cover",
                          }}
                        />

                        <small>
                          Image{" "}
                          {index + 1}
                        </small>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "25px",
              padding:
                "14px 30px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            {loading
              ? "UPLOADING..."
              : "ADD PRODUCT"}
          </button>

          {message && (
            <p
              style={{
                marginTop: "15px",
                fontWeight: "bold",
              }}
            >
              {message}
            </p>
          )}
        </form>

        <div
          style={{
            marginTop: "40px",
          }}
        >
          <h2>
            Existing Products
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3, 1fr)",
              gap: "20px",
            }}
          >
            {products.map(
              (product) => {
                const productImages =
                  Array.isArray(
                    product.images
                  )
                    ? product.images
                    : product.image
                    ? [product.image]
                    : [];

                return (
                  <div
                    key={product.id}
                    style={{
                      background:
                        "#fff",
                      padding: "15px",
                      borderRadius:
                        "12px",
                    }}
                  >
                    <img
                      src={
                        getImageUrl(
                          productImages[0]
                        )
                      }
                      alt={
                        product.name
                      }
                      style={{
                        width: "100%",
                        height: "220px",
                        objectFit:
                          "cover",
                      }}
                    />

                    <h3>
                      {product.name}
                    </h3>

                    <p>
                      {product.category}
                    </p>

                    <strong>
                      ₹
                      {Number(
                        product.price ||
                          0
                      ).toLocaleString(
                        "en-IN"
                      )}
                    </strong>

                    <p>
                      Images:{" "}
                      {
                        productImages.length
                      }
                    </p>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginTop: "7px",
  border: "1px solid #ddd",
  borderRadius: "7px",
  boxSizing: "border-box",
};

export default Admin;