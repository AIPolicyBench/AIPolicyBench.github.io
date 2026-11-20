/* Risks tab: risk taxonomies, the crosswalk to the MIT hub, and hub-subdomain pages that connect risks to policies and regulations.
   Exposes window.RiskViews = { index(risks, catalog), overview(root, api), taxonomy(root, arg, api), hub(root, code, api) }. */
(function () {
  "use strict";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const ext = (u, t) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(t || u)} ↗</a>` : '<span class="null">null</span>'; };
  const SUB = "mit-ai-risk-subdomain-";
  const SHORT = {
    "1.1": "Discrimination", "1.2": "Toxic content", "1.3": "Unequal performance", "2.1": "Privacy", "2.2": "Security",
    "3.1": "False information", "3.2": "Information ecosystem", "4.1": "Disinformation & surveillance", "4.2": "Cyber & weapons",
    "4.3": "Fraud & manipulation", "5.1": "Overreliance", "5.2": "Loss of agency", "6.1": "Power concentration",
    "6.2": "Inequality & jobs", "6.3": "Devaluing human effort", "6.4": "Competitive dynamics", "6.5": "Governance failure",
    "6.6": "Environmental harm", "7.1": "Misaligned goals", "7.2": "Dangerous capabilities", "7.3": "Lack of robustness",
    "7.4": "Opacity", "7.5": "AI welfare", "7.6": "Multi-agent risks",
  };
  const REL_LABEL = { related: "related", broader: "broader", narrower: "narrower", close: "close", exact: "exact" };

  // ---------------- index ----------------
  function index(R, catalog) {
    const catById = {};
    const walk = (t, cats, parent, depth) => cats.forEach((c) => {
      catById[c.id] = { c, t, parent, depth };
      walk(t, c.children || [], c.id, depth + 1);
    });
    R.taxonomies.forEach((t) => walk(t, t.categories, null, 0));
    const hubTax = R.taxonomies.find((t) => t.is_hub);
    const hubDomains = hubTax.categories;
    const hubSubdomains = hubDomains.flatMap((d) => d.children.map((s) => ({ id: s.id, code: s.code, name: s.name, description: s.description, domain: d })));
    const subById = Object.fromEntries(hubSubdomains.map((s) => [s.id, s]));
    // category -> hub subdomains (own edges) ; category -> peer edges in other taxonomies
    const toHub = {}, peers = {};
    R.crosswalk.forEach((e) => {
      if (subById[e.to]) (toHub[e.from] = toHub[e.from] || []).push({ id: e.to, relation: e.relation, source: e.source });
      else {
        (peers[e.from] = peers[e.from] || []).push({ id: e.to, relation: e.relation, source: e.source });
        const inv = e.relation === "broader" ? "narrower" : e.relation === "narrower" ? "broader" : e.relation;
        (peers[e.to] = peers[e.to] || []).push({ id: e.from, relation: inv, source: e.source });
      }
    });
    const hubOf = (id) => {
      if (subById[id]) return { own: true, list: [{ id, relation: "exact", source: "hub" }] };
      if (toHub[id]) return { own: true, list: dedupe(toHub[id]) };
      let p = catById[id] && catById[id].parent;
      while (p) { if (toHub[p]) return { own: false, list: dedupe(toHub[p]), from: p }; p = catById[p].parent; }
      return { own: false, list: [] };
    };
    const clauseMap = {};
    R.clause_risks.mappings.forEach((m) => {
      clauseMap[m.clause_id] = { relation: m.relation, policy_id: m.policy_id, risks: m.risks.map((id) => subById[id]).filter(Boolean) };
    });
    const docRiskCache = {};
    const docRisks = (pid) => {
      if (docRiskCache[pid]) return docRiskCache[pid];
      const n = {};
      R.clause_risks.mappings.filter((m) => m.policy_id === pid).forEach((m) => m.risks.forEach((r) => { n[r] = (n[r] || 0) + 1; }));
      return (docRiskCache[pid] = Object.keys(n).map((id) => ({ ...subById[id], n: n[id] })).sort((a, b) => cmpCode(a.code, b.code)));
    };
    // categories of each non-hub taxonomy with their own mapping, per hub subdomain
    const bySub = {};
    Object.entries(toHub).forEach(([cid, list]) => {
      const info = catById[cid];
      if (!info) return;
      dedupe(list).forEach((h) => { ((bySub[h.id] = bySub[h.id] || {})[info.t.taxonomy_id] = bySub[h.id][info.t.taxonomy_id] || []).push(info.c); });
    });
    const clausesBySub = {};
    R.clause_risks.mappings.forEach((m) => m.risks.forEach((r) => (clausesBySub[r] = clausesBySub[r] || []).push(m)));
    return {
      raw: R, taxonomies: R.taxonomies, hubTax, hubDomains, hubSubdomains, subById, catById, peers, hubOf, docRisks, bySub, clausesBySub,
      clauseRisks: (cid) => clauseMap[cid] || null,
      shortName: (id) => SHORT[(subById[id] || {}).code] || (subById[id] || {}).name || id,
      hubLabel: (id) => { const s = subById[id]; return s ? `${s.code} ${SHORT[s.code] || s.name}` : id; },
      catalog,
    };
  }
  const dedupe = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.id) && seen.add(x.id)); };
  const cmpCode = (a, b) => { const [a1, a2] = String(a).split(".").map(Number), [b1, b2] = String(b).split(".").map(Number); return a1 - b1 || a2 - b2; };
  const countCats = (cats) => cats.reduce((n, c) => n + 1 + countCats(c.children || []), 0);
  const depthOf = (cats) => cats.length ? 1 + Math.max(...cats.map((c) => depthOf(c.children || []))) : 0;
  const hubChip = (I, h, extra) => { const s = I.subById[h.id]; return `<a class="chip risk${extra ? " " + extra : ""}" href="#/risk/${esc(s.code)}" title="${esc(s.name)}${h.relation && h.relation !== "related" && h.relation !== "exact" ? ` (${esc(h.relation)})` : ""}">${esc(s.code)} ${esc(SHORT[s.code] || s.name)}</a>`; };
  const shade = (n, max) => (n ? "s" + Math.min(6, Math.max(1, Math.ceil((n / max) * 6))) : "");

  // ---------------- overview ----------------
  function overview(root, api) {
    const I = api.risk;
    const docs = api.docById;
    const others = I.taxonomies.filter((t) => !t.is_hub);
    const cards = [I.hubTax, ...others].map((t) => {
      const n = countCats(t.categories);
      const own = Object.keys(I.catById).filter((id) => I.catById[id].t === t && I.hubOf(id).own).length;
      return `<a class="tx-card${t.is_hub ? " hub" : ""}" href="#/risks/${encodeURIComponent(t.taxonomy_id)}">
        <span class="tx-kind">${esc(t.kind)}${t.is_hub ? ' · <strong>crosswalk hub</strong>' : ""}</span>
        <strong class="tx-name">${esc(t.short_name)}</strong>
        <span class="muted">${esc(t.publisher)} · ${esc(t.year)}</span>
        <span class="tx-meta">${n} categories · ${depthOf(t.categories)} level${depthOf(t.categories) > 1 ? "s" : ""}${t.is_hub ? "" : ` · ${own} mapped to hub`}</span>
        ${arr(t.related_documents).length ? `<span class="tx-meta">Related: ${t.related_documents.map((d) => esc(docs[d] ? api.docName(docs[d]) : d)).join(", ")}</span>` : ""}
      </a>`;
    }).join("");

    // crosswalk matrix: hub subdomains x (taxonomies + policy clauses + regulation clauses)
    const cols = others.map((t) => ({ key: t.taxonomy_id, label: t.short_name, get: (sid) => arr((I.bySub[sid] || {})[t.taxonomy_id]).length, href: (code) => `#/risk/${code}` }))
      .concat(["policy", "regulation"].map((cat) => ({
        key: cat, label: cat === "policy" ? "Policy clauses" : "Regulation clauses", doc: true,
        get: (sid) => arr(I.clausesBySub[sid]).filter((m) => docs[m.policy_id].category === cat).length,
      })));
    const maxT = Math.max(1, ...I.hubSubdomains.flatMap((s) => cols.filter((c) => !c.doc).map((c) => c.get(s.id))));
    const maxD = Math.max(1, ...I.hubSubdomains.flatMap((s) => cols.filter((c) => c.doc).map((c) => c.get(s.id))));
    const rows = I.hubDomains.map((d) => `<tr class="dom-row"><th colspan="${cols.length + 1}" scope="rowgroup">${esc(d.code)} ${esc(d.name)}</th></tr>` +
      d.children.map((s) => `<tr><th scope="row"><a href="#/risk/${esc(s.code)}"><span class="mono">${esc(s.code)}</span> ${esc(SHORT[s.code] || s.name)}</a></th>${cols.map((c) => {
        const n = c.get(s.id);
        return `<td class="cell ${shade(n, c.doc ? maxD : maxT)}${c.doc ? " doc" : ""}" ${n ? `tabindex="0" data-code="${esc(s.code)}"` : ""} title="${esc(c.label)} → ${esc(s.code)} ${esc(s.name)}: ${n}">${n || ""}</td>`;
      }).join("")}</tr>`).join("")).join("");

    root.innerHTML = `
      <h1>AI risk taxonomies</h1>
      <p class="lede">Risks are kept separate from <a href="#/">policies</a> and <a href="#/regulations">regulations</a>. Eight taxonomies from
      industry, government, standards and research describe AI risk in their own terms; each is cross-walked to one hub, the
      <a href="#/risks/MIT_AI_Risk_Repository">MIT AI Risk Repository</a>, and policy and regulation clauses are mapped to the same hub.
      That shared hub is what connects the three parts of the catalogue.</p>
      <div class="tx-grid">${cards}</div>
      <h2>Crosswalk: where each source places its risks</h2>
      <p class="muted">Rows are MIT subdomains. The first ${others.length} columns count the categories of each taxonomy mapped to that subdomain;
      the last two count policy and regulation clauses mapped to it. Shading is scaled separately for taxonomies and clauses.
      Select a row or cell to see the risk across all sources. Mappings come from AI Atlas Nexus (IBM ↔ MIT) or the compiler (the rest).</p>
      <div class="viz-card"><div class="viz-scroll"><table class="heat xwalk"><thead><tr><th>MIT subdomain</th>${cols.map((c) =>
        `<th class="hc${c.doc ? " doc" : ""}">${c.doc ? esc(c.label) : `<a href="#/risks/${esc(c.key)}">${esc(c.label)}</a>`}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    const go = (td) => { if (td && td.dataset.code) location.hash = "#/risk/" + td.dataset.code; };
    root.querySelector(".xwalk").addEventListener("click", (e) => go(e.target.closest("td[data-code]")));
    root.querySelector(".xwalk").addEventListener("keydown", (e) => { if (e.key === "Enter") go(e.target.closest("td[data-code]")); });
  }

  // ---------------- taxonomy page ----------------
  function taxonomy(root, arg, api) {
    const I = api.risk;
    const slash = arg.indexOf("/");
    const tid = slash < 0 ? arg : arg.slice(0, slash);
    const focus = slash < 0 ? "" : arg.slice(slash + 1);
    const t = I.taxonomies.find((x) => x.taxonomy_id === tid);
    if (!t) { root.innerHTML = `<a class="back" href="#/risks">← All risk taxonomies</a><h1>Not found</h1><p>No taxonomy <code>${esc(tid)}</code>.</p>`; return; }
    const prov = t.record_provenance || {};
    const total = countCats(t.categories);
    const big = total > 60;
    const item = (c, depth) => {
      const h = I.hubOf(c.id);
      const own = h.own && !t.is_hub ? h.list.map((x) => hubChip(I, x)).join("") : "";
      const inherited = !h.own && h.list.length && depth > 0 && !c.children.length ? "" : "";
      const peer = arr(I.peers[c.id]).filter((p) => I.catById[p.id] && I.catById[p.id].t !== t);
      const peerHtml = peer.length ? `<span class="peer">${peer.slice(0, 6).map((p) => {
        const o = I.catById[p.id];
        return `<a class="chip mono" href="#/risks/${encodeURIComponent(o.t.taxonomy_id)}/${encodeURIComponent(p.id)}" title="${esc(REL_LABEL[p.relation] || p.relation)} · ${esc(o.t.short_name)}">${esc(o.t.short_name.split(" ")[0])}: ${esc(o.c.name)}</a>`;
      }).join("")}${peer.length > 6 ? ` <span class="muted">+${peer.length - 6}</span>` : ""}</span>` : "";
      const hubExtra = t.is_hub && c.code && c.code.includes(".")
        ? ` <a class="chip accent" href="#/risk/${esc(c.code)}">${arr(I.clausesBySub[c.id]).length} clauses · ${Object.values(I.bySub[c.id] || {}).flat().length} categories</a>` : "";
      const tags = arr(c.tags).map((x) => `<span class="chip">${esc(x)}</span>`).join("");
      const head = `<span class="tn">${c.code ? `<span class="mono">${esc(c.code)}</span> ` : ""}${esc(c.name)}</span>${tags}${own}${hubExtra}${peerHtml}${inherited}`;
      const desc = c.description ? `<p class="td">${esc(c.description)}</p>` : "";
      const concern = c.concern ? `<p class="td"><strong>Why it matters:</strong> ${esc(c.concern)}</p>` : "";
      const url = c.url ? `<p class="td">${ext(c.url, "Source page")}</p>` : "";
      if (!c.children.length) return `<li class="leaf" data-id="${esc(c.id)}" data-name="${esc(c.name.toLowerCase())}">${head}${desc}${concern}${url}</li>`;
      const open = !big || depth === 0 && t.categories.length <= 8;
      return `<li data-id="${esc(c.id)}" data-name="${esc(c.name.toLowerCase())}"><details${open ? " open" : ""}><summary>${head} <span class="muted">(${countCats(c.children)})</span></summary>${desc}
        <ul class="tree">${c.children.map((k) => item(k, depth + 1)).join("")}</ul></details></li>`;
    };
    const rel = arr(t.related_documents);
    root.innerHTML = `
      <a class="back" href="#/risks">← All risk taxonomies</a>
      <h1>${esc(t.name)}</h1>
      <div class="detail-head"><span class="chip accent">${esc(t.kind)}</span>${t.is_hub ? '<span class="chip ok">crosswalk hub</span>' : ""}
        <span class="chip mono">${esc(t.taxonomy_id)}</span></div>
      <p class="objective">${esc(t.description || "")}</p>
      ${prov.notes ? `<p class="note"><strong>Notes:</strong> ${esc(prov.notes)}</p>` : ""}
      <div class="groups">
        <section class="group"><h3>Identity</h3><dl class="attrs">
          <dt>publisher</dt><dd>${esc(t.publisher)}</dd><dt>year</dt><dd>${esc(t.year)}</dd><dt>version</dt><dd>${esc(t.version || "")}</dd>
          <dt>source_uri</dt><dd>${ext(t.source_uri)}</dd>${t.paper_uri && t.paper_uri !== t.source_uri ? `<dt>paper</dt><dd>${ext(t.paper_uri)}</dd>` : ""}
          <dt>structure</dt><dd>${arr(t.levels).map(esc).join(" › ")} · ${total} categories</dd>
        </dl></section>
        <section class="group"><h3>Connections</h3><dl class="attrs">
          <dt>related documents</dt><dd>${rel.length ? rel.map((d) => api.docById[d] ? `<a href="${api.href(d)}">${esc(api.docName(api.docById[d]))}</a> ${api.categoryChip(api.docById[d].category)}` : esc(d)).join("<br>") : '<span class="null">none</span>'}</dd>
          <dt>hub mapping</dt><dd>${t.is_hub ? "This is the hub." : `${Object.keys(I.catById).filter((id) => I.catById[id].t === t && I.hubOf(id).own).length} of ${total} categories mapped to MIT subdomains`}</dd>
          <dt>provenance</dt><dd>${prov.source ? ext(prov.source, "AI Atlas Nexus source file") : "hand-authored"}${prov.license ? ` · ${esc(prov.license)}` : ""}${prov.imported_on ? ` · ${esc(prov.imported_on)}` : ""}</dd>
          <dt>human_verified</dt><dd>${prov.human_verified ? '<span class="chip ok">verified</span>' : '<span class="chip warn">not yet verified</span>'}</dd>
        </dl></section>
      </div>
      <h2>Categories</h2>
      <div class="filters">
        ${big ? `<input type="search" id="tq" placeholder="Filter ${total} categories…" aria-label="Filter categories">` : ""}
        <button class="btn" type="button" id="texp">Expand all</button><button class="btn" type="button" id="tcol">Collapse all</button>
        ${t.tag_label ? `<span class="muted">Tags: ${esc(t.tag_label)}</span>` : ""}
        <span class="count" id="tcount"></span>
      </div>
      <p class="muted legend-line"><span class="chip risk">2.1 Privacy</span> MIT hub subdomain the category maps to ·
        <span class="chip mono">IBM: …</span> crosswalk to a category in another taxonomy</p>
      <ul class="tree root" id="ttree">${t.categories.map((c) => item(c, 0)).join("")}</ul>`;
    const tree = root.querySelector("#ttree");
    const setAll = (open) => tree.querySelectorAll("details").forEach((d) => { d.open = open; });
    root.querySelector("#texp").addEventListener("click", () => setAll(true));
    root.querySelector("#tcol").addEventListener("click", () => setAll(false));
    const q = root.querySelector("#tq");
    if (q) q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase();
      let n = 0;
      tree.querySelectorAll("li").forEach((li) => { li.hidden = false; li.classList.remove("hit"); });
      if (!s) { root.querySelector("#tcount").textContent = ""; return; }
      const lis = [...tree.querySelectorAll("li")];
      const match = new Set(lis.filter((li) => li.dataset.name.includes(s)));
      lis.forEach((li) => {
        const keep = match.has(li) || [...li.querySelectorAll("li")].some((x) => match.has(x));
        li.hidden = !keep && !(li.parentElement.closest("li") && match.has(li.parentElement.closest("li")));
        if (match.has(li)) { li.classList.add("hit"); n++; }
        const d = li.querySelector(":scope > details");
        if (d && keep) d.open = true;
      });
      root.querySelector("#tcount").textContent = `${n} matching`;
    });
    if (focus) {
      const li = tree.querySelector(`li[data-id="${CSS.escape(focus)}"]`);
      if (li) {
        let p = li.parentElement;
        while (p && p !== tree) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
        li.classList.add("hit");
        setTimeout(() => li.scrollIntoView({ block: "center" }), 0);
      }
    }
  }

  // ---------------- hub subdomain page: one risk across taxonomies, policies and regulations ----------------
  function hub(root, code, api) {
    const I = api.risk;
    const s = I.hubSubdomains.find((x) => x.code === code);
    if (!s) { root.innerHTML = `<a class="back" href="#/risks">← Risks</a><h1>Not found</h1><p>No MIT subdomain <code>${esc(code)}</code>.</p>`; return; }
    const i = I.hubSubdomains.indexOf(s);
    const prev = I.hubSubdomains[i - 1], next = I.hubSubdomains[i + 1];
    const by = I.bySub[s.id] || {};
    const txList = I.taxonomies.filter((t) => !t.is_hub).map((t) => {
      const cats = arr(by[t.taxonomy_id]);
      return `<section class="group"><h3><a href="#/risks/${encodeURIComponent(t.taxonomy_id)}">${esc(t.short_name)}</a> <span class="muted">(${cats.length})</span></h3>
        ${cats.length ? `<ul class="conn-list">${cats.map((c) => `<li><a href="#/risks/${encodeURIComponent(t.taxonomy_id)}/${encodeURIComponent(c.id)}">${esc(c.name)}</a></li>`).join("")}</ul>`
          : '<p class="muted">No category mapped.</p>'}</section>`;
    }).join("");
    const ms = arr(I.clausesBySub[s.id]);
    const docSection = (cat) => {
      const byDoc = {};
      ms.filter((m) => api.docById[m.policy_id].category === cat).forEach((m) => (byDoc[m.policy_id] = byDoc[m.policy_id] || []).push(m));
      const ids = Object.keys(byDoc).sort((a, b) => byDoc[b].length - byDoc[a].length);
      return `<section class="group"><h3>${cat === "policy" ? "Policies" : "Regulations"} addressing it <span class="muted">(${ids.length})</span></h3>
        ${ids.length ? `<ul class="conn-list">${ids.map((id) => {
          const p = api.docById[id];
          return `<li><a href="${api.href(id)}">${esc(api.docName(p))}</a> <span class="muted">${esc(p.jurisdiction)}</span>
            <ul class="sub-list">${byDoc[id].map((m) => {
              const c = p.clauses.find((x) => x.clause_id === m.clause_id);
              return `<li><span class="mono">${esc(c.section || "")}</span> ${esc(c.requirement || "")}${m.relation === "relates_to" ? ' <span class="chip warn">relates to</span>' : ""}</li>`;
            }).join("")}</ul></li>`;
        }).join("")}</ul>` : '<p class="muted">No clause in the catalogue mapped here.</p>'}</section>`;
    };
    root.innerHTML = `
      <a class="back" href="#/risks">← All risk taxonomies</a>
      <p class="crumbs muted"><a href="#/risks/MIT_AI_Risk_Repository">MIT AI Risk Repository</a> › ${esc(s.domain.code)} ${esc(s.domain.name)}</p>
      <h1><span class="mono">${esc(s.code)}</span> ${esc(s.name)}</h1>
      <p class="objective">${esc(s.description || "")}</p>
      <div class="stats">
        <div class="stat"><b>${Object.values(by).flat().length}</b><span>categories in ${Object.keys(by).length} other taxonomies</span></div>
        <div class="stat"><b>${new Set(ms.filter((m) => api.docById[m.policy_id].category === "policy").map((m) => m.policy_id)).size}</b><span>policies</span></div>
        <div class="stat"><b>${new Set(ms.filter((m) => api.docById[m.policy_id].category === "regulation").map((m) => m.policy_id)).size}</b><span>regulations</span></div>
        <div class="stat"><b>${ms.length}</b><span>clauses mapped</span></div>
      </div>
      <h2>Who addresses this risk</h2>
      <div class="conn two">${docSection("policy")}${docSection("regulation")}</div>
      <h2>How each taxonomy names it</h2>
      <div class="groups">${txList}</div>
      <p class="muted">Clause mappings and most crosswalks are the compiler's interpretation (IBM Risk Atlas mappings come from AI Atlas Nexus). Not human-verified.</p>
      <div class="ev-nav">${prev ? `<a class="btn" href="#/risk/${esc(prev.code)}">← ${esc(prev.code)} ${esc(SHORT[prev.code])}</a>` : "<span></span>"}
        ${next ? `<a class="btn" href="#/risk/${esc(next.code)}">${esc(next.code)} ${esc(SHORT[next.code])} →</a>` : "<span></span>"}</div>`;
  }

  window.RiskViews = { index, overview, taxonomy, hub };
})();
