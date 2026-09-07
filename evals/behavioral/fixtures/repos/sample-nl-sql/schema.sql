-- 최소 generic 스키마 (FIXTURE). 일반 엔티티만 — 도메인 토큰 없음.
CREATE TABLE article (
  article_id bigint NOT NULL,
  title      text   NOT NULL,
  body       text   NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT pk_article PRIMARY KEY (article_id)
);

CREATE TABLE member (
  member_id bigint NOT NULL,
  email     text   NOT NULL,
  CONSTRAINT pk_member PRIMARY KEY (member_id)
);

CREATE TABLE "order" (
  order_id  bigint NOT NULL,
  member_id bigint NOT NULL,
  amount    bigint NOT NULL,
  CONSTRAINT pk_order PRIMARY KEY (order_id)
);

-- 참고: 질의 표면용 최소권한 롤은 정의되어 있지 않다(핸들러가 슈퍼유저로 접속).
-- 가드/리뷰는 SELECT 전용 롤(예: app_reader) 부재를 지적해야 한다.
