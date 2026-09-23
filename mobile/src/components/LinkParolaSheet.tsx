import { useRef } from 'preact/hooks';
import { showToast } from '../app/store';
import { Icon } from './Icon';

// Foaia „Linkul de parolă" — o singură implementare pentru Utilizatori și pentru aprobarea unui demo.
// Parola nu se mai scrie de nimeni (16.09): omul primește un link și și-o pune singur. Când emailul nu poate
// pleca, serverul întoarce linkul, iar foaia îl arată, copiat deja, cu „Copiază" și „Trimite" (WhatsApp, SMS…).
export type LinkParola = { email?: string; link: string; motiv?: string; copiat?: boolean };

const BTN_GHOST = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';

// Copiază linkul imediat, ca pe web; fără clipboard (unele WebView-uri îl refuză), se copiază de mână din foaie.
export async function pregatesteLinkul(l: LinkParola): Promise<LinkParola> {
  let copiat = false;
  try { await navigator.clipboard.writeText(l.link); copiat = true; } catch { /* rămâne de copiat de mână */ }
  return { ...l, copiat };
}

export function LinkParolaSheet({ data, onClose }: { data: LinkParola; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  async function copiaza() {
    try { await navigator.clipboard.writeText(data.link); showToast('Link copiat'); }
    catch {
      const el = ref.current;
      if (el) { el.focus(); el.select(); }
      showToast('Nu am putut copia — ține apăsat pe link și copiază-l.', true);
    }
  }
  async function trimite() {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Linkul de parolă', text: 'Îți pui singur parola în RA Tracks din linkul ăsta:', url: data.link });
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || ''))) return; // omul a închis foaia de partajare — nu e o eroare
      showToast('Nu am putut deschide trimiterea — copiază linkul.', true);
    }
  }
  const motiv = data.motiv ? String(data.motiv).trim().replace(/\.*$/, '.') + ' ' : '';
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="mail" size={18} color="var(--accent)" /> Linkul de parolă</b><button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5">
            {motiv + 'Contul există, dar linkul trebuie dus de tine. '
              + (data.copiat ? 'L-am copiat deja — trimite-i-l ' : 'Copiază-l de mai jos și trimite-i-l ')
              + (data.email || 'omului') + ' cum poți. Parola tot el și-o pune.'}
          </p>
          <textarea ref={ref} readOnly rows={3} value={data.link}
            onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
            style="width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:10px 11px;font-size:13px;font-family:inherit;line-height:1.4;word-break:break-all;resize:none;user-select:text;-webkit-user-select:text" />
          <div class="frm-actions">
            <button class="btn" style={BTN_GHOST} onClick={copiaza}><Icon name="check" size={16} /> Copiază</button>
            <button class="btn btn-primary" onClick={trimite}><Icon name="mail" size={16} color="#06210f" /> Trimite</button>
          </div>
          <button class="btn" style={BTN_GHOST + ';width:100%;margin-top:10px'} onClick={onClose}>Am înțeles</button>
        </div>
      </div>
    </div>
  );
}
