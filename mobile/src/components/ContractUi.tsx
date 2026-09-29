// Piesele comune ecranelor „Contracte" (fondatori): pastila, butoanele Vezi / Descarcă pentru hârtiile
// serverului, foaia „Reînnoiește" și alegerea unui fișier semnat (poză sau PDF).
//
// Nimic de aici nu socotește ceva despre un contract: hârtia (contract, act adițional, scan) vine din
// generatorul serverului prin `salveazaDeLaServer` (lib/export.ts, numele din antetul răspunsului), iar
// textul și datele prelungirii le scrie serverul (`POST /api/contracts/:id/reinnoire`).
import { useState } from 'preact/hooks';
import { Capacitor } from '@capacitor/core';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { salveazaDeLaServer } from '../lib/export';
import { zile } from '../lib/contracte';
import { shrink } from './ActeVehicul';
import { Confirma } from './FlotaUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';

export function Pill({ fel, children }: { fel?: string; children: any }) {
  return <span class={'ctr-pill' + (fel ? ' ' + fel : '')}>{children}</span>;
}

// „Vezi" deschide hârtia în vizualizatorul telefonului (fără s-o salveze tu undeva); „Descarcă" o dă
// foii de partajare, de unde se salvează sau se trimite. Aceleași mesaje ca pe web (raxHartie).
//
// „… s-a descărcat ✓" apare DOAR unde chiar s-a descărcat (browserul). Pe telefon, `salveazaDeLaServer` se
// întoarce la fel și când omul a închis foaia de partajare fără să salveze (anularea nu e o eroare), deci
// n-avem de unde ști că fișierul a ajuns undeva — foaia sistemului (Fișiere / Drive) confirmă singură.
// Erorile (rețea, server, disc plin) apar în continuare, pe ambele.
const spuneDescarcat = !Capacitor.isNativePlatform();
export function HartieBtns({ path, ce, nume, veziEticheta, descEticheta, faraText }: {
  path: string; ce: string; nume: string; veziEticheta?: string; descEticheta?: string; faraText?: boolean;
}) {
  const [busy, setBusy] = useState<'' | 'vezi' | 'desc'>('');
  async function run(deschide: boolean) {
    if (busy) return;
    setBusy(deschide ? 'vezi' : 'desc');
    try {
      await salveazaDeLaServer(path, nume, { deschide });
      if (!deschide && spuneDescarcat) showToast(ce + ' s-a descărcat ✓');
    } catch (e: any) {
      showToast((deschide ? 'Nu s-a putut deschide: ' : 'Descărcarea nu a mers: ') + (e?.message || 'eroare'), true);
    } finally { setBusy(''); }
  }
  return (
    <>
      <button class="ctr-btn" disabled={!!busy} onClick={() => run(true)} aria-label={veziEticheta || 'Vezi'}>
        <Icon name="eye" size={16} />{faraText ? null : (busy === 'vezi' ? 'Se deschide…' : (veziEticheta || 'Vezi'))}
      </button>
      <button class="ctr-btn" disabled={!!busy} onClick={() => run(false)} aria-label={descEticheta || 'Descarcă'}>
        <Icon name="download" size={16} />{faraText ? null : (busy === 'desc' ? 'Se descarcă…' : (descEticheta || 'Descarcă'))}
      </button>
    </>
  );
}

// Un fișier urcat de noi (scanul semnat), adus înapoi cu numele lui, din antet.
export function DescarcaFisier({ path, ce, eticheta }: { path: string; ce: string; eticheta: string }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try { await salveazaDeLaServer(path, 'act-semnat'); if (spuneDescarcat) showToast(ce + ' s-a descărcat ✓'); }
    catch (e: any) { showToast('Descărcarea nu a mers: ' + (e?.message || 'eroare'), true); }
    finally { setBusy(false); }
  }
  return (
    <button class="ctr-btn" disabled={busy} onClick={run}>
      <Icon name="download" size={16} />{busy ? 'Se descarcă…' : eticheta}
    </button>
  );
}

// Alegerea scanului semnat: „Fotografiază" (camera, direct) sau „Alege fișier" (PDF / poză). Pozele de
// telefon au 5-12 MB, iar limita serverului e 4: trec prin aceeași micșorare ca actele mașinilor.
export type FisierAles = { name: string; b64: string };
export function AlegeFisier({ busy, onFile, etFoto, etFisier }: {
  busy?: boolean; onFile: (f: FisierAles) => void; etFoto?: string; etFisier?: string;
}) {
  async function citeste(file?: File | null) {
    if (!file) return;
    try {
      const f = await shrink(file);
      // Serverul primește doar .pdf / .jpg / .png, după numele fișierului.
      let name = f.name || 'act';
      if (f.mime === 'application/pdf' && !/\.pdf$/i.test(name)) name += '.pdf';
      onFile({ name, b64: f.b64 });
    } catch (e: any) { showToast(e?.message || 'Nu am putut citi fișierul.', true); }
  }
  const pe = (e: any) => { const i = e.target as HTMLInputElement; const fl = i.files?.[0]; i.value = ''; citeste(fl); };
  return (
    <>
      <label class={'ctr-btn' + (busy ? ' is-busy' : '')} aria-disabled={busy}>
        <input type="file" accept="image/*" capture="environment" style="display:none" disabled={busy} onChange={pe} />
        <Icon name="camera" size={16} /> {etFoto || 'Fotografiază'}
      </label>
      <label class={'ctr-btn' + (busy ? ' is-busy' : '')} aria-disabled={busy}>
        <input type="file" accept="image/*,application/pdf" style="display:none" disabled={busy} onChange={pe} />
        <Icon name="upload" size={16} /> {busy ? 'Se urcă…' : (etFisier || 'Alege fișier')}
      </label>
    </>
  );
}

// „Reînnoiește": foaia cu câte luni, apoi actul adițional de prelungire, scris de server (ca ciornă).
// Serverul răspunde 409 dacă există deja o prelungire în lucru — mesajul lui apare ca atare.
export function useReinnoire(onGata: (companyId: number) => void) {
  const [cer, setCer] = useState<{ id: number; companyId: number; luni: number; capat: string } | null>(null);
  const [busy, setBusy] = useState(false);
  function cere(c: any, sfarsit: any) {
    setCer({ id: Number(c.id), companyId: Number(c.company_id), luni: Number(c.months || 12), capat: zile(sfarsit) });
  }
  async function fa(v?: string) {
    if (!cer || busy) return;
    setBusy(true);
    try {
      const j: any = await Api.renewContract(cer.id, parseInt(String(v || ''), 10) || cer.luni || 12);
      showToast('Actul de prelungire ' + ((j && j.act && j.act.number) || '') + ' e gata, până pe ' + zile(j && j.pana_la) + ' ✓');
      const cid = cer.companyId;
      setCer(null);
      onGata(cid);
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut face prelungirea', true); }
    finally { setBusy(false); }
  }
  const ui = cer ? (
    <Confirma title="Reînnoiește contractul" busy={busy} okLabel="Fă actul de prelungire"
      text={'Contractul se termină pe ' + cer.capat + '. Cu câte luni îl prelungești?\n\nSe face actul adițional de prelungire, ca ciornă. Îl aprobi, îl descarci, îl trimiți la semnat — iar când e semnat, contractul ține până la noua dată.'}
      field={{ label: 'Prelungire (luni)', type: 'number', value: cer.luni }}
      onOk={fa} onCancel={() => { if (!busy) setCer(null); }} />
  ) : null;
  return { cere, ui };
}

// Bara de sus a ecranelor de contracte.
export function CapEcran({ titlu, onBack, onRefresh }: { titlu: string; onBack: () => void; onRefresh?: () => void }) {
  return (
    <header class="app-header">
      <button class="h-btn" onClick={onBack} aria-label="Înapoi"><Icon name="chevronL" /></button>
      <div class="h-title">{titlu}</div>
      {onRefresh
        ? <button class="h-btn" onClick={onRefresh} aria-label="Reîncarcă"><Icon name="refresh" size={19} /></button>
        : <div style="width:36px" />}
    </header>
  );
}
