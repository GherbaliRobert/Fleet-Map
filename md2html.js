// md2html.js — convertor minimal Markdown -> HTML stilizat (pentru export Word .docx)
// Acoperă exact ce folosește AUDIT-RA-TRACKS.md: headings, tabele, bold, code, liste, blockquote, hr.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'AUDIT-RA-TRACKS.md', 'utf8');

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s) {
  // ordine: cod întâi (ca să nu interpreteze ** în interior), apoi bold
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

const lines = src.split(/\r?\n/);
let html = [];
let i = 0;
let inList = null; // 'ul' | 'ol' | null

function closeList() { if (inList) { html.push('</' + inList + '>'); inList = null; } }

while (i < lines.length) {
  let line = lines[i];

  // Tabel: linie cu | și următoarea separator ---
  if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
    closeList();
    const header = line.split('|').slice(1, -1).map(c => c.trim());
    i += 2; // sar peste separator
    let rows = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()));
      i++;
    }
    html.push('<table>');
    html.push('<thead><tr>' + header.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead>');
    html.push('<tbody>');
    rows.forEach(r => { html.push('<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>'); });
    html.push('</tbody></table>');
    continue;
  }

  // Heading
  let m = /^(#{1,6})\s+(.*)$/.exec(line);
  if (m) { closeList(); const lvl = m[1].length; html.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>'); i++; continue; }

  // HR
  if (/^---+\s*$/.test(line)) { closeList(); html.push('<hr/>'); i++; continue; }

  // Blockquote
  if (/^>\s?/.test(line)) {
    closeList();
    let buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
    html.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
    continue;
  }

  // Listă neordonată
  if (/^\s*[-*]\s+/.test(line)) {
    if (inList !== 'ul') { closeList(); html.push('<ul>'); inList = 'ul'; }
    html.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; continue;
  }
  // Listă ordonată
  if (/^\s*\d+\.\s+/.test(line)) {
    if (inList !== 'ol') { closeList(); html.push('<ol>'); inList = 'ol'; }
    html.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>'); i++; continue;
  }

  // Linie goală
  if (/^\s*$/.test(line)) { closeList(); i++; continue; }

  // Paragraf normal
  closeList();
  html.push('<p>' + inline(line) + '</p>');
  i++;
}
closeList();

const css = `
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.45;}
h1{font-size:22pt;color:#0b6b3a;border-bottom:3px solid #0b6b3a;padding-bottom:6px;}
h2{font-size:16pt;color:#0b6b3a;border-bottom:1px solid #cfd8dc;padding-bottom:4px;margin-top:18px;}
h3{font-size:13pt;color:#15803d;margin-top:14px;}
h4{font-size:11.5pt;color:#333;}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:10pt;}
th{background:#0b6b3a;color:#fff;text-align:left;padding:6px 8px;border:1px solid #0b6b3a;}
td{padding:5px 8px;border:1px solid #cfd8dc;vertical-align:top;}
tr:nth-child(even) td{background:#f3f7f4;}
code{background:#eef2f0;padding:1px 5px;border-radius:3px;font-family:'Consolas',monospace;font-size:9.5pt;color:#b91c1c;}
blockquote{border-left:4px solid #ea580c;background:#fff7ed;margin:8px 0;padding:8px 14px;color:#7c2d12;}
hr{border:none;border-top:1px solid #cfd8dc;margin:14px 0;}
ul,ol{margin:6px 0 6px 8px;}
li{margin:2px 0;}
strong{color:#0b3a22;}
`;

const out = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Audit RA Tracks</title><style>' + css + '</style></head><body>' + html.join('\n') + '</body></html>';
fs.writeFileSync(process.argv[3] || 'AUDIT-RA-TRACKS.html', out, 'utf8');
console.log('HTML scris:', process.argv[3] || 'AUDIT-RA-TRACKS.html', '(' + out.length + ' bytes)');
