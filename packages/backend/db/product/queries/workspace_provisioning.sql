-- name: ClaimWorkspaceProvisioningLease :one
-- A provisioning claim is a committed lease (#4294). The caller commits this
-- statement's transaction at once and renews the lease while its work runs.
-- No row means another claimant owns the workspace: its lease is live, or a
-- transaction holds the provisioning advisory lock (a claim made under a
-- caller's held transaction keeps that lock until the caller commits). A
-- lease past expires_at belongs to a holder that stopped renewing and is
-- taken over with a new token. reclaim_token is a lease this process's own
-- ended claim could not delete; it is taken over at once. An empty
-- reclaim_token names none.
INSERT INTO workspace_provisioning_leases AS lease (workspace_id, claim_token, claim_kind, claimed_at, expires_at)
SELECT sqlc.arg(workspace_id)::text, gen_random_uuid(), sqlc.arg(claim_kind)::text, now(),
       now() + make_interval(secs => sqlc.arg(lease_seconds)::double precision)
WHERE pg_try_advisory_xact_lock(hashtextextended('workspace-provision:' || sqlc.arg(workspace_id)::text, 0))
ON CONFLICT (workspace_id) DO UPDATE
SET claim_token = EXCLUDED.claim_token,
    claim_kind = EXCLUDED.claim_kind,
    claimed_at = EXCLUDED.claimed_at,
    expires_at = EXCLUDED.expires_at
WHERE lease.expires_at <= now()
   OR lease.claim_token::text = sqlc.arg(reclaim_token)::text
RETURNING lease.claim_token, lease.expires_at;

-- name: RenewWorkspaceProvisioningLease :one
-- Extends a live lease the token still owns. No row means the lease expired
-- or another claimant took it: ownership ended and is never revived.
UPDATE workspace_provisioning_leases
SET expires_at = now() + make_interval(secs => sqlc.arg(lease_seconds)::double precision)
WHERE workspace_id = sqlc.arg(workspace_id)::text
  AND claim_token = sqlc.arg(claim_token)::uuid
  AND expires_at > now()
RETURNING expires_at;

-- name: ReleaseWorkspaceProvisioningLease :exec
-- Ends the token's lease. A lease another claimant took is left alone.
DELETE FROM workspace_provisioning_leases
WHERE workspace_id = sqlc.arg(workspace_id)::text
  AND claim_token = sqlc.arg(claim_token)::uuid;

-- name: TryLockWorkspaceProvisioning :one
-- The provisioning advisory lock on a caller's held transaction, kept until
-- that transaction ends. Every lease claim checks it, so a claim made under a
-- held transaction excludes the next claimant until its writes are visible.
SELECT pg_try_advisory_xact_lock(hashtextextended('workspace-provision:' || sqlc.arg(workspace_id)::text, 0))::boolean AS acquired;

-- name: ListWorkspaceProvisioningRecovery :many
SELECT w.id, w.repository_id, w.user_id, w.target_bookmark,
       COALESCE(u.username, o.name, '')::text AS repository_owner,
       r.name AS repository_name
FROM workspaces w
JOIN repositories r ON r.id = w.repository_id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE w.deleted_at IS NULL AND (w.status IN ('pending','starting','releasing') OR (w.status='failed' AND w.provisioning_stage='start_cleanup_pending')
 -- A release this API's predecessor could not confirm published a terminal
 -- 'failed' with no cleanup stage, which was in no backlog, while deliberately
 -- retaining vm_id for the disk and the unfinished capture -- so its guest kept
 -- running and kept its compute reservation with nothing left to look at it.
 -- This disjunct lists exactly that writer's rows, identified by the sentence
 -- it records, so reconcileInterruptedReleaseStop can finish the stop the
 -- release intended. It is NOT a failed-workspace sweep: any other failure
 -- reason, any recorded cleanup stage and any unbound placement are excluded,
 -- and the row leaves this backlog for good once the stop is confirmed.
 OR (w.status='failed' AND w.provisioning_stage='' AND w.vm_id<>''
     AND w.failure_code='conflict'
     AND w.failure_message='workspace release interrupted by host restart')
 -- The repository-advertisement door, proved for the same shape. The
 -- authenticated ref advertisement runs INSIDE the start, after the guest is
 -- already up and reported running; its refusal is a 'conflict', so
 -- markWorkspaceProvisionFailed published a terminal 'failed' with NO cleanup
 -- stage over a live guest and reaped nothing -- the row was in no backlog and
 -- the placement kept its compute reservation with nothing left to look at it.
 -- These rows carry user work (repository materialization is the subject), so
 -- they are listed here for a STOP and deliberately NOT routed into the
 -- failed-start cleanup backlog, which deletes. Same exclusions as above: any
 -- other failure reason, any recorded cleanup stage and any unbound placement
 -- are out, and the row leaves this backlog for good once the stop is confirmed.
 OR (w.status='failed' AND w.provisioning_stage='' AND w.vm_id<>''
     AND w.failure_code='conflict'
     AND w.failure_message='workspace repository advertisement could not be verified')
 OR (w.status='running' AND EXISTS (SELECT 1 FROM workspace_sessions s WHERE s.workspace_id=w.id AND s.status IN ('pending','starting'))))
-- Older API replicas do not hold ownership locks. Allow their bounded
-- ten-minute attempt to finish during the first rolling upgrade.
AND (w.status IN ('running','releasing','failed') OR w.updated_at < now()-interval '10 minutes')
-- A child workspace boots only through its batch, never a credentialed recovery.
AND NOT EXISTS (SELECT 1 FROM workspace_children c WHERE c.workspace_id=w.id)
ORDER BY w.updated_at, w.id
LIMIT 100;

-- name: CompletePendingWorkspaceSessions :many
UPDATE workspace_sessions s SET status='running', updated_at=now()
FROM workspaces w
WHERE s.workspace_id=w.id AND w.id=sqlc.arg(workspace_id)::uuid
  AND w.status='running' AND w.deleted_at IS NULL
  AND s.status IN ('pending','starting')
RETURNING s.id;

-- name: ListWorkspaceAdmissionBacklog :many
-- Runtime gauge: by provisioning stage, the age of the oldest workspace still
-- being admitted (pending or starting). A first start is aged from the row's
-- creation; a wake, which reuses 'starting', from the row's last change.
SELECT w.provisioning_stage AS stage,
       EXTRACT(EPOCH FROM NOW() - MIN(CASE WHEN w.started_at IS NULL THEN w.created_at ELSE w.updated_at END))::double precision AS oldest_age_seconds
FROM workspaces w
WHERE w.deleted_at IS NULL AND w.status IN ('pending', 'starting')
GROUP BY w.provisioning_stage;
