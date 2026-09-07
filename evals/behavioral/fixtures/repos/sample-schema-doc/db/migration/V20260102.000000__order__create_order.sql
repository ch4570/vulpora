-- sales 스키마: order — 두 번째 스키마를 만들어 "스키마별 파일 분리"를 강제한다.
CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE sales."order" (
  order_id     bigint        NOT NULL,
  member_id    bigint        NOT NULL,
  status       varchar(50)   NOT NULL DEFAULT 'PENDING',
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT pk_order PRIMARY KEY (order_id),
  CONSTRAINT fk_order_member FOREIGN KEY (member_id) REFERENCES member (member_id),
  CONSTRAINT chk_order_total CHECK (total_amount >= 0)
);
CREATE INDEX ix_order_member ON sales."order" (member_id);
COMMENT ON TABLE sales."order" IS '주문';
