export const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

// Fast path: validate key chars are lowercase a-z or underscore only
function isValidKey(key) {
  if (key.length === 0) return false;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (!(c >= 97 && c <= 122) && c !== 95) return false; // a-z or _
  }
  return true;
}

function isKnownKey(key) {
  switch (key) {
    case 'title':
    case 'date':
    case 'tags':
    case 'draft':
    case 'layout':
    case 'slug':
    case 'summary':
      return true;
    default:
      return false;
  }
}

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function isDigit(c) {
  return c >= 48 && c <= 57;
}

function tagValid(t) {
  if (t.length === 0) return false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 34 || c === 91 || c === 93) return false;
  }
  return true;
}

// valueOf inlined to match reference exactly
function valueOfString(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than " or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = valueOfString(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = raw.length === 10 &&
        raw.charCodeAt(4) === 45 && raw.charCodeAt(7) === 45 &&
        isDigit(raw.charCodeAt(0)) && isDigit(raw.charCodeAt(1)) &&
        isDigit(raw.charCodeAt(2)) && isDigit(raw.charCodeAt(3)) &&
        isDigit(raw.charCodeAt(5)) && isDigit(raw.charCodeAt(6)) &&
        isDigit(raw.charCodeAt(8)) && isDigit(raw.charCodeAt(9))
        ? DATE.exec(raw) : null;
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo))
        return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      if (inner.indexOf(',') === -1) {
        const t = inner.trim();
        return tagValid(t) ? { value: [t] } : { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      }
      const tags = inner.split(',').map((t) => t.trim());
      for (const t of tags) {
        if (!tagValid(t)) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      }
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout': {
      if (/^[a-z0-9-]+$/.test(raw)) return { value: raw };
      return { error: 'key "layout": not a template name' };
    }
    case 'slug': {
      if (raw.length > 64) return { error: 'key "slug": not a slug' };
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) return { value: raw };
      return { error: 'key "slug": not a slug' };
    }
    default:
      return { error: `unknown key "${key}"` };
  }
}

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { error: 'no front matter' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const data = {};
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (isBlank(line) || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) return { error: `line ${i + 1} is not "key: value"` };
    const key = line.slice(0, colon);
    if (!isValidKey(key)) return { error: `line ${i + 1} is not "key: value"` };
    const rest = line.slice(colon + 1);
    let raw;
    if (rest === '') raw = '';
    else if (rest.charCodeAt(0) === 32) raw = rest.slice(1);
    else return { error: `line ${i + 1} is not "key: value"` };
    let end = raw.length;
    while (end > 0) {
      const c = raw.charCodeAt(end - 1);
      if (c !== 32 && c !== 9) break;
      end--;
    }
    raw = raw.slice(0, end);
    if (!isKnownKey(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: lines.slice(close + 1).join('\n') };
}
