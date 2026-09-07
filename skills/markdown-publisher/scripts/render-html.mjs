#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferTitle, parseArgs, renderDocument, THEMES } from './lib.mjs';

export function renderHtml({ input, output, theme = 'minimal', title, force = false }) {
  if (!input || !output) throw new Error('--input and --output are required');
  if (!THEMES.has(theme)) throw new Error(`unsupported theme: ${theme}`);
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  if (!existsSync(inputPath)) throw new Error(`input not found: ${inputPath}`);
  if (existsSync(outputPath) && !force) throw new Error(`output exists; pass --force to replace: ${outputPath}`);

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const markdown = readFileSync(inputPath, 'utf8');
  const commonCss = readFileSync(resolve(root, 'assets/themes/common.css'), 'utf8');
  const themeCss = readFileSync(resolve(root, `assets/themes/${theme}.css`), 'utf8');
  const html = renderDocument({
    markdown,
    title: inferTitle(markdown, title),
    themeCss,
    commonCss,
    theme,
  });
  writeFileSync(outputPath, html, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
  return outputPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const output = renderHtml(args);
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`markdown-publisher: ${error.message}\n`);
    process.exitCode = 1;
  }
}
