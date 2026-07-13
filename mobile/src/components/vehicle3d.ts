// Modele 3D REALE de vehicule pe hartă (Three.js + strat custom MapLibre).
// Folosim modele elegante „Free Low Poly Vehicles Pack" de Rgsdev (licență CC0 — domeniu public,
// opengameart.org, culori pe materiale). Fiecare vehicul e un .glb așezat pe planul hărții cu
// direcția lui de mers → la rotirea/înclinarea hărții se văd spatele și lateralul. Starea
// (mișcare/ralanti/oprit/offline) e redată printr-un inel colorat la sol.
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Position } from '../api/endpoints';
import { statusOf } from '../lib/status';
import sedanUrl from '../assets/vehicles/sedan.glb?url';
import truckUrl from '../assets/vehicles/truck.glb?url';
import vanUrl from '../assets/vehicles/van.glb?url';
import busUrl from '../assets/vehicles/bus.glb?url';

const HEX: Record<string, string> = { moving: '#22c55e', idle: '#eab308', stopped: '#ef4444', offline: '#9aa3ad' };
// Mărime CONSTANTĂ PE ECRAN (ca un marker): mașina ~CAR_TARGET_PX px lungime la orice zoom.
// Mic & discret — modelele mari, înclinate, se aglomerau și arătau grosolan.
const CAR_TARGET_PX = 40;
const CAR_LEN_M = 4.7; // lungimea de referință (mașina) în „metri"-model; restul cresc proporțional

// Metri reali per pixel la zoom/latitudine (MapLibre = tile-uri 512px)
function metersPerPixel(zoom: number, lat: number): number {
  return (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / (512 * Math.pow(2, zoom));
}
function catOf(vt?: string): string {
  const t = String(vt || '').toLowerCase();
  if (/camion|truck|tir|autotractor|betonier|mixer/.test(t)) return 'truck';
  if (/dub|van|micro/.test(t)) return 'van';
  if (/autobuz|bus/.test(t)) return 'bus';
  return 'car';
}

// ─── Încărcarea + normalizarea modelelor .glb (o singură dată, cache la nivel de modul) ───
const MODEL_URL: Record<string, string> = { car: sedanUrl, truck: truckUrl, van: vanUrl, bus: busUrl };
const MODEL_LEN: Record<string, number> = { car: 4.7, van: 5.6, truck: 6.8, bus: 11.0 }; // lungimi „reale" (m) → scară relativă
const MODEL_YAW = Math.PI / 2; // rotim modelul (bot pe +Z în pachetul Rgsdev) astfel încât botul să fie pe +X
const TEMPLATES: Record<string, THREE.Group> = {};
let modelsReady = false;
let loadStarted = false;
const readyCbs: Array<() => void> = [];

// Normalizează un model: centrat pe X/Z, roțile pe y=0, botul pe +X, lungime = MODEL_LEN[cat] „metri".
function normalize(root: THREE.Object3D, cat: string): THREE.Group {
  const box0 = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box0.getSize(size);
  const ctr = new THREE.Vector3(); box0.getCenter(ctr);
  root.position.set(-ctr.x, -box0.min.y, -ctr.z); // centrează pe XZ, pune baza pe y=0
  const oriented = new THREE.Group(); oriented.add(root); oriented.rotation.y = MODEL_YAW; // bot → +X
  const lenAxis = Math.max(size.x, size.z);       // axa lungă a modelului (Kenney: Z)
  const scale = (MODEL_LEN[cat] || CAR_LEN_M) / (lenAxis || 1);
  const tpl = new THREE.Group(); tpl.add(oriented); tpl.scale.setScalar(scale);
  tpl.updateMatrixWorld(true);
  return tpl;
}

function startLoading() {
  if (loadStarted) return; loadStarted = true;
  const loader = new GLTFLoader();
  const load = (cat: string) => new Promise<void>((resolve) => {
    loader.load(MODEL_URL[cat], (g) => {
      // Detectăm materialul „vopsea" (caroseria) = cel cu cei mai mulți vertecși, EXCLUZÂND roțile
      // (jante/anvelope). Îl vom re-colora per-vehicul în culoarea stării (paleta Rgsdev e prea închisă).
      const vByMat = new Map<any, number>(); const wheelMats = new Set<any>();
      g.scene.traverse((o: any) => {
        if (!o.isMesh) return;
        const isWheel = /wheel|tire|tyre|rim/i.test((o.name || '') + (o.parent?.name || ''));
        const vc = o.geometry?.attributes?.position?.count || 0;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          // Conversia FBX→GLB lasă fețe cu winding inconsecvent → back-face culling face „găuri" (model rupt).
          // DoubleSide le desenează pe toate; forțăm opac + depth ca să nu se vadă prin ele.
          m.side = THREE.DoubleSide; m.transparent = false; m.opacity = 1; m.depthWrite = true; m.depthTest = true; m.needsUpdate = true;
          if (isWheel) wheelMats.add(m); vByMat.set(m, (vByMat.get(m) || 0) + vc);
        }
      });
      let paint: any = null, max = -1;
      for (const [m, vc] of vByMat) { if (wheelMats.has(m)) continue; if (vc > max) { max = vc; paint = m; } }
      const tpl = normalize(g.scene, cat); (tpl.userData as any).paintMat = paint;
      TEMPLATES[cat] = tpl; resolve();
    }, undefined, () => resolve());
  });
  Promise.all(['car', 'truck', 'van', 'bus'].map(load)).then(() => {
    modelsReady = true; const cbs = readyCbs.splice(0); cbs.forEach((cb) => { try { cb(); } catch {} });
  });
}

// Construiește vizualul unui vehicul: clona modelului 3D (cu caroseria vopsită în culoarea stării)
// + un inel discret la sol. Bot pe +X.
function buildVehicleMesh(cat: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const tpl = TEMPLATES[cat] || TEMPLATES.car;
  if (tpl) {
    const clone = tpl.clone(true); // materialele sunt PARTAJATE cu template-ul (clone() nu le copiază)
    const paint = (tpl.userData as any).paintMat;
    if (paint) {
      const col = new THREE.Color(color);
      clone.traverse((o: any) => {
        if (o.isMesh && o.material === paint) {           // doar caroseria → culoarea stării
          const m = o.material.clone(); m.color = col.clone();
          if ('emissive' in m) m.emissive = col.clone().multiplyScalar(0.14);
          if ('metalness' in m) m.metalness = 0.25;
          if ('roughness' in m) m.roughness = 0.55;
          o.material = m;
        }
      });
    }
    g.add(clone);
  }
  // Inel SUBȚIRE și discret la sol — doar un indiciu de stare/țintă, fără să aglomereze
  const len = MODEL_LEN[cat] || CAR_LEN_M;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(len * 0.5, len * 0.56, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  return g;
}

export interface VehicleLayer extends maplibregl.CustomLayerInterface {
  sync(vehicles: Position[], use3d: boolean, offlineMin: number): void;
  setVisible(v: boolean): void;
}

export function createVehicleLayer(): VehicleLayer {
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let mapRef: maplibregl.Map;
  let visible = true;
  let lastArgs: { vehicles: Position[]; use3d: boolean; offlineMin: number } | null = null;
  const rec = new Map<string, { outer: THREE.Group; inner: THREE.Group; cat: string; status: string; lat: number; unitScale: number; mx: number; my: number; mz: number }>();

  // Mărime constantă pe ecran: modelul ocupă mereu ~CAR_TARGET_PX px, indiferent de zoom.
  const rescale = () => {
    if (!mapRef) return;
    // Peste ~z20 scara mercator devine atât de mică încât matricea hărții pierde precizia float32 și modelul
    // DISPARE. Plafonăm zoom-ul de dimensionare: dincolo de prag mașina crește pe ecran (normal când te
    // apropii de un vehicul), în loc să se micșoreze în unități-lume până la dispariție.
    const zoom = Math.min(mapRef.getZoom(), 20);
    const tilt = 1 + (mapRef.getPitch() / 90) * 0.3; // compensare MICĂ la înclinare (0.9 le umfla enorm)
    for (const r of rec.values()) {
      const targetMeters = CAR_TARGET_PX * tilt * metersPerPixel(zoom, r.lat);
      const s = r.unitScale * (targetMeters / CAR_LEN_M);
      r.outer.scale.set(s, s, s);
    }
    if (mapRef) mapRef.triggerRepaint();
  };

  const doSync = () => {
    const args = lastArgs; if (!scene || !args) return;
    const { vehicles, use3d, offlineMin } = args;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (v.latitude == null || v.longitude == null) continue;
      seen.add(v.imei);
      const st = statusOf(v, offlineMin);
      const color = HEX[st.status] || HEX.stopped;
      const cat = catOf(v.vehicle_type);
      let r = rec.get(v.imei);
      if (!r || r.cat !== cat || r.status !== st.status) {
        if (r) scene.remove(r.outer);
        const outer = new THREE.Group(); outer.rotation.x = Math.PI / 2; // model y-sus → z-sus (altitudine)
        const inner = new THREE.Group(); outer.add(inner);
        inner.add(buildVehicleMesh(cat, color));
        // La zoom mare scara devine ~1e-9 → sfera de încadrare a Three.js pică testul de frustum (precizie
        // float) și modelul DISPARE. Dezactivăm culling-ul per-obiect: harta oricum clipează corect.
        outer.traverse((o) => { o.frustumCulled = false; });
        scene.add(outer);
        r = { outer, inner, cat, status: st.status, lat: v.latitude, unitScale: 1, mx: 0, my: 0, mz: 0 };
        rec.set(v.imei, r);
      }
      const merc = maplibregl.MercatorCoordinate.fromLngLat([v.longitude, v.latitude], 0);
      r.lat = v.latitude;
      r.unitScale = merc.meterInMercatorCoordinateUnits(); // unități mercator per metru-model (fără factorul de zoom)
      r.mx = merc.x; r.my = merc.y; r.mz = merc.z;         // poziția ABSOLUTĂ; în render() o punem RELATIV la ancoră (precizie)
      r.outer.position.set(merc.x, merc.y, merc.z);
      r.inner.rotation.y = (((v.angle || 0) - 90) * Math.PI) / 180; // bot pe direcția de mers (0=N,90=E,180=S,270=V)
      r.outer.visible = use3d;
    }
    for (const [imei, r] of rec) if (!seen.has(imei)) { scene.remove(r.outer); rec.delete(imei); }
    rescale();
    if (mapRef) mapRef.triggerRepaint();
  };

  return {
    id: 'vehicles-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
      mapRef = map;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x99a2ad, 1.5)); // cer/sol → fill uniform, fără fețe negre
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dir = new THREE.DirectionalLight(0xffffff, 1.5); dir.position.set(0.6, 1.0, 0.7); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.6); dir2.position.set(-0.6, 0.4, -0.5); scene.add(dir2);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as any, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace; // culori corecte pentru texturile glTF
      map.on('zoom', rescale); map.on('pitch', rescale);
    },
    setVisible(v: boolean) { visible = v; if (mapRef) mapRef.triggerRepaint(); },
    sync(vehicles: Position[], use3d: boolean, offlineMin: number) {
      lastArgs = { vehicles, use3d, offlineMin };
      if (!scene) return;
      if (!modelsReady) { startLoading(); if (readyCbs.indexOf(doSync) < 0) readyCbs.push(doSync); return; }
      doSync();
    },
    render(gl: WebGLRenderingContext, args: any) {
      if (!visible) return;
      const mat = Array.isArray(args) ? args : (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix);
      if (!mat) return;
      // Reper-de-precizie: la zoom mare, coordonatele mercator absolute (~0.57) + extinderea minusculă a
      // modelului depășesc precizia float32 pe GPU → geometria se „strică". Așezăm modelele RELATIV la o
      // ancoră (centrul hărții) astfel încât GPU-ul să primească doar numere mici, și compensăm ancora în
      // matricea de proiecție (calcul în float64 pe CPU). Rezultat identic, dar stabil la orice zoom.
      const c = mapRef.getCenter();
      const A = maplibregl.MercatorCoordinate.fromLngLat([c.lng, c.lat], 0);
      for (const r of rec.values()) r.outer.position.set(r.mx - A.x, r.my - A.y, r.mz - A.z);
      const m = new THREE.Matrix4().fromArray(mat as number[]);
      m.multiply(new THREE.Matrix4().makeTranslation(A.x, A.y, A.z));
      camera.projectionMatrix = m;
      renderer.resetState();
      renderer.clearDepth(); // desenăm vehiculele PESTE dale (fără ocluzie de la depth-ul hărții la zoom mare)
      renderer.render(scene, camera);
      // FĂRĂ triggerRepaint aici: ar forța o buclă de randare la fiecare frame (consum de baterie/GPU).
      // Harta re-randează stratul la mișcare/zoom, iar sync()/rescale() cheamă triggerRepaint la nevoie.
    },
  };
}
