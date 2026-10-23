'use strict';
// ─── „Anunță echipa RA Track" (capitolul 4 al machetei din 21.10; Alin, 22.10: „da" la flux, termenul „te sunăm în cel mult
// o zi lucrătoare", cererile le preiau amândoi, cu „Preiau") ─────────────────────────────────────────────────────────────
// Aparatul e treaba NOASTRĂ (19.10): clientul nu e trimis să verifice nimic. Butonul îi dă un singur lucru de făcut — „ne
// anunță" — iar aplicația pune singură în cerere mașina, problema și datele aparatului. Regulile și TEXTELE stau aici; serverul
// doar adună datele, iar ecranele (web, telefon) doar arată ce primesc. Fără bază, fără rețea.

const TZ = 'Europe/Bucharest';
const LIMITA_ORA = 10;                      // cel mult atâtea cereri pe oră de la același om
const TERMEN = 'Te sunăm în cel mult o zi lucrătoare.';
const LA_FIECARE_PAS = 'La fiecare pas primești un mesaj în aplicație și pe email.';
const BUTON = 'Anunță echipa RA Track';
// Sub butonul din casetă, înainte și după trimitere (macheta E1 / E3c).
const NOTA_CASETA = 'Aparatul e treaba noastră: apeși o dată, iar echipa RA Track primește tot ce-i trebuie.';
const NOTA_DUPA = 'Primești un mesaj la fiecare pas: preluată, programată, rezolvată.';
const NOTA_TRIMISA = 'La fiecare pas primești un mesaj în aplicație și pe email. Cererea o găsești oricând aici, la „Cererile tale”, și din iconița cu căști din bara de sus.';
const NOTA_LISTA = 'Administratorul firmei vede toate cererile firmei; ceilalți, pe ale lor.';
const STARI = ['trimisa', 'preluata', 'programata', 'rezolvata'];
const ETICHETE = { trimisa: 'Trimisă', preluata: 'Preluată', programata: 'Programată', rezolvata: 'Rezolvată' };
// Ce înseamnă fiecare pas, cât încă nu s-a întâmplat (macheta E3).
const PASI = {
  preluata: 'un om din echipa RA Track o ia în grijă și te sună',
  programata: 'ziua și ora, dacă trebuie să venim la mașină',
  rezolvata: 'îți scriem ce am făcut'
};
const PROBLEME = {
  consum: 'Consumul nu se poate măsura',
  semnal: 'Nu transmite',
  aparat: 'Ceva nu merge la aparat',
  alta: 'O întrebare pentru echipă'
};
// De unde a plecat cererea — o vedem noi, ca să știm ce a văzut omul când a apăsat.
const SURSE = { insight: 'din RA Insight', azi: 'din „Azi la tine”', fisa: 'din fișa mașinii', suport: 'din iconița cu căști', telefon: 'de pe telefon' };
const CAND = [['oricand', 'Oricând'], ['dimineata', 'Dimineața'], ['dupa_amiaza', 'După-amiaza'], ['weekend', 'În weekend'], ['suna_intai', 'Sunați-mă întâi']];
// Intervalele din „Programez" (la noi): ce scriem clientului.
const INTERVALE = [['9-12', '9:00 – 12:00', 'între 9 și 12'], ['12-15', '12:00 – 15:00', 'între 12 și 15'],
  ['15-18', '15:00 – 18:00', 'între 15 și 18'], ['zi', 'în cursul zilei', 'în cursul zilei']];
// Ce pleacă singur odată cu cererea. Promisiune: doar ce chiar trimitem (fără „pe ultimele 30 de zile": luăm nivelul de acum).
const DATE_TRIMISE = 'Trimitem singuri și datele aparatului, ca să nu te mai întrebăm nimic: modelul și seria, ultima poziție și ora ei, semnalul și alimentarea, nivelul din rezervor. Discuția ta cu RA Insight nu se trimite.';
const DATE_TRIMISE_FARA_MASINA = 'Trimitem mesajul tău și cum te găsim. Discuția ta cu RA Insight nu se trimite.';

// ─── Ora României ─────────────────────────────────────────────────────────────────────────────────
const _fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function _parti(ms) { const p = {}; _fmt.formatToParts(new Date(Number(ms))).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; }); return p; }
function ziua(ms) { const p = _parti(ms); return p.year + '-' + p.month + '-' + p.day; }
// „azi, 10:42" / „ieri, 16:20" / „14.10, 09:15" — ca în restul aplicației.
function cand(ms, acum) {
  if (!ms || !Number(ms)) return '';
  const p = _parti(ms), a = acum != null ? Number(acum) : Date.now();
  const ora = p.hour + ':' + p.minute;
  if (ziua(ms) === ziua(a)) return 'azi, ' + ora;
  if (ziua(ms) === ziua(a - 86400000)) return 'ieri, ' + ora;
  return p.day + '.' + p.month + ', ' + ora;
}
function dataScurta(ms) { if (!ms || !Number(ms)) return ''; const p = _parti(ms); return p.day + '.' + p.month; }
function dataLunga(ms) { if (!ms || !Number(ms)) return ''; const p = _parti(ms); return p.day + '.' + p.month + '.' + p.year; }
const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
// „2026-10-23" → „joi, 23.10" (o zi din calendar: fără fus orar).
function ziScrisa(z) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(z || ''));
  if (!m) return '';
  return ZILE[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ', ' + m[3] + '.' + m[2];
}
function ziPlus(z, n) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(z || '')); if (!m) return ''; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10); }
// Ziua propusă la „Programez": următoarea zi lucrătoare (vineri → luni). Sărbătorile legale nu le știe — omul alege altă zi.
function ziLucratoareDupa(z) {
  let d = ziPlus(z, 1);
  for (let i = 0; i < 3 && d; i++) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w !== 0 && w !== 6) break; d = ziPlus(d, 1); }
  return d;
}
const _sus = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
// „3 zile", „21 de ore", „45 de minute" (cu „de" de la 20 în sus).
function _de(n) { const r = Math.abs(n) % 100; return (n === 0 || r >= 20 || r === 0) ? ' de ' : ' '; }
function _cate(n, unu, multe) { return n === 1 ? (unu === 'oră' || unu === 'zi' ? 'o ' + unu : 'un ' + unu) : n + _de(n) + multe; }
function durata(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m >= 1440) return _cate(Math.floor(m / 1440), 'zi', 'zile');
  if (m >= 60) return _cate(Math.floor(m / 60), 'oră', 'ore');
  return _cate(m, 'minut', 'minute');
}
const prenume = (s) => String(s || '').trim().split(/\s+/)[0] || '';

// ─── Cererea ──────────────────────────────────────────────────────────────────────────────────────
// Ce primește serverul de la ecran, curățat. `ce` (ce a văzut omul în caseta problemei) se păstrează doar la consum: atunci e
// chiar textul scris de aplicație în casetă. La „nu transmite" textul îl scrie serverul, din ultima poziție.
function curata(b) {
  b = b || {};
  const are = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const linie = (x, n) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n);
  const problema = are(PROBLEME, b.problema) ? b.problema : 'alta';
  const cnd = [];
  (Array.isArray(b.cand) ? b.cand : []).forEach(function (k) { if (CAND.some(function (c) { return c[0] === k; }) && cnd.indexOf(k) < 0) cnd.push(k); });
  return {
    problema: problema,
    imei: /^\d{6,20}$/.test(String(b.imei || '')) ? String(b.imei) : null,
    sursa: are(SURSE, b.sursa) ? b.sursa : 'suport',
    mesaj: String(b.mesaj == null ? '' : b.mesaj).replace(/\r/g, '').trim().slice(0, 2000),
    cand: cnd,
    unde: linie(b.unde, 200),
    telefon: linie(b.telefon, 40).replace(/[^\d+ ().-]/g, '').trim(),
    ce: problema === 'consum' ? linie(b.ce, 600) : ''
  };
}
// Ce lipsește ca cererea să plece (null = nimic). Mașina e obligatorie la problemele unei mașini; la „o întrebare", mesajul.
function lipsa(c) {
  if (c.problema !== 'alta' && !c.imei) return 'Alege mașina.';
  if (c.problema === 'alta' && !c.mesaj) return 'Scrie pe scurt ce s-a întâmplat sau ce vrei să ne întrebi.';
  return null;
}
// Titlul cererii: „Consumul nu se poate măsura", „Nu transmite de 3 zile".
function titlu(problema, o) {
  if (problema === 'semnal' && o && o.tacutMin != null) return 'Nu transmite de ' + durata(o.tacutMin);
  return PROBLEME[problema] || PROBLEME.alta;
}
// „Ce s-a întâmplat · scris de aplicație" la o mașină care nu transmite (din ultima poziție, fără vină pe aparat).
function ceSemnal(o) {
  o = o || {};
  if (!o.ultima) return 'Mașina n-a transmis încă nicio poziție.';
  return 'Ultima poziție: ' + cand(o.ultima, o.acum) + (o.adresa ? ', ' + o.adresa : '') + '.';
}
function vehicul(c) { return c && c.plate ? String(c.plate) : (c && c.masina ? String(c.masina) : ''); }
function vehiculLung(c) {
  const nr = c && c.plate ? String(c.plate) : '', n = c && c.masina ? String(c.masina) : '';
  return nr && n && nr.toUpperCase() !== n.toUpperCase() ? nr + ' · ' + n : (nr || n);
}
function textCand(c) {
  const k = (c && c.cand && c.cand.cand) || [];
  const t = CAND.filter(function (x) { return k.indexOf(x[0]) >= 0; }).map(function (x) { return x[1].toLowerCase(); }).join(', ');
  const unde = c && c.cand && c.cand.unde;
  return [t, unde].filter(Boolean).join(' · ');
}
function sursaText(c) {
  if (c.sursa === 'insight') return 'din caseta „' + (PROBLEME[c.problema] || PROBLEME.alta) + '”, în RA Insight';
  if (c.sursa === 'azi') return 'din „Azi la tine”';
  return SURSE[c.sursa] || SURSE.suport;
}
function deTrimisText(cuMasina) { return cuMasina ? DATE_TRIMISE : DATE_TRIMISE_FARA_MASINA; }
// „Am trimis cererea nr. 142." + „B 154 UIP · Consumul nu se poate măsura · azi, 10:42" (macheta E3).
function confirmare(c, acum) {
  return { titlu: 'Am trimis cererea nr. ' + c.id + '.', sub: [vehicul(c), c.titlu, cand(c.creat_la, acum)].filter(Boolean).join(' · ') };
}
// Caseta din discuție, după trimitere (macheta E3c): în locul butonului.
function seOcupa(c, acum) {
  let cum = 'trimisă ' + cand(c.creat_la, acum);
  if (c.stare === 'preluata') cum = 'preluată ' + cand(c.preluata_la, acum) + (c.preluata_de_nume ? ' de ' + prenume(c.preluata_de_nume) : '');
  if (c.stare === 'programata') cum = 'programată ' + ziScrisa((c.programare || {}).zi);
  return 'Echipa RA Track se ocupă · cererea nr. ' + c.id + ' · ' + cum;
}
const _noi = (n) => n ? n + ', RA Track' : 'echipa RA Track';
// Pașii cererii (macheta E3): trimisă → preluată → programată → rezolvată. „Programată" poate rămâne sărită (n-a fost nevoie).
function pasi(c, acum) {
  const i = STARI.indexOf(c.stare);
  const prog = c.programare || null;
  return [
    { cheie: 'trimisa', eticheta: ETICHETE.trimisa, gata: true, detaliu: cand(c.creat_la, acum) + (c.trimisa_de_nume ? ' · de ' + c.trimisa_de_nume : '') },
    { cheie: 'preluata', eticheta: ETICHETE.preluata, gata: !!c.preluata_la, detaliu: c.preluata_la ? cand(c.preluata_la, acum) + ' · ' + _noi(c.preluata_de_nume) : PASI.preluata },
    { cheie: 'programata', eticheta: ETICHETE.programata, gata: !!prog, sarit: !prog && i === 3,
      detaliu: prog ? prog.mesaj : (i === 3 ? 'n-a fost nevoie să venim la mașină' : PASI.programata) },
    { cheie: 'rezolvata', eticheta: ETICHETE.rezolvata, gata: i === 3, detaliu: i === 3 ? cand(c.rezolvata_la, acum) + (c.raspuns ? ': „' + c.raspuns + '”' : '') : PASI.rezolvata }
  ];
}
// Un rând din „Cererile tale" (macheta E3b).
function pentruClient(c, acum, o) {
  o = o || {};
  let detaliu;
  if (c.stare === 'rezolvata') detaliu = dataScurta(c.rezolvata_la) + (c.raspuns ? ': „' + c.raspuns + '”' : ': rezolvată') + ' · ' + _noi(c.rezolvata_de_nume);
  else if (c.stare === 'programata') detaliu = ((c.programare || {}).mesaj || ziScrisa((c.programare || {}).zi)) + ' · ' + _noi(c.programata_de_nume);
  else if (c.stare === 'preluata') detaliu = 'Preluată ' + cand(c.preluata_la, acum) + ' de ' + _noi(c.preluata_de_nume) + '. ' + TERMEN;
  else detaliu = 'Trimisă ' + cand(c.creat_la, acum) + '. ' + TERMEN;
  return {
    id: c.id, cap: 'Nr. ' + c.id + (vehicul(c) ? ' · ' + vehicul(c) : ''), titlu: c.titlu || titlu(c.problema),
    stare: c.stare, eticheta: ETICHETE[c.stare] || ETICHETE.trimisa, detaliu: detaliu, deschisa: c.stare !== 'rezolvata',
    deAltcineva: o.eu != null && c.user_id != null && Number(c.user_id) !== Number(o.eu) ? 'trimisă de ' + (c.trimisa_de_nume || 'un coleg') : null,
    pasi: pasi(c, acum)
  };
}
// Datele aparatului, pe rânduri scurte — DOAR pentru noi (clientul vede doar ce se trimite, fără cifre).
function dateAparat(a, acum) {
  a = a || {};
  const out = [];
  const nr = (v, z) => Number(v).toLocaleString('ro-RO', { minimumFractionDigits: z || 0, maximumFractionDigits: z || 0 });
  if (a.model || a.imei) out.push({ l: 'Aparat', v: [a.model ? 'Teltonika ' + String(a.model).replace(/^Teltonika\s+/i, '') : null, a.imei ? 'IMEI ' + a.imei : null].filter(Boolean).join(' · ') });
  if (a.sim) out.push({ l: 'Cartela', v: String(a.sim) });
  out.push({ l: 'Ultima poziție', v: a.ultima ? cand(a.ultima, acum) : 'niciuna încă' });
  if (a.gsm != null || a.sateliti != null) out.push({ l: 'Semnal', v: [a.gsm != null ? 'GSM ' + a.gsm + '/5' : null, a.sateliti != null ? _cate(Number(a.sateliti), 'satelit', 'sateliți') : null].filter(Boolean).join(' · ') });
  if (a.tensiune != null) out.push({ l: 'Alimentare', v: nr(a.tensiune, 1) + ' V' });
  if (a.rezervor != null) out.push({ l: 'Rezervor', v: nr(a.rezervor) + ' L' });
  if (a.pornit) out.push({ l: 'Transmite de pe', v: dataLunga(a.pornit) });
  if (a.instalator) out.push({ l: 'Instalator', v: String(a.instalator) });
  return out;
}
// „Pare rezolvată singură" (macheta E4): o mașină care nu transmitea a transmis din nou după cerere.
function pareRezolvata(c, ultima, acum) {
  if (!c || c.problema !== 'semnal' || c.stare === 'rezolvata' || !ultima || !(Number(ultima) > Number(c.creat_la))) return null;
  return 'Pare rezolvată singură: transmite din nou de ' + cand(ultima, acum) + '.';
}
// Un rând din „Cereri de la clienți" (la noi, macheta E4). Butoanele după stare.
function pentruNoi(c, acum, o) {
  o = o || {};
  const pr = prenume(c.preluata_de_nume);
  const tag = c.stare === 'rezolvata' ? { text: 'rezolvată ' + dataScurta(c.rezolvata_la) + (c.rezolvata_de_nume ? ' · ' + prenume(c.rezolvata_de_nume) : ''), cls: 'rez' }
    : c.stare === 'programata' ? { text: 'programată ' + ziScrisa((c.programare || {}).zi) + (c.programata_de_nume ? ' · ' + prenume(c.programata_de_nume) : ''), cls: 'prog' }
      : c.stare === 'preluata' ? { text: 'preluată' + (pr ? ' · ' + pr : ''), cls: 'prel' } : { text: 'nouă', cls: 'noua' };
  const butoane = c.stare === 'rezolvata' ? ['redeschide'] : (c.stare === 'trimisa' ? ['preiau', 'programez', 'rezolvat'] : ['programez', 'rezolvat']);
  const prog = c.programare || null;
  return {
    id: c.id, company_id: c.company_id, imei: c.imei || null, stare: c.stare,
    cap: 'Nr. ' + c.id + ' · ' + (c.company_name || 'fără firmă'), vehicul: vehiculLung(c), tag: tag,
    cine: [(c.contact || {}).nume || c.trimisa_de_nume || '', (c.contact || {}).rol || ''].filter(Boolean).join(', '),
    telefon: (c.contact || {}).telefon || '', email: (c.contact || {}).email || '',
    cand: cand(c.creat_la, acum), sursa: sursaText(c),
    titlu: c.titlu || titlu(c.problema), ce: c.ce || '', mesaj: c.mesaj || '', candText: textCand(c),
    aparat: dateAparat(c.aparat, acum), pareRezolvata: pareRezolvata(c, o.ultima, acum),
    programare: prog ? [ziScrisa(prog.zi), prog.intervalText, prog.partener_nume].filter(Boolean).join(' · ') + (prog.in_calendar ? ' · în Calendarul de montaj' : '') : null,
    programareMesaj: prog ? prog.mesaj : null,
    raspuns: c.raspuns || null, butoane: butoane
  };
}
// Ce scriem clientului la „Programez", dacă omul nostru n-a scris altceva: „Joi, 23.10, între 9 și 12, vine instalatorul la …".
function mesajProgramare(o) {
  o = o || {};
  const iv = INTERVALE.filter(function (x) { return x[0] === o.interval; })[0] || INTERVALE[0];
  return _sus(ziScrisa(o.zi)) + ', ' + iv[2] + ', vine instalatorul' + (o.unde ? ' la ' + o.unde : '') + '.';
}
function intervalText(k) { const iv = INTERVALE.filter(function (x) { return x[0] === k; })[0]; return iv ? iv[1] : ''; }

// ─── Anunțurile și emailurile ──────────────────────────────────────────────────────────────────────
// La noi (fondatorii): în aplicație + pe telefon. Fără date tehnice în anunț (le vedem în listă).
function anuntNoi(c) {
  return { titlu: 'Cerere nouă nr. ' + c.id + ' · ' + (c.company_name || 'fără firmă'),
    corp: [vehicul(c), c.titlu || titlu(c.problema), (c.contact || {}).nume || c.trimisa_de_nume].filter(Boolean).join(' · ') };
}
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Emailul care ne vine la contact@ (macheta E5): tot ce trebuie, fără să deschidem aplicația. „Răspuns la" = clientul.
function emailNoi(c, o) {
  o = o || {};
  const k = c.contact || {};
  const rand = (l, v) => '<tr><td style="color:#475569;padding:4px 16px 4px 0;vertical-align:top;white-space:nowrap;">' + _esc(l) + '</td><td style="padding:4px 0;">' + v + '</td></tr>';
  const randuri = [];
  if (vehicul(c)) randuri.push(['Mașina', '<b>' + _esc(vehicul(c)) + '</b>' + (c.masina && c.plate ? ' · ' + _esc(c.masina) : '')]);
  randuri.push(['Problema', _esc(c.titlu || titlu(c.problema))]);
  if (c.ce) randuri.push(['Ce s-a întâmplat', _esc(c.ce)]);
  if (c.mesaj) randuri.push(['Mesajul clientului', '„' + _esc(c.mesaj) + '”']);
  randuri.push(['Cine', _esc([k.nume || c.trimisa_de_nume, k.rol, k.telefon, k.email].filter(Boolean).join(' · '))]);
  if (textCand(c)) randuri.push(['Când se poate', _esc(textCand(c))]);
  randuri.push(['De unde', _esc(sursaText(c))]);
  const ap = dateAparat(c.aparat, o.acum);
  let html = '<div style="font-size:16px;font-weight:bold;margin-bottom:12px;">Cerere nouă nr. ' + c.id + ' · ' + _esc(c.company_name || 'fără firmă') + '</div>' +
    '<table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;border-collapse:collapse;">' + randuri.map(function (r) { return rand(r[0], r[1]); }).join('') + '</table>';
  if (c.imei && ap.length) html += '<div style="margin:16px 0 6px;font-weight:bold;">Datele aparatului</div>' +
    '<table cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.5;border-collapse:collapse;color:#1a2235;">' + ap.map(function (r) { return rand(r.l, _esc(r.v)); }).join('') + '</table>';
  if (o.link) html += '<div style="margin-top:18px;"><a href="' + _esc(o.link) + '" style="display:inline-block;background:#166534;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;">Deschide cererea în aplicație</a></div>';
  if (k.email) html += '<div style="margin-top:14px;color:#475569;font-size:13px;">Răspunde la acest email ca să-i scrii direct ' + _esc(k.nume || 'clientului') + '.</div>';
  const text = ['Cerere nouă nr. ' + c.id + ' · ' + (c.company_name || 'fără firmă'), ''].concat(randuri.map(function (r) { return r[0] + ': ' + String(r[1]).replace(/<[^>]+>/g, ''); }))
    .concat(c.imei && ap.length ? ['', 'Datele aparatului:'].concat(ap.map(function (r) { return r.l + ': ' + r.v; })) : [])
    .concat(o.link ? ['', 'Deschide cererea: ' + o.link] : []).join('\n');
  return { subject: 'Cerere ' + c.id + ' · ' + (c.company_name || 'fără firmă') + (vehicul(c) ? ' · ' + vehicul(c) : '') + ' · ' + (c.titlu || titlu(c.problema)), html: html, text: text };
}
// La client, la fiecare pas: în aplicație + pe telefon + pe email.
function anuntClient(c, pas) {
  const cap = [vehicul(c), c.titlu || titlu(c.problema)].filter(Boolean).join(' · ');
  if (pas === 'preluata') return { titlu: 'Am preluat cererea nr. ' + c.id, corp: cap + '. Te sună ' + (c.preluata_de_nume ? c.preluata_de_nume + ', din echipa RA Track,' : 'cineva din echipa RA Track') + ' în cel mult o zi lucrătoare.' };
  if (pas === 'programata') return { titlu: 'Am programat cererea nr. ' + c.id, corp: cap + '. ' + ((c.programare || {}).mesaj || '') };
  if (pas === 'rezolvata') return { titlu: 'Am rezolvat cererea nr. ' + c.id, corp: cap + (c.raspuns ? '. „' + c.raspuns + '”' : '.') };
  return null;
}
function emailClient(c, pas) {
  const a = anuntClient(c, pas);
  if (!a) return null;
  const salut = prenume((c.contact || {}).nume || c.trimisa_de_nume);
  return { subject: a.titlu + ' · RA Track',
    text: 'Bună ziua' + (salut ? ', ' + salut : '') + ',\n\n' + a.corp + '\n\nCererea o găsești oricând în aplicație, din iconița cu căști din bara de sus („Cererile tale”).\n\nEchipa RA Track' };
}

module.exports = {
  LIMITA_ORA, TERMEN, LA_FIECARE_PAS, BUTON, NOTA_CASETA, NOTA_DUPA, NOTA_TRIMISA, NOTA_LISTA, STARI, ETICHETE, PASI, PROBLEME,
  SURSE, CAND, INTERVALE, DATE_TRIMISE, DATE_TRIMISE_FARA_MASINA,
  cand, ziua, ziScrisa, ziPlus, ziLucratoareDupa, durata, curata, lipsa, titlu, ceSemnal, vehicul, vehiculLung, textCand, sursaText, deTrimisText,
  confirmare, seOcupa, pasi, pentruClient, dateAparat, pareRezolvata, pentruNoi, mesajProgramare, intervalText,
  anuntNoi, emailNoi, anuntClient, emailClient
};
