/**
 * Supabase client server-side per Ribaltatore AI
 * 
 * Utilizza SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da env
 * MAI esporre service role key nel client
 */

import { createClient } from "@supabase/supabase-js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Ottiene client Supabase server-side (singleton)
 */
export function getSupabaseServer() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devono essere configurate in env",
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
