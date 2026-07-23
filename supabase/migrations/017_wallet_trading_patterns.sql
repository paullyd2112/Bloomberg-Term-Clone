-- Add trading_patterns jsonb column to wallet_profiles for behavior analysis.
-- Stores computed patterns: trading style, hold times, timing, sizing, specialization.

ALTER TABLE wallet_profiles
    ADD COLUMN IF NOT EXISTS trading_patterns jsonb DEFAULT NULL;
