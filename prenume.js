'use strict';
// prenume.js — prenumele din salut („Salut, Alin!", „Bună dimineața, Alin!"). O SINGURĂ regulă, pe server: /api/me îl dă ca
// `prenume` (pagina și telefonul doar îl scriu), iar salutul asistentului nostru (azi_la_noi.salut) îl ia tot de aici.
//
// De ce nu „primul cuvânt din nume": mulți scriu numele ca în acte, cu numele de familie întâi („Tilvar Alin") — salutul spunea atunci
// „Salut, Tilvar!" (Alin, 05.11: „aș vrea să-i apară prenumele… și în asistentul fondatorilor"). Regula, în ordine:
//   1. cuvântul din nume care e un PRENUME ȘTIUT (lista de mai jos; „Tilvar Alin" → „Alin", „Popescu Ion" → „Ion"), primul dintre ele;
//   2. altfel primul cuvânt (un prenume pe care lista nu-l știe: „Jonas Weber"), dar nu un cuvânt de birou („Administrator",
//      „Dispecer Tura 2" — salutul rămâne atunci „Salut!");
//   3. fără nume (sau un nume care e o adresă de email): din adresa de email, doar dacă o bucată e un prenume știut
//      („alin.tilvar@ratrack.ro" → „Alin"); „office@…", „admin" → nimic, iar salutul e fără nume („Salut!").
// Un cuvânt scris numai cu MAJUSCULE sau numai cu litere mici („TILVAR ALIN", „alin") iese „Alin". Din email, prenumele se scrie cu
// diacriticele lui („ionut" → „Ionuț").

// Prenumele știute: românești (și cele luate din alte limbi, obișnuite la noi), plus maghiare și germane din România.
const LISTA = [
  // bărbați
  'Adi', 'Adrian', 'Alex', 'Alexandru', 'Alin', 'Alexe', 'Ady', 'Albert', 'Ambrozie', 'Anatol', 'Andi', 'Andrei', 'Andrian', 'Anton', 'Antonio', 'Aron',
  'Augustin', 'Aurel', 'Aurelian', 'Avram', 'Beniamin', 'Bogdan', 'Bujor', 'Călin', 'Carol', 'Cătălin', 'Cezar', 'Ciprian', 'Claudiu', 'Codrin', 'Codruț',
  'Constantin', 'Corneliu', 'Cornel', 'Cosmin', 'Costel', 'Costin', 'Cristi', 'Cristian', 'Cristinel', 'Dan', 'Daniel', 'Dănuț', 'Darius', 'David',
  'Decebal', 'Denis', 'Dinu', 'Dionisie', 'Dorian', 'Dorin', 'Dorel', 'Dragoș', 'Dumitru', 'Edi', 'Eduard', 'Emanuel', 'Emil', 'Eric', 'Erik', 'Eugen',
  'Fabian', 'Felix', 'Filip', 'Flavius', 'Florentin', 'Florian', 'Florin', 'Gabi', 'Gabriel', 'Gelu', 'George', 'Georgel', 'Georgian', 'Gheorghe',
  'Ghiță', 'Grigore', 'Haralambie', 'Horațiu', 'Horia', 'Iacob', 'Ianis', 'Ilie', 'Iliuță', 'Ioan', 'Ion', 'Ionel', 'Ionuț', 'Iosif', 'Iulian', 'Iulius',
  'Iustin', 'Jan', 'Justin', 'Kevin', 'Laurențiu', 'Lazăr', 'Leonard', 'Leontin', 'Liviu', 'Luca', 'Lucian', 'Marcel', 'Marian', 'Marin', 'Marius',
  'Matei', 'Mădălin', 'Mihai', 'Mihail', 'Mihăiță', 'Mihnea', 'Mircea', 'Mirel', 'Mitică', 'Narcis', 'Neculai', 'Nelu', 'Nicolae', 'Nicu', 'Nicușor',
  'Octavian', 'Ovidiu', 'Patrick', 'Paul', 'Petre', 'Petrică', 'Petru', 'Radu', 'Rafael', 'Rareș', 'Raul', 'Răzvan', 'Remus', 'Richard', 'Robert',
  'Romeo', 'Romică', 'Romulus', 'Sabin', 'Samuel', 'Sandu', 'Sebastian', 'Sergiu', 'Severin', 'Silviu', 'Sorin', 'Ștefan', 'Stelian', 'Tiberiu',
  'Titus', 'Toma', 'Traian', 'Tudor', 'Valentin', 'Valeriu', 'Vasile', 'Victor', 'Viorel', 'Virgil', 'Vlad', 'Vladimir', 'Vlăduț', 'Zaharia',
  // femei
  'Ada', 'Adela', 'Adelina', 'Adina', 'Adriana', 'Agnes', 'Alberta', 'Alexandra', 'Alina', 'Alisa', 'Amalia', 'Ana', 'Anamaria', 'Anca', 'Andra',
  'Andreea', 'Aneta', 'Angela', 'Anișoara', 'Antonia', 'Aurelia', 'Aurora', 'Beatrice', 'Bianca', 'Brândușa', 'Camelia', 'Carina', 'Carla', 'Carmen',
  'Cătălina', 'Cecilia', 'Celia', 'Claudia', 'Codruța', 'Constanța', 'Corina', 'Cornelia', 'Crina', 'Cristiana', 'Cristina', 'Dana', 'Daniela',
  'Delia', 'Denisa', 'Diana', 'Doina', 'Dorina', 'Ecaterina', 'Elena', 'Eliza', 'Elisabeta', 'Ema', 'Emilia', 'Eugenia', 'Eva', 'Felicia', 'Flavia',
  'Florentina', 'Florica', 'Florina', 'Gabriela', 'Georgeta', 'Georgiana', 'Gina', 'Ileana', 'Ilinca', 'Ioana', 'Ionela', 'Irina', 'Iulia', 'Iuliana',
  'Jana', 'Larisa', 'Laura', 'Lavinia', 'Lenuța', 'Liana', 'Lidia', 'Ligia', 'Liliana', 'Lucia', 'Luciana', 'Luminița', 'Mădălina',
  'Magdalena', 'Maria', 'Mariana', 'Marilena', 'Marina', 'Marioara', 'Melania', 'Mihaela', 'Mirela', 'Mioara', 'Monica', 'Nadia', 'Natalia', 'Nicoleta',
  'Oana', 'Olga', 'Otilia', 'Paula', 'Petronela', 'Raluca', 'Ramona', 'Rebeca', 'Roberta', 'Rodica', 'Roxana', 'Ruxandra', 'Sabina', 'Silvia', 'Simona',
  'Smaranda', 'Sofia', 'Sorina', 'Stela', 'Ștefania', 'Tamara', 'Tatiana', 'Teodora', 'Valentina', 'Valeria', 'Vasilica', 'Veronica', 'Victoria',
  'Violeta', 'Viorica', 'Voichița', 'Zina',
  // maghiare și germane, obișnuite în România
  'Árpád', 'Attila', 'Balázs', 'Csaba', 'Dénes', 'Ferenc', 'Gábor', 'Gyula', 'Imre', 'István', 'János', 'József', 'Károly', 'Lajos', 'László', 'Levente',
  'Miklós', 'Sándor', 'Szabolcs', 'Tamás', 'Tibor', 'Zoltán', 'Zsolt', 'Andrea', 'Edit', 'Enikő', 'Erika', 'Erzsébet', 'Gizella', 'Ildikó', 'Judit',
  'Katalin', 'Klára', 'Melinda', 'Noémi', 'Réka', 'Tünde', 'Zsuzsanna', 'Hans', 'Johann', 'Klaus', 'Werner', 'Helga', 'Ingrid', 'Ute',
  'Christian', 'Marco', 'Mario', 'Michael', 'Thomas', 'Peter', 'Maximilian', 'Leon',
];
// Cuvintele de birou cu care se numesc uneori conturile: nu sunt prenume (salutul rămâne fără nume).
const GENERICE = new Set(['admin', 'administrator', 'administrare', 'manager', 'dispecer', 'dispecerat', 'sofer', 'soferi', 'contabil', 'contabilitate',
  'director', 'office', 'birou', 'firma', 'cont', 'test', 'demo', 'user', 'utilizator', 'operator', 'client', 'suport', 'support', 'info', 'contact',
  'logistica', 'transport', 'depozit', 'sef', 'service', 'flota', 'echipa', 'vanzari', 'achizitii', 'secretariat', 'receptie']);
function fara(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').toLowerCase();
}
const STIUTE = new Map();
LISTA.forEach(function (p) { STIUTE.set(fara(p), p); });
// Un cuvânt e un prenume știut — întreg sau, cu cratimă („Ana-Maria", „Ioan-Alexandru"), după prima lui parte.
function estePrenume(w) {
  const k = fara(w);
  return STIUTE.has(k) || (k.indexOf('-') > 0 && STIUTE.has(k.split('-')[0]));
}
// „TILVAR" / „tilvar" → „Tilvar", „ana-maria" → „Ana-Maria"; scrierea amestecată rămâne cum a pus-o omul („DeLuca").
function scris(w) {
  const curat = String(w).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (curat.length > 1 && (curat === curat.toUpperCase() || curat === curat.toLowerCase()) && curat.toUpperCase() !== curat.toLowerCase()) {
    return curat.toLowerCase().replace(/(^|-)(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
  }
  return curat;
}
// fullName = numele din fișa omului; email = adresa lui de autentificare (users.username) sau emailul din fișă.
function prenumeDin(fullName, email) {
  const cuv = String(fullName || '').trim().split(/\s+/).filter(function (w) { return w && w.indexOf('@') < 0 && /\p{L}/u.test(w) && !/\d/.test(w); });
  for (const w of cuv) if (estePrenume(scris(w))) return scris(w);
  if (cuv.length && !GENERICE.has(fara(scris(cuv[0])))) return scris(cuv[0]);
  // Fără nume: din adresa de email (cea din „nume", dacă omul și-a scris acolo emailul, apoi cea de autentificare).
  const adrese = [String(fullName || '').trim(), String(email || '').trim()].filter(Boolean);
  for (const a of adrese) {
    const local = a.split('@')[0];
    for (const t of local.split(/[^\p{L}]+/u)) {
      if (t && STIUTE.has(fara(t))) return STIUTE.get(fara(t));   // (un cuvânt de birou nu e în listă: „office@" → nimic)
    }
  }
  return '';
}
module.exports = { prenumeDin, estePrenume, LISTA };
