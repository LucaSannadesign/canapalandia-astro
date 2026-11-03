/**
 * Validazione delle destinazioni pubblicitarie.
 * Il redirect dei clic usa SOLO l'URL salvato e approvato nel database (mai parametri della richiesta),
 * e lo ricontrolla qui contro l'allowlist prima di ogni redirect: nessun open redirect.
 */

const MAX_URL_LENGTH = 2000;

export type DestinationCheck = { ok: true; url: URL } | { ok: false; reason: string };

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
}

/** Host uguale al dominio o suo sottodominio (shop.example.com ammesso per example.com). */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const d = normalizeDomain(domain);
  if (!d || !/^[a-z0-9.-]+$/.test(d) || !d.includes(".")) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function checkDestination(raw: unknown, allowedDomains: readonly string[]): DestinationCheck {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "destinazione mancante" };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: "destinazione troppo lunga" };
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return { ok: false, reason: "caratteri non ammessi nella destinazione" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "destinazione non valida" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "solo destinazioni https" };
  if (url.username || url.password) return { ok: false, reason: "credenziali nell'URL non ammesse" };
  if (url.port && url.port !== "443") return { ok: false, reason: "porta non ammessa" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith("[")) {
    return { ok: false, reason: "indirizzi IP non ammessi" };
  }
  if (!allowedDomains.some((d) => hostMatchesDomain(url.hostname, d))) {
    return { ok: false, reason: `dominio ${url.hostname} non in allowlist` };
  }
  return { ok: true, url };
}

/** Percorso immagine self-hosted sotto /ads/ (stessa regola del vincolo SQL). */
export function isSafeImagePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    /^\/ads\/[a-z0-9][a-z0-9/_.-]*\.(webp|png|jpg|jpeg|avif)$/.test(path) &&
    !path.includes("..") &&
    !path.includes("//")
  );
}
