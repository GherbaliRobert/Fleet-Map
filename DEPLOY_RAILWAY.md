# Deploy RA Tracks pe Railway

Ghid pas-cu-pas pentru a muta aplicația pe **Railway** (server + bază de date PostgreSQL/TimescaleDB).
Codul detectează automat modul: dacă există `DATABASE_URL` → **PostgreSQL real** (scalabil, concurență
reală, TimescaleDB pentru `positions`); altfel → **PGlite embedded** (cum rulează acum pe DigitalOcean).
Deci DigitalOcean rămâne **neatins** ca backup — nimic nu se strică acolo.

> ⚠️ Secretele (SESSION_SECRET, VAPID, parole, chei API) **NU** se pun în acest fișier și **NU** se comit
> în git. Se setează doar ca *Variables* în Railway. Valorile generate ți le-am dat separat, în chat.

---

## 0. Pre-rechizite
- Cont Railway (railway.app), logat cu GitHub.
- Repo `GherbaliRobert/Fleet-Map` pe branch-ul **`main`** (deja conține `Dockerfile` + `railway.json`).

## 1. Creează proiectul + deploy din GitHub
1. Railway → **New Project** → **Deploy from GitHub repo** → alege `GherbaliRobert/Fleet-Map`.
2. Railway citește `railway.json` → buildează din `Dockerfile` (Node 20, expune 3000 + 5027),
   cu healthcheck pe `/api`. Lasă build-ul să ruleze (va fi „crashed/restarting" până adaugi DB-ul + env — normal).

## 2. Adaugă baza de date
Ai două variante (codul merge cu ambele — detectează `timescaledb` și activează hypertable; dacă lipsește,
cade automat pe Postgres simplu, fără să crape):

**Varianta A — rapid, ca să fii live azi:** în proiect → **New** → **Database** → **Add PostgreSQL**.
   Postgres simplu. Aplicația merge; doar compresia/retenția Timescale nu se activează (ok pentru zeci de mașini).

**Varianta B — recomandat pentru scală (date la 4s × multe mașini):** TimescaleDB.
   - Cel mai simplu: **Timescale Cloud** (timescale.com, are free tier) → creezi un service → copiezi
     connection string-ul → îl pui în `DATABASE_URL` (vezi pasul 3). Decuplează DB-ul de Railway.
   - SAU deploy unui template/imagine `timescale/timescaledb` ca serviciu Railway, cu volum atașat.

→ La final ai un `DATABASE_URL`. Dacă folosești Postgres-ul Railway, în tab-ul **Variables** al serviciului
   app adaugi o referință: `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (Railway completează automat).

## 3. Setează variabilele de mediu (Variables) pe serviciul app
Obligatorii:

| Variabilă | Valoare | De ce |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` sau string-ul de la Timescale Cloud | activează modul PostgreSQL |
| `SESSION_SECRET` | *(valoarea generată, din chat)* | altfel sesiunile pică la fiecare redeploy |
| `VAPID_PUBLIC_KEY` | *(generată)* | notificări push stabile între deploy-uri |
| `VAPID_PRIVATE_KEY` | *(generată)* | idem |
| `ADMIN_PASSWORD` | *(parolă aleasă de tine, tare)* | la primul boot creează userul `admin` (super-admin) |
| `COOKIE_SECURE` | `true` | cookie sigur pe HTTPS |
| `TCP_PORT` | `5027` | portul de ingestie Teltonika |

> **NU** seta `PORT` — Railway îl injectează automat, iar aplicația îl folosește.

Opționale:

| Variabilă | Valoare | Efect |
|---|---|---|
| `ANTHROPIC_API_KEY` | cheia ta Claude | activează Asistentul AI (alternativ: o lipești în UI ca super-admin → se salvează în DB) |
| `AI_MODEL` | `claude-3-5-haiku-latest` | model AI (implicit deja acesta) |
| `VAPID_SUBJECT` | `mailto:robertgherbali@gmail.com` | contact push |
| `POSITION_RETENTION_DAYS` | `180` | după câte zile se șterg pozițiile (Timescale retention) |
| `PG_POOL_MAX` | `10` | conexiuni max în pool |
| `DISPLAY_TZ` | `Europe/Bucharest` | fus orar afișat în rapoarte |
| `PGSSL` | `disable` / `require` | de obicei **nu e nevoie** — SSL se auto-detectează (intern Railway = off, cloud public = on). Setează doar ca override |
| SMTP_*/TELEGRAM_* | — | canale notificări (vezi `channels.js`) |

După ce adaugi variabilele → **Redeploy**.

## 4. Verifică în loguri
În tab-ul **Deployments → Logs** ar trebui să vezi:
```
[DB] PostgreSQL (DATABASE_URL) — mod scalabil
[DB] TimescaleDB activ: hypertable positions + compresie >7z + retenție 180z   (doar varianta B)
[AUTH] Utilizator super-admin creat (admin)
[PUSH] Web Push activ (VAPID configurat)
  RA Tracks Server — PORNIT
```
Healthcheck-ul pe `/api` trebuie să treacă (serviciul devine **Active/verde**).

## 5. Domeniu web (ratrack.ro) prin Cloudflare DNS
Railway nu găzduiește DNS și nu dă IP fix pe apex → pentru ca bara `ratrack.ro` (fără www) să meargă,
zona se mută pe **Cloudflare** (gratis, suportă CNAME pe apex). Cloudflare înlocuiește rolul de DNS
al DigitalOcean — după migrare rămâi cu Railway (app+DB) + Cloudflare (DNS).

1. **Cloudflare** (dash.cloudflare.com) → cont gratis → **Add a site** → `ratrack.ro` → plan **Free**.
   Cloudflare scanează zona veche; îți dă **2 nameservere** unice (ex. `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`).
2. **RoTLD** (Administrare On-Line → nameservere) → **ștergi** `ns1/ns2/ns3.digitalocean.com` →
   **adaugi cele 2 nameservere Cloudflare** → salvezi. (propagare: de obicei < 1h, max ~24h; Cloudflare trimite mail „Active")
3. **Railway** → serviciul app → Settings → Networking → **Custom Domain** → adaugi `ratrack.ro` + `www.ratrack.ro`.
   Railway îți dă o **țintă CNAME** (`...up.railway.app`).
4. **Cloudflare → DNS records** (șterge recordurile vechi spre IP-ul DO, apoi adaugă):

   | Tip | Nume | Conținut | Proxy |
   |---|---|---|---|
   | CNAME | `@` (ratrack.ro) | ținta web Railway | **DNS only** (nor gri) |
   | CNAME | `www` | ținta web Railway | **DNS only** (nor gri) |
   | CNAME | `gps` | host TCP Proxy Railway (`...proxy.rlwy.net`) | **DNS only** (nor gri) — obligatoriu |

   > Toate pe **DNS only (gri)** la început: Railway își validează domeniul și emite SSL-ul, iar `gps`
   > (TCP brut Teltonika) **trebuie** să ocolească proxy-ul Cloudflare (norul portocaliu = doar HTTP).
   > Cloudflare aplatizează automat CNAME-ul pe apex. Dacă ai și MX/TXT pe ratrack.ro, readaugă-le aici.
5. Railway emite HTTPS automat după validare. Verifică `https://ratrack.ro` + `https://www.ratrack.ro`.

## 6. Ingestie GPS (TCP 5027) — partea critică pentru Teltonika
HTTP-ul merge prin domeniu, dar device-urile trimit pe **TCP brut**, nu HTTP:
1. Railway → serviciul app → **Settings → Networking → TCP Proxy** → **Add** → port aplicație `5027`.
2. Railway dă un endpoint de forma `nume.proxy.rlwy.net:NNNNN` (host + port aleator).
3. **Recomandat (portabilitate):** fă în DNS `gps.ratrack.ro` → CNAME → host-ul de la Railway.
   Configurezi device-ul cu `gps.ratrack.ro:NNNNN`. Dacă pe viitor schimbi platforma, modifici doar CNAME-ul,
   nu fiecare device.
4. Reconfigurează tracker-ul Teltonika (FMB/FMC): **Server/Domain = gps.ratrack.ro**, **Port = NNNNN**, protocol TCP.

## 7. Verificare end-to-end
- `https://ratrack.ro` → login cu `admin` + `ADMIN_PASSWORD`.
- Device-ul trimite → apare pe hartă (verifică în loguri pachetele Teltonika primite pe TCP).
- Rapoarte / EcoDrive / dashboard funcționează (fără date demo amestecate la super-admin).
- Asistent AI răspunde (dacă ai pus cheia).

---

## Migrarea datelor DigitalOcean → Railway
Railway pornește cu **DB nou, gol**. Pentru a muta companiile/userii/device-urile (și opțional istoricul
de poziții) de pe DigitalOcean (PGlite) pe Railway (PostgreSQL), folosește cele două scripturi din repo.
Păstrează **ID-urile, cheile străine, secvențele și parolele** (deci te loghezi cu aceleași credențiale).
Testat round-trip pe TimescaleDB real.

**Pas 1 — Export pe DigitalOcean** (PGlite e single-process → oprește serverul scurt):
```bash
cd /opt/Fleet-Map                 # unde e instalată aplicația
git pull                          # ca să ai migrate_export.js
systemctl stop fleetmap           # numele unit-ului tău systemd
MIGRATE_POSITIONS=1 node migrate_export.js    # fără MIGRATE_POSITIONS=1 sari istoricul de poziții
systemctl start fleetmap
```
→ rezultă `migration_dump.json`.

**Pas 2 — Adu fișierul local:**
```bash
scp root@165.227.131.142:/opt/Fleet-Map/migration_dump.json .
```

**Pas 3 — Import în Postgres-ul Railway** (URL-ul **PUBLIC**: Railway → Postgres → Connect → Public Network):
```bash
DATABASE_URL="postgres://postgres:...@...rlwy.net:PORT/railway" node migrate_import.js migration_dump.json
```
> SSL e pornit implicit (corect pentru URL-ul public Railway) — **nu** pune `PGSSL=disable` aici.
> Importul **GOLEȘTE** (TRUNCATE) tabelele țintă întâi → DigitalOcean devine sursa de adevăr.
> Rulează-l înainte de a adăuga date manual pe Railway. Poate fi rulat și înainte, și după primul deploy al app-ului (e idempotent, creează el schema dacă lipsește).

**Pas 4 — Verifică:** loghează-te pe `https://ratrack.ro` cu user-ul/parola existente de pe DigitalOcean.

## Costuri (orientativ, din analiza anterioară)
- App (RAM/CPU usage-based) + Postgres: ordinul **~$10–25/lună** pentru zeci de mașini.
- La scală (sute de mașini, date la 4s) DB-ul e cel mai scump → de aici recomandarea TimescaleDB
  (compresie >7 zile reduce mult storage-ul) sau Timescale Cloud dedicat.

## Troubleshooting
- **DB nu se conectează / erori SSL** → SSL se auto-detectează; dacă tot apar erori, forțează cu `PGSSL=disable` (URL intern) sau `PGSSL=require` (URL public).
- **Healthcheck eșuează** → verifică logurile pentru crash la boot (lipsă env var?); calea e `/api`.
- **Sesiuni pică la fiecare deploy** → `SESSION_SECRET` nesetat.
- **Push nu merge după redeploy** → `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` nesetate.
- **Device-ul nu apare** → TCP Proxy neconfigurat sau device trimite pe host/port greșit.
