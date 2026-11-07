-- Contatori aggregati per il demand test Canapalandia.
-- Nessun IP, user-agent, email, URL completo o identificatore utente viene salvato.
-- Applicare QUESTO file solo al progetto Supabase configurato in produzione tramite
-- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.demand_test_daily_counts (
  day date not null default ((now() at time zone 'Europe/Rome')::date),
  campaign text not null,
  event_type text not null,
  source text not null default 'unknown',
  count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, campaign, event_type, source),
  constraint demand_test_campaign_check
    check (campaign in ('hemp-food-001')),
  constraint demand_test_event_type_check
    check (event_type in ('view', 'interest_click', 'signup')),
  constraint demand_test_source_check
    check (source in ('direct', 'internal', 'search', 'social', 'newsletter', 'ai', 'referral', 'unknown')),
  constraint demand_test_count_check
    check (count >= 0)
);

alter table public.demand_test_daily_counts enable row level security;

-- Nessun accesso dal browser: il server usa esclusivamente service_role.
revoke all on table public.demand_test_daily_counts from anon, authenticated;
grant select, insert, update on table public.demand_test_daily_counts to service_role;

create or replace function public.increment_demand_test_counter(
  p_campaign text,
  p_event_type text,
  p_source text default 'unknown'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.demand_test_daily_counts (
    day,
    campaign,
    event_type,
    source,
    count,
    updated_at
  )
  values (
    (now() at time zone 'Europe/Rome')::date,
    p_campaign,
    p_event_type,
    p_source,
    1,
    now()
  )
  on conflict (day, campaign, event_type, source)
  do update set
    count = public.demand_test_daily_counts.count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.increment_demand_test_counter(text, text, text) from public, anon, authenticated;
grant execute on function public.increment_demand_test_counter(text, text, text) to service_role;

comment on table public.demand_test_daily_counts is
  'Aggregated daily demand-test counters only; contains no user identifiers or contact data.';
