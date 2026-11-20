#!/usr/bin/env python3
"""Import risk taxonomies and crosswalks from IBM's AI Atlas Nexus into data/risks/ and data/mappings/.

AI Atlas Nexus (https://github.com/IBM/ai-atlas-nexus, Apache-2.0) publishes several AI risk taxonomies
as LinkML YAML, plus mappings between them. This script converts the ones the catalogue uses into
the catalogue's risk-taxonomy record format (data/SCHEMA.md, "Risk taxonomy record").

Usage:
  git clone --depth 1 https://github.com/IBM/ai-atlas-nexus /tmp/nexus
  python3 scripts/import_risk_taxonomies.py /tmp/nexus

Hand-authored taxonomies (NIST AI RMF characteristics, DeepMind 2021, EU AI Act tiers) and the compiler's
crosswalk live in data/risks/*.json and data/mappings/risk_crosswalk_compiler.json and are not touched here.
"""
from __future__ import annotations

import ast
import datetime as dt
import json
import pathlib
import subprocess
import sys

import yaml  # PyYAML

ROOT = pathlib.Path(__file__).resolve().parent.parent
RISKS = ROOT / "data" / "risks"
MAPS = ROOT / "data" / "mappings"
REPO = "https://github.com/IBM/ai-atlas-nexus"


def load(kg: pathlib.Path, name: str) -> dict:
    return yaml.safe_load((kg / name).read_text(encoding="utf-8"))


def as_list(v) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return v
    try:
        return list(ast.literal_eval(v))  # some fields are stringified Python lists
    except (ValueError, SyntaxError):
        return [v]


def clean(s):
    return " ".join(str(s).split()) if s else None


def provenance(commit: str, file: str, notes: str) -> dict:
    return {
        "source": f"{REPO}/blob/{commit}/src/ai_atlas_nexus/data/knowledge_graph/{file}",
        "license": "Apache-2.0 (AI Atlas Nexus data)",
        "imported_on": dt.date.today().isoformat(),
        "human_verified": False,
        "notes": notes,
    }


def node(i, name, desc=None, children=None, **extra):
    n = {"id": i, "name": clean(name), "description": clean(desc)}
    n.update({k: v for k, v in extra.items() if v is not None})
    n["children"] = children or []
    return n


def mit(kg, commit):
    d = load(kg, "mit_ai_risk_repository_data.yaml")
    tx = next(t for t in d["taxonomies"] if t["id"] == "mit-ai-risk-repository")
    # Normalise two group labels that differ from the published taxonomy wording.
    fix = {"Human- Computer Interaction": "Human-Computer Interaction", "Malicious actors": "Malicious Actors & Misuse"}
    groups = [g for g in d["groups"] if g["id"].startswith("mit-ai-risk-domain-")]
    cats = []
    for g in groups:
        num = g["id"].rsplit("-", 1)[1]
        subs = [node(e["id"], e["name"], e.get("description"), code=e["id"].rsplit("-", 1)[1])
                for e in d["entries"] if e.get("isPartOf") == g["id"]]
        cats.append(node(g["id"], fix.get(g["name"], g["name"]), None, subs, code=num))
    return {
        "taxonomy_id": "MIT_AI_Risk_Repository",
        "name": "MIT AI Risk Repository: Domain Taxonomy of AI Risks",
        "short_name": "MIT AI Risk Repository",
        "publisher": "MIT FutureTech and collaborators (Slattery et al.)",
        "year": 2024,
        "version": f"Taxonomy v{tx.get('version', '1')} (with subdomain 7.6 Multi-agent risks)",
        "kind": "harm-domain taxonomy",
        "source_uri": "https://airisk.mit.edu/",
        "paper_uri": "https://arxiv.org/abs/2408.12622",
        "description": clean(tx["description"]),
        "levels": ["Domain", "Subdomain"],
        "is_hub": True,
        "related_documents": [],
        "categories": cats,
        "record_provenance": provenance(commit, "mit_ai_risk_repository_data.yaml",
            "Used as the catalogue's crosswalk hub: every other taxonomy and every clause mapping points at MIT subdomains. "
            "Two domain labels normalised ('Human- Computer Interaction', 'Malicious actors')."),
    }


def ibm(kg, commit):
    d = load(kg, "risk_atlas_data.yaml")
    tx = d["taxonomies"][0]
    cats = []
    for g in sorted(d["groups"], key=lambda g: g["name"]):
        risks = sorted([e for e in d["entries"] if e.get("isPartOf") == g["id"]], key=lambda e: e["name"])
        cats.append(node(g["id"], g["name"], None, [
            node(e["id"], e["name"], e.get("description"), tags=[e.get("risk_type")] if e.get("risk_type") else None,
                 concern=clean(e.get("concern")), url=e.get("url")) for e in risks]))
    return {
        "taxonomy_id": "IBM_AI_Risk_Atlas",
        "name": "IBM AI Risk Atlas",
        "short_name": "IBM Risk Atlas",
        "publisher": "IBM",
        "year": 2024,
        "version": f"as modified {tx.get('dateModified')}",
        "kind": "generative-AI risk catalogue",
        "source_uri": tx["url"],
        "paper_uri": None,
        "description": clean(tx["description"]),
        "levels": ["Risk group", "Risk"],
        "tag_label": "Risk type (training-data, inference, output, non-technical, agentic)",
        "is_hub": False,
        "related_documents": [],
        "categories": cats,
        "record_provenance": provenance(commit, "risk_atlas_data.yaml",
            "Imported from AI Atlas Nexus's machine-readable copy, which may lag the live IBM page."),
    }


def nist_genai(kg, commit):
    d = load(kg, "nist_ai_rmf_data.yaml")
    return {
        "taxonomy_id": "NIST_AI_600_1_Risks",
        "name": "NIST AI 600-1 Generative AI Risks",
        "short_name": "NIST AI 600-1 risks",
        "publisher": "US National Institute of Standards and Technology (NIST)",
        "year": 2024,
        "version": "NIST AI 600-1 (July 2024)",
        "kind": "generative-AI risk list",
        "source_uri": "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf",
        "paper_uri": None,
        "description": "The 12 risks that are unique to or exacerbated by generative AI, as defined in the Generative AI Profile of the NIST AI RMF.",
        "levels": ["Risk"],
        "is_hub": False,
        "related_documents": ["NIST_AI_600_1_2024", "NIST_AI_RMF_2023"],
        "categories": [node(e["id"], e["name"], e.get("description")) for e in d["entries"]],
        "record_provenance": provenance(commit, "nist_ai_rmf_data.yaml", None),
    }


def owasp(kg, commit):
    d = load(kg, "owasp_llm_2.0_data.yaml")
    tx = d["taxonomies"][0]
    return {
        "taxonomy_id": "OWASP_LLM_Top10_2025",
        "name": "OWASP Top 10 for LLM Applications 2025",
        "short_name": "OWASP LLM Top 10",
        "publisher": "OWASP GenAI Security Project",
        "year": 2024,
        "version": f"v{tx.get('version')} (2025 list, published {tx.get('dateCreated')})",
        "kind": "application-security vulnerability list",
        "source_uri": tx["url"],
        "paper_uri": None,
        "description": clean(tx["description"]),
        "levels": ["Vulnerability"],
        "is_hub": False,
        "related_documents": [],
        "categories": [node(e["id"], e["name"], e.get("description"), url=e.get("url")) for e in d["entries"]],
        "record_provenance": provenance(commit, "owasp_llm_2.0_data.yaml", None),
    }


AIR_L1 = {  # level-1 grouping from the AIR 2024 paper (not present in AI Atlas Nexus)
    "System & Operational Risks": ["Security RiskGroups", "Operational Misuses"],
    "Content Safety Risks": ["Violence & Extremism", "Hate/Toxicity", "Sexual Content", "Child Harm", "Self-harm"],
    "Societal Risks": ["Political Usage", "Economic Harm", "Deception", "Manipulation", "Defamation"],
    "Legal & Rights-Related Risks": ["Fundamental Rights", "Discrimination/Bias", "Privacy", "Criminal Activities"],
}


def air(kg, commit):
    d = load(kg, "air_2024_data.yaml")
    tx = d["taxonomies"][0]
    groups = {g["id"]: g for g in d["groups"]}
    by_name = {g["name"]: g for g in d["groups"] if not g.get("broad_mappings")}
    leaves = {}
    for e in d["entries"]:
        leaves.setdefault(e.get("isPartOf"), []).append(e)
    rename = {"Security RiskGroups": "Security Risks"}

    def l3(gid):
        g = groups[gid]
        return node(gid, g["name"], None, [node(e["id"], e["name"]) for e in leaves.get(gid, [])])

    cats = []
    for i, (l1, l2names) in enumerate(AIR_L1.items(), 1):
        kids = []
        for n in l2names:
            g = by_name[n]
            kids.append(node(g["id"], rename.get(n, n), None, [l3(c) for c in as_list(g.get("narrow_mappings")) if c in groups]))
        cats.append(node(f"air-l1-{i}", l1, None, kids))
    return {
        "taxonomy_id": "AIR_2024",
        "name": "AI Risk Categorization Decoded (AIR 2024)",
        "short_name": "AIR 2024",
        "publisher": "Zeng et al. (Virtue AI, Stanford, UIUC and others)",
        "year": 2024,
        "version": f"v{tx.get('version', '1')}",
        "kind": "policy-derived risk taxonomy",
        "source_uri": "https://arxiv.org/abs/2406.17864",
        "paper_uri": "https://arxiv.org/abs/2406.17864",
        "description": clean(tx["description"]),
        "levels": ["Level 1", "Level 2", "Level 3", "Level 4"],
        "is_hub": False,
        "related_documents": [],
        "categories": cats,
        "record_provenance": provenance(commit, "air_2024_data.yaml",
            "Levels 2-4 imported from AI Atlas Nexus. The four level-1 groups were added by the compiler from the AIR 2024 paper, "
            "and Nexus's 'Security RiskGroups' is shown as 'Security Risks'."),
    }


CROSSWALKS = [  # (file, from_taxonomy, to_taxonomy)
    ("mit-ai-risk-repository_ibm-risk-atlas_from_tsv_data.yaml", "IBM_AI_Risk_Atlas", "MIT_AI_Risk_Repository"),
    ("ibm2nistgenai_from_tsv_data.yaml", "IBM_AI_Risk_Atlas", "NIST_AI_600_1_Risks"),
    ("ibm2owasp_from_tsv_data.yaml", "IBM_AI_Risk_Atlas", "OWASP_LLM_Top10_2025"),
]
REL = {"related_mappings": "related", "broad_mappings": "broader", "narrow_mappings": "narrower",
       "exact_mappings": "exact", "close_mappings": "close"}


def crosswalk(kg, commit, known: set[str]):
    edges, seen = [], set()
    for fname, _, _ in CROSSWALKS:
        d = load(kg / "mappings", fname)
        for e in d.get("entries", []):
            src = e["id"]
            if not src.startswith("atlas-"):
                continue  # keep one direction (IBM -> other); the reverse entries are mirrors
            for key, rel in REL.items():
                for tgt in as_list(e.get(key)):
                    if tgt not in known or (src, tgt) in seen:
                        continue  # e.g. MIT causal-taxonomy targets are not imported
                    seen.add((src, tgt))
                    edges.append({"from": src, "to": tgt, "relation": rel})
    return {
        "description": "Category-to-category mappings between risk taxonomies, imported from AI Atlas Nexus. "
                       "'broader' means the target is broader than the source.",
        "source": f"{REPO}/tree/{commit}/src/ai_atlas_nexus/data/knowledge_graph/mappings",
        "license": "Apache-2.0 (AI Atlas Nexus data)",
        "imported_on": dt.date.today().isoformat(),
        "edges": edges,
    }


def ids(cats):
    for c in cats:
        yield c["id"]
        yield from ids(c["children"])


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    repo = pathlib.Path(sys.argv[1])
    kg = repo / "src" / "ai_atlas_nexus" / "data" / "knowledge_graph"
    try:
        commit = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        commit = "main"
    RISKS.mkdir(parents=True, exist_ok=True)
    MAPS.mkdir(parents=True, exist_ok=True)
    known = set()
    for rec in (mit(kg, commit), ibm(kg, commit), nist_genai(kg, commit), owasp(kg, commit), air(kg, commit)):
        (RISKS / f"{rec['taxonomy_id']}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        known |= set(ids(rec["categories"]))
        print(f"wrote data/risks/{rec['taxonomy_id']}.json ({sum(1 for _ in ids(rec['categories']))} categories)")
    cw = crosswalk(kg, commit, known)
    (MAPS / "risk_crosswalk_nexus.json").write_text(json.dumps(cw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote data/mappings/risk_crosswalk_nexus.json ({len(cw['edges'])} edges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
