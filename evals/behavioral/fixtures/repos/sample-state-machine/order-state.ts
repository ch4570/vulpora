// 주문 상태 전이 (FIXTURE) — generic Order 상태머신. 실행하지 않는다.
// 도메인 토큰 없음. code-cartographer 의 stateDiagram 검증용 정적 샘플.

export type OrderState =
  | "PENDING"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

/** 현재 상태와 이벤트로 다음 상태를 결정한다. 정의되지 않은 전이는 현재 상태 유지. */
export function transition(current: OrderState, event: string): OrderState {
  switch (current) {
    case "PENDING":
      if (event === "pay") return "PAID";
      if (event === "cancel") return "CANCELLED";
      return current;
    case "PAID":
      if (event === "ship") return "SHIPPED";
      if (event === "refund") return "CANCELLED";
      return current;
    case "SHIPPED":
      if (event === "deliver") return "DELIVERED";
      return current;
    default:
      // DELIVERED, CANCELLED = 종료 상태 (전이 없음)
      return current;
  }
}
