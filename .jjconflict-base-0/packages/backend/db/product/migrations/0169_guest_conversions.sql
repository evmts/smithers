-- EH-CONVERT: claim before external work; a claim is never redispatched.
CREATE TABLE guest_conversions (
    repository_id bigint NOT NULL,
    session_hash text NOT NULL,
    request_key text NOT NULL,
    id text NOT NULL UNIQUE,
    revision text NOT NULL,
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (repository_id, session_hash, request_key)
);
