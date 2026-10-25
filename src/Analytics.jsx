import { useEffect, useState } from "react";

/*
 * ADMIN > ANALYTICS (2026-10-25)
 * Shows how many people visited the site, which bags they looked at,
 * wishlist / cart adds, how many reached checkout and how many ordered.
 * Data comes from /api/admin/analytics (server.js "SITE ANALYTICS").
 */

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

function percent(part, whole) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function imageUrl(API, image) {
  if (!image) return "";
  const value = String(image).trim();
  if (/^(https?:|data:)/.test(value)) return value;
  return value.startsWith("/") ? `${API}${value}` : `${API}/${value}`;
}

export default function Analytics({ API, adminFetch }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);

  async function load(selectedDays = days) {
    try {
      setLoading(true);
      setError("");
      setSetupNeeded(false);
      const response = await adminFetch(`${API}/api/admin/analytics?days=${selectedDays}`);
      const result = await response.json();
      if (result?.success) {
        setData(result.analytics);
      } else {
        setData(null);
        if (result?.setupNeeded) setSetupNeeded(true);
        setError(result?.message || "Unable to load analytics.");
      }
    } catch (loadError) {
      console.error("ANALYTICS LOAD ERROR:", loadError);
      setData(null);
      setError("Unable to load analytics. Please check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const funnel = data
    ? [
        { label: "Visited the website", value: data.visitors },
        { label: "Opened a bag", value: data.productViewers },
        { label: "Added to wishlist", value: data.wishlistVisitors },
        { label: "Added to cart", value: data.cartVisitors },
        { label: "Reached checkout", value: data.checkoutVisitors },
        { label: "Placed an order", value: data.orders },
      ]
    : [];
  const maxDaily = data ? Math.max(1, ...data.dailyVisitors.map((day) => day.visitors)) : 1;
  const hours = data && Array.isArray(data.pageViewsByHour) ? data.pageViewsByHour : [];
  const maxHour = Math.max(1, ...hours);
  const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;

  return (
    <div className="panel">
      <style>{`
        .an-ranges { display: flex; gap: 8px; flex-wrap: wrap; }
        .an-range { padding: 8px 14px; border-radius: 999px; border: 1px solid #ddd; background: white; cursor: pointer; font-size: 14px; color: #111; }
        .an-range.active { background: #111; color: white; border-color: #111; }
        .an-funnel { display: grid; gap: 10px; margin-bottom: 28px; }
        .an-funnel-row { display: grid; grid-template-columns: minmax(130px, 190px) 1fr 90px; align-items: center; gap: 10px; font-size: 14px; }
        .an-bar-track { background: #f1f1f1; border-radius: 8px; height: 26px; overflow: hidden; }
        .an-bar { background: #111; height: 100%; border-radius: 8px; min-width: 2px; }
        .an-funnel-value { text-align: right; font-weight: 700; }
        .an-funnel-value small { color: #888; font-weight: 400; margin-left: 4px; }
        .an-section-title { font-size: 17px; margin: 0 0 12px; }
        .an-daily { display: flex; align-items: flex-end; gap: 4px; height: 120px; margin-bottom: 28px; overflow-x: auto; padding-bottom: 22px; position: relative; }
        .an-day { flex: 1 0 18px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
        .an-day-bar { width: 100%; background: #c9a227; border-radius: 4px 4px 0 0; min-height: 2px; }
        .an-day-num { font-size: 11px; color: #555; margin-bottom: 2px; }
        .an-day-label { position: absolute; bottom: -20px; font-size: 10px; color: #888; white-space: nowrap; }
        .an-table-wrap { overflow-x: auto; }
        .an-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 560px; }
        .an-table th { text-align: left; color: #777; font-weight: 600; font-size: 12px; padding: 8px; border-bottom: 1px solid #eee; }
        .an-table td { padding: 8px; border-bottom: 1px solid #f2f2f2; vertical-align: middle; }
        .an-table td.num { text-align: center; font-weight: 600; }
        .an-product { display: flex; align-items: center; gap: 10px; }
        .an-product img { width: 44px; height: 44px; object-fit: cover; border-radius: 8px; background: #f3f3f3; }
        .an-two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 28px; }
        .an-box { border: 1px solid #eee; border-radius: 14px; padding: 16px; }
        .an-list { list-style: none; margin: 0; padding: 0; font-size: 14px; }
        .an-list li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f3f3f3; }
        .an-list li:last-child { border-bottom: 0; }
        .an-muted { color: #888; font-size: 13px; }
        .an-hours { display: flex; align-items: flex-end; gap: 3px; height: 110px; margin-bottom: 28px; overflow-x: auto; padding-bottom: 20px; }
        .an-hour { flex: 1 0 14px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; position: relative; }
        .an-hour-bar { width: 100%; background: #111; border-radius: 3px 3px 0 0; min-height: 2px; }
        .an-hour-label { position: absolute; bottom: -18px; font-size: 9px; color: #888; white-space: nowrap; }
        .an-tip { background: #fbf6e6; border: 1px solid #efe1b0; border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 28px; }
        .an-note { color: #777; font-size: 13px; margin-top: 14px; line-height: 1.5; }
        @media (max-width: 640px) {
          .an-two { grid-template-columns: 1fr; }
          .an-funnel-row { grid-template-columns: 1fr 70px; }
          .an-funnel-row .an-bar-track { grid-column: 1 / -1; grid-row: 2; height: 14px; }
        }
      `}</style>

      <div className="panel-header">
        <h2 className="panel-title">Analytics</h2>
        <div className="an-ranges">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              className={days === range.days ? "an-range active" : "an-range"}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading analytics...</div>
      ) : setupNeeded ? (
        <div className="empty-state">
          Analytics table is not created yet. Run the site_events SQL in Supabase, then press Retry.
          <div>
            <button type="button" className="secondary-button" style={{ marginTop: 12 }} onClick={() => load()}>
              Retry
            </button>
          </div>
        </div>
      ) : error || !data ? (
        <div className="empty-state">
          {error || "No data."}
          <div>
            <button type="button" className="secondary-button" style={{ marginTop: 12 }} onClick={() => load()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">VISITORS</div>
              <div className="stat-number">{data.visitors}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">PAGE VIEWS</div>
              <div className="stat-number">{data.pageViews}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">ORDERS</div>
              <div className="stat-number">{data.orders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">ORDER VALUE</div>
              <div className="stat-number">₹{Number(data.orderValue || 0).toLocaleString("en-IN")}</div>
            </div>
          </div>

          <h3 className="an-section-title">Customer journey</h3>
          <div className="an-funnel">
            {funnel.map((step) => (
              <div className="an-funnel-row" key={step.label}>
                <div>{step.label}</div>
                <div className="an-bar-track">
                  <div className="an-bar" style={{ width: percent(step.value, data.visitors || 1) }} />
                </div>
                <div className="an-funnel-value">
                  {step.value}
                  <small>{percent(step.value, data.visitors)}</small>
                </div>
              </div>
            ))}
          </div>

          {Array.isArray(data.sources) && (
            <>
              <h3 className="an-section-title">Where visitors come from</h3>
              {data.sources.length === 0 ? (
                <div className="empty-state">No visits yet in this period.</div>
              ) : (
                <div className="an-table-wrap" style={{ marginBottom: 12 }}>
                  <table className="an-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Visitors</th>
                        <th>Opened a bag</th>
                        <th>Cart</th>
                        <th>Checkout</th>
                        <th>Orders</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((source) => (
                        <tr key={source.name}>
                          <td>{source.name}</td>
                          <td className="num">{source.visitors}</td>
                          <td className="num">{source.productViewers}</td>
                          <td className="num">{source.cartVisitors}</td>
                          <td className="num">{source.checkoutVisitors}</td>
                          <td className="num">{source.purchases}</td>
                          <td className="num">₹{Number(source.purchaseValue || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="an-tip">
                Tip: to see exactly which sales came from your Meta ads, add this in Ads Manager → Ad → Tracking →
                URL parameters: <b>utm_source=meta&amp;utm_medium=paid&amp;utm_campaign={"{{campaign.name}}"}</b>.
                For links you share on WhatsApp, add <b>?utm_source=whatsapp</b> at the end of the link
                (example: shrimoh.vercel.app/?utm_source=whatsapp).
              </div>
            </>
          )}

          {data.days > 1 && data.dailyVisitors.length > 0 && (
            <>
              <h3 className="an-section-title">Visitors per day</h3>
              <div className="an-daily">
                {data.dailyVisitors.map((day) => (
                  <div className="an-day" key={day.date} title={`${day.date}: ${day.visitors}`}>
                    <div className="an-day-num">{day.visitors}</div>
                    <div className="an-day-bar" style={{ height: `${(day.visitors / maxDaily) * 80}%` }} />
                    <div className="an-day-label">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {hours.some((count) => count > 0) && (
            <>
              <h3 className="an-section-title">Busiest time of day (India time)</h3>
              <div className="an-hours">
                {hours.map((count, hour) => (
                  <div className="an-hour" key={hour} title={`${hourLabel(hour)}: ${count} page views`}>
                    <div className="an-hour-bar" style={{ height: `${(count / maxHour) * 85}%` }} />
                    {hour % 3 === 0 && <div className="an-hour-label">{hourLabel(hour)}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {data.payment && (
            <div className="an-two">
              <div className="an-box">
                <h3 className="an-section-title">Payment type</h3>
                <ul className="an-list">
                  <li>
                    <span>Prepaid (online)</span>
                    <span>{data.payment.prepaid} · ₹{Number(data.payment.prepaidValue || 0).toLocaleString("en-IN")}</span>
                  </li>
                  <li>
                    <span>Cash on Delivery</span>
                    <span>{data.payment.cod} · ₹{Number(data.payment.codValue || 0).toLocaleString("en-IN")}</span>
                  </li>
                  <li>
                    <span>Cancelled orders</span>
                    <span>{data.cancelledOrders || 0}</span>
                  </li>
                </ul>
                {Array.isArray(data.coupons) && data.coupons.length > 0 && (
                  <>
                    <div className="an-muted" style={{ marginTop: 12 }}>Coupons used</div>
                    <ul className="an-list">
                      {data.coupons.map((coupon) => (
                        <li key={coupon.name}>
                          <span>{coupon.name}</span>
                          <span>{coupon.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="an-box">
                <h3 className="an-section-title">Orders by place</h3>
                {!data.topStates || data.topStates.length === 0 ? (
                  <div className="an-muted">No orders yet in this period.</div>
                ) : (
                  <>
                    <div className="an-muted">States</div>
                    <ul className="an-list">
                      {data.topStates.map((place) => (
                        <li key={place.name}>
                          <span>{place.name}</span>
                          <span>{place.count}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="an-muted" style={{ marginTop: 12 }}>Cities</div>
                    <ul className="an-list">
                      {data.topCities.map((place) => (
                        <li key={place.name}>
                          <span>{place.name}</span>
                          <span>{place.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          <h3 className="an-section-title">Bags (most viewed first)</h3>
          {data.products.length === 0 ? (
            <div className="empty-state">No bag views yet in this period.</div>
          ) : (
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Bag</th>
                    <th>Views</th>
                    <th>People</th>
                    <th>Wishlist</th>
                    <th>Cart</th>
                    <th>Ordered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.productId}>
                      <td>
                        <div className="an-product">
                          {product.image ? <img src={imageUrl(API, product.image)} alt="" loading="lazy" /> : <img alt="" />}
                          <div>
                            <div>{product.name}</div>
                            {product.price ? <div style={{ color: "#888", fontSize: 12 }}>₹{product.price}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="num">{product.views}</td>
                      <td className="num">{product.uniqueViewers}</td>
                      <td className="num">{product.wishlist}</td>
                      <td className="num">{product.cart}</td>
                      <td className="num">{product.ordered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="an-note">
            Mobile visitors: {data.mobileVisitors} of {data.visitors}. "Views" counts every time a bag page was
            opened; "People" counts different visitors. Your own visits are counted too (except the Admin panel).
            Tracking started on the day this feature went live, so older visits are not included.
          </div>
        </>
      )}
    </div>
  );
}
