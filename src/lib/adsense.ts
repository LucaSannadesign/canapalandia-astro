/**
 * AdSense utility functions for Astro
 * Centralized management of AdSense script loading and slot initialization
 */

const ADSENSE_SCRIPT_URL = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const MIN_SLOT_WIDTH = 250; // Minimum width in pixels for AdSense slots
const isDev = typeof window !== "undefined" && (
  window.location.hostname === "localhost" || 
  window.location.hostname.includes("vercel.app")
);

declare global {
  interface Window {
    adsbygoogle?: any[];
    __adsenseLoaded?: boolean;
    __adsenseInitAttempted?: Set<HTMLElement>;
  }
}

/**
 * Ensures AdSense script is loaded once
 * @param clientId - AdSense client ID (e.g., "ca-pub-...")
 * @returns Promise that resolves when script is loaded
 */
export async function ensureAdSenseScriptLoaded(clientId: string): Promise<void> {
  // Check if already loaded
  if (window.__adsenseLoaded) {
    if (isDev) console.log("[AdSense] Script already loaded");
    return Promise.resolve();
  }

  // Check if script tag already exists in DOM
  const existingScript = document.querySelector(
    `script[src*="${ADSENSE_SCRIPT_URL.split("/").pop()}"]`
  ) as HTMLScriptElement | null;

  if (existingScript) {
    if (isDev) console.log("[AdSense] Script tag already exists in DOM");
    window.__adsenseLoaded = true;
    window.dispatchEvent(new CustomEvent("adsense:script-loaded"));
    return Promise.resolve();
  }

  // Create and load script
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `${ADSENSE_SCRIPT_URL}?client=${clientId}`;
    script.crossOrigin = "anonymous";

    script.onload = () => {
      window.__adsenseLoaded = true;
      if (isDev) {
        console.log("[AdSense] Script loaded successfully");
      }
      window.dispatchEvent(new CustomEvent("adsense:script-loaded"));
      resolve();
    };

    script.onerror = () => {
      console.error("[AdSense] Failed to load script");
      reject(new Error("AdSense script failed to load"));
    };

    document.head.appendChild(script);
    // Set flag immediately to prevent race conditions
    window.__adsenseLoaded = true;
  });
}

/**
 * Gets the effective width of an element's container
 * Traverses up the DOM to find the actual visible width
 */
function getContainerWidth(element: HTMLElement): number {
  // Start from the element itself
  let current: HTMLElement | null = element;
  let width = 0;

  // Traverse up to find a container with actual width
  while (current && current !== document.body) {
    const rect = current.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(current);
    
    // Skip hidden elements
    if (computedStyle.display === "none" || computedStyle.visibility === "hidden") {
      current = current.parentElement;
      continue;
    }

    // Use the first element with a meaningful width
    if (rect.width > 0) {
      width = rect.width;
      break;
    }

    current = current.parentElement;
  }

  // Fallback: use viewport width if no container found
  if (width === 0) {
    width = window.innerWidth;
  }

  return width;
}

/**
 * Initializes AdSense slots that haven't been initialized yet
 * @param root - Root node to search from (defaults to document)
 */
export function initAdSenseSlots(root: ParentNode = document): void {
  // Verify AdSense script is loaded
  if (!window.adsbygoogle || typeof window.adsbygoogle.push !== "function") {
    if (isDev) console.log("[initAdSenseSlots] AdSense script not ready yet");
    return;
  }

  // Initialize tracking set if needed
  if (!window.__adsenseInitAttempted) {
    window.__adsenseInitAttempted = new Set();
  }

  // Find all ad slots
  const adElements = root.querySelectorAll("ins.adsbygoogle") as NodeListOf<HTMLElement>;
  
  if (adElements.length === 0) {
    if (isDev) console.log("[initAdSenseSlots] No AdSense slots found");
    return;
  }

  let initialized = 0;
  let skipped = 0;
  let skippedWidth = 0;

  adElements.forEach((element) => {
    // Guard 1: Check if already initialized (data-adsbygoogle-status)
    const status = element.getAttribute("data-adsbygoogle-status");
    if (status) {
      if (isDev) {
        const slot = element.getAttribute("data-ad-slot");
        console.log(`[initAdSenseSlots] Slot ${slot} already initialized (status: ${status}), skipping`);
      }
      skipped++;
      return;
    }

    // Guard 2: Check if we've already attempted to initialize this element
    if (window.__adsenseInitAttempted!.has(element)) {
      if (isDev) {
        const slot = element.getAttribute("data-ad-slot");
        console.log(`[initAdSenseSlots] Slot ${slot} already attempted, skipping`);
      }
      skipped++;
      return;
    }

    // Guard 3: Verify required attributes
    const adClient = element.getAttribute("data-ad-client");
    const adSlot = element.getAttribute("data-ad-slot");

    if (!adClient || !adSlot) {
      if (isDev) {
        console.warn("[initAdSenseSlots] Skipping: missing data-ad-client or data-ad-slot", {
          hasClient: !!adClient,
          hasSlot: !!adSlot,
        });
      }
      skipped++;
      return;
    }

    // Guard 4: Check container width
    const containerWidth = getContainerWidth(element);
    
    if (containerWidth < MIN_SLOT_WIDTH) {
      // Hide the slot and skip initialization
      element.style.display = "none";
      if (isDev) {
        console.warn(
          `[initAdSenseSlots] Slot ${adSlot} skipped: container too narrow (${Math.round(containerWidth)}px < ${MIN_SLOT_WIDTH}px)`
        );
      }
      skippedWidth++;
      
      // Optionally: schedule retry with ResizeObserver
      // For now, we just hide it
      skipped++;
      return;
    }

    // All guards passed: initialize this slot
    try {
      // Mark as attempted before push to prevent duplicates
      window.__adsenseInitAttempted!.add(element);
      
      // Ensure adsbygoogle array exists
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      
      initialized++;
      if (isDev) {
        console.log(`[initAdSenseSlots] Initialized slot ${adSlot} (width: ${Math.round(containerWidth)}px)`);
      }
    } catch (e) {
      console.error(`[initAdSenseSlots] Error initializing slot ${adSlot}:`, e);
      // Remove from attempted set on error so it can be retried
      window.__adsenseInitAttempted!.delete(element);
    }
  });

  if (isDev && (initialized > 0 || skipped > 0)) {
    console.log(
      `[initAdSenseSlots] Completed: ${initialized} initialized, ${skipped} skipped` +
      (skippedWidth > 0 ? ` (${skippedWidth} too narrow)` : "")
    );
  }
}

/**
 * Sets up AdSense initialization on page load and Astro view transitions
 * Call this once in your layout
 */
export function setupAdSense(clientId: string): void {
  // Load script
  ensureAdSenseScriptLoaded(clientId).catch((err) => {
    console.error("[setupAdSense] Failed to load script:", err);
  });

  // Initialize on DOM ready
  const initWhenReady = () => {
    if (window.__adsenseLoaded) {
      initAdSenseSlots();
    } else {
      window.addEventListener("adsense:script-loaded", () => {
        initAdSenseSlots();
      }, { once: true });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWhenReady);
  } else {
    initWhenReady();
  }

  // Support Astro view transitions
  document.addEventListener("astro:page-load", () => {
    if (isDev) console.log("[setupAdSense] astro:page-load event");
    // Small delay to ensure DOM is updated
    setTimeout(() => {
      initAdSenseSlots();
    }, 100);
  });

  document.addEventListener("astro:after-swap", () => {
    if (isDev) console.log("[setupAdSense] astro:after-swap event");
    setTimeout(() => {
      initAdSenseSlots();
    }, 100);
  });
}
