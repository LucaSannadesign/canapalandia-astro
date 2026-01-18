-- Migration: aggiungi colonne edit_token e edit_expires_at per modifica temporanea frasi
-- Eseguire in SQL Editor di Supabase

-- Aggiungi colonna edit_token se non esiste
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ribaltatore' AND column_name = 'edit_token'
  ) THEN
    ALTER TABLE ribaltatore ADD COLUMN edit_token TEXT;
  END IF;
END $$;

-- Aggiungi colonna edit_expires_at se non esiste
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ribaltatore' AND column_name = 'edit_expires_at'
  ) THEN
    ALTER TABLE ribaltatore ADD COLUMN edit_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indice per ricerca rapida per edit_token (opzionale, utile per verifiche)
CREATE INDEX IF NOT EXISTS idx_ribaltatore_edit_token ON ribaltatore(edit_token) WHERE edit_token IS NOT NULL;
