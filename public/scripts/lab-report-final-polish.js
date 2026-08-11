(() => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.location.pathname.replace(/\/$/, "") !== "/lab") return;

  const pdfLibModuleUrl = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

  const cleanSourceLine = (value) =>
    String(value || "")
      .replace(/^Riga letta:\s*/i, "")
      .replace(/\bMeasured\b/gi, "")
      .replace(/\bNot\s+detected\b/gi, "")
      .replace(/\b(LOQ)(?:\s+\1)+\b/gi, "$1")
      .replace(/\b(LOD)(?:\s+\1)+\b/gi, "$1")
      .replace(/\b(ND)(?:\s+\1)+\b/gi, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

  const collectReportData = () => {
    const sourceStatus = document.querySelector(".lab-file-reader__status")?.textContent || "";
    const sourceMatch = sourceStatus.match(/^✓\s+(.+?)\s+·/);
    const sourceName = sourceMatch?.[1]?.trim() || "Testo incollato manualmente";

    const results = Array.from(document.querySelectorAll("#coa-results .lab-result")).map((node) => {
      const paragraphs = Array.from(node.querySelectorAll("p"));
      return {
        analyte: node.querySelector("h3")?.textContent?.trim() || "Analita",
        value: node.querySelector(".lab-result__value")?.textContent?.trim() || "—",
        description:
          paragraphs.find((p) => !p.classList.contains("lab-result__source"))?.textContent?.trim() || "",
        source: cleanSourceLine(node.querySelector(".lab-result__source")?.textContent || ""),
      };
    });

    const terms = Array.from(document.querySelectorAll("#coa-terms .lab-term"))
      .map((node) => ({
        term: node.querySelector("strong")?.textContent?.trim() || "",
        text: node.querySelector("p")?.textContent?.trim() || "",
      }))
      .filter((item) => item.term);

    return { sourceName, results, terms };
  };

  const loadLogoPngBytes = async () => {
    try {
      const response = await fetch("/images/logo-canapalandia.svg", { credentials: "same-origin" });
      if (!response.ok) return null;
      const svgText = await response.text();
      const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 4;
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = Math.max(140, Math.round(canvas.width / ratio));
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

  const createPolishedReport = async (button) => {
    const data = collectReportData();
    if (!data.results.length) return;

    const status = document.querySelector(".lab-file-reader__status");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Creo il report…";

    try {
      const { PDFDocument, StandardFonts, rgb } = await import(pdfLibModuleUrl);
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle("Report di lettura COA — Canapalandia Lab");
      pdfDoc.setAuthor("Canapalandia");
      pdfDoc.setSubject("Lettura informativa di un certificato di analisi COA");
      pdfDoc.setCreator("Canapalandia Lab");

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pageSize = [595.28, 841.89];
      const margin = 38;
      const footerY = 22;
      const contentWidth = pageSize[0] - margin * 2;
      const gap = 12;
      const cardWidth = (contentWidth - gap) / 2;

      const green = rgb(0.075, 0.20, 0.11);
      const olive = rgb(0.33, 0.44, 0.17);
      const cream = rgb(0.965, 0.949, 0.906);
      const textColor = rgb(0.09, 0.14, 0.10);
      const muted = rgb(0.33, 0.39, 0.34);
      const border = rgb(0.84, 0.82, 0.74);

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
          if (!line || activeFont.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
          else {
            lines.push(line);
            line = word;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const drawFooter = (targetPage) => {
        targetPage.drawLine({
          start: { x: margin, y: 34 },
          end: { x: pageSize[0] - margin, y: 34 },
          thickness: 0.55,
          color: border,
        });
        targetPage.drawText("canapalandia.com  ·  canapalandia.com/contatti/  ·  WhatsApp +39 340 322 3494", {
          x: margin,
          y: footerY,
          size: 7.1,
          font,
          color: muted,
        });
      };

      const addPage = (continuation = false) => {
        page = pdfDoc.addPage(pageSize);
        page.drawRectangle({ x: 0, y: pageSize[1] - 72, width: pageSize[0], height: 72, color: green });
        drawFooter(page);
        y = pageSize[1] - 96;
        if (continuation) {
          page.drawText("CANAPALANDIA LAB · REPORT COA", {
            x: margin,
            y: pageSize[1] - 47,
            size: 10,
            font: bold,
            color: cream,
          });
        }
      };

      const ensureSpace = (needed) => {
        if (y - needed < 48) addPage(true);
      };

      const drawWrapped = (text, options = {}) => {
        const size = options.size || 9;
        const activeFont = options.font || font;
        const color = options.color || textColor;
        const maxWidth = options.maxWidth || contentWidth;
        const lineHeight = options.lineHeight || size * 1.28;
        const lines = wrapText(text, activeFont, size, maxWidth);
        ensureSpace(Math.max(lines.length, 1) * lineHeight + 2);
        for (const line of lines) {
          page.drawText(line, { x: options.x || margin, y, size, font: activeFont, color });
          y -= lineHeight;
        }
      };

      addPage(false);
      const logoBytes = await loadLogoPngBytes();
      if (logoBytes) {
        try {
          const logo = await pdfDoc.embedPng(logoBytes);
          const maxLogoWidth = 175;
          const scale = Math.min(maxLogoWidth / logo.width, 46 / logo.height);
          page.drawImage(logo, {
            x: margin,
            y: pageSize[1] - 59,
            width: logo.width * scale,
            height: logo.height * scale,
          });
        } catch {}
      }
      page.drawText("CANAPALANDIA LAB", {
        x: margin,
        y: pageSize[1] - 64,
        size: 8.5,
        font: bold,
        color: cream,
      });

      page.drawText("REPORT DI LETTURA COA", { x: margin, y, size: 20, font: bold, color: green });
      y -= 25;
      drawWrapped("Documento informativo generato automaticamente dal Canapalandia Lab.", {
        size: 9.4,
        color: muted,
      });
      y -= 3;
      page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.7, color: border });
      y -= 15;

      page.drawText("DATI DELL'ANALISI", { x: margin, y, size: 8.3, font: bold, color: olive });
      y -= 14;
      drawWrapped(`Fonte analizzata: ${data.sourceName}`, { size: 8.8, font: bold });
      drawWrapped(`Data del report: ${new Date().toLocaleString("it-IT")}`, { size: 8.2, color: muted });
      y -= 8;

      page.drawText("RISULTATI RICONOSCIUTI", { x: margin, y, size: 8.3, font: bold, color: olive });
      y -= 14;

      for (let index = 0; index < data.results.length; index += 2) {
        const pair = data.results.slice(index, index + 2).map((item) => {
          const innerWidth = cardWidth - 18;
          const valueLines = wrapText(item.value, bold, 7.9, innerWidth);
          const descLines = wrapText(item.description, font, 7.2, innerWidth);
          const sourceText = item.source ? `Riga letta: ${item.source}` : "";
          const sourceLines = wrapText(sourceText, font, 6.5, innerWidth);
          const height =
            16 +
            Math.max(valueLines.length, 1) * 9 +
            Math.max(descLines.length, 1) * 8.4 +
            (sourceLines.length ? sourceLines.length * 7.6 + 5 : 0) +
            12;
          return { item, valueLines, descLines, sourceLines, height };
        });

        const rowHeight = Math.max(...pair.map((entry) => entry.height));
        ensureSpace(rowHeight + 9);

        pair.forEach((entry, column) => {
          const x = margin + column * (cardWidth + gap);
          page.drawRectangle({
            x,
            y: y - rowHeight + 5,
            width: cardWidth,
            height: rowHeight,
            color: cream,
            borderColor: border,
            borderWidth: 0.55,
          });

          let cardY = y - 9;
          page.drawText(pdfSafe(entry.item.analyte, bold), {
            x: x + 9,
            y: cardY,
            size: 9.4,
            font: bold,
            color: green,
          });
          cardY -= 12;

          for (const line of entry.valueLines) {
            page.drawText(line, { x: x + 9, y: cardY, size: 7.9, font: bold, color: textColor });
            cardY -= 9;
          }
          cardY -= 2;

          for (const line of entry.descLines) {
            page.drawText(line, { x: x + 9, y: cardY, size: 7.2, font, color: muted });
            cardY -= 8.4;
          }

          if (entry.sourceLines.length) {
            cardY -= 2;
            for (const line of entry.sourceLines) {
              page.drawText(line, { x: x + 9, y: cardY, size: 6.5, font, color: muted });
              cardY -= 7.6;
            }
          }
        });

        y -= rowHeight + 8;
      }

      if (data.terms.length) {
        ensureSpace(62);
        page.drawText("SIGLE E SOGLIE TROVATE", { x: margin, y, size: 8.3, font: bold, color: olive });
        y -= 14;
        const termWidth = (contentWidth - gap) / 2;
        for (let index = 0; index < data.terms.length; index += 2) {
          const pair = data.terms.slice(index, index + 2).map((item) => {
            const lines = wrapText(item.text, font, 7.1, termWidth - 2);
            return { item, lines, height: 12 + Math.max(lines.length, 1) * 8.2 };
          });
          const rowHeight = Math.max(...pair.map((entry) => entry.height));
          ensureSpace(rowHeight + 7);
          pair.forEach((entry, column) => {
            const x = margin + column * (termWidth + gap);
            page.drawText(pdfSafe(entry.item.term, bold), { x, y, size: 8.2, font: bold, color: green });
            let termY = y - 11;
            for (const line of entry.lines) {
              page.drawText(line, { x, y: termY, size: 7.1, font, color: muted });
              termY -= 8.2;
            }
          });
          y -= rowHeight + 5;
        }
      }

      ensureSpace(92);
      y -= 2;
      page.drawText("NOTA IMPORTANTE", { x: margin, y, size: 8.3, font: bold, color: olive });
      y -= 13;
      drawWrapped(
        "Questo report traduce i dati che il software è riuscito a riconoscere nel testo del certificato. Non certifica la legalità, la sicurezza, la qualità o l'idoneità al consumo del prodotto e non sostituisce il laboratorio, un professionista sanitario o un parere legale.",
        { size: 7.7, color: textColor, lineHeight: 9.8 },
      );
      y -= 6;
      page.drawText("CONTATTI CANAPALANDIA", { x: margin, y, size: 8.3, font: bold, color: olive });
      y -= 13;
      drawWrapped("canapalandia.com  ·  canapalandia.com/contatti/  ·  WhatsApp +39 340 322 3494", {
        size: 7.7,
        color: textColor,
      });

      const pages = pdfDoc.getPages();
      pages.forEach((targetPage, index) => {
        const pageLabel = `Pagina ${index + 1} di ${pages.length}`;
        const width = font.widthOfTextAtSize(pageLabel, 6.8);
        targetPage.drawText(pageLabel, {
          x: pageSize[0] - margin - width,
          y: footerY,
          size: 6.8,
          font,
          color: muted,
        });
      });

      const pdfBytes = await pdfDoc.save();
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `canapalandia-lab-report-coa-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (status) status.textContent = "✓ Report PDF rifinito creato sul dispositivo.";
    } catch (error) {
      if (status) {
        status.textContent = `Report non creato: ${error instanceof Error ? error.message : "errore imprevisto"}`;
        status.classList.add("is-error");
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText || "Scarica report PDF";
    }
  };

  const install = () => {
    const originalButton = document.querySelector(".lab-report-button");
    const resultsContainer = document.getElementById("coa-results");
    const output = document.getElementById("coa-output");
    if (!(originalButton instanceof HTMLButtonElement) || !(resultsContainer instanceof HTMLElement)) return false;
    if (originalButton.dataset.polishedReport === "1") return true;

    const button = originalButton.cloneNode(true);
    button.dataset.polishedReport = "1";
    originalButton.replaceWith(button);
    const wrap = button.parentElement;

    const updateVisibility = () => {
      if (!(wrap instanceof HTMLElement)) return;
      const hasResults = resultsContainer.querySelectorAll(".lab-result").length > 0;
      const outputVisible = output instanceof HTMLElement && !output.hidden;
      wrap.hidden = !(hasResults && outputVisible);
    };

    button.addEventListener("click", () => createPolishedReport(button));
    const observer = new MutationObserver(updateVisibility);
    observer.observe(resultsContainer, { childList: true, subtree: true });
    if (output instanceof HTMLElement) observer.observe(output, { attributes: true, attributeFilter: ["hidden"] });
    updateVisibility();
    return true;
  };

  if (install()) return;
  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();