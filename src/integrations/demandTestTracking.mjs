const clientScript = `
(() => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const normalizedPath = window.location.pathname.replace(/\\/+$/, "");
  if (normalizedPath !== "/bottega") return;

  const campaign = "hemp-food-001";
  const endpoint = "/api/demand-test-event";

  function classifyKnownSource(value) {
    const text = String(value || "").toLowerCase();
    if (!text) return null;
    if (/buttondown|newsletter|email/.test(text)) return "newsletter";
    if (/facebook|instagram|linkedin|telegram|whatsapp|twitter|tiktok|threads|mastodon/.test(text)) return "social";
    if (/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot/.test(text)) return "ai";
    if (/google|bing|yahoo|duckduckgo|ecosia|brave/.test(text)) return "search";
    return null;
  }

  function classifySource() {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    const utmCategory = classifyKnownSource(utmSource);
    if (utmCategory) return utmCategory;

    if (!document.referrer) return "direct";

    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin) return "internal";
      return classifyKnownSource(referrer.hostname) || "referral";
    } catch {
      return "unknown";
    }
  }

  const source = classifySource();

  function sendCounter(eventType) {
    fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign, eventType, source }),
    }).catch(() => {});
  }

  // Esposizione: page view del concept. Nessun cookie o identificatore aggiuntivo.
  sendCounter("view");

  let interestClickSent = false;
  document.addEventListener("click", (event) => {
    if (interestClickSent || !(event.target instanceof Element)) return;
    const interestButton = event.target.closest("[data-interest-cta]");
    if (!interestButton) return;
    interestClickSent = true;
    sendCounter("interest_click");
  }, { passive: true });

  // La signup viene contata solo dopo che il backend newsletter ha restituito successo
  // (o conferma che l'indirizzo era già presente). Non leggiamo né inviamo l'email.
  const status = document.getElementById("formStatus");
  if (status instanceof HTMLElement) {
    let signupSent = false;
    const detectSignup = () => {
      if (signupSent) return;
      const message = (status.textContent || "").trim();
      if (!/^(Grazie\\.|Sei già)/i.test(message)) return;
      signupSent = true;
      sendCounter("signup");
    };

    new MutationObserver(detectSignup).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    detectSignup();
  }
})();
`;

export default function demandTestTracking() {
  return {
    name: "canapalandia-demand-test-tracking",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript("page", clientScript);
      },
    },
  };
}
