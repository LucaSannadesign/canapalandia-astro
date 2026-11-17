/**
 * Normalizza il valore del secret MAKE_WEBHOOK_URL senza divulgarlo.
 * Un payload Make puo' arrivare come URL isolato, URL tra virgolette
 * o testo contenente UNA sola URL hook.<zone>.make.com.
 * Non punta mai a endpoint diversi dal dominio ufficiale dei webhook Make.
 */
export function normalizeMakeWebhookUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const matches = [...raw.matchAll(/https:\/\/hook\.[a-z0-9-]+\.make\.com\/[a-z0-9_-]+/gi)]
    .map((match) => match[0]);

  if (matches.length !== 1) {
    throw new Error("MAKE_WEBHOOK_URL non valido: attesa esattamente una URL https://hook.<zone>.make.com/<token>");
  }

  const url = new URL(matches[0]);
  if (!/^hook\.[a-z0-9-]+\.make\.com$/i.test(url.hostname) ||
      url.protocol !== "https:" ||
      !/^\/[a-z0-9_-]+$/i.test(url.pathname)) {
    throw new Error("MAKE_WEBHOOK_URL non valido: il destinatario non e' un webhook ufficiale Make");
  }

  return url.toString();
}
