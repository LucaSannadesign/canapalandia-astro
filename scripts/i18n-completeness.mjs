// Shared publication gate. No dependencies or external services.
export function ready(entry) {
  return Boolean(entry && !entry.draft && entry.status === "ready" &&
    entry.editorialStatus === "current" && Number.isFinite(Date.parse(entry.publishDate)));
}

export function completenessErrors(entries, pairs, policy, promotedPaths = new Set()) {
  const errors = [];
  const legacy = new Set(policy.legacyPaths);
  const cutoff = Date.parse(policy.requiredFrom);
  if (!Number.isFinite(cutoff)) throw new Error("Invalid bilingual policy cutoff");
  const exceptions = new Map();
  for (const e of policy.exceptions) {
    if (!e.slug || !e.reason?.trim() || !e.approval?.trim() || exceptions.has(e.slug)) {
      errors.push("Invalid or duplicate monolingual exception: " + (e.slug || "(missing slug)"));
      continue;
    }
    exceptions.set(e.slug, e);
  }
  const bySlug = new Map();
  for (const pair of pairs) {
    bySlug.set(pair.it, { partner: pair.en, language: "it" });
    bySlug.set(pair.en, { partner: pair.it, language: "en" });
  }
  for (const [slug, entry] of entries) {
    if (!ready(entry)) continue;
    const required = !legacy.has(entry.path) || Date.parse(entry.publishDate) >= cutoff || promotedPaths.has(entry.path);
    if (!required) continue;
    const pair = bySlug.get(slug);
    if (!pair) {
      if (!exceptions.has(slug)) errors.push("Missing IT/EN translation pair for ready article: " + slug);
      continue;
    }
    const other = entries.get(pair.partner);
    if (!ready(other)) {
      errors.push("Translation counterpart is missing or not ready: " + slug + " -> " + pair.partner);
      continue;
    }
    if (entry.language !== pair.language || other.language === entry.language || !["it", "en"].includes(other.language)) {
      errors.push("Translation pair has incorrect language/category: " + slug + " -> " + pair.partner);
    }
    // Compare publication days, allowing an existing earlier translation.
    // A future counterpart cannot satisfy a publication scheduled for an earlier day.
    const releaseDay = Math.max(Date.parse(entry.publishDate.slice(0, 10)), Date.parse(new Date().toISOString().slice(0, 10)));
    if (Date.parse(other.publishDate.slice(0, 10)) > releaseDay) {
      errors.push("Translation counterpart is scheduled too late: " + slug + " -> " + pair.partner);
    }
  }
  return errors;
}
