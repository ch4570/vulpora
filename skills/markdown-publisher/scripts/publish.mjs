#!/usr/bin/env node
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactRecord, parseArgs, THEMES } from './lib.mjs';
import { renderHtml } from './render-html.mjs';
import { renderPdf } from './render-pdf.mjs';

function assertWritable(paths, force) {
  if (force) return;
  const existing = paths.find((filePath) => existsSync(filePath));
  if (existing) throw new Error(`artifact exists; pass --force to replace: ${existing}`);
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, path);
}

export async function publish(args) {
  if (!args.input || !args['output-dir']) throw new Error('--input and --output-dir are required');
  const theme = args.theme || 'minimal';
  if (!THEMES.has(theme)) throw new Error(`unsupported theme: ${theme}`);

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) throw new Error(`input not found: ${inputPath}`);
  const outputDir = resolve(args['output-dir']);
  mkdirSync(outputDir, { recursive: true });
  const sourcePath = join(outputDir, 'source.md');
  const htmlPath = join(outputDir, 'report.html');
  const pdfPath = join(outputDir, 'report.pdf');
  const manifestPath = join(outputDir, 'artifact-manifest.json');
  const planned = [htmlPath, manifestPath];
  if (realpathSync(inputPath) !== resolve(sourcePath)) planned.push(sourcePath);
  if (args.pdf) planned.push(pdfPath);
  assertWritable(planned, args.force);

  // --force authorizes replacement, but a failed replacement must not leave
  // the old manifest certifying a changed bundle. Preserve it before mutation.
  let previousManifest = null;
  let recoveryDir = null;
  if (args.force && existsSync(manifestPath)) {
    if (!lstatSync(manifestPath).isFile()) throw new Error('existing manifest must be a regular file');
    recoveryDir = mkdtempSync(join(outputDir, '.previous-manifest-'));
    previousManifest = join(recoveryDir, 'artifact-manifest.json');
    renameSync(manifestPath, previousManifest);
  }

  try {
    if (realpathSync(inputPath) !== resolve(sourcePath)) copyFileSync(inputPath, sourcePath);
    renderHtml({ input: sourcePath, output: htmlPath, theme, title: args.title, force: args.force });

    let pdf = null;
    let browser = null;
    let rendererExitMode = null;
    if (args.pdf) {
      const result = await renderPdf({ input: htmlPath, output: pdfPath, browser: args.browser, force: args.force });
      pdf = artifactRecord(outputDir, pdfPath);
      browser = result.browser;
      rendererExitMode = result.exitMode;
    }

    const manifest = {
      schema: 'markdown-publisher.artifact/v1',
      theme,
      source: artifactRecord(outputDir, sourcePath),
      html: artifactRecord(outputDir, htmlPath),
      pdf,
      renderer: args.pdf
        ? { kind: 'local-chromium', executable: browser, exit_mode: rendererExitMode }
        : null,
      qa: args.pdf
        ? { required: true, status: 'pending', next_skill: 'pdf-qa' }
        : { required: false, status: 'not_applicable', next_skill: null },
    };
    writeJsonAtomic(manifestPath, manifest);
  } catch (error) {
    if (previousManifest) {
      error.previousManifest = previousManifest;
      error.message = `${error.message}; previous manifest preserved: ${previousManifest}`;
    }
    throw error;
  }
  // A successful, validated replacement no longer needs the recovery copy.
  if (previousManifest) {
    unlinkSync(previousManifest);
    rmdirSync(recoveryDir);
  }
  return manifestPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const output = await publish(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`markdown-publisher: ${error.message}\n`);
    process.exitCode = 1;
  }
}
