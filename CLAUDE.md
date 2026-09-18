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

### Capcană: iconița colorată cu fundalul ei (verde pe verde)
O regulă de tipul `.ceva i { color: var(--accent) }`, scrisă pentru iconița din TITLUL unei secțiuni,
prinde și iconițele dinăuntrul **butoanelor** din acea secțiune. Pe un buton cu fundal `--accent`
(`.rax-btn.primary`) iconița iese verde pe verde: **există, ocupă loc, dar n-o vezi** — și textul pare
împins strâmb în buton. Așa a trăit „Client nou" din Companii (Alin, 17.09).

- Regula: într-un container de butoane, iconița ia culoarea butonului — `i { color: inherit }` — și
  doar apoi o cobori pe cele fără fundal (`.rax-btn:not(.primary) i { color: var(--text-muted) }`).
- Când adaugi o regulă de culoare pe `i` într-un container, verifică dacă acel container ține și
  butoane pline. Păzit punctual de `verify_companii.js`.

### Aceeași capcană, pe BUTON: text închis pe fundal închis
Regula globală de lizibilitate forțează pe orice `.btn-primary` textul închis `#06210F` — corect, e
gândit pentru fundal verde. Dar **verdele nu vine de la ea**: în ecranele de administrare îl dă
`.ra-camp .rax-btn.primary`, iar în restul aplicației e rescris de mână pe fiecare ecran
(`#atab-vehicles`, `#atab-drivers`, `#atab-groups`, `#atab-alerts`, `#atab-maintenance`,
`#atab-documente`, `.alr-foot`, `.mnt-foot`, `#atab-settings`, `.rol-nm-card` — vreo 12 copii).
Un buton care nu prinde niciuna rămâne cu `background:transparent` de la `.ra-camp .btn-sm` și cu
textul închis forțat: **contrast 1,0 pe tema întunecată** — butonul e acolo, se apasă, dar nu se vede.
Așa a trăit „Restaurează" din Dispozitive arhivate (Alin, 17.09).

- Butonul principal are DOUĂ scrieri: `.rax-btn.primary` (nouă) și `.btn-sm.btn-primary` (veche, încă
  folosită). Amândouă sunt acum în familia `.ra-camp`. Dacă adaugi un ecran, folosește-le de acolo —
  **NU scrie a 13-a copie** de fundal verde.
- Se prinde măsurând, nu privind: contrastul text/fundal, pe AMÂNDOUĂ temele.

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

## Compania DEMO (acces la CERERE, aprobat de super-admin)
Aplicația seedează la pornire o **companie demo** built-in — „RA Track Demo", 5 vehicule **sintetice** (DEMO-1..5: Timișoara, București, Iași, Brașov, Cluj-Napoca) + cont `demo` (viewer) + simulator de poziții. Vezi `server.js` (blocul „DEMO mode", gated pe `process.env.DEMO_DISABLED !== 'true'`) + `demo-sim.js` (`DEMO_IMEIS`, `ROUTES`).

- **Sunt ascunse de flota REALĂ peste tot** prin `DEMO_SET` (= `demoSim.DEMO_IMEIS`) + `demoCompanyId`: `canAccessImei` (hartă live, dispecerizare, insight/analitice, dashboards), `resolveReportImeis` (rapoarte live) și ramura super-admin din `report_schedules.js` (rapoarte programate). Regula: `if (req.companyId !== demoCompanyId) ... filtrează !DEMO_SET.has(imei)`. La orice cale NOUĂ care listează vehicule/poziții pentru flota reală, exclude demo la fel.
- **NU apar în niciun raport** (live sau programat). Dacă adaugi o cale de raport/analiză nouă, mirror-uiește excluderea demo.
### Accesul demo se ACORDĂ, nu se ia singur (decizie 2026-07-25)
Vizitatorul NU mai poate intra în demo de pe site. `POST /api/demo/login` a fost **retras** (răspunde 410) —
era login fără parolă, fără limitare de rată și fără regenerarea sesiunii.

- **Fluxul:** butonul „Cere cont demo" din landing → formularul din `#contact` (cu bifa „Vreau un cont demo")
  → `POST /api/public/demo-request` (public, dar cu limitare 3/oră/IP, capcană pentru roboți, timp minim de
  completare și o cerere/adresă/24h) → rând în `demo_requests` + notificare in-app către super-admini
  (**fără date personale în notificare** — PII stă doar în tabelă).
- **Aprobarea** (Administrare → Cereri demo, web + APK): super-adminul alege durata (3/7/14/30 zile) și se
  creează un **cont propriu** pe adresa solicitantului, în compania demo, rol `viewer`, cu ACL pe `DEMO_IMEIS`
  + link de setare a parolei pe email. Contul partajat `demo` rămâne doar ca deținător istoric al ACL-ului.
- **Expirarea** e per utilizator (`users.access_until`, epoch ms) și se verifică pe **toate** căile de
  autentificare: `/api/login`, `/api/mobile/login`, cheie API/token mobil, WebSocket, plus per-request în
  `refreshAuth` (sesiunea deschisă nu se invalidează singură — cookie 24h). Cutoff HARD: NU refolosi
  `companyAccessStatus`, care acordă 15 zile de grație.
- **Conturile demo nu pot trimite emailuri prin serverul nostru** (`_demoBlocked`): fără rapoarte programate
  și fără formularul de suport — altfel demo-ul devine releu de spam pe reputația domeniului.
- **`DEMO_DISABLED=true` NU mai șterge nimic.** De când demo-ul se acordă la cerere, compania demo e parte din
  produs (acolo trăiesc conturile temporare). Comutatorul oprește DOAR simulatorul de poziții. Ștergerea
  completă rămâne o operație deliberată, nu efectul unei variabile de mediu.

## Ofertare Live — DE CONTINUAT (customizare)
Secțiunea **Administrare → Business → Ofertare Live** e funcțională, dar **nu e terminată** — se va reveni
pentru personalizare. Ce există deja, ca să nu se refacă din greșeală:

- **Monedă dublă:** toate sumele apar în lei ȘI euro, la **cursul BNR** al zilei (`GET /api/fx` →
  `nbrfxrates.xml`, cache 12h, rezervă `EUR_RON_RATE`, implicit 5.0). Clientul are `window.raFx()`.
- **RA Insight** (fostul „Asistent AI") se vinde cu **pachet de apeluri**: 50/100/150/200/nelimitat.
  Alegerea pachetului completează automat prețul propus (`AIQ_PRICE` = 19/29/49/59 lei), calculat ca
  ~1,5× costul din scenariul negru → profit garantat chiar și la un client care pune numai apeluri grele.
  `AIQ_SUGGEST` = pragul minim sub care apare avertisment.
- **Costul real** e măsurat, nu presupus: `AIQ_COST_LEI` ≈ 0,04 lei/apel (bucla agentului CU prompt caching).
  Blocul arată „Ne costă / la uz intens / Profitul nostru / minim garantat / pe an".
- **Cei 6 agenți NU se facturează** (reguli fixe, zero tokeni). Scoși din calculator; `pAiAg` = 0.
  ⚠️ Au rămas în panoul de abonament per companie (`custom_plan.aiAgentsRON`) — decizie separată,
  ar schimba facturarea unor clienți existenți.

### Reguli de respectat aici
- **Numele/descrierile agenților au o SINGURĂ sursă: `AGP_META`** (expus ca `window.AGP_META`).
  Panoul Administrare le citește de acolo. NU rescrie liste paralele de `labels`/`descs` — exact așa
  apăruseră descrieri vechi, nesincronizate.
- Câmpurile numerice din ofertă sunt generate cu `fNum(id, val, ph, w, step)`; pentru valori zecimale
  (ex. €/apel) **trebuie dat `step`** — altfel browserul respinge valoarea (step implicit = 1).
- **RA Insight se vinde pe CONT (din 11.09), nu pe firmă.** Ce se setează pe companie (doar
  super-admin): `settings.ai_quota = { questionsPerSeat, seatPriceRON }`. Fondul lunii = *conturi
  aprinse × întrebări pe cont*; când se termină, SE OPREȘTE (nu există depășire contra cost — a fost
  scoasă deliberat, ca să nu vadă clientul prețuri pe întrebare). Vârful lunii se ține în
  `ai_quota.seatsPeak = { luna, n }` și e numărul care se facturează. Forma VECHE, `questions`
  (cotă fixă pe firmă), rămâne respectată pentru contractele deja semnate. Fără nimic = nelimitat.
  Locul de cont stă pe om: `users.ai_seat`, aprins de administratorul firmei din **Utilizatori**.

## RA Tracks NU funcționează pe planuri (regulă de fond)

**Nu există pachete de-a gata și nu vor exista.** Fiecare client primește o **ofertă** făcută pe ce
are el (câte vehicule, câte cu CAN, ce module), iar **contractul se face pe oferta acceptată**. Atât.

- Prețul unei firme vine DOAR din `companies.custom_plan` (oferta). **Fără ofertă → 0 lei**, iar
  firma se vede ca atare în registrul de clienți. Nu inventa un preț implicit.
- Modulele vin din `settings.features`, scrise de ofertă. Implicitul e FIX, nu dintr-un tabel:
  **agenții AI porniți** (sunt gratuiți, parte din produs), **restul oprite** (se vind).
- Coloana `companies.plan` a rămas în bază ca să nu pierdem date vechi, dar **nu o citește nimeni**.
- **Stripe a fost scos de tot** (plată cu cardul, abonamente, webhook, perioadă de probă). Se
  încasează prin transfer bancar, pe factură. Dacă vreodată vom vrea card, se face atunci — legat de
  ofertă, nu de planuri.
- **Cuvântul „plan" nu are ce căuta în interfață.** Singura excepție: „plan de service/mentenanță"
  al unui vehicul — altă noțiune, rămâne.
- Păzit de `verify_fara_planuri.js` (în `npm test`): dacă reapare un tabel de planuri, o valoare
  implicită luată din plan, Stripe, sau eticheta „Plan" pe ecran — proba pică.

## Parola nu există (regulă de fond)

**Nimeni nu scrie parola altcuiva.** Nici noi, nici administratorul firmei. Se deschide un cont pe o
adresă de email, pleacă un **link cu termen**, iar omul își pune singur parola. Atât.

- **Nicio casetă de parolă** în formularul de cont nou și nici în fișa omului. Un singur buton pe
  rând — **„Trimite link de parolă"** — acoperă și invitația care n-a ajuns, și parola uitată.
  (`POST /api/users/:id/link-parola`, limitat la 5/oră/cont, cu rând în audit.)
- Ruta prin care un admin seta parola altcuiva (`POST /api/users/:id/password`) a fost **ștearsă**,
  nu ascunsă din ecran. `POST /api/users` **ignoră** orice parolă primită în cerere.
- **Când emailul nu poate pleca** (fără SMTP, eroare de trimitere, cont demo), serverul întoarce
  **linkul** în răspuns (`{ invitat: false, link, motiv }`) și ecranul îl arată, copiat în clipboard.
  Contul nu mai rămâne blocat, iar parola tot omul și-o pune. NU reintroduce „scrie-i tu o parolă".
- Singurul loc din aplicație unde se naște o parolă e `POST /api/auth/set-password`. Acolo se apasă
  politica (`verificaParola`), **cu username-ul omului** — ca să poată refuza o parolă care-l conține.
- Excepții, amândouă la pornirea serverului, nu în interfață: contul de instalare `admin` și calea de
  avarie `ADMIN_PASSWORD`. Plus `POST /api/me/password` — omul își schimbă **propria** parolă.
- Probele își fac conturile pe **același traseu** (`test_parola.js` → `puneParola`). Nu adăuga o
  portiță „doar pentru teste": ar fi exact calea paralelă pe care o evităm.
- Păzit de `verify_utilizatori.js` (în `npm test`), inclusiv pe server pornit.

### Fiecare ecran, un singur rost (decizie Alin, 16.09)
- **Utilizatori, în privirea FONDATORULUI** = doar **conturi de platformă** (coleg nou la RA Tracks).
  Un singur rol în formular (`superadmin`), selectorul de companie mereu ascuns, antet „Adaugă
  utilizator (specific pentru colegi noi RA Tracks)". NU pune înapoi roluri de firmă client acolo.
- **Utilizatori, în privirea CLIENTULUI** = oamenii firmei lui, **inclusiv alți administratori**.
- **Companii → firma → fila Utilizatori** = doar **oglinda** (cine sunt administratorii activi) plus
  **trusa de reparat**: formularul de adăugare (`_raxCodAdminiHtml` + `raxCoAddAdmin`, pe ruta
  `POST /api/companies/:id/admin`) apare **NUMAI dacă firma are ZERO administratori activi** — cazul
  pe care nimeni din interior nu-l poate rezolva (s-a sărit pasul de admin la „Client nou"). Dacă
  firma are administratori, formularul nu se vede deloc: nu ne băgăm în gospodăria ei.
- Linkul de parolă se arată cu ACEEAȘI fereastră peste tot (`window._usrAratLinkul`). Nu scrie alta.

### Firma își face singură administratorii (decizie Alin, 16.09)
`COMPANY_ASSIGNABLE_ROLES = ['company_admin', 'manager', 'dispatcher', 'viewer']` — adminul unei firme
poate **crea ȘI promova** alt administrator, în firma lui, fără noi.

- **E delegare, nu escaladare:** un admin are deja tot ce se poate avea într-o firmă; față de un
  manager, diferența e doar `manageUsers` + `viewAudit`, pe care le are. Firma nu capătă nicio putere
  nouă — o dă mai departe.
- **Linia care contează rămâne închisă:** `superadmin` NU e în listă. Nimeni dintr-o firmă nu-și poate
  face cont de platformă. Firmă → platformă e altă ușă; ea rămâne doar a noastră.
- **`ROLURI_AJUSTABILE` NU se mai deduce din `COMPANY_ASSIGNABLE_ROLES`** (`['manager','dispatcher','viewer']`,
  scris explicit): dacă firma ar putea AJUSTA rolul de administrator, și-ar putea tăia singură dreptul
  de administrare și ar rămâne pe dinafară, fără cale de întoarcere.
- Plasa de la ultimul administrator devine și protecția firmei față de ea însăși.
- **„Client" a ieșit din toate formularele** — avea exact drepturile unui Viewer, iar serverul îl cobora
  tăcut acolo. Rolul rămâne în `ROLE_PERMISSIONS` pentru conturile vechi.

### Administratorul unei firme are UN singur nume: `company_admin`
A purtat două, după calea pe care era făcut (`company_admin` de la Companii → Client nou, `admin` de
la formularul din Utilizatori). Drepturile erau identice (`ROLE_PERMISSIONS`), dar în aceeași listă
apăreau două etichete pentru aceeași putere.

- **Se scrie `company_admin`.** `rolUnic()` preface `admin` → `company_admin` la creare ȘI la
  modificare, înainte de orice comparație (altfel telefonul, care trimite `admin`, ar părea că
  schimbă rolul și i-ar scoate omului rolul propriu).
- **`admin` rămâne ACCEPTAT la intrare** și rămâne în `ROLE_PERMISSIONS` — aplicația de telefon veche
  îl trimite încă. Nu-l scoate.
- **Rândurile vechi s-au mutat o dată**, la pornire (`UPDATE users SET role='company_admin' WHERE
  role='admin'`, în `db.js`). E sigur: rolul de admin NU e în `ROLURI_AJUSTABILE`, deci nu există
  roluri proprii clădite pe el.
- Pe ecran, **amândouă valorile scriu „Admin companie"** (`ROLE_LABELS` în web, `LIST_NAME` pe
  telefon) și poartă aceeași pastilă (`.role.admin, .role.company_admin`).
- Păzit de `verify_utilizatori.js`.

### Ultimul administrator al unei firme
Serverul refuză **ștergerea, dezactivarea, retrogradarea și mutarea** ultimului admin activ al unei
firme client (`_ultimulAdminAlFirmei`, inclusiv socotit pe LOT la mutarea în grup). Clientul nu putea
ajunge acolo oricum (nu se poate șterge/dezactiva pe el însuși) — **plasa e pentru fondator**.

### „Scoate din firmă", nu „Șterge" (decizie Alin, 16.09)
Butonul roșu de pe rândul omului se numește **„Scoate din firmă"** și **chiar șterge contul** — nu-l
dezactivează. Dacă omul revine, i se face cont nou. Fereastra o spune explicit, ca numele blând să nu
ascundă ce se întâmplă. Dezactivarea rămâne, în fișă (*Status cont*), pentru cazurile temporare.

- Înainte de a scoate, ecranul spune **ce avea omul** (`_usrCeAvea` / `_usrCeAveaText`): RA Insight și
  mașinile/grupele atribuite, **pe nume** (numere de înmatriculare, nu IMEI-uri; lista tăiată la opt),
  plus îndemnul de a le nota. Odată contul șters, legăturile lui se duc cu el.
- **NU există traseu de „înlocuire" și nu se reintroduce** (decizie Alin, 16.09, după ce unul a fost
  construit și scos în aceeași zi). Adminul scoate omul și pune drepturile pe cel nou **de mână** —
  de-aia contează ce scrie în fereastra de mai sus. Păzit de `verify_utilizatori.js`.
- **Nu adăuga o a doua cale de ștergere.** `deleteUser` a fost scos tocmai fiindcă sărea peste pasul
  de mai sus.
- **Ordinea contează la bani:** RA Insight se facturează pe vârful lunii, deci la o înlocuire se scoate
  ÎNTÂI omul care pleacă. Scrie pe butonul de aprindere a locului.
- **Schimbarea adresei pe un cont FOLOSIT** (`last_login` scris) cere confirmare: istoricul rămâne pe
  cont, iar adresa de autentificare (`users.username`) NU se schimbă din câmpul „Email".

### Ce e gospodăria clientului
Semnul „fără acces" (om cu rol restrâns, fără nicio mașină sau grupă atribuită) și îndemnul care-l
însoțește se aprind **DOAR în privirea clientului** (admin de firmă, sau fondator cu comutatorul pe
Partener). Fondatorul nu administrează împărțirea mașinilor pe oamenii unei firme — decizie Alin,
16.09. Ecranul e ACELAȘI nod în amândouă verticalele (`setImprumuta`), deci diferența se face în cod,
nu prin două ecrane.

## Aparatele GPS le înregistrăm NOI (decizie Alin, 16.09)

GPS-ul e marfa noastră, montată de instalatorii noștri, iar legătura aparat ↔ firmă e socoteala
noastră. Clientul își vede aparatele și seriile, dar nu le adaugă și nu umblă la ele.

- **Doar super-admin:** `POST /api/devices`, `POST /api/devices/import`,
  `PUT /api/devices/:imei/status` (arhivare/restaurare), `DELETE /api/devices/:imei`.
- **`gps_model` și `sim_number`** (model aparat + cartelă SIM) sunt date de ECHIPAMENT: se scriu doar
  de noi. Sunt aruncate din body pentru cine nu e super, pe AMÂNDOUĂ căile (`PUT /api/devices/:imei`
  și `PUT /api/devices/:imei/details`). În fișa vehiculului i se arată, dar `readOnly`.
- **Se scriu de la ÎNREGISTRARE, nu abia la editare** (Alin, 18.09): sunt în formularul „Adaugă
  dispozitiv" (`radd-gps`, `radd-sim`), le acceptă `POST /api/devices`, și au coloane proprii în
  importul CSV (`model_gps`, `cartela_sim` — NU `model`, care e modelul VEHICULULUI). Înainte se puteau
  pune doar editând fișa, deci orice aparat nou intra în „Inventar dispozitive" ca „fără model/SIM" și
  cerea imediat o a doua trecere. Regula „doar NOI" e apărată de ușă: ambele rute sunt `requireSuperadmin`.
- **Ce ține de VEHICUL îi rămâne** clientului: nume, număr, tip, șofer, grupă, senzori, program de
  lucru, calibrare rezervor. E flota lui.
- Butoanele „Adaugă vehicul", „Importă", „Șablon", „Arhivează" sunt `super-only` în ecranul lui — dar
  asta e doar al doilea strat; refuzul vine de la server.
- Păzit de `verify_dispozitive.js` (în `npm test`), inclusiv pe server pornit.

### Ecranul „Dispozitive": Stare ≠ Semnal, și totul stă pe firme
- **Stare** = ce am hotărât NOI (activ / neasignat / arhivat). **Semnal** = ce se întâmplă în teren.
  Sunt două coloane, nu una: un aparat poate fi „activ" și „fără semnal de 3 zile" în același timp.
- **Cuvintele și pragurile semnalului NU se scriu acolo:** `_raxDevSemnal` cheamă `agpsStare` din
  „Aparate GPS" (Setări → Evidență) — 30 min → tăcut, 24 h → fără semnal. Nu face a doua listă de praguri.
- Aparatele sunt **grupate pe firme** (`_raxDevGrupuri`): Neasignate sus, firmele alfabetic, Arhivate
  jos. Fiecare firmă are sumar („2 aparate · 1 de rezolvat") și buton **„Deschide firma"**.
- **Un grup cu ceva de rezolvat stă MEREU deschis**, oricâte firme ar fi. O problemă ascunsă după un
  rând închis e mai rea decât una scrisă urât.

### Ecranul „Dispozitive arhivate" (decizie Alin, 17.09)
Arhivarea = contract încheiat: se copiază întâi istoricul în `positions_archive`, apoi se marchează
`archived`, i se taie conexiunea, iese din allow-list și de pe harta live. Pozițiile unui aparat ACTIV
se țin 180 de zile (`POSITION_RETENTION_DAYS`); copia din arhivă se ține **2 ani**
(`ARCHIVE_RETENTION_DAYS`, implicit 730, purjare zilnică). Deci NU „2 ani de istoric", ci „ultimele
~6 luni, păstrate 2 ani" — scrie-o așa oriunde o explici.

- **Termenul se socotește pe SERVER** (`_arhivaTermen` → `purge_zile`, `purge_inceput` pe fiecare rând
  din `/api/archived-devices`). Ecranul doar arată cifra primită; NU-și face a doua regulă din zile.
  Pragul de avertizare (`ARH_PRAG_ZILE = 60`) și cuvintele stau într-un singur loc, în `_arhTermen`.
- **Butonul „Istoric"** trece prin `window._hpCerut` → `fillHistoryVehicle`, care cere lista CU
  arhivate (`?includeArchived=1`) **doar** pentru drumul ăsta și selectează vehiculul cerut. Arhivatele
  NU intră în selectoarele de zi cu zi. Nu scrie o a doua cale de umplut selectorul.
- Aparatele sunt **grupate pe firme** (`_arhGrupuri`, aceleași `.rax-devgr` ca la „Dispozitive"),
  „Fără firmă" la urmă; grup cu ceva de rezolvat = mereu deschis; există căutare.
- Cartonașul de pe „Acasă" **nu poartă `adash-warn` din construcție** — arhivat e un capăt normal, nu
  o problemă. Portocaliul se aprinde din `_adashArhiva`, doar când există istoric aproape de purjare.
- **Clientul NU vede aparatele arhivate** (decizie Alin, 18.09, la o întrebare pusă explicit). Ecranul
  stă doar în verticala noastră; arhivarea e decizia noastră, deci și evidența ei. Dacă un client are
  nevoie de datele unui camion scos din flotă, i le scoatem noi. NU adăuga o privire pentru client.
- Păzit de `verify_arhiva.js` (în `npm test`).

### Ecranul „Inventar dispozitive" (Gestiune) — registrul echipamentelor
Un rând = un aparat, peste toate firmele: firmă, mașină, IMEI, model, cartelă, semnal. E evidența
MĂRFII noastre. Fratele lui din verticala clientului e „Aparate GPS" (Setări → Evidență) — două
ecrane peste aceeași rută, publicuri diferite; e în regulă că sunt două, dar TREBUIE să vorbească la fel.

- **Semnalul vine tot din `agpsStare`**, ca la „Dispozitive". Ecranul avea praguri proprii (24 h / 7 zile)
  și se contrazicea cu „Aparate GPS" în 5 din 7 cazuri (Alin, 18.09). Nu-i scrie a treia listă.
- ⚠️ **Serverul are o a DOUA scriere a cuvintelor**, `_invSemnalText` — necesară, fiindcă fișierul
  exportat nu poate chema funcția din pagină. Cele două sunt **legate printr-o probă** care le rulează
  pe aceleași vechimi și cere același rezultat, cu pragurile citite DIN SURSĂ. Dacă muți un prag într-o
  parte, `verify_inventar.js` pică. Nu scrie pragurile în probă.
- **Scheletul (bară + cap de tabel + casete de căutare) se construiește O SINGURĂ dată** (`_invSchelet`,
  `host._invGata`); `_invRender` schimbă doar `#inv-corp` și contoarele. Înainte se redesena tot la
  fiecare literă și caseta își pierdea cursorul după PRIMA literă — din „Alfa" intra doar „A".
  Un mesaj pe tot ecranul (încărcare/eroare) pune `_invGata = false`.
- **Exportul trimite IMEI-urile de pe ecran, prin POST** (`raxInvExport` → `_inventarExport`), în ordinea
  de pe ecran. Filtrarea NU se rescrie pe server. GET-ul vechi (tot inventarul) rămâne.
- Păzit de `verify_inventar.js` (în `npm test`).

### Aparatele neasignate se adoptă ÎNTR-UN SINGUR loc (decizie Alin, 17.09)
Pe „Companii" a stat un al doilea ecran de adopție („Vehicule neasignate", cu `raxAssignDevice` /
`raxRejectDevice`), rămas de pe vremea când secțiunea se numea „Companii & Dispozitive". Apăsa
ACELAȘI buton pe server (`PUT /api/devices/:imei/company`), dar fără IMEI, semnal, ultima poziție sau
interfață CAN — deci hotărai cu mai puțin în față. **A fost șters, nu ascuns.**

- Adopția se face DOAR în „Dispozitive", grupul **Neasignate**: alegi firma în coloana *Companie*;
  „Respinge" arhivează. Banda de sus scrie pe ecran CUM, fiindcă adopția e o listă derulantă, nu un
  buton cu nume.
- Pe „Companii" a rămas **doar banda** (`_coBandaNeasignate`): spune câte aparate așteaptă și trimite
  în Dispozitive prin **`raxDevDeschideNeasignate()`**, care pune filtrul `unassigned` ÎNAINTE de a
  deschide secțiunea. `raxLoadUnassigned()` mai cere lista doar ca s-o NUMERE.
- Orice îndemn de tipul „adoptă-le întâi din…" duce prin aceeași funcție. NU scrie o a doua cale.
- Păzit de `verify_dispozitive.js` („într-un singur loc") + `verify_companii.js` (două cartonașe).

## Administrare: „Acasă" e tablou, nu loc de lucru (decizie Alin, 17.09)

- **Cartonașele de pe „Acasă" sunt SUMAR**: cifra + starea, plus un rând **„Vezi detalii →"**
  (`.adash-go`). Un clic (pe rând sau pe cartonaș) duce în **pagina** secțiunii — exact unde duce și
  meniul din stânga. `raxDashCard(name)` nu face altceva decât `raxAdminTab(name)`.
- **Toate patru arată la fel: conținut CENTRAT** (`align-items:center` + `text-align:center` pe
  `.adash-card`), iar `.adash-go` are **`margin-top:auto`** — se lipește de fundul cartonașului.
  Fără asta, cartonașele fără rând de stare (Dispozitive active, Arhivate) aveau „Vezi detalii" cu
  19px mai sus decât celelalte. NU-i pune înapoi un `margin-top` fix (Alin, 17.09).
- **O secțiune se deschide într-un SINGUR fel: pe tot ecranul.** NU reintroduce „deschide sub
  cartonașe" (fostul `subCarduri`, `#adash-bara`, `.adash-continua`, `.adash-card.deschis`). A doua
  cale înseamnă o stare de ținut minte — și de acolo a venit bug-ul cu „Dispozitive" rămas agățat sub
  cartonașe după „Acasă".
- Motivul de atunci („dacă te duce în pagină, cifrele dispar") **nu mai e valabil**: fiecare pagină are
  acum propriul sumar (pastile cu numere, venitul lunar, contorul de conturi RA Insight).
- **O SINGURĂ listă de secțiuni: `_RAX_TABURI`**, ascunsă/arătată prin `_raxAscundeTaburile(id)`.
  Erau trei, scrise de mână, iar a treia rămăsese fără `devices` și `inventar`. O secțiune nouă se
  adaugă într-un singur loc.
- **NUMELE secțiunii = numele rândului din meniu**, ținut tot într-un singur loc: **`_RAX_NUME`**.
  Titlul paginii (`#admin-title`) și eticheta „Vezi detalii în …" de pe cartonaș (`_raxDashEtichete`)
  se iau amândouă de acolo. Erau scrise separat și se desincronizaseră (Alin, 17.09): „Companii"
  deschidea o pagină numită „Companii & Dispozitive", „Dispozitive" una numită „Dispozitive
  (super-admin)" (jargon pe ecran), iar „Inventar dispozitive" lipsea din listă → pagina se numea
  „Administrare". NU scrie numele secțiunii de mână nicăieri altundeva.
- Păzit de `verify_acasa.js`, care compară `_RAX_NUME` cu etichetele rândurilor `goSistem('…')` din meniu.

### Verdele din meniu: UN singur loc, `window._navAprinde(el)`
Rândul aprins din bara din stânga trebuie să fie ecranul deschis, **oricum ai ajuns în el**.

- Toate căile trec prin `_navAprinde`: `navGo(btn, fn)` (clic pe rând), `_raxSideActive(name)` (secțiune
  de administrare, deci și cartonașele de pe „Acasă" și banda de neasignate) și `showView(name)`, care
  caută rândul după **`data-view`**. Nu scrie o a doua bucată care umblă la clasa `active`.
- **Un rând care nu e pe ecran NU se aprinde** (tăiat din rol → `display:none`, sau din cealaltă
  verticală → `.vert-ascuns`), iar atunci `_navAprinde` **nu stinge nimic**: mai bine rămâne aprins
  rândul de dinainte decât niciunul. Așa, deschizând „Utilizatori" din Setările clientului, rămâne
  aprins „Setări" — acolo chiar ești.
- În `#navrail` rândurile de administrare n-au `data-atab`: se recunosc după ce cheamă
  (`goSistem('<nume>')`, iar „Acasă" după `showView('administrare')`). Meniul vechi `#admin-side` e
  ascuns, dar mai e bifat în paralel — nu te baza pe el pentru nimic vizibil.
- **Orice rând nou din meniu trebuie ori să cheme `navGo(this, …)`, ori să poarte `data-view`.** Șase
  rânduri ale clientului (Localizare, Traseu, Rapoarte, Agenți AI, Hotspot, Setări) chemau direct
  `showView(...)` — la client verdele stătea înțepenit pe „Localizare". Păzit de `verify_acasa.js`.

## Jurnal de modificări cu etichetă (OBLIGATORIU la orice modificare)

Fondatorii (Robert + echipa) au **conturi de super-admin** și testează aplicația jucând ambele
roluri: uneori ca proprietari de platformă, alteori punându-se în locul clientului. Ca să nu se
amestece, **fiecare modificare se trece în `JURNAL-MODIFICARI.md`**, cu una din etichetele
`FONDATOR` / `CLIENT` / `AMÂNDOI` și cu cele trei rânduri: *ce am schimbat*, *ce vede fondatorul*,
*ce vede clientul*.

- Spune eticheta și **în răspunsul din conversație**, nu doar în fișier — o propoziție, la obiect.
- Când o modificare gândită pentru fondatori ajunge sub ochii clientului (sau invers), trece-o la
  **„De verificat înainte de lansare"**, la finalul jurnalului. Aia e lista pe care o parcurgem
  împreună înainte de lansare.
- Jurnalul e pentru ei, nu pentru mine: scris pe înțelesul tuturor, fără jargon. Numele de fișiere
  și commit-urile se pun ca reper, nu ca explicație.
