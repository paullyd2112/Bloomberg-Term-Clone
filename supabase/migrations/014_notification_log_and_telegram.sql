-- Notification delivery log — replaces in-memory cooldown dict, gives delivery analytics.
CREATE TABLE IF NOT EXISTS public.notification_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    signal_id   bigint,
    channel     text NOT NULL CHECK (channel IN ('email', 'push', 'telegram')),
    status      text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
    asset_type  text,
    identifier  text,
    direction   text,
    sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_cooldown
    ON public.notification_log (asset_type, identifier, direction, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_user
    ON public.notification_log (user_id, sent_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.notification_log TO service_role;

-- Telegram bot linking on profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS telegram_chat_id text,
    ADD COLUMN IF NOT EXISTS telegram_link_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
    ON public.profiles (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_link_code
    ON public.profiles (telegram_link_code) WHERE telegram_link_code IS NOT NULL;
