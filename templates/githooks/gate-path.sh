#!/bin/sh
# Sourced by hooks: resolve the runtime-neutral path or one legacy installation.
GATE="$ROOT/scripts/agent-memory-gate.sh"
if [ ! -f "$GATE" ]; then
  FOUND=0
  for candidate in "$ROOT/.codex/scripts/agent-memory-gate.sh" "$ROOT/.claude/scripts/agent-memory-gate.sh" "$ROOT/.opencode/scripts/agent-memory-gate.sh"; do
    if [ -f "$candidate" ] && [ ! -L "$candidate" ]; then GATE="$candidate"; FOUND=$((FOUND+1)); fi
  done
  if [ "$FOUND" -ne 1 ]; then
    echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=missing_or_ambiguous_gate; reinstall template:githooks' >&2
    exit 2
  fi
fi

run_memory_gate() {
  if gate_output="$(sh "$GATE" "$@")"; then
    printf '%s\n' "$gate_output"
    if printf '%s\n' "$gate_output" | grep -Eq '^agent_memory_gate status=PASS scanned_files=[1-9][0-9]* source=(tracked|stdin|stdin0)$'; then
      return 0
    fi
    case " $* " in
      *' --allow-empty '*)
        if printf '%s\n' "$gate_output" | grep -Eq '^agent_memory_gate status=NOT_RUN scanned_files=0 source=(tracked|stdin|stdin0) allow_empty=1$'; then return 0; fi ;;
    esac
    echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=missing_scan_receipt' >&2
    return 2
  else
    gate_code=$?
    printf '%s\n' "$gate_output"
    return "$gate_code"
  fi
}
if [ ! -f "$GATE" ] || [ -L "$GATE" ]; then
  echo 'agent_memory_gate status=INCONCLUSIVE scanned_files=0 reason=unsafe_gate_path' >&2
  exit 2
fi
