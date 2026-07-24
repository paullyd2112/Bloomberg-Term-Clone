ALTER TABLE whale_alerts ADD COLUMN IF NOT EXISTS maker_win_rate numeric(5,4);
ALTER TABLE whale_alerts ADD COLUMN IF NOT EXISTS maker_pnl_usd numeric(14,2);
