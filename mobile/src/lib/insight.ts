import { RAMURI, ramuraDupa, ramuraIncuiata } from './insightPagini';
import { usaCaseta } from './cereriEchipa';

// Regulile ecranului RA Insight de pe telefon (02.11): ce arată un răspuns, în ce ordine, unde duce un buton, ce pleacă la
// server. Fără JSX, fără stare, fără cereri: verify_telefon_insight.js le rulează lângă bucățile paginii (public/index.html,
// blocul „secțiunea RA Insight" și piesele comune de deasupra lui), pe aceleași cazuri. Schimbi o regulă pe web → proba pică
// până o schimbi și aici. Telefonul nu socotește nimic și nu scrie niciun text de-al serverului: aici stau doar etichetele pe
// care și pagina le scrie de mână, cu aceleași cuvinte.

// ── Conversația nouă: trei butoane scurte (pe ecran `t`, pleacă `q`). Ca pe web: CARDURI, CARDURI_REGULI. ──
export const CARDURI = [
  { t: 'Ce probleme are flota?', q: 'Ce probleme are flota acum?' },
  { t: 'Km săptămâna trecută', q: 'Câți km a făcut fiecare mașină săptămâna trecută?' },
  { t: 'Ce acte expiră?', q: 'Ce acte expiră în următoarele 30 de zile?' },
];
// Pe butoane (Start, sau luna oprită) primul e unul la care răspund regulile — „ce probleme are flota" cere AI.
export const CARDURI_REGULI = [{ t: 'Ce a făcut flota ieri?', q: 'Ce a făcut flota ieri?' }].concat(CARDURI.slice(1));

// Perioadele de ales din „+" — scrise cum le înțeleg regulile (window._CHAT_PERIOADE).
export const PERIOADE = [
  { text: 'Azi', pune: 'azi' }, { text: 'Ieri', pune: 'ieri' }, { text: 'Săptămâna asta', pune: 'săptămâna asta' },
  { text: 'Săptămâna trecută', pune: 'săptămâna trecută' }, { text: 'Luna asta', pune: 'luna asta' },
  { text: 'Luna trecută', pune: 'luna trecută' }, { text: 'Ultimele 30 de zile', pune: 'ultimele 30 de zile' },
];

// Paginile din „Domenii" (ramurile) și ghidul, pe telefon: un `pagina` dintr-un răspuns, un buton `ramura` și un rând din „Azi la tine"
// le deschid. O pagină încuiată (Start): „Actele" din „Azi la tine" pleacă drept întrebare, ca pe web.
// „pachet" = „Pachet și conturi" (web: `S.ramura === 'pachet'`, doar administratorul firmei; ceilalți rămân pe discuție).
export const RAMURI_PE_TELEFON: string[] = RAMURI.map((r) => r.k).concat(['pachet']);

// Salutul (05.11): prenumele îl dă serverul (/api/me → prenume, regula din prenume.js: „Tilvar Alin" → „Alin", fără nume din email),
// ca pe web. Telefonul nu-l mai socotește din nume.
export function textSalut(prenume: any): string {
  const p = String(prenume || '').trim();
  return (p ? 'Salut, ' + p + '! ' : 'Salut! ') + 'Cu ce te pot ajuta?';
}

// ── „azi, 12:56" / „ieri" / „28 sept." și grupele din sertar ──
function zi0(d: any): number { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
export function cand(ts: any, acum: number = Date.now()): string {
  const d = new Date(ts); if (isNaN(d.getTime())) return '';
  const z = (zi0(acum) - zi0(d)) / 86400000;
  if (z < 1) return 'azi, ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  if (z < 2) return 'ieri';
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}
export function grup(ts: any, acum: number = Date.now()): string {
  const z = (zi0(acum) - zi0(ts)) / 86400000;
  return z < 1 ? 'Azi' : (z < 2 ? 'Ieri' : (z < 7 ? 'Săptămâna asta' : 'Mai demult'));
}

// ── Pachetul și contorul, din GET /api/ai/quota (web: incarcaPachet, textContor, deseneazaPachet) ──
function nrI(n: any): string { const v = Number(n) || 0; const r = Math.abs(v) % 100; return v === 1 ? '1 întrebare' : v + ((r === 0 && v) || r >= 20 ? ' de ' : ' ') + 'întrebări'; }
export function textContor(q: any, pachet: any, fondator: boolean): string {
  if (pachet) return String(pachet.scurt || '');
  if (q && !q.error && (q.unlimited || !q.questions)) return fondator ? 'Fondator · fără limită' : 'Fără limită';
  return '';
}
// Rândul de jos din sertar: un rând (`text`); amănuntul (pe web, la trecerea cu mouse-ul) se deschide la o apăsare (`detaliu`).
export function randFond(q: any, pachet: any, contor: string): { text: string; detaliu: string; avert: boolean } | null {
  if (pachet) return { text: pachet.nume + ' · ' + String(pachet.scurt || ''), detaliu: [pachet.text, pachet.textOm, pachet.reincarcare].filter(Boolean).join(' · '), avert: !!(q && q.blocked) };
  if (contor) return { text: contor, detaliu: '', avert: false };
  if (!q || q.error || q.unlimited || !q.questions) return null;
  // Regula veche, pe cont: oprit până pe 1, fără niciun cost în plus; „Un cont în plus…" doar cu cifra firmei.
  const reset = q.periodEnd ? new Date(q.periodEnd).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }) : '';
  const peCont = Number(q.questionsPerSeat) || 0;
  const inPlus = peCont > 0 ? 'Un cont în plus aduce încă ' + nrI(peCont) + ' pe lună.' : '';
  const opr = !!(q.blocked || q.remaining <= 0);
  return { text: opr ? 'Fondul lunii s-a terminat: oprit până pe ' + reset + ', fără niciun cost în plus.' : 'Întrebări · ' + q.remaining + ' din ' + nrI(q.questions), detaliu: inPlus, avert: opr };
}
export function stareDinQuota(q: any, fondator: boolean) {
  const bun = !!(q && !q.error);
  const pachet = (bun && q.pachet) || null;
  // „Sursă externă": fără voie (noi, firma, pachetul), nu apare.
  const sursaInfo = (bun && q.sursa && q.sursa.vede) ? q.sursa : null;
  const peReguli = !!(pachet && (!pachet.ai || q.blocked));
  const contor = textContor(q, pachet, fondator);
  return { pachet, sursaInfo, peReguli, contor, fond: randFond(q, pachet, contor) };
}
export function placeholderCaseta(peReguli: boolean, pachet: any, poateRapoarte: boolean): string {
  return !peReguli ? (poateRapoarte ? 'Scrie o întrebare sau cere un raport…' : 'Scrie o întrebare…') : (pachet && !pachet.ai ? 'Apasă „+" sau scrie o întrebare…' : 'Apasă „+" ca să alegi…');
}
// Butonul „Sursă externă": pe Start și când butoanele răspund (fără AI) nu apare. Oprit = doar globul (pe ecran îngust, numele
// pleacă, ca pe web); pornit = și câte au rămas, plus fraza de sub casetă. Când s-au terminat, rămâne cu „0 din 10".
export function butonSursa(si: any, peReguli: boolean, pornit: boolean) {
  const s = peReguli ? null : si;
  if (!s) return null;
  return { nume: String(s.nume || ''), contor: (pornit || !s.poate) && s.contor ? String(s.contor) : '', on: !!pornit, gol: !s.poate, nota: pornit && s.nota ? String(s.nota) : '' };
}
export function areAi(peReguli: boolean, pachet: any): boolean { return !peReguli && !(pachet && !pachet.ai); }

// ── „Azi la tine": un rând = un clic (web: aziPrimul, aziButon) ──
export function aziPrimul(rd: any, cuAi: boolean, poateRapoarte: boolean): any {
  return (rd.butoane || []).filter((b: any) => {
    if (b.fel === 'dece' && !cuAi) return false;
    if (b.fel === 'harta' && !(b.imeis || []).length) return false;
    if (b.fel === 'raport' && !poateRapoarte) return false;
    return true;
  })[0] || null;
}
// Ce face rândul: { ruta } sau { trimite, buton }. „De ce?" e o întrebare pentru RA Insight (se numără), restul pleacă pe butoane.
export function aziActiune(b: any, pachet?: any): { ruta?: string; trimite?: string; buton?: boolean } | null {
  if (!b) return null;
  if (b.fel === 'harta') return { ruta: rutaMasina((b.imeis || [])[0]) };
  if (b.fel === 'acte' || b.fel === 'pagina') {
    const rm = ramuraDupa(b.ramura);
    if (rm && !ramuraIncuiata(rm, pachet)) return { ruta: rutaRamura(rm.k) };
  }
  if (b.fel === 'dece') return { trimite: b.trimite };
  if (b.trimite) return { trimite: b.trimite, buton: true };
  return null;
}

// ── Unde duce un buton (web: insightProblemaButon) ──
const enc = encodeURIComponent;
function rutaMasina(imei: any): string { return '/vehicles/' + enc(String(imei)); }
export function rutaRamura(k: any, id?: any): string { return '/insight/' + enc(String(k)) + (id != null && id !== '' ? '?id=' + enc(String(id)) : ''); }
function ms(v: any): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return isFinite(n) ? n : null;
}
// Ecranele web pe care le deschid butoanele (goManage) și perechile lor de pe telefon.
const ECRANE: Record<string, string> = { alerts: '/admin/alerts', maintenance: '/admin/maintenance', documente: '/admin/documents', drivers: '/admin/drivers' };
export function rutaIstoric(id: any): string { return '/reports?histId=' + enc(String(id)); }
export function rutaRaport(tip: any, imei?: any, de?: any, pana?: any): string {
  const q: string[] = [];
  if (tip) q.push('tip=' + enc(String(tip)));
  if (imei) q.push('imei=' + enc(String(imei)));
  const a = ms(de), z = ms(pana);
  if (a != null && z != null) q.push('de=' + a, 'pana=' + z);
  return '/reports' + (q.length ? '?' + q.join('&') : '');
}
// Traseu, pe mașina și intervalul din problemă, cu punctul marcat (viteza de 159 km/h, la 14:32).
export function rutaTraseu(b: any): string {
  const q: string[] = [];
  const a = ms(b.de), z = ms(b.pana);
  if (a != null && z != null) q.push('de=' + a, 'pana=' + z);
  if (b.lat != null && b.lng != null) q.push('lat=' + Number(b.lat), 'lng=' + Number(b.lng));
  if (b.eticheta) q.push('et=' + enc(String(b.eticheta)));
  return rutaMasina(b.imei) + '/route' + (q.length ? '?' + q.join('&') : '');
}
// Adresa butonului, sau null: nu are unde duce pe telefon, deci nu se desenează (un buton nu promite ce n-avem încă).
export function rutaButon(b: any, p?: any): string | null {
  if (!b) return null;
  const imei = b.imei != null && b.imei !== '' ? String(b.imei) : '';
  if (b.fel === 'echipa') return usaCaseta(b, p);   // „Anunță echipa RA Track": fereastra cererii, cu ce a scris aplicația în casetă
  if (b.fel === 'harta') return imei ? rutaMasina(imei) : null;
  if (b.fel === 'traseu') return imei ? rutaTraseu(b) : null;
  if (b.fel === 'ecran') return ECRANE[String(b.ecran || '')] || null;
  if (b.fel === 'ramura') return RAMURI_PE_TELEFON.indexOf(String(b.ramura || '')) >= 0 ? rutaRamura(b.ramura) : null;
  if (b.fel === 'programate') return '/report-schedules';
  if (b.fel === 'fisa') return imei ? rutaMasina(imei) + '?edit=fisa' : null;
  if (b.fel === 'raport') return rutaRaport(b.tip, b.imei, b.de, b.pana);
  return null;
}
export function butonuriCuDrum(lista: any, p?: any): any[] {
  return (Array.isArray(lista) ? lista : []).filter((b: any) => b && b.text && rutaButon(b, p) != null);
}
// Iconițele cerute de server sunt nume Font Awesome (`ic`): perechile lor de pe telefon.
const ICONE_FA: Record<string, string> = {
  'fa-bell': 'bell', 'fa-clock': 'clock', 'fa-comments': 'comments', 'fa-file-contract': 'fileSignature', 'fa-file-lines': 'report',
  'fa-screwdriver-wrench': 'wrench', 'fa-id-card': 'idCard', 'fa-user-minus': 'user', 'fa-shield-halved': 'shield', 'fa-truck': 'truck',
  'fa-arrow-right': 'arrowRight', 'fa-map-location-dot': 'mapPin', 'fa-gauge-high': 'gauge', 'fa-headset': 'headset',
};
export function iconaFa(ic: any, implicit: string): string { return ICONE_FA[String(ic || '')] || implicit; }
export function iconaButonProblema(fel: any): string {
  return ({ traseu: 'mapPin', harta: 'mapPin', fisa: 'gauge', echipa: 'headset' } as Record<string, string>)[String(fel || '')] || 'report';
}

// ── Textul serverului: **îngroșat**, titluri și liste, fără HTML (web: md, mdScurt, textGros). Doar noduri, niciodată innerHTML. ──
export interface Parte { t: string; b?: boolean; i?: boolean }
const RE_BOLD = /\*\*([^*]+)\*\*/g;
// *italic* (explicațiile serverului când s-a terminat fondul): un „*" urmat de spațiu (listă) sau lipit de cifre („2*3") rămâne text.
const RE_ITALIC = /(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![*\w])/g;
function bucati(s: string, re: RegExp, cu: (m: RegExpExecArray) => { inainte?: string; parte: string }, fel: 'b' | 'i', rest: (t: string) => Parte[]): Parte[] {
  const out: Parte[] = [];
  let la = 0, m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(s))) {
    const c = cu(m);
    out.push(...rest(s.slice(la, m.index) + (c.inainte || '')));
    out.push({ t: c.parte, [fel]: true } as Parte);
    la = m.index + m[0].length;
  }
  out.push(...rest(s.slice(la)));
  return out.filter((x) => x.t !== '');
}
export function partiGros(s: any): Parte[] {
  return bucati(String(s == null ? '' : s), RE_BOLD, (m) => ({ parte: m[1] }), 'b', (t) => (t ? [{ t }] : []));
}
export function partiMd(s: any): Parte[] {
  const italic = (t: string): Parte[] => bucati(t, RE_ITALIC, (m) => ({ inainte: m[1], parte: m[2] }), 'i', (x) => (x ? [{ t: x }] : []));
  return bucati(String(s == null ? '' : s), RE_BOLD, (m) => ({ parte: m[1] }), 'b', italic);
}
// Un bloc al răspunsului. `tab` (05.11) = un tabel din răspuns („| a | b |" + „|---|---|"), ca pe web (md): capul, numele coloanelor
// (fără steluțe, pentru cartonașul de pe telefon) și rândurile.
export type BlocMd = { fel: 'gol' | 'h' | 'li' | 'p'; parti: Parte[] } | { fel: 'tab'; parti: Parte[]; cap: Parte[][]; coloane: string[]; randuri: Parte[][][] };
export function mdBlocuri(t: any): BlocMd[] {
  const lin = String(t || '').split('\n'), out: BlocMd[] = [];
  const rand = (l: string) => { const tr = l.trim(); return tr.length > 1 && tr.charAt(0) === '|'; };
  const cel = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const sep = (l: string) => rand(l) && cel(l).every((x) => /^:?-{2,}:?$/.test(x));
  for (let i = 0; i < lin.length; i++) {
    if (rand(lin[i]) && i + 1 < lin.length && sep(lin[i + 1])) {
      const cap = cel(lin[i]), rs: string[][] = [];
      for (i += 2; i < lin.length && rand(lin[i]); i++) rs.push(cel(lin[i]));
      i--;
      out.push({ fel: 'tab', parti: [], cap: cap.map((c) => partiMd(c)), coloane: cap.map((c) => c.replace(/\*\*/g, '')), randuri: rs.map((r) => r.map((c) => partiMd(c))) });
      continue;
    }
    const l = lin[i].replace(/\s+$/, ''), tr = l.trim();
    if (tr === '') { out.push({ fel: 'gol', parti: [] }); continue; }
    if (/^#{1,6}\s+/.test(tr)) { out.push({ fel: 'h', parti: partiMd(tr.replace(/^#{1,6}\s+/, '')) }); continue; }
    if (/^[•\-*]\s+/.test(tr)) { out.push({ fel: 'li', parti: partiMd(tr.replace(/^[•\-*]\s+/, '')) }); continue; }
    out.push({ fel: 'p', parti: partiMd(l) });
  }
  return out;
}
// Ce se copiază: fără steluțe și fără diez (web: _chatTextSimplu).
export function textSimplu(t: any): string {
  return String(t || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^[•*-]\s+/gm, '• ').trim();
}
// Linkurile din „Sursă externă": doar http / https.
export function linkSigur(url: any): boolean { return /^https?:\/\//i.test(String(url || '')); }

// ── Caseta: o bucată (mașina, perioada) pusă unde e cursorul (web: _chatPuneInText). `buton` = întrebarea e făcută doar din butoane. ──
export function punInText(v: string, a: number | null, b: number | null, bucata: string, eraDinButoane: boolean) {
  const buton = !String(v || '').trim() || eraDinButoane;
  const de = a != null ? a : v.length, pana = b != null ? b : v.length;
  const inainte = v.slice(0, de), dupa = v.slice(pana);
  const pune = (inainte && !/\s$/.test(inainte) ? ' ' : '') + bucata + (dupa && !/^\s/.test(dupa) ? ' ' : '');
  return { text: inainte + pune + dupa, cursor: (inainte + pune).length, buton };
}
// Mașinile din „+": aceeași listă ca harta (GET /api/devices), sortate (web: _chatMasini).
export function masiniAlegere(devices: any): { text: string; sub: string; pune: string }[] {
  const l = Array.isArray(devices) ? devices : ((devices && devices.devices) || []);
  return l.map((d: any) => {
    const nr = String(d.plate || '').trim(), nume = String(d.name || '').trim();
    return { text: nr && nume && nr !== nume ? nr + ' · ' + nume : (nr || nume || String(d.imei)), sub: d.group_name || '', pune: nr || nume || String(d.imei) };
  }).sort((a: any, b: any) => a.text.localeCompare(b.text, 'ro'));
}
// Lista din „+": Mașina, Perioada și (cu dreptul la rapoarte) Raport.
export function listaPlus(poateRapoarte: boolean) {
  const l = [{ text: 'Mașina', sub: 'numărul sau numele', ic: 'car', k: 'm' }, { text: 'Perioada', sub: 'azi, ieri, luna trecută…', ic: 'calendar', k: 'p' }];
  if (poateRapoarte) l.push({ text: 'Raport', sub: 'îl fac și-l pun în Istoric', ic: 'report', k: 'r' });
  return l;
}
// Meniul „⋯". „Pachet și conturi": administratorul firmei (web: `esteAdmin() && (S.pachet || S.faraLoc)`). Redenumirea și ștergerea:
// doar pe o conversație deschisă, nu pe o pagină.
export function listaMeniu(o: { areConv: boolean; peRamura?: boolean; poateAgenti: boolean; poatePachet?: boolean }) {
  const l: { text: string; ic: string; k: string; sep?: boolean; rosu?: boolean }[] = [];
  if (o.areConv || o.peRamura) l.push({ text: 'Conversație nouă', ic: 'plus', k: 'nou' });
  if (o.poatePachet) l.push({ text: 'Pachet și conturi', ic: 'layers', k: 'pachet' });
  l.push({ text: 'Notițele firmei', ic: 'note', k: 'notite' });
  if (o.poateAgenti) l.push({ text: 'Setările agenților', ic: 'robot', k: 'agenti' });
  l.push({ text: 'Ghidul aplicației', ic: 'book', k: 'ghid' });
  if (o.areConv && !o.peRamura) { l.push({ text: 'Redenumește conversația', ic: 'edit', k: 'r', sep: true }); l.push({ text: 'Șterge conversația', ic: 'trash', k: 's', rosu: true }); }
  return l;
}
export const NOTA_MENIU = 'Conversațiile le vezi doar tu și se păstrează 12 luni de la ultimul mesaj.';

// ── Întrebarea: ce pleacă la POST /api/insight/intreaba și ce se ține din răspuns (web: insightTrimite) ──
export function corpIntrebare(message: string, o: { buton?: boolean; sursa?: boolean; conversatieId?: any }) {
  const corp: Record<string, any> = { message };
  if (o.buton) corp.buton = true;
  if (o.sursa) corp.sursa = true;   // „Sursă externă" pornită în discuția asta
  if (o.conversatieId) corp.conversatieId = o.conversatieId; else corp.nou = true;
  return corp;
}
export function mesajDinRaspuns(j: any) {
  return { rol: 'assistant', id: j.mesajId || null, text: j.reply || j.message || j.error || 'RA Insight nu a putut răspunde acum.', feedback: null as number | null,
    extra: { sources: j.sources, inteles: j.inteles, alege: j.alege, source: j.source, urmari: j.urmari, verificare: j.verificare,
      propunere: j.propunere, propuneri: j.propuneri, actiuni: j.actiuni, pagina: j.pagina,
      limita: j.limita, pachetMesaj: j.pachetMesaj, raport: j.raport, rapoarte: j.rapoarte, probleme: j.probleme,
      verificat: j.verificat, verificatText: j.verificatText, nota: j.nota, insigna: j.insigna, sursa: j.sursa, faraModel: j.faraModel } };
}
// Pasul următor după „Da": mesajul nou de la server (web: adaugaUrmator).
export function mesajUrmator(u: any) {
  if (!u || !u.text) return null;
  return { rol: 'assistant', id: u.mesajId || null, text: u.text, feedback: null as number | null, extra: { source: 'reguli', urmari: u.urmari, insigna: u.insigna } };
}

// ── Răspunsul: ce se arată și în ce ordine (web: bulaAi). O singură hotărâre, pe care o citește desenul. ──
export type ParteBula = 'insigna' | 'inteles' | 'limita' | 'rapoarte' | 'text' | 'sursa' | 'propunere' | 'actiuni' | 'probleme' | 'verificat' | 'nota' | 'alege' | 'surse' | 'jos';
export function planBula(m: any) {
  const x = (m && m.extra) || {};
  const carduri: any[] = Array.isArray(x.rapoarte) && x.rapoarte.length ? x.rapoarte : (x.raport && x.raport.label ? [x.raport] : []);
  const cuRaport = carduri.length > 0 && x.source !== 'ai';
  const insigna = x.insigna && (x.insigna.eticheta || x.insigna.text) ? x.insigna : null;
  const inteles: any[] = !cuRaport && Array.isArray(x.inteles) ? x.inteles : [];
  let textAi = String((m && m.text) || '');
  let limita: string | null = null;
  if (x.limita || x.pachetMesaj) {
    limita = x.limita ? textAi : String(x.pachetMesaj);
    if (x.pachetMesaj && textAi.indexOf(x.pachetMesaj) === 0) textAi = textAi.slice(x.pachetMesaj.length).replace(/^\s+/, '');
  }
  const mai: any[] = Array.isArray(x.propuneri) ? x.propuneri.filter((q: any) => q && q.id) : [];
  const propunere = x.propunere && x.propunere.id ? x.propunere : null;
  // Propunerea apăsată nu-și mai arată fraza de deasupra („apeși Da și o fac"): cartonașul spune tot.
  const propInchisa = mai.length ? mai.every((q: any) => q.stare !== 'propusa') : !!(propunere && propunere.stare !== 'propusa');
  const text = !x.limita && !cuRaport && !propInchisa && textAi ? textAi : '';
  const sursa = x.sursa && Array.isArray(x.sursa.surse) ? x.sursa : null;
  const actiuni: any[] = Array.isArray(x.actiuni) ? x.actiuni : [];
  const probleme: any[] = Array.isArray(x.probleme) ? x.probleme : [];
  // Textul rândului „✓" îl scrie serverul; mesajele salvate înainte de 30.10 n-au textul și rămân cum erau.
  const verificat = x.verificat ? String(x.verificatText || (x.sursa ? 'Cifrele le-am luat din aplicație și din sursele de mai sus.' : 'Cifrele le-am luat din rapoarte.')) : '';
  const vf = x.nota ? { perioada: x.nota } : x.verificare;
  const nota = vf && vf.perioada ? String(vf.perioada) : '';
  const alege: any[] = Array.isArray(x.alege) ? x.alege : [];
  const toateSursele: any[] = Array.isArray(x.sources) ? x.sources : [];
  const surse = toateSursele.slice(0, 2);
  const voteaza = !!(m && m.id && x.source !== 'local');
  const nume: string[] = [];
  toateSursele.forEach((s: any) => { const n = String(s.label || ''); if (n && nume.indexOf(n) < 0) nume.push(n); });
  const q = (n: string) => '„' + n + '”';
  const dinRaport = nume.length ? (nume.length === 1 ? 'Din raportul ' : 'Din rapoartele ') + (nume.length <= 2 ? nume.map(q).join(' și ') : nume.slice(0, 2).map(q).join(', ') + ' și încă ' + (nume.length - 2)) : '';
  const ordine: ParteBula[] = [];
  if (insigna) ordine.push('insigna');
  if (inteles.length) ordine.push('inteles');
  if (limita != null) ordine.push('limita');
  if (carduri.length) ordine.push('rapoarte');
  if (text) ordine.push('text');
  if (sursa) ordine.push('sursa');
  if (propunere || mai.length) ordine.push('propunere');
  if (actiuni.length) ordine.push('actiuni');
  if (probleme.length) ordine.push('probleme');
  if (verificat) ordine.push('verificat');
  if (nota) ordine.push('nota');
  if (alege.length) ordine.push('alege');
  if (surse.length) ordine.push('surse');
  ordine.push('jos');
  // `faraPachete` (04.11): mesajul refuzului lui Anthropic — caseta fără „Vezi pachetele" (web: `!x.faraModel`).
  return { insigna, inteles, limita, faraPachete: !!x.faraModel, carduri, text, sursa, propunere, propuneri: mai, actiuni, probleme, verificat, nota, alege, surse, voteaza, dinRaport, ordine };
}
export function textSursaRaport(s: any): string { return 'Deschide „' + (s.label || s.type) + '”' + (s.vehicle ? ' · ' + s.vehicle : ''); }
// Refuzul „fără loc pe cont" vine ca 200 pe telefon (cheie / token) și ca 403 pe cookie: textul serverului, din amândouă.
export function textFaraLoc(r: any): string | null {
  if (!r || !(r.seatMissing === true || r.error === 'ai_seat_missing')) return null;
  return String(r.message || r.reply || 'RA Insight nu e pornit pe contul tău.');
}

// ── Cartonașul: câmpurile lui „Schimbă" (web: cartonasPropunere) și ceasul lui „Anulează" ──
export function campuriStart(p: any): Record<string, string> {
  const k = (p && p.campuri) || {};
  const s = (v: any) => (v == null ? '' : String(v));
  if (p.fel === 'alerta') return { prag: s(k.prag), imei: s(k.imei), nume: s(k.nume) };
  if (p.fel === 'revizie') return { tip: s(k.tip), km: s(k.km), data: s(k.data) };
  if (p.fel === 'act') return { tip: s(k.tip), data: s(k.data) };
  if (p.fel === 'raport') return { imei: s(k.imei), perioada: s(k.perioada), frecventa: s(k.frecventa), ora: s(k.ora), dest: s(k.dest), format: s(k.format) };
  return (p.randuri || []).some((r: any) => r.l === 'Despre') ? { nota: s(k.nota) } : {};
}
export function textCeas(ramas: number): string {
  const secunde = Math.ceil(Math.max(0, ramas) / 1000);
  return 'Anulează · mai ai ' + Math.floor(secunde / 60) + ':' + String(secunde % 60).padStart(2, '0');
}
export function nivelDovada(n: any): string { return /^(ok|w|r|i)$/.test(String(n)) ? String(n) : 'i'; }
export function nivelAzi(n: any): string { return /^[rwbg]$/.test(String(n)) ? String(n) : 'g'; }
export function faraDiacritice(s: any): string { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
