// Planul de încărcare primit (pasul 4, 12.10) — ecranul șoferului, după macheta aprobată (artboard-ul „Telefon"): marfa
// văzută de sus, ordinea de încărcare, greutatea pe osii și cele două butoane. Pe web e fereastra „Planul de încărcare"
// (simPlanSofer). Cifrele și textele vin de la server (incarcare.js); desenul e copia celui de pe web (lib/simDesen.ts).
import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { simSvg } from '../lib/simDesen';
import { RUTA_PLANURI, rutaPlanSimulator } from '../lib/incarcare';
import './detail.css';
import './simulator.css';

const TON = (t?: string) => 'ton-' + (t || 'gri');

export function PlanSofer() {
  const loc = useLocation();
  const { params } = useRoute();
  const id = Number(params.id);
  const [j, setJ] = useState<{ plan: any; rezultat: any; eroare: string | null; notaSofer: string; poateEdita: boolean } | null>(null);
  const [culori, setCulori] = useState<string[]>(['#3B82F6']);
  const [err, setErr] = useState('');
  const [problema, setProblema] = useState<string | null>(null);
  const [lucru, setLucru] = useState(false);

  async function incarca() {
    try { setJ(await Api.planIncarcare(id)); setErr(''); }
    catch (e: any) { setErr(e?.status === 403 ? 'Simulatorul de încărcare nu e pornit pentru firma ta.' : (e?.message || 'Planul nu s-a putut deschide.')); }
  }
  useEffect(() => {
    incarca();
    Api.incarcareMeta().then((m: any) => { if (m && Array.isArray(m.culoriOpriri) && m.culoriOpriri.length) setCulori(m.culoriOpriri); }).catch(() => {});
  }, [id]);
  const culoare = (n: number) => culori[(Math.max(1, n) - 1) % culori.length];

  async function incarcat() {
    setLucru(true);
    try { await Api.planIncarcat(id); showToast('Dispecerul a primit anunțul.'); await incarca(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut trimite.', true); }
    finally { setLucru(false); }
  }
  async function trimiteProblema() {
    const text = (problema || '').trim();
    if (!text) { showToast('Scrie pe scurt ce s-a întâmplat.', true); return; }
    setLucru(true);
    try { await Api.planProblema(id, text); setProblema(null); showToast('Dispecerul a primit anunțul.'); await incarca(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut trimite.', true); }
    finally { setLucru(false); }
  }

  const p = j && j.plan, R = j && j.rezultat, st = (p && p.stare) || {};
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route(RUTA_PLANURI)} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Planul de încărcare</div>
        {j && j.poateEdita ? <button class="h-btn" onClick={() => loc.route(rutaPlanSimulator(id))} aria-label="Deschide în simulator" title="Deschide în simulator"><Icon name="edit" /></button> : <div style="width:36px" />}
      </header>
      <div class="content has-tabbar">
        {err ? <div class="ts-pad"><div class="ts-msg ton-rosu">{err}</div></div> : !j ? <div class="ts-pad"><div class="spin" style="margin:20px auto" /></div> : (
          <div class="ts-pad" style={p.alMeu ? '' : 'padding-bottom:24px'}>
            <div class="ts-card">
              <b style="font-size:16px">{p.vehicul}</b>
              {R && <span class="ts-mut">{R.titlu}</span>}
              {R && <span class="ts-mut"><b>{R.rezumatSofer.greutate}</b> · {R.rezumatSofer.liber} din {R.rezumatSofer.lungime}</span>}
              {R ? <svg class="ts-svg" viewBox="0 0 960 330" role="img" aria-label="Văzut de sus" dangerouslySetInnerHTML={{ __html: simSvg(R, 'sus', 32, culoare) }} />
                : <div class="ts-msg ton-rosu">{j.eroare || ''}</div>}
            </div>
            {R && (
              <div class="ts-card">
                <span class="ts-lbl">Ordinea de încărcare</span>
                <ol class="ts-pasi">
                  {R.pasi.map((x: any) => (
                    <li><span class="ts-pnr" style={'background:' + x.culoare}>{x.nr}</span><span><b>{x.text}</b><span class="ts-mut">{x.detaliu}</span></span></li>
                  ))}
                </ol>
              </div>
            )}
            {R && R.rezumatSofer.ramane && <div class="ts-msg ton-rosu">{R.rezumatSofer.ramane}</div>}
            {R && <div class={'ts-msg ' + TON(R.osiiRezumat.fel)}><b>{R.osiiRezumat.titlu}</b><br />{R.osiiRezumat.text}</div>}
            {j.notaSofer && <span class="ts-mut">{j.notaSofer}</span>}
            <div class={'ts-msg ' + TON(st.fel)}>{st.text}</div>
          </div>
        )}
      </div>

      {p && p.alMeu && (
        <div class="ts-jos">
          <button class="ts-btn" disabled={lucru} onClick={() => setProblema('')}><Icon name="alertO" size={17} /> Am o problemă</button>
          <button class="ts-btn pri" disabled={lucru} onClick={incarcat}><Icon name="check" size={17} /> Am încărcat</button>
        </div>
      )}

      {problema != null && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !lucru) setProblema(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>Ce s-a întâmplat?</b>
              <button class="h-btn" onClick={() => setProblema(null)} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body" style="display:flex;flex-direction:column;gap:10px">
              <label class="ts-fld">Ajunge la dispecer, cu numărul mașinii
                <textarea value={problema} maxLength={300} placeholder="De ex.: au venit 4 paleți în plus" onInput={(e) => setProblema((e.target as HTMLTextAreaElement).value)} />
              </label>
              <button class="ts-btn pri" disabled={lucru || !problema.trim()} onClick={trimiteProblema}><Icon name="arrowRight" size={17} /> Trimite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
