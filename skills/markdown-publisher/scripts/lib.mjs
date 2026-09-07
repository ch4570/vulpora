import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

export const THEMES = new Set(['executive', 'technical', 'minimal']);

export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (['pdf', 'force', 'preflight'].includes(key)) {
      args[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function artifactRecord(root, filePath) {
  const absolute = resolve(filePath);
  return {
    path: absolute.slice(resolve(root).length + 1),
    sha256: sha256File(absolute),
    bytes: statSync(absolute).size,
  };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHref(raw) {
  const value = raw.trim();
  if (/^(?:https?:|mailto:|#|\.\.?\/)/i.test(value)) return value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//')) return value;
  return null;
}

function renderInline(raw) {
  const tokens = [];
  const protect = (html) => {
    const key = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let value = String(raw);
  if (/!\[[^\]]*\]\([^)]+\)/.test(value)) {
    throw new Error('image syntax is not supported: inline assets before publishing');
  }

  value = value.replace(/`([^`]+)`/g, (_match, code) => protect(`<code>${escapeHtml(code)}</code>`));
  value = escapeHtml(value);
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+[&quot;][^&]*[&quot;])?\)/g, (_match, label, href) => {
    const decodedHref = href.replaceAll('&amp;', '&');
    const allowed = safeHref(decodedHref);
    if (allowed === null) return label;
    const target = /^https?:/i.test(allowed) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return protect(`<a href="${escapeHtml(allowed)}"${target}>${label}</a>`);
  });
  value = value
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  return value.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)]);
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isTableDelimiter(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderList(lines, start) {
  const first = lines[start].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
  const ordered = first[2].endsWith('.');
  const baseIndent = first[1].length;
  const tag = ordered ? 'ol' : 'ul';
  const items = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
    if (!match || match[1].length !== baseIndent || match[2].endsWith('.') !== ordered) break;
    items.push(`<li>${renderInline(match[3])}</li>`);
    index += 1;
  }
  return { html: `<${tag}>\n${items.join('\n')}\n</${tag}>`, next: index };
}

export function markdownToBody(markdown) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w.+-]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index >= lines.length) throw new Error('unclosed fenced code block');
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      output.push(`<pre><code${language}>${escapeHtml(code.join('\n'))}</code></pre>`);
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    const callout = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
    if (callout) {
      const type = callout[1].toUpperCase();
      const content = [callout[2]];
      index += 1;
      while (index < lines.length && /^>/.test(lines[index])) {
        content.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<aside class="callout callout-${type.toLowerCase()}"><div class="callout-title">${type}</div><p>${renderInline(content.filter(Boolean).join(' '))}</p></aside>`);
      continue;
    }

    if (/^>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDelimiter(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        const cells = splitTableRow(lines[index]);
        if (cells.length !== headers.length) throw new Error(`table row has ${cells.length} cells; expected ${headers.length}`);
        rows.push(cells);
        index += 1;
      }
      const head = headers.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join('');
      const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('\n');
      output.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    if (/^(\s*)([-+*]|\d+\.)\s+/.test(line)) {
      const rendered = renderList(lines, index);
      output.push(rendered.html);
      index = rendered.next;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() !== '') {
      if (/^(#{1,6})\s+|^```|^>|^(\s*)([-+*]|\d+\.)\s+/.test(lines[index])) break;
      if (index + 1 < lines.length && lines[index].includes('|') && isTableDelimiter(lines[index + 1])) break;
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return output.join('\n');
}

export function inferTitle(markdown, override) {
  if (override) return override;
  const match = markdown.replace(/\r\n?/g, '\n').match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/[*_`~]/g, '').trim() : 'Published document';
}

export function renderDocument({ markdown, title, themeCss, commonCss, theme }) {
  if (!THEMES.has(theme)) throw new Error(`unsupported theme: ${theme}`);
  const body = markdownToBody(markdown);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="markdown-publisher">
  <title>${escapeHtml(title)}</title>
  <style data-layer="common">${commonCss}</style>
  <style data-layer="theme" data-theme="${theme}">${themeCss}</style>
</head>
<body>
  <main>${body}</main>
</body>
</html>\n`;
}

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveOnPath(name) {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

export function resolveBrowser(explicit) {
  const requested = explicit || process.env.MARKDOWN_PUBLISHER_BROWSER;
  if (requested) {
    const candidate = isAbsolute(requested) ? requested : resolveOnPath(requested);
    if (!candidate || !executable(candidate)) throw new Error(`browser executable is unavailable: ${requested}`);
    return candidate;
  }

  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'brave-browser']) {
    const candidate = resolveOnPath(name);
    if (candidate) return candidate;
  }

  for (const candidate of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ]) {
    if (existsSync(candidate) && executable(candidate)) return candidate;
  }

  throw new Error('no local Chromium-family browser found; install one or pass --browser /absolute/path');
}

export function skillRoot(metaUrl) {
  return resolve(dirname(new URL(metaUrl).pathname), '..');
}
