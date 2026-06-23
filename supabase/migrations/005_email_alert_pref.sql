-- Per-user toggle for transactional alert emails (signal fired / price / news).
-- Defaults to true so existing users keep receiving the alerts they opted into
-- by creating them. Managed from the Settings page.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alerts boolean NOT NULL DEFAULT true;
