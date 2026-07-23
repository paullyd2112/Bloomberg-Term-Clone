-- 016_prediction_smart_money.sql
-- Pre-computed smart money consensus for frontend reads.
-- Populated during prediction scoring runs; one row per condition_id.

CREATE TABLE IF NOT EXISTS prediction_smart_money (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    condition_id        text NOT NULL UNIQUE,
    consensus_direction text NOT NULL,       -- YES / NO / SPLIT
    consensus_strength  numeric(5,2) NOT NULL, -- 0.00-1.00
    wallet_count        integer NOT NULL DEFAULT 0,
    total_volume_usd    numeric(14,2) DEFAULT 0,
    top_wallet_pnl      numeric(14,2) DEFAULT 0,
    breakdown_yes       integer DEFAULT 0,
    breakdown_no        integer DEFAULT 0,
    updated_at          timestamptz DEFAULT now(),
    created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prediction_smart_money_condition
    ON prediction_smart_money (condition_id);

ALTER TABLE prediction_smart_money ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON prediction_smart_money TO service_role;
GRANT SELECT ON prediction_smart_money TO authenticated;

CREATE POLICY "authenticated_read_smart_money"
    ON prediction_smart_money FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "service_role_all_smart_money"
    ON prediction_smart_money FOR ALL TO service_role
    USING (true) WITH CHECK (true);
