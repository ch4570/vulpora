---
title: 트랜잭션 경계 — 어디에 두고 얼마나 짧게
source: https://docs.spring.io/spring-framework/reference/data-access/transaction/strategies.html
last_fetched: 2026-06-24
skills: [service]
---

# 트랜잭션 경계 — 어디에 두고 얼마나 짧게

## 경계는 서비스 계층에 둔다

- 트랜잭션 경계는 **서비스 메서드**에 둔다. 컨트롤러/리스너/배치 스텝/repository에는 두지 않는다.
- 하나의 서비스 메서드 = **하나의 논리적 작업 단위(unit of work)**. 여러 repository 호출이 원자적으로 묶여야 한다면 한 서비스 메서드 안에서 한 트랜잭션으로 처리한다.
- 서비스가 영속의 **단일 진입점**이므로(`orchestration-vs-domain.md`), 경계도 자연히 서비스에 모인다.

## 트랜잭션은 짧게 — 안에서 하지 말 것

트랜잭션이 열려 있는 동안 DB **락과 커넥션을 점유**한다. 길면 커넥션 풀 고갈, 락 경합, 데드락 위험이 커진다.

**트랜잭션 안에서 금지:**
- 원격 호출 / 외부 API 호출(HTTP, gRPC)
- 사용자 입력 대기, 긴 계산, 외부 메시지 발행 후 응답 대기
- 다른 시스템의 느린 I/O

**대신:**
- 외부 호출은 트랜잭션 **밖**에서 수행하고, 그 결과만 들고 짧은 쓰기 트랜잭션에 진입한다.
- "읽기(트랜잭션) → 외부 호출(비트랜잭션) → 쓰기(트랜잭션)"로 단계를 쪼갠다.

```kotlin
// 나쁨: 외부 호출이 트랜잭션 안 — 호출 동안 커넥션/락 점유
@Transactional
open fun enrichAndSave(id: Long) {
    val article = articleRepository.find(id)
    val data = externalApi.fetch(article.url)   // 원격 I/O가 tx 안 ❌
    articleRepository.update(article.withData(data))
}

// 좋음: 외부 호출을 tx 밖으로
open fun enrich(id: Long) {
    val article = findById(id)                  // 짧은 읽기 tx
    val data = externalApi.fetch(article.url)   // tx 밖 ✅
    saveData(id, data)                          // 짧은 쓰기 tx
}
```

## 대량 처리: chunk로 분할

- 단일 거대한 트랜잭션으로 수십만 건을 처리하지 않는다. **chunk 단위**로 끊어 각 chunk를 짧은 트랜잭션(필요 시 `REQUIRES_NEW`)으로 커밋한다.
- 부분 진행이 보존되고, 락/언두 로그 부담과 재시도 비용이 작아진다.

## 리뷰 훅
- [ ] 트랜잭션 경계가 서비스 메서드에 있는가? (컨트롤러/리스너/repo에 없는가)
- [ ] 트랜잭션 안에서 원격 호출/외부 API/사용자 대기를 하지 않는가?
- [ ] 한 트랜잭션이 하나의 논리적 작업 단위에 대응하는가?
- [ ] 대량 작업을 chunk로 분할해 짧은 트랜잭션으로 커밋하는가?
- [ ] 장시간 락/커넥션 점유 가능성에 timeout 등 안전장치가 있는가?
