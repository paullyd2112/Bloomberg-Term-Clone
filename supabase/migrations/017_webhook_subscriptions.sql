-- Webhook subscription table for local agent signal broadcast
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    callback_url    text NOT NULL,
    secret          text NOT NULL,
    label           text DEFAULT '',
    active          boolean DEFAULT true,
    consecutive_failures integer DEFAULT 0,
    last_delivery_at timestamptz,
    created_at      timestamptz DEFAULT now()
);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions TO service_role;
