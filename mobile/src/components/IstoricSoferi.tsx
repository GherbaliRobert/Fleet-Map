// Istoricul șoferi ↔ mașini (05.11; Alin: „șoferul să aibă istoric pe ce mașini a fost pus — la fel și în vehicule, să am un istoric
// pe fiecare mașină de ce șoferi a fost condusă"). Ca pe web (istoricDeseneaza): titlul, rândurile (cel de acum întâi), nota — toate
// vin de la server (/api/devices/:imei/istoric-soferi, /api/drivers/:id/istoric-masini); aici doar se pun pe ecran, ca text.
// `fel` = 'masina' (rândul = șoferul) sau 'sofer' (rândul = mașina, cu denumirea alături).
import { useEffect, useState } from 'preact/hooks';
import './istoricSoferi.css';

export function IstoricSoferi({ cheie, cere, fel }: { cheie: string; cere: () => Promise<any>; fel: 'masina' | 'sofer' }) {
  const [j, setJ] = useState<any>(null);
  useEffect(() => {
    let viu = true;
    setJ(null);
    cere().then((r) => { if (viu) setJ(r); }).catch(() => { /* fără istoric, fișa merge mai departe */ });
    return () => { viu = false; };
  }, [cheie]);
  if (!j || !Array.isArray(j.randuri)) return null;
  return (
    <details class="vist" open>
      <summary class="vist-t"><span>{(j.titlu || 'Istoric') + (j.randuri.length ? ' (' + j.randuri.length + ')' : '')}</span></summary>
      {!j.randuri.length ? <div class="vist-gol">{j.gol || ''}</div> : (
        <div class="vist-ls">
          {j.randuri.map((r: any) => (
            <div class={'vist-r' + (r.curent ? ' acum' : '')}>
              <div class="vist-cine">
                <b>{r.cine || '—'}</b>
                {fel === 'sofer' && r.nume ? <span class="vist-sub">{r.nume}</span> : null}
                {r.arhivata ? <span class="vist-arh">{r.arhivata}</span> : null}
              </div>
              <div class="vist-cand"><span>{r.text || ''}</span>{r.durata ? <small>{r.durata}</small> : null}</div>
            </div>
          ))}
        </div>
      )}
      {j.nota ? <div class="vist-nota">{j.nota}</div> : null}
    </details>
  );
}
