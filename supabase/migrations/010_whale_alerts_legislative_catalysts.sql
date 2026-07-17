-- Whale Alerts: Polymarket CLOB large-order tracking
CREATE TABLE IF NOT EXISTS whale_alerts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  condition_id  text NOT NULL,
  market_title  text NOT NULL,
  market_slug   text DEFAULT '',
  outcome       text NOT NULL,
  side          text NOT NULL CHECK (side IN ('BID', 'ASK')),
  price         double precision NOT NULL,
  size          double precision NOT NULL,
  notional_usd  double precision NOT NULL,
  detected_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whale_alerts_detected ON whale_alerts (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_whale_alerts_notional ON whale_alerts (notional_usd DESC);

ALTER TABLE whale_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON whale_alerts TO service_role;
CREATE POLICY "service_role_all" ON whale_alerts FOR ALL TO service_role USING (true);
CREATE POLICY "authenticated_read" ON whale_alerts FOR SELECT TO authenticated USING (true);


-- Legislative Catalysts: Congress.gov bills with AI classification
CREATE TABLE IF NOT EXISTS legislative_catalysts (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bill_title       text NOT NULL,
  bill_url         text NOT NULL,
  description      text DEFAULT '',
  feed_type        text DEFAULT 'introduced',
  crypto_relevance text DEFAULT 'unknown' CHECK (crypto_relevance IN ('high', 'medium', 'low', 'none', 'unknown')),
  macro_sentiment  text DEFAULT 'neutral' CHECK (macro_sentiment IN ('bullish', 'bearish', 'neutral')),
  ai_summary       text DEFAULT '',
  published_at     timestamptz NOT NULL DEFAULT now(),
  classified_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legislative_published ON legislative_catalysts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_legislative_relevance ON legislative_catalysts (crypto_relevance);

ALTER TABLE legislative_catalysts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON legislative_catalysts TO service_role;
CREATE POLICY "service_role_all" ON legislative_catalysts FOR ALL TO service_role USING (true);
CREATE POLICY "authenticated_read" ON legislative_catalysts FOR SELECT TO authenticated USING (true);
