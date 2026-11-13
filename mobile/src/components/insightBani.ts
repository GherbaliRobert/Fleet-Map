// „RA Insight · control" — cifrele și textele ecranului de pe telefon (AiUsage.tsx), ca pagina web (raxLoadAiUsage).
//
// Regula: telefonul NU socotește bani. Tot ce vine gata de la server (/api/admin/ai-usage) se ia de acolo: venitul, costul, plasa,
// ce ne rămâne pe o firmă (`ramanLei`), soldul Anthropic (`pachete.sold`, din _soldAnthropic). Puținul pe care îl socotește pagina web
// din două cifre ale serverului (ce ne rămâne din total, totalurile istoricului) stă AICI, copiat
// întocmai din ea (_aiuPachete, _aiuTabel, _aiuAvertismente, _aiuIstoric, _aiuStatistici), în aceeași ordine, ca la o graniță de
// rotunjire să iasă aceeași cifră. Când serverul trimite câmpul gata (`costLei`, `baniLei`…), câștigă serverul.
//
// Ce ține cele două copii legate: `node verify_insight_bani.js` rulează funcțiile de aici și blocul web („Panoul RA Insight pe
// firme" din index.html) pe aceleași date și compară cifrele și textele. Ecranul ia TOATE sumele de aici — nu socoti o sumă direct
// în ecran, că n-o mai prinde proba.
//
// Textele cu **îngroșat** se desenează cu <Gros />: doar text, fără HTML.
const n = (v: any) => Number(v) || 0;
const are = (v: any) => v != null && v !== '' && isFinite(Number(v));

// Sumele: „0,35 lei", „45 lei" — fără zerouri de umplutură (ca _aiuNr).
export function nr(v: any): string {
  const x = n(v);
  let s = Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(0);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  // Românește (22.10), ca _aiuNr de pe web: virgula zecimală și punctul miilor.
  const p = s.split('.'), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return p.length > 1 ? i + ',' + p[1] : i;
}
// „45 lei (9 €)", ca _aiuLei, la cursul din răspuns (`fxEur`).
export function lei(v: any, fx: number): string { return nr(v) + ' lei (' + nr(n(v) / fx) + ' €)'; }
// „12 întrebări", „20 de întrebări", „1 întrebare" (ca window._raxNrI).
export function intrebari(v: any): string {
  const x = n(v); const r = Math.abs(x) % 100;
  return x === 1 ? '1 întrebare' : x + ((r === 0 && x) || r >= 20 ? ' de ' : ' ') + 'întrebări';
}
export function lunaNume(luna: string): string {
  const d = new Date(String(luna) + '-01T00:00:00Z');
  const s = d.toLocaleDateString('ro-RO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function dataScurta(t: any): string { return t ? new Date(t).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : '—'; }

// ── Cele patru cifre de sus (web: _aiuPachete) ──
const NUME_PK: Record<string, string> = { start: 'Start', basic: 'Basic', pro: 'Pro', business: 'Business' };
// Din 04.11 rândul vine gata de la server (`sold.sub`, sold_ai.cartonas — aceeași socoteală ca pe web și pe „Acasă"); socoteala de mai jos
// rămâne doar pentru un server de dinainte.
export function textSold(sold: any): string {
  if (!sold) return 'nescris';
  if (typeof sold.sub === 'string') return sold.sub;
  const z = sold.zile;
  return (z != null ? 'ajunge ~' + z + (z % 100 >= 20 || (z % 100 === 0 && z) ? ' de' : '') + ' zile' : 'fără cheltuieli în ultimele ' + (sold.ritmZile || 7) + ' zile')
    + (sold.la ? ' · din $' + Number(sold.scris != null ? sold.scris : sold.usd).toLocaleString('ro-RO') + ' scriși pe ' + new Date(sold.la).toLocaleDateString('ro-RO') : '');
}
export type Tila = { k: string; v: string; s: string; ton?: 'ok' | 'bad'; buton?: string };
export function tilePachete(p: any, fx: number): Tila[] {
  if (!p) return [];
  const peCod = p.peCod || {}, venit = n(p.venitLei), cost = n(p.costLei), ramane = Math.round((venit - cost) * 100) / 100;
  const parti = ['start', 'basic', 'pro', 'business'].filter((k) => peCod[k]).map((k) => peCod[k] + ' ' + NUME_PK[k]);
  const sold = p.sold;
  return [
    { k: 'Încasăm luna asta', v: lei(venit, fx), s: parti.length ? parti.join(' · ') : 'nicio firmă pe un pachet încă' },
    { k: 'Ne costă (real)', v: lei(cost, fx), s: 'plata către model' },
    { k: 'Ne rămân', v: lei(ramane, fx), s: venit > 0 ? Math.round((ramane / venit) * 100) + '% din încasări' : '—', ton: ramane >= 0 ? 'ok' : 'bad' },
    { k: 'Sold Anthropic', v: sold ? (typeof sold.cifra === 'string' ? sold.cifra : '~$' + Number(sold.usd).toLocaleString('ro-RO')) : '—', s: textSold(sold), buton: sold ? 'schimbă' : 'scrie-l' },
  ];
}

// ── Ce cere atenție (web: _aiuAvertismente, _aiuAtentie). Fiecare rând, cu firma lui dacă are una de deschis. ──
// O firmă plătește prețul pachetului (Start e inclus, fără AI — nu e o gaură); un pachet cu AI la 0 lei întreabă pe banii noștri.
// Prețul se pune din fila „Acces" a firmei (`spreAcces`: firmele de deschis). Regula veche, „pe cont", a ieșit pe 11.11.
const cuPretFirma = (x: any) => !x.pachet || !x.pachet.ai || x.venitLei > 0;
export function costLunaLei(s: any, fx: number): number { return n(s.totalCostEur) * fx; }
export type Atentie = { ton: 'bad' | 'warn' | 'info' | 'ok'; t: string; firma?: any; spreAcces?: any[] };
export function avertismente(s: any, rows: any[], fx: number): Atentie[] {
  const r = Array.isArray(rows) ? rows : [], out: Atentie[] = [];
  const cuPret = r.filter(cuPretFirma).length;
  const cuModul = r.filter((x) => x.enabled).length;
  const fara = r.filter((x) => x.enabled && !cuPretFirma(x));
  if (cuModul > 0 && cuPret === 0) {
    out.push({ ton: 'bad', spreAcces: fara, t: '**Nicio firmă nu plătește RA Insight.** ' + intrebari(s.totalCalls || 0)
      + ' luna asta ne costă ' + lei(costLunaLei(s, fx), fx) + ', fără niciun venit. Prețul pachetului se pune pe fiecare firmă, din fila **„Acces”**.' });
  } else if (cuModul > cuPret) {
    out.push({ ton: 'warn', spreAcces: fara, t: (cuModul - cuPret) + (cuModul - cuPret === 1 ? ' firmă are un pachet RA Insight cu AI la 0 lei' : ' firme au un pachet RA Insight cu AI la 0 lei')
      + ' — întreabă pe banii noștri. Prețul se pune din fila **„Acces”** a firmei.' });
  }
  if (s.epuizate) out.push({ ton: 'bad', t: s.epuizate + (s.epuizate === 1 ? ' firmă și-a terminat' : ' firme și-au terminat') + ' întrebările lunii — până pe 1 răspund doar pe loc.' });
  return out;
}
export const NIMIC_ATENTIE = 'Nimic de rezolvat acum.';
export function atentie(p0: any, s: any, rows: any[], fx: number): Atentie[] {
  const p = p0 || {}, r = Array.isArray(rows) ? rows : [], l: Atentie[] = [];
  (Array.isArray(p.langaPlasa) ? p.langaPlasa : []).forEach((x: any) => {
    l.push({ ton: x.procent >= 100 ? 'bad' : 'warn', firma: x.id, t: '**' + x.name + '** e la ' + x.procent + '% din plasă (pachet ' + x.nume + ', ' + lei(x.plafonLei, fx) + ')' + (x.procent >= 100 ? ' — pe butoane până pe 1' : '') });
  });
  r.filter((x) => x.epuizat).forEach((x) => { l.push({ ton: 'bad', firma: x.id, t: '**' + x.name + '**: întrebările lunii s-au terminat — până pe 1 răspunde doar pe butoane' }); });
  if (n(p.jos7) > 0) {
    const cine = r.filter((x) => x.jos7 > 0).sort((a, b) => b.jos7 - a.jos7).slice(0, 4).map((x) => x.name + ' (' + x.jos7 + ')');
    l.push({ ton: 'warn', t: '**' + p.jos7 + (p.jos7 === 1 ? ' răspuns a primit' : ' răspunsuri au primit') + ' 👎** în ultimele 7 zile' + (cine.length ? ': ' + cine.join(', ') : '') + '. Textul lor nu-l vedem — e al omului; aflăm doar câte.' });
  }
  const cor = p.corecturi;
  if (cor && n(p.intrebariAi) > 0) {
    const nrRo = (v: any) => n(v).toLocaleString('ro-RO');
    const deRo = (v: any) => { const x = Math.abs(n(v)) % 100; return (!n(v) || (x >= 1 && x <= 19)) ? ' ' : ' de '; };
    const dece = [[cor.cifre, ' cu o cifră negăsită'], [cor.litere, ' cu litere străine'], [cor.echipament, ' cu vorbe despre aparat']]
      .filter((x) => n(x[0]) > 0).map((x) => nrRo(x[0]) + x[1]);
    l.push({ ton: n(cor.ramase) > 0 ? 'warn' : 'info', t: '**Corectate singure luna asta: ' + nrRo(cor.rescrise) + ' din ' + nrRo(p.intrebariAi) + deRo(p.intrebariAi) + 'răspunsuri**'
      + (dece.length ? ' (' + dece.join(', ') + ')' : '') + '. Au ajuns la client cu „Nu am găsit în rapoarte”: ' + nrRo(cor.ramase) + '. Textul lor nu-l vedem — doar câte.' });
  }
  const inst = n(p.instant), tot = inst + n(p.intrebariAi);
  if (tot > 0) l.push({ ton: 'info', t: Math.round((inst / tot) * 100) + '% din răspunsurile lunii au fost instant, din rapoarte — nu ne-au costat nimic.' });
  return avertismente(s || {}, r, fx).concat(l);
}

// ── Firmă cu firmă: un rând pe firmă, amănuntul la o apăsare (web: _aiuTabel, _aiuPachetRand, _aiuSemnale, _aiuSocoteala, _aiuOameni) ──
// Ce ne costă și ce ne rămâne: de la server (plasa, `ramanLei`); pe Start (fără AI) nu ne costă nimic.
export function costFirmaLei(x: any, fx: number): number { return x.plasa ? n(x.plasa.costLei) : 0; }
export function ramanFirmaLei(x: any, fx: number): number { return x.ramanLei != null ? n(x.ramanLei) : n(x.venitLei) - costFirmaLei(x, fx); }
export function undeConturi(x: any): string {
  if (x.pachet && !x.pachet.ai) return 'pe Start întreabă doar administratorul firmei';
  return 'conturile le dă administratorul firmei, din RA Insight → „Pachet și conturi”';
}
export function socoteala(r: any, fx: number): string[] {
  const l: string[] = [];
  if (r.pachet && !r.pachet.ai) {
    l.push('Pachet **Start**, inclus: **' + intrebari(r.fond).replace('întrebări', 'răspunsuri') + '** pe butoane pe lună, doar administratorul. Fără AI — nu ne costă tokeni.');
  } else if (r.pachet) {
    l.push('Pachet **' + r.pachet.nume + '**: **' + intrebari(r.fond) + '** pe lună, pentru toată firma (' + r.conturi + ' ' + (r.conturi === 1 ? 'cont dat' : 'conturi date') + ').');
    l.push('Prețul pachetului: ' + lei(r.venitLei, fx) + ' pe lună, fix pe firmă. Plasa: RA Insight trece pe butoane când costul real ajunge la 80% din preț.');
  } else {
    l.push('Firma nu are RA Insight.');
  }
  return l;
}
export function semnale(r: any): { ton: 'bad' | 'warn' | 'mut'; t: string }[] {
  const s: { ton: 'bad' | 'warn' | 'mut'; t: string }[] = [];
  if (r.folosFaraCont) s.push({ ton: 'bad', t: r.folosFaraCont + (r.folosFaraCont === 1 ? ' om a întrebat fără să aibă cont' : ' oameni au întrebat fără să aibă cont') + ' — ar trebui să fie imposibil, verifică.' });
  if (r.epuizat) s.push({ ton: 'bad', t: 'Întrebările lunii s-au terminat: până pe 1, doar răspunsuri pe butoane.' });
  else if (r.pct != null && r.pct >= 80) s.push({ ton: 'warn', t: 'A consumat ' + r.pct + '% din fond — mai are ' + intrebari(r.ramase) + '.' });
  if (r.contFaraFolos) s.push({ ton: 'warn', t: r.contFaraFolos + (r.contFaraFolos === 1 ? ' cont dat, nefolosit' : ' conturi date, nefolosite') + ' luna asta — merită un telefon.' });
  if (r.contPeInactiv) s.push({ ton: 'mut', t: r.contPeInactiv + (r.contPeInactiv === 1 ? ' cont e pe un om dezactivat' : ' conturi sunt pe oameni dezactivați') + ' — nu ocupă loc în pachet.' });
  return s;
}
export function randFirma(x: any, fx: number) {
  const cost = costFirmaLei(x, fx), raman = ramanFirmaLei(x, fx);
  const pct = x.pct == null ? null : Math.min(100, x.pct);
  const p = x.plasa;
  return {
    id: x.id, nume: String(x.name || ''),
    pachet: String((x.pachet && x.pachet.nume) || 'Start'),
    bara: x.fond ? (pct || 0) : null, baraTon: x.epuizat ? 'bad' : ((pct || 0) >= 80 ? 'warn' : 'ok'),
    folosite: x.fond ? x.used + ' din ' + x.fond : x.used + ' · fără limită',
    instant: String(x.instant || 0),
    sursa: x.sursa && x.sursa.intrebari ? x.sursa.intrebari + ' · ' + lei(x.sursa.costLei, fx) : '—',
    cost: lei(cost, fx), raman: lei(raman, fx), ramanOk: raman >= 0,
    // Rândul pachetului din amănunt: plasa (cât din 80% din preț), ce ne rămâne.
    pachetRand: x.pachet ? {
      nume: 'Pachet ' + x.pachet.nume,
      plasa: p ? 'plasa ' + p.procent + '% din ' + lei(p.plafonLei, fx) : 'pe butoane, fără AI',
      plasaTon: p ? (p.procent >= 100 ? 'bad' : (p.procent >= 60 ? 'warn' : 'sec')) : 'mut',
      raman: x.ramanLei != null && x.pachet.ai ? 'ne rămân **' + lei(x.ramanLei, fx) + '**' : '',
    } : null,
    semnale: semnale(x),
    socoteala: socoteala(x, fx),
    oameni: (x.oameni || []).map((o: any) => ({
      nume: String(o.nume || ''), stare: o.loc ? (o.activ ? '● cont' : '● cont, om dezactivat') : 'fără cont', ton: o.loc ? (o.activ ? 'ok' : 'mut') : 'bad',
      folosite: intrebari(o.used), usedTon: o.used ? '' : 'mut', data: dataScurta(o.lastUsed),
    })),
    facturat: x.facturatLei ? {
      t: 'În ultimele 12 luni: **' + lei(x.facturatLei, fx) + '**' + (x.incasatLei !== x.facturatLei ? ' — a intrat în cont: **' + lei(x.incasatLei, fx) + '**, restul e neplătit' : ''),
      platit: x.incasatLei === x.facturatLei,
    } : null,
    ultima: 'Ultima întrebare: ' + dataScurta(x.lastUsed) + ' · ' + undeConturi(x),
  };
}
export function textFaraInsight(rows: any[]): string {
  const toate = Array.isArray(rows) ? rows : [], fara = toate.filter((x) => !x.enabled);
  // Fără nicio firmă cu RA Insight, pagina spune doar atât (`NICIO_FIRMA`).
  if (!fara.length || fara.length === toate.length) return '';
  return fara.length + (fara.length === 1 ? ' firmă fără RA Insight: ' : ' firme fără RA Insight: ') + fara.slice(0, 8).map((x) => x.name).join(', ') + (fara.length > 8 ? '…' : '');
}
export const NICIO_FIRMA = 'Nicio firmă cu RA Insight.';
export const NOTA_CONTROL = 'Cifrele sunt ale lunii curente și se reînnoiesc pe 1. „Instant" = răspunsuri date de aplicație din rapoarte, fără model. Conversațiile clienților nu le vedem — aici sunt doar numere. Cei 6 agenți AI merg pe reguli fixe și nu costă nimic.';

// ── „Sursă externă" pe toată platforma (web: _aiuSursa). Textele le dă serverul. ──
export function planSursa(se: any, fx: number) {
  if (!se) return null;
  const de = (x: any) => { const r = Math.abs(n(x)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; };
  const cat = (x: any, unu: string, multe: string) => (Number(x) === 1 ? '1 ' + unu : n(x) + de(x) + multe);
  const pl = se.peLuna || {};
  const luna = se.cautari ? cat(se.intrebari, 'întrebare', 'întrebări') + ' cu sursă externă luna asta · ' + cat(se.cautari, 'căutare', 'căutări') + ' · ' + lei(se.costLei, fx) : 'Nicio căutare pe internet luna asta.';
  return {
    titlu: 'Sursă externă', sub: 'RA Insight caută pe internet, când omul pornește butonul',
    stari: (se.stari || []).map((x: any) => ({ k: String(x.k), t: String(x.t), d: String(x.d || ''), al: x.k === se.stare })),
    model: String(se.model || ''), modelRau: se.modelOk === false,
    eroare: se.eroare ? 'Ultima căutare a dat eroare: ' + se.eroare : '',
    luna: luna + ' · pe lună, pe firmă: Basic ' + n(pl.basic) + ', Pro ' + n(pl.pro) + ', Business ' + n(pl.business),
  };
}

// ── O lună din istoric ──
// Luna curentă, încă nefacturată, are o ESTIMARE; nu intră niciodată în totaluri și e marcată oriunde apare.
export function estimare(m: any): number { return !n(m.facturatLei) && n(m.estimatLei) > 0 ? n(m.estimatLei) : 0; }
export function costLunaIstLei(m: any, fx: number): number { return are(m.costLei) ? n(m.costLei) : n(m.costEur) * fx; }
export function baniLuna(m: any): number { return are(m.baniLei) ? n(m.baniLei) : (n(m.facturatLei) || estimare(m)); }
export function profitLunaIst(m: any, fx: number): number { return are(m.profitLei) ? n(m.profitLei) : baniLuna(m) - costLunaIstLei(m, fx); }
export function neincasatLunaLei(m: any): number { return are(m.neincasatLei) ? n(m.neincasatLei) : n(m.facturatLei) - n(m.incasatLei); }

// Lunile istoricului care se arată: de la prima lună cu viață încolo, inclusiv una moartă la mijloc (ca _aiuIstoric).
export function luniCuViata(ist: any[]): any[] {
  const l = Array.isArray(ist) ? ist : [];
  for (let i = 0; i < l.length; i++) {
    const m = l[i];
    if (n(m.intrebari) > 0 || n(m.facturatLei) !== 0 || n(m.estimatLei) > 0) return l.slice(i);
  }
  return [];
}

// Totalurile și statisticile istoricului (lunile de la prima cu viață încolo).
export type StatIstoric = {
  facturatLei: number; incasatLei: number; neincasatLei: number; costLei: number; profitLei: number;
  intrebari: number; rataIncasare: number | null; marja: number | null;
};
export function statIstoric(luni: any[], fx: number, dinServer?: any): StatIstoric {
  const t = { bani: 0, facturat: 0, incasat: 0, costLei: 0, costEur: 0, intrebari: 0 };
  luni.forEach((m) => {
    t.bani += baniLuna(m); t.facturat += n(m.facturatLei); t.incasat += n(m.incasatLei);
    t.costLei += costLunaIstLei(m, fx); t.costEur += n(m.costEur); t.intrebari += n(m.intrebari);
  });
  // Totalurile afișate sunt, ca pe web (`tot` din _aiuIstoric), sumele NEROTUNJITE — costul total = euro adunați × curs.
  // Rotunjite la ban aici, la o graniță de rotunjire ar arăta altă cifră decât web-ul. Doar când serverul trimite
  // costul lunilor în lei (`costLei`) îl adunăm pe al lui.
  const costTot = luni.some((m) => are(m.costLei)) ? t.costLei : t.costEur * fx;
  const calc: StatIstoric = {
    facturatLei: t.facturat,
    incasatLei: t.incasat,
    // Ce au rămas datori clienții, rotunjit la ban (ca neincasatTot pe web).
    neincasatLei: Math.round((t.facturat - t.incasat) * 100) / 100,
    costLei: costTot,
    // Profitul din tabel: facturat − cost (estimarea NU intră în total), ca pe web (totRamas).
    profitLei: t.facturat - costTot,
    intrebari: t.intrebari,
    rataIncasare: t.facturat > 0 ? Math.round((t.incasat / t.facturat) * 100) : null,
    // Marja pe `bani` (cu estimarea lunii curente), altfel costul lunii curente ar sta față în față cu venitul
    // lunilor trecute și ar ieși mai mică decât adevărul (ca _aiuStatistici).
    marja: t.bani > 0 ? Math.round(((t.bani - t.costLei) / t.bani) * 100) : null,
  };
  if (!dinServer || typeof dinServer !== 'object') return calc;
  const o: any = { ...calc };
  (['facturatLei', 'incasatLei', 'neincasatLei', 'costLei', 'profitLei', 'intrebari', 'rataIncasare', 'marja'] as const).forEach((k) => { if (are(dinServer[k])) o[k] = n(dinServer[k]); });
  // Serverul a trimis facturatul și încasatul, dar nu și restul de plată: îl scoatem din cifrele LUI, nu din ale noastre.
  if (!are(dinServer.neincasatLei) && (are(dinServer.facturatLei) || are(dinServer.incasatLei))) o.neincasatLei = Math.round((o.facturatLei - o.incasatLei) * 100) / 100;
  return o as StatIstoric;
}
