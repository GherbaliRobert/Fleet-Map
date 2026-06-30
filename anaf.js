// anaf.js — client real ANAF e-Transport (API v2). DORMANT până când e setat tokenul OAuth.
//
// CE FACE: emitere UIT (upload declarație → poll stareMesaj → descărcare → extrage UIT) + raportare poziții.
// Fluxul (upload → stareMesaj → descarcare) e cel DOCUMENTAT de ANAF. Numele exacte ale câmpurilor declarației
// trebuie VALIDATE pe mediul de TEST ANAF (schema XSD ANAF e-Transport v2) — de aceea pornim implicit pe TEST.
//
// CONFIG (env):
//   ANAF_ETRANSPORT_TOKEN — token OAuth (obținut din SPV cu certificat digital; ~90 zile). FĂRĂ el → dormant.
//   ANAF_CIF              — CIF-ul companiei declarante (fără „RO").
//   ANAF_ETRANSPORT_TEST  — 'true' (implicit) = mediul de test ANAF; 'false' = producție (după validare).

function base(test) { return test ? 'https://api.anaf.ro/test/ETRANSPORT/ws/v1' : 'https://api.anaf.ro/prod/ETRANSPORT/ws/v1'; }
function cfg() {
  return {
    token: process.env.ANAF_ETRANSPORT_TOKEN || null,
    cif: (process.env.ANAF_CIF || '').replace(/^RO/i, '').trim() || null,
    test: String(process.env.ANAF_ETRANSPORT_TEST || 'true') === 'true',
  };
}
function enabled() { return !!cfg().token; }
function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function _req(method, path, token, body, test) {
  const headers = { Authorization: 'Bearer ' + token };
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(base(test) + path, { method, headers, body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* poate fi XML */ }
  return { ok: res.ok, status: res.status, json, text };
}

function _today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Construiește o declarație e-Transport v2 din datele transportului + (opțional) detaliile mărfii din formular (`decl`).
// SCHEMĂ DE VALIDAT pe mediul de test ANAF — numele câmpurilor urmează specificația publică, dar pot necesita ajustări.
function buildDeclaration(cif, t, decl) {
  decl = decl || {};
  const bunuri = (Array.isArray(decl.bunuri) && decl.bunuri.length) ? decl.bunuri : [{
    codScopOperatiune: decl.codScop || '9999',
    codTarifar: decl.codTarifar || '',
    denumireMarfa: decl.marfa || (t && t.note) || 'Marfă',
    cantitate: Number(decl.cantitate) || 1,
    codUnitateMasura: decl.um || 'KGM',
    greutateNeta: Number(decl.greutateNeta || decl.greutate) || 0,
    greutateBruta: Number(decl.greutate) || 0,
    valoareLeiFaraTva: Number(decl.valoare) || 0,
  }];
  return {
    codDeclarant: Number(cif),
    codTipOperatiune: decl.codTipOperatiune || '30', // 30 = transport pe teritoriul național (implicit)
    notificare: {
      codTipOperatiune: decl.codTipOperatiune || '30',
      cifExpeditor: Number(cif),
      denumireExpeditor: decl.expeditor || '',
      bunuriTransportate: bunuri,
      dateTransport: {
        nrVehicul: String((t && t.plate) || decl.nrVehicul || '').replace(/\s/g, '').toUpperCase(),
        nrRemorca1: (decl.nrRemorca || '').replace(/\s/g, '').toUpperCase(),
        codTaraOrgTransport: decl.codTaraTransport || 'RO',
        denumireOrgTransport: decl.org || decl.expeditor || '',
        dataTransport: decl.dataTransport || _today(),
      },
      locStartTraseuRutier: decl.locStart || { codJudet: decl.judetStart || '', denumireLocalitate: decl.localStart || '', denumireStrada: decl.adresaStart || '' },
      locFinalTraseuRutier: decl.locFinal || { codJudet: decl.judetFinal || '', denumireLocalitate: decl.localFinal || '', denumireStrada: decl.adresaFinal || '' },
    },
  };
}

// Emite UIT pentru un transport. t = rândul etransport (are .plate/.imei/.note). decl = detalii marfă/rută din formular.
async function emitUIT(t, decl) {
  const c = cfg();
  if (!c.token) throw new Error('Token ANAF nesetat (setează ANAF_ETRANSPORT_TOKEN).');
  const cif = ((decl && decl.cif) || c.cif || '').toString().replace(/^RO/i, '').trim();
  if (!cif) throw new Error('CIF declarant nesetat (ANAF_CIF sau în formular).');
  const declaration = buildDeclaration(cif, t, decl);

  const up = await _req('POST', '/upload/ETRANSP/' + cif + '/2', c.token, declaration, c.test);
  if (!up.ok) throw new Error('ANAF upload ' + up.status + ': ' + (up.text || '').slice(0, 220));
  const j = up.json || {};
  if (j.Errors || j.errors || (j.ExecutionStatus != null && j.ExecutionStatus !== 0)) {
    throw new Error('ANAF a respins declarația: ' + JSON.stringify(j.Errors || j.errors || j.Messages || j).slice(0, 300));
  }
  const index = j.index_incarcare || j.indexIncarcare || j.index;
  if (!index) throw new Error('ANAF: lipsește index_incarcare. Răspuns: ' + (up.text || '').slice(0, 220));

  // Poll stare (UIT-ul apare după prelucrare). Max ~6 × 5s.
  for (let i = 0; i < 6; i++) {
    await _sleep(5000);
    const st = await _req('GET', '/stareMesaj/' + index, c.token, null, c.test);
    const stare = st.json && (st.json.stare || st.json.Stare || st.json.status);
    const idDl = st.json && (st.json.id_descarcare || st.json.idDescarcare);
    if (stare && /^ok$/i.test(stare) && idDl) {
      const dl = await _req('GET', '/descarcare/' + idDl, c.token, null, c.test);
      return { uit: extractUIT(dl.json || dl.text), index, idDescarcare: idDl, raw: dl.json || null };
    }
    if (stare && /eroare|erori|nok|invalid/i.test(stare)) {
      let detail = '';
      if (idDl) { const dl = await _req('GET', '/descarcare/' + idDl, c.token, null, c.test); detail = (dl.text || '').slice(0, 220); }
      throw new Error('ANAF stare „' + stare + '" ' + detail);
    }
  }
  return { uit: null, index, pending: true }; // încă în prelucrare — reverifică mai târziu cu index-ul
}

function extractUIT(r) {
  if (!r) return null;
  if (typeof r === 'object') return r.UIT || r.uit || (r.notificare && (r.notificare.UIT || r.notificare.uit)) || null;
  const m = /UIT["'>\s:]+\s*([0-9A-Z]{8,})/i.exec(String(r));
  return m ? m[1] : null;
}

// Raportează o poziție GPS pentru un transport activ (UIT). Best-effort.
async function sendPosition(uit, lat, lng) {
  const c = cfg();
  if (!c.token || !uit) return false;
  try {
    const body = { uit: String(uit), dataReferinta: new Date().toISOString(), latitudine: lat, longitudine: lng };
    const r = await _req('POST', '/uploadPozitie', c.token, body, c.test);
    return !!r.ok;
  } catch (e) { return false; }
}

module.exports = { enabled, cfg, emitUIT, sendPosition, buildDeclaration, extractUIT };
