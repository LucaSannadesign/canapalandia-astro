-- Schema per sistema Reazioni Post Blog
-- Eseguire in SQL Editor di Supabase

-- Tabella post_reactions
CREATE TABLE IF NOT EXISTS post_reactions (
  slug TEXT PRIMARY KEY,
  up INTEGER DEFAULT 0 NOT NULL,
  love INTEGER DEFAULT 0 NOT NULL,
  laugh INTEGER DEFAULT 0 NOT NULL,
  fire INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indice per performance
CREATE INDEX IF NOT EXISTS idx_post_reactions_updated_at ON post_reactions(updated_at DESC);

-- Funzione RPC per incrementare reazione (atomica)
CREATE OR REPLACE FUNCTION increment_post_reaction(
  p_slug TEXT,
  p_reaction TEXT
)
RETURNS TABLE (
  slug TEXT,
  up INTEGER,
  love INTEGER,
  laugh INTEGER,
  fire INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Valida reazione
  IF p_reaction NOT IN ('up', 'love', 'laugh', 'fire') THEN
    RAISE EXCEPTION 'Invalid reaction type: %', p_reaction;
  END IF;

  -- Upsert e incrementa colonna corrispondente
  INSERT INTO post_reactions (slug, up, love, laugh, fire, updated_at)
  VALUES (
    p_slug,
    CASE WHEN p_reaction = 'up' THEN 1 ELSE 0 END,
    CASE WHEN p_reaction = 'love' THEN 1 ELSE 0 END,
    CASE WHEN p_reaction = 'laugh' THEN 1 ELSE 0 END,
    CASE WHEN p_reaction = 'fire' THEN 1 ELSE 0 END,
    NOW()
  )
  ON CONFLICT (slug) DO UPDATE SET
    up = CASE 
      WHEN p_reaction = 'up' THEN post_reactions.up + 1 
      ELSE post_reactions.up 
    END,
    love = CASE 
      WHEN p_reaction = 'love' THEN post_reactions.love + 1 
      ELSE post_reactions.love 
    END,
    laugh = CASE 
      WHEN p_reaction = 'laugh' THEN post_reactions.laugh + 1 
      ELSE post_reactions.laugh 
    END,
    fire = CASE 
      WHEN p_reaction = 'fire' THEN post_reactions.fire + 1 
      ELSE post_reactions.fire 
    END,
    updated_at = NOW();

  -- Ritorna la riga aggiornata
  RETURN QUERY
  SELECT 
    post_reactions.slug,
    post_reactions.up,
    post_reactions.love,
    post_reactions.laugh,
    post_reactions.fire,
    post_reactions.updated_at
  FROM post_reactions
  WHERE post_reactions.slug = p_slug;
END;
$$ LANGUAGE plpgsql;
