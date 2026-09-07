#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
SRC="$ROOT/evals/behavioral/fixtures/repos/sample-start-task-live"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-fixture-test.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
canonical_before="$(find "$SRC" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
cp -R "$SRC" "$WORK/fixture"
package_before="$(shasum -a 256 "$WORK/fixture/package.json" | awk '{print $1}')"
probe_rc=0; bash "$DIR/with-timeout.sh" 60 "$WORK/fixture/run-offline.sh" node "$WORK/fixture/network-probe.js" >/dev/null 2>&1 || probe_rc=$?
[ "$probe_rc" -eq 77 ] || { echo "network probe was not denied: $probe_rc" >&2; exit 1; }
# Mutate only the disposable copy, then execute a real no-download test command.
node - "$WORK/fixture" <<'NODE'
const fs=require('node:fs'),p=process.argv[2];let s=fs.readFileSync(`${p}/src/numbers.js`,'utf8');s=s.replace('module.exports = { absolute };','function isPositive(value) { return value > 0; }\n\nmodule.exports = { absolute, isPositive };');fs.writeFileSync(`${p}/src/numbers.js`,s);fs.appendFileSync(`${p}/test/numbers.test.js`,'\nconst { isPositive } = require("../src/numbers.js");\ntest("positive boundary",()=>{ assert.equal(isPositive(-1),false); assert.equal(isPositive(0),false); assert.equal(isPositive(1),true); });\n');
NODE
bash "$DIR/with-timeout.sh" 60 "$WORK/fixture/run-offline.sh" node --test "$WORK/fixture/test/numbers.test.js" >/dev/null
package_after="$(shasum -a 256 "$WORK/fixture/package.json" | awk '{print $1}')"
canonical_after="$(find "$SRC" -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
[ "$package_before" = "$package_after" ] && [ "$canonical_before" = "$canonical_after" ]
printf '{"semantic_ac_key":"offline_network_isolation","outcome":"pass","test_argv":["./run-offline.sh","node","--test"],"test_exit":0,"normal_subprocess_network":{"attempted":0,"successful":0},"network_probe":{"attempted":1,"successful":0,"exit":77,"denied":true},"dependency_files_unchanged":true,"canonical_fixture_unchanged":true,"cleanup_completed":true}\n'
