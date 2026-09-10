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
  [ "$expected" = 64 ] && [ "$actual" = "$expected" ]
}

catalog_counts_match_release() {
  [ "$(agent_ids | wc -l | tr -d ' ')" = 28 ] \
    && [ "$(skill_ids | wc -l | tr -d ' ')" = 64 ]
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

install_codex_all_with_home() { # home target
  local fixture_home="$1" target="$2"
  mkdir -p "$fixture_home" "$target" || return 1
  HOME="$fixture_home" VULPORA_CODEX_MODEL='' VULPORA_CODEX_REASONING_EFFORT='' \
    bash "$SCRIPT_DIR/install.sh" -t "$target" --runtime codex --apply all-agents \
    >/dev/null 2>&1
}

without_developer_instructions() { # source output
  awk '
    /^developer_instructions[[:space:]]*=/ { skipping=1; next }
    skipping {
      if ($0 == "\"\"\"" || $0 == "\047\047\047") skipping=0
      next
    }
    { print }
  ' "$1"
}

restore_project_references() { # user adapter project-root equivalent output
  local source="$1" project="$2"
  awk -v project="$project" '
    $0 == "Before reading any referenced file, expand a leading ~/ to the current user home directory." { next }
    {
      line=$0
      gsub(/~\/\.codex/, project "/.codex", line)
      gsub(/~\/\.agents\/skills/, project "/.agents/skills", line)
      print line
    }
  ' "$source"
}

user_codex_install_is_portable() {
  local fixture_home="$WORK/fixture home" project id adapter
  project="$fixture_home/project fixture"
  install_codex_all_with_home "$fixture_home" "$fixture_home" || return 1
  for id in $(agent_ids); do
    adapter="$fixture_home/.codex/agents/$id.toml"
    [ -f "$adapter" ] || return 1
    grep -Fq '~/.codex' "$adapter" || return 1
    grep -Fq '~/.agents/skills' "$adapter" || return 1
    grep -Fq 'Before reading any referenced file, expand a leading ~/ to the current user home directory.' "$adapter" || return 1
    ! grep -Fq "$fixture_home" "$adapter" || return 1
  done
  # A project install remains the absolute-path oracle for the same adapters.
  install_codex_all_with_home "$fixture_home" "$project" || return 1
  for id in $(agent_ids); do
    adapter="$project/.codex/agents/$id.toml"
    grep -Fq "$project/.codex" "$adapter" || return 1
    grep -Fq "$project/.agents/skills" "$adapter" || return 1
    ! grep -Fq '~/.codex' "$adapter" || return 1
    ! grep -Fq '~/.agents/skills' "$adapter" || return 1
    without_developer_instructions "$adapter" > "$WORK/project.$id"
    without_developer_instructions "$fixture_home/.codex/agents/$id.toml" > "$WORK/user.$id"
    cmp -s "$WORK/user.$id" "$WORK/project.$id" || return 1
    restore_project_references "$fixture_home/.codex/agents/$id.toml" "$project" > "$WORK/restored.$id"
    cmp -s "$WORK/restored.$id" "$adapter" || return 1
  done
}

copied_user_install_uses_current_home() {
  local original="$WORK/fixture home" copied="$WORK/copied user" id adapter
  mkdir -p "$copied" || return 1
  cp -R "$original/.codex" "$copied/" || return 1
  cp -R "$original/.agents" "$copied/" || return 1
  HOME="$copied" bash "$SCRIPT_DIR/install.sh" -t "$copied" --runtime codex \
    --verify all-agents >/dev/null 2>&1 || return 1
  for id in $(agent_ids); do
    adapter="$copied/.codex/agents/$id.toml"
    grep -Fq '~/.codex' "$adapter" || return 1
    ! grep -Fq "$original" "$adapter" || return 1
  done
}

explicit_project_scope_wins_when_target_is_home() {
  local fixture_home="$WORK/explicit scope home" adapter
  mkdir -p "$fixture_home" || return 1
  HOME="$fixture_home" bash "$SCRIPT_DIR/install.sh" -t "$fixture_home" --scope project --runtime codex \
    --apply test-runner >/dev/null 2>&1 || return 1
  adapter="$fixture_home/.codex/agents/test-runner.toml"
  grep -Fq "$fixture_home/.codex" "$adapter" || return 1
  ! grep -Fq '~/.codex' "$adapter" || return 1
  HOME="$fixture_home" bash "$REPO_ROOT/vulpora" setup --runtime codex --scope project \
    --target "$fixture_home" test-runner >/dev/null 2>&1 || return 1
  grep -Fq "$fixture_home/.codex" "$adapter" || return 1
  ! grep -Fq '~/.codex' "$adapter"
}

check "catalog declares the 28-agent and 64-skill release" catalog_counts_match_release
check "every catalog agent has a Codex TOML adapter" all_source_adapters_exist
check "every Codex adapter passes its strict contract" all_source_adapters_validate
check "Codex adapter count matches the agent catalog" adapter_count_matches_catalog
check "every catalog skill has a SKILL.md entrypoint" all_catalog_skills_exist
check "skill entrypoint count matches the 64-skill catalog" skill_count_matches_catalog
check "default installed adapters are dispatch-neutral and doctor ignores ambient pins" neutral_install_and_verify
check "explicit pins survive doctor and can be cleared by an authorized reinstall" explicit_overrides_and_verify
check "model and reasoning pins are independent optional settings" independent_model_and_effort_overrides
check "invalid model or reasoning settings fail before any catalog mutation" invalid_override_has_no_side_effects
check "source placeholders remain strict and installed overrides are optional but validated" strict_optional_metadata
check "Codex user installs keep all 28 adapters portable and preserve non-instruction settings" user_codex_install_is_portable
check "a copied user install verifies after HOME changes and keeps tilde references" copied_user_install_uses_current_home
check "explicit project scope stays absolute when its target is HOME" explicit_project_scope_wins_when_target_is_home

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
