# DipDays Search Schema Contracts

DipDays now models searchability with **three layers**:

1. `primary_category` (required, single archetype)
2. `search_facets` (structured boolean/location filters)
3. `search_tags` (normalized expandable intent/vibe tags)

This lets browse/navigation stay simple while future search parsing becomes precise.

## Why both primary archetype and facets

`primary_category` is the editorial and browse anchor. It supports navigation pages and fallback query interpretation.

`search_facets` and `search_tags` capture richer intent without forcing one archetype to do all search work.

## Allowed primary archetypes

- `Luxury Bathhouse`
- `Social Sauna`
- `Traditional Banya`
- `Social Wellness Club`
- `Neighborhood Spa`
- `Regional Spa Resort`

## Searchable facet model

Location:

- `neighborhood?: string`
- `borough?: string`

Core bathing facilities:

- `has_sauna`
- `has_cold_plunge`
- `has_steam_room`
- `has_hot_pool`
- `has_thermal_circuit`

Programming / ritual:

- `has_guided_rituals`
- `has_breathwork`

Treatments / wellness:

- `has_treatments`
- `has_massages`
- `has_bodywork`

Medical / recovery modalities:

- `has_recovery_clinic`
- `has_iv_therapy`
- `has_hyperbaric`
- `has_red_light`
- `has_cryotherapy`

> Note: price is intentionally out of scope in this schema pass.

## `search_tags` vs `categories` and `features`

- `categories`: higher-level labels already used in curation/ranking context.
- `features`: concrete venue capabilities/attributes.
- `search_tags`: normalized intent/vibe vocabulary for future query parsing.

Tags are derived from canonicalized signals and should not copy raw marketing copy.

## Tag normalization rules

- lowercase
- kebab-case
- deterministic derivation
- de-duplicated and sorted
- vocabulary can expand over time without breaking existing tags

Examples: `luxury`, `social`, `traditional`, `ritual-led`, `recovery-focused`, `medical-wellness`, `high-design`, `urban`.

## Why include medical recovery modalities now

Queries and editorial strategy already overlap with recovery-driven intent (e.g., hyperbaric / IV / red light). Including these modalities in `search_facets` now keeps parsing deterministic and avoids retrofitting schema later.

## Query parsing compatibility examples

- “best sauna in Brooklyn”
  - `has_sauna=true`, `borough=Brooklyn`
- “best cold plunge in Berlin”
  - `has_cold_plunge=true`, `city=Berlin`
- “social sauna in Manhattan”
  - `primary_category=Social Sauna`, `borough=Manhattan`
- “traditional banya near Williamsburg”
  - `primary_category=Traditional Banya`, `neighborhood=Williamsburg`
- “luxury wellness club with hyperbaric in LA”
  - `search_tags` includes `luxury` or `primary_category=Social Wellness Club`
  - `has_hyperbaric=true`
  - `city=Los Angeles`

This schema enables search-bar intent matching in a future pass without changing scoring formulas or UI contracts.
