import { mdBlocuri, partiGros, type Parte } from '../lib/insight';

// Textul serverului în RA Insight: DOAR noduri (fără innerHTML), deci nimic din ce vine de la server nu se poate interpreta ca
// HTML. **îngroșat**, *italic*, titluri și liste — aceleași forme ca `md` / `mdScurt` / `textGros` de pe web.
function Bucati({ parti }: { parti: Parte[] }) {
  return <>{parti.map((x) => (x.b ? <b>{x.t}</b> : (x.i ? <em>{x.t}</em> : x.t)))}</>;
}
// Un rând cu **îngroșat** („Azi la tine", „Gata").
export function Gros({ text }: { text: any }) { return <Bucati parti={partiGros(text)} />; }
// Răspunsul întreg, pe rânduri: titluri, liste, paragrafe.
export function Md({ text }: { text: any }) {
  return (
    <>
      {mdBlocuri(text).map((b) => {
        if (b.fel === 'gol') return <div class="insp-md-gol" />;
        return <div class={b.fel === 'h' ? 'insp-md-h' : (b.fel === 'li' ? 'insp-md-li' : undefined)}><Bucati parti={b.parti} /></div>;
      })}
    </>
  );
}
