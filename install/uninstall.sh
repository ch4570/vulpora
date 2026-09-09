#!/bin/bash
# Safely remove setup-copied Vulpora assets using exact local snapshots.

PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
RECEIPT_LIB="$SCRIPT_DIR/receipt-lib.sh"
MANIFEST="$SCRIPT_DIR/manifest.txt"
PACK_CATALOG="$SCRIPT_DIR/packs.txt"
TARGET=""
RUNTIME=""
APPLY=0
ASSETS=""
FILTERING=0
SELECTED_PATHS=""
SELECTED_PACKS=""
PACK_PROTECTED_PATHS=""
PLAN_TMP=""
KEEP_TMP=""
RELEASE_TMP=""
RECEIPT_TMP=""

die() { printf '오류: %s\n' "$*" >&2; exit 1; }

cleanup() {
  for tmp in "$PLAN_TMP" "$KEEP_TMP" "$RELEASE_TMP" "$RECEIPT_TMP"; do
    [ -n "$tmp" ] && [ -f "$tmp" ] && [ ! -L "$tmp" ] && rm -f "$tmp"
  done
  return 0
}
trap cleanup EXIT HUP INT TERM

usage() {
  cat <<'USAGE'
Usage:
  bash install/uninstall.sh -t <target> --runtime codex|claude-code|opencode [--apply]
                              [pack:<id>|all-agents|all-skills|agent-id|skill-id ...]

Default is a non-mutating dry-run. --apply removes only receipt-owned paths
that still exactly match their installation snapshots. Without selectors it
removes the runtime receipt in full. A pack selector removes its dependency
closure while conservatively preserving dependencies of other installed packs
and retained standalone agents or skills.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -t|--target-repo)
      [ "$#" -ge 2 ] || die "$1 값이 필요합니다."
      TARGET="$2"; shift 2 ;;
    -r|--runtime)
      [ "$#" -ge 2 ] || die "$1 값이 필요합니다."
      RUNTIME="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "알 수 없는 옵션: $1" ;;
    *) ASSETS="${ASSETS:+$ASSETS }$1"; shift ;;
  esac
done

[ -f "$RECEIPT_LIB" ] && [ ! -L "$RECEIPT_LIB" ] \
  || die "receipt helper를 찾을 수 없습니다: $RECEIPT_LIB"
[ -f "$MANIFEST" ] && [ ! -L "$MANIFEST" ] \
  || die "manifest.txt를 찾을 수 없습니다: $MANIFEST"
[ -f "$PACK_CATALOG" ] && [ ! -L "$PACK_CATALOG" ] \
  || die "packs.txt를 찾을 수 없습니다: $PACK_CATALOG"
# shellcheck source=receipt-lib.sh
. "$RECEIPT_LIB"

case "$RUNTIME" in codex|claude-code|opencode) ;; *) die "--runtime codex|claude-code|opencode 중 하나가 필요합니다." ;; esac
[ -n "$TARGET" ] || die "-t <대상레포>가 필요합니다."
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "대상 디렉터리가 없거나 symlink입니다: $TARGET"
TARGET="$(cd "$TARGET" && pwd -P)"
receipt_store_is_safe "$TARGET" || die "unsafe_receipt_store: .vulpora receipt 경로가 symlink입니다."

case "$RUNTIME" in
  claude-code) RT_SUB=.claude ;;
  opencode) RT_SUB=.opencode ;;
  codex) RT_SUB=.codex ;;
esac
AGENTS_SUB="$RT_SUB/agents"
if [ "$RUNTIME" = codex ]; then
  SKILLS_SUB=.agents/skills
else
  SKILLS_SUB="$RT_SUB/skills"
fi

asset_container_for() { # relative-path
  case "$1" in
    .claude/agents/*) printf '%s/.claude/agents\n' "$TARGET" ;;
    .claude/skills/*) printf '%s/.claude/skills\n' "$TARGET" ;;
    .codex/agents/*) printf '%s/.codex/agents\n' "$TARGET" ;;
    .agents/skills/*) printf '%s/.agents/skills\n' "$TARGET" ;;
    .opencode/agents/*) printf '%s/.opencode/agents\n' "$TARGET" ;;
    .opencode/skills/*) printf '%s/.opencode/skills\n' "$TARGET" ;;
    *) printf '%s\n' "$TARGET" ;;
  esac
}

path_is_runtime_container() {
  case "$1" in
    .claude|.claude/agents|.claude/skills|.codex|.codex/agents|.agents|.agents/skills|\
    .opencode|.opencode/agents|.opencode/skills) return 0 ;;
    *) return 1 ;;
  esac
}

manifest_agent_row() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 4; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == "agent" && $2 == wanted) { print $3 "|" $4; exit }
    }
  ' "$MANIFEST"
}

manifest_agent_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "agent") print $2
    }
  ' "$MANIFEST"
}

manifest_skill_row() {
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 5; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == "skill" && $2 == wanted) { print $3 "|" $5; exit }
    }
  ' "$MANIFEST"
}

manifest_skill_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
      if ($1 == "skill") print $2
    }
  ' "$MANIFEST"
}

pack_roots() { # pack-id
  awk -F'|' -v wanted="$1" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $4)
      if ($1 == wanted) { print $4; exit }
    }
  ' "$PACK_CATALOG"
}

pack_ids() {
  awk -F'|' '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1 }
  ' "$PACK_CATALOG"
}

manifest_dependencies() { # kind id
  awk -F'|' -v kind="$1" -v wanted="$2" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      for (n = 1; n <= 5; n++) gsub(/^[[:space:]]+|[[:space:]]+$/, "", $n)
      if ($1 == kind && $2 == wanted) { print $5; exit }
    }
  ' "$MANIFEST"
}

list_has_id() { # space-delimited-list id
  case " $1 " in *" $2 "*) return 0 ;; *) return 1 ;; esac
}

CLOSURE_AGENTS=""
CLOSURE_SKILLS=""
resolve_closure_dependency() { # typed or legacy skill selector
  dependency="$1"
  case "$dependency" in
    agent:*) resolve_closure_agent "${dependency#agent:}" ;;
    skill:*) resolve_closure_skill "${dependency#skill:}" ;;
    *:*) die "지원하지 않는 pack dependency: $dependency" ;;
    *) resolve_closure_skill "$dependency" ;;
  esac
}

resolve_closure_agent() {
  closure_id="$1"
  [ -n "$(manifest_agent_row "$closure_id")" ] || die "알 수 없는 pack agent: $closure_id"
  list_has_id "$CLOSURE_AGENTS" "$closure_id" && return 0
  CLOSURE_AGENTS="${CLOSURE_AGENTS}${CLOSURE_AGENTS:+ }$closure_id"
  closure_dependencies="$(manifest_dependencies agent "$closure_id")"
  [ "$closure_dependencies" = - ] && closure_dependencies=""
  for closure_dependency in $closure_dependencies; do
    resolve_closure_dependency "$closure_dependency"
  done
}

resolve_closure_skill() {
  closure_id="$1"
  [ -n "$(manifest_skill_row "$closure_id")" ] || die "알 수 없는 pack skill: $closure_id"
  list_has_id "$CLOSURE_SKILLS" "$closure_id" && return 0
  CLOSURE_SKILLS="${CLOSURE_SKILLS}${CLOSURE_SKILLS:+ }$closure_id"
  closure_dependencies="$(manifest_dependencies skill "$closure_id")"
  [ "$closure_dependencies" = - ] && closure_dependencies=""
  for closure_dependency in $closure_dependencies; do
    resolve_closure_dependency "$closure_dependency"
  done
}

resolve_pack_closure() {
  closure_pack_id="$1"
  closure_roots="$(pack_roots "$closure_pack_id")"
  [ -n "$closure_roots" ] || die "알 수 없는 pack: $closure_pack_id"
  for closure_root in $closure_roots; do
    resolve_closure_dependency "$closure_root"
  done
}

pack_root_is_installed() { # typed root; used only to preserve dependencies
  installed_root="$1"
  case "$installed_root" in
    agent:*)
      installed_id="${installed_root#agent:}"
      installed_row="$(manifest_agent_row "$installed_id")"
      [ -n "$installed_row" ] || return 1
      installed_definition="${installed_row%%|*}"
      [ -e "$TARGET/$AGENTS_SUB/$(basename "$installed_definition")" ]
      ;;
    skill:*)
      installed_id="${installed_root#skill:}"
      installed_row="$(manifest_skill_row "$installed_id")"
      [ -n "$installed_row" ] || return 1
      installed_definition="${installed_row%%|*}"
      [ -e "$TARGET/$SKILLS_SUB/$(basename "$installed_definition")" ]
      ;;
    *) return 1 ;;
  esac
}

pack_is_installed() {
  installed_pack_id="$1"
  installed_roots="$(pack_roots "$installed_pack_id")"
  [ -n "$installed_roots" ] || return 1
  for installed_root in $installed_roots; do
    pack_root_is_installed "$installed_root" || return 1
  done
}

add_selected_path() {
  case "
$SELECTED_PATHS
" in *"
$1
"*) ;; *) SELECTED_PATHS="${SELECTED_PATHS}${SELECTED_PATHS:+
}$1" ;; esac
}

resolve_agent_selector() {
  id="$1"
  row="$(manifest_agent_row "$id")"
  [ -n "$row" ] || die "알 수 없는 에이전트: $id"
  definition="${row%%|*}"
  bundle="${row#*|}"
  add_selected_path "$AGENTS_SUB/$(basename "$definition")"
  if [ "$RUNTIME" = codex ] && [ -f "$(cd "$SCRIPT_DIR/.." && pwd -P)/${definition%.md}.codex.toml" ]; then
    add_selected_path "$AGENTS_SUB/$id.toml"
  fi
  if [ -n "$bundle" ] && [ "$bundle" != - ]; then
    add_selected_path "$AGENTS_SUB/$(basename "$bundle")"
  fi
}

resolve_skill_selector() {
  id="$1"
  row="$(manifest_skill_row "$id")"
  [ -n "$row" ] || die "알 수 없는 스킬: $id"
  definition="${row%%|*}"
  add_selected_path "$SKILLS_SUB/$(basename "$definition")"
}

resolve_asset_selector() {
  id="$1"
  if [ -n "$(manifest_agent_row "$id")" ]; then
    resolve_agent_selector "$id"
  elif [ -n "$(manifest_skill_row "$id")" ]; then
    resolve_skill_selector "$id"
  else
    die "알 수 없는 에이전트 또는 스킬: $id"
  fi
}

resolve_typed_selector() {
  token="$1"
  case "$token" in
    agent:*) resolve_agent_selector "${token#agent:}" ;;
    skill:*) resolve_skill_selector "${token#skill:}" ;;
    *) die "지원하지 않는 pack root selector: $token" ;;
  esac
}

path_is_selected() {
  [ "$FILTERING" = 0 ] && return 0
  printf '%s\n' "$SELECTED_PATHS" | grep -Fqx "$1"
}

if [ -n "$ASSETS" ]; then
  FILTERING=1
  for asset in $ASSETS; do
    case "$asset" in
      pack:*)
        selected_pack_id="${asset#pack:}"
        [ -n "$(pack_roots "$selected_pack_id")" ] || die "알 수 없는 pack: $selected_pack_id"
        list_has_id "$SELECTED_PACKS" "$selected_pack_id" \
          || SELECTED_PACKS="${SELECTED_PACKS}${SELECTED_PACKS:+ }$selected_pack_id"
        ;;
      all-agents) for id in $(manifest_agent_ids); do resolve_agent_selector "$id"; done ;;
      all-skills) for id in $(manifest_skill_ids); do resolve_skill_selector "$id"; done ;;
      *) resolve_asset_selector "$asset" ;;
    esac
  done

  if [ -n "$SELECTED_PACKS" ]; then
    CLOSURE_AGENTS=""
    CLOSURE_SKILLS=""
    for selected_pack_id in $SELECTED_PACKS; do
      resolve_pack_closure "$selected_pack_id"
    done
    REMOVE_PACK_AGENTS="$CLOSURE_AGENTS"
    REMOVE_PACK_SKILLS="$CLOSURE_SKILLS"

    # Preserve any dependency still required by another completely installed
    # built-in pack. This is conservative: a false-positive only leaves an
    # Vulpora-owned asset installed; it never authorizes an extra deletion.
    CLOSURE_AGENTS=""
    CLOSURE_SKILLS=""
    for candidate_pack_id in $(pack_ids); do
      list_has_id "$SELECTED_PACKS" "$candidate_pack_id" && continue
      if pack_is_installed "$candidate_pack_id"; then
        resolve_pack_closure "$candidate_pack_id"
      fi
    done

    # A standalone asset can require the same dependency without making any
    # complete built-in pack present. Protect the closure of every installed
    # agent/skill outside the requested removal set. Existence is only a
    # conservative keep signal; receipt ownership still gates every deletion.
    for standalone_id in $(manifest_agent_ids); do
      list_has_id "$REMOVE_PACK_AGENTS" "$standalone_id" && continue
      standalone_row="$(manifest_agent_row "$standalone_id")"
      standalone_definition="${standalone_row%%|*}"
      path_is_selected "$AGENTS_SUB/$(basename "$standalone_definition")" && continue
      if pack_root_is_installed "agent:$standalone_id"; then
        resolve_closure_agent "$standalone_id"
      fi
    done
    for standalone_id in $(manifest_skill_ids); do
      list_has_id "$REMOVE_PACK_SKILLS" "$standalone_id" && continue
      standalone_row="$(manifest_skill_row "$standalone_id")"
      standalone_definition="${standalone_row%%|*}"
      path_is_selected "$SKILLS_SUB/$(basename "$standalone_definition")" && continue
      if pack_root_is_installed "skill:$standalone_id"; then
        resolve_closure_skill "$standalone_id"
      fi
    done
    PROTECTED_PACK_AGENTS="$CLOSURE_AGENTS"
    PROTECTED_PACK_SKILLS="$CLOSURE_SKILLS"

    for id in $REMOVE_PACK_AGENTS; do
      if list_has_id "$PROTECTED_PACK_AGENTS" "$id"; then
        PACK_PROTECTED_PATHS="${PACK_PROTECTED_PATHS}${PACK_PROTECTED_PATHS:+ }agent:$id"
      else
        resolve_agent_selector "$id"
      fi
    done
    for id in $REMOVE_PACK_SKILLS; do
      if list_has_id "$PROTECTED_PACK_SKILLS" "$id"; then
        PACK_PROTECTED_PATHS="${PACK_PROTECTED_PATHS}${PACK_PROTECTED_PATHS:+ }skill:$id"
      else
        resolve_skill_selector "$id"
      fi
    done
  fi
fi

receipt="$(receipt_file_for "$TARGET" "$RUNTIME")"
if [ ! -e "$receipt" ]; then
  receipt_all_local_receipts_are_anchored "$TARGET" \
    || die "untrusted_receipt_provenance: local runtime receipt 없이 외부 ownership entry가 남아 있습니다."
  printf 'nothing_installed: %s runtime receipt가 없습니다.\n' "$RUNTIME"
  exit 0
fi
[ -f "$receipt" ] && [ ! -L "$receipt" ] || die "unsafe_receipt_store: runtime receipt가 regular file이 아닙니다."
receipt_runtime_anchor_is_valid "$TARGET" "$RUNTIME" \
  || die "untrusted_receipt_provenance: target-local receipt가 외부 사용자 state와 일치하지 않습니다."
receipt_all_local_receipts_are_anchored "$TARGET" \
  || die "untrusted_receipt_provenance: 다른 runtime receipt를 포함한 외부 anchor 검증에 실패했습니다."

PLAN_TMP="$(mktemp "${TMPDIR:-/tmp}/vulpora-uninstall-plan.XXXXXX")" || die "임시 파일 생성 실패"
KEEP_TMP="$(mktemp "${TMPDIR:-/tmp}/vulpora-uninstall-keep.XXXXXX")" || die "임시 파일 생성 실패"
RELEASE_TMP="$(mktemp "${TMPDIR:-/tmp}/vulpora-uninstall-release.XXXXXX")" || die "임시 파일 생성 실패"

# Validate every receipt row before planning any deletion.
while IFS="$(printf '\t')" read -r rel extra; do
  case "$rel" in ''|'#'*) continue ;; esac
  [ -z "${extra:-}" ] || die "unsafe_receipt_entry: 열 개수가 잘못되었습니다."
  receipt_relative_path_is_safe "$rel" || die "unsafe_receipt_entry: $rel"
  ! path_is_runtime_container "$rel" \
    || die "unsafe_receipt_entry: runtime container 자체는 삭제할 수 없습니다: $rel"
done < "$receipt"

while IFS="$(printf '\t')" read -r rel extra; do
  case "$rel" in ''|'#'*) continue ;; esac
  dest="$TARGET/$rel"
  snapshot="$(receipt_anchor_snapshot_for "$TARGET" "$RUNTIME" "$rel")" \
    || die "untrusted_receipt_provenance: 외부 snapshot 경로를 확인할 수 없습니다."
  if ! path_is_selected "$rel"; then
    status=kept_unselected
  elif receipt_path_has_symlink "$TARGET" "$rel"; then
    status=preserved_symlink
  elif [ ! -e "$dest" ]; then
    status=already_absent
  elif [ ! -e "$snapshot" ] || [ -L "$snapshot" ]; then
    status=preserved_missing_snapshot
  elif ! receipt_paths_equal "$dest" "$snapshot"; then
    status=preserved_modified
  elif receipt_other_owner_for_path "$TARGET" "$RUNTIME" "$rel"; then
    status=shared_owner_kept
  else
    status=remove
  fi
  printf '%s\t%s\n' "$status" "$rel" >> "$PLAN_TMP"
done < "$receipt"

if [ "$APPLY" = 1 ]; then
  printf '모드: UNINSTALL APPLY\n'
else
  printf '모드: UNINSTALL DRY-RUN\n'
fi
[ -z "$PACK_PROTECTED_PATHS" ] \
  || printf '다른 설치 pack 또는 독립 자산이 의존해 보존하는 자산: %s\n' "$PACK_PROTECTED_PATHS"
partial=0
while IFS="$(printf '\t')" read -r status rel; do
  printf '  %s: %s\n' "$status" "$rel"
  case "$status" in
    kept_unselected)
      printf '%s\n' "$rel" >> "$KEEP_TMP"
      ;;
    preserved_*)
      partial=1
      printf '%s\n' "$rel" >> "$KEEP_TMP"
      ;;
  esac
done < "$PLAN_TMP"

[ "$APPLY" = 1 ] || exit 0

RECEIPT_TMP="$(mktemp "$TARGET/.vulpora/receipts/v1/.receipt.XXXXXX")" \
  || die "receipt 선행 commit 임시 파일 생성 실패"
if [ -s "$KEEP_TMP" ]; then
  {
    printf '%s\n' '# vulpora-receipt-v1'
    LC_ALL=C sort -u "$KEEP_TMP"
  } > "$RECEIPT_TMP"
  chmod 600 "$RECEIPT_TMP" 2>/dev/null || true
  receipt_replace_relative "$TARGET/.vulpora/receipts/v1" "$RUNTIME.tsv" "$RECEIPT_TMP" "$receipt" \
    || die "runtime receipt 선행 commit 실패: $RUNTIME"
else
  receipt_remove_relative "$TARGET/.vulpora/receipts/v1" "$RUNTIME.tsv" "$receipt" \
    || die "runtime receipt 선행 제거 실패: $RUNTIME"
fi
rm -f "$RECEIPT_TMP"
RECEIPT_TMP=""

release_after_recheck_failure() { # relative-path reason
  partial=1
  printf '  released_without_delete: %s (%s)\n' "$1" "$2" >&2
}

restore_released_ownership() { # relative-path trusted-snapshot reason
  local rel="$1" trusted_snapshot="$2" reason="$3" local_snapshot
  local_snapshot="$(receipt_snapshot_for "$TARGET" "$RUNTIME" "$rel")"
  if [ ! -e "$local_snapshot" ]; then
    receipt_write_snapshot "$TARGET" "$RUNTIME" "$rel" "$trusted_snapshot" \
      || die "ownership 복구용 local snapshot 생성 실패: $rel"
  fi
  receipt_merge_path "$TARGET" "$RUNTIME" "$rel" \
    || die "ownership 복구용 receipt commit 실패: $rel"
  printf '%s\n' "$rel" >> "$KEEP_TMP"
  partial=1
  printf '  preserved_cleanup_failure: %s (%s)\n' "$rel" "$reason" >&2
}

snapshot_runtime_root="$TARGET/.vulpora/receipts/v1/snapshots/$RUNTIME"
while IFS="$(printf '\t')" read -r status rel; do
  dest="$TARGET/$rel"
  snapshot="$(receipt_anchor_snapshot_for "$TARGET" "$RUNTIME" "$rel")" \
    || die "untrusted_receipt_provenance: 외부 snapshot 경로를 확인할 수 없습니다."
  local_snapshot="$(receipt_snapshot_for "$TARGET" "$RUNTIME" "$rel")"
  receipt_store_is_safe "$TARGET" \
    || die "unsafe_receipt_store: mutation 직전 receipt 경로 검증에 실패했습니다."
  receipt_anchor_entry_is_valid "$TARGET" "$RUNTIME" "$rel" \
    && receipt_path_owners_are_anchored "$TARGET" "$rel" \
    || die "untrusted_receipt_provenance: 삭제 직전 owner anchor 검증에 실패했습니다: $rel"
  case "$status" in
    kept_unselected)
      continue
      ;;
    remove)
      if receipt_path_has_symlink "$TARGET" "$rel" \
        || [ ! -e "$dest" ] \
        || [ ! -e "$snapshot" ] \
        || ! receipt_paths_equal "$dest" "$snapshot" \
        || receipt_other_owner_for_path "$TARGET" "$RUNTIME" "$rel"; then
        release_after_recheck_failure "$rel" revalidation_failed
      elif ! receipt_remove_relative "$TARGET" "$rel" "$snapshot"; then
        release_after_recheck_failure "$rel" anchored_remove_failed
      else
        receipt_prune_empty_parents "$(dirname "$dest")" "$(asset_container_for "$rel")" || true
      fi
      ;;
    preserved_*)
      continue
      ;;
    already_absent)
      if receipt_path_has_symlink "$TARGET" "$rel" || [ -e "$dest" ]; then
        release_after_recheck_failure "$rel" path_reappeared
      fi
      ;;
    shared_owner_kept)
      if receipt_path_has_symlink "$TARGET" "$rel" \
        || [ ! -e "$dest" ] \
        || [ ! -e "$snapshot" ] \
        || ! receipt_paths_equal "$dest" "$snapshot" \
        || ! receipt_other_owner_for_path "$TARGET" "$RUNTIME" "$rel"; then
        release_after_recheck_failure "$rel" shared_owner_changed
      fi
      ;;
    *) die "알 수 없는 uninstall plan 상태: $status" ;;
  esac
  printf '%s\n' "$rel" >> "$RELEASE_TMP"
done < "$PLAN_TMP"

# Keep every local receipt/snapshot mirror intact until all target mutations
# finish. This lets each delete revalidate every owner of that destination.
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  snapshot="$(receipt_anchor_snapshot_for "$TARGET" "$RUNTIME" "$rel")" \
    || die "untrusted_receipt_provenance: 외부 snapshot 경로를 확인할 수 없습니다."
  local_snapshot="$(receipt_snapshot_for "$TARGET" "$RUNTIME" "$rel")"
  if [ -e "$local_snapshot" ] \
    && ! receipt_remove_relative "$snapshot_runtime_root" "$rel" "$snapshot"; then
    restore_released_ownership "$rel" "$snapshot" snapshot_remove_failed
    continue
  fi
  if ! receipt_remove_path_anchor "$TARGET" "$RUNTIME" "$rel"; then
    if [ ! -e "$local_snapshot" ]; then
      receipt_write_snapshot "$TARGET" "$RUNTIME" "$rel" "$snapshot" \
        || die "anchor 제거 실패 후 local snapshot 복구에도 실패했습니다: $rel"
    fi
    restore_released_ownership "$rel" "$snapshot" anchor_remove_failed
    continue
  fi
  receipt_prune_empty_parents "$(dirname "$local_snapshot")" "$TARGET/.vulpora/receipts/v1/snapshots/$RUNTIME" || true
done < "$RELEASE_TMP"

if [ -e "$receipt" ]; then
  receipt_runtime_anchor_is_valid "$TARGET" "$RUNTIME" \
    || die "uninstall 후 preserved receipt/anchor 정합성 검증 실패: $RUNTIME"
else
  rmdir "$TARGET/.vulpora/receipts/v1/snapshots/$RUNTIME" 2>/dev/null || true
  receipt_remove_runtime_anchor "$TARGET" "$RUNTIME" \
    || die "runtime receipt anchor 제거 실패: $RUNTIME"
fi

rmdir "$TARGET/.vulpora/receipts/v1/snapshots" 2>/dev/null || true
rmdir "$TARGET/.vulpora/receipts/v1" 2>/dev/null || true
rmdir "$TARGET/.vulpora/receipts" 2>/dev/null || true

# .vulpora also contains approved task specifications, execution evidence, and
# user settings. Only receipt-owned paths above authorize deletion; leave all
# other data intact, and remove the shared state directory only when empty.
rmdir "$TARGET/.vulpora" 2>/dev/null || true

if [ "$partial" = 1 ]; then
  printf '%s\n' 'partial_uninstall: 일부 경로 제거를 완료하지 못했습니다. 위 경고와 복구 경로를 확인하세요.' >&2
  exit 3
fi
printf 'uninstall_complete: %s\n' "$RUNTIME"
