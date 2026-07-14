-- Add trade_setup JSONB column to signals table.
-- Stores the risk engine's dual-layer output: stop/target (Layer 1)
-- and per-profile position sizing (Layer 2).
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trade_setup JSONB;
