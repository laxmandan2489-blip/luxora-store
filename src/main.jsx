import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Admin from "./Admin.jsx";

const root = createRoot(
  document.getElementById("root")
);

if (window.location.pathname === "/admin") {
  root.render(
    <StrictMode>
      <Admin />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}