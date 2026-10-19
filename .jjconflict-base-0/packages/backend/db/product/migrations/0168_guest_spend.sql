-- EH-GUEST: guest capabilities are not users or repository members.
CREATE TABLE guest_reservations (
    id text PRIMARY KEY,
    -- Accounting survives repository deletion and recreation. A cascading
    -- foreign key would let a repository owner reset the operator's pool.
    repository_id bigint NOT NULL,
    sponsor_id bigint NOT NULL REFERENCES users(id),
    session_hash text NOT NULL,
    ip_hash text NOT NULL,
    request_key text NOT NULL,
    landing_id text NOT NULL,
    revision text NOT NULL,
    model text NOT NULL,
    bound_nanos bigint NOT NULL CHECK (bound_nanos > 0),
    charged_nanos bigint NOT NULL CHECK (charged_nanos >= 0 AND charged_nanos <= bound_nanos),
    state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','completed','uncertain')),
    created_at timestamptz NOT NULL,
    finished_at timestamptz,
    UNIQUE (repository_id, session_hash, request_key)
);
CREATE INDEX guest_reservations_day ON guest_reservations (created_at);
CREATE INDEX guest_reservations_ip_day ON guest_reservations (ip_hash, created_at);
