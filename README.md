# RA Tracks — platformă SaaS de tracking flotă (Teltonika)

Platformă de monitorizare GPS pentru dispozitive Teltonika (FMB140 + camioane cu CAN), cu hartă live,
istoric, rapoarte, alerte, **multi-tenant** (mai multe companii, fiecare cu flota ei), **asistent AI**
și o suită de **agenți AI** care monitorizează flota 24/7. Bază de date **embedded** (PGlite — PostgreSQL
în proces); funcțiile AI sunt opționale și folosesc Claude API.

## Ce face

- **Server TCP** (port 5027) — primește date de la dispozitivele Teltonika (Codec 8 Extended)
- **Interfață web** — hartă live, istoric trasee, dashboard complet, rapoarte
- **Multi-tenant (companii)** — super-admin creează companii + adminii lor; fiecare companie vede **doar** flota ei (izolare strictă la API, WebSocket și rapoarte)
- **Agenți AI (6)** — RA Watch / Care / Optimize / Compliance / Client / Dispatch; rulează automat și la cerere
- **Asistent AI** — chat pe flotă + rezumate de rapoarte (Claude), scopat pe accesul utilizatorului
- **Dashboard** — KPI-uri, grafice, top km/consum, status flotă, constatări agenți AI; apare la logare
- **WebSocket** — actualizare în timp real (scopată per utilizator/companie)
- **API REST** — pentru integrare cu alte sisteme (autentificare prin cheie API)
- **Roluri & acces** — super-admin, admin companie, manager, dispecer, client, viewer
- **Administrare** — șoferi, grupe, alerte configurabile, zone (geofence desenate pe hartă), mentenanță
- **Rapoarte** — 19+ rapoarte pe categorii (Monitorizare / Consum / Siguranță / Costuri / Date CAN / Evenimente); export CSV / Excel / PDF, plus **export KML** al traseului (Google Earth / Maps)
- **Hotspot** — heatmap de activitate + analiză pe o zonă desenată pe hartă
- **Notificări per-utilizator** — fiecare user își alege evenimentele (cu prag propriu) și canalele (in-app, email, Web Push)
- **Curse automate** — detecție și salvare automată a curselor
- **Sonde combustibil configurabile** — Escort (analogic/LLS/BLE), EuroSens Dominator (LLS), EuroSens Degree (BLE) → nivel normalizat în litri
- **Mod Demo** — companie demo izolată, cu vehicule simulate care se mișcă pe hartă (pentru prezentări)

## Rulare locală (recomandat)

Ai nevoie doar de **Node.js ≥ 18**.

```bash
npm install
npm start
```

- Interfața: http://localhost:3000 (aplicația la `/app`, site public la `/`)
- Login implicit: **admin** / **admin123** (schimbă parola, sau setează `ADMIN_PASSWORD`). Primul admin devine **super-admin** al platformei.
- Datele se salvează local în folderul `./data` (gitignored). Ștergi `./data` ca să resetezi tot.

Nu e nevoie de PostgreSQL, Docker sau alt serviciu — baza de date rulează în proces (PGlite).
Funcțiile AI sunt opționale: fără cheie configurată, aplicația merge normal (agenții folosesc euristici).

### Configurare (opțională)

Copiază `.env.example` în `.env` și ajustează ce ai nevoie (porturi, secret, retenție, AI etc.).
Toate variabilele sunt opționale. Relevante pentru AI: `ANTHROPIC_API_KEY`, `AI_MODEL`.

## Multi-tenant (companii)

Aplicația funcționează pentru mai multe companii pe aceeași instanță, izolate complet:

- **Super-admin** (owner platformă) — vede și administrează toate companiile; creează companii și adminii lor; are un **filtru pe companie** în dashboard și în panoul de agenți (altfel vede totul agregat).
- **Admin companie** — gestionează utilizatorii și flota **doar** în compania lui.
- Toate datele (vehicule, utilizatori, grupe, șoferi, geofence, alerte, mentenanță, notificări, constatări AI) au `company_id`; răspunsurile API/WebSocket/rapoarte nu trec niciodată granița de companie.
- Vehiculele **demo** sunt vizibile doar în contul demo, niciodată în flota reală sau la super-admin.

| Rol | Vede | Editează flota | Gestionează utilizatori |
|-----|------|----------------|--------------------------|
| **super-admin** | toate companiile | da | da (toate) |
| **admin companie** | compania lui | da | da (compania lui) |
| **manager** | compania lui | da | nu |
| **dispatcher** (dispecer) | doar vehiculele atribuite | nu | nu |
| **client** | doar vehiculele atribuite | nu | nu |
| **viewer** | doar vehiculele atribuite (read-only) | nu | nu |

Adminul atribuie utilizatorilor **vehicule** sau **grupe** din **Utilizatori → (editează) → Acces**.
Toate acțiunile importante se înregistrează în **Jurnalul audit**.

## Agenți AI

Suită de agenți care analizează flota (euristici locale, opțional prioritizate cu AI). Rulează **automat**
(la pornire + la 30 min, per companie) și **la cerere** din panoul „Agenți AI". Constatările apar într-un
feed cu severitate (info / atenție / critic) și acțiuni de confirmă / respinge; cele noi apar și pe dashboard.

| Agent | Ce face |
|-------|---------|
| 🛡️ **RA Watch** | Monitorizare 24/7 — furt/scurgere combustibil, depășiri de viteză, offline neașteptat, ralanti prelungit |
| 🔧 **RA Care** | Mentenanță predictivă — revizii / ITP / asigurări scadente (pe dată sau pe km), distanță până la service din CAN |
| 🍃 **RA Optimize** | Eco-driving & costuri — scor șofer (frânări/accelerări bruște), risipă la ralanti (estimare în lei) |
| 📋 **RA Compliance** | Ore de condus — conducere continuă > 4h30 / zilnică > 9h (estimativ din GPS, Reg. CE 561/2006) |
| 📊 **RA Client** | Raport zilnic automat — sinteză flotă (km, vehicule active, cel mai activ) |
| 🧭 **RA Dispatch** | Alocare curse — vehicule disponibile acum + cel mai apropiat de o destinație aleasă pe hartă (distanță + ETA) |

## Asistent AI & rezumate

- **Asistent AI** (buton flotant) — chat pe flotă: „unde sunt vehiculele?", „cât au mers azi?" — răspunde
  **doar** din vehiculele accesibile utilizatorului în compania lui.
- **Rezumat AI** pe rapoarte — sinteză executivă în limba română peste un raport generat.
- Provider: **Anthropic Claude** (model configurabil prin `AI_MODEL`). Cheia se introduce de către super-admin
  în interfață (sau prin `ANTHROPIC_API_KEY`). Fără cheie, funcțiile AI răspund „neconfigurat", iar agenții
  funcționează pe euristici.

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
| `GET /api/dashboard` | KPI-uri și statistici flotă (super-admin: filtru `?companyId=`) |
| `GET /api/report/:imei?from=&to=` | Raport detaliat (km, opriri, consum, rute) |
| `GET /api/reports/:type?from=&to=&imei=` | Raport pe tip |
| `GET /api/export/:imei?from=&to=` | Export CSV traseu |
| `GET /api/hotspot?from=&to=&imei=&mode=` | Puncte pentru heatmap (mode: stops/positions) |
| `GET /api/agents` · `POST /api/agents/run` · `GET /api/agents/findings` | Agenți AI (listă / rulare / constatări) |
| `GET /api/dispatch/suggest?lat=&lon=` | Vehicule disponibile lângă o destinație (distanță + ETA) |
| `POST /api/ai/chat` · `POST /api/ai/report-summary` | Asistent AI / rezumat raport |
| `GET /api/companies` | Companii (super-admin) |
| `GET /api/notifications` | Notificări (scopate pe acces) |

> Răspunsurile respectă mereu accesul utilizatorului/cheii și granița de companie: vezi doar vehiculele atribuite.
> Pentru CORS (acces din browser pe alt domeniu), setează `API_CORS_ORIGIN`.

## Notificări

**Centrul de notificări in-app** (clopoțelul din bara de sus) funcționează mereu, scopat pe acces
(un client vede doar notificările vehiculelor lui).

**Abonamente per-utilizator** (clopoțel → ⚙ Preferințe): fiecare utilizator bifează ce **tipuri de evenimente**
vrea, cu **pragul lui** (ex. scădere combustibil > X litri, viteză > Y km/h) și **canalele** dorite:
in-app, **email** (pe adresa lui) și **Web Push** (notificări în browser, chiar cu pagina închisă).
Tipuri disponibile: scădere combustibil, depășire viteză, temperatură motor, idling prelungit,
mișcare fără contact (furt), tensiune scăzută, supraîncărcare, erori DTC, expirare documente.

**Web Push**: cheile VAPID se generează automat (`data/.vapid.json`) — utilizatorul apasă „Activează push"
o dată per dispozitiv. Funcționează pe `localhost` și pe HTTPS în producție.

**Canale globale opționale** (prin `.env`): **Email** (SMTP), **Telegram** (bot), **Webhook**.
Avertizarea pentru expirări: `NOTIFY_EXPIRY_DAYS` zile înainte (implicit 30).

## Sonde combustibil

În **editarea vehiculului → Sonde (avansat)**, adminul mapează una sau mai multe sonde la câmpurile
raportate de dispozitiv. Preseturi pentru: **Escort** (analogic AIN / LLS digital / TD-BLE),
**EuroSens Dominator** (LLS digital), **EuroSens Degree** (BLE nivel sau frecvență), **CAN (J1939)**, generic.

Fiecare sondă are: **sursa** (câmpul brut: `analog_input_1`, `lls_fuel_level_1`, `ble_fuel_level_1`,
`ble_fuel_frequency_1`, `can_fuel_level_liters`…), **modul** (direct = deja litri, sau calibrare cu tabel
brut→litri și interpolare liniară) și capacitatea. Serverul calculează un **nivel normalizat în litri**
(`fuel_level_liters`) folosit consistent în rapoarte, consum și alerta de scădere combustibil.

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
node tenant_smoke.js   # izolare multi-tenant (companii) + IDOR
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

### Mirror Teltonika → Traccar/OpenRemote (TCP)

Trimite în paralel pachetele brute, exact cum vin de la dispozitiv:

- `MIRROR_TELTONIKA_ENABLED=true`
- `MIRROR_TELTONIKA_HOST=` / `MIRROR_TELTONIKA_PORT=`

Forward-ul este non-blocking (nu întârzie ACK-ul către dispozitiv).

## Deploy

Aplicația poate fi pusă pe orice host cu Node.js. Persistă datele în folderul `./data` — montează-l ca volum
dacă rulezi în container. În spatele unui proxy/CDN (ex. Caddy + Cloudflare), setează `COOKIE_SECURE=true` și
servește `/app` și `/sw.js` fără cache (service worker-ul nu trebuie cache-uit la edge).
