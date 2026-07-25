import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { login } from '../app/store';
import { api } from '../api/client';

export function Login() {
  const loc = useLocation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');

  // Recuperare parolă: endpointul exista pe server, dar nu era apelat din aplicație
  // → un client care își uita parola rămânea blocat definitiv.
  async function sendReset() {
    const e = email.trim();
    if (!e) return;
    setBusy(true); setErr(''); setInfo('');
    try {
      // prin clientul API (URL absolut pe device — fetch relativ NU funcționează în APK)
      const j: any = await api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email: e } });
      setInfo((j && j.message) || 'Dacă adresa există, vei primi un email cu instrucțiuni.');
      setForgot(false);
    } catch { setErr('Eroare de rețea. Încearcă din nou.'); }
    finally { setBusy(false); }
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!u.trim() || !p) return;
    setErr(''); setBusy(true);
    try {
      await login(u.trim(), p);
      loc.route('/vehicles');
    } catch (ex: any) {
      setErr(ex?.message || 'Autentificare eșuată');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:24px;padding-top:calc(var(--sat) + 24px);background:var(--bg-darkest)">
      <div style="text-align:center;margin-bottom:34px">
        <div style="font-weight:800;font-size:34px;letter-spacing:-1px"><span style="color:var(--accent)">RA</span> Tracks</div>
        <div class="muted" style="margin-top:6px;font-size:14px">Monitorizare flotă</div>
      </div>
      <form onSubmit={submit} style="display:flex;flex-direction:column;gap:16px">
        <div class="field">
          <label>Utilizator</label>
          <input type="text" autocomplete="username" autocapitalize="none" autocorrect="off"
            value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} placeholder="numele de utilizator" />
        </div>
        <div class="field">
          <label>Parolă</label>
          <input type="password" autocomplete="current-password"
            value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} placeholder="parola" />
        </div>
        {err && <div style="color:var(--red);font-size:13px;font-weight:600">{err}</div>}
        {info && <div style="color:var(--accent);font-size:13px;font-weight:600;line-height:1.4">{info}</div>}
        <button class="btn btn-primary btn-block" type="submit" disabled={busy} style="margin-top:8px;height:50px">
          {busy ? <span class="spin" style="border-top-color:#06210F" /> : 'Autentificare'}
        </button>
      </form>
      {forgot ? (
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
          <div class="field">
            <label>Email cont</label>
            <input type="email" autocomplete="email" autocapitalize="none" value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)} placeholder="adresa@firma.ro" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:1" disabled={busy} onClick={sendReset}>Trimite link</button>
            <button class="btn" style="flex:0 0 auto;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setForgot(false)}>Renunță</button>
          </div>
        </div>
      ) : (
        <div style="text-align:center;margin-top:16px">
          <a href="#" onClick={(e) => { e.preventDefault(); setForgot(true); setInfo(''); }}
            style="color:var(--text-muted);font-size:12.5px;text-decoration:none;border-bottom:1px dotted var(--text-muted)">Am uitat parola</a>
        </div>
      )}
      <div class="muted" style="text-align:center;margin-top:26px;font-size:12px">RA Tracks © {new Date().getFullYear()}</div>
    </div>
  );
}
