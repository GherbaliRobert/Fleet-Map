// neplata.js — ce se întâmplă când un client nu plătește factura la termen.
//
// Regula, hotărâtă de Alin (09.09):
//   • factura se emite și are o scadență (emitere + termenul de plată al firmei, de obicei 30 de zile);
//   • dacă trece scadența neplătită, clientul are 15 zile de grație, cu avertismente;
//   • în ziua a 16-a de la scadență, accesul la platformă se suspendă;
//   • când plătește, totul revine la normal, pe loc.
//
// Tot ce e aici e CURAT: primește facturi și un moment în timp, întoarce un răspuns. Nu atinge baza,
// nu trimite nimic, nu știe de notificări. Așa se poate proba minut cu minut, fără server — iar
// serverul și interfața citesc aceleași reguli, nu două variante care se despart în timp.

const ZI = 24 * 60 * 60 * 1000;

// Câte zile de grație după scadență, până la suspendare.
const ZILE_GRATIE = 15;
// În a câta zi de la scadență se taie accesul. (15 zile de grație ⇒ a 16-a zi.)
const ZI_SUSPENDARE = ZILE_GRATIE + 1;

// Când sună clopoțelul, în zile de la scadență. Patru avertismente, nu mai multe: peste asta,
// oamenii încep să le ignore, iar noi ne obișnuim să le vedem — și atunci nu mai valorează nimic.
const TREPTE = [
  { zi: 0,  fel: 'info',     titlu: 'Factura a depășit termenul de plată' },
  { zi: 5,  fel: 'warning',  titlu: 'Factură neachitată — 10 zile până la suspendare' },
  { zi: 10, fel: 'warning',  titlu: 'Factură neachitată — 5 zile până la suspendare' },
  { zi: 13, fel: 'critical', titlu: 'Ultimul avertisment — accesul se suspendă în 3 zile' }
];

// O factură contează la neplată doar dacă e emisă și încă neachitată. Ciornele nu obligă pe nimeni,
// iar cele anulate sau stornate nu se mai cer.
const STARI_DE_PLATA = ['issued', 'sent', 'overdue'];
function seCere(f) {
  if (!f) return false;
  if (f.type === 'proforma' || f.type === 'credit_note') return false;
  return STARI_DE_PLATA.indexOf(String(f.status || '')) >= 0 && f.due_date != null;
}

// Câte zile au trecut de la scadență (negativ = mai e timp).
function zileDeLaScadenta(factura, acum) {
  if (!factura || factura.due_date == null) return null;
  return Math.floor(((acum || Date.now()) - Number(factura.due_date)) / ZI);
}

// Cea mai VECHE factură neachitată cu termenul depășit. Ea dă ceasul: dacă cineva are trei facturi
// restante, contează prima, nu ultima — altfel un client care mai primește o factură ar câștiga
// alte 15 zile de fiecare dată.
function facturaCareTrage(facturi, acum) {
  const now = acum || Date.now();
  const restante = (facturi || []).filter(function (f) { return seCere(f) && Number(f.due_date) < now; });
  if (!restante.length) return null;
  restante.sort(function (a, b) { return Number(a.due_date) - Number(b.due_date); });
  return restante[0];
}

// Starea de plată a unei firme. Întoarce mereu aceeași formă:
//   { faza: 'ok' | 'avertisment' | 'suspendat', factura, zile, suspendareLa, zilePanaLaSuspendare }
// „faza" e ce vede omul; „zile" e vechimea restanței, în zile de la scadență.
function stareNeplata(facturi, acum) {
  const now = acum || Date.now();
  const f = facturaCareTrage(facturi, now);
  if (!f) return { faza: 'ok', factura: null, zile: null, suspendareLa: null, zilePanaLaSuspendare: null };
  const zile = zileDeLaScadenta(f, now);
  const suspendareLa = Number(f.due_date) + ZI_SUSPENDARE * ZI;
  return {
    faza: zile >= ZI_SUSPENDARE ? 'suspendat' : 'avertisment',
    factura: { id: f.id, numar: f.full_number || null, total: f.total == null ? null : Number(f.total), due_date: Number(f.due_date), currency: f.currency || 'RON' },
    zile: zile,
    suspendareLa: suspendareLa,
    zilePanaLaSuspendare: Math.ceil((suspendareLa - now) / ZI)
  };
}

// Ce treaptă de avertisment se cuvine ACUM. Întoarce treapta cea mai mare atinsă (nu toate cele
// depășite): dacă serverul a stat oprit o săptămână, la repornire trimite un singur anunț, cel
// potrivit zilei de azi, nu patru deodată.
function treaptaDeAnuntat(zile) {
  if (zile == null || zile < 0) return null;
  let gasita = null;
  for (const t of TREPTE) { if (zile >= t.zi) gasita = t; }
  return gasita;
}

// Textul pentru client. Îl scriem într-un singur loc, ca să sune la fel în email și în aplicație.
function mesajClient(stare, treapta) {
  const f = stare.factura || {};
  const zi = function (ms) { return ms ? new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '—'; };
  const suma = f.total == null ? '' : (Number(f.total).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (f.currency || 'RON'));
  if (stare.faza === 'suspendat') {
    return 'Accesul la platformă a fost suspendat pentru neplată. Factura ' + (f.numar || '') +
      (suma ? ' (' + suma + ')' : '') + ', scadentă la ' + zi(f.due_date) +
      ', nu a fost achitată. Accesul se reia imediat ce plata e înregistrată.';
  }
  const ramase = Math.max(0, stare.zilePanaLaSuspendare);
  return 'Factura ' + (f.numar || '') + (suma ? ' (' + suma + ')' : '') + ' a fost scadentă la ' + zi(f.due_date) + '. ' +
    (ramase <= 0 ? 'Accesul se suspendă azi.'
      : 'Vă rugăm să achitați în ' + ramase + (ramase === 1 ? ' zi' : ' zile') + ', până la ' + zi(stare.suspendareLa) +
        ', altfel accesul la platformă se suspendă.') +
    (treapta && treapta.zi === 0 ? ' Aveți ' + ZILE_GRATIE + ' zile de la scadență.' : '');
}

module.exports = {
  ZI, ZILE_GRATIE, ZI_SUSPENDARE, TREPTE, STARI_DE_PLATA,
  seCere, zileDeLaScadenta, facturaCareTrage, stareNeplata, treaptaDeAnuntat, mesajClient
};
