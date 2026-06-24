-- On-demand scoring usage log for Elite tier daily limit tracking
create table if not exists public.on_demand_scoring_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  asset_type  text not null,
  identifier  text not null,
  created_at  timestamptz not null default now()
);

create index idx_on_demand_log_user_date
  on public.on_demand_scoring_log (user_id, created_at desc);

alter table public.on_demand_scoring_log enable row level security;

create policy "Users can view own scoring log"
  on public.on_demand_scoring_log for select
  using (auth.uid() = user_id);

create policy "Service role can insert scoring log"
  on public.on_demand_scoring_log for insert
  with check (auth.uid() = user_id);
