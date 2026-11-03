#!/usr/bin/env node
// scripts/ads-retention.mjs
// Conservazione dei dati pubblicitari: consolida e cancella gli eventi grezzi oltre la conservazione
// e rimuove gli pseudonimi oltre il periodo di deduplica (funzione SQL ads_purge_events).
//
// NON è schedulato da nessuna parte. Per impostazione predefinita è un DRY-RUN in sola lettura.
//
// Uso:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ads-retention.mjs                  # dry-run
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ads-retention.mjs --execute        # solo host locali
//   … --execute --allow-remote=<project-ref>   # remoto: il ref deve coincidere con l'host di SUPABASE_URL
//   Opzioni: --retain-days=35 --pseudonym-days=2
//
// Le variabili non vengono lette da file .env: vanno passate esplicitamente.

import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const known = new Set(["execute", "allow-remote", "retain-days", "pseudonym-days"]);
const unknown = Object.keys(args).filter((k) => !known.has(k));
if (unknown.length) {
  console.error(`Opzioni sconosciute: ${unknown.join(", ")}`);
  process.exit(2);
}

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obbligatorie (passate esplicitamente, mai da .env).");
  process.exit(2);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error("SUPABASE_URL non valida.");
  process.exit(2);
}
const isLocal = host === "127.0.0.1" || host === "localhost";
const retainDays = Number(args["retain-days"] ?? 35);
const pseudonymDays = Number(args["pseudonym-days"] ?? 2);
if (!Number.isInteger(retainDays) || !Number.isInteger(pseudonymDays)) {
  console.error("--retain-days e --pseudonym-days devono essere interi.");
  process.exit(2);
}

const execute = args.execute === true;
if (execute && !isLocal) {
  const ref = host.split(".")[0];
  if (args["allow-remote"] !== ref) {
    console.error(`STOP: host remoto (${host}). Per eseguire servono autorizzazione umana e --allow-remote=${ref}.`);
    process.exit(3);
  }
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const params = { p_retain_days: retainDays, p_pseudonym_retain_days: pseudonymDays };

const status = await db.rpc("ads_retention_status", params);
if (status.error) {
  console.error(`Errore ads_retention_status: ${status.error.message}`);
  process.exit(1);
}
const report = { mode: execute ? "execute" : "dry-run", host, retain_days: retainDays, pseudonym_days: pseudonymDays, before: status.data };

if (execute) {
  const purge = await db.rpc("ads_purge_events", params);
  if (purge.error) {
    console.error(`Errore ads_purge_events: ${purge.error.message}`);
    process.exit(1);
  }
  report.result = purge.data;
  const after = await db.rpc("ads_retention_status", params);
  report.after = after.error ? { error: after.error.message } : after.data;
}

console.log(JSON.stringify(report, null, 2));
