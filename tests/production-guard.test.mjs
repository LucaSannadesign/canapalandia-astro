// Test della guardia di rilascio. Nessuna rete: GitHub e Vercel sono simulati.
// Esecuzione: pnpm test:production-guard

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXIT_OK,
  EXIT_UNVERIFIABLE,
  EXIT_VIOLATION,
  checkBuildEnv,
  createGitHubClient,
  evaluateProduction,
  findCurrentProduction,
  runMonitor,
} from "../scripts/production-guard.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/production-guard.mjs", import.meta.url));

// Valori reali dell'incidente del 2026-10-19 (dpl_CTRJzQ1yHa6DhtQXiVTKaJ5Jo5ww).
const INCIDENT_SHA = "c36293bab36fd39162ba26ffc5f40a01cd0ef23e";
const MAIN_SHA = "be52d4c959a79452fddccde4fd98dc0133462b63";
const vercelProduction = (ref, sha = INCIDENT_SHA) => ({
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: ref,
  VERCEL_GIT_COMMIT_SHA: sha,
});

// --- build -----------------------------------------------------------------

test("build: fuori da Vercel la guardia non interviene", () => {
  assert.equal(checkBuildEnv({}).ok, true);
  assert.equal(checkBuildEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "feature" }).ok, true);
});

test("build: le Preview da feature branch sono consentite", () => {
  const result = checkBuildEnv({ ...vercelProduction("claude/optimistic-hypatia-vkcakt"), VERCEL_ENV: "preview" });
  assert.equal(result.ok, true);
});

test("build: production da main è consentita", () => {
  assert.equal(checkBuildEnv(vercelProduction("main", MAIN_SHA)).ok, true);
});

test("build: production da feature branch (scenario dell'incidente) è bloccata", () => {
  const result = checkBuildEnv(vercelProduction("claude/optimistic-hypatia-vkcakt"));
  assert.equal(result.ok, false);
  assert.match(result.reason, /claude\/optimistic-hypatia-vkcakt/);
  assert.match(result.reason, /c36293b/);
});

test("build: production senza branch noto (es. CLI --prod da cartella locale) è bloccata", () => {
  assert.equal(checkBuildEnv(vercelProduction("")).ok, false);
  assert.equal(checkBuildEnv({ VERCEL: "1", VERCEL_ENV: "production" }).ok, false);
});

test("build: branch con nome simile a main non passa", () => {
  for (const ref of ["main-hotfix", "Main", "origin/main", "feature/main"]) {
    assert.equal(checkBuildEnv(vercelProduction(ref)).ok, false, ref);
  }
});

test("build: senza VERCEL_ENV non blocca ma avvisa", () => {
  const result = checkBuildEnv({ VERCEL: "1", VERCEL_GIT_COMMIT_REF: "feature" });
  assert.equal(result.ok, true);
  assert.match(result.warning, /System Environment Variables/);
});

test("build CLI: exit 1 sul caso dell'incidente, exit 0 su main e in locale", () => {
  const run = (env) =>
    spawnSync(process.execPath, [SCRIPT, "build"], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });

  const blocked = run(vercelProduction("claude/optimistic-hypatia-vkcakt"));
  assert.equal(blocked.status, EXIT_VIOLATION);
  assert.match(blocked.stderr, /build production bloccata/);

  assert.equal(run(vercelProduction("main", MAIN_SHA)).status, EXIT_OK);
  assert.equal(run({}).status, EXIT_OK);
});

// --- monitor: valutazione ---------------------------------------------------

test("monitor: identical e ahead sono ammessi, ahead con avviso", () => {
  assert.equal(evaluateProduction({ productionSha: MAIN_SHA, mainSha: MAIN_SHA, compareStatus: "identical" }).ok, true);
  const behindMain = evaluateProduction({ productionSha: "aaa", mainSha: MAIN_SHA, compareStatus: "ahead" });
  assert.equal(behindMain.ok, true);
  assert.ok(behindMain.warning);
});

test("monitor: diverged, behind e commit sconosciuto sono violazioni", () => {
  for (const compareStatus of ["diverged", "behind", "not_found"]) {
    assert.equal(evaluateProduction({ productionSha: INCIDENT_SHA, mainSha: MAIN_SHA, compareStatus }).ok, false);
  }
});

// --- monitor: provider GitHub simulato --------------------------------------

function fakeGitHub({ deployments, statuses, compare, failOn } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname + new URL(url).search;
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (failOn && path.includes(failOn)) return json(500, {});
    if (path.includes("/deployments?")) return json(200, deployments);
    const statusMatch = path.match(/\/deployments\/(\d+)\/statuses/);
    if (statusMatch) return json(200, statuses[statusMatch[1]] ? [{ state: statuses[statusMatch[1]] }] : []);
    if (path.endsWith("/commits/main")) return json(200, { sha: MAIN_SHA });
    const compareMatch = path.match(/\/compare\/(\w+)\.\.\.main/);
    if (compareMatch) return compare[compareMatch[1]] ? json(200, { status: compare[compareMatch[1]] }) : json(404, {});
    return json(404, {});
  };
  return { fetchImpl, calls };
}

const repo = "LucaSannadesign/canapalandia-astro";
const silent = () => {};

test("monitor: individua il deployment Production attivo saltando pending e inactive", async () => {
  const { fetchImpl } = fakeGitHub({
    deployments: [
      { id: 3, sha: "ccc", created_at: "2026-10-19T16:00:00Z" },
      { id: 2, sha: INCIDENT_SHA, created_at: "2026-10-19T15:53:38Z" },
      { id: 1, sha: MAIN_SHA, created_at: "2026-10-15T12:37:41Z" },
    ],
    statuses: { 3: "pending", 2: "success", 1: "inactive" },
  });
  const current = await findCurrentProduction(createGitHubClient({ repo, fetchImpl }));
  assert.equal(current.sha, INCIDENT_SHA);
});

test("monitor: riproduce l'incidente del 2026-10-19 (exit 1)", async () => {
  const { fetchImpl } = fakeGitHub({
    deployments: [{ id: 2, sha: INCIDENT_SHA, created_at: "2026-10-19T15:53:38Z" }],
    statuses: { 2: "success" },
    compare: { [INCIDENT_SHA]: "diverged" },
  });
  const { code, report } = await runMonitor({ env: {}, client: createGitHubClient({ repo, fetchImpl }), log: silent });
  assert.equal(code, EXIT_VIOLATION);
  assert.equal(report.productionSha, INCIDENT_SHA);
});

test("monitor: produzione su main è ok (exit 0)", async () => {
  const { fetchImpl } = fakeGitHub({
    deployments: [{ id: 1, sha: MAIN_SHA, created_at: "2026-10-15T12:37:41Z" }],
    statuses: { 1: "success" },
    compare: { [MAIN_SHA]: "identical" },
  });
  const { code } = await runMonitor({ env: {}, client: createGitHubClient({ repo, fetchImpl }), log: silent });
  assert.equal(code, EXIT_OK);
});

test("monitor: PRODUCTION_SHA dall'evento evita la ricerca dei deployment", async () => {
  const { fetchImpl, calls } = fakeGitHub({ compare: { [INCIDENT_SHA]: "diverged" } });
  const { code } = await runMonitor({
    env: { PRODUCTION_SHA: INCIDENT_SHA },
    client: createGitHubClient({ repo, fetchImpl }),
    log: silent,
  });
  assert.equal(code, EXIT_VIOLATION);
  assert.ok(calls.every(({ url }) => !url.includes("/deployments")));
});

test("monitor: nessun deployment o errore API = verifica impossibile (exit 2)", async () => {
  const empty = fakeGitHub({ deployments: [], statuses: {} });
  assert.equal((await runMonitor({ env: {}, client: createGitHubClient({ repo, fetchImpl: empty.fetchImpl }), log: silent })).code, EXIT_UNVERIFIABLE);

  const broken = fakeGitHub({ failOn: "/deployments" });
  assert.equal((await runMonitor({ env: {}, client: createGitHubClient({ repo, fetchImpl: broken.fetchImpl }), log: silent })).code, EXIT_UNVERIFIABLE);
});

test("monitor: il token viene inviato solo nell'header e mai nei log", async () => {
  const token = "ghs_fake_token_for_test_only";
  const lines = [];
  const { fetchImpl, calls } = fakeGitHub({
    deployments: [{ id: 2, sha: INCIDENT_SHA, created_at: "2026-10-19T15:53:38Z" }],
    statuses: { 2: "success" },
    compare: { [INCIDENT_SHA]: "diverged" },
  });
  await runMonitor({ env: {}, client: createGitHubClient({ repo, token, fetchImpl }), log: (l) => lines.push(l) });
  assert.ok(calls.every(({ init }) => init.headers.authorization === `Bearer ${token}`));
  assert.ok(calls.every(({ url }) => !url.includes(token)));
  assert.ok(lines.every((line) => !line.includes(token)));
});
