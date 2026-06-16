# CLAUDE.md — Convenții proiect RA Tracks

Note pentru sesiunile viitoare. De respectat la **orice** modificare.

## Font / Tipografie (OBLIGATORIU)

**Fontul standard al aplicației este `Nunito`.** Orice modificare de UI se face sub acest font — nu introduce alt font pentru text.

- **Încărcare:** în `public/index.html` `<head>`, din Google Fonts:
  `Nunito:wght@400;500;600;700;800`.
- **Aplicare globală:** în `public/css/app.css`, pe `body`:
  `font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- **Controale de formular:** `button, input, select, textarea { font-family: inherit; }`
  (altfel nu moștenesc fontul și rămân pe default-ul browserului).
- **Logo „Tracks":** `.ralogo .raw` folosește tot Nunito.

### Reguli pentru cod/UI nou
- NU reintroduce `Inter` sau alt font pentru text — lasă elementele să moștenească din `body`.
- Orice control de formular nou trebuie să moștenească fontul (regula de mai sus acoperă cazul general).
- Greutăți disponibile: **400, 500, 600, 700, 800**.

### Excepții (rămân neschimbate, NU le trece pe Nunito)
- **Monospace** pentru valori tehnice: IMEI, coordonate GPS, coduri `io_`, panou debug.
- **Iconuri:** Font Awesome 6.5.1.

### Pagini publice (separate de aplicație)
`landing.html`, `termeni.html`, `confidentialitate.html`, `set-password.html` au fontul lor și **NU** sunt pe Nunito (decât dacă se cere explicit).

## Cache / deploy (context util)
- CSS-ul aplicației e în `public/css/app.css` (servit `NO_CACHE` printr-o rută dedicată în `server.js`).
- Service worker-ul (`public/sw.js`) e **network-first** pentru HTML și CSS; la schimbări mari de assets, bumpează `CACHE` (`ratracks-vNN`).
- Verificarea versiunii LIVE: `ratrack.ro/api/health` → câmpul `version` = prefixul commit-ului deployat.
