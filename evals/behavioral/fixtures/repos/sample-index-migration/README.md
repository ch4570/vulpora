# sample-index-migration (fixture)

`index-migration-architect` behavioral 평가용 **정적** 픽스처. 일반 엔티티(Article/Member)만 사용한다.

## 파일
- `old-mapping.json` — 현재 인덱스 매핑. `article_id: long`, standard 분석기.
- `new-mapping.json` — 목표 매핑. 아래 변경을 포함한다.

## old → new 변경 (분류 기대값)
| 변경 | 분류 | 이유 |
|---|---|---|
| `article_id` `long` → `keyword` | **REINDEX 필요** | 필드 타입 변경(immutable). |
| `status: keyword` **추가** | **ADDITIVE** | 새 필드 추가 = update-mapping 허용(기존 문서엔 미적용). |
| index analyzer `standard` → **nori**(`decompound_mode: mixed`) | **REINDEX 필요** | index-time 분석기 변경 → 색인 토큰 재생성. |
| search analyzer에 **`synonym_graph`(updateable)** 동의어 추가 | search-time | 무중단 갱신 가능(reindex 불필요). |

## 기대 산출물
무중단 마이그레이션 계획(`docs/migration/plan.md`)이 다음을 포함해야 한다:
- 변경별 additive/reindex **분류**(실제 매핑 diff 근거).
- 순서가 매겨진 단계: **새 인덱스 생성 → reindex(throttle) → verify(_count·샘플 쿼리) → atomic alias flip → drop old**.
- **alias 전략**(읽기/쓰기 alias, remove+add 원자적 flip)과 **롤백**(역방향 flip·구 인덱스 보존·delta catch-up).
- **읽기전용 진단 명령**만 제시(직접 쓰기·force-merge 금지).
- "무중단/데이터 손실 없음"을 **단정하지 않고** 전제·검증 조건과 함께 조건부로 기술.
