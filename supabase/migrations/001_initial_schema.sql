-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id                    uuid references auth.users on delete cascade primary key,
  tier                  text not null default 'free'
                          check (tier in ('free', 'pro', 'elite')),
  billing_interval      text
                          check (billing_interval in ('monthly', 'quarterly', 'annual', 'lifetime')),
  stripe_customer_id    text,
  stripe_subscription_id text,
  trial_ends_at         timestamptz,
  referral_code         text unique,
  referred_by           uuid references public.profiles(id),
  onboarding_completed  boolean not null default false,
  trading_experience    text,
  asset_preferences     text[],
  created_at            timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Raw Prices ───────────────────────────────────────────────────────────────
create table public.raw_prices (
  id           bigserial primary key,
  asset_type   text not null check (asset_type in ('stock', 'crypto', 'prediction')),
  identifier   text not null,
  price        numeric,
  volume       numeric,
  change_24h   numeric,
  metadata     jsonb,
  captured_at  timestamptz not null default now()
);

-- ─── News Items ───────────────────────────────────────────────────────────────
create table public.news_items (
  id              bigserial primary key,
  asset_type      text,
  identifier      text,
  headline        text not null,
  source          text,
  url             text,
  sentiment_score numeric,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ─── Signals ──────────────────────────────────────────────────────────────────
create table public.signals (
  id               bigserial primary key,
  asset_type       text not null,
  identifier       text not null,
  direction        text check (direction in ('BUY', 'SELL', 'HOLD', 'YES', 'NO')),
  confidence       integer check (confidence between 0 and 100),
  reasoning        text not null,
  time_horizon     text check (time_horizon in ('intraday', 'swing', 'longterm', 'before_close')),
  price_at_signal  numeric,
  news_context     text[],
  is_backtest      boolean not null default false,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  outcome          text check (outcome in ('WIN', 'LOSS', 'NEUTRAL', 'PENDING')) default 'PENDING',
  outcome_price    numeric
);

-- ─── Watchlist ────────────────────────────────────────────────────────────────
create table public.watchlist (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  asset_type  text not null,
  identifier  text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, asset_type, identifier)
);

-- ─── Positions ────────────────────────────────────────────────────────────────
create table public.positions (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  asset_type  text not null,
  identifier  text not null,
  direction   text check (direction in ('LONG', 'SHORT', 'YES', 'NO')),
  entry_price numeric not null,
  size        numeric not null,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  exit_price  numeric,
  pnl         numeric
);

-- ─── Alerts ───────────────────────────────────────────────────────────────────
create table public.alerts (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles on delete cascade,
  asset_type    text not null,
  identifier    text not null,
  trigger_type  text check (trigger_type in ('signal_fired', 'price_threshold', 'news_drop')),
  threshold     numeric,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_fired_at timestamptz
);

-- ─── Options Flow ─────────────────────────────────────────────────────────────
create table public.options_flow (
  id               bigserial primary key,
  ticker           text not null,
  contract_type    text check (contract_type in ('call', 'put')),
  strike           numeric,
  expiry           date,
  volume           integer,
  open_interest    integer,
  volume_oi_ratio  numeric,
  premium_usd      numeric,
  is_unusual       boolean not null default false,
  captured_at      timestamptz not null default now()
);

-- ─── Short Interest ───────────────────────────────────────────────────────────
create table public.short_interest (
  id               bigserial primary key,
  ticker           text not null,
  short_float_pct  numeric,
  short_ratio      numeric,
  shares_short     bigint,
  vs_previous      text,
  is_high_short    boolean not null default false,
  captured_at      timestamptz not null default now()
);

-- ─── Earnings Events ──────────────────────────────────────────────────────────
create table public.earnings_events (
  id                       bigserial primary key,
  ticker                   text not null,
  report_date              date,
  report_time              text check (report_time in ('before_market', 'after_market')),
  consensus_eps            numeric,
  whisper_eps              numeric,
  whisper_vs_consensus_pct numeric,
  last_quarter_eps         numeric,
  created_at               timestamptz not null default now()
);

-- ─── Congressional Trades ─────────────────────────────────────────────────────
create table public.congressional_trades (
  id           bigserial primary key,
  politician   text,
  party        text,
  ticker       text,
  transaction  text check (transaction in ('buy', 'sell')),
  amount_range text,
  trade_date   date,
  report_date  date,
  created_at   timestamptz not null default now()
);

-- ─── Daily Briefings ──────────────────────────────────────────────────────────
create table public.daily_briefings (
  id               bigserial primary key,
  date             date unique,
  headline         text,
  content_json     jsonb,
  top_signal_ids   bigint[],
  day_tone         text check (day_tone in ('cautious', 'opportunistic', 'volatile', 'quiet')),
  generated_at     timestamptz not null default now()
);

-- ─── Referrals ────────────────────────────────────────────────────────────────
create table public.referrals (
  id                bigserial primary key,
  referrer_id       uuid references public.profiles on delete cascade,
  referred_id       uuid references public.profiles on delete cascade,
  status            text check (status in ('pending', 'converted', 'rewarded')),
  reward_granted_at timestamptz,
  created_at        timestamptz not null default now()
);

-- ─── Asset Accuracy ───────────────────────────────────────────────────────────
create table public.asset_accuracy (
  identifier       text not null,
  asset_type       text not null,
  total_signals    integer not null default 0,
  wins             integer not null default 0,
  losses           integer not null default 0,
  neutrals         integer not null default 0,
  win_rate         numeric,
  avg_confidence   numeric,
  last_signal_at   timestamptz,
  last_updated     timestamptz not null default now(),
  primary key (identifier, asset_type)
);

-- ─── AppSumo / Redemption Codes ───────────────────────────────────────────────
create table public.redemption_codes (
  id           bigserial primary key,
  code         text not null unique,
  redeemed_by  uuid references public.profiles,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index idx_signals_asset_created   on public.signals (asset_type, identifier, created_at desc);
create index idx_signals_created_conf    on public.signals (created_at desc, confidence desc);
create index idx_signals_identifier      on public.signals (identifier, created_at desc);
create index idx_signals_outcome         on public.signals (outcome, resolved_at);
create index idx_raw_prices_identifier   on public.raw_prices (identifier, captured_at desc);
create index idx_news_identifier         on public.news_items (identifier, published_at desc);
create index idx_congressional_date      on public.congressional_trades (trade_date desc);
create index idx_options_flow_ticker     on public.options_flow (ticker, captured_at desc);
create index idx_watchlist_user          on public.watchlist (user_id);
create index idx_positions_user          on public.positions (user_id, closed_at);
create index idx_alerts_user_active      on public.alerts (user_id, is_active);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles             enable row level security;
alter table public.watchlist            enable row level security;
alter table public.positions            enable row level security;
alter table public.alerts               enable row level security;
alter table public.referrals            enable row level security;
alter table public.signals              enable row level security;
alter table public.news_items           enable row level security;
alter table public.daily_briefings      enable row level security;
alter table public.asset_accuracy       enable row level security;
alter table public.congressional_trades enable row level security;
alter table public.earnings_events      enable row level security;
alter table public.raw_prices           enable row level security;
alter table public.options_flow         enable row level security;
alter table public.short_interest       enable row level security;
alter table public.redemption_codes     enable row level security;

-- Profiles: own data only
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Watchlist: own data only
create policy "watchlist_select_own" on public.watchlist
  for select using (auth.uid() = user_id);
create policy "watchlist_insert_own" on public.watchlist
  for insert with check (auth.uid() = user_id);
create policy "watchlist_delete_own" on public.watchlist
  for delete using (auth.uid() = user_id);

-- Positions: own data only
create policy "positions_select_own" on public.positions
  for select using (auth.uid() = user_id);
create policy "positions_insert_own" on public.positions
  for insert with check (auth.uid() = user_id);
create policy "positions_update_own" on public.positions
  for update using (auth.uid() = user_id);

-- Alerts: own data only
create policy "alerts_select_own" on public.alerts
  for select using (auth.uid() = user_id);
create policy "alerts_insert_own" on public.alerts
  for insert with check (auth.uid() = user_id);
create policy "alerts_update_own" on public.alerts
  for update using (auth.uid() = user_id);
create policy "alerts_delete_own" on public.alerts
  for delete using (auth.uid() = user_id);

-- Referrals: own data only
create policy "referrals_select_own" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy "referrals_insert_own" on public.referrals
  for insert with check (auth.uid() = referrer_id);

-- Public read tables
create policy "signals_public_read" on public.signals
  for select using (true);
create policy "news_public_read" on public.news_items
  for select using (true);
create policy "briefings_public_read" on public.daily_briefings
  for select using (true);
create policy "accuracy_public_read" on public.asset_accuracy
  for select using (true);
create policy "congressional_public_read" on public.congressional_trades
  for select using (true);
create policy "earnings_public_read" on public.earnings_events
  for select using (true);

-- Service role only (data service writes via service role key, bypasses RLS)
-- raw_prices, options_flow, short_interest, redemption_codes: no public policies
-- Service role key bypasses RLS entirely — these tables are write-only from Python

-- ─── RPC: get_dashboard_signals ───────────────────────────────────────────────
create or replace function public.get_dashboard_signals(
  p_user_id  uuid,
  p_tier     text,
  p_limit    integer default 20
)
returns setof public.signals
language sql stable security definer as $$
  with user_watchlist as (
    select identifier
    from public.watchlist
    where user_id = p_user_id
  ),
  cutoff as (
    select case
      when p_tier = 'free'
      then now() - interval '30 minutes'
      else now()
    end as ts
  )
  select s.*
  from public.signals s, cutoff c
  where s.created_at <= c.ts
    and s.is_backtest = false
  order by
    (s.identifier in (select identifier from user_watchlist)) desc,
    s.created_at desc,
    s.confidence desc
  limit p_limit;
$$;
