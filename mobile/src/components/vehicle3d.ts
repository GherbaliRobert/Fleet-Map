// Modele 3D REALE de vehicule pe hartă (Three.js + strat custom MapLibre).
// Vehiculele stau pe planul hărții cu direcția lor de mers → la rotirea/înclinarea hărții
// se văd din spate / lateral, păstrându-și orientarea (nu sunt „billboard"-uri plate).
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { Position } from '../api/endpoints';
import { statusOf } from '../lib/status';

const HEX: Record<string, string> = { moving: '#22c55e', idle: '#eab308', stopped: '#ef4444', offline: '#9aa3ad' };
// Mărime CONSTANTĂ PE ECRAN (ca un marker): mașina ~40px lungime la ORICE zoom.
// La scară fizică fixă era invizibilă la zoom mic și monstruoasă la zoom mare.
const CAR_TARGET_PX = 40;   // lungimea mașinii pe ecran; camion/autobuz apar proporțional mai lungi
const CAR_LEN_M = 4.7;      // lungimea modelului de mașină în unități-model („metri")
// Metri reali per pixel la zoom/latitudine (MapLibre = tile-uri 512px)
function metersPerPixel(zoom: number, lat: number): number {
  return (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / (512 * Math.pow(2, zoom));
}

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = amt / 100;
  r = Math.round(r + f * (amt < 0 ? r : 255 - r)); g = Math.round(g + f * (amt < 0 ? g : 255 - g)); b = Math.round(b + f * (amt < 0 ? b : 255 - b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function catOf(vt?: string): string {
  const t = String(vt || '').toLowerCase();
  if (/camion|truck|tir|autotractor|betonier|mixer/.test(t)) return 'truck';
  if (/dub|van|micro/.test(t)) return 'van';
  if (/autobuz|bus/.test(t)) return 'bus';
  return 'car';
}

// Construiește un vehicul low-poly RAFINAT. Reper: bot spre +X, sus +Y, roțile jos; unități în „metri".
// Caroseria = PROFIL 2D cu curbe (Shape + Bezier) extrudat pe lățime → siluetă reală (capotă/parbriz/plafon),
// nu cutii lipite. Geamurile = plăci subțiri incastrate pe pante/flancuri. Roți cu jantă, faruri/stopuri mici.
function buildVehicleMesh(cat: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = {
    body: new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#2a4a6b', metalness: 0.75, roughness: 0.15, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: '#20242b', metalness: 0.3, roughness: 0.7 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#17191e', metalness: 0.1, roughness: 0.9 }),
    hub: new THREE.MeshStandardMaterial({ color: '#b9bfc8', metalness: 0.85, roughness: 0.25 }),
    head: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#ffedaa', emissiveIntensity: 0.9 }),
    tail: new THREE.MeshStandardMaterial({ color: '#e33', emissive: '#d00', emissiveIntensity: 0.7 }),
    cargo: new THREE.MeshStandardMaterial({ color: shade(color, -6), metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide }),
  };
  // Profil lateral extrudat pe lățime (centrat pe z)
  const extrude = (shape: THREE.Shape, width: number, m: THREE.Material, noBevel = false) => {
    const geo = new THREE.ExtrudeGeometry(shape, noBevel ? { depth: width, bevelEnabled: false, curveSegments: 10 } : { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
    let geoNI = geo.toNonIndexed ? geo.toNonIndexed() : geo; // normale PLANE per-triunghi (fără gradiente pe flancuri)
    geoNI.scale(1, 1, -1);          // profilele-s desenate în sens orar → flip inversează winding-ul
    geoNI.computeVertexNormals();     // normale corecte după flip (geometrie non-indexată → flat shading curat)
    geoNI.translate(0, 0, width / 2); // recentrare pe z
    const mesh = new THREE.Mesh(geoNI, m); g.add(mesh); return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); if (rz) mesh.rotation.z = rz; g.add(mesh); return mesh;
  };
  const wheel = (x: number, z: number, r: number, tw: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tw, 22), mat.tyre);
    t.rotation.x = Math.PI / 2; t.position.set(x, r, z); g.add(t);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, tw + 0.03, 18), mat.hub);
    hub.rotation.x = Math.PI / 2; hub.position.set(x, r, z); g.add(hub);
  };
  if (cat === 'truck') {
    // Cabină cu parbriz înclinat (profil curbat) + cutie de marfă cu muchii teșite
    const cab = new THREE.Shape();
    cab.moveTo(1.15, 0.55); cab.lineTo(1.15, 2.9); cab.quadraticCurveTo(1.15, 3.1, 1.35, 3.1);
    cab.lineTo(2.4, 3.1); cab.quadraticCurveTo(2.62, 3.08, 2.78, 2.6);   // parbriz înclinat
    cab.lineTo(3.05, 1.7); cab.quadraticCurveTo(3.12, 1.4, 3.12, 1.1);   // botul coboară
    cab.lineTo(3.12, 0.75); cab.quadraticCurveTo(3.12, 0.55, 2.9, 0.55);     extrude(cab, 2.3, mat.body);
    // BANDĂ de sticlă wrap-around (profil extrudat PUȚIN mai lat decât cabina → geamuri pe flancuri + parbriz, fără plăci care ies)
    const gb = new THREE.Shape();
    gb.moveTo(1.38, 2.12); gb.lineTo(1.38, 2.84); gb.lineTo(2.4, 2.84);
    gb.quadraticCurveTo(2.52, 2.82, 2.62, 2.5); gb.lineTo(2.74, 2.12);     extrude(gb, 2.44, mat.glass, true);
    // cutie marfă (dreptunghi rotunjit extrudat)
    const bx = new THREE.Shape();
    bx.moveTo(-4.7, 0.8); bx.lineTo(-4.7, 3.25); bx.quadraticCurveTo(-4.7, 3.42, -4.5, 3.42);
    bx.lineTo(0.75, 3.42); bx.quadraticCurveTo(0.95, 3.42, 0.95, 3.25); bx.lineTo(0.95, 0.98);
    bx.quadraticCurveTo(0.95, 0.8, 0.75, 0.8);     extrude(bx, 2.42, mat.cargo);
    box(0.2, 0.32, 1.85, 3.04, 0.85, 0, mat.head);
    box(0.16, 0.45, 2.3, -4.72, 1.1, 0, mat.tail);
    box(7.6, 0.28, 2.0, -0.7, 0.42, 0, mat.trim);                        // șasiu
    wheel(2.35, 1.02, 0.56, 0.34); wheel(2.35, -1.02, 0.56, 0.34);
    wheel(-2.6, 1.02, 0.58, 0.36); wheel(-2.6, -1.02, 0.58, 0.36);
    wheel(-3.9, 1.02, 0.58, 0.36); wheel(-3.9, -1.02, 0.58, 0.36);
  } else if (cat === 'van') {
    // Dubă: bot scurt înclinat + corp înalt cu plafonul ușor curbat spre spate
    const s = new THREE.Shape();
    s.moveTo(-3.15, 0.5); s.lineTo(-3.15, 2.75); s.quadraticCurveTo(-3.15, 2.95, -2.95, 2.95);   // spate vertical
    s.lineTo(1.4, 2.95); s.quadraticCurveTo(2.1, 2.92, 2.55, 2.35);                              // plafon → parbriz înclinat
    s.quadraticCurveTo(2.9, 1.9, 3.15, 1.35); s.quadraticCurveTo(3.28, 1.05, 3.28, 0.85);        // capotă scurtă → bot
    s.lineTo(3.28, 0.68); s.quadraticCurveTo(3.28, 0.5, 3.05, 0.5);     extrude(s, 2.2, mat.body);
    // bandă de sticlă wrap-around în zona cabinei (urmează panta parbrizului)
    const gv = new THREE.Shape();
    gv.moveTo(1.25, 1.95); gv.lineTo(1.25, 2.72); gv.quadraticCurveTo(1.85, 2.7, 2.3, 2.32);
    gv.quadraticCurveTo(2.6, 2.05, 2.78, 1.95);     extrude(gv, 2.34, mat.glass, true);
    box(0.05, 1.6, 1.7, -3.2, 1.6, 0, mat.trim);                         // rost uși spate
    box(0.2, 0.3, 1.75, 3.18, 0.82, 0, mat.head);
    box(0.14, 0.42, 2.1, -3.14, 1.0, 0, mat.tail);
    wheel(2.1, 0.98, 0.5, 0.3); wheel(2.1, -0.98, 0.5, 0.3);
    wheel(-2.0, 0.98, 0.5, 0.3); wheel(-2.0, -0.98, 0.5, 0.3);
  } else if (cat === 'bus') {
    // Autobuz: corp lung cu colțuri rotunjite + bandă continuă de geamuri wrap-around
    const s = new THREE.Shape();
    s.moveTo(-5.2, 0.5); s.lineTo(-5.2, 2.95); s.quadraticCurveTo(-5.2, 3.25, -4.9, 3.25);
    s.lineTo(4.75, 3.25); s.quadraticCurveTo(5.15, 3.22, 5.25, 2.6);                              // fața ușor înclinată
    s.lineTo(5.3, 0.85); s.quadraticCurveTo(5.3, 0.5, 5.0, 0.5);     extrude(s, 2.45, mat.body);
    const gs = new THREE.Shape();                                         // banda de geamuri (profil extrudat mai lat)
    gs.moveTo(-4.85, 2.02); gs.lineTo(-4.85, 2.8); gs.lineTo(4.75, 2.8);
    gs.quadraticCurveTo(4.98, 2.76, 5.08, 2.35); gs.lineTo(5.14, 2.02);     extrude(gs, 2.59, mat.glass, true);
    box(0.05, 1.45, 0.08, 2.2, 1.28, 1.26, mat.trim); box(0.05, 1.45, 0.08, -1.4, 1.28, 1.26, mat.trim); // uși (rosturi)
    box(0.2, 0.32, 1.9, 5.2, 0.85, 0, mat.head);
    box(0.14, 0.4, 2.25, -5.16, 1.0, 0, mat.tail);
    wheel(3.3, 1.05, 0.55, 0.34); wheel(3.3, -1.05, 0.55, 0.34);
    wheel(-3.3, 1.05, 0.55, 0.34); wheel(-3.3, -1.05, 0.55, 0.34);
  } else {
    // Mașină: corp până la BRÂU + „greenhouse" de sticlă separat (profil extrudat mai îngust) — fără plăci care ies
    const s = new THREE.Shape();
    s.moveTo(-2.28, 0.42); s.lineTo(-2.28, 0.78); s.quadraticCurveTo(-2.28, 0.98, -2.05, 1.0);   // spate + colț portbagaj
    s.lineTo(1.15, 1.04);                                                                          // linia brâului
    s.quadraticCurveTo(1.45, 1.0, 1.8, 0.97); s.lineTo(2.18, 0.93);                               // capotă
    s.quadraticCurveTo(2.38, 0.9, 2.38, 0.66); s.lineTo(2.38, 0.44);                              // bot
    s.quadraticCurveTo(2.38, 0.3, 2.16, 0.3); s.lineTo(-2.06, 0.3);
    s.quadraticCurveTo(-2.28, 0.3, -2.28, 0.42);
    extrude(s, 1.78, mat.body);
    const gh = new THREE.Shape();                                          // greenhouse (parbriz+plafon+lunetă), mai îngust
    gh.moveTo(-1.55, 1.0); gh.quadraticCurveTo(-1.08, 1.06, -0.86, 1.3);   // lunetă
    gh.quadraticCurveTo(-0.6, 1.47, -0.24, 1.47); gh.lineTo(0.42, 1.47);   // plafon
    gh.quadraticCurveTo(0.76, 1.44, 1.02, 1.12); gh.quadraticCurveTo(1.1, 1.02, 1.18, 1.0);       // parbriz
        extrude(gh, 1.5, mat.glass, true);
    box(1.1, 0.06, 1.4, 0.06, 1.49, 0, mat.body); // capac plafon colorat peste greenhouse
    box(0.16, 0.22, 0.5, 2.36, 0.72, 0.5, mat.head); box(0.16, 0.22, 0.5, 2.36, 0.72, -0.5, mat.head);     // faruri
    box(0.12, 0.2, 0.45, -2.26, 0.78, 0.52, mat.tail); box(0.12, 0.2, 0.45, -2.26, 0.78, -0.52, mat.tail); // stopuri
    wheel(1.45, 0.83, 0.42, 0.26); wheel(1.45, -0.83, 0.42, 0.26);
    wheel(-1.45, 0.83, 0.42, 0.26); wheel(-1.45, -0.83, 0.42, 0.26);
  }
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
  const rec = new Map<string, { outer: THREE.Group; inner: THREE.Group; cat: string; status: string; lat: number; unitScale: number }>();
  // Mărime constantă pe ecran: mașina (4.7 unități-model) ocupă mereu ~CAR_TARGET_PX pixeli, indiferent de zoom.
  const rescale = () => {
    if (!mapRef) return;
    const zoom = mapRef.getZoom();
    for (const r of rec.values()) {
      const targetMeters = CAR_TARGET_PX * metersPerPixel(zoom, r.lat); // câți metri reali = 40px la acest zoom/lat
      const s = r.unitScale * (targetMeters / CAR_LEN_M);
      r.outer.scale.set(s, s, s);
    }
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
      scene.add(new THREE.AmbientLight(0xffffff, 1.7));
      const dir = new THREE.DirectionalLight(0xffffff, 0.85); dir.position.set(0.4, -0.7, 1); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.45); dir2.position.set(-0.6, 0.5, 0.8); scene.add(dir2);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as any, antialias: true });
      renderer.autoClear = false;
      map.on('zoom', rescale); // mărimea pe ecran rămâne constantă → re-scală la fiecare schimbare de zoom
    },
    setVisible(v: boolean) { visible = v; if (mapRef) mapRef.triggerRepaint(); },
    sync(vehicles: Position[], use3d: boolean, offlineMin: number) {
      if (!scene) return;
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
          const outer = new THREE.Group(); outer.rotation.x = Math.PI / 2; // ridică modelul y-sus → z-sus (altitudine)
          const inner = new THREE.Group(); outer.add(inner);
          inner.add(buildVehicleMesh(cat, color));
          scene.add(outer);
          r = { outer, inner, cat, status: st.status, lat: v.latitude, unitScale: 1 };
          rec.set(v.imei, r);
        }
        const merc = maplibregl.MercatorCoordinate.fromLngLat([v.longitude, v.latitude], 0);
        r.lat = v.latitude;
        r.unitScale = merc.meterInMercatorCoordinateUnits(); // unități mercator per metru-model (înainte de factorul de zoom)
        r.outer.position.set(merc.x, merc.y, merc.z);
        r.inner.rotation.y = (((v.angle || 0) - 90) * Math.PI) / 180; // orientează botul pe direcția de mers (0=N, 90=E, 180=S, 270=V)
        r.outer.visible = use3d;
      }
      for (const [imei, r] of rec) if (!seen.has(imei)) { scene.remove(r.outer); rec.delete(imei); }
      rescale();
      if (mapRef) mapRef.triggerRepaint();
    },
    render(gl: WebGLRenderingContext, args: any) {
      if (!visible) return;
      const mat = Array.isArray(args) ? args : (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix);
      if (!mat) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(mat as number[]);
      renderer.resetState();
      renderer.render(scene, camera);
      if (mapRef) mapRef.triggerRepaint();
    },
  };
}
