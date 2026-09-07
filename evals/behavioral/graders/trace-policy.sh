#!/usr/bin/env bash
# trace-policy — redaction + retention 보조. raw transcript는 보존하지 않는다.
# 외부 의존성 없음(bash/sed/shasum). source 해서 함수로 쓰거나 서브커맨드로 실행.
#
#   trace-policy.sh redact   < in > out     # 비밀/경로/토큰/자격증명 마스킹
#   trace-policy.sh hash <file>             # 산출물 해시(sha256, 내용 비보존)
#   trace-policy.sh scrub-temp <dir>        # 임시 디렉터리 안전 삭제(레포 밖/‐tmp 한정)
#
# redaction 대상(최소): PAT 토큰, Authorization/PRIVATE-TOKEN, 개인 홈 경로,
#   URL 내 basic-auth 자격증명, 흔한 secret 환경변수 값.

set -u

redact() {
  sed -E \
    -e 's/glpat-[A-Za-z0-9._-]+/[REDACTED_TOKEN]/g' \
    -e 's/(gh[pousr]_[A-Za-z0-9]+)/[REDACTED_TOKEN]/g' \
    -e 's/(xox[baprs]-[A-Za-z0-9-]+)/[REDACTED_TOKEN]/g' \
    -e 's/([Aa]uthorization:[[:space:]]*)(Bearer|Basic)[[:space:]]+[A-Za-z0-9._=-]+/\1\2 [REDACTED]/g' \
    -e 's/(PRIVATE-TOKEN:[[:space:]]*)[A-Za-z0-9._-]+/\1[REDACTED]/g' \
    -e 's#(https?://)[^/[:space:]@]+:[^/[:space:]@]+@#\1[REDACTED_CRED]@#g' \
    -e 's#/(Users|home)/[^/[:space:]]+/#/\1/[USER]/#g' \
    -e 's/((PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z_]*[=:][[:space:]]*)[^[:space:]"'"'"']+/\1[REDACTED]/g'
}

hash() {
  local f="${1:?file}"
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$f" | awk '{print "sha256:"$1}';
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$f" | awk '{print "sha256:"$1}';
  else echo "sha256:unavailable"; fi
}

scrub_temp() {
  local d="${1:?dir}"
  # 안전 가드: 임시 경로(또는 /tmp 계열)만 삭제. 레포/홈 루트 삭제 금지.
  case "$d" in
    */vulpora-beh.*|"${TMPDIR:-/tmp}"/*|/tmp/*|/private/tmp/*) rm -rf "$d" ;;
    *) echo "trace-policy: 안전하지 않은 scrub 경로 거부: $d" >&2; return 1 ;;
  esac
}

# 서브커맨드 디스패치(직접 실행 시)
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  cmd="${1:-}"; shift || true
  case "$cmd" in
    redact) redact ;;
    hash) hash "$@" ;;
    scrub-temp) scrub_temp "$@" ;;
    *) echo "usage: trace-policy.sh {redact|hash <file>|scrub-temp <dir>}" >&2; exit 2 ;;
  esac
fi
