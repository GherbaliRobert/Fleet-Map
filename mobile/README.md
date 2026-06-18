# RA Tracks — Aplicație mobilă (Capacitor + Preact)

Aplicație mobilă **Android** (apoi iOS din același cod) pentru clientul final: monitorizare flotă, statistici, notificări. Consumă API-ul existent `server.js` prin **token (cheie API)** — fără cookie-uri.

Stack: **Vite + Preact + TypeScript**, **Leaflet** (hărți OSM), **Chart.js** (donut), **Capacitor 6** (shell nativ + push FCM).

---

## 1. Dezvoltare în browser (cel mai rapid)

```bash
cd mobile
cp .env.example .env           # lasă VITE_API_BASE gol → proxy Vite pe /api
npm install
# Pornește backend-ul separat (în rădăcina proiectului): node server.js  (port 3000)
npm run dev                    # http://localhost:5173  (proxy /api → http://localhost:3000)
```
Login de test: `admin` / `admin123` (super-admin, fără vehicule demo) sau un **company_admin** al unei companii cu vehicule. Pentru flota demo, creează un company_admin în compania demo (vezi mai jos) și loghează-te cu el.

> Proxy: `vite.config.ts` trimite `/api` → `DEV_API` (implicit `http://localhost:3000`). Schimbă `DEV_API` ca să țintești alt backend.

### Cont admin pentru compania demo (testare cu 5 vehicule)
```bash
# login admin → creează company_admin în compania demo (id 1)
TOKEN=$(curl -s -XPOST localhost:3000/api/mobile/login -H 'Content-Type:application/json' -d '{"username":"admin","password":"admin123"}' | jq -r .token)
curl -s -XPOST localhost:3000/api/users -H "Authorization: Bearer $TOKEN" -H 'Content-Type:application/json' \
  -d '{"username":"demoadmin","password":"test1234","role":"company_admin","company_id":1,"email":"demo@local"}'
# apoi în app: demoadmin / test1234
```

---

## 2. Build de producție (web → bundle Capacitor)

```bash
npm run build                  # tsc + vite → dist/
```
Pe device, app-ul folosește `VITE_API_BASE` (URL absolut) prin `CapacitorHttp` (ocolește CORS). Setează-l la build:
```bash
VITE_API_BASE=https://ratrack.ro npm run build
```

---

## 3. Android (Capacitor)

Cerințe: **Android Studio** (SDK + JDK 17). O singură dată:
```bash
npm install
npx cap add android            # generează folderul android/
```
La fiecare modificare a UI:
```bash
VITE_API_BASE=https://ratrack.ro npm run build
npx cap sync android
npx cap run android            # rulează pe emulator/telefon conectat
# sau: npx cap open android    # deschide în Android Studio
```

### Icoane + splash
Pune o icoană sursă (1024×1024) în `mobile/assets/icon.png` și un splash (2732×2732, fundal `#0B0E11`) în `mobile/assets/splash.png`, apoi:
```bash
npm i -D @capacitor/assets
npx @capacitor/assets generate --android --iconBackgroundColor '#0B0E11' --splashBackgroundColor '#0B0E11'
```
(Poți porni de la `../public/icon-512.png` și `../public/logo-mark.png`.)

### Permisiuni (android/app/src/main/AndroidManifest.xml)
Capacitor adaugă `INTERNET`. Pentru push pe Android 13+ adaugă:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

## 4. Push notificări (FCM)

### Firebase (o singură dată)
1. Creează proiect Firebase „RA Tracks" → adaugă app Android cu `applicationId = ro.ratracks.app`.
2. Descarcă `google-services.json` → pune-l în `mobile/android/app/`.
3. În Firebase → Project settings → Service accounts → **Generate new private key** → JSON.
4. Pune conținutul JSON în variabila de mediu a serverului: `FIREBASE_SA_JSON` (pe Railway: Settings → Variables). Serverul îl citește la boot (`initFcm`), no-op dacă lipsește.

### Pluginuri (deja în package.json)
`@capacitor/push-notifications`. Fluxul e în `src/lib/push.ts` (cere permisiune → `getToken` → `POST /api/push/device`). Serverul trimite automat FCM când se creează o notificare (`sendPushToUser` → `sendFcmToUser`).

### Test e2e
Login pe device → verifică rândul în tabela `device_tokens`. Declanșează o alertă (depășire viteză / expirare document) → banner FCM pe telefon + tap deep-link la vehicul.

---

## 5. Publicare în Google Play
1. `keytool -genkey -v -keystore ratracks.keystore -alias ratracks -keyalg RSA -keysize 2048 -validity 10000`
2. Configurează `signingConfigs.release` în `android/app/build.gradle`.
3. `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`
4. Google Play Console ($25 o singură dată) → creează app → încarcă AAB pe **Internal testing** → completează Data safety + politica de confidențialitate (reutilizează `../public/confidentialitate.html`).

---

## 6. iOS (faza 3 — necesită Mac)
```bash
npx cap add ios
# Firebase: adaugă app iOS + cheie APNs; capabilities Push + Background Modes (remote notifications)
npx cap open ios               # build/semnare în Xcode → TestFlight → App Store ($99/an)
```
Același cod, același `sendFcmToUser` (FCM rutează spre APNs).

---

## Structură
```
src/
  api/       client.ts (Bearer + 401), endpoints.ts (tipat), geocode.ts
  app/       store.ts (signals: auth, vehicles, polling 7s)
  lib/       status.ts (status vehicul), format.ts, storage.ts (token), push.ts (FCM)
  components/ TabBar, Icon (SVG), VehicleCard, VehicleMap, MiniMap, Donut
  screens/   Login, Vehicles, VehicleDetail, Stats, Notifications, RouteScreen, ReportScreen
  theme/     tokens.css (din public/css/app.css), global.css
```

## Backend (deja adăugat în server.js / db.js)
- `POST /api/mobile/login` → emite token (cheie API care moștenește rolul + accesul).
- `POST /api/push/device` + `/api/push/device/unregister` → înregistrare token FCM.
- Tabel `device_tokens`; `sendFcmToUser` cuplat în `sendPushToUser`.
- Toate celelalte endpoint-uri merg cu `Authorization: Bearer <token>` (middleware `apiKeyAuth` e global).
