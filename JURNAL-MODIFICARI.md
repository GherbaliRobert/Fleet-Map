# Jurnal de modificări — RA Tracks

Aici scriu **fiecare modificare** pe care o facem, cu eticheta: *pentru cine e* și *cine o vede*.
Rostul lui e dublu: să învățați aplicația pe care ați construit-o, și ca înainte de lansare să pot
trece prin el și să vă trag de mânecă unde cele două perspective nu se potrivesc.

## Etichetele

| Etichetă | Înseamnă |
|---|---|
| **FONDATOR** | Doar voi, ca super-admini. Clientul nu vede și nu atinge nimic. |
| **CLIENT** | O vede și o folosește utilizatorul dintr-o companie. |
| **AMÂNDOI** | Atinge ambele perspective. **Aici apar aproape toate surprizele** — o modificare gândită pentru voi ajunge sub ochii clientului, sau invers. |

Fiecare intrare are aceleași trei rânduri: ce am schimbat, ce vede fondatorul, ce vede clientul.
Când ceva rămâne nelămurit sau nepotrivit între cele două, îl trec jos, la
**[De verificat înainte de lansare](#de-verificat-înainte-de-lansare)**.

---

## 2026-08-04

### AMÂNDOI · Alertele create de voi aparțin unei companii anume — `b0753a9`

**Ce am schimbat:** o regulă salvată de un super-admin ieșea „fără companie", fiindcă voi n-aveți
una. Formularul cere acum explicit compania.

**Fondatorul vede:** un câmp nou, *Compania regulii*, obligatoriu. Alegi compania → lista de
vehicule se restrânge la ea. Există și opțiunea „toată platforma", dar cu confirmare și marcată
portocaliu în listă.

**Clientul vede:** regulile pe care le faceți pentru compania lui îi apar acum în lista **lui** de
alerte și le poate opri. Înainte primea notificări de la reguli pe care nu le vedea nicăieri.

**Stare (04.08):** Loganul, care lipsea din lista de vehicule a formularului de alertă, apare acum.
Cauza n-a fost identificată — nu ținea de apartenența la companie (super-adminul vede vehiculele
tuturor companiilor, verificat în cod și în test). Închis ca rezolvat, fără explicație. Dacă
reapare, primul lucru de verificat e starea vehiculului, nu compania lui.

---

### FONDATOR · Nu se mai schimbă singură apartenența la companii — `1b50a9a`

**Ce am schimbat:** o migrare veche rula la fiecare pornire a serverului și, dacă exista măcar un
vehicul nerepartizat, muta în „Compania mea" tot ce n-avea companie din șapte tabele — inclusiv
alerte și zone. Acum rulează o singură dată.

**Fondatorul vede:** un vehicul nou adoptat rămâne „fără companie" până îl repartizați voi. Asta e
starea corectă, nu o eroare.

**Clientul vede:** nimic direct — dar înainte îi puteau apărea sau dispărea reguli fără ca nimeni
să fi atins ceva.

---

### AMÂNDOI · Alertele ajung ca notificări pe telefon — `1333a7c`

**Ce am schimbat:** tipul „alertă" lipsea din lista de preferințe de notificare, deci push-ul nu
putea fi pornit de nimeni, niciodată. Plus: zonele desenate de un super-admin erau invizibile
propriilor reguli (aceeași capcană cu compania lipsă).

**Fondatorul vede:** rândul *Reguli de alertă* în Preferințe notificări, cu push pornit implicit.

**Clientul vede:** același rând, și îl poate opri dacă vrea. Alertele lui ajung acum pe telefon.

> ⚠️ **De verificat:** livrarea trimite notificările **către orice super-admin, pentru orice vehicul
> de pe platformă** (`getUsersForImei`, db.js:2637). Cu push-ul pornit implicit, telefoanele voastre
> vor suna la fiecare alertă a fiecărui client. Vezi lista de jos.

---

### CLIENT · O regulă de zonă poate urmări mai multe zone — `1333a7c`

**Ce am schimbat:** câmpul „Zonă" e o listă cu bifă, nu un singur selector. Fiecare zonă traversată
se raportează separat.

**Fondatorul vede:** aceeași listă, filtrată după compania regulii.

**Clientul vede:** poate bifa toate punctele lui de lucru într-o singură regulă și primește un anunț
pentru fiecare. Înainte, a doua zonă dintr-o oră era înghițită în tăcere.

---

### AMÂNDOI · Traseu: butoane tăiate, calendar tăiat, aspect învechit — `93866ff`

**Ce am schimbat:** trei lucruri în panoul „Istoric traseu".

1. **Al patrulea buton se tăia.** Rândul de export avea patru butoane (CSV, KML, Limite reale,
   Aliniază pe drumuri) pe un singur rând, iar bara laterală are 340px. „Aliniază pe drumuri" se
   termina la 387px — ieșea 47px în afara panoului și se reteza la margine. Cauza: rândul era
   construit să nu se rupă niciodată pe două rânduri. Acum sunt două câte două.
2. **Calendarul se tăia la partea de jos.** Pe un laptop cu fereastră mai joasă (1366×610),
   calendarul de la „Până la" ieșea 53px sub marginea ecranului — exact peste zona unde se alege
   ORA. Biblioteca îl răstoarnă deasupra doar dacă încape integral acolo; când nu încape nici sus,
   nici jos, îl lăsa să iasă. Acum e tras înapoi în fereastră. Se aplică **tuturor** selectoarelor
   de dată din aplicație, nu doar celor din Traseu.
3. **Butoanele arată ca restul aplicației.** N-aveau niciun fundal definit, deci moșteneau griul
   implicit al browserului. Acum au colț rotunjit, contur discret și se ridică ușor la hover —
   același limbaj ca cipurile din Localizare și ca butoanele din APK.

**Fondatorul vede:** exact ce vede și clientul — e același ecran.

**Clientul vede:** butonul „Aliniază pe drumuri", care înainte era invizibil pe ecrane normale.
Practic, o funcție pe care o plătea și nu o putea folosi.

> Verificat prin măsurare, la 1366×610 și la 1306×821 (dimensiunea din captura voastră): niciun
> element nu mai iese din panou, niciun calendar nu mai iese din fereastră.

**Pe APK:** ecranul Traseu e construit altfel — are butoane de perioadă în loc de calendare și
n-are rând de export — deci defectul nu există acolo. Butoanele lui erau deja rotunjite și
conturate; web-ul era cel care ieșea din rând.

---

### AMÂNDOI · Traseu: steaguri de plecare/sosire și mașina care se plimbă — `ba1bdd5`

**Ce am schimbat:** două lucruri cerute după comparația cu AROBS.

1. **Steaguri, nu buline.** La capetele traseului erau două cerculețe de 7px. Acum sunt două steaguri
   desenate — verde la plecare, roșu la sosire. La click, popup-ul spune ora, **adresa** și cât a stat
   pe loc înainte de plecare, respectiv de la oprire încoace.

   Reperul nu mai e marginea intervalului cerut, ci **mișcarea reală**. Dacă ceri „ieri, 00:00–23:59"
   și mașina a stat în curte până la 07:12, steagul verde stă la 07:12, nu la miezul nopții. Verificat
   pe un traseu de probă: interval 00:00–14:00, steag verde la **07:12**, roșu la **08:02**.

2. **Se plimbă mașina, nu un cerc.** La redare se mișcă acum aceeași siluetă ca pe harta live, rotită
   după direcția de mers — botul arată încotro merge. Culoarea spune ce făcea în acel moment:
   verde în mișcare, portocaliu oprită cu motorul pornit, gri oprită de tot.

**Fondatorul vede:** exact ce vede și clientul.

**Clientul vede:** poate răspunde din două click-uri la „la ce oră a plecat mașina și de unde" —
întrebarea pentru care înainte trebuia să citească coordonate.

**Pe APK:** steagurile cu popup — da, sunt aceleași desene și aceleași texte. Mașina care se plimbă —
**nu**, fiindcă ecranul de acolo n-are deloc derulare (nici bară, nici buton de redare). Ar însemna o
funcție nouă, nu o ajustare; hotărât împreună să rămână pe altă dată.

> Capcană notată pentru viitor: culoarea „oprit cu motorul pornit" n-a apărut la prima încercare,
> fiindcă funcția care citește contactul cere ca poziția să fie recentă (sub ~65 min) — o regulă
> corectă pe harta live, ca să nu susțină că motorul merge pe baza unui pachet vechi. În istoric
> însă TOATE punctele sunt vechi, deci verificarea dădea mereu „oprit". Acolo contactul se citește
> direct din pachet.

---

### AMÂNDOI · Traseu: mai multe vehicule pe aceeași hartă — `90b9488`

**Ce am schimbat:** selectorul „Vehicul" a devenit **„Lista vehicule"**, cu bifă pe fiecare rând și
căutare deasupra. Bifezi o mașină → vezi doar traseul ei, exact ca înainte. Bifezi două → apar
**capete de comutare** deasupra butoanelor, câte unul per mașină, fiecare cu culoarea cu care e
desenată pe hartă.

Pe fiecare cap sunt două lucruri: o **bifă**, care arată sau ascunde mașina de pe hartă, și
**numele**, care o aduce în față. Mașina din față primește sumarul, redarea și „Limite reale";
celelalte rămân desenate, ca reper. X-ul din pastila rutei golește tot — hartă, sumare, capete,
redare.

**Fondatorul vede:** exact ce vede și clientul.

**Clientul vede:** poate compara două mașini pe aceeași zi, fără să încarce traseul de două ori și
fără să piardă sumarul niciuneia.

> **De ce culoarea liniei nu mai înseamnă viteza pentru toate:** cu două mașini pe hartă, culoarea
> trebuie să spună CARE mașină e. Mașina din față păstrează colorarea pe viteză, peste o dungă în
> culoarea ei; celelalte rămân plate, în culoarea lor. Cu o singură mașină bifată, totul arată exact
> ca înainte.

> Verificat pe două trasee reale: 2 straturi pe hartă și 4 steaguri; comuți capul → sumarul trece de
> la 16 km la 10 km și redarea sare pe datele celeilalte mașini; debifezi un cap → 1 strat, 2
> steaguri; apeși X → totul gol.

**Pe APK:** neschimbat deocamdată. Ecranul de acolo arată un vehicul o dată, deschis din fișa lui —
n-are listă de vehicule. E o funcție nouă pe telefon, nu o ajustare; de pus pe listă dacă o vreți.

---

### AMÂNDOI · Traseu: o singură bifă și un flux în doi pași — `d5fed32`

**Ce am schimbat:** ecranul avea **două selecții suprapuse pe același rând** — bifa (se vede pe hartă)
și numele (e „în față", primește sumarul). Două controale lipite, cu înțelesuri diferite. De aceea „se
comuta greu": trebuia să nimerești textul, nu bifa de lângă el, și să ții minte care ce face.

Am scos a doua selecție cu totul. A rămas **bifa**:

- **o singură mașină bifată** → traseul ei, sumarul ei, redarea și „Limite reale";
- **două sau mai multe** → doar traseele pe hartă. Fără sumar, fără redare — un sumar comun n-ar
  spune nimic, iar redarea n-ar ști pe cine să plimbe.

Click pe o linie de pe hartă o lasă singură bifată — scurtătura firească: te uiți la un traseu, îl
apeși, îl ai singur, cu sumarul lui.

**Fluxul e acum în doi pași**, în același panou din stânga:

1. **Pregătirea** — alegi vehiculele și intervalul, apeși „Încarcă traseul".
2. **Vizionarea** — pasul 1 se închide singur. Rămân doar traseele încărcate cu bifă, sumarul și
   redarea. Butonul **„Anulează traseele încărcate"** din antet șterge traseele de pe hartă și te
   duce înapoi la pasul 1. Bifele din listă rămân puse — de obicei vrei să ajustezi selecția, nu
   s-o iei de la zero.

**Fondatorul vede:** exact ce vede și clientul.

**Clientul vede:** un panou care nu mai derulează. Măsurat: conținutul era **1040px într-o fereastră
de 763px** — de aici senzația de îngrămădit. Acum intră fix.

> Verificat pas cu pas: după încărcare pasul 1 e închis și butonul de întoarcere apare; cu ambele
> bifate nu există sumar, redare sau „Limite reale"; debifezi una → apar toate trei, cu numele ei în
> titlu (10 km Logan ↔ 16 km Caddy); click pe traseu → rămâne bifat doar el; „Schimbă selecția"
> readuce lista completă.

**Completare (04.08):** cu două sau mai multe bifate nu mai e chiar gol — fiecare rând își arată
kilometrii parcurși, iar dedesubt apare totalul lor și indicația *(bifează una singură ca să vezi
detaliile ei)*. Compari două mașini dintr-o privire, fără să lungim panoul: 16 km + 10 km = 26 km.
Sumarul complet — timp în deplasare, staționare, consum — rămâne rezervat mașinii bifate singure.

**Pe APK:** neschimbat. Ecranul de acolo deschide un vehicul o dată, din fișa lui — n-are listă și
n-are pasul 1. Ar fi funcție nouă, nu ajustare.

---

### AMÂNDOI · O fereastră de alegere a vehiculelor, cu scriere manuală — `74c962f`

**Ce am schimbat:** alegerea vehiculelor se face acum într-o fereastră, aceeași în **Traseu** și în
**Localizare**: câmp de căutare sus (cu focus din prima) și bifă pe fiecare rând.

La 200 de vehicule și utilaje, derularea unei liste e o corvoadă. Aici scrii două litere, rămân trei
rânduri, bifezi. „Bifează ce se vede" lucrează pe rezultatul căutării, nu pe toată flota: scrii
„remorca", apeși o dată și le-ai bifat pe toate. Enter bifează direct când a rămas un singur
rezultat — poți alege cinci mașini fără să atingi mausul.

**În Traseu:** panoul arată doar ce ai ales, ca niște etichete mici cu ✕. Lista completă stă în
fereastră. După încărcare, traseele apar **nebifate** — bifarea rămâne decizia ta, iar indicația de
dedesubt („bifează un vehicul ca să-l vezi") nu mai contrazice ce e pe ecran. Kilometrii se văd
oricum: per mașină, pe fiecare rând, plus totalul vehiculelor încărcate.

**În Localizare — funcție nouă:** poți alege ce vehicule apar pe hartă. Selecția se **combină** cu
cadranele de stare, nu le înlocuiește: „dintre cele alese, arată-mi-le pe cele în mișcare". Cât e
activă, o bandă verde spune „N vehicule alese" și oferă „Arată tot" — altfel omul crede că i-au
dispărut mașinile.

**Fondatorul vede:** exact ce vede și clientul.

**Clientul vede:** cu o flotă mare, poate ajunge la o mașină scriind, nu derulând. Și își poate lăsa
pe hartă doar mașinile care-l interesează azi.

> Verificat: fereastra se deschide cu focusul pe căutare; scrii „logan" și din 5 rămân 2; în Traseu
> traseele vin nebifate, cu 10 km / 16 km pe rânduri și 26 km la total; bifezi una → apare pe hartă
> cu sumarul ei; „Anulează traseele încărcate" golește și bifele. În Localizare: 2 alese → lista 2 și
> markerele 2; cu „în mișcare" pe deasupra → 1; „Arată tot" → 5 și 3.

> Am folosit un mecanism care exista deja în cod, `window._mapSel`: era citit în patru locuri
> (markere, grupare, spiderfy) dar nu-l scria nimeni — un cârlig fără interfață. Acum are una.

**Pe APK:** neschimbat. Acolo alegerea vehiculului se face din lista ecranului, care are deja
căutare, iar Traseul se deschide dintr-o singură mașină. Fereastra cu bifă e o funcție nouă pe
telefon, nu o ajustare — de pus pe listă dacă o vreți și acolo.

---

## De verificat înainte de lansare

Lista pe care o parcurg cu voi înainte de a da drumul la clienți reali.

- [ ] **Notificările se revizuiesc înainte de lansare — hotărât de voi, 04.08.** Rămân deocamdată
  cum sunt; le testați pe teren și veniți cu ce nu merge. Când ajungem la revizuire, aici sunt
  lucrurile de pus pe masă: cine primește ce (vezi punctul următor), pragurile și răcirea de 5
  minute, ce ajunge pe telefon și ce rămâne doar în clopoțel, și dacă tipurile de alertă acoperă
  ce cer clienții.
- [ ] **Ce vedem noi din conturile clienților** — decizia cea mai mare. Are secțiune proprie mai
  jos: [Ce vedem din conturile clienților](#decizie-ce-vedem-din-conturile-clienților).
- [ ] **Editorul de Zone n-are selector de companie.** Zonele desenate de voi rămân fără companie.
  Funcționează (motorul le acceptă), dar nu le puteți atribui unui client anume.
- [ ] **Contul de test ca utilizator.** Deocamdată testați totul ca super-admin, care trece prin
  toate porțile. Ecranele goale și mesajele „nu ai acces" nu le vede niciunul dintre voi.

## Decizie: ce vedem din conturile clienților

**Cum va arăta după lansare (stabilit de Robert, 04.08):** fiecare client are contul lui și își
gestionează singur flota. *Transport SRL* → utilizatorul Alin încarcă 5 mașini → cele 5 stau în
contul Transport SRL, iar el face ce vrea acolo. Compania e granița.

**Ce ne rămâne de hotărât:** din tot ce se întâmplă în acel cont, ce vedem noi ca fondatori și ce
nu. Acum vedem **tot**, peste tot, fiindcă în cod super-adminul e tratat uniform ca „fără companie
= toate companiile" (`req.isSuper ? null : req.companyId`, peste zeci de rute). Nu e o scăpare
punctuală, e regula generală — deci schimbarea ei e o decizie, nu o reparație.

Inventarul de mai jos e ca să bifați pe îndelete *vrem / nu vrem*. Nu e exhaustiv, dar acoperă tot
ce e vizibil în interfață azi.

| Ce vedem acum | Bifați |
|---|---|
| **Vehiculele și pozițiile live** ale tuturor companiilor, pe hartă | vrem / nu vrem |
| **Traseele istorice** ale oricărui vehicul, cu opriri și viteze | vrem / nu vrem |
| **Rapoartele** — fără vehicul ales, un raport cuprinde flotele TUTUROR companiilor într-un singur document | vrem / nu vrem |
| **Notificările** — fiecare alertă a fiecărui vehicul ajunge și la noi (db.js:2637) | vrem / nu vrem |
| **Setările clientului** — alertele, zonele, grupele, șoferii, mentenanța, documentele lui | vrem / nu vrem |
| **Utilizatorii lui** — ce conturi are, ce roluri, cine la ce vehicule are acces | vrem / nu vrem |
| **Jurnalul de audit** — cine ce a făcut în contul lui, cu IP și oră | vrem / nu vrem |
| **Facturarea** — plăți, abonament, consum | vrem / nu vrem |
| **Chei API, fișiere tahograf, constatările agenților AI** | vrem / nu vrem |
| **DevConsole (`/debug`)** — poziții brute, în timp real, per IMEI | vrem / nu vrem |

Trei lucruri de avut în minte când decideți:

1. **„Nu vrem" nu înseamnă mereu „ascundem".** Pentru suport, uneori chiar trebuie să vedeți —
   diferența e între *acces permanent* și *acces la cerere, lăsând urmă în audit*.
2. **Notificările sunt cazul urgent.** Cu push-ul pornit implicit, la 30 de companii telefoanele vă
   sună continuu și îl veți opri cu totul — pierzând și ce contează pentru voi.
3. **Ce le spuneți clienților** despre asta ține de politica de confidențialitate, nu doar de cod.

---

*Jurnalul începe azi, 2026-08-04. Ce e mai vechi nu e catalogat aici — dacă vreți, îl completez
retroactiv din istoricul git.*
