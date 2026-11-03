-- =============================================================================
-- Canapalandia · Advertising Manager (MVP inattivo)
-- Migrazione versionata: NON applicata ad alcun ambiente.
-- Applicare solo dopo approvazione umana, prima su un database isolato.
-- Rollback: supabase/migrations/20261103120000_ads_manager.down.sql
--
-- Principi:
-- - nessun dato commerciale reale, nessuna campagna creata da questa migrazione;
-- - unico seed: la posizione tecnica `article_end` (configurazione, non prenotazione);
-- - RLS attiva su ogni tabella senza policy: accesso solo da service_role (server-side);
-- - esclusività garantita dal database con un vincolo EXCLUDE (btree_gist);
-- - stati `scheduled`/`active` impossibili senza checklist completa e dati non sintetici.
-- =============================================================================

-- Estensione fuori da `public` (advisor Supabase 0014). Le opclass di default si risolvono per tipo,
-- indipendentemente dallo schema.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Inserzionisti
-- -----------------------------------------------------------------------------
create table if not exists public.ads_advertisers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  legal_name text not null check (length(legal_name) between 2 and 200),
  display_name text not null check (length(display_name) between 2 and 120),
  website_url text check (website_url is null or website_url ~ '^https://'),
  -- Domini di destinazione autorizzati per i clic (allowlist per inserzionista)
  allowed_domains text[] not null default '{}',
  contact_name text,
  contact_email text,
  contact_phone text,
  negotiation_status text not null default 'prospect'
    check (negotiation_status in ('prospect', 'negotiating', 'offer_sent', 'confirmed', 'declined', 'paused', 'archived')),
  -- true = dato di test: mai pubblicabile (vedi vincolo su ads_campaigns)
  is_synthetic boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Posizioni pubblicitarie (catalogo tecnico)
-- -----------------------------------------------------------------------------
create table if not exists public.ads_positions (
  code text primary key check (code ~ '^[a-z0-9_]{3,40}$'),
  label text not null,
  description text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.ads_positions (code, label, description, is_enabled)
values ('article_end', 'Fine articolo', 'Box sponsorizzato dopo il corpo dell''articolo, prima di condivisione e correlati.', true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Campagne
-- -----------------------------------------------------------------------------
create table if not exists public.ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  advertiser_id uuid not null references public.ads_advertisers (id) on delete restrict,
  name text not null check (length(name) between 2 and 200),
  contract_type text not null default 'exclusive_time'
    check (contract_type in ('exclusive_time', 'shared_rotation')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency char(3) not null default 'EUR',
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'rejected')),
  auto_renew boolean not null default false,
  -- Predisposizione campagne condivise (non attivabili nell'MVP)
  impression_goal integer check (impression_goal is null or impression_goal > 0),
  rotation_weight smallint check (rotation_weight is null or rotation_weight between 1 and 100),
  is_synthetic boolean not null default false,

  -- Checklist di attivazione (passi 1-9 della procedura)
  written_confirmation_at timestamptz,
  written_confirmation_ref text,
  commercial_terms_approved_at timestamptz,
  availability_verified_at timestamptz,
  tax_contract_verified_at timestamptz,
  tracking_tested_at timestamptz,
  tracking_privacy_reviewed_at timestamptz,
  dates_confirmed_at timestamptz,
  activation_authorized_at timestamptz,
  activation_authorized_by text,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ads_campaigns_dates check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint ads_campaigns_no_auto_renew check (auto_renew = false),
  -- MVP: le campagne condivise non possono uscire dalla bozza
  constraint ads_campaigns_shared_not_in_mvp check (
    contract_type = 'exclusive_time' or status in ('draft', 'cancelled', 'rejected')
  ),
  constraint ads_campaigns_approval_gate check (
    status not in ('approved', 'scheduled', 'active', 'paused', 'completed')
    or (
      written_confirmation_at is not null
      and commercial_terms_approved_at is not null
      and price_cents is not null
      and availability_verified_at is not null
      and tax_contract_verified_at is not null
    )
  ),
  constraint ads_campaigns_activation_gate check (
    status not in ('scheduled', 'active', 'paused', 'completed')
    or (
      is_synthetic = false
      and tracking_tested_at is not null
      and tracking_privacy_reviewed_at is not null
      and dates_confirmed_at is not null
      and activation_authorized_at is not null
      and coalesce(length(activation_authorized_by), 0) > 0
    )
  )
);

create index if not exists ads_campaigns_status_idx on public.ads_campaigns (status, starts_on, ends_on);
create index if not exists ads_campaigns_advertiser_idx on public.ads_campaigns (advertiser_id);

-- -----------------------------------------------------------------------------
-- Creatività
-- -----------------------------------------------------------------------------
create table if not exists public.ads_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ads_campaigns (id) on delete cascade,
  label text not null check (length(label) between 2 and 120),
  -- Immagine solo self-hosted sotto /ads/ (nessun asset esterno, nessun tracker di terze parti)
  image_path text check (image_path is null or image_path ~ '^/ads/[a-z0-9][a-z0-9/_.-]*\.(webp|png|jpg|jpeg|avif)$'),
  image_width integer check (image_width is null or image_width between 1 and 4000),
  image_height integer check (image_height is null or image_height between 1 and 4000),
  alt_text text not null check (length(alt_text) between 2 and 200),
  headline text check (headline is null or length(headline) <= 120),
  body text check (body is null or length(body) <= 300),
  cta_label text check (cta_label is null or length(cta_label) <= 40),
  destination_url text not null check (destination_url ~ '^https://' and length(destination_url) <= 2000),
  sponsor_label text not null default 'Contenuto sponsorizzato',
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by text,
  landing_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ads_creatives_approval check (
    review_status <> 'approved' or (approved_at is not null and landing_reviewed_at is not null)
  )
);

create index if not exists ads_creatives_campaign_idx on public.ads_creatives (campaign_id);

-- Una creatività approvata non può cambiare dopo l'approvazione della campagna
create or replace function public.ads_creatives_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.ads_campaigns where id = coalesce(new.campaign_id, old.campaign_id);
  if v_status not in ('draft', 'pending_approval') then
    raise exception 'ads: creatività modificabili solo con la campagna in bozza o in approvazione';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists ads_creatives_guard on public.ads_creatives;
create trigger ads_creatives_guard
  before insert or update or delete on public.ads_creatives
  for each row execute function public.ads_creatives_guard();

-- -----------------------------------------------------------------------------
-- Posizionamenti (articolo × posizione × periodo) con esclusività garantita dal DB
-- -----------------------------------------------------------------------------
create table if not exists public.ads_placements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ads_campaigns (id) on delete cascade,
  creative_id uuid references public.ads_creatives (id) on delete set null,
  article_slug text not null check (article_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'),
  position_code text not null references public.ads_positions (code),
  -- Copiati dalla campagna dai trigger: non modificarli direttamente
  starts_on date not null,
  ends_on date not null,
  is_blocking boolean not null default false,
  period daterange generated always as (daterange(starts_on, ends_on, '[]')) stored,
  created_at timestamptz not null default now(),
  unique (campaign_id, article_slug, position_code),
  constraint ads_placements_no_overlap exclude using gist (
    article_slug with =,
    position_code with =,
    period with &&
  ) where (is_blocking)
);

create index if not exists ads_placements_lookup_idx on public.ads_placements (article_slug, position_code, starts_on, ends_on);
create index if not exists ads_placements_creative_idx on public.ads_placements (creative_id);
create index if not exists ads_placements_position_idx on public.ads_placements (position_code);

-- Stati che occupano lo spazio (una bozza o una proposta non blocca nulla)
create or replace function public.ads_status_is_blocking(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('approved', 'scheduled', 'active', 'paused');
$$;

create or replace function public.ads_placements_sync_from_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c record;
begin
  select starts_on, ends_on, status into c from public.ads_campaigns where id = new.campaign_id;
  if not found then
    raise exception 'ads: campagna % inesistente', new.campaign_id;
  end if;
  -- Gli spazi si definiscono solo in bozza: dopo, cambia solo ciò che propaga la campagna
  if c.status <> 'draft' and (
    tg_op = 'INSERT'
    or (new.article_slug, new.position_code, new.creative_id, new.campaign_id)
       is distinct from (old.article_slug, old.position_code, old.creative_id, old.campaign_id)
  ) then
    raise exception 'ads: i posizionamenti sono modificabili solo con la campagna in bozza';
  end if;
  new.starts_on := c.starts_on;
  new.ends_on := c.ends_on;
  new.is_blocking := public.ads_status_is_blocking(c.status);
  return new;
end;
$$;

drop trigger if exists ads_placements_sync on public.ads_placements;
create trigger ads_placements_sync
  before insert or update on public.ads_placements
  for each row execute function public.ads_placements_sync_from_campaign();

-- Guardia di stato: approvazione/attivazione richiedono posizionamenti e creatività approvate
create or replace function public.ads_campaigns_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_placements integer;
  v_unapproved integer;
begin
  new.updated_at := now();
  if new.status in ('approved', 'scheduled', 'active') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select count(*),
           count(*) filter (
             where cr.id is null
                or cr.review_status <> 'approved'
                or cr.landing_reviewed_at is null
           )
      into v_placements, v_unapproved
      from public.ads_placements p
      left join public.ads_creatives cr on cr.id = p.creative_id and cr.campaign_id = p.campaign_id
     where p.campaign_id = new.id;
    if v_placements = 0 then
      raise exception 'ads: la campagna % non ha posizionamenti', new.code;
    end if;
    if v_unapproved > 0 then
      raise exception 'ads: la campagna % ha % posizionamenti senza creatività/landing approvate', new.code, v_unapproved;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if (now() at time zone 'Europe/Rome')::date not between new.starts_on and new.ends_on then
      raise exception 'ads: la campagna % non può essere attivata fuori dal periodo contrattuale', new.code;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ads_campaigns_guard on public.ads_campaigns;
create trigger ads_campaigns_guard
  before insert or update on public.ads_campaigns
  for each row execute function public.ads_campaigns_guard();

-- Propaga date/stato ai posizionamenti: un conflitto di esclusività annulla l'intera modifica
create or replace function public.ads_campaigns_propagate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.starts_on is distinct from old.starts_on
     or new.ends_on is distinct from old.ends_on then
    update public.ads_placements
       set starts_on = new.starts_on,
           ends_on = new.ends_on,
           is_blocking = public.ads_status_is_blocking(new.status)
     where campaign_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ads_campaigns_propagate on public.ads_campaigns;
create trigger ads_campaigns_propagate
  after update on public.ads_campaigns
  for each row execute function public.ads_campaigns_propagate();

-- -----------------------------------------------------------------------------
-- Eventi di tracciamento (grezzi, conservazione breve)
-- -----------------------------------------------------------------------------
create table if not exists public.ads_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('impression', 'click')),
  campaign_id uuid not null references public.ads_campaigns (id) on delete cascade,
  placement_id uuid not null references public.ads_placements (id) on delete cascade,
  -- HMAC giornaliero troncato di IP+user-agent: non reversibile, non collegabile tra giorni
  visitor_hash text check (visitor_hash is null or visitor_hash ~ '^[a-f0-9]{16,64}$'),
  is_bot boolean not null default false,
  is_duplicate boolean not null default false,
  is_eligible boolean generated always as (not is_bot and not is_duplicate) stored,
  filter_reason text
);

create index if not exists ads_events_campaign_idx on public.ads_events (campaign_id, occurred_at);
create index if not exists ads_events_dedup_idx on public.ads_events (placement_id, event_type, visitor_hash, occurred_at desc);

-- Aggregati giornalieri persistenti (sopravvivono alla cancellazione dei grezzi)
create table if not exists public.ads_daily_stats (
  placement_id uuid not null references public.ads_placements (id) on delete cascade,
  campaign_id uuid not null references public.ads_campaigns (id) on delete cascade,
  day date not null,
  impressions_registered integer not null default 0,
  impressions_eligible integer not null default 0,
  clicks_registered integer not null default 0,
  clicks_eligible integer not null default 0,
  primary key (placement_id, day)
);

create index if not exists ads_daily_stats_campaign_idx on public.ads_daily_stats (campaign_id, day);

-- Vista unica per i report: aggregati consolidati + eventi grezzi non ancora consolidati
create or replace view public.ads_campaign_daily_stats
with (security_invoker = true)
as
select campaign_id, placement_id, day,
       sum(impressions_registered)::integer as impressions_registered,
       sum(impressions_eligible)::integer as impressions_eligible,
       sum(clicks_registered)::integer as clicks_registered,
       sum(clicks_eligible)::integer as clicks_eligible
from (
  select campaign_id, placement_id, day,
         impressions_registered, impressions_eligible, clicks_registered, clicks_eligible
    from public.ads_daily_stats
  union all
  select campaign_id, placement_id, (occurred_at at time zone 'Europe/Rome')::date as day,
         count(*) filter (where event_type = 'impression'),
         count(*) filter (where event_type = 'impression' and is_eligible),
         count(*) filter (where event_type = 'click'),
         count(*) filter (where event_type = 'click' and is_eligible)
    from public.ads_events
   group by campaign_id, placement_id, (occurred_at at time zone 'Europe/Rome')::date
) s
group by campaign_id, placement_id, day;

-- Consolida e cancella gli eventi grezzi più vecchi di p_retain_days (default 35).
-- Non schedulata: va eseguita manualmente o da un cron approvato.
create or replace function public.ads_purge_events(p_retain_days integer default 35)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff date;
  v_deleted integer;
begin
  if p_retain_days < 7 then
    raise exception 'ads: conservazione minima 7 giorni';
  end if;
  v_cutoff := (now() at time zone 'Europe/Rome')::date - p_retain_days;

  insert into public.ads_daily_stats as d (placement_id, campaign_id, day, impressions_registered, impressions_eligible, clicks_registered, clicks_eligible)
  select placement_id, campaign_id, (occurred_at at time zone 'Europe/Rome')::date,
         count(*) filter (where event_type = 'impression'),
         count(*) filter (where event_type = 'impression' and is_eligible),
         count(*) filter (where event_type = 'click'),
         count(*) filter (where event_type = 'click' and is_eligible)
    from public.ads_events
   where (occurred_at at time zone 'Europe/Rome')::date < v_cutoff
   group by placement_id, campaign_id, (occurred_at at time zone 'Europe/Rome')::date
  on conflict (placement_id, day) do update set
    impressions_registered = d.impressions_registered + excluded.impressions_registered,
    impressions_eligible = d.impressions_eligible + excluded.impressions_eligible,
    clicks_registered = d.clicks_registered + excluded.clicks_registered,
    clicks_eligible = d.clicks_eligible + excluded.clicks_eligible;

  delete from public.ads_events where (occurred_at at time zone 'Europe/Rome')::date < v_cutoff;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro delle decisioni (chi ha approvato/attivato cosa e quando)
-- -----------------------------------------------------------------------------
create table if not exists public.ads_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  campaign_id uuid references public.ads_campaigns (id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  actor text not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists ads_audit_log_campaign_idx on public.ads_audit_log (campaign_id, at);

-- -----------------------------------------------------------------------------
-- Permessi: nessun accesso per anon/authenticated, solo service_role (server-side)
-- -----------------------------------------------------------------------------
alter table public.ads_advertisers enable row level security;
alter table public.ads_positions enable row level security;
alter table public.ads_campaigns enable row level security;
alter table public.ads_creatives enable row level security;
alter table public.ads_placements enable row level security;
alter table public.ads_events enable row level security;
alter table public.ads_daily_stats enable row level security;
alter table public.ads_audit_log enable row level security;

-- RLS senza policy è intenzionale (advisor 0008): nessun accesso via API pubblica, solo service_role server-side.
comment on table public.ads_advertisers is 'Advertising Manager: inserzionisti. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_positions is 'Advertising Manager: catalogo posizioni. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_campaigns is 'Advertising Manager: campagne con checklist di attivazione. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_creatives is 'Advertising Manager: creatività approvate. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_placements is 'Advertising Manager: posizionamenti con esclusività EXCLUDE. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_events is 'Advertising Manager: eventi grezzi pseudonimi, conservazione 35 giorni. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_daily_stats is 'Advertising Manager: aggregati giornalieri. RLS senza policy: accesso solo server-side (service_role).';
comment on table public.ads_audit_log is 'Advertising Manager: registro delle decisioni. RLS senza policy: accesso solo server-side (service_role).';

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.ads_advertisers, public.ads_positions, public.ads_campaigns, public.ads_creatives, public.ads_placements, public.ads_events, public.ads_daily_stats, public.ads_audit_log, public.ads_campaign_daily_stats from %I', r);
      execute format('revoke execute on function public.ads_purge_events(integer) from %I', r);
    end if;
  end loop;
end;
$$;

revoke execute on function public.ads_purge_events(integer) from public;
