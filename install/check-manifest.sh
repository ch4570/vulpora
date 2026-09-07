#!/usr/bin/env bash
# Agent and skill manifest/source consistency gate.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.txt"
PACK_CATALOG="$SCRIPT_DIR/packs.txt"
CODEX_AGENT_VALIDATOR="$SCRIPT_DIR/validate-codex-agent.sh"
MCP_CATALOG="$SCRIPT_DIR/mcp-packs.txt"
SKILL_CATALOG="$SCRIPT_DIR/skill-catalog.txt"

fail=0
flag() { echo "  ✗ $*"; fail=1; }

[ -f "$MANIFEST" ] || { echo "오류: manifest.txt 없음: $MANIFEST" >&2; exit 2; }
[ -f "$PACK_CATALOG" ] || { echo "오류: packs.txt 없음: $PACK_CATALOG" >&2; exit 2; }
[ -f "$MCP_CATALOG" ] || { echo "오류: mcp-packs.txt 없음: $MCP_CATALOG" >&2; exit 2; }
[ -f "$SKILL_CATALOG" ] || { echo "오류: skill-catalog.txt 없음: $SKILL_CATALOG" >&2; exit 2; }

manifest_ids() {
  awk -F'|' -v k="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == k) print $2
    }' "$MANIFEST"
}

manifest_row() {
  awk -F'|' -v k="$1" -v i="$2" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 6; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == k && $2 == i) { print $3 "|" $4 "|" $5 "|" $6; exit }
    }' "$MANIFEST"
}

is_registered() {
  for registered_id in $(manifest_ids "$1"); do
    [ "$registered_id" = "$2" ] && return 0
  done
  return 1
}

valid_asset_id() {
  case "$1" in
    ''|*[!a-z0-9-]*|-*) return 1 ;;
    *) return 0 ;;
  esac
}

validate_dependencies() { # owner-kind owner-id dependency-list
  local owner_kind="$1" owner_id="$2" dependencies="$3" token dependency_kind dependency_id
  [ -n "$dependencies" ] && [ "$dependencies" != "-" ] || return
  for token in $dependencies; do
    case "$token" in
      skill:*) dependency_kind=skill; dependency_id="${token#skill:}" ;;
      agent:*) dependency_kind=agent; dependency_id="${token#agent:}" ;;
      *:*) flag "지원하지 않는 의존 자산 형식: $owner_kind:$owner_id → $token"; continue ;;
      *) dependency_kind=skill; dependency_id="$token" ;;
    esac
    if ! valid_asset_id "$dependency_id"; then
      flag "잘못된 의존 자산 ID: $owner_kind:$owner_id → $token"
    elif ! is_registered "$dependency_kind" "$dependency_id"; then
      flag "의존 자산 미등록: $owner_kind:$owner_id → $token"
    fi
  done
}

validate_pack_roots() { # pack-id root-selector-list
  local pack_id="$1" roots="$2" token root_kind root_id
  for token in $roots; do
    case "$token" in
      skill:*) root_kind=skill; root_id="${token#skill:}" ;;
      agent:*) root_kind=agent; root_id="${token#agent:}" ;;
      *) flag "pack root는 explicit kind가 필요함: $pack_id → $token"; continue ;;
    esac
    if ! valid_asset_id "$root_id"; then
      flag "잘못된 pack root ID: $pack_id → $token"
    elif ! is_registered "$root_kind" "$root_id"; then
      flag "pack root 미등록: $pack_id → $token"
    fi
  done
}

echo "매니페스트: $MANIFEST"
echo ""

invalid_kinds="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
    if ($1 != "agent" && $1 != "skill" && $1 != "template" && $1 != "memory" && $1 != "eval") print $1
  }' "$MANIFEST")"
[ -z "$invalid_kinds" ] || flag "지원하지 않는 manifest kind: $(printf '%s' "$invalid_kinds" | tr '\n' ' ')"

manifest_shape_errors="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    for (n = 1; n <= NF; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
    if (NF != 6) print "invalid_columns:" NR
    if ($2 !~ /^[a-z0-9][a-z0-9-]*$/) print "invalid_id:" $2
  }
  ' "$MANIFEST")"
[ -z "$manifest_shape_errors" ] \
  || flag "manifest 행 계약 위반: $(printf '%s' "$manifest_shape_errors" | tr '\n' ' ')"

duplicates="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
    key=$1 "|" $2
    seen[key]++
  }
  END { for (key in seen) if (seen[key] > 1) print key }
  ' "$MANIFEST")"
[ -z "$duplicates" ] || flag "중복 manifest id: $(printf '%s' "$duplicates" | tr '\n' ' ')"

pack_catalog_errors="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    for (n = 1; n <= NF; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
    if (NF != 4) print "invalid_columns:" NR
    if ($1 !~ /^[a-z0-9][a-z0-9-]*$/) print "invalid_id:" $1
    if (seen[$1]++) print "duplicate_id:" $1
    if ($2 == "") print "missing_label:" $1
    if ($3 == "") print "missing_description:" $1
    if (length($3) > 160) print "description_too_long:" $1
    if ($4 == "") print "missing_roots:" $1
  }
  ' "$PACK_CATALOG")"
[ -z "$pack_catalog_errors" ] \
  || flag "pack catalog 계약 위반: $(printf '%s' "$pack_catalog_errors" | tr '\n' ' ')"

while IFS='|' read -r pack_id pack_roots; do
  [ -n "$pack_id" ] || continue
  validate_pack_roots "$pack_id" "$pack_roots"
done <<EOF
$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $4)
    print $1 "|" $4
  }
  ' "$PACK_CATALOG")
EOF

# Selective uninstall treats an agent bundle as one receipt-owned unit. A shared
# bundle would make removing one agent break another, so keep bundle ownership
# exclusive until the receipt format can represent dependency reference counts.
duplicate_agent_bundles="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $4)
    if ($1 == "agent" && $4 != "" && $4 != "-") seen[$4]++
  }
  END { for (bundle in seen) if (seen[bundle] > 1) print bundle }
  ' "$MANIFEST")"
[ -z "$duplicate_agent_bundles" ] \
  || flag "선택 제거를 지원하려면 agent bundle 소유권이 고유해야 함: $(printf '%s' "$duplicate_agent_bundles" | tr '\n' ' ')"

mcp_catalog_errors="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    for (n = 1; n <= 7; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
    if (NF != 7) print "invalid_columns:" NR
    if ($1 !~ /^[a-z0-9][a-z0-9-]*$/) print "invalid_id:" $1
    if (seen[$1]++) print "duplicate_id:" $1
    if ($2 != "http") print "unsupported_transport:" $1
    if ($3 !~ /^https:\/\//) print "non_https_endpoint:" $1
    if ($4 != "none" && $4 != "oauth") print "invalid_auth:" $1
    if ($5 != "codex,claude-code" && $5 != "claude-code,codex") print "invalid_runtimes:" $1
    if ($6 == "") print "missing_description:" $1
    if ($1 == "notion" && $7 != "notion-search,notion-fetch,search,fetch") print "invalid_notion_policy:" $7
    if ($1 != "notion" && $7 != "-") print "unexpected_codex_policy:" $1
  }
  ' "$MCP_CATALOG")"
[ -z "$mcp_catalog_errors" ] \
  || flag "MCP pack catalog 계약 위반: $(printf '%s' "$mcp_catalog_errors" | tr '\n' ' ')"

skill_catalog_errors="$(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    for (n = 1; n <= 3; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
    if (NF != 3) print "invalid_columns:" NR
    if ($1 !~ /^[a-z0-9][a-z0-9-]*$/) print "invalid_id:" $1
    if (seen[$1]++) print "duplicate_id:" $1
    if ($2 == "") print "missing_label:" $1
    if ($3 == "") print "missing_description:" $1
    if (length($3) > 120) print "description_too_long:" $1
  }
  ' "$SKILL_CATALOG")"
[ -z "$skill_catalog_errors" ] \
  || flag "스킬 설명 catalog 계약 위반: $(printf '%s' "$skill_catalog_errors" | tr '\n' ' ')"

for id in $(manifest_ids skill); do
  awk -F'|' -v wanted="$id" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 == wanted) found=1 }
    END { exit(found ? 0 : 1) }
  ' "$SKILL_CATALOG" || flag "스킬 설명 누락: $id"
done

for id in $(awk -F'|' '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1 }
  ' "$SKILL_CATALOG"); do
  is_registered skill "$id" || flag "미등록 스킬 설명: $id"
done

echo "(1) 파일시스템 → 매니페스트"
for definition in "$REPO_ROOT"/agents/*.md; do
  [ -f "$definition" ] || continue
  id="$(basename "$definition" .md)"
  is_registered agent "$id" \
    || flag "미등록 에이전트: agents/$id.md (manifest.txt에 agent 행 추가 필요)"
done

for skill_dir in "$REPO_ROOT"/skills/*; do
  [ -d "$skill_dir" ] || continue
  id="$(basename "$skill_dir")"
  [ -f "$skill_dir/SKILL.md" ] || flag "스킬 진입점 누락: skills/$id/SKILL.md"
  is_registered skill "$id" \
    || flag "미등록 스킬: skills/$id (manifest.txt에 skill 행 추가 필요)"
done

for adapter in "$REPO_ROOT"/agents/*.codex.toml; do
  [ -f "$adapter" ] || continue
  id="$(basename "$adapter" .codex.toml)"
  [ -f "$REPO_ROOT/agents/$id.md" ] \
    || flag "Codex adapter의 canonical 정의 없음: agents/$id.md"
  is_registered agent "$id" || flag "Codex adapter가 manifest agent에 미등록: $id"
  if [ ! -f "$CODEX_AGENT_VALIDATOR" ]; then
    flag "Codex adapter validator 누락: install/validate-codex-agent.sh"
  elif ! output="$(bash "$CODEX_AGENT_VALIDATOR" "$adapter" "$id" 2>&1)"; then
    flag "Codex adapter TOML 계약 위반: $id → $output"
  fi
done

echo "(2) 매니페스트 → 파일시스템"
for id in $(manifest_ids agent); do
  row="$(manifest_row agent "$id")"
  definition="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
  bundle="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
  dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  destination="$(printf '%s' "$row" | awk -F'|' '{print $4}')"

  [ -f "$REPO_ROOT/$definition" ] || flag "에이전트 정의 없음: $id → $definition"
  adapter="${definition%.md}.codex.toml"
  [ -f "$REPO_ROOT/$adapter" ] || flag "Codex native adapter 없음: $id → $adapter"
  if [ "$bundle" != "-" ] && [ -n "$bundle" ]; then
    [ -d "$REPO_ROOT/$bundle" ] || flag "에이전트 번들 없음: $id → $bundle/"
  fi
  validate_dependencies agent "$id" "$dependencies"
  [ "$destination" = "-" ] || flag "agent dest 열은 '-'여야 함: $id"
done

for id in $(manifest_ids skill); do
  row="$(manifest_row skill "$id")"
  source_path="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
  bundle="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
  dependencies="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
  destination="$(printf '%s' "$row" | awk -F'|' '{print $4}')"

  [ -d "$REPO_ROOT/$source_path" ] || flag "스킬 디렉터리 없음: $id → $source_path"
  [ -f "$REPO_ROOT/$source_path/SKILL.md" ] || flag "스킬 정의 없음: $id → $source_path/SKILL.md"
  [ "$bundle" = "-" ] || flag "skill bundle 열은 '-'여야 함: $id"
  [ "$destination" = "-" ] || flag "skill dest 열은 '-'여야 함: $id"
  if [ -f "$REPO_ROOT/$source_path/SKILL.md" ]; then
    declared_name="$(awk '
      NR == 1 && $0 == "---" { frontmatter=1; next }
      frontmatter && $0 == "---" { exit }
      frontmatter && /^name:[[:space:]]*/ {
        sub(/^name:[[:space:]]*/, ""); gsub(/^['\''"]|['\''"]$/, ""); print; exit
      }
    ' "$REPO_ROOT/$source_path/SKILL.md")"
    [ "$declared_name" = "$id" ] \
      || flag "스킬 frontmatter name 불일치: $id → ${declared_name:-(없음)}"
  fi
  validate_dependencies skill "$id" "$dependencies"
done

for kind in template memory eval; do
  for id in $(manifest_ids "$kind"); do
    row="$(manifest_row "$kind" "$id")"
    source_path="$(printf '%s' "$row" | awk -F'|' '{print $1}')"
    bundle="$(printf '%s' "$row" | awk -F'|' '{print $2}')"
    reserved="$(printf '%s' "$row" | awk -F'|' '{print $3}')"
    destination="$(printf '%s' "$row" | awk -F'|' '{print $4}')"

    [ -e "$REPO_ROOT/$source_path" ] || flag "$kind 원본 없음: $id → $source_path"
    [ "$bundle" = "-" ] || flag "$kind bundle 열은 '-'여야 함: $id"
    if [ "$reserved" != "-" ]; then
      for dependency in $reserved; do
        case "$dependency" in
          template:*) is_registered template "${dependency#template:}" \
            || flag "$kind 의존 template 미등록: $id → $dependency" ;;
          *) flag "$kind 의존성은 template:<id>여야 함: $id → $dependency" ;;
        esac
      done
    fi
    { [ -n "$destination" ] && [ "$destination" != "-" ]; } \
      || flag "$kind 에 dest 누락: $id"
  done
done

echo ""
if [ "$fail" = 0 ]; then
  echo "✓ 정합성 OK — agent/skill 매니페스트와 레포 자산이 일치합니다."
else
  echo "✗ 드리프트 발견 — 위 항목을 수정하세요."
fi
exit "$fail"
