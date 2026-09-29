import { useEffect, useState } from 'preact/hooks';
import {
  me, token, showToast, uiPrefs, uiPrefsSursa, syncUiPrefs, aplicaTema, type TemaCont,
} from '../app/store';
import { Api } from '../api/endpoints';
import { saveUser } from '../lib/storage';
import { setMapLayerFromAccount } from '../lib/mapLayer';
import { trimitePrefs } from '../lib/uiPrefsCoada';
import { Icon } from '../components/Icon';
import './admin.css';
import './contulmeu.css';

// „Contul meu" — același capitol ca pe web (Setări → Preferințe → Contul meu), pentru ORICINE: dispecer,
// viewer, admin de firmă, fondator. Trei lucruri:
//  1. numele afișat și telefonul (emailul e și numele de utilizator — îl schimbă doar administratorul firmei);
//  2. schimbarea propriei parole, NUMAI cu parola de acum (o sesiune uitată deschisă nu devine preluarea contului);
//  3. afișajul care stă pe CONT, nu pe telefon: tema, harta cu care pornești, ecranul de pornire.
// Regulile (lungimea parolei, limitarea încercărilor, contul demo comun) sunt ale serverului; telefonul verifică
// doar cele două lucruri pe care le verifică și webul înainte de trimitere și arată mesajele serverului așa cum sunt.

type Mesaj = { t: string; fel?: 'bun' | 'rau' } | null;

// Textele variantelor sunt cele de pe web (US_TOGGLES din index.html), ca omul să recunoască alegerea.
const TEME: [TemaCont, string][] = [['inchisa', 'Închisă'], ['deschisa', 'Deschisă'], ['sistem', 'Ca pe dispozitiv']];
const HARTI: [string, string][] = [['auto', 'Automat'], ['streets', 'Străzi'], ['sat', 'Satelit'], ['hybrid', 'Satelit cu denumiri'], ['terrain', 'Relief']];
const ECRANE: [string, string][] = [['localizare', 'Localizare'], ['traseu', 'Traseu'], ['statistici', 'Statistici'], ['rapoarte', 'Rapoarte']];

// De unde vine valoarea, pe românește (ca prefSursa de pe web). Al doilea element = clasa de culoare din
// contulmeu.css (pe tema deschisă verdele trece pe o nuanță care se citește pe alb).
function sursaText(s?: string): [string, string] {
  if (s === 'user') return ['setată de tine', 'user'];
  if (s === 'company') return ['hotărâtă de firmă', 'company'];
  return ['așa e din fabrică', 'app'];
}

export function ContulMeu() {
  const u = me.value;

  // ── 1. Datele mele ──
  // Câmpurile URMEAZĂ profilul (me) până când omul începe să scrie în ele: profilul se reîmprospătează la
  // deschidere (mai jos) și la revenirea în aplicație. Altfel un nume vechi sau lipsă din copia de pe telefon
  // (ex. /api/me picat la autentificare) ar fi trimis la „Salvează" și ar fi călcat numele de pe cont.
  const numeCont = u?.full_name || '';
  const telCont = u?.phone || '';
  const [nume, setNume] = useState<string>(numeCont);
  const [tel, setTel] = useState<string>(telCont);
  const [atinsNume, setAtinsNume] = useState(false);
  const [atinsTel, setAtinsTel] = useState(false);
  useEffect(() => { if (!atinsNume) setNume(numeCont); }, [numeCont]);
  useEffect(() => { if (!atinsTel) setTel(telCont); }, [telCont]);
  const [msgCont, setMsgCont] = useState<Mesaj>(null);
  const [salvezCont, setSalvezCont] = useState(false);

  // ── 2. Parola ──
  const [p0, setP0] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [msgParola, setMsgParola] = useState<Mesaj>(null);
  const [schimb, setSchimb] = useState(false);

  // ── 3. Afișaj ──
  // Cerem preferințele din nou la fiecare deschidere (ca webul): între timp s-ar fi putut schimba pe web
  // sau din butonul de pe hartă. syncUiPrefs le și aplică (tema, harta) și le pune în store. Cât se citesc,
  // variantele stau blocate: o alegere făcută chiar atunci s-ar încrucișa cu citirea de pe drum.
  const [incarc, setIncarc] = useState(true);
  const [salvezPref, setSalvezPref] = useState<string | null>(null);
  useEffect(() => {
    syncUiPrefs().finally(() => setIncarc(false));
    // Profilul proaspăt de pe server (numele și telefonul de acum, poate schimbate între timp pe web).
    const t = token.value;
    Api.me().then((m) => {
      if (!m || token.value !== t) return; // între timp s-a delogat sau a intrat pe alt cont
      me.value = m;
      saveUser(m).catch(() => { /* copia locală se reface la următorul /api/me */ });
    }).catch(() => { /* fără rețea: rămâne ce era; la salvare trimitem oricum doar ce a schimbat omul */ });
  }, []);

  async function salveazaContul() {
    if (salvezCont) return;
    // Trimitem DOAR ce a schimbat omul față de profilul de pe cont (serverul lasă neatins un câmp netrimis):
    // cine își schimbă doar telefonul nu poate șterge din greșeală numele, nici dacă telefonul nu-l știa.
    const body: { full_name?: string; phone?: string } = {};
    if (nume.trim() !== numeCont.trim()) body.full_name = nume;
    if (tel.trim() !== telCont.trim()) body.phone = tel;
    if (!Object.keys(body).length) { setMsgCont({ t: 'Nu ai schimbat nimic.' }); return; }
    setSalvezCont(true);
    setMsgCont({ t: 'Se salvează…' });
    try {
      const d = await Api.saveProfile(body);
      // Numele se schimbă pe loc și în capul meniului — altfel omul salvează și crede că nu s-a întâmplat nimic.
      const cur = me.value;
      if (cur) {
        const m = { ...cur, full_name: d.full_name || null, phone: d.phone || null };
        me.value = m;
        saveUser(m).catch(() => { /* copia locală se reface la următorul /api/me */ });
      }
      setNume(d.full_name || ''); setTel(d.phone || '');
      setAtinsNume(false); setAtinsTel(false); // de acum câmpurile urmează iar profilul
      setMsgCont({ t: 'Salvat ✓', fel: 'bun' });
    } catch (e: any) {
      setMsgCont({ t: (e && e.message) || 'Nu s-a putut salva.', fel: 'rau' });
    } finally { setSalvezCont(false); }
  }

  async function schimbaParola() {
    if (schimb) return;
    // Aceleași două verificări ca pe web, înainte de trimitere. Restul (lungime, feluri de caractere, parola
    // de acum greșită, prea multe încercări, contul demo comun) le spune serverul.
    if (!p0) { setMsgParola({ t: 'Scrie mai întâi parola de acum.', fel: 'rau' }); return; }
    if (p1 !== p2) { setMsgParola({ t: 'Cele două parole noi nu sunt la fel.', fel: 'rau' }); return; }
    setSchimb(true);
    setMsgParola({ t: 'Se schimbă…' });
    try {
      await Api.changePassword(p0, p1);
      setP0(''); setP1(''); setP2('');
      setMsgParola({ t: 'Parola a fost schimbată ✓', fel: 'bun' });
    } catch (e: any) {
      // 400 / 403 / 429 — niciodată 401, deci omul NU e delogat dacă greșește parola de acum.
      setMsgParola({ t: (e && e.message) || 'Nu s-a putut schimba parola.', fel: 'rau' });
    } finally { setSchimb(false); }
  }

  // O alegere de afișaj: întâi pe cont (ca webul — dacă serverul refuză, nu se schimbă nimic), apoi pe ecran.
  async function alege(k: string, v: string) {
    if (salvezPref) return;
    const cur = uiPrefs.value || {};
    if (cur[k] === v && uiPrefsSursa.value[k] === 'user') return;
    setSalvezPref(k);
    try {
      await trimitePrefs({ [k]: v }); // prin coada comună, după scrierile din meniu / de pe hartă
      uiPrefs.value = { ...(uiPrefs.value || {}), [k]: v };
      uiPrefsSursa.value = { ...uiPrefsSursa.value, [k]: 'user' };
      if (k === 'tema') aplicaTema(v as TemaCont);
      else if (k === 'harta') setMapLayerFromAccount(v); // harta o citește la următoarea deschidere
    } catch (e: any) {
      showToast((e && e.message) || 'Eroare la salvare', true);
    } finally { setSalvezPref(null); }
  }

  const eff = uiPrefs.value;
  const src = uiPrefsSursa.value;

  function pref(k: string, titlu: string, desc: string, valori: [string, string][], first = false, extra?: string) {
    const [sTxt, sCls] = sursaText(src[k]);
    const val = eff ? String(eff[k]) : '';
    return (
      <div class={'cm-pref' + (first ? ' first' : '')}>
        <div class="cm-pt">{titlu}<span class={'cm-src ' + sCls}>{sTxt}</span></div>
        <div class="cm-pd">{desc}{extra ? <><br />{extra}</> : null}</div>
        <div class="cm-opts" role="radiogroup" aria-label={titlu}>
          {valori.map(([v, l]) => (
            <button type="button" role="radio" aria-checked={val === v} class={'cm-opt' + (val === v ? ' on' : '')}
              disabled={!!salvezPref || incarc} onClick={() => alege(k, v)}>{l}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Contul meu</div>
        <div style="width:36px" />
      </header>
      <div class="content cm-content">

        <div class="pf-card cm-card">
          <h3><span style="display:inline-flex;align-items:center;gap:7px"><Icon name="idCard" size={16} /> Contul meu</span></h3>
          <p class="cm-note">Numele de aici e cel care apare în capul meniului și în istoricul de activitate. Adresa de email e totodată numele tău de utilizator — pe aceea o schimbă doar administratorul firmei.</p>
          <div class="frm">
            <div class="fld">
              <label for="cm-nume">Numele tău</label>
              <input id="cm-nume" type="text" autocomplete="name" maxLength={120} placeholder="Ion Popescu"
                value={nume} onInput={(e) => { setAtinsNume(true); setNume((e.target as HTMLInputElement).value); }} />
            </div>
            <div class="fld">
              <label for="cm-tel">Telefon</label>
              <input id="cm-tel" type="tel" inputMode="tel" autocomplete="tel" maxLength={30} placeholder="07xx xxx xxx"
                value={tel} onInput={(e) => { setAtinsTel(true); setTel((e.target as HTMLInputElement).value); }} />
            </div>
            <div class="fld">
              <label for="cm-mail">Adresa de email (numele de utilizator)</label>
              <input id="cm-mail" type="text" value={u?.username || ''} disabled />
            </div>
          </div>
          <div class="cm-act">
            <button class="btn btn-primary" disabled={salvezCont} onClick={salveazaContul}><Icon name="check" size={17} /> Salvează</button>
            {msgCont && <span class={'cm-msg' + (msgCont.fel ? ' ' + msgCont.fel : '')} role="status">{msgCont.t}</span>}
          </div>
        </div>

        <div class="pf-card cm-card">
          <h3><span style="display:inline-flex;align-items:center;gap:7px"><Icon name="key" size={16} /> Schimbă-ți parola</span></h3>
          <div class="frm">
            <div class="fld">
              <label for="cm-p0">Parola de acum</label>
              <input id="cm-p0" type="password" autocomplete="current-password"
                value={p0} onInput={(e) => setP0((e.target as HTMLInputElement).value)} />
            </div>
            <div class="fld">
              <label for="cm-p1">Parola nouă</label>
              {/* Regula e a serverului (PAROLA_MIN = 10 + cel puțin două feluri de caractere). NU „minim 8". */}
              <input id="cm-p1" type="password" autocomplete="new-password" placeholder="minim 10 caractere"
                value={p1} onInput={(e) => setP1((e.target as HTMLInputElement).value)} />
            </div>
            <div class="fld">
              <label for="cm-p2">Încă o dată parola nouă</label>
              <input id="cm-p2" type="password" autocomplete="new-password"
                value={p2} onInput={(e) => setP2((e.target as HTMLInputElement).value)} />
            </div>
            <div class="cm-help">Minim 10 caractere, cu cel puțin două feluri: litere și cifre, de exemplu.</div>
          </div>
          <div class="cm-act">
            <button class="btn btn-primary" disabled={schimb} onClick={schimbaParola}><Icon name="key" size={17} /> Schimbă parola</button>
            {msgParola && <span class={'cm-msg' + (msgParola.fel ? ' ' + msgParola.fel : '')} role="status">{msgParola.t}</span>}
          </div>
        </div>

        <div class="pf-card cm-card">
          <h3><span style="display:inline-flex;align-items:center;gap:7px"><Icon name="sun" size={16} /> Afișaj</span></h3>
          <p class="cm-note">Alegerile de aici se țin minte pe contul tău, nu pe telefonul ăsta: le pui o dată și le regăsești și pe web.</p>
          {!eff && incarc && <div class="cm-load"><div class="spin" style="margin:0 auto" /></div>}
          {!eff && !incarc && <div class="cm-load">Nu s-au putut citi preferințele. Verifică legătura la internet și redeschide ecranul.</div>}
          {eff && (
            <>
              {pref('tema', 'Tema aplicației', 'Se schimbă și din rândul „Temă" din meniu.', TEME, true)}
              {pref('harta', 'Harta cu care pornești', '„Automat" o alege aplicația — acum e harta cu străzi. O poți schimba oricând și din butonul de pe hartă.', HARTI)}
              {/* Pe web, contul de platformă deschide mereu „Acasă" și preferința nu se aplică; pe telefon pornește
                  pe Vehicule, tot fără ea (rutaEcranPornire din store). Un rând care nu face nimic ar fi o minciună. */}
              {!u?.isSuper && pref('ecran_pornire', 'Ecranul cu care se deschide aplicația',
                'Dacă rolul tău nu ajunge la ecranul ales, se deschide tot pe Localizare.', ECRANE, false,
                'Pe telefon, Localizare e ecranul Vehicule. Traseul se deschide din fișa mașinii — la „Traseu", aplicația pornește pe Vehicule.')}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
