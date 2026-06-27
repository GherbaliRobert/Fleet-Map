# Deploy RA Tracks

Aplicația are nevoie de un host care oferă:

1. **Două porturi** — web/API (HTTP, în spatele HTTPS) **și TCP brut 5027** (dispozitivele Teltonika se conectează aici).
2. **Disc persistent** pentru `/app/data` (baza PGlite + secretul de sesiune + cheile VAPID).
3. **Always-on** (serverul TCP și workerele rulează continuu — nu serverless/scale-to-zero).
4. **HTTPS** pentru interfață (obligatoriu și pentru Web Push).

> Vercel / Netlify / Render-free **nu** sunt potrivite (nu expun TCP brut și/sau au disc efemer).

> **Nu ai server propriu și nici domeniu?** Cel mai simplu e **Railway** (Opțiunea B): îți dă domeniu HTTPS
> gratuit, volum persistent și un TCP proxy pentru dispozitive — fără administrare de server. ~5 $/lună.
> Pentru cel mai mic cost pe termen lung, un VPS (Opțiunea A) e mai ieftin, dar îți trebuie un domeniu.

---

## Opțiunea A — VPS + Docker + Caddy (recomandat)

Cel mai ieftin și robust. Merge pe orice VPS (Hetzner, DigitalOcean, Contabo, OVH…), ~4–6 €/lună.

**1. Server + domeniu**
- Ia un VPS (Ubuntu/Debian). Notează IP-ul.
- Pune un **A record** pentru un (sub)domeniu, ex. `gps.firma.ro` → IP-ul serverului.
- Deschide în firewall porturile **80, 443, 5027**.

**2. Instalează Docker**
```bash
curl -fsSL https://get.docker.com | sh
```

**3. Copiază proiectul pe server** (git clone sau scp) și creează `.env`:
```bash
cd "RA Tracks APP"
cat > .env <<EOF
DOMAIN=gps.firma.ro
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=parola-ta-tare
EOF
```

**4. Pornește**
```bash
docker compose up -d --build
```
Caddy obține automat certificatul HTTPS. Deschide `https://gps.firma.ro` → login `admin` / parola din `.env`.

**5. Configurează dispozitivele** (vezi secțiunea *Dispozitive* mai jos) către `gps.firma.ro:5027`.

Actualizare ulterioară: `git pull && docker compose up -d --build`.
Backup: salvează volumul `gpsdata` (ex. `docker run --rm -v ratrackapp_gpsdata:/d -v $PWD:/b alpine tar czf /b/backup.tgz /d`).

---

## Opțiunea B — Railway (recomandat dacă nu ai infrastructură)

Îți dă domeniu HTTPS gratuit (`*.up.railway.app`), volum persistent și TCP proxy. Cont pe https://railway.app.

**Varianta cu CLI (fără GitHub):**
```bash
npm i -g @railway/cli
railway login
railway init           # creează proiectul
railway up             # urcă și build-uiește codul (folosește Dockerfile-ul)
```
Apoi în dashboard-ul Railway:
1. **Variables**: `SESSION_SECRET` (random lung), `ADMIN_PASSWORD`, `COOKIE_SECURE=true`.
2. **Volume**: adaugă un volum montat la **`/app/data`** (altfel pierzi datele la redeploy).
3. **Settings → Networking → Public Networking**: *Generate Domain* (web HTTPS) **și** *TCP Proxy → port 5027* → primești un `host:port` public pentru dispozitive.

(Sau, fără CLI: pune codul pe GitHub → New Project → *Deploy from GitHub repo*, apoi pașii 1–3.)

Dispozitivele se configurează către host-ul și portul date de **TCP Proxy** (nu domeniul web).

---

## Opțiunea C — Fly.io

`fly launch` (fără să pornească imediat), apoi:
- adaugă un **volum** montat la `/app/data` (`fly volumes create gpsdata`),
- expune un **serviciu TCP** pentru portul 5027 în `fly.toml` (pe lângă serviciul HTTP 3000),
- `fly deploy`.

---

## Opțiunea D — fără domeniu / rețea internă

Dacă rulezi doar intern, poți porni direct (`npm start` sau `docker run -p 3000:3000 -p 5027:5027 -v gpsdata:/app/data ...`).
**Atenție:** Web Push are nevoie de HTTPS (sau `localhost`). Pe IP/HTTP simplu, restul merge, dar push-ul nu.

---

## Variante GRATUITE

Tier-urile „web" gratuite (Render free, Railway trial) **nu** merg: n-au TCP brut și se opresc la inactivitate.
Dar există **VM-uri gratuite reale** (always-on, control pe porturi, disc persistent):

### Oracle Cloud — Always Free (recomandat gratuit)
- VM **gratuit pe veci** (ARM Ampere până la 4 vCPU / 24 GB, sau 2× AMD micro), IP public, disc persistent, toate porturile.
- Necesită card la înscriere (doar verificare — **nu se taxează** pe Always Free).
- Pași: cont Oracle Cloud → instanță „Always Free" (Ubuntu) → deschide porturile **80, 443, 5027** (Security List + `ufw allow`) → `curl -fsSL https://get.docker.com | sh` → folosește `docker compose` de mai sus.

### Google Cloud — e2-micro Always Free
- 1 VM `e2-micro` gratuit (regiuni US), disc persistent, toate porturile. Latență mai mare către RO. Tot card la înscriere.

### Self-host (gratuit, fără card — dacă ai un PC always-on)
- Rulează pe un PC/mini-PC/Raspberry Pi din birou (`docker compose up -d` sau `npm start`).
- Pe router: **port-forward 5027** (pentru dispozitive) și 80/443 (pentru web), + DuckDNS pentru HTTPS.

### Domeniu gratuit (pentru HTTPS)
- **DuckDNS** (https://duckdns.org): subdomeniu gratuit, ex. `ratrack.duckdns.org` → IP-ul mașinii.
- Pui `DOMAIN=ratrack.duckdns.org` în `.env`; **Caddy obține certificatul automat** (port 80 deschis).

> Rezumat gratuit 100%: **Oracle Always Free + DuckDNS + Docker/Caddy** (din proiectul ăsta) = web HTTPS + TCP 5027 + disc persistent, fără cost lunar.

## Dispozitive (Teltonika)

Trimite prin SMS adresa serverului (host + portul TCP public):
```
  setparam 2004:gps.firma.ro;2005:5027;2006:0
```
(pe Railway folosește host-ul și portul date de TCP Proxy).

---

## Checklist securitate (producție)

- [ ] `SESSION_SECRET` setat (random, lung).
- [ ] `ADMIN_PASSWORD` schimbat (sau schimbă parola admin din interfață după primul login).
- [ ] `COOKIE_SECURE=true` (e deja setat în compose; necesită HTTPS).
- [ ] Backup periodic al volumului `gpsdata`.
- [ ] (Opțional) `POSITION_RETENTION_DAYS` ca să nu crească baza la nesfârșit.
- [ ] (Opțional) SMTP / Telegram / VAPID pentru notificări — vezi `.env.example`.
