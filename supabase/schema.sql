-- Schema database Supabase per Ribaltatore AI
-- Eseguire in SQL Editor di Supabase

-- Tabella ribaltatore
CREATE TABLE IF NOT EXISTS ribaltatore (
  id BIGSERIAL PRIMARY KEY,
  frase_originale TEXT NOT NULL,
  frase_ribaltata TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_hash TEXT,
  user_id UUID REFERENCES auth.users(id) -- Opzionale per futuro supporto auth
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_ribaltatore_created_at ON ribaltatore(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ribaltatore_user_id ON ribaltatore(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ribaltatore_ip_hash ON ribaltatore(ip_hash) WHERE ip_hash IS NOT NULL;

-- RLS (Row Level Security)
ALTER TABLE ribaltatore ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono leggere (pagine pubbliche)
CREATE POLICY "Public read access" ON ribaltatore
  FOR SELECT USING (true);

-- Nota: Inserimento viene fatto via service role key (non serve policy INSERT per utenti)
-- In futuro, se si aggiunge auth, si può aggiungere policy per INSERT con user_id
