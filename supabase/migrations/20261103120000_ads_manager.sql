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
  -- Chiave scelta dall'operatore: i posizionamenti si collegano per chiave, mai per ordine di inserimento
  creative_key text check (creative_key is null or creative_key ~ '^[a-z0-9_-]{1,40}$'),
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
  ),
  constraint ads_creatives_key_unique unique (campaign_id, creative_key)
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
  -- Clic senza token di visualizzazione valido: registrato (il lettore viene reindirizzato) ma non idoneo
  is_unverified boolean not null default false,
  is_eligible boolean generated always as (not is_bot and not is_duplicate and not is_unverified) stored,
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

-- Conservazione (nessuna schedulazione: esecuzione manuale o da un job approvato, vedi docs/ads/README.md §6).
-- In UNA transazione:
--   1. consolida in ads_daily_stats gli eventi più vecchi di p_retain_days (default 35) e li cancella;
--   2. rimuove lo pseudonimo (visitor_hash) dagli eventi più vecchi di p_pseudonym_retain_days (default 2):
--      la deduplica usa al massimo 30 minuti, oltre lo pseudonimo non serve più.
-- Idempotente: rieseguirla non cambia gli aggregati (i grezzi consolidati non esistono più).
drop function if exists public.ads_purge_events(integer);
create or replace function public.ads_purge_events(p_retain_days integer default 35, p_pseudonym_retain_days integer default 2)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff date;
  v_rolled integer;
  v_deleted integer;
  v_pseudonyms integer;
begin
  if p_retain_days is null or p_retain_days < 7 or p_retain_days > 400 then
    raise exception 'ads: conservazione minima 7 giorni, massima 400';
  end if;
  if p_pseudonym_retain_days is null or p_pseudonym_retain_days < 1 or p_pseudonym_retain_days > p_retain_days then
    raise exception 'ads: conservazione pseudonimi tra 1 giorno e la conservazione dei grezzi';
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
  get diagnostics v_rolled = row_count;

  delete from public.ads_events where (occurred_at at time zone 'Europe/Rome')::date < v_cutoff;
  get diagnostics v_deleted = row_count;

  update public.ads_events set visitor_hash = null
   where visitor_hash is not null and occurred_at < now() - make_interval(days => p_pseudonym_retain_days);
  get diagnostics v_pseudonyms = row_count;

  return jsonb_build_object(
    'cutoff_day', v_cutoff,
    'daily_rows_upserted', v_rolled,
    'events_deleted', v_deleted,
    'pseudonyms_removed', v_pseudonyms
  );
end;
$$;

-- Sola lettura: cosa farebbe la purge adesso (per il dry-run e il monitoraggio).
create or replace function public.ads_retention_status(p_retain_days integer default 35, p_pseudonym_retain_days integer default 2)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cutoff_day', (now() at time zone 'Europe/Rome')::date - p_retain_days,
    'events_total', (select count(*) from public.ads_events),
    'oldest_event_at', (select min(occurred_at) from public.ads_events),
    'events_past_retention', (select count(*) from public.ads_events
                               where (occurred_at at time zone 'Europe/Rome')::date < (now() at time zone 'Europe/Rome')::date - p_retain_days),
    'pseudonyms_past_retention', (select count(*) from public.ads_events
                                   where visitor_hash is not null and occurred_at < now() - make_interval(days => p_pseudonym_retain_days)),
    'daily_stats_rows', (select count(*) from public.ads_daily_stats)
  );
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
-- Operazioni amministrative atomiche: ogni modifica e la sua riga di audit avvengono nella
-- stessa transazione (o entrambe o nessuna). Campi modificabili in whitelist; concorrenza
-- ottimistica su updated_at. Eseguibili solo da service_role.
-- -----------------------------------------------------------------------------
create or replace function public.ads_require_actor(p_actor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_actor is null or length(btrim(p_actor)) not between 2 and 80 then
    raise exception 'ads: actor obbligatorio (2-80 caratteri)';
  end if;
  return btrim(p_actor);
end;
$$;

create or replace function public.ads_admin_create_advertiser(p_data jsonb, p_actor text)
returns public.ads_advertisers
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.ads_require_actor(p_actor);
  v_row public.ads_advertisers;
begin
  insert into public.ads_advertisers (code, legal_name, display_name, website_url, allowed_domains, contact_name,
    contact_email, contact_phone, negotiation_status, is_synthetic, notes)
  values (p_data->>'code', p_data->>'legal_name', p_data->>'display_name', p_data->>'website_url',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'allowed_domains') x), '{}'),
    p_data->>'contact_name', p_data->>'contact_email', p_data->>'contact_phone',
    coalesce(p_data->>'negotiation_status', 'prospect'), coalesce((p_data->>'is_synthetic')::boolean, false), p_data->>'notes')
  returning * into v_row;
  insert into public.ads_audit_log (campaign_id, action, from_status, to_status, actor, details)
  values (null, 'advertiser_created', null, v_row.negotiation_status, v_actor, jsonb_build_object('advertiser', v_row.code));
  return v_row;
end;
$$;

create or replace function public.ads_admin_update_advertiser(p_id uuid, p_patch jsonb, p_actor text)
returns public.ads_advertisers
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.ads_require_actor(p_actor);
  v_old public.ads_advertisers;
  v_row public.ads_advertisers;
  v_bad text;
begin
  select k into v_bad from jsonb_object_keys(p_patch) k
   where k not in ('legal_name', 'display_name', 'website_url', 'allowed_domains', 'contact_name', 'contact_email',
                   'contact_phone', 'negotiation_status', 'notes')
   limit 1;
  if v_bad is not null then
    raise exception 'ads: campo non modificabile: %', v_bad;
  end if;
  select * into v_old from public.ads_advertisers where id = p_id for update;
  if not found then
    raise exception 'ads: inserzionista inesistente';
  end if;
  update public.ads_advertisers a set
    legal_name = case when p_patch ? 'legal_name' then p_patch->>'legal_name' else a.legal_name end,
    display_name = case when p_patch ? 'display_name' then p_patch->>'display_name' else a.display_name end,
    website_url = case when p_patch ? 'website_url' then p_patch->>'website_url' else a.website_url end,
    allowed_domains = case when p_patch ? 'allowed_domains'
      then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'allowed_domains') x), '{}')
      else a.allowed_domains end,
    contact_name = case when p_patch ? 'contact_name' then p_patch->>'contact_name' else a.contact_name end,
    contact_email = case when p_patch ? 'contact_email' then p_patch->>'contact_email' else a.contact_email end,
    contact_phone = case when p_patch ? 'contact_phone' then p_patch->>'contact_phone' else a.contact_phone end,
    negotiation_status = case when p_patch ? 'negotiation_status' then p_patch->>'negotiation_status' else a.negotiation_status end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else a.notes end,
    updated_at = now()
  where a.id = p_id
  returning * into v_row;
  insert into public.ads_audit_log (campaign_id, action, from_status, to_status, actor, details)
  values (null, 'advertiser_updated', v_old.negotiation_status, v_row.negotiation_status, v_actor,
          jsonb_build_object('advertiser', v_row.code, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_row;
end;
$$;

create or replace function public.ads_admin_create_campaign(p_campaign jsonb, p_creatives jsonb, p_placements jsonb, p_actor text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.ads_require_actor(p_actor);
  v_id uuid;
  v_creative uuid;
  c jsonb;
  p jsonb;
begin
  if jsonb_typeof(p_creatives) <> 'array' or jsonb_array_length(p_creatives) = 0
     or jsonb_typeof(p_placements) <> 'array' or jsonb_array_length(p_placements) = 0 then
    raise exception 'ads: servono almeno una creatività e un posizionamento';
  end if;
  insert into public.ads_campaigns (code, advertiser_id, name, contract_type, price_cents, currency, starts_on, ends_on,
    notes, is_synthetic, status, auto_renew)
  values (p_campaign->>'code', (p_campaign->>'advertiser_id')::uuid, p_campaign->>'name',
    coalesce(p_campaign->>'contract_type', 'exclusive_time'), (p_campaign->>'price_cents')::integer,
    coalesce(p_campaign->>'currency', 'EUR'), (p_campaign->>'starts_on')::date, (p_campaign->>'ends_on')::date,
    p_campaign->>'notes', coalesce((p_campaign->>'is_synthetic')::boolean, false), 'draft', false)
  returning id into v_id;

  for c in select value from jsonb_array_elements(p_creatives) loop
    if coalesce(c->>'key', '') = '' then
      raise exception 'ads: creatività senza key';
    end if;
    insert into public.ads_creatives (campaign_id, creative_key, label, image_path, image_width, image_height, alt_text,
      headline, body, cta_label, destination_url, sponsor_label)
    values (v_id, c->>'key', c->>'label', c->>'image_path', (c->>'image_width')::integer, (c->>'image_height')::integer,
      c->>'alt_text', c->>'headline', c->>'body', c->>'cta_label', c->>'destination_url',
      coalesce(c->>'sponsor_label', 'Contenuto sponsorizzato'));
  end loop;

  for p in select value from jsonb_array_elements(p_placements) loop
    select id into v_creative from public.ads_creatives where campaign_id = v_id and creative_key = p->>'creative_key';
    if v_creative is null then
      raise exception 'ads: creative_key % inesistente', p->>'creative_key';
    end if;
    -- Date sovrascritte dal trigger con quelle della campagna
    insert into public.ads_placements (campaign_id, creative_id, article_slug, position_code, starts_on, ends_on)
    values (v_id, v_creative, p->>'article_slug', p->>'position_code', (p_campaign->>'starts_on')::date, (p_campaign->>'ends_on')::date);
  end loop;

  insert into public.ads_audit_log (campaign_id, action, from_status, to_status, actor, details)
  values (v_id, 'campaign_created', null, 'draft', v_actor, jsonb_build_object('code', p_campaign->>'code'));
  return v_id;
end;
$$;

create or replace function public.ads_admin_update_campaign(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
  p_actor text,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns public.ads_campaigns
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.ads_require_actor(p_actor);
  v_old public.ads_campaigns;
  v_row public.ads_campaigns;
  v_bad text;
begin
  if coalesce(p_action, '') !~ '^[a-z_]{3,60}$' then
    raise exception 'ads: action di audit non valida';
  end if;
  select k into v_bad from jsonb_object_keys(p_patch) k
   where k not in ('status', 'written_confirmation_at', 'written_confirmation_ref', 'commercial_terms_approved_at',
                   'availability_verified_at', 'tax_contract_verified_at', 'tracking_tested_at',
                   'tracking_privacy_reviewed_at', 'dates_confirmed_at', 'activation_authorized_at', 'activation_authorized_by')
   limit 1;
  if v_bad is not null then
    raise exception 'ads: campo non modificabile: %', v_bad;
  end if;
  select * into v_old from public.ads_campaigns where id = p_id for update;
  if not found then
    raise exception 'ads: campagna inesistente';
  end if;
  if p_expected_updated_at is not null and v_old.updated_at <> p_expected_updated_at then
    raise exception 'ads: modifica concorrente sulla campagna %, ricaricare e riprovare', v_old.code;
  end if;
  update public.ads_campaigns c set
    status = case when p_patch ? 'status' then p_patch->>'status' else c.status end,
    written_confirmation_at = case when p_patch ? 'written_confirmation_at' then (p_patch->>'written_confirmation_at')::timestamptz else c.written_confirmation_at end,
    written_confirmation_ref = case when p_patch ? 'written_confirmation_ref' then p_patch->>'written_confirmation_ref' else c.written_confirmation_ref end,
    commercial_terms_approved_at = case when p_patch ? 'commercial_terms_approved_at' then (p_patch->>'commercial_terms_approved_at')::timestamptz else c.commercial_terms_approved_at end,
    availability_verified_at = case when p_patch ? 'availability_verified_at' then (p_patch->>'availability_verified_at')::timestamptz else c.availability_verified_at end,
    tax_contract_verified_at = case when p_patch ? 'tax_contract_verified_at' then (p_patch->>'tax_contract_verified_at')::timestamptz else c.tax_contract_verified_at end,
    tracking_tested_at = case when p_patch ? 'tracking_tested_at' then (p_patch->>'tracking_tested_at')::timestamptz else c.tracking_tested_at end,
    tracking_privacy_reviewed_at = case when p_patch ? 'tracking_privacy_reviewed_at' then (p_patch->>'tracking_privacy_reviewed_at')::timestamptz else c.tracking_privacy_reviewed_at end,
    dates_confirmed_at = case when p_patch ? 'dates_confirmed_at' then (p_patch->>'dates_confirmed_at')::timestamptz else c.dates_confirmed_at end,
    activation_authorized_at = case when p_patch ? 'activation_authorized_at' then (p_patch->>'activation_authorized_at')::timestamptz else c.activation_authorized_at end,
    activation_authorized_by = case when p_patch ? 'activation_authorized_by' then p_patch->>'activation_authorized_by' else c.activation_authorized_by end
  where c.id = p_id
  returning * into v_row;
  insert into public.ads_audit_log (campaign_id, action, from_status, to_status, actor, details)
  values (p_id, p_action, v_old.status, v_row.status, v_actor, coalesce(p_details, '{}'::jsonb));
  return v_row;
end;
$$;

create or replace function public.ads_admin_review_creative(p_creative_id uuid, p_patch jsonb, p_actor text, p_action text, p_details jsonb default '{}'::jsonb)
returns public.ads_creatives
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.ads_require_actor(p_actor);
  v_row public.ads_creatives;
  v_status text;
  v_bad text;
begin
  if coalesce(p_action, '') !~ '^[a-z_]{3,60}$' then
    raise exception 'ads: action di audit non valida';
  end if;
  select k into v_bad from jsonb_object_keys(p_patch) k
   where k not in ('review_status', 'approved_at', 'approved_by', 'landing_reviewed_at')
   limit 1;
  if v_bad is not null then
    raise exception 'ads: campo non modificabile: %', v_bad;
  end if;
  update public.ads_creatives cr set
    review_status = case when p_patch ? 'review_status' then p_patch->>'review_status' else cr.review_status end,
    approved_at = case when p_patch ? 'approved_at' then (p_patch->>'approved_at')::timestamptz else cr.approved_at end,
    approved_by = case when p_patch ? 'approved_by' then p_patch->>'approved_by' else cr.approved_by end,
    landing_reviewed_at = case when p_patch ? 'landing_reviewed_at' then (p_patch->>'landing_reviewed_at')::timestamptz else cr.landing_reviewed_at end
  where cr.id = p_creative_id
  returning * into v_row;
  if not found then
    raise exception 'ads: creatività inesistente';
  end if;
  select status into v_status from public.ads_campaigns where id = v_row.campaign_id;
  insert into public.ads_audit_log (campaign_id, action, from_status, to_status, actor, details)
  values (v_row.campaign_id, p_action, v_status, v_status, v_actor,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('creative', v_row.id));
  return v_row;
end;
$$;

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
  f text;
  v_functions text[] := array[
    'public.ads_purge_events(integer, integer)',
    'public.ads_retention_status(integer, integer)',
    'public.ads_status_is_blocking(text)',
    'public.ads_require_actor(text)',
    'public.ads_admin_create_advertiser(jsonb, text)',
    'public.ads_admin_update_advertiser(uuid, jsonb, text)',
    'public.ads_admin_create_campaign(jsonb, jsonb, jsonb, text)',
    'public.ads_admin_update_campaign(uuid, timestamptz, jsonb, text, text, jsonb)',
    'public.ads_admin_review_creative(uuid, jsonb, text, text, jsonb)'
  ];
begin
  foreach f in array v_functions loop
    execute format('revoke execute on function %s from public', f);
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.ads_advertisers, public.ads_positions, public.ads_campaigns, public.ads_creatives, public.ads_placements, public.ads_events, public.ads_daily_stats, public.ads_audit_log, public.ads_campaign_daily_stats from %I', r);
      foreach f in array v_functions loop
        execute format('revoke execute on function %s from %I', f, r);
      end loop;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array v_functions loop
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end;
$$;
