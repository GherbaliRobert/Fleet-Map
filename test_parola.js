// test_parola.js — ajutor pentru probe: pune parola unui cont nou-creat, pe traseul REAL.
//
// De ce există: conturile nu se mai nasc cu parolă (vezi CLAUDE.md, „Parola nu există"). Serverul
// face un link cu termen, iar omul își pune parola singur. Probele au nevoie de conturi pe care se
// pot autentifica, așa că trec prin exact același traseu ca un om adevărat — și, în treacăt, îl și
// verifică: dacă linkul de invitație s-ar strica, ar pica tot ce se sprijină pe el, nu doar o probă.
//
//   const { puneParola } = require('./test_parola');
//   const creat = await POST('/api/users', { username: 'x@y.ro', full_name: 'X', role: 'admin', company_id: co.id });
//   await puneParola(creat, 'Str4da-Verde-2026', B);   // B = adresa serverului probei
const BASE_IMPLICIT = process.env.TEST_BASE || 'http://localhost:3000';

// Primește ce a întors ruta de creare, în oricare din formele folosite prin probe: un `Response`,
// un `{ status, data }` sau chiar obiectul contului. Fiecare probă își pornește serverul pe portul
// ei, deci baza se dă din afară; fără ea, cea implicită.
async function puneParola(creat, parola, baza) {
  const BASE = baza || BASE_IMPLICIT;
  if (creat && typeof creat.json === 'function') creat = await creat.json();
  if (creat && creat.data && creat.data.id !== undefined) creat = creat.data;
  if (!creat || !creat.link) {
    throw new Error('Contul nou n-a întors link de parolă (fără SMTP, serverul TREBUIE să-l întoarcă): ' + JSON.stringify(creat));
  }
  const token = String(creat.link).split('token=')[1];
  if (!token) throw new Error('Link fără token: ' + creat.link);
  const r = await fetch(BASE + '/api/auth/set-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, password: parola })
  });
  if (!r.ok) throw new Error('set-password a picat (' + r.status + '): ' + await r.text());
  return creat;
}

module.exports = { puneParola };
