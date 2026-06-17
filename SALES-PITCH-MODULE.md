# Ghid de vânzare — 3 Module strategice (e-Transport · E-Toll/Roviniete · Tahograf)

> Pentru discuțiile cu clienții, când le arăți ecranele **„pregătite"** (demo-ready).
> Regula de aur: **prezinți onest** — „interfața și fluxul sunt gata, activarea reală se face în câteva zile după ce primim accesul/documentele". Nu promiți că datele de pe ecran sunt deja live.

---

## 0. Cum deschizi discuția (framing)

> „Platforma noastră nu e doar tracking pe hartă. Avem deja construite trei module care vă rezolvă **bătăile de cap legale**: e-Transport ANAF, taxele de drum din Europa și tahograful. Vă arăt acum **exact cum vor arăta și cum funcționează** — datele de pe ecran sunt demonstrative; le activăm cu datele dvs. reale după ce montăm echipamentul și primim accesele."

Avantajul psihologic: clientul **vede produsul finit**, nu un PowerPoint. Vede butoane care răspund, grafice care se mișcă, o încălcare de tahograf cu bulină roșie. Asta vinde.

---

## 1. MODUL e-Transport (ANAF)

### Ce vede clientul în demo
- Formular curat: vehicul, marfă, adrese plecare/sosire.
- Apasă **„Obține Cod UIT"** → spinner → apare un cod (`UIT_DEMO_…`).
- Apasă **„Start Transport"** → pornește un flux live de coordonate GPS „trimise ✓ din minut în minut" către ANAF (coada de trimitere se vede în timp real).

### Argumentul de vânzare
> „Legea vă obligă să transmiteți poziția GPS la ANAF pe toată durata transportului de bunuri cu risc fiscal ridicat. Cu noi, **trackerul din mașină face asta automat** — fără telefon, fără aplicații separate, fără amenzi de până la 100.000 lei pentru lipsa transmisiei."

### Ce montăm (hardware)
- **Teltonika FMC650** (heavy-vehicle, recomandat pe camioane) sau **FMC130/FMB920** pe vehicule ușoare.
- Cartelă SIM cu date (M2M) — o punem noi sau o aduce clientul.

### Ce documente/accese ne pune clientul la dispoziție pentru activarea REALĂ
1. **Certificat digital calificat** (token/SPV ANAF) al firmei — cu care semnăm cererile către API-ul e-Transport.
2. **Acces în SPV** (Spațiul Privat Virtual ANAF) sau delegare pentru serviciul e-Transport.
3. CUI-ul firmei + datele de identificare ale transporturilor (tip marfă, coduri).

> Tehnic la noi: când punem `anaf_token_connected = true` + tokenul, modulul trece automat de la simulare la API-ul real. Codul e deja scris pentru comutare.

---

## 2. MODUL E-Toll & Roviniete

### Ce vede clientul în demo
- Tabel cu **acte vehicul** (Rovinietă / RCA / ITP) cu dată de expirare colorată (verde/galben/roșu) + buton de adăugare.
- Grafic **E-Toll Europa**: cost estimat pe țări (România, Ungaria, Austria, Slovacia, Germania) + total în EUR, calculat din **kilometrii citiți de GPS prin CAN-bus**.
- Selector furnizor extern: **DKV / Shell / AS24 / Eurowag / Telepass**.

### Argumentul de vânzare
> „Nu mai țineți evidența în Excel și nu mai luați amenzi pentru rovinietă/RCA/ITP expirat — platforma vă **alertează automat cu 7, 3 și 1 zi înainte**, pe email și în aplicație. Iar pentru transport internațional, vedeți **cât vă costă taxele de drum pe fiecare țară**, din kilometrii reali ai mașinii."

### Ce montăm (hardware)
- Același tracker **Teltonika** cu **conexiune CAN-bus / FMS** (pentru kilometrii reali din computerul mașinii — esențial pentru calculul taxelor de drum).

### Ce documente/accese ne pune clientul la dispoziție
1. **Datele de expirare** ale actelor (Rovinietă, RCA, ITP) — sau le importăm din pozele/documentele lor; opțional integrare cu un API de verificare auto.
2. Pentru taxele de drum reale: **contract cu un furnizor** (DKV/Shell/AS24 etc.) + acces la API-ul lor (sau facturile pentru reconciliere).
3. Confirmarea că vehiculul are **FMS/CAN activ** (la camioane — uneori trebuie activat din service).

---

## 3. MODUL Tahograf

### Ce vede clientul în demo
- Listă șoferi cu **bară de progres pe 28 de zile** (ciclul legal de descărcare a cardului) — verde/portocaliu/roșu („DEPĂȘIT").
- Apasă **„Descarcă card la distanță"** → bară de progres 5 secunde („Conectare K-Line → autentificare → blocuri activitate → semnătură → analiză").
- Apare o **analiză vizuală curată**: timeline condus/odihnă/lucru, grafic ore, și o **încălcare evidențiată cu bulină roșie** („Condus continuu > 4h30 fără pauză", Reg. CE 561/2006).

### Argumentul de vânzare
> „Sunteți obligați legal să descărcați cardurile șoferilor la fiecare 28 de zile și să le arhivați. Cu noi se face **automat, de la distanță, prin GPS** — fără ca șoferul să vină la sediu, fără stick-uri. Iar sistemul vă **găsește singur încălcările** înainte să o facă ITM, și vă scutește de amenzi de mii de euro."

### Ce montăm (hardware)
- **Teltonika FMC650** cu cablu de tahograf (**K-Line** pe panoul frontal sau **CAN** pe conectorul C/D al tahografului VDO/Stoneridge).
- Firmware FMC650 ≥ 03.00.14 pentru tahografe Smart Gen 2.

### Ce documente/accese ne pune clientul la dispoziție pentru activarea REALĂ
1. **Cardul de companie** (Company Card) — obligatoriu, fără el tahograful nu eliberează datele.
2. **IP/host server de stocare** carduri companie (Company Card Hosting) — unde se arhivează fișierele .DDD.
3. Activarea **Remote Data Download (RDD)** pe tahograf (Update Card VDO / parametru D8 Stoneridge — la service).
4. Lista șoferilor + numerele cardurilor.

> Tehnic la noi: variabila `company_card_host` e deja pregătită; când o setezi, modulul trece de la analiza simulată la descărcarea reală prin tracker.

---

## 4. Pachet hardware recomandat (rezumat)

| Vehicul | Tracker | Conexiuni necesare |
|---|---|---|
| Camion (tahograf + e-Transport + E-Toll) | **Teltonika FMC650** | GPS + CAN/FMS + cablu tahograf (K-Line/CAN) + SIM |
| Autoutilitară / vehicul ușor | **FMC130 / FMB920** | GPS + (opțional CAN) + SIM |

**Costuri de discutat cu clientul:** tracker (achiziție unică) + montaj + abonament lunar/vehicul (include platforma + transmisia date) + cartela SIM.

---

## 5. Răspuns la obiecții

**„Dar datele de pe ecran nu sunt reale acum?"**
> „Corect, ce vedeți acum e un demo cu date demonstrative — ca să vedeți exact produsul finit. Interfața și logica sunt **gata**. Activarea reală durează câteva zile după ce montăm trackerul și primim accesele (token ANAF / card companie / contract toll). Nu plătiți pentru ceva ce nu funcționează — activăm modul cu modul, pe măsură ce sunt gata."

**„De ce să vă aleg pe voi și nu AROBS?"**
> „Suntem mai accesibili ca preț, interfața e modernă (o folosiți și de pe telefon), avem **agenți AI** care vă găsesc singuri problemele, și suntem 100% în limba română. Pentru o flotă mică-medie, sunteți operaționali rapid, fără implementare scumpă și lentă."

**„Cât durează până sunt operațional?"**
> „Tracking-ul live și rapoartele — **din ziua montajului**. e-Transport / Tahograf / E-Toll real — în 1-3 săptămâni, în funcție de cât de repede ne dați accesele (token ANAF, card companie, contract toll)."

---

## 6. Checklist activare reală (de bifat cu clientul, per modul)

- [ ] **e-Transport:** certificat digital ANAF + acces SPV + CUI
- [ ] **E-Toll:** date expirare acte (sau poze) + contract furnizor toll + CAN/FMS activ pe camion
- [ ] **Tahograf:** card companie + IP server stocare + RDD activat pe tahograf (service) + listă șoferi
- [ ] **Hardware:** tracker montat + SIM activ + (camion) cablu tahograf + CAN conectat
