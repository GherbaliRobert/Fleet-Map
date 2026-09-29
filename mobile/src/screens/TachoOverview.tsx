import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { AntetFondator, Cifra, adresaFirmei, cand, numar } from '../components/FondatorUi';
import './admin.css';
import './fondator.css';
import { nrDe } from '../lib/numar';

// Tahograf, privirea FONDATORULUI — o firmă pe cartonaș (ca pe web, _thfRandeaza). Noi vedem CINE are modulul,
// cine e în urmă cu descărcările (adică riscă amendă), cine plătește și nu-l folosește și cui i-au eșuat fișierele.
// Aici nu se încarcă și nu se șterge nimic — descărcările rămân la client (hotărât 18.09). Toate socotelile
// (cine are card, ce vehicul are tahograf, când e depășit termenul) vin de la server, din aceleași funcții ca
// scadențarul clientului; ecranul doar le îmbracă în cuvinte.
type Semn = { t: string; c: string; rau: boolean };
// Ce e de rezolvat la firmă, într-o propoziție. Ordinea contează: amenda bate vânzarea.
function semn(f: any): Semn {
  if (!f.modul) return f.deVandut ? { t: 'are camioane, n-are modulul', c: 'var(--text-muted)', rau: false } : { t: 'fără modul', c: 'var(--text-muted)', rau: false };
  if (f.depasite) return { t: f.depasite + (f.depasite === 1 ? ' termen depășit' : ' termene depășite'), c: 'var(--fd-bad)', rau: true };
  if (f.niciodata) return { t: f.niciodata + (f.niciodata === 1 ? ' niciodată descărcat' : ' niciodată descărcate'), c: 'var(--fd-bad)', rau: true };
  if (f.necitite) return { t: f.necitite + (f.necitite === 1 ? ' fișier necitit' : ' fișiere necitite'), c: 'var(--fd-warn)', rau: true };
  if (f.platitDegeaba) return { t: 'plătește modulul, n-are ce descărca', c: 'var(--fd-warn)', rau: true };
  if (f.zileFaraFisier == null) return { t: 'niciun fișier încărcat', c: 'var(--fd-warn)', rau: true };
  if (f.zileFaraFisier > 60) return { t: 'niciun fișier de ' + f.zileFaraFisier + ' de zile', c: 'var(--fd-warn)', rau: true };
  if (f.curand) return { t: f.curand + ' scad în 5 zile', c: 'var(--fd-warn)', rau: false };
  return { t: 'la zi', c: 'var(--fd-ok)', rau: false };
}
// Un șofer sau un camion, în cuvinte. `zile` vine de la server (zile rămase; negativ = întârziere).
function problema(p: any): { t: string; c: string } {
  if (p.stare === 'niciodata') return { t: 'niciodată descărcat', c: 'var(--fd-bad)' };
  if (p.stare === 'depasit') { const z = Math.abs(p.zile || 0); return { t: z + (z === 1 ? ' zi întârziere' : ' zile întârziere'), c: 'var(--fd-bad)' }; }
  return { t: 'mai are ' + nrDe(p.zile, 'zi', 'zile'), c: 'var(--fd-warn)' };
}

export function TachoOverview() {
  const loc = useLocation();
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [doarProbleme, setDoarProbleme] = useState(false);
  // Ce ai deschis rămâne deschis după căutare, filtru sau reîncărcare.
  const [deschise, setDeschise] = useState<Record<number, boolean>>({});

  function reload() {
    setErr('');
    Api.tachoOverview().then(setD).catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare de rețea.')));
  }
  useEffect(reload, []);

  const toate: any[] = (d && d.firme) || [];
  const t = q.trim().toLowerCase();
  // Problemele primele, apoi cele mai întârziate, apoi alfabetic — lista se citește ca să vezi pe cine suni.
  const firme = toate.filter((f) => (!doarProbleme || semn(f).rau) && (!t || String(f.nume || '').toLowerCase().indexOf(t) >= 0))
    .sort((a, b) => {
      const sa = semn(a), sb = semn(b);
      if (sa.rau !== sb.rau) return sa.rau ? -1 : 1;
      if (b.celMaiTarziu !== a.celMaiTarziu) return b.celMaiTarziu - a.celMaiTarziu;
      return String(a.nume || '').localeCompare(String(b.nume || ''), 'ro');
    });
  // Cifrele de sus se socotesc din firmele de PE ECRAN, ca să urmeze căutarea și filtrul.
  const s = {
    cuModul: firme.filter((f) => f.modul).length,
    cuProbleme: firme.filter((f) => f.modul && (f.depasite || f.niciodata)).length,
    deVandut: firme.filter((f) => f.deVandut).length,
    fisiere30: firme.reduce((a, f) => a + (f.fisiere30 || 0), 0),
    necitite: firme.reduce((a, f) => a + (f.necitite || 0), 0),
  };
  const filtrat = !!t || doarProbleme;
  const nrRau = toate.filter((f) => semn(f).rau).length;
  const pr = (d && d.praguriLegale) || {};

  return (
    <div class="screen">
      <AntetFondator titlu="Tahograf" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">Eroare: {err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            <div class="fd-kpis">
              <Cifra v={numar(s.cuModul)} l="firme cu modulul pornit" />
              <Cifra v={numar(s.cuProbleme)} l="cu descărcări în urmă" cul={s.cuProbleme ? 'var(--fd-bad)' : ''} />
              <Cifra v={numar(s.deVandut)} l="au camioane, n-au modulul" cul={s.deVandut ? 'var(--fd-warn)' : ''} />
              <Cifra v={numar(s.fisiere30)} l="fișiere în 30 de zile" />
              <Cifra v={numar(s.necitite)} l="fișiere necitite" cul={s.necitite ? 'var(--fd-warn)' : ''} />
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
              const are = (f.probleme || []).length;
              const e = !!deschise[f.id];
              const cate = f.deDescarcat
                ? f.soferi + (f.soferi === 1 ? ' șofer' : ' șoferi') + ' · ' + f.vehicule + (f.vehicule === 1 ? ' camion' : ' camioane')
                : 'nimic de descărcat';
              return (
                <div class="fd-card" key={f.id}>
                  <div class="fd-card-h">
                    <span class="nm">{f.nume || '—'}</span>
                    {f.modul ? <span class="fd-pill on">pornit</span> : <span class={'fd-pill' + (f.deVandut ? ' warn' : '')}>oprit</span>}
                  </div>
                  <div class="meta">{cate} · <span class="semn" style={'color:' + sg.c}>{sg.t}</span></div>
                  <div class="meta" style="margin-top:2px">{f.ultimulFisier ? 'ultimul fișier ' + cand(f.ultimulFisier) : 'niciun fișier'}</div>
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
                      {f.probleme.map((p: any) => {
                        const pb = problema(p);
                        return (
                          <div class="fd-d">
                            <Icon name={p.tip === 'sofer' ? 'user' : 'truck'} size={15} color="var(--text-muted)" style="flex:0 0 auto;margin-top:2px" />
                            <span class="mid"><b>{p.nume || '—'}</b><span>{p.ce === 'card' ? 'card șofer' : 'memoria vehiculului'}</span></span>
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
            <div class="fd-note" style="margin-top:12px">
              Termenele legale: cardul șoferului la <b>{pr.card} de zile</b>, memoria vehiculului la <b>{pr.vu}</b>. O firmă le poate avea
              scurtate în setările ei. Descărcările și fișierele rămân la client — noi vedem cine e în urmă, ca să-l sunăm.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
