// gdpr.js — cele două drepturi pe care legea le dă persoanei ale cărei date le ținem:
// să afle CE avem despre ea, și să ceară ȘTERGEREA.
//
// De ce e nevoie de asta: urmărim poziția unor persoane fizice — șoferii. Sunt date personale, iar
// noi suntem împuternicitul, clientul e operatorul. Practic, clientul trebuie să poată scoate tot ce
// ținem despre flota lui și să ceară ștergerea completă. Fără cale pregătită, prima cerere formală
// (sau prima sesizare) ne găsește descoperiți.
//
// ─── Decizia de proiectare care contează ────────────────────────────────────────────────────────
// Tabelele NU sunt scrise aici într-o listă. Se descoperă la rulare, din catalogul bazei, și pentru
// fiecare se caută cum se leagă de o companie. Motivul: schema crește prin ALTER TABLE, iar o listă
// scrisă de mână rămâne tăcut în urmă. La o obligație legală, „credeam că am șters" e cea mai urâtă
// cădere cu putință — mai rea decât o eroare, pentru că nu se vede.
//
// Ce NU poate fi legat de o companie e RAPORTAT explicit, nu ignorat: preferăm să spunem „tabela
// asta n-a putut fi atribuită" decât să lăsăm impresia unei acoperiri totale.

// Coloane care nu ies NICIODATĂ dintr-un export: nu sunt datele persoanei, sunt cheile casei.
const COLOANE_INTERZISE = new Set([
  'password_hash', 'reset_token', 'reset_expires',
  'key_hash', 'secret', 'token', 'token_hash', 'api_key',
  'stripe_customer_id', 'stripe_subscription_id',
  'raw_b64',            // fișierele de tahograf: uriașe, se cer separat
  'p256dh', 'auth',     // cheile de criptare ale notificărilor din browser
]);

// Tabele care nu conțin date ale clientului — sunt ale platformei.
const TABELE_PLATFORMA = new Set([
  'platform_costs', 'costs_payments', 'invoice_counters',
  'fuel_price_history', 'demo_requests', 'error_log', 'settings',
]);

// Câte rânduri exportăm cel mult dintr-o tabelă. Pozițiile brute pot fi sute de milioane; ele se iau
// separat, pe vehicul, prin exportul de traseu care există deja. Aici dăm în schimb numărul lor și
// intervalul acoperit — deci persoana AFLĂ ce ținem, chiar dacă nu primim tot într-un singur fișier.
const MAX_RANDURI = 50000;
const TABELE_DOAR_NUMARATE = new Set(['positions', 'positions_archive']);

async function _coloane(pool, tabela) {
  const r = await pool.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
    [tabela]
  );
  return r.rows.map((x) => x.column_name);
}

async function _tabele(pool) {
  const r = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  return r.rows.map((x) => x.table_name);
}

// Cum se leagă tabela asta de compania cerută? Ordinea contează: `company_id` e cea mai directă și
// cea mai sigură; restul sunt legături prin vehicul, utilizator sau șofer.
function _legatura(coloane) {
  if (coloane.includes('company_id')) return { fel: 'company_id', col: 'company_id' };
  if (coloane.includes('imei')) return { fel: 'imei', col: 'imei' };
  if (coloane.includes('user_id')) return { fel: 'user_id', col: 'user_id' };
  if (coloane.includes('driver_id')) return { fel: 'driver_id', col: 'driver_id' };
  if (coloane.includes('device_imei')) return { fel: 'imei', col: 'device_imei' };
  return null;
}

// Cheile de care avem nevoie ca să legăm tabelele care nu au company_id.
async function _cheiCompanie(pool, companyId) {
  const q = async (sql) => {
    try { const r = await pool.query(sql, [companyId]); return r.rows.map((x) => Object.values(x)[0]); }
    catch (e) { return []; }
  };
  return {
    imeis: await q('SELECT imei FROM devices WHERE company_id = $1'),
    userIds: await q('SELECT id FROM users WHERE company_id = $1'),
    driverIds: await q('SELECT id FROM drivers WHERE company_id = $1'),
  };
}

function _conditie(leg, chei) {
  if (leg.fel === 'company_id') return { unde: `${leg.col} = $1`, param: null };
  if (leg.fel === 'imei') return { unde: `${leg.col} = ANY($2::varchar[])`, param: chei.imeis };
  if (leg.fel === 'user_id') return { unde: `${leg.col} = ANY($2::int[])`, param: chei.userIds };
  if (leg.fel === 'driver_id') return { unde: `${leg.col} = ANY($2::int[])`, param: chei.driverIds };
  return null;
}

// ─── Dreptul de acces: ce ținem despre flota unei companii ────────────────────────────────────────
async function exportaCompanie(pool, companyId) {
  const chei = await _cheiCompanie(pool, companyId);
  const toate = await _tabele(pool);
  const date = {};
  const rezumat = [];
  const neatribuite = [];
  const trunchiate = [];

  for (const t of toate) {
    if (TABELE_PLATFORMA.has(t)) continue;
    const cols = await _coloane(pool, t);

    if (t === 'companies') {
      const r = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
      date.companies = r.rows.map((x) => _curata(x));
      rezumat.push({ tabela: t, randuri: r.rows.length });
      continue;
    }

    const leg = _legatura(cols);
    if (!leg) { neatribuite.push(t); continue; }
    const cond = _conditie(leg, chei);
    if (!cond) { neatribuite.push(t); continue; }
    const params = cond.param === null ? [companyId] : [companyId, cond.param];

    // Pozițiile: numărate și descrise, nu turnate într-un JSON de zeci de gigaocteți.
    if (TABELE_DOAR_NUMARATE.has(t)) {
      try {
        const r = await pool.query(
          `SELECT COUNT(*)::bigint AS n, MIN(timestamp) AS de_la, MAX(timestamp) AS pana_la FROM ${t} WHERE ${cond.unde}`,
          params
        );
        const row = r.rows[0] || {};
        rezumat.push({
          tabela: t, randuri: Number(row.n || 0), deLa: row.de_la || null, panaLa: row.pana_la || null,
          nota: 'Traseele brute se descarcă separat, pe vehicul, din exportul de traseu (CSV). Aici e doar câtă informație există.',
        });
      } catch (e) { neatribuite.push(t + ' (' + e.message + ')'); }
      continue;
    }

    try {
      const r = await pool.query(`SELECT * FROM ${t} WHERE ${cond.unde} LIMIT ${MAX_RANDURI + 1}`, params);
      const prea = r.rows.length > MAX_RANDURI;
      const randuri = prea ? r.rows.slice(0, MAX_RANDURI) : r.rows;
      if (randuri.length) date[t] = randuri.map((x) => _curata(x));
      rezumat.push({ tabela: t, randuri: randuri.length, legatPrin: leg.fel, trunchiat: prea || undefined });
      if (prea) trunchiate.push(t);
    } catch (e) {
      neatribuite.push(t + ' (' + e.message + ')');
    }
  }

  return {
    generatLa: new Date().toISOString(),
    companyId,
    date,
    rezumat,
    // Onestitatea raportului: spunem explicit ce n-am putut acoperi.
    tabeleNeatribuite: neatribuite,
    tabeleTrunchiate: trunchiate,
    coloaneExcluse: Array.from(COLOANE_INTERZISE),
    explicatie: 'Coloanele excluse sunt chei de acces și fișiere binare, nu date despre persoană. ' +
      'Tabelele neatribuite nu au putut fi legate de această companie prin niciunul dintre: company_id, imei, user_id, driver_id.',
  };
}

function _curata(rand) {
  const o = {};
  for (const k of Object.keys(rand)) if (!COLOANE_INTERZISE.has(k)) o[k] = rand[k];
  return o;
}

// ─── Dreptul la ștergere ──────────────────────────────────────────────────────────────────────────
// `uscat: true` NU șterge nimic — doar numără. Se rulează întâi, ca să se vadă exact ce dispare.
// Ștergerea propriu-zisă cere confirmarea numelui companiei, la nivelul rutei.
async function stergeCompanie(pool, companyId, { uscat = true } = {}) {
  const chei = await _cheiCompanie(pool, companyId);
  const toate = await _tabele(pool);
  const raport = [];
  const neatribuite = [];

  // Compania se șterge ULTIMA: până atunci, `_cheiCompanie` are nevoie de vehiculele și utilizatorii ei.
  for (const t of toate) {
    if (TABELE_PLATFORMA.has(t) || t === 'companies') continue;
    const cols = await _coloane(pool, t);
    const leg = _legatura(cols);
    if (!leg) { neatribuite.push(t); continue; }
    const cond = _conditie(leg, chei);
    if (!cond) { neatribuite.push(t); continue; }
    const params = cond.param === null ? [companyId] : [companyId, cond.param];

    try {
      if (uscat) {
        const r = await pool.query(`SELECT COUNT(*)::bigint AS n FROM ${t} WHERE ${cond.unde}`, params);
        raport.push({ tabela: t, randuri: Number(r.rows[0].n || 0), legatPrin: leg.fel });
      } else {
        const r = await pool.query(`DELETE FROM ${t} WHERE ${cond.unde}`, params);
        raport.push({ tabela: t, sterse: r.rowCount || 0, legatPrin: leg.fel });
      }
    } catch (e) {
      raport.push({ tabela: t, eroare: e.message });
    }
  }

  if (!uscat) {
    try { const r = await pool.query('DELETE FROM companies WHERE id = $1', [companyId]); raport.push({ tabela: 'companies', sterse: r.rowCount || 0 }); }
    catch (e) { raport.push({ tabela: 'companies', eroare: e.message }); }
  } else {
    raport.push({ tabela: 'companies', randuri: 1 });
  }

  return {
    companyId,
    simulare: uscat,
    raport,
    tabeleNeatribuite: neatribuite,
    total: raport.reduce((s, x) => s + (uscat ? (x.randuri || 0) : (x.sterse || 0)), 0),
  };
}

module.exports = { exportaCompanie, stergeCompanie, COLOANE_INTERZISE, TABELE_PLATFORMA };
