import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { vehicles, offlineMinutes } from '../app/store';
import { Api } from '../api/endpoints';
import type { Group, DocItem, Position } from '../api/endpoints';
import { statusOf, countByStatus } from '../lib/status';
import { fmtAgo } from '../lib/format';
import { Donut } from '../components/Donut';
import { Icon } from '../components/Icon';
import './stats.css';

type Tab = 'sumar' | 'documente' | 'offline' | 'grupuri';

export function Stats() {
  const loc = useLocation();
  const [tab, setTab] = useState<Tab>('sumar');
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);

  const off = offlineMinutes.value;
  const list = vehicles.value;
  const c = countByStatus(list, off);

  useEffect(() => {
    if (tab === 'documente' && docs === null) Api.documents().then((r) => setDocs(r || [])).catch(() => setDocs([]));
    if (tab === 'grupuri' && groups === null) Api.groups().then((r) => setGroups(r || [])).catch(() => setGroups([]));
  }, [tab]);

  const TABS: { k: Tab; label: string }[] = [
    { k: 'sumar', label: 'Sumar activitate' },
    { k: 'documente', label: 'Expirare documente' },
    { k: 'offline', label: 'Fără transmisie' },
    { k: 'grupuri', label: 'Grupuri vehicule' },
  ];

  return (
    <div class="screen">
      <header class="app-header"><div class="h-title">Statistici</div></header>
      <div class="st-tabs">
        {TABS.map((t) => <button class={'st-tab' + (tab === t.k ? ' on' : '')} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>
      <div class="content has-tabbar">
        {tab === 'sumar' && (
          <div style="padding-top:18px">
            <Donut
              data={[c.moving, c.idle, c.stopped, c.offline]}
              colors={['#3FE07D', '#eab308', '#ef4444', '#8A93A3']}
              center={<div class="st-donut-center" style="text-align:center"><div class="num">{c.total}</div><div class="lbl">autovehicule</div></div>}
            />
            <div class="st-counts">
              <CountRow color="#3FE07D" n={c.moving} label="În mișcare" onClick={() => loc.route('/vehicles?status=moving')} />
              <CountRow color="#eab308" n={c.idle} label="Staționate" onClick={() => loc.route('/vehicles?status=idle')} />
              <CountRow color="#ef4444" n={c.stopped} label="Oprite" onClick={() => loc.route('/vehicles?status=stopped')} />
              <CountRow color="#8A93A3" n={c.offline} label="Fără transmisie" onClick={() => loc.route('/vehicles?status=offline')} />
              <CountRow color="var(--accent)" n={c.total} label="Toate vehiculele" onClick={() => loc.route('/vehicles?status=all')} />
            </div>
          </div>
        )}

        {tab === 'documente' && (docs === null ? <Loading /> : docs.length === 0 ? <Empty text="Niciun document înregistrat." /> :
          docs.slice().sort((a, b) => dayDiff(a.expiry_date) - dayDiff(b.expiry_date)).map((d) => {
            const dd = dayDiff(d.expiry_date);
            const cls = dd < 0 ? 'exp-over' : dd <= 7 ? 'exp-soon' : '';
            return (
              <div class="st-listitem">
                <Icon name="calendar" size={20} class="ic" />
                <div class="main"><div class="t">{docLabel(d.doc_type)}{d.imei ? ` · ${plateFor(list, d.imei)}` : ''}</div>
                  <div class="s">{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('ro-RO') : '—'}</div></div>
                <div class={'r ' + cls}>{d.expiry_date ? (dd < 0 ? 'Expirat' : dd === 0 ? 'Azi' : `${dd} zile`) : ''}</div>
              </div>
            );
          }))}

        {tab === 'offline' && (() => {
          const offl = list.filter((v) => statusOf(v, off).status === 'offline');
          return offl.length === 0 ? <Empty text="Toate vehiculele transmit." /> :
            offl.map((v) => (
              <button class="st-listitem" style="width:100%;text-align:left" onClick={() => loc.route('/vehicles/' + encodeURIComponent(v.imei))}>
                <Icon name="wifiOff" size={20} class="ic" />
                <div class="main"><div class="t">{v.name || v.imei}{v.plate ? ` · ${v.plate}` : ''}</div>
                  <div class="s">Ultima transmisie {fmtAgo(v.timestamp)}</div></div>
                <Icon name="chevronR" size={18} color="var(--text-muted)" />
              </button>
            ));
        })()}

        {tab === 'grupuri' && (groups === null ? <Loading /> : groups.length === 0 ? <Empty text="Niciun grup definit." /> :
          groups.map((g) => (
            <div class="st-listitem">
              <Icon name="layers" size={20} class="ic" color={g.color || 'var(--text-muted)'} />
              <div class="main"><div class="t">{g.name}</div></div>
              {g.count != null && <div class="r">{g.count} vehicule</div>}
            </div>
          )))}
      </div>
    </div>
  );
}

function CountRow({ color, n, label, onClick }: { color: string; n: number; label: string; onClick?: () => void }) {
  return (
    <button class="st-count" type="button" onClick={onClick}>
      <span class="bar" style={{ background: color }} />
      <span class="n">{n}</span>
      <span class="lbl">{label}</span>
      <Icon name="chevronR" size={17} color="var(--text-muted)" />
    </button>
  );
}
function Loading() { return <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>; }
function Empty({ text }: { text: string }) { return <div class="center-msg">{text}</div>; }
function dayDiff(d?: string): number { if (!d) return 99999; return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); }
function docLabel(t?: string): string {
  const m: Record<string, string> = { itp: 'ITP', rca: 'RCA', rovinieta: 'Rovinietă', casco: 'CASCO', revizie: 'Revizie' };
  return (t && m[t.toLowerCase()]) || t || 'Document';
}
function plateFor(list: Position[], imei: string): string { const v = list.find((x) => x.imei === imei); return v ? (v.plate || v.name || '') : ''; }
