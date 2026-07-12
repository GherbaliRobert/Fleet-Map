// Modele 3D REALE de vehicule pe hartă (Three.js + strat custom MapLibre).
// Vehiculele stau pe planul hărții cu direcția lor de mers → la rotirea/înclinarea hărții
// se văd din spate / lateral, păstrându-și orientarea (nu sunt „billboard"-uri plate).
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { Position } from '../api/endpoints';
import { statusOf } from '../lib/status';

const HEX: Record<string, string> = { moving: '#22c55e', idle: '#eab308', stopped: '#ef4444', offline: '#9aa3ad' };
// Mărire față de scara reală — la scara 1:1 o mașină de 4.5m ar fi câțiva pixeli; o exagerăm ca s-o vezi 3D (ca Google).
const SIZE_BOOST = 7;

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

// Construiește un vehicul low-poly. Reper: bot spre +X, sus +Y, roțile jos; unități în „metri".
function buildVehicleMesh(cat: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5 });
  const roofMat = new THREE.MeshStandardMaterial({ color: shade(color, 12), metalness: 0.35, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1b3a55', metalness: 0.7, roughness: 0.15 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#15181d', metalness: 0.2, roughness: 0.8 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#c7ccd3', metalness: 0.8, roughness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#ff5555', emissive: '#ff2222', emissiveIntensity: 0.6 });

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m;
  };
  const wheel = (x: number, z: number, r: number, tw: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tw, 16), wheelMat);
    t.rotation.x = Math.PI / 2; t.position.set(x, r, z); g.add(t);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, tw + 0.02, 12), hubMat);
    hub.rotation.x = Math.PI / 2; hub.position.set(x, r, z); g.add(hub);
  };

  if (cat === 'truck') {
    // Cabină în față + cutie de marfă în spate
    box(2.6, 2.4, 2.5, 2.3, 1.7, 0, bodyMat);                       // cabină
    box(2.2, 1.2, 2.3, 2.6, 2.2, 0, glassMat);                     // parbriz/geamuri cabină (sus)
    box(6.2, 2.9, 2.55, -1.9, 2.0, 0, roofMat);                    // cutie marfă
    box(0.3, 0.5, 2.4, 3.65, 1.0, 0, headMat);                     // far
    box(0.3, 0.5, 2.5, -5.0, 1.2, 0, tailMat);                     // stop spate
    wheel(2.2, 1.15, 0.7, 0.4); wheel(2.2, -1.15, 0.7, 0.4);
    wheel(-3.3, 1.2, 0.75, 0.45); wheel(-3.3, -1.2, 0.75, 0.45);
  } else if (cat === 'van') {
    box(6.2, 2.7, 2.3, 0, 1.7, 0, bodyMat);
    box(1.6, 1.2, 2.1, 2.6, 2.0, 0, glassMat);                     // parbriz
    box(2.2, 1.3, 2.15, 0.2, 2.05, 0, roofMat);                    // luciu plafon
    box(0.3, 0.5, 2.2, 3.2, 1.0, 0, headMat);
    box(0.3, 0.5, 2.2, -3.2, 1.2, 0, tailMat);
    wheel(2.2, 1.05, 0.62, 0.35); wheel(2.2, -1.05, 0.62, 0.35);
    wheel(-2.2, 1.05, 0.62, 0.35); wheel(-2.2, -1.05, 0.62, 0.35);
  } else if (cat === 'bus') {
    box(10.5, 3.1, 2.55, 0, 2.0, 0, bodyMat);
    box(9.6, 1.0, 2.6, 0, 2.6, 0, glassMat);                       // bandă de geamuri
    box(0.3, 0.6, 2.4, 5.3, 1.1, 0, headMat);
    box(0.3, 0.6, 2.4, -5.3, 1.3, 0, tailMat);
    wheel(3.6, 1.15, 0.72, 0.4); wheel(3.6, -1.15, 0.72, 0.4);
    wheel(-3.6, 1.15, 0.72, 0.4); wheel(-3.6, -1.15, 0.72, 0.4);
  } else {
    // Mașină: corp + cabină/greenhouse retrasă, cu geamuri
    box(4.6, 0.95, 1.95, 0, 0.85, 0, bodyMat);                    // corp jos
    box(2.6, 0.85, 1.8, -0.25, 1.55, 0, roofMat);                 // plafon
    box(2.5, 0.7, 1.72, -0.25, 1.5, 0, glassMat);                 // geamuri (parbriz+lunetă)
    box(0.35, 0.45, 1.7, 2.35, 0.75, 0, headMat);                 // faruri
    box(0.35, 0.4, 1.7, -2.35, 0.8, 0, tailMat);                  // stopuri
    wheel(1.5, 1.0, 0.5, 0.28); wheel(1.5, -1.0, 0.5, 0.28);
    wheel(-1.5, 1.0, 0.5, 0.28); wheel(-1.5, -1.0, 0.5, 0.28);
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
  const rec = new Map<string, { outer: THREE.Group; inner: THREE.Group; cat: string; status: string }>();

  return {
    id: 'vehicles-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
      mapRef = map;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const dir = new THREE.DirectionalLight(0xffffff, 1.4); dir.position.set(0.4, -0.7, 1); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.5); dir2.position.set(-0.6, 0.5, 0.8); scene.add(dir2);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as any, antialias: true });
      renderer.autoClear = false;
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
          r = { outer, inner, cat, status: st.status };
          rec.set(v.imei, r);
        }
        const merc = maplibregl.MercatorCoordinate.fromLngLat([v.longitude, v.latitude], 0);
        const scale = merc.meterInMercatorCoordinateUnits() * SIZE_BOOST;
        r.outer.position.set(merc.x, merc.y, merc.z);
        r.outer.scale.set(scale, scale, scale);
        r.inner.rotation.y = (((v.angle || 0) - 90) * Math.PI) / 180; // orientează botul pe direcția de mers (0=N, 90=E, 180=S, 270=V)
        r.outer.visible = use3d;
      }
      for (const [imei, r] of rec) if (!seen.has(imei)) { scene.remove(r.outer); rec.delete(imei); }
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
