#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILL="$ROOT/SKILL.md"
DETECTOR="$ROOT/scripts/detect-playwright-profile.js"
MANIFEST="$(cd "$ROOT/../.." && pwd -P)/install/manifest.txt"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-playwright-profile.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

test -s "$SKILL"
test -f "$DETECTOR"
grep -Fq 'skill | playwright-e2e | skills/playwright-e2e | - | e2e-runner | -' "$MANIFEST"
for required in \
  'detect-playwright-profile.js' \
  'PW-1 (Run namespace)' \
  'PW-2 (Manifest before action)' \
  'PW-3 (Finally cleanup)' \
  'PW-4 (Cleanup verification)' \
  'PW-0 (One owner)' \
  'globalSetup` returning its teardown function' \
  '`UNTRUSTED_ENVIRONMENT`' \
  "Playwright's auto-waiting" \
  'trace, screenshot, and video on failure' \
  'test-report/browser-e2e/{run-id}/'; do
  grep -Fq "$required" "$SKILL"
done

mkdir -p "$WORK/repo/tests"
cat > "$WORK/repo/package.json" <<'JSON'
{"devDependencies":{"@playwright/test":"1.54.0"},"scripts":{"e2e":"playwright test"}}
JSON
cat > "$WORK/repo/playwright.config.ts" <<'TS'
export default { projects: [{ name: 'chromium' }], use: { baseURL: 'http://127.0.0.1:3000' }, retries: 0, workers: 1 };
TS
cat > "$WORK/repo/tests/order.spec.ts" <<'TS'
import { test } from '@playwright/test';
import { seedOrder, cleanupOrder, verifyOrderAbsent } from './order-fixture';
test('order', async ({ page }) => { await seedOrder(); await page.getByRole('button'); await cleanupOrder(); await verifyOrderAbsent(); });
TS
cat > "$WORK/repo/tests/order-fixture.ts" <<'TS'
export async function seedOrder() {}
export async function cleanupOrder() {}
export async function verifyOrderAbsent() {}
TS
node "$DETECTOR" "$WORK/repo" > "$WORK/profile.json"
node - "$WORK/profile.json" <<'NODE'
const profile = require(process.argv[2]);
if (!profile.playwright.dependencyDeclared) process.exit(1);
if (!profile.playwright.testCommand || profile.playwright.testCommand.name !== 'e2e') process.exit(1);
if (profile.conventions.dataFixtureEvidence.length !== 1) process.exit(1);
if (profile.conventions.semanticSelectorEvidence.length !== 1) process.exit(1);
if (!profile.conventions.lifecycleSymbolsProven) process.exit(1);
if (profile.playwright.config.baseURL !== 'http://127.0.0.1:3000') process.exit(1);
if (profile.playwright.config.retries !== 0 || profile.playwright.config.workers !== 1) process.exit(1);
if (profile.readBudget.testFilesRead > profile.readBudget.testFileLimit) process.exit(1);
if (profile.readBudget.helperFilesRead > profile.readBudget.helperFileLimit) process.exit(1);
NODE

if grep -Eq 'npm install|pnpm add|yarn add' "$SKILL"; then
  echo 'dependency installation instruction found' >&2
  exit 1
fi

echo 'playwright e2e contract: PASS'
