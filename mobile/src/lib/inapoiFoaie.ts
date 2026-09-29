import { useEffect, useRef } from 'preact/hooks';

// Butonul „înapoi" de pe Android închide FOAIA deschisă, nu ecranul de sub ea.
//
// App.tsx face history.back() la butonul fizic. Fără pază, asta pleca de pe ecran și arunca tot ce era bifat în
// foaie, fără întrebarea „Închizi fără să salvezi?". Așa că, cât stă foaia deschisă, punem în istoric o intrare
// în plus, cu ACEEAȘI adresă (routerul nu vede nicio schimbare și ecranul rămâne pe loc). „Înapoi" consumă
// intrarea asta; noi prindem popstate și întrebăm foaia dacă se poate închide (`laInapoi` întoarce true dacă s-a
// închis). Dacă rămâne deschisă (ex. omul a apăsat „Anulează" la întrebare, sau se salvează chiar acum), punem
// intrarea la loc, ca următorul „înapoi" să fie păzit la fel.
//
// Când foaia se închide altfel (X, fundalul, Salvează), scoatem singuri intrarea — DOAR dacă e încă a noastră:
// dacă între timp s-a navigat pe alt ecran, istoricul nu se mai atinge.
//
// Nu deschide două foi păzite una peste alta și nu le închide deodată: fiecare își scoate doar intrarea ei.

type Stare = { raFoaie?: string } | null;
const aNoastra = (id: string) => {
  const s = history.state as Stare;
  return !!(s && s.raFoaie === id);
};

// Un history.back() dat de noi e asincron. Dacă imediat după se deschide altă foaie, intrarea ei se pune abia
// după ce s-a terminat întoarcerea — altfel „înapoi"-ul nostru ar putea s-o scoată chiar pe ea.
let inapoiInCurs: Promise<void> | null = null;
function scoateIntrarea() {
  let fin = () => {};
  const p = new Promise<void>((gata) => {
    fin = () => {
      clearTimeout(t);
      removeEventListener('popstate', fin);
      if (inapoiInCurs === p) inapoiInCurs = null;
      gata();
    };
  });
  const t = setTimeout(() => fin(), 600);
  addEventListener('popstate', fin);
  inapoiInCurs = p;
  history.back();
}

let nr = 0;

export function useInapoiInchide(deschisa: boolean, laInapoi: () => boolean) {
  const fn = useRef(laInapoi);
  fn.current = laInapoi; // mereu varianta de la ultima randare (starea foii de acum)

  useEffect(() => {
    if (!deschisa) return;
    const id = 'foaie-' + (++nr);
    let viu = true;
    let armat = false;
    const pune = () => {
      if (!viu) return;
      try { history.pushState({ raFoaie: id }, '', location.href); armat = true; } catch { armat = false; }
    };
    const laPop = () => {
      if (!viu || !armat || aNoastra(id)) return; // nu e „înapoi"-ul care ne privește
      armat = false; // intrarea noastră tocmai a fost consumată
      let inchisa = true;
      try { inchisa = fn.current(); } catch { inchisa = true; }
      if (!inchisa) pune();
    };
    addEventListener('popstate', laPop);
    if (inapoiInCurs) inapoiInCurs.then(pune); else pune();
    return () => {
      viu = false;
      removeEventListener('popstate', laPop);
      if (armat && aNoastra(id)) scoateIntrarea();
    };
  }, [deschisa]);
}
