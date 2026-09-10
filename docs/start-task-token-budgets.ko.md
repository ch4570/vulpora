# start-task 경로별 소스 토큰 예산

`start-task`의 경량·일반·감사 경로를 따로 측정한다. 다음 값은 공개 소스
`ba19e0a296bbb0c211a8bf937790fd76ff372db4`를 `tiktoken 0.14.0 / o200k_base`로 측정한 결과다.
파일을 한 번씩 합산한 정적 수치이며 provider 입력, 반복 읽기, 런타임 wrapper, 청구액이 아니다.

| 경로 | 파일 | 기준 토큰 | 예산 |
|---|---:|---:|---:|
| lightweight | 1 | 923 | 1,000 |
| standard 직접 실행 | 2 | 1,374 | 1,500 |
| standard 독립 세션 | 4 | 7,671 | 7,900 |
| audit 준비된 읽기·결정적 작업 | 32 | 49,171 | 51,700 |
| audit 질문 추가 | 41 | 56,295 | 59,200 |
| audit 부분 완료·이어가기 | 37 | 55,136 | 57,900 |
| audit 실행 자식 조율 | 37 | 53,809 | 56,500 |
| audit 통합 충돌 | 38 | 54,164 | 56,900 |

예산은 초기 2026-09-09 측정값에 5%를 더하고 100토큰 단위로 올림한 상한을 유지했다.
2026-09-10 공개 소스의 독립 세션 참조는 실행 전 예약 회수 설명으로 192토큰 늘었지만
기존 7,900토큰 상한 안에 있다. 소스 증가를 검토하게 하는 기준이며 provider 사용량 상한이 아니다.
64개 스킬의 discovery metadata는 4,342토큰으로, 별도 4,500토큰 상한을 유지한다.

감사 준비 경로는 명확한 읽기·결정적 작업, native clarification/planning, inline 실행, 성공한 검증을
가정한다. 진입 파일과 requirement-dialogue·task-splitter·task-orchestrator의 정의, SOUL,
principles, INDEX 및 해당 단계의 topic을 포함한다. 공유 clarity rubric은 규범 출처로 보수적으로
포함했으며 실제 읽었다는 관측은 아니다. 보고서 template은 포함하고 정상 경로에서 읽지 않는
validator 구현과 대형 report schema는 제외한다.

질문·부분 완료·실행 자식·충돌 참조는 각 시나리오에만 더한다. 실행 자식의 작업별 역할 번들,
구현 시 선택되는 authoring skill, 실제 호스트 지침과 반복 로딩은 이 표에 포함하지 않는다.
감사·위임의 전체 실행 비용을 이 값으로 대체하거나 모든 조건부 KB를 미리 읽으면 안 된다.

## 검사와 변경

[별도 로딩 계약](../evals/token-efficiency/start-task-load-scenarios.json)은 파일 그룹으로 중복 선언을
줄이며 결과에는 실제 파일 경로·hash가 펼쳐진다. 필수 로딩 의무는 측정 그룹과 독립적인 경로 목록으로
고정해 그룹에서 파일을 지워도 기대값이 함께 줄지 않게 한다. source anchor 변경, 필수 참조 누락,
주요 라우팅 문서·역할 정의·INDEX의 로컬 Markdown 및 plugin-root 경로를 검사한다. 출처별 링크의
순서·중복도 고정하므로 다른 분기에서 이미 쓰던 링크로 교체하거나 추가해도 검토가 필요하다.
새로운 산문형 지시의 의미까지 판독하지는 않으므로 변경자는 해당 분기의 소스 근거와 그룹을 함께 검토한다.

```sh
# tokenizer나 모델 없이 실행
bash install/test-token-load-coverage.sh

# 기존 안내대로 준비한 선택적 tokenizer 환경에서 실행
.vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-skills.py \
  --scenarios evals/token-efficiency/start-task-load-scenarios.json \
  --baseline evals/token-efficiency/baselines/2026-09-10/start-task-source.json \
  --check --output .vulpora/start-task-token-budget.json
```

CI는 격리 환경에 기존 `requirements.txt`의 고정 tokenizer를 설치해 같은 검사를 실행한다.
설치기와 npm runtime 의존성에는 추가하지 않는다. 최초 실행은 encoding 데이터를 다운로드할 수 있다.
baseline의 인코딩·버전·시나리오 정의가 다르면 비교를 거부한다.

2026-09-07 계약·baseline·실험 결과는 보존했다. 새 공개 소스 기준은
[2026-09-10 baseline](../evals/token-efficiency/baselines/2026-09-10/start-task-source.json)에 있다.
[2026-09-09 기록](../evals/token-efficiency/baselines/2026-09-09/start-task-source.json)은 당시 로컬
통합 커밋 `492fa74b6a5e26e13fd037f91ea96f4551fee5f0`의 관측이며, 공개 main 기준으로 주장하지 않는다.
필수 참조 삭제나 예산 상향으로 실패를 숨기지 않는다. 의도한 경로 변경은 근거를 설명하고 새 날짜의
baseline과 회귀를 함께 기록한다.
