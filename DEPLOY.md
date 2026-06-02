# Deploy-guide

Backend kjører på **Render**, frontend på **Vercel**. Begge deployes fra samme GitHub-repo.

## 0. Push koden til GitHub (gjøres én gang)

```bash
git init
git add .
git commit -m "Klar for deploy"
git branch -M main
git remote add origin https://github.com/<brukernavn>/handleliste.git
git push -u origin main
```

---

## 1. Backend på Render

Du har allerede opprettet tjenesten: https://handleliste-y0pb.onrender.com

Sjekk at innstillingene i Render er:

| Innstilling        | Verdi              |
|--------------------|--------------------|
| **Root Directory** | `server`           |
| **Build Command**  | `npm install`      |
| **Start Command**  | `npm start`        |
| **Instance Type**  | Free (eller høyere)|

Render setter `PORT` automatisk — serveren leser den. WebSocket (`wss://`) kjører på samme tjeneste, ingen ekstra konfigurasjon nødvendig.

> ⚠️ **Gratis-plan:** Tjenesten "sovner" etter 15 min uten trafikk. Første besøk etter dvale tar ~30–50 sek å vekke. Appen kobler seg automatisk på igjen.

---

## 2. Frontend på Vercel

1. Gå til [vercel.com](https://vercel.com) → **Add New → Project** → importer GitHub-repoet
2. Sett **Root Directory** til `client`
3. Vercel oppdager Vite automatisk:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Klikk **Deploy**

Render-URL-en er allerede konfigurert i `client/.env.production`, så frontend kobler seg automatisk mot backend. (Du kan også overstyre med en env-variabel `VITE_API_URL` i Vercel-innstillingene om URL-en endres.)

---

## 3. Test

Åpne Vercel-URL-en (f.eks. `https://handleliste.vercel.app`):
1. Opprett en husstand → få 4-bokstavs kode
2. Åpne samme URL på en annen enhet, skriv inn koden
3. Endringer skal synkroniseres i sanntid mellom enhetene ✅

---

## Endre backend-URL senere

Hvis Render-URL-en endres, oppdater `client/.env.production` og push på nytt — Vercel bygger automatisk.

## Lokalt (utvikling)

```bash
# Terminal 1 – backend
cd server && npm install && npm start

# Terminal 2 – frontend
cd client && npm install && npm run dev
```

Lokalt brukes `ws://localhost:3001` automatisk (ingen `.env` nødvendig).
