import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { api } from '../api/client';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { raCauta } from '../lib/format';
import { nrDe } from '../lib/numar';
import { anuntDinAdresa, adresaFaraAnunt } from '../lib/push';   // anunțul „aparate noi transmit", din adresă
import { stareAparat, momentMs, type StareAparat } from '../lib/semnal';
import { AntetFondator, Banda, GrupFirma, adresaFirmei } from '../components/FondatorUi';
import './admin.css';
import './detail.css'; // .sheet*, .btn*
import './fondator.css';
import './aparate.css'; // bara „Trece pe firmă" din Neasignate + ziua abonamentului (lotul 4, 29.09)

// Super-admin: „Dispozitive" — ca pe web (raxRenderDevices): aparatele STAU PE FIRME. Întâi „Neasignate" (mereu
// deschis), apoi fiecare firmă, alfabetic, la final „Arhivate" (închis). Pastile cu număr, banda de adopție, modul
// strict cu aparatele neînregistrate care bat la ușă, iar din fișa aparatului: firma, interfața CAN, montajul,
// „Arhivează" / „Respinge". Din 29.09 (lotul 4): în „Neasignate", bife + bara „Trece pe firmă" (mai multe deodată), iar
// pe rândul unui aparat de pe firmă, ziua din care plătește clientul, cu corectura noastră. Din 30.09 (lotul 5):
// anunțul „aparate noi transmit" deschide ecranul pe Neasignate cu aparatele lui bifate și firma propusă aleasă în bară
// (adresa: lib/push.ts → adresaAnunt). Toate apelurile sunt requireSuperadmin pe server (ruta e păzită și în App.tsx).
const CAN_OPTS = [
  { value: '', label: 'Auto (implicit)' },
  { value: 'fms', label: 'FMS (camioane / tahograf)' },
  { value: 'lvcan', label: 'LV-CAN200 (Dacia / autoturisme)' },
  { value: 'tacho', label: 'Tahograf' },
];
const TYPE_OPTS = [
  { value: '', label: '— auto —' },
  { value: 'car', label: 'Autoturism' },
  { value: 'van', label: 'Autoutilitară' },
  { value: 'truck', label: 'Camion' },
  { value: 'bus', label: 'Autobuz' },
];

// Semnalul: cuvintele și pragurile NU se scriu aici — vin din lib/semnal.ts, aceleași ca „Aparate GPS" și ca
// agpsStare de pe web (30 min → tăcut, 24 h → fără semnal). Doar culoarea: pe tema luminoasă, scrisul mic verde
// sau portocaliu se citește greu, deci folosim nuanțele mai închise din fondator.css.
const semnal = (d: any): StareAparat => stareAparat(d.last_position_time || d.last_seen);
const culoare = (s: StareAparat) => (s.k === 'ok' ? 'var(--fd-ok)' : s.k === 'tacut' ? 'var(--fd-warn)' : 'var(--fd-bad)');
function dataOra(v: any): string { const t = momentMs(v); return isFinite(t) ? new Date(t).toLocaleString('ro-RO') : '—'; }

type Galeata = 'archived' | 'unassigned' | 'active';
const galeata = (d: any): Galeata => (d.status === 'archived' ? 'archived' : d.company_id == null ? 'unassigned' : 'active');
const arhivat = (d: any) => !!d && galeata(d) === 'archived';
// Ce e de rezolvat la un aparat: fără semnal, n-a transmis niciodată, sau problemă la montaj. Arhivatele tac din voia noastră.
const deRezolvat = (d: any) => { if (arhivat(d)) return false; const s = semnal(d); return s.k === 'mut' || s.k === 'niciodata' || !!d.install_issue; };

type Filtru = 'all' | 'unassigned' | 'active' | 'nosignal' | 'archived';
// `?filtru=neasignate` — banda de pe Companii trimite direct aici (ca raxDevDeschideNeasignate pe web).
const DIN_ADRESA: Record<string, Filtru> = { neasignate: 'unassigned', active: 'active', 'fara-semnal': 'nosignal', arhivate: 'archived', toate: 'all' };
// Câte rânduri desenează un grup deschis înainte de „și încă N". Grupurile închise nu desenează nimic.
const PAS = 150;

type Grup = { k: string; nume: string; coId: number | null; dev: any[] };
function grupuri(rows: any[]): Grup[] {
  const g: Record<string, Grup> = {};
  rows.forEach((d) => {
    const b = galeata(d);
    const k = b === 'archived' ? '_arh' : b === 'unassigned' ? '_neas' : 'co' + d.company_id;
    if (!g[k]) g[k] = { k, coId: k.charAt(0) === 'c' ? d.company_id : null, dev: [], nume: k === '_arh' ? 'Arhivate' : k === '_neas' ? 'Neasignate' : (d.company_name || 'Firma #' + d.company_id) };
    g[k].dev.push(d);
  });
  const firme = Object.keys(g).filter((k) => k !== '_neas' && k !== '_arh').map((k) => g[k]).sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
  return (g._neas ? [g._neas] : []).concat(firme, g._arh ? [g._arh] : []);
}
const nApar = (n: number) => n + (n === 1 ? ' aparat' : ' aparate');

// ── începe „trecerea în bloc și ziua abonamentului" ──
// Bucata e fără JSX și fără stare: proba o decupează, o rulează și o pune lângă pagina web (aceleași cuvinte) și lângă
// serverul pornit (aceleași rute). Nu scrie aici nicio regulă de bani — ziua abonamentului o socotește serverul.
//
// Trecerea mai multor aparate pe firmă (Alin, 28.09) — DOAR din grupul „Neasignate": adopția rămâne într-un singur loc.
// Aceeași rută ca pe web: PUT /api/devices/company-bulk → pe server, `_trecePeFirma` pentru fiecare IMEI (firma,
// ziua abonamentului uitată, stocul, auditul). Pleacă DOAR ce se vede bifat: „Toate" bifează rândurile de pe ecran, nu
// și pe cele ascunse de căutare, iar o bifă rămasă în urma unei căutări nu pleacă (pe web, raxDevBifaToate le bifa pe
// toate și le trimitea — greșeala din revizia din 29.09, necopiată aici).
type RezBloc = { ok?: boolean; trecute?: number; sarite?: string[] };
function neasignatViu(d: any): boolean { return !!d && d.status !== 'archived' && d.company_id == null; }
function bifeazaVazute(bife: Record<string, boolean>, vazute: any[], on: boolean): Record<string, boolean> {
  const m: Record<string, boolean> = { ...bife };
  vazute.filter(neasignatViu).forEach((d) => { const k = String(d.imei); if (on) m[k] = true; else delete m[k]; });
  return m;
}
function bifateVazute(bife: Record<string, boolean>, vazute: any[]): string[] {
  return vazute.filter((d) => neasignatViu(d) && bife[String(d.imei)]).map((d) => String(d.imei));
}
// Bifate, încă neasignate, dar ascunse acum (căutarea, pastila de sus, „și încă N"): se spun, nu se trimit.
function bifateAscunse(bife: Record<string, boolean>, toate: any[], vazute: any[]): number {
  const v = new Set(vazute.map((d) => String(d.imei)));
  return toate.filter((d) => neasignatViu(d) && bife[String(d.imei)] && !v.has(String(d.imei))).length;
}
function intrebareBloc(n: number, firma: string): string {
  return 'Treci ' + nrDe(n, 'aparat', 'aparate') + ' pe firma ' + (firma || '') + '?\n\nClientul le vede pe hartă de îndată ce transmit, iar abonamentul fiecăruia pornește la prima transmisie pe firmă.';
}
function treceInBloc(companyId: number, imeis: string[]): Promise<RezBloc> {
  return api<RezBloc>('/api/devices/company-bulk', { method: 'PUT', body: { company_id: companyId, imeis } });
}
// De ce a sărit serverul un aparat: el sare doar aparatele inexistente, arhivate sau simulate (demo). Motivul se citește
// din lista proaspătă — un aparat demo nu apare niciodată în ea, deci cade la „nu mai există".
function motivSarit(imei: string, lista: any[] | null): string {
  if (!Array.isArray(lista)) return 'arhivat sau inexistent';
  const d = lista.filter((x) => String(x && x.imei) === String(imei))[0];
  if (!d) return 'nu mai există în aplicație';
  if (d.status === 'archived') return 'arhivat între timp';
  return 'arhivat sau inexistent';
}
function mesajBloc(r: RezBloc, firma: string, trimise: number): string {
  const n = Number(r && r.trecute) || 0;
  const s = r && Array.isArray(r.sarite) ? r.sarite.length : 0;
  const alte = Math.max(0, (Number(trimise) || 0) - n - s); // serverul lasă deoparte, fără să le numere, IMEI-urile care nu sunt cifre
  return nrDe(n, 'aparat trecut', 'aparate trecute') + ' pe ' + (firma || 'firmă') +
    (s ? ' · ' + nrDe(s, 'aparat sărit', 'aparate sărite') : '') + (alte ? ' · ' + nrDe(alte, 'IMEI nerecunoscut', 'IMEI-uri nerecunoscute') : '');
}

// Ziua de pornire a abonamentului (Alin, 28.09): o pune singură prima transmisie pe firmă; noi o putem corecta.
// Pleacă spre server ca 'AAAA-LL-ZZ' (el o citește în ora lui, ca la web) sau null = pornește la următoarea transmisie.
const doi = (n: number) => String(n).padStart(2, '0');
function ziInput(ms: any): string {
  if (ms == null || ms === '') return '';
  const t = new Date(Number(ms));
  return isNaN(t.getTime()) ? '' : t.getFullYear() + '-' + doi(t.getMonth() + 1) + '-' + doi(t.getDate());
}
function ziRo(ms: any): string { const z = ziInput(ms); return z ? z.split('-').reverse().join('.') : ''; }
function aboText(d: any): string { return d && d.abonament_de_la ? 'abonament din ' + ziRo(d.abonament_de_la) : 'abonamentul pornește la prima transmisie'; }
function intrebareAbo(d: any): string {
  return 'Din ce zi plătește clientul abonamentul pentru ' + ((d && (d.plate || d.name || d.imei)) || '') + '?\n\nDe regulă e ziua montajului — o pune singură prima transmisie pe firmă. Golește câmpul ca să pornească din nou la următoarea transmisie.';
}
// Serverul refuză o zi din viitor („Abonamentul nu poate porni în viitor."); o oprim înainte, pe ziua telefonului.
function inViitor(v: string, azi?: string): boolean { return !!v && v > (azi || ziInput(Date.now())); }
function puneAbonament(imei: string, deLa: string | null): Promise<{ ok?: boolean; abonament_de_la?: number | null }> {
  return api('/api/devices/' + encodeURIComponent(imei) + '/abonament', { method: 'PUT', body: { de_la: deLa || null } });
}
function mesajAbo(v: string | null): string { return v ? 'Abonament din ' + v.split('-').reverse().join('.') : 'Pornește la următoarea transmisie'; }
// ── sfârșit „trecerea în bloc și ziua abonamentului" ──

// ── începe „aparatele noi, bifate din anunț" ──
// Atingerea anunțului „aparate noi transmit" (în Notificări, în detaliu sau pe push) deschide ecranul pe Neasignate,
// cu adresa făcută de adresaAnunt (lib/push.ts). Ca _raxDevPuneAnuntul pe web: se bifează aparatele din anunț și TOATE
// cele încă neasignate propuse aceleiași firme (`anuntat_firma`, de la server — montajul unei zile poate veni în mai
// multe anunțuri); ce a fost între timp trecut pe firmă sau arhivat nu se mai bifează. Firma propusă se alege în bară.
// Trecerea rămâne apăsarea TA („Trece pe firmă", cu întrebarea ei): din bifare nu pleacă nicio cerere spre server.
// Bucata e fără JSX și fără stare (folosește doar neasignatViu, de mai sus): proba o rulează lângă pagina web.
type Anunt = { imeis: string[]; firma: number | null };
function bifeDinAnunt(lista: any[], p: Anunt | null): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  if (!p) return m;
  (lista || []).forEach((d) => {
    if (!neasignatViu(d)) return;
    const k = String(d.imei);
    if (p.imeis.indexOf(k) >= 0 || (p.firma != null && d.anuntat_firma != null && Number(d.anuntat_firma) === p.firma)) m[k] = true;
  });
  return m;
}
// Banda „Firma e propusă de montajul din calendar" (web: rax-dev-propus) → numele firmei, sau null. DOAR cât în bară e
// aleasă firma propusă de anunț și printre aparatele bifate pe ecran e măcar unul din anunț. Pe web banda apare la
// orice firmă din bară, și aleasă de mână, și la aparate bifate de mână — acolo calendarul n-a propus nimic.
function firmaPropusa(p: Anunt | null, firmaBloc: string, alese: string[], dinAnunt: Record<string, boolean>, firme: { value: string; label: string }[]): string | null {
  if (!p || p.firma == null || firmaBloc !== String(p.firma)) return null;
  if (!alese.some((i) => !!dinAnunt[i])) return null;
  const co = firme.filter((c) => c.value === firmaBloc)[0];
  return co ? co.label : null;
}
// ── sfârșit „aparatele noi, bifate din anunț" ──

export function AdminDevices() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [strict, setStrict] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filtru, setFiltru] = useState<Filtru>(() => DIN_ADRESA[String(((loc.query || {}) as any).filtru || '')] || 'all');
  // Deschis / închis ales de mână, pe grup. Ce n-a atins omul urmează regula de mai jos.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [cate, setCate] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<any | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [canIface, setCanIface] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyImei, setBusyImei] = useState('');
  const [adding, setAdding] = useState(false);
  const GOL = { imei: '', name: '', plate: '', company_id: '', vehicle_type: '', can_interface: '', gps_model: '', sim_number: '', issue: false, issue_note: '' };
  const [f, setF] = useState<any>(GOL);
  const [issueNote, setIssueNote] = useState('');
  // Anunțul „aparate noi transmit" (30.09), venit prin adresă: citit O dată, la deschidere. Firma propusă pornește
  // aleasă în bară; bifele se pun după prima încărcare (le trebuie lista, cu `anuntat_firma`).
  const [anunt] = useState(() => anuntDinAdresa(loc.query));
  const anuntDePus = useRef(!!anunt);
  const [dinAnunt, setDinAnunt] = useState<Record<string, boolean>>({});   // ce a bifat anunțul (pentru banda de mai jos)
  // Trecerea în bloc: bifele (pe IMEI) și firma aleasă. Firma NU se golește la o bifă (pe web, da — revizia din 29.09).
  const [bife, setBife] = useState<Record<string, boolean>>({});
  const [firmaBloc, setFirmaBloc] = useState(() => (anunt && anunt.firma != null ? String(anunt.firma) : ''));
  const [intreb, setIntreb] = useState<{ imeis: string[]; coId: number; firma: string } | null>(null);
  const [trece, setTrece] = useState(false);
  const [rezBloc, setRezBloc] = useState<{ text: string; sarite: { imei: string; motiv: string }[] } | null>(null);
  // Corectura zilei de pornire a abonamentului: aparatul și ziua scrisă în fereastră ('' = pornește la următoarea transmisie).
  const [abo, setAbo] = useState<{ d: any; v: string } | null>(null);
  const [savingAbo, setSavingAbo] = useState(false);

  function reload() {
    setErr('');
    Promise.all([Api.adminDevices(), Api.unassignedDevices().catch(() => [] as any[])])
      .then(([all, un]) => {
        const seen = new Set((all || []).map((d: any) => d.imei));
        const lista = (all || []).concat((un || []).filter((d: any) => !seen.has(d.imei)));
        setItems(lista);
        // Anunțul se pune o singură dată, pe prima listă venită (ca _raxDevPuneAnuntul pe web).
        if (anunt && anuntDePus.current) {
          anuntDePus.current = false;
          const b = bifeDinAnunt(lista, anunt);
          setBife(b);
          setDinAnunt(b);
        }
      })
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
    // Fără firma DEMO: acolo trăiesc conturile temporare ale străinilor care au cerut demo. Un aparat real
    // mutat acolo ar ieși din flota reală și ar ajunge sub ochii lor (ca pe web, unde lista o exclude).
    Api.companies().then((cs) => setCompanies((cs || []).filter((c: any) => !c.is_demo)
      .map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) })))).catch(() => {});
    Api.deviceAttempts().then((r) => { setStrict(!!(r && r.strict)); setAttempts(Array.isArray(r && r.attempts) ? r.attempts : []); })
      .catch(() => { setStrict(null); setAttempts([]); });
  }
  useEffect(reload, []);
  // Adresa anunțului se curăță îndată ce ecranul l-a citit (e în `anunt`, iar bifele îl așteaptă acolo): o întoarcere pe
  // ecran nu-l mai pune o dată. Aici, la deschidere, și nu după încărcare: un răspuns venit după ce ai plecat din
  // ecran ar muta altfel adresa altui ecran înapoi pe Dispozitive.
  useEffect(() => { if (anunt) loc.route(adresaFaraAnunt(loc.path, loc.query), true); }, []);

  const toate = items || [];
  const counts = useMemo(() => {
    const c = { all: toate.length, unassigned: 0, active: 0, archived: 0, nosignal: 0 };
    toate.forEach((d) => { const b = galeata(d); c[b]++; if (b !== 'archived' && semnal(d).k === 'mut') c.nosignal++; });
    return c;
  }, [items]);

  // Filtrul + căutarea, apoi ordinea de pe web: ultima poziție, cea mai nouă prima.
  const rows = useMemo(() => toate.filter((d) => {
    if (filtru === 'nosignal') { if (arhivat(d) || semnal(d).k !== 'mut') return false; }
    else if (filtru !== 'all' && galeata(d) !== filtru) return false;
    return raCauta(q, d.name, d.plate, d.imei, d.company_name);
  }).sort((a, b) => (momentMs(b.last_position_time || b.last_seen) || 0) - (momentMs(a.last_position_time || a.last_seen) || 0)), [items, filtru, q]);
  const grup = useMemo(() => grupuri(rows), [rows]);

  // Deschis sau închis: „Neasignate" mereu deschis, „Arhivate" închis; o firmă e deschisă dacă ai căutat ceva,
  // dacă are ceva de rezolvat sau dacă sunt cel mult 5 grupuri. O problemă nu stă ascunsă după un rând închis.
  function deschis(g: Grup, pb: number): boolean {
    if (manual[g.k] != null) return manual[g.k];
    if (g.k === '_neas') return true;
    // „Arhivate" stă închis — dar nu când chiar le cauți (pastila „Arhivate" sau o căutare), altfel ecranul ar arăta un singur rând închis.
    if (g.k === '_arh') return filtru === 'archived' || !!q.trim();
    return !!q.trim() || pb > 0 || grup.length <= 5;
  }

  function open(d: any) { setSel(d); setCompanyId(d.company_id != null ? String(d.company_id) : ''); setCanIface(d.can_interface || ''); setIssueNote(''); }

  // Semnalare / anulare „problemă la montaj" (reversibilă) — direct din foaia aparatului
  async function toggleIssue(flagged: boolean) {
    if (!sel) return;
    setSaving(true);
    try {
      const r: any = await Api.setInstallIssue(sel.imei, flagged, flagged ? (issueNote.trim() || null) : null);
      setSel({ ...sel, install_issue: r?.install_issue || null });
      setIssueNote('');
      showToast(flagged ? 'Problemă la montaj semnalată' : 'Semnalare anulată');
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  async function save() {
    if (!sel) return;
    setSaving(true);
    try {
      const newCo = companyId === '' ? null : Number(companyId);
      const mutat = (sel.company_id ?? null) !== newCo;
      const altCan = (sel.can_interface || '') !== canIface;
      if (!mutat && !altCan) { showToast('Nimic de salvat — n-ai schimbat nimic'); setSel(null); return; }
      // Mesajul spune CE s-a salvat, cu vorbele web-ului (raxDevSetCompany / raxDevSetIface): mai ales când
      // aparatul tocmai a ieșit din flota unui client, fondatorul trebuie să vadă asta, nu un „Salvat".
      const spus: string[] = [];
      if (mutat) { await Api.moveDevice(sel.imei, newCo); spus.push(newCo == null ? 'Dispozitiv dezasignat' : 'Asignat la companie'); }
      if (altCan) {
        try { await Api.setCanInterface(sel.imei, canIface || null); }
        catch (e: any) {
          if (!spus.length) throw e;
          // Firma s-a schimbat deja: spunem și asta, nu doar eroarea — altfel pare că nu s-a salvat nimic.
          showToast(spus[0] + ' · interfața CAN nu s-a salvat: ' + (e?.message || 'eroare'), true); setSel(null); reload(); return;
        }
        spus.push('Interfață CAN: ' + (canIface || 'auto'));
      }
      showToast(spus.join(' · ')); setSel(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); } finally { setSaving(false); }
  }

  // „Arhivează" (aparat activ) / „Respinge" (aparat neasignat) — același drum pe server: întâi se copiază
  // istoricul, apoi se taie conexiunea și IMEI-ul iese din lista celor acceptate. Reversibil din Arhivate.
  async function arhiveaza() {
    if (!sel) return;
    const respinge = sel.company_id == null;
    if (!confirm((respinge ? 'Respingi' : 'Arhivezi') + ' dispozitivul ' + sel.imei + '?\nNu se mai stochează date de la el (reversibil prin Restaurează).')) return;
    setSaving(true);
    try { await Api.archiveDevice(sel.imei); showToast(respinge ? 'Dispozitiv respins' : 'Dispozitiv arhivat'); setSel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  // Mod strict: un aparat neînregistrat bate la ușă. „Aprobă" îl trece în lista celor acceptate (neasignat).
  async function aproba(imei: string) {
    setBusyImei(imei);
    try { await Api.createDevice({ imei }); showToast('IMEI aprobat — se va conecta la următoarea încercare'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusyImei(''); }
  }
  async function ignora(imei: string) {
    setBusyImei(imei);
    try { await Api.dismissDeviceAttempt(imei); showToast('Încercare ignorată'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusyImei(''); }
  }

  // ── Adăugare manuală (super): pre-înregistrează IMEI → allow-list (mod strict). ──
  function openAdd() { setF(GOL); setAdding(true); }
  const setFF = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function submitAdd() {
    const imei = String(f.imei || '').trim();
    if (!/^\d{10,20}$/.test(imei)) { showToast('IMEI invalid — 10–20 de cifre', true); return; }
    setSaving(true);
    try {
      const body: any = { imei };
      if (f.name.trim()) body.name = f.name.trim();
      if (f.plate.trim()) body.plate = f.plate.trim();
      if (f.vehicle_type) body.vehicle_type = f.vehicle_type;
      if (f.company_id) body.company_id = Number(f.company_id);
      // Modelul și cartela sunt datele APARATULUI — singurele pe care le știi sigur când îl ai în mână.
      if (f.gps_model.trim()) body.gps_model = f.gps_model.trim();
      if (f.sim_number.trim()) body.sim_number = f.sim_number.trim();
      if (f.issue) { body.install_issue = true; if (f.issue_note.trim()) body.install_issue_note = f.issue_note.trim(); }
      await Api.createDevice(body);
      if (f.can_interface) await Api.setCanInterface(imei, f.can_interface);
      showToast('Dispozitiv adăugat'); setAdding(false); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la adăugare', true); } finally { setSaving(false); }
  }

  // ── Trecerea în bloc (Neasignate): bifezi aparatele montate, alegi firma, confirmi. ──
  function cereTrecerea(alese: string[]) {
    if (!alese.length) { showToast('Bifează aparatele montate.', true); return; }
    const coId = parseInt(firmaBloc, 10);
    // Firma trebuie să fie încă în listă (ștearsă între timp → lista n-o mai arată, deci n-o trimitem pe nevăzute).
    const co = companies.filter((c) => c.value === firmaBloc)[0];
    if (!Number.isFinite(coId) || !co) { showToast('Alege firma.', true); return; }
    setIntreb({ imeis: alese, coId, firma: co.label });
  }
  async function executaTrecerea() {
    if (!intreb) return;
    const { imeis, coId, firma } = intreb;
    setTrece(true);
    try {
      const r = await treceInBloc(coId, imeis);
      // Ce a sărit serverul, cu motivul: citit din lista proaspătă (doar dacă a sărit ceva).
      const sar = Array.isArray(r && r.sarite) ? (r.sarite as string[]) : [];
      const proaspat = sar.length ? await Api.adminDevices().catch(() => null) : null;
      const text = mesajBloc(r, firma, imeis.length);
      setBife((b) => { const m = { ...b }; imeis.forEach((i) => { delete m[i]; }); return m; });
      setRezBloc({ text, sarite: sar.map((i) => ({ imei: i, motiv: motivSarit(i, proaspat) })) });
      showToast(text + ' ✓');
      setIntreb(null);
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); setIntreb(null); } finally { setTrece(false); }
  }

  // ── Ziua de pornire a abonamentului (super): corectura noastră, de mână. ──
  function deschideAbo(d: any) { setAbo({ d, v: ziInput(d.abonament_de_la) }); }
  async function salveazaAbo() {
    if (!abo) return;
    const v = abo.v || '';
    if (inViitor(v)) { showToast('Abonamentul nu poate porni în viitor.', true); return; }
    if (v === ziInput(abo.d.abonament_de_la)) { showToast('Nimic de salvat — n-ai schimbat ziua'); setAbo(null); return; }
    setSavingAbo(true);
    try { await puneAbonament(abo.d.imei, v || null); showToast(mesajAbo(v || null)); setAbo(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSavingAbo(false); }
  }

  const chip = (k: Filtru, label: string, atentie = false) => (
    <button type="button" class={'fd-chip' + (filtru === k ? ' on' : '') + (atentie && counts[k] ? ' atentie' : '')} onClick={() => setFiltru(k)}>
      {label} <span class="cnt">{counts[k]}</span>
    </button>
  );

  function rand(d: any) {
    const b = galeata(d);
    const sg = semnal(d);
    return (
      <button type="button" class="fd-rand" onClick={() => open(d)}>
        <span class="mid">
          <div class="nm">{d.name || d.plate || d.imei}{d.name && d.plate ? ' · ' + d.plate : ''}</div>
          <div class="sub">IMEI {d.imei} · {d.can_interface ? String(d.can_interface).toUpperCase() : 'CAN auto'}</div>
          {/* Semnalul nu se arată la arhivate: pe alea le-am oprit noi, tăcerea lor e normală. */}
          {b !== 'archived' && <div class="sub" style={'font-weight:700;color:' + culoare(sg)}>● {sg.t}</div>}
          {b !== 'archived' && <div class="sub">ultima poziție {dataOra(d.last_position_time || d.last_seen)}</div>}
        </span>
        <span class="rt">
          {d.install_issue && <span class="fd-pill warn">⚠ montaj</span>}
          {b === 'archived' ? <span class="fd-pill">arhivat</span> : b === 'unassigned' ? <span class="fd-pill warn">neasignat</span> : null}
          <Icon name="chevronR" size={18} color="var(--text-muted)" />
        </span>
      </button>
    );
  }

  // Neasignate: bifa ALĂTURI de rând (rândul e el însuși un buton — deschide fișa).
  function randCuBifa(d: any) {
    const k = String(d.imei);
    return (
      <div class="ap-cu-bifa" key={k}>
        <label class="ap-bifa">
          <input type="checkbox" checked={!!bife[k]} aria-label={'Bifează ' + (d.name || d.plate || k)}
            onChange={(e: any) => { const on = !!e.target.checked; setBife((b) => { const m = { ...b }; if (on) m[k] = true; else delete m[k]; return m; }); }} />
        </label>
        {rand(d)}
      </div>
    );
  }

  // Pe o firmă: din ce zi plătește clientul (prima transmisie pe firmă), cu corectura noastră — ca pe web.
  function randPeFirma(d: any) {
    return (
      <div class="ap-rand" key={String(d.imei)}>
        {rand(d)}
        <div class={'ap-abo' + (d.abonament_de_la ? '' : ' nepornit')}>
          <span>{aboText(d)}</span>
          <button type="button" class="fd-btn" onClick={() => deschideAbo(d)} aria-label="Corectează ziua de pornire a abonamentului">
            <Icon name="edit" size={13} /> Corectează
          </button>
        </div>
      </div>
    );
  }

  // Bara din capul grupului „Neasignate". `vazute` = rândurile desenate acum pe ecran (după căutare, pastilă și „și încă N").
  function baraBloc(vazute: any[]) {
    const vii = vazute.filter(neasignatViu);
    const alese = bifateVazute(bife, vii);
    const toateBifate = vii.length > 0 && alese.length === vii.length;
    const ascunse = bifateAscunse(bife, toate, vii);
    const propusa = firmaPropusa(anunt, firmaBloc, alese, dinAnunt, companies);
    // Firma aleasă se arată doar cât e în listă (ștearsă între timp, încă neîncărcată sau firma demo → „— alege firma —",
    // exact ce hotărăște și „Trece pe firmă"); altfel lista ar rămâne goală pe ecran.
    const firmaVazuta = companies.some((c) => c.value === firmaBloc) ? firmaBloc : '';
    return (
      <div class="ap-bloc">
        <div class="ap-bloc-r">
          <label class="ap-toate">
            <input type="checkbox" checked={toateBifate} onChange={(e: any) => { const on = !!e.target.checked; setBife((b) => bifeazaVazute(b, vii, on)); }} />
            Toate ({vii.length})
          </label>
          <span class="ap-cate">{nrDe(alese.length, 'aparat bifat', 'aparate bifate')}</span>
        </div>
        <div class="ap-bloc-r">
          <select class="ap-sel" value={firmaVazuta} onChange={(e: any) => setFirmaBloc(e.target.value)} aria-label="Firma pe care trec aparatele bifate">
            <option value="">— alege firma —</option>
            {companies.map((c) => <option value={c.value}>{c.label}</option>)}
          </select>
          <button type="button" class="fd-btn primary" disabled={!alese.length || trece} onClick={() => cereTrecerea(alese)}>
            <Icon name="arrowRight" size={14} /> Trece pe firmă
          </button>
        </div>
        {/* Anunțul „aparate noi transmit" a ales firma: o spunem pe față (web: rax-dev-propus), aceleași cuvinte. */}
        {propusa && (
          <div class="ap-propus">
            <Icon name="calendar" size={14} />
            <span>Firma e propusă de montajul din calendar: <b>{propusa}</b>. Verifică aparatele bifate și apasă „Trece pe firmă".</span>
          </div>
        )}
        {ascunse > 0 && (
          <div class="ap-bloc-nota">
            Încă {nrDe(ascunse, 'aparat bifat nu se vede', 'aparate bifate nu se văd')} acum pe ecran, deci nu {ascunse === 1 ? 'trece' : 'trec'} pe firmă. Ca {ascunse === 1 ? 'să-l vezi' : 'să le vezi'}, golește căutarea sau alege „Neasignate" sus.
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="screen">
      <AntetFondator titlu="Dispozitive" onBack={() => (history.length > 1 ? history.back() : loc.route('/meniu'))}
        dreapta={<button class="h-btn" onClick={openAdd} aria-label="Adaugă dispozitiv"><Icon name="plus" /></button>} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {/* Modul strict: starea recepției, spusă o dată, sus. */}
        {strict === true && <Banda ton="ok" icon="shield"><b>Mod strict ACTIV</b> — doar IMEI-urile pre-înregistrate sunt acceptate; trackerele necunoscute sunt respinse la conectare (nu se stochează nimic).</Banda>}
        {strict === false && <Banda ton="info" icon="shield">Mod strict OPRIT — orice tracker se poate conecta (auto-descoperire).</Banda>}
        {attempts.length > 0 && (
          <div class="fd-gr" style="border-color:color-mix(in srgb, var(--orange) 55%, transparent)">
            <div style="padding:11px 12px 4px;font-size:12.5px;line-height:1.45;font-weight:700;color:var(--fd-warn)">
              <Icon name="alert" size={14} style="vertical-align:-2px;margin-right:5px" />
              {attempts.length} dispozitiv(e) neînregistrat(e) încearcă să se conecteze — aprobă-le dacă sunt ale tale:
            </div>
            {attempts.map((a) => (
              <div class="fd-rand" style="flex-wrap:wrap">
                <span class="mid">
                  <div class="nm">{a.imei}</div>
                  <div class="sub">{(a.count || 1)} încercări · ultima {dataOra(a.last)}</div>
                </span>
                <span style="display:flex;gap:6px;flex:0 0 auto">
                  <button type="button" class="fd-btn acc" disabled={busyImei === a.imei} onClick={() => aproba(a.imei)}><Icon name="check" size={14} /> Aprobă</button>
                  <button type="button" class="fd-btn muted" disabled={busyImei === a.imei} onClick={() => ignora(a.imei)}><Icon name="x" size={14} /> Ignoră</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Ce a ieșit după „Trece pe firmă": stă aici până îl închizi (grupul „Neasignate" poate să fi dispărut). */}
        {rezBloc && (
          <div class={'fd-band ap-rez ' + (rezBloc.sarite.length ? 'warn' : 'ok')} role="status">
            <Icon name={rezBloc.sarite.length ? 'alert' : 'check'} size={16} />
            <span>
              <b>{rezBloc.text}</b>
              {rezBloc.sarite.slice(0, 10).map((s) => <span class="ap-rez-s">IMEI {s.imei} — {s.motiv}</span>)}
              {rezBloc.sarite.length > 10 && <span class="ap-rez-s">și încă {rezBloc.sarite.length - 10}</span>}
            </span>
            <button type="button" class="ap-inchide" onClick={() => setRezBloc(null)} aria-label="Închide"><Icon name="x" size={14} /></button>
          </div>
        )}
        {/* Adopția stă doar aici: bifele din „Neasignate" (mai multe deodată) sau fișa aparatului (unul). O spunem. */}
        {counts.unassigned > 0 && (
          <Banda ton="warn" icon="bell" onClick={() => setFiltru('unassigned')}>
            {nrDe(counts.unassigned, 'aparat neasignat s-a conectat', 'aparate neasignate s-au conectat')}. {counts.unassigned === 1 ? 'Ca să-l adopți: bifează-l' : 'Ca să le adopți: bifează-le'} mai jos, în grupul Neasignate, alege firma și apasă „Trece pe firmă". Un singur aparat îl poți adopta și din fișa lui, unde „Respinge" îl arhivează.
          </Banda>
        )}

        <div class="fd-chips">
          {chip('all', 'Toate')}
          {chip('unassigned', 'Neasignate')}
          {chip('active', 'Active')}
          {chip('nosignal', 'Fără semnal', true)}
          {chip('archived', 'Arhivate')}
        </div>
        <input class="fd-search" value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută nume / număr / IMEI / companie…" />

        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && !err && rows.length === 0 && <div class="adm-empty"><Icon name="cpu" size={40} class="ic" /><div>Niciun dispozitiv în filtrul curent.</div></div>}
        {items != null && rows.length > 0 && grup.map((g) => {
          const pb = g.dev.filter(deRezolvat).length;
          const e = deschis(g, pb);
          const lim = cate[g.k] || PAS;
          const vazute = g.dev.slice(0, lim);
          return (
            <GrupFirma key={g.k} nume={g.nume} deschis={e}
              onToggle={() => setManual((m) => ({ ...m, [g.k]: !e }))}
              onFirma={g.coId != null ? () => loc.route(adresaFirmei(g.coId as number)) : undefined}
              sumar={<>{nApar(g.dev.length)}{pb ? <> · <b>{pb} de rezolvat</b></> : null}</>}>
              {/* Trecerea în bloc stă DOAR în „Neasignate" (adopția într-un singur loc, ca pe web). */}
              {g.k === '_neas' && baraBloc(vazute)}
              {vazute.map((d) => (g.k === '_neas' ? randCuBifa(d) : galeata(d) === 'active' ? randPeFirma(d) : rand(d)))}
              {g.dev.length > lim && (
                <button type="button" class="fd-inca" style="width:100%;text-align:left;background:transparent;border:none;font-family:inherit"
                  onClick={() => setCate((c) => ({ ...c, [g.k]: lim + PAS }))}>
                  și încă {g.dev.length - lim} — caută, sau atinge aici ca să le arăt
                </button>
              )}
            </GrupFirma>
          );
        })}
      </div>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="cpu" size={18} color="var(--accent)" /> {sel.name || sel.plate || sel.imei}</b><button class="h-btn" onClick={() => setSel(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12.5px;color:var(--text-muted)">IMEI {sel.imei}{sel.plate ? ' · ' + sel.plate : ''}</div>
                {!arhivat(sel) && (() => {
                  const sg = semnal(sel);
                  return <div style="font-size:13px"><b style={'color:' + culoare(sg)}>● {sg.t}</b><span style="color:var(--text-muted)"> · ultima poziție {dataOra(sel.last_position_time || sel.last_seen)}</span></div>;
                })()}
                {arhivat(sel) ? (
                  <div class="fld"><label>Companie</label>
                    <div style="font-size:13px;line-height:1.5;color:var(--text-muted)">{sel.company_name || 'Fără firmă'} · Aparat arhivat — îl restaurezi din Dispozitive arhivate.</div>
                    <button class="fd-btn" style="align-self:flex-start" onClick={() => loc.route('/admin/archived')}><Icon name="archive" size={14} /> Deschide Dispozitive arhivate</button>
                  </div>
                ) : (
                  <div class="fld"><label>Companie</label>
                    <select value={companyId} onChange={(e: any) => setCompanyId(e.target.value)}>
                      <option value="">— Neasignat —</option>
                      {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                    </select>
                    {sel.company_id == null && <span style="font-size:11.5px;color:var(--text-muted)">Alege firma și apasă „Salvează" ca să-l adopți. Abonamentul pornește la prima transmisie pe firmă.</span>}
                    {sel.company_id != null && companyId !== '' && companyId !== String(sel.company_id) && <span style="font-size:11.5px;color:var(--text-muted)">Pe firma nouă, abonamentul pornește din nou la prima transmisie.</span>}
                  </div>
                )}
                <div class="fld"><label>Interfață CAN</label>
                  <select value={canIface} onChange={(e: any) => setCanIface(e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Problemă la montaj</label>
                  {sel.install_issue ? (
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span class="fd-pill warn" style="flex:1;min-width:140px;white-space:normal">⚠ {sel.install_issue.note || 'semnalată'}{sel.install_issue.at ? ' · ' + new Date(Number(sel.install_issue.at)).toLocaleDateString('ro-RO') : ''}</span>
                      <button class="fd-btn" disabled={saving} onClick={() => toggleIssue(false)}>Anulează semnalarea</button>
                    </div>
                  ) : (
                    <div style="display:flex;align-items:center;gap:8px">
                      <input style="flex:1" value={issueNote} placeholder="detalii (opțional)" onInput={(e: any) => setIssueNote(e.target.value)} />
                      <button class="fd-btn warn" disabled={saving} onClick={() => toggleIssue(true)}>⚠ Semnalează</button>
                    </div>
                  )}
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button></div>
                {!arhivat(sel) && (
                  <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:6px">
                    <button class="fd-btn danger" style="min-height:44px" disabled={saving} onClick={arhiveaza}>
                      <Icon name="ban" size={15} /> {sel.company_id == null ? 'Respinge' : 'Arhivează'}
                    </button>
                    <span style="font-size:11.5px;color:var(--text-muted);line-height:1.45">
                      {sel.company_id == null
                        ? 'Un aparat străin sau greșit: nu mai primește date. Se poate restaura din Dispozitive arhivate.'
                        : 'La încheierea contractului: nu mai primește date, iar istoricul lui se mai păstrează cât scrie în contract — cât clientul poate cere datele înapoi — apoi se șterge definitiv. Aparatul se poate restaura din Dispozitive arhivate.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {intreb && (
        <Confirma title="Trece pe firmă" text={intrebareBloc(intreb.imeis.length, intreb.firma)} okLabel="Trece pe firmă" busy={trece}
          onOk={executaTrecerea} onCancel={() => { if (!trece) setIntreb(null); }} />
      )}

      {abo && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !savingAbo) setAbo(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="calendar" size={18} color="var(--accent)" /> Ziua abonamentului</b><button class="h-btn" onClick={() => { if (!savingAbo) setAbo(null); }} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="ap-text">{intrebareAbo(abo.d)}</div>
                <div class="fld"><label>Abonament din</label>
                  <input type="date" value={abo.v} max={ziInput(Date.now())} onInput={(e: any) => setAbo({ ...abo, v: e.target.value })} onChange={(e: any) => setAbo({ ...abo, v: e.target.value })} />
                </div>
                {abo.v && (
                  <button type="button" class="fd-btn" style="align-self:flex-start" disabled={savingAbo} onClick={() => setAbo({ ...abo, v: '' })}>
                    <Icon name="x" size={13} /> Golește — pornește la următoarea transmisie
                  </button>
                )}
                {!abo.v && <div style="font-size:12.5px;color:var(--text-secondary)">Câmp gol: abonamentul pornește la următoarea transmisie pe firmă.</div>}
                {inViitor(abo.v) && <div class="ap-eroare">Abonamentul nu poate porni în viitor.</div>}
                <div class="frm-actions"><button class="btn btn-primary" disabled={savingAbo || inViitor(abo.v)} onClick={salveazaAbo}>{savingAbo ? 'Se salvează…' : 'Salvează'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setAdding(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Adaugă dispozitiv</b><button class="h-btn" onClick={() => setAdding(false)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Înregistrează un tracker nou după IMEI. Intră în allow-list (mod strict) și e acceptat la următoarea conectare.</div>
                <div class="fld"><label>IMEI *</label><input value={f.imei} inputMode="numeric" maxLength={20} placeholder="ex. 862129084852924" onInput={(e: any) => setFF('imei', e.target.value)} /></div>
                <div class="fld"><label>Vehicul (nume)</label><input value={f.name} placeholder="ex. Dacia Logan 3" onInput={(e: any) => setFF('name', e.target.value)} /></div>
                <div class="fld"><label>Nr. înmatriculare</label><input value={f.plate} placeholder="ex. B 154 UIP" onInput={(e: any) => setFF('plate', e.target.value)} /></div>
                <div class="fld"><label>Companie</label>
                  <select value={f.company_id} onChange={(e: any) => setFF('company_id', e.target.value)}>
                    <option value="">— Neasignat —</option>
                    {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Tip vehicul</label>
                  <select value={f.vehicle_type} onChange={(e: any) => setFF('vehicle_type', e.target.value)}>
                    {TYPE_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Interfață CAN</label>
                  <select value={f.can_interface} onChange={(e: any) => setFF('can_interface', e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Model aparat GPS</label><input value={f.gps_model} placeholder="ex. Teltonika FMC130" onInput={(e: any) => setFF('gps_model', e.target.value)} /></div>
                <div class="fld"><label>Cartelă SIM</label><input value={f.sim_number} inputMode="tel" placeholder="ex. 0740111222" onInput={(e: any) => setFF('sim_number', e.target.value)} /></div>
                <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin:4px 0;cursor:pointer">
                  <input type="checkbox" checked={f.issue} onChange={(e: any) => setFF('issue', e.target.checked)} />
                  <b style="color:var(--fd-warn)">⚠ Problemă la montaj</b> <span style="font-size:11.5px;color:var(--text-muted)">(se poate anula ulterior)</span>
                </label>
                {f.issue && <div class="fld"><input value={f.issue_note} placeholder="detalii (opțional) — ex. cablaj de refăcut" onInput={(e: any) => setFF('issue_note', e.target.value)} /></div>}
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={submitAdd}>{saving ? 'Se adaugă…' : 'Adaugă dispozitiv'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
