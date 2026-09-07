# Fixture: sample-search-relevance

검색 관련성 **오프라인 평가** 픽스처. 라이브 검색 엔진 없이, 판정셋과 두 랭킹(JSON)만으로
오프라인 지표(NDCG@k·MRR·Recall@k·MAP)를 계산하고 회귀를 탐지하는 시나리오다.
모든 엔티티는 일반 예시(Article/Member/Order)로, 특정 서비스·도메인 토큰을 포함하지 않는다.

## 파일
- `judgments.csv` — 판정셋(qrels). `query_id,query,doc_id,relevance`(graded 0~3). 라벨 출처: 합성 예시(전문가 판정 가정).
- `baseline-ranking.json` — 베이스라인 랭킹(`query_id → ranked doc_id list`), `cutoff_k=4`.
- `candidate-ranking.json` — 후보 랭킹. 동일 쿼리 집합·동일 cutoff.

## 데이터 설계 (의도된 회귀)
- 쿼리 4개(q1~q4), 판정 문서 15개. 표본이 작다(n=4) — **통계적 유의성 단정 불가**.
- `q3`(order refund policy): 후보가 판정 순서를 **완전히 역전**(a-304 rel0 → 최상위) → **NDCG@4 강하게 회귀**.
- `q2`(member account settings): 후보가 a-202/a-203 순서를 바꿔 **소폭 회귀**.
- `q1`,`q4`: 후보가 베이스라인과 동일 → 변화 없음.
- 평균이 가릴 수 있는 **쿼리 단위 회귀**를 드러내는지 보는 것이 핵심.

## 에이전트가 산출해야 하는 것
1. 베이스라인·후보 각각의 **NDCG@4·MRR·Recall@4·MAP**(계산된 수치).
2. **쿼리별 델타** 표 — q3가 회귀, q2 소폭 회귀, q1/q4 변화 없음.
3. **회귀 게이팅** 판정 — q3 회귀로 게이트 **차단**, 근거(회귀 쿼리 수·최대 낙폭).
4. **판정셋 품질** 메모 — 라벨 출처·표본 n=4의 한계(유의성 미검증).
5. 리포트 파일: `report/summary.md`, `report/metrics.csv`, `report/per-query.md`.

## 금지
- 라이브 검색 엔진/트래픽 접속, 판정 라벨 발명, 수치 없는 "개선" 주장, 작은 표본에 통계적 유의성 단정.
