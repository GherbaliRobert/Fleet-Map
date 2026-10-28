// livrare.js — ce s-a întâmplat cu un email DUPĂ ce l-a primit Brevo (28.10; Alin, cu o captură: „programarea… e încă activă, eu nu
// primesc nimic. Și nici nu văd motivul și nici nu știu unde să mă uit").
// Aplicația preda emailul lui Brevo și scria „a plecat pe email"; de acolo încolo (livrat la Yahoo, refuzat, amânat, adresa blocată
// la Brevo, marcat spam) nu știa nimeni. Brevo ține evenimentele fiecărui email; serverul le cere (fără să trimită nimic) și le scrie
// pe rândul programării, în „Stare producție" și în anunțul nostru. Regulile și TEXTELE stau aici, curate; serverul doar cere și scrie.
// Numele evenimentelor nu le citim întocmai: le aducem la o formă (litere mici, fără semne), ca o altă scriere („hardBounces",
// „hard_bounce") să însemne același lucru, iar un eveniment necunoscut să nu ne facă să spunem ceva ce nu știm.

const ORE_URMARIRE = 72;          // după 3 zile fără răspuns de la Brevo, nu mai întrebăm
const PAUZA_VERIFICARE_MIN = 10;  // același email nu se întreabă mai des de o dată la 10 minute

// Forma scurtă a stării, în ordinea în care câștigă: un email livrat și apoi marcat spam e „spam"; unul amânat și apoi livrat, „livrat".
const ORDINE = ['spam', 'blocat', 'invalid', 'respins', 'eroare', 'deschis', 'livrat', 'amanat', 'trimis'];
// „deblocat" nu vine de la Brevo: îl scrie serverul când scoatem adresa de pe lista blocată (atunci nu mai întrebăm de emailul vechi).
const FINALE = new Set(['spam', 'blocat', 'invalid', 'respins', 'eroare', 'deschis', 'livrat', 'deblocat']);
const RELE = new Set(['spam', 'blocat', 'invalid', 'respins', 'eroare']);

function _cheie(ev) { return String(ev || '').toLowerCase().replace(/[^a-z]/g, ''); }
// Un eveniment Brevo → starea noastră (null = nu spune nimic despre livrare).
function stareEveniment(ev) {
  const k = _cheie(ev);
  if (!k) return null;
  if (k === 'delivered') return 'livrat';
  if (/^(uniqueopened|opened|opens|open|clicks|click|uniqueclicks|loadedbyproxy|proxyopen|uniqueproxyopen)$/.test(k)) return 'deschis';
  if (/^hardbounces?$/.test(k)) return 'respins';
  if (/^softbounces?$/.test(k) || k === 'deferred') return 'amanat';
  if (k === 'blocked') return 'blocat';
  if (/^(spam|complaint|complaints)$/.test(k)) return 'spam';
  if (/^(invalid|invalidemail|invalidemails)$/.test(k)) return 'invalid';
  if (k === 'error' || k === 'errors') return 'eroare';
  if (/^(requests?|sent|request)$/.test(k)) return 'trimis';
  if (k === 'unsubscribed') return 'livrat';   // s-a dezabonat dintr-un email care deci a ajuns
  return null;
}

// Evenimentele unui email (forma Brevo: { event, date, reason, … }) → { stare, la, motiv }.
function stareDinEvenimente(evenimente) {
  const l = (Array.isArray(evenimente) ? evenimente : []).map(function (e) {
    return { stare: stareEveniment(e && e.event), la: e && e.date ? Date.parse(e.date) || null : null, motiv: e && e.reason ? String(e.reason).slice(0, 300) : null };
  }).filter(function (e) { return e.stare; });
  for (const s of ORDINE) {
    const din = l.filter(function (e) { return e.stare === s; }).sort(function (a, b) { return (b.la || 0) - (a.la || 0); });
    if (din.length) return { stare: s, la: din[0].la, motiv: din[0].motiv || null };
  }
  return { stare: 'necunoscut', la: null, motiv: null };
}

function finala(stare) { return FINALE.has(stare); }
function rea(stare) { return RELE.has(stare); }
// Se mai întreabă Brevo despre emailul ăsta? Doar cât nu s-a lămurit și cât e proaspăt.
function deVerificat(rand, acum) {
  if (!rand || finala(rand.stare)) return false;
  const t = Number(rand.trimis_la) || 0, v = Number(rand.verificat_la) || 0;
  if (acum - t > ORE_URMARIRE * 3600 * 1000) return false;
  return !v || acum - v >= PAUZA_VERIFICARE_MIN * 60000;
}

function _ora(t) { return t ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; }
function _domeniu(email) { const m = String(email || '').match(/@([^\s>]+)/); return m ? m[1].toLowerCase() : ''; }
function _motiv(m) { return m ? ' (' + String(m).replace(/\s+/g, ' ').trim().slice(0, 200) + ')' : ''; }

// Ce s-a întâmplat, pe scurt — pentru noi (cu adresa și motivul exact).
function textPentruNoi(r) {
  const cui = r.catre || 'destinatar';
  switch (r.stare) {
    case 'livrat': return 'livrat la ' + (_domeniu(r.catre) || cui) + (r.la ? ' (' + _ora(r.la) + ')' : '');
    case 'deschis': return 'livrat și deschis' + (r.la ? ' (' + _ora(r.la) + ')' : '');
    case 'amanat': return 'serverul de email al lui ' + cui + ' l-a amânat; Brevo reîncearcă singur' + _motiv(r.motiv);
    case 'trimis': return 'Brevo l-a primit; încă nu știm dacă a ajuns la ' + cui;
    case 'respins': return 'serverul de email al lui ' + cui + ' l-a refuzat' + _motiv(r.motiv);
    case 'blocat': return 'Brevo nu mai trimite la ' + cui + ': adresa e pe lista lui de adrese blocate' + _motiv(r.motiv);
    case 'spam': return cui + ' l-a marcat ca spam';
    case 'invalid': return 'adresa ' + cui + ' nu există';
    case 'eroare': return 'Brevo n-a putut să-l trimită la ' + cui + _motiv(r.motiv);
    case 'deblocat': return cui + ' a fost scoasă de pe lista de adrese blocate la Brevo; următorul email pleacă normal';
    default: return 'Brevo n-a spus încă ce s-a întâmplat cu el';
  }
}
// Ce e de făcut — doar pentru noi, doar unde avem ceva de făcut. `inAnunt`: textul pleacă într-un anunț, nu stă pe rândul
// programării (acolo e butonul „Deblochează la Brevo"; în anunț spunem unde e).
function ceFacem(r, inAnunt) {
  switch (r.stare) {
    case 'livrat': case 'deschis': return 'Dacă nu e în căsuța de intrare, e în Spam: „Nu e spam" îl mută înapoi.';
    case 'blocat': return inAnunt
      ? 'Adresa se scoate de pe lista blocată din contul Brevo' + (String(r.ref || '').indexOf('sched:') === 0 ? ' sau cu „Deblochează la Brevo", în Rapoarte › Programări' : '') + '.'
      : 'Scoateți adresa de pe lista blocată cu „Deblochează la Brevo", de aici, sau din contul Brevo.';
    case 'respins': return 'Motivul din paranteză spune de ce. Dacă vorbește de „policy" sau „DMARC", e de verificat domeniul ratrack.ro în Brevo (Senders, Domains).';
    case 'spam': return 'Destinatarul îl mută din Spam cu „Nu e spam". Brevo blochează după asta adresa: deblocați-o, ca următorul să plece.';
    case 'invalid': return 'Corectați adresa în programare.';
    case 'amanat': return 'De obicei ajunge singur în câteva ore.';
    default: return '';
  }
}
// Ce află clientul: fără adresă și fără motiv — doar dacă a ajuns, iar dacă nu, că am fost anunțați.
function textPentruClient(r) {
  if (r.stare === 'livrat' || r.stare === 'deschis') return 'a ajuns la destinatar';
  if (rea(r.stare)) return 'nu a ajuns la destinatar; echipa RA Track a fost anunțată';
  return '';
}

// Toate emailurile unei trimiteri (un raport poate pleca la mai multe adrese) → un rând pentru ecran + felul lui.
// fel: 'rau' (cel puțin unul n-a ajuns), 'ok' (toate au ajuns), 'asteapta' (încă nu știm), null (nimic de spus).
function rezumat(randuri, laNoi) {
  const l = (Array.isArray(randuri) ? randuri : []).filter(Boolean);
  if (!l.length) return { fel: null, text: '', blocate: [] };
  const rele = l.filter(function (r) { return rea(r.stare); });
  const bune = l.filter(function (r) { return r.stare === 'livrat' || r.stare === 'deschis'; });
  const blocate = laNoi ? rele.filter(function (r) { return r.stare === 'blocat'; }).map(function (r) { return r.catre; }) : [];
  if (rele.length) {
    if (!laNoi) return { fel: 'rau', text: textPentruClient(rele[0]), blocate: [] };
    const t = rele.map(textPentruNoi).join('; ');
    const ce = ceFacem(rele[0]);
    return { fel: 'rau', text: t + (ce ? '. ' + ce : ''), blocate: blocate };
  }
  if (bune.length === l.length) {
    if (!laNoi) return { fel: 'ok', text: textPentruClient(bune[0]), blocate: [] };
    return { fel: 'ok', text: l.length === 1 ? textPentruNoi(bune[0]) : 'livrat la toate cele ' + l.length + ' adrese', blocate: [] };
  }
  if (!laNoi) return { fel: 'asteapta', text: '', blocate: [] };
  const neclar = l.filter(function (r) { return !(r.stare === 'livrat' || r.stare === 'deschis'); });
  return { fel: 'asteapta', text: textPentruNoi(neclar[0]), blocate: [] };
}

// Anunțul nostru pentru emailurile care n-au ajuns (fără conținutul lor).
function anunt(randuri) {
  const l = (Array.isArray(randuri) ? randuri : []).filter(function (r) { return r && rea(r.stare); });
  if (!l.length) return null;
  const titlu = l.length === 1 ? 'Un email n-a ajuns la destinatar' : l.length + ' emailuri n-au ajuns la destinatar';
  const body = l.slice(0, 3).map(function (r) { return (r.unde ? r.unde + ': ' : '') + textPentruNoi(r); }).join(' · ') +
    (l.length > 3 ? ' · și încă ' + (l.length - 3) : '') + '. ' + ceFacem(l[0], true);
  return { titlu: titlu, body: body };
}

module.exports = { ORE_URMARIRE, PAUZA_VERIFICARE_MIN, stareEveniment, stareDinEvenimente, finala, rea, deVerificat,
  textPentruNoi, ceFacem, textPentruClient, rezumat, anunt };
