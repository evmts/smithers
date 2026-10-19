package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// THE AGENT BOX FENCE. Every API replica serializes a box's lifecycle with an
// in-process lock only, so a release on one replica and a turn's join on
// another must meet in the database. Both take the box's transaction-scoped
// advisory lock for a few statements, never across a boot or a runtime call.
// Neither locks the workspace row itself: a join already holds FOR KEY SHARE
// on it in its mutation transaction (LockWorkspaceShareForMutation).
//
//   - A release reads what still uses the box and, finding nothing, takes a
//     lease in the same transaction: provisioning_stage becomes
//     "agent_box_releasing:<unix seconds>:<nonce>". It revokes, stops, reaps
//     or retires only while it holds the lease, renews it right before it
//     deletes a guest, and ends it when done.
//   - A turn's join, under the same lock, waits while a release holds a fresh
//     lease and binds its agent session to the box before it mints anything,
//     so a release that reads the box's use afterwards sees the turn.
//   - Every runtime side effect of a release (a host stop, a reap, a guest
//     delete) runs under the lock only while the release still holds its
//     lease and the box still has the guest the release was decided for
//     (WithAgentBoxGuest). The runtime addresses a guest by the reusable
//     workspace id, so a late call could otherwise hit the next guest.
//
// A lease older than AgentBoxLeaseSeconds belongs to a release that died; the
// next join takes the box over. That lease proves nothing about what the dead
// release finished, so the box is left unreaped and the join retires it.
// Nothing here turns a box of unknown state into a clean one.

// AgentBoxLeasePrefix begins the provisioning stage of a box a release holds.
const AgentBoxLeasePrefix = "agent_box_releasing:"

// AgentBoxLeaseSeconds is how long a lease holds without renewal.
const AgentBoxLeaseSeconds = 300

// IsAgentBoxLease reports whether stage is a release's lease.
func IsAgentBoxLease(stage string) bool {
	return strings.HasPrefix(stage, AgentBoxLeasePrefix)
}

const agentBoxLockSQL = `SELECT pg_advisory_xact_lock(hashtextextended('agent-box:' || $1::text, 0))`

// AgentBoxLockWait bounds how long a statement waits for the box's lock, so a
// waiter never holds its connection and snapshot for long (plue#839).
const AgentBoxLockWait = 10 * time.Second

// lockAgentBox takes the box's lock in tx. busy is true when another holder
// kept it for the whole wait.
func lockAgentBox(ctx context.Context, tx pgx.Tx, workspaceID string) (busy bool, err error) {
	if _, err := tx.Exec(ctx, fmt.Sprintf("SET LOCAL lock_timeout = %d", AgentBoxLockWait.Milliseconds())); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, agentBoxLockSQL, workspaceID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "55P03" {
			return true, nil
		}
		return false, fmt.Errorf("lock agent box: %w", err)
	}
	return false, nil
}

const agentBoxNewLeaseSQL = `'agent_box_releasing:' || floor(extract(epoch FROM clock_timestamp()))::bigint || ':' || gen_random_uuid()::text`

// agentBoxLeaseFreshSQL is true while the row's stage is a lease younger than
// AgentBoxLeaseSeconds.
var agentBoxLeaseFreshSQL = fmt.Sprintf(`(provisioning_stage LIKE 'agent_box_releasing:%%'
  AND split_part(provisioning_stage, ':', 2)::bigint > floor(extract(epoch FROM clock_timestamp()))::bigint - %d)`, AgentBoxLeaseSeconds)

// ClaimAgentBoxReleaseParams names the release that claims a box.
type ClaimAgentBoxReleaseParams struct {
	WorkspaceID string
	// FinishedSessionID and FinishedRunID are the run whose end releases the
	// box; AgentWorkspaceUse says how they are excluded from its use.
	FinishedSessionID string
	FinishedRunID     int64
	// CheckUse makes the claim back off from a box anything else uses. The
	// cleaning of an unreaped box before a turn claims it regardless.
	CheckUse bool
	// IdleSeconds, when positive, makes the claim back off from a box with
	// activity in that many seconds.
	IdleSeconds int64
	// AfterEmptyUse, when set, runs inside the claim right after it read that
	// nothing else uses the box. Tests pause a replica there.
	AfterEmptyUse func()
}

// AgentBoxClaim is what a release found when it claimed a box.
type AgentBoxClaim struct {
	// Lease is the lease the release now holds; "" when it holds none.
	Lease string
	// Status, Stage, VmID and HeadPushTokenID are the box as the claim read
	// it. VmID is the guest the release is decided for.
	Status          string
	Stage           string
	VmID            string
	HeadPushTokenID pgtype.Int8
	// Busy is true when another release holds the box.
	Busy bool
	// Use is what else uses the box, when that kept it.
	Use AgentWorkspaceUse
	// Recent is true when the box had activity within IdleSeconds.
	Recent bool
}

// ClaimAgentBoxRelease takes a release's lease on a running box under the
// box's lock, in the transaction that reads its use: no turn can join between
// that read and the lease.
func (q *Queries) ClaimAgentBoxRelease(ctx context.Context, arg ClaimAgentBoxReleaseParams) (AgentBoxClaim, error) {
	var claim AgentBoxClaim
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return claim, fmt.Errorf("claim agent box: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if claim.Busy, err = lockAgentBox(ctx, tx, arg.WorkspaceID); err != nil || claim.Busy {
		return claim, err
	}
	var fresh bool
	err = tx.QueryRow(ctx, `
SELECT status, provisioning_stage, vm_id, head_push_token_id, `+agentBoxLeaseFreshSQL+`,
       $2::bigint > 0 AND last_activity_at >= NOW() - make_interval(secs => $2::double precision)
FROM workspaces WHERE id = $1::uuid AND deleted_at IS NULL`, arg.WorkspaceID, arg.IdleSeconds).Scan(&claim.Status, &claim.Stage, &claim.VmID, &claim.HeadPushTokenID, &fresh, &claim.Recent)
	if errors.Is(err, pgx.ErrNoRows) {
		return claim, nil
	}
	if err != nil {
		return claim, fmt.Errorf("read agent box: %w", err)
	}
	if claim.Status != "running" || claim.Recent {
		return claim, nil
	}
	if fresh {
		claim.Busy = true
		return claim, nil
	}
	if arg.CheckUse {
		if claim.Use, err = agentWorkspaceUse(ctx, tx, arg.WorkspaceID, arg.FinishedSessionID, arg.FinishedRunID); err != nil {
			return claim, err
		}
		if claim.Use.InUse() {
			return claim, nil
		}
		if arg.AfterEmptyUse != nil {
			arg.AfterEmptyUse()
		}
	}
	if err := tx.QueryRow(ctx, `UPDATE workspaces SET provisioning_stage = `+agentBoxNewLeaseSQL+`, updated_at = NOW()
WHERE id = $1::uuid RETURNING provisioning_stage`, arg.WorkspaceID).Scan(&claim.Lease); err != nil {
		return AgentBoxClaim{}, fmt.Errorf("lease agent box: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return AgentBoxClaim{}, fmt.Errorf("commit agent box lease: %w", err)
	}
	return claim, nil
}

// RenewAgentBoxLease re-takes lease before an irreversible step, proving the
// release still holds a running box. With noHeadToken the box must also name
// no head token: the release revoked it, and one named since belongs to a
// turn. It answers the renewed lease, or "" when the release lost the box.
func (q *Queries) RenewAgentBoxLease(ctx context.Context, workspaceID, lease string, noHeadToken bool) (string, error) {
	var renewed string
	err := q.db.QueryRow(ctx, `UPDATE workspaces SET provisioning_stage = `+agentBoxNewLeaseSQL+`, updated_at = NOW()
WHERE id = $1::uuid AND provisioning_stage = $2 AND status = 'running' AND deleted_at IS NULL
  AND (NOT $3::boolean OR head_push_token_id IS NULL)
RETURNING provisioning_stage`, workspaceID, lease, noHeadToken).Scan(&renewed)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return renewed, err
}

// EndAgentBoxLease ends lease, leaving the box at stage. It changes nothing
// when the release no longer holds the lease.
func (q *Queries) EndAgentBoxLease(ctx context.Context, workspaceID, lease, stage string) error {
	_, err := q.db.Exec(ctx, `UPDATE workspaces SET provisioning_stage = $3, updated_at = NOW()
WHERE id = $1::uuid AND provisioning_stage = $2`, workspaceID, lease, stage)
	return err
}

// AgentBoxAdmission is what a turn's join found at the fence.
type AgentBoxAdmission struct {
	// Busy is true while a release holds a fresh lease: the join waits.
	Busy bool
	// TookOver is true when the join ended a dead release's lease, leaving
	// the box unreaped.
	TookOver bool
}

// AdmitAgentBoxJoin admits a turn to a box under the box's lock. While a
// release holds a fresh lease it admits nothing. Otherwise it ends a dead
// release's lease, leaving the box unreaped (AgentBoxUnreapedStage), and
// binds the joining agent session (when given) to the box before the join
// mints anything, so a release that reads the box's use afterwards sees the
// turn.
func (q *Queries) AdmitAgentBoxJoin(ctx context.Context, workspaceID, sessionID string, userID int64) (AgentBoxAdmission, error) {
	var admission AgentBoxAdmission
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return admission, fmt.Errorf("admit agent box join: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if admission.Busy, err = lockAgentBox(ctx, tx, workspaceID); err != nil || admission.Busy {
		return admission, err
	}
	var stage string
	var fresh bool
	err = tx.QueryRow(ctx, `SELECT provisioning_stage, `+agentBoxLeaseFreshSQL+` FROM workspaces WHERE id = $1::uuid`,
		workspaceID).Scan(&stage, &fresh)
	if errors.Is(err, pgx.ErrNoRows) {
		return admission, nil
	}
	if err != nil {
		return admission, fmt.Errorf("read agent box: %w", err)
	}
	if fresh {
		admission.Busy = true
		return admission, nil
	}
	if IsAgentBoxLease(stage) {
		if _, err := tx.Exec(ctx, `UPDATE workspaces SET provisioning_stage = $3, updated_at = NOW() WHERE id = $1::uuid AND provisioning_stage = $2`,
			workspaceID, stage, AgentBoxUnreapedStage); err != nil {
			return admission, fmt.Errorf("end a dead agent box lease: %w", err)
		}
		admission.TookOver = true
	}
	if sessionID != "" {
		if _, err := tx.Exec(ctx, `UPDATE agent_sessions s SET workspace_id = w.id, updated_at = NOW()
FROM workspaces w
WHERE w.id = $1::uuid AND s.id::text = $2 AND s.user_id = $3 AND s.repository_id = w.repository_id
  AND s.deleted_at IS NULL AND s.status = 'active' AND (s.workspace_id IS NULL OR s.workspace_id = w.id)`,
			workspaceID, sessionID, userID); err != nil {
			return admission, fmt.Errorf("bind the joining agent session: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return admission, fmt.Errorf("commit agent box join: %w", err)
	}
	return admission, nil
}

// WithAgentBoxGuest runs act, a runtime side effect of a release, under the
// box's lock while the release still holds lease and the box still has the
// guest guestID it was decided for: no join can take the box over or rebuild
// it while act runs. It answers false, without running act, when the release
// lost the box or the guest changed. The lock is held across act and act alone,
// which must be bounded and must not boot a guest.
func (q *Queries) WithAgentBoxGuest(ctx context.Context, workspaceID, lease, guestID string, act func(context.Context) error) (bool, error) {
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return false, fmt.Errorf("guard agent box guest: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	busy, err := lockAgentBox(ctx, tx, workspaceID)
	if err != nil {
		return false, err
	}
	if busy {
		return false, fmt.Errorf("guard agent box guest: the box's lock stayed busy for %s", AgentBoxLockWait)
	}
	var stage, vmID string
	err = tx.QueryRow(ctx, `SELECT provisioning_stage, vm_id FROM workspaces WHERE id = $1::uuid AND deleted_at IS NULL AND status = 'running'`,
		workspaceID).Scan(&stage, &vmID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read agent box guest: %w", err)
	}
	if lease == "" || stage != lease || guestID == "" || vmID != guestID {
		return false, nil
	}
	actErr := act(ctx)
	if err := tx.Commit(ctx); err != nil && actErr == nil {
		return true, fmt.Errorf("release agent box lock: %w", err)
	}
	return true, actErr
}
