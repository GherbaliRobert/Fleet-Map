// Semnalul unui aparat GPS — ACELEAȘI praguri și cuvinte ca pe web („Aparate GPS", agpsStare) și ca în
// exportul de pe server (_invSemnalText): sub 30 de minute „comunică", sub 24 de ore „tăcut de …",
// peste „fără semnal de …". Starea se socotește O SINGURĂ dată și servește și la sumar, și la rând, ca să
// nu ajungem cu un rând roșu și un contor verde care spun lucruri diferite despre același aparat.
// Pragurile și cuvintele sunt legate de web și de server prin verify_inventar.js: dacă muți unul, proba pică.
export const TACUT_MIN = 30;
export const MUT_ORE = 24;

// Cât timp a trecut, pe românește, rotunjit în jos: „3 ore", nu „3,4 ore".
export function deCand(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'câteva secunde';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' oră' : ' ore');
  const z = Math.floor(h / 24);
  return z + (z === 1 ? ' zi' : ' zile');
}

// Momentul vine uneori ca număr (epoch ms), alteori ca text ISO — le recunoaștem pe amândouă.
export function momentMs(v: unknown): number {
  if (v == null || v === '') return NaN;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Number(s) : new Date(s).getTime();
}

export type StareAparat = { k: 'ok' | 'tacut' | 'mut' | 'niciodata'; t: string; c: string };

// Culoarea „comunică" e --fm-ok (verdele aplicației, mai închis pe tema luminoasă; vezi screens/firma.css).
export function stareAparat(lastTx: unknown, acum = Date.now()): StareAparat {
  const ts = momentMs(lastTx);
  if (!isFinite(ts)) return { k: 'niciodata', t: 'nicio transmisie', c: 'var(--red)' };
  const d = Math.max(0, acum - ts); // ceasul aparatului o poate lua înainte; nu inventăm viitor
  if (d < TACUT_MIN * 60000) return { k: 'ok', t: 'comunică', c: 'var(--fm-ok)' };
  if (d < MUT_ORE * 3600000) return { k: 'tacut', t: 'tăcut de ' + deCand(d), c: 'var(--orange)' };
  return { k: 'mut', t: 'fără semnal de ' + deCand(d), c: 'var(--red)' };
}
