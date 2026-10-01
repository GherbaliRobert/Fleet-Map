// verify_telefon_lot5.js — telefonul 1.0.7 face ce face web-ul după lucrul lui Alin din 30.09 (lotul 5).
//
//   node verify_telefon_lot5.js
//
// Secțiunile se adaugă pe măsură ce intră bucățile lotului. Prima: statutul de TVA de la ANAF.
//
// 0. TVA de la ANAF (30.09). Pe web, „Client nou" și „Completează" salvează pe firmă dacă e plătitoare de TVA, așa cum
//    a răspuns ANAF (`vat_payer`). El hotărăște „RO" în fața CUI-ului pe factură și codul de TVA din e-Factura. Telefonul
//    arăta statutul, dar nu-l trimitea: firma făcută de pe telefon rămânea „plătitoare" (implicitul din bază), iar
//    factura unei firme neplătitoare pleca la ANAF cu cod de TVA. Regula de pe web: se trimite DOAR când a răspuns ANAF.
//
// Nu pornește niciun server și nu are nevoie de TypeScript: verifică sursa telefonului lângă cea a paginii.
const fs = require('fs');
const path = require('path');
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const html = citeste('public/index.html');
const server = citeste('server.js');
const db = citeste('db.js');

sect('0. TVA de la ANAF: telefonul îl salvează pe firmă, ca web-ul');
{
  const clientNou = citeste('mobile/src/screens/ClientNou.tsx');
  const pasi = citeste('mobile/src/components/ContractPasi.tsx');
  const endpoints = citeste('mobile/src/api/endpoints.ts');

  // Web — regula de la care pornim (dacă se schimbă pe web, proba pică și ne spune).
  T('web, „Client nou": trimite vat_payer DOAR când a răspuns ANAF',
    /\(s\.firma\.anaf && !s\.firma\.anaf\.eroare\) \? \{ vat_payer: !!s\.firma\.anaf\.vat_payer \} : \{\}/.test(html));
  T('web, „Completează": ține ce a răspuns ANAF (_dzTva) și îl trimite doar dacă e da/nu',
    /_dzTva = !!a\.vat_payer;/.test(html) && /if \(_dzTva === true \|\| _dzTva === false\) corp\.vat_payer = _dzTva;/.test(html));
  // Serverul primește câmpul pe amândouă căile (nu-l inventăm pe telefon).
  T('serverul primește vat_payer pe PUT /api/companies/:id (updateCompany) și pe /dosar',
    /if \(are\('vat_payer'\) && \(d\.vat_payer === true \|\| d\.vat_payer === false\)\) pune\('vat_payer=\?', d\.vat_payer\);/.test(db)
    && /if \(b\.vat_payer === true \|\| b\.vat_payer === false\) d\.vat_payer = b\.vat_payer;/.test(server));

  // Telefon — „Client nou".
  T('telefon, „Client nou": trimite vat_payer DOAR când a răspuns ANAF (aceeași condiție ca pe web)',
    /\.\.\.\(firma\.anaf && !firma\.anaf\.eroare \? \{ vat_payer: !!firma\.anaf\.vat_payer \} : \{\}\)/.test(clientNou));
  T('…și îl ia din răspunsul ANAF, cum îl arată pe ecran', /anaf: \{ vat_payer: !!j\.vat_payer, inactiva: !!j\.inactiva, radiata: !!j\.radiata \}/.test(clientNou)
    && /Preluat de la ANAF\{a\.vat_payer \? ' · plătitoare de TVA' : ' · neplătitoare de TVA'\}/.test(clientNou));

  // Telefon — „Completează" (fereastra din ContractPasi).
  const i = pasi.indexOf('function CompleteazaFirma('), completeaza = i >= 0 ? pasi.slice(i) : '';
  T('telefon, „Completează": ține ce a răspuns ANAF (null = n-am întrebat)',
    /const \[tva, setTva\] = useState<boolean \| null>\(null\);/.test(completeaza) && /setTva\(!!a\.vat_payer\);/.test(completeaza));
  T('…îl spune pe ecran, ca pe web („plătitoare" / „neplătitoare de TVA")',
    /'Preluat de la ANAF' \+ \(a\.vat_payer \? ' · plătitoare de TVA' : ' · neplătitoare de TVA'\)/.test(completeaza));
  T('…îl trimite doar dacă e da/nu, înainte de „n-ai schimbat nimic" (ANAF singur tot se poate salva)',
    /if \(tva === true \|\| tva === false\) corp\.vat_payer = tva;\n\s*if \(!Object\.keys\(corp\)\.length\)/.test(completeaza));
  T('…și nu-l pierde la închidere fără întrebare', /const schimbat = JSON\.stringify\(f\) !== JSON\.stringify\(start\) \|\| tva !== null;/.test(completeaza));
  T('tipul cererii /dosar are vat_payer', /completeazaDosar: \(companyId: number, b: \{[^\n]*vat_payer\?: boolean \}\) =>/.test(endpoints));
}

console.log('\n' + '─'.repeat(30));
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
