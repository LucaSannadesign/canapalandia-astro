/**
 * Repository pattern per Ribaltatore AI (Supabase/Postgres)
 * 
 * Interfaccia identica a db.ts per swap trasparente
 * Funziona con Supabase Postgres su Vercel
 */

import { getSupabaseServer } from "../supabaseServer";

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
 * Inserisce una nuova frase ribaltata
 */
export async function insertRibaltata(
  data: InsertRibaltataData,
): Promise<number> {
  const supabase = getSupabaseServer();

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
 * Lista frasi ribaltate con paginazione
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
  const { data, error } = await supabase
    .from("ribaltatore")
    .select("id,frase_originale,frase_ribaltata,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("[ribaltatoreRepo] Errore query:", error);
    throw new Error(`Errore query: ${error.message}`);
  }

  const items: Ribaltata[] = (data || []).map((row) => ({
    id: Number(row.id),
    frase_originale: row.frase_originale,
    frase_ribaltata: row.frase_ribaltata,
    created_at: row.created_at,
  }));

  if (import.meta.env.DEV) {
    console.log(`[ribaltatoreRepo] Record recuperati: ${items.length}`);
  }

  return {
    items,
    totalPages,
    total,
  };
}
