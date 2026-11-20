#!/usr/bin/env python3
"""Validate the catalogue and bundle it for the site.

Inputs:  data/policies/*.json and data/regulations/*.json (document records, same schema),
         data/risks/*.json (risk taxonomies), data/mappings/*.json (risk crosswalks, clause -> risk mapping).
Outputs: data/catalog.json (documents) and data/risks.json (taxonomies, crosswalk, clause mapping).

Usage: python3 scripts/build.py [--strict]
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC_DIRS = {"policy": ROOT / "data" / "policies", "regulation": ROOT / "data" / "regulations"}
RISK_DIR = ROOT / "data" / "risks"
MAP_DIR = ROOT / "data" / "mappings"
OUT = ROOT / "data" / "catalog.json"
RISK_OUT = ROOT / "data" / "risks.json"
HUB = "MIT_AI_Risk_Repository"

POLICY_KEYS = [
    "policy_id", "policy_name", "short_name", "policy_type", "category", "source_uri", "issuing_authority",
    "jurisdiction", "country_region", "language", "official_languages", "regulatory_regime",
    "geo_constraints", "industry_scope", "locale_context",
    "status", "binding", "effective_date", "key_dates", "versions", "expiration_date", "version", "last_updated",
    "covered_entities", "covered_systems", "covered_activities", "exceptions", "conditions",
    "objective", "policy_domain", "principles",
    "parent_policy", "related_policies", "conflict_rule",
    "record_provenance", "clauses",
]
LOCALE_KEYS = ["language", "region", "regulation", "culture", "use_cases"]
CLAUSE_KEYS = [
    "clause_id", "policy_id", "section", "original_text", "text_is_verbatim", "language",
    "translated_text", "actor", "action", "object", "recipient", "modality", "requirement",
    "condition", "exception", "purpose", "affected_asset", "policy_domain", "applicable_regions",
    "applicable_systems", "interpretation_notes", "ambiguity", "interpretation_confidence",
    "human_verified",
]
POLICY_TYPES = {"regulation", "statute", "executive_order", "guidance", "standard", "framework",
                "international_instrument", "voluntary_code", "internal_policy", "bill"}
STATUSES = {"draft", "provisional", "enforceable", "superseded", "incomplete", "voluntary",
            "proposed", "lapsed", "revoked"}
MODALITIES = {"MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY"}
AMBIGUITY = {"low", "medium", "high"}
VERSION_KINDS = {"draft", "release", "amendment", "repeal"}
ASPECTS = {"scope", "definitions", "risk_thresholds", "obligations", "safeguards", "governance",
           "transparency", "enforcement", "timeline"}
CHANGES = {"added", "revised", "removed"}
VERSION_KEYS = ["version", "date", "kind", "title", "summary", "changes", "source", "current", "note"]
DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")


def check(p: dict, fname: str) -> tuple[list[str], list[str]]:
    errs: list[str] = []
    warns: list[str] = []
    for k in POLICY_KEYS:
        if k not in p:
            errs.append(f"missing policy key {k}")
    if p.get("policy_id") and fname != f"{p['policy_id']}.json":
        errs.append(f"file name does not match policy_id {p['policy_id']}")
    if p.get("category") not in DOC_DIRS:
        errs.append(f"category must be one of {sorted(DOC_DIRS)}")
    if p.get("policy_type") not in POLICY_TYPES:
        warns.append(f"non-standard policy_type {p.get('policy_type')!r}")
    if p.get("status") not in STATUSES:
        warns.append(f"non-standard status {p.get('status')!r}")
    for k in ("effective_date", "expiration_date", "last_updated"):
        v = p.get(k)
        if v is not None and not (isinstance(v, str) and DATE_RE.match(v)):
            warns.append(f"{k} not ISO date: {v!r}")
    vs = p.get("versions")
    if isinstance(vs, list):
        if not vs:
            errs.append("versions must list at least one version")
        dates = []
        for i, ver in enumerate(vs):
            vt = f"versions[{i}]"
            for k in VERSION_KEYS:
                if k not in ver:
                    errs.append(f"{vt}: missing key {k}")
            if not (isinstance(ver.get("date"), str) and DATE_RE.match(ver["date"])):
                errs.append(f"{vt}: date not ISO: {ver.get('date')!r}")
            else:
                dates.append(ver["date"])
            if ver.get("kind") not in VERSION_KINDS:
                errs.append(f"{vt}: kind must be one of {sorted(VERSION_KINDS)}")
            for c in ver.get("changes") or []:
                if c.get("aspect") not in ASPECTS:
                    errs.append(f"{vt}: unknown change aspect {c.get('aspect')!r}")
                if c.get("change") not in CHANGES:
                    errs.append(f"{vt}: unknown change type {c.get('change')!r}")
        if dates != sorted(dates):
            errs.append("versions must be in chronological order")
        if sum(1 for ver in vs if ver.get("current") is True) != 1:
            errs.append("exactly one version must have current: true")
    elif "versions" in p:
        errs.append("versions must be a list")
    lc = p.get("locale_context")
    if isinstance(lc, dict):
        for k in LOCALE_KEYS:
            if k not in lc:
                errs.append(f"locale_context missing {k}")
    elif "locale_context" in p:
        errs.append("locale_context must be an object")
    clauses = p.get("clauses") or []
    if not clauses:
        errs.append("no clauses")
    seen = set()
    for i, c in enumerate(clauses):
        tag = c.get("clause_id", f"#{i}")
        for k in CLAUSE_KEYS:
            if k not in c:
                errs.append(f"{tag}: missing clause key {k}")
        if tag in seen:
            errs.append(f"{tag}: duplicate clause_id")
        seen.add(tag)
        if c.get("policy_id") != p.get("policy_id"):
            errs.append(f"{tag}: policy_id mismatch")
        if c.get("modality") not in MODALITIES:
            warns.append(f"{tag}: non-standard modality {c.get('modality')!r}")
        if c.get("ambiguity") not in AMBIGUITY:
            warns.append(f"{tag}: non-standard ambiguity {c.get('ambiguity')!r}")
        conf = c.get("interpretation_confidence")
        if conf is not None and not (isinstance(conf, (int, float)) and 0 <= conf <= 1):
            errs.append(f"{tag}: interpretation_confidence out of range")
    return errs, warns


RISK_KEYS = ["taxonomy_id", "name", "short_name", "publisher", "year", "version", "kind", "source_uri", "description",
             "levels", "is_hub", "related_documents", "categories", "record_provenance"]


def walk(cats, depth=0):
    for c in cats:
        yield c, depth
        yield from walk(c.get("children") or [], depth + 1)


def load_docs(strict):
    docs, bad = [], 0
    for cat, d in DOC_DIRS.items():
        for f in sorted(d.glob("*.json")):
            try:
                p = json.loads(f.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                print(f"ERROR {f.name}: invalid JSON: {e}")
                bad += 1
                continue
            errs, warns = check(p, f.name)
            if p.get("category") != cat:
                errs.append(f"category {p.get('category')!r} but file is in data/{d.name}/")
            for e in errs:
                print(f"ERROR {d.name}/{f.name}: {e}")
            for w in warns:
                print(f"warn  {d.name}/{f.name}: {w}")
            if errs or (strict and warns):
                bad += 1
            docs.append(p)
    return docs, bad


def load_risks(doc_ids, clause_ids):
    bad = 0
    def err(msg):
        nonlocal bad
        print("ERROR " + msg)
        bad += 1
    taxonomies, cat_tax = [], {}
    for f in sorted(RISK_DIR.glob("*.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        for k in RISK_KEYS:
            if k not in t:
                err(f"risks/{f.name}: missing key {k}")
        if f.stem != t.get("taxonomy_id"):
            err(f"risks/{f.name}: file name does not match taxonomy_id")
        for r in t.get("related_documents") or []:
            if r not in doc_ids:
                err(f"risks/{f.name}: related document {r!r} not in catalogue")
        for c, _ in walk(t.get("categories") or []):
            if c["id"] in cat_tax:
                err(f"risks/{f.name}: duplicate category id {c['id']}")
            cat_tax[c["id"]] = t["taxonomy_id"]
        taxonomies.append(t)
    hub = {c["id"] for t in taxonomies if t["taxonomy_id"] == HUB for c, depth in walk(t["categories"]) if depth == 1}
    edges = []
    for f in sorted(MAP_DIR.glob("risk_crosswalk_*.json")):
        cw = json.loads(f.read_text(encoding="utf-8"))
        for e in cw["edges"]:
            if e["from"] not in cat_tax or e["to"] not in cat_tax:
                err(f"mappings/{f.name}: unknown category in edge {e}")
                continue
            edges.append({**e, "source": f.stem.replace("risk_crosswalk_", "")})
    cm = json.loads((MAP_DIR / "clause_risks.json").read_text(encoding="utf-8"))
    for m in cm["mappings"]:
        if m["clause_id"] not in clause_ids:
            err(f"clause_risks: unknown clause {m['clause_id']}")
        for r in m["risks"]:
            if r not in hub:
                err(f"clause_risks: {m['clause_id']} maps to {r}, which is not a hub subdomain")
        if m.get("relation") not in ("mitigates", "relates_to"):
            err(f"clause_risks: {m['clause_id']} has unknown relation {m.get('relation')!r}")
    bundle = {
        "generated": dt.date.today().isoformat(),
        "hub": HUB,
        "taxonomies": taxonomies,
        "crosswalk": edges,
        "clause_risks": cm,
    }
    return bundle, bad


def main() -> int:
    strict = "--strict" in sys.argv
    docs, bad = load_docs(strict)
    ids = {p.get("policy_id") for p in docs}
    if len(ids) != len(docs):
        print("ERROR duplicate policy_id across data/policies and data/regulations")
        bad += 1
    for p in docs:
        for r in p.get("related_policies") or []:
            if isinstance(r, dict):
                r["in_catalogue"] = r.get("policy") in ids
    clause_ids = {c.get("clause_id") for p in docs for c in p.get("clauses") or []}
    risks, rbad = load_risks(ids, clause_ids)
    count = lambda c: sum(1 for p in docs if p.get("category") == c)
    catalog = {
        "generated": dt.date.today().isoformat(),
        "policy_count": count("policy"),
        "regulation_count": count("regulation"),
        "clause_count": len(clause_ids),
        "documents": docs,
    }
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    RISK_OUT.write_text(json.dumps(risks, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {catalog['policy_count']} policies, {catalog['regulation_count']} regulations, "
          f"{catalog['clause_count']} clauses; wrote {RISK_OUT.relative_to(ROOT)}: {len(risks['taxonomies'])} taxonomies, "
          f"{len(risks['crosswalk'])} crosswalk edges, {len(risks['clause_risks']['mappings'])} clause mappings; "
          f"{bad + rbad} error(s)")
    return 1 if bad or rbad else 0


if __name__ == "__main__":
    sys.exit(main())
