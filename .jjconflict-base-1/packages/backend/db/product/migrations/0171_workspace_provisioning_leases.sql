-- #4294: a workspace provisioning claim is a committed lease, not an open
-- transaction. The claimant writes its row in one short transaction and
-- renews expires_at while its guest boots and its repository clones, so no
-- connection, transaction or snapshot is held across that work. A live row
-- refuses every other claimant; a row past expires_at belongs to a holder
-- that stopped renewing and is claimed again. The key is the workspace ID as
-- text, the same key the provisioning advisory lock hashes.
CREATE TABLE workspace_provisioning_leases (
    workspace_id text PRIMARY KEY,
    claim_token uuid NOT NULL,
    claim_kind text NOT NULL,
    claimed_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);
