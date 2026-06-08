# GPS  — platformă de tracking flotă (Teltonika)

Server de tracking GPS pentru dispozitive Teltonika (FMB140 + camioane cu CAN), cu hartă live,
istoric, rapoarte, alerte, roluri/acces multi-client și **API REST**. Rulează **100% local**:
baza de date este **embedded** (PGlite — PostgreSQL în proces), fără niciun serviciu extern.

## Ce face

- **Server TCP** (port 5027) — primește date de la dispozitivele Teltonika (Codec 8 Extended)
- **Interfață web** — hartă live, istoric trasee, dashboard, rapoarte
- **WebSocket** — actualizare în timp real (scopat per utilizator)
- **API REST** — pentru integrare cu alte sisteme (autentificare prin cheie API)
- **Roluri & acces multi-client** — fiecare client vede doar vehiculele lui
- **Administrare** — șoferi, grupe, alerte configurabile, zone (geofence desenate pe hartă), mentenanță
- **Rapoarte** — 14 rapoarte pe categorii (Monitorizare / Consum / Date CAN / Evenimente): foaie de parcurs, traseu, locație, staționări, situație zilnică, pontaj, index km/ore, analitic, consum, alimentări, date CAN, viteze, vizite zone, evenimente; export CSV/Excel/PDF
- **Hotspot** — heatmap de activitate + analiză pe o zonă desenată pe hartă
- **Notificări per-utilizator** — fiecare user își alege evenimentele (cu prag propriu) și canalele (in-app, email, Web Push); tipuri: scădere combustibil, viteză, temperatură, idling, mișcare fără contact, tensiune scăzută, supraîncărcare, DTC, expirare documente
- **Curse automate** — detecție și salvare automată a curselor (bază pentru foaia de parcurs)
- **Sonde combustibil configurabile** — mapezi Escort (analogic/LLS/BLE), EuroSens Dominator (LLS), EuroSens Degree (BLE) → nivel normalizat în litri
- **Bază de date embedded** — totul local, fără Postgres/Docker

## Rulare locală (recomandat)

Ai nevoie doar de **Node.js ≥ 18**.

```bash
npm install
npm start
```

- Interfața: http://localhost:3000
- Login implicit: **admin** / **admin123** (schimbă parola din interfață, sau setează `ADMIN_PASSWORD`)
- Datele se salvează local în folderul `./data` (gitignored). Ștergi `./data` ca să resetezi tot.

Nu e nevoie de PostgreSQL, Docker sau alt serviciu — baza de date rulează în proces (PGlite).

### Configurare (opțională)

Copiază `.env.example` în `.env` și ajustează ce ai nevoie (porturi, secret, retenție etc.).
Toate variabilele sunt opționale.

## Roluri & acces

| Rol | Vede | Editează flota | Gestionează utilizatori |
|-----|------|----------------|--------------------------|
| **admin** | toată flota | da | da |
| **manager** | toată flota | da | nu |
| **dispatcher** (dispecer) | doar vehiculele atribuite | nu | nu |
| **client** | doar vehiculele atribuite | nu | nu |
| **viewer** | doar vehiculele atribuite (read-only) | nu | nu |

Adminul creează utilizatori și le atribuie **vehicule** sau **grupe** din **Utilizatori → (editează) → Acces**.
Toate acțiunile importante se înregistrează în **Jurnalul audit**.

## Notificări

**Centrul de notificări in-app** (clopoțelul din bara de sus) funcționează mereu, 100% local, scopat pe acces
(un client vede doar notificările vehiculelor lui).

**Abonamente per-utilizator** (clopoțel → ⚙ Preferințe): fiecare utilizator bifează ce **tipuri de evenimente**
vrea, cu **pragul lui** (ex. scădere combustibil > X litri, viteză > Y km/h) și **canalele** dorite:
in-app, **email** (pe adresa lui) și **Web Push** (notificări în browser, chiar cu pagina închisă).
Tipuri disponibile: scădere combustibil, depășire viteză, temperatură motor, idling prelungit,
mișcare fără contact (furt), tensiune scăzută, supraîncărcare, erori DTC, expirare documente.

**Web Push**: cheile VAPID se generează automat (`data/.vapid.json`) — utilizatorul apasă „Activează push"
o dată per dispozitiv. Funcționează pe `localhost` și pe HTTPS în producție.

**Canale globale opționale** (în plus, prin `.env`): **Email** (SMTP), **Telegram** (bot), **Webhook**.
Dacă nimic nu e configurat, totul rămâne local (doar centrul in-app).
Avertizarea pentru expirări: `NOTIFY_EXPIRY_DAYS` zile înainte (implicit 30).

Curse: un worker detectează automat cursele din poziții și populează tabela `trips`
(recalcul manual: `POST /api/trips/detect`).

## API REST

Toate endpoint-urile sunt sub `/api`. Autentificarea se face fie cu sesiune (din browser),
fie programatic cu o **cheie API**.

### Chei API

Adminul creează chei din **Utilizatori → Chei API**. O cheie:
- se afișează **o singură dată** la creare (se stochează doar hash-ul),
- **moștenește rolul și accesul pe vehicule** al utilizatorului asociat,
- se trimite într-unul din headere:

```
Authorization: Bearer gpsk_xxxxxxxx...
# sau
X-API-Key: gpsk_xxxxxxxx...
```

### Exemplu

```bash
# Lista vehiculelor accesibile cheii
curl -H "Authorization: Bearer gpsk_xxx" http://localhost:3000/api/devices

# Istoric pe o perioadă (ISO 8601)
curl -H "X-API-Key: gpsk_xxx" \
  "http://localhost:3000/api/history/356307042441013?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z"
```

### Endpoint-uri principale

| Endpoint | Descriere |
|----------|-----------|
| `GET /api` | Catalog API (public) |
| `GET /api/me` | Identitatea și permisiunile curente |
| `GET /api/devices` | Vehiculele accesibile (cu ultima poziție) |
| `GET /api/live` | Pozițiile live |
| `GET /api/history/:imei?from=&to=` | Istoric poziții |
| `GET /api/report/:imei?from=&to=` | Raport detaliat (km, opriri, consum, rute) |
| `GET /api/stats/:imei` | Statistici zilnice |
| `GET /api/trips/:imei?from=&to=` | Curse |
| `GET /api/geofences` | Zone geografice |
| `GET /api/alerts/history?limit=` | Istoric alerte |
| `GET /api/export/:imei?from=&to=` | Export CSV traseu |
| `GET /api/reports` | Tipurile de rapoarte disponibile |
| `GET /api/reports/:type?from=&to=&imei=` | Raport (trips, stops, speeding, fuel, geofence, driver, utilization) |
| `GET /api/hotspot?from=&to=&imei=&mode=` | Puncte pentru heatmap (mode: stops/positions) |
| `POST /api/zone-report` | Analiză activitate într-o zonă desenată (body: zone, from, to, imei) |
| `GET /api/notifications` | Notificări (scopate pe acces) |
| `GET /api/notifications/unread-count` | Număr notificări necitite |
| `GET /api/trips/:imei?from=&to=` | Curse detectate automat |

> Răspunsurile respectă mereu accesul utilizatorului/cheii: vezi doar vehiculele atribuite.
> Pentru CORS (acces din browser pe alt domeniu), setează `API_CORS_ORIGIN`.

## Sonde combustibil

În **editarea vehiculului → Sonde (avansat)**, adminul mapează una sau mai multe sonde la câmpurile
raportate de dispozitiv. Preseturi pentru: **Escort** (analogic AIN / LLS digital / TD-BLE),
**EuroSens Dominator** (LLS digital), **EuroSens Degree** (BLE nivel sau frecvență), **CAN (J1939)**, generic.

Fiecare sondă are: **sursa** (câmpul brut: `analog_input_1`, `lls_fuel_level_1`, `ble_fuel_level_1`,
`ble_fuel_frequency_1`, `can_fuel_level_liters`…), **modul** (direct = deja litri, sau calibrare cu tabel
brut→litri și interpolare liniară) și capacitatea. Serverul calculează un **nivel normalizat în litri**
(`fuel_level_liters`) folosit consistent în rapoarte, consum și alerta de scădere combustibil — indiferent
de tipul sondei.

## Configurare dispozitiv Teltonika (FMB140)

Trimite prin SMS adresa serverului (host public + portul TCP):

```
  setparam 2004:HOST;2005:PORT;2006:0
```

(înlocuiește `HOST` și `PORT` cu adresa serverului tău).

## Verificare (smoke tests)

Pornește serverul cu vehicule de test seedate, apoi rulează testele:

```bash
# Terminal 1 — server cu 2 vehicule de test (TEST111, TEST222)
SEED_TEST=1 npm start           # Windows PowerShell: $env:SEED_TEST=1; npm start

# Terminal 2 — testele
npm run test:rbac      # roluri, scoping multi-client, chei API
npm run test:phase2    # șoferi, grupe, alerte, zone, mentenanță, acces pe grup
node ws_smoke.js       # autentificare WebSocket
```

> `SEED_TEST=1` inserează vehicule fictive doar pentru teste; nu-l folosi în producție.

## Integrări opționale (forward date)

Serverul poate trimite în paralel datele primite de la dispozitive către alte sisteme.

### OpenRemote (HTTP)

- `OPENREMOTE_ENABLED=true`
- `OPENREMOTE_INGEST_URL=` — endpoint-ul care primește datele
- `OPENREMOTE_TOKEN=` — token / API key
- `OPENREMOTE_AUTH_HEADER=Authorization` (sau `X-Api-Key`)
- `OPENREMOTE_TIMEOUT_MS=3000`

### Mirror Teltonika → Traccar/OpenRemote (TCP)

Trimite în paralel pachetele brute, exact cum vin de la dispozitiv:

- `MIRROR_TELTONIKA_ENABLED=true`
- `MIRROR_TELTONIKA_HOST=` / `MIRROR_TELTONIKA_PORT=`
- `MIRROR_TELTONIKA_RECONNECT_MS=5000` (opțional)

Forward-ul este non-blocking (nu întârzie ACK-ul către dispozitiv).

## Deploy (opțional)

Aplicația e gândită să ruleze local, dar poate fi pusă pe orice host cu Node.js. Persistă datele
în folderul `./data` — montează-l ca volum dacă rulezi în container. Pentru HTTPS în spatele unui
proxy, setează `COOKIE_SECURE=true`.
