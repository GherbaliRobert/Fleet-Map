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

> **Verificare rapidă, din aplicație:** *Administrare → Dashboard platformă → „Stare producție"* arată
> care dintre variabilele de mai jos lipsesc pe serverul care rulează ACUM, cu verdict (ok/atenție/critic)
> și consecința fiecăreia. Nu afișează niciodată valorile, doar dacă sunt setate. Endpoint: `GET /api/admin/health`.

### 3a. Pornire (fără ele aplicația nu funcționează corect)

| Variabilă | Valoare | De ce |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` sau string-ul de la Timescale Cloud | activează modul PostgreSQL (altfel PGlite local = date pierdute la redeploy) |
| `SESSION_SECRET` | 64 caractere hex aleatoare | fără el se folosește un fișier local → toți utilizatorii sunt deconectați la fiecare redeploy |
| `ADMIN_PASSWORD` | parolă tare | **⚠ Dacă NU era setată la primul boot, contul `admin` s-a creat cu parola implicită `admin123`** (`server.js:8354`). Cât timp variabila e setată, parola se **resetează din ea la FIECARE pornire** — deci nu o mai poți schimba din interfață; scoate variabila după ce ai stabilit parola dorită. |
| `COOKIE_SECURE` | `true` | cookie de sesiune doar pe HTTPS + activează HSTS |
| `TCP_PORT` | `5027` | portul de ingestie Teltonika în container (Railway îl expune extern prin TCP proxy, ex. `gps.ratrack.ro:21015`) |

> **NU** seta `PORT` — Railway îl injectează automat. **NU** seta `TZ` — codul forțează `UTC` pe prima linie.

### 3b. Date & continuitate (fără ele riști pierderea datelor)

| Variabilă | Valoare | De ce |
|---|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | **fără cele 4 variabile S3, backup-ul se generează și se ARUNCĂ.** Filesystemul containerului Railway e efemer. |
| `BACKUP_S3_BUCKET` | ex. `ratracks-backup` | |
| `BACKUP_S3_KEY_ID` | access key id (R2 → *Manage API tokens*) | |
| `BACKUP_S3_SECRET` | secret access key | |
| `BACKUP_S3_REGION` | `auto` pentru R2 | la AWS: regiunea reală |
| `BACKUP_PASSPHRASE` | frază lungă, păstrată separat de Railway | dump-ul conține hash-uri de parole, chei API și date de clienți — fără ea pleacă **necriptat** |
| `POSITION_RETENTION_DAYS` | `180` | ștergerea automată a pozițiilor (necesită TimescaleDB activ — vezi „Stare producție") |

### 3c. Comunicare cu clienții (fără ele nu poți face onboarding)

| Variabilă | Valoare | De ce |
|---|---|---|
| `SMTP_HOST` | ex. `smtp.zoho.eu` | **fără SMTP: invitațiile de cont nu pleacă, resetarea parolei nu funcționează, rapoartele programate nu ajung pe email** |
| `SMTP_USER` | ex. `noreply@ratrack.ro` | |
| `SMTP_PASS` | parola/app-password | ⚠ `mailer.enabled()` verifică doar HOST+USER — dacă uiți PASS, aplicația se crede configurată și trimiterile eșuează tăcut |
| `SMTP_PORT` | `587` (implicit) | |
| `SMTP_SECURE` | `true` **doar** pentru portul 465 | pe 587 lasă nesetat |
| `SMTP_FROM` | `RA Tracks <noreply@ratrack.ro>` | implicit se compune din `SMTP_USER` |
| `SUPPORT_EMAIL` | adresa unde ajung sesizările din aplicație | altfel se caută în setările din DB |

### 3d. Înainte de lansare

| Variabilă | Valoare | De ce |
|---|---|---|
| `DEMO_DISABLED` | `true` | la boot **șterge definitiv** compania demo, cele 5 vehicule sintetice și contul `demo` |
| `SENTRY_DSN` | DSN-ul proiectului | altfel erorile rămân doar în jurnalul intern |
| `OSRM_URL` | instanță proprie | implicit `router.project-osrm.org` = **serverul public de demonstrație**, cu limitări și fără garanții pentru uz comercial |
| `GEOCODE_URL` + `GEOCODE_UA` | instanță Nominatim proprie + user-agent cu contact | implicit Nominatim public: max ~1 req/s, politica de utilizare interzice trafic comercial greu |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | pereche generată | notificări push în **browser**. Push-ul pe Android merge prin `FIREBASE_SA_JSON` (deja activ). |

### 3e. Facturare (doar dacă pornești modulul)

| Variabilă | Valoare | De ce |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | plata cu cardul |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **cheia singură nu ajunge** — fără webhook, facturile nu se marchează plătite automat |
| `INVOICE_SERIES` | implicit `RAT` | seria facturilor (A-Z0-9, max 16) |
| `ANAF_EFACTURA_TOKEN`, `ANAF_CIF` | din SPV | e-Factura |
| `ANAF_EFACTURA_TEST` | `false` | ⚠ **implicit `true`** — fără asta trimiți în mediul de TEST al ANAF, crezând că e real (`efactura.js:15`) |
| `ANAF_ETRANSPORT_TEST` | `false` | idem pentru e-Transport (`anaf.js:17`) |

### 3f. Opționale / tuning (au valori implicite bune)

| Variabilă | Implicit | Efect |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Asistentul AI + rezumatele agenților (alternativ: se lipește din UI, se salvează în DB) |
| `AI_MODEL` | `claude-3-5-haiku-latest` | modelul folosit |
| `PG_POOL_MAX` | `12` | conexiuni max în pool |
| `DISPLAY_TZ` | `Europe/Bucharest` | fusul orar afișat în rapoarte |
| `NOTIFY_EXPIRY_DAYS` | `30` | cu câte zile înainte se anunță scadențele |
| `FINDINGS_RETENTION_DAYS` | `90` | cât timp se păstrează constatările agenților |
| `ARCHIVE_RETENTION_DAYS` | `730` | arhiva de poziții (2 ani) |
| `TRIAL_DAYS` | `14` | perioada de probă |
| `SPEED_ALERT_BASE` / `SPEED_ALERT_MARGIN` | `50` / `10` | pragul minim și toleranța pentru alerta de viteză |
| `PGSSL` | auto | SSL se auto-detectează; setează doar ca override |

### 3g. NU seta (sau setează doar știind ce faci)

| Variabilă | De ce nu |
|---|---|
| `PORT` | îl injectează Railway; dacă îl fixezi greșit, healthcheck-ul pică |
| `TZ` | e suprascrisă cu `UTC` de cod |
| `API_CORS_ORIGIN` | nesetată = API accesibil doar de pe același domeniu (corect). Setează doar dacă un site extern trebuie să apeleze API-ul. |
| `WEBHOOK_ALLOW_PRIVATE=true` | dezactivează protecția SSRF pe webhook-urile ieșite |
| `CSP_ENABLED=false` / `RATE_LIMIT_ENABLED=false` | dezactivează Content-Security-Policy, respectiv limitarea de rată — există doar ca supapă de urgență |
| `STRICT_DEVICES=false` | orice tracker necunoscut s-ar putea conecta (implicit e mod strict, cu allow-list) |

După ce adaugi variabilele → **Redeploy**, apoi verifică în *„Stare producție"* că nu mai e nimic roșu.

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
