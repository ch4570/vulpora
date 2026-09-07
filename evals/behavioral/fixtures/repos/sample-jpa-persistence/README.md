# sample-jpa-persistence

`test-authoring`의 JPA persistence contract behavioral eval용 범용 Kotlin/Spring fixture다.
`AbstractDataBaseTest`, 실제 DB를 보존하는 slice 설정, `flushAndClear()`, 그리고 `JpaRepository`를
제공한다. JSONB와 ARRAY mapping을 모두 inventory하도록 만든 정적 fixture이며 실행 프로젝트는 아니다.
