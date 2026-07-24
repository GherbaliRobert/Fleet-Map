# CLAUDE.md — Convenții proiect RA Tracks

Note pentru sesiunile viitoare. De respectat la **orice** modificare.

## Font / Tipografie (OBLIGATORIU)

**Fontul standard, peste tot, este `Nunito`** — în aplicație ȘI pe paginile publice. Orice modificare de UI se face sub acest font; nu introduce alt font pentru text.

- **Încărcare:** din Google Fonts (`Nunito:wght@400;500;600;700;800`), inclus în `<head>`-ul fiecărei pagini: `public/index.html`, `landing.html`, `termeni.html`, `confidentialitate.html`, `set-password.html`.
- **Aplicare globală (app):** în `public/css/app.css`, pe `body`:
  `font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- **Controale de formular:** `button, input, select, textarea { font-family: inherit; }`.
- **Valori tehnice (IMEI, coordonate, coduri `io_`):** au fost monospace — acum sunt pe Nunito (`font-family: inherit`). NU le pune înapoi pe monospace.
- **Logo „Tracks":** `.ralogo .raw` (app + landing) folosește Nunito.

### Reguli pentru cod/UI nou
- NU reintroduce `Inter`, `monospace` sau alt font pentru text — lasă elementele să moștenească din `body`.
- Greutăți disponibile: **400, 500, 600, 700, 800**.

### Singura excepție
- **Iconuri: Font Awesome 6.5.1.** Sunt *glife de iconuri*, nu font de text — rămân pe Font Awesome (dacă le schimbi fontul, iconițele dispar).
- (Panoul de debug pentru dezvoltatori rămâne monospace — nu e UI pentru clienți.)

## Export rapoarte (Excel & PDF) — branding (OBLIGATORIU)

**Orice raport descărcat (Excel sau PDF), de ORICE tip, poartă numele brandat și logo-ul RA Tracks.** Regula e centralizată și se aplică automat la toate cele ~25 de rapoarte din catalog — nu o ocoli și nu o duplica per raport.

- **Numele fișierului:** `RA-Tracks - Raport {Nume raport} - {data generării}`
  (ex. `RA-Tracks - Raport Traseu - 06.07.2026.xlsx` / `.pdf`). „Numele raportului" = `label`-ul din catalogul din `reports.js`. Setat **într-un singur loc**: `report_export.js` → `sendReport()`.
- **Logo în Excel:** imaginea reală pe **rândul 1 al FIECĂREI foi** (Sumar + fiecare vehicul); titlul/perioada/tabelul coboară dedesubt. Vezi `xlLogoId` / `xlPlaceLogo` / `xlWriteTable` + `toXlsx` / `toXlsxMultiSheet`.
- **Logo în PDF:** aceeași imagine reală, înglobată în antet cu `doc.image()` (NU redesenată cu forme/text). Vezi `renderPdf`.
- **Fișier de logo pentru fundal ALB = `public/logo-light.png`** (varianta ÎNCHISĂ). ⚠️ Capcană de denumire: `logo.png` e varianta **ALBĂ** (pentru fundal închis, ca în app) — pe alb devine invizibilă („arată pe alb"). Pentru orice export pe fundal alb folosește `logo-light.png`.
- Ambele descărcări (raport live ȘI Istoric rapoarte) trec prin același `sendReport` → o singură modificare acoperă tot. NU adăuga căi paralele de export care sar peste el.
- Excepție: exportul CSV brut de traseu GPS (`traseu_<imei>.csv` din `server.js`) nu e un „raport" și nu intră sub regula asta.

## Cache / deploy (context util)
- CSS-ul aplicației e în `public/css/app.css` (servit `NO_CACHE` printr-o rută dedicată în `server.js`).
- Service worker-ul (`public/sw.js`) e **network-first** pentru HTML și CSS; la schimbări mari de assets, bumpează `CACHE` (`ratracks-vNN`).
- Verificarea versiunii LIVE: `ratrack.ro/api/health` → câmpul `version` = prefixul commit-ului deployat.

## Compania DEMO (⚠️ DE ȘTERS ÎNAINTE DE LANSARE)
Aplicația seedează la pornire o **companie demo** built-in — „RA Track Demo", 5 vehicule **sintetice** (DEMO-1..5: Timișoara, București, Iași, Brașov, Cluj-Napoca) + cont `demo` (viewer) + simulator de poziții. Vezi `server.js` (blocul „DEMO mode", gated pe `process.env.DEMO_DISABLED !== 'true'`) + `demo-sim.js` (`DEMO_IMEIS`, `ROUTES`).

- **Sunt ascunse de flota REALĂ peste tot** prin `DEMO_SET` (= `demoSim.DEMO_IMEIS`) + `demoCompanyId`: `canAccessImei` (hartă live, dispecerizare, insight/analitice, dashboards), `resolveReportImeis` (rapoarte live) și ramura super-admin din `report_schedules.js` (rapoarte programate). Regula: `if (req.companyId !== demoCompanyId) ... filtrează !DEMO_SET.has(imei)`. La orice cale NOUĂ care listează vehicule/poziții pentru flota reală, exclude demo la fel.
- **NU apar în niciun raport** (live sau programat). Dacă adaugi o cale de raport/analiză nouă, mirror-uiește excluderea demo.
- **DE FĂCUT înainte de lansare: ștergerea FIZICĂ.** Comutatorul `DEMO_DISABLED=true` (variabilă de mediu în Railway) face acum, la boot, **ștergere definitivă** din DB: vehiculele demo (`deleteDeviceCompletely` per imei — cascadă sigură), contul `demo`, compania demo (slug `demo`). Idempotent, scoped pe imei-uri sintetice (nu atinge vehicule reale). Alternativă discutată: ștergere automată necondiționată (fără variabilă) — de decis la momentul lansării.
