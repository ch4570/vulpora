# Fixture — sample-state-machine

`code-cartographer` 의 **stateDiagram** 산출을 검증하기 위한 정적 픽스처.
실행하지 않는다. 일반 엔티티(Order)만 사용 — 도메인 토큰 없음.

- `order-state.ts` — 주문 상태(`PENDING/PAID/SHIPPED/DELIVERED/CANCELLED`) 전이 함수.
  에이전트는 이 상태/전이를 Mermaid `stateDiagram-v2` 로 그리고, 각 상태/전이를
  실제 코드 위치(파일:라인)로 앵커해야 한다.
