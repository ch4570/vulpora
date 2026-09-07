CREATE TABLE preference (
    owner_id BIGINT NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value VARCHAR(500),
    PRIMARY KEY (owner_id, preference_key)
);
