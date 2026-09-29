// „Utilizare RA Insight" — cifrele de bani ale ecranului de pe telefon.
//
// Regula: telefonul NU socotește bani. Tot ce se poate, se ia GATA SOCOTIT de la server (/api/admin/ai-usage):
// venitul și profitul lunii (summary.totalVenitLei / profitLei), iar per firmă și per lună câmpurile `costLei` /
// `profitLei` / `baniLei`, plus statisticile istoricului (`istoricStat`) și tendința — cerute serverului în lotul 2b
// (F2). Până le trimite, rezerva de mai jos e COPIA IDENTICĂ a formulelor de pe web (public/index.html: _aiuKpiuri,
// _aiuTendinta, _aiuEstimare, _aiuStatistici, _aiuIstoric, _aiuCard), fără nicio regulă nouă: doar scăderi și
// împărțiri peste cifrele serverului, cu aceleași intrări și în aceeași ordine ca web-ul (altfel, la o graniță de
// rotunjire, ar ieși altă cifră pe ecran). Când serverul trimite câmpul, câștigă serverul — iar web-ul trebuie să-l
// citească și el, ca cele două ecrane să rămână la fel.
//
// Ce ține cele două copii legate: `node verify_insight_bani.js` rulează funcțiile de aici și blocul web
// („Panoul RA Insight pe firme" din index.html) pe aceleași date și compară cifrele afișate. Ecranul (AiUsage.tsx)
// ia TOATE sumele din funcțiile de aici — nu socoti o sumă direct în ecran, că n-o mai prinde proba.
const n = (v: any) => Number(v) || 0;
const are = (v: any) => v != null && v !== '' && isFinite(Number(v));

// Sumele: „0.35 lei", „45 lei" — fără zerouri de umplutură (ca _aiuNr).
export function nr(v: any): string {
  const x = n(v);
  let s = Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(0);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
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

// ── Luna curentă (summary) ──
// Costul lunii: ca pe web, `totalCostEur × curs`, NEROTUNJIT. Serverul mai trimite și `totalCostLei`, dar rotunjit la
// ban, iar web-ul nu-l citește: la o graniță de rotunjire ar ieși altă cifră pe telefon (proba a prins marja 90% aici,
// 91% pe web). Aceleași intrări, în aceeași ordine ca web-ul → aceeași cifră afișată.
export function costLunaLei(s: any, fx: number): number { return n(s.totalCostEur) * fx; }
// Profitul: `profitLei` de la server e fix formula web-ului (rotunjit la ban din venit − costEur × curs).
export function profitLunaLei(s: any, fx: number): number {
  return are(s.profitLei) ? n(s.profitLei) : Math.round((n(s.totalVenitLei) - costLunaLei(s, fx)) * 100) / 100;
}
export function marjaLuna(s: any, fx: number): number | null {
  if (are(s.marjaPct)) return n(s.marjaPct);
  const venit = n(s.totalVenitLei);
  return venit > 0 ? Math.round(((venit - costLunaLei(s, fx)) / venit) * 100) : null;
}
// Cât aduce în medie un cont facturat (0 = nimic de arătat) și cât ne costă o întrebare (ca _aiuKpiuri).
export function venitPeContLei(s: any): number {
  if (are(s.venitPeContLei)) return n(s.venitPeContLei);
  const conturi = n(s.conturi);
  return conturi > 0 ? n(s.totalVenitLei) / conturi : 0;
}
export function costPeIntrebareLei(s: any, fx: number): number {
  if (are(s.costPeIntrebareLei)) return n(s.costPeIntrebareLei);
  const nrInt = n(s.totalCalls);
  return nrInt > 0 ? costLunaLei(s, fx) / nrInt : 0;
}

// ── O firmă (rows[]) ──
export function costFirmaLei(r: any, fx: number): number { return are(r.costLei) ? n(r.costLei) : n(r.costEur) * fx; }
export function profitFirmaLei(r: any, fx: number): number { return are(r.profitLei) ? n(r.profitLei) : n(r.venitLei) - costFirmaLei(r, fx); }

// ── O lună din istoric ──
// Luna curentă, încă nefacturată, are o ESTIMARE; nu intră niciodată în totaluri și e marcată oriunde apare.
export function estimare(m: any): number { return !n(m.facturatLei) && n(m.estimatLei) > 0 ? n(m.estimatLei) : 0; }
export function costLunaIstLei(m: any, fx: number): number { return are(m.costLei) ? n(m.costLei) : n(m.costEur) * fx; }
export function baniLuna(m: any): number { return are(m.baniLei) ? n(m.baniLei) : (n(m.facturatLei) || estimare(m)); }
export function profitLunaIst(m: any, fx: number): number { return are(m.profitLei) ? n(m.profitLei) : baniLuna(m) - costLunaIstLei(m, fx); }
export function neincasatLunaLei(m: any): number { return are(m.neincasatLei) ? n(m.neincasatLei) : n(m.facturatLei) - n(m.incasatLei); }

// Creșterea lunii curente față de cea trecută. Luna trecută zero → nicio săgeată („+∞%" nu e o informație).
export function tendinta(ist: any[], s?: any): { pct: number; estimat: boolean } | null {
  if (s && s.tendinta && are(s.tendinta.pct)) return { pct: n(s.tendinta.pct), estimat: !!s.tendinta.estimat };
  const l = Array.isArray(ist) ? ist : []; if (l.length < 2) return null;
  const u = l[l.length - 1], p = l[l.length - 2];
  const acum = n(u.facturatLei) || estimare(u), inainte = n(p.facturatLei);
  if (!(inainte > 0)) return null;
  return { pct: Math.round(((acum - inainte) / inainte) * 100), estimat: !n(u.facturatLei) && estimare(u) > 0 };
}

// Cartonașele „Banii, luna curentă", dintr-o bucată: ecranul și proba citesc ACEEAȘI funcție.
export type CifreLuna = {
  venitLei: number; costLei: number; profitLei: number; marja: number | null;
  peContLei: number; peIntrebareLei: number; tendinta: { pct: number; estimat: boolean } | null;
};
export function cifreLuna(s: any, ist: any[], fx: number): CifreLuna {
  return {
    venitLei: n(s.totalVenitLei),
    costLei: costLunaLei(s, fx),
    profitLei: profitLunaLei(s, fx),
    marja: marjaLuna(s, fx),
    peContLei: venitPeContLei(s),
    peIntrebareLei: costPeIntrebareLei(s, fx),
    tendinta: tendinta(ist, s),
  };
}

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
