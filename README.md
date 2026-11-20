# AI Policy Catalogue (AIPolicyBench)

A static site, served by GitHub Pages, that catalogues widely cited AI **policies**, the **regulations** they sit alongside,
and the **risk taxonomies** both address. The three are kept apart, each with its own tab, and linked through a shared risk hub.

- **Policies** (focus): frameworks, standards, guidance, voluntary codes and organisational policies.
- **Regulations**: binding legal instruments: statutes, regulations, executive orders, treaties, and bills.
  Both use the same **policy → clause** schema and are cross-linked through their relationships.
- **Risks**: eight taxonomies (MIT AI Risk Repository, IBM AI Risk Atlas, NIST AI 600-1, NIST AI RMF trustworthiness
  characteristics, OWASP LLM Top 10 2025, AIR 2024, DeepMind 2021, EU AI Act risk tiers). Each is cross-walked to the
  MIT AI Risk Repository subdomains (the hub), and policy/regulation clauses are mapped to the same hub in a separate
  mapping layer, so every risk page lists the taxonomies, policies and regulations that address it.

- **Policy level:** identity, locale/scope, lifecycle, applicability, policy meaning, relationships, record provenance.
- **Locale context:** five locale factors per policy: Language, Region, Regulation (legal force and approach),
  Culture (governance context; an interpretive field) and Use Case. They are filterable on the site.
- **Clause level:** a representative set of clauses, each normalised into
  ⟨actor, action, object, modality, condition, exception, purpose⟩, plus ambiguity and interpretation confidence.

The *Visualize* tab starts with a policies ↔ risk subdomains ↔ regulations diagram, then shows how documents relate (network grouped by region, coloured by legal force),
which use cases each region covers (heatmap) and when policies took effect (timeline).

Each policy page has an *Evolution* section built from the record's `versions` list: a timeline of
drafts, releases, amendments and repeals, and a matrix of what changed in each version (scope, thresholds,
obligations, governance, transparency…). Select a version to see its summary and changes.

The full field list is in [`data/SCHEMA.md`](data/SCHEMA.md) and on the site's *Schema* tab.

## Layout

```
index.html, assets/        single-page app (no build step, no dependencies)
assets/app.js              Policies, Regulations, Clauses, Schema, About views
assets/risks.js            Risks tab: taxonomy list, crosswalk matrix, taxonomy trees, per-risk hub pages
assets/viz.js              Visualize tab: policy-risk-regulation bridge, relationship network, heatmap, timeline
assets/evolution.js        Evolution section on each policy/regulation page
data/policies/<id>.json    one record per policy (source of truth)
data/regulations/<id>.json one record per regulation (same schema)
data/risks/<id>.json       one record per risk taxonomy
data/mappings/             risk crosswalks and the clause -> risk mapping layer
data/catalog.json          generated bundle of policies + regulations
data/risks.json            generated bundle of taxonomies + mappings
scripts/build.py           validates everything and regenerates the two bundles
scripts/import_risk_taxonomies.py  re-imports IBM/MIT/NIST/OWASP/AIR taxonomies from IBM's AI Atlas Nexus
```

## Editing

```bash
python3 scripts/build.py          # validate + rebuild data/catalog.json and data/risks.json
python3 -m http.server 8000       # preview at http://localhost:8000
```

## Caveats

Records were compiled from official sources with AI assistance and are **not yet human-verified**
(`human_verified: false`). Clause text is verbatim unless marked as a paraphrase (`text_is_verbatim: false`),
for example for paywalled ISO standards. Statuses reflect the compile date in each record.

Risk taxonomies from IBM, MIT, NIST AI 600-1, OWASP and AIR 2024, and the IBM ↔ MIT/NIST/OWASP crosswalks, come from
[AI Atlas Nexus](https://github.com/IBM/ai-atlas-nexus) (Apache-2.0). The other taxonomies, the remaining crosswalks to
the MIT hub and all clause → risk mappings were written by the compiler and are interpretive.
