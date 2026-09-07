-- 멀티스키마 샘플 — schema-cartographer가 스키마별 테이블 명세 파일을 분리 생성해야 한다.
-- public 스키마(암묵): member
CREATE TABLE member (
  member_id  bigint       NOT NULL,
  email      varchar(255) NOT NULL,
  nickname   varchar(50)  NOT NULL,
  created_at timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_member PRIMARY KEY (member_id),
  CONSTRAINT uq_member_email UNIQUE (email)
);
COMMENT ON TABLE member IS '회원';
