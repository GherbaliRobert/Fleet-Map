// Categoriile de vehicul și pictogramele — ACELEAȘI ca în fișa de pe web (public/index.html →
// #edit-vehicle-type, ICON_OPTIONS, iconFromType, TIPURI_CU_AXE). Dacă schimbi o listă, schimb-o în
// AMBELE locuri: valorile sunt cele stocate în bază, iar o valoare scrisă altfel aici ar face ca lista
// de pe telefon să arate gol la vehiculele trecute pe web (cum era înainte cu „Autotractor" sau „TIR").
import { vehCatOf, type VehCat } from './VehicleArt';

export const CATEGORII: { v: string; l: string }[] = [
  { v: 'Auto', l: 'Auto' }, { v: 'Autotractor', l: 'Autotractor' }, { v: 'Camion', l: 'Camion' },
  { v: 'TIR', l: 'TIR' }, { v: 'Duba', l: 'Dubă' }, { v: 'Autobuz', l: 'Autobuz' },
  { v: 'Motocicleta', l: 'Motocicletă' }, { v: 'Remorca', l: 'Remorcă' },
  { v: 'Remorcă tehnologică', l: 'Remorcă tehnologică' }, { v: 'Tractor', l: 'Tractor' },
  { v: 'Utilaj', l: 'Utilaj' }, { v: 'Buldoexcavator', l: 'Buldoexcavator' },
  { v: 'Motostivuitor', l: 'Motostivuitor' }, { v: 'Combină agricolă', l: 'Combină agricolă' },
  { v: 'Automixt', l: 'Automixt' }, { v: 'Grup electrogen', l: 'Grup electrogen' },
  { v: 'Barcă', l: 'Barcă' }, { v: 'Ambulanță', l: 'Ambulanță' }, { v: 'Electric', l: 'Electric' },
  { v: 'Plug-in hibrid', l: 'Plug-in hibrid' }, { v: 'Hibrid', l: 'Hibrid' }, { v: 'CNG/GPL', l: 'CNG/GPL' },
  { v: 'Altul', l: 'Altul' },
];

// Pictogramele din fișă (valoarea din coloana `icon`).
export const PICTOGRAME: { v: string; l: string }[] = [
  { v: 'car', l: 'Auto' }, { v: 'van', l: 'Dubă' }, { v: 'truck', l: 'Camion' }, { v: 'tir', l: 'TIR' },
  { v: 'autotractor', l: 'Autotractor' }, { v: 'bus', l: 'Autobuz' }, { v: 'motorcycle', l: 'Moto' },
  { v: 'trailer', l: 'Remorcă' }, { v: 'trailer_tech', l: 'Rem. tehnologică' }, { v: 'tractor', l: 'Tractor' },
  { v: 'utilaj', l: 'Utilaj' }, { v: 'excavator', l: 'Buldoexcavator' }, { v: 'forklift', l: 'Motostivuitor' },
  { v: 'combine', l: 'Combină' }, { v: 'mixer', l: 'Automixt' }, { v: 'generator', l: 'Grup electrogen' },
  { v: 'boat', l: 'Barcă' }, { v: 'ambulance', l: 'Ambulanță' }, { v: 'electric', l: 'Electric' },
  { v: 'phev', l: 'Plug-in hibrid' }, { v: 'hybrid', l: 'Hibrid' }, { v: 'cng', l: 'CNG/GPL' },
];

// Categoria → pictograma implicită (web: iconFromType). Alegi „Autotractor", pictograma se leagă singură.
const ICON_DIN_TIP: Record<string, string> = {
  'Auto': 'car', 'Camion': 'truck', 'TIR': 'tir', 'Duba': 'van', 'Dubă': 'van',
  'Motocicleta': 'motorcycle', 'Motocicletă': 'motorcycle', 'Autobuz': 'bus',
  'Utilaj': 'utilaj', 'Remorca': 'trailer', 'Remorcă': 'trailer',
  'Autotractor': 'autotractor', 'Tractor': 'tractor', 'Remorcă tehnologică': 'trailer_tech', 'Remorca tehnologica': 'trailer_tech',
  'Buldoexcavator': 'excavator', 'Motostivuitor': 'forklift', 'Combină agricolă': 'combine', 'Combina agricola': 'combine',
  'Automixt': 'mixer', 'Grup electrogen': 'generator', 'Barcă': 'boat', 'Barca': 'boat', 'Ambulanță': 'ambulance', 'Ambulanta': 'ambulance',
  'Electric': 'electric', 'Plug-in hibrid': 'phev', 'Hibrid': 'hybrid', 'CNG/GPL': 'cng',
};
export function iconDinTip(tip: string | null | undefined): string { return ICON_DIN_TIP[String(tip || '')] || ''; }

// Desenul vehiculului (listă + hartă). Ca pe web (markerCategory): întâi pictograma aleasă, apoi categoria.
// `vehCatOf` știa doar 8 categorii după nume — un autotractor fără pictogramă apărea ca autoturism.
export function vehCatDin(v: { icon?: string | null; vehicle_type?: string | null }): VehCat {
  return vehCatOf({ icon: (v && v.icon) || iconDinTip(v && v.vehicle_type), vehicle_type: v && v.vehicle_type });
}

// Categoriile cu axe: la ele apare „Config Camion" (web: TIPURI_CU_AXE).
export const TIPURI_CU_AXE = ['Autotractor', 'Camion', 'TIR', 'Remorca', 'Remorcă tehnologică', 'Automixt', 'Utilaj', 'Tractor', 'Buldoexcavator', 'Combină agricolă'];
