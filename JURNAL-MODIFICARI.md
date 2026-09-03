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

## 2026-08-26

### FONDATOR · „Contul tău nu e legat de o firmă" — de ce, și de ce nu mai afli abia la final

Alin a completat fereastra de rol nou și, la „Creează rolul", a primit *„Contul tău nu e legat de o
firmă"*. Nu e o defecțiune, e o consecință — dar ecranul o spunea în cel mai prost moment cu putință.

**De ce.** Un rol trăiește **într-o firmă**: „Operator depou" e rolul firmei Transport Zebra, nu al
platformei. Când firma îl botează sau taie din el, schimbarea se aplică numai la ea. Conturile
noastre de fondator sunt **conturi de platformă**: nu aparțin niciunei firme, ci le văd pe toate.
Deci un rol făcut din contul nostru n-ar avea la ce firmă să se lipească — de asta serverul refuză.

**Ce era prost.** Serverul refuza corect, dar abia **după** ce completai numele și alegeai șablonul.
Ecranul te lăsa să crezi că merge, și îți spunea „nu" la ultimul clic.

**Ce e acum.** În conturile de platformă, ecranul Roluri nu mai arată editorul deloc. În locul lui,
o explicație: rolurile sunt ale unei firme, contul tău e de platformă, iar ecranul ăsta e al
administratorului firmei — acolo își botează rolurile și taie din ele. Fără buton de apăsat degeaba.

**Alin a încercat și cu comutatorul pe „Admin de firmă"** — și a primit același refuz. Normal: acela
schimbă ce se AFIȘEAZĂ, nu cine ești pentru server. Rolurile se scriu într-o firmă adevărată, nu
într-una „jucată". Explicația de pe ecran spune acum și asta, ca să nu te trimită a doua oară în
același zid.

**Decis de Alin, 03.09: rămâne așa.** I-am pus pe masă trei variante — (1) să putem lucra pe rolurile
unei firme din contul nostru, cu selector de firmă, ca să i le pregătim la semnarea contractului;
(2) doar să le vedem, fără să le putem schimba; (3) să lăsăm cum e. A ales **(3)**: rolurile se fac
numai din contul firmei, iar la noi rămâne explicația. Motivul e sănătos — dacă noi putem scrie în
rolurile unui client, o greșeală de-a noastră taie drepturi oamenilor lui, într-un ecran pe care el
nici nu se uită în ziua aia.

- **Ce am schimbat:** în conturile de platformă, Roluri arată o explicație în loc de un formular care
  nu poate reuși.
- **Ce vede fondatorul:** motivul, de la început, nu la ultimul clic.
- **Ce vede clientul:** nimic — el are firmă, deci vede editorul ca până acum.


### AMÂNDOI · „Rol nou" nu mai deschide ferestrele gri ale browserului

Alin a apăsat „Rol nou" și i-a sărit în față o fereastră cu scris mic, cu „ratrack.ro says"
deasupra: *„nu e OK, trebuie să am ceva specific cu ce este în Roluri"*. Avea dreptate, și era
mai rău decât se vede în poză: erau **două** astfel de ferestre, una după alta. În a doua, aplicația
îi cerea omului să **scrie de mână** cuvântul „manager", „dispatcher" sau „viewer" — trei cuvinte
englezești pe care nu le văzuse nicăieri pe ecran. Dacă scria greșit, rolul nu se făcea.

**Ce e acum.** O fereastră a aplicației, cu aceleași forme și culori ca restul secțiunii Roluri:

- un câmp pentru nume, cu exemplu în el („ex. Operator depou");
- **cele trei șabloane, ca butoane**, fiecare cu o linie care spune ce poate: *Manager — vede toată
  flota și o modifică; Dispecer — vede mașinile care i se dau, confirmă alerte, scoate rapoarte;
  Viewer — doar se uită.* Nu mai are nimic de ghicit și nimic de scris;
- dedesubt, regula, scrisă acolo unde contează: rolul nou pornește cu drepturile șablonului și
  **poți doar să tai** din ele — n-are cum să ajungă mai puternic decât el;
- dacă serverul refuză (nume care există deja, de pildă), motivul apare **în fereastră**, nu într-o
  altă casetă gri; iar cât se creează rolul, butonul nu se mai poate apăsa a doua oară.

Se închide cu Escape sau cu un clic în afară, se trimite cu Enter.

**Încă una, din aceeași familie.** La resetarea parolei unui om, fereastra browserului scria „min 4
caractere" — o **minciună**: serverul cere de mult 8 și încă niște reguli. Adică omul scria o parolă
scurtă și primea un refuz pe care nu-l înțelegea. Acum e tot fereastra aplicației, scrie cerința
corectă, iar dacă serverul are ceva de obiectat, arată exact ce.

- **Ce am schimbat:** „Rol nou" și resetarea parolei nu mai folosesc ferestrele browserului.
- **Ce vede fondatorul:** o fereastră în stilul aplicației, în care alege dintr-o listă.
- **Ce vede clientul:** același lucru — plus că nu i se mai cere să scrie cuvinte pe care nu le știe.


### AMÂNDOI · Utilizatori și Roluri: aceleași câmpuri și aceleași comutatoare ca la Preferințe

Alin, după ce a văzut Preferințele: *„modernizează și aici inputurile, în Utilizatori"*, apoi
*„la fel și secțiunea Roluri, ca și Afișaj"*. Adică: să nu ai trei ecrane care arată a trei
aplicații diferite.

**Utilizatori.** Câmpurile din „Adaugă utilizator" (email, parolă, nume, telefon, firma, rolul) și
cele din fereastra de editare a unui om au acum același aspect ca în Preferințe: colț rotunjit,
chenar mai apăsat și **inelul verde la câmpul în care scrii**. Butonul verde a fost potrivit cu ele.
Bifele au rămas bife — nu le-am umflat degeaba.

**Roluri.** Fiecare drept era o bifă mică lipită de un text. Acum e un **rând cu comutator**, exact
ca în „Afișaj": ce poate face rolul în stânga, comutatorul în dreapta. Ce a tăiat firma se vede
**șters**, deci dintr-o privire știi ce a scos. Comutatoarele sunt puțin mai mici decât în
Preferințe, fiindcă aici sunt zeci pe ecran (rapoartele singure sunt 33).

**Câmpul care „suna aiurea".** Sus, în Roluri, scria „Cum îi spuneți la voi" — o întrebare aruncată
pe ecran, fără să spună la ce folosește. Alin, pe bună dreptate: *„nu-i văd rostul"*. E câmpul prin
care firma **își botează rolurile**: „Dispecer" devine „Operator depou", dacă așa le zic ei în firmă.
Acum scrie **„Numele rolului, la voi în firmă"**, iar dedesubt explicația, cu exemplu: numele apare
peste tot în aplicație, dar **numai la firma aceea**, iar **drepturile nu se schimbă odată cu el**.
Lași gol → rămâne numele standard.

- **Ce am schimbat:** aspectul câmpurilor din Utilizatori, comutatoarele din Roluri și eticheta care
  nu spunea nimic.
- **Ce vede fondatorul:** aceleași trei ecrane, în același limbaj vizual.
- **Ce vede clientul:** la fel — plus că înțelege, în sfârșit, la ce e bun câmpul cu numele rolului.


### FONDATOR · Comutatorul de privire ajunge și la „Utilizatori"

Până acum, comutatorul schimba doar **meniul** Setărilor. Alin: *„la toggle admin de firmă lasă doar
[firma] de test, el nu trebuie să le vadă pe toate — adică pregătim exact ca infrastructura"*.
Corect: un patron de firmă nu vede niciodată oamenii altor firme, și cu atât mai puțin conturile
noastre de platformă. Dacă privirea nu face și asta, ea arată doar jumătate de adevăr.

**Ce e acum.** Pe **Fondator**, ecranul Utilizatori rămâne exact cum era: toate companiile, plus
conturile de platformă, cu selectorul care le comută.

Pe **Admin de firmă**, ecranul devine al unei singure firme:

- **o bară violet sus** — „Te uiți ca admin al firmei …" — de unde alegi în ce firmă stai. Alegerea
  se ține minte, ca și privirea; lângă fiecare firmă scrie câți oameni are;
- lista arată **doar oamenii firmei alese**, fără capetele de companie și fără selectorul „toate
  companiile" — exact forma pe care o vede un client;
- **conturile noastre de platformă dispar** cu totul;
- formularul de cont nou devine al unui admin de firmă: **fără rolul de super-admin** și fără
  alegerea companiei — omul intră direct în firma în care stai.

**Ce NU s-a schimbat, și rămâne regula comutatorului.** Serverul trimite mai departe tot ce are
dreptul să trimită; noi filtrăm doar **ce se afișează**. Privirea nu ia și nu dă niciun drept, iar
serverul tot nu știe că ea există. Practic: cât ești în privirea clientului, ecranul se poartă ca al
lui — dar dacă apeși un buton, apeși cu mâna ta de fondator.

- **Ce am schimbat:** privirea de client se aplică acum și la ecranul Utilizatori, pe o singură firmă,
  aleasă de tine.
- **Ce vede fondatorul:** pe „Fondator", nimic nou. Pe „Admin de firmă", ecranul unei singure firme,
  cu bara violet de sus.
- **Ce vede clientul:** nimic — pentru el nu s-a schimbat un pixel.

*(Se scoate la lansare, împreună cu tot comutatorul — punctul e pe lista de blocante, cu lista
bucăților de șters actualizată.)*


### AMÂNDOI · „Oameni și drepturi" s-a făcut „Conturi și roluri"

Alin, uitându-se la meniul Setărilor: *„sună aiurea"*. Are dreptate — „drepturi" e cuvântul nostru,
din cod, nu al omului care intră acolo. Iar „oameni" e vag: în aplicație oamenii sunt și șoferii,
care n-au nicio treabă cu secțiunea asta.

Titlul nou spune exact ce e înăuntru: **conturile** oamenilor din firmă (cine intră în aplicație) și
**rolurile** (ce are voie fiecare). Sub el stau, ca înainte, **Utilizatori** și **Roluri**.

- **Ce am schimbat:** numele grupei din meniul Setărilor. Atât — nu s-a atins niciun drept și niciun
  ecran.
- **Ce vede fondatorul:** „Conturi și roluri" în loc de „Oameni și drepturi".
- **Ce vede clientul:** același lucru; un titlu pe care îl înțelege din prima.


### AMÂNDOI · „Preferințele tale", refăcute din temelii — plus parola, care lipsea cu totul

Alin, uitându-se la ecran: *„preferințele astea nu sunt cam vagi? adică așa puține preferințe??"*.
Avea dreptate de două ori, din două motive diferite.

**1. Erau scrise în limba noastră, nu a lui.** Pe ecran scria „Afișează depășiri viteză pe traseu
(heatmap)", „Afișează adresa (reverse-geocode)", „Punctul verde animat pe traseu la redarea
istoricului", iar sub fiecare, „default aplicație". Nu erau vagi — erau scrise pentru programatori.
Omul nu avea de unde ști ce pierde dacă debifează. Acum scrie *„Colorează traseul după viteză"*,
*„Arată adresa, nu coordonatele"*, *„Arată mașina care se plimbă pe traseu"*, iar „default
aplicație" a devenit **„așa e din fabrică"**, „default companie" → **„hotărâtă de firmă"**.

**2. Două din cele șase nici nu erau preferințe de om.** „Fila Camion" și „Filele pentru sonde"
înseamnă *„firma asta n-are camioane / n-are sonde"* — o hotărâre a firmei, nu un gust personal.
Au fost mutate la **Setări → Ce văd toți**, unde le e locul. În contul omului nu mai apar.

**3. Lipseau exact lucrurile pe care omul chiar vrea să le schimbe.** Existau în aplicație, dar
stăteau **numai în browser**: le puneai pe laptop și pe telefon erau tot cum fuseseră. Acum stau pe
**cont** și te urmează oriunde te loghezi:

- **Tema** (închisă / deschisă / *ca pe dispozitiv* — adică urmează telefonul sau calculatorul).
- **Harta cu care pornești**: potrivită cu tema, Străzi, Deschisă, Închisă, Satelit, Satelit cu
  denumiri, Relief.
- **Cum arată mașinile pe hartă** (iconițe sau săgeți) și dacă **mașinile apropiate se unesc** într-un
  singur semn cu numărul lor.
- **Lista de mașini din stânga**: deschisă sau strânsă.
- **Ecranul cu care se deschide aplicația**: Localizare, Traseu, Statistici sau Rapoarte. Dacă rolul
  omului nu ajunge la ecranul ales, se deschide tot pe Localizare — o preferință nu poate deschide o
  ușă la care nu are voie.
- **Sunetul la alertă** și **cât stă alerta pe ecran** (5 / 15 / 30 de secunde sau *până o închid
  eu*). Până acum suna **mereu** și dispărea după 15 secunde, fără să se poată schimba de nicăieri.
  Un dispecer care stă opt ore în aplicație ne-ar fi întrebat asta în prima zi.

Butoanele vechi rămân unde erau: schimbi tema din butonul cu lună/soare de sus, harta din butonul ei
de pe hartă — doar că acum alegerea urcă și pe cont, nu se mai pierde.

**4. Parola. Aici nu era o preferință lipsă, era o gaură.** Un om **nu-și putea schimba parola din
aplicație, deloc**. Doar administratorul firmei i-o putea pune. Un dispecer trebuia să-și roage
patronul — sau să treacă prin „am uitat parola", care merge pe email, adică deocamdată nu merge.
Acum, în **Preferințe → Contul meu**, își schimbă singur parola, dar **numai scriind-o pe cea de
acum**. Paza aia nu e formalitate: fără ea, o sesiune uitată deschisă pe un calculator străin ar
însemna pierderea contului. După câteva încercări greșite, se oprește pentru un sfert de oră.
Tot acolo își schimbă **numele afișat și telefonul**; adresa de email nu, fiindcă ea e totodată
numele de utilizator — aia rămâne la administratorul firmei.

**Ce s-a mai reparat pe drum**, găsit de probe: telefonul nu se putea **șterge** (câmpul golit
însemna „lasă-l cum era" — aceeași capcană pe care o avusesem la fișa vehiculului), iar numele
omului ajungea pe ecran neprotejat: un nume cu ghilimele scris de un administrator ar fi putut rupe
pagina altcuiva.

**Retușurile cerute de Alin după ce a văzut ecranul.** Numele capitolelor erau propoziții, nu
titluri: „Cum arată aplicația pentru mine" a devenit **Afișaj**, iar „Ce se vede pe hartă și în
fișe" → **Vizualizare**. Butonul **„Trimite o notificare de probă" a fost scos** din ecranul
clientului: era o unealtă de verificare, nu o preferință, și n-avea ce căuta acolo. *(Dacă avem
vreodată nevoie să probăm notificările pe telefon, îi facem loc în panoul nostru — ruta de pe
server a rămas.)* Iar câmpurile de scris din Preferințe — nume, telefon, email, cele trei de
parolă — au primit un aspect nou: colț rotunjit, chenar mai apăsat și un **inel verde la câmpul în
care scrii**, ca să se vadă din colțul ochiului unde ești. Restul aplicației nu s-a atins.

- **Ce am schimbat:** Preferințele au acum trei capitole — Contul meu, Afișaj, Alerte — plus
  schimbarea parolei; alegerile se țin minte pe cont, nu pe calculator.
- **Ce vede fondatorul:** exact același ecran ca și clientul. Aici nu e nimic „doar al nostru", deci
  comutatorul de privire nu schimbă nimic. În plus, la **Ce văd toți** au apărut cele două file
  mutate de la om la firmă.
- **Ce vede clientul:** un ecran scris pe românește, în care își poate schimba singur parola și își
  potrivește aplicația cum îi place — o dată, pentru toate dispozitivele.


### FONDATOR · Un comutator în Setări: „te uiți ca fondator" / „ca admin de firmă"

Alin: *„noi testăm acum, ne încurcăm — ar trebui să avem un toggle"*. Are dreptate, și motivul e
concret: în contul nostru, Setările au **unsprezece capitole**, din care trei sunt **regulile
FIRMEI** — „Ce văd toți", „Program de lucru", „Prețuri combustibil". Noi nu avem flotă; ele n-au ce
face acolo, dar apar, fiindcă tehnic avem drepturi peste tot. Iar când te uiți la ecranul ăsta toată
ziua, nu mai știi dacă ce vezi e al tău sau al clientului.

**Ce e acum.** Sus, deasupra capitolelor, un comutator cu două butoane: **Fondator** și **Admin de
firmă**. Apare **numai în conturile noastre** — clientul nu-l vede și nu are cum să-l pornească.

- Pe **Fondator**: ce vedeți acum, plus „Catalog coduri GPS" (capitolul platformei).
- Pe **Admin de firmă**: exact ce vede patronul unei firme — apare „Facturile mele", dispare
  catalogul de coduri. Și o **bandă violet** sus, cât timp e pornit, ca să nu uitați unde sunteți și
  să nu-mi raportați ca lipsă un capitol pe care l-ați ascuns singuri.

Alegerea **rămâne pusă** și după reîncărcarea paginii, până o schimbați voi.

**Ce NU face, și e important.** Comutatorul schimbă **doar ce se afișează pe ecranul vostru**.
Drepturile de pe server rămân neatinse: nu vă ia nimic și, mai ales, **nu poate da nimănui nimic**.
Serverul nici nu știe că există — verificat automat: dacă cineva ar încerca vreodată să lege
comutatorul de drepturi, proba pică înainte de livrare. Deci e o **fereastră de probă**, nu un
buton de „intru în pielea clientului cu tot cu puteri".

De reținut: e o privire peste **Setări**, nu peste toată aplicația. Dacă se dovedește util, se poate
extinde și la restul meniului — dar acolo e altă discuție, fiindcă ecranele aduc date, nu doar liste.

- **Ce am schimbat:** un comutator de privire în Setări, doar pentru conturile noastre; schimbă
  afișarea, nu drepturile.
- **Ce vede fondatorul:** două butoane sus, în stânga, și o bandă violet cât timp se uită cu ochii
  clientului.
- **Ce vede clientul:** nimic. Nici comutatorul, nici banda — pentru el nu s-a schimbat un pixel.

**E temporar, și așa rămâne scris.** Alin a cerut, în aceeași zi, ca la lansarea aplicației
comutatorul să fie **scos** din Setări: e o unealtă pentru perioada în care construim, nu o funcție
pe care o vindem. Punctul e trecut la [„De verificat înainte de lansare"](#a-blocante--fără-astea-nu-dăm-drumul),
la blocante, cu lista exactă a bucăților de șters.


### AMÂNDOI · Secțiunea CAN, redesenată + martorii apar sub hartă pe telefon — `33fde7b`

**Ce era.** Plăcuțele de stare erau strânse pe categorii — „Contact și motor", „Lumini", „Uși și
capace", „Camion" — fiecare într-o secțiune care se deschidea cu clicul. Avea sens cât se arătau
toate cele ~120. De când se văd doar cele active, rămâneau cinci titluri cu câte o plăcuță sub
fiecare. Multă mobilă pentru puțin conținut.

**Ce e acum.** Se așază după *cât de mult cer atenție* — adică exact ordinea în care se uită omul la
bordul mașinii:

1. **Starea mașinii**, cu plăcuțe mai mari: frâna de mână, treapta, încuietoarea, contactul, motorul.
2. **Martori aprinși** — becurile roșii. Ce e stricat sau pe cale să se strice.
3. **Deschis acum** — uși, capotă, portbagaj, geamuri, portocaliu.
4. **Pornite acum** — restul: lumini, aer condiționat, centuri.

Fără secțiuni de deschis cu clicul: ce e activ se vede din prima. O bandă goală nu se desenează
deloc. Dacă nu e nimic, scrie „Totul închis, niciun martor aprins" — nu rămâne un ecran gol.

**Pe telefon a apărut ceva nou: banda de martori, sub hartă.** Un rând de pictograme, atât. Doar ce
cere atenție (martori roșii, ce e deschis) plus cele trei stări permanente. Luminile aprinse și
aerul condiționat NU urcă acolo — nu e nimic de făcut cu ele. Atingi o pictogramă și îți spune ce e.

Rostul benzii e altul decât al ecranului „Date CAN": acolo te duci când vrei să te uiți la mașină,
aici vezi fără să ceri. **Ecranul detaliat a rămas neatins ca rol** — doar redesenat la fel ca web-ul.

**Regula de așezare e scrisă o singură dată.** Pagina web primește chiar funcțiile de pe server, nu
o copie a lor. Telefonul primește de acolo ordinea benzii de stare. Am pus și o verificare care cade
dacă cele două ecrane încep să se despartă.

**Două lucruri mărunte văzute abia pe ecran, la mărimea reală:** titlul „Starea mașinii" apărea de
două ori (o dată ca titlu de panou, o dată ca titlu de bandă), iar o magistrală CAN care nu
raportează nimic scria „cod false". Amândouă reparate.

- **Ce vede fondatorul:** aceleași date, altă așezare; 12 verificări noi.
- **Ce vede clientul:** deschide mașina pe telefon și vede din prima dacă e ceva în neregulă, fără
  să mai intre nicăieri.

Verificat pe ecran, în două situații: mașină parcată cu probleme (martor aprins, ușă și capotă
deschise) și mașină în mers cu totul în regulă.

---

### AMÂNDOI · Raport nou: „CAN detaliat" — istoricul semnalelor pe care le alegi tu — `0a340f6`

Până acum, din datele CAN se putea scoate doar un **instantaneu**: cât are acum în rezervor, ce
kilometraj arată bordul. Dacă voiai să vezi *cum a evoluat* temperatura motorului marți, sau când a
început să crească turația, nu aveai de unde.

**Raportul nou face exact asta.** Alegi mașinile, alegi perioada și **bifezi ce te interesează** —
turație, temperatură, nivel carburant, kilometraj, consum instantaneu, tensiune, sarcină pe axe,
sonde de combustibil. Primești istoricul lor, în tabel și în grafice, cu minim / mediu / maxim pe
toată perioada.

**Bifezi doar ce trimite mașina ta.** Lista nu e teoretică: aplicația se uită la ce a trimis efectiv
vehiculul ales și îți arată doar acele semnale. Altfel ai fi bifat turația pe o mașină fără adaptor
CAN și ai fi primit un tabel gol, fără să înțelegi de ce.

**Un rând nu e o poziție, e un interval** — și scrie asta pe raport. Un aparat trimite la câteva
secunde; o lună ar însemna sute de mii de rânduri, adică un fișier care nu se deschide. Așa că
valorile se grupează: ceri o zi → un rând la 5 minute; ceri o lună → un rând pe zi. Se alege singur,
și scrie în capul raportului ce interval s-a folosit.

**Celulă goală ≠ zero.** Gol înseamnă că mașina n-a trimis semnalul în intervalul ăla. Zero e o
valoare. Sunt lucruri diferite și se văd diferit.

**Merge și programat.** Poți primi raportul săptămânal pe email, cu bifele tale. Aici am reparat și
ceva mai vechi: **programările nu trimiteau niciodată opțiunile alese** — serverul le aștepta, dar
niciun ecran nu le completa.

Excel și PDF vin cu numele brandat și logo-ul, ca la toate rapoartele — n-a trebuit nimic în plus.

**Pe drum am mai reparat ceva care se vedea peste tot:** numele semnalelor de bază lipseau din lista
noastră de traduceri, așa că se generau automat din cheie și ieșeau „Can Engine Rpm", „Speed Io",
„Total Odometer" — engleză cu majuscule, într-o aplicație românească. Acum sunt scrise pe românește
(„Turație motor", „Viteza (din mașină)", „Kilometraj GPS") și apar așa **peste tot**: în fișa
vehiculului, în raport, în explicațiile IO.

- **Ce vede fondatorul:** raportul e în catalog, la categoria „Date CAN"; 33 de verificări noi.
- **Ce vede clientul:** un raport în care își alege singur ce urmărește, fără să ne ceară nouă.

Verificat cap-coadă pe server adevărat: pachete → istoric → raport, inclusiv că o cheie inventată
nu poate ajunge în interogarea pe baza de date și că bifele chiar se păstrează într-o programare.

---

### AMÂNDOI · Dacia Logan: „scădere de la 43 la 32 L" la fiecare pornire — reparat — `6ba6e9a`

Am reprodus-o. Un ciclu banal — mașina merge, se oprește, pornește — scotea exact mesajul primit:
**„Scădere 11.0 L (43 → 32 L)"**, fără să dispară un strop.

**De ce.** Aplicația avea, de fapt, *trei* locuri care hotărau că a scăzut carburantul, nu unul.
În august am întărit unul singur — cel care așteaptă să se așeze sonda, cere mai multe citiri și
anulează alarma dacă nivelul revine. Celelalte două făceau mai departe cea mai simplă socoteală
posibilă: „cât era în pachetul anterior minus cât e acum". Iar „pachetul anterior", la o mașină
parcată, e chiar nivelul de dinainte de parcare, ținut de noi ca să se vadă rezervorul cât stă
mașina. Deci comparam prezentul cu trecutul și numeam diferența furt.

**Acum decide un singur loc**, cel serios, iar celelalte două îi folosesc verdictul. Fiecare își
păstrează pragul lui.

**Al doilea lucru: da, era ceva blocat în baza de date** — ați intuit corect. Momentul ultimei valori
salvate se scria ca text, dar la repornirea serverului era citit ca număr. „Acum minus text" nu dă
un număr, ci nimic — iar din nimic nu iese niciodată „au trecut 5 minute". Efectul: **după ORICE
repornire, valoarea păstrată pentru un vehicul nu se mai actualiza niciodată.** Rămânea înghețată
acolo, la nesfârșit. Reparat.

Tot de acolo venea și o a doua ciudățenie: turația, care ar fi trebuit să expire după 15 minute, se
căra la nesfârșit după o repornire.

**Al treilea: o regulă care n-a funcționat niciodată.** Regula de alertă „scădere combustibil" pe
care o poate face un client compara o valoare cu ea însăși — deci ieșea mereu zero. Nu s-a declanșat
niciodată, de când există. Acum merge.

**Un buton nou, doar pentru noi** (consola tehnică `/debug` → IO Inspector): *Golește sticky*. Șterge
valorile păstrate pentru un vehicul, și din memorie, și din baza de date. Până acum nu exista nicio
cale de a scoate o valoare citită greșit, decât intrând direct în baza de date.

- **Ce vede fondatorul:** butonul de golire + un test nou care rulează la fiecare livrare.
- **Ce vede clientul:** nu mai primește anunțuri de furt care nu s-au întâmplat. Cele reale vin la
  fel, cu aceleași cuvinte.

**Ce merită verificat împreună:** ca să sune la 11 litri, cineva a coborât un prag sub 15. Implicit,
nici alerta de companie („furt combustibil"), nici cea personală („scădere bruscă") nu s-ar fi
declanșat la atât. Merită să ne uităm ce prag e pus și dacă e cel dorit.

Probat cap-coadă cu server adevărat, în patru situații: pornire normală cu citire nesigură → tăcere;
furt adevărat → exact o notificare, cu „de la … la …"; două feluri de a măsura → tăcere; prima
citire 0 → tăcere. 10 din 10.

---
### FONDATOR · La crearea unei companii, adminul nu se făcea dacă nu-i scriai și parola

Alin a întrebat, ca să fie sigur: *„noi, când încheiem un contract, îi atribuim firmei un cont de
admin, iar de acolo el își gestionează singur conturile și rolurile — da?"*. Da, exact așa e gândit.
Verificând drumul de la cap la coadă, a ieșit însă o capcană în ecranul NOSTRU.

**Ce se întâmpla.** În Administrare → Companii, formularul de companie nouă are trei câmpuri: numele
firmei, adresa administratorului și o parolă. Codul crea administratorul **doar dacă erau completate
amândouă** — adresa ȘI parola. Dacă scriai doar adresa (adică voiai să-i trimiți invitația), compania
se crea, mesajul zicea „Companie creată ✓", iar **contul de administrator nu se făcea deloc**. În
tăcere. Aflai peste două zile, când te suna omul că nu poate intra.

**Ce e acum.** Adresa e de ajuns: fără parolă pleacă **invitația**, iar omul își pune singur parola.
Cu parolă scrisă de tine, merge ca înainte. Mesajul de la final spune exact ce s-a întâmplat:
*„Companie creată ✓ — invitația a plecat la patron@transport.ro"*, sau *„— admin creat cu parola
scrisă de tine"*, sau *„— fără administrator încă"*, dacă n-ai completat adresa.

**Lanțul întreg e acum verificat automat**, ca să nu se rupă pe viitor: noi creăm compania → dăm
contul de administrator → el intră → își adaugă singur dispecerul → **nu** poate face alt admin peste
el și cu atât mai puțin un cont de platformă (rolul cerut cade pe cel mai mic, nu pe cel cerut) → își
face rolurile lui.

- **Ce am schimbat:** contul de administrator se creează și doar cu adresa de email, prin invitație.
- **Ce vede fondatorul:** un formular care nu mai tace când nu face ce credeai; mesaj clar la final.
- **Ce vede clientul:** primește invitația și intră singur, fără să-i dictăm o parolă la telefon.


### AMÂNDOI · Oamenii se adaugă prin adresa de email, cu invitație — nu cu parolă spusă la telefon

Alin a descris exact fluxul pe care îl vrea: *„eu, adminul firmei, vreau să introduc mai mulți oameni
prin adrese de email și să le dau roluri"*. Verificând, ieșea o lipsă: formularul cerea **parolă
obligatorie**. Adică adminul inventa o parolă și i-o trimitea colegului pe WhatsApp — parola circula
în afara aplicației, iar adminul ajungea să știe parola tuturor.

Invitația exista deja în aplicație, dar **doar pentru noi**: când deschidem un cont de administrator
la semnarea contractului. Acum o are și adminul firmei.

**Cum e acum.** Scrii adresa, numele și rolul. **Parola o lași goală** → omul primește un email cu un
link, își pune singur parola și intră. Dacă preferi să-i dai tu o parolă, scrii una și merge ca până
acum — n-am scos nimic.

**Trei lucruri spuse cinstit pe ecran:**
- dacă emailul a plecat, scrie *„i-am trimis invitația pe adresa X"*;
- dacă **nu** a plecat (server fără email configurat), scrie asta direct, cu ce are de făcut omul —
  nu-l lăsăm să aștepte un mesaj care n-a plecat niciodată;
- în contul demo, invitațiile nu pleacă deloc (regula din CLAUDE.md: demo-ul nu trimite emailuri).

Parola din bază, la invitație, e una **aleatoare pe care n-o știe nimeni** — contul se deschide
exclusiv prin linkul din email. Altfel un cont „fără parolă" ar fi fost un cont cu parolă goală.

- **Ce am schimbat:** parola e opțională la adăugarea unui utilizator; fără ea pleacă invitația.
- **Ce vede fondatorul:** același formular; calea noastră de invitație rămâne neatinsă.
- **Ce vede clientul:** își adaugă echipa scriind doar adrese de email, fără să inventeze parole.


### AMÂNDOI · Roluri, până la capăt: ecrane, editare, raport cu raport — și „Rol nou"

Alin a văzut la Arobs un editor de roluri cu trei file (Funcționalități / Management date / Rapoarte)
și un buton „ROL NOU". A cerut toate patru bucățile, „și să fie înțeles ușor de useri".

**Cum arată acum.** Rolurile în stânga, ce poate rolul în dreapta, pe patru file scrise pe românește:

| Fila | Ce conține |
|---|---|
| **Ce poate face** | cele patru drepturi mari (utilizatori, flotă, rapoarte, toată flota) |
| **Ce ecrane vede** | 16 ecrane: Localizare, Traseu, Analize, Rapoarte, Hotspot, Vehicule, Șoferi, Grupe, Alerte, Mentenanță, Documente, Tahograf, e-Transport, Taxa de drum, RA Insight |
| **Ce poate edita** | 8 feluri de date: vehicule, șoferi, grupe, hotspot-uri, alerte, mentenanță, documente, setări |
| **Ce rapoarte scoate** | **toate cele 33**, grupate pe categorii, luate din catalogul real — nu dintr-o listă scrisă de mână |

Plus „bifează tot / debifează tot" pe fiecare filă și un contor („22 din 33"), ca să nu numeri bife.

**„Rol nou" — cum funcționează, și de ce e sigur.** Un rol propriu nu se face „de la zero": pornește
dintr-un **șablon** standard (Manager, Dispecer sau Viewer), îi dai numele tău („Operator depou",
„Contabilitate"), și de acolo poți **doar tăia**. Așa, un rol inventat de client nu poate depăși
niciodată ce poate șablonul. Rolul propriu apare imediat în lista de la Utilizatori și se poate
atribui; nu se poate șterge cât timp îl folosește cineva.

**Fiecare bifă păzește ceva REAL.** Asta a fost partea de muncă, nu ecranul:

- **rapoartele** — verificate pe singura rută prin care se generează, plus la programarea pe email
  (altfel se scotea pe ocolite un raport tăiat);
- **ecranele** — o poartă unică, pusă înaintea tuturor rutelor: ecranul tăiat răspunde „acces
  interzis", nu doar dispare din meniu. Iar din meniu dispare și el, ca omul să nu apese pe butoane
  care îl refuză;
- **editarea** — 33 de rute de scriere legate pe cele 8 feluri de date. Cu editarea tăiată, omul
  vede în continuare lista, dar nu mai poate adăuga sau modifica.

**Regula rămâne aceeași ca la început: doar scădere.** În bază se ține doar ce s-a tăiat; serverul
aruncă orice cheie inventată; un rol care nu modifică flota nici nu primește bife de editare. Probele
au fost sabotate pe toate cele trei porți noi — au picat toate trei.

- **Ce am schimbat:** ecranul de Roluri a devenit un editor complet, cu roluri proprii.
- **Ce vede fondatorul:** nimic schimbat la noi — rolurile de platformă rămân în afara jocului.
- **Ce vede clientul:** poate croi rolul exact pe omul lui, cu vocabularul firmei.


### AMÂNDOI · „Client" iese din listă, rămâne „Viewer"

Alin a decis, după ce a văzut tabelul: cele două roluri aveau **exact aceleași drepturi**, iar două
nume pentru același lucru îl pun pe om să ghicească. Rămâne **Viewer**, cu explicația scrisă lângă el
(„doar se uită, la mașinile atribuite").

**Rolul nu se șterge din cod.** Conturile care îl au deja merg mai departe fără nicio schimbare —
drepturile lor sunt oricum identice cu ale unui viewer. Doar nu se mai poate **atribui** de aici
înainte.

Tot atunci s-a confirmat și cealaltă întrebare: **rolul de Admin rămâne dat de noi**, la semnarea
contractului. Un administrator de firmă nu-și poate face alți administratori — și asta rămâne așa
intenționat.

- **Ce am schimbat:** „Client" nu mai apare la alegerea rolului; Viewer are acum o explicație.
- **Ce vede fondatorul:** o listă de roluri fără dubluri.
- **Ce vede clientul:** trei roluri de ales, fiecare cu rost diferit.

### FONDATOR · Trei drepturi care nu păzeau nimic, scoase de pe ecranul de Roluri

Alin a cerut lista completă „cine ce poate face". Verificând-o **rută cu rută**, a ieșit ceva ce nu
se vedea din afară: din cele opt drepturi din tabela de roluri, **trei nu păzesc nimic**:

- **„Trimite comenzi către mașini"** — funcția nu există încă în aplicație, deci n-are ce păzi;
- **„Confirmă alertele"** — confirmarea notificărilor e deschisă oricui e logat;
- **„Vede jurnalul de audit"** — jurnalul global e păzit de „super-admin", nu de dreptul ăsta.

Le-am **scos de pe ecranul de Roluri**. Motivul e chiar regula pe care am pus-o la Adrese de email: o
bifă care se salvează frumos și nu schimbă nimic e **mai rea decât lipsa ei** — adminul ar crede că a
închis o ușă care de fapt e deschisă. Se pun la loc în clipa în care dreptul chiar păzește ceva; o
probă automată verifică asta și pică dacă rămân pe dinafară.

Rămân patru drepturi ajustabile, toate reale: **administrează utilizatorii** (26 de rute),
**modifică flota** (50), **vede rapoartele** (34) și **vede toată flota** (filtrează lista de mașini).

- **Ce am schimbat:** ecranul de Roluri arată doar drepturi care chiar fac ceva.
- **Ce vede fondatorul:** lista completă a rolurilor, generată din cod (v. tabelul din discuție).
- **Ce vede clientul:** patru bife care funcționează, în loc de șapte din care trei mimau.

### AMÂNDOI · Roluri — firma își botează rolurile și le taie din drepturi

Ultimul pas din administrarea nouă. Setări → **Conturi și roluri → Roluri**.

Alin a ales varianta prudentă, și a ales bine. Firma **nu-și face roluri noi**: le ia pe cele
standard, le **redenumește** („Operator depou" în loc de „Dispecer") și le **taie** din drepturi.

**De ce așa și nu altfel.** Drepturile de bază rămân scrise în cod, iar în baza de date se ține doar
**lista celor tăiate**. Consecința e cea care contează: orice greșeală — a noastră, a clientului, sau
chiar cineva care ar scrie de mână în tabelă — poate produce cel mult un rol cu **mai puține**
drepturi. Niciodată unul cu mai multe. Un ecran de administrare care poate greși doar într-o direcție
e cu totul altceva decât unul care poate greși în amândouă.

**Ce se poate tăia:** doar drepturile pe care rolul le are oricum. Serverul filtrează ce primește, așa
că nu contează ce trimite cineva prin API — un drept inexistent nu devine drept.

**Ce NU se poate atinge:** rolul de **administrator**. Dacă și-ar tăia singur dreptul de
administrare, omul ar rămâne pe dinafară din propriul cont, fără cale de întoarcere. Rolurile de
platformă, evident, nici atât.

**Se aplică imediat**, la următoarea cerere a omului — nu trebuie să se delogheze. Iar tăierea merge
până la capăt: „Vede toată flota" tăiat nu doar ascunde un buton, ci chiar **restrânge lista de
mașini** pe care o primește. Un drept tăiat care ar rămâne activ în spate ar fi mai rău decât unul
neatins: adminul ar crede că a închis o ușă care de fapt e deschisă.

**Numele ales se vede peste tot** — în lista de utilizatori, în selectoarele de rol, în bara de sus.
Altfel omul boteza rolul aici și-l vedea tot „Dispecer" în rest.

- **Ce am schimbat:** un capitol nou, „Roluri", cu redenumire și tăiere de drepturi.
- **Ce vede fondatorul:** nimic schimbat la noi; rolurile de platformă rămân neatinse.
- **Ce vede clientul:** rolurile scrise pe limba firmei lui, cu exact ce are voie fiecare.

### AMÂNDOI · Adrese de email — agenda firmei, cu confirmare din inbox

Al patrulea pas. Setări → **Notificări → Adrese de email**.

**La ce folosește.** Până acum, alertele mergeau doar către **conturile oamenilor**, iar rapoartele
programate aveau, la fiecare raport, o listă de adrese **scrisă de mână**. Acum firma își ține
adresele o dată — `dispecerat@`, `contabilitate@`, `siguranta@` — și bifează pentru fiecare **ce
primește**: alerte, rapoarte, sau amândouă.

**Regula care ține totul în picioare: confirmarea din inbox.** O adresă adăugată aici **nu primește
absolut nimic** până când cineva nu apasă linkul din emailul de confirmare. Nu e birocrație — e
singurul lucru care ne ține departe de listele negre: fără ea, oricine își face cont ar putea trimite
emailuri **de pe serverul nostru** către orice adresă, iar apoi n-ar mai ajunge nici rapoartele
clienților corecți. Linkul e valabil 7 zile, se folosește o singură dată, iar din ecran se poate
retrimite. Adresele neconfirmate se văd altfel, cu galben, și scrie sub listă câte sunt.

**Alte limite puse dinadins:** maximum 20 de adrese per firmă, cel mult 5 emailuri de confirmare pe
oră, iar contul demo nu poate adăuga adrese deloc.

**Unde ajung, concret.** Alertele merg către adresele bifate „Alerte" — **o singură dată pe
eveniment**, nu o dată pentru fiecare om care are alerta pornită (altfel `dispecerat@` primea patru
copii ale aceleiași alerte). Rapoartele programate trimit acum și către adresele bifate „Rapoarte",
pe lângă lista scrisă de mână, fără să dubleze o adresă care apare în amândouă.

**Ce vede fiecare:** doar administratorul firmei umblă în agendă, și doar în a lui. Un dispecer nu o
vede deloc.

- **Ce am schimbat:** un capitol nou, agenda de adrese, legată de alerte și de rapoartele programate.
- **Ce vede fondatorul:** același ecran (pe firma lui); regula demo rămâne în picioare.
- **Ce vede clientul:** un loc unde scrie o dată unde vrea să primească, fără să repete adresele.

### AMÂNDOI · Cât stau oamenii în aplicație — în procente, cum a cerut Alin

Stă sus, în **Istoric activitate**: fiecare om, cât timp a petrecut în aplicație, o bară și
**procentul din totalul echipei**. Lângă procent scrie și ora exactă („16 h 55 min · 21 zile"),
fiindcă 50% din două ore nu înseamnă același lucru cu 50% din două sute.

**Ce măsurăm, exact.** Fereastra deschisă trimite un semnal la 5 minute, **doar cât timp e în față**.
Nu măsurăm „cât e logat": o filă uitată deschisă peste noapte ar raporta opt ore de lucru care nu
s-au întâmplat. Ora o pune serverul, nu calculatorul omului — altfel și-ar putea scrie singur orele.
Două semnale în același interval de 5 minute nu se adună de două ori, oricâte file ar avea deschise.

**Cine vede.** Doar cine administrează firma, și doar oamenii firmei lui. Un dispecer își trimite
prezența (e om ca oricare), dar **nu vede** cât stau colegii.

**Cât se păstrează.** Șase luni, apoi se șterge singură. E dată despre angajați, nu despre mașini —
n-are rost s-o ținem la nesfârșit.

**Un defect vechi, scos la iveală de treaba asta.** În aplicație, `currentUser` trăia doar în
scriptul principal. Restul fișierelor (și bucățile decupate pentru probe) citeau `window.currentUser`
— care **nu era pus niciodată**. Consecința tăcută: orice verificare „e super-admin?" din afara
scriptului principal ieșea *nu*, mereu. Printre ele, butonul **„Salvează în fișă"** de la Taxa de
drum, care nu apărea nimănui. O linie a rezolvat tot.

- **Ce am schimbat:** un bloc nou cu procentele de timp petrecut, plus măsurarea din spate.
- **Ce vede fondatorul:** același bloc, pe toate firmele.
- **Ce vede clientul:** cine folosește aplicația și cine a primit un cont degeaba.

### AMÂNDOI · Istoric activitate — cine s-a conectat și cine ce a modificat

Al treilea pas. Setări → **Evidență → Istoric activitate**.

**Jurnalul exista de mult, dar era doar al nostru.** Aplicația scrie de mult timp fiecare modificare
— sunt **125 de locuri** în cod care lasă urmă — numai că se vedea exclusiv din Audit, adică doar
super-adminii. Acum îl vede și administratorul unei firme, **pentru firma lui**.

**Scris pe românește, nu în termeni de programator.** În bază, un rând arată așa:
`update / device / 350317170000101`. Pe ecran scrie: *„maria@firma.ro a modificat mașina CJ 12
ABC"*. Numărul de înmatriculare vine odată cu rândul, tocmai ca să nu rămână IMEI-uri pe ecran.
Fiecare fel de acțiune are verbul, iconița și culoarea lui: verde la adăugare, roșu la ștergere,
gri la conectări, mov la descărcări.

**Cum se citește.** Zilele sunt titluri — „Azi", „Ieri", apoi data. Sus: perioada (7 / 30 / 90 de
zile), un filtru pe felul acțiunii (Tot · Conectări · Modificări · Descărcări) și unul pe om.
Se încarcă 50 de rânduri o dată, cu buton pentru restul.

**Două lucruri reparate ca să nu mintă ecranul:**

1. **Autentificările nu erau legate de firmă.** Se scriau fără companie, deci într-un istoric de
   firmă nu apărea nimeni conectându-se — vedeai ce s-a modificat, dar nu și cine a intrat în cont.
   Ecranul ar fi arătat complet fără să fie.
2. **Filtrul pe firmă îl pune serverul, nu ecranul.** Jurnalul e comun tuturor clienților; dacă
   filtrul ar veni din adresa paginii, oricine l-ar putea schimba. Proba încearcă exact asta: un
   admin dintr-o firmă nu vede nici rândurile altei firme, nici pe ale platformei.

**Ce vedem noi în plus:** adresa IP de pe fiecare rând. Clientului nu i-o arătăm — nu-i folosește la
nimic și e dată personală despre angajații lui.

**Ce NU e încă:** coloana cu **cât timp a petrecut fiecare în aplicație**. Urmează separat, fiindcă
cere un semnal periodic de la fereastra deschisă — altfel cine închide browserul fără să apese
„Deconectare" lasă o sesiune fără capăt, iar numărul ar minți.

- **Ce am schimbat:** un capitol nou, „Istoric activitate", cu jurnalul firmei scris în cuvinte.
- **Ce vede fondatorul:** același ecran, plus IP-ul; Auditul global rămâne neatins, la locul lui.
- **Ce vede clientul:** cine s-a conectat, cine ce a modificat și când — fără să ne întrebe pe noi.

### AMÂNDOI · Aparate GPS — ecranul care spune dacă un aparat a amuțit

Al doilea pas din administrarea nouă. Setări → **Evidență → Aparate GPS**.

**De ce contează.** Pe harta live, o mașină **tăcută arată exact ca una parcată**. Dacă un aparat s-a
defectat sau i s-a scos siguranța, omul află abia peste trei săptămâni, când îi trebuie traseul —
și atunci nu mai are ce recupera. Ecranul ăsta răspunde la o singură întrebare, dintr-o privire:
*mai transmite?*

**Ce vezi.** Sus, patru cifre: câte aparate ai, câte comunică acum, câte nu transmit, câte sunt
arhivate. Dedesubt, fiecare aparat cu un bulin colorat: **verde** = a transmis în ultimele 30 de
minute, **portocaliu** = tăcut de câteva ore, **roșu** = fără semnal de peste o zi (sau n-a transmis
niciodată). Cele care nu transmit stau **primele** — ele cer o acțiune, restul sunt doar o listă.

Pe fiecare rând: numărul mașinii, modelul aparatului, IMEI-ul, cartela SIM și când a transmis ultima
oară. Căutare după orice dintre ele, și un buton care deschide direct fișa mașinii. Lista se poate
descărca în Excel sau PDF (același nume brandat ca la toate rapoartele).

**„Dispozitive arhivate" a dispărut din meniu** — s-a mutat aici, ca filă. Nu am rescris-o: ecranul
arhivelor are deja istoric, restaurare și ștergere definitivă, așa că fila îl **împrumută**, la fel
ca „Utilizatori". O singură implementare, aceleași butoane peste tot.

**Un defect vechi, găsit scriind proba.** Când se salva doar modelul de GPS sau cartela prin API
(`PUT /api/devices/:imei`), interogarea rescria și numele, tipul și **numărul de înmatriculare** —
cu gol. Adică un client care își completa inventarul printr-o integrare **își ștergea numerele de
înmatriculare**, în tăcere. Din interfață nu se vedea, fiindcă formularul trimite mereu toate
câmpurile. Acum câmpurile netrimise rămân neatinse; ștergerea se cere explicit.

- **Ce am schimbat:** un capitol nou, „Aparate GPS", cu starea fiecărui aparat; arhivele s-au mutat
  înăuntru; s-a reparat ștergerea tăcută a numerelor de înmatriculare la salvarea parțială.
- **Ce vede fondatorul:** același ecran, plus numele companiei pe fiecare rând (el vede toate firmele).
- **Ce vede clientul:** un loc unde află imediat dacă un GPS a amuțit, fără să deschidă harta.

### AMÂNDOI · Setări devine casa clientului (pasul 1 din administrarea nouă)

Alin a văzut la un concurent (Arobs) o secțiune de administrare pentru client — adrese de email,
utilizatori, roluri, istoric de activitate, dispozitive — și a cerut același lucru la noi, **grupat,
pe înțelesul omului**, tot în Setări. Ăsta e primul pas: **casa**. Camerele noi vin pe rând.

**Cum era.** Setările aveau trei file lipite sus (Preferințe · Companie · Program), iar restul
administrării era împrăștiat în meniu: Panou admin, Companii, Utilizatori, Dispozitive arhivate,
Audit. Din șase butoane, **cinci deschideau același ecran**, doar pe file diferite — de aceea părea
că „se deschid aiurea".

**Cum e acum.** Setările au un meniu propriu, în stânga, cu capitole grupate:

| Grupă | Capitole |
|---|---|
| Contul meu | Preferințe |
| Conturi și roluri | Utilizatori |
| Regulile firmei | Ce văd toți · Program de lucru · Prețuri combustibil |
| Abonament și integrări | Facturile mele · Chei API |
| Doar pentru noi | Catalog coduri GPS |

Fiecare om vede **doar capitolele la care are drept**, iar un titlu de grupă apare doar dacă are ce
grupa dedesubt — altfel dispecerului i-ar rămâne pe ecran „Conturi și roluri" fără nimic sub el.

**Trei lucruri care s-au reparat pe drum:**

1. **Dispecerii și viewerii nu ajungeau deloc la Setări.** Toată secțiunea era ascunsă pentru cine
   nu administrează flota — deci nici la propriile preferințe, deși acolo scrie „se aplică doar
   contului tău". Acum ajung, și văd exact atât.
2. **„Utilizatori" avea două uși** (din meniu și din panou). A rămas una singură, în Setări.
3. **Cod mort scos:** funcția încărca praguri de alertă și lista de agenți în niște căsuțe care **nu
   mai există** în pagină de când agenții au pagina lor. Rula degeaba la fiecare deschidere.

**Cum am evitat să dublez ecrane.** „Utilizatori" și „Facturile mele" există o singură dată în
pagină. Setările le **împrumută** (mută bucata de ecran la ele), iar panoul de administrare le cere
înapoi înainte să le arate. Fără regula asta, panoul ar fi deschis o filă goală, fără nicio eroare —
exact genul de defect care se descoperă la client. E apărat de o probă automată.

**Ce NU e încă făcut** (urmează, în ordinea asta): Aparate GPS · Istoric activitate · timpul petrecut
în aplicație · Adrese de email · Roluri proprii. Panoul de administrare rămâne deocamdată neatins.

- **Ce am schimbat:** Setările s-au reorganizat pe capitole și au devenit singurul loc de
  administrare al clientului.
- **Ce vede fondatorul:** un capitol în plus, „Catalog coduri GPS", marcat limpede ca fiind al
  nostru; panoul de administrare rămâne cum era.
- **Ce vede clientul:** un singur loc, cu capitole pe înțelesul lui, și acces la ce ține de el.

### AMÂNDOI · Tahograf își primește propria iconiță

Alin a observat că **Șoferi** și **Tahograf** aveau exact aceeași iconiță — legitimația. Dintre cele
două, cea de schimbat era Tahograf: la Șoferi legitimația chiar are sens (e permisul de conducere).

Tahograf are acum **desenul aparatului digital din bordul camionului** — există gata făcut în setul
de iconițe și nu seamănă cu nimic altceva din aplicație. Ales de Alin dintre 9 variante.

**Pe drum am găsit o nepotrivire mai veche:** meniul lateral arăta legitimația, iar Administrarea
arăta un ceas de bord — două iconițe diferite pentru același lucru, în aceeași aplicație. Acum toate
cele 8 locuri arată la fel: meniul lateral, meniul de Administrare, fila Tahograf, harta de iconițe
a secțiunilor, categoria „Tahograf" din parametrii de camion, butonul și fereastra din aplicația de
telefon, plus antetul ferestrei Tahograf.

Ce am lăsat neatins: eticheta **„Card de tahograf"** de la un șofer rămâne cu legitimația — acolo
chiar despre un card e vorba.

- **Ce am schimbat:** Tahograf are iconița lui, aceeași peste tot; Șoferi păstrează legitimația.
- **Ce vede fondatorul:** meniul lateral și Administrarea nu se mai contrazic.
- **Ce vede clientul:** două rânduri din meniu care nu mai arată identic.

### AMÂNDOI · Iconița de la „Vehicule" — mașină, nu camion

Alin a cerut altă iconiță pentru **Management → Vehicule** și a ales **mașina din față**.

Motivul pentru care merita schimbată, dincolo de gust: iconița veche (camion cu ladă, din lateral)
era **aproape identică** cu cea de la **e-Transport** din același meniu — același camion, doar cu
două liniuțe de viteză în spate. La mărimea din meniu nu le deosebeai. Acum se văd clar diferit.

Am schimbat-o în **toate cele 7 locuri** unde eticheta e „Vehicule" și înseamnă *lista tuturor
mașinilor*, ca să nu rămână desincronizate: meniul lateral, fila din Administrare, harta de iconițe
a secțiunilor de administrare, mutarea vehiculelor între companii, fila de coduri a companiei,
cardul „Vehicule" din ofertare și cardul „Total vehicule" de pe tabloul de bord.

**Ce am lăsat neatins, intenționat:** camionul rămâne acolo unde chiar înseamnă *camion* — configul
de camion, profilurile CAN pentru camioane, memoria vehiculelor din Tahograf (unde e vorba de
vehicule profesionale) și rândurile din Taxa de drum. Acolo camionul e informație, nu decor.

- **Ce am schimbat:** iconița de la „Vehicule" e acum o mașină, peste tot unde apare lista.
- **Ce vede fondatorul:** meniul nu mai are două rânduri care arată la fel.
- **Ce vede clientul:** același lucru — iar „Vehicule" nu mai promite doar camioane.

### AMÂNDOI · Grila de tarife: „lei/km" scris lângă fiecare cifră

Alin s-a uitat la tabelul de tarife și a întrebat: *„cifrele astea, 0,17 etc, sunt în lei? scrie și
în dreptul lor."* Deasupra tabelului scria deja *„Cât costă un kilometru, în lei"* — dar el nu
citise rândul ăla, fiindcă **nimeni nu citește introducerea când se uită la un tabel**. Ochiul sare
direct la cifre, iar cifrele erau goale: 0,17 putea fi lei, euro sau procente.

Acum fiecare celulă își poartă unitatea: **0,17 lei/km**. Scris mic și gri, ca să nu acopere cifra,
dar prezent în toate cele 24 de căsuțe. Nu mai depinde de nimic de deasupra.

Un amănunt reparat pe drum: în modul de editare (doar voi îl vedeți) căsuța arăta **0.1** acolo unde
tabelul alăturat scrie **0,10** — două scrieri diferite ale aceluiași ban, exact genul de lucru care
te face să te întrebi dacă nu cumva e altă valoare. Acum arată mereu două zecimale.

**Am pus și o probă automată pe tabelul ăsta**, fiindcă tabelul ăsta a mai mințit o dată (0,22 stătea
pe Euro 6 și l-am prins abia comparând cu ecranul concurenței). De acum, la orice modificare,
aplicația verifică singură două lucruri: că fiecare cifră de pe ecran e **exact** cea din catalogul
oficial, și că fiecare cifră își poartă unitatea. Am stricat-o intenționat în ambele feluri ca să
mă asigur că proba chiar pică — și pică.

- **Ce am schimbat:** lângă fiecare tarif din grilă scrie acum „lei/km"; în modul de editare cifrele
  au mereu două zecimale; o probă automată apără cifrele și unitățile.
- **Ce vede fondatorul:** aceeași grilă, dar nu mai trebuie să explice nimănui în ce sunt cifrele.
- **Ce vede clientul:** un tabel din care poate citi un preț fără să întrebe pe nimeni.

### AMÂNDOI · Trei corecturi de limbaj la Taxa de drum, cerute de Alin

**1. Un rând scris pentru programatori, ajuns sub ochii clientului.** Deasupra grilei scria:
*„Valorile se stabilesc prin ordonanță și s-au tot amânat — de aceea stau aici, editabile, nu
îngropate în cod."* Ultima jumătate e o explicație tehnică despre cum e făcută aplicația. N-are ce
căuta pe un ecran de client. Scos.

Pentru super-admin a rămas ce e util practic: *„Tarifele se schimbă prin hotărâre de guvern. Când
apar valori noi, le scrii aici și se aplică imediat tuturor."*

**2. Grila nu se putea citi.** Arăta două cifre lipite într-o celulă — „0.17  0.08" — și o notă de
subsol care explica: *„prima cifră = autostradă, a doua = drum național"*. Adică omul trebuia să
țină minte o convenție ca să citească niște bani, iar dacă sărea nota, cifrele nu însemnau nimic.

Acum fiecare cifră stă **sub capul ei de coloană** (Autostradă / Drum național, sub fiecare normă
Euro), iar deasupra tabelului scrie pe litere ce sunt: *„Cât costă un kilometru, în lei. Depinde de
cât cântărește mașina și de cât de poluantă e."*

Titlul cardului a devenit **„Cât costă un kilometru"** în loc de „Grila de tarife" — spune ce e, nu
cum îi zicem noi.

Și încă un amănunt: câmpul de dată arăta „10/01/2026", pe care un om îl citește **10 ianuarie**. E
formatul american al browserului, nu ceva ce putem schimba în câmp. Am pus data scrisă în cuvinte
lângă el: **1 octombrie 2026**.

**3. „Toată flota" nu spunea ce e.** Alin a întrebat direct: *„e un istoric de costuri? adică ce a
fost în trecut? sau nu înțeleg."* Înțelesese perfect — numele era de vină. Se cheamă acum **„Ce a
costat până acum"**, iar sub titlu scrie de unde vin cifrele: *„pentru drumurile deja făcute, în
perioada aleasă. Kilometrii sunt cei reali, din traseul fiecărei mașini — nu o estimare."*

Perechea de file e acum limpede: **O cursă nouă** (ce va costa) și **Ce a costat până acum** (ce a
costat). Iar în meniu secțiunea se cheamă **Taxa de drum (TollRo)**, ca peste tot.

**O probă a devenit ambiguă din cauza redenumirii** și a picat: verifica dacă undeva în ecran scrie
„până acum" ca să știe că totalul e parțial — dar acum și TITLUL filei conține „până acum". Am
restrâns-o la eticheta totalului. O căutare pe tot ecranul ar fi trecut chiar dacă totalul ar fi
mințit.

- **Ce vede fondatorul:** un tabel de tarife pe care îl poate arăta unui client fără să-l explice.
- **Ce vede clientul:** aceleași cifre, cu unitatea scrisă, și file care spun ce fac.

### AMÂNDOI · Taxa de drum: „O cursă nouă" — cât te costă drumul pe care încă nu l-ai făcut

Alin a văzut la Arobs un calculator de cursă și a cerut același lucru sub RA Tracks. Are dreptate că
e mai util: un dispecer care dă prețuri îl deschide de zece ori pe zi, pe când lista pe flotă se
folosește o dată pe lună. Acum secțiunea are două file — **O cursă nouă** (implicită) și **Toată
flota** — pentru două întrebări diferite: *cât mă va costa* și *cât m-a costat*.

**Cum arată, exact cum a cerut.** Alegi mașina dintr-o listă cu **casetă de căutare deasupra** (la
trei mașini e de prisos, la patruzeci fără ea nu găsești nimic). Apoi **totul se completează singur
din fișa vehiculului**: seria de șasiu, masa maximă, numărul de axe, clasa de emisii, categoria — și,
din masă, treapta de taxare. Traseul: scrii o localitate și primești sugestii de adrese.

**De ce câmpurile alea nu se pot atinge.** Pe ecranul Arobs, categoria era un selector liber. Alin a
lăsat „3,5–7,5 t" pe un camion de **41 t declarat în același formular** — și costul a ieșit **25 lei
în loc de 72**. De trei ori mai mic, fără niciun avertisment. El e fondator de firmă de GPS și n-a
observat; un dispecer grăbit o va face zilnic.

La noi treapta se **calculează din masă**, iar masa vine din fișă. Nu există două câmpuri care să se
poată contrazice, pentru că e o singură sursă. Scrie și pe ecran de ce: *„datele vin din fișa
vehiculului și nu se pot schimba de aici"*.

**Ce a fost nou tehnic.** Ne lipsea un singur lucru: cineva care desenează traseul între două adrese.
Restul aveam deja — clasificarea drumurilor din OpenStreetMap și calculul taxei. Modulul nou de
rutare întoarce **doar geometria**; tarifele rămân ale noastre, deci furnizorul se poate schimba fără
să atingem nicio cifră.

Are trei stări, scrise ca să nu existe a patra: cu cheie → serviciul plătit-gratuit (2.500 cereri pe
zi); cu un comutator explicit → un server public de probă, care **își spune pe ecran că e de probă**;
fără niciunul → ecranul zice limpede ce lipsește, în loc să pară stricat.

Rutarea cere **profil de camion**, nu de autoturism: un TIR de 40 t nu merge pe unde merge un Logan
(poduri cu limită de tonaj, treceri joase). Trimitem masa și axele din fișă.

**Căutarea de adrese** s-a așezat lângă geocodarea inversă pe care o aveam deja — același furnizor,
același throttle, același cache. Altfel am fi respectat politica de uz pe jumătate din apeluri și
am fi încălcat-o pe cealaltă, ceea ce e totuna cu a n-o respecta deloc.

**Două verificări de bun-simț** pe care le-am pus fiindcă aici ies bani: un traseu rutier nu poate fi
mai scurt decât linia dreaptă dintre capete (dacă e, furnizorul ne-a dat altceva — mai bine o eroare
decât un cost pe un drum inexistent); iar harta colorează fiecare bucată cu **aceeași** clasificare
din care iese suma, ca desenul să nu contrazică cifra.

**O probă a căzut corect pe drum.** Inserasem blocul nou între două funcții pe care o probă le
decupează din fișier — a picat cu „window is not defined", ceea ce e infinit mai bine decât să treacă
verificând altceva. Am mutat blocul și am pus repere explicite, cu explicația lângă ele.

- **Ce vede fondatorul:** poate da un preț pe o cursă în trei clicuri, fără să tasteze nimic despre
  camion — și fără riscul de a-l încadra greșit.
- **Ce vede clientul:** la fel, pentru flota lui.

**Ce lipsește ca să meargă:** cheia de la serviciul de hărți (OpenRouteService, gratuită, 2.500 de
cereri pe zi). Se pune ca `ORS_API_KEY`. Până atunci ecranul se poate deschide și umbla, dar costul
nu se calculează — și o spune.

### AMÂNDOI · Grila de tarife era greșită. Prinsă de Alin, pe ecranul concurenței

Alin are cont la Arobs de la muncă. A calculat acolo o cursă și mi-a trimis captura. Ecranul lor
arăta **0,17 lei/km** pe autostradă. Noi aveam **0,22**.

Am verificat tarifele oficiale. **Ei aveau dreptate, noi greșeam.**

Pentru treapta 3,5–7,5 t, tarifele publicate sunt: Euro VI **0,17**, Euro V–IV **0,19**, Euro III și
mai vechi **0,22**. Noi pusesem **0,22 pe Euro 6** — adică luasem cea mai mare cifră publicată și o
dădusem celei mai curate mașini. Pe dos.

Unui client cu camion Euro 6 de 5 tone îi arătam cu **~30% mai mult** decât plătește. Dacă punea
cifra într-o ofertă, pierdea cursa pe un cost care nu există.

Și nu era singura: **toată treapta 7,5–12 t era ghicită prea sus** (0,35 în loc de 0,29 publicat).

**Ce am pus în loc.** Regula anunțată e simplă: Euro VI plătește tariful de bază, Euro V–IV +15%,
Euro III și mai vechi +30%. Capetele fiecărui interval sunt publicate; doar mijlocul pe treptele 2
și 3 rămâne derivat, marcat ca atare.

| | autostradă | drum național |
|---|---|---|
| 3,5–7,5 t | 0,17 – 0,22 | 0,08 – 0,11 |
| 7,5–12 t | 0,29 – 0,37 | 0,14 – 0,19 |
| peste 12 t | 0,48 – 0,62 | 0,24 – 0,31 |

**Verificarea care contează:** am pus în calculatorul nostru exact cursa din captura lui Alin —
117,6 km autostradă + 64 km național, camion 3,5–7,5 t Euro 6. Ne dă **25,11 lei**. Arobs arată
**25,12**. Diferența de un ban vine din rotunjirea distanței afișate de ei, nu din tarif.

**Plasa pusă ca să nu se mai repete.** Proba verifică acum, cifră cu cifră, toate valorile publicate,
plus două reguli de bun-simț pe care greșeala mea le încălca: *cu cât mașina e mai poluantă, cu atât
plătește mai mult* și *cu cât e mai grea, cu atât plătește mai mult*. Oricare inversare cade la probă.

**De ce n-am prins-o singur:** scrisesem în comentariu „3,5–7,5 t → ~0,08 și ~0,22 lei/km" — capetele
unui interval, pe care le-am citit ca pe o pereche. Un interval citit ca o valoare. Acum intervalele
stau scrise în cod, întregi, ca următorul care le atinge să vadă că sunt patru rânduri, nu unul.

- **Ce vede fondatorul:** cifre pe care le poate arăta unui client fără să se facă de râs lângă
  calculatorul concurenței.
- **Ce vede clientul:** costul real, nu unul umflat cu 30%.

### AMÂNDOI · Taxa de drum, refăcută pentru ecranul pe care îl vede omul

Alin: *„aici am un ecran când intru în taxa de drum, mai sus mi-ai zis că am alt ecran… nu mai
înțeleg nimic."* Avea dreptate să nu înțeleagă, și e vina mea.

**E același ecran.** Eu i-am arătat capturi pe **tema întunecată**, el are aplicația pe **tema
luminoasă** — și în plus, la el nu apare partea colorată, fiindcă n-are nicio mașină taxabilă. Două
diferențe care fac același ecran să pară altul.

Am randat ecranul **exact cum îl vede el** — temă luminoasă, flota lui — și abia atunci s-a văzut cât
de prost arăta:

**1. Rândurile erau aproape invizibile.** Aveau `opacity: .55` peste un fundal deja aproape alb. Pe
tema întunecată mergea; pe alb, dispăreau. Acum sunt secundare **prin contur** (linie punctată, fără
fundal), nu prin transparență.

**2. Motivul stătea unde nu se putea citi.** „AUTOTURISM — PLĂTEȘTE ROVINIETĂ, NU TAXĂ PE KM" era
scris mic, cu majuscule, în colțul din dreapta — adică o frază lungă înghesuită în locul rezervat
unei etichete scurte. Iar pe o flotă fără camioane e **singura informație de pe ecran**. Acum stă sub
numele mașinii, ca rând normal.

**3. Ecranul gol nu-și spunea rostul.** O flotă de autoturisme nu va avea NICIODATĂ ce calcula aici,
dar ecranul arăta doar o listă gri, fără explicație. Acum scrie: *„Nicio mașină din flotă nu intră la
taxa pe kilometru — taxa se plătește doar pentru marfă peste 3,5 t."*

**4. Butonul cerea o apăsare inutilă.** „Calculează toată flota" era activ chiar când nu era nimic de
calculat; apăsarea răspundea cu o eroare, iar omul credea că a stricat ceva. Acum e stins, cu motivul
scris lângă el.

**5. Avertismentul despre data taxei apărea și când nu exista nicio sumă** — avertiza despre nimic și
împingea mai jos mesajul care conta.

**Ce am învățat pentru data viitoare:** capturile pe care le trimit trebuie să fie pe **tema pe care
o folosesc ei** și **cu datele lor**, nu cu o flotă inventată de camioane. Altfel arăt un produs pe
care ei nu-l au.

- **Ce vede fondatorul:** ecranul îi spune, în două rânduri, de ce flota lui de autoturisme nu are ce
  căuta acolo — în loc să pară stricat.
- **Ce vede clientul:** la fel, plus rânduri lizibile pe tema deschisă.

### AMÂNDOI · Un Dacia Logan nu mai e întrebat cât cântărește

Alin a deschis Taxa de drum pe flota lor și toate cele trei mașini scriau același lucru: **„fără masa
maximă în fișă — nu se poate încadra"**. Două dintre ele erau un **Dacia Logan** și un **VW Caddy**.

Întrebarea n-avea răspuns util. Un autoturism nu trece de 3,5 t, oricât ai completa. Omul ori
completa degeaba, ori se întreba ce a greșit — și în ambele cazuri îi dădeam de lucru pe degeaba, pe
un ecran care ar fi trebuit să-i spună limpede „mașina asta nu te privește".

Acum **categoria vehiculului se verifică ÎNAINTEA masei**. Un autoturism scrie „autoturism — plătește
rovinietă, nu taxă pe km". O combină scrie „utilaj — nu e transport rutier de marfă". O remorcă scrie
„remorca nu se taxează separat — taxa e pe vehiculul care o trage".

**Duba a rămas dinadins pe lista celor întrebate.** Un Sprinter sau un Ducato mare e chiar la limita
de 3,5 t — acolo chiar trebuie cântărit, nu presupus. Regula acoperă doar cazurile fără dubiu.

Regula stă într-un singur loc (`tollro.js`) și e folosită de toate cele trei căi de calcul — lista
flotei, calculul din traseu și cel cu kilometri introduși de mână. Altfel ecranul ar fi spus una și
calculul alta.

**De ce nu vedea Alin culorile noi:** ele apar doar pe bara de sub o mașină care ARE un cost. El avea
zero mașini taxabile, deci n-avea ce colora. Ecranul nou era acolo — „Calculează toată flota" nu
exista înainte.

- **Ce vede fondatorul:** flota lor scrie acum de ce fiecare mașină nu intră la taxă, în loc să ceară
  o completare imposibilă.
- **Ce vede clientul:** la fel — și nu mai completează fișe degeaba.

### AMÂNDOI · Culorile de la taxa de drum spun acum cât costă, nu ce fel de drum e

Erau pe dos: **verde pe autostradă, roșu pe drumul național**. Pe un ecran cu bani, roșul se citește
„scump" — dar autostrada e de **două ori mai scumpă** decât nationalul în fiecare celulă din grilă
(0,48 față de 0,24 lei/km la peste 12 t Euro 6). Cu vechile culori, bara arăta verde exact pe partea
care înghite banii.

Alin a cerut inversarea. Acum: **roșu = cel mai scump, verde = mai ieftin, albastru = nu se
plătește deloc**. Culorile stau într-un singur loc (`tollro.js`), deci s-au schimbat deodată și pe
web, și pe telefon.

**Ce am adăugat pe lângă:** alegerea asta se sprijină pe faptul că autostrada rămâne mai scumpă
decât nationalul. Grila e editabilă de super-admin — dacă cineva schimbă raportul, roșul ar ajunge
pe cel ieftin și ecranul ar minți prin culoare, tăcut. Proba verifică acum **toate cele 12 celule**
și cade dacă raportul se inversează. Am stricat o celulă intenționat: a căzut.

- **Ce vede fondatorul:** bara fiecărei mașini arată acum, dintr-o privire, că banii se duc pe
  autostradă — care e chiar informația utilă pentru un dispecer care alege ruta.
- **Ce vede clientul:** la fel.

### AMÂNDOI · Taxa de drum: toată flota deodată, nu o mașină pe rând

Alin a ales varianta 2. Ecranul calcula până acum **un singur vehicul**, ales dintr-un selector.
Ca să afli care camion te costă cel mai mult trebuia să le iei pe rând și să faci socoteala pe
hârtie. Acum lista pleacă de la flotă: apeși o dată, iar mașinile se așază singure, **cea mai
scumpă prima**, cu totalul mare deasupra.

**Partea grea n-a fost lista, ci timpul.** Ca să știm pe ce fel de drum a mers camionul, întrebăm
OpenStreetMap — care acceptă **o cerere pe secundă**. Pe zece camioane, un singur răspuns ar dura
minute și ar cădea în timeout, iar zece cereri deodată ar fi refuzate: am primi zece erori în loc
de zece rezultate.

Așa că se cere pe rând, iar lista se umple pe măsură ce vin. Se vede că se lucrează, și se poate
opri la jumătate.

**Regula pe care am ținut-o cu dinții: un total pe jumătate nu se prezintă ca total.** Cât timp mai
sunt mașini în lucru, sus scrie **„până acum · 3 din 4 vehicule"**. Fără asta, cineva ar citi cifra
la mijlocul calculului și ar pune-o într-o ofertă. Proba verifică exact asta, cu o cifră veche
strecurată anume în date: dacă suma s-ar aduna din toate rândurile în loc de cele terminate, ar
intra și ea și proba cade.

**„Nu se taxează" și „nu știm" sunt două lucruri diferite.** O dubă de 3,2 t scrie *„sub 3,5 t —
plătește rovinietă, nu taxă pe km"*. Un camion fără masa completată în fișă scrie *„fără masa
maximă în fișă — nu se poate încadra"*. Primul e o scutire, al doilea e o fișă de completat. Dacă
amândouă ar spune la fel, omul n-ar ști pe care s-o repare. Și asta e probat.

**Prudența rămâne în direcția bună:** fără norma Euro completată, calculăm la tariful **cel mai
scump** și o spunem. Aici ies bani care ajung în oferte — o estimare optimistă îl face pe om să
piardă.

**Trei lucruri reparate pe drum:**
- **Notele galbene se rupeau în bucăți.** Erau desenate ca flex, iar fiecare cuvânt îngroșat devenea
  element separat: *„Taxa se aplică  01.10.2026 . Până atunci… din"*. Problemă veche, nu doar la
  ecranul nou — afecta toate notele din secțiune.
- **Cod rămas fără buton:** două funcții din ecranul vechi (tab-urile „din traseu / îi introduc eu")
  nu mai erau chemate de nimic. Scoase — exact ce am reproșat la e-Transport.
- **Probele de taxă nu erau în CI.** `verify_tollro.js` are 55 de verificări, rulează fără server, și
  nu era pornit la `npm test`. Adăugat, împreună cu cel nou.

- **Ce vede fondatorul:** poate arăta unui client, într-un ecran, cât îl va costa flota lui pe o
  săptămână și care camion e cel scump. Asta e argumentul de vânzare, nu calculatorul per mașină.
- **Ce vede clientul:** același lucru pentru flota lui, cu mașinile care nu se taxează separate la
  coadă și cu motivul scris.

### AMÂNDOI · e-Transport: scadențar în loc de caiet de coduri

Alin a ales varianta 2 din machete. Secțiunea arăta până acum ca un caiet: scriai de mână codul UIT,
numărul mașinii și IMEI-ul, apăreau într-o listă, atât. Acum e un **scadențar**, cu aceeași formă ca
Tahograf — grupat după cât de urgent e: **de rezolvat acum**, **expiră curând**, **în regulă**,
**încheiate**. Cine a învățat un ecran le știe pe amândouă.

**De ce contează acum, nu la anul.** Amenzile pentru netransmiterea datelor GPS către ANAF au intrat
în vigoare pe **1 ianuarie 2026**, iar pe **16 februarie 2026** a fost dată prima amendă publică fix
pentru asta. Firmă: 20.000–100.000 lei. Codul UIT ține 5 zile calendaristice (15 la achiziții
intracomunitare). Până acum aplicația nu știa nimic despre niciunul din lucrurile astea.

**1. Termenul codului UIT există.** Se propune singur din ziua de start (5 sau 15 zile, după tipul
operațiunii) — dar rămâne **editabil și salvat ca dată explicită**. Convenția exactă de numărare a
zilelor e de confirmat cu ANAF, iar o aplicație n-are voie să ghicească tăcut un termen care aduce
amendă. Dacă lipsește, scrie „termen necunoscut", nu o dată inventată.

**2. Cea mai importantă decizie din secțiune: două semafoare, nu unul.**
„Vehiculul transmite către NOI" și „noi trimitem la ANAF" sunt lucruri diferite. Fără tokenul ANAF nu
pleacă absolut nimic, oricât de bine ar merge tracker-ul. Macheta le amesteca. Dacă le-aș fi lăsat
așa, un client fără token ar fi văzut verde și ar fi înțeles „sunt în regulă la ANAF" — exact opusul
adevărului, pe ecranul care există ca să-l apere de amendă.

Acum sus scrie, cu roșu: **„Nu trimitem nimic la ANAF — lipsește tokenul."** Iar motivele fiecărui
transport se scriu pe litere, nu doar prin culoare: „cod UIT expirat · vehiculul nu mai transmite de
47 min".

**3. Vehiculul se alege din flotă**, nu se tastează IMEI-ul. Un IMEI greșit însemna un transport care
nu se leagă de nicio mașină: nu-i vezi pozițiile și n-ai ce raporta. Numărul de înmatriculare se ia
acum din fișa vehiculului.

**4. Prospețimea poziției.** Ecranul ia cea mai nouă dintre poziția din bază și cea din memorie —
adică exact ce citește mecanismul care trimite la ANAF. O poziție veche de o oră nu mai trece drept
transmisie curentă.

**Probele: 40 de verificări.** Am stricat pe rând regulile și au căzut: termenul implicit pus pe cel
lung în loc de cel scurt → o verificare picată; banda de avertizare ANAF scoasă → două; verificarea
de acces la vehicul scoasă → una.

**O probă a mea trecea degeaba** și am prins-o tot printr-un sabotaj: verifica doar că niciun vehicul
demo nu apare în listă, dar transportul demo nici nu se crea (e refuzat mai devreme), deci lista
ieșea goală și proba se declara mulțumită. Acum verifică refuzul în sine — apărarea adevărată.

**Și o probă veche a căzut, corect.** Redenumind antetul secțiunii, proba de Tahograf n-a mai găsit
codul ecranului și a picat zgomotos, în loc să verifice în gol. Am pus un reper stabil în pagină
(`// ── sfârșit Tahograf ──`) ca să nu se mai rupă la fiecare redenumire.

**Secțiunea NU e terminată** — vezi lista de dinainte de lansare, are punct propriu.

- **Ce vede fondatorul:** poate arăta unui client, în două secunde, care transport îl duce la amendă
  azi — și poate spune cinstit ce facem și ce nu facem încă.
- **Ce vede clientul:** aceeași listă, plus avertismentul că raportarea la ANAF nu e pornită. Nu se
  mai poate crede raportat fără să fie.
### AMÂNDOI · Bordul mașinii pe telefon: doar ce e aprins acum, cu pictograme de bord — `b210399`

Ecranul de stări arăta tot ce știe mașina să trimită — și aprins, și stins. Pe Passat însemnau
aproape 60 de casete, din care 55 spuneau „Închis", „Stins", „Nu". Ce se întâmpla chiar acum se
pierdea printre ele.

**Acum se văd doar stările active.** O ușă apare când e deschisă. Un martor apare când e aprins.
Restul lipsesc, iar sus scrie de ce, ca să nu pară că s-a stricat ceva.

**Trei lucruri se văd tot timpul**, exact cele cerute, fiindcă acolo contează și răspunsul „nu":
- **frâna de mână** — trasă sau eliberată;
- **treapta de viteză** — P, R, N sau D;
- **încuietoarea** — mașina e încuiată sau nu.

**Treapta era împărțită în patru casete** („Cutie în parcare", „Cutie în neutru"…), din care trei
stăteau mereu stinse. Acum e una singură, cu litera din bord.

**Toate pictogramele sunt redesenate**, în stilul din fișa adaptorului: ușa din față stânga arată
altfel decât cea din spate dreapta, frâna de mână e „P"-ul în cerc, ABS-ul e inelul cu ABS, EPC-ul
scrie EPC, bujiile incandescente sunt spirala, treapta e caseta cu litera. Înainte, patru uși
diferite împrumutau același desen, iar geamurile îl luau pe cel al trapei — Font Awesome n-are
iconițe de bord, așa că nu prea avea de unde alege.

Opt dintre desene nu se citeau la mărimea reală (19 pixeli): mâna de STOP ieșea un bulgăre, centura
un „%", motorul un norișor. Le-am privit pe rând, mărite și la mărimea din aplicație, și le-am
refăcut până s-au citit — inclusiv centura, pentru care am desenat patru variante ca să aleg una.

**Și pe web, și pe telefon, desenele sunt acum ACELEAȘI.** Se scriu într-un singur loc și se
generează automat pentru web; dacă cineva schimbă un desen și uită să-l regenereze, se oprește
verificarea automată înainte de livrare.

- **Ce vede fondatorul:** aceleași ecrane, plus 23 de verificări noi care apără regula asta.
- **Ce vede clientul:** dintr-o privire, ce se întâmplă cu mașina acum — nu o listă de „totul e
  închis". Atingi o pictogramă și afli ce înseamnă.

Verificat pe datele reale ale Passat-ului și pe toate combinațiile din protocol: 91 de verificări la
panoul din web, 84 la decodor, toate verzi.

Sub aceeași regulă a picat și ultima casetă stinsă de pe ecran: semnalul pe care adaptorul îl poate
trimite, dar pe care încă nu știm să-l citim (închiderea centralizată), nu mai apare ca plăcuță
„necitit". A rămas rândul de jos care spune limpede că lipsește ceva și de ce.

**De reținut:** stările se arată din ultimul pachet primit. Dacă mașina stă parcată și adaptorul
adoarme, cele trei permanente rămân cu ultima valoare primită — corect pentru o mașină parcată, dar
nu e o „memorie" separată.

---

### AMÂNDOI · De ce nu se vedeau pictogramele pe Passat — și cele 6 semnale citite greșit — `b734a01`

Passat-ul **transmite** de aseară: 106 semnale, tot ce scrie în fișa Teltonika pentru modelul ăsta.
Dar ecranul de stări rămânea gol. Am găsit de ce, uitându-mă la datele lui reale.

**Adaptorul poate trimite stările mașinii în două feluri.** Fie împachetate — un singur semnal, cu
câte un bit pentru fiecare stare. Fie separat — câte un semnal pentru fiecare stare: unul pentru ușa
șoferului, unul pentru luminile de poziție, unul pentru fiecare martor din bord. Noi citeam **doar
prima variantă**. Passat-ul o folosește pe a doua. Deci mașina trimitea totul, iar aplicația se uita
în locul greșit și arăta gol.

Acum citim amândouă variantele, iar rezultatul intră în același loc — pictogramele, categoriile și
baloanele cu explicații merg neschimbate. Pe datele reale ale Passat-ului **apar 34 de plăcuțe** unde
înainte nu era niciuna: cele patru uși, capota, trapa, ambreiajul, treapta de viteză, toate luminile,
aerul condiționat, pilotul automat și toți martorii de bord.

**Al doilea lucru, mai serios: șase semnale erau citite greșit, chiar acum, pe mașină.** Erau
etichetate demult „semnalizator stânga", „semnalizator dreapta", „avarii", „lumini", „frână de mână"
și „stare securitate". În documentația oficială sunt cu totul altceva: **contactul**, cheia în
contact, portbagajul și treptele N/P/R. Adică în dreptul „frânei de mână" se afișa, de fapt, dacă e
contactul pus. Corectate, cu documentație.

**Fișa pe care ați trimis-o confirmă și corectura de ieri:** în lista de parametri pentru VW Passat
B7 (program 11173) scrie negru pe alb „VIN number" — exact semnalul pe care ieri l-am mutat de la
ID-ul greșit la cel corect.

**Ce am adăugat în plus**, pentru că Passat-ul le trimite: geamurile (toate patru), Start-Stop
dezactivat, mers pe GPL sau combustibil dublu, remorcă atașată.

- **Ce vede fondatorul:** aceleași ecrane, plus semnalele care înainte erau numere fără nume.
- **Ce vede clientul:** bordul mașinii pe telefon, cu pictograme care chiar se aprind — atingi una și
  afli ce înseamnă.

**Confirmat în producție, pe mașina reală:** **59 de plăcuțe** apar acum pe Passat, unde înainte nu
era niciuna, iar seria de șasiu se citește ca text: **WVWZZZ3CZBE322504**.

Verificând rezultatul, am mai găsit trei semnale citite greșit — erau etichetate „date CAN manuale
0/2/4", dar sunt de fapt *motorul funcționează*, *gata de plecare* și *regimul de lucru*. Din cauza
asta se aprindea „Regim personal" pe o mașină care raporta, de fapt, regim de serviciu. Corectat,
inclusiv sensul inversat (la acest semnal 0 înseamnă personal, 1 înseamnă serviciu).

Verificat pe datele reale ale Passat-ului, nu pe date inventate: ambreiajul apăsat văzut corect,
ușile închise rămân stinse. Trei verificări noi în CI leagă puntea de catalog, ca să nu
se mai poată desincroniza.


### AMÂNDOI · Fișierul de tahograf se încarcă și de pe telefon

Ultimul lucru care se putea face DOAR din web. Acum se face și din aplicația de telefon: deschizi
Tahograf → „Încarcă un fișier descărcat", alegi șoferul (sau vehiculul), alegi fișierul, trimiți.

**Fără plugin nou.** Selectorul de fișiere al Androidului se deschide direct din aplicație, la fel ca
la pozele de talon. Zero dependințe native în plus, deci zero risc la construirea APK-ului.

Un amănunt care ar fi trecut neobservat: fișierele `.DDD` **n-au un tip înregistrat** în Android. Dacă
i-aș fi cerut selectorului „doar .ddd", fișierul ar fi apărut gri, neselectabil, și omul ar fi crezut
că aplicația e stricată. Așa că selectorul le arată pe toate — oricum serverul e cel care spune dacă
fișierul e sau nu un tahograf, nu extensia din nume.

**O regulă mutată la locul ei.** „Fișierul trebuie legat de un șofer sau de un vehicul" trăia doar în
pagina web. Un fișier nelegat rămâne în bază fără să conteze pentru niciun termen — o descărcare
făcută, dar invizibilă în scadențar. Cu al doilea client care încarcă, regula ar fi trebuit scrisă de
două ori, deci am mutat-o pe **server**. Tot acolo am adăugat și verificarea că vehiculul ales chiar
există: un IMEI tastat greșit trecea de verificarea de acces și crea aceeași legătură moartă.

Ecranul o mai spune o dată înainte de trimitere, dar din alt motiv: ca omul să afle că a uitat să
aleagă **înainte** de a urca câțiva MB pe date mobile, nu după.

**Ce NU face:** un fișier pe care serverul nu-l poate citi nu e raportat ca reușită. Scrie, cu roșu,
„s-a păstrat, dar NU l-am putut citi — nu contează ca descărcare", plus motivul. Ar fi fost cel mai
prost mesaj posibil aici: „încărcat ✓" pe ceva ce nu ține loc de nimic la un control.

**Probele.** Pe lângă cele de pe server (61 acum), am condus chiar interfața de telefon dintr-un
browser, la dimensiune de telefon, pe date reale: am construit un `.DDD` din specificație, l-am ales
prin selectorul de fișiere și am verificat că șoferul trece din „niciodată descărcat" în „ultima
descărcare 25.08" **fără reîncărcarea ecranului**. Apoi am trimis un fișier stricat și am verificat
că mesajul nu e verde. Regula mutată pe server am stricat-o intenționat: trei verificări au căzut.

- **Ce vede fondatorul:** poate încărca un fișier de la un client direct de pe telefon, din mașină.
- **Ce vede clientul:** la fel — nu mai trebuie să ajungă la calculator ca să pună o descărcare.

### AMÂNDOI · Rândul cu „cine nu apare", rescris de Alin

Scria „Nu apar aici: 2 șoferi fără categorie de tahograf și 3 vehicule fără tahograf — n-au ce
descărca." Alin a cerut altfel: **„Acum aveți: 2 șoferi fără categorie de tahograf și 3 vehicule fără
tahograf, nimic de descărcat."**

Are dreptate. Varianta veche începea cu o negație („nu apar") și te punea să te întrebi de ce lipsește
ceva. A lui începe cu ce ai și se termină cu concluzia — asta e informația, nu absența ei.

Schimbat în amândouă interfețele, cuvânt cu cuvânt la fel, iar proba verifică de acum că fraza rămâne
identică pe web și pe telefon. Fără verificarea asta, aceeași flotă ar putea fi descrisă în două feluri
în aceeași aplicație.

- **Ce vede fondatorul:** același rând, spus mai limpede.
- **Ce vede clientul:** la fel.

### AMÂNDOI · Tahograful și bifele de pe permis, și pe telefon

Alin a cerut ca modificarea de dimineață să ajungă și în aplicația de Android. Erau două lipsuri, nu una.

**1. Fișa șoferului n-avea categoriile de pe permis.** Pe telefon puteai completa nume, telefon, email,
număr de permis și data de expirare — dar nu și categoriile. Adică fix bifa care decide dacă omul intră
în Tahograf. Un administrator care lucrează de pe telefon n-avea cum să repare ce-i cere ecranul de
Tahograf să repare. Acum are: bifele sunt grupate ca pe permis (Moto / Auto / Marfă / Persoane /
Speciale), iar sub ele scrie pe loc ce a ieșit — „Șofer profesionist" și, dacă e cazul, „Card de
tahograf — apare în Tahograf, de descărcat la 28 de zile".

Categoriile profesioniste sunt marcate cu un punct, nu cu culoare. Motivul: în ecranul ăsta albastrul
înseamnă deja „card de tahograf", iar troleibuzul și tramvaiul sunt profesioniste FĂRĂ tahograf. Două
albastre diferite pe același rând ar fi spus că troleibuzul are tahograf.

**2. Tahograful de pe telefon arăta doar fișiere.** Era o listă de .DDD încărcate, atât — nu spunea pe
cine trebuie să descarci. Acum are aceleași două lucruri ca web-ul: **De descărcat** (scadențarul, cu
zilele rămase și bara de termen) și **Fișiere**. Atingi un șofer și vezi descărcările lui plus zilele
pe care nu le poți dovedi la un control.

Un fișier necitit arată acum și pe telefon ca necitit — „nu contează ca descărcare" — și nu mai scoate
patru zerouri care ar fi trecut drept măsurători.

**Regula de care m-am ținut: telefonul NU rejudecă cine intră în listă.** Filtrele (fără flota demo,
doar șoferii cu card, doar vehiculele cu tahograf) rulează O SINGURĂ DATĂ, pe server. Telefonul cere
aceeași adresă ca web-ul și desenează ce primește. Dacă și-ar fi filtrat singur lista, ar fi ajuns să
arate altă flotă decât web-ul, iar cineva ar fi descărcat după lista greșită.

Ca să rămână așa, am scris o probă anume pentru asta (33 de verificări): se uită în codul aplicației de
telefon și **cade dacă apare acolo un filtru propriu sau o listă proprie de categorii**. Am încercat
deliberat amândouă — proba le-a prins. Tot ea verifică și că serverul, web-ul și telefonul folosesc
aceleași denumiri pentru motivele de excludere; dacă cineva redenumește unul, proba spune care ecran
a rămas în urmă.

Ecranele le-am și văzut, nu doar compilat: aplicația de telefon pornită pe un server de probă cu
șoferi și camioane reale, autentificare adevărată, capturi din browser la dimensiune de telefon.

- **Ce vede fondatorul:** poate completa categoriile unui șofer și poate verifica scadențarul de pe
  telefon, fără să deschidă laptopul.
- **Ce vede clientul:** același Tahograf ca pe web, cu aceleași cifre. Nu mai există „pe telefon scrie
  altceva".

### AMÂNDOI · În Tahograf intră doar cine are ce descărca

Alin s-a uitat pe scadențar și a găsit acolo, roșii, cele cinci vehicule DEMO și pe fondatorii înșiși
ca „șoferi niciodată descărcați". Trei greșeli diferite, toate cu același efect: un ecran care sună
alarma pentru lucruri care n-au ce descărca. Un ecran care strigă degeaba se învață să fie ignorat,
iar ăsta e exact ecranul pe care nu-ți permiți să-l ignori.

**1. Flota demo n-are ce căuta în flota reală.** Vehiculele demonstrative sunt semănate cu categoria
„camion", așa că treceau de filtru și apăreau ca restanțe. Regula există deja peste tot în aplicație
(demo se vede DOAR în contul demo) — în scadențar lipsea. Acum e și acolo.

**2. Nu orice om cu permis e șofer de camion.** Card de tahograf au doar cei cu o categorie de marfă
sau persoane pe permis — C, C1, CE, D, D1, DE. Cine are permis de autoturism nu conduce vehicul cu
tahograf, deci n-are ce descărca. Regula se citește din bifele de pe fișa șoferului, dintr-o singură
sursă (`license_cats.js`), aceeași care spune „profesionist" în lista de șoferi.

Detaliu de reținut: **troleibuzul și tramvaiul sunt meserii de profesionist, dar nu intră sub
tahograf** — tramvaiul e vehicul de cale ferată, troleibuzul circulă pe traseu urban scurt, exceptat.
De-aia „profesionist" și „are card de tahograf" sunt două întrebări diferite, nu una.

**3. Nu orice vehicul are tahograf.** Autoturismele, dubele, utilajele — nu. Se recunosc după
„Categorie" din fișa vehiculului: Camion, TIR, Autotractor, Autobuz, Autocar.

Aici era ascunsă o greșeală pe care n-o văzuse nimeni: filtrul vechi căuta textul „tractor" oriunde
în categorie, deci prindea și **„Autotractor"** (capul de TIR, care are tahograf), și **„Tractor"**
(tractorul agricol, care n-are). Orice fermă cu tractoare în aplicație ar fi primit alarme de
descărcare pentru utilaje agricole. Acum lista e explicită, iar proba verifică anume cazul ăsta.

**Partea la care am stat cel mai mult: ce se întâmplă cu cine NU apare.**

Un filtru care ascunde e periculos exact pe ecranul ăsta. Dacă unui șofer profesionist nu i s-au bifat
categoriile pe permis, el dispare tăcut din singura listă care există ca să nu dispară nimeni. De-aia
ecranul spune cine lipsește și de ce:

- cei **fără nicio categorie completată** sunt numiți pe nume — „2 șoferi nu au categoriile de pe
  permis completate: Gherbali Robert, Tilvar Alin — dacă vreunul e profesionist, completează-i
  categoriile";
- cei cu permis doar de autoturism sunt doar numărați, discret („nu apar aici: 3 șoferi fără categorie
  de tahograf — n-au ce descărca");
- iar când nu e nimic de descărcat, scrie **„Nimic de descărcat"**, nu „toate descărcările sunt la zi".
  A doua variantă e o minciună liniștitoare: nu e nimic la zi, nu e nimic pornit.

Ca să se închidă cercul, în fișa șoferului, când bifezi C sau CE, apare pe loc eticheta **„Card de
tahograf — apare în Tahograf, de descărcat la 28 de zile"**. Nu mai trebuie să ghicești ce bifă pe ce
ecran are efect.

**Încă o potrivire reparată:** formularul de încărcare oferea toți șoferii firmei. Puteai lega un
fișier de un om care nu intră în tahograf — fișierul rămânea în bază, dar descărcarea nu se vedea
nicăieri. Acum formularul oferă exact pe cine arată lista.

**Probele.** 57 de verificări pe secțiunea asta (erau 25). Am stricat pe rând fiecare regulă și am
verificat că probele chiar cad: fără filtrul demo → 2 verificări picate; fără filtrul de șoferi → 4;
cu vechea potrivire pe „tractor" → tractorul agricol reapare în listă; cu sumarul care spune mereu
„la zi" → 2. Ultimele verificări iau răspunsul REAL al serverului și îl dau funcțiilor REALE de
desenare din aplicație, ca să nu fie corectă ruta și mincinos ecranul.

- **Ce vede fondatorul:** secțiunea Tahograf goală și curată, cu explicația de ce e goală și ce are de
  completat ca să nu fie — nu cinci vehicule demo și doi fondatori pe post de șoferi de TIR.
- **Ce vede clientul:** doar șoferii lui profesioniști și doar camioanele/autobuzele lui, fiecare cu
  termenul de descărcare. Restul flotei nu-i mai zgomotează ecranul.

### AMÂNDOI · VIN-ul se citea de unde nu trebuie, iar textele veneau ca șiruri de cifre — `f077919`

Două întrebări ale lui Robert (26.08) — „ce înseamnă VIN 325?" și „Total Odometer intră în conflict
cu odometrul mașinii?" — au scos la iveală trei probleme, una serioasă.

**1. VIN-ul era luat de la ID-ul greșit.** Aveam scris de mult că VIN-ul e semnalul **217**. În
documentația oficială, 217 e cu totul altceva: „zona de geofence 36". VIN-ul adevărat, pe adaptorul
ALL-CAN300, e **325** — 17 caractere text. Deci: în dreptul VIN-ului se afișa o valoare care nu avea
nicio legătură cu seria de șasiu, iar VIN-ul real ajungea într-un câmp fără nume. Corectat amândouă.

**2. Textele soseau ca șiruri de cifre.** VIN-ul, codul de bare scanat, numele șoferului de pe card —
toate vin ca text, dar noi le păstram în forma tehnică: în loc de `WV2ZZZ2KZ8X017409` se vedea
`5756325a5a5a...`. Erau acolo, dar ilizibile. Acum se afișează ca text.

**3. Cea mai serioasă, deși nu se vedea:** stegulețele de stare (uși, lumini, frână de mână) pot sosi
pe două căi. Pe una dintre ele erau citite ca număr **zecimal** deși erau scrise în hexazecimal —
adică toți biții ieșeau greșiți. Ar fi însemnat uși raportate deschise când erau închise. Reparat, cu
probă pe amândouă căile.

**Despre cele două kilometraje — nu e conflict, sunt două lucruri diferite:**
- **„Kilometraj din bord (CAN)"** = kilometrii REALI ai mașinii, citiți din bordul ei;
- **„Odometru GPS (de la montare)"** = un contor al DISPOZITIVULUI nostru, care numără din GPS de
  când a fost montat. Pornește de la zero la instalare.

Aplicația le folosea deja în ordinea corectă (bord + GPS din fișă → CAN → GPS), dar **etichetele
semănau prea tare** și una zicea „metri" deși valoarea era în kilometri. Le-am făcut explicite, cu
explicație în catalog. Am scos și o intrare moartă din lista „Distanță": aștepta un semnal pe care
nu-l produce nimic.

- **Ce vede fondatorul:** VIN corect în fișă, etichete de kilometraj care nu se mai confundă.
- **Ce vede clientul:** seria de șasiu citită automat din mașină, lizibil.

Pe drum am reparat și **generatorul de hartă IO**: își citea propriul rezultat și, de la a doua
rulare, credea că totul e deja făcut — ar fi produs 52 de intrări în loc de 502. Un generator care nu
dă același rezultat la fiecare rulare e mai rău decât lipsa lui. Acum e verificat că e idempotent.

## 2026-08-22

### AMÂNDOI · Toate IO-urile Teltonika sunt mapate + bordul mașinii pe telefon — `bebf3b2`

**De ce.** Passat-ul B7 (B112RFG) are FMC130 cu adaptor ALL-CAN300 — trimite zeci de semnale
(uși, lumini, frână de mână, martori de bord). Noi mapam ~150 din cele **640** de semnale din
lista oficială Teltonika; restul apăreau ca numere fără nume („io_517") sau deloc. În plus,
stegulețele „P4" — protocolul nou prin care mașinile moderne trimit ușile, luminile și martorii —
**nu se decodau deloc**.

**1. Lista completă, generată din documentația oficială — nu scrisă de mână.** Am descărcat specul
oficial Teltonika (640 de parametri), l-am transformat în fișier de date și am scris un generator
care produce harta de nume. De ce așa: o listă scrisă de mână la scara asta SE VA desincroniza —
s-a și întâmplat: 7 ID-uri fuseseră „ghicite" demult și afișau date greșite (le-am corectat, cu
documentație). Un test în CI garantează de-acum două lucruri: **orice ID oficial primește nume** și
**niciun nume existent nu se mai schimbă vreodată** (datele stocate depind de ele).

**2. Stegulețele P4, decodate bit cu bit.** Uși, frână de mână, ambreiaj, treaptă (P/R/N/D),
lumini, centuri, toți martorii de bord (check engine, presiune ulei, AdBlue…) — din tabelele
oficiale de biți, cu test bit-cu-bit în CI. Unde starea există și în protocolul vechi (P2), numele
e ACELAȘI — categoriile din aplicație merg pentru amândouă fără nicio schimbare.

**3. O eroare reală de precizie, găsită pe drum.** Valorile pe 8 octeți (exact stegulețele P4) se
citeau într-un tip numeric care **pierde biții de jos** la valori mari — chiar valoarea văzută pe
Passat în Configurator depășea pragul: o ușă deschisă putea pur și simplu să dispară din date.
Reparat + test cu valoarea reală a Passat-ului.

**4. Pe telefon: cardul „Stări vehicul"** (cerut de Robert) — în ecranul de date CAN, un cartonaș
cu **pictograme de bord**: mașină încuiată, fiecare ușă, frână de mână, faruri, centuri, tempomat,
AC, treapta P/R/N/D. Gri = inactiv, colorat = activ. **Atingi pictograma → un balon** îți spune ce
e și în ce stare e acum. Avertizările (check engine, presiune ulei, baterie…) apar **doar când sunt
aprinse** — un perete de martori gri ar îngropa exact semnalul care contează.

**5. Etichete românești pentru tot.** Catalogul de IO-uri (editorul „Mapează" + consola de
diagnoză) acoperă acum toate cele 640 de ID-uri, cu 14 etichete vechi corectate pe spec.

- **Ce vede fondatorul:** în fișa vehiculului, categoriile noi (Accelerometru, Dallas, OBD, BLE) +
  semnalele care înainte erau numere fără nume.
- **Ce vede clientul:** pe telefon, bordul mașinii cu pictograme; pe web, uși/lumini/martori
  decodate la mașinile cu ALL-CAN300 — adică exact ce va transmite Passat-ul când pornește SIM-ul.

Verificat cap-coadă pe sandbox: pachet TCP real cu stegulețe P4 → uși/frână/contact decodate
corect în API, accelerometrul negativ corect, valoarea pe 8 octeți fără nicio pierdere de biți.
APK reconstruit.

**Completare, după împăcarea cu lucrul din sesiunea paralelă:** panoul de plăcuțe CAN (web + telefon)
există deja, cu sursa unică `can_flags.js` — acolo au intrat cele **45 de plăcuțe noi P4** (ambreiaj,
telecomandă, CNG, diferențiale, martori hidraulici/remorcă…), fiecare cu explicația ei. Lista
„necitite" a scăzut de la 5 la 1: ambreiajul și telecomanda, anticipate acolo ca necunoscute, au
acum biți oficiali și se aprind. **Balonul cerut e pe telefon:** atingi orice plăcuță → balon cu ce
înseamnă și starea curentă; pe web, același text apare la ținerea mouse-ului. Un test nou în CI ține
catalogul și decodoarele lipite: fiecare plăcuță are decodor, fiecare steag decodat are plăcuță,
fiecare plăcuță are explicație.

## 2026-08-20


### AMÂNDOI · VIN-ul se citea de unde nu trebuie, iar textele veneau ca șiruri de cifre — `9bbcdf6`

Două întrebări ale lui Robert (26.08) — „ce înseamnă VIN 325?" și „Total Odometer intră în conflict
cu odometrul mașinii?" — au scos la iveală trei probleme, una serioasă.

**1. VIN-ul era luat de la ID-ul greșit.** Aveam scris de mult că VIN-ul e semnalul **217**. În
documentația oficială, 217 e cu totul altceva: „zona de geofence 36". VIN-ul adevărat, pe adaptorul
ALL-CAN300, e **325** — 17 caractere text. Deci: în dreptul VIN-ului se afișa o valoare care nu avea
nicio legătură cu seria de șasiu, iar VIN-ul real ajungea într-un câmp fără nume. Corectat amândouă.

**2. Textele soseau ca șiruri de cifre.** VIN-ul, codul de bare scanat, numele șoferului de pe card —
toate vin ca text, dar noi le păstram în forma tehnică: în loc de `WV2ZZZ2KZ8X017409` se vedea
`5756325a5a5a...`. Erau acolo, dar ilizibile. Acum se afișează ca text.

**3. Cea mai serioasă, deși nu se vedea:** stegulețele de stare (uși, lumini, frână de mână) pot sosi
pe două căi. Pe una dintre ele erau citite ca număr **zecimal** deși erau scrise în hexazecimal —
adică toți biții ieșeau greșiți. Ar fi însemnat uși raportate deschise când erau închise. Reparat, cu
probă pe amândouă căile.

**Despre cele două kilometraje — nu e conflict, sunt două lucruri diferite:**
- **„Kilometraj din bord (CAN)"** = kilometrii REALI ai mașinii, citiți din bordul ei;
- **„Odometru GPS (de la montare)"** = un contor al DISPOZITIVULUI nostru, care numără din GPS de
  când a fost montat. Pornește de la zero la instalare.

Aplicația le folosea deja în ordinea corectă (bord + GPS din fișă → CAN → GPS), dar **etichetele
semănau prea tare** și una zicea „metri" deși valoarea era în kilometri. Le-am făcut explicite, cu
explicație în catalog. Am scos și o intrare moartă din lista „Distanță": aștepta un semnal pe care
nu-l produce nimic.

- **Ce vede fondatorul:** VIN corect în fișă, etichete de kilometraj care nu se mai confundă.
- **Ce vede clientul:** seria de șasiu citită automat din mașină, lizibil.

Pe drum am reparat și **generatorul de hartă IO**: își citea propriul rezultat și, de la a doua
rulare, credea că totul e deja făcut — ar fi produs 52 de intrări în loc de 502. Un generator care nu
dă același rezultat la fiecare rulare e mai rău decât lipsa lui. Acum e verificat că e idempotent.

## 2026-08-22

### AMÂNDOI · Tahograf refăcut: „cine trebuie descărcat" pe primul loc

Alin a ales varianta 2 + 1 din machete, plus cele patru lipsuri pe care i le arătasem. Secțiunea are
acum trei file, în ordinea în care contează: **De descărcat**, **Pe șofer**, **Abateri**.

**1. Scadențarul — partea cu amendă.** Legea cere descărcarea cardului de șofer la cel mult 28 de
zile și a memoriei camionului la 90. Aplicația nu spunea nimic despre asta. Acum e primul lucru pe
care îl vezi: fiecare șofer și fiecare camion, cu câte zile mai ai, colorat ca la acte (roșu depășit,
portocaliu aproape, verde în regulă). Termenele se pot **strânge** per companie, dacă firma vrea să
fie mai prudentă — niciodată lărgi peste lege.

Lista pleacă de la **șoferi și camioane**, nu de la fișiere. Diferența e toată: cine n-a fost
descărcat niciodată apare pe primul loc, roșu. Într-o listă făcută din fișiere, exact ăia lipseau —
adică tocmai cazul periculos.

**2. Fișierul se leagă de om și de mașină.** Când încarci, alegi șoferul din lista firmei și, dacă e
un fișier din memoria camionului, vehiculul. Numele citit din card rămâne doar ca reper. Fără
legătura asta, scadențarul n-ar avea de unde ști pe cine ai descărcat.

**3. Fișierele din memoria camionului** (altă formă decât cardul) sunt acum recunoscute și
înregistrate, cu seria de șasiu scoasă din ele. Atât cât trebuie pentru termenul de 90 de zile.
Activitatea din ele n-o citim încă și **o spunem pe ecran**, nu ne prefacem.

**4. Istoricul arată ce-ți LIPSEȘTE.** Deschizi un șofer și vezi toate descărcările lui, iar între
ele — dacă e cazul — „**14 zile pe care nu le poți dovedi: 29.06 → 12.07**". Legea cere să poți arăta
activitatea continuu; o zi fără descărcare e o zi pe care n-o poți justifica la control.

**Partea grea: cum am făcut asta corect fără un fișier real.**

N-avem un `.DDD` real — firma n-are șoferi profesioniști. Varianta veche ghicea, și scotea ore chiar
și când nu înțelesese nimic din fișier. Puteai vedea 47 de ore de condus care nu există niciunde.

Am scris-o pe dos: **fiecare pas se verifică singur**, iar dacă verificarea nu trece, fișierul e
marcat „necitit" și scrie de ce. Lanțul de blocuri trebuie să acopere fișierul cap-coadă. Inelul de
zile trebuie să se închidă — mergând înapoi din ziua cea mai nouă, trebuie să ajungi exact unde
scrie că e cea mai veche. Numele se ia de la poziția fixă din specificație, și doar dacă blocul are
exact lungimea de acolo. Orele nu apar niciodată dintr-un fișier neînțeles.

Iar ca să nu rămână doar pe cuvântul meu, proba **construiește** fișiere după specificație, cu
activități știute exact, și cere aplicației să le citească înapoi. Dacă orele care ies nu sunt fix
cele puse, proba cade. 81 de verificări pe citire, 25 pe ecran și rute.

**Ce NU dovedește asta:** dacă specificația a fost înțeleasă greșit, și constructorul, și cititorul o
înțeleg greșit la fel. Un `.DDD` adevărat rămâne de făcut, oricând apare unul.

**Trei greșeli reale, prinse de probe pe drum:**
- Un fișier necitit trecea drept descărcare valabilă — adică aplicația ar fi spus „ești în regulă" pe
  baza unui fișier pe care nu-l înțelege. Cel mai rău fel de greșeală: liniștitoare și falsă.
- Datele din baza de date vin ca obiecte, nu ca text. Scadențarul răspundea „null zile rămase" —
  fix întrebarea pentru care există secțiunea, fără răspuns, tăcut.
- Ruta „scadentar" era scrisă DUPĂ `/api/tacho/:id`, iar aceea o înghițea. Ar fi dat 404 fără nicio
  explicație.

- **Ce vede fondatorul:** poate spune unui client, în două secunde, pe cine trebuie să descarce și
  ce zile nu poate dovedi la un control.
- **Ce vede clientul:** același lucru, plus certitudinea că o cifră afișată vine dintr-un fișier chiar
  citit — nu dintr-o presupunere.

### FONDATOR · O probă care suna alarma degeaba

Robert a catalogat `io_1148` („Connectivity quality"), adică fix lucrul bun pe care ni-l dorim — iar
proba mea a picat, fiindcă avea scris de mână că `io_1148` e „un cod pe care nu-l cunoaștem". Acum
alege singură, la rulare, primul cod care chiar lipsește din catalog. O probă care se supără când
cineva face treabă bună e o probă stricată.

- **Ce vede fondatorul:** nimic în aplicație; doar că testele nu mai dau alarme false pe măsură ce
  catalogul crește.
- **Ce vede clientul:** nimic.

### AMÂNDOI · Aceeași greșeală de consum mai era într-un loc: „Consum azi"

Alin a întrebat *„deci e totul ok?"* — și bine a întrebat. Reparasem consumul **doar în rapoarte**.
Am căutat și în restul aplicației dacă mai socotește cineva combustibilul, și era: **„Consum azi"**
din fișa vehiculului (și din telefon) avea a doua copie a aceleiași greșeli.

Cât de rău: pe același drum simulat cu **27 de litri** consumați real, „Consum azi" arăta **72 L** la
un senzor obișnuit, **180 L** la unul mai zgomotos, iar la un senzor perfect curat arăta **0**. Și
acolo cifra depindea de cât de des transmite trackerul: 183 L la 10 secunde, 24 L la 5 minute.

Comentariul din cod explica chiar raționamentul care a dus la greșeală: *„mai robust decât
(start−final)+alimentări"*. Sună logic, dar e invers — adunarea scăderilor pare mai fină, în realitate
adună zgomotul senzorului, mereu în plus.

**Ce am schimbat.** Aceeași formulă ca în rapoarte, și **aceleași funcții**, nu o a treia copie:
`reports.js` le dă mai departe, iar serverul le folosește. Dacă se schimbă regula, se schimbă într-un
singur loc, pentru toate ecranele deodată.

Proba `verify_consum.js` acoperă acum și bucata din server — o ia din fișier și o rulează pe drumul cu
consum cunoscut. Pe codul vechi pică 6 verificări, pe cel nou trec toate 30. Am verificat și că
mașinile de tip „a treia cale" (rezumatul de traseu) foloseau deja formula corectă — acolo n-a fost
nimic de schimbat.

- **Ce vede fondatorul:** aceeași cifră în raport, în fișa mașinii și pe telefon. Până acum se puteau
  contrazice între ele.
- **Ce vede clientul:** „Consum azi" din fișa mașinii arată consumul real, nu unul de două-trei ori
  mai mare.

### AMÂNDOI · Raportul de consum arăta aproape dublu. Reparat.

Robert a scos un raport de consum pentru mașina lui: **52 de litri**. În realitate consumase **27**.
Aceeași cifră greșită apărea și în raportul de consum, și în cel analitic.

**De ce.** Consumul dintr-un senzor de nivel se calcula adunând **toate scăderile de nivel**. Sună
rezonabil, dar nivelul dintr-un rezervor nu scade lin: combustibilul se plimbă la viraje, pante,
frânări și accelerări, iar senzorul are și el zgomotul lui. Acul urcă și coboară tot timpul. Dacă
aduni doar coborârile, aduni și zgomotul — **de fiecare dată în plus, niciodată în minus**.

Partea care arată cel mai limpede că era greșit: **cifra depindea de cât de des transmite trackerul**.
Pe exact același drum, cu același consum real de 27 de litri:

| Trackerul transmite | Raportul zicea |
|---|---|
| la 10 secunde | **208 L** |
| la 30 secunde | 74 L |
| la 1 minut | 48 L |
| la 2 minute | 29 L |
| la 5 minute | 25 L |

Cât combustibil arde o mașină nu are nicio legătură cu cât de des raportează cutia GPS. Cifrele astea
nu vin dintr-un vehicul real — sunt dintr-o probă în care se știe exact cât s-a consumat, ca să se
vadă negru pe alb unde e greșeala.

**Ce am schimbat.** Consumul din senzor se calculează acum cum e firesc: **cât a scăzut nivelul între
început și sfârșit, plus cât s-a alimentat între timp**. Zgomotul se anulează singur, fiindcă la fel
de des urcă pe cât coboară. Capetele intervalului se iau ca mediană a primelor și ultimelor câteva
citiri, ca o singură citire nimerită prost să nu mute tot rezultatul. Aceeași formulă o folosea deja
graficul pe zile — doar totalul pe mașină nu.

**Încă două lucruri găsite cu aceeași ocazie:**

- **Mașinile cu contor CAN puteau raporta triplu.** Unele trackere trimit ba un contor de combustibil,
  ba altul, de la un pachet la altul — două contoare diferite, amândouă crescătoare. Aplicația sărea
  între ele, iar fiecare săritură se aduna ca „încă niște litri consumați": 79 în loc de 27. Acum ne
  legăm de un singur contor și mergem numai pe el.
- **Cele două rapoarte se contraziceau.** Raportul de consum avea o regulă în plus: alimentările erau
  luate în seamă doar dacă apăreau la mai puțin de o oră una de alta. O alimentare făcută peste noapte
  nu se număra, și lipsea apoi din calcul. Raportul analitic n-a avut niciodată regula asta. Acum
  amândouă socotesc la fel, iar proba automată cade dacă vreodată încep iar să difere.

**Ce rămâne de știut:** dacă cineva fură combustibil din rezervor, litrii aceia apar tot ca „consum"
în raport — nivelul a scăzut, iar raportul de consum asta măsoară. Pentru furt există alertele și
raportul de anomalii, care se uită la altceva (scăderi bruște cu motorul oprit). Era așa și înainte.

- **Ce vede fondatorul:** cifre în care se poate avea încredere când le arată unui client. Proba
  `verify_consum.js` rulează la fiecare `npm test` și verifică pe un consum cunoscut, nu pe „pare ok".
- **Ce vede clientul:** consumul real, nu unul umflat. Cine s-a uitat până acum la rapoartele astea a
  văzut cifre prea mari — merită spus, dacă a discutat cineva cu un client pe baza lor.

### AMÂNDOI · Tot ce s-a făcut la CAN, dus și în aplicația de telefon

Cererea lui Alin: *„toate modificările astea le vreau și pe APK."* Erau trei lucruri de dus, plus o
curățenie fără de care al treilea ar fi însemnat să scriu aceleași reguli a doua oară.

**1. Mesajul „mașina asta nu trimite semnalele de stare".** Telefonul avea aceeași tăcere ca web-ul.
Acum scrie același lucru, cu aceleași cuvinte.

**2. Fereastra „Ce trimite mașina"** — echivalentul lui „Ce înseamnă?" din web. Se deschide din
ecranul **Date CAN**, cu butonul din dreapta sus. Arată ce trimite mașina, ce înseamnă fiecare cod,
valoarea de acum, și marchează portocaliu ce trimite fără să știm noi ce e. Are și căutare, tot fără
diacritice.

**3. O regulă, un singur loc.** Cele ~300 de rânduri care spun *cum se scrie pe ecran o valoare de
IO* (că tensiunea vine în milivolți și se împarte la o mie, că timpul de funcționare se scrie
„12h 30m") stăteau înăuntrul paginii web. Ca să apară aceleași valori și pe telefon aveam două
variante: să le copiez în aplicația de telefon — adică două liste care în șase luni ar fi zis lucruri
diferite — sau să le scot într-un loc al lor. Le-am scos, în `io_format.js`. Acum le folosesc toate
trei: pagina web, serverul, și telefonul (prin server, fără copie proprie).

Mutarea asta se poate strica tăcut, așa că are o probă care compară versiunea **de dinainte**, luată
din istoricul git, cu cea de acum: **12.750 de perechi cod/valoare**, toate identice. Am probat și că
proba chiar pică — am schimbat „RPM" în „rpm" într-un singur loc și a căzut imediat.

**Ce s-a mai reparat pe drum.** Proba nouă a rutei raporta „6 verificări trecute" fără să verifice
nimic din ce contează: ruta de injectare tăia literele din IMEI-ul de probă („TEST222" devenea „222"),
lista venea goală, iar proba sărea liniștită peste partea importantă. Acum, dacă injectarea nu merge,
proba **cade**. Un test care trece degeaba e mai rău decât niciun test.

- **Ce vede fondatorul:** aceeași fișă „ce dă mașina asta" în telefon ca pe calculator, inclusiv
  codurile necatalogate, pe care le poate denumi apoi din Administrare.
- **Ce vede clientul:** la fel — fereastra e deschisă oricui, ca pe web.

### AMÂNDOI · „Ce înseamnă?" răspunde acum despre MAȘINA deschisă, nu în general

Întrebarea lui Alin, 22.08: *„așa arată acum la toate mașinile, ideea e că unde nu am cum arăta? sau
cum le interpretez?"*

Avea dreptate. Fereastra era un **dicționar**: 253 de coduri, exact aceleași pe orice mașină. Îți
spunea ce înseamnă `io_100` în general, dar nu-ți spunea nimic despre mașina din fața ta — nici ce
trimite, nici ce valoare are acum, nici ce trimite fără să știm noi ce e.

**Acum e o fișă a mașinii.** Se deschide bifat pe „Doar ce trimite <mașina>", iar fiecare cod are
valoarea de acum lângă el. Se debifează dacă vrei tot catalogul. Pe mașina din exemplu: din 253 de
coduri, **9 semnale** — atât dă ea.

Trei lucruri care ieșeau strâmb și s-au reparat pe drum:

- **Codurile fără nume se văd.** Mașina trimitea `io_1148` și nu apărea nicăieri, fiindcă lista se
  construia doar din catalog — exact codul despre care ai fi vrut să afli ceva lipsea cu totul. Acum
  apare, marcat portocaliu „Necatalogat", cu îndemnul să-l denumești din Administrare → Catalog IO.
- **Același semnal nu mai apare de trei ori.** `io_35`, `io_85` și `io_88` sunt toate turația —
  aplicația le aduce sub același nume intern. Afișate toate, păreau trei senzori diferiți. Mai rău:
  `io_84` se cheamă în catalog „Nivel combustibil (%)" dar primește litrii, deci scria „51.1 L" sub o
  etichetă cu procente. Acum se păstrează un singur rând (codul cel mai mic, care spune adevărul
  despre unitate), iar celelalte coduri sunt notate lângă el: „același semnal ca io_85, io_88".
- **Căutarea nu ținea cont de diacritice.** Scriai „turatie" și nu găsea „Turație". La căutarea de
  vehicule regula asta există de mult; aici nu ajunsese.

- **Ce vede fondatorul:** poate răspunde pe loc la „ce dă mașina asta și ce înseamnă", fără să
  cerceteze prin liste — inclusiv ce trimite și n-am catalogat încă.
- **Ce vede clientul:** același lucru; fereastra e deschisă oricui, nu doar nouă.

### AMÂNDOI · Două lucruri care păreau stricate, dar tăceau

Alin a deschis o mașină și n-a văzut plăcuțele. Am verificat, și erau două probleme diferite —
niciuna nu dădea vreo eroare, amândouă lăsau ecranul gol.

**1. „Mașina asta nu trimite semnalele de stare" — acum scrie, nu mai tace.** Vehiculul are adaptor
CAN și trimite cifre (turație, combustibil, kilometraj), dar nu și cele două semnale de stare din
care ies ușile, luminile și martorii de bord. Nu toate adaptoarele le citesc, depinde de model și de
mașină. Până acum, în cazul ăsta secțiunea pur și simplu **lipsea** — și arăta ca și cum aplicația
n-ar merge. Acum scrie negru pe alb ce se întâmplă și de ce nu ține de noi. Pe o mașină fără CAN
deloc nu apare nimic, ca înainte — n-are rost să-i spunem asta cuiva cu GPS simplu.

**2. Fereastra „Ce înseamnă?" era goală pentru toată lumea.** Butonul de lângă „IO Live" care explică
codurile Teltonika scria „Niciun IO găsit". Motivul: lista se cerea de la server **în timp ce ecranul
de autentificare era încă pe ecran**, serverul răspundea „nu ești autentificat", eroarea era înghițită
în tăcere, și lista rămânea goală până la o reîncărcare a paginii. Adică pentru oricine se autentifica
normal, fereastra n-a funcționat niciodată. Acum se încarcă la autentificare și se mai încearcă o dată
la deschiderea ferestrei; dacă tot nu merge, o spune, nu se preface că lista e goală.

Efect lăturalnic al aceleiași reparații: numele senzorilor. Fără catalog, un semnal nemapat apărea ca
„Io 1148" în loc de denumirea lui adevărată — și asta se vedea în fișa oricărui vehicul.

- **Ce vede fondatorul:** la fel ca clientul, plus catalogul IO care chiar se deschide când e nevoie
  de el la maparea senzorilor.
- **Ce vede clientul:** nu mai rămâne cu un ecran gol fără explicație, nici la CAN, nici la „Ce
  înseamnă?".

### AMÂNDOI · Panoul CAN arată acum toate semnalele din mașină, cu iconițe

**Cererea lui Alin, 22.08 (cu fișa adaptorului Teltonika pentru VW Passat B7 în mână):** *„Vreau să
se afișeze în CAN toate iconițele din imagine și să mapezi toate IO-urile lipsă. Și în modalul CAN
pe mobil."*

**Ce era înainte.** Adaptorul CAN trimite, pe lângă cifre (turație, kilometraj, combustibil), un
teanc de semnale de tip *pornit / oprit*: uși, capotă, portbagaj, lumini, frâne, cutie de viteze,
alarmă și martorii de pe bord (CHECK ENGINE, ABS, airbag, ulei, presiune în anvelope…). Le
descifram corect încă de mult, dar le arătam ca rânduri de text, iar **unsprezece dintre ele nu erau
trecute în nicio grupă**, așa că nimereau în „Date tehnice avansate" — un sertar care se deschide
**numai pentru super-admin**. Pe scurt: clientul plătea adaptorul și nu vedea jumătate din ce
trimite. În telefon era mai rău: apăreau doar ca text brut, „security_flags.door_front_left", și tot
numai pentru super-admin.

**Ce am făcut.**

1. **Fiecare semnal are acum un nume pe românește și un desen.** 68 de semnale, împărțite în zece
   grupe: contact și motor, frâne și transmisie, uși și capace, închidere și alarmă, lumini, martori
   de bord, confort și siguranță, camion, electric, starea adaptorului. Se văd ca **plăcuțe** —
   iconiță, nume, starea dedesubt.
2. **Culoarea spune singură cât e de grav.** Roșu = martor aprins pe bord. Portocaliu = ceva e
   deschis (ușă, capotă, portbagaj). Verde = e pornit și e în regulă (contact, lumini, aer
   condiționat). Alb = doar o stare, nici bună nici rea (marșarier, cutia în D).
3. **Sus, un rând care spune ce anume e în neregulă — nu câte.** Scrie „Martori aprinși: CHECK
   ENGINE, Presiune / nivel ulei" și „Deschis: Ușă față stânga, Capotă", nu „2 probleme". Când nu e
   nimic: „Niciun martor aprins, totul închis". Aceeași regulă ca la alertele de acte, unde „1
   mașină are acte expirate" nu ajuta pe nimeni.
4. **Grupele se pot strânge**, iar pe capul fiecăreia stă o bulină cu câte semnale sunt aprinse
   acolo, colorată după cel mai serios dintre ele. Sunt deschise toate de la început — s-a cerut să
   se **vadă** tot, plierea e ca să-și strângă omul singur ce nu-l interesează.
5. **Aceleași plăcuțe în aplicația de telefon.** Am desenat 36 de iconițe noi pentru ea (telefonul
   nu folosește Font Awesome, are desenele lui, ca să meargă și fără internet).
6. **Am mapat IO-urile care lipseau.** Cei nouă parametri generali de pe fișa adaptorului
   — turație, temperatura motorului, viteză, kilometraj total, kilometraj contorizat, combustibil în
   rezervor, combustibil consumat, timp de funcționare a motorului, seria de șasiu (VIN) — erau
   descifrați, dar **ascunși clientului**, tratați ca „date brute". Sunt exact datele pentru care se
   pune adaptorul pe mașină. Acum se văd, împreună cu cele de camion (priza de putere, uleiul,
   lichidul de răcire) și cu numărul de erori de pe bord.
7. **Un singur loc unde scriu numele.** Toate denumirile și iconițele stau în `can_flags.js`;
   pagina web și telefonul le citesc de acolo. Nu mai există două liste care să o ia razna una față
   de cealaltă. Proba automată `verify_can_flags.js` rulează la fiecare `npm test` și cade dacă un
   semnal rămâne fără nume sau dacă apare din greșeală în două locuri.

**Cinci semnale rămân stinse, marcate „necitit".** Fișa adaptorului le listează — ambreiaj,
închidere centralizată, și cele trei apăsări de telecomandă (deschide / închide / armare din trei
apăsări) — dar noi nu știm **unde** anume le pune aparatul în mesaj. Nu le-am ghicit poziția: un
martor aprins greșit e mai rău decât unul care lipsește. Se văd cu ramă punctată și scrie „necitit",
ca să nu fie confundate cu „e în regulă". Ce ne trebuie ca să le pornim: fie foaia de biți de la
Teltonika pentru adaptorul ăsta, fie o mașină pe care să le încercăm pe rând.

**Unde se văd.**
- **Pe calculator:** dai clic pe o mașină (pe hartă sau în lista din stânga) → se deschide fișa din
  dreapta, pe „Info" → derulezi până la **IO Live**. Acolo sunt.
- **Pe telefon:** deschizi mașina → butonul **„Date CAN"** → sub cifrele de sus.

**Ce era să scap.** Prima oară pusesem plăcuțele, în telefon, într-o fereastră pe care **n-o deschide
nimic** — un rest de cod vechi. Se compila, probele treceau, și pe telefon nu s-ar fi văzut nimic.
Le-am mutat pe ecranul unde duce butonul „Date CAN" și am adăugat o probă care verifică tocmai asta:
că ecranul la care ajunge omul chiar le desenează, nu doar că există componenta.

- **Ce vede fondatorul:** aceleași plăcuțe ca și clientul. În plus, lista brută de sub ele (pentru
  maparea senzorilor) **nu mai repetă** cele ~60 de semnale descifrate — rămâne doar ce chiar e brut
  și are nevoie de mapare. Înainte le vedeai de două ori, a doua oară cu nume tehnice de nemapat.
- **Ce vede clientul:** deschide o mașină → fila CAN și vede pe loc dacă are o ușă deschisă sau un
  martor aprins pe bord, cu numele lui, nu cu un cod. La fel pe telefon. Plus turația, temperatura
  motorului, viteza de pe bord și VIN-ul, care înainte erau ascunse.

---

## 2026-08-26

### AMÂNDOI · Toate IO-urile Teltonika sunt mapate + bordul mașinii pe telefon — `f077919`

**De ce.** Passat-ul B7 (B112RFG) are FMC130 cu adaptor ALL-CAN300 — trimite zeci de semnale
(uși, lumini, frână de mână, martori de bord). Noi mapam ~150 din cele **640** de semnale din
lista oficială Teltonika; restul apăreau ca numere fără nume („io_517") sau deloc. În plus,
stegulețele „P4" — protocolul nou prin care mașinile moderne trimit ușile, luminile și martorii —
**nu se decodau deloc**.

**1. Lista completă, generată din documentația oficială — nu scrisă de mână.** Am descărcat specul
oficial Teltonika (640 de parametri), l-am transformat în fișier de date și am scris un generator
care produce harta de nume. De ce așa: o listă scrisă de mână la scara asta SE VA desincroniza —
s-a și întâmplat: 7 ID-uri fuseseră „ghicite" demult și afișau date greșite (le-am corectat, cu
documentație). Un test în CI garantează de-acum două lucruri: **orice ID oficial primește nume** și
**niciun nume existent nu se mai schimbă vreodată** (datele stocate depind de ele).

**2. Stegulețele P4, decodate bit cu bit.** Uși, frână de mână, ambreiaj, treaptă (P/R/N/D),
lumini, centuri, toți martorii de bord (check engine, presiune ulei, AdBlue…) — din tabelele
oficiale de biți, cu test bit-cu-bit în CI. Unde starea există și în protocolul vechi (P2), numele
e ACELAȘI — categoriile din aplicație merg pentru amândouă fără nicio schimbare.

**3. O eroare reală de precizie, găsită pe drum.** Valorile pe 8 octeți (exact stegulețele P4) se
citeau într-un tip numeric care **pierde biții de jos** la valori mari — chiar valoarea văzută pe
Passat în Configurator depășea pragul: o ușă deschisă putea pur și simplu să dispară din date.
Reparat + test cu valoarea reală a Passat-ului.

**4. Pe telefon: cardul „Stări vehicul"** (cerut de Robert) — în ecranul de date CAN, un cartonaș
cu **pictograme de bord**: mașină încuiată, fiecare ușă, frână de mână, faruri, centuri, tempomat,
AC, treapta P/R/N/D. Gri = inactiv, colorat = activ. **Atingi pictograma → un balon** îți spune ce
e și în ce stare e acum. Avertizările (check engine, presiune ulei, baterie…) apar **doar când sunt
aprinse** — un perete de martori gri ar îngropa exact semnalul care contează.

**5. Etichete românești pentru tot.** Catalogul de IO-uri (editorul „Mapează" + consola de
diagnoză) acoperă acum toate cele 640 de ID-uri, cu 14 etichete vechi corectate pe spec.

- **Ce vede fondatorul:** în fișa vehiculului, categoriile noi (Accelerometru, Dallas, OBD, BLE) +
  semnalele care înainte erau numere fără nume.
- **Ce vede clientul:** pe telefon, bordul mașinii cu pictograme; pe web, uși/lumini/martori
  decodate la mașinile cu ALL-CAN300 — adică exact ce va transmite Passat-ul când pornește SIM-ul.

Verificat cap-coadă pe sandbox: pachet TCP real cu stegulețe P4 → uși/frână/contact decodate
corect în API, accelerometrul negativ corect, valoarea pe 8 octeți fără nicio pierdere de biți.
APK reconstruit.

**Completare, după împăcarea cu lucrul din sesiunea paralelă:** panoul de plăcuțe CAN (web + telefon)
există deja, cu sursa unică `can_flags.js` — acolo au intrat cele **45 de plăcuțe noi P4** (ambreiaj,
telecomandă, CNG, diferențiale, martori hidraulici/remorcă…), fiecare cu explicația ei. Lista
„necitite" a scăzut de la 5 la 1: ambreiajul și telecomanda, anticipate acolo ca necunoscute, au
acum biți oficiali și se aprind. **Balonul cerut e pe telefon:** atingi orice plăcuță → balon cu ce
înseamnă și starea curentă; pe web, același text apare la ținerea mouse-ului. Un test nou în CI ține
catalogul și decodoarele lipite: fiecare plăcuță are decodor, fiecare steag decodat are plăcuță,
fiecare plăcuță are explicație.

## 2026-08-20

### AMÂNDOI · „Card combustibil" a fost scos din Management

**Decizia lui Alin, 21.08:** *„până la urmă situația alimentărilor rămâne gestionată de altcineva,
nu de noi. Șterge card combustibil din management."*

Motivele, așa cum le-a spus: oricum trebuie să intri de fiecare dată să încarci fișierul de la
furnizor; sunt mașini fără card alocat; iar dacă cu un card alimentează două mașini, comparația nu
mai are cum să iasă. Nu merita complicația.

**Ce am șters:** intrarea din meniu, ecranul cu tot ce ținea de el, rutele de pe server (import,
previzualizare, verificare, ștergere), funcțiile din baza de date și ecranul din aplicația de
telefon. Aproximativ 530 de rânduri.

**Ce am PĂSTRAT, fiindcă nu ține de carduri:**
- **Consum combustibil** (Analize) — se calculează din GPS și CAN, n-are treabă cu decontul
- **Preț combustibil** — media națională și evoluția ei
- **Alertele de scădere bruscă a nivelului** (furt din rezervor) — merg direct din senzor, fără card
- **Tabela cu alimentările importate până acum** — rămâne, ca arhivă. Ștergerea datelor e o decizie
  separată, nu efectul scoaterii unui ecran. Dacă o vreți curățată, se face la cerere.

**Fondatorul vede:** un meniu Management mai scurt cu o poziție.

**Clientul vede:** la fel — nu mai are „Card combustibil".

---


### AMÂNDOI · Combustibilul, văzut din două unghiuri — și omul se uită doar unde nu se potrivesc

**Ce a cerut Alin:** *„cardul X al mașinii Y indică 100 de litri luna asta, cu 1000 de lei; CAN-ul
și sonda indică 100 de litri intrați. Practic vedem intrările de carburant din două unghiuri și nu
mai pui om să verifice decât unde e dubios."*

Comparația exista deja — dar ecranul arăta doar **diferența**, nu cele două cifre din care iese ea.
Acum, în capul fiecărei mașini:

> **TM 07 RAT**
> 💳 card **580 L** · 4.060 lei → ⛽ în rezervor **210 L**   |   *lipsesc 370 L · 2.590 lei*

Trei verdicte, atât:

| | |
|---|---|
| cifrele se potrivesc | **se potrivesc** (verde) |
| nu se potrivesc | **lipsesc X L · Y lei** (roșu) |
| mașina nu are senzor | **nu se poate verifica** |

**Și, mai important: ecranul ascunde ce e în regulă.** Implicit vezi doar mașinile la care cele două
unghiuri nu se potrivesc, cu un rând care spune ce a ascuns și de ce: *„Arăt doar mașinile la care
cifrele nu se potrivesc — 1 iese la socoteală, 1 nu se poate verifica."* Un buton le aduce înapoi pe
toate.

Ăsta e tot rostul: la 30 de mașini, nu te uiți la 30 — te uiți la două.

**Fondatorul vede:** o funcție care se explică într-o propoziție la demo.

**Clientul vede:** exact mașinile care-i mănâncă bani, fără să citească nimic altceva.

> Verificat pe cod real, 45 de controale.

---


### AMÂNDOI · Card combustibil: îți spune cât lipsește și de la ce mașină

**Ritualul, așa cum l-a descris Alin:** clientul lucrează cu DKV, toată flota alimentează cu
cardurile lor, la început de lună exportă alimentările și vrea să le pună față în față cu ce a
intrat REAL în rezervoare. Aplicația făcea comparația — dar nu-i dădea niciodată concluzia.

**Acum, sus, trei cifre:**

> **Plătit pe card** 740 L · 5.205 lei  |  **A intrat în rezervoare** 323 L  |  **Lipsă** 372 L · 2.604 lei

Iar sub „a intrat" scrie *din câți litri s-a putut verifica* și *câte mașini din câte* — altfel „0
lipsă" putea să însemne, de fapt, „n-am avut cu ce verifica". Mașinile fără senzor sunt numite
separat, într-un rând galben.

**Lista e pe MAȘINĂ, nu pe dată.** Prima e cea de la care pierzi cel mai mult: *TM 07 RAT — lipsă
370 L · 2.590 lei*. O deschizi și vezi alimentările ei. Cele curate rămân închise.

**Cuvintele s-au schimbat.** „Reconciliere", „suspect", „fără CAN" sunt limbaj de contabil:

| Se scria | Se scrie |
|---|---|
| Reconciliază toate | **Verifică din nou** |
| reconciliat | **a intrat tot** |
| parțial | **a intrat parțial** |
| suspect | **NU a intrat** |
| fără CAN | **nu se poate verifica** |

**Importul, altfel.** Înainte lipeai textul CSV într-o casetă. Acum **încarci fișierul**, iar
aplicația îți spune ce urmează să se întâmple, ÎNAINTE:

> Am citit 264 de rânduri · 01.07 – 31.07
> • **251** alimentări noi — 12.480 L, 87.360 lei
> • **12** le ai deja — se sar, nu se dublează
> • **1** fără mașină găsită după număr

Până acum, același fișier dat de două ori **dubla tot decontul**, în tăcere. Iar verificarea se face
automat la import — nu mai trebuie apăsat al doilea buton.

**Un litru nu mai e furt.** La o alimentare de 60 de litri, o diferență de un litru e clătinatul
combustibilului în rezervor. Aplicația trata orice diferență ca abatere și deschidea mașina ca pe un
caz grav. Acum numai alimentările pe care verificarea le-a marcat ca neintrate (sau intrate pe
jumătate) sortează lista și aprind roșu.

**Fondatorul vede:** o funcție care se vinde singură la demo — „uite, aici ai 2.600 de lei".

**Clientul vede:** unde pierde bani, pe ce mașină, în cât timp îi ia să deschidă ecranul.

> Verificat pe cod real, 34 de controale — inclusiv cele trei cifre de sus, socotite pe o lună de
> probă, și faptul că un litru diferență nu mai e strigat ca abatere.

---


### AMÂNDOI · Documente: fără total, avertisment pe mașină, iar actul completează fișa

**1. Totalul de sus a dispărut.** Scria „8 acte" — o cifră care nu spunea nimic: nu e o listă de
făcut, e inventarul. Ocupa un loc degeaba.

**2. Avertismentul spune ACUM care mașină și ce anume.** Înainte:
*„1 mașină are acte expirate. 1 mașină n-are un act obligatoriu."* — și te puneai să cauți prin
listă care sunt. Acum:

> ⚠ **B 268 ROY** ITP expirat · Rovinietă expiră curând
> **TM 07 RAT** nu are RCA, Licență transport, Tahograf

Mașinile cu probleme grave (act expirat sau act obligatoriu lipsă) stau primele. Peste 6 mașini,
lista se taie și scrie „și încă N mai jos" — altfel avertismentul devine a doua listă.

**3. Actul încărcat completează și fișa mașinii — fără muncă manuală.**

Robert făcuse citirea din talon și din polițe: marca, model, VIN, cilindree, putere, masă, locuri,
an, combustibil. Dar mergea **doar** dacă aveai deschisă fișa vehiculului, fiindcă scria direct în
câmpurile ei. Din ecranul Documente, câmpurile alea nu există — deci tot ce se citea despre mașină
se pierdea, iar omul le tasta pe toate cu mâna.

Acum, când încarci actul din Documente, ce ține de mașină **se salvează direct pe ea**, iar mesajul
spune ce s-a întâmplat: *„Act salvat · am completat și fișa mașinii (6 câmpuri)"*.

Două lucruri de care am avut grijă:
- **Nu se rescrie ce mașina are deja.** Bifa „deja completat" se uita doar la câmpul din pagină;
  cu fișa închisă nu exista niciun câmp, deci aplicația ar fi propus vesel să înlocuiască date bune.
  Acum se uită și în fișa salvată.
- **Restul fișei rămâne neatins**: ruta de detalii scrie doar coloanele trimise.

**Fondatorul vede:** la fel ca clientul.

**Clientul vede:** încarcă poza talonului și îi apar completate și actul, și datele mașinii.

> Verificat pe cod real, 97 de controale. Încă o greșeală a probei, găsită acum: funcția care taie
> grupa unei mașini lua bucata de DINAINTEA primei grupe — iar acolo stă acum avertismentul, care
> conține chiar numerele mașinilor. Verificările păreau că trec pe conținut gol.

---


### AMÂNDOI · Documentele, simplu: fiecare mașină cu actele ei, fiecare act cu „Încarcă"

**Ce am greșit.** Făcusem un buton „Scanează act" în capul listei și încă unul pe rândul mașinii,
plus rânduri de două feluri și patru butoane diferite. Alin: *„nu înțeleg de ce deschide manual…
e simplu ce îți cer: fiecare mașină are actele ei, fiecare act are buton de încărcare. «Scanează»
e greșit. Ne complicăm atât?"* Avea dreptate pe toate.

**Cum e acum.** Deschizi o mașină și vezi **lista ei de acte** — aceleași, în aceeași ordine, de
fiecare dată. Fiecare rând are o singură acțiune limpede:

| Rândul | Ce poți face |
|---|---|
| act **neîncărcat** | **Încarcă** |
| act **încărcat** | 👁 Vezi · ✎ Editează · **Nou** (când îl reînnoiești) · 🗑 |

Atât. **Butoanele generale de sus au dispărut** — nu mai are cine să întrebe „care mașină?", fiindcă
răspunsul e chiar rândul pe care apeși. La fel și în fișa vehiculului: aceleași rânduri, aceleași
butoane.

**Cuvântul „Scanează" a dispărut.** Omul încarcă un act, nu scanează ceva. Citirea automată se
întâmplă tot, dar e ce face aplicația după ce primește fișierul — nu numele butonului.

**De ce se deschidea formularul gol.** Butonul deschidea întâi fereastra și abia apoi cerea fișierul,
printr-un clic pornit din cod, la 120 de milisecunde. Browserele ignoră un asemenea clic — nu vine
din gestul omului. Rămâneai cu formularul în față. Acum „Încarcă" deschide **direct** selectorul de
fișier, iar fereastra se deschide după, deja completată din act.

**Ordinea actelor nu se mai schimbă.** Lista vine din „Acte cerute": înveți unde e ITP-ul și rămâne
acolo. Urgența o spune culoarea, nu poziția.

**Fondatorul vede:** un ecran pe care nu mai are ce explica.

**Clientul vede:** mașina lui, actele ei, un buton pe fiecare.

> Verificat pe cod real, 87 de controale. Două greșeli ale PROBEI, găsite pe drum: tăia grupa
> mașinii la `class="mnt-g`, care prinde și `mnt-gp`/`mnt-gn` — deci verifica o bucată goală și
> trecea degeaba; iar extragerea funcțiilor înghițea funcțiile vecine.

---


### AMÂNDOI · Scanarea știe singură pentru ce mașină e actul

**Ce nu mergea.** Butonul „Scanează act" din capul listei deschidea o fereastră goală: prima
întrebare era *„care mașină?"*. Alin: *„nu cumva logica bună era ca scanarea să fie în dreptul
mașinilor, să știe unde se atribuie? Adică să lucrăm inteligent."* Avea dreptate.

**Acum sunt trei căi, de la cea mai scurtă la cea mai lungă:**

1. **Pe rândul actului care lipsește** — aplicația știe ȘI mașina, ȘI tipul. Butonul zice
   **„Scanează"**: pui poza și gata. Alături, un „＋" pentru completare manuală.
2. **Pe rândul mașinii** — două butoane mici: scanează / adaugă. Nu mai trebuie s-o alegi.
3. **Din capul listei** — rămâne, dar acum **recunoaște mașina din act**.

**Recunoașterea.** Actul are numărul de înmatriculare scris pe el, iar scanarea îl citea deja —
doar că nu-l folosea la nimic. Acum:

| Situația | Ce face |
|---|---|
| n-ai ales nicio mașină | o alege singură: *„Actul e pentru **B 268 ROY** — am ales-o eu, după numărul de pe act."* |
| ai ales-o și se potrivește | confirmă scurt |
| **actul e al ALTEI mașini** | avertisment portocaliu + buton „Pune-l pe TM 07 RAT". **Nu schimbă tăcut** — altfel ai lipi RCA-ul pe mașina greșită |
| numărul nu e în flotă | o spune: *„nu găsesc mașina asta în flotă"*. Nu ghicește. |

Numerele se compară fără spații și cratime: „B 268 ROY", „B-268-ROY" și „b268roy" sunt aceeași mașină.

**Fondatorul vede:** o funcție care se explică singură la demo.

**Clientul vede:** pune poza actului și restul se completează, inclusiv mașina.

> Verificat pe cod real, 83 de controale — inclusiv cele patru situații de mai sus, cu flotă de probă.
> Prima așezare a butoanelor de pe rândul mașinii era legată de containerul `#atab-documente`, deci
> nu se aplica nicăieri altundeva și butoanele cădeau pe al doilea rând; regula e acum pe o clasă a
> rândului. Găsit randând, nu citind.

---


### AMÂNDOI · Documentele arată ca Mentenanța și, în sfârșit, spun ce LIPSEȘTE

**Aspectul.** Ecranul Documente rămăsese cel vechi: rânduri gri, fără iconiță pe tip, formularul
înghesuit jos sub listă, toate mașinile deschise, fără căutare. Acum are exact înfățișarea de la
Mentenanță — dar logica actelor, care e alta.

**Trei file, pe mașină:**

| Filă | Ce vezi când deschizi o mașină |
|---|---|
| **Valabile** | actele ei, cel mai urgent sus, **plus ce-i lipsește** |
| **Istoric** | actele înlocuite, cu ce au costat |
| **Acte cerute** | ce acte trebuie să aibă fiecare fel de mașină |

**Cel mai important: ecranul nu mai tace când un act LIPSEȘTE.** Până acum, o mașină fără RCA
introdus deloc arăta identic cu una în regulă — aplicația n-avea de unde ști ce ar fi trebuit să
existe. Acum știe, din fila „Acte cerute":

- **obligatoriu** → dacă lipsește, apare un rând roșu punctat: *„RCA — obligatoriu, dar nu e
  introdus"*, cu buton „Adaugă" care deschide fereastra completată
- **opțional** → apare gri, ca reper, fără să te bată la cap
- **nu se cere** → nu apare deloc

Implicit: ITP, RCA și rovinieta la toate; licență de transport și tahograf doar la camioane; CASCO
și asigurarea de marfă **opționale** (așa a hotărât Alin). Fiecare companie își poate schimba lista.

**Butoanele sunt altele decât la lucrări**, fiindcă un act nu se „face", ci se **reînnoiește**:

| Mentenanță | Documente |
|---|---|
| ✓ „am făcut-o" | 🔄 **Reînnoiește** — pui actul nou, cel vechi trece în istoric |
| — | 👁 **Vezi actul scanat** — apare acum și în Management, nu doar în fișa mașinii |
| ✎ modifică | ✎ **corectează** (fără să pierzi scanul) |

**Reînnoirea întreabă înainte:** *„B 268 ROY are deja un act «RCA», valabil până 12.03.2027. Îl trimit
în istoric și pun actul nou în locul lui?"* Înainte se întâmpla tăcut.

**Scanarea a ieșit din ascunzătoare.** Cea mai bună funcție de aici — încarci poza actului și se
completează singur — trăia doar în fila Documente a fișei vehiculului. Acum e în fereastra comună,
deci există un buton „Scanează act" și în ecranul principal.

**Un singur formular pentru amândouă locurile.** Erau două, cu aceleași câmpuri: unul știa să
scaneze, celălalt nu; unul putea modifica, celălalt doar șterge. Acum e o singură fereastră.

**Corectate pe drum:** costul unui act fără dată de emitere intra în „Total" dar nu și în „Luna"/„Anul"
— trei cifre care nu se adunau; acum, când lipsește data emiterii, se ia ziua în care actul a fost
introdus. Iar butonul „Adaugă" de pe rândul lipsă rămânea strivit într-un pătrat de 32 de pixeli,
croit pentru iconițe, și textul curgea din el.

**Fondatorul vede:** la fel ca clientul.

**Clientul vede:** un ecran care-i spune nu doar ce expiră, ci și **ce n-a introdus niciodată**.

> Verificat pe cod real, 65 de controale. Butonul strivit a fost găsit măsurându-l în browser, nu
> privind poza — prima bănuială (că iese din card) era greșită.

---


### AMÂNDOI · Filele Mentenanței se numesc acum „De făcut" și „Făcute"

**De ce.** Alin, uitându-se la ecran: *„istoric — este ceea ce a făcut. În agendă sunt cele
viitoare? Sau cum? Că mă duce în eroare."*

Avea dreptate. „Agendă" sună a calendar de VIITOR, dar acolo stăteau și restanțele de acum trei
luni. Împărțirea reală nu e trecut/viitor, ci **nefăcut / făcut**:

| Se numea | Se numește | Ce e înăuntru |
|---|---|---|
| Agendă | **De făcut** | tot ce nu s-a făcut: și restanțele, și ce urmează |
| Istoric | **Făcute** | ce s-a terminat, cu data și cât a costat |

**Și un singur cuvânt peste tot.** Ecranul folosea când „efectuat", când „făcut" — două cuvinte
pentru același lucru, în aceeași listă. Acum e „făcută" peste tot: eticheta de pe rând, butonul cu
bifă („Bifează: am făcut-o"), mesajele de confirmare.

**Fondatorul vede:** la fel ca clientul.

**Clientul vede:** două file al căror nume spune exact ce e în ele.

---


### AMÂNDOI · Mentenanța, pe mașini: fiecare are agenda ei și istoricul ei

**Ce s-a schimbat.** Erau trei file — Agendă (o listă lungă pe toată flota), Pe vehicul, Istoric.
Alin a cerut altceva, mai simplu: *„orice mașină are agendă și istoric. Când intri pe agendă ai
mașinile; deschizi una, îi vezi agenda. La istoric la fel."*

Acum sunt două file, amândouă liste de **mașini**:

| | Ce vezi când deschizi o mașină |
|---|---|
| **Agendă** | ce are ea de făcut, cel mai urgent sus |
| **Istoric** | ce s-a făcut la ea, cu data și cât a costat |

Fila „Pe vehicul" a dispărut — Agenda E pe vehicul.

**Mașinile stau în ordinea în care te doare.** În Agendă, cele cu lucrări restante sunt primele și
se deschid singure. În Istoric, prima e mașina la care s-a lucrat cel mai recent. Alfabetic ar fi
fost predictibil, dar ar fi împrăștiat urgențele oriunde prin listă.

**Un rând sus, scris în cuvinte:** *„2 mașini au lucrări restante. Încă una se apropie de scadență."*
Sau, dacă e curat, *„Toate mașinile sunt la zi."* Ca să afli asta trebuia altfel să te uiți la
fiecare etichetă în parte.

**Fondatorul vede:** la fel ca clientul.

**Clientul vede:** un ecran care începe cu mașina care are probleme, nu cu o listă de lucrări.

---

### AMÂNDOI · Propunerea de scadență, explicată ca unui om

**Ce era.** Un singur rând: „Propunere pentru autoturism: la 76.941 km (peste 40.000) sau pe
21.08.2031." Corect, dar nu spunea nici de unde vin cifrele, nici că se aprinde la **prima** dintre
ele. Iar iconița era o baghetă magică — sugera că e AI, ceea ce nu e.

**Ce e acum**, în patru bucăți:

1. **Cine propune:** „RA TRACKS PROPUNE", cu o cheie fixă. Nu e AI, e un tabel din aplicație.
2. **Regula:** „La un autoturism, «Anvelope» se face la fiecare **40.000 km** sau la **5 ani** —
   care vine prima." Lunile se scriu omenește: 60 de luni = *5 ani*, 12 = *un an*.
3. **Socoteala pe mașina ta:** „B 154 UIP are acum 36.941 km, deci: la 76.941 km · pe 21.08.2031.
   Te anunțăm la **prima** dintre ele."
4. **De unde le schimbi:** „Poți scrie tu alte cifre mai jos. Cifrele noastre se schimbă din fila
   **Intervale**" — cu buton care te duce acolo.

Dacă mașina nu-și raportează kilometrajul, o spune pe față: „mașina nu-și raportează kilometrajul,
așa că scrie tu de la ce cifră pornim". Nu inventează o cifră.

**Fondatorul vede:** o casetă pe care o poate arăta unui client fără să mai explice nimic pe lângă.

**Clientul vede:** de ce i se propune cifra aia și ce poate face dacă nu-i convine.

> Verificat pe cod real, 64 de controale.

---


### AMÂNDOI · Aplicatia propune singura la cat se face lucrarea, iar fereastra nu mai are doua intelesuri

**Ce te incurca.** Fereastra de mentenanta facea DOUA treburi cu aceleasi campuri: „programez un
schimb de ulei" si „notez unul facut ieri". Campul „La data" insemna altceva in fiecare caz, dar
scria la fel. De-acolo venea amestecul „de efectuat / efectuat".

**Acum alegi de la inceput,** din doua butoane mari:

- **O programez** → *Cand trebuie facuta*: data si/sau kilometrajul.
- **Am facut-o deja** → *Cand am facut-o*: data (pusa pe azi) si kilometrajul (cel citit acum din
  masina). Eticheta costului devine „Cat a costat", iar butonul „Salveaza in istoric".

Fiecare camp spune exact ce inseamna. Nu mai exista un camp cu doua intelesuri.

**Si nu mai completezi tu cifrele.** Alegi lucrarea, iar aplicatia stie la cat se face pe felul ala
de masina si pune singura totul:

> Alegi „Schimb ulei + filtru" pe B 154 UIP (Logan, 88.450 km acum) →
> *se repeta la 15.000 km / 12 luni*, *scadenta la 103.450 km sau pe 20.08.2027*.

Pe un Scania, aceeasi lucrare propune 40.000 km, nu 15.000 — aplicatia se uita la ce fel de masina
e (autoturism / utilitara / camion), din fisa ei. Daca masina nu raporteaza kilometrajul, nu
inventeaza o cifra: spune ca trebuie pus manual.

**Tot ce completeaza ramane editabil.** Iar ce ai scris tu NU se mai rescrie: daca ai tastat o
cifra si apoi schimbi lucrarea, cifra ta ramane.

### AMÂNDOI · Fila „Intervale": cifrele noastre sunt un punct de plecare, nu o lege

In Mentenanta a aparut a patra fila, **Intervale** — un tabel cu toate lucrarile si, pe trei coloane
(autoturism, utilitara, camion), la cati kilometri si la cate luni se fac.

Cifrele de pornire le-am pus noi, discutate impreuna. Clientul le poate schimba pe ale lui, direct
de acolo: ce modifica el se coloreaza verde si bate implicitul. Lasat gol = „la nevoie", fara
propunere. Exista si un buton care readuce totul la cifrele noastre.

Doua lucruri de stiut:
- **Lucrarile deja programate NU se schimba** cand modifici tabelul. Se schimba doar propunerile de
  aici inainte — altfel o corectura ti-ar rescrie scadentele existente pe toata flota.
- **O cifra imposibila (99 km, 900 de luni) e ignorata**, si ramane implicitul. Fara asta, o
  scapare de tastatura ar fi stins tacut propunerea pentru lucrarea aia.

**Fondatorul vede:** in plus, poate stabili cifrele la nivel de PLATFORMA — devin punctul de
plecare pentru toate companiile care nu si le-au schimbat.

**Clientul vede:** un tabel pe care il poate ajusta la felul lui de lucru, in Mentenanta, nu
ingropat in Administrare.

> Verificat pe cod real, 66 de controale — inclusiv ca propunerea difera intre Logan si Scania, ca
> masina fara kilometraj citit nu primeste o cifra inventata, ca ce a tastat omul nu se rescrie, ca
> cele doua moduri trimit campurile corecte, si ca o cifra imposibila nu strica nimic.


### AMÂNDOI · Numarul masinii statea PESTE iconita, in ferestrele de Alerta si de Lucrare

**Ce se vedea:** in fereastra „Lucrare noua" (si in „Regula noua"), la campul Vehicul, sub numarul
masinii se ghicea o umbra verzuie. Parea o pata; era iconita de masina a campului, peste care
scria textul.

**De ce:** campul de vehicul are cautare — isi deseneaza iconita in FUNDAL, la 15 pixeli de
margine, si de aceea cere spatiu in stanga. Cand am facut cele doua ferestre noi, am pus o regula
care aliniaza toate campurile din ele si care taia spatiul ala la 11 pixeli. Textul intra peste
desen.

**Fondatorul vede:** campul asezat cum trebuie, cu iconita la stanga si numarul dupa ea.

**Clientul vede:** la fel.

### AMÂNDOI · Taxa de drum (TollRo) — calculator pe flota ta — `085f30d`

Din toamnă, camioanele de peste 3,5 t nu mai plătesc rovinietă pe perioadă, ci **taxă pe kilometru**,
în funcție de tipul drumului, masă și normă de poluare. Concurența a scos deja un calculator; l-am
făcut și noi, dar altfel.

**Diferența, și e cea care contează.** La ei tastezi de fiecare dată numărul, VIN-ul, masa, axele și
norma Euro — pentru orice camion, chiar dacă nu e al tău. La noi **alegi mașina din flotă** și atât:
profilul de taxare se citește din fișa ei. Nu poți calcula pentru un vehicul care nu e al tău, și nu
mai retastezi date pe care aplicația le știe deja. (Exact cum ați cerut.)

**Ce face.** Alegi vehiculul, apoi kilometrii vin în două feluri:

1. **Din traseul deja parcurs** — asta nu poate face niciun calculator public, fiindcă are nevoie de
   istoricul GPS al mașinii. Luăm drumul real al camionului pe intervalul ales și, bucată cu bucată,
   aflăm din OpenStreetMap ce fel de drum e: autostradă, drum național sau drum netaxat. Rezultatul e
   costul real al lunii trecute, nu o presupunere.
2. **Îi introduci tu** — dacă vrei să pui un preț pe o cursă viitoare.

Rezultatul arată ca la ei: bare colorate pe tip de drum, km × lei/km, total mare. Pentru ruta din
exemplul vostru (Clinceni–Brașov, 228,5 km) iese **62,13 lei** — aceeași cifră.

**Ce am refuzat să facem.** Dacă alegi un autoturism, nu-ți dăm un cost inventat: scrie limpede că
sub 3,5 t vehiculul **nu intră la TollRo** și rămâne pe rovinietă. Dacă în fișă lipsește masa, nu
ghicim — spunem că nu se poate încadra. Dacă lipsește norma Euro, calculăm la **tariful maxim** și te
anunțăm: mai bine o estimare prudentă decât una optimistă pe care o pui în ofertă și pierzi bani.

**Tarifele sunt reale, dar se pot schimba — de aceea nu sunt îngropate în cod.** Grila (masă × normă
Euro × tip de drum) e un tabel pe care **super-adminul îl poate corecta**, cu data de la care se
aplică. Data intrării în vigoare s-a mutat deja de trei ori; dacă valorile ar fi fost fixe în cod, la
prima ordonanță calculatorul ar fi început să mintă și ar fi fost nevoie de o nouă versiune.
Valorile pe care statul **nu le-a publicat încă** (treapta 7,5–12 t și pozițiile intermediare pe
Euro 4/5) sunt marcate cu ⚠ în tabel — sunt estimările noastre, nu cifre oficiale. Un tarif presupus,
afișat ca oficial, e mai rău decât lipsa lui.

- **Ce vede fondatorul:** în plus, tabelul de tarife, editabil, cu data de aplicare.
- **Ce vede clientul:** meniul „Taxa de drum", unde își alege camionul și află cât îl costă.

Și pe telefon. **Excepție de paritate asumată:** pe telefon tabelul de tarife se **vede**, dar se
modifică doar din web — 24 de căsuțe numerice pe ecran de telefon sunt o invitație la greșeli, iar
greșeala aici înseamnă un preț greșit trimis unui client.

**Completare pe loc, când fișa e goală (cerut de Robert, 20.08).** Dacă un camion n-are trecute masa
sau numărul de axe, calculul nu se mai blochează: cele două câmpuri devin căsuțe și le completezi
acolo. Un buton **„Salvează în fișă"** le trece definitiv la vehicul, ca data viitoare să vină
singure — se salvează pe aceeași cale ca fișa, deci se supune acelorași drepturi (un cont care nu
poate edita flota nu vede butonul).

Două reguli pe care le-am pus dinadins:
- **Completarea merge DOAR unde fișa e goală.** Dacă în fișă scrie 30 t, nu poți „calcula la 5 t"
  scriind altceva — altfel taxa ar deveni negociabilă din browser, iar cifra pusă în ofertă n-ar mai
  avea legătură cu camionul. Fișa e adevărul.
- **Ce scrii nu se salvează singur.** Rămâne doar pentru calculul curent până apeși butonul.

Numărul de axe **nu schimbă suma** — grila publicată diferențiază doar după masă și normă Euro — și
scrie asta pe ecran, ca să nu pară defect. Îl păstrăm fiindcă ordonanța finală s-ar putea să-l
folosească, și fiindcă oricum e o dată bună de avut la vehicul.

**De verificat când apare ordonanța:** valorile marcate cu ⚠ și data de aplicare. Sunt într-un
singur loc, se schimbă în două minute, fără programator.

### AMÂNDOI · Un singur drum pentru scadențe: fișa mașinii, Mentenanța și Documentele spun același lucru

Datele erau deja comune — ce scriai în fișa mașinii apărea și în Management. Dar cele trei ecrane
**judecau diferit aceleași date**, iar fișa mașinii nu putea scrie tot.

**1. Un singur număr pentru fiecare avertisment.** Existau șase, pentru aceeași idee de „curând":

| Unde | Se aprindea la |
|---|---|
| Mentenanță — culoarea din listă | 14 zile / 500 km, bătut în cod |
| Mentenanță — notificarea | preavizul din Administrare |
| Documente — culoarea în Management | 30 de zile, bătut în cod |
| Documente — culoarea în fișa mașinii | 30 de zile, **a doua copie** |
| Documente — notificarea | 7 zile |

Deci un ITP era portocaliu **30 de zile**, dar telefonul suna abia la **7** — trei săptămâni în care
ecranul striga și telefonul tăcea. Și dacă schimbai preavizul din Administrare, se muta **doar**
notificarea; culorile rămâneau pe loc, așa că setarea părea că nu face nimic.

Acum fiecare fel de scadență are **o cifră, folosită în ambele locuri**:
- **lucrări la service:** 14 zile sau 500 km (un schimb de ulei se face într-o oră)
- **acte:** 30 de zile (un RCA sau un ITP nu se rezolvă într-o zi)

Sunt reglabile per companie, în Administrare, și de acum înainte reglajul **mută și culorile**.
Starea actelor se calculează pe server, ca la lucrări — nu mai socotește fiecare ecran pe cont propriu.

**2. Istoricul actelor, pe fiecare mașină.** Până acum, reînnoirea **ștergea** actul vechi: nu mai
știai ce RCA aveai anul trecut, la ce firmă și cât ai dat. Acum actul înlocuit rămâne, marcat cu data
înlocuirii, sub „Istoric acte" în fișa mașinii și în Management. **Totalul cheltuit pe acte îl
include** — altfel „cât dau pe acte" uita tot ce era mai vechi de o reînnoire.

Nimic din ce e vechi nu se pierde și nimic nu se schimbă pentru actele curente: listele, alertele și
rapoartele se uită în continuare **numai** la actul valabil acum. Altfel fiecare RCA reînnoit ar fi
sunat la nesfârșit că „a expirat".

**3. Fila „Service" din fișa mașinii era cea slabă.** Nu putea pune repetarea — deci o lucrare
adăugată de acolo **nu se reprograma niciodată singură**. Nu avea descriere. Nu se putea modifica,
doar ștearsă și refăcută. Și scria „planificat", cu galben, **chiar și după trei luni de întârziere**.

Acum e **același lucru ca în Mentenanță**: aceleași rânduri (vezi „depășit cu 2.300 km", cu roșu) și
**aceeași fereastră** de scris, deschisă cu mașina completată deja. Nu mai sunt două formulare care
se pot depărta unul de altul.

**4. O singură listă de tipuri de acte.** Era scrisă de mână în două locuri — fișa mașinii și
Management. Identice atunci, libere să se depărteze oricând.

**Fondatorul vede:** un singur loc de reglat preavizul, care chiar se vede în ecran.

**Clientul vede:** aceeași lucrare, aceeași stare și aceeași fereastră, din orice parte a aplicației
o deschide. Plus istoricul actelor mașinii, care înainte nu exista.

> Verificat pe cod real, 46 de controale — inclusiv că preavizul companiei schimbă ȘI culoarea, ȘI
> alerta; că actele înlocuite nu mai ajung în alerte, în rapoarte sau în rezumatul „acte fără dată";
> că ruta de istoric nu e confundată cu un id; și că butoanele funcționează din ambele ecrane.

---

### AMÂNDOI · Mentenanța răspunde acum la „ce am de făcut", nu doar la „ce are mașina asta"

**Cum era.** Un singur fel de a privi lucrările: grupate pe mașină, cu TOATE grupele deschise. Ca să
afli ce e urgent pe flotă, trebuia să citești tot ecranul, mașină cu mașină. La 30 de mașini, un ecran
pe care-l derulai minute întregi. Formularul de adăugare stătea jos, sub listă, înghesuit în trei
coloane.

**Cum e acum.** Aceleași lucrări, trei feluri de a le privi, dintr-un comutator sus:

| | La ce răspunde |
|---|---|
| **Agendă** (implicit) | „Ce am de făcut?" — toată flota, în ordinea scadenței, tăiată în *Depășite / Zilele astea / Mai târziu / Fără termen* |
| **Pe vehicul** | „Ce are mașina asta?" — grupe care se desfac; deschise implicit doar cele cu lucrări depășite |
| **Istoric** | „Ce s-a făcut și cât a costat?" |

Plus **căutare** după număr, lucrare sau descriere — până acum aveai doar două liste derulante.

**Ce se vede acum și nu se vedea, deși aplicația avea datele:**
- **Kilometrajul real al mașinii**, citit din ea. Serverul îl trimitea la fiecare încărcare și nu-l
  arăta nicăieri.
- **„Mai sunt 7.700 km"** — înainte apărea abia sub 500 km. Adică aflai când era deja târziu.
- **Repetarea** („la 10.000 km / 12 luni"). O aveai setată, dar nimic din ecran nu ți-o spunea, deci
  nu știai care lucrări se reprogramează singure.

**Nouă defecte reparate**, toate găsite rulând codul, nu privindu-l:

1. **Ordinea era greșită.** O lucrare scadentă la kilometri (peste un an) urca DEASUPRA uneia deja
   depășite. Zilele și kilometrii nu se puteau compara, așa că lista ieșea aiurea. Acum se aduc la
   aceeași unitate și primul rând e chiar cel mai urgent.
2. **Trei cifre de bani care se contraziceau.** „Luna" și „Anul" se socoteau din toată lista, iar
   „Total service" doar din ce era afișat pe ecran — deci la filtrul „De făcut" scria *Total 0 lei*
   sub un *An 4.295 lei*. Acum toate trei vin din același loc.
3. **Text nescapat.** Ce scriai la „Altele…" intra ca **cod viu** în pagină. La Documente era
   reparat, la Mentenanță nu.
4. **Un apostrof rupea creionul.** „Bosch d'Auto" în descriere → butonul de modificare nu mai făcea
   nimic, fără nicio eroare. Se împacheta tot rândul în buton; acum se trimite doar numărul lui.
5. **Depășit și „curând" erau amândouă roșii.** O lucrare de peste două săptămâni striga la fel de
   tare ca una restantă de o lună. Acum: roșu = depășit, portocaliu = curând.
6. **Toate grupele deschise** la fiecare intrare în ecran.
7. **Zilele se numărau din ceas în ceas**, nu de la o zi de calendar la alta: o scadență pe 29
   apărea, pe 20, ca „peste 10 zile". Omul numără zile.
8. **Bifa „efectuat" nu întreba costul.** Marcai lucrarea, apoi deschideai creionul ca să scrii
   suma — două operații pentru una, și de obicei suma nu se mai scria deloc. Acum întreabă pe loc.
9. **Ștergerea unei lucrări din istoric** nu spunea că se pierd și banii ei din totalul de service.
   Acum îți spune exact câți.

**Formularul s-a mutat într-o fereastră proprie**, ca la Alerte, cu câmpurile strânse pe înțeles:
*Când e scadentă* (dată și/sau kilometraj) și *Se repetă* (km și/sau luni), fiecare cu explicația lui.

**Fondatorul vede:** la fel ca clientul. Toate modificările rămân în jurnalul de audit.

**Clientul vede:** un ecran care începe cu ce e restant, nu cu o listă alfabetică de mașini.

> Verificat pe cod real, 53 de controale — inclusiv că depășitul e primul, că aceeași sumă apare în
> toate cele trei file, că apostroful nu mai rupe nimic, că grupa fără urgențe rămâne închisă și că
> se deschide la apăsare.

---

### AMÂNDOI · Am tras granița: Mentenanță = ce se face la service, Documente = ce expiră

**Problema.** Lista de tipuri din Mentenanță conținea **ITP, RCA, Rovinietă, Casco, Tahograf** — exact
aceleași care există și în fila **Documente**. Același ITP putea fi scris în două locuri, iar agentul
RA Care îl număra de două ori. Nimic nu spunea care e locul corect.

**Regula, de acum înainte:**

- **MENTENANȚĂ** = ce se face la service. O lucrare mecanică: se consumă piese, se plătește manoperă,
  se repetă la kilometri sau la luni. La final ai o mașină reparată.
- **DOCUMENTE** = ce se plătește și **expiră**. La final ai o hârtie cu dată de valabilitate.

Testul care le separă: *„la final rămân cu un act care are dată de expirare?"* → Documente.

**ITP e cazul care înșală:** te duci fizic la o stație, ca la service. Dar ce cumperi acolo e
certificatul, nu reparația — dacă mașina nu trece, plătești reparația SEPARAT, și aia e mentenanță.

**Ce s-a schimbat concret:**
- Actele **au ieșit** din lista de lucrări. În loc, lista are acum 16 lucrări adevărate (ambreiaj,
  amortizoare, curea accesorii, sistem de răcire, instalație electrică, tinichigerie…).
- **Intrările vechi nu s-au atins.** Dacă ai deja un „ITP" scris în Mentenanță, rândul lui capătă o
  bandă portocalie — *„ITP" e un act, nu o lucrare la service* — și un buton **Mută la Documente**.
  Mutarea duce scadența ca dată de expirare și păstrează costul.
- Dacă cineva scrie totuși un act prin „Altele…", aplicația îl întreabă înainte să salveze.
- **Nu se suprascrie nimic.** Dacă mașina are deja actul acela, mutarea se oprește și îți spune —
  altfel un act complet, cu scan, ar fi fost înlocuit de unul sărac, refăcut dintr-o linie de
  mentenanță.

**Și o listă dublă a dispărut.** Tipurile erau scrise de mână în DOUĂ locuri: ecranul Mentenanță avea
14, fila „Service" din editarea vehiculului avea 7, altfel ordonate. Acum amândouă citesc din același
fișier (`maint_types.js`), deci nu se mai pot depărta.

**Fondatorul vede:** o graniță pe care o putem explica unui client în două propoziții.

**Clientul vede:** nu-și pierde nimic. Ce a scris greșit rămâne, semnalat, cu un buton care-l mută.

---

### AMÂNDOI · Alarma falsă de combustibil, căutarea după număr și cadranele de stare — `2e13d65`

**1. „Scădere de la 43 L la 32 L" — fără să se fi întâmplat nimic.** Robert a primit notificarea pe
20.08. Nu senzorul era de vină, ci regula noastră.

Alerta „cât a stat oprit" compara **o singură citire** de la oprirea motorului cu **o singură
citire** de la pornire. Iar citirea de la pornire e cea mai nesigură din tot ciclul: sonda nu s-a
așezat încă, multe magistrale CAN raportează în primele cadre un nivel vechi, iar dacă mașina a
parcat pe pantă și pornește pe drept diferența e de câțiva litri. La un rezervor mare, 11 litri
înseamnă sub 3% — adică sub eroarea obișnuită a unei sonde.

Alerta „în mers" avea deja apărarea corectă: ține o suspiciune o oră și o anulează dacă nivelul
revine. Cea de la parcare n-avea niciuna. Acum are aceeași disciplină: se așteaptă ca sonda să se
așeze, iar alerta pleacă doar dacă nivelul **rămâne** jos câteva minute. Dacă revine, nu se mai
trimite nimic.

A doua cauză, mai ascunsă: aplicația citește nivelul din trei surse (rezervor calibrat, nivel
calculat, CAN brut) — **scări diferite**. Dacă la oprire mașina raporta una și la pornire alta,
comparam mere cu pere, iar „scăderea" era pur și simplu diferența dintre două moduri de a măsura.
Acum se compară doar sursă cu sursă.

Întârzierea de câteva minute nu costă nimic: dacă motorina chiar a fost furată noaptea, paguba s-a
produs demult. Dar alarmele false sunt scumpe — după două-trei, omul începe să ignore notificările.

**Ce am găsit pe drum, tot la combustibil:** proba automată care apăra detectarea furtului **pica de
pe 26 iulie**, fără ca cineva să observe. Motivul: pe 26 iulie s-a decis, corect, că „prag nesetat"
înseamnă „utilizatorul a ales Dezactivat", nu „prag 0" — dar proba n-a fost actualizată. Am
reparat-o și am adăugat un caz care apără chiar regula asta.
⚠ **Consecință de discutat:** o companie care nu și-a setat pragul de furt **nu primește deloc**
alerte de furt de la agentul RA Watch. E o alegere deliberată, dar clientul n-are de unde ști. Trecut
la „De verificat înainte de lansare".

**2. Căutarea vehiculelor găsește numărul scris oricum.** Căuta și după nume, și după număr, și după
IMEI — dar numărul se scrie cu spații („B 154 UIP"), iar oamenii îl tastează cum le vine: „b154uip",
„B-154-UIP". Niciuna dintre variante nu găsea nimic, și părea că mașina nu e în aplicație. Acum se
ignoră spațiile, cratimele și diacriticele, în toate cele opt locuri unde se caută un vehicul (web +
telefon) — o singură regulă, nu opt.

**3. Cadranele de stare, remodelate.** „Total" nu e o stare, e întreaga flotă — stătea pe picior de
egalitate cu „Staționat" și strângea toate etichetele. Acum e un **card lat deasupra**, cu numărul
mare, iar cele patru stări stau dedesubt și au cu un sfert mai mult loc. La fel în aplicația de
telefon — cele două trebuie să arate ca un singur produs. Scrisul stă **centrat** pe toate cinci
(cerut de Robert, 20.08) — aliniat la stânga arăta lipit de muchie.

**4. Graficul de preț la carburant (telefon).** La atingere scria „20.407" — numărul brut al zilei,
nu data. Acum scrie data și prețul cu unitate: „27 nov. '25 — Motorină: 6,85 lei/L".

- **Ce vede fondatorul:** la fel ca clientul.
- **Ce vede clientul:** mai puține alarme false la combustibil, își găsește mașina după număr oricum
  ar scrie, și un panou de stare mai limpede.

APK reconstruit.

### AMÂNDOI · Notificările arată acum lucrul despre care vorbesc — `3544e92`

Trei notificări deschideau aceeași hartă generică: o panglică de viteză pe drumul parcurs. Bună
pentru o depășire de viteză, nepotrivită pentru restul. Acum fiecare arată ce trebuie.

**1. Intrare / ieșire din zonă.** Harta desena traseul mașinii, dar **nu desena zona**. Se vedea o
mașină pe un drum și scria „a intrat în zonă" — fără să se vadă unde e zona sau pe unde a trecut.

Acum se desenează zona propriu-zisă (cerc, poligon sau coridor, cu culoarea ei) și harta se
strânge pe ea plus punctul trecerii. Punctul e **verde la intrare și roșu la ieșire**, iar bucata
de traseu dinainte arată din ce direcție a venit. Se vede dintr-o privire pe ce latură a intrat.

**2. Tensiune scăzută.** Bateria se descarcă acolo unde stă mașina — cât de repede a mers înainte
n-are nicio legătură. Harta arată acum **doar locul, la zoom mare**, fără panglica de viteză, iar
în listă apare **valoarea măsurată** (ex. „11,3 V"), pe care înainte trebuia s-o citești din text.

**3. Expirarea documentelor.** Aici era cel mai gol: scria „RCA expiră în 5 zile" și atât — plus o
hartă cu locul unde se afla mașina când a sunat memento-ul, ceea ce nu spune nimic.

Acum arată **actul**: ce e, ce număr are, cine l-a emis, când a fost emis, cât a costat, și un
număr mare de zile rămase, colorat (roșu sub 3 zile, portocaliu sub 14). Zilele se recalculează
**la ziua de azi** — o notificare de acum două săptămâni spunea „mai ai 30 de zile" când mai erau
16. Două butoane: **„Vezi actul"** (apare doar dacă scanul chiar există) și **„Documentele
vehiculului"**, care te duce direct în fișă, la fila cu acte. Harta și rândurile de viteză au
dispărut de pe scadențe.

Tot aici: notificarea săptămânală „aveți acte fără dată de expirare" spunea doar un număr. Acum
**listează actele**, fiecare cu vehiculul lui și cu un buton de completare — actele fără dată sunt
exact cele pentru care nu ești alertat deloc.

- **Ce vede fondatorul:** la fel ca clientul, pe toate companiile.
- **Ce vede clientul:** notificări din care înțelege situația fără să mai deschidă altceva.

Aceleași trei ecrane și în aplicația de telefon. APK reconstruit.

### AMÂNDOI · Actele dau acum și datele tehnice + primii pași de căutare pe Google — `47a4437`

**1. „De ce nu preia puterea și cilindreea?"** Pentru că le căutam doar în talon, unde au coduri
standard. O poliță RCA le conține adesea — dar scrise în cuvinte („Capacitate cilindrica: 1598 cm3"),
iar pe alea nu le citeam deloc.

Acum le culege și de acolo. Dintr-o poliță obișnuită ies **16 câmpuri în loc de 6**: marca, modelul,
anul, cilindreea, puterea, masa maximă, numărul de locuri, combustibilul și categoria — pe lângă
datele actului. Toate merg în fișa vehiculului, tot cu confirmarea ta.

Valorile absurde sunt respinse: o cilindree de 7 cmc sau o putere de 99999 kW nu intră în fișă.
Un câmp completat automat nu-l mai verifică nimeni — deci mai bine gol decât greșit.

**2. Site-ul: bazele care lipseau.** Cea mai costisitoare lipsă nu era la Google, ci pe WhatsApp:
un link către `ratrack.ro` apărea **complet gol** — fără titlu, fără imagine. În B2B, unde ofertele
circulă pe WhatsApp, asta e o pierdere zilnică. Acum linkul arată o copertă cu logo, titlu și
descriere. Coperta se generează dintr-o comandă, deci se reface singură dacă schimbați logoul.

Mai departe: **titlul paginii era scris invers** — „RA Tracks — Monitorizare GPS" pune brandul
primul, dar nimeni nu caută „RA Tracks". Acum începe cu ce se caută. Am adăugat și fișierele prin
care Google înțelege site-ul (`robots.txt`, `sitemap.xml`, date structurate), generate de server —
o pagină nouă intră automat în listă, nu rămâne uitată.

**3. Pagină nouă: Întrebări frecvente** (`ratrack.ro/intrebari-frecvente`), cu 11 întrebări reale —
cât costă, ce echipament trebuie, **dacă e legal**, cum se măsoară consumul, ce se întâmplă cu datele
dacă renunți. Sunt marcate special, deci Google le poate arăta desfășurate direct în rezultate.

Valoarea lor mai mare nu e la căutări: răspund obiecțiilor **înainte** să întrebe omul.

**Fondatorul vede:** linkuri care arată ca lumea când le trimiți, și o pagină la care poți trimite
un prospect în loc să scrii același răspuns a zecea oară.

**Clientul vede:** răspunsuri la ce l-ar fi făcut să ezite.

> Probat pe server pornit: `robots.txt` și `sitemap.xml` răspund cu adresele corecte, pagina de
> întrebări se deschide, coperta se servește ca imagine de 28 KB. Datele structurate sunt validate,
> iar fiecare întrebare din ele apare **identic** în pagină — un răspuns „pentru Google" diferit de
> cel pentru om e exact ce se sancționează.

**Rămâne pe tine, 10 minute:** înregistrarea site-ului în Google Search Console. Codul care citește
pozițiile în căutări există deja în aplicație; fără înregistrare, nu putem ști dacă ceva din toate
astea funcționează. Măsurăm după, nu înainte.

---

## 2026-08-18

### AMÂNDOI · Alerte: se recunosc după desen, se pot opri și, în sfârșit, se pot modifica

**Ce am schimbat la aspect:** cele 16 feluri de alertă arătau toate la fel — un nume îngroșat și un
rând de text mărunt. Acum fiecare tip are **iconița și culoarea lui**: zonele verde, viteza și
temperatura roșu, ralanti și service portocaliu, combustibilul albastru, încărcarea și documentele
violet. Recunoști regula fără s-o citești.

Pragul (90 km/h, 15 min, 10 L) apare ca pastilă, iar zona urmărită ca etichetă separată.

**Bâlbâiala din listă a dispărut.** Scria „Intrare zona **Intrare în zonă**" — numele regulii și tipul
ei, unul lângă altul, la fel de apăsate. Acum numele e titlul, tipul e o etichetă mai mică, colorată.

**Două lucruri care lipseau cu totul din aplicație:**

1. **Nu puteai modifica o regulă.** Serverul avea „creează" și „șterge", atât. Ca să schimbi pragul
   de la 90 la 80, ștergeai regula și o făceai de la capăt — cu tot cu zone bifate și companie
   aleasă. Acum are buton de creion: se deschide același formular, completat, și salvezi.
2. **Nu puteai opri o regulă temporar.** Steagul „activă/inactivă" exista în date, dar în ecran era
   doar un cuvânt. Acum fiecare regulă are **comutator**; oprită, rândul se estompează, ca să se vadă
   că nu lucrează.

**Ce am avut grijă la modificare:** se scriu DOAR câmpurile trimise. Comutatorul trimite numai
starea, deci o regulă pornită/oprită nu-și pierde numele, condiția sau zonele. Verificarea „vehiculul
trebuie să fie din compania regulii" se face pe valorile FINALE, nu doar pe ce s-a trimis acum —
altfel puteai schimba doar vehiculul și obțineai o regulă care nu s-ar fi declanșat niciodată. Doar
super-adminul poate muta o regulă în altă companie.

**Fondatorul vede:** în plus, avertismentul portocaliu „TOATE companiile" rămâne la fel de vizibil.
Fiecare modificare intră în jurnalul de audit, cu ce câmpuri s-au schimbat.

**Clientul vede:** reguli pe care le recunoaște dintr-o privire, pe care le poate opri cu un clic și
corecta fără să le refacă.

**Corectate imediat după livrare, la trei observații ale lui Alin:**
- **Regula se scrie acum într-o fereastră proprie**, nu într-un formular înghesuit sub listă. Titlul
  spune ce faci — „Regulă nouă" sau „Modifici: …" — iar câmpurile au aer între ele.
- **Zonele se scriu pe nume, nu „2 zone".** Scurtasem prea mult: la o singură zonă se vedea numele,
  la mai multe apărea doar numărul, deci nu mai știai ce urmărește regula. Acum apar primele două
  nume, restul ca „+N", iar la trecerea cu mouse-ul le vezi pe toate.
- **Numărul de înmatriculare iese în față.** Era scris la fel ca numele mașinii („B 268 ROY · VW
  CADDY") și se citeau ca un singur șir. Acum numărul e îngroșat și închis la culoare, numele mai
  șters lângă el.

**Încă două schimbări, tot la cererea lui Alin:**

**Lista se grupează pe TIPUL alertei.** Aveai două reguli „Depășire viteză" pe mașini diferite, iar
în listă stăteau despărțite de alte alerte. Acum rândul de sus e tipul — „Depășire viteză · 2 reguli
· 1 oprită" — iar dedesubt, când îl deschizi, sunt regulile lui cu mașinile lor. Lista rămâne scurtă
oricâte reguli ai: cel mult câte tipuri folosești, nu câte reguli.

Tipurile stau în ordinea din catalog, deci „Intrare în zonă" și „Ieșire din zonă" rămân vecine, iar
ordinea nu sare de la o încărcare la alta. Dacă ai un singur tip, se deschide singur — n-are rost o
apăsare ca să vezi tot ce ai.

**Numărul de înmatriculare nu mai stă în pastilă.** E scris mare, deasupra, cu modelul mărunt
dedesubt. În pastila gri, numărul și modelul se citeau ca un singur șir.

**Coloana „pentru cine e regula" s-a simplificat până la capăt.** Alin s-a uitat la listă și a
întrebat, pe bună dreptate, de ce la o regulă scrie numărul mașinii, iar la alta scrie „TOATE
companiile" — două lucruri fără nicio legătură între ele, unul sub altul. Erau, de fapt, trei
situații diferite amestecate: regulă pe o mașină anume, regulă pe toată flota unei companii, și
regulă pe toată platforma. Acum coloana spune un singur lucru, scurt:

- **regulă pe o mașină** → doar **numărul** ei. Modelul („VW CADDY") a dispărut — numărul e
  suficient ca s-o recunoști, iar modelul lungea rândul fără să adauge nimic;
- **regulă pe toată compania** → „Toate vehiculele";
- **regulă pe toată platforma** → avertismentul portocaliu „Toate companiile" (numai la noi ajunge
  așa ceva).

**Fondatorul vede:** în plus, **compania în paranteză** — „B 268 ROY (Unitip Test)" — fiindcă noi
avem în față mașini din firme diferite și fără paranteză n-am ști a cui e regula.

**Clientul vede:** DOAR numărul mașinii. Compania lui e subînțeleasă — toate regulile din ecranul
lui sunt ale lui — iar regulile altor firme nici nu ajung până la el.

> Verificat pe cod real, 37 de controale — inclusiv că două reguli de același tip chiar se unesc
> într-un rând, că deschiderea unui tip nu arată regulile altuia, că apăsatul deschide și închide,
> că zonele se scriu pe nume, că modificarea parțială nu șterge restul regulii și că paranteza cu
> compania apare la super-admin, dar NU și la client.

---


### AMÂNDOI · Grupe: vezi ce mașini are fiecare și le muți de acolo, nu din 20 de fișe

**Ce am schimbat:** ecranul Grupe arăta un nume, o descriere și un număr. Ca să afli CARE mașini sunt
într-o grupă, deschideai fișa fiecărui vehicul, pe rând. Ca să pui 20 de camioane în „Camioane",
deschideai 20 de fișe.

Acum apeși pe o grupă și se desface: **vezi mașinile ei**, le scoți cu un „✕" și adaugi altele dintr-o
listă. Fără să pleci din ecran.

**Ce se vede în plus, fără să deschizi nimic:**
- **câți oameni văd flota prin grupa aia** — ăsta e rolul principal al grupelor, și nu se vedea nicăieri;
- **dacă grupa are program de lucru propriu** — până acum aflai doar dacă apăsai pe creion.

**Ștergerea spune acum tot adevărul.** Înainte scria „vehiculele rămân, dar fără grup". Adevărat, dar
pe jumătate: oamenii care vedeau acele mașini **prin grupă** își pierd accesul pe loc. Acum
avertismentul îți spune câți sunt.

**O capcană evitată la timp.** Aplicația avea deja o cale prin care se schimbă grupa unui vehicul —
dar aceea scrie ȘI șoferul. Dacă o foloseam, mutarea unei mașini dintr-o grupă în alta **i-ar fi
șters șoferul**, tăcut. Am făcut o cale separată, care atinge doar grupa.

**Încă o nepotrivire reparată:** numărul de vehicule al grupei includea și mașinile **arhivate**. Vedeai
„3 vehicule" și, la desfacere, doar două. Acum arhivatele nu se mai numără nicăieri.

**Fondatorul vede:** la fel. Mutările rămân în jurnalul de audit, iar accesul se recalculează imediat.

**Clientul vede:** grupele se desfac, mașinile se mută cu două apăsări, iar la ștergere știe pe cine
lasă fără acces.

**Corectat imediat după livrare:** prima versiune n-avea nicio **săgeată** pe rând. Funcționa — apăsai
și se deschidea — dar nimic nu-ți spunea asta, așa că ecranul arăta ca o listă moartă și Alin a
raportat, pe bună dreptate, că „nu se vede modificarea". Acum fiecare rând are o săgeată care se
rotește la deschidere, plus explicație la trecerea cu mouse-ul. O funcție pe care n-o găsești e o
funcție care nu există.

> Verificat pe cod real, 38 de controale — inclusiv capcanele: mașina arhivată nu apare și nu se
> numără, lista de adăugare nu propune mașini deja în grupă, desfacerea uneia nu arată mașinile
> alteia, ruta nouă nu atinge șoferul, iar apăsatul chiar deschide și închide (simulat, nu presupus).

---


### CLIENT · Trei funcții noi pe site: dispecerizare, acte automate, evidența șoferilor

**Ce am schimbat:** secțiunea „Funcții" de pe pagina publică avea 9 lucruri. Acum are **12**, iar cele
trei adăugate sunt funcții care există de mult în aplicație, dar pe care nu le spuneam nimănui.

**1. „Dispecerizare: ce mașină trimiți".** Asta era cea mai mare tăcere. Aplicația știe deja să
răspundă la întrebarea „am o cursă la adresa X, pe cine trimit?" — calculează distanța până la
fiecare mașină, le marchează pe cele **libere** (pornite și oprite din mers), le pune primele și
spune în cât timp ajung. Nimeni din afară n-avea de unde ști. Nu se suprapune cu „Localizare live":
aia e o hartă pe care te uiți, asta e o decizie care ți se dă.

**2. „Acte încărcate, fișa completată automat".** Munca lui Robert, spusă pe scurt: încarci talonul
sau polița, iar datele intră singure în fișă — inclusiv data expirării. Accentul e pe *nu mai
introduci date manual*, nu pe cum funcționează pe dinăuntru.

**3. „Evidența șoferilor și a permiselor".** Categoriile de pe permis, încadrarea, expirările și
mașina fiecăruia. E prezentată ca **evidență**, nu ca buton de descărcat — cine cumpără vrea să știe
că are situația la zi, nu că există un buton.

**De ce contează așezarea:** cu 12 în loc de 9, grila iese fix pe 4 rânduri de câte 3. La 11 ar fi
rămas un rând ciung. Dispecerizarea am pus-o a doua, imediat după „Localizare live", pentru că e
prima care se vede și e cea mai convingătoare; actele și șoferii stau lângă „Mentenanță & documente",
ca să se citească împreună.

**Fondatorul vede:** aceeași pagină. Nimic despre costuri, apeluri sau cum se citește un act — alea
rămân între noi.

**Clientul vede:** trei funcții în plus și o frază de introducere care le cuprinde.

> Iconițele au fost verificate în fontul real, nu din memorie: că există, că nu se repetă cu cele 9
> vechi și că **se desenează** — cu o iconiță inventată drept martor, ca să fiu sigur că proba chiar
> prinde o lipsă. (Am pățit-o o dată cu una care nu exista.)

---


### AMÂNDOI · Datele nu apăreau în căsuțe, iar filele nu se ascundeau pentru tine — `3da1c15`

**1. De ce nu se completau datele.** Câmpurile de dată din aplicație au calendar. Calendarul ascunde
căsuța originală și pune în locul ei una a lui, pe care o vezi. Codul meu scria în căsuța **ascunsă**
— valoarea chiar ajungea acolo, dar tu te uitai la cealaltă, care rămânea goală. Se întâmpla atât la
completarea din act, cât și la modificare.

Aplicația avea deja funcția corectă pentru *golirea* unui asemenea câmp; îi lipsea perechea, pentru
*scriere*. Am adăugat-o și o folosesc peste tot.

> **Ce m-a păcălit pe mine:** verificarea mea automată citea valoarea din căsuța ascunsă — și trecea,
> în timp ce ecranul era gol. Verificam ce zice programul, nu ce vede omul. Acum proba citește exact
> căsuța vizibilă, în format românesc (27.07.2027).

**2. De ce vedeai în continuare filele de camion.** Aici greșeala de proiectare e a mea și e mai
ridicolă: făcusem excepție pentru super-admin, „ca să poată configura orice". Rezultatul — exact
omul care a cerut curățenia era singurul care n-o vedea niciodată.

Acum regula se aplică tuturor: la un autoturism fără sonde rămân patru file. Iar portița există în
altă formă — un „**+ arată toate filele**", discret, în bara de file, vizibil doar pentru super-admin
și doar când chiar sunt file ascunse. Se stinge când închizi fișa: e o excepție de moment, nu o
setare care să se strecoare înapoi în obișnuință.

**Fondatorul vede:** fișa curată ca oricine altcineva, plus butonașul când are nevoie de tot.

**Clientul vede:** datele completate în căsuțe, cum se cuvine.

> Probat pe viu, de data asta din partea vizibilă: la „VW Caddy" (Auto, fără sonde) rămân 4 file;
> butonul apare, iar la apăsare revin toate 7; la redeschiderea fișei se ascund din nou. Modificarea
> unui act arată 28.07.2026 și 27.07.2027 în căsuțe, cu seria întreagă. Completarea din scanare
> salvează actul cu expirarea corectă.

---


### AMÂNDOI · Butonul de modificare la acte + fișa arată doar filele care au sens — `dcc6ee9`

**1. Actele se pot modifica, nu doar șterge.** Până acum, o greșeală la data expirării se repara
ștergând actul și adăugându-l din nou — iar la re-adăugare **pierdeai scanul**, dacă nu-l încărcai
încă o dată. Acum fiecare act are un buton de creion: îl deschizi în același formular, corectezi ce
trebuie, salvezi. **Fișierul rămâne atașat**, pentru că se trimite doar dacă ai scanat unul nou.

**2. Fișa vehiculului nu mai arată file care n-au ce căuta acolo.** Ai dreptate că e logic: un
autoturism n-are sarcini pe axe de configurat, iar o mașină fără sondă de combustibil n-are ce
calibra. Regula are două straturi:

- **automat, după vehicul** — „Config Camion" apare doar la camioane, autotractoare, TIR-uri,
  remorci și utilaje; filele de sonde, doar la vehiculele care chiar au sonde montate;
- **comutator per companie** (Setări, la super-admin) — poți scoate filele de tot pentru un client
  care nu le folosește niciodată.

Dacă schimbi tipul vehiculului în „Camion", fila de axe apare pe loc — nu trebuie să închizi și să
redeschizi fișa.

> **Capcana pe care am tratat-o dinadins:** dacă filele de sonde s-ar ascunde *ori de câte ori*
> mașina n-are sondă, n-ar mai exista niciun loc din care să adaugi PRIMA sondă. De aceea
> super-adminul — cel care montează echipamentul — le vede întotdeauna.

**Fondatorul vede:** două comutatoare noi în Setări și toate filele, mereu.

**Clientul vede:** o fișă mai scurtă, cu ce îl privește; și poate corecta un act fără să-l piardă.

> Probat pe viu: ca super-admin apar toate cele 7 file; ca administrator de firmă, la un autoturism
> fără sonde rămân 4; la același client, un camion capătă fila de axe, iar o mașină cu sonde capătă
> filele de calibrare. La modificare: data schimbată, seria și emitentul neatinse, **fișierul păstrat
> și încă deschizabil**. Plus 9 verificări pe server, inclusiv golirea unui câmp și refuzul tipului gol.

---


### AMÂNDOI · O singură apăsare: validezi și actul e în listă — `7bb57c8`

**Ce lipsea:** după ce confirmai datele citite, câmpurile se completau în formular — dar actul nu era
salvat. Mai trebuia o apăsare pe „Adaugă". Practic ți se cerea să confirmi de două ori același
lucru, iar între cele două apăsări părea că nu s-a întâmplat nimic.

**Fluxul e acum cel pe care l-ai descris:**

1. încarci actul;
2. e citit (gratuit din PDF, cu model doar dacă e poză sau dacă regulile ratează);
3. **vezi ce s-a citit**, cu bifele deja puse;
4. apeși **„Validează și adaugă actul"** — și actul e în listă, cu fișierul atașat.

**Un lucru rămâne separat, intenționat.** Câmpurile care aparțin *vehiculului* (VIN, marcă, model,
combustibil, mase) se completează în fișă, dar se salvează cu butonul „Salvează". Sunt două lucruri
diferite — actul e al actului, fișa e a mașinii — și ar fi înșelător să salvez fișa fără să apeși tu.
Mesajul de confirmare îți spune exact câte câmpuri au rămas de salvat acolo.

**Fondatorul vede:** aceeași schimbare.

**Clientul vede:** o apăsare, nu două. Iar dacă actul n-are dată de expirare, mesajul o spune pe
față: „fără dată de expirare, nu vei fi alertat".

> Probat pe viu, cap-coadă: din 0 documente, o singură apăsare a dus în listă polița cu expirarea
> 27.07.2027, emitentul, seria și fișierul atașat — iar VIN-ul a intrat în fișă, marcat. Numărul de
> înmatriculare, deja completat, a rămas nebifat, cum trebuie.

---


### AMÂNDOI · Emitentul citit greșit: cauza era în felul în care citeam PDF-ul — `4fc28f7`

**Ce ai văzut:** la emitent scria „O R I G I N A L 9. N UMELE SI ADRESA". Datele și seria erau
corecte, doar emitentul aiurea.

**Ce mi-a spus poza aia, de fapt.** Erau două probleme, iar prima explică forma ciudată:

**1. Citeam PDF-ul lipind toate bucățile cu spațiu între ele.** Un PDF nu conține „text", ci bucăți
de text cu poziția lor în pagină. Când un titlu e scris cu litere răsfirate, fiecare literă e o
bucată — iar lipite cu spațiu deveneau „O R I G I N A L". Mai rău: dispăreau rândurile, deci
eticheta unei rubrici se lipea de valoarea alteia, din cealaltă coloană a tabelului.

Acum textul se reconstruiește **după poziția reală în pagină**: bucățile se grupează pe rânduri, se
ordonează de la stânga la dreapta, iar spațiul se pune doar unde chiar există o distanță. Asta
repară nu doar emitentul, ci calitatea citirii pe tot documentul.

**2. Regula de emitent lua etichetele formularului.** O poliță e plină de titluri scrise cu
majuscule — „9. NUMELE ȘI ADRESA", „ASIGURATUL", „ORIGINAL" — care arată exact ca un nume de firmă.
Acum sunt refuzate explicit, iar numerotarea rubricii („9.") se taie din față.

Am pus și o plasă: dacă vreun PDF tot scapă cu litere răsfirate, ele se lipesc la loc înainte de
citire — altfel nicio regulă nu se potrivește pe „P O L I T A".

**Fondatorul vede:** aceeași reparație.

**Clientul vede:** emitentul corect, sau gol — nu o bucată de formular. Dacă regulile nu-l găsesc,
îl completează modelul, ca până acum.

> 30 de verificări, între care **exact cazul din poza ta**, adăugat ca test permanent: titlu cu
> litere răsfirate + etichete de formular + serie + VIN + ambele date. Plus lanțul complet cu PDF
> adevărat, 19/19 — reconstrucția nouă e cod nou, deci a fost probată pe un fișier real, nu doar pe
> text de laborator.

---


### AMÂNDOI · Actul încărcat completează acum TOT, nu pe jumătate — `76c89d9`

**Ce s-a întâmplat:** ai încărcat o poliță RCA și s-au completat doar tipul și seria. Emitentul și
ambele date au rămas goale — adică exact **data expirării, cea care pornește alertele**. Din punctul
tău de vedere, funcția nu mergea. Aveai dreptate, și vina era în trei locuri, toate ale mele.

**1. Bifele.** Fiecare valoare citită primește o notă de încredere. Eu o folosisem ca să *rețin*
bifa: ce era citit „doar probabil" venea nebifat. Cum datele dintr-o poliță sunt tocmai partea citită
mai greu, ele rămâneau nebifate — apăsai „completează" și câmpurile rămâneau goale. Acum **se bifează
tot ce s-a citit**, mai puțin ce ai scris deja tu; nota doar etichetează („sigur / probabil /
verifică"), iar tu debifezi ce nu vrei. Ăsta era motivul principal.

**2. Regulile de citire erau croite pe acte „ideale".** Într-un PDF de poliță, eticheta și valoarea
ajung des la capete opuse ale rândului, iar seria e scrisă „Seria CU **Nr.** 10309310". Am lărgit
căutarea, am adăugat forma „valabilă de la … până la …", și am scos capcanele: „Nr. înmatriculare"
ajungea număr de act, iar emitentul păstra cuvântul-etichetă în față.

**3. Când regulile tot nu reușesc, întreabă modelul — pe TEXT, nu pe poză.** Dacă lipsește data
expirării, textul deja extras se trimite modelului, care scoate emitentul și datele. Costă fracțiuni
de ban, pentru că nu trimitem imaginea, și se întâmplă doar când regulile au ratat. Un act citit pe
jumătate e mai rău decât unul necitit: crezi că e gata și rămâi fără alerte.

**Ce ai cerut și e acum acolo: actul se păstrează și se poate deschide.** În listă apar două butoane —
**vezi** (deschide actul) și **descarcă** (îl salvează cu un nume care spune ce e, nu „file"). Pe
telefon, PDF-urile se deschid în vizualizatorul sistemului; înainte butonul apărea doar la poze, deci
un PDF se stoca și rămânea inaccesibil de pe telefon.

**Fondatorul vede:** aceleași reparații.

**Clientul vede:** încarcă actul, apasă o dată „completează", și câmpurile sunt pline — inclusiv
expirarea. Iar actul rămâne atașat, de văzut sau de descărcat oricând.

> 22 de verificări pe forme diferite de act (poliță în tabel, poliță pe un rând, ITP, talon), plus
> lanțul complet 19/19 și alertele 13/13. Testul mi-a găsit și un defect pe care nu-l căutam:
> **„31 februarie" trecea ca dată validă.** O dată de expirare greșită e mai rea decât una lipsă —
> acum ziua se verifică pe luna ei, cu ani bisecți cu tot.

---


### CLIENT · „Merg după el" — ecran de urmărit o mașină din trafic — `26d69c2`

**Ce ai cerut:** Android Auto, ca să mergi după o mașină anume.

**De ce n-am făcut Android Auto — verificat, nu presupus.** Google acceptă acolo doar patru feluri
de aplicații: navigație, puncte de interes, dispozitive inteligente și meteo. Urmărirea de flotă nu
e printre ele, deci n-ar trece de aprobare. Și, chiar dacă ar trece, aplicația noastră e o pagină
web împachetată, pe când Android Auto cere ecrane native scrise cu biblioteca lor. Ar fi o aplicație
nouă, de la zero, pentru o categorie în care oricum nu ne încadrăm.

**Ce am făcut în loc — și rezolvă exact nevoia.** Un ecran nou pe telefon, „Merg după el", pornit
dintr-un buton din fișa vehiculului. Arată trei lucruri, cu cifre mari, fără derulare:

- **cât mai e până la el** — și dacă te apropii, ții pasul sau rămâi în urmă;
- **încotro e** — o săgeată raportată la direcția TA de mers, nu la nord („ia-o la dreapta" e util,
  „azimut 273°" nu e). Dacă stai pe loc, o spune cinstit: nu are cum să știe încotro ești întors;
- **cu cât merge el și cu cât mergi tu** — de acolo știi dacă îl prinzi.

Sub ele scrie **cât de veche e fiecare informație**. Un ecran care arată „acum" de trei minute e mai
periculos decât unul gol.

**Partea care lipsea de fapt din navigația obișnuită:** Maps te duce unde ERA mașina când ai apăsat.
La 90 km/h, după zece minute ținta e la 15 km de unde ai țintit. Butonul mare de jos relansează
navigația **la poziția de acum**, cu o singură apăsare. Iar Maps și Waze rulează pe Android Auto —
deci partea de condus rămâne pe ecranul mașinii, iar urmărirea pe telefon.

Ecranul rămâne aprins cât ești pe el.

**Fondatorul vede:** același ecran.

**Clientul vede:** deschide fișa mașinii → „Merg după el" → pune telefonul în suport și conduce.

> 17 verificări pe matematica din spate, pe repere cu răspuns știut dinainte (Timișoara→Arad ≈ 50 km,
> cele patru puncte cardinale, rotunjirile, și ceasul nesincronizat care nu produce aiureli).
> Testul CITEȘTE funcțiile din ecran, nu o copie — dacă cineva le schimbă, testul vede noua versiune.

---


### AMÂNDOI · Mașina se recunoaște după NUMĂR, și ecranul e cu adevărat complet pe telefon — `eba21d9`

**Ce am schimbat (1): peste tot, întâi numărul de înmatriculare, apoi numele.** Până acum aplicația
scria „VW Caddy · B 268 ROY" — numele întâi. Numele e liber și se repetă (cinci mașini pot fi toate
„VW Caddy"), pe când numărul e unic, e ce scrie în acte, în foaia de parcurs și ce spune șoferul la
telefon. Acum scrie „B 268 ROY · VW Caddy" — în liste, în alegerea vehiculului, în rapoarte, în
tabelul de administrare și pe hartă.

*Căutarea căuta deja și după număr* — și pe web, și pe telefon. Ce nu mergea era **recunoașterea**:
găseai mașina, dar în listă vedeai un nume care se repeta.

**Ce am schimbat (2): banda de altă culoare de sus și de jos, pe telefon.** Bara de sus era deja
tratată. Bara de JOS nu era configurată nicăieri — de acolo venea dunga. Acum ambele sunt
transparente, iar pagina desenează sub ele. Butoanele de navigare și ceasul rămân vizibile (așa
trebuie), dar peste fundalul aplicației, nu peste o bandă gri.

Android punea singur un „voal" semi-transparent peste bara de jos, ca să se vadă butoanele — exact
acela se vedea ca o dungă. L-am oprit.

**Fondatorul vede:** fișierul cu tema aplicației era în afara git-ului, ca și celelalte de acolo —
reparația ar fi trăit doar pe un calculator. Acum e urmărit.

**Clientul vede:** își recunoaște mașinile după număr, iar aplicația ocupă tot ecranul telefonului.

> Verificat că tema chiar ajunge în APK, nu doar în fișier: e compilată în două variante (Android
> vechi / Android nou), a doua cu toate cele zece setări. Și că `cap sync` nu o rescrie.

---
## 2026-08-14

### AMÂNDOI · Scanarea actelor și pe telefon — cu camera, direct din fișă — `de85206`

**Ce am schimbat:** aceeași funcție ca pe web, pe telefon: în editarea vehiculului există acum
secțiunea „Documente vehicul" — lista actelor cu starea lor (valid / expiră / EXPIRAT / fără dată),
un buton care **deschide camera** și fotografiază actul, ecranul de confirmare cu bifele, și
formularul de adăugare manuală. Propunerile confirmate intră direct în formularul de editare
deschis — aceleași câmpuri, aceeași salvare, nicio cale nouă de scriere.

Poza se micșorează pe telefon înainte de trimitere (o poză de 8-12 MB devine ~300 KB), iar actul
salvat cu fișier se poate vedea din listă.

**O decizie de construcție care merită o propoziție:** n-am adăugat modul nativ de cameră.
Butonul folosește camera prin pagina web încorporată — zero permisiuni noi, zero dependințe,
zero risc la build. Modulul nativ ar fi adus doar reglaje de care o poză de talon nu are nevoie.

**Fondatorul vede:** paritatea web↔telefon respectată în aceeași zi, APK-ul reconstruit.

**Clientul vede:** șoferul sau administratorul fotografiază talonul și RCA-ul de pe teren, iar
fișa și alertele se completează pe loc — fără laptop.

> Verificat: compilarea de tip strictă și build-ul au trecut; componenta folosește exact rutele
> probate pe web (scan, salvare cu fișier, vizualizare cu autentificare pe token — un link simplu
> n-ar fi cărat tokenul și ar fi picat tăcut doar pe telefon).

---


### AMÂNDOI · Încarci actul, aplicația completează — tu confirmi — `6fa5a19`

**Ce am schimbat:** în fișa vehiculului, fila Documente are acum o zonă de încărcare: pui actul
(poză sau PDF) și aplicația îl citește. Un RCA venit ca PDF se citește **gratuit** (are textul în
el); o poză de talon trece prin citirea AI — costă puțin și **o singură dată per vehicul**, nu la
fiecare deschidere.

Ce iese nu se salvează singur. Apare o listă: „am citit asta, atât de sigur sunt" — iar tu bifezi
ce intră. Trei reguli gândite să nu-ți strice datele:

- **Ce ai scris tu nu se suprascrie.** Un câmp deja completat vine nebifat, marcat „deja completat".
  Bifezi doar dacă vrei să-l înlocuiești.
- **Ce intră automat se vede.** Câmpurile completate din act primesc un contur verde, care dispare
  la prima ta editare — știi mereu ce n-ai scris tu.
- **Renunțarea nu lasă urme.** Fișierul se atașează actului abia la „Adaugă"; dacă te răzgândești,
  pe server nu rămâne nimic.

Actul salvat păstrează o copie comprimată, vizibilă oricând din listă (butonul cu imagine). Datele
de expirare intră direct în sistemul de alerte — cel reparat ieri, care acum chiar anunță.

**Fondatorul vede:** costul citirilor AI apare separat în Control costuri („docscan"), măsurat per
apel — îi punem preț DUPĂ ce vedem cât costă pe acte reale, nu invers.

**Clientul vede:** completarea fișei se face din acte, nu din tastat. Pozele făcute cu telefonul se
micșorează automat înainte de trimitere (o poză de 8 MB devine ~300 KB), iar dacă serverul n-are
cheia AI, mesajul spune cinstit: „pozele cer cheia AI; PDF-urile cu text merg și fără ea".

> Probat pe viu, în browser, pe sandboxul local: un PDF de RCA construit realist a trecut prin tot
> lanțul — citit gratuit (sursa: text din PDF), toate cele 7 câmpuri extrase corect, expirarea
> 28.02.2027 intrată în act, VIN-ul completat în fișă și marcat verde, numărul de înmatriculare
> DEJA scris de om lăsat nebifat, fișierul atașat salvat și servit înapoi (JPEG, 6 KB), starea
> golită după salvare. Plus: poza fără cheie AI refuzată cu mesaj omenesc, nu cu eroare criptică.

---


### AMÂNDOI · Alertele de expirare devin de încredere — `bbbc469`

**Ce am schimbat:** trei boli ale alertelor pe acte, găsite când am pregătit completarea automată.
Fără reparațiile astea, „încarci actul și ești acoperit" ar fi fost o promisiune falsă.

1. **Pragul era bătut în cuie la 7 zile, deși setarea promitea altceva.** În trei locuri (setări web,
   telefon, RA Care) scria că „zilele de preaviz" acoperă mentenanța *și documentele*. Pentru
   documente era fals: oricâte zile puneai, alerta venea tot la 7. Acum setarea chiar comandă —
   pui 30, ești anunțat cu 30 de zile înainte. Nesetată, rămâne 7: nimic nu se schimbă pentru cine
   n-a umblat la ea.
2. **Un act expirat suna o dată pe zi, la nesfârșit.** Iar un anunț zilnic pe care înveți să-l ignori
   e mai rău decât niciunul. Acum: o alertă la fiecare prag (preaviz, 3 zile, 1 zi) și un memento pe
   săptămână după expirare. La fel și permisele de șofer, care sunau zilnic pe toată luna de preaviz.
3. **Un act fără dată de expirare era invizibil, în tăcere.** Proprietarul credea că e acoperit
   tocmai pentru că actul „e în aplicație" — dar aplicația n-avea de unde ști când expiră și nu
   spunea nimănui. Acum compania primește un rezumat pe săptămână: „N acte fără dată — nu ești
   alertat pentru ele", cu actele și mașinile numite.

**Fondatorul vede:** aceleași alerte, dar oneste.

**Clientul vede:** setarea de preaviz chiar funcționează; telefonul nu mai țiuie zilnic pentru
același act uitat; și află negru pe alb dacă are acte pentru care nu e păzit.

> 13 verificări cap-coadă pe server pornit, pe ruta reală (pragul setat de un admin de companie,
> exact ca în producție): actul la 15 zile tace pe pragul implicit și alertează cu pragul pe 30;
> două rulări nu dublează; actul expirat rămâne la O alertă după trei rulări; rezumatul „fără dată"
> numește actul și mașina și nu se repetă. Plus toată regresia verde.

*Notă de tranziție: la primul deploy, alertele deja active pot suna o singură dată în plus (cheile
interne de dedup s-au schimbat). O notificare dublă o dată — nu un comportament nou.*

---


### AMÂNDOI · Actele mașinii încep să completeze singure fișa — fundația — `9b60482`

**Ce am schimbat:** ideea lui Alin din 14.08 — încarci talonul, RCA-ul, ITP-ul, iar fișa vehiculului
se completează singură — are acum fundația construită pe server. Partea văzută (butonul de încărcare,
ecranul de confirmare) vine în pașii următori; aici e motorul.

Cum funcționează, în trei trepte, de la ieftin la scump:
1. **Un PDF cu text în el** (RCA-ul de pe email) se citește direct — **gratuit**, fără AI.
2. **O poză** (talonul fotografiat cu telefonul) e transcrisă de model — cost mic, **o dată per act**.
3. În ambele cazuri, câmpurile se extrag apoi **pe reguli, nu pe ghicite**: talonul are coduri
   standard europene (A = numărul, E = seria de șasiu, P.3 = combustibilul…), seria de șasiu are fix
   17 caractere și nu conține niciodată literele I, O sau Q — deci o citire greșită se prinde din
   cod. Redresăm automat și confuziile clasice (O citit în loc de 0), pe context: într-un VIN, O e
   mereu 0; în „VOLVO", niciodată.

**Regula de aur: nimic nu se salvează singur.** Scanarea doar PROPUNE, cu un grad de încredere pe
fiecare câmp; omul confirmă. Un număr de șasiu greșit salvat tăcut e mai rău decât un câmp gol —
golul se vede, greșeala nu.

**Fondatorul vede:** costul citirilor apare separat în Control costuri („docscan"), măsurat din prima
zi — ca să-i punem preț pe cifre, nu din burtă, exact ca la RA Insight.

**Clientul vede:** deocamdată nimic — butonul de încărcare vine în pasul următor.

> 51 de verificări noi (32 pe extragere + 19 cap-coadă pe server), plus toată regresia: CI verde,
> 30/30 pe reparațiile de lansare. Printre ele: scanarea NU scrie nimic în bază; PDF-ul merge FĂRĂ
> cheie de AI; fișierul actului nu e cărat la fiecare listare, ci doar la cerere.

**Două scurgeri tăcute reparate pe drum:**
- pe stiva de VPS scrisesem greșit numele unei variabile — copia de rezervă externă **nu pleca**,
  fără nicio eroare (greșeala mea de ieri, prinsă la cartografierea de azi);
- „Model GPS" și „Număr SIM" completate în fișă **se pierdeau tăcut la salvare** — se trimiteau,
  dar serverul nu le accepta din formularul acela.

---

## 2026-08-13

### CLIENT · Șoferii se pot încărca dintr-un fișier, nu doar bătuți la tastatură

**De ce:** un client care vine la noi are deja lista de șoferi într-un Excel. Până acum trebuia s-o
retasteze om cu om. Acum are, ca la vehicule, **Șablon** și **Importă**.

**Cum merge:** descarci Șablonul (un fișier gol, cu capul de tabel și un rând de exemplu), completezi
nume, telefon, email, numărul de permis, expirarea și categoriile — apoi îl încarci. Îți spune câți
au fost adăugați și câți actualizați.

**Partea delicată, rezolvată:** la vehicule există IMEI-ul, un număr unic după care se știe exact
despre ce mașină e vorba. La oameni nu există așa ceva. Așa că potrivim în ordine: **numărul de
permis**, apoi **emailul**, apoi **numele**. Dacă numele nimerește în două persoane, rândul **nu se
importă** și primești explicația („există doi șoferi cu numele …, completează numărul de permis") —
mai bine îl lămurești tu decât să suprascriem omul greșit.

**Ce nu strică:** poza șoferului rămâne a lui (fișierul n-o conține, deci n-o ștergem). Datele merg
scrise oricum — `12.09.2028`, `12/09/2028` sau `2028-09-12`. Categoriile scrise cu litere mici sau
în altă ordine se îndreaptă singure.

**Am reparat și o inconsecvență de-a mea:** CSV-ul de șoferi scotea coloane de citit („Încadrare",
„Stare", „Vehicule") care **nu se pot reimporta**. Acum scoate exact aceleași coloane pe care le
primește la import — deci ce scoți poți să pui înapoi, ca la vehicule. Informația de citit a rămas
acolo unde îi e locul: în documentele Excel și PDF.

**Fondatorul vede:** la import trebuie să alegi întâi compania din filtrul de sus — altfel șoferii
ar rămâne fără companie. Dacă n-ai ales, îți spune.

**Clientul vede:** două butoane noi la Șoferi, „Șablon" și „Importă". Șoferii intră în compania lui.

> Verificat pe cod real, rulând chiar handlerul de import: 30 de controale — inclusiv potrivirea
> după permis/email/nume, numele ambiguu care trebuie sărit, poza care nu trebuie pierdută, același
> om de două ori în același fișier (1 creat + 1 actualizat, nu 2 duplicate) și fișierele care trebuie
> refuzate.

---


### CLIENT · Butonul „Exportă" scoate acum un document de firmă, nu un fișier de date

**Ce am schimbat:** butonul „Exportă" din *Vehicule* scotea un fișier CSV — un tabel gol, fără logo,
fără titlu, fără dată. Bun de prelucrat, prost de arătat cuiva. Acum ambele secțiuni, **Vehicule** și
**Șoferi**, au butoane **Excel** și **PDF** care scot un **document brandat RA Tracks**: logo în
antet, titlu, data generării și numele de fișier ca la toate rapoartele.

**„Situația flotei"** (Vehicule): număr, nume, categorie, marcă, model, an, combustibil, grup, șofer,
ultima transmisie, IMEI. Ține cont de fila pe care ești — dacă te uiți la „Arhivate", documentul e
despre vehiculele arhivate.

**„Situația șoferilor"** (Șoferi): fiecare om cu **categoriile lui de permis** și **încadrarea**
(profesionist / șofer), numărul de permis, expirarea, starea, mașinile pe care e pus și contactul.
Sus, în antet, scrie direct **câți profesioniști, câți șoferi și câte permise expirate** ai — ăsta e
răspunsul pe care voiai să-l dea documentul.

**Am scos raportul „Șoferi — categorii de permis" din secțiunea Rapoarte.** Făcea exact ce face acum
butonul, iar două căi către același document înseamnă, mai devreme sau mai târziu, două documente
diferite. Catalogul a revenit la 32 de rapoarte.

**CSV-ul a rămas, lângă celelalte două.** Fiecare secțiune are acum trei butoane lipite:
**CSV · Excel · PDF**. CSV-ul de la Vehicule e exact fișierul de dinainte, cu toate câmpurile — deci
fluxul „descarci, editezi în Excel, re-imporți" merge mai departe neatins. Excel și PDF sunt
documentele brandate, de citit și de trimis.

**Fondatorul vede:** în plus, coloana „Companie" în ambele documente.

**Clientul vede:** două butoane, Excel și PDF, în loc de „Exportă". Documentele lui conțin doar flota
și șoferii lui.

> Verificat pe cod real: 26 de controale — inclusiv generarea efectivă a celor patru documente
> (Excel + PDF, pentru fiecare secțiune), verificarea că logo-ul chiar e înglobat și că numele
> fișierului respectă regula „RA-Tracks - Raport … - data". Textul din PDF a fost citit înapoi din
> document, cu diacritice, ca să fim siguri că nu iese ilizibil.

---


### CLIENT · Categorii de permis pe fiecare șofer, cu încadrare automată și raport

**Ce am schimbat:** în fișa șoferului există acum **toate categoriile de pe permisul românesc** — de la
AM și A1 până la CE, DE, tractor, troleibuz și tramvai. Le bifezi ca pe niște butoane, grupate exact
ca pe act: Moto, Auto, Marfă, Persoane, Speciale.

**Încadrarea se face singură.** Dacă bifezi o categorie de marfă sau de persoane (C, CE, D, DE și
rudele lor), omul devine **„Șofer profesionist"**. Dacă are doar A, B, BE sau tractor, rămâne
**„Șofer"**. Se vede pe loc, sub bife, iar în listă apare o etichetă lângă nume. Categoriile care
schimbă încadrarea au un punct lângă cod, ca să se vadă de ce.

**Raportul cerut:** a apărut întâi la *Rapoarte → Monitorizare*, dar **l-am mutat în aceeași zi** pe
butonul „Exportă" din *Șoferi* — vezi însemnarea de mai sus, „Butonul «Exportă»…". Conținutul e
același: câți profesioniști, câți obișnuiți, câți neîncadrați, ce permise expiră.

**Fondatorul vede:** la fel, plus compania fiecărui șofer.

**Clientul vede:** o listă de bife în fișa șoferului, o etichetă în listă și un raport nou.

**Ce am avut grijă să NU stric:** lista de categorii și regula „ce înseamnă profesionist" stau
**într-un singur fișier**. Formularul, lista și raportul o citesc pe aceeași. Dacă mâine se schimbă
legea și o categorie trece dintr-o parte în alta, se schimbă într-un loc și se vede peste tot — nu
rămâne o listă veche prin colțuri, cum s-a întâmplat cu descrierile agenților.

> Verificat pe cod real: 44 de controale automate — inclusiv cazurile murdare (categorii inventate
> trimise din afară, scrise cu litere mici, duplicate, separatori amestecați) și numărătoarea din
> raport pe o flotă cu profesioniști, șoferi obișnuiți, neîncadrați și permise expirate.

---


### AMÂNDOI · Șoferi: ecranul spune acum dacă permisul e valabil și pe ce mașină e omul

**Ce am schimbat:** lista de șoferi arăta doar numele și compania. Restul datelor existau în fișă,
dar nu se vedeau nicăieri. Acum fiecare rând arată **contactul, permisul și vehiculul pe care e pus
șoferul**, iar permisul are o pastilă colorată care spune direct **„mai are 29 zile"**, **„expirat de
43 zile"** sau **„până 17.03.2028"**.

**Partea care aduce bani, nu doar frumusețe:** aplicația avea deja alarmă pentru expirarea
permisului, dar ea pornește numai dacă cineva completează data. La voi, la ambii șoferi, e goală —
deci funcția stătea moartă. Acum, când deschizi ecranul, scrie negru pe alb „fără permis în fișă",
așa că lipsa se vede și se completează.

**Restul schimbărilor:**
- **Vehiculul alocat apare lângă șofer.** Legătura om–mașină exista deja, dar o vedeai doar dinspre
  mașină. Dacă un șofer are mai multe vehicule, apare primul și „+1". Vehiculele arhivate nu se
  numără — omul nu conduce o mașină scoasă din flotă.
- **Poza lipsă devine inițialele lui, colorate.** Înainte toți aveau aceeași siluetă gri, deci lista
  arăta identic pe toate rândurile.
- **Formularul de adăugare nu mai stă deschis permanent.** Ocupa jumătate de ecran chiar dacă nu
  adăugai pe nimeni; acum intră sub butonul „Adaugă șofer" și se închide singur după salvare.
- **Am pus căutare și contor** — nu existau deloc. Cauți după nume, telefon sau număr de permis.
- **Câmpurile goale spun ceva** („fără telefon"), în loc să lase rândul pustiu.

**Fondatorul vede:** în plus, compania fiecărui șofer, scrisă sub nume.

**Clientul vede:** aceeași listă, fără companie. Pe telefon rândul se pliază pe trei linii și
păstrează tot: cine e, contactul, permisul și mașina.

> Verificat pe cod real: 22 de controale automate — inclusiv cazurile-capcană (permis care expiră
> CHIAR AZI trebuie să scrie „expiră azi", nu „expirat"; un șofer cu o singură mașină, arhivată,
> trebuie să apară „nealocat") — plus măsurarea lățimii la 360 și 1180 px.

---


### AMÂNDOI · Lista de vehicule: din tabel searbăd, în carduri care spun starea dintr-o privire

**Ce am schimbat:** ecranul *Management → Vehicule* arăta ca un tabel gol, cu butoane mărunte și
palide. Acum fiecare vehicul e un card, cu o **dungă colorată în stânga**: verde = transmite acum,
portocaliu = tace de câteva ore, gri = mut de peste o zi (sau arhivat). Nu mai trebuie să citești
datele ca să-ți dai seama cine merge și cine nu.

**Pictograma fiecărui vehicul e a lui.** Dacă la editare ai trecut că e camion, în listă apare
camion; dubă → dubă; TIR → TIR. Nu e o listă nouă de desene: e **exact aceeași sursă** din care se
desenează și mașina de pe hartă. Schimbi tipul la „Editare", se schimbă și în listă, automat.

**Restul schimbărilor:**
- Numele vehiculului e mare, iar **numărul de înmatriculare stă sub el**, colorat — înainte era un
  text ca oricare altul.
- La „Ultima transmisie" scrie acum **„acum 4 min"**, cu data completă dedesubt. Ora exactă îți spune
  mai puțin decât cât timp a trecut.
- Butoanele au toate aceeași înălțime și aceeași formă; unul singur e plin cu verde — „Adaugă
  vehicul", ca să se vadă care e acțiunea principală.
- **Verdele scris pe alb era aproape ilizibil.** Pe tema deschisă, textul verde folosește acum o
  nuanță mai adâncă; pe tema închisă rămâne verdele de brand. (E problema notată mai jos, la lista
  de dinaintea lansării — aici e reparată, deocamdată doar pe ecranul ăsta.)
- Coloana „Marcă" a dispărut din listă. Marca e aproape mereu în numele vehiculului („Dacia Logan 3")
  și oricum o vezi la „Editare".

**Fondatorul vede:** în plus față de client, coloana „Companie" — restul e identic.

**Clientul vede:** aceeași listă, fără coloana „Companie". Pe telefon cardul se pliază pe două
rânduri și păstrează ce contează: pictograma, numele, numărul, șoferul și cât timp a trecut.

> Verificat pe cod real, nu pe o machetă: 21 de controale automate (pictograma se schimbă cu tipul,
> culoarea dungii urmărește transmisia, nicio clasă fără stil) plus măsurarea lățimii la 320, 360,
> 768 și 1180 px — niciun rând nu iese din ecran.

---


### AMÂNDOI · Raportul săptămânal a fost scos din aplicație, complet

**Ce am schimbat:** am șters „Raport săptămânal" din tot produsul — pagina din *Analize statistice*,
ecranul din aplicația de telefon, generarea automată de lunea și emailul care pleca odată cu ea.

Nu e o ascundere: modulul, pagina, stilurile și toate rutele de server nu mai există în cod. Am
verificat, după ștergere, că nu a rămas nicio urmă care să ducă la ele.

**De ce contează, dincolo de un buton în minus:** raportul era singurul loc din aplicație care
chema inteligența artificială **fără să treacă prin socoteala noastră**. Textul „Analiză automată"
de sub cifre era scris de Claude, la fiecare companie, în fiecare luni. Costul nu apărea nicăieri
în statisticile de consum și nu scădea din pachetul de apeluri al clientului — mergea în fiecare
săptămână, inclusiv la companii care nu cumpăraseră RA Insight. Odată cu ștergerea, se oprește și
asta.

**Fondatorul vede:** un consum de AI necontorizat care dispare, plus o secțiune mai puțin de
întreținut. Nimic din ce se măsura până acum (apeluri, cost, rată de folosire) nu se schimbă —
raportul oricum nu apărea acolo.

**Clientul vede:** intrarea „Raport săptămânal" nu mai e în meniu, nici pe web, nici pe telefon.
Clienții care primeau lunea emailul cu rezumatul flotei **nu îl vor mai primi**. Pentru aceleași
cifre rămân *Rapoarte* (32 de tipuri, pe orice perioadă) și *Rapoarte programate*, care le poate
trimite tot săptămânal pe email, doar că alese de client.

**Ce am lăsat intenționat:** rapoartele deja generate rămân salvate în baza de date. Nu le mai
citește și nu le mai scrie nimic — sunt doar o arhivă. Ștergerea lor definitivă e o operație
separată, pe care o fac doar dacă îmi spuneți.

> Șterse: modulul de raport, pagina din aplicație, stilurile ei, ecranul din telefon, patru rute de
> server, șase funcții de bază de date și verificarea orară care genera totul singură.

---


### FONDATOR · Testele devin poartă înainte de livrare — `1b69d77`

**Ce am schimbat:** azi, codul ajunge la clienți **și dacă testele sunt roșii**. Railway livrează la
fiecare `git push`, fără să se uite dacă verificările au trecut. Am pățit-o chiar eu în sesiunea
asta: am împins cu testele picate, pentru că o comandă ascundea eroarea.

Cu un singur om atent, treci. Cu doi care livrează des, nu.

**Partea care nu cere cod: Railway are un comutator „Wait for CI"** — pornit, așteaptă ca
verificările să treacă înainte să livreze; dacă pică, livrarea e sărită. E o bifă în panoul lor, la
setările serviciului. **Rămâne s-o pui tu** — n-o pot porni din cod.

**Partea de care m-am ocupat eu:** poarta n-avea sens așa cum era. Verificările automate se uitau
doar la sintaxă și la separarea între companii — **niciuna dintre reparațiile de securitate din
ultimele zile nu era acoperită.** Adică ai fi pornit o poartă care lasă să treacă exact lucrurile de
care ne temem.

Acum verifică, la fiecare livrare, și că:
- un tracker defect nu poate doborî serverul;
- resetarea parolei nu reînvie un cont dezactivat;
- notificarea altei companii nu se poate citi;
- confirmarea către tracker vine după scriere (deci nu se pierd poziții);
- contul de instalare rămâne retras, dar nu vă închide afară;
- comutatorul de notificări stins chiar stinge;
- exportul și ștergerea datelor unui client funcționează.

**Fondatorul vede:** o livrare care se oprește singură când ceva s-a stricat, în loc să ducă
problema la clienți.

**Clientul vede:** nimic. Exact ăsta e scopul.

> 85 de verificări adăugate ca poartă, rulate în serie și probate toate înainte de a le lega.
> Cad la prima problemă, nu la sfârșit.

---


### FONDATOR · Stivă gata de VPS propriu, probată cap-coadă — `b03e5d7`

**Ce am schimbat:** exista deja un fișier de pornire pentru server propriu, dar el pornea aplicația
pe **baza de date de probă** — un fișier, potrivit pentru câteva vehicule, nu pentru sute de
milioane de rânduri. Cine l-ar fi folosit crezând că e de producție ar fi aflat târziu.

Acum există o stivă separată, de producție, cu PostgreSQL adevărat. Și, odată cu ea, ghidul
`DEPLOY-VPS.md` — cu toți pașii rulați efectiv, nu doar scriși.

**Descoperirea care schimbă socoteala de costuri pe care ți-am dat-o ieri:** pe server propriu se
activează **singur** un mecanism care pe Railway nu e disponibil deloc. El comprimă pozițiile vechi
(cu ~85–90%) și le șterge automat după perioada stabilită. Consecințe:

- **Costul de disc scade de câteva ori.** Estimările de ieri erau făcute fără compresie, pentru că
  pe Railway compresia nu există. Pe server propriu, aceeași flotă cere un plan mai mic.
- **Ștergerea automată nu mai depinde de memoria nimănui.** Era pe lista de dinaintea lansării
  tocmai pentru că pornea doar dacă cineva seta o variabilă. Aici pornește de la sine.

**Lucrul care face mutarea posibilă fără deplasări pe teren:** trackerele au înscris în ele un nume
și un port. Numele e al nostru (`gps.ratrack.ro`), deci se mută printr-un rând de DNS. Portul îl
alegem noi pe mașina noastră — **deci îl alegem pe cel pe care îl folosesc deja.** Rezultat: mutarea
înseamnă o schimbare de DNS și **niciun tracker atins**. Ghidul insistă pe punctul ăsta, pentru că e
diferența dintre o seară de lucru și o lună de deplasări.

**Fondatorul vede:** un ghid pe care îl poate urma pas cu pas, și o stivă care pornește corect.

**Clientul vede:** nimic. E despre unde rulează aplicația, nu despre ce face.

> Probat pe calculator, nu presupus: stiva pornită, mecanismul de compresie confirmat activ în bază
> (cu ambele politici înregistrate), un tracker adevărat trimițând pe portul public, iar poziția
> regăsită în PostgreSQL. Am verificat inclusiv că baza NU e expusă pe internet.

**Ceva ce am aflat pe drum și e de fapt o veste bună:** la probă, aplicația a refuzat să dea cookie
de sesiune pe conexiune necriptată. Nu e un defect — e setarea de securitate care își face treaba.
Merită știut, ca să nu pară eroare la prima pornire înainte ca certificatul să fie gata.

---


### AMÂNDOI · Patru reparații care blocau lansarea — `d73cb6a`

**1. Un singur tracker defect putea opri tot serverul.** Fiecare pachet primit spune la început cât e
de lung. Câmpul acela permite până la **4 gigaocteți**, iar serverul aduna cuminte în memorie până
ajungea la cât i se ceruse — abia apoi verifica ceva. Un tracker desincronizat (sau oricine deschide
o conexiune și trimite gunoi) umfla memoria până cădea tot: **toate companiile deodată**.

Acum antetul se verifică *înainte* de a mai aștepta octeți, iar o conexiune care trimite prostii se
închide. Trackerul reconectează curat și retrimite ce n-a fost confirmat, deci nu se pierd poziții.

**2. Resetarea parolei reînvia conturile dezactivate.** Dezactivai un angajat plecat; el cerea „am
uitat parola" pe adresa lui de serviciu și **contul revenea la viață**. Setarea parolei punea
necondiționat contul pe „activ". Nu servea nici măcar invitațiilor — conturile se creează active din
start. Acum: parola și dreptul de acces sunt două lucruri separate, iar un cont dezactivat nici nu
mai primește link de resetare. Mesajul rămâne același ca la un link greșit, ca nimeni să nu poată
afla ce adrese există în sistem.

**3. Regulile de alertă se citeau din bază la fiecare poziție.** Și nu doar ale companiei
respective — **ale tuturor companiilor, de fiecare dată**. Costul creștea cu clienți × poziții, adică
înmulțit, nu adunat. La 1000 de vehicule ar fi epuizat conexiunile spre bază și ingestul s-ar fi
oprit. Acum se țin minte 30 de secunde, iar orice regulă nouă golește memoria — deci intră în vigoare
imediat, nu peste jumătate de minut.

**4. Nu exista nicio cale prin care un client își cere sau își șterge datele.** Obligație legală, nu
opțiune: urmărim poziția unor persoane fizice — șoferii.

Acum sunt două: **exportul** (administratorul companiei își descarcă tot ce ținem despre flota lui) și
**ștergerea**, în doi pași — întâi îți arată exact ce ar dispărea, fără să șteargă, iar ștergerea
propriu-zisă cere numele companiei tastat exact. O confirmare „da/nu" se apasă din greșeală; un nume
tastat, nu.

Două decizii din spate, ca să știți de ce așa:
- **Tabelele se caută la rulare, nu dintr-o listă scrisă de mână.** O listă rămâne tăcut în urmă la
  prima adăugare, iar la o obligație legală „credeam că am șters" e mai rău decât o eroare — nu se
  vede. Ce nu poate fi legat de o companie e **raportat explicit** în export, nu trecut sub tăcere.
- **Traseele brute nu intră în fișier**, ci se numără și se descriu (câte sunt, din ce perioadă). Sunt
  sute de milioane de rânduri; se descarcă separat, pe vehicul, cu exportul care exista deja.

**Fondatorul vede:** două intrări noi în Administrare, pentru export și ștergere.

**Clientul vede:** nimic schimbat în felul în care lucrează. Doar că aplicația nu mai poate fi
doborâtă de un tracker stricat, iar conturile închise rămân închise.

> 30 de verificări, toate trecute — inclusiv trei atacuri reale pe portul de trackere, cu serverul
> verificat că e viu după fiecare. Plus toate suitele vechi: 55 de verificări, niciuna picată.

---

## 2026-08-12

### CLIENT · Raport săptămânal: istoricul primul, iar acum poți cere ORICE săptămână

**Ce am schimbat:** pagina te arunca direct în ultimul raport, cu arhiva ascunsă într-un meniu
derulant, iar butonul de generare făcea **doar ultima săptămână încheiată**. Nu puteai cere o
săptămână anume.

Acum, când intri, vezi **istoricul rapoartelor** — fiecare rând cu perioada, kilometrii și câte
vehicule au fost active; apeși pe el și se deschide. Dedesubt, despărțit de o linie, **„Generează o
săptămână"**: alegi din ultimele 12 săptămâni și apeși butonul verde.

Din raport te întorci cu **„Înapoi la istoric"**.

**Fondatorul vede:** săptămânile deja generate apar bifate în listă, iar dacă alegi una dintre ele
**se deschide raportul existent** în loc să se refacă — altfel s-ar consuma AI degeaba pentru
aceleași cifre. Selectorul arată săptămâni întregi (luni→duminică), nu zile libere, pentru că exact
așa se calculează raportul; un calendar cu zile ar fi lăsat omul să aleagă miercuri–vineri, iar noi
tot săptămâna întreagă i-am fi dat.

**Clientul vede:** intră și are în față toate rapoartele lui. Dacă vrea altă săptămână, o alege
dintr-o listă și apasă „Generează".

---

### CLIENT · „Preț combustibil": sursa rămâne, dar nu mai e un perete de text

**Ce am schimbat:** sub grafic stătea un paragraf lung — sursa, licența, cum se face istoricul, ce
înseamnă linia punctată. Acum se vede doar rândul scurt **„Sursa: PretCarburant.ro"**, iar restul se
deschide la click pe un **„i"** mic de lângă.

**De ce NU am scos-o de tot:** datele de preț vin sub licența **CC BY 4.0**. Aia înseamnă că le poți
folosi gratuit, inclusiv într-un produs pe care îl vinzi, **cu o singură condiție: să scrii de unde
sunt**. Atribuirea e plata. Dacă o ștergem, folosim munca altcuiva în afara înțelegerii — un risc
inutil pentru un produs cu clienți care plătesc.

Pe lângă asta, sursa citată lucrează în favoarea noastră: primul gând al unui patron care vede
prețuri în aplicație e „de unde le știe ăsta?". Fără sursă, răspunsul lui e „le-o fi inventat".

**Fondatorul vede:** atribuirea rămâne permanent pe ecran, cum cere licența — doar explicația s-a
mutat sub „i".

**Clientul vede:** o pagină curată, cu un rând discret în loc de un paragraf. Dacă îl interesează de
unde vin cifrele, apasă „i" și află tot.

---

### AMÂNDOI · „Asistenți AI" scos din meniu — le arăta clienților tokenii noștri

**Ce am schimbat:** în Analize statistice era o intrare „Asistenți AI" care ducea la o pagină cu
patru cartonașe. Pe fiecare scria **„Tokeni in", „Tokeni out"** și **„Cereri API"**.

Pagina aceea **nu era restricționată** — o vedea orice client al oricărei firme. Adică exact
informația tehnică despre care am stabilit că **rămâne între noi**.

Am scos-o din meniu. Nu se mai poate ajunge la ea în niciun fel: nu există navigare prin adresă,
iar butonul era singura cale.

**Fondatorul vede:** nimic pierdut. Aceleași date, mai bine puse, sunt în **Administrare → Utilizare
RA Insight**: apeluri luna asta, cât ne costă, rata de folosire, care clienți au modulul activ și
care îl folosesc efectiv — toate per companie. Aia e restricționată corect la super-admin.

**Clientul vede:** o intrare mai puțin în meniu. Nu pierde nicio funcție — pagina doar număra, nu
făcea nimic. Agenții și RA Insight se folosesc din secțiunile lor, ca până acum.

> **De reținut pentru mine:** când am verificat prima dată că expresia „0 tokeni" nu apare în
> aplicație, am căutat exact acea formulare și am raportat că e curat. Pagina asta scria „Tokeni
> in/out", deci mi-a scăpat. Verificarea a fost prea îngustă.

---

### CLIENT · Tabelul „Flota" din Statistici: capul de tabel stă acum deasupra cifrelor

**Ce am schimbat:** numele coloanelor (KM AZI, CONSUM, VIT. MAX…) erau lipite la stânga, iar cifrele
de sub ele la dreapta — fiecare titlu stătea deasupra altei coloane decât cea pe care o denumea. În
plus, capul de tabel avea un spațiu interior puțin diferit de rânduri, ceea ce mai adăuga o mică
deplasare.

Acum coloanele cu cifre au titlul aliniat la dreapta, ca valorile, iar spațierea e aceeași sus și
jos. „Vehicul" și „Status" rămân la stânga, fiind text.

**Fondatorul vede:** aceeași pagină ca și clientul.

**Clientul vede:** un tabel citibil — te uiți în jos pe o coloană și titlul chiar e deasupra ei.

> Tot aici: bara „Status flotă acum", scoasă într-o versiune anterioară, **a fost pusă la loc**, la
> cererea voastră. Rămâne cum era.

---

### CLIENT · Fișa vehiculului: două butoane scoase, iar din rapoarte dispar iconițele de mașină

**Ce am schimbat:** când dai click pe o mașină, panoul de detalii avea patru butoane: Info, Rute,
**Raport** și **Transport**. Ultimele două duceau spre niște ferestre sărace de raport — deși
aplicația are o **secțiune Rapoarte** întreagă, cu perioadă, mai multe vehicule și export. Două
drumuri spre același lucru, iar cel din fișă era cel slab. Au rămas **Info** și **Rute**.

Din rapoarte am scos și iconițele de mașină care nu spuneau nimic: cea din capul fiecărui bloc de
vehicul (la rapoartele pe mai multe mașini) și cea din eticheta rapoartelor programate. Numele
mașinii se citește singur, nu are nevoie de un desen generic lângă el.

**Fondatorul vede:** ferestrele vechi de raport din fișă nu au fost șterse, doar nu mai au buton —
se pun înapoi dintr-o linie. Iconița din antetul lor a rămas acolo, nefolosită.

**Clientul vede:** fișa vehiculului are două butoane în loc de patru, iar rapoartele sunt curate,
fără mașinuțe decorative.

> **Verificat pe drum:** pictograma din capul fișei vehiculului **era deja** cea corectă pe categorie
> — camion pentru camion, dubă pentru dubă. Camionul din cod e doar un substitut care se înlocuiește
> înainte să se vadă panoul. Aici nu era nimic de reparat.

---

### CLIENT · O singură căutare în „Localizare", iar bifele comandă și lista

**Ce am schimbat:** pe harta „Localizare" erau **două** casete de căutare (una în bara din stânga, una
sus în mijloc) și **două** locuri din care alegeai ce vehicule urmărești (butonul cu bife din stânga
și pastila verde de sus). Două butoane diferite pentru exact același lucru.

Acum bara de sus le face pe toate:
- **bifele de sus comandă și lista din stânga** — bifezi două mașini, în listă rămân două; bifezi tot,
  apar toate. Înainte bifele mișcau doar markerele de pe hartă, iar lista rămânea neschimbată;
- **căutarea de sus filtrează și lista** din stânga, nu doar rezultatele din dropdown;
- în bara din stânga a rămas **doar săgeata** de ascundere a listei.

**Fondatorul vede:** butonul vechi „Alege vehiculele" din stânga scria exact aceeași stare ca pastila
de sus — erau două interfețe peste aceeași valoare. Am lăsat funcția lui în cod, nefolosită, ca să
se poată pune butonul înapoi dintr-o linie dacă vă răzgândiți.

**Clientul vede:** un singur loc de căutat și de bifat, sus. Ce bifează acolo se vede și pe hartă, și
în lista din stânga. Pe telefon, rândul acela din stânga dispare de tot — acolo lista se închide cu
„Înapoi la hartă", deci săgeata nu avea ce căuta.

---

### CLIENT · Titlul secțiunii „Funcții" spune acum ce vindem, nu ce face butonul

**Ce am schimbat:** scria „Tot ce ai nevoie ca să **controlezi flota**". „Control" descrie o funcție,
nu un beneficiu — orice GPS de 5 euro zice la fel. Titlul e acum:

> **Management de flotă**, complet, dintr-un singur ecran
> *Tot ce ai nevoie pentru un control integral.*

Am pus și un **subtitlu** între titlu și paragraf — promisiunea, scurtă și apăsată. Paragraful de
dedesubt l-am rescris ca să nu repete „dintr-o singură platformă" (era deja în titlu) și ca să
numească funcțiile noi: mentenanță, aplicație mobilă.

**Fondatorul vede:** aceeași pagină. „Management de flotă" e și expresia pe care o caută oamenii pe
Google — nu strică să fie chiar în titlu.

**Clientul vede:** un titlu care spune că e vorba de management de flotă, nu doar de urmărire pe
hartă, plus un rând scurt care promite controlul integral.

---

### CLIENT · Secțiunea „Funcții" de pe site era rămasă în urmă — și ne subestima

**Ce am schimbat:** site-ul spunea că avem **„14+ tipuri" de rapoarte**. În catalog sunt **32**.
Ne vindeam la jumătate din cât livrăm. Corectat.

Lipseau și funcții pe care le avem de mult. Am adăugat trei carduri:
**Aplicație mobilă** (Android — harta live, fișa vehiculului, rapoarte, notificări push),
**Mentenanță & documente** (ITP, RCA, revizii, pe dată sau pe kilometri) și
**Istoric traseu & hartă de căldură** (reia orice cursă, lipită pe drum). Secțiunea are acum nouă
carduri, exact trei rânduri de câte trei — nu rămâne niciun gol în grilă.

**Fondatorul vede:** ce e important e ce **nu** am pus. Tahograful și e-Transportul **nu** apar,
pentru că nu sunt gata — exact cum le-a marcat Robert în materialele de prezentare. Site-ul rămâne
o listă cu lucruri care chiar funcționează azi. Când se termină, se adaugă.

**Clientul vede:** trei funcții în plus pe pagina de prezentare și numărul corect de rapoarte.

---

### CLIENT · Iconițele agenților prind viață pe site, ca în aplicație

**Ce am schimbat:** în aplicație, iconițele agenților se animează când treci cursorul peste ele —
fiecare cu o mișcare potrivită rolului. Pe site stăteau nemișcate. Acum fac la fel.

Iconițele de pe site nu sunt aceleași cu cele din aplicație la patru din șase agenți, așa că
mișcarea e potrivită pe desenul de acolo: scutul pulsează (veghează), cheia se rotește (strânge),
frunza se leagănă, **balanța se echilibrează**, **plicul se ridică** (raportul e prezentat), iar
**traseul înaintează**. RA Insight se mișcă tot timpul, nu doar la hover — bagheta se leagănă,
strălucește, și două steluțe sclipesc în jurul ei. E vedeta, deci atrage privirea și fără să pui
mâna pe ea.

**Fondatorul vede:** aceeași pagină. Sunt doar stiluri, nicio logică nouă. Cine are pornit
„animații reduse" în sistem nu vede nimic mișcând — respectăm setarea de accesibilitate.

**Clientul vede:** pe site, iconițele celor șase agenți se animează la trecerea cursorului, iar cea
de la RA Insight se mișcă permanent.

---

### CLIENT · RA Insight lipsea de pe site — vizitatorul vedea doar cei 6 agenți

**Ce am schimbat:** pe pagina publică, secțiunea „Agenți AI" prezenta cei șase agenți, dar
**RA Insight nu apărea nicăieri** — deși în aplicație e instrumentul cel mai vizibil. Un vizitator
care intra pe site nu avea de unde să afle că există.

I-am făcut o bandă proprie, sub cele șase carduri. Nu un al șaptelea card identic — pentru că nu e
același lucru: **cei șase veghează singuri, RA Insight răspunde când îl întrebi tu.** Asta e
diferența pe care o spune și textul, plus trei exemple de întrebări reale, ca omul să înțeleagă din
prima ce poate cere.

**Fondatorul vede:** aceeași pagină ca și clientul. De reținut cum e formulat: diferențierea e pe
**comportament** (automat vs. la cerere), nu pe cum e construit fiecare pe dinăuntru. Pagina nu
spune nicăieri cine consumă și cine nu, nu spune „se vinde cu pachet de apeluri" și nu-l prezintă ca
„singurul cu inteligență artificială reală" — exact regulile stabilite pentru PDF-ul de prezentare,
aplicate acum și pe site. Butonul de la final duce tot la „cere o ofertă personalizată".

**Clientul vede:** pe site, sub cei șase agenți, o secțiune RA Insight care explică pe scurt ce face
și arată trei întrebări-exemplu. Textul din titlu spune acum că, atunci când vrea să afle ceva
anume, întreabă direct asistentul.


### AMÂNDOI · Comutatorul stins chiar stinge — push-urile de viteză nu mai treceau pe lângă el — `3d7df68`

**Ce am schimbat:** ai stins „Depășire viteză" din Preferințe notificări și tot primeai push-uri de
viteză. Nu era o închipuire și nici o întârziere: **sunt două motoare separate care produc aceeași
notificare**, iar ele se uitau la **rânduri diferite** din aceeași listă de preferințe.

- **Evenimentele automate** (aplicația observă singură flota) trimit o notificare marcată „viteză".
  Aceea se uita la rândul „Depășire viteză" — pe ea o stingeai corect.
- **Regulile din secțiunea „Alerte"** (cele create de tine, pe un vehicul sau pe flotă) trimit o
  notificare marcată doar „regulă de alertă". Ce fel de regulă era — viteză, combustibil, ralanti —
  călătorea mai departe într-un colț al mesajului **pe care nu-l citea nimeni**. Așa că ea se uita la
  rândul „Reguli de alertă (secțiunea Alerte)", care era pornit.

Un întrerupător părea că stinge lumina, dar becul era pe celălalt.

Acum, când o regulă de alertă e pe un tip pe care l-ai stins explicit, tace. Fără altă bifă, fără să
trebuiască să știi că există două drumuri.

**Fondatorul vede:** exact ce vede și clientul. Merită știut de unde vine: rândul „Reguli de alertă"
l-am adăugat tot azi (`1333a7c`), ca să repar situația inversă — o regulă de alertă **nu putea
ajunge niciodată** pe telefon, oricâte butoane apăsai. Reparația aceea a pornit soneria; asta o pune
sub comanda ta.

**Clientul vede:** când stinge un tip de notificare, se stinge de tot — indiferent dacă notificarea
vine din supravegherea automată sau dintr-o regulă pe care și-a făcut-o singur.

> Verificat pe 12 situații, cu logica citită direct din server (testul pică singur dacă ea se
> schimbă): viteza stinsă tace pe amândouă drumurile; **combustibilul și zonele sună mai departe** —
> stingerea e țintită, nu amuțește tot; cine n-a atins nimic primește exact ca înainte; iar rândul
> general „Reguli de alertă" rămâne acolo pentru cine vrea liniște completă.

**O capcană rezolvată pe drum:** trei tipuri de regulă nu se numesc la fel ca rândul din preferințe
(„ralanti" ≠ „Idling prelungit", iar supraîncărcarea are trei feluri de reguli și un singur rând).
Fără potrivirea asta, exact acele trei ar fi rămas mai departe surde la comutator.

---

### AMÂNDOI · Încă două motive pentru care push-urile treceau pe lângă comutator — `4a08f14`

Reparația de mai sus a scos la iveală alte două, găsite pornind de la întrebarea „trebuie actualizat
și APK-ul?". Ambele duceau la același lucru: butonul arăta stins, telefonul suna.

**1. Comutatorul principal al unui tip nu oprea push-ul.** Fiecare tip de notificare are un comutator
mare (pornit/oprit) și, sub el, bifele de canal (telefon / email). Serverul se uita **doar la bifa de
telefon**, niciodată la comutatorul mare. Cealaltă cale de notificări îl verifica corect de ani de
zile — aici lipsea pur și simplu.

**Se vedea cel mai urât pe telefon.** Acolo, când stingi comutatorul mare, bifele de canal **dispar
din ecran** — normal, n-ai ce face cu ele. Dar valoarea „telefon: pornit" rămânea salvată dedesubt,
invizibilă. Deci ecranul arăta stins de tot, iar serverul citea exact acea valoare ascunsă și trimitea
mai departe. Nu aveai cum să-ți dai seama uitându-te la aplicație.

**2. Ștergeai pragul de viteză și primeai alerte de la 50 km/h.** Pe telefon, dacă goleai căsuța
pragului — crezând că revii la valoarea implicită de 90 — se salva pragul **zero**. Iar de la zero în
sus înseamnă practic orice deplasare. Pe web era corect; doar telefonul avea greșeala.

**Fondatorul vede:** aceeași reparație.

**Clientul vede:** comutatorul mare stinge de tot, iar căsuța de prag golită înseamnă „lasă cum era",
nu „anunță-mă la orice".

> 20 de verificări, toate trecute. Trei dintre ele confirmă că **gărzile chiar există în server** —
> dacă cineva le scoate mai târziu, testul cade singur, nu trece pe o copie veche a logicii.

**Da, APK-ul a fost refăcut** — reparația pragului trăiește în aplicația de pe telefon. Prima
reparație (cea cu regulile de alertă) e pe server și mergea deja fără actualizare.

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

### CLIENT · Ecran nou pe telefon: „Date CAN" — `da3806a`

**Ce am schimbat:** pe telefon, butonul „Date CAN" din fișa vehiculului deschide acum un **ecran** cu
datele primite de la mașină, în dale — viteză, turație, combustibil (procent și litri), kilometraj,
temperatură, greutate pe axe, AdBlue, consum mediu. Sus: numărul de înmatriculare, starea, ultima
transmisie și VIN-ul, cu buton de copiere.

Înainte era o foaie ridicată de jos. Am făcut-o ecran dintr-un motiv practic: **butonul fizic de
„înapoi" al telefonului nu închide o foaie** — te scotea direct din ecran.

**Fondatorul vede:** în plus, un card „Tehnic" cu voltajul, interfața CAN și IMEI-ul, plus butonul
„Vezi toate semnalele", care aduce lista completă de semnale brute — unealta de diagnoză când un
client întreabă de ce nu-i apare combustibilul.

**Clientul vede:** doar ce transmite mașina lui, fiecare cifră marcată dacă e **citită de la mașină**
sau **calculată de noi**, cu explicația dedesubt.

> **De ce contează marcajul:** un client care vede „113.767 km" trebuie să știe dacă e contorul de
> bord sau o estimare din GPS. Sunt lucruri diferite, iar diferența ajunge în facturi de service.

**Ce am reparat după verificare** (am pus 4 analizatori independenți să caute minciuni în ecran, și au
găsit trei etichete false pe care le scrisesem eu):

1. **Combustibilul.** Marcasem drept „citită" o valoare care, la vehiculele cu sondă montată, e de fapt
   **interpolată de noi** din tabelul de calibrare. Acum eticheta se decide după existența senzorilor.
2. **Kilometrajul la camioane.** Pe magistrala FMS, aceeași cheie înseamnă **odometrul real de bord**,
   nu contorul GPS. Un MAN cu 318.420 km reali ar fi arătat „calculată din GPS".
3. **Consumul mediu.** Scria „din contorul de consum al mașinii" și când cifra venea, de fapt, din
   scăderile de nivel ale rezervorului. Două lucruri diferite.

Plus: turația **chiar se păstrează** până la 15 minute (comentariul meu spunea invers), valorile
imposibile (65535 RPM = semnalul „indisponibil" al magistralei) nu se mai afișează ca reale,
explicațiile sunt text vizibil și nu tooltip — pe telefon un tooltip nu apare niciodată.

---

### AMÂNDOI · Harta 3D nu-ți mai smulge camera din mână — `bdd10f2`

**Ce am schimbat:** pe harta 3D, dacă începeai să navighezi, la câteva secunde camera sărea singură
la mijlocul distanței dintre mașini.

**Cauza:** harta 3D se deschidea pe toată România și era gata de folosit **imediat**, dar încadrarea
pe flotă era legată de momentul în care termina de încărcat stilul hărții — care vine din rețea. Deci
apucai să tragi de hartă, apoi sosea stilul și camera sărea. Cu cât internetul era mai lent, cu atât
mai târziu te trezeai mutat.

Acum: harta se încadrează pe flotă **din prima**, iar încadrarea automată de mai târziu nu mai
pornește dacă ai atins deja harta. Butonul de încadrare, apăsat de tine, funcționează oricând.

**Fondatorul vede:** exact ce vede și clientul.

**Clientul vede:** harta 3D se deschide direct pe mașinile lui, și rămâne unde o lasă.

> Verificat pe cinci situații: harta se deschide încadrată pe flotă; după un gest de mână, încadrarea
> automată nu mai mișcă nimic (cameră neatinsă la 44.43 / 26.10); o mișcare programatică — urmărirea
> unui vehicul — NU blochează încadrarea; iar forțat, se încadrează normal.

**Pe APK — aceeași gardă, alt declanșator.** Harta de pe telefon era deja mai bine păzită: încadrarea
inițială rula o singură dată, focalizarea pe un vehicul o dată per selecție, iar comutarea 2D⇄3D nu
mișca deloc camera. Rămăsese însă o fereastră: harta se deschide tot pe toată România, iar încadrarea
vine **când sosesc pozițiile de la server** — nu când se încarcă stilul. Pe date mobile, între cele
două momente apuci să tragi de hartă.

Acum, dacă ai atins harta, încadrarea automată nu mai pornește. „Urmărește flota" și apăsarea pe un
vehicul rămân neatinse — alea le ceri tu, deci au voie să mute camera.

---

### FONDATOR · APK-ul livrat clienților era o versiune de test — `a71d994`

**Ce am schimbat:** aplicația pe care o instalăm pe telefoane era construită în regim de **depanare**
(„debug"). Sună tehnic, dar are două urmări concrete:

1. **Datele din aplicație se pot citi de pe telefon.** O aplicație de depanare își lasă dosarul intern
   deschis: cine are telefonul și un cablu poate scoate din el, în câteva minute și fără parolă,
   inclusiv jetonul cu care telefonul rămâne conectat la contul șoferului.
2. **Nu se poate actualiza.** Android acceptă o actualizare doar dacă e semnată cu **aceeași cheie**
   ca versiunea instalată. O versiune de test nu are cheia noastră, deci la prima actualizare reală
   fiecare client ar fi trebuit să dezinstaleze și să reinstaleze aplicația de la zero.

Acum aplicația poate fi construită **semnată cu cheia noastră**, iar dacă cheia lipsește, construirea
versiunii de livrare **se oprește cu un mesaj care spune exact ce ai de făcut** — ca să nu se poată
trimite din greșeală, încă o dată, o versiune de test către clienți.

**Fondatorul vede:** un pas nou, o singură dată — creezi cheia și o pui la păstrare (vezi mai jos).
De atunci înainte nu se mai schimbă nimic în felul în care lucrezi.

**Clientul vede:** nimic azi. La prima actualizare a aplicației: aceasta se instalează singură peste
cea veche, păstrându-i setările — în loc să fie nevoie de dezinstalare și reinstalare.

> ⚠ **Ce trebuie să faci tu, o singură dată.** Cheia de semnătură se creează pe calculatorul tău și
> **nu intră niciodată în git** — comanda e scrisă în `mobile/android/keystore.properties.exemplu`.
> Fișierul rezultat (`.jks`) și parolele lui **trebuie păstrate în seiful de parole ȘI într-o copie
> offline.** Dacă se pierd, nu mai există nicio cale de a actualiza aplicația celor care o au deja
> instalată — nici măcar cu ajutorul Google. E singurul lucru din tot proiectul care nu se poate
> reface dacă dispare.

**Două lucruri pe care le-am încercat și le-am dat înapoi, ca să știți de ce nu sunt:**

- *Versiunea de test și cea reală, în paralel pe același telefon.* Ar fi fost util la testare, dar
  Firebase (serviciul de notificări) are înregistrat un singur nume de aplicație. Cu numele schimbat,
  aplicația de test rămânea **fără notificări push** — exact lucrul pe care îl testăm cel mai des.
- *Micșorarea aplicației.* Instrumentul care face asta poate rupe în tăcere notificările și
  localizarea, iar asta se vede abia pe telefonul clientului. Se pornește separat, după o testare pe
  un telefon adevărat — nu în același pas cu semnătura, care e o reparație de securitate.

**Trei lucruri găsite de audit imediat după, în aceeași zonă, reparate odată cu ele:**

- **Jetonul de autentificare urca în copia de rezervă Google a telefonului.** Aplicația avea pornită
  salvarea automată în cloud, iar cheia care ține telefonul conectat la cont stă într-un fișier
  obișnuit de setări. Practic, cheia se plimba prin contul Google al șoferului și ajungea, la
  restaurare, pe orice telefon nou al lui. Acum salvarea în cloud e oprită.
- **Versiunea aplicației era înțepenită la 1.** Fiecare APK arăta ca aceeași versiune — nu puteai
  spune dacă cineva a primit sau nu actualizarea, iar magazinul Google refuză același număr de două
  ori. Acum e într-un singur loc (`mobile/android/variables.gradle`), la 2 / „1.0.0", și crește la
  fiecare livrare.
- **Încă două fișiere care se pierdeau la fel:** cel cu permisiunile aplicației și cel cu versiunile.
  Aceeași poveste ca la semnătură — erau doar pe un calculator. Acum sunt urmărite.

**Ceva ce era gata să se piardă:** folderul aplicației de Android **nu era ținut în git** (e generat
automat de unealta de build). Configurarea semnăturii ar fi existat doar pe calculatorul ăsta și ar
fi dispărut la prima construire de pe alt calculator. Acum fișierul acela e urmărit în git — dar
cheia propriu-zisă rămâne exclusă, ca să nu ajungă niciodată acolo.

---

## De verificat înainte de lansare

Lista pe care o parcurgem împreună înainte de a da drumul la clienți reali. E ordonată **după cât de
tare doare dacă o sărim**, nu după cât e de greu de făcut.

- **(voi)** — nu pot s-o fac eu din cod: cere o decizie, un cont, un certificat sau o hârtie.
- **(eu)** — o fac eu, dar trebuie s-o știți, fiindcă ține de ce puteți promite unui client.

---

### A. Blocante — fără astea nu dăm drumul

- [ ] **(eu) DE SCOS LA LANSARE: comutatorul „Fondator / Admin de firmă" din Setări. Hotărât de
  Alin, 03.09.** E o schelă de probă, nu o funcție a produsului: l-am pus ca să nu ne mai încurcăm
  între ce vedem noi și ce vede clientul cât timp construim. Când dăm drumul aplicației, iese —
  altfel rămâne în cod un buton care nu are ce căuta acolo și pe care, peste un an, nimeni nu-și mai
  amintește de ce e. **Nu e periculos** dacă rămâne (nu dă și nu ia niciun drept, iar clientul nu-l
  vede), dar l-am pus aici tocmai ca să nu se strecoare din uitare.

  **Ce se șterge, concret** (toate bucățile sunt marcate în cod cu „⚠ TEMPORAR"): blocul dintre
  reperele „Comutatorul de privire" din `public/index.html`, cele două rânduri din `setRenderNav`
  care îl desenează, `<div id="set-banda">`, cele patru cârlige din ecranul Utilizatori
  (`renderUsersGrouped`, `_populateNewUserForm`, `addUser`), stilurile `.set-ochi` / `.set-banda` /
  `.set-firma` din `public/css/app.css` și secțiunea 7 din `verify_setari.js`. Restul aplicației nu
  se atinge — meniul și lista de utilizatori se generează la fel și fără el.


- [ ] **(voi) Cheia de semnătură a aplicației de telefon — de creat și de pus la păstrare.** Cel mai
  ireversibil punct din toată lista: fără ea nu se pot trimite actualizări celor care au deja
  aplicația instalată, iar dacă se pierde după lansare **nu există nicio soluție** — clienții rămân
  pe versiunea veche pentru totdeauna. Comanda e în `mobile/android/keystore.properties.exemplu`.
  Până se creează, construirea versiunii de livrare se oprește singură, cu instrucțiunile pe ecran.
  *(Robert a spus că se ocupă — 26.08.)*

- [ ] **(voi) Emailul serverului — de configurat pe Railway și de probat cu o adresă reală.** Cerut de
  Alin, 02.09. Fără el, aplicația merge, dar **tot ce înseamnă „îți trimitem un email" nu pleacă**, iar
  asta se vede abia la primul client. Ce depinde de configurare, în ordinea în care doare:

  1. **Invitația către administratorul firmei** — exact pasul cu care începe orice contract nou. Fără
     email, contul lui nu se poate deschide decât dictându-i o parolă la telefon.
  2. **Invitațiile pe care le trimite el echipei lui** (dispecer, manager) — la fel.
  3. **Resetarea parolei** — orice om care își uită parola rămâne blocat până îl ajută cineva de mână.
  4. **Confirmarea adreselor din agenda firmei** — o adresă neconfirmată nu primește nimic, deci
     alertele și rapoartele către `dispecerat@` nu pleacă niciodată.
  5. **Rapoartele programate pe email** și **alertele pe email** — funcția pe care o vindem.
  6. Formularul de suport și înștiințările despre cererile de demo.

  **Ce trebuie pus** (variabile de mediu, în Railway): `SMTP_HOST`, `SMTP_PORT` (587, sau 465 cu
  `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (adresa de pe care pleacă, de pildă
  `noreply@ratrack.ro`) și `BASE_URL=https://ratrack.ro` — ultima e cea din care se compun linkurile
  din emailuri; fără ea, linkul se construiește din adresa cererii și poate ieși greșit.

  **Cum se probează, în trei minute:** creezi o companie de probă cu adresa ta reală ca administrator,
  **fără parolă**. Dacă mesajul de la final zice „invitația a plecat la …" și emailul chiar ajunge (și
  **nu în Spam** — verifică și acolo), e gata. Dacă nu ajunge, mai sunt de pus SPF și DKIM la domeniu,
  altfel mesajele noastre vor fi tratate ca spam de Gmail și Outlook.

  Aplicația **nu minte** cât timp nu e configurat: la companie nouă și la utilizator nou refuză din
  start invitația și îți spune să scrii o parolă; la adrese de email spune că mesajul de confirmare
  n-a plecat. Deci nu e periculos — dar e o promisiune pe care n-o putem ține în fața unui client.


- [ ] **(voi) Un cont de test ca utilizator obișnuit.** Testați totul ca super-admin, care trece prin
  toate porțile. Ecranele goale, mesajele „nu ai acces" și ce vede de fapt un client **nu le-a văzut
  niciunul dintre voi**. E cel mai ieftin mod de a găsi lucruri rupte înainte s-o facă un client.

- [ ] **(voi) Ce vedem noi din conturile clienților** — decizia cea mai mare, are secțiune proprie
  mai jos: [Ce vedem din conturile clienților](#decizie-ce-vedem-din-conturile-clienților). E
  blocantă din două motive: notificările (cu push pornit, la 30 de companii telefoanele vă sună
  continuu și îl veți opri de tot) și politica de confidențialitate — ce le spuneți clienților
  despre ce vedeți.

- [ ] **(voi) Cele trei module de conformitate — ce direcție luăm (cerut de Alin, 26.08).**
  **Taxa de drum**, **e-Transport** și **Tahograf** sunt trei categorii separate, de discutat
  împreună **spre finalul testării**, când o să știți deja cum se poartă aplicația pe teren.
  Pentru fiecare, aceeași întrebare: **rămâne unealtă de informare, sau devine serviciu?**
  - **Taxa de drum** — azi e un CALCULATOR: îți spune cât te va costa, nu cumpără nimic. Varianta
    „serviciu" ar însemna vânzare de roviniete/taxe prin aplicație (în cod există o listă de
    furnizori — DKV, Shell, AS24, Eurowag, Telepass — rămasă de la un modul demonstrativ, care nu
    face nimic). Aia ar fi altă afacere: contract cu distribuitor, plăți, răspundere.
  - **e-Transport** — azi e evidență internă: termene și stare. Varianta „serviciu" e raportarea
    efectivă la ANAF în locul clientului, cu dovada transmisiei. Vezi grupa E de mai jos.
  - **Tahograf** — azi citește fișierele descărcate de client. Varianta „serviciu" ar fi
    descărcarea automată de la distanță (cere echipament separat în camion).
  Decizia nu e tehnică, e de produs: fiecare pas către „serviciu" aduce bani, dar și obligații pe
  care le luăm asupra noastră. De-aia se discută la sfârșit, nu acum.

- [ ] **(voi) Ce module vindem de la lansare.** Dacă e-Transport intră în ofertă din prima zi, atunci
  punctele din secțiunea E de mai jos devin și ele blocante. Dacă nu, secțiunea rămâne evidență
  internă și se anunță ca „în lucru". **Nu se poate vinde ca „raportăm la ANAF în locul tău" în
  starea de acum** — vezi E.1.

---

### B. De decis împreună (produs, nu cod)

- [ ] **Notificările se revizuiesc înainte de lansare — hotărât de voi, 04.08.** Rămân deocamdată
  cum sunt; le testați pe teren și veniți cu ce nu merge. Când ajungem la revizuire, aici sunt
  lucrurile de pus pe masă: cine primește ce, pragurile și răcirea de 5 minute, ce ajunge pe telefon
  și ce rămâne doar în clopoțel, și dacă tipurile de alertă acoperă ce cer clienții.

- [ ] **Furtul de combustibil e OPRIT pentru companiile care nu și-au setat pragul.** Decizia din
  26.07 („prag nesetat = utilizatorul a ales Dezactivat") e corectă ca principiu, dar un client nou
  nu are de unde ști că trebuie să intre în setări ca să primească alertele. De ales una din două:
  fie punem un prag implicit rezonabil la crearea companiei, fie scriem explicit în interfață
  „detecția e oprită până setezi un prag". Acum nu se vede nici una, nici alta. *(20.08)*

- [ ] **Turația motorului ajunge la client pe telefon, dar nu pe web.** Pe web, RPM-ul e vizibil DOAR
  super-adminului; ecranul de pe telefon îl arată oricui. E o schimbare de produs, nu de interfață:
  fie o acceptăm și pe web, fie o restrângem pe telefon.

- [ ] **Ecranul „Date CAN" nu are pereche pe web.** Acolo informația e împrăștiată între fișa
  vehiculului și panoul „IO Live". Dacă îl vreți și pe web, e o lucrare separată.

- [ ] **Cele cinci semnale CAN care nu se aprind niciodată.** Ambreiaj, închidere centralizată și
  cele trei apăsări de telecomandă. Fișa adaptorului le listează, noi nu știm unde le pune aparatul
  în mesaj, iar ghicitul ar aprinde martori greșiți. Scrie „necitit" pe ele, deci nu induc în eroare
  — dar de decis: fie obținem foaia de biți de la Teltonika, fie le probăm pe o mașină, fie le
  scoatem din listă ca să nu ridice întrebări. *(22.08)*

---

### C. De reparat înainte de clienți reali

- [ ] **(eu) „Chei API" e capitol al clientului — de mutat pe „la cerere". Hotărât de Alin, 03.09.**
  Acum, orice admin de firmă poate intra în Setări → Chei API și își face singur o cheie. Cheia e o
  parolă permanentă care vede tot ce vede omul pentru care a fost făcută, și prin ea se poate trage
  automat, la nesfârșit, tot ce are firma în aplicație. Nu vrem să se dea singură: **o dăm noi, la
  cerere, și o legăm de abonament.** De făcut: capitolul dispare din Setările clientului (rămâne la
  noi), iar cine are nevoie ne cere. De decis odată cu asta: intră în prețul de bază sau se plătește
  separat — vezi „Ofertare Live".


- [ ] **(eu) Eticheta falsă „Consum azi (senzor)" din aplicația de telefon.** Fișa vehiculului o
  afișează MEREU, inclusiv pe mașini fără niciun senzor, fiindcă ruta nu întoarce niciodată câmpul pe
  care se bazează. E o minciună pe ecran, exact genul pe care nu ni-l permitem.

- [ ] **(eu) Verdele aplicației e aproape ilizibil pe tema luminoasă** (nu e redefinit pentru fundal
  alb). Afectează toate ecranele, nu doar unul.

- [ ] **(eu) Editorul de Zone n-are selector de companie.** Zonele desenate de voi rămân fără
  companie. Funcționează, dar nu le puteți atribui unui client anume.

- [ ] **(voi) Rapoartele săptămânale rămase în baza de date.** Funcția a fost scoasă pe 13.08, dar
  rapoartele generate până atunci sunt încă salvate și nu le mai citește nimic. De hotărât dacă le
  ștergem definitiv sau le păstrăm ca arhivă.

---

### D. De confirmat din afară (nu depinde de cod)

- [ ] **(voi) Un fișier `.DDD` adevărat, de la un șofer profesionist.** Cititorul de tahograf e
  verificat cu fișiere construite de mine după specificație — ceea ce **nu dovedește nimic** dacă am
  înțeles greșit specificația: și constructorul, și cititorul ar greși la fel. Când apare unul real,
  e o oră de lucru să-l confrunt.

- [ ] **(voi) Grila TollRo: valorile marcate cu ⚠ și data de aplicare.** Treapta 7,5–12 t și
  pozițiile intermediare pe Euro 4/5 nu erau publicate la 20.08 — sunt estimările noastre. La
  apariția ordonanței se corectează din Administrare → Taxa de drum, fără deploy.

- [ ] **(voi) ANAF: cum se numără exact cele 5 zile ale codului UIT** (de la data declarată, inclusiv
  sau exclusiv ziua de start) și **schema declarației**, validată pe mediul de test. Vezi `ANAF.md`.

---

### E. e-Transport — infrastructura e pusă, secțiunea NU e terminată

Scadențarul e gata și funcționează (termene, stare, cine trebuie rezolvat acum). Dar în starea de
acum e **evidență internă**, nu conformitate: nu se trimite nimic la ANAF. Ce mai trebuie, în
ordinea în care contează:

- [ ] **E.1 — (voi, apoi eu) Tokenul ANAF e UNUL SINGUR, pe toată platforma.** `anaf.js` citește un
  singur `ANAF_ETRANSPORT_TOKEN` și un singur `ANAF_CIF` din variabilele serverului. Adică putem
  raporta pentru **o singură firmă** — a noastră. Fiecare client declară sub CIF-ul LUI, cu tokenul
  LUI, obținut cu certificatul LUI digital. Ca să vindem modulul, tokenul și CIF-ul trebuie mutate
  **pe companie**, în setările fiecărui client, criptate. **Asta se hotărăște prima**, fiindcă
  schimbă forma secțiunii — restul e degeaba dacă asta se face altfel.

- [ ] **E.2 — (eu) Mecanismul de trimitere nu verifică prospețimea poziției.** Ecranul o verifică
  deja; worker-ul care trimite la ANAF ia ultima poziție știută chiar dacă e veche de o oră — adică
  **ar declara o poziție falsă**. De reparat OBLIGATORIU înainte de a porni tokenul, altfel primul
  lucru pe care îl facem în producție e să transmitem date greșite.

- [ ] **E.3 — (eu) Dovada trimiterilor către ANAF.** Se ține o singură dată — ultima trimitere —
  suprascrisă mereu. Dacă ANAF spune „între 14:00 și 16:00 n-ai transmis", n-avem cu ce răspunde.
  E piesa cea mai valoroasă care lipsește: singurul care poate dovedi transmisia e furnizorul de GPS,
  adică noi. (Butonul „Descarcă dovada" din varianta 3 a machetelor.)

- [ ] **E.4 — (eu) Fără reîncercare și fără alertă.** Dacă ANAF pică sau tracker-ul tace, nu se
  reîncearcă nimic și nu află nimeni. Nicio notificare la „UIT expiră în 6 ore" sau „transportul nu
  mai transmite de 20 de minute".

- [ ] **E.5 — (eu) Emiterea codului UIT din aplicație n-are buton.** `anaf.js` știe să depună
  declarația și să aducă înapoi codul, dar formularul n-are câmpurile cerute de ANAF (marfă, cod
  tarifar, greutăți, expeditor, rută).

- [ ] **E.6 — (eu) Amănunte rămase.** Cadența de 3 minute a trimiterilor nu e verificată cu
  specificația ANAF. Pornirea/oprirea transportului se face de mână, deși aplicația știe când pleacă
  și când ajunge camionul. Pe telefon secțiunea e tot listă read-only, deși șoferul e cel care are
  nevoie de codul UIT la un control. Și e cod mort de curățat: rutele demo `/uit`, `/start`, `/stop`,
  `/sim` n-au buton nicăieri, iar meniul intern trimite către trei ecrane care n-au fost construite
  niciodată (`etransport-view`, `etoll-view`, `tahograf-view`).

**Ordinea de lucru, când vă apucați:** decideți E.1 → repar E.2 → Robert ia tokenul din SPV →
testăm împreună pe mediul de test ANAF → producție. E.3–E.6 se pot face în paralel, dar nimic nu se
pornește în producție înainte de E.2.

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
