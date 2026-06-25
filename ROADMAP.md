# ROADMAP — Plan de dezvoltare viitoare (RA Tracks)

Backlog de idei aprobate pentru dezvoltare ulterioară. Fiecare intrare e auto-conținută
(context + ce există deja în cod + decizii deschise), ca o sesiune viitoare să o poată
relua fără istoricul conversației.

> Status posibil per intrare: `idee` → `aprobat` → `în lucru` → `livrat`.

---

## 1. Import facturi & documente PDF cu AI ✨

- **Status:** `idee / propunere` (NEimplementat — schiță aprobată pentru memorare)
- **Propus:** 2026-06-25
- **Zonă:** Mentenanță + Documente (RCA / Rovinietă / ITP)

### Ideea pe scurt
Pe lângă introducerea **manuală** (rămâne!), un buton nou cu **steluță AI ✨** care:
1. Primește un **PDF** (factură service / poliță RCA / rovinietă) — sau o poză.
2. Un **AI (Claude) citește documentul** și extrage datele importante.
3. Le **redistribuie automat ca și cost pe vehiculul corect** (în Mentenanță) sau ca
   document cu dată de expirare (în Documente).
4. Funcția e **contra cost**, separat de abonamentul normal (idee inițială: „~2 € ca s-o
   activezi" — model de preț de stabilit, vezi decizii).

**Regula de aur:** AI-ul **propune**, omul **confirmă**. Nu se scrie automat în DB; userul
vede datele extrase într-un ecran de confirmare, corectează, apoi salvează.

### Ce există DEJA în cod (de reutilizat)
| Piesă | Unde |
|---|---|
| Integrare Claude prin fetch (model configurabil) | `ai.js` (`callClaude`, `AI_MODEL`; cheie din env sau DB) |
| Citire PDF **nativă** de către Claude (și poze) | (capabilitate Anthropic — fără OCR separat; necesită bloc de conținut `document`/`image`) |
| Contorizare consum AI / companie + limite | tabela `ai_usage`, `db.recordAiUsage()`, `getAiTokensForCompany`, `setCompanyAiLimit` |
| Feature-flags per companie (super-admin) | `plans.js` → `FEATURE_KEYS`, `featuresFor()`, middleware `requireFeature()` |
| Plată / Stripe (abonament per vehicul/lună, webhook) | `billing.js`, `plans.js` |
| Model „cost pe vehicul" | tabela `maintenance` (`cost`, `done_date`, `done_at`, `status`) — `db.createMaintenance` |
| Model documente | tabela `vehicle_documents` (`doc_type`, `number`, `issuer`, `issue_date`, `expiry_date`) — `db.createVehicleDocument` |
| Upload fișier (base64 în JSON, fără multer) | tipar existent la tahograf: `POST /api/tacho/upload` (`express.json({limit:'6mb'})`) |
| Rate-limit dedicat AI | `server.js` — căile `/api/ai/` au limita `RL_AI` |

**Concluzie:** partea grea (AI + plată + modele de date) e construită. Lipsește „lipiciul":
butonul, ruta de extragere, ecranul de confirmare și logica de mapare + decontare.

### Flux UX propus
```
[ + Adaugă manual ]   [ ✨ Importă din PDF (AI) ]
                              │  alegi PDF / faci poză
                              │  AI citește (2-5 sec)
        ┌─────────────────────────────────────────┐
        │  ECRAN DE CONFIRMARE (nu salvează singur) │
        │  Vehicul:  B-123-XYZ ▼ (AI a ghicit)      │
        │  Tip:      Schimb ulei + filtre           │
        │  Dată:     14.06.2026                       │
        │  Cost:     842 RON                          │
        │  [PDF atașat]   [Confirmă] [Renunță]        │
        └─────────────────────────────────────────┘
```

### Ce extrage AI-ul + mapare pe vehicul
- **Factură service → Mentenanță:** nr. înmatriculare → mapăm pe vehicul prin `devices.plate`;
  dată factură, sumă, furnizor, descriere → `type` + `cost` + `done_date`; se salvează ca
  **„efectuat"** (factură = lucrare făcută).
- **Poliță RCA / rovinietă → Documente:** tip, serie/număr, asigurător, dată început +
  **expirare**, cost → `vehicle_documents`.
- **Subtilitate — factură multi-vehicul:** dacă e detaliată pe numere, AI-ul **împarte costul**
  pe fiecare mașină; altfel userul alocă manual. (MVP poate trata doar „1 factură = 1 vehicul".)

### Monetizare (partea cu „2 €")
Costul real per scanare ≈ **câțiva cenți** (sub 1 cent pe Haiku; ~2-4 cenți pe un model mai
precis) → **marjă mare** indiferent de model. Variante:

| Model | Cum merge | Note |
|---|---|---|
| **A. Credite / „scanări AI"** *(recomandat)* | Pachet cumpărat prin Stripe (ex. 10/25/50); 1 import AI = 1 credit (se scade doar la salvare reușită). | Se leagă curat de `ai_usage` + Stripe; „2 €" = preț pachet/scanare. |
| **B. Add-on lunar** | +X RON/lună → import AI nelimitat (fair-use). | Cel mai simplu de facturat (refolosește abonamentul lunar). |
| **C. Hibrid** | Add-on lunar ieftin + cap; peste cap → credite. | Cel mai „corect", mai mult de implementat. |

Feature-flag nou (ex. `ai_docscan`) în `plans.js` → super-adminul îl aprinde per companie/plan.

### Detalii tehnice & limite
- **Model AI:** start pe **Haiku** (ieftin, ok pe facturi tipizate); escaladare la **Sonnet**
  doar dacă greșește pe facturi „urâte"/scanate.
- **Extragere structurată:** se forțează **JSON strict** (schemă fixă) → parsare sigură.
- **Stocare PDF original:** de decis (recomandat: îl păstrăm atașat, util pt. contabilitate).
- **Confidență:** câmp nesigur → lăsat gol + marcat „verifică"; AI-ul nu inventează.
- **Securitate/GDPR:** facturile conțin date personale → atenție la retenție; intră în audit.
- **Rate-limit:** ruta nouă intră sub limita `/api/ai/` existentă.

### Etapizare propusă
1. **MVP (Faza 1):** factură PDF → cost în Mentenanță, cu ecran de confirmare; 1 factură = 1
   vehicul; gratis/intern la început, ca să testăm precizia.
2. **Faza 2:** același flux pentru Documente (RCA, rovinietă, ITP).
3. **Faza 3:** monetizare (credite + Stripe + feature-flag).
4. **Faza 4:** rafinări — factură multi-vehicul cu split automat, „memorie" pe furnizori frecvenți.

### Decizii deschise (de confirmat înainte de start)
1. **Pricing:** A (credite) / B (add-on lunar) / C (hibrid)? Preț real (per scanare? pachet?
   RON sau EUR?).
2. **Păstrăm PDF-ul** original atașat în sistem, sau doar datele extrase?
3. **Cine are voie** să folosească importul AI — doar adminul (ca la editarea mentenanței),
   sau și userii?
4. **Pornim cu MVP** (Faza 1, fără plată, ca să vedem precizia) sau direct cu monetizare?

### Fișiere probabil atinse la implementare
- `ai.js` — helper nou `extractFromDocument(pdfBase64, schema)` (bloc `document`/`image` + JSON strict).
- `server.js` — rută nouă `POST /api/ai/doc-import` (sub `requireFeature('ai_docscan')` + rate-limit AI), apoi salvare în `maintenance` / `vehicle_documents` după confirmare.
- `public/index.html` — buton „✨ Importă din PDF" + ecran de confirmare în tab-urile Mentenanță și Documente.
- `plans.js` — cheie nouă de feature `ai_docscan` (+ default pe planuri).
- `billing.js` / `db.js` — dacă alegem modelul cu **credite** (sold per companie + top-up Stripe).
