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

## De verificat înainte de lansare

Lista pe care o parcurg cu voi înainte de a da drumul la clienți reali.

- [ ] **Notificările se revizuiesc înainte de lansare — hotărât de voi, 04.08.** Rămân deocamdată
  cum sunt; le testați pe teren și veniți cu ce nu merge. Când ajungem la revizuire, aici sunt
  lucrurile de pus pe masă: cine primește ce (vezi punctul următor), pragurile și răcirea de 5
  minute, ce ajunge pe telefon și ce rămâne doar în clopoțel, și dacă tipurile de alertă acoperă
  ce cer clienții.
- [ ] **Super-adminul primește notificările tuturor clienților.** `getUsersForImei` (db.js:2637)
  include `role = 'superadmin'` necondiționat, pentru orice vehicul. Cu 3 companii merge; la 30 vă
  veți opri push-ul cu totul. **Contrazice și ce ați spus voi:** nu vreți să vedeți ce face fiecare
  companie. → de decis: primiți doar notificările de platformă + companiile pe care le bifați?
- [ ] **Editorul de Zone n-are selector de companie.** Zonele desenate de voi rămân fără companie.
  Funcționează (motorul le acceptă), dar nu le puteți atribui unui client anume.
- [ ] **Contul de test ca utilizator.** Deocamdată testați totul ca super-admin, care trece prin
  toate porțile. Ecranele goale și mesajele „nu ai acces" nu le vede niciunul dintre voi.

---

*Jurnalul începe azi, 2026-08-04. Ce e mai vechi nu e catalogat aici — dacă vreți, îl completez
retroactiv din istoricul git.*
