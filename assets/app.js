/* AI Policy Catalogue — static single-page app.
   Data: data/catalog.json (policies + regulations) and data/risks.json (risk taxonomies, crosswalk, clause -> risk mapping),
   both built by scripts/build.py. */
(function () {
  "use strict";

  // ---------- schema (from "Policy Risk Mapping Factors") ----------
  const POLICY_GROUPS = [
    ["Identity", [
      ["policy_id", "Unique identifier", "EU_AI_Act_2024"],
      ["policy_name", "Human-readable name", "EU Artificial Intelligence Act"],
      ["policy_type", "Distinguishes legal vs organisational rules", "regulation / standard / internal_policy"],
      ["category", "Which catalogue the record belongs to, by legal force", "policy / regulation"],
      ["source_uri", "Provenance: official source", "https://eur-lex.europa.eu/…"],
      ["issuing_authority", "Who established the policy", "European Union"],
    ]],
    ["Locale / scope", [
      ["jurisdiction", "Critical for applicability", "EU"],
      ["country_region", "More granular location", "EU / Germany"],
      ["language", "Language of the text used for clauses (cross-lingual work)", "en"],
      ["official_languages", "Languages the issuer published officially", "24 EU languages"],
      ["regulatory_regime", "Recommended as a first-class field", "EU AI Act"],
      ["geo_constraints", "Where the rule applies", "EU market"],
      ["industry_scope", "Some rules are sector-specific", "healthcare / finance / general"],
    ]],
    ["Locale context", [
      ["locale_context.language", "Languages of the official texts", "English, Chinese (Traditional)"],
      ["locale_context.region", "Macro-region › specific place", "Europe › European Union"],
      ["locale_context.regulation", "Legal force · regulatory approach", "Binding law · horizontal, risk-based"],
      ["locale_context.culture", "Governance / cultural context that shapes how the policy is read (compiler's interpretation)", "rights-based, precautionary tradition"],
      ["locale_context.use_cases", "AI use cases the policy targets", "employment & HR decisions; deepfakes"],
    ]],
    ["Lifecycle", [
      ["status", "The policy may not yet be authoritative", "draft / provisional / enforceable / superseded / incomplete"],
      ["binding", "Legally binding or voluntary", "true"],
      ["effective_date", "When it applies", "2024-08-01"],
      ["key_dates", "Phased application milestones", "2026-08-02: high-risk obligations"],
      ["versions", "Evolution: every draft, release, amendment and repeal, with what changed by aspect", "Proposal 2021 → Regulation 2024 → Omnibus 2026"],
      ["expiration_date", "If applicable", "null"],
      ["version", "Policies change", "v2.1"],
      ["last_updated", "Helps detect outdated policy", "2026-01-15"],
    ]],
    ["Applicability", [
      ["covered_entities", "Who must comply", "AI provider"],
      ["covered_systems", "What systems are covered", "high-risk AI"],
      ["covered_activities", "What activities trigger the policy", "deployment"],
      ["exceptions", "Where the rule does not apply", "research use"],
      ["conditions", "Conditional applicability", "if used for employment"],
    ]],
    ["Policy meaning", [
      ["objective", "Overall policy intent", "protect personal data"],
      ["policy_domain", "High-level category", "privacy / safety / security"],
      ["principles", "Conceptual requirements", "transparency"],
    ]],
    ["Relationship", [
      ["parent_policy", "Relationship to another policy", "GDPR"],
      ["related_policies", "Overlapping frameworks (overlaps_with, supersedes, specializes, conflicts_with …)", "local privacy law"],
      ["conflict_rule", "Needed when jurisdictions overlap", "most stringent wins"],
    ]],
  ];
  const CLAUSE_ATTRS = [
    ["clause_id", "GDPR_5_1_A"], ["policy_id", "GDPR"], ["section", "Article 5(1)(a)"],
    ["original_text", "\"Personal data shall be processed lawfully…\""], ["text_is_verbatim", "true"],
    ["language", "en"], ["translated_text", "…"], ["actor", "data controller"], ["action", "process"],
    ["object", "personal data"], ["recipient", "third party"], ["modality", "MUST / MUST NOT / MAY / SHOULD"],
    ["requirement", "process lawfully"], ["condition", "when processing personal data"],
    ["exception", "legitimate exemptions"], ["purpose", "lawful/fair processing"],
    ["affected_asset", "personal data"], ["policy_domain", "privacy"], ["interpretation_notes", "…"],
    ["ambiguity", "low / medium / high"], ["interpretation_confidence", "0.87"], ["human_verified", "true"],
    ["applicable_regions", "EU"], ["applicable_systems", "systems processing personal data"],
  ];
  const TYPE_LABEL = {
    regulation: "Regulation", statute: "Statute", executive_order: "Executive order", guidance: "Guidance",
    standard: "Standard", framework: "Framework", international_instrument: "International instrument",
    voluntary_code: "Voluntary code", internal_policy: "Internal policy", bill: "Bill",
  };
  const STATUS_TONE = {
    enforceable: "ok", voluntary: "accent", provisional: "warn", draft: "warn", proposed: "warn",
    incomplete: "warn", superseded: "bad", revoked: "bad", lapsed: "bad",
  };
  const KIND = {
    policy: { one: "policy", many: "policies", Title: "Policies", route: "policy", list: "#/" },
    regulation: { one: "regulation", many: "regulations", Title: "Regulations", route: "regulation", list: "#/regulations" },
  };

  // ---------- helpers ----------
  const $app = document.getElementById("app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const nul = '<span class="null">null</span>';
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  const link = (u, text) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(text || u)}</a>` : esc(u); };
  const chip = (t, tone) => `<span class="chip ${tone || ""}">${esc(t)}</span>`;
  const statusChip = (s) => (s ? chip(s, STATUS_TONE[s] || "") : "");
  const modalityTag = (m) => {
    if (!m) return "";
    const k = m.toUpperCase().replace(/\s+/g, "");
    const cls = k === "MUSTNOT" || k === "SHOULDNOT" ? "m-mustnot" : k === "MUST" ? "m-must" : k === "SHOULD" ? "m-should" : "m-may";
    return `<span class="modality ${cls}">${esc(m)}</span>`;
  };
  const words = (s) => String(s).replace(/_/g, " ");
  const docById = {};
  let DATA = null;
  let RISK = null; // risk index built by window.RiskViews.index()
  const docs = (kind) => DATA.documents.filter((p) => !kind || p.category === kind);
  const href = (id) => { const p = docById[id]; return `#/${p && p.category === "regulation" ? "regulation" : "policy"}/${encodeURIComponent(id)}`; };
  const docName = (p) => p.short_name || p.policy_name;

  function val(v, key) {
    if (isEmpty(v)) return nul;
    if (typeof v === "boolean") return v ? "true" : "false";
    if (key === "source_uri") return link(v);
    if (key === "policy_domain" || key === "industry_scope" || key === "language" || key === "official_languages")
      return arr(v).map((x) => chip(words(x))).join("");
    if (key === "status") return statusChip(v);
    if (key === "policy_type") return esc(TYPE_LABEL[v] || v);
    if (key === "category") return categoryChip(v);
    if (key === "parent_policy") return policyRef(v);
    if (key === "related_policies") {
      return "<ul>" + arr(v).map((r) => typeof r === "object"
        ? `<li><span class="chip mono">${esc(r.relation || "related")}</span> ${policyRef(r.policy)}${r.note ? ` <span class="muted">— ${esc(r.note)}</span>` : ""}</li>`
        : `<li>${policyRef(r)}</li>`).join("") + "</ul>";
    }
    if (key === "key_dates") {
      return '<ul class="timeline">' + arr(v).map((d) => `<li><time>${esc(d.date || "")}</time><span>${esc(d.event || "")}</span></li>`).join("") + "</ul>";
    }
    if (Array.isArray(v)) return v.length === 1 ? esc(fmtScalar(v[0])) : "<ul>" + v.map((x) => `<li>${esc(fmtScalar(x))}</li>`).join("") + "</ul>";
    if (typeof v === "object") return "<ul>" + Object.entries(v).map(([k, x]) => `<li><code>${esc(k)}</code>: ${esc(fmtScalar(x))}</li>`).join("") + "</ul>";
    return esc(v);
  }
  const fmtScalar = (x) => (x && typeof x === "object" ? Object.values(x).join(" — ") : x);
  const categoryChip = (c) => `<span class="chip cat-${esc(c)}">${esc(c === "regulation" ? "Regulation" : "Policy")}</span>`;
  function policyRef(id) {
    if (isEmpty(id)) return nul;
    const p = docById[id];
    return p ? `<a href="${href(id)}">${esc(docName(p))}</a> ${categoryChip(p.category)}` : esc(id);
  }
  const lc = (p) => p.locale_context || {};
  const macro = (p) => String(lc(p).region || "").split(" › ")[0];

  // ---------- state ----------
  const newFilters = () => ({ q: "", jur: "", region: "", usecase: "", type: "", status: "", domain: "", risk: "", sort: "effective_date", dir: -1 });
  const filters = { policy: newFilters(), regulation: newFilters() };
  const cf = { q: "", modality: "", domain: "", ambiguity: "", policy: "", verbatim: "", category: "", risk: "" };

  // ---------- list views (Policies / Regulations) ----------
  function viewDocs(kind) {
    const K = KIND[kind];
    const pf = filters[kind];
    const P = docs(kind);
    const other = kind === "policy" ? "regulation" : "policy";
    const opts = (vals, cur, label, fmt) => `<option value="">${label}</option>` +
      [...new Set(vals)].filter(Boolean).sort().map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(fmt ? fmt(v) : TYPE_LABEL[v] || words(v))}</option>`).join("");
    const jurs = P.map((p) => p.jurisdiction);
    const clauses = P.flatMap((p) => arr(p.clauses));
    const langs = new Set(P.flatMap((p) => arr(p.official_languages).concat(arr(p.language)))).size;
    const risksCovered = new Set(P.flatMap((p) => RISK.docRisks(p.policy_id).map((r) => r.id))).size;
    const lede = kind === "policy"
      ? `Frameworks, standards, guidance, voluntary codes and organisational AI policies: documents that say how AI <em>should</em> be governed
         without being law. Binding laws, executive orders and bills are catalogued separately under <a href="#/regulations">Regulations</a>,
         and the risks both address are under <a href="#/risks">Risks</a>.`
      : `Binding AI-relevant law: statutes, regulations, executive orders and treaties, plus bills that would become law. They share the
         policy schema, so each <a href="#/">policy</a> can be compared with the regulations it implements or anticipates,
         and both are mapped to <a href="#/risks">risk taxonomies</a>.`;
    $app.innerHTML = `
      <h1>${kind === "policy" ? "AI policies, described attribute by attribute" : "AI regulations"}</h1>
      <p class="lede">${lede} Each record follows the policy → clause schema in <a href="#/schema">Schema</a>.</p>
      <div class="stats">
        <div class="stat"><b>${P.length}</b><span>${K.many}</span></div>
        <div class="stat"><b>${clauses.length}</b><span>structured clauses</span></div>
        <div class="stat"><b>${new Set(jurs).size}</b><span>jurisdictions</span></div>
        <div class="stat"><b>${kind === "policy" ? P.filter((p) => p.jurisdiction === "Organization").length : P.filter((p) => p.status === "enforceable").length}</b><span>${kind === "policy" ? "organisational policies" : "in force"}</span></div>
        <div class="stat"><b>${langs}</b><span>languages recorded</span></div>
        <div class="stat"><b>${risksCovered}</b><span>of ${RISK.hubSubdomains.length} risk subdomains addressed</span></div>
      </div>
      <p class="xlinks">Connected: <a href="${KIND[other].list}">${docs(other).length} ${KIND[other].many}</a> ·
        <a href="#/risks">${RISK.taxonomies.length} risk taxonomies</a> · <a href="#/visualize">how they connect</a></p>
      <div class="filters">
        <input type="search" id="q" placeholder="Search name, authority, principle, entity…" value="${esc(pf.q)}" aria-label="Search ${K.many}">
        <select id="jur" aria-label="Jurisdiction">${opts(jurs, pf.jur, "All jurisdictions")}</select>
        <select id="type" aria-label="Type">${opts(P.map((p) => p.policy_type), pf.type, "All types")}</select>
        <select id="status" aria-label="Status">${opts(P.map((p) => p.status), pf.status, "All statuses")}</select>
        <select id="domain" aria-label="Domain">${opts(P.flatMap((p) => arr(p.policy_domain)), pf.domain, "All domains")}</select>
        <select id="region" aria-label="Region">${opts(P.map(macro), pf.region, "All regions")}</select>
        <select id="usecase" aria-label="Use case">${opts(P.flatMap((p) => arr(lc(p).use_cases)), pf.usecase, "All use cases")}</select>
        <select id="risk" aria-label="Risk addressed">${opts(P.flatMap((p) => RISK.docRisks(p.policy_id).map((r) => r.id)), pf.risk, "Any risk addressed", (v) => RISK.hubLabel(v))}</select>
        <button class="btn" id="csv" type="button">Download CSV</button>
        <a class="btn" href="data/catalog.json" download>JSON</a>
      </div>
      <div class="filters"><span class="count" id="count"></span></div>
      <div class="table-scroll"><table>
        <thead><tr>
          <th class="sortable" data-sort="policy_name">${K.Title.slice(0, -1).replace(/ie$/, "y")}</th>
          <th class="sortable" data-sort="policy_type">Type</th>
          <th class="sortable" data-sort="jurisdiction">Jurisdiction</th>
          <th class="sortable" data-sort="status">Status</th>
          <th class="sortable" data-sort="effective_date">Effective</th>
          <th class="hide-sm">Risks addressed</th>
          <th class="hide-sm">Lang.</th>
          <th class="sortable hide-sm" data-sort="clauses">Clauses</th>
        </tr></thead><tbody id="rows"></tbody></table></div>`;

    let lastRows = P;
    const draw = () => {
      const q = pf.q.trim().toLowerCase();
      const rows = P.filter((p) =>
        (!pf.jur || p.jurisdiction === pf.jur) && (!pf.type || p.policy_type === pf.type) &&
        (!pf.status || p.status === pf.status) && (!pf.domain || arr(p.policy_domain).includes(pf.domain)) &&
        (!pf.region || macro(p) === pf.region) && (!pf.usecase || arr(lc(p).use_cases).includes(pf.usecase)) &&
        (!pf.risk || RISK.docRisks(p.policy_id).some((r) => r.id === pf.risk)) &&
        (!q || JSON.stringify([p.policy_id, p.policy_name, p.short_name, p.issuing_authority, p.country_region, p.regulatory_regime,
          p.objective, p.principles, p.covered_entities, p.covered_systems, p.locale_context]).toLowerCase().includes(q)));
      const key = pf.sort;
      rows.sort((a, b) => {
        const av = key === "clauses" ? arr(a.clauses).length : String(a[key] ?? "");
        const bv = key === "clauses" ? arr(b.clauses).length : String(b[key] ?? "");
        return (av > bv ? 1 : av < bv ? -1 : 0) * pf.dir;
      });
      document.getElementById("count").textContent = `${rows.length} of ${P.length} ${K.many}`;
      document.getElementById("rows").innerHTML = rows.map((p) => {
        const rs = RISK.docRisks(p.policy_id);
        return `
        <tr class="row-link" data-id="${esc(p.policy_id)}">
          <td class="name"><a href="${href(p.policy_id)}">${esc(docName(p))}</a>
            <span class="sub">${esc(p.issuing_authority || "")}</span></td>
          <td>${esc(TYPE_LABEL[p.policy_type] || p.policy_type || "")}</td>
          <td>${esc(p.jurisdiction || "")}<span class="sub">${esc(macro(p))}</span></td>
          <td>${statusChip(p.status)}</td>
          <td class="mono date">${esc(p.effective_date || "—")}</td>
          <td class="hide-sm">${rs.slice(0, 3).map((r) => `<span class="chip risk" title="${esc(r.name)}">${esc(r.code)} ${esc(RISK.shortName(r.id))}</span>`).join("")}${rs.length > 3 ? `<span class="muted"> +${rs.length - 3}</span>` : ""}</td>
          <td class="hide-sm mono">${esc(arr(p.official_languages).length > 4 ? arr(p.official_languages).length + " langs" : arr(p.official_languages).join(", "))}</td>
          <td class="hide-sm mono">${arr(p.clauses).length}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="8" class="muted">No ${K.many} match these filters.</td></tr>`;
      document.querySelectorAll("th.sortable").forEach((th) => {
        th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (th.dataset.sort === pf.sort ? (pf.dir > 0 ? " ▲" : " ▼") : "");
      });
      lastRows = rows;
    };
    ["q", "jur", "type", "status", "domain", "region", "usecase", "risk"].forEach((k) =>
      document.getElementById(k).addEventListener("input", (e) => { pf[k] = e.target.value; draw(); }));
    document.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
      if (pf.sort === th.dataset.sort) pf.dir *= -1; else { pf.sort = th.dataset.sort; pf.dir = 1; }
      draw();
    }));
    document.getElementById("rows").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr && !e.target.closest("a")) location.hash = href(tr.dataset.id);
    });
    document.getElementById("csv").addEventListener("click", () => downloadCsv(lastRows, K.many));
    draw();
  }

  // ---------- detail view ----------
  function viewDoc(id) {
    const p = docById[id];
    if (!p) { $app.innerHTML = `<a class="back" href="#/">← All policies</a><h1>Not found</h1><p>No policy or regulation with id <code>${esc(id)}</code>.</p>`; return; }
    const K = KIND[p.category];
    const group = (title, keys) => `<section class="group"><h3>${esc(title)}</h3><dl class="attrs">` +
      keys.map((k) => `<dt>${esc(k)}</dt><dd>${val(p[k], k)}</dd>`).join("") + "</dl></section>";
    const prov = p.record_provenance || {};
    const incoming = DATA.documents.filter((o) => o.policy_id !== p.policy_id &&
      (arr(o.related_policies).some((r) => (r && r.policy) === p.policy_id) || o.parent_policy === p.policy_id));
    $app.innerHTML = `
      <a class="back" href="${K.list}">← All ${K.many}</a>
      <h1>${esc(p.policy_name)}</h1>
      <div class="detail-head">${categoryChip(p.category)}${statusChip(p.status)}${chip(TYPE_LABEL[p.policy_type] || p.policy_type || "")}
        ${chip(p.jurisdiction || "")}${p.binding ? chip("binding", "ok") : chip("non-binding")}
        ${chip(p.policy_id, "mono")}</div>
      <p class="objective">${esc(p.objective || "")}</p>
      ${prov.notes ? `<p class="note"><strong>Compiler's notes:</strong> ${esc(prov.notes)}</p>` : ""}
      ${connectionsBlock(p, incoming)}
      ${localeBlock(p)}
      <section id="evolution"></section>
      <h2>Attributes</h2>
      <div class="groups">
        ${group("Identity", ["policy_id", "policy_name", "short_name", "policy_type", "category", "source_uri", "issuing_authority"])}
        ${group("Locale / scope", ["jurisdiction", "country_region", "language", "official_languages", "regulatory_regime", "geo_constraints", "industry_scope"])}
        ${group("Lifecycle", ["status", "binding", "effective_date", "expiration_date", "version", "last_updated"])}
        ${group("Applicability", ["covered_entities", "covered_systems", "covered_activities", "exceptions", "conditions"])}
        ${group("Policy meaning", ["objective", "policy_domain", "principles"])}
        <section class="group"><h3>Relationship</h3><dl class="attrs">
          <dt>parent_policy</dt><dd>${val(p.parent_policy, "parent_policy")}</dd>
          <dt>related_policies</dt><dd>${val(p.related_policies, "related_policies")}</dd>
          <dt>conflict_rule</dt><dd>${val(p.conflict_rule, "conflict_rule")}</dd>
          ${incoming.length ? `<dt>referenced_by</dt><dd>${incoming.map((o) => policyRef(o.policy_id)).join(", ")}</dd>` : ""}
        </dl></section>
        <section class="group wide"><h3>Lifecycle · key dates</h3><dl class="attrs wide"><dt>key_dates</dt><dd>${val(p.key_dates, "key_dates")}</dd></dl></section>
        <section class="group"><h3>Record provenance</h3><dl class="attrs">
          <dt>sources_consulted</dt><dd>${isEmpty(prov.sources_consulted) ? nul : "<ul>" + arr(prov.sources_consulted).map((u) => `<li>${link(u)}</li>`).join("") + "</ul>"}</dd>
          <dt>compiled_on</dt><dd>${val(prov.compiled_on)}</dd>
          <dt>human_verified</dt><dd>${prov.human_verified ? chip("verified", "ok") : chip("not yet verified", "warn")}</dd>
        </dl></section>
      </div>
      <h2>Clauses (${arr(p.clauses).length})</h2>
      ${arr(p.clauses).map((c) => clauseCard(c, false)).join("")}`;
    if (window.PolicyEvolution) window.PolicyEvolution.render(document.getElementById("evolution"), p);
    window.scrollTo(0, 0);
  }

  // Cross-links to the other two concepts: related policies/regulations and the risks the clauses address.
  function connectionsBlock(p, incoming) {
    const rel = new Map();
    arr(p.related_policies).forEach((r) => { if (r && docById[r.policy]) rel.set(r.policy, r.relation); });
    if (p.parent_policy && docById[p.parent_policy]) rel.set(p.parent_policy, "parent");
    incoming.forEach((o) => { if (!rel.has(o.policy_id)) rel.set(o.policy_id, "referenced by"); });
    const list = (cat) => {
      const ids = [...rel.keys()].filter((id) => docById[id].category === cat);
      return ids.length ? `<ul class="conn-list">${ids.map((id) => `<li><a href="${href(id)}">${esc(docName(docById[id]))}</a> <span class="chip mono">${esc(words(rel.get(id)))}</span></li>`).join("")}</ul>`
        : `<p class="muted">None in the catalogue.</p>`;
    };
    const rs = RISK.docRisks(p.policy_id);
    return `<h2>Connections</h2>
      <div class="conn">
        <section class="group"><h3>Related regulations</h3>${list("regulation")}</section>
        <section class="group"><h3>Related policies</h3>${list("policy")}</section>
        <section class="group"><h3>Risks addressed <a class="h-link" href="#/risks">(MIT AI Risk Repository subdomains)</a></h3>
          ${rs.length ? `<ul class="conn-list">${rs.map((r) => `<li><a href="#/risk/${esc(r.code)}"><span class="mono">${esc(r.code)}</span> ${esc(r.name)}</a>
            <span class="muted">${r.n} clause${r.n > 1 ? "s" : ""}</span></li>`).join("")}</ul>`
            : `<p class="muted">No clause of this record is mapped to a specific risk (its clauses set general governance or risk-management process).</p>`}
        </section>
      </div>`;
  }

  function localeBlock(p) {
    const c = lc(p);
    if (!p.locale_context) return "";
    return `<h2>Locale context</h2>
      <section class="group wide locale"><dl class="attrs wide">
        <dt>Language</dt><dd>${isEmpty(c.language) ? nul : arr(c.language).map((x) => chip(x)).join("")}</dd>
        <dt>Region</dt><dd>${val(c.region)}</dd>
        <dt>Regulation</dt><dd>${val(c.regulation)}</dd>
        <dt>Culture</dt><dd>${val(c.culture)} <span class="chip warn" title="Interpretive field written by the compiler">interpretation</span></dd>
        <dt>Use case</dt><dd>${isEmpty(c.use_cases) ? nul : arr(c.use_cases).map((x) => `<a class="chip accent" href="${KIND[p.category].list}" data-usecase="${esc(x)}" data-kind="${esc(p.category)}">${esc(x)}</a>`).join("")}</dd>
      </dl></section>`;
  }

  function clauseCard(c, showPolicy) {
    const t = (k, label) => `<dt>${esc(label || k)}</dt><dd>${isEmpty(c[k]) ? nul : esc(Array.isArray(c[k]) ? c[k].join(", ") : c[k])}</dd>`;
    const conf = typeof c.interpretation_confidence === "number" ? c.interpretation_confidence : null;
    const p = docById[c.policy_id];
    const m = RISK.clauseRisks(c.clause_id);
    return `<article class="clause" id="${esc(c.clause_id)}">
      <div class="clause-head">
        ${showPolicy && p ? `<a href="${href(p.policy_id)}"><strong>${esc(docName(p))}</strong></a> ${categoryChip(p.category)} ·` : ""}
        <span class="sec">${esc(c.section || "")}</span>${modalityTag(c.modality)}
        ${c.policy_domain ? chip(words(c.policy_domain)) : ""}
        ${c.ambiguity ? chip("ambiguity: " + c.ambiguity, c.ambiguity === "high" ? "bad" : c.ambiguity === "medium" ? "warn" : "ok") : ""}
        ${c.text_is_verbatim === false ? chip("paraphrase", "warn") : chip("verbatim")}
        ${conf != null ? `<span class="conf" title="interpretation_confidence">conf. <span class="conf-bar"><i style="width:${Math.round(conf * 100)}%"></i></span>${conf.toFixed(2)}</span>` : ""}
        <span class="chip mono">${esc(c.clause_id)}</span>
      </div>
      <div class="clause-body">
        <div>
          <blockquote lang="${esc(c.language || "")}">${esc(c.original_text || "")}</blockquote>
          ${c.translated_text ? `<blockquote class="translation" lang="en">${esc(c.translated_text)}</blockquote>` : ""}
          <dl class="tuple">${t("requirement")}${t("purpose")}${t("interpretation_notes", "notes")}${t("applicable_regions", "regions")}${t("applicable_systems", "systems")}
            <dt>risk</dt><dd>${m ? m.risks.map((r) => `<a class="chip risk" href="#/risk/${esc(r.code)}" title="${esc(r.name)}">${esc(r.code)} ${esc(RISK.shortName(r.id))}</a>`).join("") +
              (m.relation === "relates_to" ? ' <span class="muted">(relates to, does not mitigate)</span>' : "") : '<span class="null">not mapped</span>'}</dd></dl>
        </div>
        <dl class="tuple">${t("actor")}${t("action")}${t("object")}${t("recipient")}${t("modality")}${t("condition")}${t("exception")}${t("affected_asset")}${t("language")}</dl>
      </div>
    </article>`;
  }

  function viewClauses() {
    const all = DATA.documents.flatMap((p) => arr(p.clauses));
    const opts = (vals, cur, label, fmt) => `<option value="">${label}</option>` +
      [...new Set(vals)].filter(Boolean).sort().map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(fmt ? fmt(v) : words(v))}</option>`).join("");
    $app.innerHTML = `
      <h1>Clause explorer</h1>
      <p class="lede">Clauses from both <a href="#/">policies</a> and <a href="#/regulations">regulations</a>, each normalised into
      ⟨Actor, Action, Object, Modality, Condition, Exception, Purpose⟩ and, where it targets a specific risk, mapped to a
      <a href="#/risks">risk subdomain</a>: the clause → risk step of the pipeline.</p>
      <div class="filters">
        <input type="search" id="cq" placeholder="Search clause text, actor, object…" value="${esc(cf.q)}" aria-label="Search clauses">
        <select id="ccat" aria-label="Source"><option value="">Policies + regulations</option>
          <option value="policy"${cf.category === "policy" ? " selected" : ""}>Policies only</option>
          <option value="regulation"${cf.category === "regulation" ? " selected" : ""}>Regulations only</option></select>
        <select id="cmod" aria-label="Modality">${opts(all.map((c) => c.modality), cf.modality, "All modalities", (v) => v)}</select>
        <select id="cdom" aria-label="Domain">${opts(all.map((c) => c.policy_domain), cf.domain, "All domains")}</select>
        <select id="crisk" aria-label="Risk">${opts(RISK.hubSubdomains.map((s) => s.id), cf.risk, "Any risk", (v) => RISK.hubLabel(v))}</select>
        <select id="camb" aria-label="Ambiguity">${opts(all.map((c) => c.ambiguity), cf.ambiguity, "Any ambiguity")}</select>
        <select id="cpol" aria-label="Policy or regulation">${opts(DATA.documents.map((p) => p.policy_id), cf.policy, "All documents", (v) => docName(docById[v]))}</select>
        <select id="cverb" aria-label="Text"><option value="">Verbatim + paraphrase</option>
          <option value="true"${cf.verbatim === "true" ? " selected" : ""}>Verbatim only</option>
          <option value="false"${cf.verbatim === "false" ? " selected" : ""}>Paraphrase only</option></select>
        <span class="count" id="ccount"></span>
      </div>
      <div id="clist"></div>`;
    const draw = () => {
      const q = cf.q.trim().toLowerCase();
      const rows = all.filter((c) => (!cf.modality || c.modality === cf.modality) && (!cf.domain || c.policy_domain === cf.domain) &&
        (!cf.category || docById[c.policy_id].category === cf.category) &&
        (!cf.risk || (RISK.clauseRisks(c.clause_id) || { risks: [] }).risks.some((r) => r.id === cf.risk)) &&
        (!cf.ambiguity || c.ambiguity === cf.ambiguity) && (!cf.policy || c.policy_id === cf.policy) &&
        (!cf.verbatim || String(c.text_is_verbatim) === cf.verbatim) &&
        (!q || JSON.stringify(c).toLowerCase().includes(q)));
      document.getElementById("ccount").textContent = `${rows.length} of ${all.length} clauses`;
      document.getElementById("clist").innerHTML = rows.map((c) => clauseCard(c, true)).join("") || '<p class="muted">No clauses match.</p>';
    };
    [["cq", "q"], ["ccat", "category"], ["cmod", "modality"], ["cdom", "domain"], ["crisk", "risk"], ["camb", "ambiguity"], ["cpol", "policy"], ["cverb", "verbatim"]]
      .forEach(([id, k]) => document.getElementById(id).addEventListener("input", (e) => { cf[k] = e.target.value; draw(); }));
    draw();
  }

  function viewSchema() {
    $app.innerHTML = `
      <h1>Schema</h1>
      <p class="lede">Three separate layers: <strong>documents</strong> (policies and regulations, described policy → clauses),
      <strong>risk taxonomies</strong>, and a <strong>mapping layer</strong> linking clauses to risks. Risks are deliberately kept out of
      document records, because the same clause can imply different risks for different AI systems.</p>
      <div class="pipeline"><span>CLAUSE</span><em>→</em><span>APPLICABILITY</span><em>→</em><span>USE CASE</span><em>→</em><span>RISK</span><em>→</em><span>CONTROL</span><em>→</em><span>EVIDENCE</span></div>
      <h2>Policies vs. regulations</h2>
      <p>Both use the schema below. A record is a <strong>regulation</strong> when it is a government legal instrument (statute, regulation,
      executive order, bill, or a binding treaty or directive); everything else (frameworks, standards, guidance, voluntary codes,
      organisational policies) is a <strong>policy</strong>. The <code>category</code> field holds the split, and records live in
      <code>data/policies/</code> or <code>data/regulations/</code> accordingly.</p>
      <h2>Document attributes</h2>
      <div class="table-scroll"><table class="schema-group"><thead><tr><th>Group</th><th>Attribute</th><th>Why</th><th>Example</th></tr></thead><tbody>
      ${POLICY_GROUPS.map(([g, rows]) => rows.map(([k, why, ex], i) => `<tr><td>${i ? "" : `<strong>${esc(g)}</strong>`}</td><td><code>${esc(k)}</code></td><td>${esc(why)}</td><td class="muted">${esc(ex)}</td></tr>`).join("")).join("")}
      </tbody></table></div>
      <h2>Clause-level attributes</h2>
      <p class="muted">Clause = ⟨Actor, Action, Object, Modality, Condition, Exception, Purpose⟩</p>
      <div class="table-scroll"><table><thead><tr><th>Attribute</th><th>Example</th></tr></thead><tbody>
      ${CLAUSE_ATTRS.map(([k, ex]) => `<tr><td><code>${esc(k)}</code></td><td class="muted">${esc(ex)}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>Risk taxonomy records</h2>
      <p><code>data/risks/&lt;taxonomy_id&gt;.json</code>: identity (<code>name</code>, <code>publisher</code>, <code>year</code>, <code>version</code>,
      <code>source_uri</code>), <code>kind</code>, <code>levels</code> (names of the tree levels), <code>related_documents</code> (catalogue ids),
      <code>categories</code> (a tree of <code>{id, name, description, children}</code>) and <code>record_provenance</code>.
      One taxonomy, the MIT AI Risk Repository, is the <strong>hub</strong> (<code>is_hub: true</code>).</p>
      <h2>Mapping layer</h2>
      <dl class="tuple" style="max-width:860px;grid-template-columns:230px 1fr">
        <dt>risk_crosswalk_nexus.json</dt><dd>Category ↔ category edges imported from IBM's AI Atlas Nexus (relation: related, broader, narrower, close, exact).</dd>
        <dt>risk_crosswalk_compiler.json</dt><dd>Category → hub-subdomain edges written by the compiler for taxonomies without a Nexus mapping to the hub.</dd>
        <dt>clause_risks.json</dt><dd>Clause → hub-subdomain mapping, with relation <code>mitigates</code> or <code>relates_to</code>.</dd>
      </dl>
      <h2>Controlled vocabularies</h2>
      <dl class="tuple" style="max-width:820px;grid-template-columns:150px 1fr">
        <dt>category</dt><dd>policy · regulation</dd>
        <dt>status</dt><dd>draft · provisional · proposed · enforceable · voluntary · superseded · revoked · lapsed · incomplete</dd>
        <dt>policy_type</dt><dd>${Object.keys(TYPE_LABEL).join(" · ")}</dd>
        <dt>modality</dt><dd>MUST · MUST NOT · SHOULD · SHOULD NOT · MAY</dd>
        <dt>relation</dt><dd>overlaps_with · supersedes · superseded_by · specializes · implements · complements · amends · amended_by · conflicts_with</dd>
        <dt>ambiguity</dt><dd>low · medium · high</dd>
        <dt>version kind</dt><dd>draft · release · amendment · repeal</dd>
        <dt>change aspect</dt><dd>scope · definitions · risk_thresholds · obligations · safeguards · governance · transparency · enforcement · timeline</dd>
        <dt>change type</dt><dd>added · revised · removed</dd>
      </dl>`;
  }

  function viewAbout() {
    $app.innerHTML = `
      <h1>About this catalogue</h1>
      <p class="lede">A research catalogue supporting cross-lingual policy assurance: does equivalent policy intent, in different languages,
      yield equivalent risks, evidence and controls? It keeps three concepts apart and links them: <a href="#/">policies</a> (the focus),
      the <a href="#/regulations">regulations</a> they sit alongside, and the <a href="#/risks">risks</a> both address.</p>
      <h2>How records were compiled</h2>
      <ul>
        <li>Each policy and regulation record was compiled on ${esc(DATA.generated)} or shortly before, from the official source linked in <code>source_uri</code>; other sources consulted are listed per record.</li>
        <li>Clause text marked <span class="chip">verbatim</span> was copied from the official text. Where the official wording was not accessible (for example paywalled ISO standards),
          the clause is a faithful <span class="chip warn">paraphrase</span> and is labelled as such.</li>
        <li>Non-English clauses keep the original-language text, with an English translation in <code>translated_text</code>.</li>
        <li>Structured fields (actor, action, object…) and <code>interpretation_confidence</code> are interpretations. <strong>No record has been human-verified yet</strong>
          (<code>human_verified: false</code>).</li>
        <li>Clauses are representative, not exhaustive: 3–6 high-importance obligations per document.</li>
        <li>Risk taxonomies from IBM, MIT, NIST (AI 600-1), OWASP and AIR 2024 are imported from IBM's open-source
          <a href="https://github.com/IBM/ai-atlas-nexus" target="_blank" rel="noopener">AI Atlas Nexus</a> (Apache-2.0), with its crosswalks.
          The NIST AI RMF characteristics, DeepMind 2021 and EU AI Act tiers are hand-authored. Clause → risk mappings and the remaining
          crosswalks to the MIT hub are the compiler's interpretation.</li>
      </ul>
      <h2>Contributing</h2>
      <p>One JSON file per document lives in <code>data/policies/</code> or <code>data/regulations/</code>; taxonomies in <code>data/risks/</code>;
      mappings in <code>data/mappings/</code>. Run <code>python3 scripts/build.py</code> to validate and rebuild <code>data/catalog.json</code> and
      <code>data/risks.json</code>. See <code>data/SCHEMA.md</code>.</p>`;
  }

  // ---------- CSV ----------
  function downloadCsv(rows, name) {
    const cols = ["policy_id", "category", "policy_name", "short_name", "policy_type", "source_uri", "issuing_authority", "jurisdiction", "country_region",
      "language", "official_languages", "regulatory_regime", "geo_constraints", "industry_scope", "status", "binding", "effective_date",
      "expiration_date", "version", "last_updated", "covered_entities", "covered_systems", "covered_activities", "exceptions", "conditions",
      "objective", "policy_domain", "principles", "parent_policy", "related_policies", "conflict_rule",
      "locale_context.language", "locale_context.region", "locale_context.regulation", "locale_context.culture", "locale_context.use_cases", "risks_addressed"];
    const cell = (v) => {
      if (v == null) return "";
      if (Array.isArray(v)) v = v.map((x) => (x && typeof x === "object" ? `${x.relation || ""}:${x.policy || ""}` : x)).join("; ");
      else if (typeof v === "object") v = JSON.stringify(v);
      v = String(v);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const get = (p, c) => c === "risks_addressed" ? RISK.docRisks(p.policy_id).map((r) => r.code)
      : c.startsWith("locale_context.") ? lc(p)[c.slice(15)] : p[c];
    const csv = [cols.join(",")].concat(rows.map((p) => cols.map((c) => cell(get(p, c))).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ai-${name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function filterByUseCase(kind, u) {
    Object.assign(filters[kind], newFilters(), { usecase: u });
    const target = KIND[kind].list;
    if (location.hash === target || (target === "#/" && location.hash === "")) route(); else location.hash = target;
  }
  document.addEventListener("click", (e) => {
    const u = e.target.closest("[data-usecase]");
    if (u) { e.preventDefault(); filterByUseCase(u.dataset.kind || "policy", u.dataset.usecase); }
  });

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [head, ...rest] = h.split("/");
    const arg = decodeURIComponent(rest.join("/"));
    let tab = head || "policies";
    if (head === "policy" || head === "regulation") tab = docById[arg] && docById[arg].category === "regulation" ? "regulations" : "policies";
    if (head === "risk") tab = "risks";
    document.querySelectorAll(".tabs a").forEach((a) => {
      a.classList.toggle("active", a.dataset.tab === tab);
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const api = { docById, policyById: docById, href, docName, risk: RISK, filterByUseCase, categoryChip };
    if (head === "policy" || head === "regulation") viewDoc(arg);
    else if (head === "regulations") viewDocs("regulation");
    else if (head === "clauses") viewClauses();
    else if (head === "risks") arg ? window.RiskViews.taxonomy($app, arg, api) : window.RiskViews.overview($app, api);
    else if (head === "risk") window.RiskViews.hub($app, arg, api);
    else if (head === "schema") viewSchema();
    else if (head === "about") viewAbout();
    else if (head === "visualize") window.PolicyViz.render($app, DATA, api);
    else viewDocs("policy");
    if (head !== "policy" && head !== "regulation") window.scrollTo(0, 0);
  }

  // ---------- theme ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  document.getElementById("themeToggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* ignore */ }
  });

  const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  Promise.all([getJson("data/catalog.json"), getJson("data/risks.json")])
    .then(([d, risks]) => {
      DATA = d;
      d.documents.forEach((p) => { docById[p.policy_id] = p; });
      RISK = window.RiskViews.index(risks, d);
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((e) => { $app.innerHTML = `<p>Could not load the catalogue (${esc(e.message)}).</p>`; });
})();
