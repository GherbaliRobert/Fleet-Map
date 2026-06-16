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

## Cache / deploy (context util)
- CSS-ul aplicației e în `public/css/app.css` (servit `NO_CACHE` printr-o rută dedicată în `server.js`).
- Service worker-ul (`public/sw.js`) e **network-first** pentru HTML și CSS; la schimbări mari de assets, bumpează `CACHE` (`ratracks-vNN`).
- Verificarea versiunii LIVE: `ratrack.ro/api/health` → câmpul `version` = prefixul commit-ului deployat.
