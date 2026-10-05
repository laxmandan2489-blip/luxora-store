import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
/*
 * SPEED FIX (2026-10-05): the Admin panel is ~230KB of code that no
 * customer ever needs. It used to be bundled into the same file as the
 * storefront, so every shopper downloaded + parsed it before the first
 * product could show. Now it is a separate file loaded only when
 * someone actually opens /admin.
 */
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-reloaded
const Admin = lazy(() => import("./Admin.jsx"));

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
 * /product/:id     -> Storefront, showing a single product as a
 *                     real full page at its own URL (not a popup) -
 *                     shareable and works with browser back/forward.
 * everything else  -> Storefront, all products
 *
 * "/category/:slug", "/track-order", "/product/:id" and "/*" all
 * render the SAME <App /> element so the storefront never remounts
 * when navigating between them - cart, wishlist etc. all stay
 * intact. App reads which one it is from the URL itself (see
 * src/App.jsx).
 */
root.render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading admin…</div>}>
              <Admin />
            </Suspense>
          }
        />
        <Route path="/category/:slug" element={<App />} />
        <Route path="/track-order" element={<App />} />
        <Route path="/product/:id" element={<App />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
