# Senca Hub — MVC TypeScript

Backend Express/TS + frontend React/TS, al posto del vecchio n8n+vanilla-JS (`index.html` in radice è la versione legacy). Notion resta il database, dietro il Model layer del backend: il frontend non lo chiama mai direttamente.

## Struttura

```
backend/   Express + TS — routes → controllers → services → models → Notion
frontend/  React + TS (Vite) — views → components, models (tipi/stato), services (client API)
```

Backend: `routes/` = superficie REST. `controllers/` = solo request/response. `services/` = logica di business (auth, token, TOTP, cifratura, audit, email via n8n). `models/` = unico punto di accesso a Notion. `middleware/` = auth JWT, ruoli, rate limit, audit.

Frontend: `views/` = schermate per ruolo (`admin/`, `gp/`, Dipendente, Privacy). `components/` = UI riusabile. `models/` = tipi + sessione. `services/` = client verso le API.

## Stato

Il porting dal vecchio `index.html` è completo per tutti i ruoli:

- **Admin**: home, utenze da abilitare, utenti web app, ticket, audit log (hash chain), monitoraggio vulnerabilità.
- **Gestione personale**: anagrafica, griglie turni, timesheet, comunicazioni, strutture, buste paga, documenti, status lavori, responsabili/amministratori di sistema, documentazione privacy, export PDF.
- **Dipendente**: timbratura, turni, ferie, comunicazioni, documenti, profilo.
- **Privacy**: post, calendario editoriale, incaricati, segnalazioni.

Sicurezza: password PBKDF2 con salt, MFA TOTP facoltativo, sessioni JWT verificate a ogni chiamata e revocabili, autorizzazione per ruolo, helmet/CSP, CORS ristretto, rate limiting, throttling del login, cifratura dei campi sensibili, webhook n8n autenticati con segreto condiviso, upload con whitelist di tipi file.

## Avvio locale

Serve Node.js 20.

```bash
cd backend && npm install && cp .env.example .env   # compila i valori: vedi i commenti nel file
npm run dev      # http://localhost:3001

cd frontend && npm install
npm run dev      # http://localhost:5173, proxy /api verso il backend
```

Tutte le variabili d'ambiente, obbligatorie e facoltative, sono documentate in [`backend/.env.example`](backend/.env.example). Senza `NOTION_TOKEN`, `ENCRYPTION_KEY`, `N8N_WEBHOOK_SECRET`, `N8N_EMAIL_WEBHOOK_URL` e `N8N_DOCUMENTI_PRIVACY_WEBHOOK_URL` il backend non parte.

Senza Node installato si può verificare tutto con Docker: `docker build -t mysenca .` dalla radice.

## Deploy (Render)

Il `Dockerfile` in radice costruisce frontend e backend in un'unica immagine (il backend serve il frontend da `public/`). Con `NODE_ENV=production` all'avvio il server controlla che:

- `CORS_ORIGIN` sia impostata (es. `https://mysenca.onrender.com`), altrimenti non parte;
- `WEB_CONCURRENCY` sia 1: l'audit log usa una cache in memoria e non regge più istanze.

## CI

- `.github/workflows/ci.yml`: typecheck e build di backend e frontend + build dell'immagine Docker, a ogni push su `main` e su ogni PR.
- `.github/workflows/security-audit.yml`: `npm audit` ogni lunedì e a ogni push su `main`; invia il report al backend (sezione Sicurezza dell'Admin).

## Note tecniche

- `ENCRYPTION_KEY` non va mai cambiata dopo il primo avvio. `backend/src/scripts/migrateEncryption.ts` serve una sola volta per cifrare i dati preesistenti.
- Gli ID dei database Notion sono scritti nei file `models/`.
- Non ci sono ancora test automatici: la CI verifica solo che il codice compili.
