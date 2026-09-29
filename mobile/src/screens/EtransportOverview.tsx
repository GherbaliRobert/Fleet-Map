import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { de } from '../lib/contracte'; // „15 minute", dar „24 de ore" — același acord ca _raxDe de pe web
import { AntetFondator, Banda, Cifra, adresaFirmei, cand, numar } from '../components/FondatorUi';
import './admin.css';
import './fondator.css';

// e-Transport, privirea FONDATORULUI — o firmă pe cartonaș (ca pe web, _etfRandeaza). Aici NU se adaugă și NU se
// șterge niciun transport: noi vedem cine are modulul, cine are coduri expirate sau camioane care tac (amendă),
// cine plătește modulul și nu-l folosește și cine are mașini, dar n-are modulul. Singura acțiune: „Deschide firma".
// Termenul UIT, tăcerea vehiculului și starea transportului vin de la server (etransport.js); nicio durată scrisă aici.
type Semn = { t: string; c: string; rau: boolean };
function semn(f: any): Semn {
  if (!f.modul) return f.deVandut ? { t: 'are mașini, n-are modulul', c: 'var(--text-muted)', rau: false } : { t: 'fără modul', c: 'var(--text-muted)', rau: false };
  if (f.probleme) return { t: f.probleme + ' de rezolvat acum', c: 'var(--fd-bad)', rau: true };
  if (f.platitDegeaba) return { t: 'plătește modulul, n-a introdus niciun cod', c: 'var(--fd-warn)', rau: true };
  if (f.curand) return { t: f.curand + (f.curand === 1 ? ' cod expiră curând' : ' coduri expiră curând'), c: 'var(--fd-warn)', rau: false };
  if (f.necunoscut) return { t: f.necunoscut + (f.necunoscut === 1 ? ' cod fără termen' : ' coduri fără termen'), c: 'var(--fd-warn)', rau: true };
  if (f.active) return { t: 'toate în regulă', c: 'var(--fd-ok)', rau: false };
  if (f.zileFaraCod == null) return { t: 'niciun cod introdus', c: 'var(--fd-warn)', rau: true };
  if (f.zileFaraCod > 60) return { t: 'niciun cod de ' + f.zileFaraCod + ' de zile', c: 'var(--fd-warn)', rau: true };
  return { t: 'niciun transport activ', c: 'var(--text-muted)', rau: false };
}
// Un transport, în cuvinte. `ore` vine de la server (ore rămase; negativ = expirat).
function problema(p: any): { t: string; c: string } {
  if (p.ore == null) return { t: 'fără termen', c: 'var(--fd-warn)' };
  if (p.ore < 0) { const o = Math.abs(p.ore); return { t: o + (o === 1 ? ' oră expirat' : de(o) + 'ore expirat'), c: 'var(--fd-bad)' }; }
  return { t: 'mai are ' + p.ore + (p.ore === 1 ? ' oră' : de(p.ore) + 'ore'), c: p.stare === 'problema' ? 'var(--fd-bad)' : 'var(--fd-warn)' };
}

export function EtransportOverview() {
  const loc = useLocation();
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [doarProbleme, setDoarProbleme] = useState(false);
  const [deschise, setDeschise] = useState<Record<number, boolean>>({});

  function reload() {
    setErr('');
    Api.etransportOverview().then(setD).catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare de rețea.')));
  }
  useEffect(reload, []);

  const toate: any[] = (d && d.firme) || [];
  const t = q.trim().toLowerCase();
  const firme = toate.filter((f) => (!doarProbleme || semn(f).rau) && (!t || String(f.nume || '').toLowerCase().indexOf(t) >= 0))
    .sort((a, b) => {
      const sa = semn(a), sb = semn(b);
      if (sa.rau !== sb.rau) return sa.rau ? -1 : 1;
      if (b.celMaiRau !== a.celMaiRau) return b.celMaiRau - a.celMaiRau;
      return String(a.nume || '').localeCompare(String(b.nume || ''), 'ro');
    });
  // Cifrele de sus: din firmele ARĂTATE (urmează căutarea și filtrul), ca pe web.
  const s = {
    cuModul: firme.filter((f) => f.modul).length,
    cuProbleme: firme.filter((f) => f.modul && f.probleme).length,
    deVandut: firme.filter((f) => f.deVandut).length,
    active: firme.reduce((a, f) => a + (f.active || 0), 0),
    curand: firme.reduce((a, f) => a + (f.curand || 0), 0),
  };
  const filtrat = !!t || doarProbleme;
  const nrRau = toate.filter((f) => semn(f).rau).length;
  const pr = (d && d.praguri) || {};
  const anaf = (d && d.anaf) || {};

  return (
    <div class="screen">
      <AntetFondator titlu="e-Transport" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">Eroare: {err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            {/* Starea raportării e a PLATFORMEI (un singur token, un singur CIF — al nostru), deci stă sus, aici. */}
            {anaf.pornit
              ? <Banda ton="warn">Trimitem la ANAF{anaf.test ? ' — pe mediul de TEST, nu pe cel real' : ''}, dar sub UN SINGUR CIF: al nostru. Până când fiecare client are tokenul și CIF-ul lui, nu porni modulul la clienți — ar declara sub CIF-ul nostru.</Banda>
              : <Banda ton="warn">Nu pleacă nimic la ANAF — nu e setat tokenul nostru. Pentru clienți, modulul e deocamdată o evidență a codurilor UIT, nu conformitate.</Banda>}
            <div class="fd-kpis">
              <Cifra v={numar(s.cuModul)} l="firme cu modulul pornit" />
              <Cifra v={numar(s.cuProbleme)} l="cu transporturi de rezolvat" cul={s.cuProbleme ? 'var(--fd-bad)' : ''} />
              <Cifra v={numar(s.deVandut)} l="au mașini, n-au modulul" cul={s.deVandut ? 'var(--fd-warn)' : ''} />
              <Cifra v={numar(s.active)} l="transporturi active" />
              <Cifra v={numar(s.curand)} l="coduri expiră curând" cul={s.curand ? 'var(--fd-warn)' : ''} />
              {filtrat && <div class="fd-filtrat"><Icon name="filter" size={13} /> Cifrele de mai sus sunt doar pentru firmele arătate acum.</div>}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <button type="button" class={'fd-btn' + (nrRau ? ' warn' : '') + (doarProbleme ? ' on' : '')} style="flex:1" onClick={() => setDoarProbleme(!doarProbleme)}>
                <Icon name="alert" size={14} /> {nrRau} de rezolvat{doarProbleme ? ' · arăt doar pe astea' : ''}
              </button>
            </div>
            <input class="fd-search" value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută firma…" />

            {firme.length === 0 && <div class="adm-empty">Nicio firmă{filtrat ? ' pentru filtrul curent.' : '.'}</div>}
            {firme.map((f) => {
              const sg = semn(f);
              const are = (f.lista || []).length;
              const e = !!deschise[f.id];
              const cate = f.active ? f.active + (f.active === 1 ? ' transport activ' : ' transporturi active') : 'niciun transport activ';
              return (
                <div class="fd-card" key={f.id}>
                  <div class="fd-card-h">
                    <span class="nm">{f.nume || '—'}</span>
                    {f.modul ? <span class="fd-pill on">pornit</span> : <span class={'fd-pill' + (f.deVandut ? ' warn' : '')}>oprit</span>}
                  </div>
                  <div class="meta">{cate} · <span class="semn" style={'color:' + sg.c}>{sg.t}</span></div>
                  {/* Când firma n-a introdus niciun cod, o spune deja semnul — nu-l mai repetăm aici. */}
                  {f.ultimul && <div class="meta" style="margin-top:2px">ultimul cod {cand(f.ultimul)}</div>}
                  <div class="fd-acts">
                    {are > 0 && (
                      <button type="button" class="fd-btn" onClick={() => setDeschise((m) => ({ ...m, [f.id]: !e }))}>
                        <Icon name={e ? 'x' : 'arrowDown'} size={14} /> {e ? 'Ascunde' : 'Afișează mai mult'}
                      </button>
                    )}
                    <button type="button" class="fd-btn" onClick={() => loc.route(adresaFirmei(f.id))}><Icon name="building" size={14} /> Deschide firma</button>
                  </div>
                  {are > 0 && e && (
                    <div class="fd-det">
                      {f.lista.map((p: any) => {
                        const pb = problema(p);
                        return (
                          <div class="fd-d">
                            <Icon name="truck" size={15} color="var(--text-muted)" style="flex:0 0 auto;margin-top:2px" />
                            <span class="mid"><b>{p.vehicul || '—'}</b><span>UIT {p.uit || '—'}{p.motive && p.motive.length ? ' · ' + p.motive.join(' · ') : ''}</span></span>
                            <em style={'color:' + pb.c}>{pb.t}</em>
                          </div>
                        );
                      })}
                      {f.problemeTotal > are && <div class="fd-inca" style="padding-left:0">și încă {f.problemeTotal - are} — deschide firma ca să le vezi pe toate</div>}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Toate cifrele de aici vin de la server (etransport.js): „codul ține 5 zile" e lege, nu decor de ecran. */}
            {pr.zileNational != null && (
              <div class="fd-note" style="margin-top:12px">
                Codul UIT ține <b>{pr.zileNational} zile</b> ({pr.zileIntracomunitar} la achiziții intracomunitare), iar un camion care tace mai mult
                de <b>{pr.tacereMinute}{de(pr.tacereMinute)}minute</b> intră la „de rezolvat". „Expiră curând" = sub <b>{pr.curandOre}{de(pr.curandOre)}ore</b>.
                Codurile și transporturile rămân la client — noi vedem cine e în urmă, ca să-l sunăm.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
