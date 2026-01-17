/**
 * Google Consent Mode v2 - Gestione consenso ads/analytics
 * 
 * IMPORTANTE: Limited Ads in AdSense UI
 * Per attivare "Limited ads" (monetizzazione senza consenso), configura in AdSense:
 * Account > Privacy & messaging > EU user consent > Enable "Non-personalized ads"
 * Questo permette ad AdSense di mostrare annunci anche con consenso "denied".
 * 
 * I segnali di consenso vengono inviati PRIMA del caricamento di AdSense per permettere
 * "Limited ads" quando il consenso è denied.
 */

// Tipi per Google Consent Mode v2
type ConsentStatus = "granted" | "denied";

interface ConsentState {
  ad_storage: ConsentStatus;
  ad_user_data: ConsentStatus;
  ad_personalization: ConsentStatus;
  analytics_storage: ConsentStatus;
}

/**
 * Inizializza Google Consent Mode con stato "denied" di default
 * Deve essere chiamato PRIMA del caricamento di AdSense/GA4 per permettere "Limited ads"
 */
export function initGoogleConsentMode(): void {
  if (typeof window === "undefined") return;

  // Inizializza gtag se non esiste (necessario per Consent Mode)
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(...args: any[]) {
      window.dataLayer.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500, // Attendi fino a 500ms per aggiornamenti consenso
    } as ConsentState);
  } else {
    // Se gtag esiste già, imposta solo i default denied
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    } as ConsentState);
  }
}

/**
 * Aggiorna Google Consent Mode quando l'utente accetta/rifiuta
 * @param granted - true se consenso accordato, false se rifiutato
 */
export function updateGoogleConsentMode(granted: boolean): void {
  if (typeof window === "undefined" || !window.gtag) {
    // Se gtag non è disponibile, inizializza prima
    initGoogleConsentMode();
  }

  const status: ConsentStatus = granted ? "granted" : "denied";
  
  // Aggiorna consenso
  window.gtag("consent", "update", {
    ad_storage: status,
    ad_user_data: status,
    ad_personalization: status,
    analytics_storage: status,
  } as ConsentState);

  // Log per debug (solo in dev)
  if (import.meta.env.DEV) {
    console.log(`[Consent Mode] Updated to: ${status}`);
  }
}

/**
 * Legge il consenso salvato da localStorage (formato legacy)
 * Ritorna null se non c'è consenso salvato
 */
export function getSavedConsent(): { analytics: boolean; ads?: boolean } | null {
  if (typeof window === "undefined") return null;
  
  try {
    const STORAGE_KEY = "canapalandia_cookie_consent";
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const consent = JSON.parse(saved);
      // Assicura che ads sia true se analytics è true (per compatibilità)
      return {
        analytics: consent.analytics === true,
        ads: consent.ads === true || consent.analytics === true,
      };
    }
  } catch {
    // Ignora errori di parsing
  }
  
  return null;
}

/**
 * Salva consenso in localStorage (formato legacy per compatibilità)
 */
export function saveConsent(analytics: boolean): void {
  if (typeof window === "undefined") return;
  
  try {
    const STORAGE_KEY = "canapalandia_cookie_consent";
    const consent = {
      analytics: analytics === true,
      ads: analytics === true, // Ads segue analytics per semplicità
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Ignora errori di storage (privacy mode, ecc.)
  }
}
