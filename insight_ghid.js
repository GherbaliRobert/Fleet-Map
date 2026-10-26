// insight_ghid.js — „Ghidul aplicației": cum se face ceva în RA Track, pas cu pas (Alin, 02.10: ramura din RA Insight).
//
// Citit e GRATUIT (ramura „Ghidul aplicației" din secțiunea RA Insight arată textele de aici). RA Insight îl folosește
// și el (unealta `cauta_in_ghid`), ca la „cum programez un raport pe email?" să răspundă cu pașii ADEVĂRAȚI, nu din
// memoria modelului. Regula: fiecare pas trebuie să existe azi în aplicație, cu numele butonului de pe ecran. Când se
// schimbă un ecran, se schimbă și textul de aici (păzit, pe etichetele-cheie, de verify_insight_ghid.js).
'use strict';
const I = require('./insight');

const SECTIUNI = [
  {
    cheie: 'localizare', titlu: 'Unde e o mașină acum', unde: 'Meniu → Localizare (ecranul de pornire)',
    pasi: [
      'Scrie numărul, numele sau IMEI-ul în caseta „Caută vehicul, IMEI, nr…" din bara de sus.',
      'Apasă mașina în lista din stânga: harta merge la ea și se deschide fișa din dreapta, cu filele „Info" și „Rute".',
      'În „Info" vezi adresa (cu „Street View"), starea (în mișcare, staționată, oprită), contactul, combustibilul, kilometrajul și „Statistici azi".',
      'Pe hartă, apasă marcajul mașinii pentru butoanele „Detalii", „Urmărește" și „Localizare" (Google Maps sau Waze).'
    ],
    detalii: 'Cadranele de deasupra listei (Total, Pornit, În mișcare, Staționat, Oprit) filtrează lista. „Urmărește" ține harta pe mașină; se oprește când tragi de hartă sau alegi altă mașină.',
    cuvinte: ['unde e', 'unde este', 'unde se afla', 'harta', 'live', 'acum', 'localizare', 'pozitie', 'cauta', 'urmareste', 'street view', 'waze']
  },
  {
    cheie: 'traseu', titlu: 'Traseul unei mașini pe o perioadă', unde: 'Meniu → Traseu',
    pasi: [
      'La „Lista vehicule" apasă „Alege vehiculele", bifează mașinile și apasă „Aplică".',
      'La „Interval orar" completează „De la" și „Până la", sau apasă „Azi", „Ieri", „7 zile".',
      'Apasă „Încarcă traseul".',
      'Bifează o singură mașină ca să vezi „Sumar traseu", redarea pe hartă și butoanele „Limite reale" și „Aliniază pe drumuri".',
      'Descarcă cu „Excel" (sumar + fiecare poziție, cu numele RA Track) sau „KML".'
    ],
    detalii: 'Intervalul poate fi de cel mult 92 de zile. „Limite reale" colorează cu roșu porțiunile unde s-a depășit limita drumului.',
    cuvinte: ['traseu', 'istoric', 'pe unde a fost', 'drum', 'excel', 'kml', 'limite reale', 'redare', 'poziții']
  },
  {
    cheie: 'rapoarte', titlu: 'Un raport, descărcat în Excel sau PDF', unde: 'Meniu → Rapoarte → „Generează rapoarte"',
    pasi: [
      'Alege categoria (Monitorizare, Consum carburant, Date CAN, Senzori, Evenimente & zone, Siguranță & EcoDrive) și apasă cardul raportului.',
      'La „Vehicul" alege o mașină sau „Toată flota"; la „Interval orar" alege perioada (sau „Azi", „Ieri", „7 zile", „30 zile").',
      'Apasă „Generează", apoi „Vezi raportul".',
      'Sub tabel, la „Descarcă:", apasă „Excel" sau „PDF" (fișierul are numele și logo-ul RA Track); „Rezumă cu RA Insight" scrie pe scurt, deasupra raportului, ce arată.'
    ],
    detalii: 'Fila „Istoric rapoarte" păstrează rapoartele generate 7 zile, apoi se șterg singure — și pe cele cerute din RA Insight (cu eticheta „din RA Insight").',
    cuvinte: ['raport', 'rapoarte', 'genereaza', 'descarca', 'excel', 'pdf', 'istoric rapoarte', 'categorie']
  },
  {
    cheie: 'raport_cerut', titlu: 'Un raport cerut în cuvinte, din RA Insight', unde: 'Meniu → RA Insight',
    pasi: [
      'În caseta lui RA Insight scrie ce raport vrei, pentru ce mașină și ce perioadă — de exemplu „fă-mi foaia de parcurs pentru B 154 UIP, săptămâna trecută" —, sau apasă „+" din casetă → „Raport" și alege din listă.',
      'Raportul se face ca din Rapoarte și intră în „Istoric rapoarte"; în discuție vezi cifrele lui de sus.',
      'Apasă „Deschide raportul" ca să-l vezi întreg, sau „Descarcă Excel".',
      'Continuă scurt, din butoanele de sub el: același raport pentru toată flota sau pentru perioada dinainte.'
    ],
    detalii: 'Merge cu oricare dintre rapoartele la care ai acces în Rapoarte (afară de Hotspot și CAN detaliat, unde zona și semnalele se aleg în Rapoarte). Cererea clară se face fără AI: de la Basic nu se numără, pe Start se numără din cele 50 de răspunsuri. În Istoric stă 7 zile, cu eticheta „din RA Insight".',
    cuvinte: ['raport cerut', 'cere un raport', 'foaie de parcurs', 'fa-mi raportul', 'genereaza raportul', 'raport in istoric', 'ai raport']
  },
  {
    cheie: 'programate', titlu: 'Un raport trimis singur pe email', unde: 'Meniu → Rapoarte → butonul „Programări" (dreapta sus)',
    pasi: [
      'La „Programare nouă" completează „Nume", alege „Raport", „Vehicul" și „Perioadă".',
      'Alege „Frecvență" (Zilnic, Săptămânal — luni, Lunar — ziua 1), „Ora" și „Format" (PDF sau Excel).',
      'La „Destinatari" scrie adresele, despărțite prin virgulă (gol = emailul tău).',
      'Apasă „Adaugă programarea". Din listă poți edita, „Trimite acum" sau șterge.'
    ],
    detalii: 'Perioade: ziua precedentă, ultimele 7 zile, ultimele 30 de zile, luna curentă, luna precedentă. Raportul ajunge și în „Istoric rapoarte".',
    cuvinte: ['programat', 'programare', 'email', 'automat', 'trimis singur', 'saptamanal', 'lunar', 'zilnic', 'destinatari']
  },
  {
    cheie: 'soferi', titlu: 'Un șofer nou și mașina lui', unde: 'Management → Șoferi; mașina se alege în Management → Vehicule',
    pasi: [
      'Management → Șoferi → „Adaugă șofer": nume, telefon, email, permisul (număr, expirare, categorii) → „Adaugă".',
      'Ca să-i dai o mașină: Management → Vehicule → creionul de pe rândul mașinii → „Editare vehicul".',
      'În fila „Detalii vehicul", la „Șofer", alege-l și apasă „Salvează".',
      'Sau din RA Insight: scrie cui dai mașina (de pildă: pune-l pe Mihai pe B 77 TIR), verifici propunerea și apeși „Da".'
    ],
    detalii: 'Când permisul expiră în cel mult 30 de zile, lângă șofer apare „mai are N zile".',
    cuvinte: ['sofer', 'soferi', 'adauga sofer', 'permis', 'aloca', 'atribuie', 'masina soferului']
  },
  {
    cheie: 'grupe', titlu: 'Grupe de mașini (și cine le vede)', unde: 'Management → Grupe',
    pasi: [
      '„Adaugă grupă": nume, descriere, culoare → „Adaugă".',
      'Apasă grupa → „Adaugă vehicul" ca să pui mașini în ea (✕ le scoate).',
      'Ca un om să vadă toate mașinile grupei: Setări → Utilizatori → „Editează rol & acces" → „Acces pe grupe".'
    ],
    detalii: 'O mașină stă într-o singură grupă. Ștergerea grupei nu șterge mașinile.',
    cuvinte: ['grupa', 'grupe', 'grup', 'acces pe grupe']
  },
  {
    cheie: 'documente', titlu: 'Acte: ITP, RCA, rovinietă', unde: 'Management → Documente',
    pasi: [
      'Deschide rândul mașinii.',
      'La actul lipsă apasă „Încarcă" (sau „Nou", ca să-l reînnoiești) și alege o poză sau un PDF.',
      'Aplicația citește actul și completează singură câmpurile (tip, serie, emitent, date, cost).',
      'Verifică și apasă „Adaugă actul".'
    ],
    detalii: 'Implicit primești avertizare cu 30 de zile înainte de expirare (rândul se colorează și vine o notificare). Pragul se schimbă din pagina agenților (Agenți AI, sau din RA Insight → butonul cu trei puncte → „Setările agenților") → RA Care → „Praguri".',
    cuvinte: ['acte', 'act', 'document', 'documente', 'itp', 'rca', 'casco', 'rovinieta', 'expira', 'talon', 'scanare', 'poza']
  },
  {
    cheie: 'alerte', titlu: 'O alertă: viteză, zonă, ralanti…', unde: 'Management → Alerte',
    pasi: [
      'Apasă „Adaugă regulă".',
      'Completează numele, alege „Tip", „Vehicul" (sau toate) și pragul.',
      'Apasă „Adaugă regula". Din listă o pornești, o oprești sau o modifici.'
    ],
    detalii: 'Tipuri: depășire viteză, scădere combustibil (furt), pornire/oprire motor, intrare/ieșire din zonă, temperatură motor, erori motor, supraîncărcare, PTO, uzură plăcuțe, service aproape, ralanti, expirare documente. Alertele vin la clopoțelul din bară și, după preferințe, pe email și pe telefon.',
    cuvinte: ['alerta', 'alerte', 'notificare', 'viteza', 'zona', 'furt', 'ralanti', 'regula', 'push']
  },
  {
    cheie: 'mentenanta', titlu: 'Revizii și lucrări de service', unde: 'Management → Mentenanță',
    pasi: [
      '„Adaugă lucrare" → „O programez".',
      'Alege mașina și lucrarea; la „Când trebuie făcută" pune data și/sau kilometrajul.',
      'La „Se repetă" pune „La fiecare (km)" sau „(luni)" și apasă „Adaugă lucrarea".',
      'După service apasă ✓ („am făcut-o"); următoarea se programează singură.'
    ],
    detalii: 'Se colorează portocaliu când se apropie și roșu când e depășită, cu notificare.',
    cuvinte: ['revizie', 'service', 'mentenanta', 'lucrare', 'schimb ulei', 'km']
  },
  {
    cheie: 'hotspot', titlu: 'Zone pe hartă (hotspot-uri)', unde: 'Meniu → Hotspot & Rutare',
    pasi: [
      'Apasă „Adaugă cerc", „Adaugă poligon", „Trasare străzi" sau „Desen liber" și desenează pe hartă.',
      'Completează numele, descrierea, culoarea și categoria → „Salvează".',
      'Raportul: Rapoarte → „Evenimente & zone" → „Raport Hotspot".'
    ],
    detalii: 'Zonele se folosesc la alertele de intrare/ieșire, în rapoarte și la harta de activitate.',
    cuvinte: ['zona', 'zone', 'hotspot', 'geofence', 'cerc', 'poligon']
  },
  {
    cheie: 'utilizatori', titlu: 'Un coleg nou în aplicație', unde: 'Setări → Utilizatori (adminul firmei)',
    pasi: [
      'La „Adaugă utilizator" scrie emailul, numele, telefonul și alege rolul (Admin companie, Manager, Dispecer, Viewer) → „Adaugă utilizator".',
      'Omul primește pe email un link și își pune singur parola. Dacă emailul n-a plecat, aplicația îți arată linkul ca să i-l trimiți tu.',
      'Linkul se retrimite din iconița avion de pe rândul lui.',
      'Ce mașini vede: „Editează rol & acces" → „Acces pe vehicule" sau „Acces pe grupe".'
    ],
    detalii: 'Nimeni nu scrie parola altcuiva. Cel mult 5 linkuri pe oră pentru același om.',
    cuvinte: ['utilizator', 'cont nou', 'coleg', 'angajat', 'parola', 'link', 'rol', 'acces']
  },
  {
    cheie: 'ra_insight', titlu: 'RA Insight: cine îl are și cum se folosește', unde: 'Meniu → RA Insight (sau bula rotundă din colț, care te duce acolo)',
    pasi: [
      'La o conversație nouă, sub salut, „Azi la tine" arată cel mult trei lucruri găsite azi de agenți (mașini fără semnal, scăderi de combustibil, acte care expiră, ziua de ieri); apeși rândul și te duce unde trebuie. Nu se numără.',
      'Adminul firmei îl dă colegilor dintr-un singur loc: RA Insight → butonul cu trei puncte → „Pachet și conturi" (sau Setări → Utilizatori → „Schimbă în Pachet și conturi"); pornește comutatorul de pe rândul omului. Prețul pachetului rămâne același, oricâte conturi dă, până la numărul pachetului.',
      'Pe Pro și Business, tot acolo alege pentru fiecare om „Fără limită" sau „Cel mult…" întrebări pe lună.',
      'În meniul „RA Insight" scrie întrebarea în casetă; spune mașina după număr, nume sau șofer — sau apasă „+" și alege „Mașina", „Perioada" ori „Raport".',
      'Continuă discuția: scrie („și săptămâna dinainte?") sau apasă una dintre întrebările gata scrise de sub răspuns; „Conversație nouă" o ia de la capăt.',
      'Conversațiile rămân în stânga, cu „Caută în conversații"; le vezi doar tu, 12 luni. Pe telefon, stânga se deschide din butonul cu trei linii.',
      'Butonul cu trei puncte, sus în dreapta, are „Pachet și conturi" (adminul firmei), „Notițele firmei", „Setările agenților", „Ghidul aplicației" și redenumirea conversației.'
    ],
    detalii: 'Jos în stânga (și lângă casetă) vezi câte întrebări mai are firma luna asta; când se termină, RA Insight se oprește până pe 1, fără niciun cost în plus. ' +
      'Deasupra fiecărui răspuns scrie cine a răspuns: lângă numele RA Insight, o etichetă mov ANALIZĂ (analiza lui RA Insight; s-a numărat o întrebare) sau verde INSTANT (răspuns dat de aplicație din rapoarte sau din datele de acum). Răspunsurile rapide („unde e…", „câți km azi") sunt și ele instant. ' +
      'Când aplicația găsește o problemă în date (o viteză mare, un consum care nu se poate măsura, o eroare de GPS, o fișă necompletată), o arată într-un chenar sub răspuns, cu butonul spre locul exact (harta la minutul acela, fișa mașinii, raportul). ' +
      'Când treci cu mouse-ul peste un răspuns: îl copiezi, îl notezi (👍 / 👎) și vezi din ce rapoarte vin cifrele. „Notițele firmei" (din butonul cu trei puncte) = regulile casei, scrise de admin.',
    cuvinte: ['ra insight', 'asistent', 'intrebari', 'fond', 'cont', 'conversatie', 'notitele firmei', 'instant', 'insigna']
  },
  {
    cheie: 'ramuri_insight', titlu: 'Paginile RA Insight: Șoferi pe mașini, RA Drive, Combustibil, Mentenanță, Ore de condus, Scrisoarea de luni', unde: 'Meniu → RA Insight → Pagini',
    pasi: [
      'Jos în stânga apasă „Pagini" și alege: „Șoferi pe mașini", „RA Drive" (condus & costuri), „Combustibil", „Mentenanță & acte", „Ore de condus" sau „Scrisoarea de luni".',
      'Sus alegi luna (la „Ore de condus", săptămâna) și mașinile: toată flota sau o grupă.',
      'Numărul de lângă „Pagini" (și de lângă fiecare pagină) = câte lucruri cer atenție acolo (de exemplu actele trecute de termen sau o scrisoare necitită).',
      '„Întreabă RA Insight" deschide o discuție despre ce vezi; „Cum se socotește" spune de unde vine fiecare cifră.'
    ],
    detalii: 'Paginile nu se scad din fondul de întrebări: cifrele le socotește aplicația, din aceleași rapoarte ca ecranul Rapoarte. Scrisoarea de luni vine lunea la 8, cu un anunț, și nu se scade nici ea din fond.',
    cuvinte: ['ramura', 'ramuri', 'pagini', 'ra drive', 'safe drive', 'scrisoarea de luni', 'scrisoare', 'ore de condus', 'mentenanta si acte', 'cat a costat condusul']
  },
  {
    // Pasul 2 (22.10): „RA Insight face, cu Da-ul tău" — partea 1, șoferii pe mașini.
    cheie: 'soferi_masini', titlu: 'Șoferii pe mașini, cu RA Insight: propunerea și „Da"', unde: 'Meniu → RA Insight → Pagini → „Șoferi pe mașini"',
    pasi: [
      'În discuție scrie, de pildă, „Pune-l pe Mihai Ionescu pe B 77 TIR", sau apasă „Propunere" pe un rând din „Azi la tine".',
      'RA Insight arată propunerea: ce se schimbă, de ce se potrivește (categoriile și valabilitatea permisului, dacă șoferul e liber) și ce nu se schimbă.',
      'Apasă „Da, trece-l" ca s-o faci, „Schimbă" ca să alegi alt șofer liber, sau „Nu". Fără „Da" nu se schimbă nimic.',
      'După „Da", „Anulează" ține 10 minute; apoi schimbi din fișa mașinii, ca de obicei.',
      'Toată flota deodată: Pagini → „Șoferi pe mașini"; bifezi ce vrei și apeși „Aplică cele bifate".'
    ],
    detalii: 'Se face exact ca din Management → Vehicule → fișa mașinii → Șofer, cu aceleași drepturi: cine nu poate schimba vehiculele vede propunerea, dar butonul „Da" e oprit. În jurnal scrie „prin RA Insight". ' +
      'Propunerile și „Da"-ul nu se numără ca întrebări; merg de la pachetul Basic. Aplicația știe cine e trecut pe mașină, nu cine a condus-o: potrivirea se face pe fișele șoferilor.',
    cuvinte: ['soferi pe masini', 'potrivirea soferilor', 'potrivire', 'trece soferul', 'pune-l pe', 'pune soferul', 'alt sofer', 'permis nepotrivit', 'permis expirat', 'fara sofer', 'propunere', 'anuleaza', 'da-ul']
  },
  {
    // Pasul 2, partea 2 (23.10): o alertă de viteză și „Am vorbit cu el", tot cu propunere și „Da".
    cheie: 'alerta_discutie', titlu: 'O alertă de viteză și „Am vorbit cu el", cu RA Insight', unde: 'Meniu → RA Insight',
    pasi: [
      'Scrie în discuție, de pildă, „Anunță-mă când Loganul trece de 130 km/h" (pe o mașină sau pe toată flota).',
      'RA Insight arată alerta: ce urmărește, pragul, mașina, numele și de câte ori ar fi sunat în ultimele 30 de zile.',
      'Apasă „Da, pune alerta", „Schimbă" ca să potrivești pragul, mașina sau numele (și „Lasă cum era"), sau „Nu".',
      'După ce vorbești cu un șofer, scrie „Notează că am vorbit cu Ion Popescu despre viteză" și apasă „Da, notează": discuția intră în RA Drive.',
      'După „Da", „Anulează" ține 10 minute; apoi alerta se oprește din Management → Alerte, iar discuția se scoate din RA Drive.'
    ],
    detalii: 'Alerta se pune ca din Management → Alerte → „Adaugă regulă" și ajunge la cei care primesc azi alertele firmei; ca toate alertele de viteză, sună cu 10 km/h peste prag. Din discuție se pun doar alerte de viteză; celelalte feluri (zone, combustibil, ralanti) se pun din Alerte. ' +
      'Cine nu poate schimba alertele vede propunerea, dar „Da" e oprit; la discuție, la fel, pentru cine nu poate modifica flota. Propunerile și „Da"-ul nu se numără ca întrebări; merg de la pachetul Basic.',
    cuvinte: ['anunta-ma', 'alerta din discutie', 'alerta de viteza cu ra insight', 'pune alerta', 'am vorbit cu', 'noteaza discutia', 'am discutat cu', 'noteaza ca am vorbit']
  },
  {
    cheie: 'roluri', titlu: 'Ce poate face fiecare rol', unde: 'Setări → Roluri',
    pasi: [
      'Alege rolul din stânga și dă-i numele de la voi din firmă.',
      'Debifează ce nu trebuie: „Ce poate face", „Ce ecrane vede", „Ce poate edita", „Ce rapoarte scoate" → „Salvează".',
      '„Rol nou": un nume, „Pornește de la" Manager / Dispecer / Viewer → „Creează rolul".'
    ],
    detalii: 'Se pot doar tăia drepturi, nu adăuga. Schimbările se aplică imediat.',
    cuvinte: ['rol', 'roluri', 'drepturi', 'permisiuni', 'ecrane']
  },
  {
    cheie: 'combustibil', titlu: 'Prețul combustibilului din rapoarte', unde: 'Setări → Prețuri combustibil',
    pasi: [
      'Completează Motorină, Benzină, GPL (lei pe litru); gol = media națională.',
      'Apasă „Salvează prețurile".'
    ],
    detalii: 'Rapoartele de cost folosesc întâi prețul pus pe mașină, apoi pe acesta, apoi media națională. Graficul prețului: Analize statistice → Preț combustibil.',
    cuvinte: ['pret', 'combustibil', 'motorina', 'benzina', 'gpl', 'cost']
  },
  {
    cheie: 'program', titlu: 'Programul de lucru', unde: 'Setări → Program de lucru',
    pasi: [
      'Bifează „Activează supravegherea programului de lucru".',
      'Bifează zilele, pune orele și toleranța → „Salvează programul".'
    ],
    detalii: 'Primești alertă când o mașină se mișcă în afara programului. Se poate schimba pe grupă sau pe mașină (fila „Program" din fișa mașinii).',
    cuvinte: ['program de lucru', 'programul de lucru', 'ore de lucru', 'in afara programului', 'weekend', 'noaptea']
  },
  {
    cheie: 'facturi', titlu: 'Facturile firmei', unde: 'Setări → Facturile mele (adminul firmei)',
    pasi: [
      'Vezi lista facturilor și proformelor, cu scadența și starea.',
      'Apasă „Vezi" sau „Descarcă (PDF)" pe rând.'
    ],
    detalii: 'Plata se face prin transfer bancar. Banda de sus spune dacă plățile sunt la zi.',
    cuvinte: ['factura', 'facturi', 'plata', 'proforma', 'abonament']
  },
  {
    cheie: 'agenti', titlu: 'Cei 6 agenți AI', unde: 'Meniu → Agenți AI; Meniu → RA Insight → Mai multe (butonul ⋯, sus în dreapta) → „Setările agenților"',
    pasi: [
      'Cu cont RA Insight, ce au găsit agenții azi vezi în RA Insight, la „Azi la tine"; pagina lor se deschide din butonul cu trei puncte, „Setările agenților".',
      'Apasă un agent → „Deschide agentul" ca să vezi ce a găsit.',
      '„Rulează" verifică acum; „Praguri" schimbă limitele (adminul firmei).'
    ],
    detalii: 'RA Watch (paznic: fără semnal, furt de combustibil, ralanti), RA Dispatch (mașini libere), RA Care (acte, revizii), RA Optimize (stilul de condus), RA Compliance (ore de condus), RA Client (sinteza zilei). Lucrează singuri, gratuit; îi pornește echipa RA Track.',
    cuvinte: ['agenti', 'agent', 'ra watch', 'ra care', 'ra optimize', 'ra compliance', 'ra dispatch', 'ra client', 'praguri']
  },
  {
    cheie: 'tahograf', titlu: 'Tahograful', unde: 'Management → Tahograf',
    pasi: [
      'Apasă „Încarcă un fișier descărcat".',
      'Alege șoferul (card) sau mașina (memoria tahografului) și fișierul (.DDD, .C1B, .V1B) → „Încarcă și citește".'
    ],
    detalii: 'Cardul se descarcă la 28 de zile, tahograful la 90. Filele „De descărcat", „Pe șofer", „Abateri".',
    cuvinte: ['tahograf', 'ddd', 'card sofer', 'descarcare']
  },
  {
    cheie: 'etransport', titlu: 'e-Transport (coduri UIT)', unde: 'Management → e-Transport',
    pasi: [
      'Apasă „Transport nou (cod UIT)".',
      'Completează codul UIT de la ANAF, mașina, șoferul, traseul, marfa și până când e valabil → „Adaugă transportul".'
    ],
    detalii: 'Banda de sus arată dacă raportarea la ANAF e pornită.',
    cuvinte: ['etransport', 'e-transport', 'uit', 'anaf']
  },
  {
    cheie: 'preferinte', titlu: 'Tema, harta de pornire, sunetele', unde: 'Setări → Preferințe (și iconița lună/soare din bară)',
    pasi: [
      'Iconița lună/soare din bară schimbă tema; alegerea rămâne pe contul tău.',
      'În Preferințe alegi: tema, harta cu care pornești, ecranul de pornire, sunetul alertelor și cât stau pe ecran.'
    ],
    detalii: 'Tot acolo îți schimbi parola (minimum 10 caractere, litere și cifre).',
    cuvinte: ['tema', 'intunecat', 'deschis', 'preferinte', 'sunet', 'parola mea', 'harta implicita']
  },
  {
    // „Anunță echipa RA Track" (22.10): o singură fereastră, din trei locuri. Aparatul e treaba noastră — clientul doar ne anunță.
    cheie: 'suport', titlu: 'Anunță echipa RA Track: ceva nu merge sau ai o întrebare', unde: 'Iconița căști din bara de sus; Meniu → RA Insight (casetele cu o problemă găsită); Meniu → Localizare (fișa mașinii)',
    pasi: [
      'Apasă iconița căști din bara de sus, butonul „Anunță echipa RA Track" dintr-o casetă din RA Insight sau, în fișa mașinii de pe hartă, rândul „Ceva nu merge la aparat?".',
      'Alege mașina (dacă e despre o mașină) și scrie pe scurt ce s-a întâmplat; dacă e nevoie, alege când poate veni cineva la mașină și unde stă de obicei.',
      'Verifică telefonul la care te sunăm și apasă „Trimite echipei".',
      'Cererea o urmărești la „Cererile tale": preluată, programată, rezolvată. La fiecare pas primești un mesaj în aplicație și pe email.'
    ],
    detalii: 'Datele aparatului (modelul, ultima poziție, semnalul, alimentarea) le trimite aplicația singură, ca să nu te mai întrebăm nimic; discuția ta cu RA Insight nu se trimite. Te sunăm în cel mult o zi lucrătoare. ' +
      'Pe aceeași mașină și aceeași problemă rămâne o singură cerere deschisă: în caseta din RA Insight scrie atunci „Echipa RA Track se ocupă". Administratorul firmei vede toate cererile firmei; ceilalți, pe ale lor.',
    cuvinte: ['suport', 'ajutor', 'contact', 'problema', 'nu merge', 'anunta echipa', 'echipa ra track', 'cererile tale', 'cererile mele', 'nu transmite', 'instalator']
  },
];

// Caută secțiunile potrivite pentru o întrebare: cuvintele-cheie cântăresc cel mai mult, apoi titlul, apoi textul.
// Un cuvânt-cheie scurt (≤ 4 litere) se potrivește doar întreg sau cu o terminație românească („rol" → „rolul",
// „roluri"; NU „act" în „facturile", NU „cont" în „contact"); unul lung, după rădăcină („factura" → „facturile").
// Cuvintele de întrebare („unde", „cum", „care") nu aleg singure un capitol.
const _STOP = new Set(['unde', 'cum', 'care', 'cine', 'cand', 'sunt', 'este', 'pentru', 'din', 'fac', 'pot', 'vad', 'gasesc', 'mea', 'meu', 'mele', 'asta', 'acest', 'aceasta', 'aplicatie', 'aplicatiei', 'aplicatia']);
const _TERMINATII = /^(ul|ului|uri|urile|urilor|e|a|ei|i|ii|le|lor|ele|elor)$/;
function _cuvantul(k, w) {
  if (w === k) return true;
  if (k.length <= 4) return w.indexOf(k) === 0 && _TERMINATII.test(w.slice(k.length));
  return w.indexOf(k.slice(0, k.length >= 7 ? k.length - 2 : k.length - 1)) === 0;
}
function _curat(t) { return ' ' + I.norm(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
function cauta(intrebare, n) {
  const q = _curat(intrebare);
  if (!q.trim()) return [];
  const vorbe = q.trim().split(' ');
  const tok = Array.from(new Set(I.cuvinte(intrebare).map(I.radacina).filter(function (t) { return t.length >= 3 && !_STOP.has(t); })));
  const scor = SECTIUNI.map(function (s) {
    let p = 0;
    for (const c of s.cuvinte) {
      const cn = _curat(c).trim();
      if (cn.indexOf(' ') > 0) { if (q.indexOf(' ' + cn + ' ') >= 0) p += 6; }
      else if (vorbe.some(function (w) { return _cuvantul(cn, w); })) p += 3;
    }
    const titlu = I.cuvinte(s.titlu).map(I.radacina);
    const text = I.cuvinte(s.pasi.join(' ') + ' ' + s.detalii + ' ' + s.unde).map(I.radacina);
    for (const t of tok) { if (titlu.indexOf(t) >= 0) p += 2; else if (text.indexOf(t) >= 0) p += 0.5; }
    return { s: s, p: p };
  }).filter(function (x) { return x.p >= 2; }).sort(function (a, b) { return b.p - a.p; });
  return scor.slice(0, n || 3).map(function (x) { return x.s; });
}
// Ce trimitem ecranului (fără cuvintele de căutare).
function publice() { return SECTIUNI.map(function (s) { return { cheie: s.cheie, titlu: s.titlu, unde: s.unde, pasi: s.pasi, detalii: s.detalii }; }); }

module.exports = { SECTIUNI, cauta, publice };
