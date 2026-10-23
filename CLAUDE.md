# CLAUDE.md — Convenții proiect RA Track

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
- **Raportul de la finalul unei etape: SCURT** (Alin, 08.10, după un raport lung: *„ți-am zis să-mi explici când e
  gata etapa B, ce ai făcut scurt"*). 5–7 rânduri: ce s-a schimbat și cum vede el asta pe ecran. Fără „cum am verificat",
  fără cifrele probelor, fără ce n-am făcut — stau în jurnal și le spun doar dacă le cere. Întrebările rămase, la final.
- **Pe limba lui:** fără jargon, fără nume de fișiere sau de funcții în explicații (ele stau în jurnal).
  Exemple cu cifre, în lei.
- **Când e de hotărât ceva:** opțiunile numerotate, cu recomandarea mea spusă direct, iar întrebările
  pentru el la final, numerotate, ca să poată răspunde „1: da, 2: 36 de luni".
- Când simte că se încurcă, **o luăm pas cu pas**: un pas, confirmarea lui, apoi următorul.
- **Ce găsesc nou pe drum, îl ÎNTREB** (Alin, 01.10: *„vreau ca acum să mă întrebi dacă trecem mai departe sau
  rezolvăm problema identificată"*): o problemă găsită în afara lucrului cerut NU se repară pe tăcute și NU se
  lasă deoparte pe tăcute. O spun pe scurt (ce se întâmplă, cu un exemplu în cifre) și întreb la final: **„o
  rezolvăm acum sau trecem mai departe?"**. El hotărăște de fiecare dată.

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

- **Încărcare:** din Google Fonts (`Nunito:wght@400;500;600;700;800`), inclus în `<head>`-ul fiecărei pagini: `public/index.html`, `set-password.html` și toate paginile site-ului public din `PAGINI_PUBLICE` (server.js) — prima pagină, cele trei pagini pe funcții, pachetele RA Insight, întrebările frecvente, Termeni, Confidențialitate; pe acestea îl cere `verify_site_public.js`.
- **Aplicare globală (app):** în `public/css/app.css`, pe `body`:
  `font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`
- **Controale de formular:** `button, input, select, textarea { font-family: inherit; }`.
- **Valori tehnice (IMEI, coordonate, coduri `io_`):** au fost monospace — acum sunt pe Nunito (`font-family: inherit`). NU le pune înapoi pe monospace.
- **Logo „Track":** `.ralogo .raw` (app + landing) folosește Nunito.
- **Sigla oficială = monograma „RA |" (imaginea `logo-mark.png` / `logo-mark-light.png`) + „Track" cu Nunito 800, PESTE TOT**
  (Robert, 09.10): aplicația, paginile publice, documentația API, telefonul (`mobile/public/` ține COPIILE exacte ale
  monogramelor — schimbi una în `public/`, o copiezi și acolo), emailul cu factura (`EMAIL_LOGO`, atașat cu `cid`),
  PDF-urile de prezentare (`docs_build/`, `docs_promo/`, `docs_manual/`; în pdfkit, `logo.png` / `logo-light.png`). NU scrie
  sigla cu litere („RA" verde + „Track") și nu desena alt semn. Păzit de `verify_ofertare.js` (5g).

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

**Orice raport descărcat (Excel sau PDF), de ORICE tip, poartă numele brandat și logo-ul RA Track.** Regula e centralizată și se aplică automat la toate cele ~25 de rapoarte din catalog — nu o ocoli și nu o duplica per raport.

- **Numele fișierului:** `RA-Track - Raport {Nume raport} - {data generării}`
  (ex. `RA-Track - Raport Traseu - 06.07.2026.xlsx` / `.pdf`). „Numele raportului" = `label`-ul din catalogul din `reports.js`. Setat **într-un singur loc**: `report_export.js` → `numeRaport(report)`, folosit de `sendReport()` (descărcarea) ȘI de raportul programat trimis pe email (`report_schedules.js`, atașamentul — până pe 14.10 pleca „utilization_2026-10-13.xlsx"). Păzit de `verify_mail.js`.
- **Logo în Excel:** imaginea reală pe **rândul 1 al FIECĂREI foi** (Sumar + fiecare vehicul); titlul/perioada/tabelul coboară dedesubt. Vezi `xlLogoId` / `xlPlaceLogo` / `xlWriteTable` + `toXlsx` / `toXlsxMultiSheet`.
- **Logo în PDF:** aceeași imagine reală, înglobată în antet cu `doc.image()` (NU redesenată cu forme/text). Vezi `renderPdf`.
- **Fișier de logo pentru fundal ALB = `public/logo-light.png`** (varianta ÎNCHISĂ). ⚠️ Capcană de denumire: `logo.png` e varianta **ALBĂ** (pentru fundal închis, ca în app) — pe alb devine invizibilă („arată pe alb"). Pentru orice export pe fundal alb folosește `logo-light.png`.
- Ambele descărcări (raport live ȘI Istoric rapoarte) trec prin același `sendReport` → o singură modificare acoperă tot. NU adăuga căi paralele de export care sar peste el.
- Excepție: exportul CSV brut de traseu GPS (`/api/export/:imei`, `traseu_<imei>.csv`) nu e un „raport" și nu intră sub
  regula asta — dar a rămas DOAR pentru integrările prin cheie API (e documentat acolo). Ecranul Traseu NU-l mai folosește.

### Traseul descărcat din ecranul Traseu (Alin, 01.10: „doar cifre, nimic de înțeles")
Web și telefon descarcă **Excel prin `sendReport`**: `GET /api/traseu/excel?imeis=…&from&to` → `reportExport.traseuVehicul`
(rândurile pe românește + sumarul) → `traseuCaRaport` (un vehicul: „Sumar" + „Poziții"; mai multe: „Sumar" + o foaie pe
vehicul) → `sendReport`. Numele: „RA-Track - Raport Traseu {nume · număr} - {zi}.xlsx". Aceleași drepturi ca traseul
(`canAccessImei` pe fiecare mașină, deci și demo-ul exclus).
- **Sumarul are O SINGURĂ socoteală: `_sumarTraseu`** (server.js), folosită de ecran (`/api/history/:imei?ext=1`) și de
  fișier — păzit prin numărare. Formele cifrelor (`hmTraseu`, `kmTraseu`, `durataDepasiri`) sunt legate de
  `hpRenderSummary` din pagină: proba le rulează pe aceleași cazuri.
- **Cel mult `TRASEU_MAX_POZITII` = 10.000 de poziții într-un fișier** (`traseuPreaMare`, report_export.js). MĂSURAT:
  ExcelJS face fișierul în memorie — 10.000 = ~3 s; 50.000 = 16 s și 1,5 GB, cu serverul blocat pentru toți. NU urca
  cifra fără să măsori. Varianta „în flux" a ExcelJS nu pune imagini pe foi, deci ar pierde logo-ul casei.
- Numele KML-ului: `_numeKmlTraseu` (pagină) = `numeKmlTraseu` (mobile/src/lib/export.ts), legate prin probă.
- **„Descarcă tot istoricul" (Dispozitive arhivate, Alin 02.10: „O facem acum")** = UN Excel cu TOT istoricul unei mașini
  (datele înapoi pentru clientul care pleacă; la Traseu, cu 10.000 de poziții pe fișier, un an ar fi fost ~50 de fișiere).
  `GET /api/devices/:imei/istoric-complet` (super-admin, `canAccessImei`) → `reportExport.istoricPeLuni` (pasul 1: câte
  poziții pe lună, citind doar orele, ca „Sumar" să stea primul) → `istoricCompletXlsx` (pasul 2: ExcelJS ÎN FLUX, o foaie
  pe lună pe ora României, rândurile scrise de ACEEAȘI `traseuRand`, fără „Pe hartă" — Excel nu primește peste 65.530 de
  linkuri într-o foaie). Citirea: `db.istoricOre` / `db.istoricPagina`, pe pagini după timp, cu cheia scrisă ca TEXT
  (microsecunde — o dată JS le-ar pierde și ar citi rânduri de două ori); poziții vii + arhivă fără dubluri.
  - **Logo-ul pe fiecare foaie e pus de mână** (`_xlFluxLogo`): varianta în flux nu știe imagini. Desenul = XML-ul pe care
    îl scrie Excel-ul obișnuit pentru `xlPlaceLogo`; anunțat în `[Content_Types].xml`; `<drawing>` după `<pageSetup>`.
    Atinge piese interne ale ExcelJS (`_openStream`, `_sheetRelsWriter`, `_writeLegacyData`) — versiunea e fixată în
    package-lock. Desenul se deschide DUPĂ foaie (altfel arhiva ar ține toată foaia în memorie). Păzit de probă (XML brut).
  - **Frâna** (`_asteaptaArhiva`): după fiecare pagină se așteaptă golirea țevii foii — ExcelJS nu ține seama de ea, iar un
    browser lent ar strânge altfel tot fișierul în memorie. MĂSURAT: un an (500.000 de poziții) ≈ 30 s, ~23 MB; cu un
    browser de 256 KB/s memoria rămâne sub 70 MB. Memoria care crește fără frână e gunoi strâns la nevoie, nu o scurgere.
  - **Câte UNUL deodată pe server** (`_istoricCompletAcum`): al doilea primește 429 cu „încearcă peste un minut". În jurnal
    (`export` / `device_history`, cu numărul mașinii) abia după ce a plecat tot fișierul.
  - **Pe telefon NU există** (un an de date e un fișier mare, peste timpul de așteptare al telefonului): banda „pe ducă" de
    pe telefon spune dinadins „de pe calculator". Păzit de `verify_arhiva_telefon.js`.
  - Păzit de `verify_traseu_export.js` (6c + 7b, inclusiv pe server pornit), `verify_arhiva.js` (butonul pe rând).
- **Linkul „Vezi pe hartă" (Google Maps, pe fiecare poziție) RĂMÂNE** (Alin, 02.10: „da, îl lași"). Avertizarea de la
  clic („link suspect") o dă programul în care se deschide fișierul (Excel, telefonul) pentru orice link dintr-un fișier
  venit de pe internet — nu linkul. NU-l scoate și nu-l „repara" ca s-o ocolești.
- ⚠ **Capcana „Limite reale":** `hpClearOsmOverlay()` golește și `hpLastData` (traseul pe care lucrează „Limite reale"
  și „Aliniază pe drumuri"). În `hpApplySelection` se curăță ÎNTÂI, apoi `hpLastData = solo.data`. Invers, butoanele
  spuneau „Încarcă întâi un traseu." cu traseul pe hartă (până pe 01.10).
- Păzit de `verify_traseu_export.js` (în `npm test`), inclusiv pe server pornit.

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
- **O iconiță nouă în `mobile/src/components/Icon.tsx` = `node tools/gen-can-icons.js`** (`can_icons.js` e copia ei pentru
  web, generată). Pe 21.10 iconița „share” („Distribuie locația”) a intrat fără regenerare: `npm test` trecea, dar pasul Unit
  de pe GitHub (`gen-can-icons.js --check`) a picat după unire. Înainte de livrare rulează și pasul Unit din `ci.yml`, nu doar `npm test`.
- **O probă care „crapă" poate raporta că a trecut.** `verify_notif_idor.js` scria „4/5 trecute" și
  părea aproape bună — de fapt murea ÎNAINTE de verificarea care conta. Numărul de verificări
  trecute nu spune nimic dacă suita n-a ajuns la capăt: **citește și codul de ieșire**.
- **Commit cu altă sesiune în același folder: doar bucățile tale, dar CU context.** Pe 12.10 `git apply --cached
  --unidiff-zero` (patch din `git diff -U0`) a lipit trei inserări pe linii greșite (rute în interiorul altei rute) —
  sintaxa trecea, probele treceau (rulau pe folder, nu pe commit), iar pe ratrack.ro rutele nu existau. Patch-ul se face
  cu `git diff -U3`, iar după commit `git diff` trebuie să arate DOAR bucățile celeilalte sesiuni, fără mutări.
- **O probă picată nu înseamnă cod stricat.** De trei ori aici, proba cerea regula VECHE: adminul
  firmei să-și înregistreze aparate (interzis din 16.09) și preavizul actelor de 7 zile (urcat de
  atunci la 30, `DOC_DAYS_LEAD`, ca telefonul să sune când se colorează lista). Întâi întreabă care
  e regula de azi; abia apoi decide cine greșește, codul sau proba. Iar când o rescrii, **rescrie-o
  pe regula nouă** — nu-i slăbi asertul ca să treacă.

## Emailul: o singură cale, `mailer.js` — Brevo pe HTTPS sau SMTP (Robert, 12.10)
Railway Hobby blochează SMTP, iar aplicația trimitea doar prin SMTP: nu pleca nimic (facturi, contracte, invitații).
- **`mailer.js` e SINGURA cale.** `BREVO_API_KEY` → API-ul Brevo (`fel() === 'brevo'`, câștigă); altfel `SMTP_HOST` +
  `SMTP_USER` (nodemailer). `channels.js` (invitații, linkuri de parolă, rapoarte programate, notificări) trimite prin el —
  NU-i pune înapoi un transport propriu. `sendEmailTo` aruncă dacă emailul n-a plecat (invitația arată atunci linkul).
- Expeditorul: `EMAIL_FROM`, apoi `SMTP_FROM`, apoi „RA Track <noreply@ratrack.ro>". La Brevo, pe un domeniu autentificat.
- Brevo **nu primește imagini cid**: sigla din emailul cu factura (`EMAIL_LOGO`, din `public/`) se cere de la `BASE_URL`.
  Textul simplu devine HTML cu linkurile apăsabile (`_htmlDinText`).
- „Stare producție", rândul `smtp`: „activ — Brevo/SMTP, de la …". Probele pot muta Brevo pe un server fals (`BREVO_API_URL`).
- Păzit de `verify_email_brevo.js` (în `npm test`), inclusiv pe server pornit.
- **Emailul care n-a plecat NU tace (22.10; Alin: „raportul… a funcționat, apoi nu a mai mers").** Cauza de atunci: Brevo
  „Authorised IPs" (pornit din oficiu) + Railway Hobby, care dă serverului altă adresă la fiecare publicare → Brevo 401
  „unrecognised IP address" pe ORICE email. `mailer.stare()` + `setLaRezultat` → `_dupaEmail` (server): ultima reușită / eroare
  în setarea `email_stare`, anunț `email_esuat` la super-admini (în aplicație + push, NICIODATĂ pe email, ≤ 1 la 6 h); „Stare
  producție" roșu cu `mailer.motiv` (ip / cheie / limită / rețea + ce e de făcut). Rapoartele programate: `report_schedules.stareDupa`
  (reîncercări după 30 / 60 / 120 de minute, prin `retrimite` — raportul păstrat în Istoric, NU refăcut), `textStare` (eroarea exactă
  doar la super-admin; clientul află că „echipa RA Track a fost anunțată"), coloanele `ultima_stare`, `ultima_eroare`,
  `email_reincercari`, `email_raport_id`. NU înghiți erorile de email într-un `catch (e) {}`. Păzit de `verify_email_stare.js`.

### Panoul Mail al fondatorilor (Robert, 12.10) — etapa 1: „Trimise" + „Scrie"
Business → **Mail** (după „Cereri demo" și, din 23.10, „Cereri de la clienți"; web `admin-tab-mail`, `raxLoadMail`, blocul între reperele „Panoul Mail";
telefon `screens/Mail.tsx`, `/admin/mail`). Doar super-admin (`requireSuperadmin` pe `/api/mail/*`).
- **Adresele nu se scriu de mână:** `_mailAdrese(req)` = adresa COMUNĂ (expeditorul aplicației, `EMAIL_FROM` —
  contact@ratrack.ro) + adresa fiecărui super-admin activ cu email pe același domeniu (robert.gherbali@, alin.tilvar@).
  Comuna o văd toți; adresa personală o vede și scrie de pe ea DOAR omul ei (Robert: „1 este ok"). Mesajul altuia = 404.
- **„Trimise" = doar emailurile NOASTRE:** `mailer.send({ …, jurnal: { fel, companyId, userId } })` → `mailer.setJurnal`
  → `db.noteazaMailTrimis` (tabela `mail_trimise`, în `BUSINESS_TABLES`; corpul tăiat la ~200 KB, atașamentele doar nume +
  mărime). Felurile: factura / proforma / neplata / contract / contract_montaj / invitatie / parola / formular / suport /
  mesaj (textele în `MAIL_FEL`). Rapoartele programate, alertele și confirmările de adrese ale unei firme NU au `jurnal`
  (nu ne uităm la ce face o companie). Un email nou al nostru = `jurnal` la trimitere; altfel nu apare.
- **„Scrie"** (`POST /api/mail/trimite`): de pe o adresă văzută, cel mult 20 de destinatari, 4 MB de atașamente (JSON are
  6 MB), 60 de emailuri pe oră de om; `replyTo` = adresa de pe care pleacă; rând în audit `mail_trimis` fără conținut.
  Numele care se vede la destinatar = `expeditor` din `_mailAdrese` (Robert, 14.10): pe adresa personală „Nume | RA Track"
  (din fișă; fără nume, „RA Track"), pe cea comună numele firmei. `nume` rămâne numele omului (semnătura). Lista „De la" de pe
  web și telefon arată `expeditor`. Păzit de `verify_mail.js`.
- **Fără ștergere automată** (Robert: „mai bine de 12 luni, vom avea un indice de încărcare"): indicatorul arată cât
  ocupă mailul și toată baza din discul ei (`railway_volume_gb`, implicit 5 GB), portocaliu de la 70%.
- HTML-ul unui email se arată într-un `<iframe sandbox="">` cu `srcdoc` și CSP propriu (fără scripturi).
- Etapa următoare (de hotărât): 3 = starea livrării (evenimentele Brevo).
- Păzit de `verify_mail.js` (în `npm test`, pe server pornit, cu Brevo fals).

### Panoul Mail — etapa 2: „Primite" + „Răspunde" (Robert, 12.10: „hai cu etapa 2")
- **Drumul:** Cloudflare Email Routing → Email Worker (`tools/mail-worker.mjs`, se LIPEȘTE în Cloudflare, nu rulează la noi)
  → `POST /api/mail/primeste` (fără sesiune): emailul ÎNTREG (MIME), `X-RA-Secret` = `MAIL_INBOUND_SECRET` (comparat în
  timp constant; nesetat → 503) și `X-RA-Catre` = adresa noastră pe care a venit. 401 parolă, 422 adresă străină sau email
  necitibil, 429 plafon (300 pe oră; 30 de la un expeditor), 200 `{ ok, id, deja, intreg }`. **Orice „nu" și orice
  `intreg: false` → Worker-ul îl duce în `BACKUP`** (căsuța de rezervă); fără ea, îl refuză (expeditorul află). Nu se pierde
  nimic pe tăcute — NU schimba asta.
- **Regulile stau în `mail_primit.js` (curat):** `citeste` (mailparser 3.9.28, fixat; `keepCidLinks` — imaginile din corp
  rămân `cid:` și le pune serverul la deschidere, `cuImagini`, doar imagini ≤ 2 MB), `textDinHtml` (unealta html-to-text
  a LUI mailparser; mailparser nu face textul într-un `multipart/related`), `verificare` (antetul de SUS: DMARC picat sau
  SPF picat fără DKIM → `picat` → avertismentul `MAIL_TEXT_VERIFICARE`), `adresaNoastra`, `subiectRaspuns`, `citat`,
  `pentruRaspuns` (răspunsul pleacă de pe adresa pe care a venit, la `Reply-To`/expeditor), `anunt` (fără nume și subiect).
  Ecranele (web, telefon) NU scriu subiectul „Re:" și nici citatul: le iau din `pentruRaspuns`.
- **Ce se păstrează:** `mail_primite` (corp ca la „Trimise"; HTML peste 500 KB → doar textul) + `mail_atasamente` (base64,
  cel mult 10 MB pe email adunat; peste, doar numele, `intreg: false`). Același `Message-ID` pe aceeași adresă = un rând.
  `mail_primite` e în `BUSINESS_TABLES`; `mail_atasamente` în `BACKUP_EXCLUDED` — copia se face toată în memorie.
- **Cine vede:** ca la „Trimise" (`_mailVazute`): comuna — toți; personala — doar omul ei (404 / 403, și la atașamente).
  **Citit / răspuns: o dată pe email** (`citit_la`, `raspuns_de`): pe contact@, ce a citit sau a răspuns Alin vede și Robert.
  Firma expeditorului: `db.firmaDupaEmail` (om al firmei sau `contact_email`), doar ca etichetă.
- **Atașamentul se DESCARCĂ** (`application/octet-stream` + `_antetDescarcare`), niciodată deschis cu tipul lui: un HTML
  trimis de oricine ar rula pe adresa noastră. NU servi atașamente „inline".
- **Pozele (14.10, Robert: „nu pot să văd imaginile din mailuri"):** poza din corp (`cid:`) se arată până la
  `IMAGINE_IN_CORP_MAX` = `ATAS_PASTRAT_MAX` (10 MB; era 2 MB, iar o poză de telefon are 3–5 MB și rămânea ruptă). Pozele
  atașate care nu sunt în corp (iPhone: text simplu + poză) = `mailPrimit.imaginiAtasate(htmlOriginal, atas)` → `imagini`
  (date `data:` în răspuns, doar png / jpeg / gif / webp / bmp — NU SVG), arătate sub email pe web (`.mail-imagini`) și pe
  telefon; un clic = descărcarea atașamentului. Imaginile de pe internet rămân la „Arată imaginile".
- **Cadrul unui email PRIMIT, pe web:** `sandbox="allow-popups allow-popups-to-escape-sandbox"` + `<base target="_blank">`
  (linkurile, în altă filă), CSP fără `https:` la imagini până la „Arată imaginile" (altfel expeditorul află când l-ai
  deschis). **Pe telefon rămâne `sandbox=""`** (o filă nouă din cadru n-are unde să meargă în aplicație). Un font de bază
  pentru emailul fără font (`_MAIL_CADRU_BAZA`), stilurile emailului câștigă.
- **„Răspunde"** = `POST /api/mail/trimite` cu `raspunsLa`: aceeași rută ca „Scrie"; `de_la` trebuie să fie adresa pe care a
  venit emailul (400 altfel), felul `raspuns`, `jurnal.raspunsPentru` (→ `mail_trimise.raspuns_pentru`), `inReplyTo` /
  `references` → la Brevo antetul `headers` (Brevo nu spune dacă le primește: la 400 se trimite o dată fără ele), la SMTP
  nodemailer. `mailer.send` întoarce `jurnalId`, iar emailul primit se marchează „răspuns" (`marcheazaMailRaspuns`).
- **Anunțul** `mail_nou` (`data: { adresa, mail: true }`): comuna → `_anuntaSuperadmini`, personala → doar omul (userId);
  cel mult unul la 10 minute pe adresă. Web: `openNotifDetail` → Mail → Primite, `onNotificationWs` → bulina; telefon:
  `adresaAnunt('mail_nou')` → `/admin/mail`. Bulina din meniu (`#nav-mail-nr`, `GET /api/mail/necitite`) — doar fondatori.
- „Stare producție", rândul `mail_primit`: pornit / `MAIL_INBOUND_SECRET` nesetat, cu ziua ultimului email primit.
- Păzit de `verify_mail_primite.js` (în `npm test`; emailuri brute ca de la Worker, pe server pornit, Brevo fals),
  `verify_mail.js`, `verify_telefon_lot5.js` (anunțul pe telefon).

### Panoul Mail — 13.10: chenarul cu sigla, semnătura, „Răspunde tuturor", „Redirecționează", „Șterge" la trimise
Robert: „template de mail cu logo… forward, reply, reply all, ștergere"; „1, b · 2 da pentru robert 0729699847, trebuie să
avem în fișă numărul de telefon · 3. da · 4. da".
- **Chenarul casei se pune în `mailer.send` (`_cuCadru` → `cadru`), o dată pentru TOATE emailurile** (invitații, parole,
  contracte, neplată, rapoarte, panoul Mail): sigla albă pe `#0B0E11`, linia `#3FE07D`, rândul cu ratrack.ro. Un HTML care
  are deja `cid:logo@ratrack.ro` (emailul cu factura) nu-l primește a doua oară; `cadru: false` îl oprește. NU scrie chenare
  pe la rute: ar ieși două. „Trimise" ține conținutul FĂRĂ chenar. La Brevo sigla se cere de pe site (`_pentruBrevo`).
- **Semnătura: `mailer.semnatura({ nume, functie, telefon, email })`** — personală = `users.full_name` + `users.functie` +
  adresa de pe care pleacă + `users.phone` (din fișă; „0729 699 847" pe grupe): „Nume · Funcție · RA Track · adresa · ratrack.ro
  · Tel."; comună = „Echipa RA Track · contact@ratrack.ro · ratrack.ro". O alege serverul (`_mailSemnatura`); `/api/mail/adrese`
  dă `semnatura` (rândul de pe ecran), `faraTelefon` și `faraFunctie`. Funcția (`users.functie`, ≤ 120): fișa omului
  (`PUT /api/users/:id`, web `ue-functie`, telefon AdminUsers) și Contul meu (`/api/me/profile`, `pref-functie` / `cm-functie`). **`mailer.cuSemnatura(text, citat, semn)`** o pune sub textul omului și DEASUPRA citatului /
  mesajului redirecționat, pe care serverul îl recunoaște refăcându-l (`mailPrimit.citat`, `pentruRedirectionare…`); citatul
  schimbat de om → semnătura la capăt. Ecranele doar arată rândul primit — NU scrie semnătura în pagină sau pe telefon.
- **„Răspunde tuturor": `mailPrimit.pentruRaspunsTuturor(m, toateAdreseleNoastre)`** — `cc` = „Către" + „Cc", fără adresele
  noastre, fără destinatar, fără dubluri; gol → butonul nu apare. `send({ cc })` (Brevo `cc`, nodemailer `cc`);
  `mail_trimise.cc`; destinatari + Cc ≤ `MAIL_DESTINATARI_MAX`.
- **„Redirecționează"**: `redirectioneazaPrimit` (atașamentele păstrate merg și ele, din `mail_atasamente`) sau
  `redirectioneazaTrimis` (doar textul — la „Trimise" atașamentele sunt doar nume; `faraAtasamente` o spune). „Fwd:" o dată
  (`subiectRedirectionare`); felul `redirectionat`. Răspuns ȘI redirecționare deodată → 400; al altuia → 404.
- **„Șterge" la trimise: `MAIL_TRIMISE_STERGIBILE`** (mesaj / raspuns / redirectionat) — o listă, folosită de `_mailRand`
  (`sePoateSterge`), de ruta DELETE și de `_mailActiune`; restul → 403 / `dovada` „sunt dovada". Ștersul DEFINITIV al unui
  răspuns golește doar `mail_primite.raspuns_id` (rămâne „Răspuns de…").
- Păzit de `verify_mail_raspuns.js` (în `npm test`; pe server pornit, Brevo fals, emailuri primite ca de la Worker).

### Panoul Mail — 13.10 (etapa 3): Spam, Coș, bife, butoanele pe rând, ciorne, sugestii, stea
Robert: „un mail cât mai complet" — „1, da · 2. a · 3. a, b, c · 4. da".
- **Dosarele stau pe rând:** `mail_primite.dosar` = primite / spam / cos, `mail_trimise.dosar` = trimise / cos, cu `dosar_la`
  (de când) și, la primite, `dosar_inainte` (de unde a venit în Coș — „Recuperează" îl pune înapoi acolo, Spam inclusiv).
  Listele vechi (`listMailPrimite` / `listMailTrimise`, necitite, bulina) văd doar dosarul lor. `stea` pe amândouă tabelele.
- **O SINGURĂ funcție pentru acțiuni: `_mailActiune(req, elemente, actiune)`** (`MAIL_ACTIUNI`: citit, necitit, stea, farastea,
  spam, nuspam, sterge, recupereaza, definitiv), chemată de `POST /api/mail/actiune` (≤ 200 deodată) și de cele două rute DELETE
  vechi (primul DELETE → Coș, `?definitiv=1` din Coș → șters). Vizibilitatea ca peste tot (`_mailVazute`): ce nu e al tău =
  `negasite`, nu eroare. Textul de după îl scrie serverul (`text`); jurnal `mail_<acțiune>` fără conținut. Pagina are o singură
  cerere (`raxMailActiune`), telefonul una (`actiune`) — păzit prin numărare. NU scrie a doua cale.
- **„Șterge" = în Coș, fără întrebare; „Șterge definitiv" = doar din Coș, cu întrebare.** Coșul și Spamul se golesc după
  `MAIL_ZILE_DOSARE` = 30 (`golesteMailVechi` → `db.stergeMailDosareVechi`, zilnic, cu atașamentele; de mână
  `POST /api/admin/mail/goleste-vechi`). Ecranele iau zilele de la server (`dosare.zile`, `golitText`).
- **Spamul („2. a"): DOAR expeditorii marcați de noi**, pe adresa pe care i-am marcat (`mail_spam_expeditori (catre, expeditor)`).
  „Spam" îl adaugă, „Nu e spam" îl scoate; primirea (`/api/mail/primeste`) pune emailul lui direct în Spam și NU-l anunță.
  NU adăuga filtre ghicite (fără SPF/DKIM, cuvinte) fără hotărârea lor — Robert a ales „a".
- **Ciornele: `mail_ciorne`, ale omului** (`user_id` în WHERE, 404 pentru altul), ≤ 100, fără atașamente. Ecranele le salvează
  singure la 1,5 s după ultima literă și la închidere; fereastra goală nu face ciornă; `ciorna` trimis la „Trimite" → serverul
  o șterge după ce a plecat emailul.
- **Sugestiile (`GET /api/mail/sugestii`, ≥ 2 litere, ≤ 8):** cine a scris pe adresele văzute (fără Spam), cui i-am scris de pe
  ele, `companies.contact_email`, iar dintre conturi DOAR administratorii (superadmin / company_admin / admin) — restul
  oamenilor unei firme e treaba ei. Fără adresele noastre.
- ⚠ **În db.js, numărătoarea vine din `RETURNING id`** (`rows.length`): `rowCount` lipsește în PGlite — mesajul de după ar fi
  „Nimic de schimbat". Și NU folosi același `$n` și ca valoare de coloană, și într-o comparație cu text (`CASE WHEN $2 = 'spam'`):
  PostgreSQL refuză („inconsistent types"); dă-i un parametru boolean separat. Prinse amândouă de probă pe 13.10.
- Bara de deasupra listei stă MEREU (cu „Selectează tot"), ca prima bifă să nu împingă lista; butoanele de pe rând apar la
  hover, iar sub `@media (hover:none)` și pe telefon stau la vedere.
- Lista de spam și ciornele sunt în `BUSINESS_TABLES`. Păzit de `verify_mail_dosare.js` (în `npm test`; golirea pe o bază a
  ei, `--faza=golire`).

## Cache / deploy (context util)
- CSS-ul aplicației e în `public/css/app.css` (servit `NO_CACHE` printr-o rută dedicată în `server.js`).
- Service worker-ul (`public/sw.js`) e **network-first** pentru HTML și CSS; la schimbări mari de assets, bumpează `CACHE` (`ratracks-vNN`).
- Verificarea versiunii LIVE: `ratrack.ro/api/health` → câmpul `version` = prefixul commit-ului deployat.
- **Server propriu (`docker-compose.prod.yml`, Robert 20.10):** aplicația primește TOT `.env`-ul (`env_file`); `environment:` ține
  doar ce e al mașinii (baza din container, porturile, `NODE_ENV`, `GIT_SHA` din comanda de pornire, `RAILWAY_GIT_COMMIT_SHA` golită)
  și bate `.env`-ul — așa se lipesc întocmai variabilele din Railway (Raw Editor). NU pune înapoi o listă `X=${X:-}`: a rămas în urmă,
  iar aplicația pornea fără AI, Brevo, emailurile primite, ANAF și Firebase. Valorile JSON între APOSTROFURI (cu ghilimele, Docker
  strică `\n` din cheia Firebase — măsurat). `DOMAIN` = ratrack.ro (telefonul și emailurile merg acolo). Variabilă nouă = un rând în
  `.env.prod.exemplu`, citit de cod. ⚠ Unealta de mutare a datelor (`migrate_export.js`) NU merge de pe Railway (refuză o bază
  Postgres, 22 din 66 de tabele) — nehotărât (20.10). Păzit de `verify_server_propriu.js` (în `npm test`).
- **Banda „A apărut o versiune nouă" (Robert, 14.10: „vreau doar banda").** La o publicare clientul rămâne pe pagina veche
  până o reîncarcă. `amprentaPaginii()` (server.js) = amprenta fișierelor din `public/` pe care le încarcă pagina
  (`index.html`, `css/`, `js/`, `vendor/`) + scripturile făcute din module (`_LICENSE_JS`…); `/app` o scrie în
  `<meta name="ra-pagina">` (`_paginaCuAmprenta` — de aceea `/app` NU mai e `sendFile`), `/api/health` o dă ca `pagina`.
  Pagina (blocul „banda «A apărut o versiune nouă»") compară la 5 minute, la revenirea în filă și la reconectarea hărții
  live (`_wsCazuta`); alta → `.ver-noua` sus, cu „Reîncarcă". **NU reîncarcă singură** (formulare pe jumătate), „×" = o oră.
  O publicare doar de server NU o aprinde. Un fișier nou pe care îl încarcă pagina din alt dosar → adaugă-l în
  `_paginaFisiere`, altfel schimbarea lui nu aprinde banda. Telefonul nu o are (se schimbă prin APK). Celelalte variante
  discutate atunci (oprirea blândă cu `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, „Wait for CI", publicări la ore fixe, două
  servere) NU s-au ales — nu le face fără el. Păzit de `verify_versiune_noua.js` (în `npm test`).

## Site-ul public (ratrack.ro) — ce citește Google (02.10)

Robert, după analiza SEO: *„fă tot ce poți tu"*. Site-ul are acum 8 pagini: prima pagină, trei pagini pe funcții
(**`/monitorizare-combustibil`**, **`/alerte-itp-rca-rovinieta`**, **`/agenti-ai`**), **`/pachete-ra-insight`** (14.10), întrebările frecvente, Termeni,
Confidențialitate.

- **`PAGINI_PUBLICE` (server.js) e SINGURA listă:** din ea ies sitemap-ul, adresele „frumoase" și redirecționarea
  PERMANENTĂ (301) de la vechea adresă cu „.html" (`/faq.html` → `/intrebari-frecvente`, `/landing.html` → `/`…).
  O pagină nouă = un rând acolo + fișierul + legătura din subsolul primei pagini. Legăturile noastre (aplicația,
  bannerul de cookie-uri, meniul telefonului) folosesc adresa curată.
- **`modificat` = ziua în care s-a schimbat TEXTUL paginii** = `lastmod` din sitemap. NU pune înapoi ziua de azi:
  o dată care se schimbă la fiecare citire e una pe care Google o ignoră. `amprenta` = amprenta textului (titlu,
  descriere, ce se vede); schimbi textul și uiți data → `verify_site_public.js` pică și îți scrie exact ce să pui.
- **`DE_HOTARAT` (în probă): ce se găsește pe drum și încă nu s-a hotărât** — regula casei din 01.10 („ce găsesc
  pe drum, întreb"). Cât un rând stă acolo, verificarea lui doarme și proba îl tipărește la fiecare rulare. Cele
  șase găsite pe 02.10 (promisiunile primei pagini, datele pentru Google ale întrebărilor frecvente, păstrarea
  datelor scrisă vag, bannerul de cookie-uri lipsă, „Ultima actualizare" falsă, „TrackGPS") — Robert, 03.10: „da";
  corectate, lista e goală.
- **Termeni / Confidențialitate:** „Ultima actualizare" e data FIXĂ = `modificat` (`<time datetime>`), nu ziua de
  azi din browser — cum era până pe 03.10, o dată falsă pe un document legal. Schimbi textul → schimbi amândouă.
- **Fiecare pagină publică:** titlu (≤ 70), descriere, adresă canonică, UN `<h1>`, Nunito, iconiță și bannerul de
  cookie-uri (`/js/consent.js`).
- **Întrebările din datele pentru Google (FAQPage) sunt IDENTICE cu cele de pe pagină**, cuvânt cu cuvânt, în aceeași
  ordine, pe toate paginile (pe întrebările frecvente erau 10 din 11, rezumate, până pe 03.10). Schimbi o întrebare
  pe pagină → o schimbi și în bloc.
- **Paginile spun DOAR ce face aplicația azi** (verificat în cod pe 02.10; prima pagină corectată pe 03.10). Ce NU
  promitem, deliberat: că agenții
  lucrează „24/7" (doar RA Watch, o dată pe oră; ceilalți cinci, când le deschizi pagina), că agenții trimit
  notificări pe telefon (nu trimit), raportul RA Client „în fiecare dimineață" (nu există), scorul RA Optimize „pe
  șofer" (e pe vehicul; clasamentul șoferilor e raportul EcoDrive), „condus și odihnă" la RA Compliance (e o estimare
  din GPS, doar condusul de azi), alerta de „deconectare" (nu există), harta de căldură „pe unde trec" (arată unde
  STAU), adresa scrisă la dispecerizare (locul se alege pe hartă), cardurile de combustibil, emailul (fără SMTP pe
  ratrack.ro), descărcarea tahografului, e-Transport, taxa de drum. Fără prețuri.
- **Cifrele scrise pe pagini sunt legate de cod în probă** (`LEGATE`): 16 tipuri de alerte (`ALERT_TYPES`, prima
  pagină), 16 lucrări de service (`maint_types.js`), 30 de zile preaviz la acte (`DOC_DAYS_LEAD`), 14 zile / 500 km
  la revizii, 12 luni de istoric și 30 de zile după încetare (`contracts.js`, întrebările frecvente), pragurile lui
  RA Watch (`agents.js`), 4h30 / 9 ore / 45 de minute (RA Compliance), 12 ore între constatări (`db.js`), RA Watch
  din oră în oră. „30+ tipuri de rapoarte" se NUMĂRĂ din catalog, rotunjit în jos la zece, ca pe hârtia ofertei.
- **Diacriticele se verifică pe cuvinte** (`FARA_DIACRITICE`). ⚠ Granița de cuvânt e scrisă cu litere Unicode:
  `\b` din JavaScript socotește „ș" punctuație și ar găsi „in" în „mașină".
- `/api-docs` (și `/docs`, `/api-docs.html`) are adresă canonică; nu e în sitemap. Descrierea spunea „RA Track /
  TrackGPS" — TrackGPS e marca altei firme; scos pe 03.10.
- Păzit de `verify_site_public.js` (în `npm test`), inclusiv pe server pornit (sitemap, 301, robots.txt).

## Compania DEMO (acces la CERERE, aprobat de super-admin)
Aplicația seedează la pornire o **companie demo** built-in — „RA Track Demo" (pe 09.10, câteva ore, „RA Tracks Demo"; numele acela se corectează o dată, la pornire), 5 vehicule **sintetice** (DEMO-1..5: Timișoara, București, Iași, Brașov, Cluj-Napoca) + cont `demo` (viewer) + simulator de poziții. Vezi `server.js` (blocul „DEMO mode", gated pe `process.env.DEMO_DISABLED !== 'true'`) + `demo-sim.js` (`DEMO_IMEIS`, `ROUTES`).

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
  regula de acces a FIRMEI (`stareAcces`), care numără 15 zile de grație după scadența unei facturi.
- **La aprobare fără email, linkul de parolă apare PE LOC** (web din 03.10 — Robert: „acum"; telefonul din 23.09), în
  fereastra comună `window._usrAratLinkul`, copiat deja. NU trimite fondatorul în Utilizatori după el: până pe 03.10,
  pe web, asta însemna doi pași în plus la fiecare cerere, cât serverul n-are email. Fereastra (`raConfirm`) rupe un
  link lung înăuntru (`overflow-wrap:anywhere`) — ieșea în dreapta din chenar. Păzit de `verify_utilizatori.js`.
- **Conturile demo nu pot trimite emailuri prin serverul nostru** (`_demoBlocked`): fără rapoarte programate
  și fără formularul de suport — altfel demo-ul devine releu de spam pe reputația domeniului.
- **`DEMO_DISABLED=true` NU mai șterge nimic.** De când demo-ul se acordă la cerere, compania demo e parte din
  produs (acolo trăiesc conturile temporare). Comutatorul oprește DOAR simulatorul de poziții. Ștergerea
  completă rămâne o operație deliberată, nu efectul unei variabile de mediu.

## RA Insight — vedeta: un singur asistent, cu memorie (Alin, 02.10: „da, fă tot")

Alin a arătat două capturi: „câți km a făcut B 154 UIP săptămâna trecută?" → „nu apare în flotă"; apoi „Dacia Logan 3" →
„ce vrei să afli?". Modelul primea mașinile doar cu NUMELE și fiecare mesaj pleca singur. Hotărât cu el: RA Insight e
SINGURUL asistent care costă (pe cont, ca azi); „AI Raport" din Rapoarte e gratuit, pe reguli; cei 6 agenți rămân.
Planul în pași: 1 numerele + memoria (livrat), 2 secțiunea proprie + AI Raport, 3 Safe Drive & costuri, 4 celelalte ramuri
+ scrisoarea de luni; creierul puternic și acțiunile — abia după măsurătoare și după ce stabilim prețul.

- **Un singur asistent: `_raInsight` (server.js)**, chemat de trei uși: `/api/insight/intreaba` (secțiunea),
  `/api/ai/reports-agent` (Rapoarte, web + telefon) și `/api/ai/chat` („Asistent AI" de pe telefonul vechi). Păzit prin
  numărare (`verify_insight.js`). NU scrie a doua funcție de răspuns. Rapoartele (`run_report`) se dau doar cui are
  `viewReports` (`permReq`).
- **Fișa flotei (`insight.js`)**: `fisaFlotei` / `gasesteInText` / `rezolva` — număr (comparat fără spații, și pe
  jumătate: „154 UIP"), nume (cu terminațiile românești: „Loganul", „Caddy-ul"; un cuvânt comun tuturor tot numește ceva —
  toate, deci îndoială), șofer (nume întreg sau „lui X"; un singur cuvânt fără „lui" NU, altfel „consum mare" găsea pe
  Ionel Mare), grupă. Două îndoieli care se taie într-o mașină („Loganul lui Ion") = mașina aia. Îndoiala nu se rezolvă pe
  ghicite: unealta întoarce `ambiguu`, ecranul primește `alege` (butoane); „celălalt" scoate mașina discutată. Arhivatele
  NU intră în fișă (clientul nu le vede).
- **Memoria:** tabelele `ai_conversatii` / `ai_mesaje`. Modelul vede ultimele 12 mesaje — doar TEXTUL, tăiat la 1.500 de
  caractere (`istoricPentruModel`) — plus `context` (mașina, perioada, rapoartele discutate), scris de server după fiecare
  răspuns. Fără id: se continuă ultima conversație a omului de < 30 de minute (telefonul vechi); web-ul trimite `nou: true`
  la bula deschisă proaspăt, ca omul să nu continue fără să știe o discuție veche.
- **Conversația e a OMULUI care a scris-o.** Fiecare cerere din db.js are `user_id` în WHERE — nici adminul firmei, nici
  super-adminul nu o citesc, nu o șterg, nu o continuă (404, ca una care nu există). 12 luni de la ultimul mesaj
  (`LUNI_CONVERSATII_AI` în contracts.js, legată de pagina de confidențialitate), apoi `stergeConversatiiVechi` (zilnic;
  de mână `POST /api/admin/insight/sterge-vechi`). Tabelele stau în `BACKUP_EXCLUDED`: în copii ar trăi mai mult decât promitem.
- **Perioadele pe ora României:** `insight.perioada` / `etichetaPerioadei` („21–27 septembrie", „septembrie 2026", „azi").
  NU socoti zile cu `setHours` pe server — serverul e pe UTC („azi" începea la 3 dimineața, vara). **Agenții la fel (22.10):**
  `agents.js` → `buildCtx` ia ziua din `insight.perioada('today')` și ora din `insight.oraRO` (pragul „după-amiaza" al lui RA
  Dispatch); până atunci RA Watch nu vedea noaptea scăderile de combustibil dinainte de 03:00 — prins de `verify_un_singur_insight.js`
  (1b), care pica pe GitHub între 00 și 03. **Și restul (23.10, Alin: „da"):** `/api/dashboard`, `/api/stats/:imei` (fișa mașinii de
  pe hartă; `date` = `_ziRo`), `_insightPeriod` (întrebările vechi ale telefonului) și `/api/report/:imei` iau ziua tot din
  `insight.perioada({ period: 'today' }, Date.now())` — păzit de `verify_un_singur_insight.js` (5d). Ultimul rămas, ruta tehnică
  „io-peek" din panoul nostru de depanare, la fel (23.10, Alin: „rezolvă-le"): în server.js nu mai e niciun `setHours(0, 0, 0, 0)`.
- **Răspunsul rapid gratuit (`fleet_quick.js`) doar despre ACUM:** `insight.potrivitPentruRapid`. Altă perioadă, alt
  subiect, o continuare („și ieri?") sau o mașină ambiguă → RA Insight. Înainte, „kilometri" scris corect într-o întrebare
  despre săptămâna trecută primea km-ii de AZI ai întregii flote. Pe o mașină anume („unde e B 154 UIP") răspunde doar despre ea.
  **Fără emoji** (Alin, 20.10: „📍 🚚 🟠" nu arăta profesionist lângă insigne): titlu îngroșat, mașina, rânduri cu „•"; ora pe ora
  ROMÂNIEI (`fmtTime` cu `timeZone: 'Europe/Bucharest'` — serverul e pe UTC, „ultima poziție" ieșea cu 3 ore în urmă). Păzit de `verify_tarife.js`.
- **Zilele săptămânii și weekendul: O regulă, `insight.ziuaSaptamanii(text, acum)`** (14.10, Alin: „rezolvăm"), folosită de
  `potrivitPentruRapid` (orice zi a săptămânii → nu e rapid) și de `ai_raport.perioadaDin` (ÎNAINTEA lui „azi", ca „de luni
  până azi" să fie săptămâna). „duminică" = cea mai apropiată (azi, dacă azi e duminică), „…trecută" = cea dinainte de azi,
  „în weekend" = sâmbătă + duminică (cel de acum doar sâmbăta / duminica), „de luni până miercuri" = intervalul. „luni" după un
  număr sau după „ultimele" = luni de calendar. Până pe 14.10: „duminică" primea „acum" (rapid) sau ultimele 7 zile (AI Raport).
- **„Rezumă raportul" (`/api/ai/report-summary`) are poarta contului (`requireAiSeat`)**, ca ușile lui RA Insight: se numără
  din întrebările firmei (14.10; până atunci îl cerea și omul fără cont). O ușă nouă care consumă întrebări primește poarta.
- **Instrucțiunile în DOUĂ bucăți:** partea fixă (`_insightInstructiuni`, cu `cache_control`) + contextul întrebării
  (`_insightContext`: ora, mașinile recunoscute, ce s-a discutat). NU pune ora sau mașinile în partea fixă — ar strica cache-ul.
- **Plafonul de întrebări AI pe minut (`RL_AI`) cuprinde și `/api/insight/intreaba`**, nu doar `/api/ai/*`. O ușă nouă de AI
  se adaugă acolo.
- **„Am înțeles"** (`_insightInteles`) vine din uneltele chiar rulate, nu din ce a scris modelul. Pe ecran: o singură funcție,
  `window._insightExtra(j, laAlegere)`, pentru bulă, fila din Rapoarte și secțiune; textele se pun cu textContent.
- **Fără nicio mașină, RA Insight nu pleacă spre model** și nu se numără (regula veche a lui RA Insight, acum și pe ușa
  „Asistent AI").
- ⚠ Proba pornește serverul cu un model SIMULAT (un `-r` care răspunde în locul api.anthropic.com dintr-o coadă) — nu se
  cheltuie nimic. Importul de mașini citește coloanele pe românește (`nume`, `nr_inmatriculare`), nu `name`/`plate`.
- Păzit de `verify_insight.js` (în `npm test`) și `verify_paritate_telefon.js`.

### Pasul 2 (02.10): secțiunea din meniu, notițele, ghidul, „AI Raport" gratuit
- **Rândul din meniu:** `#nav-insight` (data-view="insight", eticheta „NOU"), arătat de `updateFabs` când firma are
  `ai_assistant`; vederea `insight-view` → `renderInsightPage` (blocul „secțiunea RA Insight", între sentinele). Bula din
  colț se ascunde cât ești în secțiune. **Discuția e una: `window._raxConvId`**, comună bulei și secțiunii — NU ține o a
  doua conversație curentă. Ramurile cu `gata: false` nu se arată; se aprind când se livrează pagina lor.
- `.insp` are `grid-template-columns: minmax(0, 1fr)` (și `.insp-corp` la fel): fără el, coloana crește după cel mai lat
  rând și pe telefon secțiunea ieșea din ecran (645 px într-un ecran de 390). Pe ≤ 860 px capul se rupe pe două rânduri.
- **Notițele firmei:** `settings.insight_notite` (≤ 1.500), `GET/PUT /api/insight/notite` — scrie doar `manageUsers`. Intră
  în CONTEXTUL întrebării (`_insightContext`), NU în partea fixă din cache.
- **Ghidul:** `insight_ghid.js` (`SECTIUNI`, `cauta`, `publice`), citit gratuit (`GET /api/insight/ghid`) și folosit de unealta
  `cauta_in_ghid`. Fiecare nume citat („Adaugă șofer") trebuie să existe pe ecran — `verify_insight_ghid.js` le caută pe toate.
  Schimbi un buton → schimbi și ghidul. Un cuvânt-cheie scurt se potrivește doar întreg (+ terminație): „act" NU în „facturile".
- **`run_report` respectă rapoartele tăiate din rol** (`poateRaport`) — înainte RA Insight le rula oricum.
- **Statisticile pentru noi** (`GET /api/admin/insight/statistici`, super-admin): numere (răspunsuri, 👍/👎, conversații,
  rapoartele rulate) — NICIODATĂ textul conversațiilor. Ecranul lor vine cu ramurile.
- **„AI Raport" (Rapoarte → fila `rep-tab-insight`, butonul `rep-tab-btn-insight`) — fila a fost SCOASĂ pe 15.10** (Capitolul 2,
  pasul 1: rapoartele se cer în cuvinte, din RA Insight); ruta și motorul rămân — vezi „Capitolul 2, pasul 1". Ce urmează e regula
  motorului: întrebări despre rapoarte, pe REGULI,
  fără model — `viewReports` (și ecranul „rapoarte"); din 14.10, pe o firmă cu pachet RA Insight cere și contul (pe Start, al
  administratorului, din cele 50 de răspunsuri) — vezi „Pachetele RA Insight". Înțelegerea și propozițiile stau
  în `ai_raport.js` (`intelege`, `raspunde`, `neinteles`, `INTREBARI_GATA`); ruta: `POST /api/reports/ai-raport` +
  `GET /api/reports/ai-raport/intrebari`. Contextul („și luna trecută?") îl întoarce serverul și ecranul i-l trimite înapoi
  (`_rinCtx`); serverul îl CURĂȚĂ (doar mașini accesibile). `imei` din corp e aruncat. Plafon: 30 de întrebări pe minut pe om.
  În jurnal: doar subiectul și câte mașini. „De ce / compară / ce să fac" → `spreInsight` (butonul „Întreabă RA Insight").
- **Opțiunile unui raport: O funcție, `_optiuniRaport(q, cs)`**, folosită de ecranul Rapoarte și de AI Raport — ca amândouă
  să scoată aceleași cifre. NU scrie a doua listă de opțiuni.
- **`valori` în rapoarte** (`utilization`, `consumption`, `costs`): cifrele ca NUMERE, pe mașină, pentru AI Raport (să nu
  citească „1.234 km" din tabel). Ecranul și exporturile nu le folosesc. `raspunde` citește cheile din sumarul și rândurile
  rapoartelor: schimbi o etichetă în `reports.js` → schimbi și `ai_raport.js` (proba le are pe forma adevărată).
- Rutele vechi `/api/insight/presets` și `/api/insight/run` (întrebările gata făcute ale filei vechi) rămân DOAR pentru
  telefonul cu aplicația veche; pagina nu le mai cheamă. Se scot după APK-ul cu AI Raport.
- Păzit de `verify_ai_raport.js` (84, cu ZERO cereri către model numărate pe server), `verify_insight_ghid.js` (22) și
  `verify_insight.js` (secțiunea 7).
- ⚠ **Probele pe server pornit merg pe ceasul ADEVĂRAT**: zilele datelor de probă se socotesc față de azi
  (`insight.perioada({ period: 'last_week' }, Date.now())`, `inceputZiRO`), NU se scriu de mână. Două probe scrise pe
  02.10 cu „21–27 septembrie" picau de pe 06.10 la orice livrare.

## Rapoartele citesc TOATĂ perioada (Alin, 05.10: „rezolvăm acum")
Rapoartele citeau cel mult 50.000 de poziții pe mașină (cele mai vechi), fără să spună — cam o lună a unei mașini care
merge zilnic: „km luna trecută" număra doar o parte, „Ultima locație" ieșea de la mijlocul perioadei.
- **`fiecarePozitie(db, imei, from, to, fn)`** (reports.js): toată perioada, pe pagini de `PAGINA_ISTORIC` (20.000 ≈ 15 MB;
  MĂSURAT ~785 de octeți pe poziție), prin `db.istoricInterval` (vii + arhivă, fără dubluri, cheia timpului ca TEXT).
  O folosesc: `rUtilization`, `_consumptionMap` (Consum / Costuri / Emisii), `rIdling`, `rSpeeding` (limită fixă),
  `rEcoDrive`, `rEcoDriveDrivers`, `rEngineHours`, `rFuel`, `fuelStats`. Un raport NOU care merge poziție cu poziție o
  folosește pe ea, NU `history`. Starea (punctul anterior, evenimentul în curs) se duce peste capătul paginii.
- **`coadaIstoric`** (`db.istoricCoada`): „Ultima locație" citește doar capătul perioadei.
- **`history`** rămâne pentru rapoartele care au nevoie de tot șirul deodată (curse, staționări, traseu, zilnic, HOS,
  disponibilitate, senzori, OSM la viteză): cel mult `PLAFON_ISTORIC` (50.000) și, când baza dă exact plafonul, raportul
  primește **`trunchiat: [{ imei, vehicul, panaLa }]`** (prin `AsyncLocalStorage`, o rulare = un raport) + rândul
  „Atenție" în legendă (ecran, Excel, PDF). Ecranul: banda `#rep-trunchiat`; AI Raport: prima sugestie; RA Insight:
  `atentie` în rezultatul uneltei.
- **Filtrul zile/ore** (`_tfWrapDb`) se aplică DUPĂ citire (`_tfMatch` pe baza `_tfBaza`), ca paginile și plafonul să
  se socotească pe ce e în bază — altfel o pagină filtrată s-ar reciti la nesfârșit.
- În probe: `RAPOARTE_PLAFON` / `RAPOARTE_PAGINA` coboară cifrele (nu le seta în producție).
- Păzit de `verify_rapoarte_pagini.js` (în `npm test`): pe pagini = dintr-o bucată pe 11 rapoarte + statistici (și cu
  filtru), martorul vechi, avertismentul, pe server pornit cu 700 de poziții și plafonul 300.
- **Un formatator de dată ținut minte, NU unul la fiecare poziție** (Robert, 21.10: „rezolvă acum"). `new Intl.DateTimeFormat(…)`
  ține ~17 KB pe care procesul nu-i mai dă înapoi: făcut la fiecare poziție în `_dayKeyISO`, „Condus & repaus" pe o lună, 3
  mașini, dura 28 s și lăsa ~6 GB ocupați (acum 1,5 s, ~200 MB, aceleași cifre). `_dayKeyISO` îl ține în `_fmtZiISO`, programul
  de lucru (`workschedule.js`, la fiecare poziție în mers) unul pe fus (`_formatatoare`). Orice cod care merge poziție cu
  poziție sau rând cu rând folosește un formatator ținut minte. Locurile care fac formatatoare sunt NUMĂRATE în
  `verify_formatoare.js` (în `npm test`) — un loc nou pică proba până te uiți de unde e chemat.

### Pasul 3 (06.10): Safe Drive & costuri — ramura din RA Insight (după macheta din 02.10; din 15.10 se cheamă **RA Drive**)
- **Regulile stau într-un singur loc: `condus.js`** (curat): pragurile și scorul EcoDrive (`PRAGURI`, `scor`, `scorFlota`
  — rapoartele `ecodrive` / `ecodrive_drivers` le citesc de acolo), litrii (`litri`: ralantiul măsurat din contor sau
  ore × L/h; viteza = Σ km × ((v/90)² − 1) × consum × `PARTE_AER` = ⅓), leii (`costuri`: ralanti, viteză, `accel` =
  „Combustibil", `frane` = frânări + viraje = „Frâne și anvelope"), recomandările și textele „Cum se socotește"
  (`explicatii`). NU scrie praguri sau prețuri în pagină ori în altă parte. „Peste 90 km/h" e pragul EcoDrive, NU limita
  legală — textele o spun așa.
- **Zilele: `zile_condus` (imei, zi pe ora României, șofer)** — doar ce s-a MĂSURAT (`pesteF`, `ralantiOreEst`,
  `ralantiLMasurat`, manevre, ore, zone de ~500 m). Litrii și leii se socotesc la citire, cu consumul și prețul de azi ale
  mașinii. NU rotunji numerele pe zi: pe o lună rotunjirile mutau o zecime (40,15) și pagina se contrazicea cu raportul.
- **Ce se (re)socotește: `safe_drive.deSocotit`** — zi nesocotită, socotită înainte să se termine, sau „azi" mai veche de
  15 minute. Coada din server (`_sdPune`, două mașini deodată, fără dubluri), tura de noapte (`safeDriveNoaptea`, 2–6 ora
  României, ultimele 3 zile, firmele cu RA Insight, fără demo), iar prima deschidere a unei luni răspunde „Pregătesc luna"
  cu procentul. Citirea pornește cu 10 minute înainte (drumul de peste miezul nopții se leagă), dar scrie doar zilele ei.
- **O SINGURĂ funcție pentru lună: `_sdLuna(req, o)`**, chemată de pagină (`GET /api/insight/safe-drive`) și de unealta
  `safe_drive` a lui RA Insight — păzit prin numărare. Luna de acum se compară cu ACELEAȘI zile din luna dinainte; textele
  „față de …" le scrie serverul (`_fata`), pagina doar le arată (cu textContent).
- **Istoricul șoferilor: `istoric_soferi`** — `assignDevice` scrie fiecare schimbare; primul șofer al unei mașini fără
  istoric e socotit de la început (de_la = 0), ca raportul de până atunci; ștergerea sau mutarea șoferului îi închide
  rândurile. Clasamentul `ecodrive_drivers` folosește același istoric (`condus.soferLa`); fără istoric (baze de probă) —
  șoferul de acum.
- **Drepturi:** pagina = `ai_assistant` + loc RA Insight; prețurile pe manevră (`settings.safe_drive.preturi`, 0–100 lei,
  altfel prețul de pornire) și „Am vorbit cu el" = `requireFleet`; discuția doar pe șoferii firmei (404 altfel), ziua o pune
  serverul. Mașinile: `canAccessImei` + nearhivate; grupa — doar dintre ale omului.
- **Ștergerea:** zilele pleacă odată cu pozițiile (`stergeIstoricAparat`, `stergeIstoricMaiVechiDe`,
  `deleteDeviceCompletely`); `zile_condus` e în `BACKUP_EXCLUDED` (se reface), `istoric_soferi` și
  `safe_drive_discutii` în `BUSINESS_TABLES`.
- Prețurile de pornire (`PRETURI_IMPLICITE`) sunt o estimare a mea — la „De amintit", de confirmat cu Alin.
- Păzit de `verify_safe_drive.js` (în `npm test`; cifrele = EcoDrive / Ralanti pe o lună, server pornit) și
  `verify_insight.js` (unealta).

### Pasul 4 (07.10): Mentenanță & acte, Combustibil, Ore de condus, Scrisoarea de luni
- **Regulile și textele stau în `ramuri.js`** (curat); serverul adună datele cu funcțiile care există deja. **O funcție pe
  ramură**, chemată de pagină, de unealta lui RA Insight, de numărul de lângă ramură și de scrisoare (păzit prin numărare):
  `_ramMentenanta(req)`, `_ramCombustibil(req, o)`, `_ramOreCondus(req, o)` (+ `_sdLuna` la Safe Drive). „Ce mașini vede
  omul" = `_ramFlota(req)` (acces + fără arhivate) — una pentru toate ramurile. Paginile nu socotesc (textContent).
- **Socotelile grele** (lună / săptămână de poziții) trec prin `_ramGreu` (una în lucru pe cheie, ținută minte 15 min pentru
  perioada de acum, 6 h pentru cele trecute; `doarGata` = numărul ramurii nu pornește nimic).
- **Mentenanță & acte:** stările sunt ale listelor (`maintenanceDueState` / `documentDueState`, cu preavizul firmei);
  permisele = pragul anunțului lor (`NOTIFY_EXPIRY_DAYS`, 30).
- **Combustibil = motorul rapoartelor** (`reports._ajutor.consumptionMap` + raportul `fuel`, cu `_optiuniRaport`): aceleași
  cifre ca Consum / Costuri / Alimentări & scăderi. **Norma din fișă = cel mai mare consum trecut** (`cMax`: oraș sau
  afară); „peste normă" doar pe consum măsurat, ≥ 100 km, > 15% (`PESTE_NORMA`, `KM_MIN_NORMA`). Evenimentele `fuel` au
  `lat`/`lng` (harta din pagină); unealta lui RA Insight NU primește coordonate.
- **Ore de condus = raportul `hos`** (rHos), pe săptămână (`_ramSaptamana`: acum + 3 înapoi). **rHos pune fiecare zi pe
  șoferul de atunci** (`istoric_soferi`, `condus.soferLa`), o mașină cu doi șoferi se citește pentru fiecare (memoria rămâne
  pe un șofer). Pragurile din „Cum se socotește" sunt LEGATE de codul rHos în probă. `valori` = zilele ca numere.
- **Scrisoarea de luni:** `_fapteScrisoare` (aceleași funcții, pe mașinile omului — `_cerereOm` ca withScope) →
  `ramuri.fapteScrisoare` → `_scrieScrisoarea`: RA Insight (`ai.callClaude`, instrucțiunile fixe în cache) DOAR din fapte;
  **`ramuri.textulTrece` oprește orice cifră care nu e în fapte** (afară de `CIFRE_MEREU`: 100, 561, 2006) → atunci textul
  pe reguli (`textScrisoare`). Consumul = fel `'scrisoare'`, în afara `AI_BILLABLE_KINDS` (îl plătim noi). **Pleacă DOAR
  lunea, de la 8** (`scrisoareaDeLuniTick`, la 15 min): o livrare în mijlocul săptămânii nu trimite nimic. O scrisoare pe
  aceleași mașini (un singur text), una pe om și săptămână (`UNIQUE (user_id, saptamana)`), anunț `scrisoare_luni` →
  `insightDeschideScrisoarea`. Tabela `scrisori_luni`: a omului (user_id în WHERE), 12 luni (`stergeConversatiiVechi`),
  în `BACKUP_EXCLUDED`. Fără drum și fără nimic de rezolvat → nicio scrisoare.
- În probe: `/api/test/ceasuri { acum, scrisori: true }` pornește trecerea cu ceasul probei. Proba RA Insight are modelul
  simulat; a ramurilor merge fără model (textul pe reguli).
- Păzit de `verify_ramuri.js` (în `npm test`), `verify_insight.js`, `verify_safe_drive.js`, `verify_insight_ghid.js`.

### Etapa A (07.10): cele 5 găsite pe drum + AI Raport înțelege (Alin: „rezolvă acum")
Capitolul AI, pe etape (Alin, 07.10): **A** (asta) → **B** RA Insight ca un chat modern (machetă întâi) → **C** ramura
„Potrivirea șoferilor pe mașini" (propunere + machetă) → **D** la final: „Rezumă cu RA Insight" (ce consumă) + ecranul de
statistici RA Insight pentru noi → **E** telefonul. Apoi Facturare.
- **Preavizul și starea termenelor: `preaviz.js`** (curat) — `REVIZII_ZILE` 14, `REVIZII_KM` 500, `ACTE_ZILE` 30, `peFirme`,
  `stareRevizie`, `stareAct`. Îl citesc listele (`maintenanceDueState` / `documentDueState`), anunțurile, agentul RA Care
  (actele erau anunțate cu 14 zile, listele cu 30) și raportul „Scadențe" (avea 7 / 30 de zile, 500 / 2.000 km). NU scrie
  a doua cifră de preaviz. `DOC_DAYS_LEAD` = `preaviz.ACTE_ZILE` (pagina publică o citește prin probă).
- **Cine e sub Reg. 561: `tacho.supusReg561(tipSauCamion, areDateTahograf)`** — date de tahograf → da; altfel tipul din fișă
  (`vehiculAreTahograf`: autotractor, camion, TIR, autobuz, autocar…). Folosită de RA Compliance, raportul „Condus &
  repaus" și Tahograf. Raportul punea „Auto" sub regulament (expresia `/car|…/`) și scutea autocarele; agentul nu știa
  „Autotractor" și număra dubele.
- **rHos citește săptămâna întreagă**: orele de condus de dinainte de perioadă, de luni (`inainte`), intră în sumele pe
  săptămână; plus limita de **90 h în două săptămâni la rând**. „Statistici consum" (`fuelStats`) numără km-ii cu garda
  raportului Consum (5 minute).
- **AI Raport — înțelegerea** (`ai_raport.js`): două treceri, `re` (cuvintele tari: „staționări", „unde e", „ce a făcut")
  apoi `slab` (verbele: „a mers", „a făcut", „a stat"). Prezentul („staționează", „unde e", „de cât timp stă", `LOCATIE_RE`)
  = ACUM → „Ultima locație", citită pe `ZILE_LOCATIE` (30) cu `perioada.acum` („Am înțeles" scrie „acum"); trecutul →
  „Staționări". Subiecte noi: `rezumat` (Situație zilnică) și curse/drumuri. `ALTE_RAPOARTE` (supraturații, PTO, senzori,
  CAN…) → `alt_raport` + butonul „Deschide raportul" (`_rinButonRaport`, același de sub răspunsuri).
- **Mașina rămâne în discuție** (Alin: „din raport staționări" primea toată flota): se schimbă doar la altă mașină / grupă,
  „toată flota", sau o întrebare la plural (`RANG`, `DESPRE_FLOTA`: „care mașină", „cine"). Și după o întrebare
  NEînțeleasă: `intelege` întoarce `context` și la eșec (mașina; la îndoială și subiectul + perioada, ca butonul ales să
  primească răspunsul întrebării). După răspuns, discuția = `contextul(u, from, to)` („acum" nu lasă perioadă). Întrebările
  gata făcute de sus pornesc de la zero (`rinAsk(text, true)`), butoanele din răspuns nu.
- **Doar mașina** („B 154 UIP") → `doar_masina`: „Ce vrei să afli despre …?" + `PE_MASINA` (numărul scris în fiecare
  întrebare); neînțeles fără mașină → `PE_FLOTA`. Proba cere ca FIECARE buton să fie înțeles. `neinteles(u, fisa, extra)`.
- **Coloanele rapoartelor se citesc DUPĂ NUME (`_col`)**: `runReport` pune „Șofer" pe locul 2 (`_injectDriverColumn`) la orice
  raport care începe cu „Vehicul". Până pe 07.10 AI Raport citea după poziție: „Ce expiră" citea „Efectuat" în loc de
  „Stare" („Nimic nu expiră"), „Ultima locație" scria șoferul în locul adresei, alertele/zonele/disponibilitatea/scăderile
  numărau coloana greșită. Scăderile de combustibil vin din `valori` (raportul `fuel`); „Ultima locație" are `valori`
  (`opritLa`, `ultima`, `deCelPutin` = oprirea ține de la primul punct citit → „de cel puțin"). NU scrie `row[N]` în
  ai_raport.js (păzit). Proba face forma ADEVĂRATĂ: coloanele citite din reports.js + `reports._ajutor.coloanaSofer`.
- **Vechimea locului** („aparatul e fără semnal de 3 zile…") = `semnal: _invSemnalText`, cuvintele Inventarului — NU praguri noi.
- **Fără „gratuit" și fără „fond" în AI Raport** (Alin: „nu e ok să apară asta"): nici pe filă, nici sub răspunsuri, nici în
  texte, nici `gratuit: true` în răspunsul serverului; nici fraza despre fond de sub Scrisoarea de luni. „De ce" → butonul
  RA Insight doar cui îl are (`_areRaInsight(req)`), altfel butoane cu cifre.
- Păzit de `verify_ai_raport.js` (în `npm test`; răspunsurile pe server comparate cu rapoartele „Ultima locație",
  „Staționări", „Scadențe"), `verify_ramuri.js` (preaviz, Reg. 561, 90 h), `verify_insight_ghid.js`.

### Etapa B (08.10): chatul modern — RA Insight, bula din colț și AI Raport (Alin: „da, sunt de acord cu tot")
- **Piesele comune stau O DATĂ în pagină** (lângă `window._insightExtra`): `_chatTextSimplu`, `_chatCopiaza`, `_chatActiuni`
  (Copiază), `_chatUrmari` (întrebările de continuare), `_chatAlege` (lista care se deschide deasupra unui buton: Mașina,
  Perioada, Ramuri, Raport, ⋯), `_chatMasini` (din `/api/devices` — aceeași listă ca harta: fără arhivate, fără demo),
  `_CHAT_PERIOADE`, `_chatPuneInText`, `_chatStareTrimite`. Din 15.10 le cheamă doar secțiunea — bula duce în ea, iar fila AI
  Raport a ieșit (păzit în `verify_insight.js`: nicio a doua casetă). NU scrie a doua variantă în alt loc. Stilurile: `.chat-*`.
- **`_insightExtra(j, laAlegere, parte)`**: `'inteles'` = doar „Am înțeles" (DEASUPRA răspunsului), `'alege'` = doar butoanele
  (dedesubt). Tot o singură funcție pentru toate trei locurile.
- **Întrebările de continuare: o regulă, `aiRaport.urmari(u, primaMasina)`** (ai_raport.js) — perioada dinainte („Și
  săptămâna dinainte?", `_unitate` / `perioadaDinainte`, înțelese de `intelege` prin `DINAINTE`), subiectul care urmează
  (`URMATORUL`), mașina (prima din tabel, `_primaDinTabel`, ori „Și pe toată flota?"). AI Raport le pune în `raspuns.urmari`;
  RA Insight le face din raportul citit ultimul (`_raInsight`, doar cu surse și fără butoane de ales) și le păstrează în
  mesaj (`extra.urmari`). Răspunsul rapid nu le are. Proba cere ca FIECARE să fie înțeleasă cu discuția de după.
- **Butonul „Raport"**: din 15.10, în RA Insight, = rapoartele care se pot cere în cuvinte (`GET /api/insight/rapoarte`, vezi
  „Capitolul 2, pasul 1"). `ALEGERI_RAPORT` (`/api/reports/ai-raport/intrebari` `subiecte`) rămâne doar pentru telefonul vechi.
- **Secțiunea:** stânga `.insp-st` (pe telefon sertar: `st-deschis` + `.insp-umbra`; pe calculator se ascunde: `st-ascuns`)
  — `insightComutaStanga(v)`, `inchideSertar()`; dreapta `.insp-dr-col` = bara `.insp-top` (titlul din `setTitlu()`, ⋯ =
  `insightMeniu`, din 15.10) + `#insp-main` (discuția sau pagina ramurii — renderele ramurilor scriu tot acolo). Fără mesaje =
  salutul cu prenumele (`prenume()`, din `currentUser.full_name`) + caseta + `CARDURI`. „Întreabă orice" (`general`) NU e
  printre ramuri (din 15.10 lista e `pagini()`, sub „Pagini ▸" — vezi „RA Insight, mai simplu").
- ⚠ `.insp-top .insp-meniu` are `.insp-top` în față: `.chat-ib` (mai jos în fișier) l-ar arăta pe calculator.
- ⚠ **Capcană de unealtă, prinsă pe 08.10:** un script Python cu șir NE-brut transformă `\b` din JavaScript în caracterul
  „backspace" — expresia arată la fel, dar nu mai potrivește nimic. Inserările se scriu cu șiruri brute (`r'''…'''`) și se
  caută după fiecare caracterele de control (`grep -P "[\x00-\x08]"`).
- Nu s-au pus „Încearcă din nou" și „Oprește" (ar consuma o întrebare fără ca omul să știe).
- Păzit de `verify_ai_raport.js` (151), `verify_insight.js` (137), `verify_insight_ghid.js`.

### Etapa B+ (08.10): cifrele se verifică, perioada e exactă, consumul greu de crezut e spus (Alin: „da")
- **Regula stă în `cifre.js`** (curat): `numere` (cititorul de cifre, folosit și de Scrisoarea de luni — `ramuri.textulTrece`),
  `negasite(text, date)` (cifrele cu unitate din răspuns care nu se regăsesc în ce au întors uneltele, nici socotite: totalul
  și partea din total ale unei liste, diferențe și procente între locuri DIFERITE, l/100 km, lei pe litru / pe km),
  `perioadaDiferita` (capetele ±1 h; „până acum" = „până acum"), `consumDeVerificat` (3 / 40 l/100 km, camion 10 / 70, preț
  3 / 12 lei, sub 50 km = „prea puțin drum"). NU scrie praguri în altă parte.
- Nu se verifică: întregii ≤ 12, 100 / 90 / 561 / 2006, datele, orele, numerele de înmatriculare și **duratele** (prea multe
  forme: „1h 23m", „83 de minute", „1,4 ore" — o bandă pe o cifră bună strică încrederea). `*`, `_`, `` ` `` se scot înainte
  de citire. Felul cifrei din date îl dă numele câmpului (`_felCheie`), cu **banii întâi**: „pret_litru_lei" e preț, nu litri.
- **Pe server:** `_raInsight` ține tot ce au întors uneltele (`dateCitite`) și perioadele chiar citite (`citite`);
  `_verificaRaspunsul` → `verificare: { perioada?, cifre?, deVerificat? }`, salvată în mesaj (`extra.verificare`) și trimisă
  în răspuns; în audit doar felurile, nu textul. **Răspunsul nu se schimbă** — banda doar spune.
- **Perioada exactă:** `ai_raport._interval` (în `perioadaDin`, înaintea zilelor): „1-7 octombrie", „01.10-07.10[.2026]",
  „de pe / de la / din / între 1 [și | până pe] 7 octombrie", „… până azi"; fără an și în viitor → anul trecut; ultima zi
  întreagă; plafonul `MAX_ZILE`. `insight.perioada` primește și zile („AAAA-LL-ZZ", `to` = ziua întreagă). Unealta
  `combustibil` primește `from` / `to` (`_ramInterval`, cel mult `RAM_INTERVAL_ZILE` = 93) și `period`; ramurile întorc
  `de` / `pana` = ce s-a citit. Până pe 08.10 AI Raport citea „1-7 octombrie" ca „1 iulie".
- **„De verificat" la consum: O socoteală, în `_consumptionMap`** (reports.js) → rapoartele Consum / Costuri / Emisii (legenda,
  `_legendaCuDeVerificat` → ecran, Excel, PDF), ramura Combustibil (`deVerificat` pe mașină → rândul `.sdp-verif`), AI Raport
  (sugestia „De verificat — …"), unealta lui RA Insight (`de_verificat`). NU o socoti a doua oară.
- **Pagina:** din 19.10 banda „De verificat" NU mai există în chat (vezi „Discuția refăcută", mai jos): partea `'verificare'` din
  `_insightExtra` arată doar nota perioadei (`.chat-nota`); problemele vin ca „Am găsit o problemă" (`_chatProbleme`).
- Păzit de `verify_cifre.js` (în `npm test`; 57, cu server pornit și modelul simulat).

### Modelele și „Proba modelelor" (08.10, Alin: „Haiku e slab tare… ce-mi recomanzi după?")
- **Modelele știute stau în `ai.MODELE`**, cu prețurile OFICIALE (USD / milion de tokeni, citite pe 08.10 de pe
  platform.claude.com/docs/en/about-claude/pricing): Haiku 4.5 1 / 5 (cache 0,10), **Haiku 5.5 0,10 / 0,50** (cache 0,01; sub
  100.000 de tokeni pe cerere), Sonnet 5.5 2 / 10 (cache 0,10). `ai.costUsd(usage, model)` — fără model = modelul de bază.
  Un model necunoscut ia prețurile din env (`AI_PRICE_*`). Schimbi prețurile doar după pagina oficială.
- **Modelele 5.x (`gandire: true`) au alt fel de cerere** (`ai._corp`): `thinking: { type: 'adaptive' }`,
  `output_config.effort` = `AI_EFFORT` (implicit „low"), `max_tokens` + `GANDIRE_LOC`. Haiku 4.5 primește cererea veche,
  neschimbată. Textul se citește pe TIP de bloc (`ai._text`): un răspuns 5.x poate începe cu „thinking". NU citi `content[0]`.
- ⚠ **În bucla cu unelte, la 5.x istoricul NU se atinge** (blocurile de gândire sunt legate de tot ce e înaintea lor; o
  schimbare în urmă = 400 pe conturile noi): aceleași instrucțiuni și unelte în toate cererile, cache-ul cozii pus de API
  (`cache_control` pe cerere), blocurile „thinking" trimise înapoi neschimbate, nota „Gata cu interogările" adăugată după
  ultimele rezultate și răspunsul final cu `tool_choice: none`. Haiku 4.5 rămâne pe drumul vechi (semn mutat, notă în
  instrucțiuni). `stop_reason: 'refusal'` → text pe față (`TEXT_REFUZ`).
- **`onUsage(usage, model)`** și `ai_usage.model`: consumul ține minte modelul. **Panourile de cost socotesc pe model**
  (12.10, când Robert a trecut RA Insight pe Haiku 5.5 din Railway, `AI_AGENT_MODEL=claude-haiku-5-5`): în db.js,
  `getAiMonthUsageByCompany` / `getAiUsageByCompany` / `getAiUsageByMonth` adună pe (cheie, model) și întorc `cost_usd`
  (`_strangePeModele` → `_costUsdRand` → `ai.costUsd`, singura formulă); rândurile fără model (de dinainte de 08.10) =
  `MODEL_RANDURI_VECHI` (Haiku 4.5), NU modelul de azi. „RA Insight · control" și istoricul lui citesc `cost_usd` / `costEur`
  de la server; din 19.10 „Dashboard platformă" NU mai arată costul AI (nici tokeni, nici limita veche pe firmă) — doar un rând
  care duce în „RA Insight · control". NU mai înmulți tokeni adunați cu prețul unui singur model.
  Ofertare: „ce rămâne la noi” dintr-un pachet folosește `pachete.COST_INTREBARE_LEI` (Haiku 5.5, capătul prudent al măsurătorii).
- **„Proba modelelor"** („RA Insight · control" → Controale, `raxProbaModele`, blocul între sentinele): rutele
  `/api/admin/insight/proba-modele` (GET meta, POST pornește, GET `/:id`, POST `/:id/opreste`), toate `requireSuperadmin`.
  Răspunde ACEEAȘI funcție, `_raInsight(await _cerereProba(…), res, { proba: { model } })`: cererea e „ca un administrator al
  firmei alese" — ⚠ `allowedImeis` = LISTA mașinilor firmei, NU null (null = toată platforma, ca la super-admin: starea live
  ar fi trimis modelului mașinile altor firme; prins de probă pe 08.10, înainte de livrare) —, fără conversație salvată, fără fondul firmei (`!o.proba && _regulileFonduluiAi`),
  fără răspunsul rapid; consumul pe noi (`company_id` NULL, fel `proba_modele`, în afara `AI_BILLABLE_KINDS`). O probă
  deodată (409), ultimele 5 în memorie, rând în audit `ai_proba_modele`. Pagina NU socotește costuri (doar le adună).
  Se rulează pe firma NOASTRĂ — pe datele unui client doar cu acordul lui.
- **Regulile de scris: `insight.SCRISUL`**, în partea fixă a instrucțiunilor lui RA Insight și în cele ale Scrisorii de
  luni. Un singur loc.
- Păzit de `verify_proba_modele.js` (în `npm test`; 41, cu API-ul simulat în proces și pe server pornit).

### Capitolul 2, pasul 1 (15.10): un singur RA Insight (Alin: „1da 2.da 3. Da", macheta aprobată)
Bula duce în RA Insight, sub salut stă „Azi la tine", rapoartele se cer în cuvinte, fila „AI Raport" a ieșit din Rapoarte,
„Agenți AI" iese din meniu pentru cine are cont RA Insight, Safe Drive se cheamă **RA Drive** („condus & costuri").
- **Bula din colț** (`window.raxToggleAI` = `showView('insight')`): fereastra ei (`#rax-ai-overlay`) și chatul ei au fost SCOASE;
  te duce în secțiune, pe `window._raxConvId`. **Punctul mov** (`#rax-main-fab.are-nou`): `_aziVerifica` (din `updateFabs`, cel
  mult o dată la 5 minute, doar cu `me.aiCont`) cere `/api/insight/azi` și îl aprinde dacă o cheie din `chei` nu e printre cele
  văzute (`localStorage`, cu try/catch — o comoditate); „Azi la tine" desenat le marchează văzute (`window._aziVazut`).
- **„Azi la tine"**: regulile și textele în **`azi_la_tine.js`** (curat; `randuri(d)` → `{ randuri, chei, deVazut }`), datele în
  `_aziLaTine(req)` (server.js, ținut minte 2 min pe om): mașinile tăcute cu **`agents.esteFaraSemnal`** (aceeași regulă ca RA
  Watch, pragul firmei, sub 7 zile; aparatul care n-a transmis niciodată nu e tăcut), ce au scris agenții AZI (`agent_findings`,
  fără „offline", pe mașinile omului), termenele din `_ramMentenanta`, mașinile libere cu **`agents.esteLiber`** (RA Dispatch),
  ieri din curse. Doar agenții porniți la firmă. `GET /api/insight/azi` = `requireAiSeat`; **nu se numără, pe niciun pachet**
  (fără `_numaraRaspunsReguli`, fără model). Noi (super-admin) primim `platforma: true`, gol. Butoanele: `harta`, `intreaba` /
  `raport` (pe reguli, `buton`), `dece` (RA Insight, doar cu AI — `areAi()`), `acte` (ramura, altfel întrebarea). Pagina doar
  desenează (`deseneazaAzi`, textul prin `mdScurt`, care curăță întâi). Din 15.10 (macheta „mai simplu"), vezi mai jos.
- **Rapoartele cerute în cuvinte**: înțelegerea în **`ai_raport.comanda(text, ctx.cmd, fisa, acum)`** — o CERERE = un verb
  (`CERE_RAPORT`: fă-mi, generează, scoate…) + „raport" sau un nume tare (`NUME_RAPOARTE`, `tare`: foaia de parcurs…); o întrebare
  („câți km…", „dă-mi consumul") rămâne întrebare. Fiecare raport din catalog trebuie înțeles după `Fă-mi raportul „<label>”`
  (păzit). Continuările (`urmariComanda`: perioada dinainte, toată flota; mașina aleasă dintre mai multe) merg pe `ctx.cmd`
  (`contextulComenzii`), șters la prima întrebare care nu e cerere. Hotspot și CAN detaliat (`RAPOARTE_CU_ALEGERI`) primesc
  butonul spre Rapoarte. Pe server: **`_insightComanda`**, chemată O DATĂ, întâia în `_raInsight` (înaintea răspunsului rapid; nu
  la proba modelelor) — drepturile Rapoartelor (`viewReports` + `poateRaport`), `_optiuniRaport`, `aiRaport.MAX_ZILE`, iar
  raportul intră în Istoric prin **`_istoricRaport`** — SINGURA scriere în `report_history` din server.js (pagina pe loc, în
  fundal, RA Insight cu `status: 'insight'`; `ZILE_ISTORIC_RAPOARTE` = 7). Se numără prin `_numaraRaspunsReguli` (Start: din 50;
  altfel statistică). Răspunsul: textul + `raport` (cartonașul: id, label, vehicul, perioada, `kpi` din sumar — `_kpiRaport`,
  rânduri, până când), păstrat în mesaj. Butonul „Raport" din casetă = `GET /api/insight/rapoarte` (catalogul, cu drepturi).
- **Pagina**: cartonașul (`cartonasRaport`) cu „Deschide raportul" (`insightDeschideRaport` → Rapoarte, așteaptă catalogul,
  `repViewHistory(id)`) și „Descarcă Excel" (`repExportHistory`); Istoric rapoarte: eticheta `.rh-ins` „din RA Insight". „Rezumă cu
  RA Insight" scrie deasupra raportului (`#rep-rezumat`; `renderReport` îl golește), tot prin `/api/ai/report-summary`.
- **Fila „AI Raport" SCOASĂ** (buton, fereastră, codul `rin*` afară de `rinOpenReport`, care deschide raportul de sub răspunsurile
  RA Insight). `POST /api/reports/ai-raport` și `_aiRaportCore` RĂMÂN: telefonul vechi și RA Insight pe reguli (Start, luna oprită).
- **„Agenți AI" din meniu**: ascuns când `me.aiCont` (`/api/me`: nu super-admin, modulul pornit, `users.ai_seat`). Noi îl
  păstrăm (pragurile platformei). Pagina se deschide și din RA Insight: întâi linkul de sub „Azi la tine" (Alin, 15.10: „da" — varianta
  A; NU pune un rând în Setări), mutat apoi, cu macheta „mai simplu" aprobată, în meniul „⋯" → „Setările agenților".
- **RA Drive**: ce vede omul și ce citește modelul (ramura, unealta `safe_drive`, „Am înțeles", ghidul, pachete.js `DESCRIERE` +
  pagina publică). Numele tehnice rămân (`safedrive`, `safe_drive`, `_sdLuna`). Cine spune „Safe Drive" e înțeles tot de unealtă.
- Ghidul: capitolul `raport_cerut` (în locul lui `ai_raport`), „Azi la tine" în `ra_insight`, drumul spre agenți.
- Păzit de **`verify_un_singur_insight.js`** (în `npm test`; 81, pe server pornit, ZERO cereri către model), plus `verify_ai_raport.js`,
  `verify_insight.js`, `verify_cifre.js`, `verify_insight_ghid.js`, `verify_safe_drive.js`, `verify_site_public.js`.

### RA Insight, mai simplu (15.10; Alin: „ra insight mi se pare greu de utilizat… trebuie să fie ușoară" → macheta, „1. da, 2. da")
**Hotărâri de după (15.10):** (1) **harta (Localizare) rămâne CUM E** — Alin, după simularea „Azi / Propun": „NU. Lăsăm așa cum
este". NU propune din nou simplificarea altor ecrane din proprie inițiativă; doar dacă o cere el, pe un ecran anume. (2) **Asistentul
AI al fondatorilor** (restanți, facturi, cel mai profitabil client) se face **după ce terminăm RA Insight** — macheta din 15.10 e
făcută, dar nu se construiește înainte („hai să lăsăm AI-ul pentru fondator pentru când terminăm RA Insight"). (3) Când explici unde
se vede ceva, spune ÎNTÂI cu ce cont (fondator / administratorul firmei / om al firmei) și dă poze cu locul marcat, nu doar drumul în
cuvinte — „explică ca la proști: unde intru, ce fac, toți pașii".
Pe ecranul gol erau ~35 de butoane și casete; acum ~12. **Nicio funcție nu s-a pierdut: s-a mutat într-un singur loc** — „+", „⋯"
sau „Pagini ▸". NU pune înapoi pe ecran ce a plecat de acolo (al doilea loc pentru același lucru = ce am scos).
- **Salutul:** „Salut, {prenume}! Cu ce te pot ajuta?" (`prenume()`, din `currentUser.full_name`), fără iconița mare și paragraful.
- **Caseta: un singur „+"** (`insightPlus` → `insightAlegeMasina` / `insightAlegePerioada` / `insightAlegeRaport`, Raport doar cu
  `poateRapoarte()`). Sub ea **trei butoane scurte** (`CARDURI` / `CARDURI_REGULI`: `{ t, q }` — pe ecran `t`, pleacă `q`, cu `buton`).
  Fără nota „Vede doar mașinile…" sub casetă (stă în ghid).
- **„Azi la tine": cel mult TREI rânduri** (`azi_la_tine.MAX_RANDURI` = 3, ce cere atenție întâi; ziua de ieri doar dacă mai e loc;
  `deVazut` = câte cer atenție de tot → „N de văzut"). **Un rând = un clic**: `aziPrimul(rd)` = primul buton pe care omul îl poate
  folosi; serverul pune „De ce?" (o întrebare care se numără) DUPĂ butoanele gratuite, iar când e singurul, rândul scrie „De ce?"
  (`.azi-dece`) — omul trebuie să știe că se numără. Numele agentului = doar `title`.
- **„⋯" (`insightMeniu`, sus în dreapta):** Pachet și conturi (doar `esteAdmin()` cu pachet), Notițele firmei, Setările agenților
  (cu modulul `agents` și `viewReports`), Ghidul aplicației, Redenumește / Șterge conversația (cu una deschisă); pe telefon și
  „Conversație nouă". Nota despre păstrarea conversațiilor = al 5-lea argument al `_chatAlege` (`nota`); `sep` pe un rând = linie
  deasupra. Iconița de notițe, pastila pachetului de sus, butonul de închidere și ✎ de pe telefon au fost SCOASE.
- **Stânga:** Conversație nouă, „Caută în conversații" (un rând → caseta), conversațiile pe zile, **„Pagini ▸"** (`pagini()` =
  ramurile livrate, fără `general` și fără `meniu: true` — ghidul stă în „⋯"; închise, cu suma numerelor; deschise când stai pe una —
  `insightPagini`, `paginiDeschise()`) și **un rând cu pachetul** (`deseneazaPachet`: `nume · scurt`, amănuntul — `text`, `textOm`,
  `reincarcare` — în `title`; administratorul ajunge din el în „Pachet și conturi"). Regula veche, pe cont, tot pe un rând (textele ei
  rămân: „oprit până pe …, fără niciun cost în plus"; „Un cont în plus aduce încă N" în `title`).
- **Contorul fondatorului** (Alin: „nici nu văd contorul… chiar dacă am admin de fondator"): fără pachet și fără limită, `textContor`
  dă „Fondator · fără limită" (`S.fondator` = `currentUser.isSuper`; un client pe regula veche nelimitată: „Fără limită") — jos și
  lângă casetă (`S.contor`).
- **Răspunsul:** „Am înțeles" = **titlu scurt** (`_insightExtra` partea `'inteles'` → `.ins-tit`, ce vine din discuție cu creierașul
  mov), cel mult **două** butoane spre rapoarte (`surse.slice(0, 2)`), Copiază · 👍 · 👎 · „Din raportul…" la trecerea cu mouse-ul
  (`.insp-a .chat-act` opacity; la vedere sub `@media (hover: none)` și când 👍/👎 e dat). Sub un raport cerut (`cuRaport`): doar
  cartonașul, fără titlu și fără text; ce trebuie știut (perioada tăiată, raportul oprit înainte de capăt) vine de la server în
  `raport.note` și se scrie în cartonaș. Mesajul pachetului (`.chat-lim`): „Alege ce vrei să afli" (= „+") și, la administrator,
  „Vezi pachetele".
- Telefonul (aplicația lui Robert) rămâne cum e până la APK-ul următor. Păzit de `verify_un_singur_insight.js` (secțiunea 3),
  `verify_insight.js`, `verify_pachete.js`, `verify_insight_ghid.js` (ghidul spune „+", „Pagini", „Mai multe").

### Discuția refăcută (19.10; Alin, cu șase poze: „plină de erori… ceream bani înapoi" → macheta, „1. da", „4. da")
Nouă cauze, toate în aplicație. Reparațiile și regulile lor — NU le strica la loc:
- **„Am găsit o problemă" în locul benzii „De verificat"** (Alin: „ce să verific? Am AI… îmi zice clar dacă e greșit ceva… mă duce
  exact unde e problema"). Regulile și textele stau în **`probleme.js`** (curat): `sursaConsum` (măsurat / „NU e măsurat… socotit din
  fișă" — o cifră socotită nu se mai prezintă ca măsurată), `nivelBlocat` (≥ 100 km, nivelul variat sub 1,5 L), `problemaSenzor`,
  `problemaConsum`, `pragViteza` (fișa → 130 / 90), `verdictViteza` (reală = ≥ 2 poziții la rând peste prag sau drumul se leagă; eroare
  de GPS = un punct singur, iar din poziția dinainte în cea de după mașina a mers încet), `problemaViteza`, `campuriCerute` /
  `problemaFisa`, `ordoneaza` (cel mult 4, roșii întâi). Datele le citește O funcție, **`_problemeDinRaport`** (server.js), chemată de
  rapoartele cerute în cuvinte și de unealta `run_report`; senzorul și consumul vin și din unealta `combustibil`. Butoanele: `traseu`
  (`insightLaTraseu` — mașina, intervalul, traseul arătat, punctul marcat), `fisa` (`openEditModal` + fila), `raport` (`rinOpenReport`).
  NU scrie „merită verificat" / „verifică în raport" nicăieri în chat.
- **Cifrele, verificate fără să-l punem pe om la treabă:** `cifre.negasite` citește datele VALOARE CU VALOARE (textul JSON întreg lipea
  „40,137" = viteza medie + maximă), o celulă „12.53" = 12,53 (`_numarCelula`), adună pe mașină, pe zi și pe mașină + zi. Sumele le dă
  aplicația și modelului: **`insight.totaluriPeMasina`** → `pe_masina` / `pe_masina_si_zi` (pe TOATE rândurile; modelul vede doar 25), prin
  **`_raportPentruModel`** (aceeași formă pentru `run_report` și pentru rapoartele făcute deja). O cifră negăsită → **RA Insight își
  rescrie O DATĂ răspunsul** (aceeași întrebare, un rând de consum); rămasă negăsită → problema `cifra` „Nu am găsit în rapoarte: …".
  Toate găsite → `verificat` („✓ Cifrele le-am luat din rapoarte"). Perioada citită ≠ cerută → `nota`.
- **Rapoartele cerute în cuvinte** (`ai_raport.comanda(text, cmd, fisa, acum, discutie)`): toate formele numelor („foii", „foilor",
  „situației zilnice"); **`zileleDin`** = mai multe zile într-o cerere (câte un raport pe zi, cel mult `MAX_PERIOADE` = 4; un interval
  e O perioadă); mașina rămâne din cererea de dinainte sau din discuție (`ctx.masini`) până la „toată flota"; ziua scrisă rămâne în
  `context` la „Ce raport vrei?" și o ia butonul ales. **„compară" / „de ce" (`PENTRU_INSIGHT`) = `analiza`**: `_insightComanda` face
  rapoartele și întoarce `{ dupa }`; `_raInsight` le dă modelului în instrucțiuni („RAPOARTE FĂCUTE ACUM") și răspunde cu `rapoarte` +
  analiza (o întrebare). Fără AI (Start, luna oprită, cheia lipsă, fondul) — `doarRapoartele`: cartonașele + de ce nu vine analiza.
- **Textul unui raport cerut poartă cifrele de sus** („Curse: 1 · Distanță totală (km): 69"), iar instrucțiunile spun că mesajele „Am
  făcut raportul…" sunt ale APLICAȚIEI și sunt reale — fără ele, modelul credea că a mințit („o corecție…").
- **`list_vehicles` poartă fișa mașinii** (marcă, model, an, combustibil, rezervor, consumul din fișă, `necompletat`). Anul înmatriculării
  nu se ține; se ține anul fabricației.
- **ECHIPAMENTUL e treaba NOASTRĂ (Alin, 19.10: „nu trebuie să ne învinuim pe noi… «păi voi nu ați verificat dacă are, eu vă plătesc»"):**
  RA Insight NU-i cere clientului să verifice / repare / ceară echipament (senzori, aparatul, montajul, legătura cu calculatorul mașinii)
  și nu pune o cifră lipsă pe seama lor — spune doar faptul („consumul e socotit din fișă, nu măsurat"); „Ce să faci" = numai ce face omul
  singur (fișa, alertele, un raport, discuția cu șoferul). Regula stă O DATĂ, în `insight.ECHIPAMENTUL`, pusă în instrucțiunile lui RA
  Insight, ale lui „Rezumă cu RA Insight", ale rezumatului agenților și ale Scrisorii de luni (20.10 — rezumatele n-o aveau), iar textele aplicației
  (`probleme.js`: `sursaConsum`, `problemaSenzor` — galben, „Consumul la X nu se poate măsura acum", fără „Calibrarea rezervorului") la
  fel. NU scrie „senzorul e blocat / necalibrat", „mașina nu trimite", „verifică dacă are senzor" în ce vede clientul. La fel la AGENȚI
  (`agents.js`: offline → „sună șoferul", tahograful → doar cardul de companie, km fără bord → „pune scadența pe dată"; fără „verifică
  dispozitivul / SIM-ul / cablajul / interfața CAN") și pe paginile publice (fără „cablu / setare lipsă la montaj"). Păzit de `verify_discutia.js`.
- **Literele din alt alfabet** („октомбrie"; Alin, 20.10: „sunt fatale pentru noi"): **O regulă, `litere.js`** (curat) — orice alfabet
  în afară de cel latin (rus, grec, chinez, arab…), literele „late" și ş/ţ cu sedilă (→ ș/ț); chirilicul se transcrie pe sunete, iar
  unitățile ca la noi (`UNITATI`: „120 км" → „120 km", NU „120 cm"); ce nu se poate transcrie se scoate. **`ai.js` o pune pe ORICE
  răspuns al modelului** (`callClaude`, `runAgent`; nu `readImage` — transcrierea actelor clientului rămâne întocmai), deci și pe drumurile
  noi. **`brut: true` DOAR în `_raInsight`** (răspunsul dintâi și rescrierea), ca literele să ceară întâi o rescriere O DATĂ (aceeași cu cea
  pentru cifre); la capăt `reply = insight.litereRomanesti(reply)`, mereu. `insight.js` doar o dă mai departe (n-are tabelul lui). Mesajele
  salvate se curăță la citire (răspunsurile, nu ce a scris omul) și în istoricul pentru model (`istoricPentruModel`); scrisorile la citire.
  Scrisul (`insight.SCRISUL`) cere numai litere românești. Păzit de **`verify_litere.js`** (în `npm test`; pe server pornit: „Rezumă",
  rezumatul agenților, RA Insight, conversația redeschisă) — NU pune a doua cale spre model fără ai.js și NU da `brut: true` altundeva.
- **Insignele, ca ANTET (Alin, 19.10, din cinci variante pozate: „varianta 1 — antetul"): O regulă, `pachete.insigna(fel, { numarat,
  live })`** → `{ fel, nume: 'RA Insight', eticheta: 'Analiză' | 'Instant', detaliu, text }`: deasupra răspunsului „RA Insight", eticheta
  cu chenar subțire, fără fundal (ANALIZĂ mov `#6d28d9` / INSTANT verde `#166534` — #15803d ieșea sub 4,5 la literele mici), detaliul gri
  („1 întrebare" — nu la noi și nu la probă —, „din rapoarte", „din datele de acum", pe Start „1 răspuns"). Fără „bonus", „gratuit", „nu se
  scade". Serverul o pune pe fiecare răspuns; pagina doar o desenează (`_chatInsigna`, PRIMA în bulă, cu textContent, fără niciun cuvânt
  al ei). Mesajele salvate pe 19.10 înainte de antet ({ fel, text }) se completează la citirea conversației (`pachete.insignaCompleta`);
  mesajele de dinainte de 19.10 n-au insignă — NU le-o ghici în pagină.
- **„RA Insight · control" (fondatorii):** rândul sus în meniu (nu într-un grup; grupul se cheamă „Module"), `_RAX_NUME.agents`. Pagina:
  `_aiuPachete` (4 cifre) → `_aiuAtentie` (plasa, întrebările terminate, 👎 7 zile — `db.aiJosPeFirma`, doar numărul —, partea instant)
  → `_aiuTabel` (un rând pe firmă, `raxAiRand` deschide amănuntul; jos, de unde dă firma conturile — `_aiuUndeConturi`: pe pachet din
  „Pachet și conturi", pe regula veche din Utilizatori) → `_aiuControale` → istoricul (buton). **Panoul vechi „Mai multe cifre" a ieșit
  pe 19.10** (punctul 5, cu Alin): `_aiuKpiuri`, `_aiuCard`, `_aiuTendinta`, `_aiuSageata`, `_aiuStare`, `raxAiToate`, `raxAiMaiMulte`.
  Telefonul de azi încă le arată: formulele lor stau ca REFERINTA în `verify_insight_bani.js` (copiate întocmai), până la APK-ul cu
  pagina nouă. NU pune panoul înapoi în pagină (proba pică).
- „Proba modelelor" primește `verificare: { perioada, cifre, rescris }` (doar la probă) — câte răspunsuri au avut cifre greșite.
- **Rămase la Alin, după acestea** (19.10: „5 și 6 lasă-le după"): (5) ce e vechi pe pagina noastră — făcut pe 19.10 (panoul vechi,
  costul AI din „Dashboard platformă", „din Utilizatori" în amănunt); (6) „atribuirea, mesajul, dă atribui" = **pasul 2 al Capitolului
  2, „RA Insight face, cu Da-ul tău"** (atribuie șoferul, „Am vorbit cu el", alertă, revizie, raport programat + potrivirea șoferilor),
  aprobat ca ordine pe 15.10; macheta aprobată pe 21–22.10; **partea 1 (șoferii pe mașini) construită pe 22.10** — vezi „Pasul 2,
  partea 1", mai jos. Părțile 2 și 3 (alerta, „Am vorbit cu el"; revizia, actul, raportul programat) — neîncepute, una câte una.
- **Proba modelelor din 21.10 (Robert, pe ratrack.ro) → Haiku 5.5 rămâne (Alin, 22.10: „DA"; 0,48 bani pe întrebare, Sonnet 5.5 6,65).**
  Reparațiile ei (cele 3 greșeli ale lui Haiku veneau din aplicație) — NU le strica la loc: `insight.celeMaiMari` (cele mai mari 5
  valori pe coloană, din TOATE rândurile, în `_raportPentruModel` → `cele_mai_mari`); `RAPOARTE_FARA_MODEL = ['analytic']` (lista de
  5.000 de poziții nu e pentru totaluri); unealta `combustibil`: unde consumul nu e măsurat → `alimentari_si_scaderi` „nu se pot vedea" și
  fără `norma_din_fisa`; vitezele: `run_report` speeding cu pragul din fișă (`probleme.pragViteza`) + `prag_raport` („nu e limita legală");
  `cifre.negasite(text, date, intrebare)` acceptă procentele din întrebare; `insight.vorbeDespreEchipament` cere o rescriere în `_raInsight`
  (ca literele); `_ramInterval`: de pe 1 până azi se compară cu aceleași zile din luna dinainte. **Contorul corecturilor (garanția B):**
  `db.noteazaCorectura` (tabela `ai_corecturi`, doar numere) → `pachete.corecturi` în `/api/admin/ai-usage` → rândul din „Ce cere atenție".
  Proba de noapte (A) NU se face (Alin: „ne costă"). Păzit de `verify_proba_reparatii.js`.
- Păzit de **`verify_discutia.js`** (în `npm test`; discuția lui Alin pe server pornit, modelul simulat), `verify_cifre.js`,
  `verify_insight.js`, `verify_un_singur_insight.js`, `verify_pachete.js`, `verify_insight_ghid.js`, `verify_acasa.js`.

### Pasul 2, partea 1 (22.10): ȘOFERII PE MAȘINI — „RA Insight face, cu Da-ul tău" (Alin: „da" la flux; „Da"-ul nenumărat; de la Basic)
Construit după macheta din 21.10 (PDF-ul „Proba modelelor, garanția și machetele", capitolul 3: M1, M2, M4, M5). RA Insight
PROPUNE, omul apasă „Da", aplicația face — pe calea și cu drepturile ecranului. Următoarele părți (aprobate ca ordine): (2) alerta și
„Am vorbit cu el"; (3) revizia, actul, raportul programat. Fiecare cu probele ei, livrată separat — NU le construi fără să o cerem.
- **Regulile și textele stau în `soferi_masini.js`** (curat): `categoriaCeruta` (din „Categorie": Auto / Dubă → B, Camion → C, TIR /
  Autotractor → CE, Autobuz → D, Motocicletă → A1; masa maximă din „Config Camion" peste 3.500 kg → C1, peste 7.500 → C; autobuzul cu
  cel mult 16 locuri → D1; remorcile / grupul electrogen n-au șofer; utilajele și tractorul n-au o categorie anume), `ACOPERA` / `acopera`
  (CE cuprinde B și C; categoriile vin din `license_cats.js`, sursa lor unică), `verdict` (expirat / nepotrivit / bun / „expiră curând" /
  categoriile lipsă — zilele și datele cu `ramuri.zilePana` / `zz`, ca „Mentenanță & acte"), `analiza` (ce e de rezolvat, în regulă, de
  completat, liberii, propunerile), `propunerePereche` / `propunerePentru` / `propunereScoate` (cartonașul), `gata`, `pasulUrmator`,
  `cerere` (în cuvinte). NU scrie a doua regulă de permise sau de categorii.
- **Propunerile:** întâi mașina cu cei mai puțini șoferi liberi potriviți (CE înaintea lui B), apoi cea pe care șoferul ales a mai fost
  trecut (`aMaiFost`: cel puțin o oră — o greșeală îndreptată sau un „Anulează" nu contează; rândul „de dinainte" `de_la = 0` da), apoi
  cel mai puțin „prea calificat". Cel scos de pe o mașină cu permisul nepotrivit devine liber („după ce iese de pe…"); permisul expirat
  fără altul liber → „Îl scot de pe mașină". Cerut pentru o singură mașină, un șofer de pe altă mașină se MUTĂ pe față (cartonașul o
  spune) — niciodată pe două mașini. „Șoferi liberi" = netrecuți pe NICIO mașină din TOATĂ firma (`db.soferiPentruPotrivire`).
- **Cererea în cuvinte** (`cerere`, pe reguli): verbul de schimbare + un șofer + o mașină („Pune-l pe Mihai pe B 77 TIR"), „Propune un
  șofer pentru …", „Scoate-l pe … de pe …", „potrivirea șoferilor". Șoferul se scoate din text ÎNAINTEA căutării mașinii (altfel numele lui
  găsea mașina lui). „Pune-mi raportul…", întrebările și trecutul („cine l-a trecut…") NU sunt ale ei: `_insightSoferi` (O DATĂ, întâia în
  `_raInsight`, înaintea lui `_insightComanda`) întoarce `false` și ele merg mai departe — pachetul se verifică DUPĂ ce cererea e chiar
  despre șoferi (altfel, pe Start, „Pune-mi raportul…" primea refuzul pasului 2). Un „da" scris (`eDaScris`) aduce din nou cartonașul
  (`ctx.propunere`); doar butonul aplică.
- **Starea: tabela `insight_actiuni`** (a omului, `user_id` în WHERE; `date.card`, `date.schimbari`, după aplicare `aplicate` / `gata`),
  stări `propusa → aplicata | refuzata | expirata | esuata`, `aplicata → anulata`. Trecerea O DATĂ: `db.treceActiuneInsight(id, user,
  dinStare, …)` (UPDATE … WHERE stare = dinStare) — două apăsări deodată = una. `ANULARE_MIN` = 10, `PROPUNERE_ORE` = 24. Conversația
  redeschisă primește starea de acum din rând (`_cardPublic`: `apasat`, `ramasMs` — ceasul paginii pornește de la server, nu de la
  calculator). În `BACKUP_EXCLUDED`; se șterg la 12 luni, cu discuțiile.
- **Aplicarea: O funcție, `_aplicaSoferi(req, schimbari, o)`** — fiecare schimbare verificată pe starea de ACUM (mașina accesibilă și a
  firmei, șoferul de acum = `deLa`, șoferul nou din firma mașinii — `db.soferAlFirmei` — și netrecut pe altă mașină), apoi
  `db.assignDevice(imei, la, d.group_id)` (grupa de ACUM, altfel s-ar șterge), audit `assign` cu `prin: 'RA Insight'` și textul.
  „Anulează" = aceeași funcție pe schimbările inverse, în ordine inversă. Rutele: `GET /api/insight/soferi-masini` (pagina),
  `POST /api/insight/soferi-masini/aplica` (doar propunerile de ACUM bifate, în ordinea lor), `POST /api/insight/actiuni/:id/aplica`
  (cu `la` = alt șofer DOAR din `alternative`), `/refuza` (nu schimbă nimic, fără drept de editare), `/anuleaza`. „Da" / „Aplică" /
  „Anulează" = `requireEdit('vehicule')` (ca butonul din fișa mașinii); toate de la Basic (`requireRamuri`). NIMIC nu se numără.
- **„Azi la tine":** rândurile `insight` (nu un agent — nu se opresc cu agenții): permisul expirat (roșu), cel nepotrivit, mașina rămasă
  fără șofer în ultimele 30 de zile (`RECENT_ZILE`; cea fără șofer dintotdeauna stă doar în pagină), cu „Propunere ›" (o cerere pe
  reguli); mai multe de un fel = un rând strâns, spre pagină (`fel: 'pagina'`). Permisul expirat al unui șofer trecut pe mașină iese din
  termenele lui RA Care (stă o dată). Numărul de lângă pagină (`/api/insight/ramuri` → `soferi`).
- **Pagina:** ramura `soferi` (`pachet: true`), `deseneazaSoferi`; cartonașul `cartonasPropunere` (Da / Schimbă / Nu, „Gata" cu
  „Anulează", `adaugaUrmator`); stilurile `.chat-prop*`, `.chat-gata*`, `.ssm*`, `.azi-prop`, cu pereche pe tema închisă. Textele vin de la
  server și se pun ca TEXT — îngroșatul din „Gata" prin `textGros` (noduri `<b>`), NU `innerHTML` (nici cu `mdScurt`): blocul stă între
  ramuri, pe care `verify_safe_drive.js` le păzește. Pagina nu socotește nimic. Ghidul: capitolul `soferi_masini`. Telefonul — la APK-ul
  următor (Robert).
- **Și ruta veche a ecranului verifică firma (23.10, Alin: „da"):** `PUT /api/devices/:imei/assign` și `/group` trec prin
  `_soferGrupaAleFirmei(imei, sofer, grupa, req)` — șoferul și grupa trebuie să fie ale firmei mașinii (altfel 404, „Șoferul ales nu e în
  firma acestei mașini." / „Grupa aleasă nu e a firmei acestei mașini."); grupele platformei (`company_id` NULL) doar la super-admin. Iar
  numele șoferului din rapoarte (`reports.deviceNames`) și din fișa mașinii (`db.getDeviceFull`) vine doar dintr-un șofer al aceleiași firme
  (`dr.company_id IS NOT DISTINCT FROM d.company_id`). O cale nouă care trece un șofer sau o grupă pe o mașină verifică la fel.
- Păzit de **`verify_soferi_masini.js`** (în `npm test`; 91, pe server pornit, ZERO cereri către model; secțiunea 5 = ruta veche), `verify_insight_ghid.js`.

### „Anunță echipa RA Track" (23.10; Alin, 22.10: „da" la flux, „te sunăm în cel mult o zi lucrătoare", cererile le preiau amândoi, cu „Preiau")
Capitolul 4 al machetei din 21.10 (E1–E5). **Aparatul e treaba NOASTRĂ** (19.10): clientul nu e trimis să verifice nimic — are un
singur lucru de făcut, să ne anunțe; aplicația pune singură în cerere mașina, problema și datele aparatului.
- **Regulile și TEXTELE stau în `cereri_echipa.js`** (curat; un formatator ținut minte): `curata` (ce primește serverul; `ce` doar la
  consum), `lipsa`, `titlu` („Nu transmite de 3 ore"), `durata`, `ceSemnal`, `confirmare`, `seOcupa`, `pasi` (trimisă → preluată →
  programată → rezolvată; „Programată" sărită = „n-a fost nevoie să venim la mașină"), `pentruClient` (FĂRĂ datele aparatului),
  `pentruNoi` (cu `dateAparat`, `pareRezolvata`, butoanele după stare), `mesajProgramare`, `ziLucratoareDupa`, `anuntNoi` / `emailNoi`,
  `anuntClient` / `emailClient`, `TERMEN`, `DATE_TRIMISE` (o promisiune: doar ce chiar trimitem). NU scrie texte de-ale cererilor în
  pagină sau pe telefon.
- **O SINGURĂ cale pentru o cerere nouă: `_cerereNoua(req, body)`** (server.js), chemată de `POST /api/cereri-echipa` și de ruta veche
  `/api/support` (telefoanele de dinainte; acum o cerere „de pe telefon", fără mașină). Datele aparatului le adună SERVERUL
  (`_cerereAparat`: model, IMEI, cartelă, ultima poziție, semnal, alimentare, rezervor, de când transmite, instalatorul din stoc); cine
  trimite (`_cerereContact`: numele, emailul și rolul din fișă, telefonul din fereastră). Mașina: `canAccessImei`, a firmei omului,
  nearhivată, fără demo; noi (super-admin) nu trimitem cereri; cel mult `LIMITA_ORA` (10) pe oră de om; demo-ul e blocat (`_demoBlocked`).
- **O cerere deschisă pe mașină și problemă** (indexul parțial `uq_cereri_echipa_deschisa`): a doua → 409 „Echipa RA Track se ocupă
  deja de asta: cererea nr. N." „Ceva nu merge la aparat" pe o mașină care nu transmite devine „Nu transmite" — aceeași regulă ca în
  caseta din RA Insight (`agents.esteFaraSemnal`, pragul firmei), ca să nu fie două cereri pe același lucru.
- **La noi, pe loc:** anunț `cerere_echipa` (`_anuntaSuperadmini`, `data: { cerere, cerereId, pentru: 'noi' }`, fără date tehnice) +
  emailul la contact@ (`_adresaSuport`: `SUPPORT_EMAIL` → setarea `support_email` → expeditorul, noreply@ → contact@), cu „Răspuns la"
  = omul, subiectul „Cerere N · firma · mașina · problema" și „Datele aparatului" (în „Trimise" cu felul `suport`, ca ruta veche). **La client, la fiecare pas** (preluată / programată /
  rezolvată): `_cerereLaClient` → anunț `cerere_<pas>` (`pentru: 'client'`) + email (felul `cerere` în „Trimise").
- **Trecerile, o singură dată** (`db.treceCerereEchipa(id, dinStari, patch)`, UPDATE … WHERE stare = ANY): `POST
  /api/admin/cereri-echipa/:id/preiau | programeaza | rezolvat | redeschide` (super-admin; a doua apăsare → 409 „Cererea a fost deja
  preluată (…)."). „Programez": ziua (de azi încolo, propusă = următoarea zi lucrătoare), intervalul (`INTERVALE`), instalatorul,
  mesajul (gol = `mesajProgramare`), „în calendar". „Rezolvat" cere textul pentru client. Redeschiderea nu anunță clientul.
- **Intervențiile în Calendarul de montaj** (`db.interventiiCalendar` → `_mjcInterventie` → `interventii` în `/api/montaj/calendar`):
  îl țin ocupat pe instalator (`montaj.incarcarePeZile`), dar NU sunt lucrări de montaj — nu intră în contract, în „de programat", în facturi.
- **Pagina (client):** blocul „Anunță echipa RA Track" (după „Distribuie locația") — O fereastră (`#ce-ov`: „Cerere nouă" / „Cererile
  tale · N", confirmarea cu pașii), O cerere de trimitere, textele de la server ca TEXT (fără innerHTML). Trei uși: butonul `echipa` din
  casetele RA Insight (`insightProblemaButon` → `echipaDeschide`, cu `ce` = ce a scris aplicația), rândul `#detail-echipa` din fișa
  mașinii (`echipaDinFisa`), iconița cu căști (`openSupport`). După trimitere, caseta spune „Echipa RA Track se ocupă · …"
  (`_echipaInlocuieste`); la desenare, `_echipaSeOcupa` cere `/api/cereri-echipa/deschise` (doar firma omului). Butonul `harta` duce pe
  hartă, pe mașină. Fereastra veche „Suport clienți" (cu un telefon și un WhatsApp care nu erau ai noștri) a fost SCOASĂ din
  `map-tools.js` — NU o pune la loc.
- **Pagina (noi):** Business › „Cereri de la clienți" (`admin-tab-cereri`, `raxLoadCereri`, blocul între reperele „Cereri de la clienți"):
  Deschise / Rezolvate / Toate, datele aparatului „doar pentru noi", „Pare rezolvată singură", Preiau / Programez / Rezolvat / Sună /
  Deschide firma / Redeschide (butoanele de la server; formularele sub cerere). Bulina `#nav-cereri-nr` = cererile nepreluate. Anunțurile:
  `notifCerere` (noi → listă, client → „Cererile tale").
- Ghidul: capitolul `suport`. Telefonul — la APK-ul următor (Robert). Tabela `cereri_echipa` e în `BUSINESS_TABLES`.
- **Bula RA Insight nu stă peste fișa mașinii (23.10):** pe calculator, cât fișa e deschisă pe hartă
  (`body.detail-open:has(#view-localizare.active)`), `#rax-fabs` trece în stânga ei (`--detail-width` + 16 px; 320 px între 821 și
  900); pe ≤ 820 px se ascunde. Schimbi lățimea fișei → schimbi și regula. Măsurat în browser la 1280–1920 px.
- Păzit de **`verify_cereri_echipa.js`** (în `npm test`; 80, pe server pornit, cu Brevo fals), `verify_proba_reparatii.js` (ruta veche),
  `verify_insight_ghid.js`, `verify_mail.js` (rândul din meniu, felul `suport`), `verify_discutia.js` (butoanele casetei).

## Ofertare Live — DE CONTINUAT (customizare)
Secțiunea **Administrare → Business → Ofertare Live** e funcțională, dar **nu e terminată** — se va reveni
pentru personalizare. Ce există deja, ca să nu se refacă din greșeală:

- **Monedă dublă:** toate sumele apar în lei ȘI euro, la cursul dat de `GET /api/fx`. Clientul are
  `window.raFx()` → `{ eur, date, sursa }`.
- **RA Insight se vinde în PACHETE pe firmă** (din 14.10, pasul 5) — vezi „Pachetele RA Insight" mai jos. Grila pe cont după
  mărimea flotei a ieșit din ofertă; ofertele VECHI, pe cont, se redeschid pe Basic (de verificat prețul înainte de salvare).
- **Cei 6 agenți NU se facturează** (reguli fixe, zero tokeni). Scoși din calculator; `pAiAg` = 0.
  ⚠️ Au rămas în panoul de abonament per companie (`custom_plan.aiAgentsRON`) — decizie separată,
  ar schimba facturarea unor clienți existenți.

### Pachetele RA Insight (Alin, 14.10, capitolul 1) — pașii 1–7 GATA (regula, chatul, conturile, tabloul, oferta, trecerea, site-ul)
RA Insight se vinde în **pachete fixe pe FIRMĂ** — **Start** 0 lei (inclus: DOAR administratorul, 50 de răspunsuri pe butoane,
fără AI, fără ramuri) · **Basic** 10 lei (2 conturi, 200 de întrebări, ramurile) · **Pro** 20 lei (până la 5 conturi, 600,
împărțirea pe oameni, analiza aprofundată) · **Business** 30 lei (conturi nelimitate, 1.000). Se reîncarcă pe 1; FĂRĂ pachete de
întrebări în plus; pe ecran „Pachet RA Insight Pro", NU „Plan". Platforma rămâne fără planuri (ofertă → contract → abonament pe
mașină). Ordinea construcției (aprobată): 1 regula ✅ · 2 chatul ✅ · 3 „Pachet și conturi" ✅ · 4 tabloul nostru ✅ · 5 oferta,
contractul (prețurile pachetelor + clauza de trecere), factura (rând fix, pe zile) ✅ · 6 trecerea din aplicație (confirmare cu
bifă, PDF pe email, fără Stripe) ✅ · 7 pagina pachetelor (aplicație + site, pe site FĂRĂ prețuri, „Cere ofertă") ✅ · 8 telefonul.
- **Regula stă O DATĂ în `pachete.js`** (curat): `PACHETE`, `pachetFirma(settings, limitaVeche)` (fără nimic scris = Start;
  `ai_quota` cu întrebări pe cont / cotă fixă sau `companies.ai_monthly_limit` = regula VECHE → null, o citește codul vechi),
  `refuzLoc` (Start doar administratorul; conturile pline → drumul spre pachetul următor), `refuzLimita`, `stare` (motivele, în
  ordine: plasa → cota firmei → limita omului → partea la comun; limita și partea la comun doar cu `peOm`), `alegeModel`, textele
  (`textBlocat`, `textDoarButoane`, `textRamase`, `textScurt`, `textOm`, `ramaseAfisate` — la plasă ecranul arată 0),
  `DESCRIERE` / `publice` (ce primește fiecare pachet — pentru aplicație ȘI site; analiza aprofundată doar cât e pornită; pe site
  fără prețuri). NU scrie a doua cifră de pachet sau al doilea text în pagină ori pe telefon.
- **Pe server:** `_starePachet(companyId, userId, { strict })` adună cifrele (întrebările AI din `ai_usage`, pe Start răspunsurile
  din `ai_reguli`, limitele, costul REAL al lunii `db.costAiLunaFirma` × `ai.USD_EUR` × cursul) → `pachete.stare`.
  `aiQuotaState` → `_cotaDinPachet` (FĂRĂ bani: costul și plasa nu pleacă la client). Pe Start și când luna s-a oprit, RA Insight
  răspunde pe reguli: `_insightPeReguli` → `_aiRaportCore` (ACELAȘI motor ca fila AI Raport; ruta doar îl cheamă). Pe Basic+,
  `buton: true` (cartonașe, continuări, alegeri, caseta făcută doar din butoane) încearcă întâi regulile — nu se numără; ce nu
  înțeleg merge la model. După un răspuns AI, `ctx.ar` = contextul pe reguli al ultimului raport (continuările merg pe reguli).
- **O SINGURĂ numărătoare a răspunsurilor pe butoane: `_numaraRaspunsReguli`** (chat, ruta AI Raport, „Rezumă raportul", rapoartele cerute în cuvinte); doar ea
  scrie `ai_reguli` (în afară de ruta de probă). Pe Start se numără din 50; la celelalte, doar pentru statistică. Păzit prin numărare.
- `requireAiSeat` și `/api/ai/quota` dau singure locul administratorului pe o firmă cu pachet fără niciun cont (`_asiguraLocAdmin`;
  și scrisoarea de luni). Fila AI Raport pe o firmă cu pachet: `_poartaReguliPachet` (cont RA Insight; pe Start, din 50). Pe regula
  veche, AI Raport rămâne al tuturor.
- **Ramurile: `requireRamuri`** pe cele 8 rute (de la Basic). Tura de noapte Safe Drive doar la firmele cu ramuri; scrisoarea de luni
  pe Start = pe reguli, fără Safe Drive; rezumatul agenților nu cheamă modelul pe Start (`_firmaAreAi`).
- **Plasa = 80% din prețul pachetului** (`PLASA`), din costul real; analiza aprofundată (`MODEL_APROFUNDAT`, implicit Sonnet 5.5)
  doar la Pro / Business, doar pornită (`ai_analiza_aprofundata`, `GET/PUT /api/admin/insight/aprofundat`, OPRITĂ până după
  probă), doar la `aiRaport.PENTRU_INSIGHT`, cât ține bugetul (cu `REZERVA_APROFUNDAT_LEI`).
- **Pachetul îl punem NOI:** fila „Acces" a firmei (`raxCfgPachet` → `PUT /api/companies/:id/settings { ai_pachet: { cod } }`,
  doar super-admin, `curataPachet`, 400 pe cod necunoscut, scoate `ai_quota`, rând în audit de la cât la cât). Limita pe om:
  `PUT /api/users/:id/ai-limita` (administratorul firmei; Pro / Business; suma ≤ întrebările pachetului; stingerea locului o șterge).
- `plans.FEATURE_IMPLICIT.ai_assistant = true` (Start inclus la toate firmele); unde l-am oprit noi, rămâne oprit. „Asistent AI"
  (suma fixă veche din `custom_plan`) se plătește DOAR unde modulul e pornit de noi (`featuresSetate`), și în previzualizarea din
  „Abonament & plăți" (`_raxClientPrice(…, setate)`).
- **Pe ecran** (blocul „secțiunea RA Insight"): `incarcaPachet` / `deseneazaPachet` / `actualizeazaCaseta` (doar textele serverului:
  `pachet.text`, `scurt`, `textOm`, `reincarcare`), ramurile cu `pachet: true` încuiate pe Start (`ramuraIncuiata`,
  `deseneazaIncuiata`), „+" în casetă (din 15.10), `CARDURI_REGULI` pe butoane, mesajul pachetului (`limita` /
  `pachetMesaj` de la server) în `.chat-lim`, eticheta `.chat-aprof`, „Vezi pachetele" (`insightPachete`, doar administratorul).
  Din 15.10 bula din colț duce în secțiune (nu mai are caseta ei), fila AI Raport a ieșit din Rapoarte, iar pachetul stă pe UN rând
  jos în stânga (macheta „mai simplu").
- **Pasul 3, „Pachet și conturi"** (blocul secțiunii, `S.ramura === 'pachet'` → `deseneazaPachetConturi`; din rândul pachetului,
  din „⋯" și din Utilizatori, `insightPachetConturi`): `GET /api/insight/pachet-conturi` (`manageUsers`) → `rezumat` (pe web, din
  15.10) + `cartonase` (doar pentru telefonul de azi), oamenii (rolul cu `_incRolEt`, `folositeText`, `nuPoate` = `refuzLoc`), nota
  (`notaConturi`). Conturile și limitele pleacă pe rutele lor (`ai-seat`, `ai-limita`) — NU face a doua cale. Vezi și „Pachetul în
  ofertă și conturile la client", mai jos.
- **Pasul 4, tabloul nostru** (`/api/admin/ai-usage` → `pachete` + `plasa` / `aprofundat` / `ramanLei` pe rând; în pagină
  `_aiuPachete` + `_aiuPachetRand`): costul plasei = `getAiMonthUsageByCompany` cu scrisoarea de luni, pe model
  (`cost_aprofundat_usd` = partea Sonnet), la `ai.USD_EUR` × cursul — aceeași socoteală ca `_starePachet`. Anunțul
  `ai_plasa` (`plasaAnuntTick`, la 15 min; `PLASA_ANUNT_PROCENT` = 60 și 100; cheia `firma|lună|prag` în setarea
  `ai_plasa_anuntat`), doar la super-admini. Soldul Anthropic = setarea `anthropic_sold` (`PUT /api/admin/insight/sold`),
  zilele = sold ÷ (costul lunii pe toată platforma ÷ ziua lunii). Avertismentele vechi („fără preț pe cont") — doar pe regula veche.
- **Pasul 5, oferta → contract → firmă → factură:** prețurile de listă = `tarife_lista.pkBasic / pkPro / pkBusiness` („Prețurile
  noastre"), citite DOAR prin `pachete.preturiLista` (serverul: `_preturiPachete`; gol / 0 / text → prețul din cod, niciodată 0).
  În ofertă: cartea 3, `of-aiPachet` (pornește pe Start; din 15.10 ASCUNS, sub cele patru cartonașe) + `of-pPachet` (propus din listă prin `_ofPropunePachet`, negociabil) —
  blocul „pachetele RA Insight în ofertă" (`_ofPachetMarja` = `pachete.marja`, „ce rămâne la noi" DOAR pentru noi; ce primește
  pachetul din `_ofMeta.pachete`, de la `_ofMetaPachete`, aceeași pentru telefon). UN rând `fel: 'ai'` cu `pachet` în `_ofCalc`;
  ofertele vechi (pe cont) se socotesc pe ramura veche. Hârtia ofertei: „ce include" + condiția cu toate prețurile și
  `pachete.CLAUZA_TRECERE` (pentru „administratorul firmei"). Contractul: `annex.aiPachet = { cod, nume, pretRON, lista }`
  (`contracte.facAnexa`, păstrat de `dinAnexaDePastrat`) + paragraful din IV cu clauza. Pe firmă: `_aplicaOfertaPeFirma` scrie
  `ai_pachet` DOAR dacă firma n-are deja un pachet cu AI. Ce pachet are o firmă = O regulă: `plans.pachetAi(company, acum)`
  (`aiVechi` = regula veche), folosită de `_pachetCo`. Prețul lunar: `computeCompanyPrice` → `breakdown.aiPachet` +
  `aiPachetEticheta` („RA Insight Pro") → factura (`buildInvoiceLines`, înaintea regulii pe cont) și registrul. „Contract ↔
  factură": pachetul din contract lângă rândul facturii. Telefonul de dinainte de pachete trimite încă bifa `aiA` la socoteala
  ofertei: serverul o citește ca Basic (`_ofSocoteste`), până la APK-ul nou.
- **Pasul 6, trecerea din aplicație** (administratorul firmei, NU noi — noi punem pachetul din fila „Acces"): „Vezi pachetele" →
  „Alege Pro" (`insightTrecere`) → fereastra cu textul EXACT de la server + bifa „Am citit și sunt de acord" → confirmarea.
  Regula și textul: `pachete.trecere` — mai mare = din ziua confirmării (`inceputZi`, ora României), luna pe zile; mai mic = de la
  1 a lunii următoare (`ai_pachet_urmator`, programat; `pachetFirma(…, acum)` îl ia din clipa lui, fără ceas), refuzat cu mai
  mulți oameni cu RA Insight decât are pachetul cel mic; același pachet cu o trecere programată = anularea ei. Prețul pentru firmă:
  `_preturiPachetFirma` (lista de azi, peste ea prețurile din contract și prețul pachetului de acum). Rutele:
  `GET/POST /api/insight/pachet-trecere` (`manageUsers`, nu super-admin, nu demo, nu regula veche — `_poateSchimbaPachet`; POST
  cere `acord: true` și ACELAȘI text, altfel 409 cu textul nou), `GET /api/insight/pachet-trecere/:id/pdf` (firma ei sau noi; altfel
  404). Se scrie O DATĂ, prin `_applyCompanySettingsPatch` (`opts.trecere`), iar orice schimbare de pachet (și cea pusă de noi)
  intră în `settings.ai_pachet_istoric` (`pachete.adaugaIstoric`, `consolideaza`). Dovada: tabela `pachet_treceri` (cine, când,
  IP, textul; în `BUSINESS_TABLES`; NU se șterge cu firma), rând în audit `ai_pachet_trecere`, anunț `pachet_trecere` la noi,
  emailul cu PDF-ul (`contract_pdf.confirmarePachetPdf`, felul `pachet` în „Trimise") firmei și omului — eșecul se scrie pe rând
  și se spune în mesaj (`textDupaTrecere`). „Pachet și conturi" arată ce e programat și „Schimbările de pachet", cu PDF.
- **Factura pe zile, din istoric: `pachete.liniiFactura`** (chemată de `_liniiAbonament`; pachetul de azi e scos din
  `liniiFirma`): luna întreagă la pachetul de pe 1 a lunii (în avans), iar pentru luna trecută — zilele pe bucăți (firma cu
  primul aparat pornit atunci) sau diferența pe zile pentru fiecare trecere la un pachet mai mare („RA Insight — trecerea la
  pachetul Pro, 14–31.10.2026 (18 zile)"). O trecere la un pachet mai mic nu dă bani înapoi. Aceeași regulă ca abonamentul.
- **Pasul 7, pagina pachetelor:** în aplicație = „Vezi pachetele" (`/api/insight/pachete`, prețurile pentru firmă); pe site =
  **`/pachete-ra-insight`** (în `PAGINI_PUBLICE`, legată din subsolul și din banda RA Insight a primei pagini), FĂRĂ prețuri:
  „Inclus în orice contract" la Start, „Cere ofertă" la celelalte. Textele pachetelor sunt COPIA lui `pachete.publice({ cuPret:
  false })` — `verify_site_public.js` (3c) le compară cuvânt cu cuvânt și pică la orice preț pe pagină. Schimbi `DESCRIERE` în
  pachete.js → schimbi și pagina (și `amprenta` / `modificat`). Nicio pagină nu mai spune „RA Insight pe cont" (păzit).
- Păzit de `verify_pachete.js` (în `npm test`; 220, pe server pornit cu modelul simulat și Brevo fals), `verify_tarife.js`,
  `verify_ofertare.js`, `verify_oferta_telefon.js`, `verify_contracte.js`, `verify_factura.js`.

### Pachetul în ofertă și conturile la client (15.10; macheta „Pachet și conturi", Alin: „da la toate cele 5")
- **Oferta, cartea 3: cele patru pachete unul lângă altul** (`.of-pk4`, cartonașele `of-pkc-<cod>`; `raxOfPachetAlege(cod)`). Lista
  `of-aiPachet` RĂMÂNE în pagină, ascunsă: din ea citesc socoteala și telefonul (`formular`, opțiunile) — NU o scoate. Textele
  cartonașelor vin din meta-ul serverului (`_ofMeta.pachete`, din pachete.js) și din lista casei (`_ofReadPrices`), prin
  `_ofPachetCarduri`; caseta prețului negociat `of-pPachet` e UNA și se MUTĂ în cartonașul ales (nu face a doua). Clicul pe pachetul
  deja ales (și în caseta prețului) nu face nimic. Cartonașul e `div role="button"` (o casetă într-un `<button>` n-ar merge).
- **Banii noștri pe un rând** (`_ofHintPachet`, `#of-mod-hint-aiA`): „Ne rămân ~X lei pe lună din pachet (cel puțin Y lei, oricât
  ar întreba)" = `pachete.marja` (obișnuit, rotunjit la leu; minim = plasa). La Start: „Start e inclus în orice contract, fără cost
  pentru noi." Nu ajunge pe hârtia clientului (păzit). Telefonul n-are cartonașele: ruta `/api/admin/offers/calc` pune înaintea
  rândului descrierea pachetului ales (`pachete.descriere`).
- **Conturile RA Insight se dau DOAR din „Pachet și conturi"** pe o firmă cu pachet: în Utilizatori, pe rândul omului, doar eticheta
  `.rau-ra` „RA Insight" + capul listei cu „Schimbă în Pachet și conturi →"; butonul baghetă (`raxAiSeat`) rămâne DOAR pe regula
  veche (pe cont, `_usrPachet` gol) și la fondator. Omul fără cont află drumul: `_mesajFaraLoc(companyId)` →
  `MESAJ_FARA_LOC_PACHET` („…din RA Insight → „Pachet și conturi”") pe pachet, `MESAJ_FARA_LOC_AI` („din Utilizatori") pe regula veche.
- **Pe om: „Fără limită" / „Cel mult … pe lună"** (`select.pkc-sel` + caseta cifrei doar la „Cel mult"), NU „la comun". Aceleași
  cuvinte în textele serverului: `refuzLimita`, `textBlocat` (motivul `comun`), `textOm`, `notaConturi`, cartonașul `limite` („Date cu
  limită"). Sus, `pachete.rezumatConturi` (unul-două rânduri) + bara, în locul cartonașelor. Descrierea pachetului Basic de pe site
  („200 de întrebări pe lună, la comun") rămâne: spune ce primește pachetul, nu e alegerea de pe om.
- Ghidul (`ra_insight`) spune drumul nou și nu mai pomenește factura unui cont. Telefonul (Robert, APK-ul următor): eticheta în loc de
  bagheta din AdminUsers pe firmele cu pachet, „Fără limită / Cel mult" în „Pachet și conturi".
- ⚠ **Administratorul fără cont RA Insight al lui intră TOT în „Pachet și conturi"** (`deseneazaMain`: `S.ramura === 'pachet' &&
  esteAdmin()` ÎNAINTEA blocului `S.faraLoc`; în „⋯" `esteAdmin() && (S.pachet || S.faraLoc)`; pe cartonașul „nu e pornit", butonul
  „Deschide Pachet și conturi"). Ruta cere `manageUsers`, nu cont. Prins pe 15.10 din pozele ghidului: un administrator care își
  stinsese contul (sau le dăduse colegilor) rămânea încuiat pe dinafară — iar din Utilizatori nu mai poate da conturi. NU muta
  verificarea contului înaintea paginii.
- **Fondatorul NU vede „Pachet și conturi"** (n-are pachet, n-are firmă): ca s-o vadă, intră cu contul administratorului unei firme cu
  pachet (Alin, 15.10: „cu contul de administrator văd, cu cel de fondator nu — am înțeles"). Ghidul cu poze (pas cu pas) i-a fost
  dat atunci; dacă o mai cere, refă pozele, nu-i descrie din cuvinte.
- Păzit de `verify_pachete.js` (rezumatul, cuvintele, Utilizatori, mesajul, pe server pornit), `verify_tarife.js` (cartonașele și rândul
  banilor, rulate), `verify_oferta_telefon.js` (descrierea pentru telefon).
- **Măsurat (09–14.10, model simulat):** costul unei întrebări NU depinde de flotă de la 200 de mașini în sus (uneltele aduc
  cel mult 25 de rânduri, starea live cel mult 200 de mașini — `FLOTA_IN_RASPUNS`). Haiku 5.5: 0,43–0,49 bani obișnuită,
  1,2–1,3 bani grea, 3,7–4,6 bani cea mai rea. Sonnet 5.5: ~9 / ~25 / 70–87 de bani. Scripturile de măsurat nu sunt în depozit.

### Regula VECHE, pe cont (11.09–14.10) — doar pentru firmele scrise așa
Din 14.10 RA Insight se vinde pe pachete (mai sus); grila pe cont (cinci trepte după mărimea flotei, `AIQ_PRET_LOC`, „cât ne costă
o întrebare" măsurat pe Haiku 4.5, `aiqPana10…` în „Prețurile noastre") a ieșit din ofertă la pasul 5 și cheile ei cad din
`tarife_lista` la prima salvare. NU construi lucruri noi pe ea. Ce rămâne în cod, pentru firmele deja pe cont (`ai_quota`):
- Fondul lunii = conturi aprinse × întrebări pe cont (`questionsPerSeat`; 0 = nelimitat), factura pe vârful lunii (`seatsPeak`),
  „RA Insight — conturi (N × preț)". Peste fond NU se vinde nimic (comutatoarele vechi `overage*` se aruncă; `acceptExtra` e
  ignorat — păzit de `verify_paritate_telefon.js`). Clientul vede „oprit până pe …" și „fără niciun cost în plus".
- „Un cont în plus aduce încă N" se scrie DOAR pe regula pe cont, cu cifra firmei — fără `|| 50` de rezervă.
- **Casetele ei din fișa firmei** („Întrebări / cont / lună" în „Abonament & plăți", „Limită AI lunară" în „Acces") se arată DOAR pe
  firmele aflate deja pe regula veche (fișa dă `ai_regula_veche`; în „Acces", `!s.pachet`). Pe o firmă cu pachet (și Start e un pachet)
  serverul le refuză (`_mesajRegulaVeche`, 400) — salvate, ar fi mutat firma pe regula veche și i-ar fi schimbat factura (găsit 19.10,
  Alin: „rezolvăm acum"). O mutare DELIBERATĂ pe regula veche se cere pe față, cu `regula_veche: true` (ca `confirmaStergere`): nicio
  pagină și niciun telefon nu o trimit; o trimit probele regulii vechi. Golirea (`ai_quota: null`, limita `null`) merge oricând.
- O ofertă veche (cu `aiA` / `aiqN` / `aiqSeats`) redeschisă se socotește pe ramura ei din `_ofCalc` (`p.pAiA` — rămas în
  `_OF_PRETURI_DEF` DOAR pentru ele) și se redeschide în formular pe Basic.
- ⚠ **Telefonul** (`mobile/src/components/ChatScreen.tsx`) mai are interfața veche de plată peste fond; nu se aprinde. Se curăță
  la următorul APK.

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
- Numele urmează regula casei: `RA-Track - Ofertă {client} - {data}.pdf`.
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
| pachetul RA Insight (`of-aiPachet` + prețul `pPachet`) | **3.**, lângă alegerea pachetului |
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

### MARCA ESTE „RA Track", ca domeniul ratrack.ro (Robert, 09.10)
Robert, 09.10: *„trebuia să fie ratrack nu ratracks… așa avem și domeniul RA Track"*. Până atunci aplicația scria
„RA Tracks" (Alin, 21.09: „«RA Tracks» trebuie să scrie", la refacerea siglei). Redenumit peste tot ce vede omul: sigla
(imaginile), antetul aplicației, site-ul, telefonul (numele aplicației, APK 1.0.10), documentele, emailurile, numele
fișierelor descărcate („RA-Track - Raport …", „RA-Track - Factură …"). Citatele mai vechi din notele de aici au fost
aduse la noul nume. **Numele tehnice interne rămân** (Robert: „2 da"): codul aplicației de telefon `ro.ratracks.app`
(schimbat, telefoanele ar instala o aplicație nouă și și-ar pierde notificările), `ratracks-backup`, `ratracks-vNN`
(cache), User-Agent `RATracks/1.0`, `/hooks/ratracks` (exemplu), antetele webhook-urilor `X-RaTracks-Signature` și
`RA-Tracks-Webhook/1.0` (integrările clienților le pot filtra). Păzit de `verify_ofertare.js` 5g: orice „RA Tracks" /
„RA-Tracks" rămas în ce vede omul — și scris într-o adresă, „RA%20Tracks" — pică proba.

### Logo-ul scrie „RA Track" — și se REFACE, nu se desenează de mână (21.09; „Track" din 09.10)
`public/logo.png` și `public/logo-light.png` aveau în ele **„RA | traks"** și ajungeau pe fiecare
raport, Excel, contract și ofertă. Acum se generează cu **`tools/make-logo.js`**: marca originală
(`logo-mark*.png`, desen — neatinsă) + cuvântul scris cu **Nunito ExtraBold**, fontul cu care
aplicația îl scrie în antet (`.ralogo .raw`).

- ⚠ **Dimensiunea rămâne 694×135.** `xlPlaceLogo` pune imaginea în Excel cu mărime FIXĂ (180×35 =
  același raport 5,14:1). Alt raport = logo turtit în fiecare Excel trimis unui client.
- ⚠ **Mărimea literelor e FIXĂ** (`MARIME` = 113,6 px, cea din sigla de pe 21.09), nu „cât să umple lățimea": „Track"
  umplut până la margine ar fi avut litere cât marca. Rămâne loc transparent în dreapta; `make-og-cover.js` centrează după desen.
- `tools/make-logo.js` e unealtă de DEZVOLTARE: desenează cu Edge/Chrome-ul instalat (fără Playwright), fotografiind
  pagina pe negru și pe alb ca să scoată transparența. Rezultatul — cele două PNG-uri — intră în repo.
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
potrivire — deci fișierul se salva „RA-Track - **Oferta** …", nu „Ofertă".

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
- **RA Insight se vinde pe PACHETE pe firmă (din 14.10)** — `settings.ai_pachet = { cod, pretRON, de_la }` (+ `ai_pachet_urmator`,
  `ai_pachet_istoric`), vezi „Pachetele RA Insight". Regula de dinainte, pe CONT (`settings.ai_quota = { questionsPerSeat,
  seatPriceRON }`, vârful lunii `seatsPeak`, forma și mai veche `questions`), rămâne respectată pentru firmele scrise așa. Locul
  de cont stă pe om: `users.ai_seat`, aprins de administratorul firmei din „Pachet și conturi" (pe un pachet, DOAR de acolo — din
  15.10) sau, pe regula veche, din **Utilizatori**.

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

### Dosarul, după lista lui Robert (lotul 3, 01.10) — regulile, ca să nu se strice la loc
- **Reprezentantul:** pe hârtie, cel de pe contract DOAR dacă are nume (`_repCuNume` în `contract_pdf.js`), altfel cel al
  firmei — la contract, act adițional și contractul cu instalatorul. Pe firmă se scrie înapoi doar unul CU nume
  (`_repCuNume` în server.js, la facere și la „Aprobă"). Un „Administrator" fără nume nu mai golește firma.
- **Închirierea:** `PUT /api/contracts/:id` refuză sub `CHIRIE_LUNI_MIN` cât `annex.chirie` există (ca la creare).
- **Păstrarea istoricului coborâtă** cere `confirmaStergere: true` de la ecran (409 `confirmare` fără el); web și telefon
  îl trimit după întrebarea lor; auditul scrie `confirmat`.
- **„Completează" (web)** își încarcă firma (`_dzFirma`: lista Contracte → fișa deschisă → serverul) și trimite DOAR
  câmpurile schimbate față de deschidere (`_dzInit`). NU trimite toate casetele: ruta /dosar golește ce primește gol.
- **Pașii din fișă** (`raxCtreAproba`, `raxCtreAmTrimis`, `raxCtreTrimite`, `raxCtreSemnat`) salvează întâi formularul
  (`_ctreSalveazaFormular` → `_ctrTrupFormular`, același corp ca „Salvează"); „E semnat" propune ziua scrisă
  (`_ctreZiSemnare`). „E semnat" al instalatorilor (Montaj) are drumul lui — nu-l amesteca.
- **Instalatorii:** lipsa „tarife" are „Reia tarifele" (`raxMjReiaTarifele`, `tarife_din_partener`) când partenerul
  are tarife; semnat → doar se spune.
- **Hârtiile:** `areLucrari` (montaj adevărat) ≠ `areMontaj` (există Anexa nr. 2). Aparate vândute fără montaj = doar
  livrarea în 30 de zile, fără zile de montaj, Anexa nr. 2 „Echipamente". Oferta: `cuAparate` / `cuMontaj` aleg
  condițiile; o condiție care nu se potrivește rămâne `null` până la desen, ca pozițiile (`splice`) să nu se mute.
- ⚠ Capcană de unealtă: un script care inserează cod printr-un șir `…` (template) mănâncă barele oblice inverse
  (`\d` → `d`, `\n` → rând nou în mijlocul unui șir). După orice inserare, se verifică scripturile paginii
  (`new Function` pe fiecare `<script>`) — așa s-a prins pe 01.10.
- Păzit de `verify_reparatii_lista.js`.

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
- **Și la ȘTERGERE, și la mutarea unei lucrări de pe contract** (01.10, Alin: „rezolvăm problema"): anexa se reface din
  lucrările rămase. Fără nicio lucrare = montajul din oferta contractului (`db.ofertaContractului` →
  `_montajDinOferta`), ca înainte de prima lucrare; fără ofertă = niciun montaj (fără aparate vândute, `montaj` = null).
  Până atunci rămânea „cum a fost salvată ultima dată": 3 + 2 mașini, ștearsă lucrarea de 2, contractul tot 5 spunea.
- **O SINGURĂ funcție: `_refaAnexaDinLucrari(contractId)`** (server.js) → `{ anexa: 'semnat' | 'actualizata' |
  'din_oferta' | 'fara' }`, chemată la salvare (contractul lucrării + cel de pe care a plecat) și la ștergere. Păzit prin
  numărare (`verify_montaj.js`). Mesajul de după „Șterge" îl scrie serverul (`_mesajStergereLucrare` → `mesaj`); web și
  telefon doar îl arată și reîncarcă fișa. Probat pe server pornit în `verify_contracte.js`.
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
  (ASCII + `filename*` UTF-8). Numele: **„RA-Track - Contract {număr} - {firmă}.pdf"** (Alin, 24.09),
  ca rapoartele și ofertele; actul: „RA-Track - Act adițional …". Caracterele interzise (inclusiv
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
- ⚠ **`PUT /api/companies/:id` (`updateCompany`) schimbă cheile TRIMISE, iar una trimisă goală golește
  câmpul** (de la 23.09; înainte rescria tot rândul). „Completează" are ruta lui, `PUT /api/companies/:id/dosar`
  → `completeazaDosarFirma`, care scrie DOAR ce primește. Orice formular nou care completează o parte din
  firmă o folosește pe ea.
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
  NU pune a doua cale de adopție în fișă), factura → `raxOpenGenInvoice(companyId, 'unica')` (prima factură
  de după montaj e cea unică: aparate + montaj, din contract; abonamentul pleacă singur, pe zile).
- Butoanele din fișă și din listă sunt ACELEAȘI funcții (`raxCtre…`); `_ctreGasit` găsește contractul și din
  fișă, iar `_ctreDupa` redesenează ce e deschis (fișa și/sau lista).
- Păzit de `verify_drum.js` (în `npm test`), care parcurge tot drumul pe server pornit.

### Montaj — secțiunea partenerilor (Business, 24.09)
Alin: *„secțiune de partener montaj, unde adăugăm parteneri, semnăm contracte fix la fel ca la clienți.
Logica din spate o va face Robert în interfața lor."* Rândul „Montaj" stă în meniu **imediat după
Companii**; containerul `admin-tab-montaj`, încărcat de `raxLoadMontaj`. Patru file (`MJ_FILE`):
**Calendar** (prima, se deschide singură, 30.09) · Parteneri · Contracte cu partenerii · Lucrări.

- **Partenerii stau DOAR aici.** Au ieșit din ecranul Contracte (acolo sunt doar contractele clienților).
  `raxParteneriIncarca` a rămas ca nume vechi și cheamă `raxLoadMontaj`.
- **Fișa partenerului** (`montaj_parteneri`): CUI + ANAF, reg_com, address, legal_rep, email, phone, iban,
  bank, zona, tarife, `ritm_facturare` (30.09 — vezi „Factura montajului, în ritmul instalatorului"). ⚠ **`upsertPartenerMontaj` scrie DOAR cheile primite** (`undefined` = rămâne cum era):
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
  clienților noștri. Nume: „RA-Track - Contract montaj {nr} - {partener}.pdf". Scris de noi, nu de un
  jurist: e pe lista de lansare.
- **Montajul unui contract SEMNAT se PROGRAMEAZĂ doar în Calendar** (vezi mai jos); **detaliile unei lucrări
  se editează din fișa clientului** (fila Contract: preț, cost, factura partenerului, deplasare). La un contract
  NESEMNAT, formularul din fișă („+ Lucrare de montaj") rămâne: acolo lucrările scriu încă Anexa nr. 2. Fila
  „Lucrări" e privirea de sus (`GET /api/montaj/lucrari`, marja socotită pe server), cu buton „La client".
  NU pune un al treilea loc în care se fac lucrări.
- **Clientul nu vede nimic de aici.** Toate rutele `/api/montaj/*` sunt `requireSuperadmin`: cât ne cere
  partenerul e exact diferența din care trăim.
- **Contul partenerului în aplicație = Robert.** NU-l construi din proprie inițiativă. Când se face: vede
  DOAR lucrările lui — nu flota/pozițiile clientului, nu prețul pentru client, nu marja, nu alți parteneri.
- Păzit de `verify_montaj_sectiune.js` (în `npm test`), pe server pornit, cu server de email FALS.

### Calendarul de montaj (Business → Montaj, Alin 30.09)
Alin: *„calendar de programare… să pot selecta eu ziua, și să-mi arate jos ce am de instalat și
disponibilitatea"* + *„în secțiunea Montaj"*. Blocul „calendarul de montaj" din pagină, între sentinele.

- **O zi programată = o lucrare** (`montaje`, status „programat") — exact ce va vedea instalatorul în contul lui
  (partea lui Robert). NU ține programarea într-o tabelă separată.
- **Ce mai e de programat se SOCOTEȘTE, nu se ține:** `montaj.deProgramat(anexa, lucrari)` = Anexa nr. 2 minus
  lucrările contractului (programate + montate), pe tipurile „pe mașină" (`PE_MASINA`: gps, lvcan, caninc, fms).
  Deplasarea, demontarea, înlocuirea nu se împart pe zile. `STARI_MONTATE` = `contracts.MONTAJ_EXECUTAT`
  (legate prin probă), deci calendarul, drumul clientului și termenul de 30 de zile numără la fel.
- **Rutele** (toate `requireSuperadmin`): `GET /api/montaj/calendar?luna=AAAA-LL` (lucrările lunii pe zile, cu
  ziua pe ora României; „De programat" pe contracte, cu termenul și textele gata scrise; instalatorii; stocul),
  `POST /api/montaj/programeaza` (DOAR contract semnat — la nesemnat, lucrările scriu Anexa nr. 2),
  `POST /api/montaje/:id/muta`, `POST /api/montaje/:id/montata { masini }`.
- **Prețurile NU vin de la ecran:** clientul din Anexa nr. 2 (ce s-a semnat), costul din tarifele instalatorului
  (`montaj.lucrareaZilei`). Instalator fără tarif → cost `null`, nu 0.
- **„Montată" cu mai puține** (`montaj.scaleazaLaMontate`): tipurile pe mașină scad în aceeași proporție, iar
  restul se întoarce SINGUR la „de programat". O zi montată nu se mai mută.
- **„Programează montajul"** din drumul clientului (`raxDrumMontaj`) duce în calendar cu clientul ales
  (`_raxMj.cal.pre`); în fișă, la contract semnat, butonul e „Programează în calendar".
- Ecranul NU socotește nimic (păzit): cere serverului. Pe telefon grila rămâne în pagină; numele clientului se
  ascunde, cifra rămâne.
- Păzit de `verify_montaj_calendar.js` (în `npm test`), pe server pornit.

#### Refăcut pe 01.10, după macheta aprobată (Alin: „ca în imagini — da"; „ajung cele două — și buton reprogramează")
- **Clicul pe o zi deschide FEREASTRA ei** (`#mjc-ov`, o singură fereastră, conținutul după stare: ziua, lucrarea,
  anularea, reprogramarea — `_mjcFereastraCorp`). Fereastra stă în markup-ul calendarului; „La client" o închide ÎNTÂI
  (`raxMjCalLaClient`), altfel ar acoperi fișa firmei. Alături de calendar: „Ce ai de montat"; dedesubt: „Programate /
  Istoric" (filtre Toate / Montate / Anulate).
- **Confirmările** (vorbite la telefon): `montaje.confirmat_instalator_la` / `confirmat_client_la` (ms). Se bifează la
  programare (`confirmat_instalator` / `confirmat_client` în `POST /api/montaj/programeaza`) sau după
  (`POST /api/montaje/:id/confirmari { instalator?, client? }`, `db.confirmaMontaj` — doar pe o zi încă programată).
  Culoarea zilei: **verde** `mjc-ok` = amândoi, **galben** `mjc-conf` = mai lipsește una, **gri** `mjc-mont` = montată.
  Starea și textul le dă serverul (`montaj.stareConfirmare` / `textConfirmare` → `conf`, `conf_text`).
- **O zi programată a unui contract SEMNAT NU se mai șterge: se ANULEAZĂ, cu motivul ei**, și rămâne în istoric
  (`status = 'anulat'`, `anulat_la`, `anulat_de`, `motiv_anulare`, `detalii_anulare`). `DELETE /api/montaje/:id` →
  409 `{ anuleaza: true }` pe una programată de contract semnat, 409 pe una anulată. Lucrările unui contract NESEMNAT
  (din fișă) se șterg ca înainte. „anulat" e în `ETICHETE_STARE`, dar NU în `STARI` (nu se alege din fișă); o zi
  anulată nu se mută, nu se trece montată (400) și nu se rescrie din fișă (409).
- **Din calendar se anulează DOAR montajul unui contract semnat** (activ / încheiat). O lucrare fără contract, sau a unui
  contract nesemnat, se schimbă ori se șterge din fișă (400 cu mesajul ăsta): la nesemnat, lucrările scriu încă Anexa
  nr. 2, adunate — iar `db.montajeContract` (adunarea) sare oricum peste zilele anulate.
- **Motivele sunt DOUĂ** (`montaj.MOTIVE_ANULARE`: instalatorul nu poate / clientul nu poate) — Alin, 01.10. Vin de la
  server (`motive` în răspunsul calendarului); pagina și telefonul NU le scriu.
- **O SINGURĂ funcție de anulare: `_anuleazaLucrarea(id, { motiv, detalii, reprogramare, cine, sursa })`** (server.js),
  chemată azi de `POST /api/montaje/:id/anuleaza`; mâine, de „Refuz" din contul instalatorului (partea lui Robert).
  „Accept" din contul lui = `db.confirmaMontaj(id, { instalator: true })`. Păzit prin numărare. NU scrie a doua cale.
- **Reprogramarea:** pe loc (`reprogramare: { data_lucrare, partener_id }` la anulare — validată ÎNAINTE de anulare, ca
  să nu rămână o zi anulată pe jumătate) sau din istoric (`POST /api/montaje/:id/reprogrameaza`, o singură dată:
  `reprogramat_ca` = lucrarea nouă). Aceleași mașini; prețul din Anexa nr. 2, costul din tarifele instalatorului
  (`_ziuaNoua` → `montaj.lucrareaZilei`, ca la programare).
- **Textele le scrie serverul, ecranele doar le arată:** istoricul (`montaj.textIstoric` — „Anulată — instalatorul nu
  poate" · „„Bolnav” · anulată de Alin, pe 08.03 · reprogramată pe 15.03"), ce are fiecare instalator în ziua aia
  (`montaj.incarcarePeZile` + `textIncarcare`, anulatele nu țin pe nimeni ocupat; `textLiber`), nota de stoc
  (`POST /api/montaj/nota-stoc` → `montaj.notaStoc` cu `aparatePeTip` din Anexa nr. 2 / chirie și `db.stocLaInstalator`).
- O zi anulată nu se numără nicăieri ca lucrare: nici la „de programat" (`deProgramat` ignoră starea), nici în drumul
  clientului (`drumDateToate` o scoate).
- Culorile (etichete, rezultate, nota de stoc, „Anulează") au pereche pe tema deschisă; contrastul e MĂSURAT de probă
  din CSS, pe ambele teme și pe weekend (≥ 4,5). Butonul plin „Anulează lucrarea" are clasa lui (`mjc-rosu`), fiindcă
  Montaj nu e în familia `.ra-camp`.
- **Telefonul** (`mobile/src/lib/calendarMontaj.ts` + `components/CalendarMontaj.tsx`) face același lucru, pe aceleași
  rute; legat de pagină de `verify_telefon_lot5.js`, care rulează blocul paginii. Telefonul vechi (până la APK-ul nou)
  mai are „Șterge ziua": serverul îl refuză cu mesajul „Ziua asta se anulează din calendar…".

### Factura montajului, în ritmul instalatorului (Alin, 30.09: „…ca să nu fim pe pierdere. Doar la montaj.")
- **Ritmul stă pe fișa instalatorului:** `montaj_parteneri.ritm_facturare` = `lunar` / `saptamanal` (gol = lunar;
  `montaj.ritmFacturare`). Se scrie doar când vine în cerere (telefonul vechi nu-l golește). Abonamentul NU are ritm:
  rămâne lunar.
- **Regula stă în `montaj.js`, curată:** `perioadaFacturare(zi, ritm)` — săptămâna luni–duminică sau luna, pe ZILE
  'AAAA-LL-ZZ' ale României; `deFacturatMontaj(lucrari, azi)` → `{ gata, inCurs }` pe firmă: lucrările MONTATE,
  nefacturate, cu preț, a căror perioadă s-a încheiat (gata) sau nu (în curs, cu `gataDin`). Lucrările unei firme din
  perioade încheiate — de la oricâți instalatori — merg pe O factură. Textele (`text`, `anuntMontajDeFacturat`) tot acolo.
- `GET /api/montaj/de-facturat` (super) și `montajDeFacturatTick` (la oră; anunț DOAR 8–20, ora României; cheia =
  firma + ultima zi a perioadei încheiate → o dată pe perioadă, iar nefacturat, perioada următoare amintește din nou).
  Ritmul folosit e cel din FIȘĂ (de azi), ca tarifele la lucrări.
- **Pe ecran:** Facturare → a treia secțiune „Montaj de facturat" (`_raxMontajFactHtml`, între sentinele) — doar arată
  ce spune serverul, NU socotește perioade. „Pregătește factura" = `raxFacturaMontaj(companyId, lucrari)`:
  `raxOpenGenInvoice(…, 'unica')` → `raxGiTip('invoice')` → `raxGenDraft()` → `_giPuneLucrare` pe fiecare. NU emite
  singură. Anunțul („Montaj de facturat: …") duce acolo (`notifMontajDeFacturat`).
- **Contractul cu instalatorul** îngheață ritmul la creare (`montaj_contracte.ritm_facturare`), ca tarifele; „Reia din
  fișă" (cât e nesemnat) îl reia. Hârtia (`scrieContractMontaj`, cap. IV): „facturează săptămânal … săptămâna
  anterioară (de luni până duminică)" / „lunar … luna anterioară".
- Păzit de `verify_montaj_ritm.js` (în `npm test`), inclusiv pe server pornit, cu ceasul mutat.

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
  Din 30.09, un GPS intră în aplicație DOAR aici, cu IMEI-ul ca serie — vezi „Aparatele intră o singură dată".
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

### Sugestiile din Ofertare Live — doar pentru noi (Alin, 25.09; livrate 28.09)
Alin: *„sugestii să-mi arate ce să selectez mai bine pentru ce vrea clientul… clientul nu o vede în
ofertă, dar o văd eu și mă dirijează."* Regula (căutată pe net, 25.09): fără CAN → FMC130; cu CAN →
FMC130 + LV-CAN200 (cele mai multe modele) sau FMC150 (CAN integrat, mai puține modele); camioane cu
FMS → FMC650 + Modulul Tahograf (card 28 / tahograf 90 de zile) + e-Transport, dacă e cazul.

- **O singură regulă: `_ofRecomandare(nVeh, nCan, nFms, canMod)`** (blocul „recomandarea pentru flotă").
  Caseta de la pasul 2 (`#of-sfat-flota`) și tabelul de la pasul 4 (`#of-sfat-montaj`) citesc amândouă de
  acolo, prin `_ofRecAcum()`. NU scrie a doua socoteală a recomandării.
- **Nu ajunge pe hârtie.** `_ofPayload` nu trimite nimic din sfaturi, iar `report_export.js` nu le are
  cuvintele. Dacă adaugi un sfat, nu-l chema din constructorul hârtiei.
- **Completarea automată folosește ACEEAȘI regulă** (decizia lui Alin, 28.09: „DA — oferta iese corectă din
  prima"): `_ofCompleteazaDinVehicule` cheamă `_ofRecomandare` și propune, prin `_ofPropune`, toate cele 8
  cantități (FMC130 / FMC150 / FMC650 / LV-CAN200 + montajul). Până atunci punea FMC650 — aparatul de
  camion — la TOATE mașinile (100 de mașini, 80 mici: 5.200 € în plus). Comutatorul CAN (`raxOfCanMod`)
  reface cantitățile neatinse. Ce e atins de mână rămâne; ofertele salvate nu se ating. NU reintroduce
  „FMC650 la toate". Butonul „Aplică recomandarea" (`raxOfAplicaRecomandarea`) repune recomandarea peste
  ce ai scris de mână. Păzit, rulat, de `verify_montaj.js` și `verify_sugestii_oferta.js`.
- **Accesoriile** (ECAN02, cititor de card, blocarea pornirii) rămân **DOAR ca sfat**, fără rând de preț
  (decizia lui Alin, 28.09, varianta 2): apar în „Ce recomanzi" și în întrebările 5 și 7 de la pasul 2,
  iar când un client le cere se scriu la pasul 6, „Observații". NU le face rânduri de preț din proprie
  inițiativă — se fac când avem prețurile de la furnizor și un client care le vrea. (Ideea lor a fost a
  mea, din cercetarea din 25.09; Alin a întrebat „de unde ți-a venit ideea" — explică-le ÎNAINTE de a
  întreba ceva despre ele.)
- Contrastul casetei s-a MĂSURAT pe ambele teme: eticheta pe `--text-secondary`, diferențele (`.dif`)
  portocaliu închis `#c2410c` pe tema deschisă.
- Păzit de `verify_sugestii_oferta.js` (în `npm test`).

### „Mașinile clientului" — ce aparat merge pe ce mașină, din listele Teltonika (Alin, 28.09)
Alin: *„o listă cu model și an de fabricație, ca să vedem ce se potrivește exact — Dacia, Logan 2, 2024,
benzină + GPL"*. A ales **lista oficială Teltonika** (nu una a noastră, nu reguli ghicite). Secțiunea stă
în Ofertare Live între „1. Clientul" și „2. Flota clientului".

- **Regula stă în `compatibilitate.js`, curată:** `citesteFoi` (foile deja citite → rânduri normalizate),
  `potriveste` (o mașină pe o listă), `recomanda` (aparatul), `dateCitite`, `citesteSablon`. Singurul loc
  care atinge Excel-ul e `foiDinExcel` (ExcelJS), la coada fișierului. **Pagina NU potrivește nimic**:
  cere `POST /api/admin/masini/potrivire` și `/sablon` (păzit prin numărare).
- **Șablonul mașinilor (Alin, 28.09: „Lipește din Excel nu e ok — vreau buton de export a unui șablon
  fix… și de încărcare").** Lipirea a fost SCOASĂ (buton, rută, regulă) — nu o pune la loc.
  - Coloanele stau într-un singur loc: `SABLON_COLOANE` (Marcă, Model, An fabricație, Combustibil,
    Bucăți — hotărâte cu Alin, fără nr. de înmatriculare). Șablonul se face din ele
    (`report_export.js` → `sablonMasiniXlsx`, cu logo, lângă celelalte Excel-uri) și se citește după ele
    (`citesteSablon`: capul de tabel se caută după NUME, oriunde ar fi; rândul fără marcă/model nu intră;
    anul/combustibilul/bucățile greșite se spun pe rândul din Excel). `GET` / `POST /api/admin/masini/sablon`.
  - **Marca și modelul: liste care se STRÂNG după primele litere** (Alin, 28.09: „când scrii litera a, nu-ți
    dă mărcile cu a"). O listă simplă nu se filtrează în Excel (doar Microsoft 365 nou, și atunci caută
    literele ORIUNDE în nume). Lista e o FORMULĂ: `OFFSET(Marci!$A$1, MATCH(A8&"*",…)-1, 0, COUNTIF(…), 1)` —
    „da" + Enter + săgeata → doar ce începe cu „da". Modelul: foaia ascunsă „Modele" (marcă | model | cheie
    `MARCĂ|MODEL`), formula caută `$A8&"|"&B8&"*"` → modelele mărcii de pe rând. Fără potrivire: un singur
    rând, `SABLON_FARA_SUGESTII`, pe care citirea îl socotește model LIPSĂ.
  - ⚠ Formula cere ca numele cu același început să stea unul după altul: listele se ordonează pe LITERE MARI,
    după cod (nu `localeCompare`). Referințele sunt RELATIVE la primul rând (A8) — Excel le mută singur.
    Maxim 255 de caractere pe formulă. Fără macro-uri (clientul ar trebui să „activeze conținutul").
  - Marca și modelul NU au fereastră de eroare (`showErrorMessage: false`: o marcă veche tot intră; o verifică
    calculatorul); fiecare coloană are un mesaj la clic (`prompt`). Combustibilul DOAR din listă.
  - Păzit de `verify_masini_client.js`, care socotește ce arată săgeata ca formula, pe FIECARE literă și
    pe FIECARE marcă din șablonul descărcat.
  - ⚠ **Validările se pun pe INTERVAL, o dată pe coloană** (`ws.dataValidations.add('A7:A506', …)`), NU
    celulă cu celulă: ExcelJS le strânge atunci în intervale ordonate ca text (A10 înaintea lui A7) și scoate
    intervale care se SUPRAPUN — Excel poate zice că fișierul e stricat. Păzit: proba citește XML-ul brut.
  - Încărcarea peste o listă plină întreabă întâi (`raConfirm`); problemele se arată pe rând.
- **Cum se citesc listele** (verificat pe cele din 2025): LV-CAN200 / ALL-CAN300 — o foaie pe fel (Cars,
  Trucks…), antet pe rândul 2, anii „2016>", „+" **albastru** = depinde de dotare, portocaliu = lipsește cu
  cititorul fără contact, legenda jos (se sare). FMX150 — antet pe rândul 3, deasupra grupul „Standard" /
  „Extended" (**extinșii nu se numără**: se cer separat de la Teltonika), anii „2013-2016" / „2017+",
  „+*" = experimental, „+" pe **galben** = lipsește cu ECAN02.
- **Alegerea rândului, în ordine:** modelul cel mai PRECIS (bază inclusă în ce a scris omul: „Sandero
  Stepway" înaintea „Sandero"); anul — la rânduri „de la", câștigă **cel mai nou start ≤ anul** (lista
  adaugă un rând la generația nouă fără să-l închidă pe cel vechi: „LOGAN II 2013>" cuprinde și 2024!);
  combustibilul (electric/hibrid = obligatoriu, GPL doar la egalitate); generația scrisă de om; variantele.
  Un cuvânt în plus pe rândul din listă **cu cifre** („ACTROS MP5", „GOLF 7") = generație → se ia, dar
  „de verificat"; **fără cifre** („LOGAN VAN", „TRANSIT CUSTOM") = alt model → doar sugestie.
- **Nu se aleg niciodată:** volan pe dreapta, alte piețe (`…MARKET`, `LATAM`, regiunea FMX150 ≠ Global).
- **Mărcile scrise altfel** (MERCEDES / Mercedes-Benz, VW / Volkswagen) se unesc în `MARCI_ALIAS`.
- **Recomandarea:** camion/autobuz → FMC650 (priza FMS; notă: verifică priza și tahograful); utilaj pe lista
  FMC150 → FMC150, altfel FMC130 (ALL-CAN300 nu e în ofertă); „doar poziție" → FMC130; pe ambele liste →
  întâi potrivirea SIGURĂ, apoi cea care citește mai mult (`scorDate`), abia apoi comutatorul de la pasul 4.
  `note` = de verificat (portocaliu), `info` = bine de știut (gri) — NU le amesteca.
- **Pașii 2 și 4 citesc din listă când are rânduri** (`_ofRecAcum` → `_ofRecDinMasini`, aceeași formă ca
  `_ofRecomandare`). „Trece în ofertă" = `raxOfAplicaRecomandarea`, care la listă pune și pasul 2.
- **Listele** stau în `liste_compat` (una pe fel, înlocuită la încărcare, cache în memorie `_compatCache`).
  Până se încarcă una, serverul ia **copia de pornire** `liste/teltonika.json.gz` (≈ 100 KB), făcută cu
  `tools/liste-teltonika.js` din fișierele trimise de Alin — aceeași funcție de citire ca la încărcare.
  Tabela e în `BACKUP_EXCLUDED` (se reîncarcă). Încărcarea vine **CRUDĂ** (`express.raw`, octet-stream,
  15 MB): ALL-CAN300 are 5,3 MB și în base64 ar trece de limita JSON de 6 MB.
- **Lista mașinilor se salvează în ofertă** (`cfg.masini`, `cfg.masiniMotor`) și **nu ajunge pe hârtie**
  (`_ofPayload` n-o citește). Pe PDF doar dacă hotărăște Alin (recomandarea din 28.09: nu, deocamdată).
- Casetele nu se redesenează la răspunsul serverului (doar rezultatele și sumarul) — capcana de la Inventar.
- Culorile de stare au pereche pe tema deschisă (verdele casei pe alb = 1,7). Măsurat pe ambele teme.
- Păzit de `verify_masini_client.js` (în `npm test`): foi de probă cu forma listelor, listele adevărate,
  pagina, server pornit (încărcare de listă nouă cu un Excel făcut în probă).

### Telefonul și Ofertare Live (APK 1.0.3+, lotul 3 — 29.09)
Telefonul NU socotește nimic din ofertă: `POST /api/admin/offers/calc` rulează în server, într-un vm, chiar
bucățile paginii (`_ofDecupeaza` le taie după repere) pe un DOM de carton (`_ofNod`). De aici, ce trebuie știut
când schimbi pagina de ofertă pe web:
- **O funcție de DOM nouă folosită de pagină** (ex. `parentNode.querySelector`, 25.09) trebuie să existe și în
  `_ofNod` — altfel ruta dă 500 și telefonul nu mai poate face oferte. `verify_oferta_telefon.js` pică atunci.
- **Butoanele paginii fără `oninput`** (`raxOfEchipMod`, `raxOfCanMod`, `raxOfAplicaRecomandarea`) sunt „apăsate"
  explicit în `_ofSocoteste`; `_ofMeta` trebuie să aibă tot ce dă `/api/admin/offers/meta` (ex. `chirie`).
- **„Mașinile clientului" pe telefon:** pagina din vm nu primește răspunsuri la `fetch`, deci serverul îi pune
  singur rezultatul potrivirii (`_compatPotrivire` — ACEEAȘI funcție ca ruta `/api/admin/masini/potrivire`).
  Lista mașinilor vine de la telefon la fiecare socoteală (`_ofMasiniCurate`), altfel o salvare ar lua lista altei
  oferte (pagina din vm e una, a tuturor cererilor).
- Șablonul se încarcă de pe telefon în JSON (`{ fisier, b64 }`), pe aceeași rută; pe calea asta se numără octeții
  dezarhivați înainte de citire (`_sablonNuSeUmfla`, 50 MB). Din 01.10 (lista lui Robert, pct. 1) numărătoarea stă pe
  AMBELE căi ale șablonului (și pe cea web, crudă) și pe încărcarea listelor Teltonika (120 MB; o listă adevărată crește
  la ~10 MB): `SABLON_MAX_DEZARHIVAT` / `LISTA_MAX_DEZARHIVAT`. Orice ușă nouă care primește un .xlsx numără întâi.

### Rămase la decizia lui Alin (NU le face din proprie inițiativă)
- Lista „Mașinile clientului" pe oferta PDF (azi nu apare).
- Păzit de `verify_contracte.js` (inclusiv pe server pornit), `verify_montaj.js`, `verify_companii.js`,
  `verify_arhiva.js` (inclusiv pe server pornit).

## RA Track NU funcționează pe planuri (regulă de fond)

**Nu există pachete de-a gata și nu vor exista.** Fiecare client primește o **ofertă** făcută pe ce
are el (câte vehicule, câte cu CAN, ce module), iar **contractul se face pe oferta acceptată**. Atât.

- Prețul unei firme vine DOAR din `companies.custom_plan` (oferta). **Fără ofertă → 0 lei**, iar
  firma se vede ca atare în registrul de clienți. Nu inventa un preț implicit.
- Modulele vin din `settings.features`, scrise de ofertă. Implicitul e FIX, nu dintr-un tabel:
  **agenții AI porniți** (sunt gratuiți, parte din produs), **RA Insight pornit** (din 14.10: pachetul Start e inclus; ce se
  plătește stă în pachetul RA Insight, singura excepție cu pachete — vezi „Pachetele RA Insight"), **restul oprite** (se vind).
- Coloana `companies.plan` a rămas în bază ca să nu pierdem date vechi, dar **nu o citește nimeni**.
- **Stripe a fost scos de tot** (plată cu cardul, abonamente, webhook, perioadă de probă). Se
  încasează prin transfer bancar, pe factură. Dacă vreodată vom vrea card, se face atunci — legat de
  ofertă, nu de planuri.
- **Cuvântul „plan" nu are ce căuta în interfață.** Excepțiile: „plan de service/mentenanță" al unui vehicul și
  „planul de încărcare" din simulator (12.10) — alte noțiuni, rămân; tot fără etichete care încep cu „Plan" singur.
- Păzit de `verify_fara_planuri.js` (în `npm test`): dacă reapare un tabel de planuri, o valoare
  implicită luată din plan, Stripe, sau eticheta „Plan" pe ecran — proba pică.
- **„Dashboard platformă" → Venituri** citește ce dă serverul (`revenue`: `mrr`, `arr`, `cu_oferta`, `fara_oferta`): cardul „Firme cu
  ofertă" și rândul „N firme cu ofertă · M fără ofertă (0 lei)". Până pe 20.10 citea câmpuri de pe vremea planurilor (`active_subs`,
  `by_plan`) și arăta 0 / „Niciun venit estimat încă" cu venit lunar. Păzit de `verify_proba_modele.js`.
- ⚠ **Factura citește NUMELE modelelor din `plans.js`** (`oferta` / `trepte` / `fix`). Pe 15.09 au
  fost redenumite (din direct / tiered / flat), factura a rămas pe cele vechi și 8 zile a pus pe
  factură DOAR mașinile fără CAN (221 de lei → 86). Nu s-a emis nicio factură între timp. Registrul
  și factura trebuie să dea aceeași sumă: păzit de `verify_factura.js`, care citește numele din
  plans.js și compară factura cu registrul pe 12 feluri de flote.

## Facturarea: abonamentul pe zile, facturile unice, proforma, accesul (Alin, 28–29.09)

Alin: „1. A" (abonamentul pe zile, din prima transmisie), „2. da" (repară problemele de facturare), „3. da la
amândouă" (trecerea în bloc + factura unică din contract). Toate trei probate înainte pe server pornit.

### Accesul unei firme se oprește DOAR pentru neplată sau de mână
- **O singură regulă: `stareAcces(co, facturi, acum)`** (server.js) → `active` / `grace` (factură trecută de
  scadență, în cele 15 zile, cu `mesaj` din `neplata.mesajClient`) / `expired` (`motiv`: `neplata` | `manual`).
  `_accessStatusCached`, listele de firme, exportul registrului, cartonașul de pe „Acasă", `/api/me`,
  „Facturile mele" — toate trec prin ea.
- **Starea NU poartă motivul scris de noi** (`suspend_reason`) — pleacă și la oamenii firmei. Ecranele noastre îl
  citesc din fișa firmei (`company.suspend_reason`). NU pune înapoi un `nota` în `stareAcces` (lista lui Robert, pct. 3).
- **Harta live a unei firme oprite se închide și când era deja deschisă** (pct. 2): trecerea de la un minut
  (`_verificaLegaturileLive`) întreabă `_accessStatusCached` pe fiecare firmă și închide legăturile non-super cu
  `access_expired` — același cuvânt ca la deschidere; suspendarea de mână cheamă trecerea PE LOC. Telefonul aprinde banda
  roșie; pagina web (`connectWs`) reîncearcă atunci o dată pe minut, nu la 3 secunde, iar când profilul (verificat la
  4 secunde) spune că accesul a revenit, `applyAccessBanner` cheamă `_wsAccesRevenit` și harta se reconectează pe loc.
- **Ceasul vechi „acces până la" a fost SCOS** (`companyAccessStatus`, `GRACE_DAYS`, `billingReminderTick`
  cu anunțul lui orar, ruta `PUT /api/companies/:id/access`, `setCompanyAccessUntil`, formularul „Înregistrează
  plata + extinde accesul"). Bloca clienți care plătiseră tot: „Plătită" pe o factură punea `access_until` =
  sfârșitul perioadei ei, iar la 15 zile după ea firma se bloca — pe o lună trecută, pe loc. Coloana
  `companies.access_until` a rămas în bază, dar **nu mai taie nimic**. NU reintroduce un ceas pe perioade plătite.
- „Plătită" = `db.payInvoiceAtomic` (plata + starea facturii, într-o tranzacție) + `_invalidateAccessCache`.
- **Titlurile avertismentelor de neplată se socotesc din `ZI_SUSPENDARE`** (11, 6 și 3 zile, în zilele 5, 10,
  13). Erau scrise de mână („10 zile", „5 zile") și contraziceau textul de dedesubt. NU le scrie cu cifre.
- **Factura automată pornește SINGURĂ la prima ofertă a firmei** (Alin, 29.09: „da"). În bază, orice firmă
  nouă are `auto_invoice` = false; `_aplicaOfertaPeFirma` o pornește DOAR când scrie prețul (firma n-avea
  unul), iar contractul răspunde cu `auto_factura: true`, ca ecranul „Client nou" s-o spună. Un client cu preț
  deja (negociat separat) își păstrează „Auto" cum era. Ziua de facturare (1) și termenul (15 zile) n-au
  casetă pe ecran. Păzit de `verify_contracte.js` (pe server pornit, ambele cazuri).
- `POST /api/companies/:id/payment` = **încasare fără factură** (sumă obligatorie), fără luni și fără acces.

### Abonamentul pe zile (`abonament.js`, curat)
- **Factura lunii M** = M întreagă pentru aparatele pornite înainte de 1 M + zilele din M-1 pentru cele pornite
  în M-1 (din ziua pornirii). Ce ține de firmă (RA Insight, păstrare, chirie, tarif fix) — la fel, de la prima
  mașină pornită. Pornirea dintr-o lună se facturează ÎNTOTDEAUNA pe factura lunii următoare, oricare ar fi
  ziua de facturare: nicio zi de două ori, niciuna pierdută.
- **`devices.abonament_de_la`** (ms) se scrie la PRIMUL pachet primit după ce aparatul e pe o firmă client
  (`_pornesteAbonamentul`, după scrierea reușită în ingest + în `/api/test/simulate`); `db.pornesteAbonamentul`
  nu suprascrie. Neasignat / demo / arhivat → nu pornește. `setDeviceCompany` o ȘTERGE când firma se schimbă.
  Corectura noastră: `PUT /api/devices/:imei/abonament` (super, audit, fără zile din viitor).
- **Migrarea o singură dată** (`migreazaPornireaAbonamentelor`, marcaj `abonament_pornire_migrat`): aparatele
  care transmiteau deja primesc o zi din trecut → plătesc luna întreagă, ca înainte. NU o rula a doua oară.
- Prețurile: `_liniiAbonament` cheamă **`buildInvoiceLines`** (aceeași funcție dintotdeauna) — pe o lună cu
  toate mașinile pornite, suma e IDENTICĂ cu factura veche și cu registrul. `buildInvoiceLines` rămâne și
  pentru „Contract ↔ factură" și registru (luna întreagă). Rândurile pe zile: `abonament.scaleaza`.
- **Pe rândul pe zile se rotunjește PREȚUL unei mașini** (45 × 17/31 = 24,68), iar valoarea = cantitate × preț
  (10 × 24,68 = 246,80). Până pe 29.09 se rotunjea valoarea și factura scria „10 × 24,68 = 246,77" — pe hârtie
  și în e-Factura. NU întoarce la rotunjirea valorii. Păzit de `verify_abonament.js` (fiecare zi, 4 luni, 4 prețuri).
- Scenariul complet (semnare în ianuarie, montaj întins pe februarie, neplata) a fost rulat pe server pornit cu
  ceasul mutat, 41 de verificări: facturile din 1 februarie (1.966,90 lei) și 1 martie (2.708,10 lei) sunt cele
  pe care le-a emis aplicația.
- Hârtia spune regula: contractul (IV) și condițiile ofertei. Nu promite altceva decât face aplicația.

### Fiecare factură știe ce e (`invoices.fel`, `luna`)
- `fel` = `abonament` (cu `luna` 'AAAA-LL') | `unica` | NULL (factură veche, de dinainte de 28.09).
- **Factura automată** caută DOAR abonamentul lunii (`db.abonamentLuna`, inclusiv anulat — ce ai anulat nu se
  reemite singur). Regula veche („orice factură în lună") a rămas doar pentru facturile VECHI, ca luna trecerii
  să nu se factureze de două ori. Până atunci, o factură pentru un aparat oprea în tăcere abonamentul lunii.
- **De mână:** a doua factură de abonament pe aceeași lună → **409** cu numărul celei existente; după anulare
  se poate reface. Fără `fel` (telefonul vechi) serverul îl deduce din rânduri („Abonament…"/„Supliment…").

### Factura unică și proforma
- `POST /api/invoices/draft { fel: 'unica' }` întoarce `dinContract` (`_unicaDinContract`): **aparatele din
  Anexa nr. 2 la cursul ÎNGHEȚAT acolo** + **lucrările de montaj executate și nefacturate** (cantitățile
  reale). La o factură FISCALĂ, lucrările trimise în `montaje` trec pe `facturat_clientului`
  (`db.marcheazaMontajeFacturate`) și nu mai sunt propuse.
- **Proforma:** `tip: 'proforma'`, serie proprie `PF_SERIES` (implicit „PF") — NU ia numere din șirul fiscal.
  Fără ANAF și fără XML (refuz 400), nu intră în neplată, nici în „Prima factură" din drum (`drumDateToate`),
  nici în venituri. `PUT /api/invoices/:id/status {paid}` pe o proformă = **„Încasată"**: emite factura fiscală
  (seria RAT, aceleași rânduri, `din_proforma`), o marchează plătită atomic, iar proforma primește
  `factura_id`. A doua apăsare nu face a doua factură; proforma încasată nu se anulează.

### „Încasată" dintr-o bucată, montajul facturat o singură dată (01.10, punctele 18 și 19 ale lui Robert)
- **„Încasată" pe proformă = `db.incaseazaProforma`, O tranzacție:** revendică proforma (`UPDATE … WHERE` încă
  neîncasată și neanulată) → numărul din seria fiscală → plata → factura fiscală (plătită) → `factura_id` →
  lucrările de pe proformă. A doua apăsare (web + telefon, aceeași secundă) găsește proforma încasată → `{ deja }`, iar
  ruta întoarce `already` cu factura primei. O eroare la mijloc întoarce TOT (și numărul). Emailul/ANAF
  (`_trimiteFactura`) DUPĂ commit. NU reintroduce pașii separați (`createInvoice` + `payInvoiceAtomic` + `updateInvoice`)
  pe ramura asta — proba îi rulează ca martor și arată că fac mai multe facturi.
- **„Liberă de facturat" e O regulă: `_MONTAJ_LIBER` în db.js** — montată (`executat` / `facturat_de_partener`), fără
  `factura_client` și fără o proformă neanulată în `proforma_client`. O folosesc: `listMontaje`/`getMontaj`
  (`liber_de_facturat`, `factura_client_nr`, `proforma_client_nr`), ciorna facturii unice, „Montaj de facturat" (și
  anunțul), refuzul de la emitere (`montajeNelibere`, 409, și la previzualizare), marcarea și rezervarea. NU filtra
  lucrări de facturat după stare în altă parte.
- **Pe proformă, lucrarea se REZERVĂ** (`proforma_client`), nu se marchează; la „Încasată" trece pe factura fiscală
  (`factura_client`, `facturat_clientului`). Proforma anulată o eliberează singură (regula se uită la starea ei).
- **Pe factură, `factura_client` + `facturat_clientului`, și rămâne așa:** schimbarea stării unei lucrări facturate →
  409 (ce ne-a facturat partenerul se scrie în `factura_partener`); o salvare fără stare păstrează starea (nu mai
  coboară la „de programat"); o lucrare aflată pe un document nu se șterge (409). Factura ANULATĂ eliberează lucrările
  (`elibereazaMontajeleFacturii`): înapoi la `facturat_de_partener` dacă are numărul facturii lui, altfel `executat`.
- Proformele emise înainte de 01.10 nu-și știu lucrările (n-aveau legătura). Păzit de `verify_facturare_dubla.js`.
- Hârtia proformei: „FACTURĂ PROFORMĂ" + „document fără valoare fiscală" (`factura_pdf.js`, aceeași hârtie).
- **Factura montajului e STRÂNSĂ** (Alin, 29.09: „da"): lucrările alese în „Generează factură" se adună pe
  rânduri (aceeași denumire ȘI același preț — alt preț = rând separat), iar zilele lor intră în mențiuni:
  „Montaj executat pe 15.01.2027 (10 mașini), … și 30.01.2027 (15 mașini)." O SINGURĂ regulă, în pagină:
  `_giStrangeLucrarea` / `_giNotaMontaj` (între sentinele „factura montajului, strânsă"); câte mașini pe zi
  vine de la server (`masini` în `_unicaDinContract`). Mențiunea pleacă în `note` și se poate corecta.
- **Pe hârtie, factura unică și proforma NU scriu „Perioada"** (era ziua emiterii de două ori), ci „Mențiuni:";
  abonamentul își păstrează perioada. Păzit de `verify_abonament.js` (codul paginii, decupat și rulat).
- Ce fel de factură se emite la încasarea unui avans (de avans / finală) = întrebare pentru contabil, în
  „De amintit". Nu schimba forma fără răspunsul lui.

### Previzualizare, proforma la semnare, secțiuni (Alin, 30.09: „că se pot face greșeli")
- **„Previzualizează"** în „Generează factură": `POST /api/invoices/previzualizare` compune documentul prin
  ACEEAȘI funcție ca emiterea (`_compuneFactura`, păzit prin numărare) și desenează ACEEAȘI hârtie
  (`factura_pdf.js`, cu `previzualizare: true` → „PREVIZUALIZARE" în locul numărului). NU salvează, NU ia număr,
  NU trimite nimic. Pagina trimite același corp la amândouă (`_giCorp`).
- **Proforma gata la semnare:** după „E semnat" (listă — `raxCtreSemnat`; fișă — `raxCtrTreci('activ')`), dacă
  contractul are aparate VÂNDUTE (`_areAparateVandute`: Anexa nr. 2 cu echipamente), se deschide fereastra
  facturii pe proformă, cu aparatele din contract puse (`raxProformaLaSemnare`). Nu emite singură.
- **Facturare are două secțiuni:** „Facturi" și „Proforme" (cu câte sunt de încasat) — `raxInvSectiune`.
- **Pe rândul ofertei, un buton cu nume:** „Deschide dosarul clientului" (înainte: „Client nou din ofertă";
  după: fișa firmei). NU-l întoarce la o iconiță.

### Hârtia facturii e UNA, pe server: `factura_pdf.js` (Alin, 30.09: „de acord")
- `facturaPdf(inv, emitentAcum)` desenează factura fiscală și proforma (PDFKit, `logo-light.png`, DejaVu sub
  aliasul „Nunito"), lângă hârtiile contractului și ale ofertei. Numele: **„RA-Track - Factură {număr} -
  {client}.pdf"** / „RA-Track - Proformă …" (`numeFisier`), antetul scris de `_antetDescarcare`.
- Rute: `GET /api/invoices/:id/pdf` (super-admin) și `GET /api/billing/my-invoices/:id/pdf` (administratorul
  firmei, DOAR documentele firmei lui, fără ciorne). „Nu e a ta" și „nu există" răspund la fel: **404**.
- Pe ecran: `_invHartieBtns(url, proforma)` → „Vezi" / „Descarcă", prin `raxHartie` (aceeași fereastră ca la
  contracte). **Șablonul HTML și fereastra de printare au plecat** (`_invFiscalHtml`, `raxPrintFiscalInvoice`,
  `raxPrintMyInvoice`, `_raxOpenInvoiceWindow`). NU scrie o a doua hârtie în pagină.
- **Emailul atașează ACELAȘI PDF** (`_pdfInBuffer(facturaPdf.facturaPdf(…))`) — clientul primește exact ce
  descarcă.
- „CUI: RO…" doar la plătitorul de TVA (`cuiAfisat(cui, vat_payer)`), la fel ca în e-Factura.
- Telefonul (`DocumentFactura.tsx`) își desenează încă foaia lui, pe ecran; „Descarcă" pe telefon se leagă de
  aceleași două rute, la APK-ul următor. NU face o a doua hârtie PDF pentru telefon.

### Orice factură pleacă SINGURĂ, pe o singură cale: `_trimiteFactura(inv, co, iss)` (Alin, 30.09)
- Chemată din TREI locuri: factura automată a lunii, `POST /api/invoices` (de mână: unică, montaj, proformă) și
  „Încasată" pe proformă (factura fiscală născută din ea). Păzit prin numărare. NU scrie a patra cale.
- Face trei lucruri, fiecare cu eșecul lui scris, nu înghițit: **anunțul** în aplicația clientului („Factură
  nouă: …" / „Proformă nouă: …"), **emailul** către `contact_email`, cu PDF-ul atașat, și **ANAF** — doar
  factura fiscală, niciodată proforma. Întoarce `{ notificare, email, emailMotiv, anaf, anafEroare }`;
  răspunsul rutei îl poartă ca `trimisa`, iar ecranul îl spune (`_invTrimisaText`).
- ⚠ **O factură aflată deja la ANAF nu se mai trimite a doua oară** (`efactura_status` `uploaded` /
  `validated` → 409 pe `POST /api/invoices/:id/efactura`, iar butonul nu apare): ar dubla factura în SPV-ul
  clientului. Se retrimite doar una respinsă (`error`) sau netrimisă.
- ⚠ **…și NU se mai anulează** (01.10, găsit de Robert): acolo rămâne valabilă, deci „anulată" + refăcută = două facturi
  la ANAF pe aceeași lună. `PUT /api/invoices/:id/status {canceled}` → 409 (`laAnaf`, „se stornează, cu contabilul");
  lista poartă `la_anaf`, iar pagina nu arată „Anulează". O SINGURĂ regulă pentru amândouă: `_laAnaf(inv)`. Stornarea
  (factura cu minus) nu e încă în aplicație.

### TVA-ul clientului: `companies.vat_payer` (30.09)
- „Preia de la ANAF" (Client nou și „Completează") scrie și dacă firma e plătitoare de TVA; `updateCompany` și
  `completeazaDosarFirma` primesc DOAR `true` / `false` (orice altceva nu atinge câmpul).
- Lipsă = plătitor (`vat_payer !== false`), ca înainte: clienții vechi nu se schimbă pe tăcute.
- De aici ies „RO" din fața CUI-ului pe hârtie și codul de TVA din e-Factura. ANAF nu dă nimic NOU pe factură
  față de ce cerem clientului: dă datele oficiale (nume, Reg. Com., sediu) fără greșeli de tastare și
  statutul de TVA. Reprezentantul și emailul tot de la client le luăm.

### Aparatele VÂNDUTE: avans pe proformă, montajul în 30 de zile de la încasare (Alin, 29.09)
„1.A, 2.DA, 3.DA". A înlocuit regula din 21.09 („echipamentele se facturează la livrare").
- Aparatele se plătesc **integral în avans, pe proformă**, la semnare (termenul de plată al firmei); montajul
  **după executare**, pe mașinile montate efectiv.
- Livrarea și montajul: în cel mult **`MONTAJ_ZILE_DUPA_AVANS` = 30** de zile de la **încasarea** avansului;
  avansul neplătit în **`AVANS_ZILE_RENUNTARE` = 30** de zile de la semnare → oricare parte poate renunța.
  Cifrele stau în `contracts.js`; contractul și oferta le citesc de acolo. NU le face variabile de mediu.
- Mașinile neaduse la montaj: termenul se prelungește, drumul în plus se plătește (tariful de deplasare din
  Anexa nr. 2, dacă există), iar abonamentul unei mașini nemontate nu începe (regula pe zile, mai sus).
- Unde stau: contract IV (plata), V (termenul + mașinile neaduse), VII (renunțarea), Anexa nr. 2 (fraza de
  sus); oferta: prima condiție + cea despre mașini (a doua, doar dacă oferta are montaj). La închiriere nu
  există avans. Păzit de `verify_abonament.js` (5b, hârtiile desenate), `verify_montaj.js`, `verify_tarife.js`,
  `verify_stoc_chirie.js`.
- **Aplicația NUMĂRĂ termenul (30.09)** — `contracts.termenMontaj(contract, avansLa, montate, acum)`:
  - `avansLa` = **prima proformă încasată după ce s-a făcut contractul** (`avansContract`: factura fiscală
    `din_proforma`, cu `issue_date` ≥ `contract.created_at`). Un contract vechi, încheiat, nu-și dă avansul
    celui nou. Fără avans încasat → **fără termen**, nu unul inventat.
  - `deMontat` = montajele de aparat GPS din Anexa nr. 2 (`masiniDeMontat`); `montate` = aceleași din lucrările
    executate (`drumDateToate`). Pasul „Montajul" din drum se bifează abia la **toate** (nu la prima lucrare).
  - Zile de CALENDAR, pe ora României: în ziua termenului scrie „azi e ultima zi". Textele („mai sunt 7 zile",
    „10 din 50 de mașini montate") le scrie serverul (`termenText`, `montateText`) și le trimite gata; ecranul
    NU-și face a doua regulă.
  - Pe drum: rândul pasului mereu; banda portocalie cu `MONTAJ_AVERTIZARE_ZILE` (7) înainte, roșie după.
    Anunțul zilnic (`contractExpiryTick`) merge DOAR la super-admini, o dată pe termen și pe stare (cheia are
    termenul în ea). Clientul nu primește nimic.
  - Aplicația nu știe dacă mașinile n-au fost aduse (termenul se prelungește, cap. V): anunțul de depășire o
    amintește, nu hotărăște. Păzit de `verify_drum.js` (regula, anunțul pe bucata din server.js cu ceasul
    mutat, drumul pe server pornit).
- **Plățile către instalator (punctul 4, 30.09): AMÂNATE** până la primul partener de montaj real (Alin: „de
  acord"). NU le construi din proprie inițiativă.

### Trecerea mai multor aparate pe firmă
- `PUT /api/devices/company-bulk { company_id, imeis }`, `PUT /api/devices/:imei/company` și „Mută între
  companii" (`PUT /api/devices/company/bulk`, din Companii) trec TOATE TREI prin **`_trecePeFirma`** (o singură
  funcție: firma, cache-urile, pornirea abonamentului, stocul, auditul). Până pe 30.09 a treia scria direct în
  bază (`setDevicesCompanyBulk`, scos): noua firmă ar fi plătit abonamentul de la pornirea de la vechea firmă.
- Pe ecran, DOAR în „Dispozitive → Neasignate" (bife + bara `_raxDevBaraBloc`) — adopția rămâne într-un
  singur loc (17.09). NU pune bife de adopție în altă parte.
- **Bara lucrează doar pe ce se vede** (01.10): rândurile, „Toate" (`raxDevBifaToate`) și „Trece pe firmă"
  (`raxDevTreceBloc`) folosesc ACEEAȘI regulă, `_raxDevVizibil` (fila + căutarea), prin `_raxDevNeasVizibile`. Pleacă
  exact cifra din bară, ca pe telefon (`bifateVazute`). Firma aleasă stă în `_raxDevBlocFirma` (nu se golește la o bifă).

### Ce vede clientul
- „Facturile mele" (`GET /api/billing/my-invoices`) = **documentele adevărate** ale firmei (facturi + proforme,
  fără ciorne), cu „Vezi" / „Descarcă" pe PDF-ul de pe server (`factura_pdf.js`). NU mai arăta plăți cu număr inventat (`_raxInvNo` — scos: făcea
  „RAT-AAAA-000{id plată}", care se putea bate cap în cap cu o factură adevărată). Răspunsul mai poartă
  `amount_ron` doar pentru telefonul vechi, până la APK.
- Păzit de `verify_abonament.js` (în `npm test`, inclusiv pe server pornit), `verify_neplata.js`,
  `verify_companii.js`, `verify_factura.js`.

### Banii, după lista lui Robert (lotul 2, 01.10) — regulile, ca să nu se strice la loc
- **TVA:** cota stă DOAR în „Date emitent"; fără ea, `COTA_TVA_IMPLICITA` = 21 (din 01.08.2025). `_liniiNormalizate`
  pune pe fiecare rând cota emitentului — cota trimisă de ecran NU contează. Hârtia (`factura_pdf.js`) scrie cota aplicată
  pe rânduri. Pagina și telefonul pornesc tot de la 21. NU pune înapoi 19 nicăieri.
- **Aparatele din contract** se propun minus ce stă deja pe documentele firmei (facturi și proforme NEANULATE, emise de la
  facerea contractului, aceeași denumire de rând; proforma încasată nu se numără — factura ei e deja acolo):
  `_aparateDejaFacturate` în `_unicaDinContract`, care întoarce și `aparateDejaPe` (numerele documentelor). Web și
  telefon doar le arată. Avertismentul socotit pe telefon (`aparateDejaPe` din lib/factura.ts) nu mai e pe ecran.
- **Lucrările de montaj pe factura web** urmează regula telefonului (blocul „factura montajului, strânsă"): `_lucrari` pe
  rând, `_giAcoperire` / `_giMontajeDeTrimis` / `_giRefaNota`; pleacă în `montaje` doar lucrările ÎNTREGI pe factură.
  NU reintroduce `_giState.montaje` / `_giState.puse` (o listă ținută separat de rânduri). Legate de telefon în
  `verify_facturare_telefon.js` (1.3b, 14 cazuri). Lucrările fără `id` (proba lui Alin) primesc unul în fereastră.
- **„E deja facturată luna?"** = `_abonamentulLunii`: factura de abonament a lunii SAU una VECHE (fără `fel`, cu rând
  „Abonament…/Supliment…", neanulată, cu perioada peste lună — `db.abonamentVechiLuna`). Ceasul automat și-a păstrat
  regula lui pentru luna trecerii.
- **Abonamentul lunii M se emite de pe 1 M** (`_abonamentPreaDevreme`): emiterea și previzualizarea refuză (400,
  `preaDevreme`), ciorna poartă textul refuzului, iar ecranele doar îl arată și sting butoanele.
- **„Lunar" (Companii) și „Contract ↔ factură"** numără DOAR aparatele pornite (`abonament_de_la`), ca factura; fără
  niciunul pornit = 0 (și fără RA Insight, chirie, păstrare — pornesc odată cu prima mașină). Chiria care ajunge pe
  factură (`chirieFirma`) nu e „nefacturată".
- **`_uitaPornirea(imei)`** la ștergerea definitivă și la orice (re)înregistrare (POST /api/devices, import, prima
  conectare din stoc): altfel memoria `_aboPornit` ținea un aparat nou „pornit" până la repornirea serverului.
- **`POST /api/companies/:id/payment` refuză `months`** (telefoanele ≤ 1.0.4, „extinde accesul"): plata se trece pe factură.
- **`_stocLaFirma`** mută și o bucată deja „montată" la altă firmă (proprietarul rămâne), cu rând în istoric.
- Păzit de `verify_reparatii_lista.js` (în `npm test`). Facturile vechi se pun în baza probei de un pas separat
  (`--faza=seed`), cu fusul UTC, ca serverul (server.js își pune `TZ=UTC` la pornire).

### Facturarea pe telefon (APK 1.0.5, lotul 4 — 30.09)
Telefonul face ce face pagina, pe aceleași rute; serverul nu știe că e telefonul. Ce trebuie știut când schimbi
facturarea pe web:
- **Regulile ferestrei stau în `mobile/src/lib/factura.ts`, legate de pagină** prin `verify_facturare_telefon.js`
  (în `npm test`), care RULEAZĂ bucățile paginii (`_giStrangeLucrarea` / `_giNotaMontaj`, `_giLunaText`, `_myInvStare`,
  „Ce e" din lista de facturi, întrebările lui `raxInvoiceMarkPaid`) și pe ale telefonului pe aceleași cazuri. Schimbi
  una pe web → proba pică până o schimbi și pe telefon. NU slăbi proba; mută regula.
- **O singură adresă deschide „Generează factură"**: `rutaFactura(companyId, fel)` → `/billing?factura=<id>[&fel=unica]`
  (drumul clientului, fila Facturi din fișă). **O singură foaie a documentului**: `components/DocumentFactura.tsx`,
  cu trei priviri (Facturare / fișa firmei / client).
- **Unde telefonul face dinadins altfel** (din revizia lucrului din 29.09): o corectură de mână pe un rând de montaj nu
  se rescrie; o lucrare scoasă de pe factură NU pleacă în `montaje`; avertismente pentru luna care n-a început, aparatele
  deja pe o proformă și montajul pus pe proformă. Când Alin le repară pe server/web, telefonul poate rămâne cum e.
- **Banda de acces** (`components/BandaAcces.tsx`, în `App.tsx`) arată `access.mesaj` de la server — telefonul NU
  socotește zile sau sume. Motivul nostru intern al unei suspendări nu ajunge la telefon deloc (din 01.10 serverul nu-l
  mai trimite clientului); proba păzește oricum ca telefonul să nu citească un `nota`.
- **O singură formulare pentru suspendare** (lista lui Robert, 01.10, pct. 26): `MESAJ_SUSPENDAT` = „Accesul este suspendat.
  Contactați furnizorul pentru reactivare." — aceleași vorbe ca banda de sus (web și telefon); pe telefon
  `MESAJ_SUSPENDAT_LA_INTRARE = MESAJ_ACCES_SUSPENDAT`. NU pune înapoi „pentru neplată": se spunea și la o oprire de-a noastră.
- **Contul suspendat, ca pe web** (hotărât pe 30.09: „la fel ca și pe web"; APK 1.0.6): la PORNIRE iese din aplicație
  (`bootstrap` → `accesOprit`, doar pe profilul proaspăt de la server), iar ecranul de autentificare arată
  `MESAJ_SUSPENDAT_LA_INTRARE` = `MESAJ_SUSPENDAT` de pe server = textul din `checkAuth` de pe web (legate prin probă,
  care rulează `checkAuth`). Cu aplicația deschisă: banda roșie, fără buton. „Vezi facturile" stă DOAR pe banda de
  restanță — singurul lucru în plus față de web.
- **Hârtia facturii pe telefon = PDF-ul serverului** (factura_pdf.js): `DocumentFactura` pune `HartieBtns` (aceleași
  butoane ca la contracte) pe `rutaPdfFactura(id, laClient)` — `/api/invoices/:id/pdf` la noi, `/api/billing/my-invoices/
  :id/pdf` la client. Mesajul de după „Emite" / „Încasată" = `trimisaText(r.trimisa, pf)`, legat de `_invTrimisaText`
  din pagină (proba le rulează pe amândouă). NU desena o hârtie a facturii în telefon.

### Telefonul 1.0.7 (lotul 5, 01.10): calendarul, anunțurile, legăturile
- **Adresele de legătură sunt UNA fiecare:** `rutaFactura(id, 'unica', { tip:'proforma', aparate:true } | { lucrari })`
  (lib/factura.ts; Facturare le citește prin `pregatireDinAdresa`), `rutaCalendarMontaj(contractId)` (lib/calendarMontaj.ts;
  Montaj citește `?fila=calendar&contract=`), iar unde duce un anunț — `adresaAnunt(tip, data)` (lib/push.ts): aparate noi →
  Dispozitive cu bife și firmă, montaj de facturat → factura pregătită, cerere demo → Cereri demo, termenul de montaj →
  calendarul pe contract. Lista, detaliul și push-ul folosesc aceeași funcție. NU scrie a doua adresă pentru aceeași țintă.
- **Calendarul de pe telefon NU socotește nimic** (ce mai e de programat, prețuri, „montată" cu mai puține): le spune
  serverul (montaj.js). Textele și culorile din calendar sunt ale paginii, legate prin probă.
- **Unde telefonul face dinadins altfel decât web-ul:** „Montaj de facturat" căzut spune eroarea (web: „· 0"); banda „Firma
  e propusă…" doar pentru firma din anunț; termenul de montaj duce în calendar (web: fereastra goală). Restul — la fel.
- Păzit de `verify_telefon_lot5.js` (în `npm test`).

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
- **„Client nou" (Companii) arată și el linkul** (`coNouArataLinkul` → `_usrAratLinkul`). Până pe 29.09 îl
  arunca și scria „Fără administrator încă", deși contul exista — fără SMTP, fiecare client nou rămânea fără
  cale de a-și pune parola. Orice ecran nou care face conturi arată linkul întors de server.
- **Pagina `set-password.html` cere `PAROLA_MIN`** (10), exact ca serverul — scria „min 6". Legate prin
  `verify_utilizatori.js`; dacă schimbi cifra într-o parte, proba pică.
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
- **Utilizatori, în privirea FONDATORULUI** = doar **conturi de platformă** (coleg nou la RA Track).
  Un singur rol în formular (`superadmin`), selectorul de companie mereu ascuns, antet „Adaugă
  utilizator (specific pentru colegi noi RA Track)". NU pune înapoi roluri de firmă client acolo.
- **Utilizatori, în privirea CLIENTULUI** = oamenii firmei lui, **inclusiv alți administratori**.
- **Companii → firma → fila Utilizatori** = doar **oglinda** (cine sunt administratorii activi) plus
  **trusa de reparat**: formularul de adăugare (`_raxCodAdminiHtml` + `raxCoAddAdmin`, pe ruta
  `POST /api/companies/:id/admin`) apare **NUMAI dacă firma are ZERO administratori activi** — cazul
  pe care nimeni din interior nu-l poate rezolva (s-a sărit pasul de admin la „Client nou"). Dacă
  firma are administratori, formularul nu se vede deloc: nu ne băgăm în gospodăria ei.
- Linkul de parolă se arată cu ACEEAȘI fereastră peste tot (`window._usrAratLinkul`). Nu scrie alta.

### Fereastra „Companie" — filele „Stare" și „Acces" (Robert, 12.10: „un dashboard pentru fiecare companie… prin taburi")
Opt file: **Stare** (prima, implicită) · Detalii · Utilizatori · Vehicule · Facturi · Abonament & plăți · Contract ·
**Acces** (ultima). Pe telefon (`CompanySheet.tsx`) aceleași, în aceeași ordine.
- **„Stare" = relația NOASTRĂ cu firma** (acces, contract, bani, aparate, RA Insight ca cifre, module, drumul) — NU ce
  face firma în aplicație (regula lui Robert). Socoteala e curată și pe două părți: `_raxStareCartonase` (pagină, între
  reperele „fila Stare") ↔ `cartonaseStare` (mobile/src/lib/companii.ts); `verify_firma_stare.js` le rulează pe aceleași
  firme. Schimbi un text într-o parte → îl schimbi și în cealaltă. Datele vin din același `/overview` (`insight` = doar
  conturi / fond / folosite).
- **„Acces" = comutatoarele modulelor, agenții AI, limita AI.** Panoul separat (`rax-cfg-overlay`) a fost ȘTERS;
  `raxOpenCompanyConfig(id)` deschide fereastra pe „Acces". NU pune înapoi a doua cale. Modulele: `_RAX_MODS` (web) =
  `MODULE_FIRMA` (telefon), legate prin probă.
- **Modulul `incarcare` (simulatorul) merge DUPĂ FLOTĂ cât nu-l alegem noi** (Robert: „1.a"): `plans.featuresFor` →
  `areFlotaGrea(id)`, flota ținută minte de server (`_flotaGreaReincarca` → `db.firmeCuFlotaGrea(plans.TIPURI_CU_MARFA)`).
  Se reîncarcă la pornire, la 2 minute și la orice cale care schimbă felul sau firma unui vehicul (aparat nou, import,
  `_trecePeFirma`, `PUT /api/devices/:imei` + `/details`, arhivare / restaurare). O cale NOUĂ de felul ăsta cheamă și ea
  `_flotaGreaReincarca()`. Ales de noi = `settings.features.incarcare` (true / false); `null` = „Înapoi la automat"
  (`_applyCompanySettingsPatch` șterge cheia). Ecranele citesc „ales / automat" din `_accesModule` (features_setate,
  dupa_flota, flota_grea) — nu-și socotesc flota.

### Flota pentru simulatorul de încărcare (Robert, 12.10: „să poți alege din flota pe care o ai deja… 3.5t, 7t")
- **Regulile stau în `incarcare.js`** (curat): `FELURI_VEHICUL` (autotractor fără caroserie, dubă 3,5 t, camion 7,5 / 12 /
  18 t, altul), `FEL_REMORCA` + `TIPURI_REMORCA` (semiremorca ≠ remorca cu proțap), `curataRemorca`, `curataCaroserie`,
  `paletiEur` / `paletiInd`. Cifrele obișnuite ajung la ecrane DOAR prin `GET /api/incarcare/meta` (+ `tipuriCuMarfa`) —
  pagina și telefonul NU le scriu (proba caută zecimale în blocurile paginii).
- **Semiremorcile: tabela `remorci`** (a firmei; în `BUSINESS_TABLES`; pleacă cu firma în `deleteCompany`).
  `/api/remorci`: modulul `incarcare` pe toate patru rutele, scrierea cu `requireEdit('vehicule')`, `ownsRow` → 404, firma
  o ia serverul (clientul nu alege; noi alegem `company_id`, fără firmă = 400). O semiremorcă trecută intră în flota care
  pornește simulatorul (`firmeCuFlotaGrea` face UNION cu `remorci`; POST → `setFlotaGreaFirma`, DELETE → reîncărcare).
- **Fila „Încărcare" = coloanele `inc_*` pe `devices`** (în `VEHICLE_DETAIL_COLS`; metrii în `DECIMAL_COLS`). Ruta
  `/details` le trece prin `incarcare.curataCaroserie` (400 pe față) și cere ca `inc_remorca_id` să fie a firmei mașinii.
  `inc_remorca_id` se golește la ștergerea semiremorcii (`deleteRemorca`) și la mutarea mașinii pe altă firmă
  (`setDeviceCompany`). Sarcina utilă rămâne `payload`, limitele pe axe în „Config Camion".
- **Regulile ecranului sunt CURATE și pe două părți**, legate prin `verify_flota_incarcare.js`, care le rulează pe aceleași
  cazuri: pagina — blocurile „fila Încărcare" (`_incVizibile`, `_incObisnuite`, `_incDeTrimis`), „semiremorcile din flotă"
  (`_remRandText`, `_remObisnuite`), „felul vehiculului" (`_VEH_FELURI`, `_vehFelul` + `markerCategory`) ↔ telefon
  `mobile/src/lib/incarcare.ts`. Schimbi una → o schimbi și pe cealaltă. Schimbarea felului înlocuiește doar căsuțele
  goale sau rămase cu cifra felului dinainte (ce a scris omul rămâne); „Pune cifrele obișnuite" — toate (sarcina utilă
  doar goală / neatinsă).
- **Filtrul pe fel urmează PICTOGRAMA din listă** (`markerCategory`: iconița aleasă întâi, apoi felul), nu desenul de pe
  telefon (`vehCatOf` are mai puține desene). De aceea lista telefonului (`refreshRoster`) ține și `icon`.
- **Pe telefon semiremorcile au ecranul lor** (`/remorci`, din Vehicule): lista de vehicule e harta vie. Pe web stau ca
  rânduri în Administrare → Vehicule (`st-rem`, fără semnal). Diferență dinadins.
- Fereastra semiremorcii (`#rem-modal`) stă peste lista de vehicule (`z-index: 2100`).

### Simulatorul de încărcare pe web (pasul 3, 12.10: „cu 3D și greutatea pe osii")
- **Regulile stau în `incarcare.js`** (curat): `vehiculDin` / `semiDin` / `remorcaDin` (din fișă; ce lipsește se ia din
  cifrele obișnuite și se spune în `presupuse`; „Altul" fără caroserie = `lipsa` → eroare, nu ghicit), `aranjeaza` (rânduri
  de la peretele din față; „după opriri" = ultima oprire în față; un rând merge în primul corp în care încape — camionul
  se umple întâi, apoi remorca), `osii` (momente față de axe, pivot `PIVOT_DE_LA_FATA`, șa), `simuleaza` (cifrele și
  TEXTELE gata scrise: indicatori, osii, masa, mesaje, stare, legenda, ordinea). Limitele: `max_axle_loads` (axa 1 = față,
  2–5 adunate = spate) și `max_weight_legal`, altfel `limFata` / `limSpate` / `masaMax` ale felului. NU scrie reguli de
  așezare sau de osii în altă parte.
- **Rutele** (`server.js`, toate `withScope` + `requireFeature('incarcare')`): `GET /api/incarcare/flota` (vehiculele care
  cară marfă, fără demo / arhivate; semiremorcile), `POST /api/incarcare/simuleaza`, `POST /api/incarcare/pdf`. Ecranul și
  hârtia trec prin ACEEAȘI `_incSimulare` (drepturile pe vehicul — `canAccessImei`, deci vizualizatorul doar pe mașinile
  lui —, semiremorca firmei vehiculului, de felul potrivit). Telefonul (etapa următoare) le folosește pe aceleași.
- **Ce se cuplează la un vehicul = O regulă: `incarcare.remorciPentru` / `remorcaPotrivita` / `felCuplat`** (13.10, Robert:
  „am adăugat o remorcă dar tot nu-mi apare în simulator"): autotractor → semiremorcă, camion → remorcă cu proțap, dubă →
  nimic, mereu din firma vehiculului. `_incFlota` pune pe fiecare vehicul `remorci_ids` + `remorci_mesaj` (DE CE lipsește:
  alt fel, altă firmă, dubă) + `remorci_gol`; `_incSimulareDin` verifică tot cu `remorcaPotrivita`. Pagina
  (`remorciPotrivite`, `alegeri`) și telefonul (`Simulator.tsx`, `potrivite`) NU mai filtrează singure: până pe 13.10
  regula era scrisă de patru ori în ecrane, iar o remorcă de alt fel dispărea pe tăcute (la camion, grupul nici nu apărea).
  Un TIR trecut „Camion" (`felDinTip`) e camion — mesajul îi spune omului să schimbe felul în fila „Încărcare".
- **Atașarea din fișa remorcii** (13.10, Robert): legătura e TOT `devices.inc_remorca_id` (aceeași ca în fila „Încărcare" a
  vehiculului) — NU face o a doua. `GET /api/remorci/cuplare` (`?id=` sau `?fel=&company_id=`) → vehiculele potrivite
  (`incarcare.vehiculePentruRemorca`, pe `remorcaPotrivita`) + motivul; `PUT /api/remorci/:id/atasare { imei | null }`
  (`requireEdit('vehicule')`, ownsRow, 400 pe nepotrivire) → `db.atasezaRemorca`: o remorcă la UN vehicul (se desprinde de
  oricare altul). `listRemorci` întoarce `atasata_imei` / `atasata_plate`. „Deschide în simulator" = `simDeschideVehicul`
  (web) / `/incarcare?vehicul=&remorca=` (telefon). Rândul remorcii are „Șterge" (`remSterge(id)` primește id-ul de pe rând).
- **Pagina nu socotește** (blocul „simulatorul de încărcare", între repere): trimite alegerile și desenează ce primește.
  Presetările, modurile, culorile opririlor vin din `/api/incarcare/meta`. Desenul (lateral, de sus, 3D rotibil) e portat
  din macheta aprobată și citește corpurile, coletele și axele de la server. **Din 13.10 vehiculul arată a vehicul** (Robert:
  „desenele mai realiste, cel puțin mașina arată rău"; apoi „mai lucrează la desenul mașinii"): cabina e un corp cu profil
  (`prisma` — profil x–z întins pe y; se desenează doar fețele cu normala spre privitor, `V` pe vedere: lateral
  `[0.35, -1, 0.625]`, 3D `[sin, cos, SA/CA]`; capătul dinspre privitor se pune ULTIMUL, ca un profil cu scobituri — duba,
  capotă + parbriz — să nu se acopere singur), rotunjită sus, cu parbriz, geam, ușă, mânere, trepte, partea de jos închisă
  (`sim-cabjos`) și dunga, far, bară, aripă, oglinzi pe braț și față (grila, din 3D); deflectoarele (lateral la autotractor;
  pe acoperiș când caroseria e cu peste 0,22 m mai înaltă decât cabina). Duba e dintr-o bucată (partea de jos continuă, cu
  scobitura roții). Sub corpuri: șasiul, rama podelei, rezervorul cu chingi, picioarele semiremorcii, proțapul, bara din
  spate; pe partea privitorului (`laturi`): aripile și apărătorile de noroi, bara laterală, lămpile galbene și cele roșii din
  spate; roțile cu jantă (și în 3D, și de sus), umbra și drumul. Podeaua de marfă e la `G` deasupra drumului (1,15 m; duba
  0,62). Orice clasă nouă din desen primește culoare pe AMBELE teme, pe web (`app.css`, `.sim-svg`) ȘI pe telefon
  (`simulator.css`, `.ts-svg`) — păzit: proba adună clasele din desen și le caută în toate patru locurile. Planul în lucru se ține în
  `localStorage` (cu try/catch) — o comoditate, nu o salvare. Rândul `#nav-incarcare` (data-view) se arată din `updateFabs`
  — din pasul 4 doar celui care face planuri (vezi mai jos, `_incDispecer`).
- **Colțurile sunt rotunde (13.10, seara; Robert: „are grafica din desene animate, fă-le ceva mai rotunjite"):** O funcție,
  `_simRot(pts, raze, n)` (în bloc), face arce tangente — profilul cabinei (`cabRot`: profil de bază + raza fiecărui colț în
  metri; parbrizul = latura dreaptă care pleacă din vârful 3) și formele plate la ieșire (`ROT` pe clasă, în pixeli; în vederea
  de sus `rot` pe formă). Corpurile cu mai multe fețe (cabina, pereții) NU se rotunjesc față cu față — s-ar vedea scobituri
  între fețe. Fâșiile cabinei n-au contur (stroke = fill), marginea dinspre fundal e `sim-muchie`, curbura are nuanța
  `sim-cab4`, acoperișul (`sim-cab2`) e alb pe tema deschisă (avea culoarea fondului); marfa are margine închisă, subțire, nu
  linii albe. Fără `<path>` / `<circle>`: hârtia (`_formeSvg`) citește doar poligoane, linii și text — o rotunjire = mai multe
  puncte în poligon. Păzit de `verify_plan_incarcare.js` (secțiunea 2).
- **Hârtia: `incarcare_pdf.js`** (curat, A4 culcat, `logo-light.png`): desenează rezultatul simulării, nu socotește.
  **Desenul de pe hârtie E desenul ecranului** (13.10, Robert: „da"): `desenPagina()` citește blocul „desenul
  simulatorului" din `public/index.html` (în vm) și culorile temei deschise din `app.css` (regulile `.sim-svg .sim-…` fără
  `body.dark`; fondul din `.sim-svg`), apoi pune pe pagină poligoanele, liniile și etichetele SVG-ului — vederea de sus și
  cea laterală, una lângă alta. NU scrie al doilea desen pe hârtie: schimbi desenul în pagină, se schimbă și pe hârtie (o
  clasă fără culoare pe tema deschisă iese neagră și acolo). Fără desen citit, hârtia scrie „Desenul nu s-a putut încărca."
  — nu desenează altul. Păzit de `verify_plan_incarcare.js` (aceleași poligoane, o pagină, pe 7 simulări).
  Marfa și osiile trec pe pagina a doua doar dacă nu încap. Nume: „RA-Track - Plan de încărcare {număr} - {zi}.pdf”.
  Descărcarea = blob + `_numeDinAntet`.
- Culorile: tonurile și structura desenului au pereche pe ambele teme (verdele pe alb = `#166534`, măsurat ≥ 4,5).
- Păzit de `verify_simulator.js` (în `npm test`), inclusiv pe server pornit.

### Planurile de încărcare (pasul 4, 12.10: „hai cu etapa 4" — telefonul, șoferul, „Am încărcat")
Dispecerul trimite planul unui om al firmei (de obicei șoferul), care îl vede pe telefon și apasă „Am încărcat" sau „Am o
problemă"; anunțul ajunge la cine l-a trimis. Macheta aprobată: artboard-ul „Telefon" = ecranul șoferului.
- **Se țin doar ALEGERILE** (tabela `planuri_incarcare`: vehicul, semiremorcă, mod, opriri, marfă + cine / când a trimis,
  încărcat, problema). Cifrele se socotesc din nou la fiecare deschidere, prin `_incSimulareDin` (pe care o cheamă și
  `_incSimulare`) — o fișă schimbată schimbă și planul. NU salva rezultatul simulării.
- **Textele stau în `incarcare.js`:** `stareaPlanului` (netrimis / trimis / încărcat / problemă — cea mai nouă dintre
  încărcat și problemă câștigă), `cand` (ora pe ora României: „azi, 09:12", „ieri, …", „10.10, …"), `notaSofer`, iar din
  `simuleaza`: `pasi` (ordinea de încărcare, singular la o bucată), `osiiRezumat`, `rezumatSofer` (cu `ramane` — ce nu
  încape DELOC nu e un pas, dar șoferul trebuie să afle). Pagina și telefonul doar le arată.
- **Cine face și trimite planuri: `_incDispecer`** = super-admin, cine are `manageFleet` (admin, manager) SAU rolul
  `dispatcher` (n-are `manageFleet`, dar planul e treaba lui). Aceeași regulă pe web (`updateFabs`, rândul din meniu) și pe
  telefon (meniul, `PlanuriIncarcare`) — legate prin probă. Robert o poate restrânge (la „De amintit", 12.10).
- **Cine vede un plan: `_incVedePlanul`** — cui i s-a trimis (cât e trimis: `_incAlMeu`), cine l-a făcut / trimis, și
  cine face planuri în firma planului, cu vehiculul în drepturi. Șoferul NU are nevoie de drepturi pe camion. Planul reluat
  (PUT) redevine netrimis și dispare de la șofer; deschis din anunțul vechi, îi spune „Dispecerul reface planul…".
- **Noi (super-admin) nu vedem planurile firmelor** — doar pe cele făcute de noi (`creat_de`), și doar pe ele le schimbăm
  (Robert: „nu vrem să vedem ce face o companie"). NU lărgi `listPlanuri` / `_incVedePlanul` pentru super-admin.
- **Trimiterea:** doar unui om ACTIV al firmei planului, cu acces neexpirat, nu unui cont de platformă; planul fără marfă nu
  se salvează și nu se trimite. Lista de oameni (`/api/incarcare/destinatari`) vine cu rolul scris de server (`_incRolEt`:
  rolul propriu → numele dat de firmă → numele standard) — ecranele nu-și țin liste de nume de roluri.
- **Anunțurile** (`_incAnunta`: notificare + WebSocket + push, `data.planId`): `plan_incarcare` la șofer → planul lui;
  `plan_incarcat` / `plan_problema` (cu textul, ≤ 300) la cine a trimis → planul, în simulator. Web: `notifPlan`; telefon:
  `adresaAnunt` (lib/push.ts) cu adresele din lib/incarcare.ts (`rutaPlanSofer`, `rutaPlanSimulator`, `RUTA_PLANURI`).
- **Desenul e UNUL:** `_simSvg` (pagina, blocul „desenul simulatorului", curat) și `mobile/src/lib/simDesen.ts` = COPIA
  întocmai. Schimbi desenul pe web → copiezi blocul pe telefon; proba compară SVG-ul pe 210 combinații și textul funcțiilor.
- **Telefonul:** `/incarcare` (simulatorul; deschide planul din `?plan=`), `/incarcare/planuri` (lista), `/incarcare/plan/:id`
  (ecranul șoferului). Bara de butoane `.ts-jos` stă LIPITĂ de marginea de jos (`bottom: 0` + `--sab`): ecranele astea n-au
  bara de file (`showTabs` din App.tsx); pe 13.10 stătea ridicată cât bara de file și plutea peste pagină (Robert, captură). Nu socotește nimic; „Ai schimbat planul" e SOCOTIT (ce e pe ecran față de planul salvat), nu ținut
  minte. Șoferul pe web primește planul din anunț (fereastra `simPlanSofer`); lista „Planurile de încărcare" e pe telefon.
- **Cuvântul „plan":** „planul de încărcare" e altă noțiune decât planurile de preț (ca „plan de service") și apare pe
  ecrane; o etichetă care începe cu „Plan" singur NU (`verify_fara_planuri.js` o prinde — „Plan nou" a devenit „Începe altul").
- Păzit de `verify_plan_incarcare.js` (în `npm test`), inclusiv pe server pornit, plus `verify_simulator.js` și
  `verify_telefon_lot5.js` (adresele anunțurilor).

### Fereastra „Companie" (`#rax-codetail-overlay`) — capcanele ei, măsurate
Se deschide din Companii (clic pe firmă), din „Deschide firma" (Dispozitive, Tahograf) — o singură
fereastră (opt file din 12.10). Două lucruri din ea s-au reparat pe măsurători, nu din ochi (Alin, 18.09):

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

### Aparatele intră o singură dată: în Stoc, cu IMEI-ul (Alin, 30.09: „da")
- Un tracker (`montaj.ECHIPAMENTE` cu `transmite: true`: FMC130/150/650) trecut în Stoc e **primit la conectare**
  fără să fie scris și în Dispozitive: lista de acceptate = `registeredImeis` (Dispozitive) ∪ `stocImeis` (stoc,
  nu casat), prin `_imeiPrimit`. La prima conectare se face rândul lui, fără firmă (→ Neasignate), cu `gps_model`
  din stoc (`_aparatNouDinStoc`, doar dacă n-a scris nimeni altul). Străinul și arhivatul — refuzați, ca până acum.
- **La un tracker, seria din stoc E IMEI-ul** (`montaj.seriiFaraImei`): altceva se refuză la intrare și la corectură,
  cu seria pe nume. Modulele (LV-CAN) au serie liberă.
- **Din stoc e primit DOAR ce e încă al nostru și nemontat** (`stoc.PRIMITE_LA_CONECTARE` = depozit, la instalator;
  01.10, găsit de Robert): după prima conectare hotărăște rândul din Dispozitive (arhivat = refuzat). Montat la client,
  returnat, defect, casat → NU e primit doar fiindcă e în stoc — altfel un aparat șters definitiv ar reveni singur, cu
  poziții noi. La ștergerea definitivă (`DELETE /api/devices/:imei`), bucata încă în depozit/la instalator trece pe
  „defect", cu notă. NU lărgi lista de stări.
- `stocImeis` se ține în pas la intrare, la ORICE mutare (`primitLaConectare(stare)`), corectura seriei, ștergere și
  legarea de firmă (`_stocLaFirma`); plus reîncărcarea la 2 min (`loadRegisteredImeis`). Dacă adaugi o cale nouă care
  schimbă seria sau starea unei bucăți, ține lista în pas.
- „Adaugă dispozitiv" rămâne (aparate care nu trec prin stocul nostru). Adopția rămâne în Neasignate.
- Păzit de `verify_aparate_noi.js` (în `npm test`), cu trackere adevărate pe TCP, în mod strict.

### Anunțul „aparate noi transmit" (Alin, 30.09: „pregătește-l ca notificare, să fie funcțional când face Robert")
- **O singură funcție anunță: `anuntaAparateNoi({ imeis, companyId, partenerId, lucrareId, sursa, acum })`** (server.js).
  Azi o cheamă semnalul (`aparateNoiTick`, la 3 min); raportul instalatorului (Robert) o va chema cu
  `sursa: 'instalator'` și firma știută. Păzit prin numărare. NU scrie a doua cale de anunț.
- Anunțul merge DOAR la super-admini (`_anuntaSuperadmini`, fără firmă pe notificare). Un aparat se anunță o singură
  dată (`devices.anuntat_nou_la`); firma propusă stă în `devices.anuntat_firma` cât aparatul e fără firmă și se șterge
  la trecerea pe firmă (`_trecePeFirma`). Ce era în Neasignate înainte de 30.09 s-a marcat o dată
  (`migreazaAparateNoiAnuntate`).
- **Loturi:** 20 de minute fără un aparat nou în lot, cel mult 3 ore — sau pe loc, când s-au adunat toate mașinile
  programate în ziua aia la firma propusă. Memoria loturilor (`_aparateNoiVazut`) e în memorie: la repornire se reia.
- **Firma propusă** (`montaj.propuneFirma` / `grupeazaAparateNoi`, curate): montajul `programat` sau montat din ziua
  aparatului sau din cele `ZILE_POTRIVIRE_MONTAJ` (2) dinainte, la instalatorul la care stă aparatul în stoc. Două firme
  posibile, sau alt instalator decât cel din calendar → **nicio propunere**. O lucrare „de programat" nu propune nimic.
- Textele: `montaj.anuntAparateNoi` (singular/plural, „de", azi/ieri/pe ZZ.LL). Clicul (`notifAparateNoi`) →
  `raxDevDeschideNeasignate({ imeis, firma })` → bifează aparatele din anunț ȘI toate cele cu aceeași `anuntat_firma`,
  alege firma în bară (`_raxDevBlocFirma`). Trecerea rămâne apăsarea omului („Trece pe firmă", cu confirmare).
- Anunțul vechi „Dispozitiv nou conectat" (`notifyNewDeviceConnected`) a fost scos. NU-l pune la loc.
- Probele mută ceasul prin `POST /api/test/ceasuri` și `/api/test/aparate-montate` — DOAR sub `SEED_TEST=1`.
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
- În cele 30 de zile, dacă clientul cere datele înapoi: **„Descarcă tot istoricul"** de pe rândul mașinii (un singur
  Excel cu tot istoricul, o foaie pe lună — vezi la „Traseul descărcat", mai sus), sau un raport.
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
- **Termenul codului UIT e o CLIPĂ pe ora României (23.10; Alin: „rezolvă-le").** Coloana `valabil_pana` ține ora fără fus,
  serverul e pe UTC: „valabil până pe 23.10" ținea până pe 24.10 la 02:59. Acum: `etr.valabilPana` (propunerea, ziua de start a
  României) și `etr.termenDinFormular` (ce trimite ecranul: „AAAA-LL-ZZ[T23:59:59]" fără fus = ora României; cu fus = clipa) scriu
  ultima secundă a zilei de la noi, și în zilele cu ora schimbată. Crearea și corectura trec prin `_termenUitDinCerere` (400 pe o
  dată stricată). Termenele vechi „23:59:59" s-au mutat O DATĂ la pornire (`db.migreazaTermeneEtransport`, semnul
  `etransport_termen_ro_migrat`). O cale nouă care scrie `valabil_pana` trece prin `termenDinFormular` — NU scrie ora cu `setHours`.
  Păzit de `verify_etransport.js` (1b, 9, 10).
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

## Capcană: un atribut `onclick` / `oninput` vede doar `window` (30.09)
Panoul de administrare trăiește într-o funcție (`(function () { … })()`): variabilele lui (`_giState`,
`_raxDevSearch`, `_demoReqFilter`…) NU se văd din atributele HTML. Scris direct în atribut:
- `oninput="_raxDevSearch=this.value;…"` face o variabilă NOUĂ pe `window` — căutarea din Dispozitive n-a filtrat nimic;
- `oninput="_giState.nota=this.value"` aruncă „_giState is not defined" la fiecare literă — mențiunea corectată a
  facturii nu ajungea pe factură;
- `onclick="_demoReqFilter='new';…"` — filele din Cereri demo n-au filtrat nimic.
Nimic nu crapă vizibil: pagina merge mai departe. **Regula:** un atribut CHEAMĂ o funcție de pe `window`
(`raxDevCauta(this.value)`, `raxGiNota(this.value)`), nu scrie într-o variabilă. Păzit de `verify_aparate_noi.js`, care
caută forma în tot panoul.

## Harta: „când a transmis" — o singură regulă (Alin, 08.10: „rezolvă acum")
- `candATransmis(ts)` / `ziuaTransmisiei(ts)` (lângă `timeAgoPhrase`): fără oră → „fără transmisie" / „—". Lista din
  stânga a hărții, fișa mașinii (starea + „Ultima interogare") și fereastra grupei trec prin ele. O mașină fără nicio
  poziție (aparatul pus, montajul încă nefăcut) scria „acum 20734 zile" și „01.01.1970": `new Date(null)` e 1970.
- NU scrie `timeAgoPhrase(new Date(x))` fără `x ? ` înainte, pe același rând (lista din Management are „niciodată").
- **O mașină fără poziție nu are unde să zboare:** `selectDevice` cheamă `map.flyTo` doar cu `latitude`/`longitude`
  puse (altfel Leaflet aruncă o eroare și fișa nu se mai deschidea pe calculator); adresa din fișă scrie atunci „—".
- `getTimeAgo` scrie românește: „o oră", „21 de ore", „o zi", „25 de zile" (de la 20 în sus, cu „de").
- Păzit de `verify_harta_transmisie.js` (în `npm test`), care rulează regula decupată din pagină.

## „Distribuie locația" — linkul live al unei mașini, ca pe WhatsApp (Robert, 21.10)
Fișa mașinii (Localizare) → „Distribuie" → 15 minute / 1 oră / 8 ore → linkul `/locatie/<token>`, pe care îl deschide oricine,
fără cont (`public/locatie.html`: hartă, mașina care se mișcă singură, cartonaș jos pe telefon / în stânga pe calculator).
- **Regulile și textele stau în `locatie_distribuita.js`** (curat): `DURATE`, `MAX_ACTIVE_PE_MASINA` (10), tokenul (`tokenNou`,
  24 de octeți → 32 de caractere; în bază DOAR `amprenta`, sha256), `ramas`, `vechime`, `mesaj` (textul pentru WhatsApp) și
  **`pentruPagina` = SINGURUL lucru care pleacă spre public** (numele + numărul mașinii, firma, poziția, starea). NU adăuga acolo
  IMEI, șofer, istoric sau semnalele mașinii. Ecranele iau duratele și textele de la server.
- **Cine:** `_poateDistribuiLocatia` = `_incDispecer` (super-admin, `manageFleet`, dispecerul), pe 3 rute, plus `canAccessImei`;
  `/api/me` dă `poateDistribuiLocatia` (butonul `#detail-share-btn` apare doar atunci). Facerea și oprirea — în audit.
- **Linkul se vede o singură dată** (la facere): lista din fereastră arată doar până când merge, cine l-a făcut și „Oprește".
- **Un link care nu mai e bun răspunde la fel, oricare ar fi motivul** (404 `{ activ: false, titlu, text }`): expirat, oprit,
  inventat, mașina arhivată / ștearsă / mutată pe altă firmă (firma linkului ≠ firma de azi), accesul firmei oprit. Pagina scoate
  atunci mașina și urma de pe hartă și nu mai cere nimic. Expiratele se șterg la minut (`stergeLocatiiDistribuiteExpirate`).
  ⚠ `_locMasini` ține fișa mașinii 30 de secunde: o cale NOUĂ care mută o mașină pe altă firmă sau o șterge cheamă
  `_locMasini.delete(imei)` (ca `_trecePeFirma`, adopția, ștergerea), altfel linkul vechi mai merge până la 30 de secunde.
- Pagina publică: fără cookie-uri și fără analiză de trafic, `noindex` (meta + `X-Robots-Tag`), serviciul offline nu o ține în
  cache, textul cu textContent; fără Leaflet (rețea care blochează unpkg) cartonașul merge oricum, cu „Google Maps".
- **Telefonul (APK 1.0.20):** `mobile/src/components/DistribuieLocatia.tsx` (foaia; clasele `dl-` — `loc-` e al hărții din Flotă),
  deschisă din fișa mașinii doar cu `me.poateDistribuiLocatia`, pe aceleași rute (`Api.locatieDistribuita` / `faLocatieDistribuita`
  / `opresteLocatieDistribuita`). Schimbi fereastra web → schimbi și foaia.
- Hotărât de Robert (21.10): duratele rămân trei, cine poate rămâne cum e, publicul fără șofer, inclusă la toate firmele.
- Tabela `locatii_distribuite` e în `BACKUP_EXCLUDED`. Păzit de `verify_locatie_distribuita.js` (în `npm test`, pe server
  pornit, plus foaia telefonului).

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
