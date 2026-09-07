#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXIT_USAGE = 2;
const EXIT_DEPENDENCY = 3;
const EXIT_RENDER = 4;

function fail(message, code = EXIT_USAGE) {
  process.stderr.write(`diagram-styler: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { target: 'document' };
  const valued = new Set(['--input', '--output', '--theme', '--target', '--title', '--description', '--manifest']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--preflight') {
      options.preflight = true;
      continue;
    }
    if (!valued.has(token)) fail(`unknown option: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return options;
}

function executableAt(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function findOnPath(name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const found = executableAt(path.join(directory, name));
    if (found) return found;
  }
  return null;
}

function findRenderer() {
  if (Object.prototype.hasOwnProperty.call(process.env, 'MMDC_BIN')) {
    const configured = process.env.MMDC_BIN;
    if (!configured) return null;
    return configured.includes(path.sep) ? executableAt(path.resolve(configured)) : findOnPath(configured);
  }
  return findOnPath('mmdc');
}

function rendererVersion(executable) {
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', shell: false });
  if (result.status !== 0) return 'unknown';
  return (result.stdout || result.stderr || '').trim() || 'unknown';
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validateSource(source) {
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) fail('input exceeds the 1 MiB safety limit');
  const firstMeaningful = source.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || '';
  if (!/^(flowchart\s+(?:LR|RL|TB|BT|TD)|graph\s+(?:LR|RL|TB|BT|TD)|sequenceDiagram\b|stateDiagram-v2\b|erDiagram\b|classDiagram\b)/.test(firstMeaningful)) {
    fail('input must start with a supported Mermaid diagram declaration');
  }
  const forbidden = [
    [/^\s*%%\{/im, 'initialization directives'],
    [/^\s*click\s+/im, 'click directives'],
    [/javascript\s*:/i, 'JavaScript URLs'],
    [/<\s*(?:script|iframe|object|embed|img)\b/i, 'active or remote HTML elements']
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) fail(`${label} are not allowed`);
  }
}

function accessibleSvg(svg, outputPath, title, description, maxWidth, background) {
  const opening = svg.match(/<svg\b([^>]*)>/i);
  if (!opening) fail('renderer output is not SVG', EXIT_RENDER);
  const slug = path.basename(outputPath, '.svg').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
  const titleId = `${slug}-title`;
  const descriptionId = `${slug}-desc`;
  let attributes = opening[1]
    .replace(/\s(?:role|aria-labelledby|width|height|style)=(?:"[^"]*"|'[^']*')/gi, '')
    .trim();
  attributes = attributes ? ` ${attributes}` : '';
  const replacement = `<svg${attributes} role="img" aria-labelledby="${titleId} ${descriptionId}" width="100%" height="auto" style="max-width: ${maxWidth}px; height: auto; background-color: ${background};">`;
  const accessible = `${replacement}<title id="${titleId}">${xmlEscape(title)}</title><desc id="${descriptionId}">${xmlEscape(description)}</desc>`;
  return svg.replace(opening[0], accessible);
}

function atomicWrite(destination, content) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, destination);
}

const options = parseArgs(process.argv.slice(2));
const renderer = findRenderer();

if (options.preflight) {
  const result = {
    available: Boolean(renderer),
    renderer: renderer ? 'mmdc' : null,
    executable: renderer,
    version: renderer ? rendererVersion(renderer) : null,
    runtime_download_allowed: false
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

for (const required of ['input', 'output', 'title', 'description']) {
  if (!options[required] || !options[required].trim()) fail(`--${required} is required`);
}
if (options.title.length > 120) fail('--title must be 120 characters or fewer');
if (options.description.length > 500) fail('--description must be 500 characters or fewer');
if (!renderer) fail('mmdc is not installed; preserve the .mmd source and report the missing renderer', EXIT_DEPENDENCY);

const inputPath = path.resolve(options.input);
const outputPath = path.resolve(options.output);
if (path.extname(inputPath).toLowerCase() !== '.mmd') fail('--input must be a .mmd file');
if (path.extname(outputPath).toLowerCase() !== '.svg') fail('--output must be a .svg file');
if (inputPath === outputPath) fail('input and output paths must differ');
if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) fail(`input file not found: ${inputPath}`);
const manifestPath = path.resolve(options.manifest || `${outputPath}.manifest.json`);
if (manifestPath === inputPath || manifestPath === outputPath) fail('manifest path must differ from input and output');

const targets = {
  document: { maxWidth: 960 },
  presentation: { maxWidth: 1600 },
  'dark-ui': { maxWidth: 1200 }
};
if (!Object.prototype.hasOwnProperty.call(targets, options.target)) fail(`unsupported target: ${options.target}`);
const theme = options.theme || (options.target === 'dark-ui' ? 'dark' : 'light');
if (!['light', 'dark'].includes(theme)) fail(`unsupported theme: ${theme}`);

const source = fs.readFileSync(inputPath, 'utf8');
validateSource(source);
const skillRoot = path.resolve(__dirname, '..');
const themePath = path.join(skillRoot, 'assets', 'themes', `${theme}.json`);
const themeConfig = JSON.parse(fs.readFileSync(themePath, 'utf8'));
const background = themeConfig.themeVariables && themeConfig.themeVariables.background;
if (!/^#[0-9A-Fa-f]{6}$/.test(background || '')) fail('theme background must be a six-digit hex color', EXIT_RENDER);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-styler-'));

try {
  const configPath = path.join(temporaryDirectory, 'mermaid-config.json');
  const temporarySvg = path.join(temporaryDirectory, 'diagram.svg');
  fs.writeFileSync(configPath, `${JSON.stringify(themeConfig, null, 2)}\n`);
  const render = spawnSync(renderer, ['--input', inputPath, '--output', temporarySvg, '--configFile', configPath, '--quiet'], {
    encoding: 'utf8',
    shell: false
  });
  if (render.status !== 0) {
    const details = (render.stderr || render.stdout || '').trim();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    fail(`mmdc failed${details ? `: ${details}` : ''}`, EXIT_RENDER);
  }
  if (!fs.existsSync(temporarySvg)) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    fail('mmdc completed without creating an SVG', EXIT_RENDER);
  }

  const rawSvg = fs.readFileSync(temporarySvg, 'utf8');
  if (!/<svg\b[^>]*>/i.test(rawSvg)) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    fail('renderer output is not SVG', EXIT_RENDER);
  }
  const svg = accessibleSvg(rawSvg, outputPath, options.title, options.description, targets[options.target].maxWidth, background);
  atomicWrite(outputPath, svg);

  const manifestDirectory = path.dirname(manifestPath);
  const manifest = {
    schema_version: 'visual-artifact.manifest/v1',
    source: {
      path: path.relative(manifestDirectory, inputPath) || path.basename(inputPath),
      media_type: 'text/vnd.mermaid',
      sha256: sha256(source)
    },
    artifact: {
      path: path.relative(manifestDirectory, outputPath) || path.basename(outputPath),
      media_type: 'image/svg+xml',
      sha256: sha256(svg)
    },
    renderer: {
      engine: 'mmdc',
      executable: renderer,
      version: rendererVersion(renderer),
      runtime_download_allowed: false
    },
    render: {
      theme,
      target: options.target,
      max_width_px: targets[options.target].maxWidth
    },
    accessibility: {
      role: 'img',
      title: options.title,
      description: options.description
    },
    qa: {
      source_preserved: true,
      visual_inspection_required: true,
      final_pdf_qa_required_when_embedded: true
    }
  };
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: 'rendered', output: outputPath, manifest: manifestPath })}\n`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
