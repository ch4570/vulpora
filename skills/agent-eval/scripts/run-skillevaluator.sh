#!/usr/bin/env bash
# Run NVIDIA SkillEvaluator without adding a project dependency or writing reports into the repository by default.

set -eu
set -o pipefail
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
POLICY="$SKILL_ROOT/config/skillevaluator-policy.yaml"
MODE=tier1
OUTPUT_DIR=""
AGENTS=codex
ENV_MODE=docker
CATALOG=0

usage() {
  cat <<'EOF'
Usage: run-skillevaluator.sh [options] [--catalog] <skill-directory|skills-directory>

Options:
  --mode tier1|security|tier2|tier3
  --output-dir <directory>   Keep reports outside the repository by default.
  --agents <csv>             Tier 3 agent list (default: codex).
  --env-mode <mode>          Tier 3 sandbox mode (default: docker).
  --catalog                  Evaluate every direct child skill in a skills directory (Tier 1/security only).
  -h, --help

Set SKILLEVALUATOR_BIN to an explicit executable, or install the pinned release:
  uv tool install --python 3.13 \
    "skillevaluator[all] @ git+https://github.com/NVIDIA/SkillEvaluator.git@3bfba44e754be87073b2344233f9569b06509ce1"

The security, tier2, and tier3 modes require the matching upstream extras,
external scanners, provider credentials, agent runtime, and sandbox documented by NVIDIA.
EOF
}

die() {
  printf 'agent-eval SkillEvaluator 오류: %s\n' "$*" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode)
      [ "$#" -ge 2 ] || die '--mode 값이 필요합니다.'
      MODE=$2
      shift 2
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || die '--output-dir 값이 필요합니다.'
      OUTPUT_DIR=$2
      shift 2
      ;;
    --agents)
      [ "$#" -ge 2 ] || die '--agents 값이 필요합니다.'
      AGENTS=$2
      shift 2
      ;;
    --env-mode)
      [ "$#" -ge 2 ] || die '--env-mode 값이 필요합니다.'
      ENV_MODE=$2
      shift 2
      ;;
    --catalog)
      CATALOG=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*) die "알 수 없는 옵션: $1" ;;
    *) break ;;
  esac
done

case "$MODE" in
  tier1|security|tier2|tier3) ;;
  *) die "지원하지 않는 mode: $MODE" ;;
esac

[ "$#" -eq 1 ] || die 'skill-directory 또는 skills-directory 하나를 지정해야 합니다.'
TARGET=$1
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || die "대상은 symlink가 아닌 directory여야 합니다: $TARGET"
if [ "$CATALOG" = 1 ]; then
  case "$MODE" in
    tier1|security) ;;
    *) die '--catalog은 tier1 또는 security mode에서만 지원합니다.' ;;
  esac
  [ -z "$(find "$TARGET" -type l -print -quit)" ] \
    || die "catalog 대상에 symlink가 있습니다: $TARGET"
  find "$TARGET" -mindepth 2 -maxdepth 2 -type f -name SKILL.md -print -quit | grep -q . \
    || die "catalog 대상에 child SKILL.md가 없습니다: $TARGET"
else
  [ -f "$TARGET/SKILL.md" ] && [ ! -L "$TARGET/SKILL.md" ] \
    || die "대상에 regular SKILL.md가 없습니다: $TARGET"
fi
[ -f "$POLICY" ] && [ ! -L "$POLICY" ] || die "정책 파일을 읽을 수 없습니다: $POLICY"

if [ -n "${SKILLEVALUATOR_BIN:-}" ]; then
  EVALUATOR=$SKILLEVALUATOR_BIN
else
  EVALUATOR=$(command -v skillevaluator 2>/dev/null || true)
fi
[ -n "$EVALUATOR" ] && [ -x "$EVALUATOR" ] \
  || die 'skillevaluator 실행 파일이 없습니다. --help의 pinned install 명령을 사용하세요.'
EVALUATOR_VERSION=$("$EVALUATOR" --version 2>/dev/null || true)
case "$EVALUATOR_VERSION" in
  *'version 0.2.1') ;;
  *) die "검증되지 않은 skillevaluator version입니다: ${EVALUATOR_VERSION:-unknown} (required: 0.2.1)" ;;
esac

if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vulpora-skillevaluator.XXXXXX") \
    || die '임시 output directory를 만들 수 없습니다.'
else
  if [ -e "$OUTPUT_DIR" ] && [ -L "$OUTPUT_DIR" ]; then
    die "output directory symlink는 허용하지 않습니다: $OUTPUT_DIR"
  fi
  mkdir -p "$OUTPUT_DIR" || die "output directory를 만들 수 없습니다: $OUTPUT_DIR"
fi
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"

export SKILLEVALUATOR_SCHEMA_ALLOWED_DIRS="${SKILLEVALUATOR_SCHEMA_ALLOWED_DIRS:+$SKILLEVALUATOR_SCHEMA_ALLOWED_DIRS,}reference"

printf 'SkillEvaluator mode=%s catalog=%s target=%s output=%s\n' "$MODE" "$CATALOG" "$TARGET" "$OUTPUT_DIR" >&2

case "$MODE" in
  tier1)
    exec "$EVALUATOR" validate "$TARGET" \
      --type skill \
      --checks schema,pii,license,quality,unicode,lint \
      --policy "$POLICY" \
      --no-dedup \
      --continue-on-failure \
      -r json,markdown \
      -o "$OUTPUT_DIR"
    ;;
  security)
    exec "$EVALUATOR" validate "$TARGET" \
      --type skill \
      --checks schema,security,pii,license,code-integrity,unicode,quality,lint \
      --policy "$POLICY" \
      --no-dedup \
      --continue-on-failure \
      -r json,markdown \
      -o "$OUTPUT_DIR"
    ;;
  tier2)
    exec "$EVALUATOR" context-optimization-check "$TARGET" \
      -r json,markdown \
      -o "$OUTPUT_DIR"
    ;;
  tier3)
    "$EVALUATOR" doctor --agents "$AGENTS" --env-mode "$ENV_MODE"
    exec "$EVALUATOR" tier3 evaluate "$TARGET" \
      --agents "$AGENTS" \
      --env-mode "$ENV_MODE" \
      --results-dir "$OUTPUT_DIR"
    ;;
esac
