/**
 * Hook minimo per `node --test` sui moduli TypeScript di `src/lib/`:
 * gli import relativi senza estensione ("./localization") vengono risolti sul file `.ts`,
 * come fa Vite in build. Nessuna dipendenza esterna; il type-stripping lo fa Node 22.
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { isMainThread } from "node:worker_threads";
import { fileURLToPath } from "node:url";

if (isMainThread) register(import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
  }
  return nextResolve(specifier, context);
}
