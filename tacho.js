// tacho.js — citirea fișierelor de tahograf (.DDD / .C1B / .V1B) + regulile 561/2006.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DE CE E SCRIS AȘA (citește înainte să modifici)
//
// N-avem încă un fișier real pe care să probăm citirea — firma n-are șoferi profesioniști, aplicația
// n-a fost lansată. Varianta veche era „best-effort": ghicea identificatorii de fișier interni, lua
// numele șoferului ca fiind cel mai lung șir de litere din bloc, și scotea ORE chiar și când nu
// înțelesese nimic. Pe hârtie mergea; în realitate ar fi putut arăta 47 de ore de condus care nu
// există, iar orele astea înseamnă amenzi și controale ITM.
//
// Regula după care e scris acum: **nu inventăm cifre.** Fiecare pas se verifică singur, iar dacă
// verificarea nu trece, fișierul e marcat „necitit" și se spune de ce. Mai bine un ecran care
// recunoaște că nu poate, decât unul care minte cu convingere.
//
// Ce verificăm structural (nu ghicim):
//   • lanțul de blocuri trebuie să acopere fișierul cap-coadă, fără resturi
//   • inelul de zile trebuie să se închidă: fiecare zi spune cât e lungimea zilei dinainte, iar
//     mergând înapoi trebuie să ajungem exact unde scrie că e cea mai veche
//   • fiecare zi are lungime validă (12 + număr PAR de octeți) și dată plauzibilă
//   • schimbările de activitate dintr-o zi trebuie să fie în ordine crescătoare a minutelor
//   • numele șoferului se ia de la poziția fixă din blocul de identificare, ȘI DOAR dacă blocul are
//     exact lungimea din specificație — altfel rămâne necompletat
//
// Structura, din specificația UE (anexa 1B/1C):
//   fișier de CARD  = șir de blocuri [FID(2)][tip(1): 00=date, 01=semnătură][lungime(2)][conținut]
//   fișier de VEHICUL (VU) = începe cu 0x76, apoi blocuri [0x76][TREP(1)][conținut]
//
//   EF_Identification (card șofer) = 143 octeți ficși:
//     0..64   identificarea cardului (stat, număr card, autoritate, date)
//     65      pagina de cod pentru nume
//     66..100 numele de familie (35)
//     101     pagina de cod pentru prenume
//     102..136 prenumele (35)
//     137..140 data nașterii · 141..142 limba preferată
//
//   EF_Driver_Activity_Data:
//     0..1  indicator către cea mai VECHE zi · 2..3 indicator către cea mai NOUĂ zi
//     4..   inel de înregistrări zilnice, fiecare:
//           0..1 lungimea zilei dinainte · 2..3 lungimea acestei zile
//           4..7 data (secunde de la 1970) · 8..9 contor prezență · 10..11 km parcurși
//           12.. perechi de 2 octeți: [1b slot][1b echipaj][1b card][2b activitate][11b minutul]
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const ACT = ['odihna', 'disponibil', 'munca', 'condus'];   // 00, 01, 10, 11
const LEN_IDENTIFICATION = 143;                            // card șofer, din specificație
const MIN_ZI = 12;                                         // antetul unei zile
const MAX_ZILE = 400;                                      // un card ține ~28 de zile; 400 = plasă de siguranță
const DATA_MIN = Date.UTC(2000, 0, 1) / 1000;
const DATA_MAX = Date.UTC(2100, 0, 1) / 1000;

// Termenele legale de descărcare (zile). Cardul șoferului la 28, memoria vehiculului la 90.
// Sunt praguri din regulament — se pot strânge per companie, niciodată lărgi.
const TERMEN_CARD_ZILE = 28;
const TERMEN_VU_ZILE = 90;

// ─── Blocuri (fișier de card) ────────────────────────────────────────────────────────────────────
// Întoarce { blocuri, acopera } — `acopera` e adevărat doar dacă lanțul consumă TOT fișierul.
// Un lanț care se oprește la jumătate înseamnă că n-am înțeles formatul, nu că fișierul e scurt.
function citesteBlocuri(buf) {
  const blocuri = [];
  let p = 0;
  while (p + 5 <= buf.length) {
    const fid = buf.readUInt16BE(p);
    const tip = buf[p + 2];
    const len = buf.readUInt16BE(p + 3);
    const start = p + 5;
    if (tip !== 0x00 && tip !== 0x01) return { blocuri, acopera: false, motiv: 'tip de bloc necunoscut (0x' + tip.toString(16) + ')' };
    if (start + len > buf.length) return { blocuri, acopera: false, motiv: 'un bloc trece de sfârșitul fișierului' };
    if (tip === 0x00) blocuri.push({ fid, start, len, val: buf.slice(start, start + len) });
    p = start + len;
  }
  return { blocuri, acopera: p === buf.length, motiv: p === buf.length ? null : 'au rămas ' + (buf.length - p) + ' octeți necitiți la final' };
}

// ─── Numele titularului ──────────────────────────────────────────────────────────────────────────
// Doar din blocul care are EXACT lungimea din specificație, de la pozițiile fixe. Fără ghicit.
// `null` = câmpul e stricat (are octeți de control înăuntru), '' = e gol. Cele două NU se confundă:
// dacă numele de familie e ilizibil, nu ne mulțumim cu prenumele — n-avem un nume, avem o bucată.
function textFix(buf, off, len) {
  let s = '';
  for (let i = off; i < off + len && i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x00 || b === 0xFF) break;              // umplutură: de aici încolo e gol
    if (b < 32 || b === 127) return null;             // octet de control în mijlocul textului
    s += String.fromCharCode(b);
  }
  return s.trim();
}
function numeDinIdentificare(val) {
  if (!val || val.length !== LEN_IDENTIFICATION) return null;
  const nume = textFix(val, 66, 35);
  const prenume = textFix(val, 102, 35);
  if (nume === null || prenume === null) return null;   // un câmp stricat = niciun nume
  const intreg = (prenume + ' ' + nume).trim().replace(/\s+/g, ' ');
  if (!intreg || intreg.length < 2 || intreg.length > 72) return null;
  if (!/[A-Za-zĂÂÎȘȚăâîșț]/.test(intreg)) return null;
  return intreg;
}

// ─── Inelul de zile ──────────────────────────────────────────────────────────────────────────────
// Citire cu trecere peste capătul inelului (buffer ciclic).
function citesteInel(inel, poz, n) {
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = inel[(poz + i) % inel.length];
  return out;
}

// Parcurge inelul ÎNAPOI, de la cea mai nouă zi. Se oprește când ajunge la cea mai veche (ce scrie
// în antet) sau când lungimea zilei dinainte e 0. Orice nepotrivire = fișier neînțeles.
function citesteZile(val) {
  if (!val || val.length < 8) return { ok: false, motiv: 'blocul de activitate e prea scurt' };
  const pVechi = val.readUInt16BE(0);
  const pNou = val.readUInt16BE(2);
  const inel = val.slice(4);
  if (!inel.length) return { ok: false, motiv: 'inelul de zile e gol' };
  if (pVechi >= inel.length || pNou >= inel.length) {
    return { ok: false, motiv: 'indicatorii de zi arată în afara inelului' };
  }

  const zile = [];
  let poz = pNou;
  let ajunsLaCeaMaiVeche = false;
  const vazute = new Set();

  for (let n = 0; n < MAX_ZILE; n++) {
    if (vazute.has(poz)) return { ok: false, motiv: 'inelul de zile se învârte în cerc' };
    vazute.add(poz);

    const cap = citesteInel(inel, poz, MIN_ZI);
    const lungAnt = cap.readUInt16BE(0);
    const lungZi = cap.readUInt16BE(2);
    const dataBruta = cap.readUInt32BE(4);
    const km = cap.readUInt16BE(10);

    if (lungZi < MIN_ZI) return { ok: false, motiv: 'o zi are lungime imposibilă (' + lungZi + ')' };
    if ((lungZi - MIN_ZI) % 2 !== 0) return { ok: false, motiv: 'o zi are un număr impar de octeți de activitate' };
    if (lungZi > inel.length) return { ok: false, motiv: 'o zi e mai mare decât inelul' };
    if (dataBruta < DATA_MIN || dataBruta > DATA_MAX) {
      return { ok: false, motiv: 'o zi are o dată imposibilă' };
    }

    const nSchimbari = (lungZi - MIN_ZI) / 2;
    const corp = citesteInel(inel, poz + MIN_ZI, nSchimbari * 2);
    const schimbari = [];
    let minutAnterior = -1;
    for (let i = 0; i < nSchimbari; i++) {
      const w = corp.readUInt16BE(i * 2);
      const minut = w & 0x07FF;
      if (minut > 1440) return { ok: false, motiv: 'o schimbare de activitate cade după miezul nopții' };
      // Într-o zi, schimbările sunt scrise în ordine. Dacă nu sunt, n-am nimerit structura.
      if (minut < minutAnterior) return { ok: false, motiv: 'schimbările dintr-o zi nu sunt în ordine' };
      minutAnterior = minut;
      schimbari.push({
        slot: (w >> 15) & 1,          // 0 = șofer, 1 = coleg
        echipaj: (w >> 14) & 1,
        cardScos: (w >> 13) & 1,
        activitate: (w >> 11) & 0x03,
        minut,
      });
    }

    zile.push({
      data: new Date(dataBruta * 1000).toISOString().slice(0, 10),
      km,
      schimbari,
    });

    if (poz === pVechi) { ajunsLaCeaMaiVeche = true; break; }
    if (lungAnt === 0) { ajunsLaCeaMaiVeche = (zile.length === 1) || poz === pVechi; break; }
    poz = (poz - lungAnt + inel.length) % inel.length;
  }

  if (!ajunsLaCeaMaiVeche) {
    return { ok: false, motiv: 'mergând înapoi n-am ajuns la ziua cea mai veche — lanțul nu se închide' };
  }
  return { ok: true, zile: zile.reverse() };
}

// ─── Fișier de vehicul (VU) ──────────────────────────────────────────────────────────────────────
// Începe cu 0x76. Nu-i citim activitatea (n-avem cum să validăm fără un fișier real), dar îl
// recunoaștem sigur și îi scoatem seria de șasiu — atât cât trebuie pentru termenul de 90 de zile.
const TREP = {
  0x01: 'privire de ansamblu', 0x02: 'activități', 0x03: 'evenimente și defecte',
  0x04: 'viteză detaliată', 0x05: 'date tehnice',
  0x21: 'privire de ansamblu (Gen2)', 0x22: 'activități (Gen2)', 0x23: 'evenimente și defecte (Gen2)',
  0x24: 'viteză detaliată (Gen2)', 0x25: 'date tehnice (Gen2)',
};
function esteVu(buf) { return buf.length > 2 && buf[0] === 0x76; }
function blocuriVu(buf) {
  const out = [];
  let p = 0;
  while (p + 2 <= buf.length && buf[p] === 0x76) {
    const trep = buf[p + 1];
    // Blocurile VU n-au lungime în antet — următorul începe la următorul 0x76 urmat de un TREP știut.
    let q = p + 2;
    while (q + 1 < buf.length && !(buf[q] === 0x76 && TREP[buf[q + 1]] !== undefined)) q++;
    out.push({ trep, nume: TREP[trep] || ('necunoscut 0x' + trep.toString(16)), lungime: (q + 1 >= buf.length ? buf.length : q) - p });
    if (q + 1 >= buf.length) break;
    p = q;
  }
  return out;
}
// Seria de șasiu: 17 caractere, fără I, O și Q (regulă ISO). Tiparul e destul de strâns încât o
// potrivire să însemne ceva; dacă găsim mai multe candidate diferite, nu ghicim.
function cautaVin(buf) {
  const text = buf.toString('latin1');
  const gasite = new Set();
  const re = /(?<![A-HJ-NPR-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-HJ-NPR-Z0-9])/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0];
    if (/^\d+$/.test(v)) continue;                      // 17 cifre = probabil altceva
    if (/(.)\1{6,}/.test(v)) continue;                  // umplutură
    gasite.add(v);
  }
  return gasite.size === 1 ? [...gasite][0] : null;
}

// ─── Statistici pe zi ────────────────────────────────────────────────────────────────────────────
function statZi(zi) {
  // Doar slotul șoferului (0). Perechea din slotul 1 e colegul de echipaj, are cardul lui.
  const ch = zi.schimbari.filter(c => c.slot === 0);
  const dur = { odihna: 0, disponibil: 0, munca: 0, condus: 0 };
  let maxCont = 0, cont = 0, pauzaPartiala = 0;
  for (let i = 0; i < ch.length; i++) {
    const start = ch[i].minut;
    const sfarsit = (i + 1 < ch.length) ? ch[i + 1].minut : 1440;
    const d = Math.max(0, Math.min(1440, sfarsit) - start);
    dur[ACT[ch[i].activitate]] += d;
    if (ch[i].activitate === 3) { cont += d; if (cont > maxCont) maxCont = cont; }
    else if (ch[i].activitate === 0) {
      // Pauza care resetează conducerea continuă: 45 min dintr-o dată, sau 15 + 30 în ordinea asta.
      if (d >= 45) { cont = 0; pauzaPartiala = 0; }
      else if (d >= 30 && pauzaPartiala >= 15) { cont = 0; pauzaPartiala = 0; }
      else if (d >= 15) pauzaPartiala = d;
    }
  }
  return {
    date: zi.data, distanceKm: zi.km,
    drivingMin: dur.condus, workMin: dur.munca, availMin: dur.disponibil, restMin: dur.odihna,
    maxContDriveMin: maxCont,
  };
}

function fmtH(min) { min = Math.round(min || 0); return Math.floor(min / 60) + 'h ' + String(min % 60).padStart(2, '0') + 'm'; }
function luniDin(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ─── Abateri, Reg. (CE) 561/2006 ─────────────────────────────────────────────────────────────────
function infringements(stats) {
  const out = [];
  const sorted = stats.filter(s => s.date).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const wkDrive = {}, wkExtended = {}, wkReduced = {};

  for (const s of sorted) {
    const wk = luniDin(s.date);
    wkDrive[wk] = (wkDrive[wk] || 0) + s.drivingMin;

    // Conducere zilnică: 9h, extensibil la 10h de cel mult 2 ori pe săptămână
    if (s.drivingMin > 600) {
      out.push({ date: s.date, rule: 'Conducere zilnică peste 10h', value: fmtH(s.drivingMin), severity: 'gravă' });
    } else if (s.drivingMin > 540) {
      wkExtended[wk] = (wkExtended[wk] || 0) + 1;
      if (wkExtended[wk] > 2) out.push({ date: s.date, rule: 'Peste 2 zile extinse (9-10h) în săptămână', value: fmtH(s.drivingMin), severity: 'serioasă' });
    }

    // Conducere continuă peste 4h30 fără pauză de 45 min
    if (s.maxContDriveMin > 270) {
      out.push({ date: s.date, rule: 'Conducere continuă peste 4h30 fără pauză de 45 min', value: fmtH(s.maxContDriveMin), severity: 'serioasă' });
    }

    // Odihnă zilnică: 11h normal, reductibilă la 9h de cel mult 3 ori pe săptămână
    if ((s.drivingMin + s.workMin) > 60 && s.restMin > 0) {
      if (s.restMin < 540) {
        out.push({ date: s.date, rule: 'Odihnă zilnică sub 9h', value: fmtH(s.restMin), severity: 'gravă' });
      } else if (s.restMin < 660) {
        wkReduced[wk] = (wkReduced[wk] || 0) + 1;
        if (wkReduced[wk] > 3) out.push({ date: s.date, rule: 'Peste 3 odihne reduse (9-11h) în săptămână', value: fmtH(s.restMin), severity: 'serioasă' });
      }
    }
  }

  const wks = Object.keys(wkDrive).sort();
  for (const wk of wks) {
    if (wkDrive[wk] > 3360) out.push({ date: 'săpt. ' + wk, rule: 'Conducere săptămânală peste 56h', value: fmtH(wkDrive[wk]), severity: 'gravă' });
  }
  for (let i = 1; i < wks.length; i++) {
    const consecutive = (new Date(wks[i] + 'T00:00:00Z') - new Date(wks[i - 1] + 'T00:00:00Z')) === 7 * 86400000;
    if (consecutive && (wkDrive[wks[i - 1]] + wkDrive[wks[i]]) > 5400) {
      out.push({ date: 'săpt. ' + wks[i - 1] + ' + ' + wks[i], rule: 'Conducere 2 săptămâni consecutive peste 90h', value: fmtH(wkDrive[wks[i - 1]] + wkDrive[wks[i]]), severity: 'gravă' });
    }
  }
  return out;
}

// ─── Intrarea principală ─────────────────────────────────────────────────────────────────────────
// `incredere`:
//   'confirmat' — structura s-a verificat cap-coadă; cifrele se pot arăta
//   'partial'   — fișierul e recunoscut, dar nu i-am citit activitatea (ex. fișier de vehicul)
//   'necitit'   — n-am înțeles formatul. NU se arată nicio cifră.
function parse(buf) {
  const rez = {
    kind: 'necunoscut', incredere: 'necitit', driverName: null, vin: null,
    days: [], totals: {}, infringements: [], parseNote: null, blocuri: null,
  };
  try {
    if (!buf || buf.length < 16) { rez.parseNote = 'Fișier prea scurt ca să fie un fișier de tahograf.'; return rez; }

    // ── fișier de vehicul (memoria tahografului) ──
    if (esteVu(buf)) {
      const b = blocuriVu(buf);
      rez.kind = 'memoria vehiculului';
      rez.incredere = 'partial';
      rez.vin = cautaVin(buf);
      rez.blocuri = b.map(x => x.nume);
      rez.parseNote = 'Fișier din memoria tahografului, recunoscut (' + b.length + ' secțiuni' +
        (rez.vin ? ', seria de șasiu ' + rez.vin : '') + '). Îl înregistrăm pentru termenul de 90 de zile. ' +
        'Activitatea din el nu se analizează încă — pentru asta ne trebuie un fișier real pe care să verificăm citirea.';
      return rez;
    }

    // ── fișier de card ──
    const { blocuri, acopera, motiv } = citesteBlocuri(buf);
    if (!blocuri.length || !acopera) {
      rez.parseNote = 'Nu recunosc formatul' + (motiv ? ' — ' + motiv : '') +
        '. Fișierul nu e atins; dacă e un fișier valid, trimite-ni-l ca să-l putem adăuga.';
      return rez;
    }
    rez.blocuri = blocuri.length;

    // Blocul de identificare se recunoaște după LUNGIME, nu după un identificator ghicit.
    const bId = blocuri.find(b => b.len === LEN_IDENTIFICATION);
    if (bId) rez.driverName = numeDinIdentificare(bId.val);

    // Blocul de activitate: îl găsim încercând să-l citim. Cel care se validează, ăla e.
    let activ = null, motivActiv = null;
    for (const b of blocuri) {
      if (b.len < 16) continue;
      if (bId && b === bId) continue;   // blocul de identificare nu e inel de zile, oricât ar semăna
      const r = citesteZile(b.val);
      if (r.ok && r.zile.length) { activ = r; break; }
      if (r.motiv && !motivActiv) motivActiv = r.motiv;
    }

    if (!activ) {
      rez.kind = 'card șofer';
      rez.incredere = 'necitit';
      rez.parseNote = 'Fișierul e un card de șofer (' + blocuri.length + ' blocuri), dar n-am putut citi ' +
        'activitatea zilnică' + (motivActiv ? ' — ' + motivActiv : '') + '. NU afișăm ore, ca să nu arătăm cifre greșite.';
      return rez;
    }

    rez.kind = 'card șofer';
    rez.incredere = 'confirmat';
    const stats = activ.zile.map(statZi);
    rez.days = stats;
    rez.infringements = infringements(stats);
    const tD = stats.reduce((s, d) => s + d.drivingMin, 0);
    const tM = stats.reduce((s, d) => s + d.workMin, 0);
    const tO = stats.reduce((s, d) => s + d.restMin, 0);
    const tK = stats.reduce((s, d) => s + (d.distanceKm || 0), 0);
    rez.totals = {
      zile: stats.length, conducereMin: tD, muncaMin: tM, odihnaMin: tO, km: tK,
      infractiuni: rez.infringements.length,
      infractiuniGrave: rez.infringements.filter(i => i.severity === 'gravă').length,
    };
    rez.periodFrom = stats[0].date;
    rez.periodTo = stats[stats.length - 1].date;
    return rez;
  } catch (e) {
    rez.incredere = 'necitit';
    rez.parseNote = 'Eroare la citire: ' + e.message + '. Nu afișăm nicio cifră din acest fișier.';
    return rez;
  }
}

// Orice fel de dată → „AAAA-LL-ZZ". Nu e cochetărie: PostgreSQL întoarce coloanele DATE ca obiecte
// `Date`, nu ca text. Codul care făcea `String(data).slice(0,10)` primea „Tue Aug 25", încerca să-l
// citească, ieșea o dată invalidă, iar scadențarul răspundea „null zile rămase" — adică exact
// întrebarea la care exista secțiunea rămânea fără răspuns, tăcut. Prins de probă.
// Pentru obiectele `Date` se iau componentele LOCALE: driverul de Postgres construiește un `Date` la
// miezul nopții local, iar `toISOString()` l-ar putea muta cu o zi înapoi într-un fus în urma UTC.
function ziISO(x) {
  if (x === null || x === undefined || x === '') return null;
  if (x instanceof Date) {
    if (isNaN(x.getTime())) return null;
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  const t = String(x);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[0];
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : ziISO(d);
}

// ─── Termene de descărcare ───────────────────────────────────────────────────────────────────────
// Zile rămase până la termenul legal. `ultima` = data ultimei descărcări (string ISO) sau null.
function scadenta(ultima, termenZile, acum) {
  const azi = acum ? new Date(acum) : new Date();
  const prag = termenZile || TERMEN_CARD_ZILE;
  const ultimaZi = ziISO(ultima);
  if (!ultimaZi) {
    // Fără dată (sau cu una pe care n-o pot citi) NU spunem „e în regulă" — spunem că n-avem nimic.
    return { stare: 'niciodata', zileDeLaUltima: null, zileRamase: null, prag,
      text: 'niciodată descărcat' };
  }
  const d0 = new Date(ultimaZi + 'T00:00:00Z');
  const d1 = new Date(azi.toISOString().slice(0, 10) + 'T00:00:00Z');
  const trecute = Math.round((d1 - d0) / 86400000);
  const ramase = prag - trecute;
  let stare = 'ok';
  if (ramase < 0) stare = 'depasit';
  else if (ramase <= 5) stare = 'curand';
  return {
    stare, zileDeLaUltima: trecute, zileRamase: ramase, prag,
    text: ramase < 0 ? (Math.abs(ramase) + (Math.abs(ramase) === 1 ? ' zi întârziere' : ' zile întârziere'))
      : (ramase + (ramase === 1 ? ' zi rămasă' : ' zile rămase')),
  };
}

// Golurile dintre perioadele descărcate — „ce-mi lipsește din arhivă".
// Legea cere să poți arăta activitatea continuu; o zi lipsă e o zi pe care n-o poți dovedi.
function goluri(perioade) {
  const p = (perioade || [])
    .map(x => (x ? { from: ziISO(x.from), to: ziISO(x.to) } : null))
    .filter(x => x && x.from && x.to)
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  const out = [];
  for (let i = 1; i < p.length; i++) {
    const sfarsitAnterior = new Date(p[i - 1].to + 'T00:00:00Z');
    const inceput = new Date(p[i].from + 'T00:00:00Z');
    const zile = Math.round((inceput - sfarsitAnterior) / 86400000) - 1;
    if (zile > 0) {
      const de = new Date(sfarsitAnterior.getTime() + 86400000).toISOString().slice(0, 10);
      const pana = new Date(inceput.getTime() - 86400000).toISOString().slice(0, 10);
      out.push({ de, pana, zile });
    }
  }
  return out;
}

module.exports = {
  parse, infringements, statZi, scadenta, goluri, ziISO,
  TERMEN_CARD_ZILE, TERMEN_VU_ZILE,
  // expuse pentru probe
  _citesteBlocuri: citesteBlocuri, _citesteZile: citesteZile, _numeDinIdentificare: numeDinIdentificare,
  _cautaVin: cautaVin, _esteVu: esteVu, _LEN_IDENTIFICATION: LEN_IDENTIFICATION,
};
