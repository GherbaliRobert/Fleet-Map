import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { login } from '../app/store';

export function Login() {
  const loc = useLocation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
        <button class="btn btn-primary btn-block" type="submit" disabled={busy} style="margin-top:8px;height:50px">
          {busy ? <span class="spin" style="border-top-color:#06210F" /> : 'Autentificare'}
        </button>
      </form>
      <div class="muted" style="text-align:center;margin-top:26px;font-size:12px">RA Tracks © {new Date().getFullYear()}</div>
    </div>
  );
}
