

// Fonte dati: storico esportato da WordPress (tabella cl_ribaltatore)
// Metti il file JSON qui: `src/data/ribaltate.json`
import raw from './ribaltate.json';

export type Ribaltata = {
  id: number;
  input: string;
  output: string;
  createdAt?: string;
};

// Normalizzazione minima (difensiva)
export const ribaltate: Ribaltata[] = (Array.isArray(raw) ? raw : [])
  .map((r: any) => ({
    id: Number(r?.id ?? 0),
    input: String(r?.input ?? ''),
    output: String(r?.output ?? ''),
    createdAt: r?.createdAt ? String(r.createdAt) : undefined,
  }))
  .filter((r) => Number.isFinite(r.id) && r.id > 0);

export function getLatestRibaltate(limit = 9): Ribaltata[] {
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 9;
  // Ordina per id decrescente (legacy id WP)
  return [...ribaltate].sort((a, b) => b.id - a.id).slice(0, n);
}

export function searchRibaltate(query: string, limit = 50): Ribaltata[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];

  const n = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

  return [...ribaltate]
    .filter((r) => (r.input + ' ' + r.output).toLowerCase().includes(q))
    .sort((a, b) => b.id - a.id)
    .slice(0, n);
}