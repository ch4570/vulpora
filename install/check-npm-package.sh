#!/usr/bin/env bash
# Validate npm distribution metadata without publishing or changing user config.

set -eu
set -o pipefail
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
PACKAGE_JSON="$REPO_ROOT/package.json"

die() { printf 'npm package 오류: %s\n' "$*" >&2; exit 1; }

command -v npm >/dev/null 2>&1 || die "npm을 찾을 수 없습니다."
command -v node >/dev/null 2>&1 || die "node를 찾을 수 없습니다."
[ -f "$PACKAGE_JSON" ] && [ ! -L "$PACKAGE_JSON" ] || die "package.json이 regular file이 아닙니다."

repo_semver="$(awk -F. 'NF == 4 { print $1 "." $2 "." $3; exit }' "$REPO_ROOT/VERSION")"
[ -n "$repo_semver" ] || die "VERSION은 MAJOR.MINOR.PATCH.MICRO 형식이어야 합니다."

package_name="$(cd "$REPO_ROOT" && npm pkg get name | tr -d '\r\n\"')"
package_version="$(cd "$REPO_ROOT" && npm pkg get version | tr -d '\r\n\"')"
package_bin="$(cd "$REPO_ROOT" && npm pkg get 'bin.vulpora' | tr -d '\r\n\"')"
package_bin_names="$(node -e 'process.stdout.write(Object.keys(require(process.argv[1]).bin || {}).join(" "))' "$PACKAGE_JSON")"

[ "$package_name" = 'vulpora' ] \
  || die "예상하지 않은 package name: $package_name"
[ "$package_version" = "$repo_semver" ] \
  || die "npm/plugin release version 불일치: package=$package_version VERSION=$repo_semver"
[ "$package_bin" = vulpora ] || die "bin.vulpora는 vulpora여야 합니다."
[ "$package_bin_names" = vulpora ] || die "공개 npm 명령은 vulpora 하나여야 합니다."

# The registry release is pending. Keep the available Git launcher explicit;
# the repository URL is the public Vulpora source.
git_package_spec='git+https://github.com/ch4570/vulpora.git'
for install_doc in "$REPO_ROOT/README.md" "$REPO_ROOT/README.ko.md" "$REPO_ROOT/INSTALL.md"; do
  grep -Fq "npx --yes --package='$git_package_spec' -- vulpora" "$install_doc" \
    || die "한 줄 npx 대화형 실행 명령이 없습니다: ${install_doc#"$REPO_ROOT"/}"
done

if grep -Eq '"(dependencies|devDependencies|optionalDependencies)"[[:space:]]*:' "$PACKAGE_JSON"; then
  die "배포 wrapper에는 Node package dependency를 추가하지 않습니다."
fi
lifecycle_scripts="$(node -e '
  const scripts = require(process.argv[1]).scripts || {};
  const hooks = ["preinstall", "install", "postinstall", "preuninstall", "uninstall", "postuninstall"];
  process.stdout.write(hooks.filter(name => scripts[name]).join(" "));
' "$PACKAGE_JSON")"
[ -z "$lifecycle_scripts" ] \
  || die "설치·제거 lifecycle은 사용자 환경을 변경하면 안 됩니다: $lifecycle_scripts"

case "${VULPORA_ALLOW_DIRTY_CHECK:-0}" in
  0|1) ;;
  *) die "VULPORA_ALLOW_DIRTY_CHECK는 0 또는 1이어야 합니다." ;;
esac

# `npm pack` reads the working tree, while Git URL installs and CI read a
# committed snapshot. Require package inputs to match HEAD and reject untracked
# inputs so a green local pack cannot hide a broken clean-clone installation.
if command -v git >/dev/null 2>&1; then
  git_root="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ "$git_root" = "$REPO_ROOT" ]; then
    git -C "$REPO_ROOT" rev-parse --verify HEAD >/dev/null 2>&1 \
      || die "Git HEAD가 없는 working tree에서는 배포할 수 없습니다."
    if [ "${VULPORA_ALLOW_DIRTY_CHECK:-0}" != 1 ]; then
      git -C "$REPO_ROOT" diff --quiet HEAD -- \
        || die "Git/npm 배포 전에는 staged·unstaged 변경이 없는 clean working tree가 필요합니다."
      untracked_inputs="$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)"
      [ -z "$untracked_inputs" ] \
        || die "Git/npm 배포 전에는 untracked 파일이 없는 clean working tree가 필요합니다:
$untracked_inputs"

      # Git-ignored files can still enter an npm tarball when package `files`
      # includes their parent directory. Release mode requires every packaged
      # file to exist in the committed snapshot.
      command -v node >/dev/null 2>&1 || die "npm tarball inventory 검증에 node가 필요합니다."
      pack_inventory_json="$(cd "$REPO_ROOT" && npm pack --ignore-scripts --dry-run --json 2>/dev/null)" \
        || die "npm tarball inventory를 만들 수 없습니다."
      packaged_files="$(printf '%s' "$pack_inventory_json" | node -e '
        let input = "";
        process.stdin.on("data", chunk => input += chunk);
        process.stdin.on("end", () => {
          const result = JSON.parse(input);
          for (const file of (result[0] && result[0].files) || []) {
            process.stdout.write(file.path + "\n");
          }
        });
      ')" || die "npm tarball inventory를 해석할 수 없습니다."
      untracked_packaged=""
      while IFS= read -r packaged_file; do
        [ -n "$packaged_file" ] || continue
        if ! git -C "$REPO_ROOT" cat-file -e "HEAD:$packaged_file" 2>/dev/null; then
          untracked_packaged="${untracked_packaged}${untracked_packaged:+
}$packaged_file"
        fi
      done <<EOF
$packaged_files
EOF
      [ -z "$untracked_packaged" ] \
        || die "npm tarball에 HEAD가 소유하지 않은 파일이 포함됩니다:
$untracked_packaged"
    fi
  fi
fi

[ -x "$REPO_ROOT/vulpora" ] || die "vulpora CLI가 executable이 아닙니다."
bash -n "$REPO_ROOT/vulpora" \
  "$REPO_ROOT/install/install.sh" \
  "$REPO_ROOT/install/interactive.sh" \
  "$REPO_ROOT/install/mcp-manager.sh" \
  "$REPO_ROOT/install/uninstall.sh" \
  "$REPO_ROOT/install/receipt-lib.sh" \
  "$REPO_ROOT/install/npm-postinstall.sh" \
  "$REPO_ROOT/install/npm-preuninstall.sh" \
  "$REPO_ROOT/install/runtime-detect.sh" \
  "$REPO_ROOT/install/test-offline-suite.sh"
if ! manifest_output="$(bash "$REPO_ROOT/install/check-manifest.sh" 2>&1)"; then
  printf '%s\n' "$manifest_output" >&2
  die "release manifest 검증에 실패했습니다."
fi
bash "$REPO_ROOT/install/test-offline-suite.sh" >/dev/null

for manifest in \
  "$REPO_ROOT/.claude-plugin/plugin.json" \
  "$REPO_ROOT/.claude-plugin/marketplace.json"; do
  grep -Fq "\"version\": \"$repo_semver\"" "$manifest" \
    || die "release version이 일치하지 않습니다: ${manifest#"$REPO_ROOT"/}"
done

# `npm pack --silent` reserves stdout for the generated tarball filename. Keep
# lifecycle diagnostics on stderr so command substitution receives one path.
printf 'npm package source OK: %s@%s\n' "$package_name" "$package_version" >&2
