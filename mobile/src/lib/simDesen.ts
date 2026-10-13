// @ts-nocheck — copie întocmai a desenului din pagină (public/index.html, blocul „desenul simulatorului"), ca telefonul să
// deseneze planul exact ca web-ul: lateral, de sus, 3D. verify_plan_incarcare.js rulează amândouă funcțiile pe aceleași
// simulări și cere același SVG — schimbi desenul pe web, îl schimbi și aici (copiezi blocul).
// Desenul (lateral, de sus, 3D rotibil) — doar desen, din ce trimite serverul. CURAT: primește rezultatul simulării,
// vederea, unghiul și culoarea unei opriri și întoarce SVG-ul. Telefonul are aceeași funcție (mobile/src/lib/simDesen.ts);
// verify_plan_incarcare.js le rulează pe amândouă și cere același desen.
// 13.10 (Robert: „vreau să avem desenele mai realiste, cel puțin mașina arată rău"): vehiculul se desenează ca un
// vehicul — cabina cu parbriz înclinat, geam, ușă, far, bară, oglinzi și aripa roții; duba cu capotă; șasiul, rezervorul,
// picioarele semiremorcii, roțile cu jantă (și în 3D), umbra pe drum. Se desenează doar fețele întoarse spre privitor
// (normala față de direcția privirii `V`), ca un corp să nu-și acopere singur fețele.
function _simMix(hex, spreAlb, t) {
  const a = parseInt(hex.slice(1), 16), r = (a >> 16) & 255, g = (a >> 8) & 255, b = a & 255, T = spreAlb ? 255 : 0;
  return 'rgb(' + Math.round(r + (T - r) * t) + ',' + Math.round(g + (T - g) * t) + ',' + Math.round(b + (T - b) * t) + ')';
}
function _simSvg(R, view, yaw, culoare) {
  if (!R) return '';
  const VBW = 960, VBH = 330, bodies = R.corpuri, boxes = R.cutii, trac = R.trac, duba = R.vehicul.fel === 'duba35';
  const axX = R.axe.map((a) => a.x);
  const axVeh = R.axe.filter((a) => a.sub === R.axe[0].sub).map((a) => a.x);   // axele vehiculului (nu ale remorcii)
  const G = duba ? 0.62 : 1.15, rw = duba ? 0.34 : 0.5, zr = -G + rw;           // podeaua de marfă față de drum; roata
  const cabLen = trac ? 2.3 : (duba ? 1.5 : 2.1), gap = trac ? 0.45 : 0.12;
  const cabX1 = -gap, cabX0 = Math.min(-gap - cabLen, (axX.length ? axX[0] : 0) - 0.8);   // cabina cuprinde axa din față
  const cabH = trac ? 2.75 : (duba ? bodies[0].H + 0.05 : Math.min(bodies[0].H * 0.92, 2.4));
  const f = cabX0, r = cabX1, Lc = r - f, zb = -G + (duba ? 0.25 : 0.35), zw = zb + (cabH - zb) * 0.5, zc = zb + 0.62;
  const last = bodies[bodies.length - 1], endX = last.x0 + last.L;
  let Wmax = 0, Hmax = 0; bodies.forEach((B) => { Wmax = Math.max(Wmax, B.W); Hmax = Math.max(Hmax, B.H); });
  const W0 = bodies[0].W, cy0 = W0 * 0.03, cy1 = W0 * 0.97;
  const back = [], mid = [], front = [], lines = [], texts = []; let polys = [];
  const P2s = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
  const remBara = bodies[1] ? [bodies[0].L, bodies[1].x0] : null;
  // Un corp drept: profil în x–z (sens trigonometric, z în sus), întins pe y de la yA la yB. Doar fețele întoarse spre
  // privitor (normala · V > 0); `cl` = clasele { lat, sus, cap, geam }, `geam` = muchiile (indici) care sunt geam.
  const prisma = (prof, yA, yB, P, V, cl, geam) => {
    const out = [], pp = (arr) => arr.map((q) => P2s(P(q[0], q[1], q[2]))).join(' ');
    if (-V[1] > 1e-6) out.push({ cls: cl.lat, pts: pp(prof.map((q) => [q[0], yA, q[1]])) });
    if (V[1] > 1e-6) out.push({ cls: cl.lat, pts: pp(prof.map((q) => [q[0], yB, q[1]])) });
    prof.forEach((a, i) => {
      const b = prof[(i + 1) % prof.length], nx = b[1] - a[1], nz = a[0] - b[0];
      if (nx * V[0] + nz * V[2] <= 1e-6) return;
      const cls = geam && geam.indexOf(i) >= 0 ? cl.geam : (nz / (Math.hypot(nx, nz) || 1) > 0.7 ? cl.sus : cl.cap);
      out.push({ cls, pts: pp([[a[0], yA, a[1]], [b[0], yA, b[1]], [b[0], yB, b[1]], [a[0], yB, a[1]]]) });
    });
    return out;
  };
  const cutie = (x0, x1, y0, y1, z0, z1, P, V, c) => prisma([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, P, V, { lat: c, sus: c, cap: c });
  // Cabina: la camion și autotractor un singur corp (parbrizul = muchia 4); la dubă, capota și partea de sus.
  const CAB = { lat: 'sim-cab1', sus: 'sim-cab2', cap: 'sim-cab3', geam: 'sim-parbriz' };
  const cabine = duba
    ? [{ prof: [[f, zb], [r, zb], [r, zc], [f + 0.03, zc - 0.12]] }, { prof: [[f + 0.5, zc], [r, zc], [r, cabH], [f + 0.95, cabH]], geam: [3] }]
    : [{ prof: [[f, zb], [r, zb], [r, cabH], [f + 0.48, cabH], [f + 0.36, cabH - 0.08], [f + 0.1, zw]], geam: [4] }];
  const cerc = (x, y, zc0, rr, P) => { const a = []; for (let i = 0; i < 18; i++) { const t = i * Math.PI / 9; a.push(P2s(P(x + rr * Math.cos(t), y, zc0 + rr * Math.sin(t)))); } return a.join(' '); };
  const roata = (x, y, P, departe) => (departe ? [{ cls: 'sim-roata2', pts: cerc(x, y, zr, rw, P) }]
    : [{ cls: 'sim-roata', pts: cerc(x, y, zr, rw, P) }, { cls: 'sim-janta', pts: cerc(x, y, zr, rw * 0.6, P) }, { cls: 'sim-butuc', pts: cerc(x, y, zr, rw * 0.2, P) }]);
  // Ce se vede pe partea cabinei întoarsă spre privitor (y): aripa roții din față, geamul, ușa, farul, bara.
  const detalii = (y, P) => {
    const pp = (arr) => arr.map((q) => P2s(P(q[0], y, q[1]))).join(' '), d = [];
    axVeh.filter((x) => x > f && x < r).forEach((x) => {
      const a = [], ra = rw * 1.18;
      for (let i = 0; i <= 12; i++) { const t = i * Math.PI / 12; a.push([x + ra * Math.cos(t), Math.max(zb, zr + ra * Math.sin(t))]); }
      d.push({ cls: 'sim-aripa', pts: pp(a) });
    });
    if (duba) {
      d.push({ cls: 'sim-geam', pts: pp([[f + 0.62, zc + 0.08], [f + 0.98, cabH - 0.12], [r - 0.08, cabH - 0.12], [r - 0.08, zc + 0.08]]) });
      d.push({ cls: 'sim-usa', pts: pp([[f + 0.55, zb + 0.12], [r - 0.04, zb + 0.12], [r - 0.04, cabH - 0.06], [f + 0.95, cabH - 0.06], [f + 0.5, zc + 0.02]]) });
      d.push({ cls: 'sim-far', pts: pp([[f, zc - 0.32], [f + 0.16, zc - 0.32], [f + 0.16, zc - 0.2], [f, zc - 0.2]]) });
      d.push({ cls: 'sim-barafata', pts: pp([[f - 0.02, zb], [f + 0.4, zb], [f + 0.4, zb + 0.18], [f - 0.02, zb + 0.18]]) });
    } else {
      const xg = f + Math.min(Lc * 0.55, 1.25);
      d.push({ cls: 'sim-geam', pts: pp([[f + 0.2, zw + 0.06], [f + 0.38, cabH - 0.18], [xg, cabH - 0.18], [xg, zw + 0.06]]) });
      d.push({ cls: 'sim-usa', pts: pp([[f + 0.12, zb + 0.32], [xg + 0.06, zb + 0.32], [xg + 0.06, cabH - 0.1], [f + 0.36, cabH - 0.1], [f + 0.1, zw]]) });
      d.push({ cls: 'sim-far', pts: pp([[f, zb + 0.34], [f + 0.18, zb + 0.34], [f + 0.18, zb + 0.48], [f, zb + 0.48]]) });
      d.push({ cls: 'sim-barafata', pts: pp([[f - 0.03, zb], [f + 0.6, zb], [f + 0.6, zb + 0.28], [f - 0.03, zb + 0.28]]) });
    }
    return d;
  };
  // Fața cabinei (se vede doar din față, în 3D): bara, grila și farurile, pe planul ei ușor înclinat.
  const fata = (P) => {
    const z0 = duba ? zc - 0.12 : zw, dx = duba ? 0.03 : 0.1, x = (z) => f + dx * (z - zb) / (z0 - zb) - 0.005;
    const quad = (ya, yb, za, zb2, cls) => ({ cls, pts: [[x(za), ya, za], [x(za), yb, za], [x(zb2), yb, zb2], [x(zb2), ya, zb2]].map((q) => P2s(P(q[0], q[1], q[2]))).join(' ') });
    const zf = duba ? [zc - 0.32, zc - 0.2] : [zb + 0.32, zb + 0.48];
    return [quad(cy0, cy1, zb, zb + (duba ? 0.18 : 0.28), 'sim-barafata'),
      quad(W0 * 0.24, W0 * 0.76, zb + (duba ? 0.22 : 0.36), z0 - (duba ? 0.1 : 0.12), 'sim-grila'),
      quad(W0 * 0.06, W0 * 0.2, zf[0], zf[1], 'sim-far'), quad(W0 * 0.8, W0 * 0.94, zf[0], zf[1], 'sim-far')];
  };
  // Oglinda de pe o parte (y < cabină = cea dinspre privitor în lateral).
  const oglinda = (lat, P, V) => {
    const x0 = duba ? f + 0.42 : f - 0.16, z0 = duba ? zc + 0.1 : zw - 0.05, z1 = duba ? zc + 0.42 : zw + 0.55;
    return lat < 0 ? cutie(x0, x0 + 0.1, cy0 - 0.24, cy0 - 0.15, z0, z1, P, V, 'sim-oglinda') : cutie(x0, x0 + 0.1, cy1 + 0.15, cy1 + 0.24, z0, z1, P, V, 'sim-oglinda');
  };
  // Sub corpuri: șasiul vehiculului (și al remorcii / semiremorcii), rezervorul, picioarele semiremorcii.
  const dedesubt = (P, V) => {
    const o = [];
    if (duba) return o;
    const chEnd = trac ? Math.max.apply(null, axVeh) + 0.9 : bodies[0].x0 + bodies[0].L - 0.05;
    o.push(...cutie(f + 0.25, chEnd, W0 * 0.2, W0 * 0.8, -G + 0.62, -0.22, P, V, 'sim-sasiu'));
    (trac ? bodies : bodies.slice(1)).forEach((B) => o.push(...cutie(B.x0 + 0.15, B.x0 + B.L - 0.1, B.W * 0.2, B.W * 0.8, -0.34, -0.04, P, V, 'sim-sasiu')));
    const urm = axVeh.filter((x) => x > r)[0];
    if (urm != null) {
      const x0 = r + 0.15, x1 = Math.min(urm - rw - 0.15, x0 + 1.3);
      if (x1 - x0 >= 0.45) o.push(...cutie(x0, x1, cy0, cy0 + 0.55, -G + 0.42, -G + 0.95, P, V, 'sim-rezervor'));
    }
    if (trac) {
      [[0.12, 0.2], [0.8, 0.88]].forEach((k) => {
        o.push(...cutie(3.0, 3.12, W0 * k[0], W0 * k[1], -G + 0.1, -0.34, P, V, 'sim-picior'));
        o.push(...cutie(2.92, 3.2, W0 * k[0] - 0.04, W0 * k[1] + 0.04, -G + 0.04, -G + 0.1, P, V, 'sim-picior'));
      });
    }
    if (remBara) o.push(...cutie(remBara[0] - 0.2, remBara[1] + 0.2, W0 / 2 - 0.06, W0 / 2 + 0.06, -0.42, -0.3, P, V, 'sim-sasiu'));
    return o;
  };
  // Cabina întreagă, în ordinea desenului: oglinda din spate, corpurile, detaliile părții din față, oglinda din față și
  // roțile din față de pe partea privitorului (stau în aripă, deci peste cabină).
  const cabina = (P, V) => {
    const lat = V[1] < -1e-6 ? -1 : (V[1] > 1e-6 ? 1 : 0), o = [];
    if (lat) o.push(...oglinda(-lat, P, V));
    cabine.forEach((c) => o.push(...prisma(c.prof, cy0, cy1, P, V, CAB, c.geam)));
    if (V[0] < -1e-6) o.push(...fata(P));
    if (lat) {
      o.push(...detalii(lat < 0 ? cy0 : cy1, P));
      o.push(...oglinda(lat, P, V));
      axVeh.filter((x) => x > f && x < r).forEach((x) => o.push(...roata(x, lat < 0 ? 0.02 : W0 - 0.02, P, false)));
    }
    return o;
  };
  // Roțile: cele de pe partea dinspre privitor (`aproape`) peste șasiu; cele din spate, umbrite, în spatele lui.
  const roti = (P, V, aproape) => {
    const o = [];
    R.axe.forEach((a) => {
      const W = (bodies.length > 1 && a.x >= bodies[1].x0) ? bodies[1].W : W0;
      const yn = V[1] > 1e-6 ? W - 0.02 : 0.02, yf = V[1] > 1e-6 ? 0.02 : W - 0.02;
      if (!aproape) o.push(...roata(a.x, yf, P, true));
      else if (!(a.x > f && a.x < r)) o.push(...roata(a.x, yn, P, false));
    });
    return o;
  };
  if (view === 'lat') {
    const totLen = Lc + 0.3 + endX + Wmax * 0.35, vert = (Math.max(Hmax, cabH) + G) * 0.8 + Wmax * 0.5;
    const s = Math.min((VBW - 60) / totLen, (VBH - 24) / vert, 95);
    const ox = 30 - (cabX0 - 0.3) * s + ((VBW - 60) - totLen * s) / 2, oy = VBH - 12 - G * s * 0.8;
    const pr = (x, y, z) => [ox + x * s + y * s * 0.35, oy - z * s * 0.8 - y * s * 0.5];
    const V = [0.35, -1, 0.625];
    const pts = (arr) => arr.map((p) => P2s(pr(p[0], p[1], p[2]))).join(' ');
    const faces = (x0, x1, y0, y1, z0, z1, side, top, end, cls) => [
      { cls, fill: end, pts: pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]) },
      { cls, fill: side, pts: pts([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]) },
      { cls, fill: top, pts: pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) }
    ];
    lines.push({ cls: 'sim-sol', a: pr(cabX0 - 1.2, 0, -G), b: pr(endX + 1.2, 0, -G) });
    back.push({ cls: 'sim-umbra', pts: pts([[cabX0 - 0.1, -0.1, -G], [endX + 0.1, -0.1, -G], [endX + 0.1, Wmax + 0.1, -G], [cabX0 - 0.1, Wmax + 0.1, -G]]) });
    back.push(...roti(pr, V, false), ...dedesubt(pr, V), ...cabina(pr, V));
    bodies.forEach((B) => {
      const a = B.x0, b = B.x0 + B.L;
      back.push({ cls: 'sim-podea', pts: pts([[a, 0, 0], [b, 0, 0], [b, B.W, 0], [a, B.W, 0]]) });
      back.push({ cls: 'sim-perete', pts: pts([[a, B.W, 0], [b, B.W, 0], [b, B.W, B.H], [a, B.W, B.H]]) });
      back.push({ cls: 'sim-perete2', pts: pts([[a, 0, 0], [a, B.W, 0], [a, B.W, B.H], [a, 0, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[a, 0, B.H], [b, 0, B.H], [b, B.W, B.H], [a, B.W, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[b, 0, 0], [b, 0, B.H]]) });
      front.push({ cls: 'sim-contur', pts: pts([[a, 0, 0], [b, 0, 0]]) });
    });
    mid.push(...roti(pr, V, true));
    boxes.slice().sort((p, q) => (q.y0 - p.y0) || (p.z0 - q.z0) || ((bodies[p.c].x0 * 100 + p.x0) - (bodies[q.c].x0 * 100 + q.x0))).forEach((bx) => {
      const c = culoare(bx.oprire), X = bodies[bx.c].x0;
      polys = polys.concat(faces(X + bx.x0 / 100, X + bx.x1 / 100, bx.y0 / 100, bx.y1 / 100, bx.z0 / 100, bx.z1 / 100, c, _simMix(c, true, 0.28), _simMix(c, false, 0.3), 'sim-cutie'));
    });
    if (R.kg > 0) { const c1 = pr(R.xcw, 0, 0), c2 = pr(R.xcw, bodies[0].W, 0); lines.push({ cls: 'sim-cg', a: c1, b: c2 }); }
  } else if (view === 'sus') {
    const totS = Lc + 0.2 + endX;
    const s2 = Math.min((VBW - 60) / totS, (VBH - 90) / (Wmax + 0.5));
    const ox2 = 30 - (cabX0 - 0.2) * s2 + ((VBW - 60) - totS * s2) / 2, oy2 = (VBH - Wmax * s2) / 2 + 4;
    const q2 = (x, y) => [ox2 + x * s2, oy2 + y * s2];
    const rect = (x0, y0, x1, y1) => [q2(x0, y0), q2(x1, y0), q2(x1, y1), q2(x0, y1)].map(P2s).join(' ');
    R.axe.forEach((a) => {
      const W = (a.x >= 0 && bodies.length > 1 && a.x >= bodies[1].x0) ? bodies[1].W : W0;
      back.push({ cls: 'sim-roata', pts: rect(a.x - rw, -0.1, a.x + rw, 0.28) }, { cls: 'sim-roata', pts: rect(a.x - rw, W - 0.28, a.x + rw, W + 0.1) });
    });
    const xo = duba ? f + 0.42 : f - 0.16;
    back.push({ cls: 'sim-oglinda', pts: rect(xo, cy0 - 0.26, xo + 0.12, cy0 - 0.06) }, { cls: 'sim-oglinda', pts: rect(xo, cy1 + 0.06, xo + 0.12, cy1 + 0.26) });
    if (duba) {
      back.push({ cls: 'sim-cab1', pts: rect(f, cy0, f + 0.5, cy1) }, { cls: 'sim-parbriz', pts: rect(f + 0.5, cy0, f + 0.95, cy1) }, { cls: 'sim-cab2', pts: rect(f + 0.95, cy0, r, cy1) });
    } else {
      back.push({ cls: 'sim-cab3', pts: rect(f, cy0, f + 0.1, cy1) }, { cls: 'sim-parbriz', pts: rect(f + 0.1, cy0, f + 0.48, cy1) }, { cls: 'sim-cab2', pts: rect(f + 0.48, cy0, r, cy1) });
    }
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
    const tf = q2(cabX0, -0.45), tu = q2(endX, -0.45), ta = q2(axX[axX.length - 1], Wmax + 0.62);
    texts.push({ x: tf[0], y: tf[1], a: 'start', t: 'față' }, { x: tu[0], y: tu[1], a: 'end', t: 'uși' }, { x: ta[0], y: ta[1], a: 'middle', t: 'axe' });
  } else {
    const phi = yaw * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi), SA = 0.55, CA = 0.83;
    const V = [sp, cp, SA / CA];
    const cxw = (cabX0 + endX) / 2, cyw = Wmax / 2;
    const r3 = (x, y, z) => { const dx = x - cxw, dy = y - cyw, yr = dx * sp + dy * cp; return [dx * cp - dy * sp, yr * SA - z * CA, yr]; };
    let mnU = 1e9, mxU = -1e9, mnV = 1e9, mxV = -1e9;
    const acc = (x, y, z) => { const p = r3(x, y, z); mnU = Math.min(mnU, p[0]); mxU = Math.max(mxU, p[0]); mnV = Math.min(mnV, p[1]); mxV = Math.max(mxV, p[1]); };
    const corners = (x0, x1, y0, y1, z0, z1, fn) => { [x0, x1].forEach((x) => { [y0, y1].forEach((y) => { [z0, z1].forEach((z) => fn(x, y, z)); }); }); };
    bodies.forEach((B) => corners(B.x0, B.x0 + B.L, 0, B.W, -G, B.H, acc));
    corners(cabX0 - 0.2, cabX1, -0.3, W0 + 0.3, -G, cabH, acc);
    const s3 = Math.min((VBW - 50) / (mxU - mnU), (VBH - 40) / (mxV - mnV));
    const ox3 = (VBW - (mxU - mnU) * s3) / 2 - mnU * s3, oy3 = (VBH - (mxV - mnV) * s3) / 2 - mnV * s3;
    const p3 = (x, y, z) => { const p = r3(x, y, z); return [ox3 + p[0] * s3, oy3 + p[1] * s3]; };
    const pts3 = (arr) => arr.map((p) => P2s(p3(p[0], p[1], p[2]))).join(' ');
    const box3 = (x0, x1, y0, y1, z0, z1, baza) => {
      const f3 = [], ch = (fill, pp) => f3.push({ cls: 'sim-cutie', fill, pts: pts3(pp) });
      if (sp > 0.001) ch(_simMix(baza, false, 0.3), [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
      if (sp < -0.001) ch(_simMix(baza, false, 0.3), [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]]);
      if (cp > 0.001) ch(baza, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
      if (cp < -0.001) ch(baza, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
      ch(_simMix(baza, true, 0.28), [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      return f3;
    };
    back.push({ cls: 'sim-umbra', pts: pts3([[cabX0 - 0.1, -0.1, -G], [endX + 0.1, -0.1, -G], [endX + 0.1, Wmax + 0.1, -G], [cabX0 - 0.1, Wmax + 0.1, -G]]) });
    back.push(...roti(p3, V, false), ...dedesubt(p3, V));
    const cab = cabina(p3, V);
    const cabD = r3((cabX0 + cabX1) / 2, W0 / 2, 1)[2], corpD = r3(bodies[0].L / 2, W0 / 2, 1)[2];
    if (cabD < corpD) back.push(...cab);
    bodies.forEach((B) => {
      const a = B.x0, b = B.x0 + B.L;
      back.push({ cls: 'sim-podea', pts: pts3([[a, 0, 0], [b, 0, 0], [b, B.W, 0], [a, B.W, 0]]) });
      [{ d: sp, p: [[b, 0, 0], [b, B.W, 0], [b, B.W, B.H], [b, 0, B.H]] }, { d: -sp, p: [[a, 0, 0], [a, B.W, 0], [a, B.W, B.H], [a, 0, B.H]] },
       { d: cp, p: [[a, B.W, 0], [b, B.W, 0], [b, B.W, B.H], [a, B.W, B.H]] }, { d: -cp, p: [[a, 0, 0], [b, 0, 0], [b, 0, B.H], [a, 0, B.H]] }].forEach((w) => {
        if (w.d > 0.001) front.push({ cls: 'sim-contur', pts: pts3(w.p) }); else back.push({ cls: 'sim-perete', pts: pts3(w.p) });
      });
    });
    mid.push(...roti(p3, V, true));
    boxes.map((bx) => { const X = bodies[bx.c].x0; return { bx, d: r3(X + (bx.x0 + bx.x1) / 200, (bx.y0 + bx.y1) / 200, 0)[2], z: bx.z0 }; })
      .sort((p, q) => (Math.round(p.d * 100) - Math.round(q.d * 100)) || (p.z - q.z)).forEach((o) => {
        const bx = o.bx, X = bodies[bx.c].x0;
        polys = polys.concat(box3(X + bx.x0 / 100, X + bx.x1 / 100, bx.y0 / 100, bx.y1 / 100, bx.z0 / 100, bx.z1 / 100, culoare(bx.oprire)));
      });
    if (cabD >= corpD) front.push(...cab);
    if (R.kg > 0) lines.push({ cls: 'sim-cg', a: p3(R.xcw, 0, 0), b: p3(R.xcw, Wmax, 0) });
  }
  const poli = (p) => '<polygon class="' + p.cls + '" points="' + p.pts + '"' + (p.fill ? ' fill="' + p.fill + '"' : '') + '></polygon>';
  const linie = (l) => '<line class="' + l.cls + '" x1="' + l.a[0].toFixed(1) + '" y1="' + l.a[1].toFixed(1) + '" x2="' + l.b[0].toFixed(1) + '" y2="' + l.b[1].toFixed(1) + '"></line>';
  return lines.filter((l) => l.cls === 'sim-sol').map(linie).join('') +
    back.map(poli).join('') + mid.map(poli).join('') + polys.map(poli).join('') +
    lines.filter((l) => l.cls !== 'sim-sol').map(linie).join('') +
    front.map(poli).join('') +
    texts.map((t) => '<text class="sim-tl" x="' + t.x.toFixed(1) + '" y="' + t.y.toFixed(1) + '" text-anchor="' + t.a + '">' + t.t + '</text>').join('');
}
export { _simSvg as simSvg, _simMix as simMix };
