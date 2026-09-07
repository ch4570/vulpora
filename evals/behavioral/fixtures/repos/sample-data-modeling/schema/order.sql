CREATE TABLE customer (
    customer_id BIGINT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    email VARCHAR(320) NOT NULL
);

CREATE TABLE customer_order (
    order_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    total_amount DECIMAL(18, 2) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
