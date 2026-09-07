#!/usr/bin/env bash
# Run the complete offline corpus through one mandatory awk implementation.
set -eu
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
SELECTOR=system
for arg in "$@"; do
  case "$arg" in
    --awk=system) SELECTOR=system ;;
    --awk=gnu) SELECTOR=gnu ;;
    *) echo 'status: NOT_RUN; reason: invalid_awk_selector' >&2; exit 2 ;;
  esac
done
if [ "${BASH_VERSINFO[0]}" -lt 3 ] || { [ "${BASH_VERSINFO[0]}" -eq 3 ] && [ "${BASH_VERSINFO[1]}" -lt 2 ]; }; then
  echo 'status: NOT_RUN; reason: unsupported_bash; minimum: 3.2' >&2
  exit 2
fi
if [ "$SELECTOR" = system ]; then
  VULPORA_AWK_BINARY=/usr/bin/awk
else
  VULPORA_AWK_BINARY="$(command -v gawk || true)"
fi
if [ -z "$VULPORA_AWK_BINARY" ] || [ ! -x "$VULPORA_AWK_BINARY" ]; then
  echo "status: NOT_RUN; reason: missing_requested_awk; implementation: $SELECTOR" >&2
  exit 2
fi
if [ "$SELECTOR" = gnu ]; then
  version="$("$VULPORA_AWK_BINARY" --version | sed -n '1p')"
  numeric="$(printf '%s\n' "$version" | sed -n 's/^GNU Awk \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')"
  major="${numeric%%.*}"; minor="${numeric#*.}"
  if [ -z "$numeric" ] || [ "$major" -lt 5 ] || { [ "$major" -eq 5 ] && [ "$minor" -lt 1 ]; }; then
    echo 'status: NOT_RUN; reason: unsupported_gnu_awk; minimum: 5.1' >&2; exit 2
  fi
else
  case "$(uname -s)" in
    Linux)
      # The GitHub runner may select GNU Awk through update-alternatives. Keep
      # /usr/bin/awk intact and validate the actual supported implementation.
      if version="$("$VULPORA_AWK_BINARY" --version 2>&1)" && printf '%s\n' "$version" | grep -q '^GNU Awk '; then
        numeric="$(printf '%s\n' "$version" | sed -n 's/^GNU Awk \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')"
        major="${numeric%%.*}"; minor="${numeric#*.}"
        if [ -z "$numeric" ] || [ "$major" -lt 5 ] || { [ "$major" -eq 5 ] && [ "$minor" -lt 1 ]; }; then
          echo 'status: NOT_RUN; reason: unsupported_system_gnu_awk; minimum: 5.1' >&2; exit 2
        fi
      else
        version="$("$VULPORA_AWK_BINARY" -W version 2>&1)"
        if ! printf '%s\n' "$version" | grep -Eq '^mawk 1\.3\.4([ .]|$)'; then
          echo 'status: NOT_RUN; reason: unsupported_ubuntu_system_awk; expected: gnu_5.1_or_mawk_1.3.4' >&2; exit 2
        fi
      fi ;;
    Darwin)
      version="$("$VULPORA_AWK_BINARY" -version 2>&1)"
      numeric="$(printf '%s\n' "$version" | sed -n 's/^awk version \([0-9]*\).*$/\1/p')"
      if [ -z "$numeric" ] || [ "$numeric" -lt 20200816 ]; then
        echo 'status: NOT_RUN; reason: unsupported_macos_awk; minimum: 20200816' >&2; exit 2
      fi ;;
    *) echo 'status: NOT_RUN; reason: unsupported_system_awk_platform' >&2; exit 2 ;;
  esac
fi
printf '%s\n' "$version"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-awk-portability.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
mkdir "$WORK/bin" "$WORK/audit"
cp "$DIR/awk-audit-wrapper.sh" "$WORK/bin/awk"
chmod +x "$WORK/bin/awk"
VULPORA_AWK_AUDIT_DIR="$WORK/audit"
export VULPORA_AWK_BINARY VULPORA_AWK_AUDIT_DIR
PATH="$WORK/bin:$PATH"
export PATH
printf 'portability implementation=%s binary=%s bash=%s platform=%s\n' "$SELECTOR" "$VULPORA_AWK_BINARY" "$BASH_VERSION" "$(uname -s)"
code=0
{
  bash "$DIR/run-evals.sh" &&
  bash "$DIR/test-contracts.sh" &&
  bash "$DIR/behavioral/run-behavioral-evals.sh" --validate &&
  bash "$DIR/behavioral/check-catalog-coverage.sh" --strict
} > "$WORK/stdout" 2> "$WORK/stderr" || code=$?
cat "$WORK/stdout"
cat "$WORK/stderr" >&2
# Every awk invocation is audited, including ones hidden inside rejection tests.
awk_diagnostics="$(find "$WORK/audit" -type f ! -size 0 -print)"
if [ -n "$awk_diagnostics" ]; then
  echo 'status: FAIL; reason: unexpected_awk_diagnostic' >&2
  while IFS= read -r diagnostic; do cat "$diagnostic" >&2; done <<< "$awk_diagnostics"
  exit 1
fi
if grep -Ei 'awk.*(warning|deprecated)|warning.*awk' "$WORK/stdout" "$WORK/stderr"; then
  echo 'status: FAIL; reason: unexpected_awk_warning' >&2
  exit 1
fi
[ "$code" -eq 0 ] || exit "$code"
echo "status: PASS; implementation: $SELECTOR; corpus: complete; awk_diagnostics: 0"
