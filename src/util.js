const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Minimal, safe text-to-HTML: "## " headings, "- " lists, blank-line paragraphs. All input is escaped.
function renderText(text) {
  if (!text) return '';
  const blocks = String(text).replace(/\r/g, '').trim().split(/\n{2,}/);
  const out = [];
  for (let b of blocks) {
    b = b.trim();
    if (!b) continue;
    while (b) {
      const m = b.match(/^(#{2,3}) (.*)(?:\n|$)/);
      if (m) {
        out.push(`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`);
        b = b.slice(m[0].length).trim();
        continue;
      }
      const lines = b.split('\n');
      if (lines.every(l => l.startsWith('- '))) out.push('<ul>' + lines.map(l => `<li>${esc(l.slice(2))}</li>`).join('') + '</ul>');
      else out.push(`<p>${esc(b).replace(/\n/g, '<br>')}</p>`);
      b = '';
    }
  }
  return out.join('\n');
}

function lines(text) {
  return String(text || '').split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
}

// Today's date in Kerala (IST), YYYY-MM-DD.
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return '"' + s.replace(/"/g, '""') + '"';
}

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { esc, renderText, lines, todayIST, fmtDateTime, fmtDate, jsonLd, isHttpUrl, csvCell, wrap };
