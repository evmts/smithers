package db

import (
	"context"
	"fmt"
	"strconv"
	"time"
)

// AgentSandboxOwnerLockClass is the first key of the advisory lock that
// serializes one billing owner's agent box reservations; the second is
// hashtext of "<owner type>:<owner id>". No other advisory lock uses this
// class (AgentBoxSessionLockClass 0x61627373, the build cache's 0x62637270,
// 0x74666c77 and 0x74666361, the changeset land key 0x5c4a5e75, and the
// member lock's 20000).
const AgentSandboxOwnerLockClass int32 = 0x73627872

// AgentSandboxOwner is the billing owner one agent box is charged to, with
// its plan's limit on running machines.
type AgentSandboxOwner struct {
	// Type is "user" or "org".
	Type string
	ID   int64
	// ServicePayerOrgIDs are the organizations whose machines a "user" owner
	// that is the machine service user pays for (plue#839).
	ServicePayerOrgIDs []int64
	// Limit is how many machines the owner may run at once.
	Limit int64
}

// ReserveAgentSessionSandboxParams names the turn whose box is reserved.
type ReserveAgentSessionSandboxParams struct {
	SessionID string
	// StartedAt is the turn's wall clock start (ReserveAgentSessionVMSlot).
	StartedAt time.Time
	// FleetMax, when positive, caps active agent VMs across the fleet.
	FleetMax int
	// Owner, when set, caps the machines its billing owner runs at once.
	Owner *AgentSandboxOwner
}

// AgentSessionSandboxReservation is what a reservation found.
type AgentSessionSandboxReservation struct {
	// Reserved is true when the session's started_at was stamped.
	Reserved bool
	// FleetFull is true when the fleet cap refused the reservation.
	FleetFull bool
	// OwnerInUse is how many machines the owner ran besides this session's
	// own when the owner's limit refused the reservation.
	OwnerInUse int64
}

// agentSandboxOwnedRepositoriesSQL is the owner's repositories, as the
// payer counts (CountActiveSandboxesForUser,
// CountOtherActiveSandboxesForWorkspaceResumeRaw): $2 owner type, $3 owner id,
// $4 the organizations the machine service user pays for.
const agentSandboxOwnedRepositoriesSQL = `SELECT r.id FROM repositories r WHERE
  ($2::text = 'user' AND (r.user_id = $3::bigint OR (r.org_id = ANY($4::bigint[]) AND EXISTS (
    SELECT 1 FROM users m WHERE m.id = $3::bigint AND m.lower_username = 'smithers-machines'
      AND m.user_type = 'service' AND m.prohibit_login AND m.deleted_at IS NULL))))
  OR ($2::text = 'org' AND r.org_id = $3::bigint)`

// agentSandboxOwnerInUseSQL counts the machines the owner runs besides the
// session $1's own: every live workspace on its repositories, and every
// started agent session the runtime start counts against it
// (CountOtherActiveSandboxesForWorkspaceResumeRaw) whose box is not already
// counted. The session's own box and the session itself never count against
// it, so a turn whose earlier box still runs is not refused by that box.
const agentSandboxOwnerInUseSQL = `
WITH owned AS (` + agentSandboxOwnedRepositoriesSQL + `)
SELECT
  (SELECT COUNT(*) FROM workspaces w
   WHERE w.repository_id IN (SELECT id FROM owned) AND w.deleted_at IS NULL
     AND w.status IN ('pending', 'starting', 'running')
     AND w.agent_session_id IS DISTINCT FROM $1::uuid
     AND w.id IS DISTINCT FROM (SELECT a.workspace_id FROM agent_sessions a WHERE a.id = $1::uuid))
+ (SELECT COUNT(*) FROM agent_sessions a
   WHERE a.id <> $1::uuid AND a.status = 'active' AND a.started_at IS NOT NULL AND a.deleted_at IS NULL
     AND (a.repository_id IN (SELECT id FROM owned) OR ($2::text = 'user' AND a.user_id = $3::bigint))
     AND NOT EXISTS (SELECT 1 FROM workspaces w
       WHERE (w.id = a.workspace_id OR w.agent_session_id = a.id)
         AND w.repository_id IN (SELECT id FROM owned) AND w.deleted_at IS NULL
         AND w.status IN ('pending', 'starting', 'running')))`

// ReserveAgentSessionSandbox reserves a turn's box before the box exists: in
// one transaction it checks the fleet cap (FleetMax) and the billing owner's
// running-machine limit (Owner), and stamps the session's started_at, which
// makes the session count against both from that moment. The fleet lock is
// taken before the owner's lock on every path, so two reservations never
// wait on each other in a cycle. Each count is a new statement under READ
// COMMITTED after the lock, so it sees every reservation committed before it:
// of two turns one owner starts at once, exactly as many as the limit
// allows are reserved and the rest are refused before any box exists.
//
// A reservation is released when the session leaves status 'active'; its box,
// once created, counts in its place.
//
// It errors when the session is missing, tombstoned or not active.
func (q *Queries) ReserveAgentSessionSandbox(ctx context.Context, arg ReserveAgentSessionSandboxParams) (AgentSessionSandboxReservation, error) {
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return AgentSessionSandboxReservation{}, fmt.Errorf("reserve agent session sandbox: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	reservation, err := ReserveAgentSessionSandboxIn(ctx, tx, arg)
	if err != nil || !reservation.Reserved {
		return reservation, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AgentSessionSandboxReservation{}, err
	}
	return reservation, nil
}

// ReserveAgentSessionSandboxIn is ReserveAgentSessionSandbox on the caller's
// transaction tx, so the reservation commits or rolls back with what the
// caller writes beside it. Its locks hold until tx ends.
func ReserveAgentSessionSandboxIn(ctx context.Context, tx DBTX, arg ReserveAgentSessionSandboxParams) (AgentSessionSandboxReservation, error) {
	var reservation AgentSessionSandboxReservation
	if arg.FleetMax > 0 {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('agent_session_vm_fleet_cap'))`); err != nil {
			return reservation, err
		}
		var count int
		if err := tx.QueryRow(ctx, `
SELECT COUNT(*)
FROM agent_sessions
WHERE status = 'active'
  AND started_at IS NOT NULL
  AND deleted_at IS NULL
`).Scan(&count); err != nil {
			return reservation, err
		}
		if count >= arg.FleetMax {
			reservation.FleetFull = true
			return reservation, nil
		}
	}

	if owner := arg.Owner; owner != nil {
		if owner.Type != "user" && owner.Type != "org" || owner.ID <= 0 {
			return reservation, fmt.Errorf("reserve agent session sandbox: invalid billing owner %q %d", owner.Type, owner.ID)
		}
		key := owner.Type + ":" + strconv.FormatInt(owner.ID, 10)
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1::int4, hashtext($2::text))`, AgentSandboxOwnerLockClass, key); err != nil {
			return reservation, fmt.Errorf("lock billing owner's machines: %w", err)
		}
		orgs := owner.ServicePayerOrgIDs
		if orgs == nil {
			orgs = []int64{}
		}
		var inUse int64
		if err := tx.QueryRow(ctx, agentSandboxOwnerInUseSQL, arg.SessionID, owner.Type, owner.ID, orgs).Scan(&inUse); err != nil {
			return reservation, fmt.Errorf("count billing owner's machines: %w", err)
		}
		if inUse >= owner.Limit {
			reservation.OwnerInUse = inUse
			return reservation, nil
		}
	}

	tag, err := tx.Exec(ctx, `
UPDATE agent_sessions
SET started_at = $2, updated_at = NOW()
WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
`, arg.SessionID, arg.StartedAt)
	if err != nil {
		return reservation, err
	}
	if tag.RowsAffected() == 0 {
		return reservation, fmt.Errorf("agent session %s is not active", arg.SessionID)
	}
	reservation.Reserved = true
	return reservation, nil
}
