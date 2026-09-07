# mapper KB 인덱스

매퍼(엔티티 ↔ model/DTO) 작업 전, 작업유형에 맞는 KB를 먼저 읽는다. 원칙(`../principles.md`)은 방향을,
KB는 공식 문서 근거와 **리뷰 훅**을 제공한다. 원칙과 KB가 충돌하면 **KB가 우선**한다.

## 작업유형 → KB

| 작업유형 | 먼저 읽을 KB | 한 줄 요약 |
| --- | --- | --- |
| 엔티티를 어디서/왜 변환하나 | [mapping-boundaries.md](mapping-boundaries.md) | 영속 경계에서만 매핑, 엔티티 누수·lazy 직렬화 방지, service=model·repository=entity 단방향 |
| 수동 `object`/확장함수 매퍼 작성 | [manual-mapping.md](manual-mapping.md) | 생성자 기반·불변 호환, 중첩 `?.let(::toX)`·컬렉션 매핑, 투명함 vs 보일러플레이트 |
| MapStruct 비교/도입 검토 | [mapstruct-basics.md](mapstruct-basics.md) | `@Mapper`·componentModel·이름 기반 자동매핑·null 전략, Kotlin kapt/KSP·불변 `val` 한계 |
| null·불변·부분 업데이트 | [null-immutability.md](null-immutability.md) | nullable↔Optional, 생성자/빌더만 가능, 필수값 검증, `copy(...)` 부분 업데이트, 방어적 복사 |

## KB 한 줄 요약
- **mapping-boundaries** — 매핑이 왜 필요한지(엔티티 누수·API 계약 분리)와 계층별 책임·단방향 의존.
- **manual-mapping** — 이 프로젝트의 기본 방식. `object`/확장함수, 생성자 기반, 중첩·컬렉션, 장단점.
- **mapstruct-basics** — 대안 도구의 공정한 정리. 컴파일타임 생성, 애너테이션, Kotlin 제약.
- **null-immutability** — 매핑에서 가장 사고 잦은 null·불변 처리 규칙과 검증.

## 원칙과의 관계
`../principles.md`의 7개 원칙은 KB 전체를 관통한다.
- 원칙 1(경계 매핑) ↔ mapping-boundaries
- 원칙 2·5·6(생성자·단방향·무상태) ↔ manual-mapping
- 원칙 4(수동 vs MapStruct) ↔ mapstruct-basics + manual-mapping
- 원칙 3·7(null/옵셔널·깊은 그래프) ↔ null-immutability + mapping-boundaries

## 갱신 정책
- 각 KB frontmatter의 `source`는 실제 공식 문서 URL이며 `last_fetched`로 확인 시점을 기록한다.
- 공식 문서의 동작/권고가 바뀌면 해당 KB를 갱신하고 `last_fetched`를 올린다.
- 새 매핑 작업유형이 생기면 위 표에 행을 추가하고 KB 파일을 만든다.

## TODO
- [ ] 컬렉션/페이지(Page) 응답 매핑 패턴 KB 추가 검토.
- [ ] 양방향 연관 순환 회피 사례(원칙 7)를 별도 스니펫으로 보강.
- [ ] DTO 계층(요청/응답)과 도메인 model 분리 예시 확장.
