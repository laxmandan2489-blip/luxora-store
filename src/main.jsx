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
 * /track-order     -> Storefront, showing the full-page "Track
 *                     Order" experience instead of the homepage.
 * everything else  -> Storefront, all products
 *
 * "/category/:slug", "/track-order" and "/*" all render the SAME
 * <App /> element so the storefront never remounts when navigating
 * between them - cart, wishlist etc. all stay intact. App reads
 * which one it is from the URL itself (see src/App.jsx).
 */
root.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/category/:slug" element={<App />} />
        <Route path="/track-order" element={<App />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
