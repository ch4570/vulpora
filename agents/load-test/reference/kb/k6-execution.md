---
title: k6 스크립트 작성과 실행
source: https://grafana.com/docs/k6/latest/using-k6/thresholds/
additional_sources:
  - https://grafana.com/docs/k6/latest/using-k6/metrics/reference/
  - https://grafana.com/docs/k6/latest/results-output/real-time/json/
  - https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/
last_fetched: 2026-10-28
skills: [load-test-engineer]
---

# k6 스크립트 작성과 실행

## 스크립트

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    main: { executor: 'ramping-arrival-rate', startRate: 0, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 300,
      stages: [{ target: 50, duration: '1m' }, { target: 200, duration: '3m' }, { target: 200, duration: '5m' }] },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/orders/${Math.ceil(Math.random() * 1000)}`, { tags: { name: 'GET /orders/{id}' } });
  check(res, { 'status 200': r => r.status === 200 });
}
```

- **`tags.name`**: k6는 기본으로 실제 URL을 이름으로 쓴다. 경로 변수가 있으면 엔드포인트마다 행이 갈라지므로
  URL 템플릿을 `name` 태그로 준다.
- **`summaryTrendStats`**: 기본 요약에는 p(99)가 없다. 넣어 둬야 k6 자체 요약과 보고서를 대조할 수 있다.
- **`thresholds`**: SLO를 그대로 옮긴다. 하나라도 실패하면 k6는 종료 코드 99로 끝난다.
- 비밀(토큰·비밀번호)은 `__ENV`로 넘기고 스크립트·로그에 쓰지 않는다.

## 지표

- `http_req_duration` = `http_req_sending` + `http_req_waiting` + `http_req_receiving`.
- `http_req_waiting`은 서버 처리(TTFB), `http_req_blocked`는 커넥션 슬롯 대기, `http_req_connecting`·
  `http_req_tls_handshaking`은 연결 수립 시간이다.
- `http_req_failed`는 `setResponseCallback` 기준 실패율, `dropped_iterations`는 VU나 시간이 부족해 시작하지 못한 반복 수다.

## 실행과 결과

```bash
BASE_URL=http://127.0.0.1:18080 k6 run --out json=<run>/k6.ndjson <run>/script.js; echo "exit=$?"
```

- `--out json`은 한 줄에 하나씩 `Metric`(정의)과 `Point`(샘플: `time`, `value`, `tags`) 행을 쓴다. 보고서 생성기는
  `Point` 행만 쓰고, 백분위수를 원시 샘플에서 다시 계산한다.
- `Metric` 행은 지표가 처음 나올 때 쓰이므로 그 `tainted` 값은 최종 threshold 결과가 아니다. threshold 판정은
  종료 코드(99)로 확인한다.
- k6가 없으면 사용자 승인 후 `grafana/k6` 컨테이너로 실행한다(`docker run --rm -i --network host -v <run>:/run grafana/k6 run --out json=/run/k6.ndjson - < script.js`;
  macOS Docker Desktop에서는 `--network host` 대신 `host.docker.internal`을 쓴다).

## 리뷰 훅

- [ ] 경로 변수가 있는 요청마다 `tags.name`이 있다.
- [ ] `summaryTrendStats`에 `p(99)`가 있다.
- [ ] SLO가 `thresholds`로, 중단 기준이 `abortOnFail` threshold로 들어갔다.
- [ ] 종료 코드를 기록했다.
- [ ] 스크립트·로그에 비밀이 없다.
