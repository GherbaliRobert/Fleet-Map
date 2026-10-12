// tools/mail-worker.mjs — Email Worker-ul Cloudflare care aduce emailurile primite în panoul Mail (etapa 2, 12.10).
// NU rulează în aplicație: se LIPEȘTE în Cloudflare (Workers & Pages → Create → Worker → „Edit code"), o singură dată.
//
// Variabilele Worker-ului (Settings → Variables and Secrets):
//   RA_URL    = https://ratrack.ro/api/mail/primeste
//   RA_SECRET = aceeași parolă lungă ca MAIL_INBOUND_SECRET din Railway (tip „Secret", nu „Text")
//   BACKUP    = (opțional, recomandat) o adresă a voastră, verificată în Email Routing → Destination addresses. Acolo
//               ajunge emailul când aplicația nu-l poate primi (o actualizare în curs, o pană) sau când era prea mare
//               ca să se păstreze întreg.
// Apoi Email → Email Routing → Routing rules: contact@, robert.gherbali@, alin.tilvar@ → „Send to a Worker" → acesta.
//
// Ce face: trimite emailul ÎNTREG aplicației, cu parola și cu adresa pe care a venit. Dacă aplicația nu răspunde „ok"
// (și după o a doua încercare), emailul merge în BACKUP; fără BACKUP, expeditorul primește înapoi „nu s-a putut livra",
// ca să știe — nu se pierde nimic pe tăcute.
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    let ok = false, intreg = true;
    for (let incercare = 0; incercare < 2 && !ok; incercare++) {
      try {
        const r = await fetch(env.RA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'message/rfc822', 'X-RA-Secret': env.RA_SECRET, 'X-RA-Catre': message.to },
          body: raw,
        });
        if (r.ok) { ok = true; try { const j = await r.json(); intreg = j.intreg !== false; } catch (e) { /* ok fără detalii */ } }
        else if (r.status < 500 && r.status !== 429) break;   // 401 / 422: a doua încercare n-ar schimba nimic
      } catch (e) { /* rețeaua — se mai încearcă o dată */ }
    }
    if (ok && intreg) return;
    if (env.BACKUP) { await message.forward(env.BACKUP); return; }
    if (!ok) message.setReject('Temporary problem receiving this message. Please try again later.');
  },
};
