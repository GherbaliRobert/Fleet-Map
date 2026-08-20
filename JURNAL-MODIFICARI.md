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

## 2026-08-20

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

- **Furtul de combustibil e OPRIT pentru companiile care nu și-au setat pragul.** Decizia din
  26.07 („prag nesetat = utilizatorul a ales Dezactivat") e corectă ca principiu, dar un client nou
  nu are de unde ști că trebuie să intre în setări ca să primească alertele. De ales una din două:
  fie punem un prag implicit rezonabil la crearea companiei, fie scriem explicit în interfață
  „detecția e oprită până setezi un prag". Acum nu se vede nici una, nici alta. *(20.08)*

Lista pe care o parcurg cu voi înainte de a da drumul la clienți reali.

- [ ] **Cheia de semnătură a aplicației de telefon — de creat și de pus la păstrare.** Cel mai
  ireversibil punct din listă: fără ea nu se pot trimite actualizări celor care au deja aplicația
  instalată, iar dacă se pierde după lansare nu există nicio soluție. Comanda e în
  `mobile/android/keystore.properties.exemplu`. Până se creează, construirea versiunii de livrare
  se oprește singură, cu instrucțiunile pe ecran.
- [ ] **Notificările se revizuiesc înainte de lansare — hotărât de voi, 04.08.** Rămân deocamdată
  cum sunt; le testați pe teren și veniți cu ce nu merge. Când ajungem la revizuire, aici sunt
  lucrurile de pus pe masă: cine primește ce (vezi punctul următor), pragurile și răcirea de 5
  minute, ce ajunge pe telefon și ce rămâne doar în clopoțel, și dacă tipurile de alertă acoperă
  ce cer clienții.
- [ ] **Ce vedem noi din conturile clienților** — decizia cea mai mare. Are secțiune proprie mai
  jos: [Ce vedem din conturile clienților](#decizie-ce-vedem-din-conturile-clienților).
- [ ] **Editorul de Zone n-are selector de companie.** Zonele desenate de voi rămân fără companie.
  Funcționează (motorul le acceptă), dar nu le puteți atribui unui client anume.
- [ ] **Eticheta falsă „Consum azi (senzor)" din APK.** Fișa vehiculului o afișează MEREU, inclusiv pe
  mașini fără niciun senzor, fiindcă endpointul nu întoarce niciodată câmpul pe care se bazează. Nu am
  propagat-o pe ecranul nou, dar în fișă e încă acolo.
- [ ] **Turația motorului ajunge acum la client, pe telefon.** Pe web, RPM-ul e vizibil DOAR
  super-adminului. Ecranul nou îl arată oricui — pentru că așa arăta și modelul cerut. E o schimbare
  de produs, nu de interfață: fie o acceptăm și pe web, fie o restrângem pe telefon. De decis împreună.
- [ ] **Ecranul „Date CAN" nu are pereche pe web.** Acolo informația e împrăștiată între fișă și panoul
  „IO Live". Dacă îl vreți și pe web, e o lucrare separată.
- [ ] **Verdele aplicației e aproape ilizibil pe tema luminoasă** (nu e redefinit pentru fundal alb).
  Afectează toate ecranele, nu doar cel nou.
- [ ] **Contul de test ca utilizator.** Deocamdată testați totul ca super-admin, care trece prin
  toate porțile. Ecranele goale și mesajele „nu ai acces" nu le vede niciunul dintre voi.
- [ ] **Rapoartele săptămânale rămase în baza de date.** Funcția a fost scoasă din aplicație pe
  13.08, dar rapoartele generate până atunci sunt încă salvate. Nu le mai citește nimic. De hotărât
  dacă le ștergem definitiv înainte de lansare sau le păstrăm ca arhivă.

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
