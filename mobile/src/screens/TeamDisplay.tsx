import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { syncUiPrefs } from '../app/store';
import { Icon } from '../components/Icon';
import { FmMsg, FmScreen, poartaFirma, type FmMesaj } from '../components/FirmaUi';
import './admin.css'; // .sw

// „Afișaj pentru toți" (web: Setări → Toată echipa), pentru adminul firmei: valorile de PORNIRE ale firmei.
// Aceleași șase reglaje, cu aceleași cuvinte ca pe web (US_TOGGLES, cheile cu unde = 'ambele' sau 'firma').
// Fiecare comutare se salvează pe loc și trimite DOAR cheia schimbată — serverul le îmbină cu cele de acum.
// O cheie nesetată se arată pornită (așa e din fabrică).
export function TeamDisplay() {
  const p = poartaFirma('manageUsers', 'Afișaj pentru toți', 'Astea sunt reglaje ale unei firme',
    'Afișajul de pornire se pune pe o firmă anume. Contul tău e cont de platformă: nu ține de nicio firmă, deci n-are ce reglaje să pună aici. Ecranul ăsta e al administratorului unei firme.');
  if (p) return p;
  return <TeamDisplayEcran />;
}

const REGLAJE: { k: string; label: string; desc: string }[] = [
  { k: 'overspeed_heatmap', label: 'Colorează traseul după viteză',
    desc: 'Pe istoricul unei curse, drumul se face verde, portocaliu sau roșu, după cât de repede s-a mers față de limita mașinii.' },
  { k: 'replay_marker', label: 'Arată mașina care se plimbă pe traseu',
    desc: 'Punctul care merge pe drum când redai istoricul, ca la un film.' },
  { k: 'geocoded_address', label: 'Arată adresa, nu coordonatele',
    desc: 'În panoul de detalii scrie strada și localitatea, în loc de cifre („45.75, 21.22").' },
  { k: 'show_driver_names', label: 'Arată numele șoferilor',
    desc: 'Numele omului de la volan, în listă și în panoul de detalii.' },
  { k: 'tab_camion', label: 'Fila „Camion" din fișa vehiculului',
    desc: 'Tara, masele maxime și sarcinile pe axe. Apare oricum doar la camioane, autotractoare și remorci — de aici o scoți de tot, dacă firma nu are așa ceva.' },
  { k: 'tab_sonde', label: 'Filele pentru sondele de combustibil',
    desc: 'Calibrarea sondei. Apar oricum doar la mașinile care au sondă montată — de aici le scoți de tot.' },
];

function TeamDisplayEcran() {
  const [dft, setDft] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<FmMesaj>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    Api.companySettings()
      .then((cs: any) => setDft(Object.assign({}, cs && cs.ui_defaults)))
      .catch((e: any) => setErr(e?.message || 'Eroare la încărcare.'));
  }, []);

  const val = (k: string) => (dft && dft[k] !== undefined ? !!dft[k] : true);

  async function comuta(k: string) {
    if (!dft || busy) return;
    const nou = !val(k);
    const vechi = dft;
    setBusy(k); setMsg(null);
    setDft({ ...dft, [k]: nou }); // se vede pe loc; dacă serverul refuză, revine
    try {
      await Api.saveCompanySettings({ ui_defaults: { [k]: nou } });
      syncUiPrefs(); // și contul meu, dacă n-am ales altceva la mine
    } catch (e: any) {
      setDft(vechi);
      setMsg({ t: e?.message || 'Eroare la salvare.', rau: true });
    } finally { setBusy(''); }
  }

  return (
    <FmScreen titlu="Afișaj pentru toți">
      {/* Pe telefon, Contul meu → Afișaj are doar tema, harta și ecranul de pornire: cele patru reglaje
          personale de mai jos se schimbă, la om, doar din aplicația web. Filele pentru camion și sonde sunt ale
          firmei (unde = 'firma' pe web) — omul nu le are deloc în contul lui. */}
      <p class="fm-note">Reglajele de afișaj pentru toată firma deodată: traseul colorat după viteză, numele șoferilor, adresa în loc de coordonate, filele pentru camioane și sonde. Ce pui aici e valoarea de pornire. Primele patru și le poate schimba apoi fiecare om la el, din contul lui, în aplicația web (Preferințe → Afișaj). Filele pentru camioane și sonde nu se schimbă de la om la om: le hotărăște firma, de aici.</p>
      <FmMsg msg={msg} onClose={() => setMsg(null)} />
      {err && <div class="fm-msg rau" role="alert"><Icon name="alert" size={17} color="var(--red)" /><span>{err}</span></div>}
      {dft == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {dft != null && (
        <div class="fm-card">
          {REGLAJE.map((t) => {
            const on = val(t.k);
            return (
              <button class="fm-tgl" role="switch" aria-checked={on} disabled={busy === t.k} onClick={() => comuta(t.k)}>
                <span class="lbl">{t.label}<small>{t.desc}</small></span>
                <span class={'sw' + (on ? ' on' : '')} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      {/* Cinstit, pe 24.09: telefonul respectă overspeed_heatmap (RouteScreen), tab_camion și tab_sonde
          (VehicleDetail). NU respectă încă geocoded_address și show_driver_names — fișa mașinii arată mereu
          adresa și șoferul. replay_marker n-are pe ce se aplica: telefonul nu redă traseul (amânat de fondatori).
          De actualizat propoziția când se schimbă vreuna dintre ele. */}
      <p class="fm-foot">În aplicația web se aplică toate. Pe telefon se aplică deja traseul colorat după viteză și filele pentru camion și sonde din fișa mașinii. Adresa în loc de coordonate și numele șoferilor încă nu: fișa mașinii de pe telefon arată oricum adresa și șoferul. Mașina care se plimbă pe traseu există doar în aplicația web.</p>
    </FmScreen>
  );
}
