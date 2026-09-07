#!/bin/bash
# Install the complete agent and skill catalog after a global npm install.
# 대상 runtime은 고정하지 않고 이 머신에 설치된 Claude Code/Codex를 감지해 정한다.

set -eu

case "${VULPORA_SKIP_AUTO_SETUP:-0}" in
  1|true) printf '%s\n' 'Vulpora auto-setup skipped by VULPORA_SKIP_AUTO_SETUP.'; exit 0 ;;
esac

case "${npm_config_global:-}" in
  1|true) ;;
  *) printf '%s\n' 'Vulpora auto-setup skipped for a non-global npm install.'; exit 0 ;;
esac

[ -n "${HOME:-}" ] && [ -d "$HOME" ] \
  || { printf '%s\n' 'Vulpora auto-setup requires an existing HOME.' >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# runtime CLI가 없거나 한 대상의 적용이 실패해도 전역 package 설치는 보존한다.
# vulpora이 성공/실패 runtime과 멱등 재시도 방법을 먼저 상세히 출력한다.
if bash "$PACKAGE_ROOT/vulpora" setup --runtime auto --scope user all-agents all-skills; then
  exit 0
fi
printf '%s\n' 'Vulpora auto-setup이 완료되지 않았습니다. runtime CLI와 위 오류를 확인한 뒤 `vulpora setup --runtime auto --scope user`를 다시 실행하세요.' >&2
exit 0
