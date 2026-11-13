#!/usr/bin/env python3
"""Validate data/policies/*.json against the schema and bundle them into data/catalog.json.

Usage: python3 scripts/build.py [--strict]
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
POLICY_DIR = ROOT / "data" / "policies"
OUT = ROOT / "data" / "catalog.json"

POLICY_KEYS = [
    "policy_id", "policy_name", "short_name", "policy_type", "source_uri", "issuing_authority",
    "jurisdiction", "country_region", "language", "official_languages", "regulatory_regime",
    "geo_constraints", "industry_scope",
    "status", "binding", "effective_date", "key_dates", "expiration_date", "version", "last_updated",
    "covered_entities", "covered_systems", "covered_activities", "exceptions", "conditions",
    "objective", "policy_domain", "principles",
    "parent_policy", "related_policies", "conflict_rule",
    "record_provenance", "clauses",
]
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
DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")


def check(p: dict, fname: str) -> tuple[list[str], list[str]]:
    errs: list[str] = []
    warns: list[str] = []
    for k in POLICY_KEYS:
        if k not in p:
            errs.append(f"missing policy key {k}")
    if p.get("policy_id") and fname != f"{p['policy_id']}.json":
        errs.append(f"file name does not match policy_id {p['policy_id']}")
    if p.get("policy_type") not in POLICY_TYPES:
        warns.append(f"non-standard policy_type {p.get('policy_type')!r}")
    if p.get("status") not in STATUSES:
        warns.append(f"non-standard status {p.get('status')!r}")
    for k in ("effective_date", "expiration_date", "last_updated"):
        v = p.get(k)
        if v is not None and not (isinstance(v, str) and DATE_RE.match(v)):
            warns.append(f"{k} not ISO date: {v!r}")
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


def main() -> int:
    strict = "--strict" in sys.argv
    policies, bad = [], 0
    for f in sorted(POLICY_DIR.glob("*.json")):
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"ERROR {f.name}: invalid JSON: {e}")
            bad += 1
            continue
        errs, warns = check(p, f.name)
        for e in errs:
            print(f"ERROR {f.name}: {e}")
        for w in warns:
            print(f"warn  {f.name}: {w}")
        if errs or (strict and warns):
            bad += 1
        policies.append(p)
    ids = {p.get("policy_id") for p in policies}
    for p in policies:
        for r in p.get("related_policies") or []:
            ref = r.get("policy") if isinstance(r, dict) else r
            r_known = ref in ids
            if isinstance(r, dict):
                r["in_catalogue"] = r_known
    catalog = {
        "generated": dt.date.today().isoformat(),
        "policy_count": len(policies),
        "clause_count": sum(len(p.get("clauses") or []) for p in policies),
        "policies": policies,
    }
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {catalog['policy_count']} policies, "
          f"{catalog['clause_count']} clauses; {bad} file(s) with errors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
