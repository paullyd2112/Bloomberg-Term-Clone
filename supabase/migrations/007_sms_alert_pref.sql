ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_alerts boolean NOT NULL DEFAULT false;
