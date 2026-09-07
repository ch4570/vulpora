#!/usr/bin/env node
'use strict';
const router = require('../skills/start-task/scripts/model-router.js');
module.exports = router;
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(router.main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', reason: /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_INPUT' }) + '\n');
    process.exitCode = 2;
  }
}
