// Text utilities for makefun-site, dependency-free ES module
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const SLUG_MAX = 64;

const MONTHS = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

// Fast path: if none of the five HTML escape characters are present, return unchanged.
export function escapeHtml(s) {
  if (!s.includes('&') && !s.includes('<') && !s.includes('>') && !s.includes('"') && !s.includes("'")) return s;
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Generate a slug from text, exactly matching the reference algorithm.
export function slugify(text) {
  const plain = text.normalize('NFKD').replace(/[\p{M}]/gu, '');
  let out = '';
  let gap = false;
  for (const ch of plain) {
    let keep = null;
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === null) {
      if (out.length > 0) gap = true;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  out = out.slice(0, SLUG_MAX).replace(/-+$/, '');
  return out === '' ? 'untitled' : out;
}

// Return a slug not in `taken`, suffixing with -2, -3, ... as needed.
export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

// Convert a YYYY-MM-DD string into "D Month YYYY".
export function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
