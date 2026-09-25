# CLAUDE.md — Convenții proiect RA Tracks

Note pentru sesiunile viitoare. De respectat la **orice** modificare.

## Cum îi explici lui Alin (OBLIGATORIU)

Alin (25.09): *„când îmi expui ceva, fă structurat frumos, să înțeleg... să nu te întreb de câteva ori
același lucru. Memorează asta."* Și înainte: *„stai un pic că deja mă bagi în ceață. Hai s-o luăm pas
cu pas."*

- **Răspunsul întâi** (da / nu / cifra), explicația după. La o întrebare de da sau nu: da sau nu, plus
  cel mult o frază.
- **Structurat:** titluri scurte, pași numerotați, tabele pentru comparații. Un subiect pe rând — nu
  amesteca trei lucruri într-un răspuns.
- **Complet din prima**, ca să nu trebuiască să întrebe iar: ce se întâmplă, ce face el, unde apasă.
- **Pe limba lui:** fără jargon, fără nume de fișiere sau de funcții în explicații (ele stau în jurnal).
  Exemple cu cifre, în lei.
- **Când e de hotărât ceva:** opțiunile numerotate, cu recomandarea mea spusă direct, iar întrebările
  pentru el la final, numerotate, ca să poată răspunde „1: da, 2: 36 de luni".
- Când simte că se încurcă, **o luăm pas cu pas**: un pas, confirmarea lui, apoi următorul.

## De amintit lui Alin — la fiecare raport (OBLIGATORIU)

Alin (25.09): *„astea notează-le și să mi le reamintești."* Lista stă într-un singur loc: secțiunea
**„De amintit — ce așteaptă după voi"**, sus în `JURNAL-MODIFICARI.md`.

- **La finalul fiecărui răspuns care raportează o lucrare terminată**, citește secțiunea și amintește-i
  lui Alin, pe scurt (un rând pe punct), punctele **NEBIFATE**. Nu le repeta când răspunsul e doar o
  întrebare sau o lămurire scurtă.
- Când Alin spune că unul e făcut, **bifează-l acolo cu data**. Nu scoate și nu bifa nimic fără el.
- Ce găsești nou de felul ăsta (un lucru pe care doar ei îl pot face: un cont, o cheie, o hârtie, o
  decizie) intră în aceeași listă, cu data, și îi spui în răspuns că l-ai adăugat.

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

## Poarta de dinaintea livrării (`.github/workflows/ci.yml`) — să nu moară în tăcere

Pe GitHub, fiecare împingere trece prin patru pași, **în serie, cu oprire la primul eșec**: Lint →
Unit → `npm test` → Securitate (13 suite). Deci **o greșeală în primul pas oprește tot restul.**

- **Așa a stat roșie o săptămână** (36 de commit-uri, 15–22.09): `node --check billing.js`, după ce
  `billing.js` fusese șters odată cu Stripe. Cădea în 20 de secunde; nici `npm test`, nici probele
  de securitate n-au mai rulat în tot acest timp. Nimeni nu se uită la un ecuson care e mereu roșu.
- **`verify_poarta.js` păzește asta acum** și rulează PRIMA (și în `npm test`): fiecare fișier numit
  în `ci.yml` trebuie să existe și fiecare `require('./…')` dinăuntrul lor trebuie să ducă undeva.
  Când scoți un modul, **caută-i numele și în poartă** — nu doar în cod.
- **Fișierele generate se compară octet cu octet.** `tools/gen-can-icons.js` scria CRLF, depozitul
  ține LF: `--check` pica pe 167 de rânduri identice. Orice unealtă care generează un fișier din
  depozit scrie **LF**.
- **O probă care „crapă" poate raporta că a trecut.** `verify_notif_idor.js` scria „4/5 trecute" și
  părea aproape bună — de fapt murea ÎNAINTE de verificarea care conta. Numărul de verificări
  trecute nu spune nimic dacă suita n-a ajuns la capăt: **citește și codul de ieșire**.
- **O probă picată nu înseamnă cod stricat.** De trei ori aici, proba cerea regula VECHE: adminul
  firmei să-și înregistreze aparate (interzis din 16.09) și preavizul actelor de 7 zile (urcat de
  atunci la 30, `DOC_DAYS_LEAD`, ca telefonul să sune când se colorează lista). Întâi întreabă care
  e regula de azi; abia apoi decide cine greșește, codul sau proba. Iar când o rescrii, **rescrie-o
  pe regula nouă** — nu-i slăbi asertul ca să treacă.

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

- **Monedă dublă:** toate sumele apar în lei ȘI euro, la cursul dat de `GET /api/fx`. Clientul are
  `window.raFx()` → `{ eur, date, sursa }`.
- **RA Insight se vinde pe CONT**, iar prețul contului depinde DOAR de mărimea flotei — vezi
  „Cum se tarifează RA Insight" mai jos. (⚠ Paragraful vechi de aici descria pachete de apeluri cu
  `AIQ_PRICE` = 19/29/49/59 și `AIQ_SUGGEST`. **Nu mai există în cod** din 11.09, când s-a trecut pe
  cont; nota a rămas în urmă până pe 23.09.)
- **Cei 6 agenți NU se facturează** (reguli fixe, zero tokeni). Scoși din calculator; `pAiAg` = 0.
  ⚠️ Au rămas în panoul de abonament per companie (`custom_plan.aiAgentsRON`) — decizie separată,
  ar schimba facturarea unor clienți existenți.

### Cum se tarifează RA Insight (socotit cu Alin, 23.09)

**Prețul unui CONT depinde DOAR de câte mașini are firma**, în cinci trepte (`AIQ_PRET_LOC`).
Numărul de întrebări pe cont (`aiqN`) e un buton SEPARAT: **nu schimbă prețul**, schimbă doar cât ne
costă pe noi. Confuzia „50 de întrebări = 19 lei" e firească și greșită — 19 lei e treapta 26–50 de
mașini, oricâte întrebări ar avea contul.

**Pachetul vândut e 100 de întrebări pe cont** (era 50 până pe 23.09). Selectorul din ofertă
pornește pe 100; 150 și 200 rămân în listă, dar se dau negociat, cu ochii pe blocul de cost.

| Flota | Un cont |
|---|---|
| ≤ 10 | **14 lei** |
| 11–25 | **17 lei** |
| 26–50 | 19 lei |
| 51–100 | 25 lei |
| > 100 | 35 lei |

⚠ Primele două trepte au urcat pe 23.09 (12 → 14, 15 → 17) **odată cu** trecerea la 100 de
întrebări: dublarea fondului dubla și costul, iar la flotele mici treapta era deja stoarsă. Cele de
sus n-au avut nevoie. **Nu cobora treptele fără să refaci socoteala de mai jos.**

**Ce ne costă o întrebare:** `0,030 lei + 0,00028 × nVehicule` (`_aiqCost`) — măsurat în septembrie
pe aplicația pornită, cu Haiku 4.5 și prompt caching. Crește cu flota fiindcă fiecare mașină adaugă
~41 de tokeni la starea live, recitiți la fiecare rundă. **Scenariul negru** (`AIQ_GREU = 2,5`):
clientul pune numai întrebări care storc tot ȘI consumă fondul până la ultima.

**Ce rămâne dintr-un cont, pe lună, la 100 de întrebări, în scenariul negru:**

| Flota | Cont | rămâne | ieșim pe zero la |
|---|---|---|---|
| 10 | 14 lei | **5,80 lei** | 170 |
| 25 | 17 lei | **7,75 lei** | 183 |
| 26 | 19 lei | **9,68 lei** | 203 |
| 50 | 19 lei | **8,00 lei** | 172 |
| 100 | 25 lei | **10,50 lei** | 172 |
| 200 | 35 lei | **13,50 lei** | 162 |

- **Marja e cea mai bună imediat DUPĂ o treaptă, cea mai slabă imediat ÎNAINTE** (26 de mașini: 9,68
  lei; 25 de mașini: 7,75 — pentru o mașină în minus). Prețul urcă în trepte, costul crește lin.
  Punctele subțiri sunt fix **10, 25, 50 și 100** de mașini.
- **Minimul grilei e 5,80 lei, la 10 mașini.** ⚠ Când am propus treptele 14/17 i-am spus lui Alin că
  „nicio flotă nu coboară sub 7 lei" — **greșit**: pentru 7+ peste tot, prima treaptă ar trebui 16
  (atunci minimul e 7,75). S-a rămas pe 14/17, cu cifra adevărată scrisă aici. Pragul din
  `verify_tarife.js` (`PRAG_RAMANE = 5.5`) e cel pe care grila îl ține cu adevărat.
- ⚠ **Formula de cost e o dreaptă, dar măsurătoarea se aplatizează sus:** la 200 de mașini formula
  zice 0,086 lei, măsurat e 0,0521. Deci la flote mari suntem MAI în siguranță decât arată tabelul.
  Nu „corecta" formula ca să fie mai strânsă — marja de siguranță e deliberată.
- ⚠ **Fondul e COMUN pe firmă** (`conturi × aiqN`). Un om poate mânca partea colegilor, deci
  scenariul negru e mai ușor de atins la nivel de firmă decât pe cont. E argumentul pentru prudență.
- **Peste fond NU se vinde nimic.** Când fondul se termină, RA Insight se oprește până luna
  următoare. Serverul aruncă din setări comutatoarele vechi (`overage`, `overagePriceEur`,
  `extraAcceptedMonth`), iar un `acceptExtra` trimis de un ecran vechi e **ignorat** — păzit de
  `verify_paritate_telefon.js`, care insistă de trei ori și verifică să nu treacă nimic.

**Grila se editează din „Prețurile noastre" (23.09).** Fiecare treaptă din `AIQ_PRET_LOC` are
`implicit` (prețul din cod), `lei` (cel folosit acum) și `cheie` (`aiqPana10`, `aiqPana25`,
`aiqPana50`, `aiqPana100`, `aiqPeste100`), salvată în `tarife_lista`. `_aiqAplicaLista(t)` pune
lista peste grilă — chemată la încărcare și după AMBELE salvări. Treaptă golită, 0 sau text → înapoi
la `implicit`, **niciodată la 0** (ar da conturi pe gratis). Granițele (10/25/50/100) NU se editează.

- ⚠ **Rândul vechi „Un cont, pe lună" (`pAiA`) a fost un buton MORT**: grila îl călca pe tăcute
  (22 de lei salvați → oferta tot 14 propunea). A ieșit din `_PRET_GRUPURI` și din `TARIF_CHEI`.
  Nu-l pune la loc — prețul contului e grila, nu o cifră.
- ⚠ **`_OF_PRETURI_DEF.pAiA = 14` rămâne, dar ca PLASĂ, nu ca preț de listă.** Câmpul `of-pAiA` e
  umplut din grilă; dacă cineva îl golește, socoteala cade pe plasă. Am scos-o o dată și totalul a
  ieșit NaN. E legată printr-o probă de `AIQ_PRET_LOC[0].implicit`.
- **Ce vede clientul la fond epuizat:** „**oprit** până pe …" și „fără niciun cost în plus". NU
  „extra" — rămăsese de pe vremea când peste fond se plătea și suna a factură în plus.
- **„Un cont în plus aduce încă N"** se scrie DOAR pe regula pe cont (`questionsPerSeat > 0`), cu
  cifra firmei. Pe cota fixă veche un cont în plus nu aduce nimic; un `|| 50` de rezervă promitea
  asta pe web, pe server ȘI pe telefon. NU pune o cifră de rezervă în fraza asta.
- **Clienții deja semnați își păstrează regula** (de ex. 50 de întrebări, prețul vechi). Trecerea la
  100 și la 14/17 e pentru ofertele NOI. Se schimbă firmă cu firmă, din „Abonament & plăți".
- ⚠ **Telefonul** (`mobile/src/components/ChatScreen.tsx`) mai are interfața veche de plată peste
  fond. Nu se aprinde (serverul nu mai trimite `overage*` / `needsExtraConsent`), dar se curăță la
  următorul APK — e pe lista de dinainte de lansare.
- Păzit capăt la capăt de `verify_tarife.js` și `verify_ofertare.js`; cele de bani, pe server pornit.

### Pâlnia de oferte (21.09) — stările stau pe SERVER
O ofertă avea doar nume, client și o sumă. Acum are traseu: **ciornă → trimisă → acceptată/pierdută**.

- **Cuvintele nu se scriu în pagină.** `OFERTA_STARI`, `OFERTA_VALABIL_ZILE` și `OFERTA_MOTIVE_PIERDUT`
  stau în `server.js` și se cer prin `GET /api/admin/offers/meta`. Ecranul NU ține nici măcar o
  valoare „de rezervă" pentru termen (`valabilZile: null`) — ar fi fost a doua copie a regulii; dacă
  ruta nu răspunde, fereastra nu propune nicio dată și serverul pune termenul obișnuit.
- **„Expirată" NU e o stare din bază** — se socotește din `valid_until` la fiecare desenare
  (`_ofStare`). O stare scrisă s-ar învechi tăcut dacă nu trece nimeni pe la ecran o lună. Serverul
  refuză `status: 'expirata'`.
- **Datele le scrie serverul**, nu ecranul: `sent_at` la „trimisă", `decided_at` la „acceptată/pierdută".
  „Când a fost trimisă" e un fapt, nu o părere a browserului care a apăsat butonul.
- **„Pierdută" CERE un motiv** (server: 400 fără el), dintr-o listă FIXĂ — ca peste un an să putem
  NUMĂRA unde pierdem. Textul liber stă alături, pentru amănunte.
- **Butoanele de pe rând se aleg din stare**: o ciornă n-are „Pierdută" (n-ai pierdut ce n-ai trimis).
- Păzit de `verify_ofertare.js` (în `npm test`), inclusiv pe server pornit.

### Banii unei oferte: DOUĂ sume, nu una
`monthly_total` singur ascundea cel mai mare număr din afacere: lista scria „290 lei/lună" și tăcea
despre cele **7.000 de lei de la semnare** (montaj + aparate). Există acum `offers.once_total`, în lei,
scris la salvare din `montaj + hwTotal × cursul ÎNGHEȚAT în ofertă` (nu cel de azi).

- Ambele sume se arată **în lei ȘI euro**, ca tot restul secțiunii, la cursul din ofertă.
- Ofertele de dinainte de 21.09 n-au numărul: arată o **liniuță**, nu „0 lei". Se umple resalvându-le.
- ⚠ Capcană de limbă: `hwTotal` e în **EURO** (aparatele se cumpără în euro), `montaj` e în **LEI**.
  Nu le aduna fără curs.

### „Ce rămâne la noi" (21.09) — profitul nostru pe o ofertă
Calculatorul știa doar cât CEREM. Costurile NOASTRE stau în setările sistemului, sub
`costuri_noastre` (super-admin), cu chei care OGLINDESC prețurile de vânzare (`dFmc650`, `mGps`, …)
plus `cVehLuna` (cât ne costă lunar o mașină ținută în aer). Ecranul: blocul „Ce rămâne la noi" din
rezumatul ofertei + panoul `raxOfCosturi()`.

- **O cifră netrecută rămâne `null`, NU 0.** „Nu știm cât ne costă" și „ne costă zero" sunt două
  lucruri diferite; amestecate, un aparat fără preț ar arăta **profit 100%**. `_costuriGoale()` le
  pune pe toate `null`, iar un câmp golit în panou le readuce la `null`.
- **Blocul refuză să socotească** cât timp lipsește o cifră de care are nevoie pentru oferta ACEEA
  (`_ofCostLipsa`) — și spune pe nume ce lipsește. Mai bine nimic decât un număr inventat.
- **Nu ajunge NICIODATĂ pe hârtia clientului.** Trăiește doar în `#rax-of-summary`; PDF-ul se
  construiește din `raxOfExportPdf`, altă funcție. Păzit de probă, care generează PDF-ul și caută în
  el. Dacă adaugi ceva în bloc, nu-l chema din constructorul hârtiei.
- **RA Insight se scade din venitul lunar** înainte de socoteală: are deja blocul LUI, cu costul
  măsurat pe întrebare. Socotit și aici, l-am număra de două ori.
- Aparatele se socotesc la **cursul înghețat în ofertă**, nu la cel de azi.
- Păzit de `verify_ofertare.js`.

### Tarifele de listă se ȚIN MINTE (21.09)
`_OF_PRETURI_DEF` din pagină e doar **pornirea**. Tarifele noastre adevărate stau în setările
sistemului, sub `tarife_lista` (super-admin), și se scriu din butonul **„Salvează ca tarifele
noastre"**, în josul panoului „Tarife (editabile)".

- Înainte, o schimbare ținea până la „Ofertă nouă" sau până la reîncărcarea paginii. Dacă Teltonika
  scumpea, se umbla în cod.
- **O cheie netrecută rămâne `null` = „ia-o din cod", NU zero.** Un tarif uitat ar face altfel un
  abonament de 0 lei fără ca nimeni să bage de seamă.
- ⚠ **O salvare schimbă DOAR ce trimite** (`_tarifeCurate(b, existent)`, 23.09). Trimisă cu valoare
  → se scrie; trimisă goală → `null`; **netrimisă → rămâne cum era**. Până atunci fiecare salvare
  rescria toată lista, iar cele două căi (tabloul „Prețurile noastre" și butonul din cărți) trimit
  chei diferite: butonul din cărți ar fi șters grila RA Insight pe tăcute. Serverul citește lista
  existentă DIRECT din bază, nu din cache-ul de 15 s al lui `getSystemSettings()`.
- `_ofTarifeDeBaza()` = `_OF_PRETURI_DEF` + ce e salvat pe server. `raxOfReset` pornește de acolo.
  O ofertă **deschisă din listă** își păstrează prețurile ei negociate (`editingId != null`).
- Perechea „cât dăm / cât cerem" stă în același loc: `costuri_noastre` + `tarife_lista`.

### Ce se scrie SINGUR în calculatorul de ofertă
Trei texte pe care aplicația le poate afla singură și pe care omul le scria de mână (Alin, 21.09):

- **Numele ofertei** — „Ofertă {Client} · {data}", din `raxOfNumeAuto()`.
- **Fraza de valabilitate** din „Observații" — „Ofertă valabilă N zile de la trimitere."
- **Termenul de pe hârtie** (PDF) — aceeași cifră.

Toate trei trec prin `_ofPropuneText`, care **se oprește dacă a scris omul acolo** (`_ofAtinse`),
exact ca `_ofPropune` la cantități. Cifra N vine de la server (`_ofMeta.valabilZile`), una singură
pentru frază, pentru hârtie și pentru pâlnia de oferte — era scrisă de mână și în PDF (`30 *
86400000`). **Dacă termenul nu s-a încărcat, hârtia NU inventează unul**: rândul lipsește.

### Sumele se scriu ROMÂNEȘTE, peste tot pe hârtie (21.09)
„2250.00 lei" și „1 € = 5.0000 lei" se citesc **greșit** în română: punctul e separator de MII, deci
„5.0000" arată a cinci mii (Alin, 21.09). Pe hârtia ofertei, orice sumă trece prin `_bani(n, moneda,
zecimale)` din `report_export.js` → `toLocaleString('ro-RO')`: **2.250,00 lei**, **1 € = 5,0785 lei**.

- **Nicio sumă prin `toFixed`** direct în text. Păzit de probă.
- Cursul se scrie cu **4 zecimale** (cum îl publică BNR) și, dacă îl știm, cu **ziua** lui
  (`o.fxDate`). Fără dată știută, NU se inventează una.

### O singură convenție de monedă pe hârtie (21.09)
Abonamentul și montajul erau în lei cu o coloană „≈ EUR"; aparatele invers, euro cu „≈ lei". Două
convenții pe aceeași pagină — Alin: *„nu e profesional"*. Acum, în **toate** tabelele: **lei sus,
euro dedesubt**, în aceeași celulă. Coloana „≈ EUR" nu mai există.

- `tabel(titlu, randuri, moneda)` — `moneda` spune doar **în ce vin cifrele** (device lines sunt în
  EUR), nu cum se afișează. Conversia se face înăuntru, o dată.

### Forma ofertei: cifrele întâi, explicațiile la final (21.09)
Alin: *„«La semnarea contractului o singură dată» și «apoi în fiecare lună» nu sună deloc
profesional. Trebuie împărțită cât mai simplu: cât îl costă pe lună și cât îl costă o dată."*

Ordinea hârtiei, de sus în jos:
1. **Două casete**: „Cost lunar" și „Cost unic, o singură dată" — cifrele mari, nimic altceva.
2. Un rând cu totalul pe durata contractului.
3. **Detalierea**: Abonament lunar → Echipamente → Instalare. Aceeași ordine ca anexele
   contractului (`contract_pdf.js`: marfa înaintea manoperei) — documentele noastre nu se contrazic.
4. **La final, ca note**: „Ce include abonamentul lunar" și „Condiții" (plată, proprietate, monedă).

NU muta explicațiile înaintea cifrelor. Păzit de `verify_tarife.js`, care verifică ORDINEA.

### Oferta se DESCARCĂ, nu se printează (21.09)
`raxOfExportPdf` deschidea o fereastră de printare din care omul salva singur un PDF. Alin: *„vreau
să fie la fel ca la rapoarte, să-ți alegi unde o descarci. Asta înseamnă descărcare."*

- Hârtia se face pe **SERVER**: `report_export.js` → `renderOfertaPdf` / `sendOfertaPdf`, lângă cea a
  rapoartelor. Acolo stau logo-ul (`logo-light.png`, pentru fundal alb), fonturile cu diacritice
  (DejaVu sub aliasul „Nunito") și `contentDisposition`. **NU scrie o a doua cale de export în
  pagină** — s-ar despărți de ele, exact ce spune regula rapoartelor.
- Numele urmează regula casei: `RA-Tracks - Ofertă {client} - {data}.pdf`.
- Ecranul trimite CIFRELE deja socotite (`POST /api/admin/offers/pdf`, super-admin) — nu se
  recalculează pe server. E un document, nu un rând în bază: **nu se salvează nimic** acolo.
- Termenul de valabilitate îl pune **serverul**, din `OFERTA_VALABIL_ZILE`, ca hârtia să nu poată
  spune alt termen decât ecranul. Fără el, rândul lipsește — nu se inventează o dată.
- Descărcarea în pagină e aceeași ca la Inventar: `blob` + `<a download>`, cu numele **citit din
  antetul răspunsului**, nu inventat local.

### Fiecare preț stă lângă lucrul pe care-l prețuiește (21.09)
**NU mai există panou de tarife.** Alin: *„să nu mai lucrez în cod, vreau să le editez când găsesc
aparate mai ieftine sau instalatori mai scumpi."* Toate cele 19 prețuri sunt câmpuri, în cartea lor:

| Preț | Cartea |
|---|---|
| lunar pe mașină (`pPlain`, `pCan`, `pFms`) | **2. Flota clientului** |
| păstrarea datelor (`ret24/36/Custom`; 12 luni sunt incluse, fără preț) | **3. Ce mai primește clientul** |
| un cont de RA Insight (`pAiA`) | **3.**, lângă comutator |
| montajul (`mGps`, `mLvCan`, …) | **4. Montajul**, prin `qp()`, lângă cantitate |
| aparatele (`dFmc130`, …) | **5. Aparatele**, prin `qp()`, lângă cantitate |

- Câmpurile s-au **MUTAT**, nu copiat. Două casete cu același `id` ar face `_ofReadPrices` să
  citească prima găsită. `var priceCard = ''` a rămas gol dinadins — nu-l umple la loc.
- Butonul „Salvează ca tarifele noastre" (`butonTarife()`, scris o dată) apare în fiecare carte și
  cheamă aceeași funcție: citește TOATE câmpurile de preț de pe ecran.
- Prețurile au `step` 0,01: cu pasul implicit (1), browserul refuză „12,50".
- Păzit de `verify_ofertare.js`, care verifică **poziția** fiecărui preț în fișier (între `var
  xCard = card(` și următoarea), nu doar existența lui.

### „Prețurile noastre" — un tablou, două coloane (21.09)
Prețul la locul lui e bun **când faci o ofertă**. Când îți **actualizezi lista de prețuri**, vrei
altceva: toate deodată, cu ce ne costă alături. `raxOfPreturi()` — buton în capul secțiunii.

- **`_PRET_GRUPURI` e singura listă**: un rând = `[cheia prețului CERUT, eticheta, cheia COSTULUI]`,
  cu `null` unde rândul n-are perechea. Numele din „nu pot socoti profitul până nu știu…"
  (`_ofCostLipsa`) se iau tot de acolo, prin `_costNume()` — nu există a doua hartă de etichete.
- **O singură apăsare salvează `tarife_lista` ȘI `costuri_noastre`.** Erau două ferestre despre bani.
- **Marja se socotește pe loc** (`raxOfPretMarja`), nu se ține minte nicăieri — e doar o privire
  asupra a două cifre pe care le ai deja în față. Unde costul lipsește, **nu se scrie nicio marjă**:
  aceeași regulă ca la blocul „Ce rămâne la noi" (un zero presupus ar arăta 100% profit).
- **Casetele au nume proprii** (`tp-…` / `tc-…`), NU `of-…`: altfel, cât timp fereastra e deschisă,
  ar exista două casete cu același `id` și `_ofReadPrices` ar citi-o pe prima găsită.
- **O ofertă deschisă din listă NU se rescrie** când salvezi lista (`editingId != null` → doar
  recalc). Prețurile ei sunt negociate cu clientul.
- Păzit de `verify_ofertare.js`.

### Cursul euro e AL NOSTRU, și rămâne (22.09)
Alin: *„lasă BNR, nu poți pune un alt curs care să rămână?"* Ba da. Cursul se scrie o dată, în
tabloul „Prețurile noastre", și ține până îl schimbăm.

- Trăiește în setările sistemului, sub `curs_eur` (+ `curs_eur_data`, ziua în care l-am pus, scrisă
  de SERVER la salvare — nu de ecran). Nu e tarif și nu e cost: are cheia lui, **nu** intră în
  `tarife_lista`. În `_PRET_GRUPURI` e rândul special `cursEur`, pus PRIMUL fiindcă mișcă toate
  celelalte cifre.
- **Ordinea în `/api/fx`:** cursul nostru → BNR → rezerva din cod (`EUR_RON_FALLBACK`). Răspunsul
  poartă `source` (`manual` / `BNR` / `fallback`) **și** `bnr`, cursul BNR alături, ca reper — să se
  vadă pe ecran dacă al nostru a rămas în urmă.
- **Numele „BNR" se scrie DOAR pe cifra BNR.** Pe ecran: „Cursul tău: …" / „Curs BNR: …"; pe hârtie,
  `report_export.js` pune numele BNR numai când `o.fxSursa === 'BNR'`, altfel „un curs de referință".
- O ofertă salvată își ÎNGHEAȚĂ cursul (`config.cfg.fxRate`). Lista și hârtia socotesc la el, nu la
  cel de azi.
- ⚠ În cutia de probe BNR e blocat de proxy — de-aia apare „5,0000" și avertismentul portocaliu.
  Pe ratrack.ro se ia cursul adevărat. Nu „repara" asta în cod.

### Butonul ✨ „Aplică RA Insight pe companie" — SCOS, nu ascuns (22.09)
Alin: *„nu își are rostul aici în ofertă."* Avea dreptate, și motivul e mai adânc: oferta se face
**înainte** ca firma să existe în aplicație, iar butonul îți cerea tocmai s-o alegi dintr-o listă de
firme. Peste asta, era de prisos: ce s-a vândut se aprinde **singur la semnare**.

- `_aplicaOfertaPeFirma` are acum **un singur apelant**: contractul făcut din ofertă. Păzit prin
  numărare (`verify_tarife.js`, `verify_ofertare.js`) — dacă apare al doilea, proba pică.
- Au plecat toate trei: butonul, fereastra (`raxOfApply`) și ruta
  (`POST /api/admin/offers/:id/apply-to-company`). Nu le reintroduce; cota se pune din fișa firmei,
  „Abonament & plăți" (`rax-aiq-n`).
- **Pastila „AI" de pe rând rămâne** — ea doar spune că oferta include RA Insight, nu face nimic.

### „Client nou din ofertă": ordinea contează (22.09)
`coNouDinOferta(offerId)` deschide fila Companii ȘI formularul. Ordinea NU e negociabilă:
`raxAdminTab('companies')` → `coNouStart(offerId)` → `raxCoNouToggle(true)` → `scrollIntoView`.

- `raxAdminTab('companies')` **închide** cutia „client nou" (pagina pornește strânsă, dinadins). Cât
  timp formularul se desena înainte — și dintr-un `setTimeout(…, 250)` ghicit — ajungea într-o cutie
  cu `display:none`: aplicația completa tot (CUI, denumire, email, durata, prețul) și nu vedea nimeni.
  Alin, 22.09: *„mă duce în companii, dar mai departe tot manual configurez."*
- Regula generală: **nu desena într-un nod pe care fila tocmai l-a ascuns.** Deschide-l după, și nu
  aștepta milisecunde — cutia e în HTML-ul paginii, e acolo imediat.
- Păzit de `verify_ofertare.js`.

### Logo-ul scrie „RA Tracks" — și se REFACE, nu se desenează de mână (21.09)
`public/logo.png` și `public/logo-light.png` aveau în ele **„RA | traks"** și ajungeau pe fiecare
raport, Excel, contract și ofertă. Acum se generează cu **`tools/make-logo.js`**: marca originală
(`logo-mark*.png`, desen — neatinsă) + cuvântul scris cu **Nunito ExtraBold**, fontul cu care
aplicația îl scrie în antet (`.ralogo .raw`).

- ⚠ **Dimensiunea rămâne 694×135.** `xlPlaceLogo` pune imaginea în Excel cu mărime FIXĂ (180×35 =
  același raport 5,14:1). Alt raport = logo turtit în fiecare Excel trimis unui client. Unealta
  caută singură mărimea literelor ca să intre exact în lățimea rămasă.
- `tools/make-logo.js` e unealtă de DEZVOLTARE (are nevoie de Playwright, care nu e dependință a
  proiectului). Rezultatul — cele două PNG-uri — intră în repo.
- `public/og-cover.png` se reface din logo, cu `tools/make-og-cover.js`. Dacă schimbi logo-ul,
  rulează-l și pe ăla.
- Păzit de `verify_ofertare.js` (cuvântul, fontul, dimensiunile).

### „Ce include abonamentul lunar" — o promisiune, nu o reclamă (23.09)
Alin: *„oare să mai adăugăm chestii? Reale bineînțeles."* Lista a trecut de la 8 la 16 rânduri
(`_ofIncluse` în `report_export.js`). Regulile ei:

- **Fiecare rând trebuie să existe în aplicație ASTĂZI.** E o promisiune într-un act semnat.
- **Cifrele se NUMĂRĂ, nu se scriu.** „Peste N rapoarte" iese din `require('./reports.js').REPORTS`,
  rotunjit în JOS la zece — rămâne adevărat dacă mai scoatem unul, se schimbă singur dacă trecem de
  40. Catalogul necitibil → **rândul lipsește**, nu apare o cifră inventată.
- **`N_ALERTE` e singura cifră scrisă de mână**, fiindcă `ALERT_TYPES` trăiește în pagină și serverul
  n-o poate cere. E LEGATĂ printr-o probă de lista adevărată: adaugi un tip de alertă și uiți hârtia
  → `verify_tarife.js` pică. NU schimba cifra fără să schimbi lista (sau invers).
- **Ce NU promitem, deliberat:** taxa de drum (TollRo — grila legală încă nu e în vigoare) și
  rapoartele CAN/senzori (reale, dar doar pentru mașinile care au CAN sau senzorul; locul lor e
  rândul condiționat de `cuDateMotor`). Păzit de probă.
- **Rândurile se ÎNCADREAZĂ, nu se taie.** Erau desenate cu `lineBreak: false, ellipsis: true` și un
  pas fix de 10pt — la prima frază mai lungă, clientul ar fi primit o promisiune retezată cu „…".
  Acum: pune fontul → `heightOfString` → `spatiu(h + 2)` → desenează → `y = doc.y + 2`, ca la
  CONDIȚII. ⚠ Fontul se pune **înainte** de măsurat, altfel locul cerut nu e locul ocupat.

### „Vezi hârtia": previzualizarea NU e a doua hârtie (22.09)
Butonul-ochi de pe rândul ofertei deschide oferta pe hârtie, fără s-o descarce și fără s-o încarce
în calculator. Regulile lui:

- **Aceeași cale, două capete.** `_ofHartie(r, previzualizare)` cere serverului exact fișierul care
  s-ar descărca; `_ofPayload(r)` compune cifrele într-un singur loc. În toată pagina există o
  SINGURĂ cerere `fetch('/api/admin/offers/pdf')` — păzit prin numărare. Altfel previzualizarea
  s-ar putea despărți de descărcare, exact cum s-au despărțit cândva căile de export.
- **`_ofCalc(cfgIn, pIn)`** socotește o ofertă SALVATĂ când primește argumente, ecranul când nu.
  Așa te uiți la o ofertă veche fără să-ți calci oferta în lucru. Un tarif lipsă dintr-o ofertă
  veche se ia din lista casei (`_ofTarifeDeBaza()`) — altfel iese `NaN` pe hârtie.
- ⚠ **CSP:** `frame-src 'self' blob:` e OBLIGATORIU. Fără el cadrele cad pe `default-src 'self'`,
  care nu cuprinde `blob:`, iar fereastra rămâne o cutie goală **în orice browser**. Nu-l scoate.
  `frame-ancestors 'none'` rămâne — noi tot nu putem fi încadrați de alții.
- Rămâne și plasa „deschide-o într-o filă nouă", pentru browserele fără cititor de PDF. E o ancoră
  obișnuită, nu `window.open`: regula „oferta se descarcă, nu se printează" stă în picioare.

### Numele fișierului descărcat: `_numeDinAntet(resp, implicit)` (22.09)
Antetul `content-disposition` poartă numele de DOUĂ ori: `filename="…"`, curățat de diacritice
pentru browserele vechi, și `filename*=UTF-8''…`, cel adevărat. Regula veche prindea prima
potrivire — deci fișierul se salva „RA-Tracks - **Oferta** …", nu „Ofertă".

- Se cere ÎNTÂI varianta UTF-8. Un singur cititor, folosit de Inventar ȘI de hârtia ofertei.
- Orice descărcare nouă îl folosește. NU scrie a treia expresie de citit antetul.

### Butoanele spun ce fac
„Trimite clientului (PDF)" **nu trimitea nimic nimănui** — deschidea o fereastră de printare, iar
clientul nici nu există încă în aplicație când faci oferta. Se numește „Descarcă oferta (PDF)".
Regula generală: un buton nu promite o acțiune pe care aplicația n-o face.

### Capcană: text rămas după o funcție scoasă
Butonul „Aplică RA Insight pe companie" a stat **rupt luni de zile**: scria „· peste cotă X €/apel",
rămășiță de pe vremea când depășirea cotei se plătea. Funcția a fost scoasă deliberat, variabila
(`priceEur`) a plecat cu ea, textul a rămas — și fereastra crăpa cu `priceEur is not defined`. Mergea
doar la ofertele „nelimitat", care sar peste ramura aia, **de-aia n-a sărit în ochi**.

- Când scoți o funcție, caută-i și **cuvintele**, nu doar codul.
- O ramură care se execută rar (`n > 0`) poate fi moartă fără ca nimeni să observe. Ecranele se
  probează cu AMÂNDOUĂ felurile de date, nu doar cu cel care iese la o apăsare.
- (Butonul a fost reparat pe 21.09 și **scos cu totul pe 22.09** — vezi mai sus. Lecția rămâne.)

### Capcană: un „+" rămas peste altul = `NaN` pe ecran
Rândul cu cursul, de sub rezumatul ofertei, a scris o zi întreagă **„NaN"**. Cauza: rândul de
dinainte se termina cu `+` ȘI bucata următoare începea cu `+` — adică `a + +('<div…>')`, plus **unar**
pe un șir. JavaScript nu se plânge; scrie „NaN" și merge mai departe.

- În pagină nu există rând care se termină cu `+` urmat de rând care începe cu `+`. Se caută forma,
  nu locul: `verify_ofertare.js` scanează TOT fișierul (fără comentarii).
- De reținut: o greșeală de concatenare nu crapă nimic. Nu se prinde din citit cod — se prinde
  uitându-te la ecranul desenat.

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

## Contracte — dosarul juridic (reguli din 23.09)

Ecranul **Contracte** (Business, între Ofertare și Companii) e **lista**; locul de lucru e fila
**Contract** din fișa firmei. NU scrie un al doilea editor de contract — fiecare rând duce în fișă.

### Drumul prețului: ofertă → contract → firmă → factură, fără retastare
- „Client nou din ofertă" trimite odată cu contractul **socoteala ofertei**, făcută în pagină cu
  ACEEAȘI funcție care a făcut oferta (`_coSocotealaOfertei` → `_ofCalc`, din ce s-a SALVAT):
  `unitati` (prețul unei mașini de fiecare fel, cu modulele) + rândurile lunare. Serverul NU refăce
  regulile ofertei — ar fi a doua scriere a lor.
- `_aplicaOfertaPeFirma(companyId, oferta, dinOferta)` — **un singur apelant** (contractul din ofertă):
  RA Insight + cota, și **prețul de facturare** (`custom_plan`), scris DOAR dacă firma n-are deja unul.
  Până pe 23.09 firma din ofertă avea 0 lei în „Abonament & plăți".
- Durata din ofertă stă în `cfg.contractMonths` (NU `cfg.contract`, care n-a existat niciodată).
- Oferta devenită contract trece singură pe **„acceptată"** (`decided_at` scris de server).

### Anexa nr. 1 are DOUĂ părți, amândouă semnate
`annex = { vehicles, vehiculeOferta, servicii, monthlyTotal, aiSeatPriceRON, aiQuestionsPerSeat }`
(`contracts.js` → `facAnexa`).
- `vehicles` = aparatele bifate; cât lista e goală, ține loc `vehiculeOferta` (câte mașini de fiecare fel).
- `servicii` = ce se plătește lunar fără să țină de o mașină: RA Insight, păstrarea datelor, agenții
  (incluși, 0 lei). Fiecare rând are `fel` (`ai` / `ret` / `agenti` / `plain` / `can` / `fms`).
- **Totalul se socotește din rânduri.** „Salvează anexa" trimite doar aparatele; serverul păstrează
  restul (`dinAnexaDePastrat`). Până pe 23.09 totalul cădea de la 271 la 193 de lei la prima bifare.
- `aiQuestionsPerSeat: 0` = **nelimitat** (ca pe firmă). NU pune `|| 50` de rezervă.
- Rândurile din ofertă se folosesc doar dacă se adună la suma acceptată (`_randuriLunareDinOferta`).

### Contractul SEMNAT se încuie (și actul adițional semnat)
- Drumul: nesemnat (în lucru ⇄ aprobat ⇄ trimis) → semnat → încheiat. **Semnat nu se mai întoarce**,
  **încheiat rămâne încheiat**, un nesemnat nu se „încheie" (se șterge). `_trecereContract` pe server.
- După semnare se mai poate schimba DOAR: data semnării, notițele, încheierea cu motivul ei
  (`_campuriSchimbateDupaSemnare`). Orice altceva → 400, „act adițional".
- Semnarea și încheierea se fac din butonul mare, care întreabă; lista „Unde e contractul" are doar
  pașii nesemnați. Fila arată un contract semnat **de citit**, fără formular.
- Acte adiționale DOAR la un contract `activ`. Un act semnat nu se rescrie și nu se șterge.
- Un singur contract deodată (409); după unul încheiat se face unul NOU (butonul e în fișă).
- Ștergerea unei ciorne dezleagă oferta și lucrările de montaj (`deleteContract`).

### Anexa nr. 2 (montaj + echipamente) și lucrările
- Lucrarea de montaj scrie în anexă DOAR cât contractul e nesemnat, din **toate** lucrările lui adunate
  (nu din ultima), și **păstrează echipamentele**. La un contract semnat nu atinge anexa.
- Prețul pentru client la o lucrare nouă se propune din anexă, apoi din tarifele casei (`_ofTarifeDeBaza`).

### Capătul contractului, reînnoirea, alarma
- Capătul adevărat = start + luni + **lunile din actele SEMNATE** (`luni_prelungite`, din bază) —
  `sfarsitContract`. La cele care se reînnoiesc singure, termenul CURENT (`sfarsitCurent`), iar
  preavizul arătat e mereu unul care se mai poate prinde (`ultimaZiDePreaviz`).
- **„Reînnoiește"** (`POST /api/contracts/:id/reinnoire`) face actul adițional de prelungire, ca
  ciornă, cu textul și datele puse de server. Capătul se mută abia când actul e SEMNAT. A doua
  apăsare cât unul e în lucru → 409. Contractul pe hârtie o spune singur: „continuarea … prin act adițional".
- **Alarma** din ecran (banda portocalie + filtrul „Expiră curând") folosește `deAnuntat` — aceeași
  regulă ca notificarea zilnică — NU starea dosarului („dosar incomplet" ascundea expirarea).
- Banda roșie: firme fără niciun contract + firme cu contract **încheiat** care încă intră în aplicație.
  „Fără contract" din Companii înseamnă același lucru (`_coEsteFaraContract`).

### Hârtia
- Numărul anexei GDPR (`nrGdpr`: 3 cu montaj, 2 fără) e folosit și în TEXTUL contractului (VI, VII).
- Fără cuvântul „plan"; numerele cu „de" prin `contracts.numar` („24 de luni", „100 de întrebări").
- „Vezi" / „Descarcă": `raxHartie(url, previzualizare, ce)` — o singură cerere, fereastra
  `_ofArataHartia`, numele din antet (`_numeDinAntet`). Antetul îl scrie `_antetDescarcare`
  (ASCII + `filename*` UTF-8). Numele: **„RA-Tracks - Contract {număr} - {firmă}.pdf"** (Alin, 24.09),
  ca rapoartele și ofertele; actul: „RA-Tracks - Act adițional …". Caracterele interzise (inclusiv
  „/" din numărul actului, „…/A1") se scot din TOT numele (`numeFisier`).
- ⚠ În cutia de probe Chromium salvează „download" în loc de un nume cu diacritice: cutia n-are
  limba UTF-8. Pornește browserul cu `LANG=C.UTF-8`. Nu e o problemă a aplicației.

### Contract ↔ factură
Fila Contract pune **pe bucăți** contractul lângă factura lunii, calculată cu `buildInvoiceLines`
(nu cu o copie): mașinile, RA Insight (se facturează după conturile folosite — deci nu se compară
totalul), și ce e în contract dar nu ajunge pe factură (`nefacturate`, ex. păstrarea datelor).

### Datele după încetare: 30 de zile, apoi se șterg (decizie Alin, 24.09)
Hârtia (Anexa GDPR, pct. 7) promite: la încetare, clientul are 30 de zile să ceară datele înapoi;
fără cerere, se șterg. Alin: *„exact așa facem"*. Aplicația le ținea 2 ani — acum face ce scrie.
- **Cifra stă într-un singur loc:** `ZILE_DATE_DUPA_INCETARE = 30` în `contracts.js`, citită de hârtie,
  de ștergerea automată și (prin server) de ecrane. NU o face variabilă de mediu: e promisiune semnată.
- Arhivarea unui aparat ESTE încetarea pentru el (`devices.archived_at`); detalii la „Dispozitive
  arhivate", mai jos. Legea (GDPR art. 28) cere ștergere/returnare; nicio lege nu ne obligă să păstrăm
  pozițiile GPS ale clientului (contractul și facturile NOASTRE: 10 ani, legea contabilității).
- La încheierea contractului, fila și fereastra de confirmare amintesc: arhivează aparatele firmei.

### Păstrarea istoricului: 12 luni pentru toți, 24/36 plătite (decizie Alin, 24.09)
Alin: *„12 luni pentru toți și păstrăm 24/36 de luni ca opțiune plătită."* Hotărât după ce am MĂSURAT pe
aplicația pornită (PostgreSQL + TimescaleDB, aparate virtuale Codec 8E): istoricul mai vechi de 7 zile iese
de 14–19 ori mai mic; 6 luni în plus costă ~7 bani/lună la un camion (~0,25 GB pe 12 luni), ~3 bani la o
mașină mică. Până pe 24.09 aplicația ținea 6 luni pentru toți, iar 24/36 se vindeau, se semnau și nu se
livrau, nici nu se facturau.

- **Regula stă în `contracts.js`:** `LUNI_ISTORIC_INCLUSE = 12`, `LUNI_ISTORIC_MAX = 60`,
  `pastrareFirma(settings)` (citește `settings.pastrare = { luni, pretRON }`), `curataPastrare(b)`.
  NU o face variabilă de mediu — e promisiune semnată.
- **`pastrareFirma` întoarce `null` pe setări stricate** → ștergerea SARE peste firmă. Nu o „coborî" la 12
  în caz de dubiu: o firmă care a plătit 36 de luni și-ar pierde istoricul fără cale de întoarcere.
- **Ștergerea (`stergeIstoriculVechi`, server.js, la 6 ore, rulează MEREU)** merge mașină cu mașină, după
  `imei` (coloana după care comprimă TimescaleDB — o ștergere după `company_id` ar desface tot istoricul
  comprimat al zilei). Poziții, curse, alerte. Pe loturi după TIMP, NU după `ctid` (pe hypertable `ctid` nu
  e unic între bucăți). La final, pe Timescale, `drop_chunks` pentru ce e mai vechi decât cea mai lungă
  păstrare din platformă. Rând în audit. De mână: `POST /api/admin/istoric/sterge-vechi`.
- **Politica TimescaleDB de ștergere se SCOATE la pornire** (`remove_retention_policy`) și NU se pune alta:
  ea știe o singură vârstă pentru toți (era 180 de zile) și ar tăia ce am promis. `add_retention_policy` cu
  `if_not_exists` n-ar fi schimbat una existentă. Dacă scoaterea eșuează → roșu în „Stare producție".
- **`POSITION_RETENTION_DAYS` e RETRASĂ** — nu se mai citește nicăieri. Setată → rând portocaliu în „Stare
  producție" până e ștearsă din Railway. NU o reintroduce.
- **Oferta:** pornește pe „12 luni (incluse)"; `ret6`/`ret12` au ieșit din tarife (12 sunt gratis). În pagină
  `_OF_LUNI_INCLUSE` / `_OF_LUNI_MAX` sunt scrise o dată și LEGATE printr-o probă de cele din contracts.js.
  Rândul `fel: 'ret'` poartă `luni`; „Client nou din ofertă" îl duce la server (`_pastrareDinOferta`), care îl
  scrie pe firmă (`_aplicaOfertaPeFirma`) și în anexă (`annex.pastrareLuni`, păstrat de `dinAnexaDePastrat`).
  O ofertă de 12 luni NU coboară o firmă care are mai mult.
- **Factura și registrul** adună același rând („Păstrarea istoricului — 24 de luni"), din aceeași regulă
  (`buildInvoiceLines` + `_venitLunar`). `verify_factura.js` le compară.
- **Coborârea se face doar de mână**, din „Abonament & plăți", cu confirmare pe față („se șterg date") și
  rând în audit de la cât la cât.
- **Hârtia:** contractul (VI + acordul GDPR, pct. 2) și oferta („Păstrarea istoricului: N luni de la
  înregistrare", mereu) spun cifra după care chiar se șterge. Anexa semnată bate setarea de azi a firmei.
- Păzit de `verify_pastrare.js` (în `npm test`, inclusiv pe server pornit cu `POSITION_RETENTION_DAYS=180`
  setată dinadins — istoricul de 7 luni trebuie să rămână).

### Jurnalul de audit: 12 luni (decizie Alin, 24.09)
*„Șterge-l la 12 luni dacă nu avem restricții legale."* Nu avem: nicio lege nu cere o durată pentru jurnalul
unei aplicații. Facturile și contractele (cu termene legale) stau în tabelele LOR și nu sunt atinse.
- Cifra: `LUNI_JURNAL_AUDIT = 12` în `contracts.js`, legată printr-o probă de pagina de confidențialitate.
- Ștergerea: `stergeAuditVechi` (zilnic; de mână `POST /api/admin/audit/sterge-vechi`), pe loturi după `id`,
  cu UN rând nou în audit care spune câte s-au șters. Păzit de `verify_pastrare.js`.

### Butonul fiecărei lipse, chiar pe rând (Contracte, 24.09)
Alin: *„buton de trimitere fix acolo unde lipsește."* În lista Contracte, pe fiecare rând:
- **Sub stare, pasul următor** (`_ctrePasHtml`): „Aprobă" → „Trimite la semnat" → „E semnat" (+ „Retrimite").
- **La „Dosar", fiecare lipsă cu butonul ei** (`_ctreLipsuriHtml`): CUI/sediu/reprezentant → „Completează"
  (fereastra `raxCtreCompleteaza`, cu ANAF); actul → „Încarcă semnat"; GDPR separat → „Încarcă acordul";
  data semnării → „Pune data". Regulile (ce lipsește) rămân pe server, în `stareDosar`.
- **„Trimite la semnat"** = `POST /api/contracts/:id/trimite`: email cu PDF-ul atașat — ACELAȘI `contractPdf`
  ca la „Descarcă" —, `replyTo` = emailul nostru din „Date emitent". Starea devine „trimis" + `sent_at` /
  `sent_to`, scrise de server DUPĂ ce emailul a plecat. Refuză: ciorna (aprobă întâi), golurile de pe hârtie
  (CUI, sediu, reprezentant — și deschide „Completează"), adresa stricată. Firma fără email îl primește pe
  cel la care s-a trimis.
- **Fără SMTP, butonul NU minte**: devine „Am trimis-o" (`trimite_pe_email` vine de la server în lista
  contractelor). Ruta răspunde 503 cu `faraEmail`.
- ⚠ **`PUT /api/companies/:id` (`updateCompany`) rescrie TOT rândul** — un câmp netrimis devine gol
  (telefon, IBAN). „Completează" are ruta lui, `PUT /api/companies/:id/dosar` → `completeazaDosarFirma`,
  care scrie DOAR ce primește. Orice formular nou care completează o parte din firmă o folosește pe ea.
- Păzit de `verify_lipsuri.js` (în `npm test`), cu un server de email FALS: emailul chiar pleacă, cu PDF.

### Drumul clientului (Alin, 24.09: „pare alambicat, trec din aia, ies în aia")
O linie de pași: **Oferta → Trimis la semnat → Semnat → Montajul → Aparatele la firmă → Prima factură**.
- **O singură regulă:** `contracts.drumulClientului({ contract, areOferta, montaje, aparate, facturi })` →
  `{ pasi: [{cheie, eticheta, stare, detaliu}], urmatorul, gata, din }`. Stări: `gata` / `acum` (primul
  nefăcut — ăsta are butonul) / `urmeaza` / `nu_e_cazul` (fără montaj vândut, fără ofertă). Încheiat → fără „acum".
- Numărătorile vin toate deodată din `db.drumDateToate` (aparate nearhivate, facturi care nu-s ciornă sau
  anulate, lucrări executate, oferta legată). Serverul le pune ca `drum` și în lista `/api/contracts`, și în
  fișa firmei (`_drumContract`) — ACEEAȘI socoteală. NU socoti drumul în pagină.
- Pe ecran: `_raxDrumHtml` sus pe fila Contract; `_ctrePasHtml` în listă (după semnare arată pasul drumului).
  Butoanele: `_drumButon` — montaj → `raxDrumMontaj` (deschide formularul lucrării), aparate →
  `raxDrumAparate` → `raxDevDeschideNeasignate()` (**adopția rămâne într-un singur loc**, decizia din 17.09 —
  NU pune a doua cale de adopție în fișă), factura → `raxOpenGenInvoice(companyId)`.
- Butoanele din fișă și din listă sunt ACELEAȘI funcții (`raxCtre…`); `_ctreGasit` găsește contractul și din
  fișă, iar `_ctreDupa` redesenează ce e deschis (fișa și/sau lista).
- Păzit de `verify_drum.js` (în `npm test`), care parcurge tot drumul pe server pornit.

### Montaj — secțiunea partenerilor (Business, 24.09)
Alin: *„secțiune de partener montaj, unde adăugăm parteneri, semnăm contracte fix la fel ca la clienți.
Logica din spate o va face Robert în interfața lor."* Rândul „Montaj" stă în meniu **imediat după
Companii**; containerul `admin-tab-montaj`, încărcat de `raxLoadMontaj`. Trei file (`MJ_FILE`):
Parteneri · Contracte cu partenerii · Lucrări.

- **Partenerii stau DOAR aici.** Au ieșit din ecranul Contracte (acolo sunt doar contractele clienților).
  `raxParteneriIncarca` a rămas ca nume vechi și cheamă `raxLoadMontaj`.
- **Fișa partenerului** (`montaj_parteneri`): CUI + ANAF, reg_com, address, legal_rep, email, phone, iban,
  bank, zona, tarife. ⚠ **`upsertPartenerMontaj` scrie DOAR cheile primite** (`undefined` = rămâne cum era):
  o salvare fără CUI îi ștergea CUI-ul, contactul și notițele. Ruta trimite `undefined` pentru ce n-a venit.
- **Contractul cu partenerul** (`montaj_contracte`, număr `RAT-M-AAAA-NNNN`): aceleași stări și aceeași
  regulă de trecere ca la clienți (`_trecereContract`), un singur contract nesfârșit pe partener (409),
  semnat = încuiat (`_MC_DUPA_SEMNARE`: doar data semnării, notițele, încheierea). Ciorna se șterge,
  semnatul se încheie. **Tarifele (Anexa nr. 1) se ÎNGHEAȚĂ la creare**, din fișa partenerului; „Reia
  tarifele de azi" (`tarife_din_partener`) merge doar cât e nesemnat. Lipsurile (`_lipsuriPartener`) și
  „Trimite la semnat" (email + PDF, refuză cu goluri pe hârtie, 503 `faraEmail` fără SMTP) urmează ACELAȘI
  model ca la clienți. Stările se scriu cu `_mjStare` („trimis la **partener**", nu „la client").
  `montaj_contracte` e în `BUSINESS_TABLES` (`backup.js`): ține fișierul SEMNAT, care nu se poate reface.
- **Partenerul cu contract semnat (activ / încheiat) NU se șterge** (409): se trece pe „inactiv" (`pt-activ`).
  `listContracteMontaj` face JOIN pe partener — fără el, contractul semnat ar dispărea din ecran. Contractele
  lui nesemnate pleacă odată cu el. Inactivul nu se mai propune la lucrări noi (rămâne pe cele vechi) și
  iese din banda „fără contract".
- **Hârtia** (`contract_pdf.js` → `scrieContractMontaj` / `contractMontajPdf`): „Contract de colaborare",
  partenerul = PRESTATOR, noi = BENEFICIAR (banii merg invers). Clauzele care contează: el ne facturează
  lunar, recepția = aparatul transmite, aparatele sunt ale noastre, garanție 12 luni, nesolicitarea
  clienților 12 luni, și **SUBÎMPUTERNICIT GDPR** (art. 28 alin. 4, Anexa nr. 2) — vede date ale
  clienților noștri. Nume: „RA-Tracks - Contract montaj {nr} - {partener}.pdf". Scris de noi, nu de un
  jurist: e pe lista de lansare.
- **Lucrările se EDITEAZĂ doar din fișa clientului** (fila Contract) — de acolo iau prețul pentru client și
  intră în Anexa nr. 2 a contractului lui. Fila „Lucrări" e privirea de sus (`GET /api/montaj/lucrari`,
  marja socotită pe server), cu buton „La client". NU pune un al doilea formular de lucrare aici.
- **Clientul nu vede nimic de aici.** Toate rutele `/api/montaj/*` sunt `requireSuperadmin`: cât ne cere
  partenerul e exact diferența din care trăim.
- **Contul partenerului în aplicație = Robert.** NU-l construi din proprie inițiativă. Când se face: vede
  DOAR lucrările lui — nu flota/pozițiile clientului, nu prețul pentru client, nu marja, nu alți parteneri.
- Păzit de `verify_montaj_sectiune.js` (în `npm test`), pe server pornit, cu server de email FALS.

### Aparatele ÎNCHIRIATE și stocul nostru (decizie Alin, 25.09)
Alin: *„dacă un client nu vrea să investească în echipamente și vrea doar să le închirieze"* + *„trebuie să
avem un stoc de echipamente"*. Hotărât: **24 de luni minim, 50% marjă, montajul la semnare, aparatele ne
revin, chiria pe rând separat, o singură alegere pe ofertă** (cumpără SAU închiriază, momentan).

- **Regulile stau în `contracts.js`:** `CHIRIE_LUNI_MIN = 24`, `CHIRIE_MARJA = 0.5`, `CHIRIE_ZILE_RETUR = 15`,
  `chirieLunara(costLei, luni)` = cost ÷ max(luni, 24) × 1,5, rotunjit la leu, niciodată sub cost ÷ luni
  (rotunjit în sus); fără cost → `null` (nu inventăm o chirie). NU le face variabile de mediu.
- **Pagina** socotește chiria pe loc cu `_ofChirieLunara`, cu cifrele venite din `/api/admin/offers/meta`
  (`_ofMeta.chirie`) — LEGATĂ printr-o probă de `chirieLunara` (54 de cazuri). Pagina NU scrie 24 / 50%.
  Cheile (`_OF_CHIRIE`: `chFmc130`… ↔ `d130`… ↔ `dFmc130`…) oglindesc `montaj.ECHIPAMENTE` (`chirie`).
- **În ofertă:** `cfg.echipMod = 'cumpara' | 'inchiriaza'`. La închiriere: `deviceLines = []`, `hwTotal = 0`
  (costul unic = doar montajul), iar chiria intră în `lines` cu `fel: 'chirie'` (deci în `monthly`, în
  anexă, pe hârtie). Chiria propusă din `costuri_noastre` (ne costă, în €) × curs; casetă atinsă = nu se
  rescrie. Aparat fără chirie → `chirieLipsa`, iar `raxOfSave` și `_ofHartie` refuză (`_ofChirieOk`). NU-l
  socoti la 0 lei. Durata urcă la minim.
- **Contractul din ofertă:** `_chirieDinOferta(oferta)` citește ce s-a SALVAT (cantitate, chiria negociată,
  valoarea = prețul de vânzare × cursul înghețat) — nu recalculează. Contract < 24 de luni → 400.
  `annex.chirie = { luniMin, aparate }` (păstrat de `dinAnexaDePastrat`); Anexa nr. 2 fără aparate vândute se
  numește „Montaj (costuri unice)". Clauzele stau în `scrieContract` (IV + VII + Anexa nr. 1), numai când
  `annex.chirie` există.
- **Pe firmă:** `settings.chirie = { randuri: [{ tip, nume, cant, pret }] }`, scris de `_aplicaOfertaPeFirma`
  DOAR dacă firma n-are deja una; citit cu `contracte.chirieFirma(settings)`. **Factura (`buildInvoiceLines`)
  și registrul (`_venitLunar`) adună același rând** — „Chirie echipament — {model}". Doar super-admin îl
  scrie (`_applyCompanySettingsPatch`, `allowFeatures`); în „Abonament & plăți" doar se vede.
- **Stocul (Gestiune → Stoc echipamente, `admin-tab-stoc`, `raxLoadStoc`):** tabela `stoc_echipamente`, un
  rând = o bucată (`stare` = unde e, `proprietar` = 'ra' / 'client', `istoric` adăugat la fiecare mutare).
  Regulile (treceri, sumar, alerte) stau în **`stoc.js`**, curate. Rutele `/api/stoc*` = `requireSuperadmin`;
  `/api/stoc/praguri` stă ÎNAINTEA `/api/stoc/:id`. Se șterge doar o bucată fără mutări; restul → „casat".
  În `BUSINESS_TABLES`. Căutarea redesenează doar `#stoc-tabel` (capcana de la Inventar).
- **Legătura automată `_stocLaFirma(imei, companyId)`:** chemată din TREI locuri — adopția din „Neasignate"
  (`PUT /api/devices/:imei/company`) și cele două căi din `POST /api/devices`. Aparatul din stoc trece pe
  „montat", al nostru dacă firma închiriază (`chirieFirma`), vândut dacă nu. Un IMEI necunoscut stocului nu
  se atinge, iar o eroare de stoc nu oprește înregistrarea.
- **Cartea „5. Aparatele": UN preț pe rând** (`devRand`, Alin 25.09: „mă induce în eroare, fă-o mai
  simplă"): prețul de vânzare (`.of-cump-f`) la „cumpără", chiria (`.of-chirie-f`) la „închiriază" —
  comutatorul ascunde una, arată cealaltă. Prețul de vânzare rămâne (ascuns) ca VALOARE a aparatului.
  Lângă chirie, `of-chcost-*`: „ne costă X €" sau linkul „trece cât ne costă" (fără cost, chiria nu se
  propune și caseta nu trebuie să tacă). NU pune la loc trei casete pe rând.
- **Demontarea (decizie Alin, 25.09):** la termen o facem NOI, fără cost; clientul care pleacă ÎNAINTE de
  durata minimă o plătește el, la tariful de dezinstalare din ofertă (`mUninstall` → `annex.chirie.
  tarifDemontare`, trimis și pe hârtia ofertei ca `tarifDemontare`), pe lângă chiria lunilor rămase.
  Scris în contract (VII) și în condițiile ofertei. Fără tarif știut, clauza spune regula, nu inventează o cifră.
- Păzit de `verify_stoc_chirie.js` (în `npm test`), inclusiv pe server pornit.

### Rămase la decizia lui Alin (NU le face din proprie inițiativă)
- (nimic deschis aici acum)
- Păzit de `verify_contracte.js` (inclusiv pe server pornit), `verify_montaj.js`, `verify_companii.js`,
  `verify_arhiva.js` (inclusiv pe server pornit).

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
- ⚠ **Factura citește NUMELE modelelor din `plans.js`** (`oferta` / `trepte` / `fix`). Pe 15.09 au
  fost redenumite (din direct / tiered / flat), factura a rămas pe cele vechi și 8 zile a pus pe
  factură DOAR mașinile fără CAN (221 de lei → 86). Nu s-a emis nicio factură între timp. Registrul
  și factura trebuie să dea aceeași sumă: păzit de `verify_factura.js`, care citește numele din
  plans.js și compară factura cu registrul pe 12 feluri de flote.

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

### Suportul se face azi intrând cu contul clientului — de rezolvat (Alin, 18.09)
Procesul de depanare hotărât: când un client spune că nu-i merge ceva, îi cerem **contul și parola** și
intrăm cu ele ca să vedem exact ce vede el. E decizia lui Alin și merge așa deocamdată, dar are două
costuri, notate ca să nu se uite:

- **Contrazice regula de mai sus** („nimeni nu scrie și nu află parola altcuiva"). Aplicația e
  construită ca parola să nu circule; procesul de suport o face să circule.
- **Strică urma din audit:** intrat cu contul lui, tot ce faci se scrie în jurnal **pe numele LUI**.
  O ștergere din greșeală apare ca fiind a clientului.

Calea curată, când se va face: o **intrare de suport pe cont propriu** — super-adminul deschide
sesiunea unei firme cu contul lui, cu rând în audit („X a intrat în suport la firma Y"), fără să afle
nicio parolă. NU o construi din proprie inițiativă; e trecută la „De verificat înainte de lansare".

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

### Fereastra „Companie" (`#rax-codetail-overlay`) — capcanele ei, măsurate
Se deschide din Companii (clic pe firmă), din „Deschide firma" (Dispozitive, Tahograf) — o singură
fereastră, șase file. Două lucruri din ea s-au reparat pe măsurători, nu din ochi (Alin, 18.09):

- **Înălțime fixă** (`height: min(82vh, 620px)`), cap și file `flex:0 0 auto`, corpul cu derularea lui.
  Înainte sărea de la 185px (Facturi) la 705px (Abonament) la fiecare clic pe filă.
- **Coloanele din „Detalii" NU se despart cu spațiu, ci cu PANOURI** (`.rax-cod-sect` are fundal,
  chenar, colțuri). Cât timp rândul a fost `display:flex; justify-content:space-between` cu valoarea
  `text-align:right`, valoarea coloanei stângi ajungea la **22px** de eticheta coloanei drepte —
  „Compania mea" și „IBAN" se citeau ca un singur rând — iar valorile porneau din **trei** locuri
  diferite (597 / 634 / 676px). Acum `.rax-kv` e **grilă cu eticheta de lățime fixă** (`104px`), deci
  toate valorile cad pe aceeași verticală. **Nu pune înapoi `space-between` / `text-align:right`.**
- **Butoanele filei stau pe FUNDUL ferestrei** (`margin-top:auto` în corpul făcut coloană). Se opreau
  unde se termina textul, cu 118px de alb sub ele, și fila părea neterminată.
- Regula generală de aici: **două coloane de text liber, una lângă alta, se ating.** Ori le dai panou,
  ori le dai o coloană de etichete de lățime fixă. Distanța dintre coloane (`gap`) nu e de ajuns —
  valoarea aliniată la dreapta mănâncă tot spațiul.
- **Capul ferestrei are o SINGURĂ margine laterală: 16px.** `.rax-head`, `.rax-cod-tabs` și `.rax-body`
  o poartă toate trei. Rândul de file n-avea `padding` deloc: „Detalii" pornea de la **1px** de chenar,
  cu titlul de deasupra și conținutul de dedesubt la 17px — trei margini diferite pe trei rânduri
  lipite unul de altul. Ce adaugi în capul ferestrei ia marginea de la ele.
- **O singură linie orizontală în cap**, sub file (`.rax-cod-tabs`). `.rax-head` și-o scoate pe a ei
  (`border-bottom: none`) — erau două linii una sub alta, cu butoanele strivite între ele și **zero**
  aer sub titlu. Aerul dintre titlu și file îl dă `padding`-ul de sus al filelor, nu o margine scrisă
  separat; `.rax-head` își pune `padding-bottom: 0` ca să nu se adune două.
- **Ce se repară aici se MĂSOARĂ.** De trei ori la rând ochiul lui Alin a prins ceva ce arăta reparat
  din cod: distanțele reale (margini, pas, coliziuni) se citesc din browser, pe amândouă temele, nu
  din citit CSS.
- Păzit de `verify_companii.js`.

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

### Ecranul „Dispozitive arhivate" (decizie Alin, 17.09; termenul schimbat pe 24.09)
Arhivarea = contract încheiat: se copiază întâi istoricul în `positions_archive`, apoi se marchează
`archived` (cu **ziua arhivării**, `devices.archived_at`), i se taie conexiunea, iese din allow-list și
de pe harta live. Pozițiile unui aparat ACTIV se țin cât scrie în contractul firmei (12 luni incluse, 24/36
plătite) — vezi „Păstrarea istoricului", mai jos.

- **Istoricul unui aparat arhivat se mai ține 30 de zile de la arhivare** (`ZILE_DATE_DUPA_INCETARE`,
  cum scrie în contract), apoi `stergeIstoricArhivate` (zilnic; de mână: `POST /api/admin/arhiva/sterge-istoric`)
  șterge TOT istoricul de localizare al aparatului: pozițiile **vii** (`positions`), copia din arhivă,
  cursele și alertele — cu rând în audit. Aparatul rămâne pe listă, cu `istoric_sters_at`.
  Până pe 24.09: arhiva se ținea 2 ani, ștearsă după vârsta pozițiilor, iar pozițiile vii nu se atingeau.
- ⚠ Ștergerea merge **pe loturi după timp, NU după `ctid`**: pe hypertable, `ctid` nu e unic între
  bucăți. Un aparat se marchează „șters" doar dacă au mers toate ștergerile; altfel se reîncearcă mâine.
- Restaurarea oprește ceasul (`archived_at = NULL`). Aparatele arhivate înainte de 24.09 au primit
  ziua de 24.09 — nimic nu s-a șters pe nepusă masă la prima pornire.
- În cele 30 de zile, dacă clientul cere datele înapoi: „Istoric" → Export CSV, sau un raport.
- **Termenul se socotește pe SERVER** (`_arhivaTermen` → `purge_zile`, `purge_la`, `istoric_sters` pe
  fiecare rând din `/api/archived-devices`). Ecranul doar arată ce primește; NU-și face a doua regulă
  din zile. Pragul de avertizare (`ARH_PRAG_ZILE = 7`, ultima săptămână) și cuvintele stau într-un
  singur loc, în `_arhTermen`.
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

## Tahograf: două ecrane, două privirii (decizie Alin, 18.09)

Fondatorul vedea **exact ecranul clientului** — același nod, mutat în panoul de administrare cu
`_raxMountBody('#rax-tacho-overlay', 'admin-tab-tahograf')` — hrănit cu datele TUTUROR firmelor și
fără coloană de firmă. Scria „Ion Popescu, termen depășit" și nu puteai spune al cui e.

- **Clientul** păstrează ecranul lui (`atab-tacho`): scadențar, pe șofer, abateri, încărcare fișiere.
  NU-l atinge — e bun și e gospodăria lui.
- **Fondatorul** are ecranul LUI, pe firme (`admin-tab-tahograf` → `raxLoadTahoFirme` →
  `GET /api/admin/tacho-overview`, super-admin): cine are modulul, cine e în urmă cu descărcările
  (adică riscă amendă), cine plătește și n-are ce descărca, cui i-au eșuat fișierele.
- **Regulile nu se scriu a doua oară.** Cine are card de tahograf (`licenseCats.needsTacho`), ce
  vehicul are tahograf (`tacho.vehiculAreTahograf`) și când e depășit termenul (`tacho.scadenta`) vin
  din aceleași funcții ca scadențarul clientului. Pragurile se citesc **pe firmă** (una precaută poate
  avea 21 în loc de 28), din setările ei, ca în ruta clientului.
- **Pe ecranul fondatorului NU se încarcă și NU se șterg fișiere.** Noi vedem că firma e în urmă, ea
  rezolvă. Singura acțiune pe rând e „Deschide firma". NU duplica nici comutatorul modulului — e în
  fișa firmei.
- `getTachoScadentar` întoarce `company_id` **și pentru vehicule** (lipsea; la gruparea pe firmă
  camioanele cădeau pe dinafară, iar firma apărea cu 0 vehicule).
- **Un CARTONAȘ pe firmă**, nu rând de tabel (aceleași `.rax-devgr` ca la „Dispozitive"), cu buton
  **„Afișează mai mult"** care deschide CINE anume e în urmă — nume, ce se descarcă (card / memorie),
  câte zile. Numele vin din ruta noastră (`probleme`, cei mai răi primii, tăiate la 12 cu
  `problemeTotal` alături). Ce e deschis se ține în `_thfDeschise`, ca redesenarea să nu închidă.
- **Cifrele de sus se socotesc în ECRAN, din firmele arătate** — urmează filtrul. Ruta NU mai trimite
  un `sumar`: ar fi fost două socoteli ale aceluiași lucru (una pe total, alta pe ce se vede).
  Când e filtrat, un rând sub cifre o spune; etichetele NU se acordă cu numărul („1 firme" arată prost).
- Păzit de `verify_tacho_fondator.js` (în `npm test`), inclusiv pe server pornit.

## e-Transport: două ecrane, două priviri (decizie Alin, 18.09)

Aceeași poveste ca la tahograf, dar mai gravă. Fondatorul primea ecranul CLIENTULUI, mutat cu
`_raxMountBody('#rax-et-overlay', 'admin-tab-etransport')`, hrănit cu transporturile TUTUROR firmelor
și fără coloană de firmă: scria „Ford Transit · UIT 3049…" și nu puteai spune al cui e. **Peste asta,
fiecare rând avea buton „Șterge", iar `ownsRow` întoarce `true` pentru super-admin** — se putea
șterge dovada de conformitate ANAF a unui client de pe un ecran unde nici nu vedeai al cui e.

- **Clientul** păstrează ecranul lui (`atab-etransport`): coduri UIT, termene, adaugă/șterge. E al lui.
- **Fondatorul** are ecranul LUI, pe firme (`admin-tab-etransport` → `raxLoadEtFirme` →
  `GET /api/admin/etransport-overview`, super-admin): cine are modulul, cine are coduri expirate sau
  camioane care nu mai transmit, cine plătește modulul și nu-l folosește, cine are mașini fără modul.
- **Pe ecranul fondatorului NU se adaugă și NU se șterge niciun transport.** Singura acțiune pe firmă
  e „Deschide firma". NU reintroduce formularul și nici butonul „Șterge".
- **Regulile nu se scriu a doua oară:** starea unui transport vine din `etr.stareTransport`, iar
  duratele legale (5 / 15 zile, 15 min de tăcere, 24 h „curând") se TRIMIT de la server, din
  `etransport.js`. Ecranul nu scrie nicio cifră de-a lui — nici măcar în textul explicativ de jos.
- **Un transport TREBUIE să aibă o firmă.** `POST /api/etransport` folosea `req.companyId`, care la
  super-admin e null: rândul se scria cu `company_id = NULL` și dispărea din amândouă ecranele (nu-l
  vedea nici clientul, care caută pe firmă, nici noi, care grupăm pe firmă). Acum firma se ia de pe
  vehiculul ales sau din `company_id`, iar fără niciuna cererea se REFUZĂ, nu se salvează orfan.
- **Tokenul ANAF e UNUL, al platformei** (`ANAF_ETRANSPORT_TOKEN`), nu al fiecărei firme. Deci starea
  raportării e informație de-a NOASTRĂ: banda stă sus în ecranul fondatorului. La client a rămas —
  altfel ar crede că e în regulă la ANAF fiindcă își vede camioanele transmițând — dar rescrisă în
  cuvintele lui („ne ocupăm noi de ea"), fără „lipsește tokenul", care suna a vina lui.
  ⚠ **De confirmat înainte de lansare:** declarația se depune pe CUI-ul CLIENTULUI, cu tokenul
  NOSTRU. Trebuie verificat dacă ANAF cere împuternicire în SPV per client. Fără ea, modulul e doar
  un registru intern. E în lista de dinainte de lansare.
- Păzit de `verify_etransport_fondator.js` (în `npm test`), inclusiv pe server pornit.

### Cuvintele care se acordă cu cifra: `_raxDe(n)`
„15 minute", dar „24 **de** ore". Cifrele vin de la server și se pot schimba, deci „de" se pune din
cod, nu scris de mână: `_raxDe(n)` întoarce ' ' sau ' de ' (regula: fără „de" când ultimele două
cifre sunt între 1 și 19). Tot din familia asta: `_raxNumar` și `_raxCand`, folosite de AMÂNDOUĂ
ecranele „pe firme" — stau în afara amândurora ca să nu se copieze a doua oară.

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
