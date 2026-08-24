// „Ce înseamnă?" — ce trimite mașina asta și ce înseamnă fiecare semnal.
//
// Echivalentul ferestrei din web. Toată munca se face pe SERVER (`/api/devices/:imei/io-explained`):
// potrivirea cu catalogul Teltonika, strângerea codurilor care duc la același semnal, formatarea
// valorilor. Aici doar se desenează. Dacă aș fi adus catalogul brut și l-aș fi prelucrat aici, ar fi
// însemnat o a doua copie a regulilor, în TypeScript — exact ce am evitat la steagurile CAN.
import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { Icon } from './Icon';
import './IoExplained.css';

export interface Semnal {
  id: number | null; cod: string; cheie: string; nume: string; numeConfig: string;
  descriere: string; categorie: string; unitate: string; valoare: string;
  echivalente: string[]; necatalogat: boolean;
}

// Fără diacritice, ca la căutarea de vehicule: cine scrie „turatie" trebuie să găsească „Turație".
function fd(t: string): string {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[șşŞȘ]/g, 's').replace(/[țţŢȚ]/g, 't').toLowerCase();
}

export function IoExplained({ imei, onClose }: { imei: string; onClose: () => void }) {
  const [date, setDate] = useState<{ semnale: Semnal[]; total: number; necatalogate: number; dinCatalog: number } | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let viu = true;
    Api.ioExplained(imei)
      .then((r: any) => { if (viu) setDate(r); })
      .catch((e: any) => { if (viu) setErr(e?.message || 'Nu am putut încărca lista'); });
    return () => { viu = false; };
  }, [imei]);

  const cautat = fd(q);
  const lista = (date?.semnale || []).filter((s) =>
    !cautat || fd(s.nume + ' ' + s.cod + ' ' + s.descriere + ' ' + s.categorie + ' ' + s.numeConfig).indexOf(cautat) >= 0);

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <Icon name="cpu" size={18} />
          <b>Ce trimite mașina</b>
          <button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          {err ? <div class="center-msg" style="color:var(--red)">{err}</div> : null}
          {!date && !err ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div> : null}

          {date ? (
            <>
              <p class="iox-intro">
                Din {date.dinCatalog} de coduri cunoscute, mașina asta trimite <strong>{date.total}</strong>.
                {date.necatalogate > 0
                  ? <> {date.necatalogate} {date.necatalogate === 1 ? 'nu e' : 'nu sunt'} în catalog — {date.necatalogate === 1 ? 'îl' : 'le'} trimite, dar nu știm ce {date.necatalogate === 1 ? 'înseamnă' : 'înseamnă'}.</>
                  : null}
              </p>
              <input
                class="iox-cauta" type="search" placeholder="Caută nume, cod sau descriere…"
                value={q} onInput={(e: any) => setQ(e.currentTarget.value)}
              />
              {!lista.length
                ? <div class="center-msg">Nimic care să se potrivească.</div>
                : lista.map((s) => (
                  <div class={'iox' + (s.necatalogat ? ' nec' : '')} key={s.cheie}>
                    <div class="iox-sus">
                      <span class="iox-cod">{s.cod}</span>
                      <span class="iox-val">{s.valoare}</span>
                    </div>
                    <div class="iox-nume">
                      {s.nume}
                      {s.unitate ? <span class="iox-u"> [{s.unitate}]</span> : null}
                      {s.echivalente.length
                        ? <span class="iox-alt"> (același semnal ca {s.echivalente.join(', ')})</span>
                        : null}
                    </div>
                    {s.numeConfig ? <div class="iox-cfg">Teltonika Configurator: <code>{s.numeConfig}</code></div> : null}
                    {s.descriere ? <div class="iox-desc">{s.descriere}</div> : null}
                    <span class="iox-cat">{s.categorie}</span>
                  </div>
                ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
