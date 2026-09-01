import { useState } from "react";

const API = "http://127.0.0.1:5000";

export default function Checkout() {
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  function validateForm() {
    const nameRegex = /^[A-Za-z ]+$/;
    const mobileRegex = /^[6-9][0-9]{9}$/;
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const pincodeRegex = /^[1-9][0-9]{5}$/;

    if (!form.name.trim()) {
      return "Please enter your full name.";
    }

    if (!nameRegex.test(form.name.trim())) {
      return "Name can contain letters and normal spaces only.";
    }

    if (!mobileRegex.test(form.mobile.trim())) {
      return "Please enter a valid 10-digit Indian mobile number.";
    }

    if (!emailRegex.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }

    if (!form.address.trim()) {
      return "Please enter your complete delivery address.";
    }

    if (!form.city.trim()) {
      return "Please enter your city.";
    }

    if (!nameRegex.test(form.city.trim())) {
      return "Please enter a valid city name.";
    }

    if (!form.state.trim()) {
      return "Please enter your state.";
    }

    if (!nameRegex.test(form.state.trim())) {
      return "Please enter a valid state name.";
    }

    if (!pincodeRegex.test(form.pincode.trim())) {
      return "Please enter a valid 6-digit PIN code.";
    }

    return "";
  }

  async function placeOrder(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        API + "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            customer: {
              name: form.name.trim(),
              mobile: form.mobile.trim(),
              email: form.email.trim().toLowerCase(),
              address: form.address.trim(),
              city: form.city.trim(),
              state: form.state.trim(),
              pincode: form.pincode.trim(),
            },

            items: [],

            paymentMethod: "COD",

            totalAmount: 0,
          }),
        }
      );

      const data = await response.json();

      console.log("ORDER RESPONSE:", data);

      if (!response.ok || !data.success) {
        setError(
          data.message ||
            "Order could not be placed."
        );
        return;
      }

      setSuccess(
        `Order placed successfully. Order ID: ${
          data.orderId || data.order?.orderNumber || data.order?.id
        }`
      );

      setForm({
        name: "",
        mobile: "",
        email: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
      });
    } catch (error) {
      console.error("ORDER ERROR:", error);

      setError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "700px",
        margin: "40px auto",
        padding: "20px",
      }}
    >
      <h1>Checkout</h1>

      <form onSubmit={placeOrder}>

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={form.name}
          onChange={handleChange}
          maxLength={60}
        />

        <input
          type="tel"
          name="mobile"
          placeholder="10 Digit Mobile Number"
          value={form.mobile}
          onChange={handleChange}
          maxLength={10}
        />

        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={form.email}
          onChange={handleChange}
        />

        <textarea
          name="address"
          placeholder="Complete Delivery Address"
          value={form.address}
          onChange={handleChange}
          maxLength={250}
        />

        <input
          type="text"
          name="city"
          placeholder="City"
          value={form.city}
          onChange={handleChange}
          maxLength={50}
        />

        <input
          type="text"
          name="state"
          placeholder="State"
          value={form.state}
          onChange={handleChange}
          maxLength={50}
        />

        <input
          type="text"
          name="pincode"
          placeholder="6 Digit PIN Code"
          value={form.pincode}
          onChange={handleChange}
          maxLength={6}
        />

        {error && (
          <div
            style={{
              color: "red",
              margin: "15px 0",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              color: "green",
              margin: "15px 0",
              fontWeight: "bold",
            }}
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading
            ? "PLACING ORDER..."
            : "PLACE ORDER"}
        </button>

      </form>
    </div>
  );
}