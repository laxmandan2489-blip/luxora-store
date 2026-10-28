import { useEffect, useMemo, useRef, useState } from "react";

/*
 * ADMIN > EMAIL CAMPAIGN (2026-10-21)
 * Send one promotional email (message + the 4 newest bags, picked
 * automatically by the server + optional coupon)
 * to old customers through the store's Gmail. The server sends slowly
 * (one every few seconds, max 400 a day) and skips unsubscribed people
 * and anyone who already got the same subject. See server.js
 * "EMAIL MARKETING CAMPAIGN" for details.
 */

// Splits one CSV / Excel-pasted line into cells (handles "quoted, cells").
function splitCells(line) {
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") && !line.includes(",") ? ";" : ",";
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/*
 * Reads a CSV file or pasted text. Works with or without a header row
 * ("Name,Email" / "Customer Name,Mail ID" ...). Extra columns like
 * phone or city are ignored - only the name and the email are used.
 */
function parseRecipients(text) {
  const seen = new Set();
  const result = [];
  let nameColumn = -1;
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = splitCells(line);
    const emailIndex = cells.findIndex((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell.replace(/^mailto:/i, "")));
    if (emailIndex === -1) {
      // Header row: remember which column holds the name.
      const headerName = cells.findIndex((cell) => /name/i.test(cell));
      if (headerName !== -1) nameColumn = headerName;
      continue;
    }
    const email = cells[emailIndex].replace(/^mailto:/i, "").toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    let name = nameColumn !== -1 && nameColumn !== emailIndex ? cells[nameColumn] || "" : "";
    if (!name) {
      name = cells.find((cell, index) => index !== emailIndex && cell && /[a-z]/i.test(cell) && !/\d{4,}/.test(cell) && !cell.includes("@")) || "";
    }
    result.push({ email, name: name.replace(/\s+/g, " ").trim().slice(0, 60) });
  }
  return result;
}

const PRESETS = {
  festive: {
    subject: "✨ Diwali Sale is live - your favourite bags at festive prices",
    heading: "This Diwali, carry something special",
    message:
      "Diwali is almost here, and we have something special for you. SHRIMOH now has its own website, and our festive collection of handbags, slings and totes is live at special Diwali prices.\n\nEvery bag below is handpicked for you. Free delivery on prepaid orders (COD available), easy 5-day returns and safe online payment.\n\nFestive prices last only for the season and stock is limited - pick your favourite before it's gone.",
  },
  normal: {
    subject: "New bags just arrived at SHRIMOH 👜",
    heading: "Fresh styles, made for every day",
    message:
      "Thank you for shopping with SHRIMOH before. We now have our own website, and our newest handbags, slings and totes have just arrived.\n\nEvery bag below is handpicked for you. Free delivery on prepaid orders (COD available), easy 5-day returns and safe online payment.\n\nTake a look - your next favourite bag might be waiting.",
  },
};

export default function EmailCampaign({ API, adminFetch }) {
  const [recipientText, setRecipientText] = useState("");
  const [subject, setSubject] = useState(PRESETS.festive.subject);
  const [heading, setHeading] = useState(PRESETS.festive.heading);
  const [message, setMessage] = useState(PRESETS.festive.message);
  const [festive, setFestive] = useState(true);

  // Switching the design also switches the ready-made text - unless
  // you already changed that text yourself.
  function switchDesign(nextFestive) {
    const from = PRESETS[nextFestive ? "normal" : "festive"];
    const to = PRESETS[nextFestive ? "festive" : "normal"];
    setFestive(nextFestive);
    if (subject === from.subject) setSubject(to.subject);
    if (heading === from.heading) setHeading(to.heading);
    if (message === from.message) setMessage(to.message);
  }
  const [couponCode, setCouponCode] = useState("");
  const [testEmail, setTestEmail] = useState("infoshrimoh@gmail.com");
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  const recipients = useMemo(() => parseRecipients(recipientText), [recipientText]);

  function content() {
    return { subject, heading, message, couponCode, festive };
  }

  async function postJson(path, body) {
    const response = await adminFetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  async function loadStatus() {
    try {
      const response = await adminFetch(`${API}/api/admin/email-campaign/status`);
      const data = await response.json();
      if (data.success) setStatus(data);
      return data;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const running = status?.job?.running;
    if (running && !pollRef.current) {
      pollRef.current = window.setInterval(loadStatus, 5000);
    }
    if (!running && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.job?.running]);

  function loadCsvFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (/\.(xlsx|xls|numbers)$/i.test(file.name)) {
      setNotice("❌ Please save the sheet as CSV first (Excel: Save As > CSV, Google Sheets: Download > CSV).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const list = parseRecipients(String(reader.result || ""));
      if (!list.length) {
        setNotice("❌ No emails found in this file.");
        return;
      }
      setRecipientText(list.map((item) => (item.name ? `${item.name.includes(",") ? `"${item.name.replace(/"/g, "")}"` : item.name}, ${item.email}` : item.email)).join("\n"));
      setNotice(`✅ Loaded ${list.length} customers from ${file.name}.`);
    };
    reader.onerror = () => setNotice("❌ Could not read the file.");
    reader.readAsText(file);
  }

  async function addWebsiteContacts() {
    setBusy("contacts");
    setNotice("");
    try {
      const [customersRes, newsletterRes] = await Promise.all([
        adminFetch(`${API}/api/admin/customers`).then((r) => r.json()).catch(() => ({})),
        adminFetch(`${API}/api/admin/newsletter`).then((r) => r.json()).catch(() => ({})),
      ]);
      const lines = [];
      for (const customer of customersRes.customers || []) {
        if (customer.email) lines.push(customer.name ? `${customer.name}, ${customer.email}` : customer.email);
      }
      for (const subscriber of newsletterRes.subscribers || []) {
        if (subscriber.email) lines.push(subscriber.email);
      }
      const before = recipients.length;
      const merged = parseRecipients([recipientText, ...lines].join("\n"));
      setRecipientText(merged.map((item) => (item.name ? `${item.name.includes(",") ? `"${item.name.replace(/"/g, "")}"` : item.name}, ${item.email}` : item.email)).join("\n"));
      setNotice(`✅ Added ${merged.length - before} emails from website customers & newsletter.`);
    } catch (error) {
      setNotice(`❌ ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function showPreview() {
    setBusy("preview");
    setNotice("");
    try {
      const data = await postJson("/api/admin/email-campaign/preview", content());
      setPreviewHtml(data.html);
    } catch (error) {
      setNotice(`❌ ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function sendTest() {
    setBusy("test");
    setNotice("");
    try {
      const data = await postJson("/api/admin/email-campaign/test", { ...content(), testEmail });
      setNotice(`✅ ${data.message} Check your inbox (and Promotions / Spam tab).`);
    } catch (error) {
      setNotice(`❌ ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function sendAll() {
    if (!recipients.length) {
      setNotice("Please add at least one email first.");
      return;
    }
    const ok = window.confirm(
      `Send "${subject}" to ${recipients.length} people?\n\nEmails go out slowly (about 15 per minute, max ${status?.dailyLimit || 400} a day). You can close this page - sending continues on the server.`
    );
    if (!ok) return;
    setBusy("send");
    setNotice("");
    try {
      const data = await postJson("/api/admin/email-campaign/send", { ...content(), recipients });
      await loadStatus();
      setNotice(data && data.message ? `✅ ${data.message}` : "✅ Sending started. Emails over today's limit will go automatically from tomorrow.");
    } catch (error) {
      setNotice(`❌ ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function stopSending() {
    try {
      await postJson("/api/admin/email-campaign/stop", {});
      await loadStatus();
    } catch (error) {
      setNotice(`❌ ${error.message}`);
    }
  }

  const job = status?.job;

  return (
    <div className="panel">
      <style>{`
        .ec-section { margin-bottom: 26px; }
        .ec-step { font-size: 15px; font-weight: 700; margin: 0 0 10px; }
        .ec-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
        .ec-count { font-size: 13px; color: #555; }
        .ec-notice { padding: 12px 14px; background: #f6f3ea; border-radius: 9px; font-size: 14px; margin-bottom: 16px; }
        .ec-status { padding: 14px; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; line-height: 1.7; margin-bottom: 20px; }
        .ec-preview { width: 100%; height: 640px; border: 1px solid #ddd; border-radius: 10px; background: #fff; margin-top: 12px; }
      `}</style>

      <div className="panel-header">
        <h2 className="panel-title">Email Campaign</h2>
      </div>

      {notice ? <div className="ec-notice">{notice}</div> : null}

      {status ? (
        <div className="ec-status">
          <div>
            <strong>Sent in last 24 hours:</strong> {status.sentToday ?? "?"} / {status.dailyLimit}
          </div>
          {status.queued ? (
            <div>
              <strong>Waiting to send automatically:</strong> {status.queued} (sent between 10 AM - 8 PM, up to {status.dailyLimit} a day)
            </div>
          ) : null}
          {job ? (
            <>
              <div>
                <strong>{job.running ? "⏳ Sending" : "Last campaign"}:</strong> “{job.subject}”
              </div>
              <div>
                Sent {job.sent} of {job.total}
                {job.failed ? ` • Failed ${job.failed}` : ""}
                {job.skippedAlreadySent ? ` • Already had it ${job.skippedAlreadySent}` : ""}
                {job.skippedUnsubscribed ? ` • Unsubscribed ${job.skippedUnsubscribed}` : ""}
                {job.leftForTomorrow ? ` • Left for tomorrow ${job.leftForTomorrow} (will send automatically)` : ""}
              </div>
              {job.stoppedReason ? <div>⚠️ {job.stoppedReason}</div> : null}
              {job.lastError ? <div style={{ color: "#a33" }}>Last error: {job.lastError}</div> : null}
              {job.running ? (
                <div className="ec-row">
                  <button type="button" className="secondary-button" onClick={stopSending}>
                    Stop sending
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="ec-section">
        <p className="ec-step">1. Customer name and email</p>
        <div className="ec-row" style={{ marginTop: 0, marginBottom: 10 }}>
          <label className="save-product-button" style={{ cursor: "pointer", display: "inline-block" }}>
            📄 Upload CSV file
            <input type="file" accept=".csv,text/csv,text/plain" onChange={loadCsvFile} style={{ display: "none" }} />
          </label>
          <span className="ec-count">CSV with name and email columns (phone etc. is ignored)</span>
        </div>
        <textarea
          className="form-textarea"
          rows={7}
          value={recipientText}
          onChange={(event) => setRecipientText(event.target.value)}
          placeholder={"Upload a CSV above, or paste here - one customer per line, name, email:\nPriya Sharma, priya@gmail.com\nAnita Verma, anita@gmail.com"}
        />
        <div className="ec-row">
          <span className="ec-count">
            <strong>{recipients.length}</strong> valid emails
          </span>
          <button type="button" className="secondary-button" onClick={addWebsiteContacts} disabled={busy === "contacts"}>
            {busy === "contacts" ? "Adding..." : "+ Add website customers & newsletter"}
          </button>
        </div>
      </div>

      <div className="ec-section">
        <p className="ec-step">2. Message (already written - change only if you want)</p>
        <div className="form-group">
          <label className="form-label">Subject (shown in inbox)</label>
          <input className="form-input" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Heading (big text inside the email)</label>
          <input className="form-input" value={heading} onChange={(event) => setHeading(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Message</label>
          <textarea className="form-textarea" rows={6} value={message} onChange={(event) => setMessage(event.target.value)} />
        </div>
        <label className="form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input type="checkbox" checked={festive} onChange={(event) => switchDesign(event.target.checked)} />
          Festive design (Diwali sale banner). Untick for a normal email - text changes too.
        </label>
        <div className="form-group">
          <label className="form-label">Coupon code (optional)</label>
          <input
            className="form-input"
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            placeholder="e.g. WELCOME10 (create it in the Coupons tab first)"
          />
        </div>
      </div>

      <div className="ec-section">
        <p className="ec-step">3. Test, then send</p>
        <p className="form-hint">The bags with the biggest saving among your newest arrivals (photo, price, % OFF and link) are added automatically.</p>
        <div className="ec-row">
          <button type="button" className="secondary-button" onClick={showPreview} disabled={!!busy}>
            {busy === "preview" ? "Loading..." : "👁 Preview"}
          </button>
        </div>
        <div className="ec-row">
          <input
            className="form-input"
            style={{ maxWidth: 280 }}
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            placeholder="your email"
          />
          <button type="button" className="secondary-button" onClick={sendTest} disabled={!!busy}>
            {busy === "test" ? "Sending..." : "Send test to me"}
          </button>
        </div>
        <div className="ec-row">
          <button
            type="button"
            className="save-product-button"
            onClick={sendAll}
            disabled={!!busy || job?.running}
          >
            {busy === "send" ? "Starting..." : `📨 Send to ${recipients.length} people`}
          </button>
        </div>
        {previewHtml ? <iframe className="ec-preview" title="Email preview" srcDoc={previewHtml} /> : null}
      </div>
    </div>
  );
}
