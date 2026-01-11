-- Schema database per Ribaltatore AI
-- Compatibile con SQLite (sviluppo) e Postgres (produzione)

-- SQLite
CREATE TABLE IF NOT EXISTS ribaltatore (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frase_originale TEXT NOT NULL,
  frase_ribaltata TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ribaltatore_created_at ON ribaltatore(created_at DESC);

-- Postgres (commentare sopra e decommentare sotto per Postgres)
/*
CREATE TABLE IF NOT EXISTS ribaltatore (
  id SERIAL PRIMARY KEY,
  frase_originale TEXT NOT NULL,
  frase_ribaltata TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ribaltatore_created_at ON ribaltatore(created_at DESC);
*/
