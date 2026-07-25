# RAPORT FINAL — RA Tracks · audit tehnic și comercial
**Data:** 25.07.2026 · **Bază:** audit static pe 5 zone (paritate, funcțional, documente, backend, agenți) + 10 verificări adversariale

---

## 1) VERDICT GENERAL

Platforma **nu este un demo** — nucleul (ingest Teltonika Codec8E, hartă live + WebSocket, 32 de rapoarte reale, 6 agenți euristici, facturare fiscală cu e-Factura UBL, izolare multi-tenant verificată endpoint cu endpoint) este cod real, funcțional și, în privința izolării pe companie, **peste media pieței**. Estimez **~85% „gata de vândut"** pe funcționalitate, dar **NU ești gata de lansare comercială azi** din trei motive care nu sunt de cod: un modul (e-Toll) afișează badge „REAL" peste cifre inventate, materialele de prezentare vechi promit o aplicație iOS care nu există, iar onboarding-ul unui client nou este imposibil fără intervenție manuală în DB (fără recuperare parolă în UI, invitații care eșuează tăcut fără SMTP).

Distanța până la lansare se măsoară în **zile de muncă, nu luni** — dar sunt zile obligatorii: ~5 corecții P0 de câteva ore fiecare, plus verificarea manuală a 6 variabile de mediu în Railway pe care nu le pot vedea din cod și de care depinde dacă ai sau nu backup al bazei de producție.

**Regula ta de paritate web↔APK este încălcată azi.** Nu la nivel de ecrane (mobilul are 38 de rute și acoperă aproape tot), ci în interiorul lor: 5 module lipsesc complet de pe telefon și fișa vehiculului e cu ~85% mai săracă. Nu promite „aceleași funcții ca în browser".

---

## 2) CE E SOLID — poți vinde fără rezerve

**Izolarea multi-tenant — cel mai bun lucru din tot codul.** Toate cele 19 endpoint-uri `:imei` trec prin `withScope` + `canAccessImei` (server.js:1190). Toate mutațiile `:id` trec prin `ownsRow` (server.js:1203) cu whitelist de tabele (db.js:1571) → zero SQL injection. Rapoartele revalidează IMEI-urile de două ori: la generare (server.js:1502) **și** la rularea programată (report_schedules.js:73-96) — un vehicul mutat între companii nu mai apare în raportul fostului proprietar. WebSocket-ul recitește rolul și compania **din DB** la fiecare socket (server.js:8084-8092). Am căutat activ o breșă cross-tenant; am găsit exact una (token push, §6), și aceea nu e exploatabilă doar din API.

**Izolarea companiei DEMO — completă și consecventă**, exact cum cere CLAUDE.md: `canAccessImei`, `resolveReportImeis`, listele de vehicule/poziții, cele 4 puncte de WebSocket, workerul de agenți, contoarele de platformă și ramura super-admin din rapoartele programate. Nu există nicio cale care listează flota reală fără filtru demo. Ștergerea fizică (`DEMO_DISABLED=true`, server.js:8288) e implementată, idempotentă și scoped strict pe IMEI-urile sintetice.

**Motorul de rapoarte: 32 de tipuri, fiecare cu funcție proprie de calcul** (reports.js:2185-2218) — mai multe decât spun toate documentele tale. Cu onestitate încorporată: consumul marchează explicit `estimated` vs. măsurat. Export PDF/Excel brandat centralizat (report_export.js → `sendReport`), disponibil și pe mobil, inclusiv din istoric. Rapoartele programate sunt complet reale: calcul `next_run`, generare, randare, atașare, trimitere e-mail, notificare in-app.

**Cei 6 agenți AI sunt euristici reale, cu zero tokeni la rulare automată** (agents.js:429-436). RA Watch face 4 verificări cu anti-fals-pozitiv (3 puncte consecutive pentru tahograf). RA Optimize folosește prețul real al companiei și distinge „au condus eco" de „n-am date". RA Compliance folosește segmentarea reală din reports.js cu disclaimer juridic corect. Dedup-ul e inteligent (12h pe aceeași cheie, 7 zile pe „ignorat", dar escaladarea warning→critical trece mereu — db.js:1527-1549).

**Restul infrastructurii care chiar funcționează:** TimescaleDB cu hypertable + compresie + retenție reală; STRICT_DEVICES activ implicit (IMEI-uri neînregistrate respinse la handshake TCP); webhooks semnate HMAC-SHA256 cu anti-SSRF real (blocare IP private, verificare DNS, `redirect:'error'`); import CSV cu protecție anti-injecție de formule; degradare grațioasă verificată pentru **toate** integrările opționale (Stripe/ANAF/SMTP/FCM/Railway/Cloudflare/GA4/Anthropic) — niciuna nu crapă aplicația dacă lipsește cheia; migrări idempotente (97/99 `ADD COLUMN IF NOT EXISTS`, 44/44 indecși `IF NOT EXISTS`); HOS Reg. 561 cu coloană „Sursa"; limite reale OSM cu atribuire ODbL; sticky CAN.

**Subvândut — funcții reale absente din toate materialele:** categoria „Senzori" (5 rapoarte: sondă litrometrică, greutate/supraîncărcare, basculare, braț utilaj, temperatură marfă) — exact diferențiatorii pe construcții și frigorifice; raportul săptămânal automat analizat cu Claude; modulul program de lucru pe 3 niveluri; sistemul intern de facturare + ofertare live; e-Factura ANAF (dormant, dar scris).

---

## 3) PARITATE WEB↔APK — lipsurile reale

*(exclus: jurnal audit și editor catalog IO — super-admin, excepție acceptată)*

### Lipsă totală pe APK (module întregi)

| Modul | Web | Mobil |
|---|---|---|
| **RA Dispatch / dispecerizare** | index.html:2318-2327, `raxOpenDispatch` 6321, `/api/dispatch/suggest` | **0 referințe** în tot `mobile/src` |
| **CRUD hotspot-uri/geofence** | cerc/poligon/coridor/desen liber, snap-pe-străzi, satelit, nume/culoare/categorie/grup (index.html:1867-1938, 4781) | **doar GET** (endpoints.ts:190). Codul mobil recunoaște: „Creează zone în aplicația web" |
| **Raport Transport** (curse, tone-km, cost, profit) | index.html:909-960 | inexistent |
| **Chei API + Documentație API** | index.html:1384 — **fără `data-super`**, deci e pentru admini de companie | inexistent |
| **Istoric alerte** | index.html:1730, `/api/alerts/history` | inexistent |

**Cel mai grav — agenții „live" sunt invizibili funcțional pe APK.** `LIVE_AGENTS = {dispatch, care, optimize}` (server.js:195) nu se persistă niciodată în `agent_findings` (server.js:2348, 2434). Web-ul compensează prin `GET /api/agents/:key/live` (server.js:2370). **Mobilul nu are acest endpoint deloc** (endpoints.ts:217-220) — se alimentează exclusiv din `/api/agents/findings`, care prin construcție exclude cei 3 agenți. Rezultat pe telefon: apeși „Rulează" pe RA Care, primești toast **„7 constatări · 0 noi"** peste o **listă goală**. Serverul chiar returnează constatările în `r.findings`, dar `AiAgents.tsx:33-36` le folosește doar pentru `.length` și le aruncă. Butoanele „Efectuat"/„Vezi" pentru mentenanță (AiAgents.tsx:110) sunt **cod mort** pe mobil.

*Atenuare verificată:* scadențele ITP/RCA/revizii ajung totuși pe telefon prin `checkExpiries` → push → ecranul Notificări. RA Dispatch și RA Optimize nu au niciun echivalent.

**Paritate inversată pe acțiunile agenților:** pe **web** panoul cu acțiuni (ack/„Efectuat") e `data-super` (index.html:1374) — clientul obișnuit vede o pagină **read-only** (index.html:16255). Pe **mobil** există ack + dismiss. Consecință: pe web constatările rămân `status='new'` la infinit și badge-ul crește permanent; acțiunea „Ignoră" (și ramura de suppression 7 zile) e practic **mobile-only**.

### Capabilități amputate pe APK

- **Fișa vehiculului:** web 7 taburi / ~45 câmpuri (index.html:514-827: config camion cu limite pe 5 axe, calibrare sondă litrometrică, sonde avansate, documente, service) vs. **7 câmpuri** pe mobil (VehicleDetail.tsx:110-138). Onboarding-ul unui vehicul e imposibil de pe telefon; fără capacitate rezervor, procentul real de combustibil nu se calculează.
- **Administrare vehicule:** lipsesc pe mobil creare pe IMEI (pentru admin de companie), arhivare/dezarhivare, import/export/șablon CSV.
- **Traseu:** mobilul are 3 presetări (azi/ieri/7 zile), fără interval custom, fără playback, **fără export CSV/KML** — deși exportul KML e vândut explicit în prezentare.
- **Rapoarte:** fără CSV, fără month-picker scadențe (`dueAll` forțat `true`, Reports.tsx:57 — riscul de a interpreta greșit lista de scadențe), fără ștergere în masă din istoric, fără „Rezumă cu RA Insight".
- **Praguri agenți:** lipsesc cele 3 praguri de dispatch pe mobil (Settings.tsx:12-21).
- **Alerte:** 17 tipuri web vs. 16 mobil (lipsește „Supraîncărcare pe axă" — codul mobil recunoaște singur).
- **Statistici:** mobilul nu are topuri km/consum, grafic km/vehicul, tabel flotă.
- **Tahograf / e-Transport:** read-only pe mobil **prin design declarat în cod** — dar tot e lipsă de paritate (upload .DDD, obținere UIT, start/stop transport = web-only).
- **Companii (super):** `setCompanyAccess` e definit în endpoints.ts:91 dar **nu e folosit în niciun ecran** → prelungirea accesului nu se poate face din APK.
- Mărunte: poză șofer, cost document, 15 vs. 8 tipuri de mentenanță, 23 vs. 8 tipuri de vehicul.

**Datorie tehnică de fundal:** listele duplicate hardcodate pe ambele platforme (alerte, mentenanță, tipuri vehicul) garantează drift viitor. Ar trebui servite din server.

---

## 4) NU E GATA / DEMO — ce NU promiți clientului acum

**e-Toll — cel mai periculos. Nu-l demonstra deloc în modul „real".** `/api/etoll/costs` (demo_modules.js:220-224) apelează **necondiționat** `simulateEtollCosts()` — cifrele vin dintr-un generator pseudo-aleator cu seed din IMEI (`h = h*1103515245+12345`, demo_modules.js:71-77). Dar modul devine „real" **doar prin selectarea unui nume de furnizor** din listă (demo_modules.js:20, 211-217) — fără credențiale, fără test de conectivitate. Rezultat: web (demo-modules-ui.js:110) și mobil (EToll.tsx:50) afișează **„● REAL"** și „Furnizor extern conectat" peste km și costuri fabricate. E singurul dintre cele 3 module demo **fără ramură reală** (e-Transport are integrare ANAF, tahograful răspunde onest 501). Câmpul „— SIMULAT în demo" apare, dar cu 11px muted, în contradicție directă cu badge-ul.

**Tahograf — descărcare la distanță = teatru.** demo-modules-ui.js:168-173 rulează **5 secunde** de bară de progres cu pași inventați („Conectare la tahograf (K-Line)…", „Autentificare card companie…", „Verificare semnătură digitală…") **înainte** de orice apel de rețea. Backendul întoarce o analiză **hardcodată** (demo_modules.js:108-133: aceleași 6 segmente, aceeași unică încălcare, mereu). Bara rulează chiar și în modul real, unde serverul răspunde 501 — utilizatorul așteaptă 5s de animație falsă ca să afle că nu e implementat.
*Nuanță în favoarea ta:* view-ul e **orfan** azi — butonul „Tahograf" din meniu duce la panoul REAL de upload .DDD; nimic din UI nu apelează `showView('tahograf')`. Dar codul e încărcat și e la o linie de nav distanță.
*Pagubă concretă:* descărcarea demo scrie un rând în tabela **reală** `tacho_files` (demo_modules.js:252-258), care apoi apare amestecat cu fișiere reale pe web **și pe APK**, afișat ca „0h 0m / OK — nicio infracțiune".

**Parserul .DDD nu e validat pe fișier real.** tacho.js:1-3 se autodeclară „BEST-EFFORT … scris după specificația UE FĂRĂ fișier real de test". Nu există niciun test cu .DDD real în repo. Aceeași situație la schemele ANAF (anaf.js:35, efactura.js:32 — „SCHEMĂ DE VALIDAT pe mediul de TEST"). **Nu vinde tahograful ca modul de conformitate până nu treci un fișier real prin parser.**

**e-Transport ANAF** — cod real, dar dormant fără token OAuth; UI-ul web adaugă `setTimeout(1400)` „ca să pară că vorbește cu ANAF" (demo-modules-ui.js:70).

**Plata cu cardul.** Butonul „Plătește" e **mort pe ambele platforme** — afișează doar un toast „va fi disponibilă în curând" (index.html:14524, Billing.tsx:44-46), deși backendul `/api/invoices/:id/pay-link` e funcțional și e folosit din lista super-adminului. Încasarea reală e manuală.

**Backup off-site — nu știu dacă există.** Se face zilnic, dar pleacă de pe mașină **doar dacă** `BACKUP_S3_ENDPOINT/BUCKET/KEY_ID/SECRET` sunt toate setate; criptarea AES-256-GCM se aplică **doar dacă** `BACKUP_PASSPHRASE` e setat (backup.js:36, 58, 123-131). Niciuna nu e documentată în `.env.example`. Pe filesystem efemer Railway, fără S3, un redeploy pierde tot. **Verifică manual în panoul Railway, azi.**

**Push nativ — probabil mort în APK-ul distribuit.** `push.ts:22`: `if (import.meta.env.VITE_ENABLE_PUSH !== '1') return;`. Variabila nu apare în `.env.example`, nici în `vite-env.d.ts`, nici în scriptul `build`, nici în `BUILD-MOBILE.md` — doar într-un comentariu. Orice `npm run build` obișnuit produce **tăcut** un APK fără notificări.

**Onboarding rupt.** `/api/auth/forgot-password` (server.js:2713) există dar **niciun client nu-l apelează** (0 referințe în `public/` și `mobile/`). Invitațiile: `catch (e) {}` gol (server.js:2692) + `sendSetPasswordEmail` întoarce `false` fără SMTP. Combinat: un admin de companie e creat cu parolă = hash random, nu primește email, nu are cale de recuperare → **cont inaccesibil, fără niciun avertisment în UI** (deși răspunsul serverului conține `invited` și `inviteEmailConfigured` — nimeni nu le citește).

**Ce mai depinde de config nesetat:** e-mail (SMTP), Telegram, FCM, AI (ANTHROPIC_API_KEY). Codul e complet și corect; fără variabile, funcțiile sunt dormante. „Rapoartele programate se trimit automat pe e-mail" **nu funcționează** fără SMTP.

---

## 5) DOCUMENTE DE PREZENTARE — corecții obligatorii

**Sinteză:** ai două familii de documente în circulație care se contrazic. `docs_promo/` (Prezentare + Tehnic, din `_content.json`) este în mare parte **onest și chiar subvinde** platforma — declară explicit ce e demo. `docs_build/` (Flyer + „Ce-avem-ready", PDF-uri prezente și în rădăcina repo-ului) este **vechi și conține afirmații false**. **Retrage din circulație `RA-Tracks_Flyer.pdf` și `RA-Tracks_Ce-avem-ready.pdf` până le regenerezi din aceeași sursă.**

| Afirmație în document | Realitate în cod | Gravitate |
|---|---|---|
| „Aplicație mobilă — **iOS & Android** (Capacitor), export nativ" (build_docs.js:180, 257) + tile-uri „Web + Mobil / iOS · Android" (:185, :264) | **Nu există lanț de build iOS.** Zero `@capacitor/ios` în `package.json` **și în `package-lock.json`**; niciun script iOS; `mobile/node_modules/@capacitor/` nu conține `ios`. Folderul `mobile/ios/` există local dar e **gitignored** (0 fișiere în `git ls-files`), stale și cu Podfile rupt (`require_relative` către cale inexistentă → `pod install` crapă la linia 1). `mobile/README.md:3` spune intern: „Aplicație mobilă **Android** (apoi iOS din același cod)". Agravant: documentul **are** badge „soon" și l-a folosit pentru e-Transport și Tahograf **pe aceeași linie 257** — deci iOS e prezentat deliberat ca livrat. `docs_promo/` e corect: zero mențiuni iOS. | **JURIDIC** |
| „**2 ani** / istoric păstrat" pe pagina de feature „Localizare live & istoric" (build_docs.js:246) | Pentru vehicule **active** retenția e **180 zile**, aplicată necondiționat de politica TimescaleDB (db.js:180-181). Contrazice propriul document tehnic (RA-Tracks-Tehnic.html:160-162: „retenție poziții 180 zile"). *Notă: celelalte 4 mențiuni „2 ani" (:178, :185, :249, :264) sunt **literal corecte** — se referă explicit la arhivă/încheiere contract. Dar formularea „păstrează istoricul 2 ani" sugerează adâncime de 2 ani, când `archiveDevicePositions` copiază doar ce mai există în `positions` la momentul arhivării = maximum ~180 zile, păstrate apoi 2 ani.* | **Mare** |
| „Geofence (zone)" listat în blocul roadmap „integrări în lucru — **nu sunt încă funcționale în producție**" (build_docs.js:182 sub :150) | Geofencing e **complet livrat**: CRUD (server.js:4968-4990), editor web cu 4 moduri de desen, alerte `geofence_enter/exit` pe web **și** APK, raport „Vizite în zone". În același timp RA-Tracks-Prezentare.html:242 îl vinde ca funcție live. **Două documente spun lucruri opuse despre aceeași funcție.** | Mare (subvânzare + inconsistență) |
| Numărul de rapoarte: „**28 tipuri**" (Prezentare:142, 193; Tehnic:162) / „**15+**" (build_docs.js:170, 185, 247, 264) / „19+" (plans.js:29) / „~25" (CLAUDE.md) | **32** (reports.js:2185-2218). **Nicio cifră din documente nu e corectă.** | Mediu (credibilitate) |
| „parsarea fișierelor .DDD și motorul de infracțiuni Reg. 561 **sunt reale**" (Tehnic:142, _content.json:527) | Parser BEST-EFFORT nevalidat (tacho.js:1, 142, 153). Și `docs_build/build_docs.js:182` spune **exact invers**: „citire reală fișiere .DDD **în lucru**". | Mare |
| „Cinci agenți AI" / „5 agenți AI" (_content.json:412, 471) | **6** (agents.js:429-436); plans.js:40 spune corect 6. RA Dispatch e listat ca „demo sau roadmap" deși e implementat, activabil per plan și are unealtă live pe web. | Mediu (subvânzare) |
| „RA Watch … offline, scădere combustibil, ralanti, **depășiri**" + doar 3 agenți listați (manual.html:493) | RA Watch **nu verifică depășiri de viteză** (niciun prag de viteză în agents.js:103-235). Manualul omite Dispatch, Compliance, Client și afirmă că „pragurile fiecărui agent se configurează per companie" deși Compliance și Client nu au praguri. | Mediu |
| „Bannerul «doar web» pe mobil" pentru e-Toll (_content.json:189) | Fals — `EToll.tsx` afișează ecranul complet cu badge DEMO/REAL, fără niciun banner. | Mic |
| „aceleași funcții ca în browser" (Prezentare:199) / „orice funcție nouă de pe web este adăugată și în aplicația nativă în aceeași iterație" (Tehnic:144) / „paritate operațională față de web" (_content.json) | Infirmat de §3. | **Mare** |
| „**100%** traseu pe drum" (build_docs.js:246) | Map-matching pe OSRM public, downsampling la 1500 puncte, la eșec întoarce `null`. Nicio garanție de 100%. | Mediu |
| „poziții în timp real pe 4G, la ~30s" (build_docs.js:169, 246) | Nesusținut din cod — frecvența e configurată pe tracker, nu de platformă. Confirmă pe configurația reală înainte de a o scrie. | Mic |
| „33 de tabele" în backup (Tehnic:154, 162) | **34** (backup.js:23-31). | Cosmetic |
| „Notificări livrate prin push (FCM), e-mail și Telegram" (Prezentare:164) | Toate trei sunt dormante fără variabile de mediu. | Mediu (condițional) |
| **Lipsă din toate documentele** | Cele 5 rapoarte de senzori, raportul săptămânal AI, program de lucru, facturare+ofertare, e-Factura. | Subvânzare |

**Și un contrasens comercial în produs:** `/api/plans` (server.js:2722) e **public, fără autentificare**, și expune grila 29/45/65 RON/vehicul. Contrazice direct modelul „fără planuri publice, ofertă personalizată" — orice prospect sau competitor vede „prețul de listă" înainte de negociere. Endpointul e, în plus, orfan (niciun client nu-l apelează). La fel, `mobile/src/screens/Menu.tsx:26-27` afișează „în curând" când e-Transport **nu e activat comercial** pentru companie — eticheta e invers față de modelul tău („fondatorii activează per companie").

---

## 6) RISCURI CONFIRMATE

### Securitate

**[MARE] Brute-force nelimitat pe login prin `X-Forwarded-For` spoofat.** `clientIp()` (server.js:1026-1030) ia **primul** element din lanțul XFF — adică partea scrisă de client. `app.set('trust proxy', 1)` e configurat (server.js:825), deci `req.ip` ar da valoarea corectă, dar **`req.ip` nu apare nicăieri în repo**. Un atacator care rotește headerul generează o cheie nouă la fiecare cerere → lockout-ul (server.js:1530-1542) nu se declanșează niciodată. Afectează `/api/login` **și** `/api/mobile/login` (server.js:1611-1615), rate-limiterul global (:943) și `/api/client-error` (:1036). **Nu există lockout per cont, nici contor persistent** (grep `failed_login`/`lockout` → 0 rezultate); singura frână rămasă e latența bcrypt — cost, nu limită. În plus, IP-ul din **jurnalul de audit** (server.js:1103) e controlat de atacator → jurnalul nu e probă. Am verificat 6 ipoteze de infirmare (middleware de normalizare, helmet/express-rate-limit, comportamentul Cloudflare/Railway); toate au eșuat.

**[MEDIU, cross-tenant] Deturnare token push.** `/api/push/device` (server.js:7817) cere doar `requireAuth` și face `ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id` (db.js:2359) — **zero verificare de proprietar**, iar `token` e `UNIQUE` global, deci conflictul e cross-tenant. Un utilizator din compania A care deține token-ul FCM al unui user din compania B îl re-leagă de contul propriu → telefonul victimei primește notificările atacatorului (nume vehicule, texte de alertă) și încetează să le primească pe ale sale. `/api/push/device/unregister` (:7927) și `/api/push/unsubscribe` (:7812) șterg **după valoare, fără `user_id`** → amuțire permanentă a alertelor altui utilizator. *De ce „mediu" și nu „critic":* platforma nu expune token-uri (`getDeviceTokens` filtrează pe `user_id`, backup și `/api/debug/*` sunt super-admin) → exploatarea cere posesia prealabilă a token-ului.

**[MEDIU] Scurgere intra-tenant pe constatările agenților.** `GET /api/agents/findings` folosește `withCompany`, **nu** `withScope` (server.js:2360) → un rol cu acces restrâns la vehicule (dispatcher/viewer, `viewAll:false`) vede titluri cu numele **tuturor** vehiculelor companiei. Același rol poate face ack/dismiss pe constatări din afara scope-ului (db.js:1561 verifică doar `company_id`). Contrast: unealta `fleet_alerts` a AI-ului filtrează corect.

**[MEDIU] `/api/invoices/:id/pay-link`** (server.js:7315) e protejat doar cu `requireAuth` + `withCompany`, **fără `requirePerm`** → orice `viewer` poate genera un link de checkout Stripe pentru facturile firmei.

**[MEDIU, cost] `/api/agents/run`** (server.js:2330-2354) declanșează un apel Claude plătit **fără `requireFeature('ai_assistant')`, fără `aiLimitReached()`, fără `requirePerm`, fără rate-limit**. O companie cu modulul AI oprit sau cu limita lunară atinsă consumă totuși tokeni; orice `viewer` poate apăsa „Rulează toți agenții" din APK și genera cost.

**[MIC] Autentificarea WebSocket mobilă trece cheia API prin query string** (`?token=gpsk_...`, server.js:8060) → ajunge în logurile de proxy/CDN.

### Scale

**[MARE] Trei workere globale cu N+1 sever.** `runTripDetection` (server.js:5701) apelează `getDevices()` fără `companyId` și rulează **secvențial** detecția per vehicul, fiecare cu un `getDeviceHistory` pe 36h (UNION positions+archive, până la 50.000 rânduri) — **la fiecare 15 minute**. La ~2000 de vehicule = ~2000 de query-uri grele secvențiale per ciclu, pe **același pool PG folosit de ingestul TCP live**. Similar: workerul de agenți (orar, cu istoricul zilei pentru toate vehiculele companiei simultan în RAM) și `checkExpiries` (la 12h, N+1 pe două niveluri). Fără batching, concurrency-limit sau coadă. **Ingestul Teltonika va suferi latență în ferestrele de rulare.**

**[MEDIU] `/api/notifications/unread-count`** face `COUNT(*)` fără LIMIT pe tabela `notifications`, cu `imei = ANY($2)` (array de până la 2000 IMEI), iar tabela **nu are index pe `imei`, `user_id` sau `company_id`** — doar pe `created_at` și `acknowledged` (selectivitate nulă). Endpointul e pollat de UI. **Cel mai probabil primul query care cade** pe măsură ce baza crește.

**[MEDIU] `/api/agents/:key/live`** (server.js:2370) nu are perm gate și, pentru `optimize`/`dispatch`, execută un `getDeviceHistory` **pe fiecare vehicul** la FIECARE deschidere a paginii Agenți. La 2000 de vehicule = mii de interogări pe istoric la un click → vector de auto-DoS.

**[MEDIU] Dependență de servicii publice gratuite fără SLA** pentru funcții vândute ca diferențiatori: OSRM public (map-matching), Overpass (limite reale OSM, 1 req/s + politici de blocare), Nominatim (geocodare, throttle 1100ms **serializat global pe proces** — la zeci de vehicule simultane, adresele sosesc cu întârzieri de minute).

**[MIC-MEDIU] Șase mape in-memory fără pruning/TTL** (server.js:5187, 5227, 5267, 1417, 1033, 5956): `tareSamples`, `alertCooldowns`, `geofenceStates`, `_wsCooldown`, `_clientErrHits`, `_userEvtCooldown`. Cel mai grav e `_clientErrHits` — cheia e IP-ul spoofabil, pe un endpoint **public** → creștere nelimitată provocabilă de un atacator neautentificat. (Contrast pozitiv: `livePositions` **are** plafon și evicție, `rlBuckets` prunează.)

### Date

**[MARE] Posibil zero backup off-site.** Vezi §4. Dacă `BACKUP_S3_*` nu e setat în Railway, dump-ul e generat în memorie și **aruncat**, cu un simplu `console.warn` — iar din UI backup-ul pare că „a rulat". Combinat cu `/api/health` care nu raportează starea backupului (backup.js:36 expune `getStatus()`, dar nu e conectat) și cu `.catch(() => {})` pe rularea programată → **poți rămâne fără backup luni de zile fără să afli**.

**[MEDIU] Dacă `BACKUP_PASSPHRASE` nu e setat**, dump-ul urcat conține **necriptat** hash-uri bcrypt de parole, hash-uri de chei API și datele de facturare ale tuturor companiilor.

**[MEDIU] Backup monolitic în RAM:** `SELECT *` pe toate cele 34 de tabele (inclusiv `notifications`, `audit_log`, `trips`, `alert_history` — niciunul prunat), ținute integral în memorie + `JSON.stringify` + gzip sincron. Va da OOM înainte să dea eroare clară.

**[MEDIU] Webhook Stripe fără tranzacție** (server.js:2841): `recordPayment()` și `updateInvoice({status:'paid'})` sunt două await-uri separate; eșecul celui de-al doilea = plată înregistrată + factură neplătită, cu doar un `console.warn`. Devine critic dacă activezi plata cu cardul la scară. La fel `deleteCompany` (db.js:1367).

**[MEDIU] Catch-uri goale care ascund erori critice:** server.js:1405 — upload-ul e-Factura la ANAF în facturarea automată e învelit în `catch (e) {}` **fără log**; dacă ANAF respinge factura, nimeni nu află. report_schedules.js:136 — eșecul trimiterii pe email e înghițit. Total: ~103 în server.js, 32 în reports.js.

**[MIC] Contaminarea tabelei `tacho_files`** cu rânduri demo (§4).

### Operațional / comercial

- **Compania DEMO rămâne fizic în baza de producție** până când cineva setează `DEMO_DISABLED=true` în Railway. Izolarea logică e corectă, dar datele fictive sunt acolo.
- **Poarta de abonament expirat nu e uniformă:** `_accessBlocked()` rulează doar în `withScope`/`withCompany`; ~21 de endpoint-uri cu `requireAuth` gol (inclusiv `/api/reports`) rămân accesibile unei companii expirate → subminează pârghia de încasare.
- **`viewAudit` e permisiune moartă:** definită pentru `company_admin` (server.js:1012) dar singurul endpoint de audit e `requireSuperadmin` (:1841). Dacă vinzi „jurnal de audit pentru administratorul companiei", afirmația e falsă.
- **`uncaughtException` nu oprește procesul** (server.js:355, decizie deliberată) — un proces corupt poate continua să scrie date greșite fără repornire.
- **`/api/live` mutează obiectele partajate** din `livePositions` în timpul enrichment-ului (server.js:3651) — o cerere de citire modifică starea globală live.
- **Fereastra reală de detecție offline e ~24h, nu 7 zile:** garda din agents.js:116-122 spune 7 zile, dar `livePositions` e purjat la 24h → **tocmai cazurile grave (tracker furat/deconectat de zile) devin invizibile**.
- **Textul „Furt combustibil — Dezactivat (recomandat)" minte pentru agent:** trimite `null`, cheia se șterge, dar agents.js:109 cade pe 10 L implicit și detecția rulează necondiționat. „Dezactivat" oprește doar alerta live; RA Watch continuă să emită findings `critical`.
- **`agent_findings` nu are retenție** — acumulează la nesfârșit, iar pe web clientul nu poate face ack → panoul devine inutilizabil în timp.
- **Praguri per companie:** butonul „Praguri" din web nu trimite `superCompanyQS` (index.html:16554) → un super-admin care filtrează pe compania X editează **în tăcere pragurile GLOBALE ale platformei**.

### Neverificabil static (necesită acces la Railway — verifică manual)

`COOKIE_SECURE` (dacă nu e setat, cookie-ul de sesiune pleacă fără flag Secure și HSTS nu se activează), `SESSION_SECRET`, `BACKUP_S3_*`, `BACKUP_PASSPHRASE`, `SENTRY_DSN`, `SMTP_*`, `FIREBASE_SA_JSON`, `ANTHROPIC_API_KEY`, `DEMO_DISABLED`; **dacă extensia TimescaleDB e efectiv activă** (db.js:174 degradează **tăcut** la Postgres simplu → zero compresie, zero retenție automată pe `positions`); dacă indecșii au fost creați efectiv în producție; dacă APK-ul distribuit clienților a fost construit cu `VITE_ENABLE_PUSH=1`.

---

## 7) PLAN DE ACȚIUNE PRIORITIZAT

### P0 — BLOCHEAZĂ LANSAREA (estimat: 2-3 zile de muncă + 1h de verificări în Railway)

| # | Acțiune | Efort | Fișiere |
|---|---|---|---|
| 1 | **Verifică manual în Railway** cele 9 variabile: `BACKUP_S3_*`, `BACKUP_PASSPHRASE`, `COOKIE_SECURE=true`, `SESSION_SECRET`, `SMTP_*`, `DEMO_DISABLED`, `SENTRY_DSN` + confirmă că extensia TimescaleDB e activă. Fără backup off-site nu lansezi. | S | (config) |
| 2 | **Fix `clientIp()`** → returnează `req.ip` (trust proxy e deja setat). Adaugă lockout **per username** cu contor persistat pentru `/api/login` și `/api/mobile/login`. | S | `server.js:1026-1030, 1530-1542, 1548, 1611` |
| 3 | **e-Toll: elimină minciuna.** Fie `/api/etoll/costs` întoarce 501 în mod „real", fie badge-ul rămâne DEMO indiferent de furnizor. Cea mai simplă variantă: `if (cfg.etoll.mode === 'real') return res.status(501)`. | S | `demo_modules.js:20, 211-224`; `public/js/demo-modules-ui.js:110`; `mobile/src/screens/EToll.tsx:37-50` |
| 4 | **Retrage din circulație** `RA-Tracks_Flyer.pdf` + `RA-Tracks_Ce-avem-ready.pdf`. Regenerează din `_content.json`: scoate iOS (sau mută-l în roadmap cu badge `soon`), schimbă `['2 ani','istoric păstrat']` → `['180 zile','istoric traseu']`, scoate geofence din roadmap, aliniază la **32 rapoarte**. | S | `docs_build/build_docs.js:180, 182, 185, 246, 249, 257, 264`; PDF-urile din rădăcină |
| 5 | **Onboarding:** adaugă link „Am uitat parola" în UI (web + `mobile/src/screens/Login.tsx`) către `/api/auth/forgot-password` (deja există, deja anti-enumerare); afișează în UI `inviteEmailConfigured=false` la creare de utilizator + oferă „setează parolă manual". | M | `server.js:2692-2713`; `public/index.html`; `mobile/src/screens/Login.tsx` |
| 6 | **Push token binding:** `DELETE ... WHERE token=$1 AND user_id=$2` la unregister; la INSERT, dacă token-ul e legat de alt user, auditează re-atribuirea. | S | `server.js:7812, 7817, 7927`; `db.js:2346, 2359, 2370` |
| 7 | **Gate pe `/api/agents/run`:** `requireFeature('ai_assistant')` + `aiLimitReached()` + `requirePerm` + rate-limit. | S | `server.js:2330-2354` |
| 8 | **`/api/agents/findings` → `withScope`** + filtrare pe `req.allowedImeis`; `updateAgentFinding` să verifice și IMEI-ul. | S | `server.js:2360`; `db.js:1561-1567` |
| 9 | **`requirePerm` pe `/api/invoices/:id/pay-link`.** | S | `server.js:7315` |
| 10 | **Ascunde butonul „Plătește"** (mort pe ambele platforme) sau conectează-l la `/api/invoices/:id/pay-link`. | S | `public/index.html:14500-14524`; `mobile/src/screens/Billing.tsx:44-68` |
| 11 | **`/api/plans` → `requireAuth`** sau elimină-l (e orfan). Contrazice modelul comercial. | S | `server.js:2722`; `plans.js:69` |
| 12 | **Build APK: `VITE_ENABLE_PUSH=1`** în scriptul `build` + documentează în `BUILD-MOBILE.md` și `.env.example`. Rebuild + re-distribuie APK. | S | `mobile/package.json`; `mobile/src/lib/push.ts:22`; `BUILD-MOBILE.md` |
| 13 | **Tahograf: elimină teatrul de 5s**, redenumește butonul „Generează analiză demo", marchează rândul din `tacho_files` cu `kind:'demo'` și exclude-l din `/api/tacho`. | S | `public/js/demo-modules-ui.js:168-173`; `demo_modules.js:252-258` |

### P1 — PRIMELE 2 SĂPTĂMÂNI

| # | Acțiune | Efort | Fișiere |
|---|---|---|---|
| 14 | **Paritate agenți live pe APK** (cel mai vizibil bug pentru client): adaugă `agentLive(key)` → `GET /api/agents/:key/live` și randează direct `r.findings` pentru `{care, dispatch, optimize}`, cu mesaj „ok" pe zero. Elimină toast-ul contradictoriu. | S | `mobile/src/api/endpoints.ts:217-220`; `mobile/src/screens/AiAgents.tsx:20, 33-36` |
| 15 | **Acțiuni pe constatări în web pentru clientul obișnuit** (ack + dismiss). Azi panoul cu acțiuni e `data-super` → badge-ul crește la infinit. Adaugă și `dismiss` pe web. | M | `public/index.html:1374, 16255-16340, 16680-16698` |
| 16 | **Ecran „Dispecerizare" pe APK** — endpointul e deja scris și autorizat, nu necesită modificări de server. | M | `mobile/src/screens/` (nou); `server.js:2397` |
| 17 | **CRUD geofence pe APK** (măcar cerc + poligon, cu nume/culoare/categorie) — fără el, alertele de zonă nu se pot configura end-to-end de pe telefon. | L | `mobile/src/api/endpoints.ts:190`; `mobile/src/screens/Hotspot.tsx` |
| 18 | **Index pe `notifications`:** `(company_id, acknowledged, created_at DESC)` + `(imei, created_at DESC)` + `(user_id, ...)`. Fix ieftin, impact mare. | S | `db.js` (blocul de indecși) |
| 19 | **Batching + concurrency-limit pe cele 3 workere globale**; feliere pe companie; limită de durată. | L | `server.js:5701-5760, 8354`; `agents.js:439-449` |
| 20 | **Tranzacție pe webhook Stripe** + log real pe eșec. Idem `deleteCompany`. | S | `server.js:2841-2846`; `db.js:1367-1371` |
| 21 | **Loguri pe cele 2 catch-uri critice** (upload e-Factura, trimitere raport programat) + alertă. | S | `server.js:1405`; `report_schedules.js:136` |
| 22 | **`/api/health` profund:** expune `backup.getStatus()`, ultima rulare a workerelor, starea ingestului TCP. Fără asta nu afli că backupul e mort. | M | `server.js:990-1004`; `backup.js:36` |
| 23 | **Fix praguri per companie:** `superCompanyQS` pe modalul „Praguri" + expune `alert_thresholds` în panoul super-admin de configurare companie (backendul le acceptă deja). | S | `public/index.html:16554, 16610, 13916-13941`; `server.js:6920` |
| 24 | **Corectează textul „Furt combustibil — Dezactivat"** ca să reflecte comportamentul real al agentului, sau fă `null` să dezactiveze efectiv detecția în agents.js. | S | `agents.js:109, 169-211`; `public/index.html:16518`; `mobile/.../Settings.tsx:15` |
| 25 | **Fereastra offline:** aliniază garda de 7 zile cu purjarea `livePositions` la 24h (sau citește ultima poziție din DB pentru vehicule dispărute din live). | M | `agents.js:116-122`; `server.js:8440-8452` |
| 26 | **Export CSV/KML traseu + month-picker scadențe + export CSV rapoarte pe APK** (vândute explicit în prezentare). | M | `mobile/src/screens/RouteScreen.tsx`; `Reports.tsx:57, 77` |
| 27 | **Fișa vehiculului pe APK** — măcar capacitate rezervor, consumuri, limită viteză, axe (fără ele, alertele de supraîncărcare și procentul de combustibil nu funcționează pe mobil). | L | `mobile/src/screens/VehicleDetail.tsx` |
| 28 | **Corectează `docs_manual/manual.html:493-497`** (RA Watch nu verifică depășiri; listează toți 6 agenții; Compliance/Client nu au praguri) și `_content.json` (5→6 agenți, RA Dispatch scos din roadmap, scoate „banner doar web" la e-Toll, adaugă categoria Senzori). | S | `docs_manual/manual.html`; `docs_promo/_content.json:189, 412, 471, 527` |
| 29 | **Actualizează `.env.example`** cu cele ~15 variabile nedocumentate (`BACKUP_*`, `STRIPE_*`, `ANAF_*`, `SENTRY_DSN`, `STRICT_DEVICES`, `RAILWAY_API_TOKEN`, `CLOUDFLARE_*`, `GA4_*`, `ANTHROPIC_ADMIN_KEY`, `VITE_ENABLE_PUSH`) și scoate `ANAF_ETRANSPORT_URL` (mort). | S | `.env.example` |
| 30 | **Retenție/pruning pe `agent_findings`** + pruning pe cele 6 mape in-memory, prioritar `_clientErrHits` (endpoint public). | S | `db.js`; `server.js:1033, 5187, 5227, 5267, 5956` |
| 31 | **Poarta de abonament expirat uniformă** — mută `_accessBlocked()` într-un middleware pe `/api`. | M | `server.js:1477-1488` |

### P2 — NICE-TO-HAVE

| # | Acțiune | Efort |
|---|---|---|
| 32 | Servește din server listele hardcodate duplicate (tipuri alerte 17/16, mentenanță 15/8, vehicul 23/8) — elimină sursa sigură de drift | M |
| 33 | Self-host OSRM + Nominatim (+ plan pentru Overpass) înainte de a depăși ~500 vehicule | L |
| 34 | Backup cu streaming/paginare în loc de tot în RAM | M |
| 35 | Endpoint de audit pentru `company_admin` (permisiunea `viewAudit` există deja, ramura din db.js:2090 e scrisă și inaccesibilă) | S |
| 36 | Istoric alerte + Chei API pe APK (chei API **nu** e super-admin-only) | M |
| 37 | Raport Transport pe APK; Statistici cu topuri/grafic km; import CSV vehicule pe APK | L |
| 38 | RA Client: rulează zilnic, nu orar (azi apare de ~2×/zi, tutorialul spune „o dată pe zi"); adaugă acțiune | S |
| 39 | Transparență pe estimări: expune `IDLE_BURN_LPH=1.5` și prețul fallback 7.5 lei/L în textul constatării | S |
| 40 | Log pe eșecurile per-agent din `runAll` (azi un agent care crapă apare ca „Totul e în regulă") | S |
| 41 | Token API din query string → header sau mesaj post-handshake (WS) | S |
| 42 | Rate-limit dedicat pe `/api/demo/login` (vector de DoS pe tabela de sesiuni) | S |
| 43 | Copiere defensivă în `/api/live` (nu muta obiectele partajate din `livePositions`) | S |
| 44 | Validează parserul `.DDD` pe fișiere reale de card șofer; validează schemele ANAF pe mediul de test | L |
| 45 | Scoate eticheta „în curând" din `mobile/Menu.tsx:26` când funcția e doar neactivată comercial | S |

---

## FORMULAREA COMERCIALĂ RECOMANDATĂ (înlocuiește „paritate 1:1")

> „Aplicația mobilă Android acoperă operarea zilnică — hartă live, traseu, alerte, rapoarte, agenți, administrare. Configurarea inițială a flotei (fișa completă a vehiculului, zone geografice, import CSV) și modulele avansate (dispecerizare, chei API) se fac în aplicația web."

Și nu mai spune „iOS" până nu există un build care compilează.