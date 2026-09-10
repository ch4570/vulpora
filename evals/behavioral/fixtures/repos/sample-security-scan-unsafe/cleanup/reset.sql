-- Called by the test bootstrap against its configured datasource; no tenant predicate.
DELETE FROM member;
TRUNCATE TABLE audit_event CASCADE;
