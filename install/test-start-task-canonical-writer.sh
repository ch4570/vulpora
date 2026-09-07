#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
WRITER="$ROOT/skills/start-task/scripts/write-canonical-json.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-canonical-writer.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

REPO="$WORK/repo"
RUN_DIR="$REPO/.vulpora/tasks/run-writer-12345678"
mkdir -p "$RUN_DIR"

printf '{ "z": 2, "a": { "y": true, "x": 1 } }\n' \
  | (cd "$REPO" && node "$WRITER" .vulpora/tasks/run-writer-12345678/clarified-spec.yaml) \
  >"$WORK/result.json"

expected='{"a":{"x":1,"y":true},"z":2}'
actual="$(cat "$RUN_DIR/clarified-spec.yaml")"
[ "$actual" = "$expected" ] || { echo 'canonical bytes mismatch' >&2; exit 1; }
[ "$(wc -c < "$RUN_DIR/clarified-spec.yaml" | tr -d ' ')" -eq "${#expected}" ]
node - "$WORK/result.json" "$RUN_DIR/clarified-spec.yaml" <<'NODE'
const crypto=require('node:crypto'),fs=require('node:fs');
const [resultPath,writtenPath]=process.argv.slice(2),result=JSON.parse(fs.readFileSync(resultPath)),bytes=fs.readFileSync(writtenPath);
if((fs.statSync(writtenPath).mode & 0o777)!==0o600)throw new Error('canonical file mode must be 0600');
if(result.outcome!=='pass'||result.path!=='.vulpora/tasks/run-writer-12345678/clarified-spec.yaml'
  ||result.bytes!==bytes.length||result.sha256!==crypto.createHash('sha256').update(bytes).digest('hex'))process.exit(1);
NODE

if printf '{"replacement":true}' | (cd "$REPO" && node "$WRITER" .vulpora/tasks/run-writer-12345678/clarified-spec.yaml) >/dev/null 2>&1; then
  echo 'existing artifact was accepted' >&2; exit 1
fi
[ "$(cat "$RUN_DIR/clarified-spec.yaml")" = "$expected" ] || { echo 'existing artifact changed' >&2; exit 1; }

if printf '{broken' | (cd "$REPO" && node "$WRITER" .vulpora/tasks/run-writer-12345678/invalid.json) >/dev/null 2>&1; then
  echo 'invalid JSON was accepted' >&2; exit 1
fi
[ ! -e "$RUN_DIR/invalid.json" ]

if printf '{}' | (cd "$REPO" && node "$WRITER" "$WORK/absolute.json") >/dev/null 2>&1; then
  echo 'absolute target was accepted' >&2; exit 1
fi
if printf '{}' | (cd "$REPO" && node "$WRITER" .vulpora/tasks/../outside.json) >/dev/null 2>&1; then
  echo 'path traversal was accepted' >&2; exit 1
fi

mkdir "$WORK/outside"
ln -s "$WORK/outside" "$REPO/.vulpora/tasks/run-symlink-12345678"
if printf '{}' | (cd "$REPO" && node "$WRITER" .vulpora/tasks/run-symlink-12345678/artifact.json) >/dev/null 2>&1; then
  echo 'symlink parent was accepted' >&2; exit 1
fi
[ ! -e "$WORK/outside/artifact.json" ]

printf '{"semantic_ac_key":"start_task_canonical_writer","outcome":"pass","canonical_bytes":true,"exclusive_create":true,"path_confined":true,"symlink_parent_rejected":true}\n'
