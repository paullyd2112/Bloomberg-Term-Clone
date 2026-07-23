-- 015_wallet_profiles.sql
-- Wallet intelligence infrastructure for Polymarket smart money tracking,
-- cross-platform ground truth, and whale alert enrichment.

-- ─── Wallet Profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_profiles (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address         text NOT NULL UNIQUE,
    display_name    text,
    total_trades    integer DEFAULT 0,
    total_volume_usd numeric(14,2) DEFAULT 0,
    realized_pnl_usd numeric(14,2) DEFAULT 0,
    win_rate        numeric(5,4),
    avg_trade_size  numeric(12,2),
    top_categories  jsonb DEFAULT '[]',
    first_seen_at   timestamptz,
    last_active_at  timestamptz,
    stats_updated_at timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_profiles_pnl
    ON wallet_profiles (realized_pnl_usd DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_profiles_win_rate
    ON wallet_profiles (win_rate DESC)
    WHERE total_trades >= 20;

-- ─── Wallet Trades ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_trades (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_address  text NOT NULL REFERENCES wallet_profiles(address),
    condition_id    text NOT NULL,
    market_title    text,
    direction       text,
    price           numeric(8,4),
    size            numeric(14,4),
    usd_value       numeric(14,2),
    tx_hash         text UNIQUE,
    traded_at       timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_trades_wallet
    ON wallet_trades (wallet_address, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_trades_market
    ON wallet_trades (condition_id, traded_at DESC);

-- ─── Cross-Platform Ground Truth ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS prediction_cross_platform (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    polymarket_condition_id text NOT NULL,
    platform        text NOT NULL,
    external_id     text NOT NULL,
    external_title  text,
    external_prob   numeric(5,4),
    external_volume numeric(14,2),
    last_fetched_at timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now(),
    UNIQUE (polymarket_condition_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_cross_platform_lookup
    ON prediction_cross_platform (polymarket_condition_id);

-- ─── Whale Alerts: add wallet address columns ─────────────────────────
ALTER TABLE whale_alerts ADD COLUMN IF NOT EXISTS maker_address text;
ALTER TABLE whale_alerts ADD COLUMN IF NOT EXISTS taker_address text;

CREATE INDEX IF NOT EXISTS idx_whale_alerts_maker
    ON whale_alerts (maker_address)
    WHERE maker_address IS NOT NULL;

-- ─── RLS + Grants ──────────────────────────────────────────────────────
ALTER TABLE wallet_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_cross_platform ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_trades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON prediction_cross_platform TO service_role;

GRANT SELECT ON wallet_profiles TO authenticated;
GRANT SELECT ON wallet_trades TO authenticated;
GRANT SELECT ON prediction_cross_platform TO authenticated;

-- Read-only policies for authenticated users
CREATE POLICY "authenticated_read_wallet_profiles"
    ON wallet_profiles FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "authenticated_read_wallet_trades"
    ON wallet_trades FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "authenticated_read_cross_platform"
    ON prediction_cross_platform FOR SELECT TO authenticated
    USING (true);

-- Service role full access
CREATE POLICY "service_role_all_wallet_profiles"
    ON wallet_profiles FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_wallet_trades"
    ON wallet_trades FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_cross_platform"
    ON prediction_cross_platform FOR ALL TO service_role
    USING (true) WITH CHECK (true);
