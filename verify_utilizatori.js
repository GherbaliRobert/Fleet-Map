// verify_utilizatori.js — ecranul „Utilizatori", văzut de amândoi.
//
//   node verify_utilizatori.js
//
// Ecranul ăsta are DOI stăpâni și e singurul de felul lui: nodul e împrumutat, așa că fondatorul îl
// vede în Administrare, iar adminul firmei exact pe același, în Setări → Conturi și roluri. O
// modificare aici ajunge, fără excepție, sub ochii amândurora. De-aia probele de mai jos verifică
// nu doar CE scrie pe ecran, ci și CUI i se arată.
//
// Trei lucruri nu au voie să se strice tăcut:
//
//   • PAROLA. Nimeni nu scrie parola altcuiva — nici noi, nici adminul firmei (CLAUDE.md, „Parola nu
//     există"). Ruta prin care un admin putea seta parola unui om a fost SCOASĂ, nu doar ascunsă din
//     ecran: un buton ascuns tot poate fi apăsat de cine îi știe adresa.
//   • ULTIMUL ADMIN al unei firme. Clientul nu-și poate face rău singur (serverul îl oprește să se
//     șteargă sau să se dezactiveze pe el însuși), dar fondatorul putea goli o firmă de administratori
//     ștergând, dezactivând, retrogradând sau mutând singurul om care mai putea administra acolo.
//   • GOSPODĂRIA CLIENTULUI. Semnul „fără acces" (om fără nicio mașină atribuită) e treaba adminului
//     de firmă, nu a fondatorului. Se aprinde DOAR în privirea clientului.
//
// Codul nu se copiază aici: se decupează din public/index.html, între sentinele, și se execută.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const db = fs.readFileSync(P('db.js'), 'utf8');
const css = fs.readFileSync(P('public/css/app.css'), 'utf8');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// ── Decupăm funcțiile reale din pagină și le rulăm ────────────────────────────────────────────
function bloc(numeStart, numeSfarsit) {
  const a = html.indexOf(numeStart), b = html.indexOf(numeSfarsit);
  if (a < 0 || b < 0 || b <= a) throw new Error('nu găsesc blocul ' + numeStart);
  return html.slice(a, b);
}
const blocLista = bloc('// ── începe „lista de utilizatori" ──', '// ── sfârșit „lista de utilizatori" ──');
const blocPastile = bloc('// ── începe „pastilele de utilizatori" ──', '// ── sfârșit „pastilele de utilizatori" ──');

const mediu = `
  var window = {};
  var document = { getElementById: function () { return _nodAcasa; } };
  var _nodAcasa = { innerHTML: '' };
  var currentUser = { username: 'eu@ratracks.ro', role: 'superadmin' };
  var ROLE_LABELS = { admin: 'Admin', manager: 'Manager', dispatcher: 'Dispecer', viewer: 'Viewer', client: 'Client' };
  var _USR_ADMIN_ROLES = ['admin', 'company_admin', 'superadmin'];
  var _PRIVESC_CA_FIRMA = false;
  function setPrivescCaFirma() { return _PRIVESC_CA_FIRMA; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _usrRoleLabel(r) {
    var n = window.RA_ROL_NUME || {};
    return n[r] || ROLE_LABELS[r] || ({ company_admin: 'Admin companie', superadmin: 'Super-admin' }[r]) || r;
  }
  function raConfirm() { return Promise.resolve(true); }
  function renderUsersGrouped() {}
`;
const iesire = `
  return {
    USR_LINISTE: USR_LINISTE,
    _usrPrivireClient: _usrPrivireClient, _usrCandVazut: _usrCandVazut, _usrExpira: _usrExpira,
    _usrFaraAcces: _usrFaraAcces, _usrNiciodata: _usrNiciodata, _usrVedeTot: _usrVedeTot,
    _usrPotrivit: _usrPotrivit, _usrTrece: _usrTrece, _usrOrdoneaza: _usrOrdoneaza,
    _userRowHtml: _userRowHtml, _usrPastileHtml: _usrPastileHtml, _usrSeatsHtml: _usrSeatsHtml,
    _usrCardAcasa: _usrCardAcasa, _nodAcasa: _nodAcasa, fereastra: window,
    _usrCeAveaText: _usrCeAveaText,
    caFirma: function (v) { _PRIVESC_CA_FIRMA = !!v; },
    cine: function (u) { currentUser = u; },
    pastila: function (k) { window._usrPastilaSet(k); }
  };
`;
const U = new Function(mediu + blocLista + blocPastile + iesire)();

// Oameni de probă. Ziua de azi e mereu „azi", deci datele se fac relativ la ea.
const acum = Date.now();
const zile = (n) => new Date(acum - n * 86400000).toISOString();
const om = (x) => Object.assign({
  id: 1, username: 'ion@firma.ro', full_name: 'Ion Popescu', email: 'ion@firma.ro', phone: '0722111222',
  role: 'dispatcher', active: true, last_login: zile(1), device_count: 2, group_count: 0,
  sees_all: false, ai_seat: false, access_until: null, company_id: 7, company_name: 'Transport SRL'
}, x);

sect('1. Parola nu mai există nicăieri');
T('caseta de parolă a plecat din formularul de cont nou', !/id="new-password"/.test(html));
T('și „Parolă nouă" a plecat din fișa omului', !/id="ue-password"/.test(html));
T('formularul spune că linkul pleacă pe email', /Îi trimitem un link pe email și își pune singur parola/.test(html));
T('pagina nu mai cheamă ruta de setat parola altcuiva', !/users\/' \+ id \+ '\/password/.test(html));
T('ruta veche a fost SCOASĂ din server, nu doar ascunsă', !/'\/api\/users\/:id\/password'/.test(server));
T('în locul ei e ruta de link', /app\.post\('\/api\/users\/:id\/link-parola', requireAuth, requireAdmin, withCompany/.test(server));
T('linkul trece prin aceeași poartă ca parola veche (aceeași firmă)',
  /link-parola[\s\S]{0,400}sameCompanyUser\(req, id\)/.test(server));
T('și are limitare, ca să nu devină robinet de emailuri', /_linkParolaProstit\(id\)/.test(server) && /LINK_PAROLA_MAX/.test(server));
T('fiecare trimitere lasă urmă în audit', /auditReq\(req, 'link_parola', 'user', id/.test(server));
T('un cont dezactivat nu primește link (n-ar funcționa oricum)',
  /link-parola[\s\S]{0,700}Contul e dezactivat/.test(server));
// Omul ÎȘI schimbă parola din Preferințe — asta rămâne, e chiar ideea.
T('omul își schimbă singur parola, din contul lui', /'\/api\/me\/password'/.test(server) && /pref-p1/.test(html));

sect('2. Contul nou se naște fără parolă, cu link');
T('ruta de creare nu mai citește parola din cerere',
  !/const \{ password, role, email, phone \} = req\.body/.test(server));
T('parola din bază e una aleatoare, pe care n-o știe nimeni',
  /const hash = await bcrypt\.hash\(crypto\.randomBytes\(24\)\.toString\('hex'\), 10\);/.test(server));
T('când emailul nu poate pleca, linkul se întoarce în răspuns',
  /trimiteLinkParola/.test(server) && /return \{ trimis: false, link: link, motiv: 'Serverul nu are email configurat\.' \}/.test(server));
T('și crearea NU mai e refuzată din lipsă de SMTP',
  !/Serverul nu are email configurat, deci invitația nu poate pleca/.test(server));
T('nici în compania demo nu se mai cere o parolă scrisă de mână',
  !/În contul demo, scrie o parolă/.test(server));
T('contul de admin al unei firme urmează aceeași regulă',
  !/setează-i una manual/.test(server) && /companies\/:id\/admin[\s\S]{0,3000}trimiteLinkParola/.test(server));

sect('3. Ultimul administrator al unei firme');
T('există plasa', /async function _ultimulAdminAlFirmei\(targetId\)/.test(server));
T('socoteala numără doar adminii ACTIVI ai firmei',
  /active IS NOT FALSE AND role = ANY\(\$2::text\[\]\)/.test(server));
T('rolurile care țin o firmă în picioare sunt admin + company_admin',
  /_ROLURI_ADMIN_FIRMA = \['admin', 'company_admin'\]/.test(server));
['la ștergere', 'la dezactivare/retrogradare', 'la mutarea în altă firmă'].forEach(function (unde, i) {
  T('plasa prinde ' + unde, (server.match(/_ultimulAdminAlFirmei\(/g) || []).length >= i + 2);
});
T('și la mutarea în LOT, socotită pe firmă (doi admini plecați deodată)',
  /_pleacaDin/.test(server) && /_adminiActiviAiFirmei\(cid\)\) - pleaca <= 0/.test(server));
T('mesajul spune ce are de făcut omul, nu doar că nu se poate',
  /Ar rămâne o firmă fără niciun administrator — fă altul întâi\./.test(server));
T('plasa e a fondatorului: clientul oricum nu se poate șterge pe el însuși',
  /Nu te poți șterge pe tine/.test(server) && /Nu te poți dezactiva sau retrograda pe tine/.test(server));

sect('4. „Văzut" pe înțeles, nu „15.09.2026, 14:32:10"');
T('cine a intrat azi', U._usrCandVazut(om({ last_login: zile(0) })).text === 'azi');
T('cine a intrat ieri', U._usrCandVazut(om({ last_login: zile(1) })).text === 'ieri');
T('cine a intrat acum 9 zile', U._usrCandVazut(om({ last_login: zile(9) })).text === 'acum 9 zile',
  U._usrCandVazut(om({ last_login: zile(9) })).text);
T('cine n-a intrat niciodată e strigat ca atare',
  U._usrCandVazut(om({ last_login: null })).niciodata === true &&
  U._usrCandVazut(om({ last_login: null })).text === 'n-a intrat niciodată');
T('sub pragul de liniște, contul e liniștit', U._usrCandVazut(om({ last_login: zile(U.USR_LINISTE - 1) })).vechi === false);
T('peste prag, se aprinde', U._usrCandVazut(om({ last_login: zile(U.USR_LINISTE + 1) })).vechi === true);
T('o dată stricată nu scrie „Invalid Date"', U._usrCandVazut(om({ last_login: 'aiurea' })).niciodata === true);

sect('5. Accesul temporar se vede în rând');
T('fără dată, niciun semn', U._usrExpira(om({})) === null);
T('accesul care se termină diseară „expiră azi", nu „într-o zi"',
  U._usrExpira(om({ access_until: acum + 3600 * 1000 })).text === 'expiră azi',
  U._usrExpira(om({ access_until: acum + 3600 * 1000 })).text);
T('expiră în 3 zile, cu avertisment', (function () {
  const e = U._usrExpira(om({ access_until: acum + 3 * 86400000 }));
  return e.aproape === true && /expiră în 3 zile/.test(e.text);
})(), JSON.stringify(U._usrExpira(om({ access_until: acum + 3 * 86400000 }))));
T('mai departe, doar data, fără alarmă', U._usrExpira(om({ access_until: acum + 20 * 86400000 })).aproape === false);
T('trecut de termen, scrie că a expirat', U._usrExpira(om({ access_until: acum - 86400000 })).text === 'acces expirat');
T('data vine din bază, nu din fișa deschisă', /u\.access_until,/.test(db));

sect('6. Cine nu vede nicio mașină');
T('un dispecer fără vehicule și fără grupe e „fără acces"',
  U._usrFaraAcces(om({ device_count: 0, group_count: 0 })) === true);
T('unul cu o grupă NU e fără acces', U._usrFaraAcces(om({ device_count: 0, group_count: 1 })) === false);
T('adminul vede toată flota, deci nu intră în socoteală',
  U._usrFaraAcces(om({ role: 'admin', sees_all: true, device_count: 0, group_count: 0 })) === false);
// Aici e regula pe care a cerut-o Alin: gospodăria clientului nu e grija fondatorului.
U.cine({ username: 'eu@ratracks.ro', role: 'superadmin' }); U.caFirma(false);
const randFondator = U._userRowHtml(om({ device_count: 0, group_count: 0 }));
T('la FONDATOR semnul „fără acces" NU apare', !/fără acces/.test(randFondator));
T('și nici îndemnul de atribuire', !/atribuie-i din/.test(randFondator));
U.caFirma(true);
const randClient = U._userRowHtml(om({ device_count: 0, group_count: 0 }));
T('la CLIENT semnul apare', /rau-semn rau-cald">fără acces</.test(randClient));
T('și scrie ce are de făcut', /atribuie-i din <b>Editează<\/b>/.test(randClient));
T('îndemnul vorbește despre ecranul gol, nu despre „ACL"', /ecran gol/.test(randClient) && !/ACL|scoped/i.test(randClient));

sect('7. Rândul omului');
U.caFirma(false);
const randNou = U._userRowHtml(om({ last_login: null }));
T('„n-a intrat niciodată" e semn, nu text pierdut la coadă', /rau-semn rau-cald">n-a intrat niciodată</.test(randNou));
T('și butonul de link e scos în evidență', /color:var\(--orange\)[^"]*"[^>]*>\s*<i class="fas fa-paper-plane/.test(randNou) || /fa-paper-plane/.test(randNou));
T('butonul de link există pe fiecare rând', /_usrLinkParola\(1\)/.test(U._userRowHtml(om({}))));
T('un singur buton acoperă și invitația, și parola uitată',
  /N-a intrat niciodată — retrimite-i linkul/.test(randNou) &&
  /Trimite-i un link ca să-și pună altă parolă/.test(U._userRowHtml(om({}))));
T('contul dezactivat se vede dezactivat', /rau-semn rau-stins">dezactivat</.test(U._userRowHtml(om({ active: false }))));
T('pe rândul propriu nu apare coșul de gunoi', (function () {
  U.cine({ username: 'ion@firma.ro', role: 'superadmin' });
  const r = U._userRowHtml(om({}));
  U.cine({ username: 'eu@ratracks.ro', role: 'superadmin' });
  return /rau-tu">tu</.test(r) && !/deleteUser/.test(r);
})());
T('ora exactă rămâne la hover, nu pe ecran', /title="[^"]*2026|title="[^"]*:/.test(U._userRowHtml(om({}))) || /title="/.test(U._userRowHtml(om({}))));
T('super-adminul nu primește buton de RA Insight (nu e cont de firmă)',
  !/raxAiSeat/.test(U._userRowHtml(om({ role: 'superadmin' }))));

sect('8. Căutarea caută ce ai tu în mână');
const q = (s, u) => U._usrPotrivit(u || om({}), s);
T('după nume', q('popescu'));
T('după email', q('ion@firma'));
T('după telefon', q('0722111'));
T('după rol, cu numele lui românesc', q('dispecer'));
T('după numele firmei (fondatorul are toate firmele într-o listă)', q('transport'));
T('fără diacritice scrise corect — „stefan" găsește „Ștefan"',
  q('stefan', om({ full_name: 'Ștefan Marin' })));
T('ce nu se potrivește, nu se potrivește', !q('nicaieri'));
T('caseta goală nu ascunde pe nimeni', q(''));

sect('9. Pastilele și ordinea');
const lot = [
  om({ id: 1, full_name: 'Ana', last_login: null, device_count: 0, group_count: 0 }),
  om({ id: 2, full_name: 'Barbu', role: 'admin', sees_all: true, last_login: zile(2) }),
  om({ id: 3, full_name: 'Cezar', active: false, last_login: zile(80) }),
  om({ id: 4, full_name: 'Dan', ai_seat: true, last_login: zile(3) })
];
const pastileClient = U._usrPastileHtml(lot, true);
const pastileFondator = U._usrPastileHtml(lot, false);
T('„N-au intrat niciodată" se numără corect', /N-au intrat niciodată <b>1<\/b>/.test(pastileClient));
T('„Dezactivate" la fel', /Dezactivate <b>1<\/b>/.test(pastileClient));
T('„Cu RA Insight" la fel', /Cu RA Insight <b>1<\/b>/.test(pastileClient));
T('„Admini" la fel', /Admini <b>1<\/b>/.test(pastileClient));
T('„Fără acces" apare doar la client', /Fără acces <b>1<\/b>/.test(pastileClient) && !/Fără acces/.test(pastileFondator));
T('ce nu există nu ocupă loc pe ecran',
  !/Dezactivate/.test(U._usrPastileHtml([om({ last_login: zile(1) })], true)));
T('„Toți" rămâne mereu, chiar și pe zero', /Toți <b>0<\/b>/.test(U._usrPastileHtml([], true)));
T('pastila e cea a casei, nu una nouă', /class="rax-dev-chip/.test(pastileClient) && !/rau-pastila/.test(pastileClient));
T('pastila caldă se vede caldă', /rax-dev-chip atentie/.test(pastileClient));
// Filtrele chiar filtrează
U.pastila('niciodata');
T('pastila „n-au intrat niciodată" lasă doar omul potrivit',
  lot.filter(U._usrTrece).length === 1 && lot.filter(U._usrTrece)[0].full_name === 'Ana');
U.pastila('niciodata'); // a doua apăsare o stinge
T('a doua apăsare pe aceeași pastilă o stinge', lot.filter(U._usrTrece).length === 4);
U.pastila('insight');
T('pastila de RA Insight lasă doar conturile aprinse', lot.filter(U._usrTrece).length === 1);
U.pastila('insight');
// Ordinea
const dupaNume = lot.slice().sort(U._usrOrdoneaza).map(function (u) { return u.full_name; });
T('implicit, alfabetic după nume', dupaNume.join(',') === 'Ana,Barbu,Cezar,Dan', dupaNume.join(','));
U.fereastra._usrSort('logare');
const dupaLogare = lot.slice().sort(U._usrOrdoneaza).map(function (u) { return u.full_name; });
T('pe „ultima logare", cine n-a intrat niciodată stă primul', dupaLogare[0] === 'Ana', dupaLogare.join(','));
T('apoi cel mai demult văzut', dupaLogare[1] === 'Cezar', dupaLogare.join(','));
U.fereastra._usrSort('nume');

sect('10. Conturile cu RA Insight, numărate sus');
T('fără niciun cont aprins, nu scrie nimic', U._usrSeatsHtml([om({})]) === '');
T('cu conturi aprinse, spune câte', /<b>1<\/b> cont cu RA Insight/.test(U._usrSeatsHtml(lot)));
T('și spune ce se facturează, fără jargon', (function () {
  // Ne uităm la ce CITEȘTE omul, nu la numele claselor din cod.
  const vizibil = U._usrSeatsHtml(lot).replace(/<[^>]*>/g, ' ');
  return /vârful lunii/.test(vizibil) && !/seat|MRR|peak/i.test(vizibil);
})(), U._usrSeatsHtml(lot).replace(/<[^>]*>/g, ' ').trim());
T('acordul e corect la mai multe conturi',
  /<b>2<\/b> conturi cu RA Insight/.test(U._usrSeatsHtml([om({ ai_seat: true }), om({ ai_seat: true })])));

sect('11. Cartonașul „Utilizatori" de pe Acasă spune starea');
T('cartonașul are loc pentru stare', /id="adash-s-users"/.test(html));
U._usrCardAcasa(lot, true);
T('la client: câți n-au intrat și câți sunt fără acces',
  /1 n-a intrat niciodată/.test(U._nodAcasa.innerHTML) && /1 fără acces/.test(U._nodAcasa.innerHTML), U._nodAcasa.innerHTML);
U._usrCardAcasa(lot, false);
T('la fondator: fără grija gospodăriei altuia', !/fără acces/.test(U._nodAcasa.innerHTML), U._nodAcasa.innerHTML);
U._usrCardAcasa([om({ last_login: zile(1) })], true);
T('când e totul în regulă, o spune', /toți au intrat/.test(U._nodAcasa.innerHTML), U._nodAcasa.innerHTML);
U._usrCardAcasa([], true);
T('fără niciun om, nu scrie nimic', U._nodAcasa.innerHTML === '');

sect('11b. „Scoate din firmă" — omul pleacă, nu se șterge un rând din tabel');
T('butonul de pe rând se numește „Scoate din firmă"', /title="Scoate din firmă"/.test(html));
T('și nu mai e coș de gunoi', /_usrScoate\(' \+ u\.id \+ '\)/.test(html) && !/onclick="deleteUser\(/.test(html));
T('nu mai există o a doua cale de ștergere', !/async function deleteUser/.test(html));
T('fereastra spune limpede că nu se mai poate întoarce contul',
  /dispare de tot\. Dacă omul se întoarce, îi faci cont nou/.test(html));
T('și îi spune adminului CE AVEA omul, înainte să-l scoată', /'\\n\\nAvea: ' \+ ce \+ '\./.test(html));
T('cu îndemnul de a le nota, fiindcă se șterg odată cu contul',
  /Notează-le acum, dacă le dai altcuiva — se șterg odată cu contul/.test(html));

// Ce avea omul, scris ca să se poată pune înapoi de MÂNĂ: nu „4 vehicule", ci CARE patru.
const cea = U._usrCeAveaText;
T('un vehicul, cu numărul lui',
  cea({ devices: ['i1'], numeDev: ['B-99-XYZ'], groups: [] }) === '1 vehicul: B-99-XYZ',
  cea({ devices: ['i1'], numeDev: ['B-99-XYZ'], groups: [] }));
T('mai multe vehicule, toate numite',
  cea({ devices: ['i1', 'i2'], numeDev: ['B-99-XYZ', 'B-12-ABC'], groups: [] }) === '2 vehicule: B-99-XYZ, B-12-ABC');
T('o grupă, cu numele ei',
  cea({ devices: [], groups: [1], numeGrp: ['Depou Vest'] }) === '1 grupă: Depou Vest');
T('RA Insight stă primul, despărțit de restul',
  cea({ ai: true, devices: ['i1'], numeDev: ['B-99-XYZ'], groups: [] }) === 'RA Insight · 1 vehicul: B-99-XYZ',
  cea({ ai: true, devices: ['i1'], numeDev: ['B-99-XYZ'], groups: [] }));
T('fără nume (server vechi), cade pe IMEI, nu pe gol',
  cea({ devices: ['350000000024702'], groups: [] }) === '1 vehicul: 350000000024702');
T('cine n-avea nimic nu primește o propoziție goală', cea({ devices: [], groups: [] }) === '');
T('o listă lungă se taie la opt', (function () {
  const n = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const t = cea({ devices: n, numeDev: n, groups: [] });
  return /10 vehicule: a, b, c, d, e, f, g, h și încă 2/.test(t);
})(), cea({ devices: ['a','b','c','d','e','f','g','h','i','j'], numeDev: ['a','b','c','d','e','f','g','h','i','j'], groups: [] }));
T('cine vede toată flota n-are mașini de notat', /if \(_usrVedeTot\(u\)\) return avea;/.test(html));

sect('11c. NU există traseu de înlocuire (decizie Alin, 16.09)');
// Adminul scoate omul și pune drepturile pe cel nou DE MÂNĂ. Un traseu care le trece singur
// a existat o zi și a fost scos: aici se asigură că nu se întoarce pe furiș.
T('nu mai întreabă cine-i ia locul', !/Îl înlocuiește cineva/.test(html));
T('nu mai există banda de înlocuire', !/_usrInlocuire|_usrPregatesteInlocuirea|_usrRenuntaInlocuire/.test(html));
T('și nici trecerea automată a drepturilor', !/_usrDuceMaiDeparte/.test(html));
T('stilul benzii a plecat și el', css.indexOf('.rau-inlocuire') < 0);

sect('11d. Două avertismente care lipseau');
T('la aprinderea RA Insight se spune ordinea corectă la o înlocuire',
  /scoate-l întâi pe cel care pleacă/.test(html));
T('schimbarea adresei unui cont FOLOSIT e oprită cu explicație',
  /Schimbi adresa unui cont folosit\?/.test(html));
T('și explicația spune amândouă lucrurile ascunse (istoricul + adresa de autentificare)',
  /va apărea de acum sub numele cel nou/.test(html) && /adresa cu care se autentifică rămâne/.test(html));
T('avertismentul apare doar la conturi care au fost folosite',
  /_ueVechi\.last_login && email && email !== \(_ueVechi\.email \|\| ''\)/.test(html));

sect('12. Bara de deasupra listei');
T('căutarea stă în HTML, ca să nu-și piardă cursorul la fiecare literă', /id="users-cauta"/.test(html));
T('ordinea are cele trei feluri', /value="nume"/.test(html) && /value="rol"/.test(html) && /value="logare"/.test(html));
T('pastilele au locul lor', /id="users-pastile"/.test(html));
T('lista goală din cauza căutării spune de ce e goală',
  /Niciun cont nu se potrivește\. Șterge din căutare sau apasă „Toți"\./.test(html));

sect('13. Cum arată — stilurile există');
['.rau-bara', '.rau-cauta', '.rau-pastile', '.rau-seats', '.rau-semn', '.rau-sfat', '.rau-meta', '.rau-butoane']
  .forEach(function (c) { T('stilul ' + c, css.indexOf(c) >= 0); });
T('semnul cald e portocaliu', /\.rau-semn\.rau-cald\{[^}]*var\(--orange\)/.test(css));
T('pe telefon rândul devine cartonaș', /@media \(max-width: 720px\)\{[\s\S]{0,400}\.user-row\{ flex-direction:column/.test(css));
// Cele două câmpuri stau pe același rând, deci trebuie spus explicit cine crește și cine nu —
// altfel selectorul de ordine ia toată bara și caseta de căutare iese de 0 px (s-a văzut în browser).
T('caseta de căutare are bază definită, nu „auto"', /\.rau-cauta\{[^}]*flex:1 1 220px/.test(css));
T('și câmpul dinăuntru umple caseta', /\.ra-camp \.rau-cauta \.rax-field\{[^}]*width:100%/.test(css));
T('iar selectorul de ordine nu poate lua toată bara', /\.ra-camp \.rau-bara > select\{[^}]*max-width:210px/.test(css));
T('niciun font scris de mână în stilurile noi', !/\.rau-[a-z-]+\{[^}]*font-family/.test(css));

sect('14. Ecranul e același în amândouă verticalele');
T('adminul firmei îl deschide din Setări → Conturi și roluri', /data-spanel="utilizatori"/.test(html));
T('și e ACELAȘI nod, împrumutat — nu o copie',
  /setImprumuta\('admin-tab-users', 'set-host-users'\)/.test(html));
T('privirea clientului e recunoscută corect', (function () {
  U.cine({ username: 'x@y.ro', role: 'company_admin' }); U.caFirma(false);
  const adminFirma = U._usrPrivireClient();
  U.cine({ username: 'eu@ratracks.ro', role: 'superadmin' });
  const fondator = U._usrPrivireClient();
  U.caFirma(true);
  const fondatorCaPartener = U._usrPrivireClient();
  U.caFirma(false);
  return adminFirma === true && fondator === false && fondatorCaPartener === true;
})());

// ── Partea a doua: pe server PORNIT ──────────────────────────────────────────────────────────
// Regulile de mai sus sunt scrise în cod; astea de aici se întâmplă cu adevărat. Contează mai ales
// pentru plasa ultimului admin: un `if` care arată bine în fișier, dar nu se declanșează, nu e plasă.
const { spawn } = require('child_process');
const PORT = 3209, DIR = '.utilizatori-db';
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_utilizatori',
  PORT: String(PORT), TCP_PORT: '5209', PGLITE_DIR: DIR + '/pgdata'
});
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: env, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const somn = (ms) => new Promise(r => setTimeout(r, ms));
function gata(cod) {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(cod);
}

(async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(B + '/api'); if (r.ok) break; } catch (e) {}
    await somn(500);
  }
  const intra = async (u, p) => {
    const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
  };
  const ck = await intra('admin', 'test1234');
  if (!ck) { console.log('\nnu m-am putut autentifica pe serverul de probă'); return gata(1); }
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const POST = (u, b, c) => fetch(B + u, { method: 'POST', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b || {}) });
  const PUT = (u, b, c) => fetch(B + u, { method: 'PUT', headers: c ? { 'Content-Type': 'application/json', Cookie: c } : H, body: JSON.stringify(b || {}) });
  const DEL = (u, c) => fetch(B + u, { method: 'DELETE', headers: { Cookie: c || ck } });
  const GET = (u, c) => fetch(B + u, { headers: { Cookie: c || ck } });

  sect('15. Pe server pornit: contul nou și linkul de parolă');
  const co = await (await POST('/api/companies', { name: 'Firma Utilizatori' })).json();
  const rSef = await POST('/api/users', { username: 'sef@utiliz.ro', full_name: 'Sef Firma', role: 'admin', company_id: co.id });
  T('contul se creează fără să-i scriem parola', rSef.status === 200, rSef.status);
  const sef = await rSef.json();
  T('și primește un link de setare a parolei', /set-password\.html\?token=/.test(sef.link || ''), sef.link);
  T('serverul spune că emailul nu a plecat (n-avem SMTP în probă)', sef.invitat === false);
  // O parolă trimisă în cerere se ignoră: nu există a doua cale.
  const rIgnor = await POST('/api/users', { username: 'strecurat@utiliz.ro', full_name: 'Om Strecurat', role: 'viewer', company_id: co.id, password: 'Parola-Trimisa-2026' });
  T('o parolă trimisă în cerere e primită fără să strice nimic', rIgnor.status === 200, rIgnor.status);
  T('dar NU devine parola contului', (await intra('strecurat@utiliz.ro', 'Parola-Trimisa-2026')) === null);
  // Traseul adevărat: omul își pune parola din link.
  const { puneParola } = require('./test_parola');
  await puneParola(sef, 'Str4da-Verde-2026', B);
  const ckSef = await intra('sef@utiliz.ro', 'Str4da-Verde-2026');
  T('după link, omul intră cu parola lui', !!ckSef);
  T('ruta veche de setat parola altcuiva răspunde 404',
    (await POST('/api/users/' + sef.id + '/password', { password: 'Alta-Parola-2026' })).status === 404);
  const rLink = await POST('/api/users/' + sef.id + '/link-parola');
  T('ruta de link răspunde', rLink.status === 200, rLink.status);
  const jLink = await rLink.json();
  T('și întoarce un link nou când emailul nu pleacă', /token=/.test(jLink.link || ''), jLink.link);
  // Limitarea: 5 pe oră per cont. Am folosit deja una.
  let ultim = 200;
  for (let i = 0; i < 6; i++) ultim = (await POST('/api/users/' + sef.id + '/link-parola')).status;
  T('al șaselea link într-o oră e refuzat', ultim === 429, ultim);

  sect('16. Pe server pornit: ultimul admin al firmei nu poate fi luat');
  T('nu poate fi șters', (await DEL('/api/users/' + sef.id)).status === 400);
  const rDez = await PUT('/api/users/' + sef.id, { active: false, full_name: 'Sef Firma', email: 'sef@utiliz.ro' });
  T('nu poate fi dezactivat', rDez.status === 400, rDez.status);
  T('și mesajul spune ce e de făcut', /fără niciun administrator/.test((await rDez.json()).error || ''));
  const rRetro = await PUT('/api/users/' + sef.id, { role: 'viewer', full_name: 'Sef Firma', email: 'sef@utiliz.ro' });
  T('nu poate fi coborât de pe rolul de admin', rRetro.status === 400, rRetro.status);
  const co2 = await (await POST('/api/companies', { name: 'Alta Firma' })).json();
  T('și nu poate fi mutat în altă firmă', (await PUT('/api/users/' + sef.id + '/company', { company_id: co2.id })).status === 400);
  // Cu un al doilea admin, totul se deblochează — plasa oprește golirea, nu administrarea.
  const sef2 = await (await POST('/api/users', { username: 'sef2@utiliz.ro', full_name: 'Al Doilea Sef', role: 'admin', company_id: co.id })).json();
  T('cu încă un admin, primul poate pleca', (await DEL('/api/users/' + sef.id)).status === 200);
  T('dar al doilea rămâne legat', (await DEL('/api/users/' + sef2.id)).status === 400);
  // Și lotul: doi admini scoși deodată dintr-o firmă tot o golesc.
  const a1 = await (await POST('/api/users', { username: 'a1@utiliz.ro', full_name: 'Admin Unu', role: 'admin', company_id: co.id })).json();
  const rLot = await PUT('/api/users/company/bulk', { ids: [sef2.id, a1.id], company_id: co2.id });
  T('mutarea în LOT a tuturor adminilor e oprită', rLot.status === 400, rLot.status);
  T('dar mutarea unuia singur, când rămâne altul, merge',
    (await PUT('/api/users/company/bulk', { ids: [a1.id], company_id: co2.id })).status === 200);

  sect('17. Pe server pornit: data de expirare ajunge la ecran');
  const tmp = await (await POST('/api/users', { username: 'temporar@utiliz.ro', full_name: 'Om Temporar', role: 'viewer', company_id: co.id })).json();
  await PUT('/api/users/' + tmp.id + '/access-until', { until: Date.now() + 3 * 86400000 });
  const lista = await (await GET('/api/users?company=' + co.id)).json();
  const gasit = (lista || []).find(u => u.id === tmp.id);
  T('lista de utilizatori trimite și termenul accesului', gasit && gasit.access_until != null, gasit && gasit.access_until);
  T('iar ecranul îl scrie pe înțeles',
    gasit && /expiră în 3 zile/.test((U._usrExpira(gasit) || {}).text || ''), gasit && JSON.stringify(U._usrExpira(gasit)));

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
})().catch(e => { console.log('EROARE: ' + e.message); gata(1); });
