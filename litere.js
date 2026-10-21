'use strict';
// ─── Literele: orice text scris de AI ajunge la client DOAR cu litere românești (Alin, 19–20.10: „sunt fatale pentru noi")
// O SINGURĂ regulă, folosită de ai.js (orice răspuns al modelului, pe orice drum: RA Insight, „Rezumă cu RA Insight",
// rezumatul agenților, Scrisoarea de luni), de RA Insight (care cere întâi o rescriere) și la citirea mesajelor vechi.
// Curat: fără bază de date, fără rețea.
//   • străin = o literă din alt alfabet decât cel latin (chirilic, grec, arab, chinez…) sau o literă latină „lată"
//     (full-width). Literele latine cu semne rămân: ă, â, î, ș, ț, dar și Š din „Škoda" sau ü din „Müller".
//   • litereRomanesti: chirilicul și grecul se transcriu (о→o, к→c, ш→ș…; unitățile ca la noi: км→km, кг→kg), literele
//     late devin cele obișnuite, ş/ţ cu sedilă devin ș/ț (forma românească corectă), iar ce nu se poate transcrie (chineză,
//     arabă…) se scoate.

// Literele „late" (Ａ…Ｚ, ａ…ｚ) sunt latine, dar nu le scrie nimeni: le prindem separat.
const LATE = '\\uFF21-\\uFF3A\\uFF41-\\uFF5A';
const STRAINA = '(?=\\p{L})[^\\p{Script=Latin}\\p{Script=Common}\\p{Script=Inherited}]';
const STRAINE_RE = new RegExp(STRAINA + '|[' + LATE + ']', 'u');
const STRAINE_G = new RegExp(STRAINA, 'gu');
const LATE_G = new RegExp('[' + LATE + ']', 'g');

// Transcrierea (pe sunete, ca în română): „октомбrie" → „octombrie". Rusă, ucraineană, sârbă, macedoneană, bulgară, greacă.
const TRANSCRIERE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'io', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'c', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ț', ч: 'ci', ш: 'ș', щ: 'șt', ъ: 'ă', ы: 'î', ь: '',
  э: 'e', ю: 'iu', я: 'ia', є: 'ie', і: 'i', ї: 'ii', ґ: 'g', ў: 'u', ђ: 'gi', ј: 'i', љ: 'li', њ: 'ni', ћ: 'ci', џ: 'gi',
  ѓ: 'g', ќ: 'c', ѕ: 'z',
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'c', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o',
  π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'i', φ: 'f', χ: 'h', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'i', ώ: 'o', ϊ: 'i', ϋ: 'i', ΐ: 'i', ΰ: 'i'
};

// Unitățile scrise cu litere chirilice se scriu ca la noi: pe sunete, „120 км" (kilometri) ar ieși „120 cm" (centimetri).
const UNITATI = { 'км/ч': 'km/h', 'квт': 'kW', 'км': 'km', 'кг': 'kg', 'ч': 'h' };
const UNITATI_RE = /(?<!\p{L})(км\/ч|квт|км|кг|ч)(?!\p{L})/giu;

function areLitereStraine(t) { return STRAINE_RE.test(String(t == null ? '' : t)); }

function litereRomanesti(t) {
  return String(t == null ? '' : t)
    .replace(LATE_G, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț')
    .replace(UNITATI_RE, function (u) { return UNITATI[u.toLowerCase()]; })
    .replace(STRAINE_G, function (c) {
      const l = c.toLowerCase(), r = TRANSCRIERE[l];
      if (r == null) return '';
      return c === l ? r : r.charAt(0).toUpperCase() + r.slice(1);
    });
}

module.exports = { areLitereStraine, litereRomanesti, TRANSCRIERE };
