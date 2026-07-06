-- raw_prices had no index covering (asset_type, captured_at). Any query
-- filtering by asset_type over a captured_at time window -- score_crypto and
-- score_prediction_markets both do this, since raw_prices is an append-only
-- time-series table with a new row per asset every ~60s -- had no index to
-- seek through and fell back to a large scan via the (identifier,
-- captured_at) index instead. At 634k+ rows this now exceeds Postgres's
-- statement timeout (57014), observed live: score_crypto silently returned
-- zero signals for 2.5 days (2026-07-04 through 2026-07-06) before this was
-- diagnosed.
CREATE INDEX IF NOT EXISTS idx_raw_prices_asset_type_captured_at
  ON raw_prices (asset_type, captured_at DESC);

-- idx_raw_prices_identifier and idx_raw_prices_identifier_captured are
-- identical indexes (both btree (identifier, captured_at DESC)), created
-- redundantly at different points -- drop the older duplicate.
DROP INDEX IF EXISTS idx_raw_prices_identifier;
