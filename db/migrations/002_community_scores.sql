-- Migration: 002_community_scores
-- Adds community score, keyword, and DIP Index columns to the venues table.
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS place_id          TEXT,
  ADD COLUMN IF NOT EXISTS community_score   FLOAT,
  ADD COLUMN IF NOT EXISTS review_count      INT,
  ADD COLUMN IF NOT EXISTS positive_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS negative_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS dip_index         FLOAT,
  ADD COLUMN IF NOT EXISTS last_updated      TIMESTAMPTZ;

-- Index for quick lookups by Place ID (used by the enrichment script to avoid re-lookups)
CREATE INDEX IF NOT EXISTS venues_place_id_idx ON venues (place_id)
  WHERE place_id IS NOT NULL;

COMMENT ON COLUMN venues.place_id          IS 'Google Places ID — cached to avoid repeated Find Place API calls';
COMMENT ON COLUMN venues.community_score   IS 'Google rating (0–5) adjusted for review volume via log confidence weight';
COMMENT ON COLUMN venues.review_count      IS 'Total Google review count (user_ratings_total)';
COMMENT ON COLUMN venues.positive_keywords IS 'Top positive themes extracted from Google reviews by Claude';
COMMENT ON COLUMN venues.negative_keywords IS 'Top negative themes extracted from Google reviews by Claude';
COMMENT ON COLUMN venues.dip_index         IS 'Blended score: 0.6 × dip_score + 0.4 × (community_score × 2), range 0–10';
COMMENT ON COLUMN venues.last_updated      IS 'Timestamp of most recent enrichment run';
