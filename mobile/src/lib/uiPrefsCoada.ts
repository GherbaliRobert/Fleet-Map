import { Api } from '../api/endpoints';

// Coada scrierilor de preferințe pe CONT (PUT /api/me/ui-prefs) — tema, harta, ecranul de pornire.
//
// De ce există: tema (rândul „Temă" din meniu) și harta (butonul de pe hartă) urcă pe cont FĂRĂ să aștepte
// serverul. Dacă o citire (GET, la deschiderea „Contul meu" sau la revenirea în aplicație) apuca să plece
// înainte ca scrierea să ajungă, aducea valoarea VECHE și o reaplica: tema sărea înapoi, iar pe cont rămânea
// cea nouă — telefonul și contul nu mai spuneau același lucru până la sincronizarea următoare.
//
// Două reguli, într-un singur loc (store.ts și mapLayer.ts trec amândouă pe aici):
//  1. Scrierile pleacă UNA DUPĂ ALTA. Serverul citește-modifică-scrie rândul; două PUT-uri în paralel (temă și
//     hartă schimbate repede) s-ar putea călca unul pe altul.
//  2. Citirea așteaptă scrierile din coadă (asteaptaPrefs) și, pentru ce s-a schimbat pe telefon cât timp
//     era pe drum, păstrează alegerea de pe telefon (schimbateDupa), nu valoarea adusă.

let _coada: Promise<unknown> = Promise.resolve();
let _nr = 0; // crește la fiecare schimbare trimisă
let _sesiune = 0; // crește la deconectare
const _ultima: Record<string, { nr: number; v: any }> = {}; // cheie → ultima valoare trimisă de pe telefon

export function trimitePrefs(patch: Record<string, any>): Promise<{ ok: boolean }> {
  const nr = ++_nr;
  const ses = _sesiune;
  const chei = Object.keys(patch);
  for (const k of chei) _ultima[k] = { nr, v: patch[k] };
  // O scriere rămasă în coadă de la contul de dinainte NU pleacă pe cheia contului în care s-a intrat între timp
  // (fondatorii schimbă conturile pe același telefon) — ar pune tema unuia pe contul celuilalt.
  const p = _coada.then(() => {
    if (ses !== _sesiune) throw new Error('S-a schimbat contul.');
    return Api.saveUiPrefs(patch);
  });
  _coada = p.catch(() => { /* coada merge mai departe și după o scriere eșuată */ });
  // Scrierea n-a ajuns pe cont → nu mai ținem alegerea ca „mai nouă decât contul". Numai dacă între timp
  // n-a venit alta peste ea pe aceeași cheie.
  p.catch(() => { for (const k of chei) if (_ultima[k] && _ultima[k].nr === nr) delete _ultima[k]; });
  return p;
}

// Așteaptă să ajungă pe server tot ce e în coadă acum (reușit sau nu). Nu aruncă niciodată.
export function asteaptaPrefs(): Promise<void> {
  return _coada.then(() => undefined, () => undefined);
}

// Numărul de acum — se ia ÎNAINTE de citire, ca să știm apoi ce s-a schimbat cât timp era pe drum.
export function reperPrefs(): number { return _nr; }

// Ce s-a trimis de pe telefon după reper, cu valoarea trimisă (cheie → valoare).
export function schimbateDupa(reper: number): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(_ultima)) if (_ultima[k].nr > reper) out[k] = _ultima[k].v;
  return out;
}

// La deconectare: alegerile unui cont nu se amestecă în citirile contului următor.
export function uitaPrefs() {
  _sesiune++;
  for (const k of Object.keys(_ultima)) delete _ultima[k];
}
