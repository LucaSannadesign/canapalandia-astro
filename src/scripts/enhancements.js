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
      if (state.progressBar) state.progressBar.style.transform = `scaleX(${ratio})`;
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
        { root: null, threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
    }

    revealNodes.forEach((node) => {
      if (!node.classList.contains("is-revealed")) state.revealObserver.observe(node);
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
        if (!(link instanceof HTMLAnchorElement) || !link.href) continue;
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
        if (!unique.has(path)) unique.set(path, { href: url.pathname + url.search, title: text });
        if (unique.size >= limit) break;
      }

      if (unique.size === 0) {
        container.dataset.relatedReady = "1";
        return;
      }

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
      container.appendChild(list);
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
    const output = document.getElementById("coa-output");
    const resultsContainer = document.getElementById("coa-results");
    const termsContainer = document.getElementById("coa-terms");
    const resultsPanel = document.querySelector(".lab-results-panel");

    if (!(panel instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;

    const maxFileBytes = 15 * 1024 * 1024;
    const maxPdfPages = 30;
    const pdfJsVersion = "6.1.200";
    const pdfJsModuleUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.mjs`;
    const pdfJsWorkerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.worker.mjs`;
    const pdfLibModuleUrl = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
    let lastSourceName = "Testo incollato manualmente";

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
        .lab-file-reader { margin: 0 0 18px; }
        .lab-file-reader__drop {
          display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center;
          padding: 16px 17px; border: 1px dashed var(--lab-border-strong); border-radius: var(--r-md);
          background: color-mix(in srgb, var(--lab-surface-2) 48%, var(--lab-surface));
          transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
        }
        .lab-file-reader__drop.is-dragging { border-color: var(--lab-olive); background: var(--lab-surface); box-shadow: var(--lab-shadow-focus); }
        .lab-file-reader__copy { min-width: 0; }
        .lab-file-reader__title { display: block; margin: 0 0 4px; color: var(--lab-heading); font: 700 14px/1.3 var(--font-ui); }
        .lab-file-reader__hint { margin: 0; color: var(--lab-faint); font: 400 12.5px/1.45 var(--font-ui); }
        .lab-file-reader__button,
        .lab-report-button {
          display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 15px;
          border: 1px solid var(--lab-border-strong); border-radius: var(--r-md); background: var(--lab-surface);
          color: var(--lab-olive); font: 600 13px/1 var(--font-ui); cursor: pointer; white-space: nowrap;
        }
        .lab-file-reader__button:hover,
        .lab-report-button:hover { border-color: var(--lab-olive); background: var(--lab-surface-2); }
        .lab-file-reader__button:focus-visible,
        .lab-report-button:focus-visible { outline: 2px solid var(--lab-olive); outline-offset: 3px; }
        .lab-file-reader__status { min-height: 1.4em; margin: 8px 2px 0; color: var(--lab-faint); font: 500 12.5px/1.45 var(--font-ui); }
        .lab-file-reader__status.is-error { color: var(--lab-text); }
        .lab-file-reader__divider {
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin: 16px 0 14px;
          color: var(--lab-faint); font: 600 11px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase;
        }
        .lab-file-reader__divider::before,
        .lab-file-reader__divider::after { content: ""; height: 1px; background: var(--lab-border); }
        .lab-report-wrap { display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--lab-border); }
        .lab-report-button { min-height: 44px; padding-inline: 18px; background: var(--lab-green); border-color: var(--lab-green); color: #fffdf7; }
        .lab-report-button:hover { background: var(--lab-green-hover); border-color: var(--lab-green-hover); color: #fffdf7; }
        .lab-report-button[disabled] { opacity: .65; cursor: wait; }
        @media (max-width: 520px) {
          .lab-file-reader__drop { grid-template-columns: 1fr; align-items: stretch; }
          .lab-file-reader__button, .lab-report-button { width: 100%; }
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

    let reportButton = null;
    if (resultsPanel instanceof HTMLElement) {
      const reportWrap = document.createElement("div");
      reportWrap.className = "lab-report-wrap";
      reportWrap.hidden = true;
      reportButton = document.createElement("button");
      reportButton.type = "button";
      reportButton.className = "lab-report-button";
      reportButton.textContent = "Scarica report PDF";
      reportWrap.appendChild(reportButton);
      resultsPanel.appendChild(reportWrap);
    }

    const formatSize = (bytes) => {
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    };

    const normalizeThresholdLines = () => {
      const thresholdMarker = /<\s*(?:LOQ|LOD)\b|\bBELOW\s+(?:LOQ|LOD)\b|\b(?:ND|N\.D\.|NOT\s+DETECTED)\b/i;
      const numericUnit = /(?:^|\s|[:=])([0-9]+(?:[.,][0-9]+)?)\s*(%|mg\s*\/\s*g|mg\s*\/\s*ml|µg\s*\/\s*g|μg\s*\/\s*g|ug\s*\/\s*g|ppm)(?=\s|$)/gi;
      const nextText = textarea.value
        .split(/\r?\n/)
        .map((line) => {
          if (!thresholdMarker.test(line)) return line;
          thresholdMarker.lastIndex = 0;
          return line.replace(numericUnit, " ").replace(/\s{2,}/g, " ").trim();
        })
        .join("\n");
      if (nextText !== textarea.value) textarea.value = nextText;
    };

    if (analyzeButton instanceof HTMLButtonElement) {
      analyzeButton.addEventListener("click", normalizeThresholdLines, true);
    }

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
        const y = Array.isArray(item.transform) && typeof item.transform[5] === "number" ? item.transform[5] : null;
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
        await task.destroy();
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
      await task.destroy();
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

        lastSourceName = file.name;
        textarea.value = cleanText;
        normalizeThresholdLines();
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

    const collectReportData = () => {
      const results = [];
      if (resultsContainer instanceof HTMLElement) {
        resultsContainer.querySelectorAll(".lab-result").forEach((node) => {
          const analyte = node.querySelector("h3")?.textContent?.trim() || "Analita";
          const value = node.querySelector(".lab-result__value")?.textContent?.trim() || "—";
          const description = Array.from(node.querySelectorAll("p"))
            .find((p) => !p.classList.contains("lab-result__source"))?.textContent?.trim() || "";
          const source = node.querySelector(".lab-result__source")?.textContent?.replace(/^Riga letta:\s*/i, "").trim() || "";
          results.push({ analyte, value, description, source });
        });
      }

      const terms = [];
      if (termsContainer instanceof HTMLElement) {
        termsContainer.querySelectorAll(".lab-term").forEach((node) => {
          const term = node.querySelector("strong")?.textContent?.trim() || "";
          const text = node.querySelector("p")?.textContent?.trim() || "";
          if (term) terms.push({ term, text });
        });
      }

      return { results, terms };
    };

    const loadLogoPngBytes = async () => {
      try {
        const response = await fetch("/images/logo-canapalandia.svg", { credentials: "same-origin" });
        if (!response.ok) return null;
        const svgText = await response.text();
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const image = new Image();
          image.src = objectUrl;
          await image.decode();
          const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 4;
          const canvas = document.createElement("canvas");
          canvas.width = 800;
          canvas.height = Math.max(120, Math.round(canvas.width / ratio));
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!pngBlob) return null;
          return new Uint8Array(await pngBlob.arrayBuffer());
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        return null;
      }
    };

    const downloadReport = async () => {
      if (!(reportButton instanceof HTMLButtonElement)) return;
      const data = collectReportData();
      if (!data.results.length) {
        setStatus("Prima esegui un'analisi con almeno un risultato riconosciuto.", true);
        return;
      }

      const originalText = reportButton.textContent;
      reportButton.disabled = true;
      reportButton.textContent = "Creo il report…";

      try {
        const { PDFDocument, StandardFonts, rgb } = await import(pdfLibModuleUrl);
        const pdfDoc = await PDFDocument.create();
        pdfDoc.setTitle("Report di lettura COA — Canapalandia Lab");
        pdfDoc.setAuthor("Canapalandia");
        pdfDoc.setSubject("Lettura informativa di un certificato di analisi COA");
        pdfDoc.setCreator("Canapalandia Lab");

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const green = rgb(0.075, 0.20, 0.11);
        const olive = rgb(0.33, 0.44, 0.17);
        const cream = rgb(0.965, 0.949, 0.906);
        const textColor = rgb(0.09, 0.14, 0.10);
        const muted = rgb(0.33, 0.39, 0.34);
        const border = rgb(0.84, 0.82, 0.74);
        const pageSize = [595.28, 841.89];
        const margin = 46;
        const contentWidth = pageSize[0] - margin * 2;
        let page;
        let y;

        const pdfSafe = (value, activeFont = font) => {
          let safe = "";
          for (const char of String(value ?? "")) {
            try {
              activeFont.encodeText(char);
              safe += char;
            } catch {
              if (char === "Δ") safe += "Delta-";
              else if (char === "–" || char === "—") safe += "-";
              else if (char === "“" || char === "”") safe += '"';
              else if (char === "‘" || char === "’") safe += "'";
              else if (char === "→") safe += "->";
              else safe += "?";
            }
          }
          return safe;
        };

        const wrapText = (text, activeFont, size, maxWidth) => {
          const words = pdfSafe(text, activeFont).split(/\s+/).filter(Boolean);
          const lines = [];
          let line = "";
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (activeFont.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
            else {
              lines.push(line);
              line = word;
            }
          }
          if (line) lines.push(line);
          return lines.length ? lines : [""];
        };

        const drawFooter = (targetPage) => {
          targetPage.drawLine({ start: { x: margin, y: 34 }, end: { x: pageSize[0] - margin, y: 34 }, thickness: 0.6, color: border });
          targetPage.drawText("canapalandia.com  ·  canapalandia.com/contatti/  ·  WhatsApp +39 340 322 3494", {
            x: margin, y: 20, size: 7.5, font, color: muted,
          });
        };

        const newPage = () => {
          page = pdfDoc.addPage(pageSize);
          page.drawRectangle({ x: 0, y: pageSize[1] - 92, width: pageSize[0], height: 92, color: green });
          drawFooter(page);
          y = pageSize[1] - 118;
          return page;
        };

        const ensureSpace = (needed) => {
          if (y - needed < 50) newPage();
        };

        const drawWrapped = (text, options = {}) => {
          const size = options.size || 10;
          const activeFont = options.font || font;
          const color = options.color || textColor;
          const maxWidth = options.maxWidth || contentWidth;
          const lineHeight = options.lineHeight || size * 1.35;
          const lines = wrapText(text, activeFont, size, maxWidth);
          ensureSpace(lines.length * lineHeight + 4);
          for (const line of lines) {
            page.drawText(line, { x: options.x || margin, y, size, font: activeFont, color });
            y -= lineHeight;
          }
          return lines.length * lineHeight;
        };

        newPage();
        const logoBytes = await loadLogoPngBytes();
        if (logoBytes) {
          try {
            const logo = await pdfDoc.embedPng(logoBytes);
            const scaled = logo.scale(0.23);
            page.drawImage(logo, { x: margin, y: pageSize[1] - 70, width: scaled.width, height: scaled.height });
          } catch {}
        }
        page.drawText("CANAPALANDIA LAB", { x: margin, y: pageSize[1] - 80, size: 9, font: bold, color: cream });
        page.drawText("REPORT DI LETTURA COA", { x: margin, y, size: 22, font: bold, color: green });
        y -= 28;
        drawWrapped("Documento informativo generato automaticamente dal Canapalandia Lab.", { size: 10.5, color: muted });
        y -= 6;
        page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.8, color: border });
        y -= 20;

        page.drawText("DATI DELL'ANALISI", { x: margin, y, size: 9, font: bold, color: olive });
        y -= 17;
        drawWrapped(`Fonte analizzata: ${lastSourceName}`, { size: 10, font: bold });
        drawWrapped(`Data del report: ${new Date().toLocaleString("it-IT")}`, { size: 9.5, color: muted });
        y -= 12;

        page.drawText("RISULTATI RICONOSCIUTI", { x: margin, y, size: 9, font: bold, color: olive });
        y -= 18;
        for (const item of data.results) {
          const descLines = wrapText(item.description, font, 8.6, contentWidth - 24);
          const sourceLines = wrapText(`Riga letta: ${item.source}`, font, 7.8, contentWidth - 24);
          const blockHeight = 38 + descLines.length * 11 + sourceLines.length * 10;
          ensureSpace(blockHeight + 12);
          page.drawRectangle({ x: margin, y: y - blockHeight + 8, width: contentWidth, height: blockHeight, color: cream, borderColor: border, borderWidth: 0.6 });
          const safeAnalyte = pdfSafe(item.analyte, bold);
          const safeValue = pdfSafe(item.value, bold);
          page.drawText(safeAnalyte, { x: margin + 12, y: y - 8, size: 11, font: bold, color: green });
          const valueWidth = bold.widthOfTextAtSize(safeValue, 9.2);
          page.drawText(safeValue, { x: pageSize[0] - margin - 12 - valueWidth, y: y - 8, size: 9.2, font: bold, color: textColor });
          let blockY = y - 25;
          for (const line of descLines) {
            page.drawText(line, { x: margin + 12, y: blockY, size: 8.6, font, color: muted });
            blockY -= 11;
          }
          for (const line of sourceLines) {
            page.drawText(line, { x: margin + 12, y: blockY - 1, size: 7.8, font, color: muted });
            blockY -= 10;
          }
          y -= blockHeight + 10;
        }

        if (data.terms.length) {
          ensureSpace(70);
          y -= 5;
          page.drawText("SIGLE E SOGLIE TROVATE", { x: margin, y, size: 9, font: bold, color: olive });
          y -= 17;
          for (const item of data.terms) {
            ensureSpace(42);
            page.drawText(pdfSafe(item.term, bold), { x: margin, y, size: 9.5, font: bold, color: green });
            y -= 13;
            drawWrapped(item.text, { size: 8.7, color: muted });
            y -= 6;
          }
        }

        ensureSpace(120);
        y -= 4;
        page.drawText("NOTA IMPORTANTE", { x: margin, y, size: 9, font: bold, color: olive });
        y -= 17;
        drawWrapped(
          "Questo report traduce i dati che il software è riuscito a riconoscere nel testo del certificato. Non certifica la legalità, la sicurezza, la qualità o l'idoneità al consumo del prodotto e non sostituisce il laboratorio, un professionista sanitario o un parere legale.",
          { size: 9, color: textColor, lineHeight: 12.5 },
        );
        y -= 10;
        page.drawText("CONTATTI CANAPALANDIA", { x: margin, y, size: 9, font: bold, color: olive });
        y -= 17;
        drawWrapped("Sito: https://canapalandia.com", { size: 9 });
        drawWrapped("Contatti: https://canapalandia.com/contatti/", { size: 9 });
        drawWrapped("WhatsApp: +39 340 322 3494", { size: 9 });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const date = new Date().toISOString().slice(0, 10);
        anchor.href = url;
        anchor.download = `canapalandia-lab-report-coa-${date}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus("✓ Report PDF creato sul dispositivo.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Non sono riuscito a creare il report PDF.";
        setStatus(`Report non creato: ${message}`, true);
      } finally {
        reportButton.disabled = false;
        reportButton.textContent = originalText || "Scarica report PDF";
      }
    };

    const updateReportVisibility = () => {
      const reportWrap = reportButton?.parentElement;
      if (!(reportWrap instanceof HTMLElement)) return;
      const hasResults = resultsContainer instanceof HTMLElement && resultsContainer.querySelectorAll(".lab-result").length > 0;
      const outputVisible = output instanceof HTMLElement && !output.hidden;
      reportWrap.hidden = !(hasResults && outputVisible);
    };

    reportButton?.addEventListener("click", downloadReport);
    if (output instanceof HTMLElement) {
      const observer = new MutationObserver(updateReportVisibility);
      observer.observe(output, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden"] });
      updateReportVisibility();
    }

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
      lastSourceName = "Testo incollato manualmente";
      setStatus("");
      updateReportVisibility();
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
