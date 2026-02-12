(() => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__canapalandiaEnhancementsLoaded) return;
  window.__canapalandiaEnhancementsLoaded = true;

  const state = {
    revealObserver: null,
    progressBound: false,
    progressTicking: false,
    progressBar: null,
  };

  function setupReadingProgress() {
    if (!state.progressBar) {
      let bar = document.getElementById("reading-progress-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "reading-progress-bar";
        bar.setAttribute("aria-hidden", "true");
        document.body.appendChild(bar);
      }
      state.progressBar = bar;
    }

    const updateProgress = () => {
      const doc = document.documentElement;
      const maxScroll = Math.max(doc.scrollHeight - doc.clientHeight, 0);
      const ratio = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0;
      if (state.progressBar) {
        state.progressBar.style.transform = `scaleX(${ratio})`;
      }
      state.progressTicking = false;
    };

    const onScroll = () => {
      if (state.progressTicking) return;
      state.progressTicking = true;
      window.requestAnimationFrame(updateProgress);
    };

    if (!state.progressBound) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      state.progressBound = true;
    }

    updateProgress();
  }

  function setupReveal() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealNodes = document.querySelectorAll(".reveal");
    if (revealNodes.length === 0) return;

    if (prefersReducedMotion || typeof window.IntersectionObserver === "undefined") {
      revealNodes.forEach((node) => node.classList.add("is-revealed", "show"));
      return;
    }

    if (!state.revealObserver) {
      state.revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed", "show");
            state.revealObserver?.unobserve(entry.target);
          });
        },
        {
          root: null,
          threshold: 0.12,
          rootMargin: "0px 0px -8% 0px",
        },
      );
    }

    revealNodes.forEach((node) => {
      if (!node.classList.contains("is-revealed")) {
        state.revealObserver.observe(node);
      }
    });
  }

  function setupRelatedSuggestions() {
    const containers = document.querySelectorAll("[data-related]");
    if (containers.length === 0) return;

    const currentPath = window.location.pathname.replace(/\/$/, "");

    containers.forEach((container) => {
      if (container.dataset.relatedReady === "1") return;

      const sourceSelector = container.dataset.relatedSource || ".post-card a, article a[href^='/'], a[href*='/blog/']";
      const limit = Math.max(Number.parseInt(container.dataset.relatedLimit || "3", 10) || 3, 1);
      const links = Array.from(document.querySelectorAll(sourceSelector));

      const unique = new Map();
      for (const link of links) {
        if (!(link instanceof HTMLAnchorElement)) continue;
        if (!link.href) continue;

        let url;
        try {
          url = new URL(link.href, window.location.origin);
        } catch {
          continue;
        }

        if (url.origin !== window.location.origin) continue;
        const path = url.pathname.replace(/\/$/, "");
        if (!path || path === currentPath) continue;

        const text = (link.textContent || "").trim();
        if (!text || text.length < 8) continue;

        if (!unique.has(path)) {
          unique.set(path, {
            href: url.pathname + url.search,
            title: text,
          });
        }

        if (unique.size >= limit) break;
      }

      if (unique.size === 0) {
        container.dataset.relatedReady = "1";
        return;
      }

      const fragment = document.createDocumentFragment();
      const list = document.createElement("ul");
      list.className = "related-auto-list";

      for (const item of unique.values()) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = item.href;
        a.textContent = item.title;
        li.appendChild(a);
        list.appendChild(li);
      }

      fragment.appendChild(list);
      container.appendChild(fragment);
      container.dataset.relatedReady = "1";
    });
  }

  function initEnhancements() {
    setupReadingProgress();
    setupReveal();
    setupRelatedSuggestions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEnhancements, { once: true });
  } else {
    initEnhancements();
  }

  document.addEventListener("astro:page-load", initEnhancements);
  document.addEventListener("astro:after-swap", initEnhancements);
})();