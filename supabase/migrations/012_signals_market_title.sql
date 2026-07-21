-- Store the human-readable market title directly on prediction signals
-- so the frontend doesn't depend on a raw_prices join that can miss.
ALTER TABLE signals ADD COLUMN IF NOT EXISTS market_title TEXT;
