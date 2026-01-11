/**
 * Rate limiting semplice in-memory per IP
 * Utilizzato per limitare richieste per IP a /api/ribalta-ai
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateMap = new Map<string, RateLimitEntry>();

/**
 * Estrae IP client dalla request
 */
export function extractClientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const ips = xf.split(",").map((ip) => ip.trim());
    return ips[0] || "";
  }
  const xr = request.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "";
}

/**
 * Verifica rate limit per IP
 * @param ip IP del client
 * @param maxRequests Numero massimo di richieste
 * @param windowMs Finestra temporale in millisecondi
 * @returns true se entro il limite, false se superato
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = 10,
  windowMs: number = 10 * 60 * 1000, // 10 minuti default
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = ip || "unknown";
  const now = Date.now();
  const entry = rateMap.get(key);

  // Se non esiste entry o è scaduta, crea nuova entry
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    // Cleanup vecchie entry (ogni 100 richieste, pulisci quelle scadute)
    if (rateMap.size > 1000) {
      for (const [k, v] of rateMap.entries()) {
        if (now > v.resetAt) {
          rateMap.delete(k);
        }
      }
    }

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  // Entry esistente e valida
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Incrementa contatore
  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}