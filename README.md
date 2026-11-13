# AI Policy Catalogue (AIPolicyBench)

A static site, served by GitHub Pages, that catalogues widely cited AI policies: laws, executive actions, standards,
frameworks and organisational policies. Every policy is described with the same **policy → clause** schema
so it can later be mapped clause → risk → control.

- **Policy level:** identity, locale/scope, lifecycle, applicability, policy meaning, relationships, record provenance.
- **Locale context:** five locale factors per policy: Language, Region, Regulation (legal force and approach),
  Culture (governance context; an interpretive field) and Use Case. They are filterable on the site.
- **Clause level:** a representative set of clauses, each normalised into
  ⟨actor, action, object, modality, condition, exception, purpose⟩, plus ambiguity and interpretation confidence.

The *Visualize* tab shows how policies relate (network grouped by region, coloured by legal force),
which use cases each region covers (heatmap) and when policies took effect (timeline).

The full field list is in [`data/SCHEMA.md`](data/SCHEMA.md) and on the site's *Schema* tab.

## Layout

```
index.html, assets/        single-page app (no build step, no dependencies)
assets/viz.js              Visualize tab: relationship network, use case × region heatmap, timeline
data/policies/<id>.json    one record per policy (source of truth)
data/catalog.json          generated bundle the site loads
scripts/build.py           validates records and regenerates catalog.json
```

## Editing

```bash
python3 scripts/build.py          # validate + rebuild data/catalog.json
python3 -m http.server 8000       # preview at http://localhost:8000
```

## Caveats

Records were compiled from official sources with AI assistance and are **not yet human-verified**
(`human_verified: false`). Clause text is verbatim unless marked as a paraphrase (`text_is_verbatim: false`),
for example for paywalled ISO standards. Statuses reflect the compile date in each record.
