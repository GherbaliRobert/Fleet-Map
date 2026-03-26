# GPS Tracker — Server pentru Teltonika FMB140

Server de tracking GPS care primește date de la dispozitive Teltonika FMB140 prin protocolul Codec 8 Extended.

## Ce face

- **Server TCP** (port 5027) — primește date GPS de la dispozitivele FMB140
- **Interfață web** — hartă live cu pozițiile vehiculelor
- **WebSocket** — actualizare în timp real pe hartă
- **API REST** — pentru integrare cu alte sisteme
- **Istoric** — vizualizare traseu pe perioadă

## Deploy pe Railway — Pas cu Pas

### 1. Creează repository pe GitHub

1. Du-te la https://github.com/new
2. Nume: `gps-tracker`
3. Lasă-l **Public**
4. Click **Create repository**
5. Urmează instrucțiunile de pe pagină pentru a uploada codul

### 2. Deploy pe Railway

1. Du-te la https://railway.app și logare cu GitHub
2. Click **New Project**
3. Alege **Deploy from GitHub Repo**
4. Selectează repository-ul `gps-tracker`
5. Railway va face deploy automat

### 3. Adaugă PostgreSQL

1. În proiectul Railway, click **+ New**
2. Alege **Database → PostgreSQL**
3. Railway conectează automat baza de date (variabila `DATABASE_URL`)

### 4. Configurează portul TCP

1. Click pe serviciul tău (gps-tracker)
2. Du-te la **Settings → Networking**
3. La **TCP Proxy**, adaugă portul **5027**
4. Railway îți va da un host și port public (ex: `roundhouse.proxy.rlwy.net:12345`)

### 5. Configurează FMB140

Trimite SMS la dispozitiv:
```
  setparam 2004:roundhouse.proxy.rlwy.net;2005:12345;2006:0
```
(înlocuiește cu hostul și portul real de la Railway)

### 6. Deschide harta

Du-te la URL-ul dat de Railway (ex: `gps-tracker-production.up.railway.app`)

## Variabile de mediu

- `DATABASE_URL` — se setează automat de Railway când adaugi PostgreSQL
- `PORT` — se setează automat de Railway pentru HTTP
- `TCP_PORT` — default 5027

## API Endpoints

- `GET /api/devices` — lista dispozitivelor
- `GET /api/live` — pozițiile live
- `GET /api/history/:imei?from=...&to=...` — istoric traseu
- `PUT /api/devices/:imei` — actualizare nume/tip vehicul
- `GET /api/connections` — conexiuni TCP active
