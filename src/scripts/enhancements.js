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

  function setupLabFileReader() {
    if (window.location.pathname.replace(/\/$/, "") !== "/lab") return;
    if (document.getElementById("lab-file-reader")) return;

    const panel = document.querySelector(".lab-input-panel");
    const textarea = document.getElementById("coa-input");
    const analyzeButton = document.getElementById("analyze-coa");
    const clearButton = document.getElementById("clear-coa");
    if (!(panel instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;

    const maxFileBytes = 15 * 1024 * 1024;
    const maxPdfPages = 30;
    const pdfJsVersion = "6.1.200";
    const pdfJsModuleUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.mjs`;
    const pdfJsWorkerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.worker.mjs`;

    const step = panel.querySelector(".lab-step");
    if (step) step.textContent = "1 · CARICA O INCOLLA";

    const lead = document.querySelector(".lab-lead");
    if (lead) {
      lead.textContent = "Carica un certificato PDF o TXT, oppure incolla la parte del COA con i risultati. Il Lab prova a riconoscere cannabinoidi, valori e sigle di laboratorio e li riscrive in modo più comprensibile.";
    }

    const privacy = document.querySelector(".lab-privacy span:last-child");
    if (privacy) {
      privacy.textContent = "L'analisi avviene nel browser: il file e il testo non vengono inviati ai server di Canapalandia da questo strumento.";
    }

    if (!document.getElementById("lab-file-reader-styles")) {
      const style = document.createElement("style");
      style.id = "lab-file-reader-styles";
      style.textContent = `
        .lab-file-reader {
          margin: 0 0 18px;
        }
        .lab-file-reader__drop {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 16px 17px;
          border: 1px dashed var(--lab-border-strong);
          border-radius: 12px;
          background: color-mix(in srgb, var(--lab-surface-2) 48%, var(--lab-surface));
          transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
        }
        .lab-file-reader__drop.is-dragging {
          border-color: var(--lab-olive);
          background: var(--lab-surface);
          box-shadow: var(--lab-shadow-focus);
        }
        .lab-file-reader__copy {
          min-width: 0;
        }
        .lab-file-reader__title {
          display: block;
          margin: 0 0 4px;
          color: var(--lab-heading);
          font: 700 14px/1.3 var(--font-ui);
        }
        .lab-file-reader__hint {
          margin: 0;
          color: var(--lab-faint);
          font: 400 12.5px/1.45 var(--font-ui);
        }
        .lab-file-reader__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 15px;
          border: 1px solid var(--lab-border-strong);
          border-radius: 999px;
          background: var(--lab-surface);
          color: var(--lab-olive);
          font: 600 13px/1 var(--font-ui);
          cursor: pointer;
          white-space: nowrap;
        }
        .lab-file-reader__button:hover {
          border-color: var(--lab-olive);
          background: var(--lab-surface-2);
        }
        .lab-file-reader__button:focus-visible {
          outline: 2px solid var(--lab-olive);
          outline-offset: 3px;
        }
        .lab-file-reader__status {
          min-height: 1.4em;
          margin: 8px 2px 0;
          color: var(--lab-faint);
          font: 500 12.5px/1.45 var(--font-ui);
        }
        .lab-file-reader__status.is-error {
          color: var(--lab-text);
        }
        .lab-file-reader__divider {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          margin: 16px 0 14px;
          color: var(--lab-faint);
          font: 600 11px/1 var(--font-ui);
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .lab-file-reader__divider::before,
        .lab-file-reader__divider::after {
          content: "";
          height: 1px;
          background: var(--lab-border);
        }
        @media (max-width: 520px) {
          .lab-file-reader__drop {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
          .lab-file-reader__button {
            width: 100%;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const wrapper = document.createElement("div");
    wrapper.id = "lab-file-reader";
    wrapper.className = "lab-file-reader";

    const dropZone = document.createElement("div");
    dropZone.className = "lab-file-reader__drop";
    dropZone.tabIndex = 0;
    dropZone.setAttribute("role", "button");
    dropZone.setAttribute("aria-label", "Carica un certificato PDF o TXT");

    const copy = document.createElement("div");
    copy.className = "lab-file-reader__copy";

    const title = document.createElement("strong");
    title.className = "lab-file-reader__title";
    title.textContent = "Carica il certificato";

    const hint = document.createElement("p");
    hint.className = "lab-file-reader__hint";
    hint.textContent = "PDF con testo o file TXT · massimo 15 MB · elaborazione locale nel browser";

    copy.append(title, hint);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "coa-file-input";
    fileInput.accept = ".pdf,.txt,application/pdf,text/plain";
    fileInput.hidden = true;

    const chooseButton = document.createElement("label");
    chooseButton.className = "lab-file-reader__button";
    chooseButton.htmlFor = fileInput.id;
    chooseButton.textContent = "Scegli file";

    const status = document.createElement("p");
    status.className = "lab-file-reader__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const divider = document.createElement("div");
    divider.className = "lab-file-reader__divider";
    divider.textContent = "oppure incolla il testo";

    dropZone.append(copy, chooseButton, fileInput);
    wrapper.append(dropZone, status, divider);
    textarea.parentNode?.insertBefore(wrapper, textarea);

    const formatSize = (bytes) => {
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    };

    const getPdfJs = async () => {
      const pdfjsLib = await import(pdfJsModuleUrl);
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfJsWorkerUrl;
      return pdfjsLib;
    };

    const pageTextToLines = (textContent) => {
      const lines = [];
      let currentLine = [];
      let currentY = null;

      const flush = () => {
        const line = currentLine.join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
        currentLine = [];
      };

      for (const item of textContent.items || []) {
        if (!item || typeof item.str !== "string") continue;
        const text = item.str.trim();
        if (!text) continue;

        const y = Array.isArray(item.transform) && typeof item.transform[5] === "number"
          ? item.transform[5]
          : null;

        if (currentY !== null && y !== null && Math.abs(y - currentY) > 2) flush();
        currentLine.push(text);
        currentY = y;

        if (item.hasEOL) {
          flush();
          currentY = null;
        }
      }

      flush();
      return lines.join("\n");
    };

    const extractPdfText = async (file) => {
      const pdfjsLib = await getPdfJs();
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjsLib.getDocument({ data });
      const pdf = await task.promise;

      if (pdf.numPages > maxPdfPages) {
        await pdf.destroy();
        throw new Error(`Il PDF ha ${pdf.numPages} pagine. Per sicurezza il limite è ${maxPdfPages} pagine.`);
      }

      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Lettura PDF: pagina ${pageNumber} di ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = pageTextToLines(textContent);
        if (pageText) pages.push(pageText);
        page.cleanup();
      }

      const pageCount = pdf.numPages;
      await pdf.destroy();
      return { text: pages.join("\n\n"), pageCount };
    };

    const processFile = async (file) => {
      if (!(file instanceof File)) return;

      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const isPdf = file.type === "application/pdf" || extension === "pdf";
      const isTxt = file.type === "text/plain" || extension === "txt";

      if (!isPdf && !isTxt) {
        setStatus("Formato non supportato. Usa un file PDF o TXT.", true);
        return;
      }

      if (file.size > maxFileBytes) {
        setStatus(`Il file pesa ${formatSize(file.size)}. Il limite è 15 MB.`, true);
        return;
      }

      try {
        dropZone.setAttribute("aria-busy", "true");
        chooseButton.style.pointerEvents = "none";
        setStatus(`Lettura di ${file.name}…`);

        let text = "";
        let detail = "testo caricato";

        if (isTxt) {
          text = await file.text();
        } else {
          const result = await extractPdfText(file);
          text = result.text;
          detail = `${result.pageCount} ${result.pageCount === 1 ? "pagina" : "pagine"}`;
        }

        const cleanText = text.replace(/\u0000/g, "").trim();
        if (cleanText.length < 12) {
          throw new Error(
            isPdf
              ? "Il PDF non contiene testo leggibile. Potrebbe essere una scansione: prova a incollare manualmente i risultati del COA."
              : "Il file TXT non contiene testo sufficiente da analizzare.",
          );
        }

        textarea.value = cleanText;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus(`✓ ${file.name} · ${detail} · ${formatSize(file.size)} · testo estratto localmente`);

        if (analyzeButton instanceof HTMLButtonElement) analyzeButton.click();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Non sono riuscito a leggere il file.";
        setStatus(message, true);
      } finally {
        dropZone.removeAttribute("aria-busy");
        chooseButton.style.pointerEvents = "";
        fileInput.value = "";
      }
    };

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) processFile(file);
    });

    dropZone.addEventListener("click", (event) => {
      if (event.target === chooseButton || event.target === fileInput) return;
      fileInput.click();
    });

    dropZone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      fileInput.click();
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
      });
    });

    dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) processFile(file);
    });

    clearButton?.addEventListener("click", () => {
      setStatus("");
    });
  }

  function initEnhancements() {
    setupReadingProgress();
    setupReveal();
    setupRelatedSuggestions();
    setupLabFileReader();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEnhancements, { once: true });
  } else {
    initEnhancements();
  }

  document.addEventListener("astro:page-load", initEnhancements);
  document.addEventListener("astro:after-swap", initEnhancements);
})();