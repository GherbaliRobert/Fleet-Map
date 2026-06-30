# Backup & restaurare — RA Tracks

Backup logic al **datelor de business** (companii, useri, vehicule, șoferi, plăți, setări, documente, alerte, geofence-uri, oferte etc.).
NU include telemetria `positions` (uriașă, append-only) — aceea se acoperă cu backup-ul nativ Railway al bazei.

## Ce face
- Dump `SELECT *` din tabelele de business → JSON → gzip → (opțional) criptat AES-256-GCM.
- Rulează **automat zilnic** (la 5 min după pornire + la fiecare 24h).
- Se livrează off-box: **download manual** (super-admin) și/sau **upload la un bucket S3-compatibil** (Cloudflare R2 / Backblaze B2 / AWS S3 / MinIO).
- Vizibil în **Dashboard platformă** (web: status + „Descarcă backup" + „Rulează off-site"; mobil: status + „Rulează acum").

## Configurare (env vars — toate opționale)
| Var | Rol |
|---|---|
| `BACKUP_PASSPHRASE` | Dacă e setat → backup-ul e **criptat** (recomandat: conține hash-uri parole + chei API). Aceeași parolă e necesară la restaurare. |
| `BACKUP_S3_ENDPOINT` | ex. `https://<accountid>.r2.cloudflarestorage.com` (R2) sau `https://s3.<region>.amazonaws.com` |
| `BACKUP_S3_BUCKET` | numele bucket-ului |
| `BACKUP_S3_KEY_ID` | access key id |
| `BACKUP_S3_SECRET` | secret access key |
| `BACKUP_S3_REGION` | implicit `auto` (R2); pune regiunea la AWS |
| `BACKUP_S3_PREFIX` | prefix cheie, implicit `ratracks-backup` |

**Retenție:** setează o regulă de **lifecycle** pe bucket (ex. „șterge după 30 zile"). Nu o gestionăm din aplicație.

### Recomandare provider: Cloudflare R2
Folosești deja Cloudflare. R2 are 10 GB gratis, fără taxe de egress. Creezi un bucket + un API token (S3) cu drept de scriere, pui cele 5 `BACKUP_S3_*` în Railway → gata. Backup-urile (câțiva KB–MB) intră zilnic.

## Restaurare (break-glass)
1. Ia un fișier de backup (din S3 sau prin butonul „Descarcă backup acum").
2. Rulează:
   ```
   DATABASE_URL=postgres://...  [BACKUP_PASSPHRASE=...]  node restore-backup.js <fișier> [--wipe]
   ```
   - fără `--wipe` → upsert idempotent (`ON CONFLICT DO NOTHING`): completează ce lipsește.
   - `--wipe` → golește fiecare tabel înainte (restaurare „curată").
3. Scriptul inserează în ordinea dependențelor și resetează secvențele `id`.

## Plus: backup-ul nativ Railway (recomandat în paralel)
Pentru baza COMPLETĂ (inclusiv `positions`), activează backup-urile native din Railway → Database → Backups. Backup-ul logic de aici e complementar: portabil (poți pleca de pe Railway), focusat pe datele critice, criptabil, off-site la tine în bucket.
