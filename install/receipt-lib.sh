#!/usr/bin/env bash
# Shared receipt helpers for Vulpora setup/uninstall. Bash 3.2 compatible.

unset _VULPORA_RECEIPT_ANCHOR_PREPARED_TARGET

receipt_relative_path_is_safe() { # relative-path
  local rel="$1" old_ifs segment
  case "$rel" in
    ''|/*|.|..|.vulpora|.vulpora/*|*/|*//*|*[!A-Za-z0-9._/-]*) return 1 ;;
  esac
  old_ifs=$IFS
  IFS='/'
  set -- $rel
  IFS=$old_ifs
  [ "$#" -gt 0 ] || return 1
  for segment in "$@"; do
    case "$segment" in ''|.|..) return 1 ;; esac
  done
  return 0
}

receipt_store_is_safe() { # target
  local target="$1" path
  for path in \
    "$target/.vulpora" \
    "$target/.vulpora/receipts" \
    "$target/.vulpora/receipts/v1" \
    "$target/.vulpora/receipts/v1/snapshots"; do
    [ ! -L "$path" ] || return 1
    [ ! -e "$path" ] || [ -d "$path" ] || return 1
  done
  for path in \
    "$target/.vulpora/receipts/v1/"*.tsv \
    "$target/.vulpora/receipts/v1/snapshots/"*; do
    [ -e "$path" ] || continue
    [ ! -L "$path" ] || return 1
  done
  if [ -d "$target/.vulpora/receipts/v1/snapshots" ] \
    && receipt_tree_has_symlink "$target/.vulpora/receipts/v1/snapshots"; then
    return 1
  fi
  return 0
}

receipt_path_has_symlink() { # base relative-path; includes the destination itself
  local current="$1" rel="$2" old_ifs segment
  old_ifs=$IFS
  IFS='/'
  set -- $rel
  IFS=$old_ifs
  for segment in "$@"; do
    current="$current/$segment"
    [ ! -L "$current" ] || return 0
  done
  return 1
}

receipt_mkdir_relative() { # trusted-base relative-directory
  local current="$1" rel="$2" old_ifs segment
  case "$rel" in ''|.) return 0 ;; esac
  receipt_relative_path_is_safe "$rel" || return 1
  [ -d "$current" ] && [ ! -L "$current" ] || return 1
  old_ifs=$IFS
  IFS='/'
  set -- $rel
  IFS=$old_ifs
  for segment in "$@"; do
    current="$current/$segment"
    [ ! -L "$current" ] || return 1
    if [ -e "$current" ]; then
      [ -d "$current" ] || return 1
    else
      mkdir "$current" || return 1
    fi
  done
}

receipt_tree_has_symlink() { # path
  local statuses
  [ -d "$1" ] || return 1
  find "$1" -type l -print 2>/dev/null \
    | awk 'NR { found=1 } END { exit(found ? 0 : 1) }'
  statuses=("${PIPESTATUS[@]}")
  [ "${statuses[0]}" = 0 ] || return 0
  [ "${statuses[1]}" = 0 ]
}

receipt_replace_relative() { # target relative-path source expected-old-or-dash
  local target="$1" rel="$2" source="$3" expected_old="$4"
  local parent_rel leaf target_real parent_real expected_parent
  local original_dir transaction had_old
  receipt_relative_path_is_safe "$rel" || return 1
  parent_rel="$(dirname "$rel")"
  leaf="$(basename "$rel")"
  receipt_mkdir_relative "$target" "$parent_rel" || return 1
  target_real="$(cd "$target" && pwd -P)" || return 1
  if [ "$parent_rel" = . ]; then expected_parent="$target_real"; else expected_parent="$target_real/$parent_rel"; fi
  original_dir="$(pwd -P)" || return 1
  cd "$target/$parent_rel" || return 1
  parent_real="$(pwd -P)" || { cd "$original_dir" || true; return 1; }
  [ "$parent_real" = "$expected_parent" ] || { cd "$original_dir" || true; return 1; }
  transaction="$(mktemp -d .vulpora-replace.XXXXXX)" \
    || { cd "$original_dir" || true; return 1; }
  if ! cp -R "$source" "$transaction/new" \
    || ! receipt_paths_equal "$source" "$transaction/new"; then
    rm -rf -- "$transaction"
    cd "$original_dir" || true
    return 1
  fi
  had_old=0
  if [ "$expected_old" = - ]; then
    if [ -e "./$leaf" ] || [ -L "./$leaf" ]; then
      rm -rf -- "$transaction"
      cd "$original_dir" || true
      return 1
    fi
  else
    if [ ! -e "$expected_old" ] || [ -L "$expected_old" ] \
      || ! cp -R "$expected_old" "$transaction/expected" \
      || ! receipt_paths_equal "$expected_old" "$transaction/expected" \
      || { [ ! -e "./$leaf" ] && [ ! -L "./$leaf" ]; }; then
      rm -rf -- "$transaction"
      cd "$original_dir" || true
      return 1
    fi
    if ! mv "./$leaf" "$transaction/old"; then
      rm -rf -- "$transaction"
      cd "$original_dir" || true
      return 1
    fi
    had_old=1
    if ! receipt_paths_equal "$transaction/old" "$transaction/expected"; then
      mv "$transaction/old" "./$leaf" 2>/dev/null || true
      rm -rf -- "$transaction"
      cd "$original_dir" || true
      return 1
    fi
  fi
  if ! mv "$transaction/new" "./$leaf"; then
    [ "$had_old" = 0 ] || mv "$transaction/old" "./$leaf" 2>/dev/null || true
    rm -rf -- "$transaction"
    cd "$original_dir" || true
    return 1
  fi
  rm -rf -- "$transaction"
  cd "$original_dir" || return 1
}

receipt_remove_relative() { # trusted-base relative-path expected-current
  local base="$1" rel="$2" expected_current="$3"
  local parent_rel leaf base_real parent_real expected_parent transaction
  receipt_relative_path_is_safe "$rel" || return 1
  [ -d "$base" ] && [ ! -L "$base" ] || return 1
  parent_rel="$(dirname "$rel")"
  leaf="$(basename "$rel")"
  base_real="$(cd "$base" && pwd -P)" || return 1
  (
    cd "$base/$parent_rel" || exit 1
    parent_real="$(pwd -P)" || exit 1
    if [ "$parent_rel" = . ]; then expected_parent="$base_real"; else expected_parent="$base_real/$parent_rel"; fi
    [ "$parent_real" = "$expected_parent" ] || exit 1
    [ -e "$expected_current" ] && [ ! -L "$expected_current" ] || exit 1
    transaction="$(mktemp -d .vulpora-remove.XXXXXX)" || exit 1
    if ! cp -R "$expected_current" "$transaction/expected" \
      || ! receipt_paths_equal "$expected_current" "$transaction/expected" \
      || { [ ! -e "./$leaf" ] && [ ! -L "./$leaf" ]; } \
      || ! mv "./$leaf" "$transaction/candidate"; then
      rm -rf -- "$transaction"
      exit 1
    fi
    if ! receipt_paths_equal "$transaction/candidate" "$transaction/expected"; then
      mv "$transaction/candidate" "./$leaf" 2>/dev/null || true
      rm -rf -- "$transaction"
      exit 1
    fi
    rm -rf -- "$transaction"
  )
}

receipt_paths_equal() { # left right
  local left="$1" right="$2"
  [ ! -L "$left" ] && [ ! -L "$right" ] || return 1
  if [ -f "$left" ] && [ -f "$right" ]; then
    cmp -s "$left" "$right"
  elif [ -d "$left" ] && [ -d "$right" ]; then
    ! receipt_tree_has_symlink "$left" \
      && ! receipt_tree_has_symlink "$right" \
      && diff -qr "$left" "$right" >/dev/null 2>&1
  else
    return 1
  fi
}

receipt_file_for() { # target runtime
  printf '%s/.vulpora/receipts/v1/%s.tsv\n' "$1" "$2"
}

receipt_snapshot_for() { # target runtime relative-path
  printf '%s/.vulpora/receipts/v1/snapshots/%s/%s\n' "$1" "$2" "$3"
}

receipt_runtime_name_is_safe() { # runtime
  case "$1" in codex|claude-code|opencode) return 0 ;; *) return 1 ;; esac
}

receipt_state_home() {
  if [ -n "${VULPORA_STATE_HOME:-}" ]; then
    printf '%s\n' "$VULPORA_STATE_HOME"
  elif [ -n "${XDG_STATE_HOME:-}" ]; then
    printf '%s/vulpora\n' "$XDG_STATE_HOME"
  elif [ -n "${HOME:-}" ]; then
    printf '%s/.local/state/vulpora\n' "$HOME"
  else
    return 1
  fi
}

receipt_target_key() { # canonical-target
  local checksum bytes
  set -- $(printf '%s' "$1" | LC_ALL=C cksum) || return 1
  checksum="${1:-}"
  bytes="${2:-}"
  case "$checksum-$bytes" in *[!0-9-]*|-) return 1 ;; esac
  printf '%s-%s\n' "$checksum" "$bytes"
}

receipt_anchor_root_for() { # canonical-target
  local state_home key
  state_home="$(receipt_state_home)" || return 1
  key="$(receipt_target_key "$1")" || return 1
  printf '%s/receipts/v1/targets/%s\n' "$state_home" "$key"
}

receipt_anchor_runtime_root_for() { # canonical-target runtime
  local root
  root="$(receipt_anchor_root_for "$1")" || return 1
  printf '%s/runtimes/%s\n' "$root" "$2"
}

receipt_path_key() { # safe-relative-path
  receipt_relative_path_is_safe "$1" || return 1
  receipt_target_key "$1"
}

receipt_anchor_entry_root_for() { # canonical-target runtime relative-path
  local runtime_root key
  runtime_root="$(receipt_anchor_runtime_root_for "$1" "$2")" || return 1
  key="$(receipt_path_key "$3")" || return 1
  printf '%s/entries/%s\n' "$runtime_root" "$key"
}

receipt_anchor_snapshot_for() { # canonical-target runtime relative-path
  local entry_root
  entry_root="$(receipt_anchor_entry_root_for "$1" "$2" "$3")" || return 1
  printf '%s/snapshot\n' "$entry_root"
}

receipt_anchor_location_is_safe() { # canonical-target; state home must exist
  local target="$1" state_home state_real target_real home_real
  state_home="$(receipt_state_home)" || return 1
  case "$state_home" in /*) ;; *) return 1 ;; esac
  [ -d "$state_home" ] && [ ! -L "$state_home" ] || return 1
  state_real="$(cd "$state_home" && pwd -P)" || return 1
  target_real="$(cd "$target" && pwd -P)" || return 1

  # Project installs must anchor outside the project. User-scope installs target
  # the user's whole home, where no narrower filesystem trust boundary exists.
  case "$state_real" in
    "$target_real"|"$target_real"/*)
      [ -n "${HOME:-}" ] || return 1
      home_real="$(cd "$HOME" 2>/dev/null && pwd -P)" || return 1
      [ "$target_real" = "$home_real" ] || return 1
      ;;
  esac
  return 0
}

receipt_anchor_prepare() { # canonical-target
  local target="$1" state_home root binding tmp path
  state_home="$(receipt_state_home)" || return 1
  case "$state_home" in /*) ;; *) return 1 ;; esac
  if [ ! -e "$state_home" ]; then
    mkdir -p "$state_home" || return 1
  fi
  [ -d "$state_home" ] && [ ! -L "$state_home" ] || return 1
  chmod 700 "$state_home" 2>/dev/null || return 1
  receipt_anchor_location_is_safe "$target" || return 1
  root="$(receipt_anchor_root_for "$target")" || return 1
  receipt_mkdir_relative "$state_home" "receipts/v1/targets/$(basename "$root")" || return 1
  receipt_mkdir_relative "$root" runtimes || return 1
  for path in \
    "$state_home/receipts" \
    "$state_home/receipts/v1" \
    "$state_home/receipts/v1/targets" \
    "$root" \
    "$root/runtimes"; do
    chmod 700 "$path" 2>/dev/null || return 1
  done
  binding="$root/target.path"
  if [ -e "$binding" ] || [ -L "$binding" ]; then
    [ -f "$binding" ] && [ ! -L "$binding" ] || return 1
    printf '%s\n' "$target" | cmp -s - "$binding" || return 1
  else
    tmp="$(mktemp "$root/.target.XXXXXX")" || return 1
    printf '%s\n' "$target" > "$tmp" || { rm -f "$tmp"; return 1; }
    chmod 600 "$tmp" 2>/dev/null || true
    if ! receipt_replace_relative "$root" target.path "$tmp" -; then
      rm -f "$tmp"
      return 1
    fi
    rm -f "$tmp"
  fi
  return 0
}

receipt_anchor_store_is_safe() { # canonical-target
  local target="$1" root binding runtimes
  receipt_anchor_location_is_safe "$target" || return 1
  root="$(receipt_anchor_root_for "$target")" || return 1
  binding="$root/target.path"
  runtimes="$root/runtimes"
  [ -d "$root" ] && [ ! -L "$root" ] || return 1
  [ -f "$binding" ] && [ ! -L "$binding" ] || return 1
  printf '%s\n' "$target" | cmp -s - "$binding" || return 1
  [ -d "$runtimes" ] && [ ! -L "$runtimes" ] || return 1
  ! receipt_tree_has_symlink "$runtimes"
}

receipt_anchor_entry_matches_local() { # canonical-target runtime relative-path
  local target="$1" runtime="$2" rel="$3" entry path_file snapshot local_snapshot
  receipt_runtime_name_is_safe "$runtime" || return 1
  receipt_relative_path_is_safe "$rel" || return 1
  entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
  path_file="$entry/path"
  snapshot="$entry/snapshot"
  local_snapshot="$(receipt_snapshot_for "$target" "$runtime" "$rel")"
  [ -d "$entry" ] && [ ! -L "$entry" ] || return 1
  [ -f "$path_file" ] && [ ! -L "$path_file" ] || return 1
  printf '%s\n' "$rel" | cmp -s - "$path_file" || return 1
  [ -e "$snapshot" ] && [ ! -L "$snapshot" ] || return 1
  [ -e "$local_snapshot" ] && [ ! -L "$local_snapshot" ] || return 1
  receipt_paths_equal "$local_snapshot" "$snapshot"
}

receipt_anchor_entry_is_valid() { # canonical-target runtime relative-path
  receipt_anchor_store_is_safe "$1" || return 1
  receipt_anchor_entry_matches_local "$1" "$2" "$3"
}

receipt_runtime_anchor_is_valid() { # canonical-target runtime
  local target="$1" runtime="$2" receipt snapshots runtime_root entries
  local rel extra entry path_file expected_entry
  receipt_runtime_name_is_safe "$runtime" || return 1
  receipt_store_is_safe "$target" || return 1
  receipt_anchor_store_is_safe "$target" || return 1
  receipt="$(receipt_file_for "$target" "$runtime")"
  snapshots="$target/.vulpora/receipts/v1/snapshots/$runtime"
  runtime_root="$(receipt_anchor_runtime_root_for "$target" "$runtime")" || return 1
  entries="$runtime_root/entries"
  [ -f "$receipt" ] && [ ! -L "$receipt" ] || return 1
  [ -d "$snapshots" ] && [ ! -L "$snapshots" ] || return 1
  [ -d "$entries" ] && [ ! -L "$entries" ] || return 1
  ! receipt_tree_has_symlink "$snapshots" || return 1
  awk -F '\t' '
    $0 ~ /^#/ || !NF { next }
    NF != 1 || seen[$1]++ { invalid=1 }
    END { exit(invalid ? 1 : 0) }
  ' "$receipt" || return 1
  while IFS="$(printf '\t')" read -r rel extra; do
    case "$rel" in ''|'#'*) continue ;; esac
    [ -z "${extra:-}" ] || return 1
    receipt_relative_path_is_safe "$rel" || return 1
    receipt_anchor_entry_matches_local "$target" "$runtime" "$rel" || return 1
  done < "$receipt"

  # Set equality is bidirectional: a target-local row cannot be deleted while
  # leaving an authoritative external ownership entry behind.
  for entry in "$entries"/* "$entries"/.[!.]* "$entries"/..?*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    [ -d "$entry" ] && [ ! -L "$entry" ] || return 1
    path_file="$entry/path"
    [ -f "$path_file" ] && [ ! -L "$path_file" ] || return 1
    rel="$(cat "$path_file")" || return 1
    receipt_relative_path_is_safe "$rel" || return 1
    printf '%s\n' "$rel" | cmp -s - "$path_file" || return 1
    expected_entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
    [ "$entry" = "$expected_entry" ] || return 1
    receipt_contains_path "$receipt" "$rel" || return 1
    receipt_anchor_entry_matches_local "$target" "$runtime" "$rel" || return 1
  done
  return 0
}

receipt_all_local_receipts_are_anchored() { # canonical-target
  local target="$1" receipt runtime root runtimes runtime_dir expected_runtime_dir
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    runtime="$(basename "$receipt" .tsv)"
    receipt_runtime_anchor_is_valid "$target" "$runtime" || return 1
  done

  root="$(receipt_anchor_root_for "$target")" || return 1
  [ -e "$root" ] || [ -L "$root" ] || return 0
  receipt_anchor_store_is_safe "$target" || return 1
  runtimes="$root/runtimes"
  for runtime_dir in "$runtimes"/* "$runtimes"/.[!.]* "$runtimes"/..?*; do
    [ -e "$runtime_dir" ] || [ -L "$runtime_dir" ] || continue
    [ -d "$runtime_dir" ] && [ ! -L "$runtime_dir" ] || return 1
    runtime="$(basename "$runtime_dir")"
    receipt_runtime_name_is_safe "$runtime" || return 1
    expected_runtime_dir="$(receipt_anchor_runtime_root_for "$target" "$runtime")" || return 1
    [ "$runtime_dir" = "$expected_runtime_dir" ] || return 1
    receipt="$(receipt_file_for "$target" "$runtime")"
    [ -f "$receipt" ] && [ ! -L "$receipt" ] || return 1
    receipt_runtime_anchor_is_valid "$target" "$runtime" || return 1
  done
  return 0
}

receipt_path_owners_are_anchored() { # canonical-target relative-path
  local target="$1" rel="$2" receipt runtime found
  found=0
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    found=1
    runtime="$(basename "$receipt" .tsv)"
    receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
  done
  [ "$found" = 0 ] || return 0
  return 0
}

receipt_sync_path_anchor() { # canonical-target runtime relative-path
  local target="$1" runtime="$2" rel="$3" root entry local_snapshot tmp expected
  receipt_runtime_name_is_safe "$runtime" || return 1
  receipt_relative_path_is_safe "$rel" || return 1
  local_snapshot="$(receipt_snapshot_for "$target" "$runtime" "$rel")"
  [ -e "$local_snapshot" ] && [ ! -L "$local_snapshot" ] || return 1
  if [ "${_VULPORA_RECEIPT_ANCHOR_PREPARED_TARGET:-}" != "$target" ]; then
    receipt_anchor_prepare "$target" || return 1
  fi
  root="$(receipt_anchor_root_for "$target")" || return 1
  entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
  receipt_mkdir_relative "$root" "runtimes/$runtime/entries" || return 1
  if [ -e "$entry" ] || [ -L "$entry" ]; then
    [ -d "$entry" ] && [ ! -L "$entry" ] || return 1
    [ -f "$entry/path" ] && [ ! -L "$entry/path" ] || return 1
    printf '%s\n' "$rel" | cmp -s - "$entry/path" || return 1
  fi
  tmp="$(mktemp -d "$root/.sync.XXXXXX")" || return 1
  mkdir "$tmp/entry" || { rm -rf "$tmp"; return 1; }
  printf '%s\n' "$rel" > "$tmp/entry/path" || { rm -rf "$tmp"; return 1; }
  if ! cp -R "$local_snapshot" "$tmp/entry/snapshot" \
    || ! printf '%s\n' "$rel" | cmp -s - "$tmp/entry/path" \
    || ! receipt_paths_equal "$local_snapshot" "$tmp/entry/snapshot"; then
    rm -rf "$tmp"
    return 1
  fi
  if [ ! -e "$entry" ]; then
    if mv "$tmp/entry" "$entry"; then
      rmdir "$tmp" 2>/dev/null || true
      if receipt_anchor_entry_matches_local "$target" "$runtime" "$rel"; then
        return 0
      fi
      rm -rf "$entry"
    fi
    rm -rf "$tmp"
    return 1
  fi
  expected="$entry"
  if ! receipt_replace_relative "$root" \
    "runtimes/$runtime/entries/$(basename "$entry")" "$tmp/entry" "$expected"; then
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
  receipt_anchor_entry_matches_local "$target" "$runtime" "$rel"
}

receipt_remove_path_anchor() { # canonical-target runtime relative-path
  local target="$1" runtime="$2" rel="$3" root entry path_file
  receipt_runtime_name_is_safe "$runtime" || return 1
  receipt_relative_path_is_safe "$rel" || return 1
  receipt_anchor_store_is_safe "$target" || return 1
  root="$(receipt_anchor_root_for "$target")" || return 1
  entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
  path_file="$entry/path"
  [ -d "$entry" ] && [ ! -L "$entry" ] || return 1
  [ -f "$path_file" ] && [ ! -L "$path_file" ] || return 1
  printf '%s\n' "$rel" | cmp -s - "$path_file" || return 1
  receipt_remove_relative "$root" \
    "runtimes/$runtime/entries/$(basename "$entry")" "$entry" || return 1
  return 0
}

receipt_remove_runtime_anchor() { # canonical-target runtime; entries must be empty
  local target="$1" runtime="$2" root runtime_root
  receipt_runtime_name_is_safe "$runtime" || return 1
  receipt_anchor_store_is_safe "$target" || return 1
  root="$(receipt_anchor_root_for "$target")" || return 1
  runtime_root="$(receipt_anchor_runtime_root_for "$target" "$runtime")" || return 1
  [ -d "$runtime_root" ] && [ ! -L "$runtime_root" ] || return 1
  rmdir "$runtime_root/entries" 2>/dev/null || return 1
  receipt_remove_relative "$root" "runtimes/$runtime" "$runtime_root" || return 1
  return 0
}

receipt_contains_path() { # receipt-file relative-path
  local receipt="$1" rel="$2"
  [ -f "$receipt" ] && [ ! -L "$receipt" ] || return 1
  awk -F '\t' -v wanted="$rel" '
    $0 !~ /^#/ && $1 == wanted { found=1 }
    END { exit(found ? 0 : 1) }
  ' "$receipt"
}

receipt_any_owner_for_path() { # target relative-path
  local target="$1" rel="$2" receipt runtime
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    runtime="$(basename "$receipt" .tsv)"
    receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
    return 0
  done
  return 1
}

receipt_all_owner_snapshots_match() { # target relative-path installed-path
  local target="$1" rel="$2" installed="$3" receipt runtime snapshot found
  found=0
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    found=1
    runtime="$(basename "$receipt" .tsv)"
    receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
    snapshot="$(receipt_anchor_snapshot_for "$target" "$runtime" "$rel")" || return 1
    [ -e "$snapshot" ] && [ ! -L "$snapshot" ] || return 1
    receipt_paths_equal "$installed" "$snapshot" || return 1
  done
  [ "$found" = 1 ]
}

receipt_first_owner_snapshot() { # target relative-path
  local target="$1" rel="$2" receipt runtime snapshot
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    runtime="$(basename "$receipt" .tsv)"
    receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
    snapshot="$(receipt_anchor_snapshot_for "$target" "$runtime" "$rel")" || return 1
    [ -e "$snapshot" ] && [ ! -L "$snapshot" ] || return 1
    printf '%s\n' "$snapshot"
    return 0
  done
  return 1
}

receipt_other_owner_for_path() { # target excluded-runtime relative-path
  local target="$1" excluded="$2" rel="$3" receipt runtime
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    runtime="$(basename "$receipt" .tsv)"
    [ "$runtime" != "$excluded" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
    return 0
  done
  return 1
}

receipt_write_snapshot() { # target runtime relative-path installed-path
  local target="$1" runtime="$2" rel="$3" installed="$4"
  local root snapshot snapshot_parent_rel snapshot_runtime_root tmpdir expected_snapshot
  root="$target/.vulpora/receipts/v1"
  snapshot="$(receipt_snapshot_for "$target" "$runtime" "$rel")"
  snapshot_runtime_root="$root/snapshots/$runtime"
  mkdir -p "$root/snapshots"
  [ ! -L "$snapshot_runtime_root" ] || return 1
  if [ ! -e "$snapshot_runtime_root" ]; then
    mkdir "$snapshot_runtime_root" || return 1
  fi
  [ -d "$snapshot_runtime_root" ] || return 1
  snapshot_parent_rel="$(dirname "$rel")"
  receipt_mkdir_relative "$snapshot_runtime_root" "$snapshot_parent_rel" || return 1
  receipt_path_has_symlink "$snapshot_runtime_root" "$rel" && return 1
  tmpdir="$(mktemp -d "$root/.snapshot.XXXXXX")" || return 1
  if ! cp -R "$installed" "$tmpdir/value"; then
    rm -rf "$tmpdir"
    return 1
  fi
  if [ ! -e "$snapshot" ]; then
    if mv "$tmpdir/value" "$snapshot"; then
      rmdir "$tmpdir" 2>/dev/null || true
      if receipt_paths_equal "$installed" "$snapshot"; then
        return 0
      fi
      rm -rf "$snapshot"
    fi
    rm -rf "$tmpdir"
    return 1
  fi
  expected_snapshot="$snapshot"
  if ! receipt_replace_relative "$snapshot_runtime_root" "$rel" "$tmpdir/value" "$expected_snapshot"; then
    rm -rf "$tmpdir"
    return 1
  fi
  rm -rf "$tmpdir"
}

receipt_merge_path() { # target runtime relative-path
  local target="$1" runtime="$2" rel="$3" root receipt tmp expected_receipt
  root="$target/.vulpora/receipts/v1"
  receipt="$(receipt_file_for "$target" "$runtime")"
  mkdir -p "$root"
  tmp="$(mktemp "$root/.receipt.XXXXXX")" || return 1
  {
    printf '%s\n' '# vulpora-receipt-v1'
    if [ -f "$receipt" ] && [ ! -L "$receipt" ]; then
      awk -F '\t' '$0 !~ /^#/ && NF { print $1 }' "$receipt"
    fi
    printf '%s\n' "$rel"
  } | awk 'NF && !seen[$0]++' | {
    IFS= read -r header
    printf '%s\n' "$header"
    LC_ALL=C sort
  } > "$tmp"
  chmod 600 "$tmp" 2>/dev/null || true
  if [ -e "$receipt" ]; then expected_receipt="$receipt"; else expected_receipt=-; fi
  if ! receipt_replace_relative "$root" "$runtime.tsv" "$tmp" "$expected_receipt"; then
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
}

receipt_capture_path_transaction() { # target current-runtime relative-path backup-root
  local target="$1" current_runtime="$2" rel="$3" backup="$4"
  local runtimes runtime receipt snapshot entry state_root state_dir
  receipt_runtime_name_is_safe "$current_runtime" || return 1
  receipt_relative_path_is_safe "$rel" || return 1
  [ -d "$backup" ] && [ ! -L "$backup" ] || return 1
  state_root="$backup/receipt-state"
  mkdir "$state_root" || return 1
  runtimes="$current_runtime"
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    runtime="$(basename "$receipt" .tsv)"
    receipt_runtime_name_is_safe "$runtime" || return 1
    case " $runtimes " in *" $runtime "*) ;; *) runtimes="$runtimes $runtime" ;; esac
  done

  for runtime in $runtimes; do
    state_dir="$state_root/$runtime"
    mkdir "$state_dir" || return 1
    receipt="$(receipt_file_for "$target" "$runtime")"
    snapshot="$(receipt_snapshot_for "$target" "$runtime" "$rel")"
    entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
    if [ -e "$receipt" ] || [ -L "$receipt" ]; then
      [ -f "$receipt" ] && [ ! -L "$receipt" ] || return 1
      cp "$receipt" "$state_dir/receipt" || return 1
      cmp -s "$receipt" "$state_dir/receipt" || return 1
      : > "$state_dir/receipt.present"
    fi
    if [ -e "$snapshot" ] || [ -L "$snapshot" ]; then
      [ ! -L "$snapshot" ] || return 1
      cp -R "$snapshot" "$state_dir/snapshot" || return 1
      receipt_paths_equal "$snapshot" "$state_dir/snapshot" || return 1
      : > "$state_dir/snapshot.present"
    fi
    if [ -e "$entry" ] || [ -L "$entry" ]; then
      receipt_anchor_entry_is_valid "$target" "$runtime" "$rel" || return 1
      cp -R "$entry" "$state_dir/entry" || return 1
      receipt_paths_equal "$entry" "$state_dir/entry" || return 1
      : > "$state_dir/entry.present"
    fi
  done
}

receipt_restore_path_transaction() { # target relative-path backup-root
  local target="$1" rel="$2" backup="$3"
  local state_root state_dir runtime root receipt snapshot snapshot_root
  local anchor_root entry entry_rel expected runtime_root
  receipt_relative_path_is_safe "$rel" || return 1
  state_root="$backup/receipt-state"
  [ -d "$state_root" ] && [ ! -L "$state_root" ] || return 1
  root="$target/.vulpora/receipts/v1"
  for state_dir in "$state_root"/*; do
    [ -e "$state_dir" ] || continue
    [ -d "$state_dir" ] && [ ! -L "$state_dir" ] || return 1
    runtime="$(basename "$state_dir")"
    receipt_runtime_name_is_safe "$runtime" || return 1
    receipt="$(receipt_file_for "$target" "$runtime")"
    snapshot="$(receipt_snapshot_for "$target" "$runtime" "$rel")"
    snapshot_root="$root/snapshots/$runtime"

    if [ -f "$state_dir/receipt.present" ]; then
      [ -f "$state_dir/receipt" ] && [ ! -L "$state_dir/receipt" ] || return 1
      if [ -e "$receipt" ]; then expected="$receipt"; else expected=-; fi
      receipt_replace_relative "$root" "$runtime.tsv" "$state_dir/receipt" "$expected" || return 1
    elif [ -e "$receipt" ] || [ -L "$receipt" ]; then
      [ -f "$receipt" ] && [ ! -L "$receipt" ] || return 1
      receipt_remove_relative "$root" "$runtime.tsv" "$receipt" || return 1
    fi

    if [ -f "$state_dir/snapshot.present" ]; then
      [ -e "$state_dir/snapshot" ] && [ ! -L "$state_dir/snapshot" ] || return 1
      mkdir -p "$root/snapshots" || return 1
      if [ ! -e "$snapshot_root" ]; then mkdir "$snapshot_root" || return 1; fi
      [ -d "$snapshot_root" ] && [ ! -L "$snapshot_root" ] || return 1
      receipt_mkdir_relative "$snapshot_root" "$(dirname "$rel")" || return 1
      if [ -e "$snapshot" ]; then expected="$snapshot"; else expected=-; fi
      receipt_replace_relative "$snapshot_root" "$rel" "$state_dir/snapshot" "$expected" || return 1
    elif [ -e "$snapshot" ] || [ -L "$snapshot" ]; then
      [ ! -L "$snapshot" ] || return 1
      receipt_remove_relative "$snapshot_root" "$rel" "$snapshot" || return 1
    fi
    if [ ! -f "$state_dir/snapshot.present" ] \
      && [ -d "$snapshot_root" ] && [ ! -L "$snapshot_root" ]; then
      receipt_prune_empty_parents "$(dirname "$snapshot")" "$snapshot_root" || true
      rmdir "$snapshot_root" 2>/dev/null || true
    fi

    anchor_root="$(receipt_anchor_root_for "$target")" || return 1
    entry="$(receipt_anchor_entry_root_for "$target" "$runtime" "$rel")" || return 1
    entry_rel="runtimes/$runtime/entries/$(basename "$entry")"
    runtime_root="$(receipt_anchor_runtime_root_for "$target" "$runtime")" || return 1
    if [ -f "$state_dir/entry.present" ]; then
      [ -d "$state_dir/entry" ] && [ ! -L "$state_dir/entry" ] || return 1
      receipt_anchor_prepare "$target" || return 1
      receipt_mkdir_relative "$anchor_root" "runtimes/$runtime/entries" || return 1
      if [ -e "$entry" ]; then expected="$entry"; else expected=-; fi
      receipt_replace_relative "$anchor_root" "$entry_rel" "$state_dir/entry" "$expected" || return 1
    elif [ -e "$entry" ] || [ -L "$entry" ]; then
      [ -d "$entry" ] && [ ! -L "$entry" ] || return 1
      [ -f "$entry/path" ] && [ ! -L "$entry/path" ] || return 1
      printf '%s\n' "$rel" | cmp -s - "$entry/path" || return 1
      receipt_remove_relative "$anchor_root" "$entry_rel" "$entry" || return 1
    fi
    if [ ! -f "$state_dir/entry.present" ]; then
      rmdir "$runtime_root/entries" 2>/dev/null || true
      rmdir "$runtime_root" 2>/dev/null || true
    fi
  done
  return 0
}

receipt_record_path() { # target runtime relative-path installed-path
  local target="$1" runtime="$2" rel="$3" installed="$4"
  local receipt existing_runtime
  receipt_relative_path_is_safe "$rel" || return 1
  receipt_store_is_safe "$target" || return 1
  mkdir -p "$target/.vulpora/receipts/v1/snapshots"

  # A fixed destination may be shared by runtimes. Refresh every existing
  # owner's baseline because setup has just replaced the shared path.
  for receipt in "$target/.vulpora/receipts/v1/"*.tsv; do
    [ -e "$receipt" ] || continue
    receipt_contains_path "$receipt" "$rel" || continue
    existing_runtime="$(basename "$receipt" .tsv)"
    [ "$existing_runtime" != "$runtime" ] || continue
    receipt_write_snapshot "$target" "$existing_runtime" "$rel" "$installed" || return 1
    receipt_sync_path_anchor "$target" "$existing_runtime" "$rel" || return 1
  done
  receipt_write_snapshot "$target" "$runtime" "$rel" "$installed" || return 1
  receipt_merge_path "$target" "$runtime" "$rel" || return 1
  receipt_sync_path_anchor "$target" "$runtime" "$rel"
}

receipt_prune_empty_parents() { # start-dir stop-dir
  local current="$1" stop="$2"
  while [ "$current" != "$stop" ]; do
    case "$current" in "$stop"/*) ;; *) return 1 ;; esac
    rmdir "$current" 2>/dev/null || return 0
    current="$(dirname "$current")"
  done
}
