/*
 * AUTOPILOT PRO AUDIT (2026-11-01 v5) - the "manager" part of the bot.
 * ------------------------------------------------------------------
 * Once a week (and on "Pura audit abhi karo" in Admin) the bot goes
 * through the checklist a professional web developer + social media
 * manager would use, then asks Gemini to think it through like one:
 *
 *  WEBSITE   - pages open, speed, SEO (title / sitemap / robots / share
 *              image), heavy photos, contact + WhatsApp, reviews.
 *  PRODUCTS  - names (incomplete, too long, "leather" / "luxury" claims),
 *              same copy-paste description on many bags, missing size /
 *              material, too few photos, colours with 1 photo, very big
 *              "discounts", sold-out bags still showing.
 *  INSTAGRAM - name, bio (what you sell, COD, delivery), link in bio
 *              with tracking, followers vs following, how often posts /
 *              reels go out, hashtags, unanswered comments, engagement.
 *  FACEBOOK  - About, website, phone, category.
 *
 * Output: a score per area, the top actions (who does it: bot / one tap /
 * you), and SUGGESTIONS the owner can apply with one tap in Admin -
 * honest new product names and descriptions written ONLY from the facts
 * saved on the product. Nothing on the website changes until ✅ is
 * tapped, and every applied change can be undone.
 * State: social/pro.json in the same Supabase bucket.
 */
const STATE_PATH = "social/pro.json";
const DAY = 24 * 3600 * 1000;
const LEATHER_CLAIM = /(?<!vegan |faux |pu |vegan-|faux-)\bleather\b/i;
const BIG_WORDS = /\b(luxury|luxe|premium|designer|branded|original|genuine)\b/i;

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = function setupPro(app, deps, ap) {
  const { supabase, STORAGE_BUCKET, requireAdmin, metaCall, getMetaIds, sendTransactionalEmail } = deps;
  const GEMINI_API_KEY = deps.GEMINI_API_KEY;
  const REPORT_TO = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "infoshrimoh@gmail.com";
  let working = null;

  function emptyState() {
    // autoApply: bot puts its honest name / description fixes live by itself (undo in Admin)
    return { lastAuditAt: 0, audit: null, suggestions: [], applied: [], autoApply: true };
  }
  async function readPro() {
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STATE_PATH);
      if (error || !data) return emptyState();
      return { ...emptyState(), ...JSON.parse(await data.text()) };
    } catch {
      return emptyState();
    }
  }
  async function writePro(state) {
    const clean = { ...state, suggestions: (state.suggestions || []).slice(0, 80), applied: (state.applied || []).slice(0, 80) };
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STATE_PATH, Buffer.from(JSON.stringify(clean)), { contentType: "application/json", upsert: true, cacheControl: "0" });
    if (error) throw new Error(`Pro audit save nahi hua: ${error.message}`);
  }
  async function updatePro(change) {
    const state = await readPro();
    await change(state);
    await writePro(state);
    return state;
  }
  function stage(text) {
    if (working) working.stage = text;
    console.log("AUTOPILOT PRO:", text);
  }
  async function geminiJson(text) {
    const data = await ap.geminiCall(ap.TEXT_MODEL, {
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    });
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    return JSON.parse(out.replace(/```json|```/g, "").trim());
  }
  async function timedFetch(url, method = "GET") {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { method, redirect: "follow", signal: controller.signal });
      const text = method === "GET" ? await response.text() : "";
      return { ok: response.ok, status: response.status, ms: Date.now() - start, text, size: Number(response.headers.get("content-length")) || text.length };
    } catch (error) {
      return { ok: false, status: 0, ms: Date.now() - start, text: "", error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- checks ---------------- */
  async function websiteChecks(products) {
    const findings = [];
    const add = (area, level, text) => findings.push({ area, level, text });
    stage("Website ke pages aur SEO check");
    const home = await timedFetch(ap.SITE);
    if (!home.ok) add("website", "high", `Home page nahi khula (${home.status || home.error})`);
    else {
      if (home.ms > 3000) add("website", "mid", `Home page dheere khulta hai (${(home.ms / 1000).toFixed(1)} sec)`);
      if (!/<title>[^<]{10,}<\/title>/i.test(home.text)) add("website", "mid", "Home page ka title (Google mein dikhne wala naam) sahi nahi");
      if (!/og:image/i.test(home.text)) add("website", "low", "WhatsApp / Instagram par link share karne par photo nahi dikhegi (og:image)");
      if (/luxury store/i.test(home.text)) add("website", "low", '"Luxury store" abhi bhi kahin likha hai');
    }
    for (const page of ["/sitemap.xml", "/robots.txt"]) {
      const r = await timedFetch(`${ap.SITE}${page}`);
      if (!r.ok || /<html/i.test(r.text.slice(0, 200))) add("website", "low", `${page} nahi mila (Google ko pages dhoondhne mein dikkat)`);
    }
    if (products[0]) {
      const pr = await timedFetch(`${ap.SITE}/product/${products[0].id}`);
      if (!pr.ok) add("website", "high", "Product page nahi khul raha");
      else if (!pr.text.toLowerCase().includes(String(products[0].name).toLowerCase().slice(0, 12))) add("website", "low", "Product page ke title mein bag ka naam nahi (Google ke liye)");
    }
    stage("Photos ka size check");
    let heavy = 0;
    for (const p of products.slice(0, 25)) {
      const r = await timedFetch(p.images[0], "HEAD");
      if (r.size > 900 * 1024) heavy += 1;
    }
    if (heavy) add("website", "mid", `${heavy} bags ki pehli photo bahut bhaari hai (1 MB se zyada) - bot roz ke check mein inhe khud halka kar dega`);
    add("trust", "high", "Website par ek bhi customer review nahi - pehle orders ke baad photo reviews maangne hain (agla update)");
    return findings;
  }

  function productChecks(products) {
    const findings = [];
    const perProduct = [];
    const descCount = {};
    for (const p of products) {
      const key = String(p.description || "").trim().toLowerCase().slice(0, 90);
      if (key) descCount[key] = (descCount[key] || 0) + 1;
    }
    let sold = 0;
    for (const p of products) {
      const problems = [];
      const name = String(p.name || "").trim();
      if (name.split(/\s+/).length < 2) problems.push({ field: "name", text: "Naam adhoora hai (sirf ek shabd)" });
      if (name.length > 48) problems.push({ field: "name", text: "Naam bahut lamba hai" });
      if (LEATHER_CLAIM.test(`${name} ${p.description}`) && !/leather/i.test(p.materials || "")) problems.push({ field: "name", text: '"Leather" likha hai par material mein leather nahi - dhokha lag sakta hai' });
      else if (LEATHER_CLAIM.test(name) && /vegan|pu|faux|synthetic/i.test(p.materials || "")) problems.push({ field: "name", text: 'Naam mein "Leather" hai par bag vegan / PU ka hai' });
      if (BIG_WORDS.test(name)) problems.push({ field: "name", text: `Naam mein "${name.match(BIG_WORDS)[0]}" - bada daawa, ₹${p.price} ke bag par bharosa ghatata hai` });
      const key = String(p.description || "").trim().toLowerCase().slice(0, 90);
      if (!key || key.length < 40) problems.push({ field: "description", text: "Description bahut chhoti / khaali" });
      else if (descCount[key] >= 3) problems.push({ field: "description", text: `Same description ${descCount[key]} bags par copy-paste hai` });
      else if (/hand ?made|handcrafted|warranty|guarantee|genuine|pure leather|real leather|100% leather|luxury|luxe/i.test(p.description || "") || (LEATHER_CLAIM.test(p.description || "") && !/leather/i.test(p.materials || "")))
        problems.push({ field: "description", text: "Description mein jhootha lag sakne wala daawa" });
      if (!p.dimensions) problems.push({ field: "info", text: "Size khaali" });
      if (!p.materials) problems.push({ field: "info", text: "Material khaali" });
      if (p.images.length < 3) problems.push({ field: "photos", text: `Sirf ${p.images.length} photo - kam se kam 4 (front, side, back, andar)` });
      for (const [colour, urls] of Object.entries(p.colorImages || {})) if (urls.length < 2) problems.push({ field: "photos", text: `${colour} colour ki sirf 1 photo` });
      if (p.oldPrice > 0 && p.price > 0 && (p.oldPrice - p.price) / p.oldPrice > 0.6) problems.push({ field: "price", text: `${Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)}% OFF - itni chhoot nakli lagti hai` });
      if (p.stock <= 0) sold += 1;
      if (problems.length) perProduct.push({ productId: p.id, name, problems });
    }
    if (sold) findings.push({ area: "products", level: "mid", text: `${sold} bags out of stock dikh rahe hain - stock bharo ya draft karo` });
    const named = perProduct.filter((x) => x.problems.some((q) => q.field === "name")).length;
    const desc = perProduct.filter((x) => x.problems.some((q) => q.field === "description")).length;
    const photos = perProduct.filter((x) => x.problems.some((q) => q.field === "photos")).length;
    if (named) findings.push({ area: "products", level: "high", text: `${named} bags ke naam theek karne hain (suggestions ready)` });
    if (desc) findings.push({ area: "products", level: "mid", text: `${desc} bags ki description theek karni hai (suggestions ready)` });
    if (photos) findings.push({ area: "products", level: "mid", text: `${photos} bags mein photos kam hain` });
    return { findings, perProduct };
  }

  async function instagramChecks() {
    const findings = [];
    const add = (level, text) => findings.push({ area: "instagram", level, text });
    const facts = {};
    try {
      const ids = await getMetaIds();
      if (!ids.igId) throw new Error("Instagram juda nahi");
      stage("Instagram profile check");
      const prof = await metaCall(ids.igId, { params: { fields: "username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url" } });
      Object.assign(facts, { username: prof.username, name: prof.name, bio: prof.biography, website: prof.website, followers: prof.followers_count, following: prof.follows_count, posts: prof.media_count });
      if (!/handbag|bag/i.test(prof.name || "")) add("high", `Profile naam "${prof.name || "-"}" mein "Handbags" nahi - search mein nahi milega. "SHRIMOH | Handbags for Women" rakho`);
      const bio = String(prof.biography || "");
      if (!/cod|cash on delivery/i.test(bio)) add("mid", "Bio mein COD nahi likha");
      if (!/deliver/i.test(bio)) add("mid", "Bio mein delivery ki baat nahi");
      if (!/bag/i.test(bio)) add("mid", "Bio se samajh nahi aata ki aap kya bechte ho");
      if (!prof.website) add("high", "Bio mein website link nahi");
      else if (!/utm_source=instagram/i.test(prof.website)) add("low", "Bio link mein utm_source=instagram nahi - pata nahi chalega order Instagram se aaya");
      if ((prof.follows_count || 0) > Math.max(50, (prof.followers_count || 0) * 3)) add("mid", "Following followers se bahut zyada - page spam jaisa lagta hai, faltu follows hatao");
      if ((prof.media_count || 0) < 9) add("high", `Sirf ${prof.media_count || 0} posts - ads se pehle kam se kam 12 achhi posts`);
      stage("Posts ki aadat check");
      const media = await metaCall(`${ids.igId}/media`, { params: { fields: "id,media_type,media_product_type,timestamp,caption,like_count,comments_count", limit: 25 } });
      const posts = media.data || [];
      const recent = posts.filter((p) => new Date(p.timestamp).getTime() > Date.now() - 14 * DAY);
      facts.posts14d = recent.length;
      facts.reels14d = recent.filter((p) => p.media_product_type === "REELS").length;
      if (posts[0] && Date.now() - new Date(posts[0].timestamp).getTime() > 4 * DAY) add("mid", "4 din se koi post nahi");
      if (facts.reels14d < 3) add("mid", `2 hafte mein sirf ${facts.reels14d} reels - naye log reels se aate hain`);
      const tagHeavy = posts.filter((p) => (String(p.caption || "").match(/#/g) || []).length > 15).length;
      if (tagHeavy) add("low", `${tagHeavy} posts mein 15 se zyada hashtags - spam lagta hai`);
      const likes = posts.slice(0, 12).reduce((a, p) => a + (p.like_count || 0) + (p.comments_count || 0), 0);
      facts.engagement = posts.length && prof.followers_count ? +((likes / Math.min(12, posts.length) / prof.followers_count) * 100).toFixed(1) : null;
      add("low", "Highlights (ORDER, COD, NEW, Reviews) API se nahi dikhte - ek baar khud dekh lo ki covers ek jaise hain");
      // Facebook page
      stage("Facebook page check");
      try {
        const page = await metaCall(ids.pageId, { token: ids.pageToken || undefined, params: { fields: "name,about,website,phone,category,fan_count" } });
        facts.facebook = { name: page.name, likes: page.fan_count, category: page.category };
        if (!page.about) findings.push({ area: "facebook", level: "mid", text: "Facebook page ka About khaali" });
        if (!page.website) findings.push({ area: "facebook", level: "mid", text: "Facebook page par website link nahi" });
        if (!page.phone) findings.push({ area: "facebook", level: "low", text: "Facebook page par phone / WhatsApp nahi" });
      } catch {
        // page fields need extra permission sometimes
      }
    } catch (error) {
      findings.push({ area: "instagram", level: "mid", text: `Instagram check nahi hua: ${error.message}` });
    }
    return { findings, facts };
  }

  /* ---------------- one-tap suggestions ---------------- */
  async function makeSuggestions(perProduct, products, existing) {
    if (!GEMINI_API_KEY) return [];
    const open = new Set((existing || []).filter((s) => s.status === "open").map((s) => `${s.productId}:${s.field}`));
    const todo = perProduct
      .filter((x) => x.problems.some((q) => q.field === "name" || q.field === "description"))
      .filter((x) => !open.has(`${x.productId}:name`) && !open.has(`${x.productId}:description`))
      .slice(0, 12);
    if (!todo.length) return [];
    stage(`${todo.length} bags ke naam / description ke sujhav likh raha hai`);
    const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
    const items = todo.map((x) => {
      const p = byId[String(x.productId)];
      return {
        id: String(p.id),
        name: p.name,
        fix_name: x.problems.some((q) => q.field === "name"),
        fix_description: x.problems.some((q) => q.field === "description"),
        problems: x.problems.map((q) => q.text),
        category: p.category,
        colours: ap.colourNames(p),
        dimensions: p.dimensions,
        materials: p.materials,
        key_features: p.keyFeatures || [],
        current_description: String(p.description || "").slice(0, 400),
      };
    });
    const r = await geminiJson(
      "You write product names and descriptions for SHRIMOH, a small Indian online store reselling women's handbags (bags come from partner sellers). " +
        "Rules: be 100% honest - use ONLY the facts given (category, colours, size, material, key features). Never write leather unless material says leather (write 'vegan leather' only if material says vegan/PU/faux). " +
        "Never write luxury, luxe, premium, designer, genuine, original, handmade, handcrafted, warranty, guarantee. " +
        "Name format: '<one short Indian first-name style word already in the old name> <1-2 words of real style/shape> <type>' e.g. 'Nyra Structured Shoulder Bag', max 40 characters, Title Case. Keep the first word of the old name. " +
        "Description: 2 short sentences in simple English - when / with what it suits (office, college, outings, festive) and its real details from the facts (size, closure, strap, colours). Do not invent what fits inside unless the size is given, and then keep it general ('room for daily essentials'). " +
        'Return ONLY JSON: [{"id":"...","name":"new name or empty if fix_name is false","description":"new description or empty if fix_description is false"}]\n' +
        JSON.stringify(items)
    );
    const list = Array.isArray(r) ? r : [];
    const out = [];
    for (const item of items) {
      const s = list.find((x) => String(x.id) === item.id);
      if (!s) continue;
      const p = byId[item.id];
      const clean = (t) => String(t || "").trim();
      if (item.fix_name && clean(s.name) && clean(s.name) !== p.name && !BIG_WORDS.test(s.name) && !LEATHER_CLAIM.test(s.name)) {
        out.push({ id: `${p.id}-name-${Date.now()}`, productId: p.id, field: "name", before: p.name, after: clean(s.name).slice(0, 60), why: item.problems.join(" · "), status: "open", at: Date.now() });
      }
      if (item.fix_description && clean(s.description).length > 40 && !BIG_WORDS.test(s.description) && !(LEATHER_CLAIM.test(s.description) && !/leather/i.test(p.materials || ""))) {
        out.push({ id: `${p.id}-description-${Date.now()}`, productId: p.id, field: "description", before: p.description || "", after: clean(s.description).slice(0, 600), why: item.problems.join(" · "), status: "open", at: Date.now() });
      }
    }
    return out;
  }

  /* ---------------- the audit ---------------- */
  async function runAudit() {
    const products = await ap.loadProductsAll();
    const web = await websiteChecks(products).catch((error) => [{ area: "website", level: "mid", text: `Website check adhoora: ${error.message}` }]);
    stage("Har product ki details check");
    const prod = productChecks(products);
    const ig = await instagramChecks();
    const findings = [...web, ...prod.findings, ...ig.findings];
    const pro = await readPro();
    const suggestions = await makeSuggestions(prod.perProduct, products, pro.suggestions).catch((error) => {
      console.error("PRO SUGGESTIONS ERROR:", error.message);
      return [];
    });

    // (v6) auto mode: apply the safe fixes right away, keep "before" for undo
    const autoApplied = [];
    if (pro.autoApply !== false) {
      stage("Naam / description khud theek kar raha hai");
      for (const s of suggestions) {
        try {
          const { data: row } = await supabase.from("products").select("id,name,description").eq("id", s.productId).single();
          if (!row) continue;
          const beforeValue = String(row[s.field] || "");
          if (beforeValue !== String(s.before || "")) continue; // changed meanwhile - leave it
          await setProductField(s.productId, s.field, s.after);
          s.status = "applied";
          autoApplied.push({ ...s, before: beforeValue, appliedAt: Date.now(), auto: true });
        } catch (error) {
          console.error("PRO AUTO APPLY ERROR:", error.message);
        }
      }
    }
    // show what is ALREADY fixed, so the owner is not asked to do it
    if (autoApplied.length) {
      const fixed = new Set(autoApplied.map((a) => `${a.productId}:${a.field}`));
      for (const x of prod.perProduct) {
        const nameFix = autoApplied.find((a) => String(a.productId) === String(x.productId) && a.field === "name");
        x.problems = x.problems.filter((q) => !((q.field === "name" || q.field === "description") && fixed.has(`${x.productId}:${q.field}`)));
        if (nameFix) {
          x.problems.unshift({ field: "done", text: `✅ Naam bot ne badla: "${nameFix.before}" → "${nameFix.after}"` });
        }
        if (fixed.has(`${x.productId}:description`)) x.problems.push({ field: "done", text: "✅ Description bot ne theek ki" });
      }
      const names = autoApplied.filter((a) => a.field === "name").length;
      const descs = autoApplied.filter((a) => a.field === "description").length;
      for (let i = findings.length - 1; i >= 0; i--) {
        if (/naam theek karne hain|description theek karni hai/.test(findings[i].text)) findings.splice(i, 1);
      }
      findings.unshift({ area: "products", level: "done", text: `✅ Bot ne ${names} naam aur ${descs} description khud theek kiye (website par live)` });
    }
    let thinking = null;
    if (GEMINI_API_KEY) {
      stage("Manager ki tarah soch raha hai");
      try {
        thinking = await geminiJson(
          "You are an experienced e-commerce web developer AND Instagram social media manager hired by SHRIMOH, a small Indian women's handbag store (₹600-1,500 bags, resold from partner sellers, COD available, 5-day returns). " +
            "Goal of the owner: make the Instagram, Facebook and website look premium and trustworthy BEFORE spending on ads. " +
            "Below are this week's findings and facts. Think like a pro: what is hurting trust and sales most? " +
            "Reply in simple Hinglish (Roman script). Return ONLY JSON: " +
            '{"scores":{"website":0-10,"products":0-10,"instagram":0-10,"trust":0-10},"summary":"2 sentences","actions":[{"text":"specific action","who":"bot|one_tap|you","why":"short","minutes":5}],"ads_ready":true/false,"ads_note":"1 sentence"} ' +
            "with 5-8 actions, most important first. who: 'bot' = the bot does it by itself (it ALREADY auto-fixes product names and descriptions, shrinks heavy photos, fixes front photos, adds lifestyle photos, posts, reels, stories, comment replies); 'you' = only a human can do it (shooting real photos, Instagram highlights / bio / archive, Meesho orders, refunds, filling a size or material nobody wrote down). Never use any other value. " +
            "Do not list things the bot already does as tasks for the owner - mention them as 'bot' only if useful. " +
            "NEVER suggest buying, arranging or asking for fake likes, followers or reviews, never suggest fake urgency or false claims. Real reviews only from real customers.\n" +
            JSON.stringify({ findings, instagram: ig.facts, products: products.length, products_with_problems: prod.perProduct.length, auto_fixed_names_descriptions: autoApplied.length, still_waiting_for_owner: suggestions.filter((x) => x.status === "open").length })
        );
      } catch (error) {
        thinking = { error: error.message };
      }
    }
    const audit = { at: Date.now(), findings, perProduct: prod.perProduct.slice(0, 60), facts: ig.facts, thinking, autoApplied: autoApplied.length };
    await updatePro((s) => {
      s.audit = audit;
      s.lastAuditAt = Date.now();
      s.suggestions = [...suggestions.filter((x) => x.status === "open"), ...(s.suggestions || []).filter((x) => x.status === "open")];
      s.applied = [...autoApplied, ...(s.applied || [])];
    });
    await sendAuditEmail(audit, suggestions.filter((x) => x.status === "open").length, autoApplied);
    return audit;
  }

  async function sendAuditEmail(audit, newSuggestions, autoApplied = []) {
    try {
      const t = audit.thinking || {};
      const sc = t.scores || {};
      const who = { bot: "🤖 bot", one_tap: "👆 1 tap", you: "🙋 aap" };
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;color:#1c150d;line-height:1.5">
          <h2 style="font-weight:600">SHRIMOH - hafte ka pro audit</h2>
          ${t.summary ? `<p>${escapeHtml(t.summary)}</p>` : ""}
          <p>Website <b>${sc.website ?? "-"}/10</b> · Products <b>${sc.products ?? "-"}/10</b> · Instagram <b>${sc.instagram ?? "-"}/10</b> · Bharosa <b>${sc.trust ?? "-"}/10</b></p>
          ${(t.actions || []).length ? `<h3>Is hafte ke kaam</h3><ol>${t.actions.map((a) => `<li>${escapeHtml(a.text)} <span style="color:#8a7650">(${who[a.who] || a.who}${a.minutes ? `, ~${a.minutes} min` : ""})</span><br/><span style="color:#777;font-size:13px">${escapeHtml(a.why || "")}</span></li>`).join("")}</ol>` : ""}
          ${autoApplied.length ? `<h3>✅ Bot ne khud badla (website par live)</h3><ul>${autoApplied.map((a) => `<li>${a.field === "name" ? "Naam" : "Description"}: <s>${escapeHtml(String(a.before).slice(0, 80))}</s> → <b>${escapeHtml(String(a.after).slice(0, 120))}</b></li>`).join("")}</ul><p style="font-size:13px;color:#555">Pasand na aaye to Admin &gt; 🤖 Autopilot mein ↩️ dabao.</p>` : ""}
          ${newSuggestions ? `<p><b>${newSuggestions} naye sujhav</b> (naam / description) Admin &gt; 🤖 Autopilot mein ✅ ke liye ready.</p>` : ""}
          ${t.ads_note ? `<p><b>Ads:</b> ${t.ads_ready ? "✅ tayyar" : "⏳ abhi nahi"} - ${escapeHtml(t.ads_note)}</p>` : ""}
        </div>`;
      await sendTransactionalEmail({ to: REPORT_TO, subject: "SHRIMOH - hafte ka pro audit", html });
    } catch (error) {
      console.error("PRO EMAIL ERROR:", error.message);
    }
  }

  function start(task, fn) {
    if (working) return false;
    working = { task, stage: "Shuru", startedAt: Date.now() };
    (async () => {
      try {
        await fn();
      } catch (error) {
        console.error("AUTOPILOT PRO ERROR:", error.message);
        await updatePro((s) => {
          s.lastError = { at: Date.now(), message: error.message };
        }).catch(() => {});
      } finally {
        working = null;
      }
    })();
    return true;
  }

  // called by the daily timer; runs once a week
  async function weeklyDue() {
    const s = await readPro();
    return Date.now() - (Number(s.lastAuditAt) || 0) > 6.5 * DAY;
  }

  /* ---------------- routes ---------------- */
  async function publicPro() {
    const s = await readPro();
    return {
      audit: s.audit,
      suggestions: (s.suggestions || []).filter((x) => x.status === "open").slice(0, 40),
      applied: (s.applied || []).slice(0, 15),
      autoApply: s.autoApply !== false,
      lastError: s.lastError || null,
      working,
    };
  }
  const ok = async (res) => res.json({ success: true, ...(await publicPro()) });

  app.get("/api/admin/autopilot/pro", requireAdmin, async (req, res) => ok(res));
  app.post("/api/admin/autopilot/pro/audit", requireAdmin, async (req, res) => {
    if (!start("audit", runAudit)) return res.status(409).json({ success: false, message: "Audit pehle se chal raha hai." });
    return ok(res);
  });

  async function setProductField(productId, field, value) {
    const update = { updated_at: new Date().toISOString() };
    update[field] = value;
    const { error } = await supabase.from("products").update(update).eq("id", productId);
    if (error) throw new Error(error.message);
  }

  app.post("/api/admin/autopilot/pro/suggestion", requireAdmin, async (req, res) => {
    try {
      const { id, action, text } = req.body || {};
      const state = await readPro();
      const s = (state.suggestions || []).find((x) => x.id === id);
      if (!s) return res.status(404).json({ success: false, message: "Sujhav nahi mila." });
      if (action === "apply") {
        const { data: row } = await supabase.from("products").select("id,name,description").eq("id", s.productId).single();
        if (!row) return res.status(404).json({ success: false, message: "Product nahi mila." });
        const value = String(text || s.after).trim();
        if (!value) return res.status(400).json({ success: false, message: "Khaali nahi rakh sakte." });
        const beforeValue = String(row[s.field] || "");
        await setProductField(s.productId, s.field, value);
        s.status = "applied";
        state.applied = [{ ...s, after: value, before: beforeValue, appliedAt: Date.now() }, ...(state.applied || [])];
      } else {
        s.status = "dismissed";
      }
      await writePro(state);
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/autopilot/pro/settings", requireAdmin, async (req, res) => {
    try {
      await updatePro((s) => {
        if (typeof req.body?.autoApply === "boolean") s.autoApply = req.body.autoApply;
      });
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/admin/autopilot/pro/undo", requireAdmin, async (req, res) => {
    try {
      const state = await readPro();
      const item = (state.applied || []).find((x) => x.id === req.body?.id && !x.undone);
      if (!item) return res.status(404).json({ success: false, message: "Ye badlav nahi mila." });
      await setProductField(item.productId, item.field, item.before);
      item.undone = true;
      await writePro(state);
      return ok(res);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  return { runAudit, weeklyDue, isWorking: () => Boolean(working), start };
};
