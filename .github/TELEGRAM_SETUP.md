# Setup Telegram Auto-Share

Questa guida spiega come configurare l'automazione per condividere automaticamente i nuovi post su Telegram.

## 1. Creare un Bot Telegram

1. Apri Telegram e cerca **@BotFather**
2. Invia il comando `/newbot`
3. Segui le istruzioni:
   - Scegli un nome per il bot (es. "Canapalandia News")
   - Scegli un username (deve terminare con `bot`, es. `canapalandia_news_bot`)
4. **BotFather ti darà un token** (es. `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
   - **Salva questo token**: ti servirà come `TELEGRAM_BOT_TOKEN`

## 2. Ottenere il Chat ID

Il Chat ID identifica il canale o gruppo dove inviare i messaggi.

### Opzione A: Canale Pubblico

1. Crea un canale Telegram (o usa uno esistente)
2. Aggiungi il bot come amministratore del canale
3. Il Chat ID di un canale pubblico è il suo username con `@` (es. `@canapalandia_news`)

### Opzione B: Canale Privato o Chat Personale

1. Aggiungi il bot al canale/gruppo o avvia una chat privata
2. Invia un messaggio al bot o nel canale
3. Visita questa URL nel browser (sostituisci `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. Cerca nel JSON restituito il campo `"chat":{"id":-1001234567890}`
   - Il numero negativo (es. `-1001234567890`) è il Chat ID
   - Per chat private, sarà un numero positivo (es. `123456789`)

**Nota**: Se non vedi risultati, invia prima un messaggio al bot/canale e poi ricarica la pagina.

## 3. Configurare GitHub Secrets

1. Vai su GitHub → Repository → **Settings** → **Secrets and variables** → **Actions**
2. Clicca **New repository secret** e aggiungi:

   - **Nome**: `TELEGRAM_BOT_TOKEN`
   - **Valore**: Il token ricevuto da BotFather
   
   - **Nome**: `TELEGRAM_CHAT_ID`
   - **Valore**: Il Chat ID ottenuto (es. `-1001234567890` o `@canapalandia_news`)

3. (Opzionale) Se il feed RSS è diverso da `https://canapalandia.com/rss.xml`:
   - **Nome**: `RSS_URL`
   - **Valore**: URL completo del feed RSS

## 4. Test Manuale

Dopo aver configurato i secrets, puoi testare manualmente:

1. Vai su GitHub → **Actions** → **Auto Share to Telegram**
2. Clicca **Run workflow** → **Run workflow**
3. Controlla i log per verificare che funzioni

## 5. Verifica Funzionamento

Il workflow si esegue automaticamente ogni 15 minuti. Per verificare:

1. Controlla i log in **Actions** → **Auto Share to Telegram**
2. Se c'è un nuovo post nel feed RSS, verrà condiviso su Telegram
3. Se non ci sono nuovi post, vedrai: `"No new posts. Exiting."`

## Troubleshooting

### Il bot non invia messaggi

- Verifica che il bot sia amministratore del canale (se usi un canale)
- Verifica che i secrets siano configurati correttamente
- Controlla i log GitHub Actions per errori specifici

### "RSS format not recognized"

- Verifica che l'URL del feed RSS sia corretto
- Controlla che il feed sia accessibile pubblicamente

### "No new posts" anche se ci sono nuovi post

- Il sistema confronta il GUID (link) del post
- Se il link è identico, non viene considerato nuovo
- Verifica che il feed RSS generi link univoci per ogni post

## Note di Sicurezza

- **Non condividere mai** il `TELEGRAM_BOT_TOKEN` pubblicamente
- I secrets GitHub sono criptati e visibili solo durante l'esecuzione del workflow
- Il token del bot può essere revocato da BotFather se compromesso
