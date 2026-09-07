#!/bin/bash
# Remove receipt-owned catalog assets from every detected runtime before a
# global npm uninstall. Runtime detection mirrors npm-postinstall.sh.

set -u

case "${VULPORA_SKIP_AUTO_SETUP:-0}" in
  1|true) exit 0 ;;
esac

case "${npm_config_global:-}" in
  1|true) ;;
  *) exit 0 ;;
esac

[ -n "${HOME:-}" ] && [ -d "$HOME" ] || exit 0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
RUNTIME_DETECT="$SCRIPT_DIR/runtime-detect.sh"

[ -f "$RUNTIME_DETECT" ] && [ ! -L "$RUNTIME_DETECT" ] || exit 1
VULPORA_DETECT_PATH="${VULPORA_RUNTIME_PATH:-${PATH:-}}"
export VULPORA_DETECT_PATH
# shellcheck source=runtime-detect.sh
. "$RUNTIME_DETECT"

# CLI가 하나도 없는 머신에서는 설치된 runtime receipt를 추측해 지우지 않는다.
# package 제거는 계속하고, 남은 catalog는 CLI 설치 후 명시 uninstall할 수 있다.
detected_runtimes="$(vulpora_detect_runtimes)"
if [ -z "$detected_runtimes" ]; then
  printf '%s\n' 'Vulpora auto-cleanup skipped because no Claude Code or Codex CLI was detected.'
  exit 0
fi

bash "$PACKAGE_ROOT/vulpora" uninstall --runtime auto --scope user
rc=$?
case "$rc" in
  0|3) exit 0 ;;
  *) exit "$rc" ;;
esac
