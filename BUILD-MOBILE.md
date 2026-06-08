# Versiune mobilă (Android APK + iOS)

Aplicația este o aplicație web; pentru mobil ai 3 niveluri, de la simplu la „pe store".
**Toate au nevoie ca serverul să fie publicat pe HTTPS** (vezi `DEPLOY.md`) — aplicația de pe telefon
se conectează la el. (Pe HTTP simplu / LAN merge browsing-ul, dar nu instalarea PWA și nu push-ul.)

---

## 1) PWA — instalabilă pe telefon (merge ACUM, gratis)

Aplicația e deja PWA (manifest + icoane + service worker). După ce e pe HTTPS:

- **Android (Chrome):** deschizi site-ul → meniu ⋮ → **„Instalează aplicația"** (sau bannerul „Adaugă pe ecran"). Apare ca aplicație separată, fullscreen, cu notificări push.
- **iPhone (Safari):** deschizi site-ul → **Share** → **„Add to Home Screen"**. Pornește standalone, cu iconița noastră.

Asta e cea mai rapidă „versiune de mobil" — aceeași bază de cod, zero magazin, actualizări instant.

---

## 2) APK real (Android) — cel mai ușor: PWABuilder

Generează un `.apk`/`.aab` semnat, gata de Play Store, din PWA — fără cod nativ:

1. Mergi pe **https://www.pwabuilder.com** și introdu URL-ul HTTPS al aplicației.
2. Verifică scorul (manifest + service worker — le avem).
3. **Package For Stores → Android** → descarci pachetul (AAB pentru Play Store + APK de test).
4. Tot acolo poți genera și **pachetul iOS**.

PWABuilder generează automat toate dimensiunile de iconițe din `manifest.json`.

---

## 3) APK + iOS cu Capacitor (control nativ deplin)

Pentru funcții native avansate sau publicare manuală. Necesită **Android Studio** (APK) și, pentru iOS, **Mac + Xcode**.

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap init "GPS Unitip" ro.unitip.gps
```

Creează `capacitor.config.json` (încarcă direct serverul publicat — nu mai bundle-uim frontend-ul):
```json
{
  "appId": "ro.unitip.gps",
  "appName": "GPS Unitip",
  "webDir": "public",
  "server": { "url": "https://gps.firma.ro", "cleartext": false }
}
```

Apoi:
```bash
npx cap add android
npx cap add ios          # doar pe Mac
npx cap sync
npx cap open android     # build APK/AAB din Android Studio
npx cap open ios         # build IPA din Xcode (Mac)
```

> Pentru Web Push în wrapper-ul nativ, folosește pluginul `@capacitor/push-notifications` (FCM pe Android / APNs pe iOS). PWA-ul (varianta 1) folosește deja Web Push standard, fără plugin.

---

## Cont de developer (doar pentru publicare în magazine)
- **Google Play:** cont developer — 25 $ o singură dată.
- **Apple App Store:** Apple Developer — 99 $/an + un Mac pentru build.
- Pentru distribuție internă (fără magazin): APK-ul de la PWABuilder/Capacitor se poate **sideload-a** direct pe telefoanele firmei.

---

## Testare rapidă pe telefon (fără hosting)
Telefon pe același WiFi cu PC-ul: află IP-ul PC-ului (`ipconfig`) și deschizi `http://IP-PC:3000`.
Merge navigarea/hărțile; **instalarea PWA și push-ul cer HTTPS**, deci pentru experiența completă publică serverul (vezi `DEPLOY.md`).
