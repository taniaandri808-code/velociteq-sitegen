// makefun-site's Markdown, reimplemented for speed: chunked inline rendering instead of per-character
// escaping, and a charCode lexer instead of a regex per line. Output is byte-identical to the reference.

import { escapeHtml, slugify, uniqueSlug } from './text.js';

const ESCAPABLE = new Set([92, 96, 42, 95, 91, 93, 40, 41, 35, 43, 45, 46, 33, 62]); // \ ` * _ [ ] ( ) # + - . ! >

function headingOf(line) {
  let d = 0;
  while (d < line.length && line.charCodeAt(d) === 35) d++;
  if (d < 1 || d > 6) return null;
  const c = line.charCodeAt(d);
  if (c !== 32 && c !== 9) return null;
  let end = line.length;
  while (end > d && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
  let start = d;
  while (start < end && (line.charCodeAt(start) === 32 || line.charCodeAt(start) === 9)) start++;
  if (start === end) return null;
  return { depth: d, text: line.slice(start, end) };
}

const isBlank = (line) => {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
};

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;

const endsParagraph = (line) => {
  if (isBlank(line)) return true;
  if (headingOf(line) !== null) return true;
  const c0 = line.charCodeAt(0);
  if (c0 === 45 || c0 === 42) {
    if (line.length >= 3 && line.charCodeAt(1) === c0 && line.charCodeAt(2) === c0) {
      for (let i = 3; i < line.length; i++) {
        const c = line.charCodeAt(i);
        if (c !== 32 && c !== 9) return false;
      }
      return true;
    }
    return false;
  }
  if (c0 === 96) return FENCE_OPEN.test(line);
  return false;
};

const trimLine = (line) => {
  const n = line.length;
  let a = 0, b = n;
  while (a < b && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
  while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
  return a === 0 && b === n ? line : line.slice(a, b);
};

/** `src`'s block tokens, in order. */
export function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    if (line.charCodeAt(0) === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const body = [];
        i++;
        while (i < n && !FENCE_CLOSE.test(lines[i])) body.push(lines[i++]);
        i++;
        tokens.push({ type: 'code', lang: fence[1], lines: body });
        continue;
      }
    }
    const heading = headingOf(line);
    if (heading !== null) { tokens.push({ type: 'heading', depth: heading.depth, text: heading.text }); i++; continue; }
    if (HR.test(line)) { tokens.push({ type: 'hr' }); i++; continue; }
    if (line.charCodeAt(0) === 62) {
      const body = [];
      while (i < n && lines[i].charCodeAt(0) === 62) body.push(trimLine(lines[i++].replace(/^> ?/, '')));
      tokens.push({ type: 'blockquote', lines: body.filter((l) => l !== '') });
      continue;
    }
    const c0 = line.charCodeAt(0);
    let bullet = null, ordered = null;
    if (c0 === 45 || c0 === 42) bullet = BULLET.exec(line);
    else if (c0 >= 48 && c0 <= 57) ordered = ORDERED.exec(line);
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < n) {
        const m = marker.exec(lines[i]);
        if (m !== null) { items.push([trimLine(isOrdered ? m[2] : m[1])]); i++; }
        else if (lines[i].length > 1 && lines[i].charCodeAt(0) === 32 && lines[i].charCodeAt(1) === 32 && !isBlank(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i])); i++;
        } else break;
      }
      tokens.push({ type: 'list', ordered: isOrdered, start: isOrdered ? Number(ordered[1]) : 1, items: items.map((parts) => parts.join('\n')) });
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < n && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

/** The first index from `from` where `s` holds `what` outside a backslash escape, or -1. */
function findUnescaped(s, what, from) {
  const last = s.length - what.length;
  for (let j = from; j <= last; j++) {
    if (s.charCodeAt(j) === 92 && j + 1 < s.length && ESCAPABLE.has(s.charCodeAt(j + 1))) { j++; continue; }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

/** The first single * from `from` (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < s.length && ESCAPABLE.has(s.charCodeAt(j + 1))) { j++; continue; }
    if (c !== 42) continue;
    if (s.charCodeAt(j + 1) === 42) { j++; continue; }
    return j;
  }
  return -1;
}

/** Single-character HTML escapes (no lookup through escapeHtml in the inline hot path). */
const SINGLE_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** First occurrence of any inline-special character, or -1. */
const SPECIAL = /[&<>"'\\`*[]/g;

/** `s` rendered inline; `env.link(target)` is a link's href. */
export function inline(s, env) {
  let out = '';
  let i = 0;
  const n = s.length;
  let plain = 0;
  SPECIAL.lastIndex = i;
  for (;;) {
    SPECIAL.lastIndex = plain;
    const m = SPECIAL.exec(s);
    const j = m === null ? n : m.index;
    if (j > plain) out += s.slice(plain, j);
    if (j === n) break;
    i = j;
    const c = s.charCodeAt(i);
    if (c === 38 || c === 60 || c === 62 || c === 34 || c === 39) {
      out += SINGLE_ESC[s[i]];
      i++;
      plain = i;
      continue;
    }
    if (c === 92) {
      if (i + 1 < n && ESCAPABLE.has(s.charCodeAt(i + 1))) {
        out += escapeHtml(s[i + 1]);
        i += 2;
      } else {
        out += '\\';
        i++;
      }
      plain = i;
      continue;
    }
    if (c === 96) {
      const k = s.indexOf('`', i + 1);
      if (k > i + 1) {
        out += `<code>${escapeHtml(s.slice(i + 1, k))}</code>`;
        i = k + 1;
      } else {
        out += '`';
        i++;
      }
      plain = i;
      continue;
    }
    if (c === 42) {
      if (s.charCodeAt(i + 1) === 42) {
        const k = findUnescaped(s, '**', i + 2);
        if (k > i + 2) {
          out += `<strong>${inline(s.slice(i + 2, k), env)}</strong>`;
          i = k + 2;
        } else {
          out += '**';
          i += 2;
        }
        plain = i;
        continue;
      }
      const k = findSingleStar(s, i + 1);
      if (k > i + 1) {
        out += `<em>${inline(s.slice(i + 1, k), env)}</em>`;
        i = k + 1;
      } else {
        out += '*';
        i++;
      }
      plain = i;
      continue;
    }
    // '['
    const k = findUnescaped(s, ']', i + 1);
    const e = k !== -1 && s.charCodeAt(k + 1) === 40 ? s.indexOf(')', k + 2) : -1;
    const target = e === -1 ? '' : s.slice(k + 2, e);
    if (target !== '' && !/\s/.test(target)) {
      out += `<a href="${escapeHtml(env.link(target))}">${inline(s.slice(i + 1, k), env)}</a>`;
      i = e + 1;
      plain = i;
      continue;
    }
    out += '[';
    i++;
    plain = i;
  }
  return out;
}

/** `src` rendered: its HTML, its table of contents and its excerpt. */
export function renderMarkdown(src, env) {
  const ids = new Set();
  let html = '';
  const toc = [];
  let excerpt = null;
  for (const t of lex(src)) {
    switch (t.type) {
      case 'heading': {
        const id = uniqueSlug(slugify(t.text), ids);
        const h = inline(t.text, env);
        html += `<h${t.depth} id="${id}">${h}</h${t.depth}>\n`;
        if (t.depth === 2 || t.depth === 3) toc.push({ level: t.depth, id, html: h });
        break;
      }
      case 'code': {
        const cls = t.lang === '' ? '' : ` class="language-${escapeHtml(t.lang)}"`;
        let body = '';
        for (const l of t.lines) body += `${escapeHtml(l)}\n`;
        html += `<pre><code${cls}>${body}</code></pre>\n`;
        break;
      }
      case 'hr':
        html += '<hr>\n';
        break;
      case 'blockquote':
        html += t.lines.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(t.lines.join('\n'), env)}</p>\n</blockquote>\n`;
        break;
      case 'list': {
        const tag = t.ordered ? 'ol' : 'ul';
        const open = t.ordered && t.start !== 1 ? `<ol start="${t.start}">` : `<${tag}>`;
        let inner = '';
        for (const item of t.items) inner += `<li>${inline(item, env)}</li>\n`;
        html += `${open}\n${inner}</${tag}>\n`;
        break;
      }
      case 'paragraph': {
        const h = inline(t.text, env);
        if (excerpt === null) excerpt = h;
        html += `<p>${h}</p>\n`;
        break;
      }
    }
  }
  return { html, toc, excerpt: excerpt ?? '' };
}
