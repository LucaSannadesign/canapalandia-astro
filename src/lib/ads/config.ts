/**
 * Configurazione runtime dell'Advertising Manager.
 *
 * Interruttore globale: ADS_ENABLED. Qualsiasi valore diverso dalla stringa esatta "true"
 * (assente, vuoto, "1", "TRUE", "yes"…) equivale a disattivato. Con l'interruttore spento
 * nessun annuncio viene mostrato e gli endpoint pubblici rispondono 404, anche se nel database
 * esistesse una campagna in stato `active`.
 */

export interface AdsEnv {
  ADS_ENABLED?: string;
  ADS_ADMIN_TOKEN?: string;
  ADS_HASH_SECRET?: string;
  /** Domini di destinazione ammessi a livello globale, separati da virgola (oltre a quelli dell'inserzionista). */
  ADS_DESTINATION_ALLOWLIST?: string;
}

export const ADS_ENV_KEYS = ["ADS_ENABLED", "ADS_ADMIN_TOKEN", "ADS_HASH_SECRET", "ADS_DESTINATION_ALLOWLIST"] as const;

/** Lunghezza minima dei segreti (token admin e secret di hashing). */
export const ADS_MIN_SECRET_LENGTH = 32;

export function isAdsEnabled(env: AdsEnv): boolean {
  return env.ADS_ENABLED === "true";
}

/** Tracciamento possibile solo con interruttore acceso e secret di hashing robusto. */
export function isTrackingConfigured(env: AdsEnv): boolean {
  return isAdsEnabled(env) && (env.ADS_HASH_SECRET?.length ?? 0) >= ADS_MIN_SECRET_LENGTH;
}

export function globalDestinationAllowlist(env: AdsEnv): string[] {
  return (env.ADS_DESTINATION_ALLOWLIST ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Legge le variabili da `process.env` (runtime Vercel) con fallback su `import.meta.env`.
 * Mai variabili PUBLIC_: nessun valore arriva al browser.
 */
export function readAdsEnv(): AdsEnv {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const procEnv: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};
  const env: AdsEnv = {};
  for (const key of ADS_ENV_KEYS) {
    const value = procEnv[key] ?? metaEnv[key];
    if (typeof value === "string") env[key] = value;
  }
  return env;
}
