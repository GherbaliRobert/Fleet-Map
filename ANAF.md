# e-Transport ANAF — activare integrare reală

Clientul real (`anaf.js`) e construit și cablat. Rămâne **dormant** (modulul merge pe demo) până când îi dai tokenul ANAF.
Fluxul implementat e cel documentat de ANAF: **upload declarație → `stareMesaj` (poll) → `descarcare` → UIT**, plus raportarea pozițiilor.

## Ce trebuie să faci tu (provisioning)
1. **Obține tokenul OAuth ANAF** (o singură dată, ~90 zile):
   - Intră în **SPV** (Spațiul Privat Virtual) cu **certificatul digital calificat** al firmei.
   - Autorizează aplicația pentru serviciul **e-Transport** → primești un **access token** (OAuth2).
   - (Tokenul se obține din afara aplicației — noi doar îl folosim.)
2. **Setează variabilele de mediu** în Railway:
   ```
   ANAF_ETRANSPORT_TOKEN = <access token-ul OAuth>
   ANAF_CIF              = <CIF-ul firmei, fără „RO">
   ANAF_ETRANSPORT_TEST  = true     ← rămâi pe TEST până validăm; pui „false" la producție
   ```
3. **Activează modul real**: în panoul super-admin (Demo/Real) → `anaf_token_connected = true` (sau setează direct setarea).

## Cum funcționează după activare
- La emiterea unui UIT (mod real), `POST /api/etransport/uit` cheamă `anaf.emitUIT(...)`:
  depune declarația la ANAF, așteaptă prelucrarea și întoarce **UIT-ul real** (sau `pending` + `index` dacă mai durează).
- Worker-ul de poziții trimite automat coordonatele transporturilor active la ANAF (la 3 min), prin `anaf.sendPosition`.

## ⚠️ De validat împreună pe mediul de TEST ANAF (înainte de producție)
Numele exacte ale câmpurilor **declarației** (marfă, cod tarifar NC, greutăți, rută start/final, expeditor/partener) urmează
specificația publică ANAF e-Transport v2, dar **trebuie confirmate pe mediul de test** (schema XSD se mai schimbă între versiuni).
Pașii de validare (îi facem împreună după ce ai tokenul):
1. Cu `ANAF_ETRANSPORT_TEST=true`, depune un transport de probă → vezi răspunsul ANAF (erori de schemă, dacă apar).
2. Ajustăm câmpurile din `anaf.js` (`buildDeclaration`) + completăm formularul web cu câmpurile cerute de ANAF.
3. Când testul trece curat → `ANAF_ETRANSPORT_TEST=false` (producție).

Până atunci, modulul rămâne pe **demo** (UIT-uri demo) pentru prezentări — fără riscuri.
