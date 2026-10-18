-- Chat guest cap (CEO a-94ge9y, Security d-kmefmv): every model host a chat
-- turn, model stream, wiki selection or model test starts holds one slot here
-- while it runs. A slot is a lease: its holder renews expires_at while the
-- host lives and deletes the row when the host closes, so a replica that
-- stopped mid-host frees the slot when the lease lapses. Admission counts the
-- live slots per owner and in all, under one transaction-scoped advisory lock.
-- Additive: a new table only.
CREATE TABLE chat_guest_slots (
    lease_id uuid PRIMARY KEY,
    owner_id bigint NOT NULL CHECK (owner_id > 0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_guest_slots_owner_expires ON chat_guest_slots (owner_id, expires_at);
CREATE INDEX chat_guest_slots_expires ON chat_guest_slots (expires_at);
