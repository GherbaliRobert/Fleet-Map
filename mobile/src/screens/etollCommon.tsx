// Bucăți comune ale ecranului „Taxa de drum" (cele două file + detaliul unei mașini).
// Aceleași texte și aceleași reguli ca pe web (public/js/demo-modules-ui.js): telefonul doar desenează ce
// calculează serverul. Nicio regulă de taxare nu se scrie aici — cine plătește, cât și de ce stă în tollro.js.
import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import { Icon } from '../components/Icon';

export const dRo = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || ''); };
export const nr = (v: any, z = 2) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z });
export const km1 = (v: any) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });

// Data în cuvinte („1 octombrie 2026"): câmpul de calendar o arată în formatul telefonului, iar aici e
// vorba de ziua din care se plătește — nu are voie să fie citită „10 ianuarie".
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export function dataInCuvinte(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? (parseInt(m[3], 10) + ' ' + LUNI[parseInt(m[2], 10) - 1] + ' ' + m[1]) : String(iso || '');
}

// „Detalii costuri": defalcarea pe tipuri de drum a unui rezultat venit de la server (din traseu sau din
// kilometri scriși de mână). Același desen ca pe web (trAfiseaza).
export function RezultatCost({ rez, atribuire }: { rez: any; atribuire?: string | null }) {
  if (!rez) return null;
  if (rez.error) return <div class="tr-nota rosu">{rez.error}</div>;
  const z = rez.rezultat;
  if (!z) return <div class="tr-mic">Fără rezultat.</div>;
  if (!z.aplicabil) return <div class="tr-nota rosu">{z.motiv}</div>;
  const maxCost = Math.max(0.01, ...z.linii.map((l: any) => l.cost));
  const kmTotal = z.linii.reduce((a: number, l: any) => a + l.km, 0);
  return (
    <>
      <div class="tr-h">Detalii costuri <span class="tr-mic" style="display:inline;margin-left:4px">· {z.categorieEticheta} · {z.euroEticheta}</span></div>
      <div class="tr-sumar">
        <div><span>Distanță totală</span><b>{km1(kmTotal)} km</b></div>
        <div class="tot"><span>Total</span><b>{nr(z.total)} {z.moneda}</b></div>
      </div>
      {z.linii.map((l: any) => (
        <div class="tr-linie">
          <div class="cap"><span class="pct" style={'background:' + l.culoare} />{l.eticheta}<b>{l.taxabil ? nr(l.cost) + ' ' + z.moneda : 'netaxat'}</b></div>
          <div class="sub">{km1(l.km)} km{l.taxabil ? ' · ' + nr(l.leiPerKm) + ' lei/km' : ''}</div>
          <div class="bara"><i style={'width:' + Math.round((l.cost / maxCost) * 100) + '%;background:' + l.culoare} /></div>
        </div>
      ))}
      {(z.avertismente || []).map((a: string) => <div class="tr-nota galben">{a}</div>)}
      <div class="tr-mic" style="margin-top:8px">
        Costuri estimative — tarifele se stabilesc de autoritățile române și se pot modifica.
        {rez.sursa ? ' Sursa kilometrilor: ' + rez.sursa + '.' : ''}{atribuire ? ' ' + atribuire + '.' : ''}
      </div>
    </>
  );
}

// „Cât costă un kilometru" — fiecare cifră sub capul ei de coloană, cu unitatea scrisă lângă ea.
// Înainte, pe telefon, stăteau două cifre lipite („0,17 / 0,08") și o notă deasupra care spunea care e
// care: exact întrebarea lui Alin („0,17 e în lei?"). Grila se EDITEAZĂ doar din web (excepție asumată).
export function GrilaTarife({ cfg }: { cfg: any }) {
  const g = cfg && cfg.grila;
  if (!g) return null;
  const cat = cfg.categorii || [], euro = cfg.euro || [];
  return (
    <div class="pf-card">
      <div class="tr-h">Cât costă un kilometru{cfg.editabil ? '' : ' (doar de citit)'}</div>
      <div class="tr-mic" style="margin-top:0">
        Cât costă <b>un kilometru</b>, în lei. Depinde de cât cântărește mașina și de cât de poluantă e: cu cât e mai
        grea și mai veche, cu atât plătești mai mult. Pe autostradă e mai scump decât pe drum național.
      </div>
      <div class="trf-grila-wrap">
        <table class="tr-grid trf-grila">
          <thead>
            <tr>
              <th rowSpan={2} class="trf-g-masa">Masa maximă<br /><span>a vehiculului</span></th>
              {euro.map((e: any) => <th colSpan={2} class="trf-g-euro">{e.eticheta}</th>)}
            </tr>
            <tr>
              {euro.map(() => <><th class="trf-g-sub">Autostradă</th><th class="trf-g-sub">Drum național</th></>)}
            </tr>
          </thead>
          <tbody>
            {cat.map((c: any) => (
              <tr>
                <th class="trf-g-masa">{c.eticheta}</th>
                {euro.map((e: any) => {
                  const t = g.tarife[c.key][e.key];
                  return (['autostrada', 'national'] as const).map((k) => (
                    <td class={t.presupus ? 'presupus' : ''}>
                      <b>{nr(t[k])}</b> <span class="trf-g-um">lei/km</span>{t.presupus && k === 'national' ? ' ⚠' : ''}
                    </td>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="trf-grila-jos">⚠ Celulele îngălbenite sunt tarife care <b>nu au fost publicate încă</b> — le-am estimat noi. Restul sunt cele oficiale.</div>
      <div class="trf-grila-jos">Se plătește începând cu <b>{dataInCuvinte(g.aplicabilDin)}</b>.</div>
      {cfg.editabil && <div class="tr-mic">Tarifele se schimbă prin hotărâre de guvern. Grila se modifică din aplicația web (Administrare).</div>}
    </div>
  );
}

// Nota de sus când flota are sume, dar taxa nu a intrat încă în vigoare.
export function NotaInVigoare({ din }: { din: string }) {
  return (
    <div class="tr-nota galben">
      <Icon name="alert" size={14} style="vertical-align:-2px;margin-right:4px" />
      Taxa se aplică din <b>{dRo(din)}</b>. Până atunci plătești rovinietă, iar sumele de aici sunt o previziune.
    </div>
  );
}

// Traseul unei curse noi, colorat pe bucăți: fiecare segment ia culoarea clasei lui de drum — ACEEAȘI
// clasificare din care serverul scoate suma (câmpul `clase`, lângă `traseu`). Culorile vin din
// `claseDrum` (GET /api/tollro/config, tollro.js), nu se scriu a doua oară pe telefon: dacă harta ar
// colora după alt criteriu, desenul ar contrazice cifra de dedesubt.
export function HartaCursa({ traseu, clase, claseDrum }: { traseu: [number, number][]; clase?: (string | null)[] | null; claseDrum?: { key: string; culoare: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !Array.isArray(traseu) || traseu.length < 2) return;
    const m = L.map(ref.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(m);
    const cul: Record<string, string> = {};
    (claseDrum || []).forEach((c) => { cul[c.key] = c.culoare; });
    // Culoarea unui segment o dă clasa punctului de la care pleacă — aceeași convenție ca la calcul.
    for (let i = 1; i < traseu.length; i++) {
      const k = clase ? clase[i - 1] : null;
      L.polyline([traseu[i - 1], traseu[i]], { color: (k && cul[k]) || '#3b82f6', weight: 5, opacity: 0.9 }).addTo(m);
    }
    L.circleMarker(traseu[0], { radius: 6, color: '#0f172a', fillColor: '#0f172a', fillOpacity: 1 }).addTo(m);
    L.circleMarker(traseu[traseu.length - 1], { radius: 6, color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 1 }).addTo(m);
    m.fitBounds(L.latLngBounds(traseu), { padding: [18, 18] });
    const t = setTimeout(() => { try { m.invalidateSize(); m.fitBounds(L.latLngBounds(traseu), { padding: [18, 18] }); } catch { /* demontată */ } }, 120);
    return () => { clearTimeout(t); try { m.remove(); } catch { /* */ } };
  }, [traseu, clase, claseDrum]);
  return <div ref={ref} class="tz-harta" />;
}
