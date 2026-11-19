---
title: 병목 분석 — 지연 구간 분해, USE, 서버 지표
source: https://www.brendangregg.com/usemethod.html
additional_sources:
  - https://grafana.com/docs/k6/latest/using-k6/metrics/reference/
  - https://docs.spring.io/spring-boot/reference/actuator/metrics.html
last_fetched: 2026-10-28
skills: [load-test-engineer]
---

# 병목 분석

## 1. 클라이언트 측에서 좁힌다

| 큰 구간 | 뜻 | 다음 확인 |
|---|---|---|
| `http_req_waiting`(TTFB) | 서버가 처리하는 시간 | 서버 자원·쿼리·외부 호출 |
| `http_req_blocked`·`connecting`·`tls_handshaking` | 연결 슬롯 대기·연결 수립 | keep-alive 재사용, 생성기 커넥션 한도, 서버 accept backlog, LB 한도 |
| `http_req_receiving` | 응답 수신 | 응답 크기, 압축, 대역폭 |

엔드포인트별 p95로 느린 경로를 고르고, 오류 응답은 상태 코드(429, 503, 504 등)와 시작 시점을 함께 본다.

## 2. 서버 측에서 확인한다 (USE)

USE 방법은 자원마다 **사용률(Utilization)·포화(Saturation)·오류(Errors)**를 본다. Spring Boot 애플리케이션이면
Actuator로 읽기 전용 수집이 가능하다(`/actuator/metrics/{name}`, 노출 설정이 있을 때).

| 자원 | 지표 예 | 포화 신호 |
|---|---|---|
| DB 커넥션 풀(Hikari) | `hikaricp.connections.active`, `hikaricp.connections.pending` (풀 이름 태그) | pending > 0이 지속 |
| 웹 스레드(Tomcat) | `tomcat.threads.busy`, `tomcat.threads.config.max` (`server.tomcat.mbeanregistry.enabled=true` 필요) | busy가 max에 붙음 |
| CPU | `process.cpu.usage`, `system.cpu.usage` | 0.8 이상 지속 |
| JVM | `jvm.gc.pause`, `jvm.memory.used`, `jvm.threads.live` | GC 정지 증가, 힙 상한 근접 |
| 요청 | `http.server.requests` (uri·status 태그) | 서버 측 지연과 클라이언트 측 지연의 차이 = 네트워크·큐 |
| 컨테이너 | `docker stats --no-stream <id>` | CPU·메모리 한도 근접 |

수집은 1~5초 간격으로 `server-metrics.json`에 `time`·`name`·`value`·`source`로 쓴다. 이 실행이 소유한 DB라면
읽기 전용으로 느린 쿼리 통계(PostgreSQL `pg_stat_statements` 등)를 실행 전후로 비교할 수 있다.

## 3. 포화 지점과 상관

- 보고서 생성기는 초기 구간 p95 중앙값의 2배를 넘거나 오류율이 1%를 넘는 첫 구간을 포화 신호로 표시한다. 용량 한계의 증명이 아니라 조사 시작점이다.
- 서버 지표와 p95의 피어슨 상관은 후보를 고르는 데만 쓴다. 확인은 해당 자원을 바꾼 재실행(풀 크기, 스레드 수, 인스턴스 수)으로 한다.

## 4. 측정 오류를 먼저 배제한다

- `dropped_iterations`가 있으면 생성기가 목표 부하를 못 냈다. VU를 늘리거나 생성기를 나눈다.
- 생성기와 대상이 같은 호스트면 CPU 경합이 결과에 섞인다. 한계로 적는다.
- 오류 응답이 빠르면 지연 분포가 좋아 보인다. 오류율과 지연을 같이 판정한다.

## 리뷰 훅

- [ ] 병목 주장마다 클라이언트 측 구간과 서버 측 지표 중 최소 하나가 근거로 붙었다.
- [ ] 상관만 있는 주장은 "상관만 있음"으로 표시했다.
- [ ] `dropped_iterations`와 생성기 위치를 확인했다.
- [ ] 서버 지표 수집은 읽기 전용이었다.
