#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

function reject(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

if (process.argv.length !== 3) reject('USAGE_REPORT_PATH');
let expected;
try { expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch { reject('INVALID_EXPECTED_REPORT'); }

const response = fs.readFileSync(0, 'utf8').replace(/\r/g, '').trim();
const fences = [...response.matchAll(/```json\n([\s\S]*?)\n```/g)];
if (fences.length !== 1) reject('EXPECTED_EXACTLY_ONE_JSON_FENCE');

let embedded;
try { embedded = JSON.parse(fences[0][1]); } catch { reject('INVALID_EMBEDDED_JSON'); }
if (!isDeepStrictEqual(embedded, expected)) reject('REPORT_PAYLOAD_MISMATCH');

const before = response.slice(0, fences[0].index).trim();
const after = response.slice(fences[0].index + fences[0][0].length).trim();
if (before.length < 10 || !/[가-힣]/.test(before) || /[?？]/.test(before)) reject('INVALID_KOREAN_SUMMARY');

if (expected.terminal_status === 'partial') {
  if (expected.continuation?.question !== null) reject('PARTIAL_QUESTION_FORBIDDEN');
  if (after.length !== 0) reject('POST_EXECUTION_QUESTION_FORBIDDEN');
} else if (after.length !== 0) {
  reject('UNEXPECTED_POST_REPORT_CONTENT');
}

process.stdout.write(JSON.stringify({outcome: 'pass', json_fences: 1, trailing_question: false}) + '\n');
