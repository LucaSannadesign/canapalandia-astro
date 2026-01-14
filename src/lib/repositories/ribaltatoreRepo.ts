/**
 * Repository pattern per Ribaltatore AI (Supabase/Postgres)
 * 
 * Interfaccia identica a db.ts per swap trasparente
 * Funziona con Supabase Postgres su Vercel
 */

import { getSupabaseServer } from "../supabaseServer";
import { normalizeKey } from "../utils";

export interface Ribaltata {
  id: number;
  frase_originale: string;
  frase_ribaltata: string;
  created_at: string;
  ip_hash?: string | null;
  user_id?: string | null;
}

export interface InsertRibaltataData {
  frase_originale: string;
  frase_ribaltata: string;
  ip_hash?: string | null;
  user_id?: string | null;
}

/**
 * Trova una frase esistente per chiave normalizzata (deduplicazione)
 */
export async function findRibaltataByNormalizedKey(
  fraseOriginale: string,
): Promise<Ribaltata | null> {
  const supabase = getSupabaseServer();
  const normalizedKey = normalizeKey(fraseOriginale);

  // Cerca per frase_originale normalizzata (case-insensitive, whitespace-insensitive)
  // Nota: Supabase non supporta direttamente ricerca case-insensitive su testo,
  // quindi recuperiamo tutte le frasi e filtriamo in memoria (per dataset piccoli è OK)
  // Per dataset grandi, si potrebbe aggiungere una colonna `normalized_key` nel DB
  
  const { data, error } = await supabase
    .from("ribaltatore")
    .select("id,frase_originale,frase_ribaltata,created_at")
    .limit(1000); // Limite ragionevole per deduplicazione

  if (error) {
    console.error("[ribaltatoreRepo] Errore ricerca:", error);
    return null;
  }

  // Filtra in memoria per chiave normalizzata
  const match = (data || []).find((row) => {
    const rowKey = normalizeKey(row.frase_originale);
    return rowKey === normalizedKey;
  });

  if (!match) return null;

  return {
    id: Number(match.id),
    frase_originale: match.frase_originale,
    frase_ribaltata: match.frase_ribaltata,
    created_at: match.created_at,
    ip_hash: null,
    user_id: null,
  };
}

/**
 * Inserisce una nuova frase ribaltata con deduplicazione (upsert logic)
 * Se esiste già una frase con la stessa chiave normalizzata, ritorna l'ID esistente
 */
export async function insertRibaltata(
  data: InsertRibaltataData,
): Promise<number> {
  const supabase = getSupabaseServer();

  // Deduplicazione: cerca frase esistente con stessa chiave normalizzata
  const existing = await findRibaltataByNormalizedKey(data.frase_originale);
  if (existing) {
    if (import.meta.env.DEV) {
      console.log(`[ribaltatoreRepo] Frase duplicata trovata (ID: ${existing.id}), ritorno ID esistente`);
    }
    return existing.id;
  }

  // Inserisci nuova frase
  const { data: result, error } = await supabase
    .from("ribaltatore")
    .insert({
      frase_originale: data.frase_originale,
      frase_ribaltata: data.frase_ribaltata,
      ip_hash: data.ip_hash || null,
      user_id: data.user_id || null,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ribaltatoreRepo] Errore inserimento:", error);
    throw new Error(`Errore inserimento: ${error.message}`);
  }

  if (!result || !result.id) {
    throw new Error("Inserimento fallito: id non restituito");
  }

  return Number(result.id);
}

/**
 * Recupera una frase ribaltata per ID
 */
export async function getRibaltataById(id: number): Promise<Ribaltata | null> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("ribaltatore")
    .select("id,frase_originale,frase_ribaltata,created_at")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    console.error("[ribaltatoreRepo] Errore lettura:", error);
    throw new Error(`Errore lettura: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: Number(data.id),
    frase_originale: data.frase_originale,
    frase_ribaltata: data.frase_ribaltata,
    created_at: data.created_at,
    ip_hash: data.ip_hash || null,
    user_id: data.user_id || null,
  };
}

/**
 * Lista frasi ribaltate con paginazione e deduplicazione lato UI (fallback)
 */
export async function listRibaltate(options: {
  page: number;
  pageSize: number;
}): Promise<{ items: Ribaltata[]; totalPages: number; total: number }> {
  const supabase = getSupabaseServer();
  const { page, pageSize } = options;
  const offset = (page - 1) * pageSize;

  // Conta totale
  const { count, error: countError } = await supabase
    .from("ribaltatore")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("[ribaltatoreRepo] Errore conteggio:", countError);
    throw new Error(`Errore conteggio: ${countError.message}`);
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  if (import.meta.env.DEV) {
    console.log(`[ribaltatoreRepo] Totale record: ${total}, Pagina: ${page}/${totalPages}, Offset: ${offset}`);
  }

  // Recupera items paginati (ordinati per più recenti)
  // Recuperiamo più items per compensare eventuali duplicati filtrati
  const fetchSize = pageSize * 2; // Recupera il doppio per compensare duplicati
  const { data, error } = await supabase
    .from("ribaltatore")
    .select("id,frase_originale,frase_ribaltata,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchSize - 1);

  if (error) {
    console.error("[ribaltatoreRepo] Errore query:", error);
    throw new Error(`Errore query: ${error.message}`);
  }

  const rawItems: Ribaltata[] = (data || []).map((row) => ({
    id: Number(row.id),
    frase_originale: row.frase_originale,
    frase_ribaltata: row.frase_ribaltata,
    created_at: row.created_at,
  }));

  // Deduplicazione lato UI (fallback): filtra duplicati per chiave normalizzata
  const seenKeys = new Set<string>();
  const items: Ribaltata[] = [];
  
  for (const item of rawItems) {
    const key = normalizeKey(item.frase_originale);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      items.push(item);
      // Fermati quando abbiamo abbastanza items unici
      if (items.length >= pageSize) break;
    }
  }

  if (import.meta.env.DEV) {
    console.log(`[ribaltatoreRepo] Record recuperati: ${rawItems.length}, Dopo dedup: ${items.length}`);
  }

  return {
    items,
    totalPages,
    total,
  };
}

/**
 * Recupera frasi correlate (escludendo quella corrente)
 * Usato per sezione "Frasi correlate" nella pagina singola
 */
export async function getRelatedRibaltate(
  excludeId: number,
  limit: number = 6,
): Promise<Ribaltata[]> {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("ribaltatore")
    .select("id,frase_originale,frase_ribaltata,created_at")
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .limit(limit * 2); // Recupera il doppio per compensare duplicati

  if (error) {
    console.error("[ribaltatoreRepo] Errore query correlate:", error);
    return [];
  }

  const rawItems: Ribaltata[] = (data || []).map((row) => ({
    id: Number(row.id),
    frase_originale: row.frase_originale,
    frase_ribaltata: row.frase_ribaltata,
    created_at: row.created_at,
  }));

  // Deduplicazione: filtra duplicati per chiave normalizzata
  const seenKeys = new Set<string>();
  const items: Ribaltata[] = [];
  
  for (const item of rawItems) {
    const key = normalizeKey(item.frase_originale);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      items.push(item);
      if (items.length >= limit) break;
    }
  }

  return items;
}
