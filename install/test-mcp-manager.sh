#!/usr/bin/env bash
# Deterministic MCP pack lifecycle tests with isolated runtime CLI doubles.

set -u
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
CLI="$REPO_ROOT/vulpora"
WORK="$(mktemp -d /tmp/vulpora-mcp-test.XXXXXX)" || exit 1
WORK="$(cd "$WORK" && pwd -P)"
trap 'case "$WORK" in /tmp/vulpora-mcp-test.*|/private/tmp/vulpora-mcp-test.*) rm -rf "$WORK" ;; esac' EXIT

pass=0
fail=0
record() {
  output=""
  if eval "$2" 2>/dev/null; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    [ -z "$output" ] || printf '    %s\n' "$output"
    fail=$((fail + 1))
  fi
}

fake_bin="$WORK/bin"
fake_state="$WORK/state"
mkdir -p "$fake_bin" "$fake_state/codex" "$fake_state/claude" \
  "$WORK/project" "$WORK/notion-project" "$WORK/symlink-project/.codex" "$WORK/home"

cat > "$fake_bin/mcp-runtime" <<'FAKE'
#!/bin/bash
set -eu
runtime="$(basename "$0")"
[ "$1" = mcp ] || exit 2
shift
action="$1"
shift
case "$runtime" in codex) state_runtime=codex ;; claude) state_runtime=claude ;; *) exit 2 ;; esac
state_dir="$FAKE_MCP_STATE/$state_runtime"
mkdir -p "$state_dir"
printf '%s\t%s\t%s\n' "$runtime" "$action" "$*" >> "$FAKE_MCP_STATE/calls.log"
[ "$runtime" != codex ] \
  || printf '%s\t%s\n' "$PWD" "${CODEX_HOME:-}" >> "$FAKE_MCP_STATE/codex-contexts.log"
case "$action" in
  get)
    name="$1"
    [ -f "$state_dir/$name.url" ] || exit 1
    url="$(cat "$state_dir/$name.url")"
    codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
    if [ "$runtime" = codex ] \
      && [ "${FAKE_CODEX_GET_FAIL_WHEN_POLICY:-0}" = 1 ] \
      && [ -f "$codex_config" ] \
      && grep -Fq 'enabled_tools = ' "$codex_config"; then
      exit 1
    fi
    if [ "$runtime" = codex ] && [ "${FAKE_CODEX_GET_WRONG_ENDPOINT:-0}" = 1 ]; then
      url='https://unexpected.example/mcp'
    fi
    if [ "$runtime" = codex ]; then
      printf '%s\n  enabled: true\n  transport: streamable_http\n  url: %s\n' "$name" "$url"
    else
      printf '%s:\n  Scope: Project config\n  Status: ⏸ Pending approval (run `claude` to approve)\n  Type: http\n  URL: %s\n' "$name" "$url"
    fi
    ;;
  add)
    if [ "$runtime" = codex ]; then
      name="$1"
      shift
      [ "$1" = --url ] || exit 2
      url="$2"
      codex_root="${CODEX_HOME:-$HOME/.codex}"
      mkdir -p "$codex_root"
      printf '\n[mcp_servers.%s]\nurl = "%s"\n' "$name" "$url" >> "$codex_root/config.toml"
    else
      while [ "$#" -ge 2 ] && { [ "$1" = --transport ] || [ "$1" = --scope ]; }; do shift 2; done
      name="$1"
      url="$2"
    fi
    printf '%s\n' "$url" > "$state_dir/$name.url"
    ;;
  remove)
    if [ "$runtime" = claude ]; then
      while [ "$#" -ge 2 ] && [ "$1" = --scope ]; do shift 2; done
    fi
    name="$1"
    rm -f "$state_dir/$name.url"
    if [ "$runtime" = codex ]; then
      codex_root="${CODEX_HOME:-$HOME/.codex}"
      config="$codex_root/config.toml"
      if [ -f "$config" ]; then
        remove_tmp="$config.remove"
        awk -v wanted="$name" '
          BEGIN { skip = 0 }
          $0 == "[mcp_servers." wanted "]" || $0 == "[mcp_servers.\"" wanted "\"]" {
            skip = 1
            next
          }
          skip && /^\[/ { skip = 0 }
          !skip { print }
        ' "$config" > "$remove_tmp"
        mv "$remove_tmp" "$config"
      fi
    fi
    ;;
  login)
    name="$1"
    [ -f "$state_dir/$name.url" ] || exit 1
    printf '%s\n' "$name" >> "$FAKE_MCP_STATE/logins.log"
    ;;
  *) exit 2 ;;
esac
FAKE
chmod +x "$fake_bin/mcp-runtime"
ln -s "$fake_bin/mcp-runtime" "$fake_bin/codex"
ln -s "$fake_bin/mcp-runtime" "$fake_bin/claude"

run_cli() {
  HOME="$WORK/home" FAKE_MCP_STATE="$fake_state" PATH="$fake_bin:$PATH" bash "$CLI" "$@"
}

tui_mcp_install_keys() {
  # Setup, project scope, MCP, OpenAI Docs, apply. 런타임은 자동 감지된다.
  printf '\n'
  printf '\n%s\n' "$WORK/project"
  printf '\033[B\033[B\033[B\n'
  printf '\033[B \n'
  # Open details, return, then apply.
  printf 'dx\n'
}

tui_full_remove_keys() {
  # Full removal, project scope, review and apply. 런타임은 자동 감지된다.
  printf '\033[B\033[B\n'
  printf '\n%s\n' "$WORK/purge-project"
  printf '\n'
}

record 'MCP catalog lists hosted Notion and OpenAI documentation packs' \
  "output=\$(run_cli mcp list) \
   && printf '%s\n' \"\$output\" | grep -Fq 'https://mcp.notion.com/mcp' \
   && printf '%s\n' \"\$output\" | grep -Fq 'https://developers.openai.com/mcp' \
   && printf '%s\n' \"\$output\" | grep -Fq 'codex enabled_tools=notion-search,notion-fetch,search,fetch'"

record 'Codex Notion dry-run previews the hard tool policy without mutation' \
  "output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' \
      --dry-run notion) \
   && printf '%s\n' \"\$output\" | grep -Fq 'policy: vulpora-notion enabled_tools=notion-search,notion-fetch,search,fetch' \
   && [ ! -e '$WORK/notion-project/.codex/config.toml' ]"

record 'fresh Codex Notion install writes the exact read-only allowlist' \
  "output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' notion) \
   && printf '%s\n' \"\$output\" | grep -Fq 'policy_installed: vulpora-notion' \
   && grep -Fqx '[mcp_servers.vulpora-notion]' '$WORK/notion-project/.codex/config.toml' \
   && grep -Fqx 'enabled_tools = [\"notion-search\", \"notion-fetch\", \"search\", \"fetch\"]' \
        '$WORK/notion-project/.codex/config.toml' \
   && ! grep -Fq 'notion-create-pages' '$WORK/notion-project/.codex/config.toml'"

mkdir -p "$WORK/rollback-project"
record 'fresh Codex add rolls back when endpoint verification fails' \
  "rm -f '$fake_state/codex/vulpora-notion.url' \
   && output=\$(FAKE_CODEX_GET_WRONG_ENDPOINT=1 run_cli mcp install --runtime codex --scope project \
       --target '$WORK/rollback-project' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq '새 설정은 rollback했습니다' \
   && [ ! -e '$fake_state/codex/vulpora-notion.url' ] \
   && ! grep -Fq '[mcp_servers.vulpora-notion]' '$WORK/rollback-project/.codex/config.toml' \
   && printf '%s\n' 'https://mcp.notion.com/mcp' > '$fake_state/codex/vulpora-notion.url'"

record 'exact Codex Notion policy reinstall is idempotent' \
  "before=\$(grep -Fc $'codex\tadd\tvulpora-notion' '$fake_state/calls.log') \
   && run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' notion \
        | grep -Fq already_configured \
   && after=\$(grep -Fc $'codex\tadd\tvulpora-notion' '$fake_state/calls.log') \
   && [ \"\$before\" = \"\$after\" ] \
   && [ \"\$(grep -Fxc 'enabled_tools = [\"notion-search\", \"notion-fetch\", \"search\", \"fetch\"]' \
        '$WORK/notion-project/.codex/config.toml')\" = 1 ]"

record 'Codex status reports the exact Notion profile as read-only' \
  "run_cli mcp status --runtime codex --scope project --target '$WORK/notion-project' notion \
     | grep -Fq 'configured_read_only: vulpora-notion'"

record 'Codex 1.2.1 endpoint-only config upgrades in place without re-add' \
  "grep -v '^enabled_tools[[:space:]]*=' '$WORK/notion-project/.codex/config.toml' \
        > '$WORK/notion-project/.codex/config.toml.legacy' \
   && mv '$WORK/notion-project/.codex/config.toml.legacy' '$WORK/notion-project/.codex/config.toml' \
   && before=\$(grep -Fc $'codex\tadd\tvulpora-notion' '$fake_state/calls.log') \
   && output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' notion) \
   && printf '%s\n' \"\$output\" | grep -Fq 'policy_updated: vulpora-notion' \
   && after=\$(grep -Fc $'codex\tadd\tvulpora-notion' '$fake_state/calls.log') \
   && [ \"\$before\" = \"\$after\" ] \
   && grep -Fqx 'enabled_tools = [\"notion-search\", \"notion-fetch\", \"search\", \"fetch\"]' \
        '$WORK/notion-project/.codex/config.toml'"

record 'failed endpoint-only policy upgrade atomically restores the original config' \
  "grep -v '^enabled_tools[[:space:]]*=' '$WORK/notion-project/.codex/config.toml' \
        > '$WORK/notion-project/.codex/config.toml.legacy' \
   && printf 'operator_sentinel = \"keep\"\n' >> '$WORK/notion-project/.codex/config.toml.legacy' \
   && mv '$WORK/notion-project/.codex/config.toml.legacy' '$WORK/notion-project/.codex/config.toml' \
   && cp '$WORK/notion-project/.codex/config.toml' '$WORK/notion-project/.codex/config.before' \
   && output=\$(FAKE_CODEX_GET_FAIL_WHEN_POLICY=1 run_cli mcp install --runtime codex --scope project \
        --target '$WORK/notion-project' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq '기존 config를 원복했습니다' \
   && cmp -s '$WORK/notion-project/.codex/config.before' '$WORK/notion-project/.codex/config.toml' \
   && grep -Fqx 'operator_sentinel = \"keep\"' '$WORK/notion-project/.codex/config.toml' \
   && run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' notion >/dev/null"

record 'widened Codex Notion policy is preserved and rejected' \
  "sed 's/\"fetch\"\]/\"fetch\", \"notion-create-pages\"]/' \
        '$WORK/notion-project/.codex/config.toml' > '$WORK/notion-project/.codex/config.toml.widened' \
   && mv '$WORK/notion-project/.codex/config.toml.widened' '$WORK/notion-project/.codex/config.toml' \
   && output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/notion-project' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq existing_mcp_policy_conflict \
   && grep -Fq 'notion-create-pages' '$WORK/notion-project/.codex/config.toml' \
   && sed 's/, \"notion-create-pages\"//' '$WORK/notion-project/.codex/config.toml' \
        > '$WORK/notion-project/.codex/config.toml.restored' \
   && mv '$WORK/notion-project/.codex/config.toml.restored' '$WORK/notion-project/.codex/config.toml'"

record 'Codex status reports missing policy and login upgrades before OAuth' \
  "grep -v '^enabled_tools[[:space:]]*=' '$WORK/notion-project/.codex/config.toml' \
        > '$WORK/notion-project/.codex/config.toml.missing' \
   && mv '$WORK/notion-project/.codex/config.toml.missing' '$WORK/notion-project/.codex/config.toml' \
   && run_cli mcp status --runtime codex --scope project --target '$WORK/notion-project' notion \
        | grep -Fq 'policy_missing: vulpora-notion' \
   && output=\$(run_cli mcp login --runtime codex --scope project --target '$WORK/notion-project' notion) \
   && printf '%s\n' \"\$output\" | grep -Fq 'policy_updated: vulpora-notion' \
   && grep -Fqx 'vulpora-notion' '$fake_state/logins.log' \
   && grep -Fqx 'enabled_tools = [\"notion-search\", \"notion-fetch\", \"search\", \"fetch\"]' \
        '$WORK/notion-project/.codex/config.toml'"

record 'duplicate Codex Notion config section fails status validation' \
  "cp '$WORK/notion-project/.codex/config.toml' '$WORK/notion-project/.codex/config.toml.clean' \
   && printf '\n[mcp_servers.vulpora-notion]\nurl = \"https://mcp.notion.com/mcp\"\n' \
        >> '$WORK/notion-project/.codex/config.toml' \
   && run_cli mcp status --runtime codex --scope project --target '$WORK/notion-project' notion \
        | grep -Fq 'policy_error: vulpora-notion' \
   && mv '$WORK/notion-project/.codex/config.toml.clean' '$WORK/notion-project/.codex/config.toml'"

printf '%s\n' 'sentinel = true' > "$WORK/outside-config.toml"
ln -s "$WORK/outside-config.toml" "$WORK/symlink-project/.codex/config.toml"
record 'symlinked Codex config fails without mutating its target' \
  "output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/symlink-project' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq 'regular file이 아니거나 symlink' \
   && grep -Fqx 'sentinel = true' '$WORK/outside-config.toml'"

record 'Codex project dry-run is non-mutating' \
  "output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/project' \
      --dry-run openai-docs) \
   && printf '%s\n' \"\$output\" | grep -Fq 'add: vulpora-openai-docs' \
   && [ ! -e '$fake_state/codex/vulpora-openai-docs.url' ] \
   && [ ! -e '$WORK/project/.codex' ]"

record 'Codex project install uses isolated project config and verifies endpoint' \
  "run_cli mcp install --runtime codex --scope project --target '$WORK/project' \
      openai-docs >/dev/null \
   && grep -Fqx 'https://developers.openai.com/mcp' \
        '$fake_state/codex/vulpora-openai-docs.url' \
   && grep -Fq $'codex\tadd\tvulpora-openai-docs --url https://developers.openai.com/mcp' \
        '$fake_state/calls.log' \
   && [ -d '$WORK/project/.codex' ]"

record 'matching MCP install is idempotent' \
  "before=\$(grep -Fc $'codex\tadd\tvulpora-openai-docs' '$fake_state/calls.log') \
   && run_cli mcp install --runtime codex --scope project --target '$WORK/project' \
        openai-docs | grep -Fq already_configured \
   && after=\$(grep -Fc $'codex\tadd\tvulpora-openai-docs' '$fake_state/calls.log') \
   && [ \"\$before\" = \"\$after\" ]"

printf '%s\n' 'https://operator.example/mcp' > "$fake_state/codex/vulpora-notion.url"
record 'mismatched namespaced MCP is preserved instead of overwritten or removed' \
  "output=\$(run_cli mcp remove --runtime codex --scope project --target '$WORK/project' \
      notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq preserved_mcp_conflict \
   && grep -Fqx 'https://operator.example/mcp' '$fake_state/codex/vulpora-notion.url'"

record 'matching Codex MCP is removable by pack ID' \
  "run_cli mcp remove --runtime codex --scope project --target '$WORK/project' \
      openai-docs | grep -Fq 'removed: vulpora-openai-docs' \
   && [ ! -e '$fake_state/codex/vulpora-openai-docs.url' ]"

record 'Claude user install passes scope and defers Notion OAuth until first use' \
  "output=\$(run_cli mcp install --runtime claude-code --scope user notion) \
   && printf '%s\n' \"\$output\" | grep -Fq 'auth_deferred: vulpora-notion' \
   && grep -Fq $'claude\tadd\t--transport http --scope user vulpora-notion https://mcp.notion.com/mcp' \
        '$fake_state/calls.log'"

record 'Claude status reports project approval instead of a false configured state' \
  "run_cli mcp status --runtime claude-code --scope user notion \
     | grep -Fq 'approval_required: vulpora-notion'"

record 'MCP login delegates OAuth to the selected runtime' \
  "run_cli mcp login --runtime claude-code --scope user notion \
   && grep -Fqx 'vulpora-notion' '$fake_state/logins.log'"

record 'guided installer selects and installs an MCP pack without marketplace steps' \
  "printf '2\n%s\n1\n2\n2\n2\ny\n' '$WORK/project' \
     | HOME='$WORK/home' FAKE_MCP_STATE='$fake_state' \
       VULPORA_RUNTIME=claude-code PATH='$fake_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-mcp.log' \
   && grep -Fqx 'https://developers.openai.com/mcp' \
        '$fake_state/claude/vulpora-openai-docs.url' \
   && grep -Fq 'MCP: openai-docs' '$WORK/interactive-mcp.log' \
   && grep -Fq '첫 사용 시 /mcp에서 server 승인이 필요합니다' '$WORK/interactive-mcp.log' \
   && ! grep -Fq '인증 보류' '$WORK/interactive-mcp.log' \
   && ! grep -Fqi marketplace '$WORK/interactive-mcp.log'"

record 'guided Notion install defers OAuth instead of blocking the installer' \
  "run_cli mcp remove --runtime claude-code --scope user notion >/dev/null \
   && before=\$(wc -l < '$fake_state/logins.log') \
   && printf '2\n%s\n1\n2\n2\n1\ny\n' '$WORK/project' \
     | HOME='$WORK/home' FAKE_MCP_STATE='$fake_state' \
       VULPORA_RUNTIME=claude-code PATH='$fake_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-notion.log' \
   && after=\$(wc -l < '$fake_state/logins.log') \
   && [ \"\$before\" = \"\$after\" ] \
   && grep -Fqx 'https://mcp.notion.com/mcp' \
        '$fake_state/claude/vulpora-notion.url' \
   && grep -Fq 'auth_deferred: vulpora-notion' '$WORK/interactive-notion.log' \
   && grep -Fq '인증 보류' '$WORK/interactive-notion.log'"

record 'guided installer removes the selected MCP pack' \
  "printf '2\n%s\n2\n2\n2\n2\ny\n' '$WORK/project' \
     | HOME='$WORK/home' FAKE_MCP_STATE='$fake_state' \
       VULPORA_RUNTIME=claude-code PATH='$fake_bin:$PATH' \
       bash '$CLI' interactive > '$WORK/interactive-mcp-remove.log' \
   && [ ! -e '$fake_state/claude/vulpora-openai-docs.url' ] \
   && grep -Fq 'removed: vulpora-openai-docs' '$WORK/interactive-mcp-remove.log'"

record 'unknown MCP pack fails before runtime mutation' \
  "before=\$(wc -l < '$fake_state/calls.log') \
   && output=\$(run_cli mcp install --runtime codex --scope project --target '$WORK/project' \
        openai-docs unknown-pack 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq '알 수 없는 MCP pack' \
   && after=\$(wc -l < '$fake_state/calls.log') && [ \"\$before\" = \"\$after\" ] \
   && [ ! -e '$fake_state/codex/vulpora-openai-docs.url' ]"

record 'MCP user scope rejects a target outside canonical HOME' \
  "output=\$(run_cli mcp status --runtime claude-code --scope user \
       --target '$WORK/project' notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq 'exact canonical HOME'"

record 'MCP user scope rejects custom CODEX_HOME instead of silently overriding it' \
  "before=\$(wc -l < '$fake_state/calls.log') \
   && output=\$(CODEX_HOME='$WORK/custom-codex' run_cli mcp status --runtime codex --scope user notion 2>&1); rc=\$?; \
   [ \$rc -ne 0 ] && printf '%s\n' \"\$output\" | grep -Fq 'custom CODEX_HOME의 user scope' \
   && after=\$(wc -l < '$fake_state/calls.log') && [ \"\$before\" = \"\$after\" ]"

record 'Codex user MCP commands ignore the caller project and use canonical HOME' \
  "run_cli mcp status --runtime codex --scope user openai-docs >/dev/null \
   && grep -Fqx $'$WORK/home\t$WORK/home/.codex' '$fake_state/codex-contexts.log'"

record 'TTY interface installs an MCP with arrows and checkboxes' \
  "tui_mcp_install_keys \
     | HOME='$WORK/home' FAKE_MCP_STATE='$fake_state' \
       VULPORA_RUNTIME=claude-code PATH='$fake_bin:$PATH' \
       VULPORA_UI=tui TERM=xterm bash '$CLI' interactive > '$WORK/interactive-mcp-tui.log' \
   && grep -Fqx 'https://developers.openai.com/mcp' \
        '$fake_state/claude/vulpora-openai-docs.url' \
   && grep -Fq 'VULPORA' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq 'OpenAI Docs' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq 'space 선택' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq '[x]' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq '최근 작업 로그' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq 'MCP 작업' '$WORK/interactive-mcp-tui.log' \
   && ! grep -Fq \$'\033[2J' '$WORK/interactive-mcp-tui.log' \
   && grep -Fq 'add: vulpora-openai-docs' '$WORK/interactive-mcp-tui.log' \
   && ! grep -Fqi marketplace '$WORK/interactive-mcp-tui.log'"

record 'TTY full removal deletes the whole receipt but preserves runtime roots and foreign assets' \
  "mkdir -p '$WORK/purge-project' \
   && run_cli setup --runtime claude-code --scope project --target '$WORK/purge-project' \
        test-runner >/dev/null \
   && mkdir -p '$WORK/purge-project/.claude/agents' \
        '$WORK/purge-project/.claude/skills/retired-vulpora-skill' \
        '$WORK/purge-project/.claude/skills/company-skill' \
   && printf 'company agent\n' > '$WORK/purge-project/.claude/agents/company-agent.md' \
   && printf 'retired\n' > '$WORK/purge-project/.claude/skills/retired-vulpora-skill/SKILL.md' \
   && printf 'company skill\n' > '$WORK/purge-project/.claude/skills/company-skill/SKILL.md' \
   && HOME='$WORK/home' VULPORA_STATE_HOME='$WORK/home/.local/state/vulpora' bash -c \
        '. \"\$1\"; receipt_record_path \"\$2\" claude-code .claude/skills/retired-vulpora-skill \"\$2/.claude/skills/retired-vulpora-skill\"' \
        _ '$REPO_ROOT/install/receipt-lib.sh' '$WORK/purge-project' \
   && tui_full_remove_keys \
     | HOME='$WORK/home' FAKE_MCP_STATE='$fake_state' \
       VULPORA_RUNTIME=claude-code PATH='$fake_bin:$PATH' \
       VULPORA_UI=tui TERM=xterm bash '$CLI' interactive > '$WORK/interactive-full-remove.log' 2>&1 \
   && [ ! -e '$WORK/purge-project/.claude/agents/test-runner.md' ] \
   && [ ! -e '$WORK/purge-project/.claude/skills/retired-vulpora-skill' ] \
   && [ ! -e '$WORK/purge-project/.vulpora' ] \
   && [ -d '$WORK/purge-project/.claude/agents' ] \
   && [ -d '$WORK/purge-project/.claude/skills' ] \
   && grep -Fq 'company agent' '$WORK/purge-project/.claude/agents/company-agent.md' \
   && grep -Fq 'company skill' '$WORK/purge-project/.claude/skills/company-skill/SKILL.md' \
   && [ ! -e '$fake_state/claude/vulpora-notion.url' ] \
   && [ ! -e '$fake_state/claude/vulpora-openai-docs.url' ] \
   && grep -Fq $'claude\tremove\t--scope project vulpora-openai-docs' '$fake_state/calls.log' \
   && grep -Fq 'Vulpora 소유 항목 전체' '$WORK/interactive-full-remove.log'"

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
