-- ─── Pleby Conversations ──────────────────────────────────────────────────────
create table public.pleby_conversations (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pleby_conversations_user on public.pleby_conversations (user_id, updated_at desc);

alter table public.pleby_conversations enable row level security;

create policy "pleby_conversations_select_own" on public.pleby_conversations
  for select using (auth.uid() = user_id);
create policy "pleby_conversations_insert_own" on public.pleby_conversations
  for insert with check (auth.uid() = user_id);
create policy "pleby_conversations_update_own" on public.pleby_conversations
  for update using (auth.uid() = user_id);
create policy "pleby_conversations_delete_own" on public.pleby_conversations
  for delete using (auth.uid() = user_id);

-- ─── Pleby Messages ───────────────────────────────────────────────────────────
create table public.pleby_messages (
  id                  bigserial primary key,
  conversation_id     uuid not null references public.pleby_conversations on delete cascade,
  role                text not null check (role in ('user', 'assistant')),
  content             jsonb not null,
  created_at          timestamptz not null default now()
);

create index idx_pleby_messages_conversation on public.pleby_messages (conversation_id, created_at);

alter table public.pleby_messages enable row level security;

-- Access via conversation ownership
create policy "pleby_messages_select_own" on public.pleby_messages
  for select using (
    exists (
      select 1 from public.pleby_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
create policy "pleby_messages_insert_own" on public.pleby_messages
  for insert with check (
    exists (
      select 1 from public.pleby_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- ─── Portfolio Allocations ────────────────────────────────────────────────────
create table public.portfolio_allocations (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.profiles on delete cascade,
  goal               text not null check (goal in ('short_term', 'medium_term', 'long_term')),
  risk_tolerance     text not null check (risk_tolerance in ('conservative', 'moderate', 'aggressive')),
  investment_amount  numeric not null,
  allocations        jsonb not null default '[]',
  overall_reasoning  text,
  generated_at       timestamptz not null default now()
);

create index idx_portfolio_allocations_user on public.portfolio_allocations (user_id, generated_at desc);

alter table public.portfolio_allocations enable row level security;

create policy "portfolio_allocations_select_own" on public.portfolio_allocations
  for select using (auth.uid() = user_id);
create policy "portfolio_allocations_insert_own" on public.portfolio_allocations
  for insert with check (auth.uid() = user_id);

-- ─── Newsletter Subscribers ───────────────────────────────────────────────────
create table public.newsletter_subscribers (
  id         bigserial primary key,
  email      text not null unique,
  confirmed  boolean not null default false,
  created_at timestamptz not null default now()
);

-- No RLS needed — insert-only from public endpoint, reads only via service role
alter table public.newsletter_subscribers enable row level security;

-- ─── Redemption Code Audit Column ─────────────────────────────────────────────
alter table public.redemption_codes
  add column if not exists generated_by text;

-- ─── RPC Fix: fetch real tier instead of trusting caller-supplied p_tier ──────
create or replace function public.get_dashboard_signals(
  p_user_id  uuid,
  p_tier     text,  -- kept for backwards-compat but ignored; real tier fetched below
  p_limit    integer default 20
)
returns setof public.signals
language plpgsql stable security definer as $$
declare
  real_tier text;
begin
  -- Fetch the actual tier from profiles — do not trust the caller-supplied p_tier
  select tier into real_tier
  from public.profiles
  where id = p_user_id;

  if real_tier is null then
    return;
  end if;

  return query
    with user_watchlist as (
      select identifier
      from public.watchlist
      where user_id = p_user_id
    ),
    cutoff as (
      select case
        when real_tier = 'free'
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
end;
$$;
