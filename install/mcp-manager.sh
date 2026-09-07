#!/bin/bash
# Install, inspect, authenticate, and remove namespaced MCP configurations.

set -euo pipefail
set -f
umask 077

RUNTIME_PATH="${VULPORA_RUNTIME_PATH:-${PATH:-}}"
PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
CATALOG="$SCRIPT_DIR/mcp-packs.txt"
ACTION="${1:-}"
[ "$#" -eq 0 ] || shift
RUNTIME=""
SCOPE=project
TARGET=""
DRY_RUN=0
PACKS=""

die() { printf '오류: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  vulpora mcp list
  vulpora mcp install --runtime codex|claude-code --scope user|project
                        [--target <dir>] [--dry-run] <pack-id ...>
  vulpora mcp remove  --runtime codex|claude-code --scope user|project
                        [--target <dir>] [--dry-run] <pack-id ...>
  vulpora mcp status  --runtime codex|claude-code --scope user|project
                        [--target <dir>] <pack-id ...>
  vulpora mcp login   --runtime codex|claude-code --scope user|project
                        [--target <dir>] <pack-id ...>
USAGE
}

[ -f "$CATALOG" ] && [ ! -L "$CATALOG" ] || die "MCP pack catalog를 찾을 수 없습니다: $CATALOG"

catalog_rows() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 7; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      print $1 "|" $2 "|" $3 "|" $4 "|" $5 "|" $6 "|" $7
    }
  ' "$CATALOG"
}

catalog_row() {
  catalog_rows | awk -F'|' -v wanted="$1" '$1 == wanted { print; exit }'
}

if [ "$ACTION" = list ]; then
  [ "$#" -eq 0 ] || die "mcp list는 추가 인자를 받지 않습니다."
  printf '설치 가능한 MCP pack:\n'
  catalog_rows | while IFS='|' read -r id transport endpoint auth runtimes description codex_enabled_tools; do
    printf '  - %-16s %s\n' "$id" "$description"
    printf '    %s · auth=%s · runtimes=%s\n' "$endpoint" "$auth" "$runtimes"
    [ "$codex_enabled_tools" = - ] \
      || printf '    codex enabled_tools=%s\n' "$codex_enabled_tools"
  done
  exit 0
fi

case "$ACTION" in install|remove|status|login) ;; help|-h|--help|'') usage; exit 0 ;; *) die "알 수 없는 MCP 작업: $ACTION" ;; esac

while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime|-r) [ "$#" -ge 2 ] || die "--runtime 값이 필요합니다."; RUNTIME="$2"; shift 2 ;;
    --runtime=*) RUNTIME="${1#--runtime=}"; shift ;;
    --scope) [ "$#" -ge 2 ] || die "--scope 값이 필요합니다."; SCOPE="$2"; shift 2 ;;
    --scope=*) SCOPE="${1#--scope=}"; shift ;;
    --target|-t) [ "$#" -ge 2 ] || die "--target 값이 필요합니다."; TARGET="$2"; shift 2 ;;
    --target=*) TARGET="${1#--target=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "알 수 없는 옵션: $1" ;;
    *) PACKS="${PACKS:+$PACKS }$1"; shift ;;
  esac
done

case "$RUNTIME" in codex|claude-code) ;; *) die "--runtime codex 또는 claude-code가 필요합니다." ;; esac
case "$SCOPE" in user|project) ;; *) die "--scope user 또는 project가 필요합니다." ;; esac
[ -n "$PACKS" ] || die "MCP pack ID를 하나 이상 지정하세요. vulpora mcp list로 확인할 수 있습니다."
[ "$ACTION" != login ] || [ "$DRY_RUN" = 0 ] || die "mcp login에는 --dry-run을 사용할 수 없습니다."

if [ "$SCOPE" = project ]; then
  [ -n "$TARGET" ] || TARGET="$PWD"
  [ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "프로젝트 디렉터리가 없거나 symlink입니다: $TARGET"
  TARGET="$(cd "$TARGET" && pwd -P)"
else
  [ -n "${HOME:-}" ] && [ -d "$HOME" ] || die "HOME 경로를 확인할 수 없습니다."
  home_target="$(cd "$HOME" && pwd -P)"
  if [ "$RUNTIME" = codex ] && [ -n "${CODEX_HOME:-}" ]; then
    codex_home_parent="$(dirname "$CODEX_HOME")"
    [ -d "$codex_home_parent" ] \
      || die "custom CODEX_HOME의 parent directory를 확인할 수 없습니다: $codex_home_parent"
    resolved_codex_home="$(cd "$codex_home_parent" && pwd -P)/$(basename "$CODEX_HOME")"
    [ "$resolved_codex_home" = "$home_target/.codex" ] \
      || die "custom CODEX_HOME의 user scope는 MCP config target과 일치하지 않아 지원하지 않습니다. project scope를 사용하세요."
  fi
  if [ -n "$TARGET" ]; then
    [ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "user target이 없거나 symlink입니다: $TARGET"
    explicit_target="$(cd "$TARGET" && pwd -P)"
    [ "$explicit_target" = "$home_target" ] \
      || die "user scope의 --target은 exact canonical HOME이어야 합니다: $home_target"
  fi
  TARGET="$home_target"
fi

# Validate the complete request before invoking either runtime. This prevents a
# later bad pack ID from leaving an earlier valid pack partially installed.
for pack_id in $PACKS; do
  row="$(catalog_row "$pack_id")"
  [ -n "$row" ] || die "알 수 없는 MCP pack: $pack_id"
  transport="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
  runtimes="$(printf '%s' "$row" | awk -F'|' '{print $5}')"
  codex_enabled_tools="$(printf '%s' "$row" | awk -F'|' '{print $7}')"
  case ",$runtimes," in *",$RUNTIME,"*) ;; *) die "$pack_id pack은 $RUNTIME을 지원하지 않습니다." ;; esac
  [ "$transport" = http ] || die "지원하지 않는 MCP transport: $transport"
  case "$codex_enabled_tools" in
    -|notion-search,notion-fetch,search,fetch) ;;
    *) die "지원하지 않는 Codex MCP tool policy: $pack_id" ;;
  esac
done

runtime_has_cli() {
  case "$RUNTIME" in
    codex) PATH="$RUNTIME_PATH" command -v codex >/dev/null 2>&1 ;;
    claude-code) PATH="$RUNTIME_PATH" command -v claude >/dev/null 2>&1 ;;
  esac
}
runtime_has_cli || die "$RUNTIME CLI를 찾을 수 없습니다."

run_codex() {
  if [ "$SCOPE" = project ]; then
    if [ "$ACTION" = install ] && [ "$DRY_RUN" = 0 ]; then
      mkdir -p "$TARGET/.codex"
    elif [ ! -d "$TARGET/.codex" ]; then
      return 1
    fi
    (cd "$TARGET" && PATH="$RUNTIME_PATH" CODEX_HOME="$TARGET/.codex" codex mcp "$@")
  else
    (cd "$TARGET" && PATH="$RUNTIME_PATH" CODEX_HOME="$TARGET/.codex" codex mcp "$@")
  fi
}

run_claude() {
  if [ "$SCOPE" = project ]; then
    (cd "$TARGET" && PATH="$RUNTIME_PATH" claude mcp "$@")
  else
    PATH="$RUNTIME_PATH" claude mcp "$@"
  fi
}

runtime_get() {
  case "$RUNTIME" in
    codex) run_codex get "$1" ;;
    claude-code) run_claude get "$1" ;;
  esac
}

runtime_add() {
  case "$RUNTIME" in
    codex) run_codex add "$1" --url "$3" ;;
    claude-code) run_claude add --transport "$2" --scope "$SCOPE" "$1" "$3" ;;
  esac
}

runtime_remove() {
  case "$RUNTIME" in
    codex) run_codex remove "$1" ;;
    claude-code) run_claude remove --scope "$SCOPE" "$1" ;;
  esac
}

runtime_login() {
  case "$RUNTIME" in
    codex) run_codex login "$1" ;;
    claude-code) run_claude login "$1" ;;
  esac
}

get_existing() {
  set +e
  EXISTING_OUTPUT="$(runtime_get "$1" 2>&1)"
  EXISTING_RC=$?
  set -e
}

existing_matches_endpoint() {
  printf '%s\n' "$EXISTING_OUTPUT" \
    | awk -v expected="$1" '
        /^[[:space:]]*(url|URL):[[:space:]]*/ {
          value=$0
          sub(/^[[:space:]]*(url|URL):[[:space:]]*/, "", value)
          if (value == expected) found=1
        }
        END { exit(found ? 0 : 1) }
      '
}

codex_policy_line() {
  case "$1" in
    notion-search,notion-fetch,search,fetch)
      printf '%s\n' 'enabled_tools = ["notion-search", "notion-fetch", "search", "fetch"]'
      ;;
    -|'') return 1 ;;
    *) return 2 ;;
  esac
}

resolve_codex_config_file() {
  CODEX_CONFIG_FILE=""
  CODEX_POLICY_ERROR=""
  [ "$RUNTIME" = codex ] || return 0

  codex_root="$TARGET/.codex"
  case "$codex_root" in
    /*) ;;
    *) CODEX_POLICY_ERROR="Codex config root가 absolute path가 아닙니다: $codex_root"; return 1 ;;
  esac
  if [ -e "$codex_root" ] && { [ ! -d "$codex_root" ] || [ -L "$codex_root" ]; }; then
    CODEX_POLICY_ERROR="Codex config root가 directory가 아니거나 symlink입니다: $codex_root"
    return 1
  fi
  CODEX_CONFIG_FILE="$codex_root/config.toml"
  if [ -e "$CODEX_CONFIG_FILE" ] \
    && { [ ! -f "$CODEX_CONFIG_FILE" ] || [ -L "$CODEX_CONFIG_FILE" ]; }; then
    CODEX_POLICY_ERROR="Codex config가 regular file이 아니거나 symlink입니다: $CODEX_CONFIG_FILE"
    return 1
  fi
}

inspect_codex_policy() { # config-name catalog-policy
  policy_name="$1"
  policy_catalog="$2"
  CODEX_POLICY_STATE=not_applicable
  CODEX_POLICY_ERROR=""
  CODEX_POLICY_LINE=""

  [ "$RUNTIME" = codex ] || return 0
  [ "$policy_catalog" != - ] || return 0
  CODEX_POLICY_LINE="$(codex_policy_line "$policy_catalog")" \
    || { CODEX_POLICY_STATE=error; CODEX_POLICY_ERROR="지원하지 않는 Codex MCP tool policy"; return 1; }
  resolve_codex_config_file \
    || { CODEX_POLICY_STATE=error; return 1; }
  if [ ! -f "$CODEX_CONFIG_FILE" ]; then
    CODEX_POLICY_STATE=error
    CODEX_POLICY_ERROR="Codex config를 찾을 수 없습니다: $CODEX_CONFIG_FILE"
    return 1
  fi

  set +e
  policy_value="$(awk -v name="$policy_name" '
    BEGIN { in_server = 0; headers = 0; values = 0 }
    {
      sub(/\r$/, "", $0)
      if ($0 == "[mcp_servers." name "]" || $0 == "[mcp_servers.\"" name "\"]") {
        in_server = 1
        headers++
        next
      }
      if (in_server && $0 ~ /^\[/) in_server = 0
      if (in_server && $0 ~ /^[[:space:]]*enabled_tools[[:space:]]*=/) {
        value = $0
        sub(/^[[:space:]]*/, "", value)
        print value
        values++
      }
    }
    END {
      if (headers != 1) exit 42
      if (values > 1) exit 43
    }
  ' "$CODEX_CONFIG_FILE")"
  policy_rc=$?
  set -e
  if [ "$policy_rc" -ne 0 ]; then
    CODEX_POLICY_STATE=error
    CODEX_POLICY_ERROR="Codex MCP config section이 없거나 중복됐습니다: $policy_name"
    return 1
  fi
  if [ -z "$policy_value" ]; then
    CODEX_POLICY_STATE=missing
    return 0
  fi

  policy_compact="$(printf '%s' "$policy_value" | tr -d '[:space:]')"
  expected_compact="$(printf '%s' "$CODEX_POLICY_LINE" | tr -d '[:space:]')"
  if [ "$policy_compact" = "$expected_compact" ]; then
    CODEX_POLICY_STATE=exact
  else
    CODEX_POLICY_STATE=conflict
    CODEX_POLICY_ERROR="existing_mcp_policy_conflict: ${policy_name}의 enabled_tools를 보존합니다."
  fi
}

ensure_codex_policy() { # config-name catalog-policy
  policy_name="$1"
  policy_catalog="$2"
  CODEX_POLICY_CHANGED=0
  CODEX_POLICY_BACKUP=""
  inspect_codex_policy "$policy_name" "$policy_catalog" || return 1
  case "$CODEX_POLICY_STATE" in
    not_applicable|exact) return 0 ;;
    conflict|error) return 1 ;;
    missing) ;;
    *) CODEX_POLICY_ERROR="알 수 없는 Codex MCP policy 상태"; return 1 ;;
  esac

  CODEX_POLICY_BACKUP="$(mktemp "${CODEX_CONFIG_FILE}.vulpora.backup.XXXXXX")" \
    || { CODEX_POLICY_ERROR="Codex MCP policy backup을 만들 수 없습니다."; return 1; }
  if ! cp "$CODEX_CONFIG_FILE" "$CODEX_POLICY_BACKUP"; then
    rm -f "$CODEX_POLICY_BACKUP"
    CODEX_POLICY_BACKUP=""
    CODEX_POLICY_ERROR="Codex MCP policy backup을 기록할 수 없습니다."
    return 1
  fi
  policy_tmp="$(mktemp "${CODEX_CONFIG_FILE}.vulpora.XXXXXX")" \
    || { CODEX_POLICY_ERROR="Codex MCP policy 임시 파일을 만들 수 없습니다."; return 1; }
  set +e
  awk -v name="$policy_name" -v policy="$CODEX_POLICY_LINE" '
    BEGIN { headers = 0 }
    {
      sub(/\r$/, "", $0)
      print
      if ($0 == "[mcp_servers." name "]" || $0 == "[mcp_servers.\"" name "\"]") {
        print policy
        headers++
      }
    }
    END { if (headers != 1) exit 42 }
  ' "$CODEX_CONFIG_FILE" > "$policy_tmp"
  policy_write_rc=$?
  set -e
  if [ "$policy_write_rc" -ne 0 ]; then
    rm -f "$policy_tmp"
    CODEX_POLICY_ERROR="Codex MCP policy를 안전하게 기록할 수 없습니다: $policy_name"
    return 1
  fi
  if ! mv "$policy_tmp" "$CODEX_CONFIG_FILE"; then
    rm -f "$policy_tmp"
    CODEX_POLICY_ERROR="Codex MCP policy를 원자적으로 교체할 수 없습니다: $policy_name"
    return 1
  fi
  CODEX_POLICY_CHANGED=1
  inspect_codex_policy "$policy_name" "$policy_catalog" || return 1
  [ "$CODEX_POLICY_STATE" = exact ] \
    || { CODEX_POLICY_ERROR="Codex MCP policy 기록 후 검증에 실패했습니다: $policy_name"; return 1; }
}

commit_codex_policy() {
  [ -z "${CODEX_POLICY_BACKUP:-}" ] || rm -f "$CODEX_POLICY_BACKUP"
  CODEX_POLICY_BACKUP=""
}

restore_codex_policy() {
  [ -n "${CODEX_POLICY_BACKUP:-}" ] || return 0
  [ -f "$CODEX_POLICY_BACKUP" ] && [ ! -L "$CODEX_POLICY_BACKUP" ] || return 1
  mv "$CODEX_POLICY_BACKUP" "$CODEX_CONFIG_FILE" || return 1
  CODEX_POLICY_BACKUP=""
  CODEX_POLICY_CHANGED=0
}

verify_codex_runtime_config() { # config-name endpoint catalog-policy
  [ "$RUNTIME" = codex ] || return 0
  [ "$3" != - ] || return 0
  get_existing "$1"
  [ "$EXISTING_RC" = 0 ] && existing_matches_endpoint "$2" \
    || { CODEX_POLICY_ERROR="Codex가 hardening된 MCP config를 다시 읽지 못했습니다: $1"; return 1; }
}

rollback_new_mcp() { # config-name
  runtime_remove "$1" >/dev/null 2>&1 || return 1
  get_existing "$1"
  [ "$EXISTING_RC" -ne 0 ]
}

for pack_id in $PACKS; do
  row="$(catalog_row "$pack_id")"
  transport="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
  endpoint="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  auth="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
  runtimes="$(printf '%s' "$row" | awk -F'|' '{print $5}')"
  codex_enabled_tools="$(printf '%s' "$row" | awk -F'|' '{print $7}')"
  config_name="vulpora-$pack_id"

  get_existing "$config_name"
  case "$ACTION" in
    install)
      if [ "$EXISTING_RC" = 0 ]; then
        existing_matches_endpoint "$endpoint" \
          || die "existing_mcp_conflict: $config_name 이름의 기존 사용자 설정을 덮어쓰지 않습니다."
        if ! ensure_codex_policy "$config_name" "$codex_enabled_tools"; then
          policy_failure="$CODEX_POLICY_ERROR"
          restore_codex_policy \
            || die "$policy_failure (기존 config 원복에도 실패했습니다.)"
          die "$policy_failure (기존 config를 원복했습니다.)"
        fi
        if ! verify_codex_runtime_config "$config_name" "$endpoint" "$codex_enabled_tools"; then
          policy_failure="$CODEX_POLICY_ERROR"
          restore_codex_policy \
            || die "$policy_failure (기존 config 원복에도 실패했습니다.)"
          die "$policy_failure (기존 config를 원복했습니다.)"
        fi
        commit_codex_policy
        [ "$CODEX_POLICY_CHANGED" = 0 ] \
          || printf 'policy_updated: %s (%s)\n' "$config_name" "$codex_enabled_tools"
        printf 'already_configured: %s (%s)\n' "$config_name" "$endpoint"
        continue
      fi
      if [ "$DRY_RUN" = 1 ]; then
        printf 'add: %s (%s, scope=%s, runtime=%s)\n' "$config_name" "$endpoint" "$SCOPE" "$RUNTIME"
        if [ "$RUNTIME" = codex ] && [ "$codex_enabled_tools" != - ]; then
          printf 'policy: %s enabled_tools=%s\n' "$config_name" "$codex_enabled_tools"
        fi
        continue
      fi
      if [ "$RUNTIME" = codex ] && [ "$codex_enabled_tools" != - ]; then
        resolve_codex_config_file || die "$CODEX_POLICY_ERROR"
      fi
      runtime_add "$config_name" "$transport" "$endpoint"
      get_existing "$config_name"
      if [ "$EXISTING_RC" != 0 ] || ! existing_matches_endpoint "$endpoint"; then
        add_failure="MCP 등록 후 endpoint 검증에 실패했습니다: $config_name"
        if rollback_new_mcp "$config_name"; then
          die "$add_failure (새 설정은 rollback했습니다.)"
        fi
        die "$add_failure (자동 rollback도 실패했습니다. vulpora mcp remove로 확인하세요.)"
      fi
      if ! ensure_codex_policy "$config_name" "$codex_enabled_tools"; then
        policy_failure="$CODEX_POLICY_ERROR"
        restore_codex_policy || policy_failure="$policy_failure; policy snapshot 원복 실패"
        if rollback_new_mcp "$config_name"; then
          die "$policy_failure (새 설정은 rollback했습니다.)"
        fi
        die "$policy_failure (자동 rollback도 실패했습니다. vulpora mcp remove로 확인하세요.)"
      fi
      if ! verify_codex_runtime_config "$config_name" "$endpoint" "$codex_enabled_tools"; then
        policy_failure="$CODEX_POLICY_ERROR"
        restore_codex_policy || policy_failure="$policy_failure; policy snapshot 원복 실패"
        if rollback_new_mcp "$config_name"; then
          die "$policy_failure (새 설정은 rollback했습니다.)"
        fi
        die "$policy_failure (자동 rollback도 실패했습니다. vulpora mcp remove로 확인하세요.)"
      fi
      commit_codex_policy
      printf 'installed: %s (%s)\n' "$config_name" "$endpoint"
      [ "$CODEX_POLICY_CHANGED" = 0 ] \
        || printf 'policy_installed: %s (%s)\n' "$config_name" "$codex_enabled_tools"
      [ "$auth" != oauth ] \
        || printf 'auth_deferred: %s (첫 Notion 호출에서 인증 시작)\n' "$config_name"
      ;;
    remove)
      if [ "$EXISTING_RC" != 0 ]; then
        printf 'not_installed: %s\n' "$config_name"
        continue
      fi
      existing_matches_endpoint "$endpoint" \
        || die "preserved_mcp_conflict: endpoint가 catalog와 달라 $config_name 설정을 보존합니다."
      if [ "$DRY_RUN" = 1 ]; then
        printf 'remove: %s (%s, scope=%s, runtime=%s)\n' "$config_name" "$endpoint" "$SCOPE" "$RUNTIME"
      else
        runtime_remove "$config_name"
        get_existing "$config_name"
        [ "$EXISTING_RC" != 0 ] || die "MCP 제거 후에도 설정이 남아 있습니다: $config_name"
        printf 'removed: %s\n' "$config_name"
      fi
      ;;
    status)
      if [ "$EXISTING_RC" != 0 ]; then
        printf 'not_installed: %s\n' "$config_name"
      elif existing_matches_endpoint "$endpoint"; then
        if [ "$RUNTIME" = claude-code ]; then
          case "$EXISTING_OUTPUT" in
            *'Pending approval'*)
              printf 'approval_required: %s (Claude Code에서 /mcp를 열어 project server 승인)\n' "$config_name"
              ;;
            *'Needs authentication'*|*'Authentication required'*|*'authentication required'*)
              printf 'auth_required: %s (Claude Code에서 /mcp 또는 vulpora mcp login 실행)\n' "$config_name"
              ;;
            *'Failed to connect'*|*'failed to connect'*)
              printf 'connection_error: %s (claude mcp get 결과 확인)\n' "$config_name"
              ;;
            *)
              printf 'configured: %s (%s)\n' "$config_name" "$endpoint"
              ;;
          esac
        elif ! inspect_codex_policy "$config_name" "$codex_enabled_tools"; then
          printf 'policy_error: %s (%s)\n' "$config_name" "$CODEX_POLICY_ERROR"
        elif [ "$CODEX_POLICY_STATE" = missing ]; then
          printf 'policy_missing: %s (vulpora mcp install로 업데이트 필요)\n' "$config_name"
        elif [ "$CODEX_POLICY_STATE" = conflict ]; then
          printf 'policy_conflict: %s (기존 enabled_tools 보존)\n' "$config_name"
        else
          if [ "$CODEX_POLICY_STATE" = exact ]; then
            printf 'configured_read_only: %s (%s; %s)\n' \
              "$config_name" "$endpoint" "$codex_enabled_tools"
          else
            printf 'configured: %s (%s)\n' "$config_name" "$endpoint"
          fi
        fi
      else
        printf 'conflict: %s (catalog endpoint와 다름)\n' "$config_name"
      fi
      ;;
    login)
      [ "$auth" = oauth ] || { printf 'authentication_not_required: %s\n' "$config_name"; continue; }
      [ "$EXISTING_RC" = 0 ] && existing_matches_endpoint "$endpoint" \
        || die "먼저 $pack_id MCP pack을 설치하세요."
      if ! ensure_codex_policy "$config_name" "$codex_enabled_tools"; then
        policy_failure="$CODEX_POLICY_ERROR"
        restore_codex_policy \
          || die "$policy_failure (기존 config 원복에도 실패했습니다.)"
        die "$policy_failure (기존 config를 원복했습니다.)"
      fi
      if ! verify_codex_runtime_config "$config_name" "$endpoint" "$codex_enabled_tools"; then
        policy_failure="$CODEX_POLICY_ERROR"
        restore_codex_policy \
          || die "$policy_failure (기존 config 원복에도 실패했습니다.)"
        die "$policy_failure (기존 config를 원복했습니다.)"
      fi
      commit_codex_policy
      [ "$CODEX_POLICY_CHANGED" = 0 ] \
        || printf 'policy_updated: %s (%s)\n' "$config_name" "$codex_enabled_tools"
      runtime_login "$config_name"
      ;;
  esac
done
