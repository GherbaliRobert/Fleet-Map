// „Drumul clientului" (Alin, 24.09: „pare alambicat, trec din aia, ies în aia") — ca _raxDrumHtml pe web.
// Oferta → Trimis la semnat → Semnat → Montajul → Aparatele la firmă → Prima factură.
//
// Bucata asta DOAR desenează `drum`, așa cum îl trimite serverul (contracts.drumulClientului, prin
// `_drumContract`, în /api/contracts și în /overview): pașii, starea fiecăruia (gata / acum / urmeaza /
// nu_e_cazul), detaliul („pe 24.09", „2 aparate") și câți s-au făcut. Telefonul NU socotește niciun pas și
// nu ține o copie a listei de pași. Butonul pasului „acum" îl dă cine o folosește (`buton`), din
// `usePasiContract` (ContractPasi.tsx) — aceleași acțiuni ca în lista Contracte, ca pe web (_drumButon).
// Un contract încheiat (sau lipsă) vine cu `drum: null` → nu se desenează nimic.
import '../screens/contracte.css';

type Pas = { cheie: string; eticheta: string; stare: string; detaliu?: string };

// Semnul fiecărei stări, ca pe web (DRUM_IC): bifă, punct în cerc, cerc gol, minus.
function Semn({ stare }: { stare: string }) {
  const cerc = <circle cx="12" cy="12" r="9" />;
  const in_ = stare === 'gata' ? <path d="M8 12.5l2.7 2.7L16.2 9.5" />
    : stare === 'acum' ? <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    : stare === 'nu_e_cazul' ? <path d="M8 12h8" />
    : null;
  return (
    <svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{cerc}{in_}</svg>
  );
}
const STARE_ARIA: Record<string, string> = { gata: 'făcut', acum: 'pasul de acum', urmeaza: 'urmează', nu_e_cazul: 'nu e cazul' };

export function DrumClient({ drum, buton }: { drum: any; buton: (cheie: string) => any }) {
  if (!drum || !Array.isArray(drum.pasi) || !drum.pasi.length) return null;
  const pasi: Pas[] = drum.pasi;
  const acum = pasi.filter((p) => p.stare === 'acum')[0];
  const btn = acum ? buton(acum.cheie) : null;
  return (
    <div class="ctr-drum">
      <div class="ctr-drum-cap"><b>Drumul clientului</b><span>{drum.gata} din {drum.din} pași făcuți</span></div>
      <div class="ctr-drum-pasi">
        {pasi.map((p) => (
          <div class={'ctr-drum-pas ' + p.stare} aria-label={p.eticheta + ': ' + (STARE_ARIA[p.stare] || p.stare)}>
            <Semn stare={p.stare} />
            <div class="t">
              <span class="e">{p.eticheta}</span>
              {p.detaliu ? <span class="d">{p.detaliu}</span> : null}
            </div>
          </div>
        ))}
      </div>
      <div class="ctr-drum-urm">
        {acum
          ? <>
            <div>Pasul următor: <b>{acum.eticheta}</b></div>
            {btn ? <div class="ctr-btns">{btn}</div> : null}
          </>
          : <div>Toți pașii sunt făcuți.</div>}
      </div>
    </div>
  );
}
