---
title: 자연스러운 한국어 코드 주석
source: User-provided Korean developer writing requirements
last_reviewed: 2026-08-19
skills: [korean-dev-writer]
---

# 코드 주석

주석은 코드가 답하지 못하는 질문에만 답한다. 주석을 지워도 독자가 같은 내용을 즉시 알 수 있다면
주석을 만들지 않는다.

## 주석을 쓸 근거

- 이 방식을 선택한 이유
- 코드만 봐서는 알기 어려운 비즈니스·운영 제약
- 일부러 선택한 구현과 기각한 단순한 대안
- 예상하기 어려운 부작용이나 edge case
- 외부 API·브라우저·DB의 비정상 동작
- 성능, 호환성, migration을 위한 우회 처리

## 쓰지 않는 주석

```python
# 사용자 목록을 순회한다.
for user in users:
```

```kotlin
// count를 1 증가시킨다.
count += 1
```

식별자 이름을 한국어로 번역한 주석, 변경 이력을 적은 주석, 코드와 쉽게 어긋나는 장문 설명도 쓰지
않는다. 변경 이유가 오래 남아야 하면 issue, ADR 또는 commit에 기록한다.

## 좋은 주석

```kotlin
// 탈퇴 사용자는 이전 단계에서 제외했으므로 여기서는 활성 사용자만 처리한다.
users.forEach(::sendNotice)
```

```kotlin
// 공급자 API가 성공 응답 뒤에도 결과를 늦게 반영해 2초 동안 polling한다.
awaitProviderResult()
```

```sql
-- 기존 row 검증과 강한 lock을 분리하려고 constraint를 NOT VALID로 먼저 추가한다.
ALTER TABLE orders ADD CONSTRAINT ... NOT VALID;
```

## 문체

- 짧은 평서문을 쓴다. 코드 주석에 장황한 존댓말을 넣지 않는다.
- `주의`, `참고` 같은 머리말보다 구체적인 위험을 바로 쓴다.
- `왜`와 `언제 제거할 수 있는지`가 중요하면 둘 다 남긴다.
- 후속 작업 메모에는 조건, 소유자나 추적 ID 중 필요한 정보를 붙인다. 막연한 `나중에 개선`은 남기지 않는다.

주석을 고친 뒤 코드와 반대로 말하지 않는지, 이미 사라진 workaround를 설명하지 않는지 확인한다.
