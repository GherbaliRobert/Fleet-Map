// @ts-nocheck — copie întocmai a desenului din pagină (public/index.html, blocul „desenul simulatorului"), ca telefonul să
// deseneze planul exact ca web-ul: lateral, de sus, 3D. verify_plan_incarcare.js rulează amândouă funcțiile pe aceleași
// simulări și cere același SVG — schimbi desenul pe web, îl schimbi și aici (copiezi blocul).
// Desenul (lateral, de sus, 3D rotibil) — doar desen, din ce trimite serverul. CURAT: primește rezultatul simulării,
// vederea, unghiul și culoarea unei opriri și întoarce SVG-ul. Telefonul are aceeași funcție (mobile/src/lib/simDesen.ts),
// iar hârtia PDF a planului o citește chiar de aici (incarcare_pdf.js); verify_plan_incarcare.js cere același desen.
// 13.10 (Robert: „vreau să avem desenele mai realiste, cel puțin mașina arată rău"; apoi „mai lucrează la desenul
// mașinii"): vehiculul se desenează ca un vehicul — cabina rotunjită, cu parbriz, geam, ușă, mânere, trepte, far, bară,
// oglinzi pe braț, partea de jos închisă și o dungă; deflectorul de pe acoperiș când caroseria e mai înaltă decât cabina;
// duba dintr-o bucată, cu capotă și scobitura roții din spate; șasiul, rezervorul cu chingi, picioarele semiremorcii,
// aripile și apărătorile de noroi, bara laterală și cea din spate, lămpile (galbene pe lateral, roșii în spate), roțile
// cu jantă (și în 3D), umbra pe drum. Se desenează doar fețele întoarse spre privitor (normala față de direcția privirii
// `V`), ca un corp să nu-și acopere singur fețele.
function _simMix(hex, spreAlb, t) {
  const a = parseInt(hex.slice(1), 16), r = (a >> 16) & 255, g = (a >> 8) & 255, b = a & 255, T = spreAlb ? 255 : 0;
  return 'rgb(' + Math.round(r + (T - r) * t) + ',' + Math.round(g + (T - g) * t) + ',' + Math.round(b + (T - b) * t) + ')';
}
function _simSvg(R, view, yaw, culoare) {
  if (!R) return '';
  const VBW = 960, VBH = 330, bodies = R.corpuri, boxes = R.cutii, trac = R.trac, duba = R.vehicul.fel === 'duba35';
  const axX = R.axe.map((a) => a.x);
  const axVeh = R.axe.filter((a) => a.sub === R.axe[0].sub).map((a) => a.x);   // axele vehiculului (nu ale remorcii)
  const axRem = R.axe.filter((a) => a.sub !== R.axe[0].sub).map((a) => a.x);   // ale semiremorcii / remorcii
  const G = duba ? 0.62 : 1.15, rw = duba ? 0.34 : 0.5, zr = -G + rw;           // podeaua de marfă față de drum; roata
  const cabLen = trac ? 2.3 : (duba ? 1.9 : 2.1), gap = trac ? 0.45 : (duba ? 0.02 : 0.12);
  const cabX1 = -gap, cabX0 = Math.min(-gap - cabLen, (axX.length ? axX[0] : 0) - 0.8);   // cabina cuprinde axa din față
  const cabH = trac ? 2.75 : (duba ? bodies[0].H + 0.02 : Math.min(bodies[0].H * 0.92, 2.4));
  const f = cabX0, r = cabX1, Lc = r - f, zb = -G + (duba ? 0.25 : 0.35), zw = zb + (cabH - zb) * 0.5, zh = zb + 0.72;
  const last = bodies[bodies.length - 1], endX = last.x0 + last.L;
  let Wmax = 0, Hmax = 0; bodies.forEach((B) => { Wmax = Math.max(Wmax, B.W); Hmax = Math.max(Hmax, B.H); });
  const W0 = bodies[0].W, cy0 = W0 * 0.03, cy1 = W0 * 0.97;
  const back = [], mid = [], front = [], lines = [], texts = []; let polys = [];
  const P2s = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
  const remBara = bodies[1] ? [bodies[0].L, bodies[1].x0] : null;
  const axF = axVeh.filter((x) => x > f && x < r);                                // roțile de sub cabină
  const Wla = (x) => ((bodies.length > 1 && x >= bodies[1].x0) ? bodies[1].W : W0);
  const defl = !duba && bodies[0].H - cabH > 0.22, xPic = 3.0;                     // deflectorul; picioarele semiremorcii
  const urm = axVeh.filter((x) => x > r)[0], rzx0 = r + 0.15;                       // rezervorul: între cabină și axa din spate
  const rzx1 = urm != null ? Math.min(urm - rw - 0.15, rzx0 + 1.3) : rzx0, areRez = !duba && rzx1 - rzx0 >= 0.45;
  // Linia din față a cabinei: sub parbriz (xF), parbrizul camionului (xW), parbrizul dubei (xA).
  const xF = (z) => f + 0.12 * Math.max(0, z - zb) / (zw - zb);
  const xW = (z) => f + 0.12 + 0.25 * (z - zw) / (cabH - 0.12 - zw);
  const xA = (z) => f + 0.5 + 0.5 * (z - zh) / (cabH - 0.14 - zh);
  // Un corp drept: profil în x–z (sens trigonometric, z în sus), întins pe y de la yA la yB. Doar fețele întoarse spre
  // privitor (normala · V > 0); `cl` = clasele { lat, sus, cap, geam }, `geam` = muchiile (indici) care sunt geam. Capătul
  // dinspre privitor se pune la urmă: nimic din corp nu stă în fața lui (contează la profilele cu scobituri, ca duba).
  const prisma = (prof, yA, yB, P, V, cl, geam) => {
    const out = [], pp = (arr) => arr.map((q) => P2s(P(q[0], q[1], q[2]))).join(' ');
    prof.forEach((a, i) => {
      const b = prof[(i + 1) % prof.length], nx = b[1] - a[1], nz = a[0] - b[0];
      if (nx * V[0] + nz * V[2] <= 1e-6) return;
      const cls = geam && geam.indexOf(i) >= 0 ? cl.geam : (nz / (Math.hypot(nx, nz) || 1) > 0.7 ? cl.sus : cl.cap);
      out.push({ cls, pts: pp([[a[0], yA, a[1]], [b[0], yA, b[1]], [b[0], yB, b[1]], [a[0], yB, a[1]]]) });
    });
    if (-V[1] > 1e-6) out.push({ cls: cl.lat, pts: pp(prof.map((q) => [q[0], yA, q[1]])) });
    if (V[1] > 1e-6) out.push({ cls: cl.lat, pts: pp(prof.map((q) => [q[0], yB, q[1]])) });
    return out;
  };
  const cutie = (x0, x1, y0, y1, z0, z1, P, V, c) => prisma([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, P, V, { lat: c, sus: c, cap: c });
  // O formă plată: pe o parte a vehiculului (planul y, puncte [x, z]) sau pe un capăt (planul x, puncte [y, z]).
  const fy = (y, P, cls, arr) => ({ cls, pts: arr.map((q) => P2s(P(q[0], y, q[1]))).join(' ') });
  const fx = (x, P, cls, arr) => ({ cls, pts: arr.map((q) => P2s(P(x, q[0], q[1]))).join(' ') });
  // Cabina: la camion și autotractor rotunjită sus, cu parbrizul (muchia 7); duba dintr-o bucată, cu capotă (parbrizul = 5).
  const CAB = { lat: 'sim-cab1', sus: 'sim-cab2', cap: 'sim-cab3', geam: 'sim-parbriz' };
  const cabine = duba
    ? [{ prof: [[f, zb], [r, zb], [r, cabH], [f + 1.22, cabH], [f + 1.08, cabH - 0.05], [f + 1.0, cabH - 0.14], [f + 0.5, zh], [f + 0.14, zh - 0.05], [f + 0.04, zh - 0.18]], geam: [5] }]
    : [{ prof: [[f, zb], [r, zb], [r, cabH - 0.1], [r - 0.04, cabH - 0.03], [r - 0.12, cabH], [f + 0.62, cabH], [f + 0.46, cabH - 0.03], [f + 0.37, cabH - 0.12], [f + 0.12, zw]], geam: [7] }];
  const cerc = (x, y, zc0, rr, P) => { const a = []; for (let i = 0; i < 18; i++) { const t = i * Math.PI / 9; a.push(P2s(P(x + rr * Math.cos(t), y, zc0 + rr * Math.sin(t)))); } return a.join(' '); };
  const roata = (x, y, P, departe) => (departe ? [{ cls: 'sim-roata2', pts: cerc(x, y, zr, rw, P) }]
    : [{ cls: 'sim-roata', pts: cerc(x, y, zr, rw, P) }, { cls: 'sim-janta', pts: cerc(x, y, zr, rw * 0.62, P) },
       { cls: 'sim-janta2', pts: cerc(x, y, zr, rw * 0.44, P) }, { cls: 'sim-butuc', pts: cerc(x, y, zr, rw * 0.18, P) }]);
  // Aripa roții (scobitura întunecată din caroserie): semicercul de deasupra roții, tăiat jos la `zj` și sus la `zs`.
  const aripa = (x, zj, zs) => { const a = [], ra = rw * 1.18; for (let i = 0; i <= 12; i++) { const t = i * Math.PI / 12; a.push([x + ra * Math.cos(t), Math.min(zs, Math.max(zj, zr + ra * Math.sin(t)))]); } return a; };
  // Ce se vede pe partea cabinei întoarsă spre privitor (y).
  const detalii = (y, P) => {
    const F = (cls, arr) => fy(y, P, cls, arr), d = [];
    if (duba) {
      d.push(F('sim-cabjos', [[f, zb], [r, zb], [r, zb + 0.16], [f + 0.01, zb + 0.16]]));
      d.push(F('sim-usa', [[f + 0.58, zb + 0.18], [r - 0.04, zb + 0.18], [r - 0.04, cabH - 0.08], [xA(cabH - 0.08) + 0.06, cabH - 0.08], [xA(zh) + 0.06, zh], [f + 0.58, zh - 0.1]]));
      d.push(F('sim-geam', [[xA(zh + 0.08) + 0.12, zh + 0.08], [xA(cabH - 0.22) + 0.12, cabH - 0.22], [r - 0.1, cabH - 0.22], [r - 0.1, zh + 0.08]]));
      d.push(F('sim-maner', [[r - 0.3, zh - 0.02], [r - 0.16, zh - 0.02], [r - 0.16, zh + 0.03], [r - 0.3, zh + 0.03]]));
      axF.forEach((x) => d.push(F('sim-aripa', aripa(x, zb, 9))));
      d.push(F('sim-far', [[f + 0.03, zh - 0.34], [f + 0.36, zh - 0.18], [f + 0.33, zh - 0.08], [f + 0.06, zh - 0.17]]));
      d.push(F('sim-barafata', [[f - 0.02, zb], [f + 0.45, zb], [f + 0.45, zb + 0.2], [f - 0.02, zb + 0.2]]));
    } else {
      const hj = 2 * rw - 0.23, xg = f + Math.min(Lc * 0.55, 1.25), z1 = zb + hj, z2 = zb + hj + 0.09;
      d.push(F('sim-cabjos', [[f, zb], [r, zb], [r, zb + hj], [xF(zb + hj), zb + hj]]));
      d.push(F('sim-dunga', [[xF(z1), z1], [r, z1], [r, z2], [xF(z2), z2]]));
      d.push(F('sim-usa', [[xF(zb + 0.32) + 0.08, zb + 0.32], [xg + 0.06, zb + 0.32], [xg + 0.06, cabH - 0.1], [xW(cabH - 0.1) + 0.07, cabH - 0.1], [xW(zw) + 0.07, zw]]));
      d.push(F('sim-geam', [[xW(zw + 0.08) + 0.1, zw + 0.08], [xW(cabH - 0.2) + 0.1, cabH - 0.2], [xg, cabH - 0.2], [xg, zw + 0.08]]));
      d.push(F('sim-maner', [[xg - 0.17, zw - 0.12], [xg - 0.05, zw - 0.12], [xg - 0.05, zw - 0.07], [xg - 0.17, zw - 0.07]]));
      d.push(F('sim-maner', [[xg + 0.13, zb + hj + 0.25], [xg + 0.16, zb + hj + 0.25], [xg + 0.16, zw + 0.5], [xg + 0.13, zw + 0.5]]));
      axF.forEach((x) => d.push(F('sim-aripa', aripa(x, zb, 9))));
      // Treptele: în spatele roții din față, sau în fața ei dacă acolo nu e loc.
      const ax0 = axF[0];
      if (ax0 != null) {
        let s0 = ax0 + rw * 1.18 + 0.06, s1 = Math.min(s0 + 0.42, r - 0.08);
        if (s1 - s0 < 0.28) { s1 = ax0 - rw * 1.18 - 0.06; s0 = Math.max(f + 0.65, s1 - 0.42); }
        if (s1 - s0 >= 0.28) [[0.08, 0.15], [0.3, 0.37], [0.52, 0.59]].forEach((k) => d.push(F('sim-treapta', [[s0, zb + k[0]], [s1, zb + k[0]], [s1, zb + k[1]], [s0, zb + k[1]]])));
      }
      d.push(F('sim-far', [[xF(zb + 0.34), zb + 0.34], [xF(zb + 0.34) + 0.2, zb + 0.34], [xF(zb + 0.48) + 0.2, zb + 0.48], [xF(zb + 0.48), zb + 0.48]]));
      d.push(F('sim-barafata', [[f - 0.03, zb], [f + 0.6, zb], [f + 0.6, zb + 0.28], [f - 0.03, zb + 0.28]]));
    }
    return d;
  };
  // Fața cabinei (se vede doar din față, în 3D): bara, grila și farurile, pe planul ei ușor înclinat.
  const fata = (P) => {
    const zT = duba ? zh - 0.18 : zw, dx = duba ? 0.04 : 0.12, x = (z) => f + dx * (z - zb) / (zT - zb) - 0.005;
    const quad = (ya, yb, za, zb2, cls) => ({ cls, pts: [[x(za), ya, za], [x(za), yb, za], [x(zb2), yb, zb2], [x(zb2), ya, zb2]].map((q) => P2s(P(q[0], q[1], q[2]))).join(' ') });
    const zf = duba ? [zh - 0.34, zh - 0.22] : [zb + 0.32, zb + 0.48];
    return [quad(cy0, cy1, zb, zb + (duba ? 0.2 : 0.28), 'sim-barafata'),
      quad(W0 * 0.24, W0 * 0.76, zb + (duba ? 0.24 : 0.36), zT - (duba ? 0.06 : 0.12), 'sim-grila'),
      quad(W0 * 0.06, W0 * 0.2, zf[0], zf[1], 'sim-far'), quad(W0 * 0.8, W0 * 0.94, zf[0], zf[1], 'sim-far')];
  };
  // Oglinda de pe o parte (lat < 0 = partea y mică), pe un braț scos din stâlpul parbrizului.
  const oglinda = (lat, P, V) => {
    const yS = lat < 0 ? cy0 : cy1, s = lat < 0 ? -1 : 1, x0 = duba ? f + 0.56 : xW(zw + 0.3) - 0.1;
    const z0 = duba ? zh + 0.12 : zw + 0.05, z1 = duba ? zh + 0.42 : zw + 0.62, zm = (z0 + z1) / 2;
    const yy = (a, b) => [Math.min(yS + s * a, yS + s * b), Math.max(yS + s * a, yS + s * b)];
    const ya = yy(0, 0.17), yo = yy(0.15, 0.25);
    return cutie(x0 + 0.03, x0 + 0.07, ya[0], ya[1], zm - 0.025, zm + 0.025, P, V, 'sim-oglinda')
      .concat(cutie(x0, x0 + 0.1, yo[0], yo[1], z0, z1, P, V, 'sim-oglinda'));
  };
  // Deflectorul lateral din spatele cabinei autotractorului (acoperă golul până la semiremorcă).
  const extensie = (lat, P, V) => {
    if (gap < 0.3) return [];
    const yS = lat < 0 ? cy0 : cy1, s = lat < 0 ? -1 : 1;
    return prisma([[r - 0.02, zb + 0.75], [r + gap - 0.1, zb + 0.75], [r + gap - 0.1, cabH - 0.25], [r - 0.02, cabH - 0.15]],
      Math.min(yS, yS + s * 0.03), Math.max(yS, yS + s * 0.03), P, V, CAB);
  };
  // Deflectorul de pe acoperiș, când caroseria e mai înaltă decât cabina.
  const deflector = (P, V) => (defl ? prisma([[r - Lc * 0.6, cabH], [r - 0.04, cabH], [r - 0.04, bodies[0].H - 0.02], [r - 0.36, bodies[0].H - 0.02]], cy0 + 0.1, cy1 - 0.1, P, V, CAB) : []);
  // Sub corpuri: șasiul, rama podelei, rezervorul, picioarele semiremorcii, proțapul, bara din spate.
  const dedesubt = (P, V) => {
    const o = [], yA = V[1] < -1e-6 ? -0.006 : null;
    if (duba) {
      // Duba e dintr-o bucată: partea de jos a caroseriei, cu scobitura roții din spate (întunecată în spatele roții).
      const y = V[1] < -1e-6 ? -0.006 : W0 + 0.006, ra = rw * 1.18, jos = [[r, 0], [r, zb]];
      axVeh.filter((x) => x > r).forEach((x) => {
        o.push(fy(y, P, 'sim-aripa', aripa(x, zb, 0)));
        for (let i = 12; i >= 0; i--) { const t = i * Math.PI / 12; jos.push([x + ra * Math.cos(t), Math.min(0, Math.max(zb, zr + ra * Math.sin(t)))]); }
      });
      jos.push([endX, zb], [endX, 0]);
      o.unshift(fy(y, P, 'sim-cab1', jos));
      o.push(fy(y, P, 'sim-cabjos', [[r, zb], [endX, zb], [endX, zb + 0.08], [r, zb + 0.08]]));
      o.push(...cutie(endX - 0.12, endX + 0.04, 0.04, W0 - 0.04, zb, zb + 0.2, P, V, 'sim-barafata'));
      return o;
    }
    const chEnd = trac ? Math.max.apply(null, axVeh) + 0.9 : bodies[0].x0 + bodies[0].L - 0.05;
    o.push(...cutie(f + 0.25, chEnd, W0 * 0.2, W0 * 0.8, -G + 0.62, -0.22, P, V, 'sim-sasiu'));
    (trac ? bodies : bodies.slice(1)).forEach((B) => o.push(...cutie(B.x0 + 0.15, B.x0 + B.L - 0.1, B.W * 0.2, B.W * 0.8, -0.34, -0.04, P, V, 'sim-sasiu')));
    bodies.forEach((B) => {
      const b = B.x0 + B.L;
      o.push(...cutie(B.x0, b, 0, 0.05, -0.2, 0, P, V, 'sim-rama'), ...cutie(B.x0, b, B.W - 0.05, B.W, -0.2, 0, P, V, 'sim-rama'));
      o.push(...cutie(b - 0.08, b, 0.05, B.W - 0.05, -0.36, -0.18, P, V, 'sim-rama'));
      [0.3, B.W - 0.38].forEach((y) => o.push(...cutie(b - 0.22, b - 0.14, y, y + 0.08, -G + 0.56, -0.2, P, V, 'sim-sasiu')));
      o.push(...cutie(b - 0.24, b - 0.06, 0.16, B.W - 0.16, -G + 0.42, -G + 0.56, P, V, 'sim-protectie'));
    });
    if (areRez) {
      const z0 = -G + 0.42, z1 = -G + 0.95, c = 0.09, RZ = { lat: 'sim-rezervor', sus: 'sim-rezervor', cap: 'sim-rezervor' };
      o.push(...prisma([[rzx0 + c, z0], [rzx1 - c, z0], [rzx1, z0 + c], [rzx1, z1 - c], [rzx1 - c, z1], [rzx0 + c, z1], [rzx0, z1 - c], [rzx0, z0 + c]], cy0, cy0 + 0.55, P, V, RZ));
      const yC = yA != null ? cy0 - 0.006 : cy0 + 0.556;
      [rzx0 + 0.22, rzx1 - 0.26].forEach((x) => {
        o.push(fy(yC, P, 'sim-sasiu', [[x, z0 - 0.01], [x + 0.045, z0 - 0.01], [x + 0.045, z1 + 0.01], [x, z1 + 0.01]]));
        o.push({ cls: 'sim-sasiu', pts: [[x, cy0, z1 + 0.004], [x + 0.045, cy0, z1 + 0.004], [x + 0.045, cy0 + 0.55, z1 + 0.004], [x, cy0 + 0.55, z1 + 0.004]].map((q) => P2s(P(q[0], q[1], q[2]))).join(' ') });
      });
    }
    if (trac) {
      [[0.12, 0.2], [0.8, 0.88]].forEach((k) => {
        o.push(...cutie(xPic, xPic + 0.12, W0 * k[0], W0 * k[1], -G + 0.1, -0.34, P, V, 'sim-picior'));
        o.push(...cutie(xPic - 0.08, xPic + 0.2, W0 * k[0] - 0.04, W0 * k[1] + 0.04, -G + 0.04, -G + 0.1, P, V, 'sim-picior'));
      });
    }
    if (remBara) o.push(...cutie(remBara[0] - 0.2, remBara[1] + 0.2, W0 / 2 - 0.06, W0 / 2 + 0.06, -0.42, -0.3, P, V, 'sim-sasiu'));
    return o;
  };
  // Pe partea dinspre privitor, peste roți: aripile și apărătorile de noroi, bara laterală, lămpile galbene; în spate,
  // lămpile roșii (când se vede capătul din spate).
  const laturi = (P, V) => {
    const o = [], yN = (W) => (V[1] < -1e-6 ? -0.012 : W + 0.012);
    if (!duba) {
      const gr = [];
      R.axe.forEach((a) => {
        if (a.x > f && a.x < r) return;
        const g = gr[gr.length - 1];
        if (g && g.sub === a.sub && a.x - g.x1 < 2 * rw + 0.5) { g.x1 = a.x; g.n++; } else gr.push({ sub: a.sub, x0: a.x, x1: a.x, n: 1 });
      });
      gr.forEach((g) => {
        const y = yN(Wla(g.x0)), zt = zr + rw + 0.1, xa = g.x0 - rw * 1.1, xb = g.x1 + rw * 1.1, xf2 = g.x1 + rw + 0.12;
        if (g.n === 1) {
          const a = [], b2 = [];
          for (let i = 0; i <= 10; i++) { const t = Math.PI * (0.1 + 0.8 * i / 10); a.push([g.x0 + rw * 1.17 * Math.cos(t), zr + rw * 1.17 * Math.sin(t)]); b2.unshift([g.x0 + rw * 1.05 * Math.cos(t), zr + rw * 1.05 * Math.sin(t)]); }
          o.push(fy(y, P, 'sim-aripa', a.concat(b2)));
        } else {
          o.push(fy(y, P, 'sim-aripa', [[xa, zt - 0.16], [xa, zt], [xb, zt], [xb, zt - 0.16], [xb - 0.05, zt - 0.16], [xb - 0.05, zt - 0.06], [xa + 0.05, zt - 0.06], [xa + 0.05, zt - 0.16]]));
        }
        o.push(fy(y, P, 'sim-aripa', [[xf2, -G + 0.2], [xf2 + 0.05, -G + 0.2], [xf2 + 0.05, zr + rw * 0.85], [xf2, zr + rw * 0.85]]));
      });
      const bare = (x0, x1, W) => {
        if (x1 - x0 < 0.8) return;
        const y = yN(W);
        [[-G + 0.5, -G + 0.57], [-G + 0.78, -G + 0.85]].forEach((z) => o.push(fy(y, P, 'sim-protectie', [[x0, z[0]], [x1, z[0]], [x1, z[1]], [x0, z[1]]])));
        [x0, x1 - 0.06].forEach((x) => o.push(fy(y, P, 'sim-protectie', [[x, -G + 0.5], [x + 0.06, -G + 0.5], [x + 0.06, -0.2], [x, -0.2]])));
      };
      if (trac && axRem.length) bare(xPic + 0.35, axRem[0] - rw - 0.3, W0);
      if (!trac && axVeh.length > 1) bare((areRez ? rzx1 : r) + 0.2, axVeh[axVeh.length - 1] - rw - 0.25, W0);
      if (!trac && bodies[1] && axRem.length > 1) bare(axRem[0] + rw + 0.25, axRem[axRem.length - 1] - rw - 0.25, bodies[1].W);
      bodies.forEach((B) => {
        const y = yN(B.W);
        for (let x = B.x0 + 0.7; x < B.x0 + B.L - 0.5; x += 2.6) o.push(fy(y, P, 'sim-lampa', [[x, -0.15], [x + 0.11, -0.15], [x + 0.11, -0.07], [x, -0.07]]));
      });
    }
    if (V[0] > 1e-6) bodies.forEach((B) => {
      const b = B.x0 + B.L + 0.006;
      const L = duba ? [[0, 0.09, 0.18, 0.78], [B.W - 0.09, B.W, 0.18, 0.78]] : [[0.1, 0.42, -0.34, -0.2], [B.W - 0.42, B.W - 0.1, -0.34, -0.2]];
      L.forEach((q) => o.push(fx(b, P, 'sim-stop', [[q[0], q[2]], [q[1], q[2]], [q[1], q[3]], [q[0], q[3]]])));
    });
    return o;
  };
  // Cabina întreagă, în ordinea desenului: oglinda și deflectorul din spate, corpurile, detaliile părții din față,
  // deflectorul și oglinda din față și roțile din față de pe partea privitorului (stau în aripă, deci peste cabină).
  const cabina = (P, V) => {
    const lat = V[1] < -1e-6 ? -1 : (V[1] > 1e-6 ? 1 : 0), o = [];
    if (lat) o.push(...oglinda(-lat, P, V), ...extensie(-lat, P, V));
    cabine.forEach((c) => o.push(...prisma(c.prof, cy0, cy1, P, V, CAB, c.geam)));
    o.push(...deflector(P, V));
    if (V[0] < -1e-6) o.push(...fata(P));
    if (lat) {
      o.push(...detalii(lat < 0 ? cy0 : cy1, P));
      o.push(...extensie(lat, P, V), ...oglinda(lat, P, V));
      axF.forEach((x) => o.push(...roata(x, lat < 0 ? 0.02 : W0 - 0.02, P, false)));
    }
    return o;
  };
  // Roțile: cele de pe partea dinspre privitor (`aproape`) peste șasiu; cele din spate, umbrite, în spatele lui.
  const roti = (P, V, aproape) => {
    const o = [];
    R.axe.forEach((a) => {
      const W = Wla(a.x);
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
    mid.push(...roti(pr, V, true), ...laturi(pr, V));
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
    const xo = duba ? f + 0.56 : xW(zw + 0.3) - 0.1;
    back.push({ cls: 'sim-oglinda', pts: rect(xo, cy0 - 0.26, xo + 0.12, cy0 - 0.06) }, { cls: 'sim-oglinda', pts: rect(xo, cy1 + 0.06, xo + 0.12, cy1 + 0.26) });
    if (gap >= 0.3) back.push({ cls: 'sim-cab3', pts: rect(r - 0.02, cy0 - 0.03, r + gap - 0.1, cy0) }, { cls: 'sim-cab3', pts: rect(r - 0.02, cy1, r + gap - 0.1, cy1 + 0.03) });
    if (duba) {
      back.push({ cls: 'sim-cab1', pts: rect(f, cy0, f + 0.5, cy1) }, { cls: 'sim-parbriz', pts: rect(f + 0.5, cy0, f + 1.0, cy1) }, { cls: 'sim-cab2', pts: rect(f + 1.0, cy0, r, cy1) });
    } else {
      back.push({ cls: 'sim-cab3', pts: rect(f, cy0, f + 0.12, cy1) }, { cls: 'sim-parbriz', pts: rect(f + 0.12, cy0, f + 0.4, cy1) }, { cls: 'sim-cab2', pts: rect(f + 0.4, cy0, r, cy1) });
      if (defl) back.push({ cls: 'sim-cab3', pts: rect(r - Lc * 0.6, cy0 + 0.1, r - 0.04, cy1 - 0.1) });
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
    mid.push(...roti(p3, V, true), ...laturi(p3, V));
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
