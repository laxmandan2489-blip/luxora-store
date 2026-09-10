import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Admin from "./Admin.jsx";

const root = createRoot(document.getElementById("root"));

/*
 * ROUTING
 *
 * /admin           -> Admin panel (unchanged behaviour)
 * /category/:slug  -> Storefront, pre-filtered to that one category
 *                     (real URL, shareable, works with browser
 *                     back/forward) - this is new.
 * everything else  -> Storefront, all products
 *
 * Both "/category/:slug" and "/*" render the SAME <App /> element
 * so the storefront never remounts when switching categories -
 * cart, wishlist etc. all stay intact. App reads the category out
 * of the URL itself (see src/App.jsx).
 */
root.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/category/:slug" element={<App />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
