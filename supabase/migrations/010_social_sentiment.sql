-- Social sentiment data from ApeWisdom (Reddit mention tracking)
CREATE TABLE IF NOT EXISTS social_sentiment (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'crypto',
  mentions INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  rank_24h_ago INTEGER,
  upvotes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'apewisdom',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_social_sentiment_ticker_captured
  ON social_sentiment (ticker, captured_at DESC);

CREATE INDEX idx_social_sentiment_rank
  ON social_sentiment (asset_type, rank, captured_at DESC);

CREATE UNIQUE INDEX idx_social_sentiment_dedup
  ON social_sentiment (ticker, source, date_trunc('hour', captured_at AT TIME ZONE 'UTC'));

ALTER TABLE social_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read social sentiment"
  ON social_sentiment FOR SELECT TO authenticated USING (true);

GRANT ALL ON social_sentiment TO service_role;
GRANT SELECT ON social_sentiment TO authenticated;
