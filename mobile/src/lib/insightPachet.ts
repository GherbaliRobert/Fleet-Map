// „Vezi pachetele", trecerea la alt pachet, „Pachet și conturi" și ce ține de pachet în Utilizatori și în fila „Acces" a firmei, pe
// telefon. Reguli curate, fără ecran: `verify_telefon_pachete.js` rulează funcțiile paginii web (insightPachete, arataConfirmarea,
// deseneazaPachetConturi, _usrSeatsHtml, _raxRenderCfg, raxCfgPachet) lângă cele de aici, pe aceleași răspunsuri.
//
// Telefonul nu socotește nimic și nu scrie textele serverului: prețurile, cifrele, ce include fiecare pachet, textul de confirmat,
// `rezumat`, `nota`, `nuPoate` vin toate de la server. Aici stau doar cuvintele pe care le scrie și pagina web, cu aceleași litere.

// Cine ajunge la paginile pachetului: administratorul firmei (web: esteAdmin). Noi, fondatorii, n-avem pachet; pachetul unei firme
// îl punem din fila ei „Acces".
export function esteAdminFirma(role: any): boolean { const r = String(role || ''); return r === 'company_admin' || r === 'admin'; }
// Rândul din „⋯" (web: `esteAdmin() && (S.pachet || S.faraLoc)`): și administratorul fără cont RA Insight al lui ajunge acolo.
export function arataPachetConturi(admin: boolean, pachet: any, faraLoc: any): boolean { return !!(admin && (pachet || faraLoc)); }

// Cartonașul „nu e pornit", la administrator (web: deseneazaMain).
export const TEXT_ADMIN_FARA_LOC = 'Ești administratorul firmei: îți poți da contul singur, din „Pachet și conturi”.';

// ── „Vezi pachetele" (web: insightPachete, GET /api/insight/pachete) ──
export type CelulaCmp = { da: boolean | null; text: string; mic: string };
export function planPachete(j: any) {
  const urm = j && j.urmator;
  const pachete: any[] = (j && j.pachete) || [];
  return {
    sub: String((j && j.reincarcare) || ''),
    urmText: urm && urm.text ? String(urm.text) : '',
    carduri: pachete.map((p) => {
      const al = p.cod === j.actual, prog = !!(urm && urm.cod === p.cod);
      return {
        cod: String(p.cod), nume: String(p.nume || ''), al, ai: !!p.eticheta, eticheta: p.eticheta ? String(p.eticheta) : '',
        pret: String(p.pret || ''), subPret: String(p.subPret || ''), titlu: String(p.titlu || ''), pentru: String(p.pentru || ''),
        cifre: (p.cifre || []).map((x: any) => ({ et: String(x.et || ''), val: x.val == null ? '—' : String(x.val), nu: x.val == null })),
        plus: p.plus ? String(p.plus) : '',
        include: (p.include || []).map(String),
        programat: prog ? String(urm.scurt || '') : '',
        // Trecerea din aplicație: doar administratorul firmei (`poateSchimba`, de la server).
        alege: j.poateSchimba && !prog && (!al || urm) ? (al ? 'Rămân pe ' + p.nume : 'Alege ' + p.nume) : '',
      };
    }),
    // Tot ce include fiecare pachet, rând cu rând. Pe telefon un rând are titlul sus și câte o celulă pe pachet dedesubt.
    comparatie: (Array.isArray(j && j.comparatie) ? j.comparatie : []).map((g: any) => ({
      grup: String(g.grup || ''),
      randuri: (g.randuri || []).map((r: any) => ({
        t: String(r.t || ''), d: r.d ? String(r.d) : '',
        celule: (r.v || []).map((x: any, i: number) => {
          const p = pachete[i] || {};
          return { nume: String(p.nume || ''), ai: !!p.eticheta, al: p.cod === j.actual, da: x.da === true ? true : (x.da === false ? false : null), text: x.da === true || x.da === false ? '' : String(x.text || ''), mic: x.mic ? String(x.mic) : '' };
        }),
      })),
    })),
    inToate: (Array.isArray(j && j.inToate) ? j.inToate : []).map((x: any) => ({ t: String(x.t || ''), d: String(x.d || '') })),
    schimbText: String((j && j.schimbText) || ''),
  };
}
export const TITLU_PACHETE = 'Pachetele RA Insight';
export const TITLU_COMPARATIE = 'Tot ce include fiecare pachet';
export const TITLU_IN_TOATE = 'În toate pachetele';

// ── Trecerea la alt pachet (web: insightTrecere, arataConfirmarea): textul EXACT de la server, bifa, confirmarea ──
export const TITLU_CONFIRMARE = 'Confirmă schimbarea pachetului';
export const TEXT_BIFA = 'Am citit și sunt de acord.';   // doar dacă serverul n-o spune
export const TEXT_RENUNT = 'Renunț';
export const TEXT_CONFIRM = 'Confirm';
// Ce pleacă: același text pe care l-a văzut omul; la un text schimbat între timp, serverul refuză cu 409 și trimite textul nou.
export function corpTrecere(cod: any, textVazut: any, bifat: any) { return { cod, text: textVazut, acord: bifat === true }; }
export function dupaConfirmare(status: number, j: any):
  { fel: 'din-nou'; text: string; buton: string; mesaj: string } | { fel: 'eroare'; mesaj: string } | { fel: 'gata'; mesaj: string } {
  const x = j || {};
  if (status === 409 && x.text) return { fel: 'din-nou', text: String(x.text), buton: x.buton ? String(x.buton) : '', mesaj: String(x.error || 'S-a schimbat ceva. Citește din nou.') };
  if (status !== 200) return { fel: 'eroare', mesaj: String(x.error || 'Nu s-a putut schimba pachetul.') };
  return { fel: 'gata', mesaj: String(x.mesaj || 'Gata.') };
}

// ── „Pachet și conturi" (web: deseneazaPachetConturi, GET /api/insight/pachet-conturi) ──
export const TITLU_CONTURI = 'Pachet și conturi';
export function coloaneConturi(j: any): string[] {
  const imp = !!(j && j.pachet && j.pachet.imparte);
  return ['Om', 'Rol', 'RA Insight'].concat(imp ? ['Întrebări pe lună'] : []).concat(['Folosite în ' + ((j && j.luna) || 'luna asta')]);
}
export function planConturi(j: any) {
  if (j && j.vechi) return { vechi: true as const, mesaj: String(j.mesaj || '') };
  const p = (j && j.pachet) || null;
  const imp = !!(p && p.imparte);
  return {
    vechi: false as const,
    pilula: p && p.nume ? String(p.nume) : '',
    urmator: j && j.urmator ? String(j.urmator) : '',
    rezumat: ((j && j.rezumat) || []).map(String),
    // Bara: cât a rămas din întrebările lunii; `ramase` și `intrebari` vin de la server.
    bara: p && p.intrebari ? Math.max(0, Math.min(100, Math.round((Number(p.ramase) || 0) / p.intrebari * 100))) : null,
    imparte: imp,
    coloane: coloaneConturi(j),
    oameni: ((j && j.oameni) || []).map((o: any) => ({
      id: o.id, nume: String(o.nume || ''), rol: String(o.rol || ''), loc: !!o.loc,
      nuPoate: !o.loc && o.nuPoate ? String(o.nuPoate) : '',
      cuLimita: o.limita != null, limita: o.limita != null ? String(o.limita) : '',
      arataLimita: imp && !!o.loc,      // „Fără limită" / „Cel mult … pe lună": doar la Pro / Business și cu cont
      folosite: o.loc || o.folositeText ? String(o.folositeText || '0') : 'fără cont',
    })),
    nota: String((j && j.nota) || ''),
    sursa: j && j.sursa ? { nume: String(j.sursa.nume || ''), pornita: !j.sursa.oprita, text: String(j.sursa.text || ''), explicatie: String(j.sursa.explicatie || '') } : null,
    treceri: ((j && j.treceri) || []).map((t: any) => ({ id: t.id, cand: String(t.cand || ''), rezumat: String(t.rezumat || ''), cine: String(t.cine || '') + ' · ' + String(t.email || ''), pdf: String(t.pdf || '') })),
  };
}
// Cuvintele de sub apăsări, ca pe web (insightLoc, insightLimita, insightSursaFirma).
export const TITLU_DAI_LOC = 'Dai RA Insight?';
export const OK_DAI_LOC = 'Dă-i acces';
export function textDaiLoc(nume: any): string { return '„' + nume + '" primește RA Insight. Prețul pachetului rămâne același, oricâte conturi dai.'; }
export function textLocGata(on: boolean, nume: any): string { return on ? 'RA Insight pornit pentru „' + nume + '"' : 'RA Insight oprit pentru „' + nume + '"'; }
export function textLimitaGata(v: any): string { return String(v == null ? '' : v).trim() === '' ? 'Fără limită: folosește din întrebările firmei' : 'Limita s-a salvat: cel mult ' + String(v).trim() + ' pe lună'; }
export function textSursaGata(on: boolean): string { return on ? 'Sursa externă e pornită pentru toată firma.' : 'Sursa externă e oprită pentru toată firma.'; }
// Ce pleacă la PUT /api/users/:id/ai-limita: gol = „Fără limită".
export function corpLimita(val: any) { const v = String(val == null ? '' : val).trim(); return { limita: v === '' ? null : Number(v) }; }

// ── Utilizatori (web: _usrSeatsHtml, rândul omului): pe un pachet, conturile se dau DOAR din „Pachet și conturi" ──
export const TITLU_RA = 'Are RA Insight. Se schimbă din „Pachet și conturi”.';
export const LINK_CONTURI = 'Schimbă în Pachet și conturi →';
// Pachetul de care ține seama ecranul: al firmei omului; la noi, nimic (noi nu avem o firmă a noastră aici).
export function cuPachetFirmei(role: any, q: any): any { return String(role || '') !== 'superadmin' && q && q.pachet ? q.pachet : null; }
export function randConturi(toti: any[], pk: any): null | { n: number; cat: string; rest: string; link: boolean } {
  const n = (toti || []).filter((u) => !!u.ai_seat).length;
  if (!n && !pk) return null;
  return {
    n, cat: n === 1 ? 'cont cu RA Insight' : 'conturi cu RA Insight',
    rest: pk
      ? '— pachetul ' + pk.nume + (pk.conturi == null ? ', conturi nelimitate' : ', ' + (pk.conturi === 1 ? 'un cont' : pk.conturi + ' conturi')) + '.'
      : '— la factură intră vârful lunii: cel mai mare număr de conturi aprinse deodată.',
    link: !!pk,
  };
}
// Bagheta de pe rândul omului: doar pe regula veche și la fondator (web: `u.role === 'superadmin' || _usrPachet ? '' : …`).
export function arataBagheta(u: any, pk: any): boolean { return !(String(u && u.role) === 'superadmin' || pk); }
export function arataEticheta(u: any, pk: any): boolean { return !!(pk && u && u.ai_seat); }

// ── Fila „Acces" a firmei, la noi (web: _raxRenderCfg, raxCfgPachet) ──
export const NOTA_PACHET_FIRMA = 'Start = doar administratorul, pe butoane (fără AI); Basic, Pro, Business = cu AI și ramuri. Pe factură: un rând fix pe lună; o trecere în cursul lunii se socotește pe zile. Administratorul firmei își schimbă singur pachetul, din „Vezi pachetele”.';
export function butonPachetFirma(p: any): string {
  return p.nume + ' · ' + (p.pret ? p.pret + (p.pret % 100 >= 20 || p.pret % 100 === 0 ? ' de lei' : ' lei') : 'inclus');
}
// „Acum: …" (cu **îngroșat**); fără pachet, firma e pe regula veche.
export function acumPachetFirma(s: any): string {
  const a = s && s.ai_pachet;
  return (a ? 'Acum: **' + a.nume + '**' + (a.deLa ? ', din ' + new Date(a.deLa).toLocaleDateString('ro-RO') : '') + '.' : 'Acum: **regula veche, pe cont** (întrebările pe cont, din „Abonament & plăți").')
    + (a && a.urmator ? ' **' + a.urmator + '**' : '');
}
export function confirmarePachetFirma(p: any): { titlu: string; text: string; ok: string } {
  return {
    titlu: 'Pachetul ' + p.nume + '?',
    text: 'RA Insight trece pe loc pe pachetul ' + p.nume + (p.cod === 'start' ? ' (doar administratorul, pe butoane).'
      : ' (' + (p.conturi == null ? 'conturi nelimitate' : 'până la ' + p.conturi + ' ' + (p.conturi === 1 ? 'cont' : 'conturi')) + ', ' + p.intrebari + (p.intrebari % 100 >= 20 || p.intrebari % 100 === 0 ? ' de' : '') + ' întrebări pe lună).')
      + ' Pe factură ajunge odată cu oferta pe pachete.',
    ok: 'Trece pe ' + p.nume,
  };
}
// Limita AI lunară și „întrebări pe cont" sunt ale regulii VECHI: pe o firmă cu pachet (și Start e un pachet), serverul le refuză.
export function peRegulaVeche(s: any): boolean { return !(s && s.ai_pachet); }
