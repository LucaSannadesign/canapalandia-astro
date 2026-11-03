-- Test SQL della migrazione Advertising Manager.
-- Solo dati sintetici (is_synthetic / prefisso "synth-"). Eseguito da scripts/test-ads-migration.sh
-- su un cluster locale usa-e-getta: non eseguire su database reali.

-- Passa solo se l'errore contiene p_expected: evita falsi positivi dovuti ad altri vincoli.
create or replace function pg_temp.expect_error(p_sql text, p_label text, p_expected text)
returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
    if position(p_expected in v_msg) = 0 then
      raise exception 'FAIL: "%" ha prodotto un errore diverso: %', p_label, v_msg;
    end if;
    raise notice 'ok (errore atteso): % -> %', p_label, v_msg;
    return;
  end;
  raise exception 'FAIL: atteso errore per "%"', p_label;
end;
$$;

create or replace function pg_temp.assert(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

-- Fixture: inserzionista e campagne sintetiche
insert into ads_advertisers (id, code, legal_name, display_name, allowed_domains, is_synthetic, negotiation_status)
values ('00000000-0000-4000-8000-000000000001', 'synth-growshop-a', 'SYNTH Growshop A S.r.l. (test)', 'SYNTH Growshop A',
        array['shop.example.test'], true, 'prospect');

-- Campagna A: scenario esclusivo 30 giorni, 3 articoli, fine articolo, 80 €
insert into ads_campaigns (id, code, advertiser_id, name, price_cents, starts_on, ends_on, is_synthetic)
values ('00000000-0000-4000-8000-0000000000a1', 'synth-exclusive-30d', '00000000-0000-4000-8000-000000000001',
        'SYNTH esclusiva fine articolo 30 giorni', 8000, current_date - 1, current_date + 28, true);

insert into ads_creatives (id, campaign_id, label, alt_text, destination_url)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'SYNTH creatività',
        'Creatività sintetica di test', 'https://shop.example.test/attrezzatura');

insert into ads_placements (campaign_id, creative_id, article_slug, position_code, starts_on, ends_on)
select '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', s, 'article_end', '2000-01-01', '2000-01-01'
  from unnest(array['synth-articolo-a', 'synth-articolo-b', 'synth-articolo-c']) s;

select pg_temp.assert(
  (select bool_and(starts_on = current_date - 1 and ends_on = current_date + 28 and not is_blocking)
     from ads_placements where campaign_id = '00000000-0000-4000-8000-0000000000a1'),
  'i posizionamenti ereditano le date della campagna e la bozza non blocca'
);

-- Gate di approvazione: creatività/landing non approvate
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'approved' where code = 'synth-exclusive-30d'$$,
  'approvazione con creatività/landing non approvate',
  'senza creatività/landing approvate'
);

update ads_creatives set review_status = 'approved', approved_at = now(), approved_by = 'test', landing_reviewed_at = now()
 where id = '00000000-0000-4000-8000-0000000000c1';

-- Gate di approvazione: checklist commerciale incompleta
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'approved' where code = 'synth-exclusive-30d'$$,
  'approvazione senza conferma scritta/termini/disponibilità/verifica fiscale',
  'ads_campaigns_approval_gate'
);
select pg_temp.expect_error(
  $$update ads_creatives set review_status = 'approved', approved_at = null where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'creatività approvata senza data di approvazione',
  'ads_creatives_approval'
);

update ads_campaigns set
  written_confirmation_at = now(), written_confirmation_ref = 'SYNTH-TEST',
  commercial_terms_approved_at = now(), availability_verified_at = now(), tax_contract_verified_at = now()
 where code = 'synth-exclusive-30d';
update ads_campaigns set status = 'pending_approval' where code = 'synth-exclusive-30d';
update ads_campaigns set status = 'approved' where code = 'synth-exclusive-30d';

select pg_temp.assert(
  (select bool_and(is_blocking) from ads_placements where campaign_id = '00000000-0000-4000-8000-0000000000a1'),
  'la campagna approvata blocca i suoi spazi'
);

select pg_temp.expect_error(
  $$update ads_creatives set destination_url = 'https://evil.example/' where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'creatività immutabile dopo approvazione',
  'ads: creatività modificabili solo'
);
select pg_temp.expect_error(
  $$insert into ads_placements (campaign_id, article_slug, position_code, starts_on, ends_on)
    values ('00000000-0000-4000-8000-0000000000a1', 'synth-articolo-d', 'article_end', current_date, current_date)$$,
  'nuovi posizionamenti solo in bozza',
  'ads: i posizionamenti sono modificabili solo'
);

-- Esclusività: campagna B sullo stesso articolo/posizione con periodo sovrapposto
insert into ads_campaigns (id, code, advertiser_id, name, price_cents, starts_on, ends_on, is_synthetic,
  written_confirmation_at, commercial_terms_approved_at, availability_verified_at, tax_contract_verified_at)
values ('00000000-0000-4000-8000-0000000000b1', 'synth-overlap', '00000000-0000-4000-8000-000000000001',
        'SYNTH sovrapposta', 5000, current_date + 10, current_date + 40, true, now(), now(), now(), now());
insert into ads_creatives (id, campaign_id, label, alt_text, destination_url, review_status, approved_at, landing_reviewed_at)
values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'SYNTH B', 'Creatività B',
        'https://shop.example.test/b', 'approved', now(), now());
insert into ads_placements (campaign_id, creative_id, article_slug, position_code, starts_on, ends_on)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c2', 'synth-articolo-b', 'article_end', current_date, current_date);

select pg_temp.assert(true, 'una bozza sovrapposta è ammessa (non occupa lo spazio)');
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'approved' where code = 'synth-overlap'$$,
  'esclusività: approvazione di una campagna sovrapposta bloccata dal vincolo EXCLUDE',
  'ads_placements_no_overlap'
);

-- Periodo adiacente (inizia il giorno dopo la fine di A): ammesso
update ads_campaigns set starts_on = current_date + 29, ends_on = current_date + 58 where code = 'synth-overlap';
update ads_campaigns set status = 'approved' where code = 'synth-overlap';
select pg_temp.assert(
  (select status = 'approved' from ads_campaigns where code = 'synth-overlap'),
  'periodo adiacente non sovrapposto approvabile'
);
select pg_temp.expect_error(
  $$update ads_campaigns set starts_on = current_date + 20 where code = 'synth-overlap'$$,
  'spostare le date di una campagna approvata dentro un periodo occupato è bloccato',
  'ads_placements_no_overlap'
);

-- Attivazione: dati sintetici mai attivabili
update ads_campaigns set tracking_tested_at = now(), tracking_privacy_reviewed_at = now(), dates_confirmed_at = now(),
  activation_authorized_at = now(), activation_authorized_by = 'test'
 where code = 'synth-exclusive-30d';
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'active' where code = 'synth-exclusive-30d'$$,
  'campagna sintetica non attivabile',
  'ads_campaigns_activation_gate'
);
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'scheduled' where code = 'synth-exclusive-30d'$$,
  'campagna sintetica non programmabile',
  'ads_campaigns_activation_gate'
);

-- Campagna condivisa: non può uscire dalla bozza nell'MVP
insert into ads_campaigns (code, advertiser_id, name, contract_type, starts_on, ends_on, is_synthetic, impression_goal)
values ('synth-shared', '00000000-0000-4000-8000-000000000001', 'SYNTH condivisa', 'shared_rotation', current_date, current_date + 30, true, 10000);
select pg_temp.expect_error(
  $$update ads_campaigns set status = 'pending_approval' where code = 'synth-shared'$$,
  'campagne condivise non attivabili nell''MVP',
  'ads_campaigns_shared_not_in_mvp'
);
select pg_temp.expect_error(
  $$update ads_campaigns set auto_renew = true where code = 'synth-shared'$$,
  'rinnovo automatico vietato',
  'ads_campaigns_no_auto_renew'
);

-- Validazioni di formato
select pg_temp.expect_error(
  $$insert into ads_creatives (campaign_id, label, alt_text, destination_url)
    values ((select id from ads_campaigns where code = 'synth-shared'), 'x1', 'xx', 'javascript:alert(1)')$$,
  'destinazione non https rifiutata',
  'ads_creatives_destination_url_check'
);
select pg_temp.expect_error(
  $$insert into ads_creatives (campaign_id, label, alt_text, destination_url, image_path)
    values ((select id from ads_campaigns where code = 'synth-shared'), 'x2', 'xx', 'https://shop.example.test/', 'https://cdn.example/x.png')$$,
  'immagine esterna rifiutata (solo /ads/ self-hosted)',
  'ads_creatives_image_path_check'
);

-- Eventi, aggregati e conservazione
insert into ads_events (occurred_at, event_type, campaign_id, placement_id, visitor_hash, is_bot, is_duplicate)
select now() - interval '40 days', t, '00000000-0000-4000-8000-0000000000a1', p.id, 'abcdef0123456789', b, d
  from (select id from ads_placements where campaign_id = '00000000-0000-4000-8000-0000000000a1' and article_slug = 'synth-articolo-a') p,
       (values ('impression', false, false), ('impression', false, true), ('impression', true, false), ('click', false, false)) v(t, b, d);
insert into ads_events (event_type, campaign_id, placement_id, visitor_hash)
select 'impression', '00000000-0000-4000-8000-0000000000a1', id, '0123456789abcdef'
  from ads_placements where campaign_id = '00000000-0000-4000-8000-0000000000a1' and article_slug = 'synth-articolo-a';

select pg_temp.assert(
  (select sum(impressions_registered) = 4 and sum(impressions_eligible) = 2 and sum(clicks_eligible) = 1
     from ads_campaign_daily_stats where campaign_id = '00000000-0000-4000-8000-0000000000a1'),
  'vista giornaliera: registrati vs idonei'
);
select pg_temp.expect_error($$select ads_purge_events(3)$$, 'conservazione minima 7 giorni', 'conservazione minima 7 giorni');
select pg_temp.assert((select ads_purge_events(35) = 4), 'purge elimina solo i grezzi oltre la conservazione');
select pg_temp.assert(
  (select sum(impressions_registered) = 4 and sum(impressions_eligible) = 2 and sum(clicks_eligible) = 1
     from ads_campaign_daily_stats where campaign_id = '00000000-0000-4000-8000-0000000000a1'),
  'gli aggregati sopravvivono alla cancellazione dei grezzi'
);

-- Permessi: anon/authenticated senza accesso
set role anon;
select pg_temp.expect_error($$select count(*) from public.ads_campaigns$$, 'anon non legge le campagne', 'permission denied');
select pg_temp.expect_error($$select count(*) from public.ads_campaign_daily_stats$$, 'anon non legge le statistiche', 'permission denied');
select pg_temp.expect_error($$insert into public.ads_events (event_type, campaign_id, placement_id) values ('click', gen_random_uuid(), gen_random_uuid())$$, 'anon non scrive eventi', 'permission denied');
reset role;
set role authenticated;
select pg_temp.expect_error($$select count(*) from public.ads_advertisers$$, 'authenticated non legge gli inserzionisti', 'permission denied');
reset role;

select pg_temp.assert(
  (select bool_and(relrowsecurity) from pg_class where relname like 'ads\_%' and relkind = 'r'),
  'RLS attiva su tutte le tabelle ads_'
);

-- I nomi delle FK sono usati come hint di embed PostgREST in src/lib/ads/supabaseRepository.ts
select pg_temp.assert(
  (select count(*) = 3 from pg_constraint where contype = 'f' and conname in (
    'ads_placements_campaign_id_fkey', 'ads_placements_creative_id_fkey', 'ads_campaigns_advertiser_id_fkey')),
  'FK usate come hint PostgREST presenti con il nome atteso'
);
