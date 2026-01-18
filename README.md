# Canapalandia Astro

Sito web Canapalandia.com costruito con Astro.

## 🚀 Setup

```sh
npm install
npm run dev
```

## 📋 GitHub Actions Secrets

Per l'automazione di condivisione Telegram, configura i seguenti secrets in GitHub (Settings → Secrets and variables → Actions):

- **TELEGRAM_BOT_TOKEN**: Token del bot Telegram (ottieni da @BotFather)
- **TELEGRAM_CHAT_ID**: Chat ID o username canale (es. `@canapalandia` o `-1001234567890`)
- **RSS_URL** (opzionale): URL del feed RSS/Atom. Se non fornito, prova automaticamente:
  - `https://canapalandia.com/rss.xml`
  - `https://canapalandia.com/feed.xml`
  - `https://canapalandia.com/feed/`

Vedi `.github/TELEGRAM_SETUP.md` per istruzioni dettagliate.

## 🧞 Commands

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
