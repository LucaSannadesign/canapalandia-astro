/** Collega handler e componenti all'ambiente reale (env runtime + Supabase), con repository creato solo su richiesta. */

import type { AdsDeps } from "./handlers";
import { readAdsEnv } from "./config";
import { createSupabaseAdsRepository } from "./supabaseRepository";
import type { AdsRepository } from "./repository";

let repository: AdsRepository | null = null;

export function runtimeAdsDeps(clientIp?: string): AdsDeps {
  return {
    env: readAdsEnv(),
    repo: () => (repository ??= createSupabaseAdsRepository()),
    clientIp,
  };
}
