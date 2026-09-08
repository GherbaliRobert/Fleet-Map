// anaf_firme.js — datele unei firme, luate de la ANAF după CUI.
//
// ANAF are un serviciu public, gratuit și FĂRĂ parolă sau certificat (altul decât cel de e-Factura /
// e-Transport din `anaf.js`, care cer autentificare). Îi dai CUI-ul, îți întoarce denumirea exactă,
// sediul, numărul de la Registrul Comerțului și dacă firma e plătitoare de TVA.
//
// De ce merită: partea juridică a contractului se scria de mână. Un CUI tastat greșit sau o denumire
// scrisă „după ureche" înseamnă un contract cu altă firmă decât cea reală. Aici nu mai e loc de asta.
//
// Împărțirea din fișier e intenționată: `mapeaza()` e CURATĂ (primește răspunsul, întoarce câmpurile
// noastre) și se probează fără rețea; `cautaFirma()` e doar cererea în sine.

const URL_ANAF = process.env.ANAF_TVA_URL || 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

// „RO 12345678", „ro12345678", „12345678" → „12345678". ANAF vrea doar cifrele.
function curataCui(cui) {
  const doarCifre = String(cui == null ? '' : cui).replace(/[^0-9]/g, '');
  return doarCifre || null;
}

// Adresa vine în mai multe câmpuri, după versiune și după tipul firmei (sediu social vs. domiciliu
// fiscal). Le luăm în ordinea în care sunt de încredere și curățăm spațiile duble.
function _adresa(g, adr) {
  const candidati = [
    g.adresa,
    adr && adr.sdenumire_Strada && _dinBucati(adr, 's'),
    adr && adr.ddenumire_Strada && _dinBucati(adr, 'd')
  ];
  for (const c of candidati) {
    const t = String(c || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return null;
}
function _dinBucati(a, p) {
  const buc = [a[p + 'denumire_Strada'], a[p + 'numar_Strada'] && ('nr. ' + a[p + 'numar_Strada']),
    a[p + 'detalii_Adresa'], a[p + 'denumire_Localitate'], a[p + 'denumire_Judet'], a[p + 'cod_Postal']];
  return buc.filter(Boolean).join(', ');
}

// Răspunsul ANAF → câmpurile noastre de companie. Întoarce null dacă firma nu e găsită.
// Nu aruncă niciodată: un serviciu public care își schimbă forma nu are voie să pice ecranul.
function mapeaza(raspuns) {
  if (!raspuns || typeof raspuns !== 'object') return null;
  const gasite = Array.isArray(raspuns.found) ? raspuns.found : [];
  if (!gasite.length) return null;
  const f = gasite[0] || {};
  const g = f.date_generale || {};
  const tva = f.inregistrare_scop_Tva || {};
  const inactiv = f.stare_inactiv || {};
  const nume = String(g.denumire || '').trim();
  if (!nume) return null;
  return {
    name: nume,
    cui: g.cui != null ? String(g.cui) : null,
    reg_com: String(g.nrRegCom || '').trim() || null,
    address: _adresa(g, f.adresa_sediu_social || f.adresa_domiciliu_fiscal),
    phone: String(g.telefon || '').trim() || null,
    vat_payer: tva.scpTVA === true,
    // Steagurile astea nu se scriu automat nicăieri — se ARATĂ omului. O firmă radiată sau
    // declarată inactivă e exact lucrul pe care vrei să-l vezi ÎNAINTE să semnezi cu ea.
    stare: String(g.stare_inregistrare || '').trim() || null,
    inactiva: inactiv.statusInactivi === true,
    radiata: /RADIERE|RADIAT/i.test(String(g.stare_inregistrare || ''))
  };
}

// Cererea propriu-zisă. Întoarce { ok, firma } sau { ok:false, error }.
// ⚠ Nu se poate proba din cutia de dezvoltare (rețeaua către ANAF e închisă acolo) — de asta tot ce
// se poate greși stă în `mapeaza`, care SE probează.
async function cautaFirma(cui, optiuni) {
  const c = curataCui(cui);
  if (!c) return { ok: false, error: 'CUI invalid' };
  const azi = new Date().toISOString().slice(0, 10);
  const ctrl = new AbortController();
  const stop = setTimeout(function () { ctrl.abort(); }, (optiuni && optiuni.timeoutMs) || 8000);
  try {
    const r = await fetch(URL_ANAF, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ cui: Number(c), data: azi }]),
      signal: ctrl.signal
    });
    if (!r.ok) return { ok: false, error: 'ANAF a răspuns cu ' + r.status };
    const j = await r.json().catch(function () { return null; });
    const firma = mapeaza(j);
    if (!firma) return { ok: false, error: 'CUI-ul nu a fost găsit la ANAF' };
    return { ok: true, firma: firma };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'ANAF nu a răspuns la timp' : 'Nu am putut ajunge la ANAF' };
  } finally { clearTimeout(stop); }
}

module.exports = { URL_ANAF, curataCui, mapeaza, cautaFirma };
