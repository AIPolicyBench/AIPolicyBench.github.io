/* AI Policy Catalogue — static single-page app. Data: data/catalog.json (built by scripts/build.py). */
(function () {
  "use strict";

  // ---------- schema (from "Policy Risk Mapping Factors") ----------
  const POLICY_GROUPS = [
    ["Identity", [
      ["policy_id", "Unique identifier", "EU_AI_Act_2024"],
      ["policy_name", "Human-readable name", "EU Artificial Intelligence Act"],
      ["policy_type", "Distinguishes legal vs organisational rules", "regulation / standard / internal_policy"],
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
    ["Lifecycle", [
      ["status", "The policy may not yet be authoritative", "draft / provisional / enforceable / superseded / incomplete"],
      ["binding", "Legally binding or voluntary", "true"],
      ["effective_date", "When it applies", "2024-08-01"],
      ["key_dates", "Phased application milestones", "2026-08-02: high-risk obligations"],
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
  const policyById = {};
  let DATA = null;

  function val(v, key) {
    if (isEmpty(v)) return nul;
    if (typeof v === "boolean") return v ? "true" : "false";
    if (key === "source_uri") return link(v);
    if (key === "policy_domain" || key === "industry_scope" || key === "language" || key === "official_languages")
      return arr(v).map((x) => chip(words(x))).join("");
    if (key === "status") return statusChip(v);
    if (key === "policy_type") return esc(TYPE_LABEL[v] || v);
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
  function policyRef(id) {
    if (isEmpty(id)) return nul;
    const p = policyById[id];
    return p ? `<a href="#/policy/${encodeURIComponent(id)}">${esc(p.short_name || p.policy_name)}</a>` : esc(id);
  }
  const yearOf = (d) => (d ? String(d).slice(0, 4) : "");

  // ---------- state ----------
  const pf = { q: "", jur: "", type: "", status: "", domain: "", binding: "", sort: "effective_date", dir: -1 };
  const cf = { q: "", modality: "", domain: "", ambiguity: "", policy: "", verbatim: "" };

  // ---------- views ----------
  function viewPolicies() {
    const P = DATA.policies;
    const opts = (vals, cur, label) => `<option value="">${label}</option>` +
      [...new Set(vals)].filter(Boolean).sort().map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(TYPE_LABEL[v] || words(v))}</option>`).join("");
    const jurs = P.map((p) => p.jurisdiction);
    const domains = P.flatMap((p) => arr(p.policy_domain));
    const nBinding = P.filter((p) => p.binding === true).length;
    const juris = new Set(jurs).size;
    const langs = new Set(P.flatMap((p) => arr(p.official_languages).concat(arr(p.language)))).size;

    $app.innerHTML = `
      <h1>AI policies, described attribute by attribute</h1>
      <p class="lede">Widely cited AI laws, executive actions, standards, frameworks and organisational policies. Each record follows the
      policy → clause schema in <a href="#/schema">Schema</a>: identity, locale/scope, lifecycle, applicability, meaning and relationships,
      plus representative clauses decomposed into ⟨actor, action, object, modality, condition, exception, purpose⟩.</p>
      <div class="stats">
        <div class="stat"><b>${P.length}</b><span>policies</span></div>
        <div class="stat"><b>${DATA.clause_count}</b><span>structured clauses</span></div>
        <div class="stat"><b>${juris}</b><span>jurisdictions</span></div>
        <div class="stat"><b>${nBinding}</b><span>legally binding</span></div>
        <div class="stat"><b>${langs}</b><span>languages recorded</span></div>
        <div class="stat"><b>${P.flatMap((p) => arr(p.clauses)).filter((c) => c.text_is_verbatim === true).length}</b><span>clauses with verbatim text</span></div>
      </div>
      <div class="filters">
        <input type="search" id="q" placeholder="Search name, authority, principle, entity…" value="${esc(pf.q)}" aria-label="Search policies">
        <select id="jur" aria-label="Jurisdiction">${opts(jurs, pf.jur, "All jurisdictions")}</select>
        <select id="type" aria-label="Policy type">${opts(P.map((p) => p.policy_type), pf.type, "All types")}</select>
        <select id="status" aria-label="Status">${opts(P.map((p) => p.status), pf.status, "All statuses")}</select>
        <select id="domain" aria-label="Domain">${opts(domains, pf.domain, "All domains")}</select>
        <select id="binding" aria-label="Binding"><option value="">Binding + voluntary</option>
          <option value="true"${pf.binding === "true" ? " selected" : ""}>Binding only</option>
          <option value="false"${pf.binding === "false" ? " selected" : ""}>Non-binding only</option></select>
        <button class="btn" id="csv" type="button">Download CSV</button>
        <a class="btn" href="data/catalog.json" download>JSON</a>
      </div>
      <div class="filters"><span class="count" id="count"></span></div>
      <div class="table-scroll"><table>
        <thead><tr>
          <th class="sortable" data-sort="policy_name">Policy</th>
          <th class="sortable" data-sort="policy_type">Type</th>
          <th class="sortable" data-sort="jurisdiction">Jurisdiction</th>
          <th class="sortable" data-sort="status">Status</th>
          <th class="sortable" data-sort="effective_date">Effective</th>
          <th class="hide-sm">Domain</th>
          <th class="hide-sm">Lang.</th>
          <th class="sortable hide-sm" data-sort="clauses">Clauses</th>
        </tr></thead><tbody id="rows"></tbody></table></div>`;

    const draw = () => {
      const q = pf.q.trim().toLowerCase();
      let rows = P.filter((p) =>
        (!pf.jur || p.jurisdiction === pf.jur) && (!pf.type || p.policy_type === pf.type) &&
        (!pf.status || p.status === pf.status) && (!pf.domain || arr(p.policy_domain).includes(pf.domain)) &&
        (!pf.binding || String(p.binding) === pf.binding) &&
        (!q || JSON.stringify([p.policy_id, p.policy_name, p.short_name, p.issuing_authority, p.country_region, p.regulatory_regime,
          p.objective, p.principles, p.covered_entities, p.covered_systems]).toLowerCase().includes(q)));
      const key = pf.sort;
      rows.sort((a, b) => {
        const av = key === "clauses" ? arr(a.clauses).length : String(a[key] ?? "");
        const bv = key === "clauses" ? arr(b.clauses).length : String(b[key] ?? "");
        return (av > bv ? 1 : av < bv ? -1 : 0) * pf.dir;
      });
      document.getElementById("count").textContent = `${rows.length} of ${P.length} policies`;
      document.getElementById("rows").innerHTML = rows.map((p) => `
        <tr class="row-link" data-id="${esc(p.policy_id)}">
          <td class="name"><a href="#/policy/${encodeURIComponent(p.policy_id)}">${esc(p.short_name || p.policy_name)}</a>
            <span class="sub">${esc(p.issuing_authority || "")}</span></td>
          <td>${esc(TYPE_LABEL[p.policy_type] || p.policy_type || "")}</td>
          <td>${esc(p.jurisdiction || "")}</td>
          <td>${statusChip(p.status)}</td>
          <td class="mono date">${esc(p.effective_date || "—")}</td>
          <td class="hide-sm">${arr(p.policy_domain).slice(0, 3).map((d) => chip(words(d))).join("")}</td>
          <td class="hide-sm mono">${esc(arr(p.official_languages).length > 4 ? arr(p.official_languages).length + " langs" : arr(p.official_languages).join(", "))}</td>
          <td class="hide-sm mono">${arr(p.clauses).length}</td>
        </tr>`).join("") || `<tr><td colspan="8" class="muted">No policies match these filters.</td></tr>`;
      document.querySelectorAll("th.sortable").forEach((th) => {
        th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (th.dataset.sort === pf.sort ? (pf.dir > 0 ? " ▲" : " ▼") : "");
      });
      lastRows = rows;
    };
    let lastRows = P;
    const bind = (id, k) => document.getElementById(id).addEventListener("input", (e) => { pf[k] = e.target.value; draw(); });
    bind("q", "q"); bind("jur", "jur"); bind("type", "type"); bind("status", "status"); bind("domain", "domain"); bind("binding", "binding");
    document.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
      if (pf.sort === th.dataset.sort) pf.dir *= -1; else { pf.sort = th.dataset.sort; pf.dir = 1; }
      draw();
    }));
    document.getElementById("rows").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr && !e.target.closest("a")) location.hash = "#/policy/" + encodeURIComponent(tr.dataset.id);
    });
    document.getElementById("csv").addEventListener("click", () => downloadCsv(lastRows));
    draw();
  }

  function viewPolicy(id) {
    const p = policyById[id];
    if (!p) { $app.innerHTML = `<a class="back" href="#/">← All policies</a><h1>Not found</h1><p>No policy with id <code>${esc(id)}</code>.</p>`; return; }
    const group = (title, keys) => `<section class="group"><h3>${esc(title)}</h3><dl class="attrs">` +
      keys.map((k) => `<dt>${esc(k)}</dt><dd>${val(p[k], k)}</dd>`).join("") + "</dl></section>";
    const prov = p.record_provenance || {};
    const incoming = DATA.policies.filter((o) => o.policy_id !== p.policy_id &&
      (arr(o.related_policies).some((r) => (r && r.policy) === p.policy_id) || o.parent_policy === p.policy_id));
    $app.innerHTML = `
      <a class="back" href="#/">← All policies</a>
      <h1>${esc(p.policy_name)}</h1>
      <div class="detail-head">${statusChip(p.status)}${chip(TYPE_LABEL[p.policy_type] || p.policy_type || "")}
        ${chip(p.jurisdiction || "")}${p.binding ? chip("binding", "ok") : chip("non-binding")}
        ${chip(p.policy_id, "mono")}</div>
      <p class="objective">${esc(p.objective || "")}</p>
      ${prov.notes ? `<p class="note"><strong>Compiler's notes:</strong> ${esc(prov.notes)}</p>` : ""}
      <h2>Policy attributes</h2>
      <div class="groups">
        ${group("Identity", ["policy_id", "policy_name", "short_name", "policy_type", "source_uri", "issuing_authority"])}
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
    window.scrollTo(0, 0);
  }

  function clauseCard(c, showPolicy) {
    const t = (k, label) => `<dt>${esc(label || k)}</dt><dd>${isEmpty(c[k]) ? nul : esc(Array.isArray(c[k]) ? c[k].join(", ") : c[k])}</dd>`;
    const conf = typeof c.interpretation_confidence === "number" ? c.interpretation_confidence : null;
    const p = policyById[c.policy_id];
    return `<article class="clause" id="${esc(c.clause_id)}">
      <div class="clause-head">
        ${showPolicy && p ? `<a href="#/policy/${encodeURIComponent(p.policy_id)}"><strong>${esc(p.short_name || p.policy_name)}</strong></a> ·` : ""}
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
          <dl class="tuple">${t("requirement")}${t("purpose")}${t("interpretation_notes", "notes")}${t("applicable_regions", "regions")}${t("applicable_systems", "systems")}</dl>
        </div>
        <dl class="tuple">${t("actor")}${t("action")}${t("object")}${t("recipient")}${t("modality")}${t("condition")}${t("exception")}${t("affected_asset")}${t("language")}</dl>
      </div>
    </article>`;
  }

  function viewClauses() {
    const all = DATA.policies.flatMap((p) => arr(p.clauses));
    const opts = (vals, cur, label, fmt) => `<option value="">${label}</option>` +
      [...new Set(vals)].filter(Boolean).sort().map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(fmt ? fmt(v) : words(v))}</option>`).join("");
    $app.innerHTML = `
      <h1>Clause explorer</h1>
      <p class="lede">Every clause is normalised into ⟨Actor, Action, Object, Modality, Condition, Exception, Purpose⟩, the representation intended
      to feed clause → risk → control mapping.</p>
      <div class="filters">
        <input type="search" id="cq" placeholder="Search clause text, actor, object…" value="${esc(cf.q)}" aria-label="Search clauses">
        <select id="cmod" aria-label="Modality">${opts(all.map((c) => c.modality), cf.modality, "All modalities", (v) => v)}</select>
        <select id="cdom" aria-label="Domain">${opts(all.map((c) => c.policy_domain), cf.domain, "All domains")}</select>
        <select id="camb" aria-label="Ambiguity">${opts(all.map((c) => c.ambiguity), cf.ambiguity, "Any ambiguity")}</select>
        <select id="cpol" aria-label="Policy">${opts(DATA.policies.map((p) => p.policy_id), cf.policy, "All policies", (v) => policyById[v].short_name || v)}</select>
        <select id="cverb" aria-label="Text"><option value="">Verbatim + paraphrase</option>
          <option value="true"${cf.verbatim === "true" ? " selected" : ""}>Verbatim only</option>
          <option value="false"${cf.verbatim === "false" ? " selected" : ""}>Paraphrase only</option></select>
        <span class="count" id="ccount"></span>
      </div>
      <div id="clist"></div>`;
    const draw = () => {
      const q = cf.q.trim().toLowerCase();
      const rows = all.filter((c) => (!cf.modality || c.modality === cf.modality) && (!cf.domain || c.policy_domain === cf.domain) &&
        (!cf.ambiguity || c.ambiguity === cf.ambiguity) && (!cf.policy || c.policy_id === cf.policy) &&
        (!cf.verbatim || String(c.text_is_verbatim) === cf.verbatim) &&
        (!q || JSON.stringify(c).toLowerCase().includes(q)));
      document.getElementById("ccount").textContent = `${rows.length} of ${all.length} clauses`;
      document.getElementById("clist").innerHTML = rows.map((c) => clauseCard(c, true)).join("") || '<p class="muted">No clauses match.</p>';
    };
    [["cq", "q"], ["cmod", "modality"], ["cdom", "domain"], ["camb", "ambiguity"], ["cpol", "policy"], ["cverb", "verbatim"]]
      .forEach(([id, k]) => document.getElementById(id).addEventListener("input", (e) => { cf[k] = e.target.value; draw(); }));
    draw();
  }

  function viewSchema() {
    $app.innerHTML = `
      <h1>Schema</h1>
      <p class="lede">Two levels: <strong>policy document → policy clauses</strong>. The policy record captures what a policy means and where it applies;
      risks are deliberately kept out of it and belong to a separate mapping layer, because the same clause can imply different risks for different AI systems.</p>
      <div class="pipeline"><span>CLAUSE</span><em>→</em><span>APPLICABILITY</span><em>→</em><span>USE CASE</span><em>→</em><span>RISK</span><em>→</em><span>CONTROL</span><em>→</em><span>EVIDENCE</span></div>
      <h2>Policy-level attributes</h2>
      <div class="table-scroll"><table class="schema-group"><thead><tr><th>Group</th><th>Attribute</th><th>Why</th><th>Example</th></tr></thead><tbody>
      ${POLICY_GROUPS.map(([g, rows]) => rows.map(([k, why, ex], i) => `<tr><td>${i ? "" : `<strong>${esc(g)}</strong>`}</td><td><code>${esc(k)}</code></td><td>${esc(why)}</td><td class="muted">${esc(ex)}</td></tr>`).join("")).join("")}
      </tbody></table></div>
      <h2>Clause-level attributes</h2>
      <p class="muted">Clause = ⟨Actor, Action, Object, Modality, Condition, Exception, Purpose⟩</p>
      <div class="table-scroll"><table><thead><tr><th>Attribute</th><th>Example</th></tr></thead><tbody>
      ${CLAUSE_ATTRS.map(([k, ex]) => `<tr><td><code>${esc(k)}</code></td><td class="muted">${esc(ex)}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>Controlled vocabularies</h2>
      <dl class="tuple" style="max-width:820px;grid-template-columns:150px 1fr">
        <dt>status</dt><dd>draft · provisional · proposed · enforceable · voluntary · superseded · revoked · lapsed · incomplete</dd>
        <dt>policy_type</dt><dd>${Object.keys(TYPE_LABEL).join(" · ")}</dd>
        <dt>modality</dt><dd>MUST · MUST NOT · SHOULD · SHOULD NOT · MAY</dd>
        <dt>relation</dt><dd>overlaps_with · supersedes · superseded_by · specializes · implements · complements · amends · amended_by · conflicts_with</dd>
        <dt>ambiguity</dt><dd>low · medium · high</dd>
      </dl>`;
  }

  function viewAbout() {
    $app.innerHTML = `
      <h1>About this catalogue</h1>
      <p class="lede">A research catalogue supporting cross-lingual policy assurance: does equivalent policy intent, in different languages,
      yield equivalent risks, evidence and controls? Records follow the policy → clause schema so that clauses can later be mapped to risks given a use case.</p>
      <h2>How records were compiled</h2>
      <ul>
        <li>Each record was compiled on ${esc(DATA.generated)} or shortly before, from the official source linked in <code>source_uri</code>; other sources consulted are listed per record.</li>
        <li>Clause text marked <span class="chip">verbatim</span> was copied from the official text. Where the official wording was not accessible (for example paywalled ISO standards),
          the clause is a faithful <span class="chip warn">paraphrase</span> and is labelled as such.</li>
        <li>Non-English clauses keep the original-language text, with an English translation in <code>translated_text</code>.</li>
        <li>Structured fields (actor, action, object…) and <code>interpretation_confidence</code> are interpretations. <strong>No record has been human-verified yet</strong>
          (<code>human_verified: false</code>).</li>
        <li>Clauses are representative, not exhaustive: 3–6 high-importance obligations per policy.</li>
      </ul>
      <h2>Contributing</h2>
      <p>One JSON file per policy lives in <code>data/policies/</code>. Run <code>python3 scripts/build.py</code> to validate and rebuild
      <code>data/catalog.json</code>. See <code>data/SCHEMA.md</code>.</p>`;
  }

  // ---------- CSV ----------
  function downloadCsv(rows) {
    const cols = ["policy_id", "policy_name", "short_name", "policy_type", "source_uri", "issuing_authority", "jurisdiction", "country_region",
      "language", "official_languages", "regulatory_regime", "geo_constraints", "industry_scope", "status", "binding", "effective_date",
      "expiration_date", "version", "last_updated", "covered_entities", "covered_systems", "covered_activities", "exceptions", "conditions",
      "objective", "policy_domain", "principles", "parent_policy", "related_policies", "conflict_rule"];
    const cell = (v) => {
      if (v == null) return "";
      if (Array.isArray(v)) v = v.map((x) => (x && typeof x === "object" ? `${x.relation || ""}:${x.policy || ""}` : x)).join("; ");
      else if (typeof v === "object") v = JSON.stringify(v);
      v = String(v);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const csv = [cols.join(",")].concat(rows.map((p) => cols.map((c) => cell(p[c])).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "ai-policies.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [head, ...rest] = h.split("/");
    const tab = head === "policy" || head === "" ? "policies" : head;
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    if (head === "policy") viewPolicy(decodeURIComponent(rest.join("/")));
    else if (head === "clauses") viewClauses();
    else if (head === "schema") viewSchema();
    else if (head === "about") viewAbout();
    else viewPolicies();
  }

  // ---------- theme ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) { /* storage unavailable */ }
  document.getElementById("themeToggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* ignore */ }
  });

  fetch("data/catalog.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      DATA = d;
      d.policies.forEach((p) => { policyById[p.policy_id] = p; });
      window.addEventListener("hashchange", route);
      route();
    })
    .catch((e) => { $app.innerHTML = `<p>Could not load <code>data/catalog.json</code> (${esc(e.message)}).</p>`; });
})();
