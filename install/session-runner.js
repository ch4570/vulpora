#!/usr/bin/env node
'use strict';
const runner = require('../skills/start-task/scripts/session-runner.js');
module.exports = runner;
if (require.main === module) {
  Promise.resolve().then(() => runner.main(process.argv.slice(2))).then(result => {
    if (result !== undefined) process.stdout.write(JSON.stringify(result) + '\n');
    if (result && ['failed', 'blocked'].includes(result.status)) process.exitCode = 3;
  }).catch(error => {
    process.stderr.write(JSON.stringify(runner.errorResult(error)) + '\n');
    process.exitCode = 2;
  });
}
