import { useState } from "react";
import { writeDescription } from "./descriptionWriter";

/*
 * ADMIN > PRODUCTS > "Description check - jhoothe dawe" (2026-10-28)
 * ------------------------------------------------------------------
 * SHRIMOH resells (Meesho partner sellers) - we don't make the bags,
 * don't check them ourselves and don't give a warranty. Product text
 * copied from suppliers often says "Genuine leather", "Handmade",
 * "1 year warranty", "Free delivery", "7 days return" ... which is not
 * true for us (free delivery is prepaid only, COD is ₹150, returns are
 * 5 days and are shown by the site itself).
 * Step 1 "Check": lists every product with such lines and shows what
 *   would be removed (red). Nothing changes.
 * Step 2 "Save": for ticked products only, removes those sentences /
 *   points and saves ONLY the text fields (description, key features,
 *   materials, care, trust points). Photos, price etc. are not sent.
 * "Check yourself" words (like plain "leather") are only shown, never
 * removed automatically.
 * (2026-10-28 v2) A description that ends up empty or very short (or was
 * already empty) gets a NEW honest one from descriptionWriter.js - built
 * only from the bag's own name, colours, key features and size, mixed
 * differently for every bag. "🔄 Dusri likho" gives another version.
 */
const SHORT_DESCRIPTION = 80;

// Sentence/point is REMOVED when it matches one of these.
const REMOVE_RULES = [
  { label: "asli leather ka dawa", re: /\b(genuine|pure|real|original|100\s*%|full[\s-]?grain|top[\s-]?grain|cow|buffalo|goat|sheep)\s*(hide\s*)?leather\b/i },
  { label: "leather ka dawa", re: /\bitalian\s+leather\b|\bleather\s+(guarantee|certified)\b/i },
  { label: "handmade / kaarigar", re: /\b(hand[\s-]?made|hand[\s-]?crafted|hand[\s-]?stitched|hand[\s-]?woven|artisan\w*|crafts(?:wo)?m[ae]n\w*|crafted\s+by|we\s+craft|our\s+workshop|made\s+by\s+us|we\s+make|in[\s-]?house)\b/i },
  { label: "warranty / guarantee", re: /\b(warrant(y|ies|ee)|guarantee[ds]?|lifetime)\b/i },
  { label: "brand / import ka dawa", re: /\b(100\s*%\s*(authentic|original)|original\s+brand|branded|designer\s+brand|first\s+copy|imported|made\s+in\s+(italy|france|usa|uk|china|korea|japan))\b/i },
  { label: "waterproof", re: /\bwater[\s-]?proof\b/i },
  { label: "delivery ka dawa (site khud batati hai)", re: /\b(free\s+(home\s+)?(delivery|shipping)|cod\s+free|free\s+cod|cash\s+on\s+delivery\s+(is\s+)?free|same[\s-]?day\s+(dispatch|delivery|shipping)|next[\s-]?day\s+delivery|deliver(y|ed)\s+in\s+\d|dispatch(ed)?\s+(with)?in\s+\d|ships?\s+in\s+\d)\b/i },
  { label: "return ka dawa (site khud batati hai)", re: /\b(\d+\s*[-\s]?days?\s+(easy\s+)?(return|replacement|exchange|refund)s?|easy\s+returns?|no\s+questions?\s+asked|money[\s-]?back)\b/i },
];

// Only shown as "khud dekho" - never auto-removed.
// (No look-behind regex here - older iPhone Safari can't read it.)
const SAFE_LEATHER_WORDS = /(vegan|faux|pu|synthetic|artificial|imitation|eco|free|polyurethane)[\s-]*$/i;
const CHECK_RULES = [
  {
    label: "“leather” likha hai - kya sach mein leather hai? (PU/vegan ho to wahi likho)",
    test(text) {
      const re = /leather/gi;
      let match;
      while ((match = re.exec(String(text || "")))) {
        if (!SAFE_LEATHER_WORDS.test(String(text).slice(Math.max(0, match.index - 20), match.index))) return true;
      }
      return false;
    },
  },
];

const TEXT_FIELDS = [
  { key: "description", label: "Description", list: false },
  { key: "keyFeatures", label: "Key features", list: true },
  { key: "materials", label: "Material", list: false },
  { key: "careInstructions", label: "Care", list: false },
  { key: "trustSignals", label: "Trust points", list: true },
];

function ruleFor(text) {
  return REMOVE_RULES.find((rule) => rule.re.test(text)) || null;
}

// Splits a line into sentences, keeping their end marks.
function sentences(line) {
  return line.match(/[^.!?।]+[.!?।]*\s*/g) || [line];
}

// Returns { cleaned, removed: [{ text, why }] } for one text field.
function cleanText(value) {
  const removed = [];
  const lines = String(value || "").split("\n");
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    const kept = [];
    for (const part of sentences(line)) {
      const rule = ruleFor(part);
      if (rule) removed.push({ text: part.trim(), why: rule.label });
      else kept.push(part);
    }
    const joined = kept.join("").trim();
    if (joined) out.push(joined);
  }
  const cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, removed };
}

function cleanList(list) {
  const removed = [];
  const cleaned = [];
  for (const item of Array.isArray(list) ? list : []) {
    const rule = ruleFor(item);
    if (rule) removed.push({ text: item, why: rule.label });
    else cleaned.push(item);
  }
  return { cleaned, removed };
}

function checkWords(text) {
  return CHECK_RULES.filter((rule) => rule.test(text)).map((rule) => rule.label);
}

function scanProduct(product) {
  const changes = {};
  const removedAll = [];
  const notes = new Set();
  for (const field of TEXT_FIELDS) {
    const value = product[field.key];
    if (field.list) {
      const { cleaned, removed } = cleanList(value);
      if (removed.length) {
        changes[field.key] = cleaned;
        removed.forEach((item) => removedAll.push({ ...item, field: field.label }));
      }
      cleaned.forEach((item) => checkWords(item).forEach((note) => notes.add(note)));
    } else {
      const { cleaned, removed } = cleanText(value);
      if (removed.length) {
        changes[field.key] = cleaned;
        removed.forEach((item) => removedAll.push({ ...item, field: field.label }));
      }
      checkWords(cleaned).forEach((note) => notes.add(note));
    }
  }
  checkWords(product.name || "").forEach((note) => notes.add(`Naam mein: ${note}`));

  // Material emptied: fill it only when the bag's own name says what it
  // is (vegan / faux / PU) - never guessed.
  if (changes.materials !== undefined && !String(changes.materials).trim()) {
    if (/\b(vegan|faux)\b/i.test(product.name || "")) changes.materials = "Vegan (faux) leather";
    else if (/\bpu\b/i.test(product.name || "")) changes.materials = "PU (faux) leather";
  }

  // Empty / very short description -> write a new honest one.
  const description = changes.description !== undefined ? changes.description : String(product.description || "").trim();
  let written = null;
  if (description.length < SHORT_DESCRIPTION) {
    written = { keep: description, round: 0 };
    changes.description = makeDescription(product, changes, written);
  }
  return { changes, removed: removedAll, notes: [...notes], written };
}

function makeDescription(product, changes, written) {
  const keyFeatures = changes.keyFeatures !== undefined ? changes.keyFeatures : product.keyFeatures;
  return writeDescription({ ...product, keyFeatures }, written.keep, written.round);
}

export default function DescriptionCheck({ API, adminFetch, products, onDone }) {
  const [rows, setRows] = useState(null); // null = not checked yet
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);

  function check() {
    const found = [];
    for (const product of products || []) {
      const result = scanProduct(product);
      if (result.removed.length || result.notes.length || result.written) {
        found.push({
          id: product.id,
          name: product.name || `Product ${product.id}`,
          product,
          ...result,
          selected: result.removed.length > 0 || Boolean(result.written),
        });
      }
    }
    setRows(found);
    setReport(null);
  }

  async function save() {
    const chosen = (rows || []).filter((row) => row.selected && Object.keys(row.changes).length);
    if (!chosen.length) return;
    if (!window.confirm(`${chosen.length} products se laal wali lines hata kar save kar dun?`)) return;
    setSaving(true);
    const result = { saved: 0, errors: [] };
    for (const row of chosen) {
      try {
        const formData = new FormData();
        for (const [key, value] of Object.entries(row.changes)) {
          formData.append(key, Array.isArray(value) ? value.join("\n") : value);
        }
        const response = await adminFetch(`${API}/api/products/${row.id}`, { method: "PUT", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) throw new Error(data?.message || `Server error ${response.status}`);
        result.saved += 1;
      } catch (error) {
        result.errors.push(`${row.name}: ${error.message}`);
      }
    }
    setSaving(false);
    setReport(result);
    setRows(null);
    onDone?.();
  }

  const fixable = (rows || []).filter((row) => Object.keys(row.changes).length);

  function rewrite(id) {
    setRows((list) =>
      list.map((row) => {
        if (row.id !== id || !row.written) return row;
        const written = { ...row.written, round: row.written.round + 1 };
        return { ...row, written, changes: { ...row.changes, description: makeDescription(row.product, row.changes, written) } };
      })
    );
  }
  const selectedCount = fixable.filter((row) => row.selected).length;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Description check - jhoothe dawe</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "#666", fontSize: 14, lineHeight: 1.5 }}>
        Saare products ki description, key features, material, care aur trust points mein “Genuine leather”,
        “Handmade”, “Warranty”, “Free delivery”, “7 days return” jaisi lines dhoondhta hai. Jahan description
        khaali ya bahut chhoti bachti hai, wahan bag ke naam, colours, features aur size se nayi sachchi
        description likhta hai (har bag ki alag). Pehle sirf list dikhayega (laal = hategi, hara = nayi), kuch nahi badlega.
      </p>

      <button type="button" className="secondary-button" onClick={check} disabled={saving || !products?.length}>
        🔍 Description check karo
      </button>

      {report && (
        <div style={{ fontSize: 14, margin: "12px 0" }}>
          ✅ {report.saved} products saaf ho gaye.
          {report.errors.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#b42318" }}>
              {report.errors.map((message, index) => <li key={index}>{message}</li>)}
            </ul>
          )}
        </div>
      )}

      {rows && (
        <>
          <p style={{ fontSize: 14, margin: "12px 0" }}>
            {rows.length
              ? `${fixable.length} products badlenge (jhoothi lines hategi / nayi description likhi jayegi)${rows.length > fixable.length ? `, ${rows.length - fixable.length} mein sirf khud dekhne wali baat` : ""}.`
              : "Kisi product mein jhootha dawa nahi mila. 👍"}
          </p>
          {fixable.length > 0 && (
            <button type="button" className="add-button" onClick={save} disabled={saving || !selectedCount} style={{ marginBottom: 12 }}>
              {saving ? "Save ho raha hai..." : `✨ ${selectedCount} products saaf karke save karo`}
            </button>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((row) => (
              <div key={row.id} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.5, opacity: Object.keys(row.changes).length && !row.selected ? 0.55 : 1 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 600, fontSize: 14 }}>
                  {Object.keys(row.changes).length > 0 && (
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={saving}
                      onChange={() => setRows((list) => list.map((item) => (item.id === row.id ? { ...item, selected: !item.selected } : item)))}
                    />
                  )}
                  <span style={{ overflowWrap: "anywhere" }}>{row.name}</span>
                </label>
                {row.removed.map((item, index) => (
                  <div key={index} style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                    <span style={{ color: "#888" }}>{item.field}: </span>
                    <span style={{ color: "#b42318", textDecoration: "line-through" }}>{item.text}</span>
                    <span style={{ color: "#888" }}> ({item.why})</span>
                  </div>
                ))}
                {row.written && (
                  <div style={{ marginTop: 6, padding: 8, background: "#f0f7f0", borderRadius: 8, overflowWrap: "anywhere" }}>
                    <div style={{ color: "#1a7f37", fontWeight: 600, marginBottom: 2 }}>✍️ Nayi description:</div>
                    <div style={{ color: "#222" }}>{row.changes.description}</div>
                    <button type="button" className="secondary-button" style={{ marginTop: 6, padding: "4px 10px", fontSize: 12 }} onClick={() => rewrite(row.id)} disabled={saving}>
                      🔄 Dusri likho
                    </button>
                  </div>
                )}
                {row.notes.map((note, index) => (
                  <div key={`n${index}`} style={{ marginTop: 4, color: "#9a6700" }}>👀 Khud dekho: {note}</div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
