/**
 * Supabase client server-side per Ribaltatore AI
 * 
 * Utilizza SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da env
 * MAI esporre service role key nel client
 */

import { createClient } from "@supabase/supabase-js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Decodifica il payload JWT (base64url) per verificare il ruolo
 */
function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    // Il payload è la seconda parte (indice 1)
    const payload = parts[1];
    
    // Base64url decode (sostituisce - con +, _ con /, aggiunge padding se necessario)
    let base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Verifica se la key è una anon key invece di service role key
 */
function isAnonKey(key: string): boolean {
  const payload = decodeJwtPayload(key);
  if (!payload) return false;
  
  // Service role key ha "role":"service_role", anon key ha "role":"anon"
  return payload.role === "anon";
}

/**
 * Ottiene il prefisso di una key per logging (primi 6 caratteri)
 */
function getKeyPrefix(key: string): string {
  return key.length > 6 ? key.slice(0, 6) + "..." : "***";
}

/**
 * Ottiene client Supabase server-side (singleton)
 */
export function getSupabaseServer() {
  if (supabaseClient) return supabaseClient;

  // In Astro, usa import.meta.env per variabili server-side (non PUBLIC_)
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  // Controllo presenza variabili
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    
    throw new Error(
      `Variabili ambiente mancanti: ${missing.join(", ")}. ` +
      `Su Vercel, configura queste variabili in Project Settings → Environment Variables. ` +
      `IMPORTANTE: SUPABASE_SERVICE_ROLE_KEY deve essere la service_role secret (non PUBLIC_SUPABASE_ANON_KEY). ` +
      `Trovala su Supabase Dashboard → Settings → API → service_role secret.`
    );
  }

  // Controllo se è una anon key invece di service role key
  if (isAnonKey(supabaseServiceRoleKey)) {
    const keyPrefix = getKeyPrefix(supabaseServiceRoleKey);
    throw new Error(
      `Hai inserito la anon key invece della service_role key. ` +
      `La key inizia con "${keyPrefix}". ` +
      `Vai su Supabase Dashboard → Settings → API → service_role secret (non anon/public) ` +
      `e inseriscila in SUPABASE_SERVICE_ROLE_KEY.`
    );
  }

  // Controllo se coincide con SUPABASE_ANON_KEY (se presente)
  const anonKey = import.meta.env.SUPABASE_ANON_KEY;
  if (anonKey && supabaseServiceRoleKey === anonKey) {
    const keyPrefix = getKeyPrefix(supabaseServiceRoleKey);
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY coincide con SUPABASE_ANON_KEY (inizia con "${keyPrefix}"). ` +
      `Su Vercel, assicurati di aver configurato SUPABASE_SERVICE_ROLE_KEY (non PUBLIC_SUPABASE_ANON_KEY) ` +
      `con la service_role secret. Trovala su Supabase Dashboard → Settings → API → service_role secret.`
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}
