// scripts/production-guard.mjs
//
// Guardia di rilascio: la produzione deve servire solo commit del branch `main`.
// Vedi docs/ops/production-release-runbook.md.
//
//   node scripts/production-guard.mjs build
//     Eseguito nel prebuild. Su Vercel, blocca una build Production che non
//     proviene da `main` (es. "Promote to Production" / redeploy di una Preview).
//     Fuori da Vercel o in Preview non fa nulla.
//
//   node scripts/production-guard.mjs monitor
//     Eseguito in GitHub Actions (sola lettura). Legge l'ultimo deployment
//     "Production" registrato da Vercel su GitHub e verifica che il suo commit
//     sia contenuto in `main`.
//
// Exit code: 0 = ok, 1 = violazione, 2 = verifica impossibile.
// Lo script non stampa mai token o variabili d'ambiente sensibili.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PRODUCTION_BRANCH = "main";
export const EXIT_OK = 0;
export const EXIT_VIOLATION = 1;
export const EXIT_UNVERIFIABLE = 2;

const shortSha = (sha) => (sha ? String(sha).slice(0, 7) : "n/d");

// ---------------------------------------------------------------------------
// Modalità build
// ---------------------------------------------------------------------------

export function checkBuildEnv(env) {
  if (env.VERCEL !== "1") {
    return { ok: true, reason: "build fuori da Vercel: guardia non applicata" };
  }

  if (!env.VERCEL_ENV) {
    // Le System Environment Variables non sono esposte: non blocchiamo
    // (bloccheremmo anche main), ma lo segnaliamo. Il monitor resta attivo.
    return {
      ok: true,
      warning:
        "VERCEL_ENV assente: abilitare 'Automatically expose System Environment Variables' nel progetto Vercel",
      reason: "ambiente Vercel non determinabile",
    };
  }

  if (env.VERCEL_ENV !== "production") {
    return { ok: true, reason: `build ${env.VERCEL_ENV}: guardia non applicata` };
  }

  const ref = env.VERCEL_GIT_COMMIT_REF || "";
  const sha = env.VERCEL_GIT_COMMIT_SHA || "";

  if (ref === PRODUCTION_BRANCH) {
    return { ok: true, reason: `build production da ${PRODUCTION_BRANCH}@${shortSha(sha)}` };
  }

  return {
    ok: false,
    reason:
      `build production bloccata: branch "${ref || "sconosciuto"}" @ ${shortSha(sha)}. ` +
      `La produzione accetta solo "${PRODUCTION_BRANCH}": unire la PR e lasciare che Vercel rilasci main. ` +
      `Il deployment attuale resta online.`,
  };
}

// ---------------------------------------------------------------------------
// Modalità monitor
// ---------------------------------------------------------------------------

// `compareStatus` è lo stato di GET /repos/{repo}/compare/{prodSha}...{main}:
// "identical" o "ahead" = main contiene il commit di produzione.
export function evaluateProduction({ productionSha, mainSha, compareStatus }) {
  const prod = shortSha(productionSha);

  if (compareStatus === "identical") {
    return { ok: true, reason: `produzione allineata a ${PRODUCTION_BRANCH}@${prod}` };
  }
  if (compareStatus === "ahead") {
    return {
      ok: true,
      warning: `produzione su ${prod}, ${PRODUCTION_BRANCH} è più avanti (${shortSha(mainSha)}): rilascio in corso, build fallita o rollback`,
      reason: `commit di produzione ${prod} contenuto in ${PRODUCTION_BRANCH}`,
    };
  }
  if (compareStatus === "not_found") {
    return { ok: false, reason: `commit di produzione ${prod} non trovato nel repository` };
  }
  return {
    ok: false,
    reason: `commit di produzione ${prod} NON contenuto in ${PRODUCTION_BRANCH} (stato: ${compareStatus})`,
  };
}

export function createGitHubClient({ repo, token, fetchImpl = fetch, apiUrl = "https://api.github.com" }) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "canapalandia-production-guard",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  async function get(path) {
    const res = await fetchImpl(`${apiUrl}/repos/${repo}${path}`, { headers });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) throw new Error(`GitHub API ${res.status} su ${path}`);
    return { status: res.status, body: await res.json() };
  }

  return {
    async listProductionDeployments() {
      const { body } = await get("/deployments?environment=Production&per_page=30");
      return body || [];
    },
    async latestStatus(deploymentId) {
      const { body } = await get(`/deployments/${deploymentId}/statuses?per_page=1`);
      return body && body[0] ? body[0].state : null;
    },
    async mainSha() {
      const { body } = await get(`/commits/${PRODUCTION_BRANCH}`);
      return body ? body.sha : null;
    },
    async compare(base, head) {
      const { status, body } = await get(`/compare/${base}...${head}`);
      return status === 404 ? "not_found" : body.status;
    },
  };
}

// Il deployment Production più recente il cui ultimo stato è "success".
// GitHub restituisce i deployment dal più recente; i precedenti diventano "inactive".
export async function findCurrentProduction(client) {
  const deployments = await client.listProductionDeployments();
  for (const deployment of deployments) {
    if ((await client.latestStatus(deployment.id)) === "success") {
      return { id: deployment.id, sha: deployment.sha, createdAt: deployment.created_at };
    }
  }
  return null;
}

export async function runMonitor({ env, client, log = console.log }) {
  try {
    let productionSha = env.PRODUCTION_SHA || "";
    let source = "evento deployment_status";

    if (!productionSha) {
      const current = await findCurrentProduction(client);
      if (!current) {
        log("::error::Nessun deployment Production con stato success trovato su GitHub");
        return { code: EXIT_UNVERIFIABLE };
      }
      productionSha = current.sha;
      source = `GitHub deployment ${current.id} (${current.createdAt})`;
    }

    const mainSha = await client.mainSha();
    const compareStatus = await client.compare(productionSha, PRODUCTION_BRANCH);
    const result = evaluateProduction({ productionSha, mainSha, compareStatus });
    const report = { ...result, productionSha, mainSha, compareStatus, source };

    log(JSON.stringify(report, null, 2));
    if (result.warning) log(`::warning::${result.warning}`);
    if (!result.ok) {
      log(`::error::${result.reason}. Seguire docs/ops/production-release-runbook.md (nessun rollback automatico).`);
    }
    return { code: result.ok ? EXIT_OK : EXIT_VIOLATION, report };
  } catch (error) {
    log(`::error::Verifica produzione non riuscita: ${error.message}`);
    return { code: EXIT_UNVERIFIABLE };
  }
}

function writeSummary(report) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file || !report) return;
  const lines = [
    `## Production guard: ${report.ok ? "OK" : "VIOLAZIONE"}`,
    "",
    `- Esito: ${report.reason}`,
    report.warning ? `- Avviso: ${report.warning}` : null,
    `- Commit produzione: \`${report.productionSha}\``,
    `- ${PRODUCTION_BRANCH}: \`${report.mainSha}\``,
    `- Confronto: \`${report.compareStatus}\``,
    `- Fonte: ${report.source}`,
    "",
  ].filter((line) => line !== null);
  fs.appendFileSync(file, lines.join("\n") + "\n");
}

async function main(mode) {
  if (mode === "build") {
    const result = checkBuildEnv(process.env);
    if (result.warning) console.warn(`[production-guard] ATTENZIONE: ${result.warning}`);
    if (!result.ok) {
      console.error(`[production-guard] ${result.reason}`);
      process.exit(EXIT_VIOLATION);
    }
    console.log(`[production-guard] ${result.reason}`);
    return;
  }

  if (mode === "monitor") {
    const repo = process.env.GITHUB_REPOSITORY || "LucaSannadesign/canapalandia-astro";
    const client = createGitHubClient({ repo, token: process.env.GITHUB_TOKEN });
    const { code, report } = await runMonitor({ env: process.env, client });
    writeSummary(report);
    process.exit(code);
  }

  console.error("Uso: node scripts/production-guard.mjs <build|monitor>");
  process.exit(EXIT_UNVERIFIABLE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv[2]);
}
