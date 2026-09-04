import fs from "node:fs";

const checks = [
  {
    path: "src/pages/index.astro",
    forbidden: [
      "Canapalandia è un progetto informativo: non vendiamo prodotti",
    ],
  },
  {
    path: "src/pages/chi-siamo/index.astro",
    forbidden: ["senza venderti un prodotto"],
  },
  {
    path: "src/pages/chi-siamo/missione.astro",
    forbidden: ["Non siamo un negozio", "Non vendiamo direttamente prodotti"],
  },
  {
    path: "src/pages/termini-e-condizioni.astro",
    forbidden: ["Bozza staging commerce"],
  },
];

const failures = [];

for (const check of checks) {
  if (!fs.existsSync(check.path)) {
    failures.push(`${check.path}: file missing`);
    continue;
  }

  const content = fs.readFileSync(check.path, "utf8");
  for (const phrase of check.forbidden) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`${check.path}: forbidden launch text found -> ${phrase}`);
    }
  }
}

if (failures.length) {
  console.error("[commerce-content-gate] BLOCKED");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("[commerce-content-gate] Apply the coordinated content cutover before release.");
  process.exit(1);
}

console.log("[commerce-content-gate] PASS");
