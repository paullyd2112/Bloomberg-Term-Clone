-- Insider trades (SEC Form 4) — officer/director buys & sells
CREATE TABLE IF NOT EXISTS public.insider_trades (
  id            bigserial primary key,
  insider_name  text,
  insider_title text,
  ticker        text,
  transaction   text check (transaction in ('buy', 'sell')),
  shares        bigint,
  price         numeric,
  value_usd     numeric,
  trade_date    date,
  report_date   date,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_insider_trades_date   ON public.insider_trades (trade_date desc);
CREATE INDEX IF NOT EXISTS idx_insider_trades_ticker ON public.insider_trades (ticker, trade_date desc);

ALTER TABLE public.insider_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insider_trades_public_read" ON public.insider_trades
  FOR SELECT USING (true);
