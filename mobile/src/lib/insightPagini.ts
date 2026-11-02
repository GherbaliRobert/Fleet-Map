// Paginile din RA Insight pe telefon (lotul 2, 02.11): ce arată fiecare, în ce ordine — scoase din ce dă serverul. Fără JSX, fără
// stare, fără cereri: verify_telefon_insight.js rulează funcțiile paginii web (deseneazaSafeDrive, deseneazaCombustibil,
// deseneazaOreCondus, deseneazaMentenanta, deseneazaScrisoare, deseneazaSoferi, deseneazaGhid) pe un DOM de carton, lângă astea, pe
// aceleași răspunsuri, și cere aceleași texte. Aici nu se socotește nimic: cifrele și propozițiile vin de la server (safe_drive.js,
// ramuri.js, soferi_masini.js); aici doar se formatează, ca pe web, și se pun în ordine.
// Pe telefon, un rând de tabel e un cartonaș (CSS: `data-col`), deci nimic nu iese în lături. Ce pe web stă „la trecerea cu
// mouse-ul" (din ce e făcut costul, litrii × prețul, cât e peste fișă) stă aici sub cifră: un telefon n-are mouse.

export interface Ramura { k: string; et: string; ic: string; pachet?: boolean; sub?: string; meniu?: boolean }
// Ramurile, în ordinea de pe web (RAMURI din „secțiunea RA Insight"). `pachet` = de la Basic în sus; `meniu` = stă în „⋯", nu în „Pagini".
export const RAMURI: Ramura[] = [
  { k: 'soferi', et: 'Șoferi pe mașini', ic: 'swap', pachet: true },
  { k: 'safedrive', et: 'RA Drive', sub: 'condus & costuri', ic: 'shield', pachet: true },
  { k: 'combustibil', et: 'Combustibil', ic: 'droplet', pachet: true },
  { k: 'mentenanta', et: 'Mentenanță & acte', ic: 'wrench', pachet: true },
  { k: 'orecondus', et: 'Ore de condus', ic: 'clock', pachet: true },
  { k: 'ghid', et: 'Ghidul aplicației', ic: 'book', meniu: true },
  { k: 'scrisoare', et: 'Scrisoarea de luni', ic: 'mail' },
];
export function ramuraDupa(k: any): Ramura | null { return RAMURI.filter((r) => r.k === k)[0] || null; }
export function pagini(): Ramura[] { return RAMURI.filter((r) => !r.meniu); }
// De la Basic în sus: pe Start rândul e încuiat, cu „· Basic" (web: ramuraIncuiata).
export function ramuraIncuiata(r: Ramura | null, pachet: any): boolean { return !!(r && r.pachet && pachet && !pachet.ramuri); }
// Suma de lângă „Pagini", cât sunt închise: câte lucruri cer atenție, fără ce e încuiat.
export function sumaNumere(numere: any, pachet: any): number {
  let tot = 0;
  pagini().forEach((r) => { const n = numere && numere[r.k]; if (n > 0 && !ramuraIncuiata(r, pachet)) tot += n; });
  return tot;
}
export function paginiDeschise(cerut: boolean, ramura: any): boolean { const r = ramuraDupa(ramura); return !!(cerut || (r && pagini().indexOf(r) >= 0)); }
export const TEXT_INCUIAT = 'Ramurile (RA Drive, Combustibil, Ore de condus, Mentenanță & acte) sunt de la pachetul Basic în sus. Pe Start răspund la întrebările de pe butoane: unde e o mașină, câți km a făcut, unde a stat, ce acte expiră.';

// ── Formele cifrelor, ca pe web (sdLei, sdNr, sdCant) ──
export function sdLei(n: any): string { const r = Math.round(Number(n) || 0), v = Math.abs(r) % 100; return r === 1 ? '1 leu' : r.toLocaleString('ro-RO') + ((v === 0 && r) || v >= 20 ? ' de lei' : ' lei'); }
export function sdNr(x: any, z?: number): string { return x == null ? '—' : Number(x).toLocaleString('ro-RO', { maximumFractionDigits: z || 0 }); }
export function sdCant(n: any, unu: string, multi: string): string { const r = Math.round(Number(n) || 0), v = Math.abs(r) % 100; return r === 1 ? '1 ' + unu : r.toLocaleString('ro-RO') + ((v === 0 && r) || v >= 20 ? ' de ' : ' ') + multi; }

// ── Ce poate desena o pagină ──
export type Act = { fel: 'intreaba'; inceput: string } | { fel: 'discutie'; id: any; nume: string } | { fel: 'scoate'; id: any } | { fel: 'ecran'; ecran: string } | { fel: 'ramura'; k: string };
export interface Buton { text: string; ic?: string; prim?: boolean; act: Act }
export interface Linie { t?: string; cls?: string; chip?: string; ic?: string; niv?: string; buton?: Buton; link?: Buton; loc?: { lat: any; lng: any }; ck?: number }
export interface Cel { cls?: string; linii: Linie[] }
export interface Rand { celule: Cel[]; verif?: string }
export interface Tile { ic?: string; et: string; val: string; sub?: string; mare?: boolean; st?: string; chip?: { fel: string; text: string }; link?: Buton }
export type Bloc =
  | { b: 'card'; h3?: string; text: string }
  | { b: 'pregatire'; h3: string; text: string; procent?: number }
  | { b: 'tiles'; trei?: boolean; tiles: Tile[] }
  | { b: 'linie'; spans: string[] }
  | { b: 'mic'; text: string }
  | { b: 'et'; text: string }
  | { b: 'recbox'; reco: { fel: string; text: string }[]; butoane: Buton[] }
  | { b: 'sect'; titlu: string; ic: string; copii: Bloc[] }
  | { b: 'tabel'; capete: { t: string; cls?: string }[]; randuri: Rand[] }
  | { b: 'loc'; text: string; lat: any; lng: any }
  | { b: 'ore'; coloane: { h: number; proc: number; sus: boolean; n: number }[] }
  | { b: 'cum'; cheie: string; explicatii: { titlu: string; text: string }[]; preturi?: any }
  | { b: 'nota'; text: string }
  | { b: 'scris'; et: string; bucati: ({ t: string; b?: boolean } | { ul: string[] })[]; nota?: string }
  | { b: 'butoane'; butoane: Buton[] }
  | { b: 'rec'; fel: string; text: string }
  | { b: 'rand'; nr: string; text: string; w?: boolean }
  | { b: 'intro'; text: string };
export interface Select { fel: string; aria: string; val: string; optiuni: { v: string; t: string }[] }
export interface Plan { ic: string; titlu: string; sub?: string; selecte: Select[]; intreaba?: Act; blocuri: Bloc[]; reia?: number }

const cel = (t: any, cls?: string): Cel => ({ cls, linii: [{ t: String(t == null ? '' : t) }] });
const hartaLoc = (x: any) => ({ lat: x.lat, lng: x.lng });
export function linkHarta(lat: any, lng: any): string { return 'https://www.google.com/maps?q=' + lat + ',' + lng; }
function selLuna(j: any): Select {
  const mare = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { fel: 'luna', aria: 'Luna', val: String(j.lunaAleasa == null ? '' : j.lunaAleasa), optiuni: (j.luni || []).map((l: any) => ({ v: String(l.luna), t: mare(String(l.eticheta)) })) };
}
function selGrupa(j: any): Select | null {
  if (!((j.grupe || []).length > 1)) return null;
  return { fel: 'grupa', aria: 'Mașinile', val: j.grupaAleasa == null ? '' : String(j.grupaAleasa), optiuni: j.grupe.map((g: any) => ({ v: g.id == null ? '' : String(g.id), t: String(g.eticheta) })) };
}
function selecte(...l: (Select | null)[]): Select[] { return l.filter(Boolean) as Select[]; }
const explicatii = (j: any) => (j.explicatii || []).map((x: any) => ({ titlu: String(x.titlu), text: String(x.text) }));
const cuFata = (m: any) => (m ? m.text : '—');
const clsFata = (m: any) => 'n ' + (m ? m.fel : '');

// ── RA Drive (web: deseneazaSafeDrive) ──
export function planSafeDrive(j: any): Plan {
  const inceput = 'Despre RA Drive, ' + ((j && j.eticheta) || '') + ': ';
  const p: Plan = { ic: 'shield', titlu: 'RA Drive', sub: 'condus & costuri', selecte: selecte(selLuna(j), selGrupa(j)), intreaba: { fel: 'intreaba', inceput }, blocuri: [] };
  if (j.pregatire) {
    const proc = j.pregatire.procent || 1;
    p.blocuri.push({ b: 'pregatire', h3: 'Pregătesc luna…', text: 'Prima dată durează mai mult: socotesc fiecare zi din toate pozițiile mașinilor. Pagina se actualizează singură.', procent: proc });
    p.reia = 2500;
    return p;
  }
  if (j.gol || !(j.masini || []).length) {
    p.blocuri.push({ b: 'card', h3: j.gol ? 'Nicio mașină de arătat' : 'Nimic de arătat în ' + (j.eticheta || 'luna asta'),
      text: j.gol ? 'RA Drive se uită la mașinile la care ai acces — acum nu e niciuna.' : 'Mașinile n-au mers (sau n-au trimis poziții) în perioada asta. Alege altă lună de sus.' });
    return p;
  }
  const f = j.flota || {}, fa = j.fata || {}, c = f.cost || {}, lim = (j.praguri || {}).limita || '';
  const luniiCe = (j.inainte && j.inainte.eticheta) || 'luna dinainte';
  const tiles: Tile[] = [{ mare: true, et: 'Condusul a costat în plus', val: '~' + sdLei(c.total),
    sub: 'în ' + (j.eticheta || '') + (f.costPeMasina != null && f.cuDrum > 1 ? ' · cam ' + sdLei(f.costPeMasina) + ' pe mașină' : '') + ' (estimat)',
    chip: fa.cost ? { fel: fa.fel || 'info', text: fa.cost } : undefined }];
  ([['droplet', 'Combustibil', c.accel, 'în plus, din accelerări bruște'],
    ['alertO', 'Frâne și anvelope', c.frane, 'din frânări și viraje bruște'],
    ['gauge', 'Viteză', c.viteza, 'combustibil în plus, peste ' + lim + ' km/h'],
    ['clock', 'Ralanti', c.ralanti, 'motor pornit pe loc · ' + sdNr(f.ralantiOre, 1) + ' ore']] as any[]).forEach((x) => tiles.push({ ic: x[0], et: x[1], val: sdLei(x[2]), sub: x[3] }));
  p.blocuri.push({ b: 'tiles', tiles });
  p.blocuri.push({ b: 'linie', spans: [
    'Scorul flotei: ' + (f.scor == null ? '—' : f.scor + ' · ' + f.nota) + (fa.scor ? ' (' + fa.scor + ')' : ''),
    'Manevre bruște la 100 km: ' + sdNr(f.laSuta, 1) + (fa.laSuta ? ' (' + fa.laSuta + ')' : ''),
    sdNr(f.km) + ' km · peste ' + lim + ' km/h: ' + sdNr(f.pesteMin) + ' min · cel mai repede ' + sdNr(f.vmax) + ' km/h'] });
  if (j.inaintePregatire) { p.blocuri.push({ b: 'mic', text: 'Comparația cu luna dinainte se pregătește — apare singură în câteva secunde.' }); p.reia = 4000; }
  // Pe șofer
  const costMic = (s: any) => 'combustibil ' + sdLei(s.cost.accel) + ' · frâne și anvelope ' + sdLei(s.cost.frane) + ' · viteză ' + sdLei(s.cost.viteza) + ' · ralanti ' + sdLei(s.cost.ralanti);
  const pe: Bloc[] = [];
  if ((j.soferi || []).length) {
    const zi = (z: any) => String(z).split('-').reverse().join('.');
    pe.push({ b: 'tabel', capete: [{ t: 'Șofer' }, { t: 'Mașina' }, { t: 'Cost pe lună', cls: 'n' }, { t: 'Bruște la 100 km', cls: 'n' }, { t: 'Față de ' + luniiCe, cls: 'n' }, { t: 'Au mers măsurile?', cls: 'lat' }],
      randuri: j.soferi.map((s: any) => {
        const lat: Linie[] = [];
        if (s.discutie) {
          const cm = s.discutie.comparatie;
          lat.push({ chip: cm ? cm.fel : 'info', t: cm ? cm.text : 'Ați vorbit pe ' + zi(s.discutie.zi) });
          lat.push({ cls: 'mic', t: 'Discuția din ' + zi(s.discutie.zi) + (s.discutie.nota ? ' — „' + s.discutie.nota + '”' : '') });
          if (j.poateNota) lat.push({ link: { text: 'Scoate', act: { fel: 'scoate', id: s.discutie.id } } });
        } else if (s.id && j.poateNota) lat.push({ buton: { text: 'Am vorbit cu el', ic: 'comments', act: { fel: 'discutie', id: s.id, nume: s.nume } } });
        else lat.push({ t: '—' });
        return { celule: [cel(s.nume, s.id ? 'b' : 'mut'), cel((s.masini || []).join(', ') || '—', 'mic nw'),
          { cls: 'n b', linii: [{ t: sdLei(s.cost && s.cost.total) }, { t: costMic(s), cls: 'mic' }] },
          cel(sdNr(s.laSuta, 1), 'n'), cel(cuFata(s.fata), clsFata(s.fata)), { cls: 'lat', linii: lat }] };
      }) });
    pe.push({ b: 'mic', text: 'Fiecare zi merge pe cine conducea mașina atunci.' });
  } else pe.push({ b: 'mic', text: 'Mașinile n-au șoferi trecuți în aplicație. Îi treci din Management → Șoferi, iar de atunci RA Drive îi arată aici.' });
  p.blocuri.push({ b: 'sect', titlu: 'Pe șofer — cine costă cel mai mult', ic: 'user', copii: pe });
  // Unde și când se repetă
  const un: Bloc[] = [];
  (j.locuri || []).forEach((x: any) => un.push({ b: 'loc', lat: x.lat, lng: x.lng, text: (x.adresa || ('zona ' + x.lat.toFixed(3) + ', ' + x.lng.toFixed(3))) + ' — ' + x.n + ' manevre bruște' }));
  if (!(j.locuri || []).length) un.push({ b: 'mic', text: 'Niciun loc nu iese în evidență.' });
  const ore: number[] = f.ore || [];
  let prim = -1, ult = -1, mx = 0;
  ore.forEach((v, h) => { if (v > 0) { if (prim < 0) prim = h; ult = h; } if (v > mx) mx = v; });
  if (mx > 0) {
    un.push({ b: 'et', text: 'Manevrele bruște, pe ore' });
    const de = Math.max(0, Math.min(prim, ult - 5)), pana = Math.min(23, Math.max(ult, de + 5));
    const top = ore.slice().sort((a, b) => b - a)[Math.min(2, ore.length - 1)] || mx;
    const coloane: { h: number; proc: number; sus: boolean; n: number }[] = [];
    for (let h = de; h <= pana; h++) coloane.push({ h, n: ore[h], proc: Math.max(4, Math.round(ore[h] / mx * 100)), sus: ore[h] >= top && ore[h] > 0 });
    un.push({ b: 'ore', coloane });
  }
  (j.ferestre || []).forEach((x: any, k: number) => un.push({ b: 'mic', text: (k ? 'Apoi: ' : 'Cele mai multe: ') + x.text + ' (' + x.n + ' manevre)' }));
  p.blocuri.push({ b: 'sect', titlu: 'Unde și când se repetă', ic: 'mapPin', copii: un });
  // Ce recomandă RA Insight (pe reguli, din cifrele de mai sus — nu se numără)
  if ((j.recomandari || []).length) {
    let sof: any = null;
    j.recomandari.forEach((x: any) => { if (x.sofer && !sof) sof = x.sofer; });
    const butoane: Buton[] = [];
    if (sof && j.poateNota) butoane.push({ text: 'Am vorbit cu ' + sof.nume + ' azi — pornește comparația', ic: 'comments', prim: true, act: { fel: 'discutie', id: sof.id, nume: sof.nume } });
    butoane.push({ text: 'Întreabă RA Insight despre asta', ic: 'sparkles', act: { fel: 'intreaba', inceput } });
    p.blocuri.push({ b: 'recbox', reco: j.recomandari.map((x: any) => ({ fel: x.fel || 'info', text: String(x.text) })), butoane });
  }
  // Pe mașină
  p.blocuri.push({ b: 'sect', titlu: 'Pe mașină', ic: 'car', copii: [{ b: 'tabel',
    capete: [{ t: 'Mașina' }, { t: 'Km', cls: 'n' }, { t: 'Scor', cls: 'n' }, { t: 'Bruște la 100 km', cls: 'n' }, { t: 'Ralanti (ore)', cls: 'n' }, { t: 'Peste ' + lim + ' (min)', cls: 'n' }, { t: 'Cost', cls: 'n' }, { t: 'Față de ' + luniiCe, cls: 'n' }],
    randuri: j.masini.map((m: any) => ({ celule: [cel(m.eticheta, 'b'), cel(sdNr(m.km), 'n'), cel(m.scor == null ? '—' : m.scor + ' · ' + m.nota, 'n'),
      cel(sdNr(m.laSuta, 1), 'n'), cel(sdNr(m.ralantiOre, 1), 'n'), cel(sdNr(m.pesteMin), 'n'),
      { cls: 'n b', linii: [{ t: sdLei(m.cost.total) }, { t: costMic(m), cls: 'mic' }] }, cel(cuFata(m.fata), clsFata(m.fata))] })) }] });
  // Cum se socotește + prețurile pe manevră
  p.blocuri.push({ b: 'cum', cheie: 'safedrive', explicatii: explicatii(j), preturi: j.preturi || {} });
  p.blocuri.push({ b: 'nota', text: 'Costurile sunt estimate și socotite de aplicație, la vedere (vezi „Cum se socotește”). Prețul combustibilului e al mașinii sau al firmei; prețul pe manevră îl poate schimba firma.' });
  return p;
}
export const EVENIMENTE_PRET = [['frana', 'Frânare bruscă'], ['accel', 'Accelerare bruscă'], ['viraj', 'Viraj brusc']];
export const TEXT_PRETURI = { titlu: 'Prețul unei manevre bruște (lei)', felul: 'Felul mașinii', salveaza: 'Salvează prețurile', pornire: 'Înapoi la prețurile de pornire', citit: 'Prețurile le schimbă cine conduce flota în firmă (administratorul sau managerul).' };

// ── Combustibil (web: deseneazaCombustibil). „Harta" de acolo e linkul spre Google Maps: la fel aici. ──
export function planCombustibil(j: any): Plan {
  const inceput = 'Despre combustibil, ' + ((j && j.eticheta) || '') + ': ';
  const p: Plan = { ic: 'droplet', titlu: 'Combustibil', selecte: selecte(selLuna(j), selGrupa(j)), intreaba: { fel: 'intreaba', inceput }, blocuri: [] };
  if (j.pregatire) {
    p.blocuri.push({ b: 'pregatire', h3: 'Pregătesc luna…', text: 'Prima dată durează mai mult: citesc toate pozițiile mașinilor din lună (și aceleași zile din luna dinainte, pentru comparație). Pagina se actualizează singură.' });
    p.reia = 2500;
    return p;
  }
  if (j.gol || !(j.masini || []).length) {
    p.blocuri.push({ b: 'card', h3: j.gol ? 'Nicio mașină de arătat' : 'Nimic de arătat în ' + (j.eticheta || 'luna asta'),
      text: j.gol ? 'Combustibil se uită la mașinile la care ai acces — acum nu e niciuna.' : 'Mașinile n-au mers (sau n-au trimis poziții) în perioada asta. Alege altă lună de sus.' });
    return p;
  }
  const f = j.flota || {}, fa = j.fata || {}, ev = j.evenimente || {};
  const luniiCe = (j.inainte && j.inainte.eticheta) || 'luna dinainte';
  const tiles: Tile[] = [{ mare: true, et: 'Combustibilul a costat', val: (f.procentEstimat ? '~' : '') + sdLei(f.cost),
    sub: 'în ' + (j.eticheta || '') + (f.masini > 1 ? ' · ' + sdCant(f.masini, 'mașină', 'mașini') : ''), chip: fa.cost ? { fel: fa.fel || 'info', text: fa.cost } : undefined }];
  ([['droplet', 'Consumat', sdCant(f.litri, 'litru', 'litri'), f.procentEstimat ? f.procentEstimat + '% estimați din fișă' : 'măsurați la toate mașinile', ''],
    ['gauge', 'Consum mediu', f.l100 == null ? '—' : sdNr(f.l100, 1) + ' L', 'la 100 km · ' + sdNr(f.km) + ' km parcurși' + (fa.l100 ? ' · ' + fa.l100 : ''), ''],
    ['pump', 'Alimentări', String(ev.alimentari || 0), ev.alimentari ? sdCant(ev.litriAlimentati, 'litru alimentat', 'litri alimentați') : 'se văd la mașinile care trimit nivelul din rezervor', ''],
    ['alert', 'Scăderi suspecte', String(ev.scaderi || 0), ev.scaderi ? sdCant(ev.litriScazuti, 'litru', 'litri') + ' în total' : 'niciuna', ev.scaderi ? 'rosu' : '']] as any[])
    .forEach((x) => tiles.push({ ic: x[0], et: x[1], val: x[2], sub: x[3], st: x[4] || undefined }));
  p.blocuri.push({ b: 'tiles', tiles });
  if ((j.recomandari || []).length) p.blocuri.push({ b: 'recbox', reco: j.recomandari.map((x: any) => ({ fel: x.fel || 'info', text: String(x.text) })), butoane: [{ text: 'Întreabă RA Insight despre asta', ic: 'sparkles', act: { fel: 'intreaba', inceput } }] });
  // Pe mașină — „peste normă" e lista serverului (pesteNorma), nu o regulă a paginii
  const peste: Record<string, boolean> = {}; (j.pesteNorma || []).forEach((x: any) => { peste[x.imei] = true; });
  const randuri: Rand[] = j.masini.map((m: any) => {
    const l100: Linie[] = [{ t: m.l100 == null ? '—' : sdNr(m.l100, 1) }];
    if (m.peste != null) l100.push({ cls: 'mic', t: (m.peste > 0 ? 'cu ' + m.peste + '% peste' : (m.peste < 0 ? 'cu ' + Math.abs(m.peste) + '% sub' : 'cât')) + ' consumul din fișă' });
    return { celule: [cel(m.eticheta, 'b'), cel(sdNr(m.km), 'n'), cel(sdNr(m.litri, 1), 'n'), { cls: 'n' + (peste[m.imei] ? ' rosu' : ''), linii: l100 },
      cel(m.norma == null ? '—' : sdNr(m.norma, 1), 'n'), cel(m.sursa || '—', m.estimat ? 'mut' : undefined),
      { cls: 'n b', linii: [{ t: sdLei(m.cost) }, { t: sdNr(m.litri, 1) + ' L × ' + sdNr(m.pret, 2) + ' lei/L', cls: 'mic' }] }, cel(cuFata(m.fata), clsFata(m.fata))],
      // Cifre greu de crezut (cifre.js, din motorul rapoartelor): spuse sub mașină, nu ascunse
      verif: (m.deVerificat || []).length ? ' De verificat: ' + m.deVerificat.join('; ') + '.' : undefined };
  });
  p.blocuri.push({ b: 'sect', titlu: 'Pe mașină', ic: 'car', copii: [
    { b: 'tabel', capete: [{ t: 'Mașina' }, { t: 'Km', cls: 'n' }, { t: 'Litri', cls: 'n' }, { t: 'L la 100 km', cls: 'n' }, { t: 'În fișă', cls: 'n' }, { t: 'Sursa' }, { t: 'Cost', cls: 'n' }, { t: 'Față de ' + luniiCe, cls: 'n' }], randuri },
    { b: 'mic', text: '„În fișă” e cel mai mare consum trecut în fișa mașinii (de obicei „Consum oraș”).' }] });
  // Scăderile suspecte: când, cât, cu motorul pornit sau oprit, unde (linkul spre hartă)
  const sc: Bloc[] = [];
  if ((j.scaderi || []).length) {
    sc.push({ b: 'tabel', capete: [{ t: 'Mașina' }, { t: 'Când' }, { t: 'Litri', cls: 'n' }, { t: 'Rezervorul', cls: 'n' }, { t: 'Motorul' }, { t: 'Unde', cls: 'lat' }],
      randuri: j.scaderi.map((x: any) => ({ celule: [cel(x.eticheta, 'b'), cel(x.cand, 'nw'), cel(sdNr(x.litri, 1), 'n rosu'),
        cel(sdNr(x.de, 1) + ' → ' + sdNr(x.la, 1) + ' L', 'n'), cel(x.motorPornit ? 'pornit' : 'oprit'),
        { cls: 'lat', linii: [x.lat != null && x.lng != null ? { t: x.loc || 'pe hartă', loc: hartaLoc(x) } : { t: x.loc || '—' }] }] })) });
  } else sc.push({ b: 'mic', text: 'Nicio scădere suspectă în perioada asta. (Se văd doar la mașinile care trimit nivelul din rezervor.)' });
  p.blocuri.push({ b: 'sect', titlu: 'Scăderi suspecte' + ((j.scaderi || []).length ? ' · ' + j.scaderi.length : ''), ic: 'alert', copii: sc });
  p.blocuri.push({ b: 'cum', cheie: 'combustibil', explicatii: explicatii(j) });
  p.blocuri.push({ b: 'nota', text: 'Aceleași cifre ca în rapoartele Consum, Costuri și Alimentări & scăderi, pentru aceeași perioadă. Prețul combustibilului e al mașinii sau al firmei.' });
  return p;
}

// ── Ore de condus (web: deseneazaOreCondus) ──
export function planOreCondus(j: any): Plan {
  const inceput = 'Despre orele de condus, ' + ((j && j.eticheta) || '') + ': ';
  const selS: Select = { fel: 'saptamana', aria: 'Săptămâna', val: String(j.saptamanaAleasa == null ? '' : j.saptamanaAleasa), optiuni: (j.saptamani || []).map((x: any) => ({ v: String(x.saptamana), t: String(x.optiune) })) };
  const p: Plan = { ic: 'clock', titlu: 'Ore de condus', selecte: selecte(selS, selGrupa(j)), intreaba: { fel: 'intreaba', inceput }, blocuri: [] };
  if (j.pregatire) {
    p.blocuri.push({ b: 'pregatire', h3: 'Pregătesc săptămâna…', text: 'Prima dată durează mai mult: citesc pozițiile (și datele tahografului, unde există) ale fiecărei mașini din săptămână. Pagina se actualizează singură.' });
    p.reia = 2500;
    return p;
  }
  if (j.gol || !(j.soferi || []).length) {
    p.blocuri.push({ b: 'card', h3: j.gol ? 'Nicio mașină de arătat' : 'Nimic de arătat în ' + (j.eticheta || 'săptămâna asta'),
      text: j.gol ? 'Ore de condus se uită la mașinile la care ai acces — acum nu e niciuna.' : 'Mașinile n-au mers (sau n-au trimis poziții) în săptămâna asta. Alege altă săptămână de sus.' });
    return p;
  }
  if (j.atentie) p.blocuri.push({ b: 'rec', fel: 'atentie', text: String(j.atentie) });
  const f = j.flota || {}, fa = j.fata || {}, curenta = (j.soferi || []).some((x: any) => x.azi != null);
  const tot = (f.soferi || 0) + (f.faraSofer || 0);
  const tiles: Tile[] = [{ mare: true, et: 'Ore de condus', val: f.text || '—',
    sub: 'în ' + (j.eticheta || '') + ' · ' + (f.soferi === 1 ? '1 șofer' : (f.soferi || 0) + ' șoferi') + (f.faraSofer ? ' · ' + (f.faraSofer === 1 ? '1 mașină fără șofer' : f.faraSofer + ' mașini fără șofer') : ''),
    chip: fa.text ? { fel: fa.fel || 'info', text: fa.text } : undefined }];
  ([['alert', 'Încălcări Reg. 561', String(f.incalcari || 0), f.incalcari ? (f.cuIncalcari === 1 ? 'la un șofer' : 'la ' + f.cuIncalcari + ' șoferi') : (f.supusi ? 'niciuna' : 'nu se aplică la autoturisme'), f.incalcari ? 'rosu' : ''],
    ['calendar', 'Cea mai lungă zi', f.ziMax ? f.ziMax.text : '—', f.ziMax ? f.ziMax.nume + ' · ' + f.ziMax.cand : '', ''],
    ['clock', 'Condus fără pauză', f.continuuMax ? f.continuuMax.text : '—', f.continuuMax ? f.continuuMax.nume + ' · ' + f.continuuMax.cand : '', ''],
    ['idCard', 'Din tahograf', (f.tahograf || 0) + ' din ' + tot, f.tahograf ? (f.tahograf < tot ? 'restul, estimat din GPS' : 'toate din tahograf') : 'toate estimate din GPS', '']] as any[])
    .forEach((x) => tiles.push({ ic: x[0], et: x[1], val: x[2], sub: x[3], st: x[4] || undefined }));
  p.blocuri.push({ b: 'tiles', tiles });
  if ((j.recomandari || []).length) p.blocuri.push({ b: 'recbox', reco: j.recomandari.map((x: any) => ({ fel: x.fel || 'info', text: String(x.text) })), butoane: [{ text: 'Întreabă RA Insight despre asta', ic: 'sparkles', act: { fel: 'intreaba', inceput } }] });
  const capete: { t: string; cls?: string }[] = [{ t: 'Șofer · mașina' }, { t: 'Zile', cls: 'n' }, { t: 'Condus', cls: 'n' }];
  if (curenta) capete.push({ t: 'Azi', cls: 'n' });
  capete.push({ t: 'Cea mai lungă zi', cls: 'n' }, { t: 'Fără pauză, maxim', cls: 'n' }, { t: 'Încălcări', cls: 'n' }, { t: 'Sursa' });
  const cuZi = (val: any, zi: any): Cel => ({ cls: 'n nw', linii: zi ? [{ t: String(val) }, { t: String(zi), cls: 'mic' }] : [{ t: String(val) }] });
  const randuri: Rand[] = j.soferi.map((x: any) => {
    const celule: Cel[] = [{ cls: 'nw', linii: [{ t: x.faraSofer ? 'fără șofer trecut' : x.nume, cls: x.faraSofer ? 'mut' : 'b' }, { t: (x.masini || []).join(', ') || '—', cls: 'mic' }] },
      cel(String(x.zile), 'n'), cel(x.text.condus, 'n b')];
    if (curenta) celule.push(cel(x.text.azi || '—', 'n'));
    celule.push(cuZi(x.text.ziMax, x.text.ziMaxZi), cuZi(x.text.continuuMax, x.text.continuuMaxZi));
    celule.push(x.supus ? cel(String(x.incalcari), 'n' + (x.incalcari ? ' rosu' : '')) : cel('nu se aplică', 'n nw mut'));
    celule.push(cel(x.sursa === 'GPS' ? 'GPS' : x.text.sursa, 'nw' + (x.sursa === 'GPS' ? ' mut' : '')));
    return { celule };
  });
  p.blocuri.push({ b: 'sect', titlu: 'Pe șofer', ic: 'user', copii: [{ b: 'tabel', capete, randuri }] });
  const inc: Bloc[] = [];
  if ((j.incalcari || []).length) {
    inc.push({ b: 'tabel', capete: [{ t: 'Ziua' }, { t: 'Șofer' }, { t: 'Ce' }, { t: 'Mașina' }, { t: 'Sursa' }],
      randuri: j.incalcari.map((x: any) => ({ celule: [cel(x.ziText, 'nw'), cel(x.nume, 'b'), cel(x.ce, 'rosu'), cel((x.masini || []).join(', ') || '—', 'mic'),
        cel(x.sursa === 'tahograf' ? 'tahograf' : 'estimat din GPS', x.sursa === 'tahograf' ? undefined : 'mut')] })) });
  } else inc.push({ b: 'mic', text: f.supusi ? 'Nicio încălcare a Reg. 561 în ' + (j.eticheta || 'săptămâna asta') + '.' : 'Reg. 561 nu se aplică la mașinile care au mers (autoturisme și autoutilitare ușoare).' });
  p.blocuri.push({ b: 'sect', titlu: 'Încălcările, zi cu zi' + ((j.incalcari || []).length ? ' · ' + j.incalcari.length : ''), ic: 'alert', copii: inc });
  p.blocuri.push({ b: 'cum', cheie: 'orecondus', explicatii: explicatii(j) });
  p.blocuri.push({ b: 'nota', text: 'Aceleași cifre ca în raportul „Condus & repaus (Reg. 561)”, pentru aceeași săptămână. Pentru un control oficial contează tahograful.' });
  return p;
}

// ── Mentenanță & acte (web: deseneazaMentenanta). Stările și textele sunt ale serverului. ──
export function planMentenanta(j: any): Plan {
  const p: Plan = { ic: 'wrench', titlu: 'Mentenanță & acte', selecte: [], intreaba: { fel: 'intreaba', inceput: 'Despre acte și revizii: ' }, blocuri: [] };
  const z = j.rezumat || {}, rd: any[] = j.randuri || [];
  p.blocuri.push({ b: 'tiles', trei: true, tiles: [
    { ic: 'alertO', et: 'Au trecut de termen', val: String(z.depasite || 0), sub: z.depasite ? 'de rezolvat acum' : 'nimic', st: z.depasite ? 'rosu' : undefined },
    { ic: 'clock', et: 'Urmează', val: String(z.curand || 0), sub: 'în perioada de preaviz', st: z.curand ? 'atentie' : undefined },
    { ic: 'report', et: 'Acte fără dată de expirare', val: String(z.faraData || 0), sub: z.faraData ? 'completează data în Documente' : 'toate au dată' }] });
  if (!rd.length) p.blocuri.push({ b: 'card', h3: 'Totul e la zi', text: 'Niciun act, nicio revizie și niciun permis nu a trecut de termen și nimic nu urmează în perioada de preaviz.' });
  ([['depasit', 'Au trecut de termen', 'alertO', 'rosu'], ['curand', 'Urmează', 'clock', 'atentie']] as string[][]).forEach((gr) => {
    const lista = rd.filter((x) => x.stare === gr[0]);
    if (!lista.length) return;
    p.blocuri.push({ b: 'sect', titlu: gr[1] + ' · ' + lista.length, ic: gr[2], copii: [{ b: 'tabel', capete: [{ t: 'Ce' }, { t: 'Mașina / șoferul' }, { t: 'Când' }, { t: '' }],
      randuri: lista.map((x) => ({ celule: [cel(x.ce, 'b'), cel(x.cine), cel(x.cand, gr[3]),
        { cls: 'n', linii: [{ buton: { text: x.ecran === 'documente' ? 'La Documente' : (x.ecran === 'drivers' ? 'La Șoferi' : 'La Mentenanță'), ic: 'arrowRight', act: { fel: 'ecran', ecran: x.ecran } } }] }] })) }] });
  });
  p.blocuri.push({ b: 'cum', cheie: 'mentenanta', explicatii: explicatii(j) });
  return p;
}

// ── Scrisoarea de luni (web: deseneazaScrisoare): lista, apoi scrisoarea aleasă (la deschidere se socotește citită). ──
export function scrisoareAleasa(lista: any[], id: any): any { return lista.filter((x) => x.id === id)[0] || lista[0]; }
export function planScrisoare(lst: any, ales: any, x: any, eroare?: string): Plan {
  const lista: any[] = lst.scrisori || [];
  const sel: Select | null = lista.length > 1 ? { fel: 'scrisoare', aria: 'Săptămâna', val: ales ? String(ales.id) : '', optiuni: lista.map((s) => ({ v: String(s.id), t: 'Săptămâna ' + s.eticheta + (s.citita ? '' : ' · nouă') })) } : null;
  const p: Plan = { ic: 'mail', titlu: 'Scrisoarea de luni', selecte: selecte(sel), blocuri: [] };
  if (!lista.length) {
    p.blocuri.push({ b: 'card', h3: 'Prima scrisoare vine luni la ' + (lst.ora || 8), text: 'În fiecare luni dimineață, RA Insight îți scrie ce contează din săptămâna trecută: drumul și combustibilul, cum s-a condus, orele de condus, actele și reviziile care vin — și ce e de făcut. O găsești aici și primești un anunț.' });
    return p;
  }
  if (eroare) { p.blocuri.push({ b: 'card', text: eroare }); return p; }
  if (!x) return p;
  const bucati: ({ t: string; b?: boolean } | { ul: string[] })[] = [];
  String(x.text || '').split(/\n\s*\n/).forEach((bucata) => {
    const rnd = bucata.split('\n'), puncte = rnd.filter((l) => /^\s*•\s+/.test(l));
    const titlu = rnd.filter((l) => !/^\s*•\s+/.test(l)).join(' ').trim();
    if (titlu) bucati.push({ t: titlu, b: puncte.length > 0 });
    if (puncte.length) bucati.push({ ul: puncte.map((l) => l.replace(/^\s*•\s+/, '')) });
  });
  p.blocuri.push({ b: 'scris', et: 'De la RA Insight · săptămâna ' + (x.eticheta || ''), bucati, nota: x.scrisDe !== 'model' ? 'Scrisă din cifre, pe reguli (RA Insight n-a putut-o scrie de data asta).' : undefined });
  const f = x.fapte || {};
  const tiles: Tile[] = [];
  const tile = (ic: string, et: string, val: string, sub: string, ram: string[] | null, st?: string) => tiles.push({ ic, et, val, sub: sub || undefined, st: st || undefined, link: ram ? { text: 'Vezi în ' + ram[1], act: { fel: 'ramura', k: ram[0] } } : undefined });
  if (f.drum) tile('route', 'Drum', sdNr(f.drum.km) + ' km', f.drum.masini === 1 ? 'o mașină a mers' : f.drum.masini + ' mașini au mers', null);
  if (f.combustibil) tile('droplet', 'Combustibil', sdLei(f.combustibil.lei), sdCant(f.combustibil.litri, 'litru', 'litri') + (f.combustibil.fata ? ' · ' + f.combustibil.fata : ''), ['combustibil', 'Combustibil'], f.combustibil.scaderiTotal || (f.combustibil.pesteNorma || []).length ? 'atentie' : '');
  if (f.safeDrive) tile('shield', 'Condusul a costat în plus', f.safeDrive.lei ? '~' + sdLei(f.safeDrive.lei) : '0 lei', f.safeDrive.scor != null ? 'scorul flotei: ' + f.safeDrive.scor + ' · ' + f.safeDrive.nota : '', ['safedrive', 'RA Drive']);
  if (f.oreCondus) tile('clock', 'Ore de condus', f.oreCondus.total, f.oreCondus.incalcariTotal ? (f.oreCondus.incalcariTotal === 1 ? 'o încălcare' : f.oreCondus.incalcariTotal + ' încălcări') : (f.oreCondus.seAplica ? 'nicio încălcare' : 'Reg. 561 nu se aplică'), ['orecondus', 'Ore de condus'], f.oreCondus.incalcariTotal ? 'rosu' : '');
  if (f.acte) tile('wrench', 'Acte și revizii', String((f.acte.trecuteTotal || 0) + (f.acte.urmeazaTotal || 0)), (f.acte.trecuteTotal ? (f.acte.trecuteTotal === 1 ? 'unul trecut de termen' : f.acte.trecuteTotal + ' trecute de termen') : 'nimic trecut de termen') + (f.acte.urmeazaTotal ? ' · ' + (f.acte.urmeazaTotal === 1 ? 'unul vine' : f.acte.urmeazaTotal + ' vin') + ' săptămâna asta' : ''), ['mentenanta', 'Mentenanță & acte'], f.acte.trecuteTotal ? 'rosu' : (f.acte.urmeazaTotal ? 'atentie' : ''));
  p.blocuri.push({ b: 'tiles', trei: true, tiles });
  p.blocuri.push({ b: 'butoane', butoane: [{ text: 'Întreabă RA Insight despre săptămâna asta', ic: 'sparkles', act: { fel: 'intreaba', inceput: 'Despre săptămâna ' + (x.eticheta || '') + ': ' } }] });
  p.blocuri.push({ b: 'nota', text: 'Cifrele sunt cele din ramuri, pe mașinile la care ai acces. O păstrăm 12 luni.' });
  return p;
}

// ── Șoferi pe mașini (web: deseneazaSoferi) ──
export interface BifaSofer { imei: any; la: any; dupa?: any }
export function planSoferi(j: any): Plan & { propuneri: BifaSofer[]; intro: string; faraSoferi?: boolean; jos: string; nuStie: string } {
  const tx = j.texte || {};
  const p: any = { ic: 'swap', titlu: 'Șoferi pe mașini', selecte: [], intreaba: { fel: 'intreaba', inceput: 'Despre șoferii pe mașini: ' }, blocuri: [], propuneri: [], intro: tx.intro || '', jos: '', nuStie: '' };
  if (j.platforma) {
    p.blocuri.push({ b: 'card', h3: 'Contul de fondator n-are o flotă', text: 'Potrivirea șoferilor se face pe flota unei firme: intră cu contul administratorului firmei.' });
    p.intro = '';
    return p;
  }
  if (j.faraSoferi) {
    p.faraSoferi = true;
    p.blocuri.push({ b: 'card', h3: 'Nu ai niciun șofer trecut în aplicație', text: 'Adaugă-i din Management › Șoferi, cu categoriile și valabilitatea permisului, și potrivirea apare aici.' });
    return p;
  }
  const rz = j.rezumat || {};
  p.blocuri.push({ b: 'tiles', trei: true, tiles: [
    { ic: 'alertO', et: 'De rezolvat', val: String(rz.deRezolvat || 0), sub: rz.deRezolvatText || '', st: rz.deRezolvat ? 'rosu' : undefined },
    { ic: 'circleCheck', et: 'În regulă', val: String(rz.inRegula || 0), sub: rz.inRegulaText || '' },
    { ic: 'user', et: 'Șoferi liberi', val: String(rz.liberi || 0), sub: rz.liberiText || '' }] });
  const props: any[] = j.propuneri || [];
  if (props.length) {
    p.propuneri = props.map((x) => ({ imei: x.imei, la: x.la, dupa: x.dupa }));
    p.blocuri.push({ b: 'sect', titlu: 'Ce propun · ' + props.length, ic: 'check', copii: [{ b: 'tabel', capete: [{ t: '' }, { t: 'Mașina' }, { t: 'Acum' }, { t: 'Propun' }, { t: 'De ce' }],
      randuri: props.map((x, i) => {
        const a = x.acum || {};
        const acum: Linie[] = [a.nume ? { t: String(a.nume) } : { t: 'fără șofer', cls: 'ssm-gri' }];
        acum.push({ t: a.nume ? a.text : (String(a.text || '').replace(/^fără șofer\s*/, '') || 'fără șofer'), cls: 'ssm-s ' + (a.nivel === 'r' ? 'r' : 'w'), niv: a.nivel === 'r' ? 'r' : 'w' });
        const masina: Linie[] = [{ t: String(x.nr), cls: 'b' }]; if (x.descriere) masina.push({ t: String(x.descriere), cls: 'ssm-s' });
        const propun: Linie[] = [{ t: String(x.propun.nume), cls: 'b' }]; if (x.propun.sub) propun.push({ t: String(x.propun.sub), cls: 'ssm-s' });
        return { celule: [{ cls: 'ssm-ck', linii: [{ ck: i }] }, { linii: masina }, { linii: acum }, { linii: propun }, cel(x.deCe || '', 'ssm-dece')] };
      }) }] });
  }
  if ((j.faraPropunere || []).length) p.blocuri.push({ b: 'sect', titlu: 'Fără propunere · ' + j.faraPropunere.length, ic: 'circleInfo', copii: j.faraPropunere.map((f: any) => ({ b: 'rand', nr: String(f.nr), text: ' · ' + ((f.acum || {}).nume ? f.acum.nume + ', ' : '') + ((f.acum || {}).text || '') + ' — ' + f.motiv })) });
  const ok: any[] = j.inRegula || [];
  p.blocuri.push({ b: 'sect', titlu: 'În regulă · ' + ok.length, ic: 'circleCheck', copii: ok.length ? ok.map((m) => ({ b: 'rand', nr: String(m.nr), w: m.nivel === 'w', text: (m.nume ? ' · ' + m.nume : '') + ' — ' + m.sofer + ' · ' + m.text })) : [{ b: 'mic', text: 'Nicio mașină cu șofer potrivit, încă.' }] });
  if ((j.deCompletat || []).length) p.blocuri.push({ b: 'sect', titlu: 'De completat în fișa șoferului · ' + j.deCompletat.length, ic: 'edit', copii: j.deCompletat.map((m: any) => ({ b: 'rand', nr: String(m.nr), text: ' — ' + m.sofer + ': ' + m.text })) });
  p.nuStie = tx.nuStie || '';
  p.jos = j.poate ? (tx.jos || '') : 'Doar cine poate schimba vehiculele aplică: ' + (j.aproba || 'administratorul firmei') + '.';
  return p;
}
// Bifele: o schimbare care folosește un șofer scos de pe altă mașină („după ce iese de pe…") merge doar împreună cu aceea (web: leaga).
export interface BifaStare { checked: boolean; disabled: boolean }
export function legaBife(props: BifaSofer[], stare: BifaStare[]): { stare: BifaStare[]; n: number } {
  const out = stare.map((b) => Object.assign({}, b));
  const bifate: Record<string, boolean> = {};
  out.forEach((b, i) => { if (b.checked && !b.disabled) bifate[String(props[i].imei)] = true; });
  out.forEach((b, i) => {
    const d = props[i].dupa;
    if (!d) return;
    const poate = !!bifate[String(d)];
    if (!poate) { b.checked = false; b.disabled = true; } else if (b.disabled) { b.disabled = false; b.checked = true; }
  });
  return { stare: out, n: out.filter((b) => b.checked && !b.disabled).length };
}
export function textAplica(n: number): string { return 'Aplică cele bifate (' + n + ')'; }

// ── Ghidul aplicației (web: deseneazaGhid): citit e gratuit; o întrebare în plus merge la RA Insight. ──
export function inceputGhid(titlu: any): string { return 'Despre „' + titlu + '”: '; }

// Toate textele unui plan, în ordine (proba le pune lângă textele paginii web).
export function textePlan(p: any): string[] {
  const out: string[] = [];
  const pune = (t: any) => { if (t != null && String(t).trim() !== '') out.push(String(t).trim()); };
  const lin = (l: Linie) => { pune(l.t); if (l.buton) pune(l.buton.text); if (l.link) pune(l.link.text); };
  const umbla = (b: any) => {
    if (b.b === 'card' || b.b === 'pregatire') { pune(b.h3); pune(b.text); if (b.procent != null) pune(b.procent + '%'); }
    else if (b.b === 'tiles') b.tiles.forEach((t: Tile) => { pune(t.et); pune(t.val); pune(t.sub); if (t.chip) pune(t.chip.text); if (t.link) pune(t.link.text); });
    else if (b.b === 'linie') b.spans.forEach(pune);
    else if (b.b === 'mic' || b.b === 'et' || b.b === 'nota' || b.b === 'loc' || b.b === 'rec') pune(b.text);
    else if (b.b === 'recbox') { pune('Ce recomandă RA Insight'); b.reco.forEach((r: any) => pune(r.text)); b.butoane.forEach((x: Buton) => pune(x.text)); }
    else if (b.b === 'sect') { pune(b.titlu); b.copii.forEach(umbla); }
    else if (b.b === 'tabel') { b.capete.forEach((c: any) => pune(c.t)); b.randuri.forEach((r: Rand) => { r.celule.forEach((c) => c.linii.forEach(lin)); if (r.verif) pune(r.verif); }); }
    else if (b.b === 'ore') b.coloane.forEach((c: any) => pune(String(c.h)));
    else if (b.b === 'cum') {
      pune('Cum se socotește');
      b.explicatii.forEach((x: any) => { pune(x.titlu + '.'); pune(x.text); });
      if (b.preturi) {
        const P = b.preturi;
        pune(TEXT_PRETURI.titlu); pune(TEXT_PRETURI.felul); EVENIMENTE_PRET.forEach((e) => pune(e[1]));
        (P.clase || []).forEach((cl: any) => { pune(cl.et); if (!P.poateSchimba) EVENIMENTE_PRET.forEach((e) => pune(sdNr(((P.valori || {})[cl.k] || {})[e[0]], 2))); });
        if (P.poateSchimba) { pune(TEXT_PRETURI.salveaza); pune(TEXT_PRETURI.pornire); } else pune(TEXT_PRETURI.citit);
      }
    }
    else if (b.b === 'scris') { pune(b.et); b.bucati.forEach((x: any) => { if (x.ul) x.ul.forEach(pune); else pune(x.t); }); pune(b.nota); }
    else if (b.b === 'butoane') b.butoane.forEach((x: Buton) => pune(x.text));
    else if (b.b === 'rand') { pune(b.nr); pune(b.text); }
    else if (b.b === 'intro') pune(b.text);
  };
  pune(p.titlu); pune(p.sub);
  (p.selecte || []).forEach((s: Select) => s.optiuni.forEach((o) => pune(o.t)));
  if (p.intreaba) pune('Întreabă RA Insight');
  (p.blocuri || []).forEach(umbla);
  return out;
}
