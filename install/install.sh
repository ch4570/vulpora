#!/usr/bin/env bash
# Vulpora 설치기 — 필요한 자산만 골라 대상 레포에 설치한다.
#
# 자산 정의는 manifest.txt(SSOT)에서 읽는다. bash 3.2(macOS 기본)/zsh 호환.
# 기본 동작은 DRY-RUN(복사 안 함). 실제 복사는 --apply 필요.
#
# 사용법:
#   bash install/install.sh --list
#   bash install/install.sh -t <대상레포> postgres-dba
#   bash install/install.sh -t <대상레포> --apply postgres-dba kotlin-spring-reviewer
#   bash install/install.sh -t <대상레포> --apply commands githooks memory-policies
#   bash install/install.sh -t <대상레포> --verify postgres-dba
#   Optional --scope project|user preserves explicit install scope in Codex instructions.
#
# 자산 인자: pack:<id>, 에이전트/스킬/템플릿/메모리/eval id, 또는
#            all / all-agents / all-skills / all-templates / all-memory / all-evals

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.txt"
PACK_CATALOG="$SCRIPT_DIR/packs.txt"
CODEX_AGENT_VALIDATOR="$SCRIPT_DIR/validate-codex-agent.sh"
RECEIPT_LIB="$SCRIPT_DIR/receipt-lib.sh"

# def_path/dest 외 자산 종류(런타임 경로가 아니라 dest 컬럼으로 위치를 정한다)
EXTRA_KINDS="template memory eval"

TARGET=""
SCOPE=""  # optional: user|project; omitted retains destination-based auto mode
RUNTIME="claude-code"
APPLY=0
VERIFY=0
DO_LIST=0
ASSETS=""

die() { echo "오류: $*" >&2; exit 1; }

validate_codex_overrides() { # optional model, optional reasoning effort
  local model="$1" effort="$2"
  if [ -n "$model" ]; then
    case "$model" in
      [A-Za-z0-9]*) ;;
      *) die "VULPORA_CODEX_MODEL 형식이 안전하지 않습니다." ;;
    esac
    case "$model" in
      *[!A-Za-z0-9._:/-]*) die "VULPORA_CODEX_MODEL 형식이 안전하지 않습니다." ;;
    esac
    [ "${#model}" -le 128 ] || die "VULPORA_CODEX_MODEL은 128자 이하여야 합니다."
  fi
  case "$effort" in
    ''|minimal|low|medium|high|xhigh|max|ultra) ;;
    *) die "VULPORA_CODEX_REASONING_EFFORT는 minimal|low|medium|high|xhigh|max|ultra 중 하나여야 합니다." ;;
  esac
}

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# manifest 한 줄 조회: kind id ->
# "def|bundle|dependencies|dest|reserved|reserved|reserved" (공백 정규화).
manifest_lookup() {
  awk -F'|' -v k="$1" -v i="$2" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1==k && $2==i) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $3)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $4)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $5)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $6)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $7)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $8)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $9)
        print $3 "|" $4 "|" $5 "|" $6 "|" $7 "|" $8 "|" $9
        exit
      }
    }' "$MANIFEST"
}

# kind별 전체 id 목록
manifest_ids() {
  awk -F'|' -v k="$1" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2);
      if ($1==k) print $2 }' "$MANIFEST"
}

pack_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1 }
  ' "$PACK_CATALOG"
}

pack_row() { # id -> label|description|root-selectors
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 4; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == wanted) { print $2 "|" $3 "|" $4; exit }
    }
  ' "$PACK_CATALOG"
}

# 공백 구분 목록에 중복 없이 추가
add_unique() { # listvar value
  local cur="$1" val="$2" w
  for w in $cur; do [ "$w" = "$val" ] && { printf '%s' "$cur"; return; }; done
  printf '%s' "${cur:+$cur }$val"
}

RESOLVED_AGENTS=""
RESOLVED_SKILLS=""
RESOLVED_EXTRAS=""   # "kind:id" 토큰들 (template/memory/eval)

valid_asset_id() {
  case "$1" in
    ''|*[!a-z0-9-]*|-*) return 1 ;;
    *) return 0 ;;
  esac
}

resolve_dependency() {
  local token="$1" kind id
  case "$token" in
    skill:*) kind=skill; id="${token#skill:}" ;;
    agent:*) kind=agent; id="${token#agent:}" ;;
    *:*) die "지원하지 않는 의존 자산 형식: $token (skill:<id> 또는 agent:<id> 사용)" ;;
    *) kind=skill; id="$token" ;;
  esac
  valid_asset_id "$id" || die "잘못된 의존 자산 ID: $token"
  case "$kind" in
    skill) resolve_skill "$id" ;;
    agent) resolve_agent "$id" ;;
  esac
}

resolve_skill() {
  local id="$1" row dependencies dependency existing
  valid_asset_id "$id" || die "잘못된 스킬 ID: $id"
  for existing in $RESOLVED_SKILLS; do [ "$existing" = "$id" ] && return; done
  row="$(manifest_lookup skill "$id")"
  [ -n "$row" ] || die "알 수 없는 스킬: $id (manifest.txt에 없음)"
  # Mark before recursion so cross-kind cycles are finite and each asset is
  # emitted at most once.
  RESOLVED_SKILLS="$(add_unique "$RESOLVED_SKILLS" "$id")"
  dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  [ "$dependencies" = "-" ] && dependencies=""
  for dependency in $dependencies; do resolve_dependency "$dependency"; done
}

resolve_agent() {
  local id="$1" row dependencies dependency existing
  valid_asset_id "$id" || die "잘못된 에이전트 ID: $id"
  for existing in $RESOLVED_AGENTS; do [ "$existing" = "$id" ] && return; done
  row="$(manifest_lookup agent "$id")"
  [ -n "$row" ] || die "알 수 없는 에이전트: $id (manifest.txt에 없음)"
  RESOLVED_AGENTS="$(add_unique "$RESOLVED_AGENTS" "$id")"
  dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  [ "$dependencies" = "-" ] && dependencies=""
  for dependency in $dependencies; do resolve_dependency "$dependency"; done
}

resolve_extra() { # kind id
  local kind="$1" id="$2" row dependencies token existing
  for existing in $RESOLVED_EXTRAS; do [ "$existing" = "$kind:$id" ] && return 0; done
  row="$(manifest_lookup "$kind" "$id")"
  [ -n "$row" ] || die "알 수 없는 $kind 자산: $id (manifest.txt에 없음)"
  RESOLVED_EXTRAS="$(add_unique "$RESOLVED_EXTRAS" "$kind:$id")"
  dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  [ "$dependencies" = - ] && dependencies=""
  for token in $dependencies; do
    case "$token" in
      template:*) resolve_extra template "${token#template:}" ;;
      *) die "지원하지 않는 $kind dependency: $token" ;;
    esac
  done
}

resolve_asset() {
  local id="$1" k
  valid_asset_id "$id" || die "잘못된 자산 ID: $id"
  if [ -n "$(manifest_lookup agent "$id")" ]; then resolve_agent "$id"; return; fi
  if [ -n "$(manifest_lookup skill "$id")" ]; then resolve_skill "$id"; return; fi
  for k in $EXTRA_KINDS; do
    if [ -n "$(manifest_lookup "$k" "$id")" ]; then resolve_extra "$k" "$id"; return; fi
  done
  die "알 수 없는 자산: $id"
}

resolve_pack() {
  local id="$1" row roots root
  valid_asset_id "$id" || die "잘못된 pack ID: $id"
  row="$(pack_row "$id")"
  [ -n "$row" ] || die "알 수 없는 pack: $id (packs.txt에 없음)"
  roots="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  [ -n "$roots" ] || die "root selector가 없는 pack: $id"
  for root in $roots; do resolve_dependency "$root"; done
}

# --- 인자 파싱 ---
while [ $# -gt 0 ]; do
  case "$1" in
    -t|--target-repo) TARGET="${2:-}"; shift 2;;
    --scope)          SCOPE="${2:-}"; shift 2;;
    --scope=*)        SCOPE="${1#--scope=}"; shift;;
    -r|--runtime)     RUNTIME="${2:-}"; shift 2;;
    --apply)          APPLY=1; shift;;
    --verify)         VERIFY=1; shift;;
    --onboard)        die "--onboard는 1.0.0에서 제거되었습니다. 에이전트별 연결 설정을 사용하세요.";;
    -l|--list)        DO_LIST=1; shift;;
    -h|--help)        usage 0;;
    -*)               die "알 수 없는 옵션: $1";;
    *)                ASSETS="${ASSETS:+$ASSETS }$1"; shift;;
  esac
done

case "$SCOPE" in
  ''|user|project) ;;
  *) die "--scope는 user 또는 project여야 합니다." ;;
esac

[ -f "$MANIFEST" ] || die "manifest.txt를 찾을 수 없음: $MANIFEST"
[ -f "$PACK_CATALOG" ] || die "packs.txt를 찾을 수 없음: $PACK_CATALOG"
[ -f "$RECEIPT_LIB" ] && [ ! -L "$RECEIPT_LIB" ] \
  || die "receipt helper를 찾을 수 없음: $RECEIPT_LIB"
# shellcheck source=receipt-lib.sh
. "$RECEIPT_LIB"
# --- --list ---
if [ "$DO_LIST" = 1 ]; then
  echo "설치 가능한 capability pack:"
  for p in $(pack_ids); do
    row="$(pack_row "$p")"
    label="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
    description="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
    echo "  - pack:$p   → $label — $description"
  done
  echo ""
  echo "설치 가능한 에이전트:"
  for a in $(manifest_ids agent); do
    row="$(manifest_lookup agent "$a")"
    dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
    [ "$dependencies" = "-" ] && dependencies="(없음)"
    echo "  - $a   → 의존 자산: $dependencies"
  done
  echo ""
  echo "설치 가능한 스킬:"
  for s in $(manifest_ids skill); do
    row="$(manifest_lookup skill "$s")"
    dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
    [ "$dependencies" = "-" ] && dependencies="(없음)"
    echo "  - $s   → 의존 자산: $dependencies"
  done
  for k in $EXTRA_KINDS; do
    ids="$(manifest_ids "$k")"
    [ -n "$ids" ] || continue
    echo ""
    echo "설치 가능한 $k:"
    for x in $ids; do
      row="$(manifest_lookup "$k" "$x")"
      dest="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
      echo "  - $x   → 설치 경로: $dest"
    done
  done
  exit 0
fi

# --- 런타임 대상 경로 ---
case "$RUNTIME" in
  claude-code) RT_SUB=".claude";;
  opencode)    RT_SUB=".opencode";;
  codex)       RT_SUB=".codex";;
  *) die "지원하지 않는 runtime: $RUNTIME (claude-code|opencode|codex)";;
esac
if [ "$RUNTIME" = codex ] && [ "$VERIFY" != 1 ]; then
  # Setup validates before any target mutation. Doctor instead validates the
  # installed top-level settings, independent of ambient setup overrides.
  validate_codex_overrides "${VULPORA_CODEX_MODEL:-}" "${VULPORA_CODEX_REASONING_EFFORT:-}"
fi
AGENTS_SUB="$RT_SUB/agents"
if [ "$RUNTIME" = codex ]; then
  SKILLS_SUB=".agents/skills"
else
  SKILLS_SUB="$RT_SUB/skills"
fi

# dest 컬럼의 {RT} 를 런타임 디렉터리로 치환
expand_dest() { printf '%s' "${1//\{RT\}/$RT_SUB}"; }

# --- 자산 해소 ---
[ -n "$ASSETS" ] || die "설치할 자산을 지정하세요. (--list 로 목록 확인, --help 로 사용법)"
for a in $ASSETS; do
  case "$a" in
    pack:*)        resolve_pack "${a#pack:}";;
    all)           for x in $(manifest_ids agent); do resolve_agent "$x"; done
                   for x in $(manifest_ids skill); do resolve_skill "$x"; done
                   for k in $EXTRA_KINDS; do for x in $(manifest_ids "$k"); do resolve_extra "$k" "$x"; done; done;;
    all-agents)    for x in $(manifest_ids agent); do resolve_agent "$x"; done;;
    all-skills)    for x in $(manifest_ids skill); do resolve_skill "$x"; done;;
    all-templates) for x in $(manifest_ids template); do resolve_extra template "$x"; done;;
    all-memory)    for x in $(manifest_ids memory); do resolve_extra memory "$x"; done;;
    all-evals)     for x in $(manifest_ids eval); do resolve_extra eval "$x"; done;;
    *)             resolve_asset "$a";;
  esac
done

# Target-dependent modes validate after runtime/selector errors, but before any
# target-derived copy plan이 만들어지거나 출력되기 전에 대상 인자를 검증한다.
if [ -z "$TARGET" ]; then
  if [ "$VERIFY" = 1 ]; then
    die "--verify 에는 -t <대상레포> 가 필요합니다."
  elif [ "$APPLY" = 1 ]; then
    die "--apply 에는 -t <대상레포> 가 필요합니다."
  fi
fi
if [ "$APPLY" = 1 ] || [ "$VERIFY" = 1 ]; then
  [ -d "$TARGET" ] || die "대상 레포 디렉터리가 없습니다: $TARGET"
  [ ! -L "$TARGET" ] || die "대상 레포는 symlink일 수 없습니다: $TARGET"
  TARGET="$(cd "$TARGET" && pwd -P)" \
    || die "대상 레포 canonical path를 확인할 수 없습니다: $TARGET"
  if [ "$SCOPE" = user ]; then
    [ -d "${HOME:-}" ] || die "user scope의 HOME directory를 확인할 수 없습니다."
    home_target="$(cd "$HOME" && pwd -P)" \
      || die "user scope의 HOME canonical path를 확인할 수 없습니다: $HOME"
    [ "$TARGET" = "$home_target" ] \
      || die "user scope의 --target은 exact canonical HOME이어야 합니다: $home_target"
  fi
fi

VERIFY_ASSETS="$ASSETS"

# --- 복사 계획 만들기: "src<TAB>dest" 행들 ---
render_codex_adapter() { # template canonical-md codex-root agent-id output [scope] [model] [effort]
  local template="$1" canonical="$2" codex_root="$3" agent_id="$4" output="$5"
  local codex_skills_root="${3%/.codex}/.agents/skills"
  local instruction_root="$codex_root" current_home='' portable_home=0
  local scope="${6:-}" model_override="${7-${VULPORA_CODEX_MODEL:-}}" effort_override="${8-${VULPORA_CODEX_REASONING_EFFORT:-}}"
  # Only user installs follow the current home. Projects, including projects
  # below HOME, must keep referencing their own installed bundle.
  if [ "$scope" = project ]; then
    : # An explicit project scope remains absolute even when target equals HOME.
  elif [ "$scope" = user ]; then
    [ -n "${HOME:-}" ] && [ -d "$HOME" ] || return 1
    current_home="$(cd "$HOME" && pwd -P)" || return 1
    [ "$codex_root" = "$current_home/.codex" ] || return 1
    instruction_root='~/.codex'
    codex_skills_root='~/.agents/skills'
    portable_home=1
  elif [ -n "${HOME:-}" ] && [ -d "$HOME" ]; then
    current_home="$(cd "$HOME" && pwd -P)" || return 1
    if [ "$codex_root" = "$current_home/.codex" ]; then
      instruction_root='~/.codex'
      codex_skills_root='~/.agents/skills'
      portable_home=1
    fi
  fi
  # The '-' form deliberately preserves an explicitly supplied empty argument.
  # Doctor must not turn neutral installed metadata into an ambient env pin.
  validate_codex_overrides "$model_override" "$effort_override"
  # TOML literal strings preserve Markdown backslashes such as PostgreSQL's
  # `\d`; fail closed if canonical content contains the literal delimiter.
  awk -v root="$instruction_root" -v skills_root="$codex_skills_root" -v portable_home="$portable_home" \
    -v agent_id="$agent_id" -v model_override="$model_override" -v effort_override="$effort_override" '
    function resolve_root(line, token, pos) {
      # Codex agents and Agent Skills have different discovery roots. Resolve
      # the more specific skill prefix before the general release-root token.
      token = "${CLAUDE_PLUGIN_ROOT}/skills/"
      while ((pos = index(line, token)) > 0) {
        line = substr(line, 1, pos - 1) skills_root "/" substr(line, pos + length(token))
      }
      token = "${CLAUDE_PLUGIN_ROOT}"
      while ((pos = index(line, token)) > 0) {
        line = substr(line, 1, pos - 1) root substr(line, pos + length(token))
      }
      return line
    }
    FNR == NR {
      if (FNR == 1 && $0 == "---") { frontmatter = 1; next }
      if (frontmatter) {
        if ($0 == "---") frontmatter = 0
        next
      }
      line = resolve_root($0)
      if (index(line, "\047\047\047") > 0) literal_delimiter_conflict = 1
      body[++body_count] = line
      next
    }
    $0 == "developer_instructions = \"\"\"" {
      print "developer_instructions = \047\047\047"
      print "Vulpora canonical definition for " agent_id "."
      print "The installation resolved agent bundle references to " root " and skill references to " skills_root "."
      if (portable_home) print "Before reading any referenced file, expand a leading ~/ to the current user home directory."
      print ""
      for (i = 1; i <= body_count; i++) print body[i]
      replacing = 1
      replaced++
      next
    }
    replacing {
      if ($0 == "\"\"\"") {
        print "\047\047\047"
        replacing = 0
      }
      next
    }
    $0 ~ /^model = "/ {
      # Source models are compatibility placeholders, not installed defaults.
      # Explicit pins remain optional; absent values leave native dispatch free
      # to choose both model and reasoning effort.
      if (model_override != "") print "model = \"" model_override "\""
      if (effort_override != "") print "model_reasoning_effort = \"" effort_override "\""
      source_model_count++
      next
    }
    { print }
    END {
      if (frontmatter || replacing || body_count == 0 || replaced != 1 || literal_delimiter_conflict) exit 1
      if (source_model_count != 1) exit 1
    }
  ' "$canonical" "$template" > "$output"
}

installed_codex_setting() { # installed-adapter top-level-setting
  awk -F'"' -v setting="$2" '
    /^developer_instructions[[:space:]]*=/ || /^\[/ { exit }
    $0 ~ ("^" setting " = \"") { print $2; exit }
  ' "$1"
}

render_claude_definition() { # canonical-md claude-root output
  local canonical="$1" claude_root="$2" output="$3"
  awk -v root="$claude_root" '
    {
      token = "${CLAUDE_PLUGIN_ROOT}"
      line = $0
      while ((pos = index(line, token)) > 0) {
        line = substr(line, 1, pos - 1) root substr(line, pos + length(token))
      }
      print line
    }
  ' "$canonical" > "$output"
}

render_opencode_definition() { # canonical-md codex-template opencode-root output
  local canonical="$1" adapter="$2" opencode_root="$3" output="$4"
  # OpenCode discovers project agents from .opencode/agents. Keep the canonical
  # body, but replace Claude's package-root token and derive portable metadata
  # from the already validated Codex adapter instead of copying incompatible
  # Claude frontmatter verbatim.
  awk -v root="$opencode_root" '
    function resolve_root(line, token, pos) {
      token = "${CLAUDE_PLUGIN_ROOT}"
      while ((pos = index(line, token)) > 0) {
        line = substr(line, 1, pos - 1) root substr(line, pos + length(token))
      }
      return line
    }
    FNR == NR {
      if (FNR == 1) {
        if ($0 != "---") invalid_frontmatter = 1
        else in_frontmatter = 1
        next
      }
      if (in_frontmatter) {
        if ($0 ~ /^tools: /) allowed_tools = $0
        if ($0 ~ /^disallowedTools: /) denied_tools = $0
        if ($0 == "---") in_frontmatter = 0
        next
      }
      line = resolve_root($0)
      if (index(line, "${CLAUDE_PLUGIN_ROOT}") > 0) unresolved_root = 1
      body[++body_count] = line
      next
    }
    /^description = "[^"]+"$/ {
      line = $0
      sub(/^description = "/, "", line)
      sub(/"$/, "", line)
      description = line
      description_count++
      next
    }
    /^sandbox_mode = "(read-only|workspace-write)"$/ {
      line = $0
      sub(/^sandbox_mode = "/, "", line)
      sub(/"$/, "", line)
      sandbox_mode = line
      sandbox_count++
      next
    }
    END {
      if (invalid_frontmatter || in_frontmatter || unresolved_root ||
          body_count == 0 || description_count != 1 || sandbox_count != 1) exit 1
      print "---"
      print "description: >-"
      print "  " description
      print "mode: subagent"
      print "permission:"
      print "  \"*\": deny"
      print "  read:"
      print "    \"*\": allow"
      print "    \"*.env\": deny"
      print "    \"*.env.*\": deny"
      print "    \"*.env.example\": allow"
      print "  glob: allow"
      print "  grep: allow"
      print "  list: allow"
      print "  edit: " (sandbox_mode == "read-only" ? "deny" : "ask")
      bash_allowed = allowed_tools ~ /(^|[ ,])Bash([ ,]|$)/ && denied_tools !~ /(^|[ ,])Bash([ ,]|$)/
      print "  bash: " (sandbox_mode == "read-only" || !bash_allowed ? "deny" : "ask")
      print "  task: deny"
      print "  external_directory: deny"
      print "---"
      for (i = 1; i <= body_count; i++) print body[i]
    }
  ' "$canonical" "$adapter" > "$output"
}

PLAN=""
add_plan() {
  PLAN="${PLAN}${PLAN:+
}$1	$2	${3:-copy}	${4:--}"
}

for id in $RESOLVED_AGENTS; do
  row="$(manifest_lookup agent "$id")"
  def="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
  bundle="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
  # Codex-native custom agent adapter is optional and additive. Keep the
  # canonical .md beside it for human review and bundle-relative references.
  codex_adapter="${def%.md}.codex.toml"
  case "$RUNTIME" in
    claude-code)
      add_plan "$REPO_ROOT/$def" "$TARGET/$AGENTS_SUB/$(basename "$def")" \
        claude-agent "$TARGET/$RT_SUB"
      ;;
    opencode)
      [ -f "$REPO_ROOT/$codex_adapter" ] \
        || die "OpenCode metadata source가 없는 에이전트: $id"
      add_plan "$REPO_ROOT/$def" "$TARGET/$AGENTS_SUB/$(basename "$def")" \
        opencode-agent "$REPO_ROOT/$codex_adapter"
      ;;
    codex)
      add_plan "$REPO_ROOT/$def" "$TARGET/$AGENTS_SUB/$(basename "$def")"
      if [ -f "$REPO_ROOT/$codex_adapter" ]; then
        add_plan "$REPO_ROOT/$codex_adapter" "$TARGET/$AGENTS_SUB/$id.toml" \
          codex-adapter "$REPO_ROOT/$def"
      fi
      ;;
  esac
  if [ "$bundle" != "-" ] && [ -n "$bundle" ]; then
    add_plan "$REPO_ROOT/$bundle" "$TARGET/$AGENTS_SUB/$(basename "$bundle")"
  fi
done
for id in $RESOLVED_SKILLS; do
  row="$(manifest_lookup skill "$id")"
  def="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
  add_plan "$REPO_ROOT/$def" "$TARGET/$SKILLS_SUB/$(basename "$def")"
done
for tok in $RESOLVED_EXTRAS; do
  kind="${tok%%:*}"; id="${tok#*:}"
  row="$(manifest_lookup "$kind" "$id")"
  def="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
  dest="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
  [ -n "$dest" ] && [ "$dest" != "-" ] || die "$kind '$id' 에 dest가 없습니다(매니페스트 확인)."
  add_plan "$REPO_ROOT/$def" "$TARGET/$(expand_dest "$dest")"
done

# --- 출력 ---
echo "런타임: $RUNTIME"
echo "대상 레포: ${TARGET:-(미지정)}"
echo "해소된 에이전트: ${RESOLVED_AGENTS:-(없음)}"
echo "해소된 스킬: ${RESOLVED_SKILLS:-(없음)}"
echo "해소된 기타(template/memory/eval): ${RESOLVED_EXTRAS:-(없음)}"
echo ""
MODE="DRY-RUN (복사 안 함 — 실제 설치는 --apply)"
[ "$APPLY" = 1 ] && MODE="APPLY (실제 복사)"
[ "$VERIFY" = 1 ] && MODE="VERIFY (설치 결과 점검)"
echo "모드: $MODE"
echo "복사 계획:"
printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read -r src dest mode aux; do
  [ -n "$src" ] || continue
  echo "  $src"
  echo "    → $dest"
done
echo ""

# --- VERIFY 모드 ---
if [ "$VERIFY" = 1 ]; then
  fail=0
  for id in $RESOLVED_AGENTS; do
    row="$(manifest_lookup agent "$id")"
    def="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
    bundle="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
    installed_definition="$TARGET/$AGENTS_SUB/$(basename "$def")"
    if [ ! -f "$installed_definition" ]; then
      echo "  ✗ 정의 누락: $id"
      fail=1
    elif [ "$RUNTIME" = "claude-code" ]; then
      expected_definition="$(mktemp "${TMPDIR:-/tmp}/vulpora-claude-agent.XXXXXX")" \
        || die "Claude agent 검증 임시 파일 생성 실패"
      if ! render_claude_definition "$REPO_ROOT/$def" "$TARGET/$RT_SUB" "$expected_definition" \
        || ! cmp -s "$expected_definition" "$installed_definition"; then
        echo "  ✗ Claude 에이전트 정의 source catalog 불일치: $id"
        fail=1
      fi
      rm -f "$expected_definition"
    elif [ "$RUNTIME" = "opencode" ]; then
      codex_adapter="${def%.md}.codex.toml"
      expected_definition="$(mktemp "${TMPDIR:-/tmp}/vulpora-opencode-agent.XXXXXX")" \
        || die "OpenCode agent 검증 임시 파일 생성 실패"
      if [ ! -f "$REPO_ROOT/$codex_adapter" ] \
        || ! render_opencode_definition "$REPO_ROOT/$def" "$REPO_ROOT/$codex_adapter" \
          "$TARGET/$RT_SUB" "$expected_definition" \
        || ! cmp -s "$expected_definition" "$installed_definition"; then
        echo "  ✗ OpenCode 에이전트 정의 rendered catalog 불일치: $id"
        fail=1
      fi
      rm -f "$expected_definition"
    elif ! cmp -s "$REPO_ROOT/$def" "$installed_definition"; then
      echo "  ✗ 에이전트 정의 source catalog 불일치: $id"
      fail=1
    fi
    codex_adapter="${def%.md}.codex.toml"
    if [ "$RUNTIME" = "codex" ] && [ -f "$REPO_ROOT/$codex_adapter" ]; then
      installed_adapter="$TARGET/$AGENTS_SUB/$id.toml"
      if [ ! -f "$installed_adapter" ]; then
        echo "  ✗ Codex native adapter 누락: $id"
        fail=1
      elif [ ! -f "$CODEX_AGENT_VALIDATOR" ]; then
        echo "  ✗ Codex native adapter validator 누락: install/validate-codex-agent.sh"
        fail=1
      elif ! validator_output="$(bash "$CODEX_AGENT_VALIDATOR" "$installed_adapter" "$id" --installed 2>&1)"; then
        echo "  ✗ Codex native adapter 계약 위반: $id → $validator_output"
        fail=1
      else
        installed_model="$(installed_codex_setting "$installed_adapter" model)"
        installed_effort="$(installed_codex_setting "$installed_adapter" model_reasoning_effort)"
        expected_adapter="$(mktemp "${TMPDIR:-/tmp}/vulpora-codex-adapter.XXXXXX")" \
          || die "Codex adapter 검증 임시 파일 생성 실패"
        if ! render_codex_adapter "$REPO_ROOT/$codex_adapter" "$REPO_ROOT/$def" \
          "$TARGET/$RT_SUB" "$id" "$expected_adapter" "$SCOPE" "$installed_model" "$installed_effort" \
          || ! cmp -s "$expected_adapter" "$installed_adapter"; then
          echo "  ✗ Codex native adapter canonical definition 불일치: $id"
          fail=1
        fi
        rm -f "$expected_adapter"
      fi
    fi
    if [ "$bundle" != "-" ] && [ -n "$bundle" ]; then
      [ -d "$TARGET/$AGENTS_SUB/$(basename "$bundle")" ] || { echo "  ✗ 번들 누락(상대경로 깨짐): $id → $(basename "$bundle")/"; fail=1; }
    fi
  done
  for id in $RESOLVED_SKILLS; do
    [ -f "$TARGET/$SKILLS_SUB/$id/SKILL.md" ] \
      || { echo "  ✗ 스킬 파일 누락: $id → $SKILLS_SUB/$id/SKILL.md"; fail=1; }
  done
  for tok in $RESOLVED_EXTRAS; do
    kind="${tok%%:*}"; id="${tok#*:}"
    row="$(manifest_lookup "$kind" "$id")"
    dest="$(printf '%s' "$row" | awk -F'|' '{print $4}')"
    [ -e "$TARGET/$(expand_dest "$dest")" ] || { echo "  ✗ $kind 누락: $id → $(expand_dest "$dest")"; fail=1; }
  done
  if [ "$fail" = 0 ]; then echo "  ✓ 모든 자산과 의존성(번들·스킬·기타)이 설치되어 있습니다."; else die "검증 실패 — 위 누락 항목을 설치하세요."; fi
  exit 0
fi

# --- APPLY 모드 ---
if [ "$APPLY" = 1 ]; then
  receipt_store_is_safe "$TARGET" \
    || die "unsafe_receipt_store: .vulpora receipt 경로가 안전하지 않습니다."
  receipt_anchor_prepare "$TARGET" \
    || die "설치 receipt anchor를 준비할 수 없습니다."
  _VULPORA_RECEIPT_ANCHOR_PREPARED_TARGET="$TARGET"
  printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read -r src dest mode aux; do
    [ -n "$src" ] || continue
    [ -e "$src" ] || { echo "  ! 원본 없음(건너뜀): $src" >&2; continue; }
    prepared="$src"
    rendered=""
    if [ "$mode" = codex-adapter ]; then
      rendered="$(mktemp "${TMPDIR:-/tmp}/vulpora-codex-adapter.XXXXXX")" \
        || die "Codex adapter 생성 임시 파일 실패: $dest"
      render_codex_adapter "$src" "$aux" "$TARGET/$RT_SUB" \
        "$(basename "$dest" .toml)" "$rendered" "$SCOPE" \
        || die "Codex adapter 생성 실패: $dest"
      bash "$CODEX_AGENT_VALIDATOR" "$rendered" "$(basename "$dest" .toml)" --installed \
        || die "Codex adapter TOML 검증 실패: $dest"
      prepared="$rendered"
    elif [ "$mode" = claude-agent ]; then
      rendered="$(mktemp "${TMPDIR:-/tmp}/vulpora-claude-agent.XXXXXX")" \
        || die "Claude agent 생성 임시 파일 실패: $dest"
      render_claude_definition "$src" "$aux" "$rendered" \
        || die "Claude agent 생성 실패: $dest"
      prepared="$rendered"
    elif [ "$mode" = opencode-agent ]; then
      rendered="$(mktemp "${TMPDIR:-/tmp}/vulpora-opencode-agent.XXXXXX")" \
        || die "OpenCode agent 생성 임시 파일 실패: $dest"
      render_opencode_definition "$src" "$aux" "$TARGET/$RT_SUB" "$rendered" \
        || die "OpenCode agent 생성 실패: $dest"
      prepared="$rendered"
    elif [ "$mode" != copy ]; then
      die "알 수 없는 설치 plan mode: $mode"
    fi

    case "$dest" in
      "$TARGET"/*) rel="${dest#"$TARGET"/}" ;;
      *) die "설치 경로가 target 밖입니다: $dest" ;;
    esac
    receipt_relative_path_is_safe "$rel" \
      || die "안전하지 않은 설치 상대경로: $rel"
    receipt_path_has_symlink "$TARGET" "$rel" \
      && die "symlink 경로에는 설치할 수 없습니다: $rel"

    if [ -e "$dest" ]; then
      if receipt_paths_equal "$dest" "$prepared"; then
        :
      elif receipt_all_owner_snapshots_match "$TARGET" "$rel" "$dest"; then
        receipt_replace_relative "$TARGET" "$rel" "$prepared" "$dest" \
          || die "기존 receipt-owned 자산 갱신 실패: $rel"
      else
        die "existing_path_conflict: 기존 사용자 파일을 덮어쓰지 않습니다: $rel"
      fi
    else
      receipt_replace_relative "$TARGET" "$rel" "$prepared" - \
        || die "자산 설치 실패: $rel"
    fi
    receipt_record_path "$TARGET" "$RUNTIME" "$rel" "$dest" \
      || die "설치 receipt 기록 실패: $rel"
    [ -z "$rendered" ] || rm -f "$rendered"
  done
  echo "설치 완료. 검증하려면:"
  echo "  bash \"$SCRIPT_DIR/install.sh\" -t \"$TARGET\" --runtime $RUNTIME${SCOPE:+ --scope $SCOPE} --verify $VERIFY_ASSETS"
else
  echo "DRY-RUN입니다. 실제로 설치하려면 위 명령에 --apply 를 추가하세요."
fi
