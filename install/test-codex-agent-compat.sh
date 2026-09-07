#!/usr/bin/env bash
# Codex custom-agent catalog regression tests. Bash 3.2 compatible.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.txt"
VALIDATOR="$SCRIPT_DIR/validate-codex-agent.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-codex-compat.XXXXXX")" || exit 1
WORK="$(cd "$WORK" && pwd -P)" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
export VULPORA_STATE_HOME="$WORK/state"

pass=0
fail=0
check() {
  label="$1"
  shift
  if "$@"; then
    printf '  ✓ %s\n' "$label"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$label"
    fail=$((fail + 1))
  fi
}

agent_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "agent") print $2
    }
  ' "$MANIFEST"
}

all_source_adapters_exist() {
  for id in $(agent_ids); do
    [ -f "$REPO_ROOT/agents/$id.codex.toml" ] || return 1
  done
}

all_source_adapters_validate() {
  for id in $(agent_ids); do
    bash "$VALIDATOR" "$REPO_ROOT/agents/$id.codex.toml" "$id" >/dev/null 2>&1 \
      || return 1
  done
}

adapter_count_matches_catalog() {
  expected="$(agent_ids | wc -l | tr -d ' ')"
  actual="$(find "$REPO_ROOT/agents" -maxdepth 1 -type f -name '*.codex.toml' \
    | wc -l | tr -d ' ')"
  [ "$actual" = "$expected" ]
}

skill_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "skill") print $2
    }
  ' "$MANIFEST"
}

all_catalog_skills_exist() {
  for id in $(skill_ids); do
    [ -f "$REPO_ROOT/skills/$id/SKILL.md" ] || return 1
  done
}

skill_count_matches_catalog() {
  expected="$(skill_ids | wc -l | tr -d ' ')"
  actual="$(find "$REPO_ROOT/skills" -mindepth 2 -maxdepth 2 -type f -name SKILL.md \
    | wc -l | tr -d ' ')"
  [ "$expected" = 62 ] && [ "$actual" = "$expected" ]
}

catalog_counts_match_release() {
  [ "$(agent_ids | wc -l | tr -d ' ')" = 28 ] \
    && [ "$(skill_ids | wc -l | tr -d ' ')" = 62 ]
}

install_fixture() { # label model-override effort-override
  mkdir -p "$WORK/$1" || return 1
  VULPORA_CODEX_MODEL="$2" VULPORA_CODEX_REASONING_EFFORT="$3" \
    bash "$SCRIPT_DIR/install.sh" -t "$WORK/$1" --runtime codex --apply test-runner >/dev/null 2>&1
}

verify_fixture() { # label ambient-model ambient-effort
  VULPORA_CODEX_MODEL="$2" VULPORA_CODEX_REASONING_EFFORT="$3" \
    bash "$SCRIPT_DIR/install.sh" -t "$WORK/$1" --runtime codex --verify test-runner >/dev/null 2>&1
}

neutral_install_and_verify() {
  install_fixture neutral '' '' || return 1
  local adapter="$WORK/neutral/.codex/agents/test-runner.toml"
  ! grep -Eq '^model[[:space:]]*=|^model_reasoning_effort[[:space:]]*=' "$adapter" || return 1
  grep -Fq 'Vulpora canonical definition for test-runner.' "$adapter" || return 1
  grep -Fq 'sandbox_mode = "workspace-write"' "$adapter" || return 1
  cmp -s "$REPO_ROOT/agents/test-runner.md" "$WORK/neutral/.codex/agents/test-runner.md" || return 1
  bash "$VALIDATOR" "$adapter" test-runner --installed >/dev/null 2>&1 || return 1
  verify_fixture neutral provider/ambient-model high || return 1
  # Even malformed ambient install settings cannot change a doctor projection.
  verify_fixture neutral 'bad"ambient' invalid-effort
}

explicit_overrides_and_verify() {
  install_fixture pinned provider/model-v1 medium || return 1
  local adapter="$WORK/pinned/.codex/agents/test-runner.toml"
  grep -Fxq 'model = "provider/model-v1"' "$adapter" || return 1
  grep -Fxq 'model_reasoning_effort = "medium"' "$adapter" || return 1
  verify_fixture pinned provider/unrelated ultra || return 1
  verify_fixture pinned '' '' || return 1
  # Reinstalling unchanged, installer-owned output can deliberately clear pins.
  install_fixture pinned '' '' || return 1
  ! grep -Eq '^model[[:space:]]*=|^model_reasoning_effort[[:space:]]*=' "$adapter" || return 1
  verify_fixture pinned provider/ambient high
}

independent_model_and_effort_overrides() {
  install_fixture effort-only '' high || return 1
  local adapter="$WORK/effort-only/.codex/agents/test-runner.toml"
  ! grep -Eq '^model[[:space:]]*=' "$adapter" || return 1
  grep -Fxq 'model_reasoning_effort = "high"' "$adapter" || return 1
  verify_fixture effort-only provider/ambient low || return 1
  install_fixture model-only provider/model-v1 '' || return 1
  adapter="$WORK/model-only/.codex/agents/test-runner.toml"
  grep -Fxq 'model = "provider/model-v1"' "$adapter" || return 1
  ! grep -Eq '^model_reasoning_effort[[:space:]]*=' "$adapter" || return 1
  verify_fixture model-only provider/ambient ultra
}

invalid_override_has_no_side_effects() {
  if install_fixture invalid-effort '' 'high"injected'; then return 1; fi
  [ ! -e "$WORK/invalid-effort/.codex" ] && [ ! -e "$WORK/invalid-effort/.vulpora" ] || return 1
  if install_fixture invalid-model -invalid low; then return 1; fi
  [ ! -e "$WORK/invalid-model/.codex" ] && [ ! -e "$WORK/invalid-model/.vulpora" ]
}

strict_optional_metadata() {
  local source="$REPO_ROOT/agents/test-runner.codex.toml"
  local adapter="$WORK/neutral/.codex/agents/test-runner.toml"
  [ -f "$adapter" ] || return 1
  awk '!/^model = /' "$source" > "$WORK/source-without-model.toml"
  if bash "$VALIDATOR" "$WORK/source-without-model.toml" test-runner >/dev/null 2>&1; then return 1; fi
  awk '/^model = / { print "model_reasoning_effort = \"high\"" } { print }' "$source" > "$WORK/source-with-effort.toml"
  if bash "$VALIDATOR" "$WORK/source-with-effort.toml" test-runner >/dev/null 2>&1; then return 1; fi
  awk '/^approval_policy/ { print "model = \"provider/one\""; print "model = \"provider/two\"" } { print }' \
    "$adapter" > "$WORK/duplicate-model.toml"
  if bash "$VALIDATOR" "$WORK/duplicate-model.toml" test-runner --installed >/dev/null 2>&1; then return 1; fi
  awk '/^approval_policy/ { print "model_reasoning_effort = \"low\""; print "model_reasoning_effort = \"high\"" } { print }' \
    "$adapter" > "$WORK/duplicate-effort.toml"
  if bash "$VALIDATOR" "$WORK/duplicate-effort.toml" test-runner --installed >/dev/null 2>&1; then return 1; fi
  awk '/^approval_policy/ { print "model_reasoning_effort = \"unrecognized\"" } { print }' \
    "$adapter" > "$WORK/invalid-effort.toml"
  if bash "$VALIDATOR" "$WORK/invalid-effort.toml" test-runner --installed >/dev/null 2>&1; then return 1; fi
  for effort in minimal low medium high xhigh max ultra; do
    awk -v effort="$effort" '/^approval_policy/ { print "model_reasoning_effort = \"" effort "\"" } { print }' \
      "$adapter" > "$WORK/valid-effort.toml"
    bash "$VALIDATOR" "$WORK/valid-effort.toml" test-runner --installed >/dev/null 2>&1 || return 1
  done
}

check "catalog declares the 28-agent and 62-skill release" catalog_counts_match_release
check "every catalog agent has a Codex TOML adapter" all_source_adapters_exist
check "every Codex adapter passes its strict contract" all_source_adapters_validate
check "Codex adapter count matches the agent catalog" adapter_count_matches_catalog
check "every catalog skill has a SKILL.md entrypoint" all_catalog_skills_exist
check "skill entrypoint count matches the 62-skill catalog" skill_count_matches_catalog
check "default installed adapters are dispatch-neutral and doctor ignores ambient pins" neutral_install_and_verify
check "explicit pins survive doctor and can be cleared by an authorized reinstall" explicit_overrides_and_verify
check "model and reasoning pins are independent optional settings" independent_model_and_effort_overrides
check "invalid model or reasoning settings fail before any catalog mutation" invalid_override_has_no_side_effects
check "source placeholders remain strict and installed overrides are optional but validated" strict_optional_metadata

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
