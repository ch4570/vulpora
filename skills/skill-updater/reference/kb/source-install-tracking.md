---
title: Source package와 runtime 설치본 추적
source: ../../../../STANDARD.md
last_fetched: 2026-07-20
skills: [skill-updater]
---

# KB: Source package와 runtime 설치본 추적

근거: 이 저장소 `STANDARD.md`, `docs/agent-authoring-and-kb-guide.md`,
`install/manifest.txt`, `install/install.sh`.

## SSOT와 파생물

| 산출물 | 역할 |
|---|---|
| `skills/<id>/` | 권위 있는 source package. `SKILL.md`, principles, INDEX, topic KB를 함께 추적한다. |
| `install/manifest.txt` | 설치 inventory와 skill dependency closure의 SSOT. |
| `.claude/.opencode/.agents` 아래 설치본 | installer가 source에서 만든 runtime별 파생물. 직접 편집하지 않는다. |
| receipt | Vulpora이 설치한 경로와 snapshot을 기록해 안전한 선택 제거를 가능하게 한다. |
| `reference/kb/INDEX.md` | topic 파일을 작업 신호에 연결하는 파생 router. |
| README/CHANGELOG inventory | 사용자에게 노출되는 수치·기능이 바뀔 때만 갱신하는 파생 문서. |

## Same-change 동기화

- skill 추가·삭제·이름 변경·dependency 변경은 source package와 manifest를 같은 변경에서 맞춘다.
- KB 추가·삭제·개명은 topic과 INDEX link를 같은 변경에서 맞춘다.
- description이나 지원 runtime 주장이 바뀌면 README/CHANGELOG와 install test 기대값을 함께 확인한다.
- runtime 설치본은 commit하지 않는다. source를 수정한 뒤 격리 설치로 다시 생성한다.
- Vulpora에 존재하지 않는 `.gitignore` 예외, KO mirror, `CLAUDE.md`, `harness/index.html`을 필수
  산출물로 가정하지 않는다.

## 설치 증거 단계

| 단계 | 증명하는 것 | 증명하지 못하는 것 |
|---|---|---|
| copied | manifest closure가 목적지에 복사됨 | runtime이 skill을 읽음 |
| discovered | native runtime이 설치 skill을 탐색함 | 요청 행동이 정확·안전함 |
| executed | 대표 요청과 eval에서 기대 행동을 보임 | 모든 모델·runtime·위협에 대한 보편 안전 |

각 단계의 증거와 미검증 범위를 MR에 구분해서 기록한다. 임시 설치 workspace는 성공·실패와 관계없이
cleanup하고, 삭제 여부도 확인한다.

## 리뷰 훅

- [ ] 변경한 source package와 manifest row/dependency가 일치하는가.
- [ ] KB 파일 변경과 INDEX link가 같은 변경에 있는가.
- [ ] 설치본을 직접 편집하거나 commit하지 않았는가.
- [ ] copied/discovered/executed 증거를 서로 바꿔 주장하지 않았는가.
- [ ] source tree와 설치된 runtime tree에서 필요한 link·dependency가 해소되는가.
- [ ] 임시 설치 workspace가 제거됐는가.
