// Planurile de încărcare (pasul 4, 12.10): șoferul vede ce i s-a trimis, dispecerul vede planurile firmei (cu starea:
// netrimis / trimis / încărcat / problemă). Aceeași listă ca „Planuri" de pe web; starea o scrie serverul (incarcare.js).
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from '../components/Icon';
import { modulIncarcare, rutaPlanSofer, rutaPlanSimulator } from '../lib/incarcare';
import './detail.css';
import './simulator.css';

const TON = (t?: string) => 'ton-' + (t || 'gri');

export function PlanuriIncarcare() {
  const loc = useLocation();
  const dispecer = !!(me.value?.isSuper || me.value?.permissions?.manageFleet || me.value?.role === 'dispatcher');   // ca serverul (_incDispecer)
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!modulIncarcare(me.value)) { setErr('Simulatorul de încărcare nu e pornit pentru firma ta.'); setList([]); return; }
    Api.planuriIncarcare().then((r) => setList(Array.isArray(r) ? r : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Simulatorul de încărcare nu e pornit pentru firma ta.' : (e?.message || 'Eroare la încărcare')); setList([]); });
  }, []);

  // Ce e trimis MIE se deschide ca la șofer; restul (planurile firmei) în simulator, la dispecer.
  const deschide = (p: any) => loc.route(p.alMeu || !dispecer ? rutaPlanSofer(p.id) : rutaPlanSimulator(p.id));
  const mele = (list || []).filter((p) => p.alMeu), alte = (list || []).filter((p) => !p.alMeu);
  const rand = (p: any) => (
    <button class="ts-it" style="text-align:left;font:inherit;color:inherit;width:100%" onClick={() => deschide(p)}>
      <div class="ts-row" style="flex-wrap:nowrap"><span class={'ts-dot ' + TON(p.stare && p.stare.fel)} /><span class="ts-itn">{p.vehicul}{p.nume ? ' · ' + p.nume : ''}</span><Icon name="chevronR" size={18} /></div>
      <span class="ts-mut">{p.stare && p.stare.text}{p.creat_de_nume && !p.alMeu ? ' · făcut de ' + p.creat_de_nume : ''}</span>
    </button>
  );
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Planurile de încărcare</div>
        {dispecer && modulIncarcare(me.value) ? <button class="h-btn" onClick={() => loc.route('/incarcare')} aria-label="Simulator încărcare" title="Simulator încărcare"><Icon name="plus" /></button> : <div style="width:36px" />}
      </header>
      <div class="content has-tabbar">
        <div class="ts-pad" style="padding-bottom:24px">
          {err ? <div class="ts-msg ton-rosu">{err}</div> : list == null ? <div class="spin" style="margin:20px auto" /> : !list.length ? (
            <div class="ts-card ts-mut">{dispecer ? 'Niciun plan încă. Din Simulator încărcare așezi marfa și apeși „Trimite șoferului”.' : 'Nu ți s-a trimis încă niciun plan. Când dispecerul îți trimite unul, primești un anunț și îl găsești aici.'}</div>
          ) : <>
            {mele.length > 0 && <><span class="ts-lbl">Trimise ție</span>{mele.map(rand)}</>}
            {alte.length > 0 && <><span class="ts-lbl">{mele.length ? 'Planurile firmei' : 'Planurile'}</span>{alte.map(rand)}</>}
          </>}
        </div>
      </div>
    </div>
  );
}
