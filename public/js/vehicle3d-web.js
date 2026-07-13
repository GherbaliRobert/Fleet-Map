// Port WEB al modelelor 3D de vehicule (sursă: mobile/src/components/vehicle3d.ts).
// Modul ESM: `three` + addons vin din import-map (CDN); maplibregl din window (UMD global).
// Expune window.RA3D. Logica de randare e IDENTICĂ cu mobilul (deja verificată vizual).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const maplibregl = (typeof window !== 'undefined' && window.maplibregl) || null;

const HEX = { moving: '#22c55e', idle: '#eab308', stopped: '#ef4444', offline: '#9aa3ad' };
// Mărime CONSTANTĂ PE ECRAN (ca un marker): mașina ~CAR_TARGET_PX px lungime la orice zoom.
const CAR_TARGET_PX = 40;
const CAR_LEN_M = 4.7;

function metersPerPixel(zoom, lat) {
  return (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / (512 * Math.pow(2, zoom));
}
function catOf(vt) {
  const t = String(vt || '').toLowerCase();
  if (/camion|truck|tir|autotractor|betonier|mixer/.test(t)) return 'truck';
  if (/dub|van|micro/.test(t)) return 'van';
  if (/autobuz|bus/.test(t)) return 'bus';
  return 'car';
}
// statusOf — portat 1:1 din mobile/src/lib/status.ts (același histerezis ca serverul + web-ul).
const MOVE_MEMORY_MS = 150000;
function statusOf(p, offlineMinutes) {
  const speed = p.speed || 0;
  const ign = !!(p.io && (p.io.ignition === 1 || p.io.ignition === true));
  const online = p.timestamp ? (Date.now() - new Date(p.timestamp).getTime()) < (offlineMinutes || 65) * 60000 : false;
  if (!online) return { status: 'offline' };
  const freshLive = p.timestamp ? (Date.now() - new Date(p.timestamp).getTime()) < 180000 : false;
  const movedAt = p.moved_at;
  const movedRecently = !!(movedAt && (Date.now() - movedAt) < MOVE_MEMORY_MS);
  if ((speed > 3 || (movedRecently && ign)) && freshLive) return { status: 'moving' };
  if (speed > 3) return { status: 'idle' };
  if (ign) return { status: 'idle' };
  return { status: 'stopped' };
}

// ─── Modele .glb (servite din public/models/vehicles) ───
const MODEL_URL = { car: '/models/vehicles/sedan.glb', truck: '/models/vehicles/truck.glb', van: '/models/vehicles/van.glb', bus: '/models/vehicles/bus.glb' };
const MODEL_LEN = { car: 4.7, van: 5.6, truck: 6.8, bus: 11.0 };
const MODEL_YAW = Math.PI / 2; // botul modelelor Rgsdev pe +Z → îl aducem pe +X
const TEMPLATES = {};
let modelsReady = false, loadStarted = false;
const readyCbs = [];

function normalize(root, cat) {
  const box0 = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box0.getSize(size);
  const ctr = new THREE.Vector3(); box0.getCenter(ctr);
  root.position.set(-ctr.x, -box0.min.y, -ctr.z);
  const oriented = new THREE.Group(); oriented.add(root); oriented.rotation.y = MODEL_YAW;
  const lenAxis = Math.max(size.x, size.z);
  const scale = (MODEL_LEN[cat] || CAR_LEN_M) / (lenAxis || 1);
  const tpl = new THREE.Group(); tpl.add(oriented); tpl.scale.setScalar(scale);
  tpl.updateMatrixWorld(true);
  return tpl;
}

function startLoading() {
  if (loadStarted) return; loadStarted = true;
  const loader = new GLTFLoader();
  const load = (cat) => new Promise((resolve) => {
    loader.load(MODEL_URL[cat], (g) => {
      const vByMat = new Map(); const wheelMats = new Set();
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const isWheel = /wheel|tire|tyre|rim/i.test((o.name || '') + ((o.parent && o.parent.name) || ''));
        if (!isWheel && o.geometry) { try { const merged = mergeVertices(o.geometry, 1e-4); merged.computeVertexNormals(); o.geometry = merged; } catch (e) {} }
        const vc = (o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count) || 0;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          m.side = THREE.DoubleSide; m.transparent = false; m.opacity = 1; m.depthWrite = true; m.depthTest = true;
          m.needsUpdate = true;
          if (isWheel) wheelMats.add(m); vByMat.set(m, (vByMat.get(m) || 0) + vc);
        }
      });
      let paint = null, max = -1;
      for (const [m, vc] of vByMat) { if (wheelMats.has(m)) continue; if (vc > max) { max = vc; paint = m; } }
      const tpl = normalize(g.scene, cat); tpl.userData.paintMat = paint;
      TEMPLATES[cat] = tpl; resolve();
    }, undefined, () => resolve());
  });
  Promise.all(['car', 'truck', 'van', 'bus'].map(load)).then(() => {
    modelsReady = true; const cbs = readyCbs.splice(0); cbs.forEach((cb) => { try { cb(); } catch (e) {} });
  });
}

function buildVehicleMesh(cat, color) {
  const g = new THREE.Group();
  const tpl = TEMPLATES[cat] || TEMPLATES.car;
  if (tpl) {
    const clone = tpl.clone(true);
    const paint = tpl.userData.paintMat;
    if (paint) {
      const col = new THREE.Color(color);
      clone.traverse((o) => {
        if (o.isMesh && o.material === paint) {
          const m = o.material.clone(); m.color = col.clone();
          if ('emissive' in m) m.emissive = col.clone().multiplyScalar(0.05);
          if ('metalness' in m) m.metalness = 0.0;
          if ('roughness' in m) m.roughness = 0.62;
          o.material = m;
        }
      });
    }
    g.add(clone);
  }
  const len = MODEL_LEN[cat] || CAR_LEN_M;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(len * 0.5, len * 0.56, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  return g;
}

function createVehicleLayer() {
  let renderer, scene, camera, mapRef;
  let visible = true;
  let lastArgs = null;
  const rec = new Map();

  const rescale = () => {
    if (!mapRef) return;
    const zoom = Math.min(mapRef.getZoom(), 20);
    const tilt = 1 + (mapRef.getPitch() / 90) * 0.3;
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
    const seen = new Set();
    for (const v of vehicles) {
      if (v.latitude == null || v.longitude == null) continue;
      seen.add(v.imei);
      const st = statusOf(v, offlineMin);
      const color = HEX[st.status] || HEX.stopped;
      const cat = catOf(v.vehicle_type);
      let r = rec.get(v.imei);
      if (!r || r.cat !== cat || r.status !== st.status) {
        if (r) scene.remove(r.outer);
        const outer = new THREE.Group(); outer.rotation.x = Math.PI / 2;
        const inner = new THREE.Group(); outer.add(inner);
        inner.add(buildVehicleMesh(cat, color));
        outer.traverse((o) => { o.frustumCulled = false; });
        scene.add(outer);
        r = { outer, inner, cat, status: st.status, lat: v.latitude, unitScale: 1, mx: 0, my: 0, mz: 0 };
        rec.set(v.imei, r);
      }
      const merc = maplibregl.MercatorCoordinate.fromLngLat([v.longitude, v.latitude], 0);
      r.lat = v.latitude;
      r.unitScale = merc.meterInMercatorCoordinateUnits();
      r.mx = merc.x; r.my = merc.y; r.mz = merc.z;
      r.outer.position.set(merc.x, merc.y, merc.z);
      r.inner.rotation.y = (((v.angle || 0) - 90) * Math.PI) / 180;
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
    onAdd(map, gl) {
      mapRef = map;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.3));
      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const dir = new THREE.DirectionalLight(0xffffff, 1.25); dir.position.set(0.6, 1.0, 0.7); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.5); dir2.position.set(-0.6, 0.4, -0.5); scene.add(dir2);
      map.on('zoom', rescale); map.on('pitch', rescale);
    },
    setVisible(v) { visible = v; if (mapRef) mapRef.triggerRepaint(); },
    sync(vehicles, use3d, offlineMin) {
      lastArgs = { vehicles, use3d, offlineMin };
      if (!scene) return;
      if (!modelsReady) { startLoading(); if (readyCbs.indexOf(doSync) < 0) readyCbs.push(doSync); return; }
      doSync();
    },
    render(gl, args) {
      if (!visible) return;
      const mat = Array.isArray(args) ? args : (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix);
      if (!mat) return;
      const c = mapRef.getCenter();
      const A = maplibregl.MercatorCoordinate.fromLngLat([c.lng, c.lat], 0);
      for (const r of rec.values()) r.outer.position.set(r.mx - A.x, r.my - A.y, r.mz - A.z);
      const m = new THREE.Matrix4().fromArray(mat);
      m.multiply(new THREE.Matrix4().makeTranslation(A.x, A.y, A.z));
      camera.projectionMatrix = m;
      renderer.resetState();
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}

window.RA3D = { createVehicleLayer, catOf, metersPerPixel, statusOf, startLoading, buildVehicleMesh, HEX };
