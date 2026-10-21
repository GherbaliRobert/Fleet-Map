# Deploy pe VPS propriu (Hostico sau oricare altul)

Ghid pentru **producție**, cu PostgreSQL adevărat. Pentru probe și demonstrații rămâne
`docker-compose.yml` (care pornește pe PGlite, o bază într-un fișier — bună la câteva vehicule,
nepotrivită la sute de milioane de rânduri).

Toți pașii de mai jos au fost **rulați și verificați**, nu doar scriși.

---

## Ce trebuie întrebat la furnizor ÎNAINTE de a plăti

Trei lucruri decid dacă merge, și niciunul nu e scris pe paginile de prezentare:

1. **Cât trafic e inclus** pe lună și cât costă depășirea. La o flotă mare, fiecare dispecer care
   ține harta deschisă generează trafic constant. E cifra care decide dacă mutarea chiar e mai
   ieftină.
2. **Se poate deschide un port TCP oarecare** (5027 sau cel folosit azi) și trece el prin filtrul
   anti-DDoS? Trackerele **nu vorbesc HTTP** — dacă filtrul le taie, nu ai produs. Întreabă explicit
   despre „TCP brut, protocol propriu, conexiuni de lungă durată".
3. **Ce înseamnă „administrat"** la ei: doar sistemul de operare și mașina, sau se ating și de
   containerele și baza ta? De asta depinde cât rămâne pe tine.

**Dimensionare.** Discul unui VPS e FIX — plin înseamnă bază oprită, deci poziții pierdute. Vestea
bună: pe Postgres propriu se activează singur TimescaleDB, care comprimă istoricul mai vechi de 7 zile
de 14–19 ori (măsurat pe 24.09), iar aplicația șterge singură ce e mai vechi decât contractul fiecărei
firme (12 luni incluse, 24/36 unde s-au plătit). Deci nu dimensiona pentru cifra brută: un camion care
transmite la 10 secunde ocupă ~0,25 GB pe 12 luni, o mașină mică ~0,1 GB.
Ia RAM cu rezervă: preprocesarea și mentenanța bazei cer mai mult decât rularea obișnuită.

---

## 1. Serverul

Ubuntu sau Debian. După ce ai IP-ul:

```bash
curl -fsSL https://get.docker.com | sh
```

Deschide în firewall: **80**, **443** și **portul trackerelor** (vezi pasul 3).

```bash
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 5027/tcp && ufw enable
```

> Veniți de pe Railway? În locul lui 5027 deschideți portul de azi al trackerelor (ex. 21015 — pasul 3).

> Dacă furnizorul are propriul lui firewall, în panoul lui, trebuie deschise în **amândouă** locurile.

---

## 2. DNS

Două înregistrări, amândouă către IP-ul serverului:

| Tip | Nume | Valoare | Observație |
|-----|------|---------|------------|
| A | `@` (ratrack.ro: site-ul și aplicația) | IP-ul VPS-ului | prin Cloudflare, dacă vrei |
| A | `gps` (trackerele) | IP-ul VPS-ului | **DNS only** — nor gri, NU portocaliu |

⚠ **Numele pentru trackere nu trece prin Cloudflare.** Cloudflare proxează HTTP, nu protocolul
Teltonika. Dacă norul e portocaliu, trackerele nu mai ajung la server.

---

## 3. Portul trackerelor — pasul care evită deplasările pe teren

Trackerele au înscris în ele **un nume și un port**. Numele îl controlezi tu prin DNS, deci se mută
gratis. Portul îl alegi tu pe mașina ta — **deci alege-l pe cel pe care îl folosesc deja.**

- **Veniți de pe Railway?** Portul e cel dat de proxy-ul lor (ex. `21015`), nu 5027. Îl vezi în
  Railway → serviciul app → Settings → Networking → TCP Proxy. Pune-l în `.env` ca
  `TCP_PUBLIC_PORT=21015`.
- **Instalare nouă?** Lasă 5027.

Cu asta, mutarea înseamnă **un rând de DNS schimbat și niciun tracker atins**.

---

## 4. Codul și configurarea

```bash
git clone <adresa-repo> ra-tracks && cd ra-tracks
cp .env.prod.exemplu .env
nano .env
```

Completează cel puțin `DOMAIN`, `DB_PASSWORD`, `SESSION_SECRET`, `ADMIN_PASSWORD`,
`TCP_PUBLIC_PORT`. Pentru parole:

```bash
openssl rand -base64 24    # DB_PASSWORD
openssl rand -hex 32       # SESSION_SECRET
```

`DOMAIN` rămâne **ratrack.ro**: acolo merg aplicația de telefon, linkurile din emailuri și emailurile
primite prin Cloudflare.

**Cheile serviciilor** (RA Insight, Brevo, emailurile primite, Firebase, ANAF) sunt aceleași ca pe
Railway: Railway → serviciul aplicației → Variables → **Raw Editor** → copiezi tot și lipești la
capătul lui `.env`. E sigur: baza, porturile și HTTPS-ul mașinii sunt scrise în
`docker-compose.prod.yml` și bat ce vine din Railway. Tot `.env`-ul ajunge la aplicație — o
variabilă nouă se pune doar acolo.

⚠ `FIREBASE_SA_JSON` (și `GOOGLE_SA_JSON`) pe un singur rând, între **apostrofuri** (`'{…}'`), nu
între ghilimele: cu ghilimele, Docker strică cheia privată și notificările pe telefon se opresc.

---

## 5. Pornirea

```bash
GIT_SHA=$(git rev-parse --short HEAD) docker compose -f docker-compose.prod.yml up -d --build
```

`GIT_SHA` dă versiunea din `/api/health` (câmpul `version` = commit-ul pornit), ca pe Railway. Fără
el, scrie „dev".

Prima pornire durează câteva minute (se construiește imaginea). Verifică:

```bash
docker compose -f docker-compose.prod.yml logs app | grep '\[DB\]'
```

Trebuie să vezi **exact** astea două:

```
[DB] PostgreSQL (DATABASE_URL) — mod scalabil (SSL: off)
[DB] TimescaleDB activ: hypertable positions + compresie >7z (ștergerea istoricului: după regula fiecărei firme)
```

Al doilea rând e cel important. Dacă în locul lui apare
`⚠ TimescaleDB indisponibil → FĂRĂ compresie și FĂRĂ retenție automată`, **oprește-te aici**:
baza va crește la nesfârșit până umple discul. Înseamnă că nu s-a folosit imaginea corectă.

Caddy obține certificatul singur. Intri pe `https://ratrack.ro/app` cu `admin` și parola din `.env`.

Apoi **Administrare → Stare producție**: rândurile cheii AI, emailului (Brevo), emailurilor primite,
ANAF și notificărilor trebuie să fie ca pe Railway. Unul portocaliu = o cheie care n-a ajuns în `.env`.

**Primul lucru după login:** fă-ți contul tău de super-admin. Contul „admin" se retrage singur după
ce există altul, la următoarea repornire.

---

## 6. Verificarea că trackerele chiar ajung

```bash
docker compose -f docker-compose.prod.yml logs -f app | grep '\[TCP\]'
```

La o conexiune bună vezi `Conexiune nouă`, apoi `Dispozitiv identificat: IMEI ...`.

Dacă vezi `IMEI neînregistrat/respins ... (mod strict)`, e corect: vehiculul trebuie înregistrat
întâi în aplicație. E o măsură de siguranță, nu o defecțiune.

---

## Mutarea datelor de pe Railway

> ⚠ **20.10: pasul ăsta NU merge așa cum e scris.** Unealta de export e făcută pentru vechea bază
> într-un fișier (refuză o bază Postgres, cum e cea de pe Railway) și copiază doar 22 din cele 66 de
> tabele (fără contracte, facturi, oferte, montaj, stoc, mail). De refăcut înainte de mutare.

```bash
# 1. Pe laptop: exportă din Railway (URL-ul public al bazei, din dashboard)
DATABASE_URL="postgres://...rlwy.net:PORT/railway" node migrate_export.js migration_dump.json

# 2. Copiază pe server
scp migration_dump.json root@IP:/root/ra-tracks/

# 3. Pe server: importă în baza nouă
docker compose -f docker-compose.prod.yml exec app node migrate_import.js migration_dump.json
```

**Ordinea care evită pierderea de poziții:** importă întâi, verifică aplicația nouă, și abia apoi
schimbă DNS-ul. Cât timp DNS-ul încă arată spre vechiul server, acolo curg datele. După schimbare,
lasă vechiul server pornit încă o zi — unele trackere țin adresa în cache.

---

## Actualizări

```bash
cd ra-tracks && git pull
GIT_SHA=$(git rev-parse --short HEAD) docker compose -f docker-compose.prod.yml up -d --build
```

Baza **nu** e atinsă: trăiește într-un volum separat de imagine.

---

## Ce rămâne pe tine, spre deosebire de Railway

| | Railway | VPS propriu |
|---|---|---|
| Livrarea codului | `git push`, automat | `git pull` + comanda de mai sus |
| Certificat HTTPS | inclus | Caddy îl ia singur |
| Actualizări de sistem | ale lor | ale tale (`apt upgrade`) |
| Disc | crește singur | **fix — de urmărit** |
| Compresia istoricului | **indisponibilă** | pornește singură |
| Ștergerea istoricului (după contract) | o face aplicația | o face aplicația |
| Dacă pică mașina | te mută ei | restaurezi tu |

Ultimele două rânduri sunt și motivul principal pentru care merită, și riscul principal pe care ți-l
asumi. De aceea copia de rezervă în afara serverului nu e opțională aici — e condiția de intrare.

---

## Ce merită pus pe aceeași mașină

Dacă tot ai server propriu, două servicii pentru care altfel plătești abonament pot rula local:

- **OSRM** (lipirea traseului pe drumuri) — harta României ocupă puțin, iar costul devine zero.
  Se pornește cu `OSRM_URL=http://osrm:5000` în `.env`.
- **Nominatim** (adresele) — scapi și de abonament, și de politica de utilizare a serverului public,
  pe care oricum n-o respectăm la o flotă reală. Cere memorie serioasă, deci ia-l în calcul la
  dimensionare.

Amândouă se configurează cu câte o variabilă — codul e deja scris pentru ele.
