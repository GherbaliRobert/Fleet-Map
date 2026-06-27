# Hosting GRATUIT pe Oracle Cloud (Always Free) + HTTPS

Rezultat: VM gratuit **pe veci**, IP public, **HTTPS automat**, port **TCP 5027** pentru dispozitive — cost 0 (cardul e doar pentru verificare, nu se taxează pe Always Free). Apoi instalezi PWA pe telefoane.

> Toate comenzile din VM sunt pentru **Ubuntu**. Timp estimat: ~30–40 min.

---

## 1. Cont Oracle Cloud
- https://cloud.oracle.com → **Sign up**. Completezi datele (email, telefon, card — doar verificare).
- La **Home Region** alege una apropiată de RO: *Germany Central (Frankfurt)* sau *Switzerland North (Zurich)*.
  (Regiunea nu se mai poate schimba după înscriere.)

## 2. Creează VM-ul (Always Free)
- Meniu (☰) → **Compute → Instances → Create instance**.
- **Name:** `ra-track`
- **Image and shape → Edit:**
  - Image: **Ubuntu 22.04**
  - Shape → **Ampere (ARM) `VM.Standard.A1.Flex`**, 1 OCPU / 6 GB — *Always Free eligible*.
    - Dacă apare „**Out of host capacity**", alege `VM.Standard.E2.1.Micro` (AMD, tot Always Free) sau reîncearcă peste câteva ore / altă regiune.
- **Add SSH keys:** „Generate a key pair for me" → **Download private key** (o salvezi, o folosești la SSH).
- **Create**. Aștepți statusul **Running**. Notează **Public IP address**.

## 3. Deschide porturile — în DOUĂ locuri (ambele obligatorii!)

**a) Firewall-ul Oracle (Security List):**
- Pe pagina instanței → click pe **Virtual Cloud Network** → **Subnet** → **Security Lists** → *Default Security List* → **Add Ingress Rules**. Adaugă (de 3 ori):
  - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
  - la fel pentru **443**
  - la fel pentru **5027**

**b) Firewall-ul din Ubuntu** (Oracle blochează totul cu iptables — pas uitat des). După ce intri prin SSH (pasul 5):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5027 -j ACCEPT
sudo netfilter-persistent save
```

## 4. Domeniu gratuit (DuckDNS)
- https://www.duckdns.org → autentificare (Google/GitHub).
- La „domains" scrie `ratrack` → **add domain**.
- La „current ip" pune **IP-ul public al VM-ului** → **update ip**.
- Domeniul tău: **`ratrack.duckdns.org`** (alege-ți numele tău).

## 5. Conectare SSH (din Windows PowerShell)
```powershell
icacls C:\cale\cheie.key /inheritance:r /grant:r "$($env:USERNAME):R"   # o singură dată: permisiuni cheie
ssh -i C:\cale\cheie.key ubuntu@IP_PUBLIC
```
(utilizatorul pe Ubuntu Oracle este `ubuntu`)

## 6. Instalează Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
exit
```
Reconectează-te prin SSH (ca să se aplice grupul docker). Pe `E2.1.Micro` (1 GB RAM), adaugă swap ca build-ul să nu rămână fără memorie:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 7. Adu codul pe server (o variantă)
- **A. GitHub:** pune proiectul pe GitHub, apoi pe VM:
  ```bash
  git clone https://github.com/UTILIZATORUL_TAU/ra-track.git && cd ra-track
  ```
- **B. Copiere directă (WinSCP / scp din Windows):** copiezi folderul proiectului pe VM (fără `node_modules` și `data`).

## 8. Configurează și pornește
```bash
cd ra-track            # folderul proiectului
cat > .env <<'EOF'
DOMAIN=ratrack.duckdns.org
SESSION_SECRET=ruleaza__openssl_rand_-hex_32__si_pune_rezultatul_aici
ADMIN_PASSWORD=ParolaTaTare
EOF
docker compose up -d --build
```
Caddy obține automat certificatul HTTPS. În ~1 minut deschizi **https://ratrack.duckdns.org** → login `admin` / parola din `.env` → **schimbă parola** din Administrare.

Verificare: `docker compose logs -f app` (ar trebui să vezi „PORNIT").

## 9. Conectează dispozitivele Teltonika
SMS către dispozitiv:
```
  setparam 2004:ratrack.duckdns.org;2005:5027;2006:0
```

## 10. Instalează pe telefoane (PWA)
Deschizi `https://ratrack.duckdns.org` pe telefon:
- **Android (Chrome):** meniu ⋮ → „Instalează aplicația".
- **iPhone (Safari):** Share → „Add to Home Screen".
Apoi din 🔔 → ⚙ Preferințe → „Activează push".

---

## Întreținere
- **Update:** `git pull && docker compose up -d --build` (sau recopiezi + rebuild).
- **Backup** (baza + secrete): `docker run --rm -v ra-track_gpsdata:/d -v $PWD:/b alpine tar czf /b/backup-gps.tgz /d`
- **Loguri:** `docker compose logs -f`
- **DuckDNS** se poate auto-actualiza dacă IP-ul se schimbă (Oracle IP-ul e de obicei fix la Always Free).
