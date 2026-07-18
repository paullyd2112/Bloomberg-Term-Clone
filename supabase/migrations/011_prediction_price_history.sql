-- Append-only price snapshots for prediction markets.
-- One row per market per ingestion run (~every 30 min), used for sparklines
-- on the predictions browse tab.
CREATE TABLE IF NOT EXISTS prediction_price_history (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  condition_id TEXT NOT NULL,
  yes_price    NUMERIC NOT NULL,
  no_price     NUMERIC,
  volume       NUMERIC,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pred_history_condition_captured
  ON prediction_price_history (condition_id, captured_at DESC);

ALTER TABLE prediction_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read prediction price history"
  ON prediction_price_history FOR SELECT TO authenticated USING (true);

GRANT ALL ON prediction_price_history TO service_role;
GRANT SELECT ON prediction_price_history TO authenticated;
