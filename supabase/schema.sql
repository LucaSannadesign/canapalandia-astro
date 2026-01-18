-- Schema database Supabase per Ribaltatore AI
-- Eseguire in SQL Editor di Supabase

-- Tabella ribaltatore
CREATE TABLE IF NOT EXISTS ribaltatore (
  id BIGSERIAL PRIMARY KEY,
  frase_originale TEXT NOT NULL,
  frase_ribaltata TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_id UUID REFERENCES auth.users(id) -- Opzionale per futuro supporto auth
);

-- Aggiungi colonna updated_at se non esiste (per tabelle esistenti)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ribaltatore' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE ribaltatore ADD COLUMN updated_at TIMESTAMPTZ;
    -- Inizializza updated_at con created_at per record esistenti
    UPDATE ribaltatore SET updated_at = created_at WHERE updated_at IS NULL;
  END IF;
END $$;

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_ribaltatore_created_at ON ribaltatore(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ribaltatore_updated_at ON ribaltatore(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ribaltatore_user_id ON ribaltatore(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ribaltatore_ip_hash ON ribaltatore(ip_hash) WHERE ip_hash IS NOT NULL;

-- RLS (Row Level Security)
ALTER TABLE ribaltatore ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono leggere (pagine pubbliche)
CREATE POLICY "Public read access" ON ribaltatore
  FOR SELECT USING (true);

-- Nota: Inserimento viene fatto via service role key (non serve policy INSERT per utenti)
-- In futuro, se si aggiunge auth, si può aggiungere policy per INSERT con user_id
