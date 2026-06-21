-- Macro events table (was referenced in code but never created in migrations)
CREATE TABLE IF NOT EXISTS public.macro_events (
  id           bigserial primary key,
  event_date   date not null,
  event_time   text,
  event_name   text not null,
  category     text check (category in ('fed', 'inflation', 'employment', 'gdp', 'consumer', 'earnings', 'other')),
  importance   text check (importance in ('high', 'medium', 'low')),
  forecast     numeric,
  previous     numeric,
  actual       numeric,
  created_at   timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_macro_events_date ON public.macro_events (event_date);

ALTER TABLE public.macro_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "macro_events_public_read" ON public.macro_events
  FOR SELECT USING (true);
