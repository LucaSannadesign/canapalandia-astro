/**
 * Database abstraction layer per Ribaltatore AI
 * 
 * IMPLEMENTAZIONE ATTUALE: File JSON (compatibile con serverless/Vercel)
 * PER MIGRAZIONE A SQLITE/POSTGRES: 
 * - Sostituire implementazione interna mantenendo la stessa interfaccia
 * - Installare better-sqlite3 per SQLite locale
 * - Installare @vercel/postgres o pg per Postgres su Vercel
 * 
 * La stessa interfaccia (insertRibaltata, getRibaltataById, listRibaltate)
 * può essere utilizzata senza modificare il codice chiamante.
 */

import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface Ribaltata {
  id: number;
  frase_originale: string;
  frase_ribaltata: string;
  created_at: string;
}

// Path file JSON (temporaneo fino a migrazione DB)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = process.env.DATABASE_URL || join(__dirname, "../../data/ribaltatore.json");
const MAX_ITEMS = 10000; // Limite items nel JSON

/**
 * Inizializza file JSON se non esiste
 */
async function ensureDb() {
  try {
    await fs.access(DB_PATH);
  } catch {
    // Crea directory se non esiste
    const dir = dirname(DB_PATH);
    await fs.mkdir(dir, { recursive: true });
    // Crea file vuoto
    await fs.writeFile(DB_PATH, JSON.stringify([], null, 2), "utf-8");
  }
}

/**
 * Legge tutte le frasi dal file
 */
async function readAll(): Promise<Ribaltata[]> {
  await ensureDb();
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    console.error("[db] Errore lettura file:", err?.message);
    return [];
  }
}

/**
 * Scrive tutte le frasi nel file
 */
async function writeAll(items: Ribaltata[]) {
  await ensureDb();
  // Limita a MAX_ITEMS (più recenti)
  const sorted = items
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, MAX_ITEMS);
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(sorted, null, 2), "utf-8");
  } catch (err: any) {
    console.error("[db] Errore scrittura file:", err?.message);
    throw err;
  }
}

/**
 * Genera nuovo ID incrementale
 */
async function getNextId(): Promise<number> {
  const items = await readAll();
  if (items.length === 0) return 1;
  const maxId = Math.max(...items.map((item) => item.id));
  return maxId + 1;
}

/**
 * Inserisce una nuova frase ribaltata
 */
export async function insertRibaltata(
  data: Pick<Ribaltata, "frase_originale" | "frase_ribaltata">,
): Promise<number> {
  const items = await readAll();
  const id = await getNextId();
  const now = new Date().toISOString();
  
  const newItem: Ribaltata = {
    id,
    frase_originale: data.frase_originale,
    frase_ribaltata: data.frase_ribaltata,
    created_at: now,
  };
  
  items.unshift(newItem); // Aggiungi in cima (più recente)
  await writeAll(items);
  return id;
}

/**
 * Recupera una frase ribaltata per ID
 */
export async function getRibaltataById(id: number): Promise<Ribaltata | null> {
  const items = await readAll();
  const item = items.find((item) => item.id === id);
  return item || null;
}

/**
 * Lista frasi ribaltate con paginazione
 */
export async function listRibaltate(options: {
  page: number;
  pageSize: number;
}): Promise<{ items: Ribaltata[]; totalPages: number; total: number }> {
  const items = await readAll();
  const { page, pageSize } = options;
  
  // Ordina per più recenti (già ordinato in readAll, ma riordina per sicurezza)
  const sorted = items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  
  const total = sorted.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const pageItems = sorted.slice(offset, offset + pageSize);
  
  return {
    items: pageItems,
    totalPages,
    total,
  };
}
