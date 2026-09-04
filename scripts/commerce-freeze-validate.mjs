import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("docs/commerce/PARTNER-AREA-FREEZE-TEMPLATE.json");

if (!fs.existsSync(manifestPath)) {
  console.error(`[commerce-freeze] ERROR: manifest missing: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const blockers = [];
const notes = [];
const allowedStatuses = new Set(["FROZEN", "FALLBACK", "REJECTED", "NEEDS SUPPORT"]);

function requireValue(value, label) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    blockers.push(label);
    return false;
  }
  return true;
}

for (const product of manifest.products || []) {
  const prefix = `${product.id || "unknown"}`;

  if (!allowedStatuses.has(product.status)) {
    blockers.push(`${prefix}: invalid status ${product.status}`);
  }

  if (product.status !== "FROZEN") {
    blockers.push(`${prefix}: status must be FROZEN for release (current: ${product.status})`);
  }

  requireValue(product.productName, `${prefix}: productName missing`);
  requireValue(product.productTypeId, `${prefix}: productTypeId missing`);
  requireValue(product.basePrice, `${prefix}: basePrice missing`);
  requireValue(product.currency, `${prefix}: currency missing`);
  requireValue(product.vatLabel, `${prefix}: VAT label missing`);
  requireValue(product.colors, `${prefix}: colors missing`);
  requireValue(product.techniques, `${prefix}: techniques missing`);
  requireValue(product.selectedTechnique, `${prefix}: selectedTechnique missing`);
  requireValue(product.decorationArea, `${prefix}: decorationArea missing`);
  requireValue(product.fileConstraints, `${prefix}: fileConstraints missing`);
  requireValue(product.marginLabel, `${prefix}: marginLabel missing`);
  requireValue(product.selectedRetailPriceEur, `${prefix}: selectedRetailPriceEur missing`);
  requireValue(product.estimatedPartnerMarginEur, `${prefix}: estimatedPartnerMarginEur missing`);

  if (product.id === "tshirt" && (!Array.isArray(product.sizes) || product.sizes.length === 0)) {
    blockers.push(`${prefix}: sizes missing`);
  }

  if (typeof product.estimatedPartnerMarginEur === "number" && product.estimatedPartnerMarginEur <= 0) {
    blockers.push(`${prefix}: estimatedPartnerMarginEur must be positive`);
  }
}

const gates = manifest.globalGates || {};
const requiredGlobalGates = [
  "sellerOfRecordConfirmed",
  "payoutDocumentTreatmentValidatedForItaly",
  "germanWithholdingClarified",
  "hostedStorefrontReady",
  "siteLegalCopyCutoverReady",
  "stagingQaPassed"
];

for (const gate of requiredGlobalGates) {
  if (gates[gate] !== true) blockers.push(`global gate: ${gate} is not closed`);
}

if (gates.publicCommerceIndexable === true) {
  notes.push("publicCommerceIndexable is already true; ensure this is being run only for an approved production release.");
} else {
  notes.push("publicCommerceIndexable remains false: correct until final publication batch.");
}

for (const note of notes) console.log(`[commerce-freeze] ${note}`);

if (blockers.length > 0) {
  console.error(`[commerce-freeze] BLOCKED: ${blockers.length} release requirement(s) incomplete`);
  for (const blocker of blockers) console.error(`[commerce-freeze] - ${blocker}`);
  process.exit(1);
}

console.log("[commerce-freeze] PASS: provider, pricing and global release gates are frozen");
