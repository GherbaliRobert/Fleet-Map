# Analiza Agenților RA Tracks — Tokeni & Funcționalități

> Creat: 2026-06-22 | Referință internă — nu se deployează

---

## 1. Agenți logici (ZERO tokeni)

Rulează pe server la fiecare **30 de minute** prin `runAgentsWorker` (`setInterval`). Sunt implementați în `agents.js`. Nu fac niciun apel la Claude — sunt logică pură + șabloane de text.

| Agent | Rol | Ce verifică | Output |
|---|---|---|---|
| **RA Watch** | Supraveghere GPS | Vehicule offline >N ore, ieșiri din zonă, viteză maximă depășită | Findings `critical` / `warning` |
| **RA Dispatch** | Optimizare trasee | Vehicule inactiv >X min în timpul programului, trasee lungi fără pauze | Findings `warning` / `info` |
| **RA Care** | Întreținere flotă | Inspecție tehnică expirată/apropiată, asigurare expirată/apropiată, vinietă | Findings `critical` / `warning` |
| **RA Optimize** | Eficiență operațională | Consum carburant anormal, timp ralanti excesiv, kilometraj vs. normă | Findings `info` / `warning` |
| **RA Compliance** | Conformitate legală | Tahograf: depășire timp de condus, pauze lipsă, perioadă de repaus | Findings `critical` / `warning` |
| **RA Client** | Experiența clientului | Livrări întârziate, ETA depășit, deviere de la ruta planificată | Findings `warning` / `info` |

### Detalii tehnice
- **`buildCtx()`** — construiește un context comun (istoric poziții din ziua curentă) o singură dată, reutilizat de toți agenții.
- **`runAll()`** — rulează toți agenții activați pe același context; izolează eșecurile (un agent care crapă nu îi oprește pe ceilalți).
- **Stocare:** findings salvate în DB via `db.saveFindings()` → accesibile prin `db.getAgentFindings(companyId)`.
- **Gating pe plan:**
  - `start` — niciun agent
  - `pro` — Watch + Dispatch
  - `premium / enterprise / custom` — toți 6

---

## 2. Funcții AI cu tokeni reali

Acestea fac apeluri efective la Anthropic Claude. Fiecare apel consumă **input tokens** (prompt + context) + **output tokens** (răspuns).

### 2.1 RA Insight — interogare liberă (cel mai scump)

**Fișier:** `server.js` → `/api/ai/reports-agent`  
**Model:** `AI_AGENT_MODEL` (default `claude-haiku-4-5`, configurabil via env `AI_AGENT_MODEL`)  
**Max iterații:** 8 | **Max rapoarte per întrebare:** 5

**Flux tool-use:**
```
User întreabă → Claude decide ce unelte să folosească → execută unelte → răspuns înapoi la Claude → ... → răspuns final
```

**5 unelte disponibile:**

| Unealtă | Ce face | Tokeni extra? |
|---|---|---|
| `list_vehicles` | Lista vehiculelor flotei (nume, IMEI) | Nu (date din DB, fără AI) |
| `list_zones` | Lista zonelor geografice definite | Nu |
| `run_report` | Generează un raport complet (mileage/speed/stops/hotspot/idle) | **Da** — adaugă date raport la context |
| `fleet_status` | Snapshot live: stare vehicule acum (offline/moving/idle/stopped) | Nu (logică pură) |
| `fleet_alerts` | Findings recente ale agenților logici (max 40, sortate severity) | Nu (citit din DB) |

**Cost estimat per întrebare:**
- Întrebare simplă (1-2 tool calls): ~500–1.000 input tokens + ~200–400 output tokens
- Întrebare complexă (5 rapoarte): ~3.000–6.000 input tokens + ~400–800 output tokens
- Context crește la fiecare iterație (tool results devin input pentru iterația următoare)

**Gating:** `requireFeature('ai_assistant')` → ON doar pentru Premium / Enterprise / Custom

---

### 2.2 Chat asistat — conversație liberă

**Fișier:** `server.js` → `/api/ai/chat`  
**Model:** `AI_MODEL` (default `claude-haiku-4-5`)  
**Funcție:** `callClaude()` — un singur apel, fără tool-use loop

**Caracteristici:**
- Context de sistem: informații despre flotă (vehicule, ultima poziție)
- Fără tool-use → cost fix per mesaj
- Estimat: ~300–800 input tokens + ~200–500 output tokens per mesaj

---

### 2.3 Rezumat raport (butonul „Sumarizează")

**Fișier:** `server.js` → `/api/ai/summarize`  
**Model:** `AI_MODEL`  
**Funcție:** `callClaude()`

**Input:** datele brute ale unui raport generat  
**Output:** rezumat în 2-4 propoziții  
**Cost:** proporcional cu dimensiunea raportului; ~500–2.000 input tokens + ~150–300 output tokens

---

### 2.4 Sumar agenți (digest findings)

**Fișier:** `server.js` → `/api/ai/agents-summary`  
**Model:** `AI_MODEL`  
**Funcție:** `callClaude()`

**Input:** toate findings active ale agenților logici pentru companie  
**Output:** rezumat executiv al stării flotei  
**Cost:** ~400–1.500 input tokens + ~200–400 output tokens

---

### 2.5 Raport săptămânal

**Fișier:** `server.js` (job schedulat sau trigger manual)  
**Model:** `AI_MODEL`  
**Funcție:** `callClaude()`

**Input:** agregate din săptămâna curentă (km, ore, alerte, vehicule top/bottom)  
**Output:** raport narativ săptămânal  
**Cost:** ~1.000–3.000 input tokens + ~400–800 output tokens

---

## 3. Gating pe plan — tabel complet

| Funcție | Start | Pro | Premium | Enterprise | Custom |
|---|---|---|---|---|---|
| Agenți logici | — | Watch, Dispatch | Toți 6 | Toți 6 | Configurabil |
| RA Insight (AI) | — | — | ✅ | ✅ | ✅ |
| Chat asistat | — | — | ✅ | ✅ | ✅ |
| Rezumat raport | — | — | ✅ | ✅ | ✅ |
| Sumar agenți | — | — | ✅ | ✅ | ✅ |
| Raport săptămânal | — | — | ✅ | ✅ | ✅ |

Flag de control: `ai_assistant` în `FEATURE_DEFAULTS_BY_PLAN` (`plans.js`)

---

## 4. Protecții & limite

| Protecție | Valoare | Unde |
|---|---|---|
| Rate limit AI | 40 req/min per user | `RL_AI` în `server.js` |
| Cap lunar tokeni | Per companie (configurat în settings) | `aiLimitReached()` verificat înainte de fiecare apel |
| Max iterații agent | 8 | `maxIters` în `runAgent()` (`ai.js`) |
| Max rapoarte per întrebare | 5 | Counter în handler `/api/ai/reports-agent` |
| Max findings trimise la AI | 40 | Handler `fleet_alerts` |
| Izolare date | Per companie + per user | `canAccessImei()`, `_fleetSnapshot(req)`, `companyScope` |

---

## 5. Observații & oportunități

### Costul real al RA Insight
Cel mai scump scenariu: utilizatorul pune o întrebare care declanșează 5 rapoarte mari → 8 iterații → fiecare iterație trimite **tot contextul acumulat** (tool results incluse) ca input. Prețul crește aproximativ **liniar** cu numărul de iterații.

### Optimizare posibilă: presetări token-free ⚡
Interogările frecvente (stare live flotă, alerte active) pot fi servite **fără tokeni** dacă sunt expuse ca presetări hardcodate în UI → buton direct pe `fleet_status` / `fleet_alerts` fără a trece prin Claude.

### Modele configurabile independent
- `AI_MODEL` = model pentru chat rapid (default Haiku)
- `AI_AGENT_MODEL` = model pentru RA Insight (poate fi urcat la Sonnet fără a atinge chat-ul)

### Agenții logici sunt gratuiți — dar findings sunt valoroase
`fleet_alerts` în RA Insight preia findings agenților logici (gratuite!) și le injectează în contextul Claude. Practic: 30min de calcul gratuit devin input pentru AI, fără cost suplimentar de generare.

---

## 6. Fișiere cheie

| Fișier | Rol |
|---|---|
| `agents.js` | Cei 6 agenți logici (zero tokeni) |
| `ai.js` | `callClaude()` + `runAgent()` (tool-use loop) |
| `server.js` | Toate endpoint-urile `/api/ai/*`, rate limiting, handlers unelte |
| `plans.js` | Gating pe plan (`AGENTS_BY_PLAN`, `FEATURE_DEFAULTS_BY_PLAN`) |
| `db.js` | `getAgentFindings()`, `saveReportHistory()`, cap tokeni |
