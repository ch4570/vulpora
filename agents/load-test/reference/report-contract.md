# 계획·서버 지표·보고서 계약

## `plan.json` — `vulpora.load-plan/v1`

```json
{
  "schema": "vulpora.load-plan/v1",
  "name": "주문 조회 한계 탐색",
  "tool": "k6",
  "target": {
    "baseUrl": "http://127.0.0.1:18080",
    "environment": "ephemeral",
    "authorization": "이 실행이 띄운 컨테이너 (container id 앞 12자리)"
  },
  "workload": {
    "model": "open",
    "executor": "ramping-arrival-rate",
    "stages": ["0→50 RPS 1m (워밍업)", "50→200 RPS 3m", "200 RPS 5m 유지"],
    "maxVUs": 300,
    "mix": {"GET /orders/{id}": "70%", "GET /orders?memberId=": "30%"}
  },
  "slo": {"p95Ms": 300, "p99Ms": 800, "errorRate": 0.01, "minRps": 150},
  "abort": "http_req_failed rate > 5% 10초 지속 시 중단"
}
```

- `target.environment`: `local`, `ephemeral`, `dedicated-test`, `authorized-shared`. `authorized-shared`는 `authorization`(승인자·시간대·최대 부하) 필수.
- `workload.model`: `open` 또는 `closed`. closed면 `vus`와 `duration` 또는 VU 단계를 적는다.
- `slo`: 생략 가능한 키 `p95Ms`, `p99Ms`, `errorRate`(0~1), `minRps`.

## `server-metrics.json` — `vulpora.server-metrics/v1`

```json
{"schema": "vulpora.server-metrics/v1", "samples": [
  {"time": "2026-10-28T02:28:05Z", "name": "hikaricp.connections.pending", "value": 12, "source": "/actuator/metrics"}
]}
```

샘플마다 수집 시각, 지표 이름, 수치, 출처. 같은 이름의 지표는 보고서에서 구간별 최댓값으로 합쳐 p95와의 상관을 계산한다.

## 보고서

`build-load-report.js`가 `<run>/report/index.html`과 `summary.json`을 만든다. 보고서는 판정(SLO), 부하 설정, 핵심 수치,
SLO 표, 시간 흐름 차트(RPS·p95·오류율·VU), 병목 가설(근거·확신도·다음 확인), 지연 구간 분해, 엔드포인트별 통계,
서버 지표 상관관계, k6 종료 코드와 계산 방법 고지를 담는다.
