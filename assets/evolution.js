/* Policy page "Evolution" section: version timeline + change matrix + version details.
   Exposes window.PolicyEvolution.render(container, policy). Data: policy.versions (see data/SCHEMA.md). */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

  const ASPECTS = [
    ["scope", "Scope"], ["definitions", "Definitions"], ["risk_thresholds", "Risk thresholds"], ["obligations", "Obligations"],
    ["safeguards", "Safeguards"], ["governance", "Governance"], ["transparency", "Transparency"], ["enforcement", "Enforcement"],
    ["timeline", "Timeline"],
  ];
  const CHANGE = { added: { sym: "+", label: "added" }, revised: { sym: "~", label: "revised" }, removed: { sym: "−", label: "removed" } };
  const KIND = {
    draft: "Draft / proposal", release: "Release / adoption", amendment: "Amendment / point release", repeal: "Repeal / lapse",
  };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const toTime = (d) => {
    const [y, m, day] = String(d).split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, day || 1);
  };

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

  function marker(kind, g, x, y) {
    if (kind === "repeal") return el("rect", { x: x - 6, y: y - 6, width: 12, height: 12, rx: 2, class: "ev-node k-repeal" }, g);
    const r = kind === "amendment" ? 5.5 : 7.5;
    return el("circle", { cx: x, cy: y, r, class: "ev-node k-" + kind }, g);
  }

  function render(container, p) {
    const V = arr(p.versions);
    if (!V.length) { container.innerHTML = ""; return; }
    const cur = Math.max(0, V.findIndex((x) => x.current));
    if (V.length === 1) {
      container.innerHTML = `<h2>Evolution</h2><p class="muted">One version recorded: <strong>${esc(V[0].title || V[0].version)}</strong>
        (${esc(V[0].date || "date unknown")}). No earlier drafts or later amendments are catalogued for this policy.</p>`;
      return;
    }
    const first = V[0].date, last = V[V.length - 1].date;
    const nChanges = V.reduce((n, x) => n + arr(x.changes).length, 0);
    container.innerHTML = `
      <h2>Evolution</h2>
      <p class="muted ev-sum">${V.length} versions · ${esc(first)} → ${esc(last)} · ${nChanges} recorded changes ·
        current: <strong>${esc(V[cur].version)}</strong>. Select a version on the timeline or in the matrix.</p>
      <div class="viz-card">
        <div class="legend" aria-hidden="true">
          ${Object.entries(KIND).filter(([k]) => V.some((x) => x.kind === k)).map(([k, l]) =>
            `<span class="lg"><svg width="16" height="16">${k === "repeal" ? '<rect x="2" y="2" width="12" height="12" rx="2" class="ev-node k-repeal"/>'
              : `<circle cx="8" cy="8" r="${k === "amendment" ? 5 : 6.5}" class="ev-node k-${k}"/>`}</svg>${l}</span>`).join("")}
          <span class="lg"><svg width="18" height="18"><circle cx="9" cy="9" r="7.5" class="ev-ring"/></svg>Current version</span>
        </div>
        <div class="viz-scroll ev-tl"></div>
      </div>
      <div class="ev-grid">
        <div class="viz-card ev-matrix-card">
          <h3 class="ev-h">What changed, by aspect</h3>
          <div class="legend">${Object.values(CHANGE).map((c) => `<span class="lg"><span class="ev-sym ch-${c.label}">${c.sym}</span>${c.label}</span>`).join("")}</div>
          <div class="table-scroll ev-mx"></div>
        </div>
        <div class="viz-card ev-detail" aria-live="polite"></div>
      </div>`;

    const tlBox = container.querySelector(".ev-tl");
    const mxBox = container.querySelector(".ev-mx");
    const detail = container.querySelector(".ev-detail");
    let sel = cur;

    // ---------- matrix (HTML table: accessible and doubles as the table view) ----------
    const used = ASPECTS.filter(([k]) => V.some((x) => arr(x.changes).some((c) => c.aspect === k)));
    mxBox.innerHTML = `<table class="ev-table"><thead><tr><th scope="col">Aspect</th>${V.map((x, i) =>
      `<th scope="col" class="ev-col" data-i="${i}"><button type="button" data-i="${i}" title="${esc(x.title)} (${esc(x.date)})">${esc(x.version)}</button><span>${esc(String(x.date).slice(0, 7))}</span></th>`).join("")}</tr></thead>
      <tbody>${used.map(([k, label]) => `<tr><th scope="row">${esc(label)}</th>${V.map((x, i) => {
        const cs = arr(x.changes).filter((c) => c.aspect === k);
        if (!cs.length) return `<td class="ev-cell" data-i="${i}"></td>`;
        const types = [...new Set(cs.map((c) => c.change))];
        const cls = types.length === 1 ? "ch-" + types[0] : "ch-mixed";
        return `<td class="ev-cell ${cls}" data-i="${i}" data-a="${k}" tabindex="0" aria-label="${esc(label)}, ${esc(x.version)}: ${esc(types.join(" and "))}">${types.length === 1 ? CHANGE[types[0]].sym
          : types.map((t) => `<span class="ev-sym ch-${t}">${CHANGE[t].sym}</span>`).join("")}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;

    mxBox.addEventListener("click", (e) => { const t = e.target.closest("[data-i]"); if (t) select(+t.dataset.i); });
    mxBox.addEventListener("keydown", (e) => { const t = e.target.closest("td[data-i]"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+t.dataset.i); } });
    mxBox.addEventListener("mousemove", (e) => {
      const t = e.target.closest("td[data-a]");
      if (!t) return hideTip();
      const x = V[+t.dataset.i];
      const cs = arr(x.changes).filter((c) => c.aspect === t.dataset.a);
      showTip(`<strong>${esc(x.version)}</strong> · ${esc(ASPECTS.find(([k]) => k === t.dataset.a)[1])}<br>` +
        cs.map((c) => `${CHANGE[c.change].sym} ${esc(c.detail || c.change)}`).join("<br>"), e);
    });
    mxBox.addEventListener("mouseleave", hideTip);

    // ---------- timeline (SVG) ----------
    function drawTimeline() {
      const W = Math.max(340, tlBox.clientWidth || 640);
      const padL = 28, padR = 28, axisY = 0;
      const t0 = toTime(first), t1 = toTime(last);
      const span = Math.max(t1 - t0, 1);
      const sx = (d) => padL + ((toTime(d) - t0) / span) * (W - padL - padR);
      // label lanes: greedy placement above the axis so labels never collide
      const lanes = [];
      const place = V.map((x, i) => {
        const w = String(x.version).length * 7 + 14;
        const px = Math.min(Math.max(sx(x.date), w / 2 - 6), W - w / 2 + 6);
        let lane = 0;
        while (lanes[lane] != null && lanes[lane] > px - w / 2) lane++;
        lanes[lane] = px + w / 2;
        return { i, px, lane };
      });
      const nLanes = Math.max(1, lanes.length);
      const top = 14, laneH = 20, base = top + nLanes * laneH + 18;
      const H = base + 34;
      tlBox.innerHTML = "";
      const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": `Timeline of ${V.length} versions of ${p.short_name || p.policy_name}, ${first} to ${last}` }, tlBox);
      // year ticks
      const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
      const step = Math.max(1, Math.ceil((y1 - y0 + 1) / 12));
      for (let y = y0; y <= y1 + 1; y += step) {
        const t = Date.UTC(y, 0, 1);
        if (t < t0 - 1 || t > t1 + 1) continue;
        const x = padL + ((t - t0) / span) * (W - padL - padR);
        el("line", { x1: x, x2: x, y1: base - 6, y2: base + 6, class: "ev-tick" }, svg);
        el("text", { x, y: base + 22, "text-anchor": "middle", class: "ev-axis" }, svg).textContent = y;
      }
      el("line", { x1: padL - 4, x2: W - padR + 4, y1: base + axisY, y2: base + axisY, class: "ev-base" }, svg);
      // progression line between consecutive versions
      const pts = V.map((x) => sx(x.date));
      place.forEach(({ i, px, lane }) => {
        const x = V[i], nx = pts[i];
        const ly = top + (nLanes - 1 - lane) * laneH + 10;
        el("line", { x1: px, x2: nx, y1: ly + 4, y2: base - 9, class: "ev-stem" + (i === sel ? " sel" : "") }, svg);
        const t = el("text", { x: px, y: ly, "text-anchor": "middle", class: "ev-label" + (i === sel ? " sel" : "") + (i === cur ? " cur" : "") }, svg);
        t.textContent = x.version;
      });
      V.forEach((x, i) => {
        const g = el("g", { class: "ev-g" + (i === sel ? " sel" : ""), tabindex: 0, role: "button",
          "aria-label": `${x.version}, ${x.date}, ${KIND[x.kind] || x.kind}${x.current ? ", current" : ""}`, "data-i": i }, svg);
        if (i === cur) el("circle", { cx: pts[i], cy: base, r: 11.5, class: "ev-ring" }, g);
        marker(x.kind, g, pts[i], base);
        el("circle", { cx: pts[i], cy: base, r: 14, class: "ev-hit" }, g);
        g.addEventListener("click", () => select(i));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i); }
          if (e.key === "ArrowRight" && i < V.length - 1) { e.preventDefault(); select(i + 1, true); }
          if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); select(i - 1, true); }
        });
        g.addEventListener("mousemove", (e) => showTip(`<strong>${esc(x.title || x.version)}</strong><br><span class="muted">${esc(x.date)} · ${esc(KIND[x.kind] || x.kind)}</span><br>${arr(x.changes).length} change(s)`, e));
        g.addEventListener("mouseleave", hideTip);
      });
    }

    function drawDetail() {
      const x = V[sel];
      const prev = sel > 0 ? V[sel - 1] : null;
      const src = safeUrl(x.source);
      detail.innerHTML = `
        <div class="ev-dhead"><span class="chip ${x.kind === "repeal" ? "bad" : x.kind === "draft" ? "warn" : ""}">${esc(KIND[x.kind] || x.kind)}</span>
          ${x.current ? '<span class="chip ok">current</span>' : ""}<time class="mono">${esc(x.date)}</time></div>
        <h3 class="ev-title">${esc(x.title || x.version)}</h3>
        <p>${esc(x.summary || "")}</p>
        ${arr(x.changes).length ? `<p class="muted ev-vs">${prev ? `Changes vs. ${esc(prev.version)}:` : "Introduced:"}</p>
          <ul class="ev-changes">${arr(x.changes).map((c) => `<li><span class="ev-sym ch-${esc(c.change)}" title="${esc(c.change)}">${CHANGE[c.change] ? CHANGE[c.change].sym : ""}</span>
            <span><strong>${esc((ASPECTS.find(([k]) => k === c.aspect) || [0, c.aspect])[1])}</strong> — ${esc(c.detail || c.change)}</span></li>`).join("")}</ul>` : ""}
        ${x.note ? `<p class="note">${esc(x.note)}</p>` : ""}
        ${src ? `<p><a href="${esc(src)}" target="_blank" rel="noopener">Source for this version ↗</a></p>` : ""}
        <div class="ev-nav"><button class="btn" type="button" data-step="-1"${sel === 0 ? " disabled" : ""}>← Previous</button>
          <span class="muted">${sel + 1} / ${V.length}</span>
          <button class="btn" type="button" data-step="1"${sel === V.length - 1 ? " disabled" : ""}>Next →</button></div>`;
      detail.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => select(sel + +b.dataset.step)));
    }

    function select(i, focus) {
      sel = Math.max(0, Math.min(V.length - 1, i));
      hideTip();
      drawTimeline(); drawDetail();
      mxBox.querySelectorAll("[data-i]").forEach((n) => n.classList.toggle("sel", +n.dataset.i === sel));
      if (focus) { const g = tlBox.querySelector(`.ev-g[data-i="${sel}"]`); if (g) g.focus(); }
    }

    select(cur);
    if (window.ResizeObserver) {
      let w = tlBox.clientWidth;
      const ro = new ResizeObserver(() => {
        if (!tlBox.isConnected) return ro.disconnect();
        if (Math.abs(tlBox.clientWidth - w) > 4) { w = tlBox.clientWidth; drawTimeline(); }
      });
      ro.observe(tlBox);
    }
  }

  window.PolicyEvolution = { render };
})();
