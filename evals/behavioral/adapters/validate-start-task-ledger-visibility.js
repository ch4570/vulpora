#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function fail(code, detail) {
  const suffix = detail === undefined ? '' : `:${String(detail).replace(/[\r\n]/g, ' ')}`;
  throw new Error(`${code}${suffix}`);
}

function readJsonLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      fail('MALFORMED_RUNTIME_EVENT', index + 1);
    }
  });
}

function codexAssistantText(events) {
  const threadResponse = events.find((event) => event.id === 2 && event.result?.thread?.id);
  const threadId = threadResponse?.result?.thread?.id;
  if (typeof threadId !== 'string' || threadId.length === 0) fail('CODEX_TOP_THREAD_NOT_FOUND');
  return events.flatMap((event) => {
    if (event.method !== 'item/completed' || event.params?.threadId !== threadId
      || event.params?.item?.type !== 'agentMessage') return [];
    return typeof event.params.item.text === 'string' ? [event.params.item.text] : [];
  });
}

function claudeAssistantText(events) {
  return events.flatMap((event) => {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];
    return event.message.content.flatMap((block) => (
      block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []
    ));
  });
}

function progressLines(messages) {
  return messages.flatMap((message) => message.split(/\r?\n/).map((line) => line.trim()))
    .filter((line) => line.startsWith('작업 로그: '));
}

function expectedProgressLine(record) {
  return `작업 로그: #${record.sequence} ${record.phase}/${record.event_type} — ${record.message} [head ${record.event_sha256.slice(0, 12)}]`;
}

function validate(runtimeEventsPath, ledgerPath, reportPath) {
  const events = readJsonLines(runtimeEventsPath);
  const records = readJsonLines(ledgerPath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const messages = report.runtime === 'codex'
    ? codexAssistantText(events)
    : report.runtime === 'claude-code'
      ? claudeAssistantText(events)
      : fail('UNSUPPORTED_RUNTIME', report.runtime);
  const visibleLines = progressLines(messages);

  if (visibleLines.length !== records.length) fail('VISIBLE_PROGRESS_COUNT_MISMATCH');
  for (let index = 0; index < records.length; index += 1) {
    if (visibleLines[index] !== expectedProgressLine(records[index])) {
      fail('VISIBLE_PROGRESS_LINE_MISMATCH', records[index].sequence);
    }
  }

  if (!Array.isArray(report.verification)) fail('REPORT_VERIFICATION_MISSING');
  for (const check of report.verification) {
    if (!Array.isArray(check.argv)) fail('REPORT_VERIFICATION_ARGV_INVALID');
    if (!(check.stdin_sha256 === null || /^[a-f0-9]{64}$/.test(check.stdin_sha256 || ''))) {
      fail('REPORT_VERIFICATION_STDIN_INVALID');
    }
    const digest = crypto.createHash('sha256').update(JSON.stringify({argv: check.argv, stdin_sha256: check.stdin_sha256})).digest('hex');
    const suffix = check.exit_code === null ? 'timeout' : `exit:${check.exit_code}`;
    if (!records.some((record) => record.event_type === 'command_finished'
      && record.source_ref === `command-sha256:${digest}:${suffix}`)) {
      fail('COMMAND_EVIDENCE_MISMATCH', digest);
    }
  }

  return {
    outcome: 'pass',
    runtime: report.runtime,
    visible_progress_count: records.length,
    command_evidence_count: report.verification.length,
  };
}

function main() {
  if (process.argv.length !== 5) {
    process.stderr.write('usage: validate-start-task-ledger-visibility.js RUNTIME_EVENTS LEDGER REPORT\n');
    process.exit(2);
  }
  try {
    process.stdout.write(`${JSON.stringify(validate(...process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message || 'LEDGER_VISIBILITY_VALIDATION_FAILED'}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {validate};
