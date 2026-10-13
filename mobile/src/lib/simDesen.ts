// @ts-nocheck — copie întocmai a desenului din pagină (public/index.html, blocul „desenul simulatorului"), ca telefonul să
// deseneze planul exact ca web-ul: lateral, de sus, 3D. verify_plan_incarcare.js rulează amândouă funcțiile pe aceleași
// simulări și cere același SVG — schimbi desenul pe web, îl schimbi și aici (copiezi blocul).
// Desenul (lateral, de sus, 3D rotibil) — portat din macheta aprobată; doar desen, din ce trimite serverul. CURAT:
// primește rezultatul simulării, vederea, unghiul și culoarea unei opriri și întoarce SVG-ul. Telefonul are aceeași
// funcție (mobile/src/lib/simDesen.ts); verify_plan_incarcare.js le rulează pe amândouă și cere același desen.
function _simMix(hex, spreAlb, t) {
  const a = parseInt(hex.slice(1), 16), r = (a >> 16) & 255, g = (a >> 8) & 255, b = a & 255, T = spreAlb ? 255 : 0;
  return 'rgb(' + Math.round(r + (T - r) * t) + ',' + Math.round(g + (T - g) * t) + ',' + Math.round(b + (T - b) * t) + ')';
}
function _simSvg(R, view, yaw, culoare) {
  if (!R) return '';
  const VBW = 960, VBH = 330, bodies = R.corpuri, boxes = R.cutii, trac = R.trac;
  const axX = R.axe.map((a) => a.x);
  const cabLen = trac ? 2.3 : (R.vehicul.fel === 'duba35' ? 1.5 : 2.1), gap = trac ? 0.45 : 0.12;
  const cabX1 = -gap, cabX0 = Math.min(-gap - cabLen, (axX.length ? axX[0] : 0) - 0.8);   // cabina cuprinde axa din față
  const cabH = trac ? 3.0 : Math.min(bodies[0].H + 0.25, 2.9);
  const last = bodies[bodies.length - 1], endX = last.x0 + last.L;
  let Wmax = 0, Hmax = 0; bodies.forEach((B) => { Wmax = Math.max(Wmax, B.W); Hmax = Math.max(Hmax, B.H); });
  const back = [], front = [], wheels = [], lines = [], texts = []; let polys = [];
  const P2s = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
  const remBara = bodies[1] ? [bodies[0].L, bodies[1].x0] : null;
  if (view === 'lat') {
    const oy = VBH - 58, totLen = (cabX1 - cabX0) + endX + Wmax * 0.35;
    const s = Math.min((VBW - 60) / totLen, (oy - 16) / (Math.max(Hmax, cabH) * 0.8 + Wmax * 0.5), 95);
    const ox = 30 - cabX0 * s + ((VBW - 60) - totLen * s) / 2;
    const pr = (x, y, z) => [ox + x * s + y * s * 0.35, oy - z * s * 0.8 - y * s * 0.5];
    const pts = (arr) => arr.map((p) => P2s(pr(p[0], p[1], p[2]))).join(' ');
    const faces = (x0, x1, y0, y1, z0, z1, side, top, end, cls) => [
      { cls, fill: end, pts: pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]) },
      { cls, fill: side, pts: pts([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]) },
      { cls, fill: top, pts: pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) }
    ];
    const W0 = bodies[0].W;
    faces(cabX0, cabX1, W0 * 0.03, W0 * 0.97, 0.15, cabH, null, null, null, 'x').forEach((f, i) => back.push({ cls: ['sim-cab3', 'sim-cab1', 'sim-cab2'][i], pts: f.pts }));
    back.push({ cls: 'sim-geam', pts: pts([[cabX0 + 0.15, W0 * 0.03, cabH * 0.58], [cabX0 + (cabX1 - cabX0) * 0.6, W0 * 0.03, cabH * 0.58], [cabX0 + (cabX1 - cabX0) * 0.6, W0 * 0.03, cabH * 0.9], [cabX0 + 0.15, W0 * 0.03, cabH * 0.9]]) });
    if (remBara) back.push({ cls: 'sim-bara', pts: pts([[remBara[0], W0 / 2 - 0.06, 0.45], [remBara[1], W0 / 2 - 0.06, 0.45], [remBara[1], W0 / 2 + 0.06, 0.45], [remBara[0], W0 / 2 + 0.06, 0.45]]) });
    bodies.forEach((B) => {
      const a = B.x0, b = B.x0 + B.L;
      back.push({ cls: 'sim-podea', pts: pts([[a, 0, 0], [b, 0, 0], [b, B.W, 0], [a, B.W, 0]]) });
      back.push({ cls: 'sim-perete', pts: pts([[a, B.W, 0], [b, B.W, 0], [b, B.W, B.H], [a, B.W, B.H]]) });
      back.push({ cls: 'sim-perete2', pts: pts([[a, 0, 0], [a, B.W, 0], [a, B.W, B.H], [a, 0, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[a, 0, B.H], [b, 0, B.H], [b, B.W, B.H], [a, B.W, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[b, 0, 0], [b, 0, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[a, 0, 0], [b, 0, 0]]) });
    });
    boxes.slice().sort((p, q) => (q.y0 - p.y0) || (p.z0 - q.z0) || ((bodies[p.c].x0 * 100 + p.x0) - (bodies[q.c].x0 * 100 + q.x0))).forEach((bx) => {
      const c = culoare(bx.oprire), X = bodies[bx.c].x0;
      polys = polys.concat(faces(X + bx.x0 / 100, X + bx.x1 / 100, bx.y0 / 100, bx.y1 / 100, bx.z0 / 100, bx.z1 / 100, c, _simMix(c, true, 0.28), _simMix(c, false, 0.3), 'sim-cutie'));
    });
    const r = 0.48 * s * 0.85;
    axX.forEach((x) => { const q = pr(x, 0, 0); wheels.push({ cx: q[0], cy: q[1] + r * 0.35, r }); });
    if (R.kg > 0) { const c1 = pr(R.xcw, 0, 0), c2 = pr(R.xcw, bodies[0].W, 0); lines.push({ cls: 'sim-cg', a: c1, b: c2 }); }
  } else if (view === 'sus') {
    const totS = (cabX1 - cabX0) + endX;
    const s2 = Math.min((VBW - 60) / totS, (VBH - 90) / Wmax);
    const ox2 = 30 - cabX0 * s2 + ((VBW - 60) - totS * s2) / 2, oy2 = (VBH - Wmax * s2) / 2 + 4;
    const q2 = (x, y) => [ox2 + x * s2, oy2 + y * s2];
    const rect = (x0, y0, x1, y1) => [q2(x0, y0), q2(x1, y0), q2(x1, y1), q2(x0, y1)].map(P2s).join(' ');
    back.push({ cls: 'sim-cab1', pts: rect(cabX0, bodies[0].W * 0.03, cabX1, bodies[0].W * 0.97) });
    if (remBara) back.push({ cls: 'sim-bara', pts: rect(remBara[0], bodies[0].W / 2 - 0.06, remBara[1], bodies[0].W / 2 + 0.06) });
    bodies.forEach((B) => { back.push({ cls: 'sim-podea', pts: rect(B.x0, 0, B.x0 + B.L, B.W) }); });
    boxes.slice().sort((p, q) => p.z0 - q.z0).forEach((bx) => {
      const c = culoare(bx.oprire), X = bodies[bx.c].x0;
      const x0 = X + bx.x0 / 100, x1 = X + bx.x1 / 100, y0 = bx.y0 / 100, y1 = bx.y1 / 100;
      polys.push({ cls: 'sim-cutie', fill: c, pts: rect(x0, y0, x1, y1) });
      if (bx.z0 > 0) { const ix = (x1 - x0) * 0.22, iy = (y1 - y0) * 0.22; polys.push({ cls: 'sim-cutie', fill: _simMix(c, true, 0.45), pts: rect(x0 + ix, y0 + iy, x1 - ix, y1 - iy) }); }
    });
    axX.forEach((x) => { lines.push({ cls: 'sim-axa', a: q2(x, -0.22), b: q2(x, Wmax + 0.22) }); });
    if (R.kg > 0) lines.push({ cls: 'sim-cg', a: q2(R.xcw, 0), b: q2(R.xcw, Wmax) });
    const tf = q2(cabX0, -0.35), tu = q2(endX, -0.35), ta = q2(axX[axX.length - 1], Wmax + 0.62);
    texts.push({ x: tf[0], y: tf[1], a: 'start', t: 'față' }, { x: tu[0], y: tu[1], a: 'end', t: 'uși' }, { x: ta[0], y: ta[1], a: 'middle', t: 'axe' });
  } else {
    const phi = yaw * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi), SA = 0.55, CA = 0.83;
    const cxw = (cabX0 + endX) / 2, cyw = Wmax / 2;
    const r3 = (x, y, z) => { const dx = x - cxw, dy = y - cyw, yr = dx * sp + dy * cp; return [dx * cp - dy * sp, yr * SA - z * CA, yr]; };
    let mnU = 1e9, mxU = -1e9, mnV = 1e9, mxV = -1e9;
    const acc = (x, y, z) => { const p = r3(x, y, z); mnU = Math.min(mnU, p[0]); mxU = Math.max(mxU, p[0]); mnV = Math.min(mnV, p[1]); mxV = Math.max(mxV, p[1]); };
    const corners = (x0, x1, y0, y1, z0, z1, fn) => { [x0, x1].forEach((x) => { [y0, y1].forEach((y) => { [z0, z1].forEach((z) => fn(x, y, z)); }); }); };
    bodies.forEach((B) => corners(B.x0, B.x0 + B.L, 0, B.W, 0, B.H, acc));
    corners(cabX0, cabX1, 0, bodies[0].W, 0, cabH, acc);
    const s3 = Math.min((VBW - 50) / (mxU - mnU), (VBH - 40) / (mxV - mnV));
    const ox3 = (VBW - (mxU - mnU) * s3) / 2 - mnU * s3, oy3 = (VBH - (mxV - mnV) * s3) / 2 - mnV * s3;
    const p3 = (x, y, z) => { const p = r3(x, y, z); return [ox3 + p[0] * s3, oy3 + p[1] * s3]; };
    const pts3 = (arr) => arr.map((p) => P2s(p3(p[0], p[1], p[2]))).join(' ');
    const box3 = (x0, x1, y0, y1, z0, z1, baza, cls, clsF) => {
      const f = [], cut = cls === 'sim-cutie';
      const ch = (nume, fill, pp) => f.push(cut ? { cls, fill, pts: pts3(pp) } : { cls: clsF[nume], pts: pts3(pp) });
      if (sp > 0.001) ch('cap', cut ? _simMix(baza, false, 0.3) : null, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
      if (sp < -0.001) ch('cap', cut ? _simMix(baza, false, 0.3) : null, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]]);
      if (cp > 0.001) ch('lat', baza, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
      if (cp < -0.001) ch('lat', baza, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
      ch('sus', cut ? _simMix(baza, true, 0.28) : null, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      return f;
    };
    const cab = box3(cabX0, cabX1, bodies[0].W * 0.03, bodies[0].W * 0.97, 0.15, cabH, null, 'cab', { cap: 'sim-cab3', lat: 'sim-cab1', sus: 'sim-cab2' });
    const cabD = r3((cabX0 + cabX1) / 2, bodies[0].W / 2, 1)[2], corpD = r3(bodies[0].L / 2, bodies[0].W / 2, 1)[2];
    if (cabD < corpD) cab.forEach((f) => back.push(f));
    bodies.forEach((B) => {
      const a = B.x0, b = B.x0 + B.L;
      back.push({ cls: 'sim-podea', pts: pts3([[a, 0, 0], [b, 0, 0], [b, B.W, 0], [a, B.W, 0]]) });
      [{ d: sp, p: [[b, 0, 0], [b, B.W, 0], [b, B.W, B.H], [b, 0, B.H]] }, { d: -sp, p: [[a, 0, 0], [a, B.W, 0], [a, B.W, B.H], [a, 0, B.H]] },
       { d: cp, p: [[a, B.W, 0], [b, B.W, 0], [b, B.W, B.H], [a, B.W, B.H]] }, { d: -cp, p: [[a, 0, 0], [b, 0, 0], [b, 0, B.H], [a, 0, B.H]] }].forEach((w) => {
        if (w.d > 0.001) front.push({ cls: 'sim-contur', pts: pts3(w.p) }); else back.push({ cls: 'sim-perete', pts: pts3(w.p) });
      });
    });
    boxes.map((bx) => { const X = bodies[bx.c].x0; return { bx, d: r3(X + (bx.x0 + bx.x1) / 200, (bx.y0 + bx.y1) / 200, 0)[2], z: bx.z0 }; })
      .sort((p, q) => (Math.round(p.d * 100) - Math.round(q.d * 100)) || (p.z - q.z)).forEach((o) => {
        const bx = o.bx, X = bodies[bx.c].x0;
        polys = polys.concat(box3(X + bx.x0 / 100, X + bx.x1 / 100, bx.y0 / 100, bx.y1 / 100, bx.z0 / 100, bx.z1 / 100, culoare(bx.oprire), 'sim-cutie'));
      });
    if (cabD >= corpD) cab.forEach((f) => front.push(f));
    if (R.kg > 0) lines.push({ cls: 'sim-cg', a: p3(R.xcw, 0, 0), b: p3(R.xcw, Wmax, 0) });
  }
  const poli = (p) => '<polygon class="' + p.cls + '" points="' + p.pts + '"' + (p.fill ? ' fill="' + p.fill + '"' : '') + '></polygon>';
  return back.map(poli).join('') +
    wheels.map((w) => '<circle class="sim-roata" cx="' + w.cx.toFixed(1) + '" cy="' + w.cy.toFixed(1) + '" r="' + w.r.toFixed(1) + '"></circle>').join('') +
    polys.map(poli).join('') +
    lines.map((l) => '<line class="' + l.cls + '" x1="' + l.a[0].toFixed(1) + '" y1="' + l.a[1].toFixed(1) + '" x2="' + l.b[0].toFixed(1) + '" y2="' + l.b[1].toFixed(1) + '"></line>').join('') +
    front.map(poli).join('') +
    texts.map((t) => '<text class="sim-tl" x="' + t.x.toFixed(1) + '" y="' + t.y.toFixed(1) + '" text-anchor="' + t.a + '">' + t.t + '</text>').join('');
}
export { _simSvg as simSvg, _simMix as simMix };
