# Evidence schema — `vulpora.e2e-evidence/v1`

`evidence.json` sits at the root of the run's evidence directory. Media paths are relative to that directory.

```json
{
  "schema": "vulpora.e2e-evidence/v1",
  "run": {
    "id": "e2e-20261028-1430-a1b2",
    "startedAt": "2026-10-28T14:30:00+09:00",
    "finishedAt": "2026-10-28T14:36:12+09:00",
    "revision": "<git sha>",
    "environment": "app http://127.0.0.1:<mapped port>, postgres container <id prefix>"
  },
  "cases": [
    {
      "id": "TC-ORDER-001",
      "title": "회원이 주문을 취소한다",
      "priority": "P0",
      "lane": "browser",
      "status": "PASS",
      "durationMs": 8123,
      "steps": ["주문 상세로 이동", "취소 버튼 클릭", "확인 대화상자 승인"],
      "expected": "상태가 '취소됨'으로 보이고 orders.status = CANCELLED",
      "actual": "상태 배지 '취소됨' 확인",
      "media": [
        {"kind": "video", "path": "playwright-output/order-cancel-chromium/video.webm", "caption": "전체 녹화"},
        {"kind": "screenshot", "path": "playwright-output/order-cancel-chromium/after-cancel.png", "caption": "취소 후"}
      ],
      "http": [
        {"method": "POST", "url": "/orders/101/cancel", "status": 200, "durationMs": 41, "responseBody": {"id": 101, "status": "CANCELLED"}}
      ],
      "db": [
        {
          "name": "주문 상태",
          "query": "SELECT id, status FROM orders WHERE id = 101",
          "expected": "1행, status = CANCELLED",
          "rows": [{"id": 101, "status": "CANCELLED"}],
          "status": "PASS"
        }
      ],
      "cleanup": {"status": "PASS", "absenceProbe": "SELECT count(*) FROM orders WHERE id = 101 → 0"}
    }
  ],
  "risks": ["결제 연동은 run-owned stub로 대체했다"]
}
```

## Field rules

| Field | Rule |
|---|---|
| `status` | `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, copied from the workflow; a failed DB check turns it into `FAIL` |
| `priority` | `P0`–`P2`, from the TC plan |
| `lane` | `api` or `browser` |
| `media[].kind` | `video` (`.webm`/`.mp4`), `screenshot` (`.png`/`.jpg`/`.webp`), `trace` (`.zip`) |
| `db[].query` | one read-only `SELECT`/`WITH` statement, scoped by the case's identifiers |
| `db[].status` | `PASS`, `FAIL`, `NOT_RUN` |
| `db[].rows` | at most 50 rows, already masked; the renderer masks again |
| `cleanup.status` | the workflow's per-case cleanup and absence-probe result |

A case can be `PASS` only when every DB check and its cleanup are `PASS`, and a browser case only with a video.
The overall verdict is computed by the renderer: P0 `BLOCKED` → `BLOCKED`; any `FAIL` → `FAIL`; no `PASS` or a P0
not passing → `INCONCLUSIVE`; other non-passing cases → `PARTIAL`; otherwise `PASS`.
