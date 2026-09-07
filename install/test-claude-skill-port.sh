#!/usr/bin/env bash
# Claude Code가 skill catalog를 그대로 소비할 수 있는지 검증한다.
#
# 검사 범위:
#   1. .claude-plugin manifest 존재·JSON 유효성·버전 정합
#   2. 모든 skill의 SKILL.md frontmatter가 Claude Code 계약(name/description)을 만족
#   3. skill 문서에 Claude에서 실행할 수 없는 Codex 전용 호출 표기가 남아 있지 않음
#   4. skill 내부 상대 링크가 설치 트리에서 해소됨
#   5. claude CLI가 있으면 `claude plugin validate`가 통과
#
# 사용법: bash install/test-claude-skill-port.sh

set -u
set -o pipefail
set -f
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
SKILLS_DIR="$REPO_ROOT/skills"
PLUGIN_MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"
MARKETPLACE_MANIFEST="$REPO_ROOT/.claude-plugin/marketplace.json"

pass=0
fail=0

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-claude-port.XXXXXX")" || exit 1
cleanup() {
  case "$WORK" in "${TMPDIR:-/tmp}"/vulpora-claude-port.*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT HUP INT TERM

record() {
  if eval "$2" 2>/dev/null; then
    printf '  ✓ %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  ✗ %s\n' "$1"
    fail=$((fail + 1))
  fi
}

# 결과는 임시 파일로 넘긴다. 다중 행·따옴표가 섞인 출력을 eval 문자열에 끼워 넣으면
# 검사 자체가 조용히 통과해 버린다.
show_findings() { # label file
  [ ! -s "$2" ] || sed "s|^|      |" "$2" >&2
}

repo_semver="$(awk -F. 'NF == 4 { print $1 "." $2 "." $3; exit }' "$REPO_ROOT/VERSION")"

printf 'Claude skill port contract (%s)\n' "$repo_semver"

# --- 1. plugin manifest -----------------------------------------------------

record 'Claude plugin manifest 2종이 존재한다' \
  "[ -f '$PLUGIN_MANIFEST' ] && [ -f '$MARKETPLACE_MANIFEST' ]"

record 'plugin/marketplace manifest가 유효한 JSON이다' \
  "python3 -c 'import json,sys; [json.load(open(p)) for p in sys.argv[1:]]' \
     '$PLUGIN_MANIFEST' '$MARKETPLACE_MANIFEST'"

record "manifest version이 VERSION($repo_semver)과 일치한다" \
  "grep -Fq '\"version\": \"$repo_semver\"' '$PLUGIN_MANIFEST' \
   && grep -Fq '\"version\": \"$repo_semver\"' '$MARKETPLACE_MANIFEST'"

record 'marketplace가 저장소 루트 전체 catalog를 가리킨다' \
  "grep -Fq '\"source\": \"./\"' '$MARKETPLACE_MANIFEST'"

# --- 2. SKILL.md frontmatter 계약 -------------------------------------------

python3 - "$SKILLS_DIR" > "$WORK/frontmatter.txt" <<'PY'
import pathlib
import re
import sys

skills_dir = pathlib.Path(sys.argv[1])

for skill_dir in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
    definition = skill_dir / "SKILL.md"
    if not definition.is_file():
        print(f"{skill_dir.name}: SKILL.md 없음")
        continue
    text = definition.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        print(f"{skill_dir.name}: YAML frontmatter 없음")
        continue
    front = match.group(1)

    name_match = re.search(r"^name:[ \t]*(.+?)[ \t]*$", front, re.MULTILINE)
    if not name_match:
        print(f"{skill_dir.name}: name 누락")
    else:
        name = name_match.group(1).strip().strip("\"'")
        if name != skill_dir.name:
            print(f"{skill_dir.name}: name '{name}' 이 디렉터리명과 다름")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name):
            print(f"{skill_dir.name}: name '{name}' 이 소문자-하이픈 규칙 위반")
        if len(name) > 64:
            print(f"{skill_dir.name}: name 이 64자를 초과")

    desc_match = re.search(
        r"^description:[ \t]*(?:>-|>|\|-|\|)?[ \t]*\n((?:[ \t]+\S.*\n?)+)"
        r"|^description:[ \t]*(\S.*)$",
        front,
        re.MULTILINE,
    )
    if not desc_match:
        print(f"{skill_dir.name}: description 누락")
        continue
    block, inline = desc_match.group(1), desc_match.group(2)
    description = " ".join((block or inline or "").split())
    if not description:
        print(f"{skill_dir.name}: description 이 비어 있음")
    elif len(description) > 1024:
        print(f"{skill_dir.name}: description {len(description)}자 (Claude 상한 1024자 초과)")
PY

skill_count="$(find "$SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')"

record "모든 skill(${skill_count}종)의 frontmatter가 Claude 계약을 만족한다" \
  "[ ! -s '$WORK/frontmatter.txt' ]"
show_findings frontmatter "$WORK/frontmatter.txt"

# --- 3. Codex 전용 호출 표기 잔존 여부 ---------------------------------------
#
# `$<skill-id>` 는 Codex 전용 호출 문법이고 Claude Code는 `/<skill-id>` 를 쓴다.
# skill 문서는 runtime 중립 표기(예: "`diagram-styler` 스킬")를 쓰거나, 같은 문서가
# runtime 을 명시(Codex/Claude Code 병기)해야 한다. 그래야 Claude 세션이 실행할 수
# 없는 호출 문법을 그대로 따라 하지 않는다.
# Codex native descriptor(agents/openai.yaml)와 계약 schema/fixture 는 대상이 아니다.

python3 - "$SKILLS_DIR" > "$WORK/codex-only.txt" <<'PY'
import pathlib
import re
import sys

skills_dir = pathlib.Path(sys.argv[1])
skill_ids = sorted(p.name for p in skills_dir.iterdir() if p.is_dir())
pattern = re.compile(r"\$(" + "|".join(re.escape(i) for i in skill_ids) + r")\b")

for skill_dir in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
    for path in sorted(skill_dir.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        if not pattern.search(text):
            continue
        # 문서가 runtime 을 명시하면 Codex 표기도 이식성 있는 안내다.
        if "Codex" in text or "codex" in text:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if pattern.search(line):
                print(f"{path.relative_to(skills_dir)}:{lineno}: {line.strip()}")
PY

record 'skill 문서에 runtime 미표기 Codex 전용 호출이 없다' \
  "[ ! -s '$WORK/codex-only.txt' ]"
show_findings codex-only "$WORK/codex-only.txt"

# --- 4. skill 내부 상대 링크 해소 ---------------------------------------------
#
# skill 디렉터리 안을 가리키는 progressive-disclosure 링크만 검사한다.
# `../../../AGENTS.md` 처럼 설치 대상 repository 루트를 가리키는 링크는 의도된
# 바깥 참조이므로 source tree 에서 해소되지 않는 것이 정상이다.
# fenced code block 과 출력 예시 섹션의 링크는 생성 결과물의 일부이지 skill 문서의
# 탐색 링크가 아니므로 제외한다.

python3 - "$SKILLS_DIR" > "$WORK/broken-links.txt" <<'PY'
import pathlib
import re
import sys

skills_dir = pathlib.Path(sys.argv[1]).resolve()
link_pattern = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")

for skill_dir in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
    root = skill_dir.resolve()
    for path in sorted(skill_dir.rglob("*.md")):
        fenced = False
        in_example = False
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.lstrip().startswith("```"):
                fenced = not fenced
                continue
            if fenced:
                continue
            if line.startswith("#"):
                heading = line.lstrip("#").strip().upper()
                in_example = "EXAMPLE" in heading or "예시" in heading
            if in_example:
                continue
            for target in link_pattern.findall(line):
                if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                    continue
                if "{" in target:  # 출력 경로 템플릿
                    continue
                resolved = (path.parent / target.split("#", 1)[0]).resolve()
                try:
                    resolved.relative_to(root)
                except ValueError:
                    continue  # skill 바깥(설치 대상 repository) 참조
                if not resolved.exists():
                    print(f"{path.relative_to(skills_dir)} → {target}")
PY

record 'skill 내부 상대 링크가 모두 해소된다' \
  "[ ! -s '$WORK/broken-links.txt' ]"
show_findings broken-links "$WORK/broken-links.txt"

# --- 5. claude CLI 검증 -------------------------------------------------------

if command -v claude >/dev/null 2>&1; then
  record 'claude plugin validate가 저장소 루트 플러그인을 통과시킨다' \
    "claude plugin validate '$REPO_ROOT' | grep -Fq 'Validation passed'"
else
  printf '  - Claude Code CLI 없음: plugin validate 생략\n'
fi

printf '결과: PASS=%s FAIL=%s\n' "$pass" "$fail"
[ "$fail" = 0 ]
