// „Istoric activitate" — jurnalul firmei, scris pe românește. În bază, un rând arată așa: action=update,
// entity=device, entity_id=350317170000101. Pe ecran trebuie să scrie „Ion a modificat mașina CJ 12 ABC".
// Aceleași cuvinte ca pe web (IST_VERB, IST_OBIECT din public/index.html); iconițele sunt cele ale telefonului.
// Acțiunile pe care nu le-am botezat încă NU se ascund: apar cu un verb neutru și numele lor tehnic în
// paranteză — un jurnal care tace la ce nu cunoaște e mai rău decât unul urât.
import type { IconName } from '../components/Icon';

type Verb = [string, IconName, string];
// Verdele aplicației e --fm-ok (mai închis pe tema luminoasă; vezi screens/firma.css).
export const IST_VERB: Record<string, Verb> = {
  login:             ['s-a conectat', 'arrowRight', 'var(--text-muted)'],
  // Conectarea din aplicația de telefon. Serverul o scrie deocamdată FĂRĂ firmă, deci încă nu apare în
  // istoricul firmei (cerere pentru server); cuvântul e pregătit, ca rândul să nu iasă „necunoscut".
  mobile_login:      ['s-a conectat de pe telefon', 'phone', 'var(--text-muted)'],
  logout:            ['a ieșit din cont', 'logout', 'var(--text-muted)'],
  create:            ['a adăugat', 'plus', 'var(--fm-ok)'],
  import:            ['a importat', 'upload', 'var(--fm-ok)'],
  upload:            ['a încărcat', 'upload', 'var(--fm-ok)'],
  adopt:             ['a preluat', 'hand', 'var(--fm-ok)'],
  approve:           ['a aprobat', 'check', 'var(--fm-ok)'],
  update:            ['a modificat', 'edit', 'var(--text-secondary)'],
  assign:            ['a atribuit', 'arrowRight', 'var(--text-secondary)'],
  assign_company:    ['a mutat la altă firmă', 'arrowRight', 'var(--text-secondary)'],
  set_access:        ['a schimbat accesul la', 'key', 'var(--text-secondary)'],
  set_can_interface: ['a schimbat setarea CAN la', 'cpu', 'var(--text-secondary)'],
  scan:              ['a scanat', 'maximize', 'var(--text-secondary)'],
  reset_password:    ['a resetat parola pentru', 'key', 'var(--orange)'],
  revoke:            ['a anulat', 'ban', 'var(--orange)'],
  reject:            ['a respins', 'x', 'var(--orange)'],
  delete:            ['a șters', 'trash', 'var(--red)'],
  erase:             ['a șters definitiv', 'trash', 'var(--red)'],
  clear:             ['a golit', 'trash', 'var(--red)'],
  export:            ['a descărcat', 'download', 'var(--purple)'],
  download:          ['a descărcat', 'download', 'var(--purple)'],
  run:               ['a pornit', 'play', 'var(--text-secondary)'],
  test:              ['a testat', 'zap', 'var(--text-secondary)'],
};

export const IST_OBIECT: Record<string, string> = {
  device: 'mașina', devices: 'lista de mașini', device_details: 'fișa mașinii', device_inventory: 'inventarul de aparate', device_history: 'istoricul complet al mașinii',
  driver: 'șoferul', drivers: 'lista de șoferi', user: 'utilizatorul', group: 'grupa', geofence: 'hotspotul',
  alert: 'alerta', maintenance: 'o lucrare de mentenanță', maint_intervals: 'intervalele de mentenanță',
  document: 'un document', doc_needs: 'actele obligatorii', report: 'un raport', report_schedule: 'un raport programat',
  apikey: 'o cheie API', webhook: 'o integrare', tacho: 'un fișier de tahograf', etransport: 'un transport ANAF',
  company_settings: 'setările firmei', company_features: 'modulele firmei', company: 'compania',
  session: '', assistant: 'asistentul AI', agent: 'un agent AI', gdpr: 'date personale (GDPR)',
  push_token: 'notificările pe telefon', io_catalog: 'catalogul de coduri', tollro_grid: 'grila de tarife',
  invoice: 'o factură', offer: 'o ofertă', support: 'un mesaj către suport', backup: 'o copie de siguranță',
  parola: 'parola', profil: 'datele lui de contact',
};

export type Fapta = { verb: string; ic: IconName; col: string; obiect: string; tinta: string | null };

// Un rând de jurnal → o propoziție. Ținta se caută în ordinea în care e de folos omului: numărul de
// înmatriculare, apoi numele din detalii, abia la urmă identificatorul brut.
export function istFapta(r: any): Fapta {
  const v: Verb = IST_VERB[r.action] || ['a făcut o modificare (' + r.action + ')', 'circleDot', 'var(--text-secondary)'];
  let ob = IST_OBIECT[r.entity];
  if (ob === undefined) ob = r.entity ? String(r.entity).replace(/_/g, ' ') : '';
  let d: any = r.details || {};
  if (typeof d === 'string') { try { d = JSON.parse(d) || {}; } catch { d = {}; } }
  let tinta: string | null = r.device_plate || r.device_name || d.plate || d.name || d.username || d.nume || null;
  if (!tinta && r.entity_id && r.entity !== 'session') tinta = String(r.entity_id);
  // IMEI-ul brut nu spune nimic. Dacă mașina a fost ștearsă și n-avem numărul, îl scurtăm.
  if (tinta && r.entity === 'device' && !r.device_plate && !r.device_name && /^\d{10,}$/.test(tinta)) tinta = '…' + tinta.slice(-6);
  return { verb: v[0], ic: v[1], col: v[2], obiect: ob, tinta: tinta != null ? String(tinta) : null };
}

// Ziua, scrisă cum o spune omul: „Azi", „Ieri", altfel data.
export function istZi(ts: any, acum: number): string {
  const d = new Date(ts), a = new Date(acum);
  const zi = (x: Date) => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
  if (zi(d) === zi(a)) return 'Azi';
  if (zi(d) === zi(new Date(acum - 86400000))) return 'Ieri';
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: d.getFullYear() === a.getFullYear() ? undefined : 'numeric' });
}

// Zilele, cu „de" doar unde îl cere limba: „1 zi", „7 zile", „19 zile", dar „20 de zile", „30 de zile", „101 zile".
export function istZile(n: any): string {
  const z = Math.max(0, Math.round(Number(n) || 0));
  if (z === 1) return '1 zi';
  const r = z % 100;
  return z + (z > 0 && (r === 0 || r >= 20) ? ' de zile' : ' zile');
}

// Minutele, pe înțelesul omului: „12 h 30 min", nu „750".
export function istOre(min: any): string {
  const m0 = Math.max(0, Math.round(Number(min) || 0));
  if (m0 < 60) return m0 + ' min';
  const h = Math.floor(m0 / 60), m = m0 % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}
