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

### Integrare OpenRemote (opțional)

Dacă vrei ca datele decodate (GPS + IO) să ajungă și în platforma ta OpenRemote, serverul poate face forward HTTP, non‑blocking, după ce salvează batch‑ul în DB.

- `OPENREMOTE_ENABLED` — `true`/`false` (default `false`)
- `OPENREMOTE_INGEST_URL` — URL-ul endpoint-ului din OpenRemote care primește datele (ex.: un HTTP Agent/receiver sau un API custom)
- `OPENREMOTE_TOKEN` — token de autentificare (dacă folosești Keycloak/Bearer, pune doar token-ul; header-ul va fi `Authorization: Bearer <token>`)
- `OPENREMOTE_AUTH_HEADER` — numele header-ului de auth (default `Authorization`; setează `X-Api-Key` dacă folosești un API key)
- `OPENREMOTE_TIMEOUT_MS` — timeout HTTP în milisecunde (default `3000`)

Payload-ul trimis:

```
POST <OPENREMOTE_INGEST_URL>
Content-Type: application/json
Authorization: Bearer <OPENREMOTE_TOKEN>   # dacă e cazul

{
  "imei": "<imei>",
  "records": [
    {
      "timestamp": "2024-01-01T12:00:00.000Z",
      "priority": 1,
      "gps": { "latitude": 0, "longitude": 0, "altitude": 0, "angle": 0, "satellites": 0, "speed": 0 },
      "io": { /* parametri normalizați, inclusiv can_* */ }
    }
  ]
}
```

Notă: forward-ul este non‑blocking (nu întârzie ACK-ul către dispozitiv). Dacă endpoint-ul OpenRemote răspunde cu erori, acestea se loghează în consolă.

### Mirror Teltonika către Traccar/OpenRemote (TCP)

Dacă ai deja un server Traccar/OpenRemote care ascultă protocolul Teltonika (ex.: `gondola.proxy.rlwy.net:40590`), poți trimite în paralel pachetele brute, exact cum vin de la dispozitiv.

Setează în `.env`:

- `MIRROR_TELTONIKA_ENABLED=true`
- `MIRROR_TELTONIKA_HOST=gondola.proxy.rlwy.net`
- `MIRROR_TELTONIKA_PORT=40590`
- `MIRROR_TELTONIKA_CONNECT_TIMEOUT_MS=3000` (opțional)
- `MIRROR_TELTONIKA_RECONNECT_MS=5000` (opțional)
- `MIRROR_TELTONIKA_QUEUE_MAX=200` (opțional)

Comportament:
- Serverul menține o conexiune separată per IMEI către serverul Traccar și îi trimite handshake-ul Teltonika (IMEI) urmat de fiecare pachet AVL în forma originală.
- ACK‑urile de la serverul Traccar sunt citite și ignorate; fluxul local nu este blocat.
- Se face reconnect automat pe erori; coada de pachete este limitată pentru a preveni consumul excesiv de memorie.

## API Endpoints

- `GET /api/devices` — lista dispozitivelor
- `GET /api/live` — pozițiile live
- `GET /api/history/:imei?from=...&to=...` — istoric traseu
- `PUT /api/devices/:imei` — actualizare nume/tip vehicul
- `GET /api/connections` — conexiuni TCP active

