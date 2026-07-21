-- Newsletter delivery frequency preference per subscriber.
-- Default 'daily' preserves existing behavior for all current subscribers.
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS newsletter_frequency text NOT NULL DEFAULT 'daily'
  CHECK (newsletter_frequency IN ('daily', 'weekdays', 'every_other_day', 'weekly', 'weekends'));
