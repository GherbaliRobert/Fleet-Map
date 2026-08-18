// FollowScreen — „merg după mașina X". Ecran de urmărit în trafic, cu telefonul în suport.
//
// ─── De ce ecranul ăsta și nu Android Auto ───────────────────────────────────────────────────────
// Android Auto acceptă doar patru categorii (navigație, puncte de interes, dispozitive inteligente,
// meteo) — urmărirea de flotă nu e printre ele, iar aplicația noastră e o pagină web împachetată,
// pe când Android Auto cere ecrane native scrise cu biblioteca lor. Deci nu e o setare, ar fi o
// aplicație nouă, care oricum n-ar trece de aprobare pe categoria asta.
//
// Iar navigația obișnuită nu rezolvă problema: Maps te duce unde ERA mașina când ai apăsat. La 90
// km/h, după zece minute ținta e la 15 km de unde ai țintit. Aici arătăm distanța și direcția
// CURENTE, actualizate singure — iar navigația se relansează cu un buton, la poziția de acum.
//
// ─── Reguli de proiectare, pentru că se citește din mers ─────────────────────────────────────────
// Cifre mari, fără derulare, fără decizii. Trei lucruri: cât mai e, încotro, și dacă te apropii.
// Nimic nu clipește, nimic nu cere atins. Săgeata e relativă la direcția TA de mers, nu la nord —
// „ia-o la dreapta" e util, „azimut 273°" nu e.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Geolocation } from '@capacitor/geolocation';
import { vehicles, offlineMinutes } from '../app/store';
import { Icon } from '../components/Icon';
import { statusOf } from '../lib/status';

type Pozitie = { lat: number; lng: number; heading: number | null; speed: number | null; at: number };

// Distanța pe suprafața Pământului, în metri (Haversine). La distanțele din trafic e exactă.
function distantaM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Direcția către țintă, în grade față de nord.
function directie(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const y = Math.sin((bLng - aLng) * rad) * Math.cos(bLat * rad);
  const x = Math.cos(aLat * rad) * Math.sin(bLat * rad) - Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLng - aLng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
function distText(m: number) {
  if (m < 1000) return { v: String(Math.round(m / 10) * 10), u: 'm' };
  return { v: (m / 1000).toFixed(m < 10000 ? 1 : 0), u: 'km' };
}
// Ceasul: „acum", „acum 40 s", „acum 3 min" — vechimea informației contează cât informația însăși.
function vechime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 15) return 'acum';
  if (s < 90) return 'acum ' + s + ' s';
  return 'acum ' + Math.round(s / 60) + ' min';
}

export function FollowScreen() {
  // Același tipar ca RouteScreen/CanScreen: parametrul se ia din ruter și se DECODIFICĂ.
  const { params } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  const loc = useLocation();
  const v = vehicles.value.find((x) => x.imei === imei);
  const off = offlineMinutes.value;

  const [eu, setEu] = useState<Pozitie | null>(null);
  const [eroareGps, setEroareGps] = useState('');
  const watchId = useRef<string | null>(null);
  const wakeLock = useRef<any>(null);
  const [, tick] = useState(0);

  // Reîmprospătăm afișajul o dată pe secundă: vechimea datelor trebuie să se vadă cum crește, chiar
  // dacă nu vine nicio poziție nouă. Un ecran care arată „acum" de trei minute e mai rău decât unul gol.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  // Poziția mea, urmărită continuu.
  useEffect(() => {
    let viu = true;
    (async () => {
      try {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (perm.location === 'denied') { setEroareGps('Fără acces la locație — nu pot calcula distanța.'); return; }
        const id = await Geolocation.watchPosition({ enableHighAccuracy: true }, (p) => {
          if (!viu || !p || !p.coords) return;
          setEu({ lat: p.coords.latitude, lng: p.coords.longitude, heading: (p.coords as any).heading ?? null, speed: (p.coords as any).speed ?? null, at: Date.now() });
          setEroareGps('');
        });
        if (viu) watchId.current = id; else { try { Geolocation.clearWatch({ id }); } catch {} }
      } catch { if (viu) setEroareGps('GPS-ul telefonului nu răspunde.'); }
    })();
    return () => {
      viu = false;
      if (watchId.current) { try { Geolocation.clearWatch({ id: watchId.current }); } catch {} watchId.current = null; }
    };
  }, []);

  // Ecranul rămâne aprins cât urmărești — altfel se stinge exact când ai nevoie de el.
  // Wake Lock e API de browser: dacă lipsește, nu stricăm nimic, doar nu ținem ecranul treaz.
  useEffect(() => {
    (async () => {
      try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch {}
    })();
    const reia = async () => {
      if (document.visibilityState === 'visible' && !wakeLock.current) {
        try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch {}
      }
    };
    document.addEventListener('visibilitychange', reia);
    return () => {
      document.removeEventListener('visibilitychange', reia);
      try { wakeLock.current?.release?.(); } catch {}
      wakeLock.current = null;
    };
  }, []);

  const tinta = (v && v.latitude != null && v.longitude != null)
    ? { lat: v.latitude as number, lng: v.longitude as number, at: v.timestamp ? new Date(v.timestamp).getTime() : Date.now() }
    : null;

  const d = (eu && tinta) ? distantaM(eu.lat, eu.lng, tinta.lat, tinta.lng) : null;
  const az = (eu && tinta) ? directie(eu.lat, eu.lng, tinta.lat, tinta.lng) : null;
  // Săgeata: unde e ținta FAȚĂ DE cum mergi tu. Fără direcția mea de mers (stând pe loc), o arătăm
  // față de nord și o spunem — o săgeată care minte e mai rea decât una lipsă.
  const amDirectie = eu && eu.heading != null && !isNaN(eu.heading as any) && (eu.speed == null || eu.speed > 1.5);
  const unghiSageata = (az != null) ? (amDirectie ? (az - (eu!.heading as number) + 360) % 360 : az) : null;

  // Mă apropii sau rămân în urmă? Comparăm distanța cu cea de acum câteva secunde.
  const istoric = useRef<{ d: number; t: number }[]>([]);
  useEffect(() => {
    if (d == null) return;
    const h = istoric.current;
    h.push({ d, t: Date.now() });
    while (h.length && Date.now() - h[0].t > 30000) h.shift();   // fereastră de 30 s
  }, [d]);
  const h0 = istoric.current[0];
  const tendinta = (h0 && d != null && Date.now() - h0.t > 8000)
    ? (d < h0.d - 50 ? 'apropii' : d > h0.d + 50 ? 'departez' : 'egal')
    : null;

  const vitezaTinta = v && v.speed != null ? Math.round(v.speed) : null;
  const vitezaMea = eu && eu.speed != null && eu.speed >= 0 ? Math.round(eu.speed * 3.6) : null;
  const st = v ? statusOf(v, off) : null;
  const eticheta = v ? (v.plate || v.name || imei) : imei;
  const ll = tinta ? `${tinta.lat},${tinta.lng}` : '';
  const openUrl = (url: string) => { try { (window as any).open(url, '_system'); } catch { window.open(url, '_blank'); } };

  const dt = d != null ? distText(d) : null;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/vehicles/' + imei)} aria-label="Înapoi"><Icon name="chevronL" size={20} /></button>
        <div class="h-title">Merg după {eticheta}</div>
        <div style="width:36px" />
      </header>

      <div class="content" style="display:flex;flex-direction:column;gap:14px;padding:16px 16px 28px">
        {!v && <div class="adm-empty">Vehiculul nu e în listă.</div>}
        {eroareGps && <div class="adm-empty" style="color:#f59e0b">{eroareGps}</div>}
        {v && !tinta && <div class="adm-empty">Vehiculul n-are încă o poziție cunoscută.</div>}

        {v && tinta && (
          <>
            {/* DISTANȚA — singurul lucru care se citește dintr-o privire */}
            <div style="text-align:center;padding:8px 0">
              <div style="font-size:13px;color:var(--text-muted);letter-spacing:.04em">DISTANȚA PÂNĂ LA EL</div>
              <div style="font-size:64px;font-weight:800;line-height:1.05;letter-spacing:-.02em">
                {d == null ? '—' : dt!.v}
                <span style="font-size:26px;font-weight:700;color:var(--text-muted);margin-left:6px">{d == null ? '' : dt!.u}</span>
              </div>
              {tendinta && (
                <div style={'font-size:15px;font-weight:700;margin-top:2px;color:' + (tendinta === 'apropii' ? 'var(--accent)' : tendinta === 'departez' ? '#f59e0b' : 'var(--text-muted)')}>
                  {tendinta === 'apropii' ? 'te apropii' : tendinta === 'departez' ? 'rămâi în urmă' : 'ții pasul'}
                </div>
              )}
            </div>

            {/* DIRECȚIA */}
            <div style="display:flex;align-items:center;justify-content:center;gap:18px">
              <div style={'width:120px;height:120px;border-radius:60px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;transform:rotate(' + (unghiSageata ?? 0) + 'deg);transition:transform .5s ease'}>
                <Icon name="navigate" size={56} color="var(--accent)" />
              </div>
              <div style="text-align:left">
                <div style="font-size:12px;color:var(--text-muted)">{amDirectie ? 'față de direcția ta' : 'față de NORD'}</div>
                {!amDirectie && <div style="font-size:11.5px;color:#f59e0b;max-width:130px;line-height:1.35">Pornește din loc ca să știu încotro mergi</div>}
              </div>
            </div>

            {/* CIFRE DE CONTROL */}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;text-align:center">
                <div style="font-size:11.5px;color:var(--text-muted)">EL MERGE CU</div>
                <div style="font-size:30px;font-weight:800">{vitezaTinta == null ? '—' : vitezaTinta}<span style="font-size:14px;color:var(--text-muted)"> km/h</span></div>
              </div>
              <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;text-align:center">
                <div style="font-size:11.5px;color:var(--text-muted)">TU MERGI CU</div>
                <div style="font-size:30px;font-weight:800">{vitezaMea == null ? '—' : vitezaMea}<span style="font-size:14px;color:var(--text-muted)"> km/h</span></div>
              </div>
            </div>

            {/* PROSPEȚIMEA — cât de veche e informația. Fără asta, ecranul poate minti frumos. */}
            <div style="display:flex;justify-content:center;gap:14px;font-size:12px;color:var(--text-muted)">
              <span>poziția lui: <b style={'color:' + (Date.now() - tinta.at > 120000 ? '#f59e0b' : 'var(--text-primary)')}>{vechime(Date.now() - tinta.at)}</b></span>
              <span>·</span>
              <span>a ta: <b>{eu ? vechime(Date.now() - eu.at) : '—'}</b></span>
              {st && <><span>·</span><span style={'color:' + st.color}>{st.label}</span></>}
            </div>

            {/* NAVIGAȚIA — se relansează la poziția de ACUM. Butonul e mare: se apasă din mers, o dată. */}
            <div style="display:flex;gap:10px;margin-top:2px">
              <button class="btn btn-primary" style="flex:1;padding:16px;font-size:15px;font-weight:700"
                onClick={() => openUrl(`https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`)}>
                <Icon name="navigate" size={17} /> Navighează unde e ACUM
              </button>
              <button class="btn" style="padding:16px" aria-label="Waze"
                onClick={() => openUrl(`https://waze.com/ul?ll=${ll}&navigate=yes`)}>Waze</button>
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);text-align:center;line-height:1.45">
              Navigația te duce unde e mașina <b>în clipa asta</b>. Dacă se depărtează mult, apasă din
              nou — Maps și Waze merg pe Android Auto, ecranul ăsta rămâne pe telefon.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
