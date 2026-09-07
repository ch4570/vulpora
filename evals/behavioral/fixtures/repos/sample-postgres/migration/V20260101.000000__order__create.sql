-- 최소 generic 샘플 마이그레이션 — 리뷰가 lock/index 리스크를 짚어야 한다
CREATE TABLE "order" (
  order_id   bigint NOT NULL,
  member_id  bigint NOT NULL,
  amount     bigint NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT pk_order PRIMARY KEY (order_id)
);
CREATE INDEX ix_order_member ON "order" (member_id);
