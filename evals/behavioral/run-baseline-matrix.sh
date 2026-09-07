#!/usr/bin/env bash
# Run the same behavioral cases across baseline modes.
#
# Usage:
#   VULPORA_BEHAVIORAL_RUNNER_CMD='bash adapters/claude-code-local-adapter.sh' \
#     bash run-baseline-matrix.sh --only=kotlin-spring-reviewer --trials=3

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$DIR/run-behavioral-evals.sh"
SUMMARIZER="$DIR/summarize-baseline-matrix.sh"

MODE="--run"
ONLY=""
MODES="${VULPORA_BASELINE_MODES:-plain-runtime agent-only agent-memory}"
TRIALS=1
RUN_GROUP_ID="${VULPORA_RUN_GROUP_ID:-matrix-$(date -u +%Y%m%dT%H%M%SZ)}"
REFERENCE="plain-runtime"
STRICT_GATE=0
MIN_OUTCOME_DELTA="${VULPORA_MIN_OUTCOME_DELTA:-0.010}"

for a in "$@"; do
  case "$a" in
    --validate) MODE="--validate" ;;
    --run) MODE="--run" ;;
    --only=*) ONLY="$a" ;;
    --modes=*) MODES="$(printf '%s' "${a#--modes=}" | tr ',' ' ')" ;;
    --trials=*) TRIALS="${a#--trials=}" ;;
    --run-group=*) RUN_GROUP_ID="${a#--run-group=}" ;;
    --reference=*) REFERENCE="${a#--reference=}" ;;
    --strict-gate) STRICT_GATE=1 ;;
    --min-outcome-delta=*) MIN_OUTCOME_DELTA="${a#--min-outcome-delta=}" ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "알 수 없는 인자: $a" >&2; exit 2 ;;
  esac
done

case "$TRIALS" in ''|*[!0-9]*) echo "--trials must be a positive integer" >&2; exit 2 ;; esac
[ "$TRIALS" -gt 0 ] && [ "$TRIALS" -le 10000 ] || { echo "--trials must be an integer in [1, 10000]" >&2; exit 2; }
is_safe_token() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$1" != *..* ]]; }
is_baseline_mode() { case "$1" in plain-runtime|agent-only|agent-memory) return 0 ;; *) return 1 ;; esac; }
is_safe_token "$RUN_GROUP_ID" || { echo "--run-group must be a safe token" >&2; exit 2; }
is_baseline_mode "$REFERENCE" || { echo "--reference must be a supported baseline mode" >&2; exit 2; }
awk -v v="$MIN_OUTCOME_DELTA" 'BEGIN { exit !(v ~ /^[0-9]+([.][0-9]+)?$/ && v+0 > 0 && v+0 <= 1) }' || {
  echo "--min-outcome-delta must be a number in (0, 1]" >&2; exit 2;
}

# Repeating a mode would create duplicate (case, mode, trial) result identity.
mode_count="$(printf '%s\n' $MODES | sed '/^$/d' | wc -l | tr -d ' ')"
unique_mode_count="$(printf '%s\n' $MODES | sed '/^$/d' | LC_ALL=C sort -u | wc -l | tr -d ' ')"
[ "$mode_count" = "$unique_mode_count" ] || {
  echo "--modes must not contain duplicates" >&2; exit 2;
}
for baseline in $MODES; do
  is_baseline_mode "$baseline" || { echo "--modes contains an unsupported baseline mode: $baseline" >&2; exit 2; }
done
case " $MODES " in *" $REFERENCE "*) ;; *) echo "--reference must be included in --modes" >&2; exit 2 ;; esac

echo "behavioral baseline matrix"
echo "modes: $MODES"
echo "run group: $RUN_GROUP_ID · trials: $TRIALS"
[ -n "$ONLY" ] && echo "scope: $ONLY"
[ "$STRICT_GATE" = 1 ] && echo "strict gate: absolute pass + outcome delta >= $MIN_OUTCOME_DELTA + no process/safety regression"
echo ""

pass=0
fail=0
trial=1
while [ "$trial" -le "$TRIALS" ]; do
  for baseline in $MODES; do
    echo "== baseline: $baseline · trial: $trial/$TRIALS =="
    runner_args=("$MODE")
    [ -n "$ONLY" ] && runner_args+=("$ONLY")
    if VULPORA_BASELINE_MODE_OVERRIDE="$baseline" \
       VULPORA_RUN_GROUP_ID="$RUN_GROUP_ID" VULPORA_TRIAL_INDEX="$trial" VULPORA_TRIAL_COUNT="$TRIALS" \
       VULPORA_RUN_LABEL="${VULPORA_RUN_LABEL:-baseline-matrix}" \
       bash "$RUNNER" "${runner_args[@]}"; then
      pass=$((pass+1))
    else
      fail=$((fail+1))
    fi
    echo ""
  done
  trial=$((trial + 1))
done

echo "baseline matrix result: $pass PASS, $fail FAIL"
summary_fail=0
if [ "$MODE" = "--run" ]; then
  summary_args=(--run-group="$RUN_GROUP_ID" --reference="$REFERENCE" --min-outcome-delta="$MIN_OUTCOME_DELTA")
  [ "$STRICT_GATE" = 1 ] && summary_args+=(--strict-gate)
  if ! bash "$SUMMARIZER" "${summary_args[@]}"; then
    summary_fail=1
    echo "baseline matrix summary: FAIL" >&2
  fi
else
  echo "comparison: not_run (dry validation produces no runtime result evidence)"
fi
[ "$fail" = 0 ] && [ "$summary_fail" = 0 ]
