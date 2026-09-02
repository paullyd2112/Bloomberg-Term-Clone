-- Challenge system: prop firm challenge templates + user challenges + trade log

-- Firm templates (presets from real prop firms)
CREATE TABLE IF NOT EXISTS challenge_templates (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    firm_name       text NOT NULL,
    plan_name       text NOT NULL,
    asset_class     text NOT NULL DEFAULT 'crypto',
    account_size    numeric(14,2) NOT NULL,
    profit_target_pct numeric(5,2),
    max_drawdown_pct  numeric(5,2),
    daily_loss_pct    numeric(5,2),
    max_risk_per_trade_pct numeric(5,2),
    consistency_rule_pct   numeric(5,2),
    min_trading_days  integer,
    max_days          integer,
    max_open_positions integer,
    leverage          numeric(5,2),
    profit_split_pct  numeric(5,2),
    challenge_fee     numeric(8,2),
    notes             text,
    is_active         boolean DEFAULT true,
    created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_challenge_templates_active ON challenge_templates (is_active, asset_class);

-- User challenges (active challenge a user is running)
CREATE TABLE IF NOT EXISTS user_challenges (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id     bigint REFERENCES challenge_templates(id),
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'passed', 'failed', 'abandoned')),
    -- Challenge parameters (copied from template or custom)
    firm_name       text NOT NULL DEFAULT 'Custom',
    plan_name       text NOT NULL DEFAULT 'Custom',
    asset_class     text NOT NULL DEFAULT 'crypto',
    account_size    numeric(14,2) NOT NULL,
    profit_target_pct numeric(5,2),
    max_drawdown_pct  numeric(5,2),
    daily_loss_pct    numeric(5,2),
    max_risk_per_trade_pct numeric(5,2),
    consistency_rule_pct   numeric(5,2),
    min_trading_days  integer,
    max_days          integer,
    max_open_positions integer,
    -- Tracking state
    current_balance   numeric(14,2) NOT NULL,
    peak_balance      numeric(14,2) NOT NULL,
    total_pnl         numeric(14,2) NOT NULL DEFAULT 0,
    current_drawdown  numeric(14,2) NOT NULL DEFAULT 0,
    max_drawdown_hit  numeric(14,2) NOT NULL DEFAULT 0,
    trading_days      integer NOT NULL DEFAULT 0,
    total_trades      integer NOT NULL DEFAULT 0,
    wins              integer NOT NULL DEFAULT 0,
    losses            integer NOT NULL DEFAULT 0,
    best_day_pnl      numeric(14,2) NOT NULL DEFAULT 0,
    worst_day_pnl     numeric(14,2) NOT NULL DEFAULT 0,
    started_at        timestamptz NOT NULL DEFAULT now(),
    ended_at          timestamptz,
    ended_reason      text,
    created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_user_challenges_user ON user_challenges (user_id, status);
CREATE INDEX idx_user_challenges_active ON user_challenges (user_id)
    WHERE status = 'active';

-- Challenge trade log (individual trades within a challenge)
CREATE TABLE IF NOT EXISTS challenge_trades (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    challenge_id    bigint NOT NULL REFERENCES user_challenges(id) ON DELETE CASCADE,
    signal_id       bigint,
    asset_type      text NOT NULL,
    identifier      text NOT NULL,
    direction       text NOT NULL,
    entry_price     numeric(16,8) NOT NULL,
    exit_price      numeric(16,8),
    size            numeric(14,8) NOT NULL,
    risk_dollars    numeric(14,2) NOT NULL,
    pnl             numeric(14,2),
    status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'stopped_out', 'target_hit')),
    stop_loss       numeric(16,8),
    take_profit     numeric(16,8),
    opened_at       timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,
    trade_day       date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_challenge_trades_challenge ON challenge_trades (challenge_id, status);
CREATE INDEX idx_challenge_trades_day ON challenge_trades (challenge_id, trade_day);

-- Daily snapshots for consistency tracking
CREATE TABLE IF NOT EXISTS challenge_daily_snapshots (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    challenge_id    bigint NOT NULL REFERENCES user_challenges(id) ON DELETE CASCADE,
    snapshot_date   date NOT NULL,
    starting_balance numeric(14,2) NOT NULL,
    ending_balance   numeric(14,2) NOT NULL,
    day_pnl          numeric(14,2) NOT NULL DEFAULT 0,
    trades_count     integer NOT NULL DEFAULT 0,
    wins             integer NOT NULL DEFAULT 0,
    losses           integer NOT NULL DEFAULT 0,
    max_drawdown_intraday numeric(14,2) NOT NULL DEFAULT 0,
    daily_loss_limit_used_pct numeric(5,2) NOT NULL DEFAULT 0,
    UNIQUE (challenge_id, snapshot_date)
);

CREATE INDEX idx_challenge_snapshots ON challenge_daily_snapshots (challenge_id, snapshot_date DESC);

-- RLS
ALTER TABLE challenge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Templates: everyone can read, only service_role writes
CREATE POLICY "templates_read" ON challenge_templates FOR SELECT USING (true);
GRANT SELECT ON challenge_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_templates TO service_role;

-- User challenges: users see only their own
CREATE POLICY "challenges_own" ON user_challenges FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_challenges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_challenges TO service_role;

-- Challenge trades: users see trades on their own challenges
CREATE POLICY "trades_own" ON challenge_trades FOR ALL
    USING (challenge_id IN (SELECT id FROM user_challenges WHERE user_id = auth.uid()))
    WITH CHECK (challenge_id IN (SELECT id FROM user_challenges WHERE user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_trades TO service_role;

-- Daily snapshots: same pattern
CREATE POLICY "snapshots_own" ON challenge_daily_snapshots FOR ALL
    USING (challenge_id IN (SELECT id FROM user_challenges WHERE user_id = auth.uid()))
    WITH CHECK (challenge_id IN (SELECT id FROM user_challenges WHERE user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_daily_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_daily_snapshots TO service_role;

-- Seed challenge templates from real prop firms
INSERT INTO challenge_templates (slug, firm_name, plan_name, asset_class, account_size, profit_target_pct, max_drawdown_pct, daily_loss_pct, max_risk_per_trade_pct, consistency_rule_pct, min_trading_days, max_days, max_open_positions, leverage, profit_split_pct, challenge_fee, notes) VALUES
-- Crypto prop firms
('breakout-classic-5k',   'Breakout',          'Classic $5K',    'crypto', 5000,   9,  6,  3, NULL, NULL, NULL, NULL, NULL, 5,   80,  20,  'Kraken-backed. No min days, no consistency rule. USDC payouts.'),
('breakout-classic-25k',  'Breakout',          'Classic $25K',   'crypto', 25000,  9,  6,  3, NULL, NULL, NULL, NULL, NULL, 5,   80,  125, NULL),
('breakout-classic-50k',  'Breakout',          'Classic $50K',   'crypto', 50000,  9,  6,  3, NULL, NULL, NULL, NULL, NULL, 5,   80,  250, NULL),
('breakout-classic-100k', 'Breakout',          'Classic $100K',  'crypto', 100000, 9,  6,  3, NULL, NULL, NULL, NULL, NULL, 5,   85,  500, NULL),
('breakout-classic-200k', 'Breakout',          'Classic $200K',  'crypto', 200000, 9,  6,  3, NULL, NULL, NULL, NULL, NULL, 5,   90,  1090, NULL),
('breakout-pro-25k',      'Breakout',          'Pro $25K',       'crypto', 25000,  10, 4,  3, NULL, NULL, NULL, NULL, NULL, 5,   80,  175, 'Tighter drawdown than Classic'),
('breakout-turbo-25k',    'Breakout',          'Turbo $25K',     'crypto', 25000,  12, 3,  3, NULL, NULL, NULL, NULL, NULL, 5,   80,  225, 'Tightest drawdown, highest target'),
('hyrotrader-1step-10k',  'HyroTrader',        '1-Step $10K',    'crypto', 10000,  10, 6,  4, 3,    40,   10,  NULL, NULL, NULL, 80,  119, 'Bybit-based. Mandatory stop-loss. Max 40% profit from single trade.'),
('hyrotrader-2step-25k',  'HyroTrader',        '2-Step $25K',    'crypto', 25000,  10, 10, 5, 3,    40,   5,   NULL, NULL, NULL, 85,  299, 'Phase 2: 5% target, 5 min days'),
('bitfunded-25k',         'Bitfunded',         '2-Step $25K',    'crypto', 25000,  8,  8,  4, NULL, NULL, NULL, NULL, NULL, NULL, 80,  299, 'Multiple simultaneous accounts allowed'),
('bitfunded-50k',         'Bitfunded',         '2-Step $50K',    'crypto', 50000,  8,  8,  4, NULL, NULL, NULL, NULL, NULL, NULL, 80,  499, NULL),
('cft-2step-25k',         'Crypto Fund Trader', '2-Phase $25K',  'crypto', 25000,  8,  10, 5, 2,    NULL, NULL, NULL, NULL, NULL, 70,  199, 'Profit split scales 50-90% with performance'),
('cft-2step-100k',        'Crypto Fund Trader', '2-Phase $100K', 'crypto', 100000, 8,  10, 5, 2,    NULL, NULL, NULL, NULL, NULL, 70,  549, NULL),
('ftmo-standard-25k',     'FTMO',              'Standard $25K',  'crypto', 25000,  8,  10, 5, NULL, NULL, 4,   NULL, NULL, 50,  85,  250, 'Phase 2: 5% target. Leverage capped at 1:50 above $50K.'),
('ftmo-standard-100k',    'FTMO',              'Standard $100K', 'crypto', 100000, 8,  10, 5, NULL, NULL, 4,   NULL, NULL, 50,  85,  540, NULL),
('ftmo-aggressive-25k',   'FTMO',              'Aggressive $25K','crypto', 25000,  20, 20, 10, NULL, NULL, 4,   NULL, NULL, 100, 85,  250, 'Higher targets and limits'),
-- Prediction market prop firms
('propmarket-5k',         'PropMarket',        '$5K',            'prediction', 5000,   20, 10, NULL, NULL, 10,   NULL, 30,  NULL, NULL, 70,  59,  'First prediction market prop firm. 20-80c price band. Per-market consistency.'),
('propmarket-25k',        'PropMarket',        '$25K',           'prediction', 25000,  20, 10, NULL, NULL, 10,   NULL, 30,  NULL, NULL, 80,  149, NULL),
('propmarket-100k',       'PropMarket',        '$100K',          'prediction', 100000, 20, 10, NULL, NULL, 10,   NULL, 30,  NULL, NULL, 90,  499, NULL),
('funding-predicts-10k',  'Funding Predicts',  '$10K',           'prediction', 10000,  6,  NULL, NULL, NULL, 35,  5,   30,  10,   NULL, 80,  49,  'Min 0.5% volume per trading day. No bots.'),
('funding-predicts-50k',  'Funding Predicts',  '$50K',           'prediction', 50000,  6,  NULL, NULL, NULL, 35,  5,   30,  10,   NULL, 85,  199, NULL),
('funding-predicts-150k', 'Funding Predicts',  '$150K',          'prediction', 150000, 6,  NULL, NULL, NULL, 35,  5,   30,  10,   NULL, 90,  499, NULL),
('polyfundr-10k',         'PolyFundr',         '$10K',           'prediction', 10000,  30, 20, 10,  5,    30,   NULL, NULL, NULL, NULL, 90,  NULL, '30% profit target, 5% max risk per trade'),
('polyfundr-50k',         'PolyFundr',         '$50K',           'prediction', 50000,  30, 20, 10,  5,    30,   NULL, NULL, NULL, NULL, 90,  NULL, NULL),
-- Multi-asset (crypto + events)
('omen-funded',           'Omen',              'Funded',         'both',   100000, NULL, NULL, 5, NULL, NULL, 5,   NULL, NULL, NULL, 90,  NULL, 'Susa Ventures-backed. Crypto + sports + politics. Can pass in 1 trade. No profit caps.')
ON CONFLICT (slug) DO NOTHING;
