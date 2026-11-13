/* Visualize tab: relationship network, use-case × region heatmap, effective-date timeline.
   Exposes window.PolicyViz.render(container, DATA, api). No external dependencies. */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  // ---- encodings ----
  const GROUPS = ["Europe", "North America", "East Asia", "South & Southeast Asia", "Latin America", "Global (multilateral & standards)", "Organisations & industry"];
  function groupOf(p) {
    const r = String((p.locale_context || {}).region || "").split(" › ")[0];
    if (r === "Global (corporate)" || r === "Global (industry)") return "Organisations & industry";
    if (r === "South Asia" || r === "Southeast Asia") return "South & Southeast Asia";
    if (r === "Global") return "Global (multilateral & standards)";
    return GROUPS.includes(r) ? r : "Global (multilateral & standards)";
  }
  // Legal force: 3 categorical slots (validated all-pairs in the reference palette).
  const FORCES = [
    { key: "binding", label: "Binding law / directive", cls: "f1" },
    { key: "soft", label: "Government soft law, standard or framework", cls: "f2" },
    { key: "self", label: "Corporate / industry self-regulation", cls: "f3" },
  ];
  function forceOf(p) {
    if (p.policy_type === "internal_policy" || p.jurisdiction === "Organization" || /industry/i.test(String((p.locale_context || {}).region)))
      return "self";
    if (p.binding === true || ["statute", "regulation", "bill", "executive_order"].includes(p.policy_type)) return "binding";
    return "soft";
  }
  const INACTIVE = new Set(["revoked", "lapsed", "superseded", "proposed", "draft"]);
  const REL_CLASS = {
    implements: "hier", specializes: "hier", amends: "hier", amended_by: "hier",
    supersedes: "succ", superseded_by: "succ",
    conflicts_with: "conf",
    overlaps_with: "peer", complements: "peer",
  };
  const REL_LABEL = { hier: "implements / specializes / amends", succ: "supersedes", conf: "conflicts with", peer: "overlaps / complements" };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---- tooltip ----
  let tip;
  function showTip(html, ev) {
    if (!tip) { tip = document.createElement("div"); tip.className = "viz-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
    tip.innerHTML = html; tip.style.display = "block";
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { if (tip) tip.style.display = "none"; };

  // ---- graph model ----
  function buildGraph(P) {
    const ids = new Set(P.map((p) => p.policy_id));
    const edges = new Map();
    const add = (a, b, rel) => {
      if (!ids.has(a) || !ids.has(b) || a === b) return;
      const k = a < b ? a + "|" + b : b + "|" + a;
      const cls = REL_CLASS[rel] || "peer";
      const e = edges.get(k) || { a: a < b ? a : b, b: a < b ? b : a, rels: new Set(), cls: "peer" };
      e.rels.add(rel);
      const rank = { conf: 3, succ: 2, hier: 1, peer: 0 };
      if (rank[cls] > rank[e.cls]) e.cls = cls;
      edges.set(k, e);
    };
    P.forEach((p) => {
      arr(p.related_policies).forEach((r) => r && add(p.policy_id, r.policy, r.relation));
      if (p.parent_policy) add(p.policy_id, p.parent_policy, "implements");
    });
    const deg = {}; P.forEach((p) => (deg[p.policy_id] = 0));
    edges.forEach((e) => { deg[e.a]++; deg[e.b]++; });
    return { edges: [...edges.values()], deg };
  }

  // Deterministic force layout with regional cluster anchors.
  function layout(P, G, W, H) {
    // Hand-placed cluster anchors (fractions of W/H), sized for cluster population.
    const POS = {
      "Europe": [0.13, 0.30], "North America": [0.42, 0.30], "East Asia": [0.73, 0.28],
      "South & Southeast Asia": [0.93, 0.62], "Latin America": [0.08, 0.80],
      "Global (multilateral & standards)": [0.36, 0.80], "Organisations & industry": [0.68, 0.80],
    };
    const anchors = {};
    GROUPS.forEach((g) => { anchors[g] = { x: W * POS[g][0], y: H * POS[g][1] }; });
    const nodes = P.map((p, i) => {
      const a = anchors[groupOf(p)];
      const ang = i * 2.399963; // golden angle spread
      return { id: p.policy_id, p, g: groupOf(p), x: a.x + Math.cos(ang) * 30, y: a.y + Math.sin(ang) * 30, vx: 0, vy: 0,
        r: 6 + Math.sqrt(G.deg[p.policy_id]) * 2.2 };
    });
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const links = G.edges.map((e) => ({ s: byId[e.a], t: byId[e.b], e }));
    for (let it = 0; it < 420; it++) {
      const alpha = 1 - it / 420;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2), min = a.r + b.r + 46;
        const f = (d < min ? (min - d) * 0.5 : 0) + (a.g === b.g ? 2600 : 600) / d2;
        dx /= d; dy /= d;
        a.vx -= dx * f * alpha; a.vy -= dy * f * alpha; b.vx += dx * f * alpha; b.vy += dy * f * alpha;
      }
      links.forEach(({ s, t }) => {
        const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const same = s.g === t.g, k = same ? 0.012 : 0.0003, L = same ? 80 : 300;
        const f = (d - L) * k * alpha;
        s.vx += dx / d * f; s.vy += dy / d * f; t.vx -= dx / d * f; t.vy -= dy / d * f;
      });
      nodes.forEach((n) => {
        const a = anchors[n.g];
        n.vx += (a.x - n.x) * 0.02 * alpha; n.vy += (a.y - n.y) * 0.02 * alpha;
        n.x += n.vx; n.y += n.vy; n.vx *= 0.55; n.vy *= 0.55;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
        n.y = Math.max(n.r + 22, Math.min(H - n.r - 14, n.y));
      });
    }
    return { nodes, links, anchors, byId };
  }

  // ---- views ----
  function render(root, DATA, api) {
    const P = DATA.policies;
    const G = buildGraph(P);
    const name = (p) => p.short_name || p.policy_name;
    const legendForce = FORCES.map((f) => `<span class="lg"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" class="node ${f.cls}"/></svg>${esc(f.label)}</span>`).join("") +
      `<span class="lg"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" class="node hollow f1"/></svg>Not in force (proposed, lapsed, revoked, superseded)</span>`;
    const legendRel = Object.entries(REL_LABEL).map(([k, v]) => `<span class="lg"><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" class="edge ${k}"/></svg>${esc(v)}</span>`).join("");

    root.innerHTML = `
      <h1>Visualize</h1>
      <p class="lede">How the catalogued policies relate to each other, which AI use cases each region regulates, and when they took effect.
        Relationships come from each record's <code>related_policies</code> and <code>parent_policy</code>; regions and use cases from <code>locale_context</code>.</p>

      <h2>Relationship network</h2>
      <div class="filters">
        <label class="muted" for="vfocus">Focus on</label>
        <select id="vfocus" aria-label="Focus on a policy"><option value="">All policies</option>
          ${P.slice().sort((a, b) => name(a).localeCompare(name(b))).map((p) => `<option value="${esc(p.policy_id)}">${esc(name(p))}</option>`).join("")}</select>
        <label class="chk"><input type="checkbox" id="vpeer" checked> show overlaps / complements</label>
        <span class="count">${P.length} policies · ${G.edges.length} links within the catalogue</span>
      </div>
      <div class="legend">${legendForce}</div>
      <div class="legend">${legendRel}</div>
      <div class="viz-card"><div class="viz-scroll"><svg id="net" role="img" aria-label="Network of policy relationships grouped by region"></svg></div></div>
      <div id="egoList"></div>

      <h2>Use cases by region</h2>
      <p class="muted">Number of policies in each region that target a use case. Click a cell to list those policies.</p>
      <div class="viz-card"><div class="viz-scroll" id="heat"></div></div>

      <h2>Timeline of effective dates</h2>
      <p class="muted">Each dot is one policy at its effective date (or, for proposals, its introduction date where recorded). Colour is legal force.</p>
      <div class="legend">${legendForce}</div>
      <div class="viz-card"><div class="viz-scroll"><svg id="tl" role="img" aria-label="Timeline of policy effective dates by region"></svg></div></div>
      <p class="muted" id="tlNote"></p>`;

    // ---------- network ----------
    const W = 1180, H = 820;
    const L = layout(P, G, W, H);
    const svg = root.querySelector("#net");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    // region captions
    const regionBoxes = [];
    GROUPS.forEach((g) => {
      if (!L.nodes.some((n) => n.g === g)) return;
      const xs = L.nodes.filter((n) => n.g === g);
      const minY = Math.min(...xs.map((n) => n.y - n.r));
      const cx = xs.reduce((s, n) => s + n.x, 0) / xs.length;
      const t = el("text", { x: cx, y: Math.max(14, minY - 26), class: "region-label", "text-anchor": "middle" }, svg);
      t.textContent = `${g} (${xs.length})`;
      regionBoxes.push({ x0: cx - t.textContent.length * 3.6, x1: cx + t.textContent.length * 3.6, y0: Math.max(14, minY - 26) - 13, y1: Math.max(14, minY - 26) + 4 });
    });
    const gEdges = el("g", {}, svg), gNodes = el("g", {}, svg), gLabels = el("g", {}, svg);
    const edgeEls = L.links.map((l) => ({ l, line: el("line", { x1: l.s.x, y1: l.s.y, x2: l.t.x, y2: l.t.y, class: "edge " + l.e.cls }, gEdges) }));
    const nodeEls = L.nodes.map((n) => {
      const f = FORCES.find((x) => x.key === forceOf(n.p));
      const c = el("circle", { cx: n.x, cy: n.y, r: n.r, class: `node ${f.cls}${INACTIVE.has(n.p.status) ? " hollow" : ""}`, tabindex: 0, role: "link",
        "aria-label": `${name(n.p)}, ${G.deg[n.id]} links` }, gNodes);
      const label = name(n.p).length > 26 ? name(n.p).slice(0, 25) + "…" : name(n.p);
      const t = el("text", { class: "node-label" }, gLabels);
      t.textContent = label;
      return { n, c, t, f, label };
    });
    // Greedy label placement: try below, above, right, left; avoid nodes and already-placed labels.
    const boxes = L.nodes.map((n) => ({ x0: n.x - n.r - 2, x1: n.x + n.r + 2, y0: n.y - n.r - 2, y1: n.y + n.r + 2 })).concat(regionBoxes);
    const hit = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    nodeEls.slice().sort((A, B) => B.n.r - A.n.r).forEach(({ n, t, label }) => {
      const w = label.length * 5.7, h = 12;
      const cands = [
        [n.x, n.y + n.r + 11, "middle"], [n.x, n.y - n.r - 5, "middle"],
        [n.x + n.r + 4, n.y + 4, "start"], [n.x - n.r - 4, n.y + 4, "end"],
        [n.x, n.y + n.r + 23, "middle"], [n.x, n.y - n.r - 17, "middle"],
      ];
      const boxOf = ([x, y, anc]) => {
        const x0 = anc === "middle" ? x - w / 2 : anc === "start" ? x : x - w;
        return { x0, x1: x0 + w, y0: y - h + 2, y1: y + 2 };
      };
      let pick = cands.find((c) => { const b = boxOf(c); return b.x0 >= 0 && b.x1 <= W && !hit(b); }) || cands[0];
      const b = boxOf(pick);
      if (b.x0 < 0) { pick = [2, pick[1], "start"]; } else if (b.x1 > W) { pick = [W - 2, pick[1], "end"]; }
      boxes.push(boxOf(pick));
      t.setAttribute("x", pick[0]); t.setAttribute("y", pick[1]); t.setAttribute("text-anchor", pick[2]);
    });
    const neighbours = (id) => {
      const s = new Set([id]);
      L.links.forEach(({ s: a, t: b, e }) => {
        if (!peerOn() && e.cls === "peer") return;
        if (a.id === id) s.add(b.id); if (b.id === id) s.add(a.id);
      });
      return s;
    };
    const peerOn = () => root.querySelector("#vpeer").checked;
    let focus = "";
    function paint(hoverId) {
      const active = hoverId || focus;
      const nb = active ? neighbours(active) : null;
      edgeEls.forEach(({ l, line }) => {
        const vis = peerOn() || l.e.cls !== "peer";
        const on = !active || l.s.id === active || l.t.id === active;
        line.style.display = vis ? "" : "none";
        line.classList.toggle("dim", !!active && !on);
        line.classList.toggle("hi", !!active && on);
      });
      nodeEls.forEach(({ n, c, t }) => {
        const on = !nb || nb.has(n.id);
        c.classList.toggle("dim", !on); t.classList.toggle("dim", !on);
        c.classList.toggle("sel", n.id === active);
      });
    }
    nodeEls.forEach(({ n, c, f }) => {
      const p = n.p;
      const html = () => `<strong>${esc(name(p))}</strong><br><span class="muted">${esc((p.locale_context || {}).region || "")}</span><br>
        ${esc(f.label)} · ${esc(p.status)}<br>${G.deg[n.id]} link${G.deg[n.id] === 1 ? "" : "s"} in catalogue · effective ${esc(p.effective_date || "—")}
        <br><span class="muted">Click to open</span>`;
      c.addEventListener("mouseenter", (ev) => { paint(n.id); showTip(html(), ev); });
      c.addEventListener("mousemove", (ev) => showTip(html(), ev));
      c.addEventListener("mouseleave", () => { paint(); hideTip(); });
      c.addEventListener("focus", () => paint(n.id));
      c.addEventListener("blur", () => paint());
      c.addEventListener("click", () => { hideTip(); location.hash = "#/policy/" + encodeURIComponent(n.id); });
      c.addEventListener("keydown", (e) => { if (e.key === "Enter") location.hash = "#/policy/" + encodeURIComponent(n.id); });
    });
    edgeEls.forEach(({ l, line }) => {
      const html = () => `<strong>${esc(name(l.s.p))}</strong> ↔ <strong>${esc(name(l.t.p))}</strong><br>${[...l.e.rels].map((r) => esc(r.replace(/_/g, " "))).join(", ")}`;
      line.addEventListener("mouseenter", (ev) => showTip(html(), ev));
      line.addEventListener("mousemove", (ev) => showTip(html(), ev));
      line.addEventListener("mouseleave", hideTip);
    });
    function egoList() {
      const box = root.querySelector("#egoList");
      if (!focus) { box.innerHTML = ""; return; }
      const p = api.policyById[focus];
      const rows = L.links.filter(({ s, t }) => s.id === focus || t.id === focus).map(({ s, t, e }) => {
        const o = s.id === focus ? t : s;
        return `<tr><td><a href="#/policy/${encodeURIComponent(o.id)}">${esc(name(o.p))}</a></td><td>${[...e.rels].map((r) => `<span class="chip mono">${esc(r)}</span>`).join("")}</td><td>${esc(o.g)}</td><td>${esc(o.p.status)}</td></tr>`;
      });
      const outside = arr(p.related_policies).filter((r) => r && !r.in_catalogue);
      box.innerHTML = `<h3>Policies related to <a href="#/policy/${encodeURIComponent(focus)}">${esc(name(p))}</a> (${rows.length} in catalogue)</h3>
        <div class="table-scroll"><table><thead><tr><th>Policy</th><th>Relation</th><th>Region</th><th>Status</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="4" class="muted">No links within the catalogue.</td></tr>'}</tbody></table></div>
        ${outside.length ? `<p class="muted">Also related, not catalogued: ${outside.map((r) => `${esc(r.policy)} (${esc(String(r.relation).replace(/_/g, " "))})`).join("; ")}</p>` : ""}`;
    }
    root.querySelector("#vfocus").addEventListener("input", (e) => { focus = e.target.value; paint(); egoList(); });
    root.querySelector("#vpeer").addEventListener("input", () => paint());
    paint();

    // ---------- heatmap ----------
    const groupsUsed = GROUPS.filter((g) => P.some((p) => groupOf(p) === g));
    const uses = {};
    P.forEach((p) => arr((p.locale_context || {}).use_cases).forEach((u) => {
      uses[u] = uses[u] || {}; const g = groupOf(p); (uses[u][g] = uses[u][g] || []).push(p);
    }));
    const useRows = Object.keys(uses).map((u) => ({ u, total: new Set(Object.values(uses[u]).flat()).size }))
      .sort((a, b) => b.total - a.total || a.u.localeCompare(b.u));
    const max = Math.max(...useRows.flatMap((r) => groupsUsed.map((g) => (uses[r.u][g] || []).length)));
    const step = (n) => (n === 0 ? 0 : Math.min(6, Math.ceil((n / max) * 6)));
    const heat = root.querySelector("#heat");
    heat.innerHTML = `<table class="heat"><thead><tr><th>Use case</th>${groupsUsed.map((g) => `<th class="hc">${esc(g)}</th>`).join("")}<th class="hc">All</th></tr></thead><tbody>
      ${useRows.map((r) => `<tr><th scope="row">${esc(r.u)}</th>${groupsUsed.map((g) => {
        const ps = uses[r.u][g] || [];
        return `<td class="cell s${step(ps.length)}" data-u="${esc(r.u)}" data-g="${esc(g)}" ${ps.length ? 'tabindex="0"' : ""}>${ps.length || ""}</td>`;
      }).join("")}<td class="cell total">${r.total}</td></tr>`).join("")}
      </tbody></table>`;
    heat.querySelectorAll("td.cell[data-u]").forEach((td) => {
      const ps = uses[td.dataset.u][td.dataset.g] || [];
      if (!ps.length) return;
      const html = `<strong>${esc(td.dataset.u)}</strong> · ${esc(td.dataset.g)}<br>${ps.map((p) => "• " + esc(name(p))).join("<br>")}`;
      td.addEventListener("mouseenter", (ev) => showTip(html, ev));
      td.addEventListener("mousemove", (ev) => showTip(html, ev));
      td.addEventListener("mouseleave", hideTip);
      const go = () => { hideTip(); api.filterByUseCase(td.dataset.u); };
      td.addEventListener("click", go);
      td.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });

    // ---------- timeline ----------
    const parseD = (s) => { if (!s) return null; const [y, m, d] = String(s).split("-").map(Number); return y + ((m || 7) - 1) / 12 + ((d || 15) - 1) / 365; };
    const dated = P.map((p) => ({ p, t: parseD(p.effective_date) })).filter((d) => d.t);
    const undated = P.filter((p) => !p.effective_date);
    const y0 = Math.floor(Math.min(...dated.map((d) => d.t))), y1 = Math.ceil(Math.max(...dated.map((d) => d.t)) + 0.01);
    const TW = 1180, left = 220, right = 24, rowH = 54, top = 16;
    const TH = top + groupsUsed.length * rowH + 30;
    const x = (t) => left + (t - y0) / (y1 - y0) * (TW - left - right);
    const tl = root.querySelector("#tl");
    tl.setAttribute("viewBox", `0 0 ${TW} ${TH}`); tl.setAttribute("width", TW); tl.setAttribute("height", TH);
    for (let y = y0; y <= y1; y++) {
      el("line", { x1: x(y), x2: x(y), y1: top, y2: TH - 26, class: "grid" }, tl);
      const t = el("text", { x: x(y), y: TH - 8, class: "axis", "text-anchor": "middle" }, tl); t.textContent = y;
    }
    groupsUsed.forEach((g, i) => {
      const cy = top + i * rowH + rowH / 2;
      el("line", { x1: left, x2: TW - right, y1: cy, y2: cy, class: "lane" }, tl);
      const t = el("text", { x: left - 12, y: cy + 4, class: "lane-label", "text-anchor": "end" }, tl); t.textContent = g;
      const pts = dated.filter((d) => groupOf(d.p) === g).sort((a, b) => a.t - b.t);
      const placed = [];
      pts.forEach((d) => {
        const px = x(d.t);
        let lane = 0; // dodge overlapping dots vertically
        while (placed.some((q) => q.lane === lane && Math.abs(q.x - px) < 13)) lane++;
        placed.push({ x: px, lane });
        const off = [0, -11, 11, -22, 22][lane % 5];
        const f = FORCES.find((x) => x.key === forceOf(d.p));
        const c = el("circle", { cx: px, cy: cy + off, r: 5.5, class: `node ${f.cls}${INACTIVE.has(d.p.status) ? " hollow" : ""}`, tabindex: 0 }, tl);
        const html = `<strong>${esc(name(d.p))}</strong><br>${esc(d.p.effective_date)} · ${esc(d.p.status)}<br>${esc(f.label)}<br><span class="muted">Click to open</span>`;
        c.addEventListener("mouseenter", (ev) => showTip(html, ev));
        c.addEventListener("mousemove", (ev) => showTip(html, ev));
        c.addEventListener("mouseleave", hideTip);
        c.addEventListener("click", () => { hideTip(); location.hash = "#/policy/" + encodeURIComponent(d.p.policy_id); });
      });
    });
    root.querySelector("#tlNote").textContent = undated.length
      ? `Not shown (no effective date recorded): ${undated.map(name).join(", ")}.` : "";
  }

  window.PolicyViz = { render };
})();
