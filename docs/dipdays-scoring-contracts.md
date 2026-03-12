# DipDays Scoring Contracts

This document defines the stable contracts for DipDays ranking infrastructure.

## 1) CanonicalVenue contract

`CanonicalVenue` is the durable identity record for a venue.

It is intentionally split into:
- **Identity**: `id` (UUID), `slug` (stable human-readable key), `name`
- **Location**: `city`, `region?`, `country`, `coordinates`
- **Taxonomy**: `venue_type`, `categories`, `features`
- **Provenance references**: `source_urls`, optional `website`
- **State**: `editorial_status`, `ranking_eligibility`, timestamps

`ranking_eligibility` in canonical data is baseline/editorial state only:
- `is_eligible`
- `evaluated_at`
- `reasons`
- `blockers`

Final rankability is still determined by score computation.

## 2) EvidenceRecord contract

`EvidenceRecord` is the atomic claim-support unit for scoring.

Required core fields preserve provenance and traceability:
- Evidence IDs are UUIDs; `venue_id` must reference `CanonicalVenue.id` (UUID)
- source information (`source_type`, `source_url`, `source_label`)
- claim information (`claim_type`, `claim_key`, `claim_value`)
- confidence (`confidence` in `[0,1]`)
- extraction metadata (`extracted_at`, `agent_name?`, `human_verified`)

Optional narrow fields:
- `claim_unit` for value interpretation
- `provenance_note` for audit context

## 3) ScoreRecord contract

`ScoreRecord` is the deterministic scoring output used by rankings, APIs, and pages.

It includes:
- category scores (`ritual_quality`, `aesthetic_design`, `social_energy`, `facilities`, `recovery_wellness`) in `[0,10]`
- `overall` in `[0,10]`
- `coverage_score` and `confidence_score` in `[0,1]`
- `ranking_eligible` (final computational eligibility)
- `score_version`, `computed_at`
- `explanation`
- optional `scoring_metadata.review_count` for deterministic tiebreaking

## 4) ScoreExplanation contract

`ScoreExplanation` is the trust/audit layer without exposing raw evidence blobs.

It includes:
- `top_contributors`
- `missing_data_warnings`
- `eligibility_blockers`
- `eligibility_caveats`
- `evidence_counts` per evidence category
- `category_diagnostics` (per-score-category coverage/confidence/evidence count)

This supports answering:
- why a venue scored high/low
- what data is missing
- why a venue is not rankable
- where evidence support is weak

## 5) Scoring weights and philosophy

DipDays composite weights are locked and exported:
- Facilities: 30%
- Aesthetic Design: 25%
- Ritual Quality: 20%
- Social Energy: 15%
- Recovery & Wellness: 10%

Philosophy: physical bathing environment quality is weighted most heavily, while ritual/programming remains meaningful but not dominant over physical destination quality.

## 6) Rankable vs publishable distinction

- **Publishable**: content can exist in directory/editorial contexts.
- **Rankable**: score computation says `ranking_eligible = true`.

Rankings should trust `ScoreRecord.ranking_eligible`, not canonical baseline flags.

## 7) Downstream consumers

These contracts are intended for:
- global ranking lists
- venue pages (derived score summary)
- future APIs
- editorial review systems (Dip Reviews)
