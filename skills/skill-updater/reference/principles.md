# Skill 작성·유지 핵심 원칙 (Principles)

> 이 문서는 스킬(SKILL.md) 저작·유지의 판단 기준을 모은 "헌법"이다. KB가 "사실·규칙"이라면
> principles는 "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서/표준)가 principles보다 우선**한다.

## 출처(Sources)
- 이 저장소의 `STANDARD.md`와 `docs/agent-authoring-and-kb-guide.md` — source layout,
  progressive disclosure, 설치·평가 증거 계약(단일 출처).
- Agent Skills specification과 best practices — skill metadata, resource, validation, progressive
  disclosure.
  - https://agentskills.io/specification
  - https://agentskills.io/skill-creation/best-practices
- Semantic Versioning 2.0.0 — 호환성 기준의 버전 사고. https://semver.org/
- Keep a Changelog 1.1.0 — 변경 기록의 표준 형식. https://keepachangelog.com/
- Diátaxis — 문서 유형(튜토리얼/하우투/레퍼런스/설명) 분리. https://diataxis.fr/

---

## 0. 대전제: source package가 SSOT다
- 스킬은 임시 메모가 아니라 팀이 공유하고 git으로 추적하는 **계약(contract)** 이다.
- Vulpora의 `skills/<id>/`가 권위 원본이고 runtime 설치본은 installer가 만든 파생물이다.
- 따라서 원본, manifest, INDEX, eval을 같은 변경에서 맞추고 설치본을 직접 편집하지 않는다.

## 1. 단일 책임 (Single Responsibility)
1. 한 스킬은 **하나의 명확한 작업**만 책임진다. "이것저것 다 하는" 스킬은 라우팅을 흐린다.
2. description이 다른 스킬과 겹치면 모델이 잘못된 스킬을 고른다 → 책임 경계를 description으로
   드러내라(겹침은 분리·통합의 신호).

## 2. 트리거가 가치의 절반이다 (Description-as-Routing)
1. `description`은 "무엇인지 + **언제 쓰는지(use when …)**"를 모두 담아야 한다. 트리거가 약하면
   훌륭한 본문도 호출되지 않는다.
2. 트리거는 사용자의 실제 표현(자연어 요청)에 맞춘다. 내부 용어가 아니라 외부 신호로 쓴다.

## 3. SSOT와 파생물 동기화 (Same-Change Sync)
1. 권위 원본은 `skills/<id>/` package다. 설치된 `.claude/.opencode/.agents` copy는 **파생물**이다.
2. manifest, KB INDEX, 실제 eval case, 사용자 문서의 inventory는 원본 변경과 같은 변경에서
   영향이 있을 때 갱신한다.
3. KO 번역본이나 `harness/index.html`은 Vulpora의 필수 산출물이 아니다. 존재하지 않는 파생물을
   새 규칙으로 가정하지 않는다.

## 4. 호환성 우선의 변경 관리
1. 가능하면 **하위 호환** 변경을 선호한다. 호출 트리거·규칙 ID·계약을 깨는 변경은
   SemVer의 MAJOR에 해당하는 사건으로 취급한다.
2. 규칙을 없앨 때는 즉시 삭제 대신 **deprecate → 유예 → 제거** 순을 따른다.
3. 의미 있는 변경은 **changelog/기록**을 남긴다(Keep a Changelog 형식).

## 5. KB는 신선해야 신뢰된다 (Freshness)
1. KB의 단정은 `source`에 근거한다. 근거 없는 주장은 금지.
2. `last_fetched`는 source를 가져온 시점일 뿐 검증 증거가 아니다. 검증일·검증자·적용 version은
   metadata v2의 별도 필드로 추적한다.
3. 낡거나 틀린 KB는 방치보다 **삭제·교체**가 낫다. INDEX는 항상 실제 파일과 일치시킨다.

## 6. 문서 유형을 섞지 마라 (Diátaxis)
1. SKILL.md = 절차·규범(하우투/레퍼런스 성격), KB = 사실·규칙 레퍼런스로 역할을 분리한다.
2. 한 파일에 튜토리얼·설명·레퍼런스를 뒤섞으면 유지가 어려워진다.

## 7. 범용성(이식성)
1. 특정 서비스·레포·도메인에 묶이지 않게 작성한다. 도메인 예시는 일반 엔티티
   (`Order`/`Member`/`Article` 등)로 바꾼다.
2. 일반 기술 지식 자체는 유지하되 그 안의 도메인 전제는 일반 예시로 치환한다.

## 8. 설치 성공은 세 단계로 증명한다
1. copied는 파일이 목적지에 생겼다는 뜻이다.
2. discovered는 해당 runtime이 skill을 실제로 탐색했다는 뜻이다.
3. executed는 대표 요청에서 기대 행동과 안전 조건을 만족했다는 뜻이다.
4. 낮은 단계의 성공으로 높은 단계를 주장하지 않는다.
