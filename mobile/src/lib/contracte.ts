// Contracte (fondatori) — cuvintele și formatările comune ecranelor de pe telefon.
//
// Nimic de aici nu HOTĂRĂȘTE ceva despre un contract. Capătul, ultima zi de preaviz, alarma, dosarul,
// comparația cu factura, textul prelungirii, anexa și marja montajului le socotește SERVERUL
// (contracts.js, montaj.js, server.js); telefonul doar le pune pe ecran. Aici stau doar:
//   • etichetele stărilor și ale pașilor — o COPIE a celor din contracts.js și montaj.js (aceeași copie
//     are și web-ul). `verify_contracte_telefon.js` pică dacă se despart de server, cuvânt cu cuvânt;
//   • formatarea datelor și a sumelor, ca pe web (_zile, _lei, _raxDe).

// Drumul contractului — IDENTIC cu `ETICHETE_STARE` și `URMATORUL_PAS` din contracts.js.
// [eticheta, felul pastilei]
export const CTR_STARI: Record<string, [string, string]> = {
  ciorna: ['în lucru', ''],
  aprobat: ['aprobat — gata de semnat', 'ok'],
  trimis: ['trimis la client', 'warn'],
  activ: ['semnat, în vigoare', 'ok'],
  incheiat: ['încheiat', 'bad'],
};
// [starea următoare, ce scrie pe buton]
export const CTR_PAS: Record<string, [string, string] | null> = {
  ciorna: ['aprobat', 'Aprobă contractul'],
  aprobat: ['trimis', 'Am trimis contractul la client'],
  trimis: ['activ', 'Contractul e semnat de amândoi'],
  activ: ['incheiat', 'Încheie contractul'],
  incheiat: null,
};
// „Ce urmează" — aceleași vorbe ca pe web (CTR_EXPLIC).
export const CTR_EXPLIC: Record<string, string> = {
  ciorna: 'Contractul e în lucru. Verifică datele de mai jos și anexa cu aparatele, apoi aprobă-l. ' +
    'Până atunci, PDF-ul poartă pe fiecare pagină semnul „CIORNĂ" — tocmai ca să nu plece din greșeală la client.',
  aprobat: 'Contractul e aprobat: PDF-ul nu mai are semnul de ciornă și se poate printa. ' +
    'Descarcă-l, listează-l în două exemplare și trimite-l la client pentru semnare.',
  trimis: 'Contractul a plecat la client. Când primești hârtia semnată, urc-o mai jos la „Actele semnate" ' +
    'și marchează-l semnat. Din clipa aia nu se mai modifică.',
  activ: 'Contractul e semnat și în vigoare.',
  incheiat: 'Contractul s-a încheiat.',
};
// Actul adițional are același drum, fără „încheiat".
export const ACT_STARI_ET: Record<string, string> = {
  ciorna: 'în lucru',
  aprobat: 'aprobat — gata de semnat',
  trimis: 'trimis la client',
  activ: 'semnat, în vigoare',
};
export const ACT_PAS: Record<string, [string, string]> = {
  ciorna: ['aprobat', 'Aprobă'],
  aprobat: ['trimis', 'Am trimis la client'],
  trimis: ['activ', 'E semnat de amândoi'],
};
// Felul pastilei de dosar, după `dosar.nivel` (stareDosar din contracts.js).
export const DOSAR_FEL: Record<string, string> = { lipsa: 'bad', nesemnat: 'warn', incomplet: 'warn', expira: 'warn', ok: 'ok', incheiat: '', demo: '' };

// Lucrările de montaj — IDENTICE cu `TIPURI` din montaj.js: [cheie, eticheta, unitatea].
export const MONTAJ_TIPURI: [string, string, string][] = [
  ['gps', 'Instalare dispozitiv GPS', 'buc'],
  ['lvcan', 'Instalare modul LV-CAN', 'buc'],
  ['caninc', 'Instalare CAN încorporat', 'buc'],
  ['fms', 'Instalare FMS (tahograf)', 'buc'],
  ['demontare', 'Dezinstalare echipament', 'buc'],
  ['inlocuire', 'Înlocuire echipament', 'buc'],
  ['deplasare', 'Deplasare', 'km'],
];
// Stările unei lucrări — IDENTICE cu `ETICHETE_STARE` din montaj.js, în aceeași ordine.
export const MONTAJ_STARI: Record<string, string> = {
  de_programat: 'de programat',
  programat: 'programat',
  executat: 'executat',
  facturat_de_partener: 'partenerul ne-a facturat',
  facturat_clientului: 'facturat clientului',
};

// Tariful casei pentru fiecare lucrare de montaj: ce rând din „Prețurile noastre" îi ține prețul. E aceeași
// potrivire ca pe web (`casa` din _raxMontTarifeOferta) — DOAR numele rândurilor; cifrele le dă serverul
// (`/api/admin/offers/calc` cu `preturi`, adică lista casei de acum). `verify_contracte_telefon.js` pică dacă
// potrivirea de aici se desparte de cea de pe web.
export const MONTAJ_RAND_TARIF: Record<string, string> = {
  gps: 'mGps', lvcan: 'mLvCan', caninc: 'mCanInc', fms: 'mFms', demontare: 'mUninstall', inlocuire: 'mReplace', deplasare: 'mTravel',
};
// Din valorile „Prețurile noastre" (`preturi.valori.tp`, trimise de server) → prețul casei pe lucrare.
export function tarifeMontajCasa(tp: any): Record<string, number | null> | null {
  if (!tp || typeof tp !== 'object') return null;
  const out: Record<string, number | null> = {};
  Object.keys(MONTAJ_RAND_TARIF).forEach((k) => {
    const v = tp[MONTAJ_RAND_TARIF[k]];
    out[k] = v == null || v === '' || !isFinite(Number(v)) ? null : Number(v);
  });
  return out;
}

// Contract ↔ factură: se potrivesc sau nu, și ce anume nu se potrivește. Cifrele le socotește SERVERUL
// (`comparatie` din /overview, cu funcția facturii); aici doar se pun în propoziții, cu EXACT condițiile de
// pe web (_raxCtrComparatie): toleranța de 1 ban, mașinile în plus / în minus, prețul contului RA Insight,
// serviciile care nu ajung pe factură. `verify_contracte_telefon.js` rulează funcția asta lângă cea de pe
// web, pe aceleași cifre, și pică dacă verdictul sau vreo propoziție diferă.
//   fel: 'gol' (Anexa nr. 1 goală) · 'dupaMontaj' (din ofertă, fără aparate încă) · 'bine' · 'diferit'
// Corpul e JavaScript curat (fără tipuri), ca proba să-l poată rula așa cum e.
export function verdictComparatie(cmp: any): { fel: string; probleme: string[] } | null {
  if (!cmp || !cmp.masini) return null;
  const m = cmp.masini, ai = cmp.raInsight, nef = cmp.nefacturate || [];
  if (!m.contract.nr && !(cmp.total && cmp.total.contract)) return { fel: 'gol', probleme: [] };
  if (!m.factura.nr && m.contract.dinOferta) return { fel: 'dupaMontaj', probleme: [] };
  const probleme = [];
  const difNr = (Number(m.factura.nr) || 0) - (Number(m.contract.nr) || 0);
  if (!m.factura.lei && m.contract.lei) probleme.push('Firma n-are preț în „Abonament & plăți" — factura n-ar avea abonamentul mașinilor.');
  else if (Math.abs(m.factura.lei - m.contract.lei) >= 0.01) {
    probleme.push('Mașinile: contractul spune ' + lei(m.contract.lei) + ' pe lună, factura ar fi ' + lei(m.factura.lei) + '.' +
      (difNr > 0 ? ' Firma are ' + nrMasini(difNr) + ' în plus față de contract — fă un act adițional.'
        : difNr < 0 ? ' Firma are cu ' + nrMasini(-difNr) + ' mai puțin decât în contract.' : ''));
  }
  if (ai && ai.contractPretCont && ai.facturaPretCont && Math.abs(ai.contractPretCont - ai.facturaPretCont) >= 0.01) {
    probleme.push('RA Insight: în contract un cont costă ' + lei(ai.contractPretCont) + ', pe firmă e trecut ' + lei(ai.facturaPretCont) + '.');
  }
  for (let i = 0; i < nef.length; i++) {
    probleme.push('„' + nef[i].nume + '" (' + lei(nef[i].lei) + ' pe lună) e în contract, dar nu ajunge pe factură.');
  }
  return { fel: probleme.length ? 'diferit' : 'bine', probleme: probleme };
}

// Se poate reînnoi: semnat, cu termen, NU se reînnoiește singur și n-are deja o prelungire pornită.
// Aceeași condiție ca pe web (_raxCtrDeReinnoit). Capătul (`sfarsit`) vine de la server.
export function deReinnoit(c: any, sfarsit: any, prelungire: any): boolean {
  return !!(c && c.status === 'activ' && c.auto_renew === false && sfarsit && !prelungire);
}

// „12 luni", dar „24 de luni" — acordul românesc cu numerele, ca `_raxDe` de pe web. Întoarce
// separatorul cu spații: `n + de(n) + 'luni'`.
export function de(n: any): string {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 0) return ' ';
  const r = x % 100;
  return r >= 1 && r <= 19 ? ' ' : ' de ';
}
export function nrMasini(n: any): string {
  const x = Number(n) || 0;
  return x === 1 ? '1 mașină' : x + de(x) + 'mașini';
}
export function nrAparate(n: any): string {
  const x = Number(n) || 0;
  return x === 1 ? '1 aparat' : x + de(x) + 'aparate';
}
// „12 luni", „24 de luni" (fără forma de singular: o durată de o lună nu apare pe niciun ecran).
export function luniText(n: any): string { return n + de(n) + 'luni'; }
// Câte zile mai are, din `zileRamase` dat de server (alarma). Telefonul nu le socotește.
export function zileText(z: any): string {
  if (z == null) return '';
  const n = Number(z);
  if (n < 0) return 'a expirat de ' + (-n) + de(-n) + 'zile';
  if (n === 0) return 'expiră azi';
  return 'expiră în ' + n + de(n) + 'zile';
}

// Data, cum o dă serverul (ms). Telefonul NU socotește capete de contract: le arată.
export function zile(ms: any): string {
  if (ms == null || ms === '') return '—';
  const d = new Date(Number(ms));
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ro-RO');
}
// Pentru <input type="date">: ziua LOCALĂ a datei salvate, ca `_inputZi` de pe web. (Web-ul a folosit ziua
// UTC până pe 29.09: o dată salvată la miezul nopții în România apărea cu o zi mai devreme.)
export function inputZi(ms: any): string {
  if (ms == null || ms === '') return '';
  const d = new Date(Number(ms));
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
// Din <input type="date"> în ms: miezul nopții LOCAL, exact ca `_zi` de pe web (aceeași valoare în bază).
export function zi(v: string): number | null {
  if (!v) return null;
  const t = Date.parse(v + 'T00:00:00');
  return isNaN(t) ? null : t;
}
export function azi(): string { return inputZi(Date.now()); }

export function lei(v: any): string {
  return (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
}
export function eur(v: any): string {
  return (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// Durata în lista de alegere: 12 / 24 / 36 / nedeterminată, plus durata contractului dacă e alta —
// altfel lista o arăta pe prima și, la salvare, 18 luni deveneau 12 pe tăcute (ca `_ctrLuniOptiuni`).
export function luniOptiuni(val: any): [string, string][] {
  const v = String(val == null ? '' : val);
  const opt: [string, string][] = [['12', '12 luni'], ['24', '24 de luni'], ['36', '36 de luni'], ['', 'nedeterminată']];
  if (v && !opt.some((o) => o[0] === v)) opt.unshift([v, v + de(Number(v)) + 'luni']);
  return opt;
}

// Cine semnează din partea noastră: „Alin X și Robert Y" ↔ listă. Funcția se potrivește singură.
export function semnatariDin(valoare: any): string[] {
  return String(valoare || '').split(/\s+și\s+/).map((s) => s.trim()).filter(Boolean);
}
export function rolNostru(cati: number): string { return cati > 1 ? 'Administratori' : 'Administrator'; }
