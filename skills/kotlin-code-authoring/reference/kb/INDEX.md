# Kotlin Code Authoring Knowledge Base — INDEX

## 작업 유형 → 읽을 KB

| 작업 신호 | KB | 다룸 |
|---|---|---|
| 단일·중첩 람다, `it`, 람다 파라미터 이름 | [lambda-parameters](lambda-parameters.md) | 람다 scope에 따른 파라미터 표기 |
| Spring bean, DI, `@Transactional`, application/service 경계 | [spring-construction](spring-construction.md) | constructor injection과 transaction-boundary 작성 판단 |

## KB 한 줄 요약

| KB | 한 줄 요약 |
|---|---|
| [lambda-parameters](lambda-parameters.md) | 비중첩 단일 파라미터에는 `it`, 중첩으로 모호할 때만 내부 이름을 사용한다 |
| [spring-construction](spring-construction.md) | 필수 의존성은 constructor injection으로 받고, transaction은 기존 application/service 경계를 따른다 |

## 원칙 문서와의 관계

상위 판단 기준은 [principles](../principles.md)다. 프로젝트 규약과 formatter가 이 KB보다 우선한다.

## 갱신

Kotlin coding convention이 바뀌거나 관련 작성 eval이 실패하면 공식 문서를 다시 확인한다.
