#!/usr/bin/env node
'use strict';

const collector = require('../skills/start-task/scripts/codex-model-catalog.js');
module.exports = collector;
if (require.main === module) collector.main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`CODEX_MODEL_CATALOG_ERROR:${error.code || 'INTERNAL_ERROR'}\n`);
  process.exitCode = 1;
});
