# Uneltele de desenare zone (Hotspot) — RA Tracks

> Referință internă. Descrie cele 4 unelte de creare zone (geofence) din secțiunea **Hotspot & Rutare**.
> Fișiere cheie: `public/index.html` (UI + desen), `server.js` (salvare + detecție), `db.js` (stocare).

---

## Concepte comune (valabile pentru toate uneltele)

Toate uneltele creează o **zonă** (geofence/hotspot) salvată în tabela `geofences`.

| Element | Detaliu |
|---|---|
| Bara de desen | `#draw-toolbar` — ancorată **peste hartă** (în `#map-container`), centrată; nu acoperă panoul Localizare |
| Metadate comune | Nume, Descriere, Culoare, Categorie, Grup, „Regiune" |
| Stocare | `type` ('circle' / 'polygon' / 'corridor') + `coordinates` (JSONB) |
| Editare după desen | Geoman (`layer.pm`) — tragi colțurile/centrul; snapping la 20px |
| Îmbogățire server | `enrichGeofence()` → calculează centrul + adresă (reverse-geocode) → `center_lat`, `center_lon`, `address` |
| Salvare | `POST /api/geofences` (nou) sau `PUT /api/geofences/:id` (editare) |
| Afișare pe hartă | `renderGeofence()` (regiunile se afișează doar la cerere, nu automat) |
| Detecție intrare/ieșire | la alerte `geofence_enter` / `geofence_exit` (server.js) |

**Comportament bară pe ecran:**
- **Desktop**: toate câmpurile (nume/descriere/culoare etc.) sunt vizibile de la început, pentru orice unealtă.
- **Mobil (≤820px)**: bara e compactă cât desenezi (se vede harta); câmpurile + Salvează apar **după finalizarea formei**. Buton chevron pentru restrângere/extindere manuală + „×" de renunțare.

**Funcție comună de finalizare:** `finalizeEditable(layer)` — oprește plasarea, activează editarea Geoman, arată câmpurile (pe mobil), recalculează metricile.

---

## 1. Cerc (`circle`)

Zonă rotundă în jurul unui punct.

| | |
|---|---|
| Buton | `startDrawGeofence('circle')` |
| Cum se desenează | **Un singur click** pe hartă = centrul. Raza din câmpul „Rază" (`#draw-radius`, implicit **300 m**) |
| Funcții | `onCircleClick()` → `L.circle()` → `finalizeEditable()` |
| Ajustare | Tragi centrul/marginea sau schimbi raza în câmp (`updateDrawRadius()`) |
| Geometrie salvată | `{ center: [lat, lng], radius: metri }` |
| Detecție | `isPointInCircle()` — distanță haversine ≤ rază |
| Metrici afișate | Rază + Suprafață (π·r²) |
| Folosire tipică | Punct de interes rotund: depozit, sediu client, stație |

---

## 2. Poligon (`polygon`)

Suprafață închisă definită prin colțuri.

| | |
|---|---|
| Buton | `startDrawGeofence('polygon')` |
| Cum se desenează | **Click** pentru fiecare colț (**min 3**), apoi **dublu-click** / Enter / butonul „Finalizează" pentru a închide |
| Funcții | `onPolyClick()` adună punctele · `redrawPoly()` previzualizare (contur punctat închis) · `drawFinishPoly()` → `L.polygon()` → `finalizeEditable()` |
| Ajustare | Tragi colțurile (Geoman); **Undo** / Ctrl+Z șterge ultimul punct |
| Geometrie salvată | `[[lat, lng], [lat, lng], …]` (listă de vârfuri) |
| Detecție | `isPointInPolygon()` — algoritm ray-casting |
| Metrici afișate | Suprafață + Perimetru |
| Folosire tipică | Contur precis cu colțuri: parcare, incintă, graniță personalizată |

---

## 3. Trasare străzi / Coridor (`corridor`)

Bandă cu lățime de-a lungul unei linii — pentru drumuri/trasee.

| | |
|---|---|
| Buton | `startDrawGeofence('corridor')` |
| Cum se desenează | **Click** pe puncte de-a lungul străzilor (**min 2**) + lățime în câmpul „Lățime" (`#draw-width`, implicit **30 m**) |
| Lipire pe drumuri | Butonul **„Lipește pe străzi"** → `snapCorridorToRoads()` → `POST /api/match` (motor OSRM) → linia se aliniază **exact pe drumuri** |
| Funcții | `onPolyClick()` adună puncte · `redrawPoly()` (linie deschisă + banda de previzualizare) · `corridorRibbon()` construiește banda · `drawFinishPoly()` → `L.polyline()` editabilă |
| Ajustare | Tragi punctele (Geoman); banda se redesenează la fiecare modificare de punct sau de lățime (`updateCorridorWidth()`) |
| Geometrie salvată | `{ line: [[lat, lng], …], width: metri }` |
| Detecție | `isPointNearPolyline()` — distanță punct→segment ≤ lățime/2 |
| Metrici afișate | Lungime + Lățime + Suprafață aproximativă (lungime × lățime) |
| Folosire tipică | Coridoare de drum: rute de livrare, străzi monitorizate, tronsoane interzise |

> Nota: o linie pură nu are suprafață, de aceea coridorul folosește o **lățime** ca să devină zonă cu arie (și să poată declanșa alerte intrare/ieșire).

---

## 4. Desen liber / Pix (`freehand`)

Suprafață desenată „de mână", trasă liber.

| | |
|---|---|
| Buton | `startDrawGeofence('freehand')` |
| Cum se desenează | **Ții apăsat și tragi** cu mouse-ul/degetul → se înregistrează conturul; la **ridicare** se închide automat în suprafață |
| Pan blocat | Cât desenezi, **mutarea hărții e dezactivată** (`map.dragging.disable()`) ca să poți trasa |
| Funcții | `enableFreehand()` atașează ascultători nativi (mouse + touch) · `fhDown/fhMove/fhUp()` · prag de **4px** între puncte · `fhSimplify()` (`L.LineUtil.simplify`, toleranță 4px) reduce numărul de vârfuri |
| Rezultat | `L.polygon()` simplificat → `finalizeEditable()`; se **salvează ca `type='polygon'`** |
| Ajustare | Tragi colțurile (Geoman) după închidere |
| Geometrie salvată | `[[lat, lng], …]` (poligon simplificat) |
| Detecție | `isPointInPolygon()` (identic cu poligonul) |
| Metrici afișate | Suprafață + Perimetru |
| Folosire tipică | Zonă liberă, organică, desenată rapid din mână (un „balon" în jurul unei zone) |

---

## Tabel comparativ rapid

| Unealtă | `type` | Geometrie | Detecție | Are arie? | Aliniere pe drum |
|---|---|---|---|---|---|
| Cerc | `circle` | `{center, radius}` | distanță la centru | Da (rotundă) | — |
| Poligon | `polygon` | `[[lat,lng],…]` | ray-casting | Da (colțuri) | — |
| Trasare străzi | `corridor` | `{line, width}` | dist. la segment | Da (bandă) | ✅ „Lipește pe străzi" |
| Desen liber | `polygon` | `[[lat,lng],…]` | ray-casting | Da (liberă) | — |

---

## Detecție intrare/ieșire (server.js)

La alertele `geofence_enter` / `geofence_exit`, pentru fiecare poziție nouă se verifică apartenența la zonă:

```
if circle  → isPointInCircle(lat, lng, center, radius)
elif line  → isPointNearPolyline(lat, lng, line, width/2)   // coridor
elif array → isPointInPolygon([lat,lng], coords)            // poligon + desen liber
```

Starea „înăuntru/afară" se ține per vehicul+zonă (`geofenceStates`) ca să declanșeze evenimentul doar la tranziție.

---

## Funcții auxiliare relevante

| Funcție | Rol |
|---|---|
| `layerLatLngs()` | Extrage geometria curentă din layer (după editări) — cerc/poligon/coridor |
| `updateDrawMetrics()` | Recalculează metricile + redesenează banda coridorului |
| `corridorRibbon(line, width)` | Construiește poligonul-bandă din linia centrală |
| `renderDrawRibbon(line, width)` | (Re)desenează banda de previzualizare |
| `fhSimplify(latlngs)` | Simplifică conturul desenului liber |
| `setDrawMin(min)` / `toggleDrawCollapse()` | Restrânge/extinde bara (compact pe mobil) |
| `cancelDraw()` | Anulează desenul, curăță layerele + ascultătorii (inclusiv freehand) |
| `startEditGeofence(id)` | Reîncarcă o zonă existentă pentru editare (cerc/poligon/coridor) |
| `enrichGeofence(body)` | (server) centru + adresă |
