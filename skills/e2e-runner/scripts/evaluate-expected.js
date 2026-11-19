#!/usr/bin/env node
'use strict';

// Evaluate one catalog `Expected` cell against an observed HTTP status and response body.
// Exit 0 = PASS, 1 = FAIL or NO_ASSERTION, 64 = malformed clause or missing capture.

const fs = require('node:fs');
const {ExpectedError, evaluateExpected} = require('./expected-assertions');

function usage(message) {
  process.stderr.write(`${message}\nusage: evaluate-expected.js <expected> <status> <body-file> [--vars <vars.json>]\n`);
  process.exit(64);
}

const args = process.argv.slice(2);
const varsIndex = args.indexOf('--vars');
const varsPath = varsIndex >= 0 ? args[varsIndex + 1] : null;
const positional = varsIndex >= 0 ? args.filter((_, index) => index !== varsIndex && index !== varsIndex + 1) : args;
if (positional.length !== 3 || (varsIndex >= 0 && !varsPath)) usage('invalid arguments');
const [expected, statusText, bodyPath] = positional;
if (!/^\d{3}$/.test(statusText)) usage('status must be a three-digit HTTP status');

let vars = {};
if (varsPath) {
  try { vars = JSON.parse(fs.readFileSync(varsPath, 'utf8')); } catch { usage('vars file must be JSON'); }
}
let bodyText = '';
try { bodyText = fs.readFileSync(bodyPath, 'utf8'); } catch { usage('body file is unreadable'); }

let result;
try {
  result = evaluateExpected(expected, statusText, bodyText, vars);
} catch (error) {
  if (error instanceof ExpectedError) usage(error.message);
  throw error;
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.outcome === 'PASS' ? 0 : 1);
