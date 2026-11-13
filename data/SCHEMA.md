# Policy record schema (one JSON file per policy: data/policies/<policy_id>.json)

Every attribute below MUST be present. Use `null` when not applicable/unknown (never invent).
Lists use `[]` when empty.

```jsonc
{
  // Identity
  "policy_id": "EU_AI_Act_2024",            // UpperSnake/underscore id, unique
  "policy_name": "EU Artificial Intelligence Act",
  "short_name": "EU AI Act",
  "policy_type": "regulation",               // one of: regulation | statute | executive_order | guidance | standard | framework | international_instrument | voluntary_code | internal_policy | bill
  "source_uri": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",   // official source
  "issuing_authority": "European Parliament and Council of the European Union",

  // Locale / scope
  "jurisdiction": "EU",                      // EU | US-Federal | US-CO | CN | International | Organization | ...
  "country_region": "European Union (27 member states)",
  "language": ["en"],                        // ISO 639-1 codes of the text used for clauses
  "official_languages": ["bg","cs", "..."],  // languages the issuer published officially
  "regulatory_regime": "EU AI Act",
  "geo_constraints": "AI systems placed on the EU market or whose output is used in the EU (extraterritorial)",
  "industry_scope": ["general"],             // e.g. general | finance | healthcare | employment | public_sector | ...

  // Locale context (the five locale factors: Language, Region, Regulation, Culture, Use Case)
  "locale_context": {
    "language": ["Bulgarian", "...", "English"],          // language names of the official texts
    "region": "Europe › European Union",                   // macro-region › specific place
    "regulation": "Binding law · horizontal, risk-based product regulation",   // legal force · regulatory approach
    "culture": "EU rights-based, precautionary regulatory tradition ...",      // governance/cultural context shaping interpretation (compiler's interpretation)
    "use_cases": ["biometric identification & categorisation", "employment & HR decisions"]  // AI use cases the policy targets
  },

  // Lifecycle
  "status": "enforceable",                   // draft | provisional | enforceable | superseded | incomplete | voluntary | proposed | lapsed | revoked
  "binding": true,                           // legally binding?
  "effective_date": "2024-08-01",            // YYYY-MM-DD or YYYY-MM or null
  "key_dates": [{"date":"2025-02-02","event":"Prohibitions + AI literacy apply"}],
  "expiration_date": null,
  "version": "OJ L, 2024/1689, 12.7.2024",
  "last_updated": "2024-07-12",              // last official amendment/revision date you can verify

  // Applicability
  "covered_entities": ["providers", "deployers", "importers", "distributors"],
  "covered_systems": ["prohibited AI practices", "high-risk AI systems", "general-purpose AI models"],
  "covered_activities": ["placing on the market", "putting into service", "use"],
  "exceptions": ["military/defence/national security", "scientific R&D", "purely personal non-professional use"],
  "conditions": ["high-risk obligations apply if system is in Annex III use area or is a safety component under Annex I"],

  // Policy meaning
  "objective": "One or two sentences on overall intent.",
  "policy_domain": ["safety", "fundamental_rights", "transparency"],   // privacy | safety | security | fairness | transparency | accountability | fundamental_rights | innovation | consumer_protection | content_integrity | employment | governance
  "principles": ["transparency", "human oversight", "robustness"],

  // Relationship
  "parent_policy": null,                     // policy_id or name
  "related_policies": [{"policy":"GDPR_2016","relation":"overlaps_with"}],   // relation: overlaps_with | supersedes | superseded_by | specializes | implements | conflicts_with | complements | amends | amended_by
  "conflict_rule": "Short text, e.g. 'Without prejudice to GDPR (Art. 2(7)); sector law prevails where lex specialis'",

  // Provenance of this record
  "record_provenance": {
    "sources_consulted": ["https://..."],
    "compiled_on": "2026-11-13",
    "human_verified": false,
    "notes": "Anything uncertain, e.g. pending amendments."
  },

  // Clause level (3-6 representative, important clauses)
  "clauses": [
    {
      "clause_id": "EU_AI_Act_2024_Art5_1_a",
      "policy_id": "EU_AI_Act_2024",
      "section": "Article 5(1)(a)",
      "original_text": "Exact verbatim text from the official source (may be truncated with '…').",
      "text_is_verbatim": true,             // false if you could not verify exact wording (then original_text is a close paraphrase)
      "language": "en",
      "translated_text": null,               // English translation if original is non-English, else null
      "actor": "provider/deployer",
      "action": "place on the market / put into service / use",
      "object": "AI system deploying subliminal or manipulative techniques",
      "recipient": null,
      "modality": "MUST NOT",                // MUST | MUST NOT | SHOULD | SHOULD NOT | MAY
      "requirement": "do not deploy manipulative AI causing significant harm",
      "condition": "where it materially distorts behaviour and causes or is likely to cause significant harm",
      "exception": null,
      "purpose": "protect autonomy and prevent harm",
      "affected_asset": "natural persons' decision-making autonomy",
      "policy_domain": "safety",
      "applicable_regions": ["EU"],
      "applicable_systems": "any AI system",
      "interpretation_notes": "short note",
      "ambiguity": "medium",                 // low | medium | high
      "interpretation_confidence": 0.85,     // 0-1, your confidence in the structured decomposition
      "human_verified": false
    }
  ]
}
```
