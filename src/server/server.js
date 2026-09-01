const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LUXORA Backend is running successfully!",
  });
});

app.get("/api/products", (req, res) => {
  res.json({
    success: true,
    products: [],
  });
});

app.listen(PORT, () => {
  console.log("");
  console.log("================================");
  console.log("LUXORA BACKEND");
  console.log("================================");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Products: http://localhost:${PORT}/api/products`);
  console.log("================================");
  console.log("");
});