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
//     delete) starts only after RenewAgentBoxLease proves the release still
//     holds its lease on a box that still has the guest the release was
//     decided for, and names that guest to the runtime
//     (workspace.WithGuest). No transaction is held across a runtime call.
//
// A lease older than AgentBoxLeaseSeconds belongs to a release that died; the
// next join takes the box over. That lease proves nothing about what the dead
// release finished, and taking it over leaves the box's dirty mark
// (agent_box_dirty_vm_id) as it was, so the join retires the guest. Only
// recording a retired box's new guest clears the mark (RecordAgentBoxGuest).
// Nothing here turns a box of unknown state into a clean one.

// agentBoxLiveStatusSQL is every status a leased box may hold: a turn's join
// retires a failed, stopped or slept box of its session as well as a running
// one.
const agentBoxLiveStatusSQL = `status IN ('running', 'starting', 'suspended', 'stopped', 'failed')`

// agentBoxLiveStatus reports whether a box in status may be leased by a
// turn's join (agentBoxLiveStatusSQL).
func agentBoxLiveStatus(status string) bool {
	switch status {
	case "running", "starting", "suspended", "stopped", "failed":
		return true
	}
	return false
}

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

// agentBoxSessionLockSQL takes the row of the agent session that owns the
// box. A box no session owns locks nothing.
const agentBoxSessionLockSQL = `SELECT /* agent_box_session_lock */ s.id FROM agent_sessions s
JOIN workspaces w ON w.agent_session_id = s.id
WHERE w.id = $1::uuid
FOR UPDATE OF s`

// lockAgentBoxSession takes the box's owning session row FOR UPDATE, after
// the box's lock, in a release's transaction. A start inside that session's
// turn holds the row FOR SHARE until it commits (AgentBoxDirtyOutsideTurn),
// so every release, whichever path it comes from (a turn's end, a dispatch's
// cleanup, the runtime watchdog, the sweep), waits for that start and sees
// what it minted; it never revokes between the start's check and its mint.
// Lock order, on every path: the box's advisory lock when the path takes it,
// then the session row, then the box row. A release (ClaimAgentBoxRelease,
// RevokeStoppedAgentBoxCredentials) and a join's admission (AdmitAgentBoxJoin)
// take all three in that order; a start's or a join's authorization
// transaction takes the session, then the box, and never the advisory lock.
// No path takes the box row before the session row, so no cycle forms, even
// through a start's second connection. busy is true when the start held the row for the whole
// AgentBoxLockWait; the release backs off and is retried.
func lockAgentBoxSession(ctx context.Context, tx pgx.Tx, workspaceID string) (busy bool, err error) {
	rows, err := tx.Query(ctx, agentBoxSessionLockSQL, workspaceID)
	if err == nil {
		for rows.Next() {
		}
		rows.Close()
		err = rows.Err()
	}
	if isAgentBoxLockTimeout(err) {
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("lock agent box session: %w", err)
	}
	return false, nil
}

// isAgentBoxLockTimeout reports a statement that waited out
// AgentBoxLockWait (lock_not_available, 55P03). On the fence's paths it means
// another transaction holds the box or its session: the caller is answered
// busy and retries, never failed.
func isAgentBoxLockTimeout(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "55P03"
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
	// CheckUse makes the claim back off from a box anything else uses. A
	// turn's join claims its own session's box regardless.
	CheckUse bool
	// AnyStatus leases a box in any status a guest can be retired from, not
	// only a running one: a turn's join retires its own failed, stopped or
	// slept box before it builds a fresh guest.
	AnyStatus bool
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
	if claim.Busy, err = lockAgentBoxSession(ctx, tx, arg.WorkspaceID); err != nil || claim.Busy {
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
	if claim.Status != "running" && !(arg.AnyStatus && agentBoxLiveStatus(claim.Status)) || claim.Recent {
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
		if isAgentBoxLockTimeout(err) {
			return AgentBoxClaim{Busy: true}, nil
		}
		return AgentBoxClaim{}, fmt.Errorf("lease agent box: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return AgentBoxClaim{}, fmt.Errorf("commit agent box lease: %w", err)
	}
	return claim, nil
}

// RenewAgentBoxLease re-takes lease before a runtime side effect, proving the
// release still holds the box and its guest is still guestID. With
// noHeadToken the box must also name no head token: the release revoked it,
// and one named since belongs to a turn. It answers the renewed lease, or ""
// when the release lost the box.
func (q *Queries) RenewAgentBoxLease(ctx context.Context, workspaceID, lease, guestID string, noHeadToken bool) (string, error) {
	var renewed string
	err := q.db.QueryRow(ctx, `UPDATE workspaces SET provisioning_stage = `+agentBoxNewLeaseSQL+`, updated_at = NOW()
WHERE id = $1::uuid AND provisioning_stage = $2 AND `+agentBoxLiveStatusSQL+` AND deleted_at IS NULL
  AND vm_id = $3 AND $3 <> '' AND (NOT $4::boolean OR head_push_token_id IS NULL)
RETURNING provisioning_stage`, workspaceID, lease, guestID, noHeadToken).Scan(&renewed)
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
	// TookOver is true when the join ended a dead release's lease. The box
	// keeps its dirty mark.
	TookOver bool
}

// AdmitAgentBoxJoin admits a turn to a box under the box's lock. While a
// release holds a fresh lease it admits nothing. Otherwise it ends a dead
// release's lease, leaving the box's dirty mark as it was, and binds the
// joining agent session (when given) to the box before the join mints
// anything, so a release that reads the box's use afterwards sees the turn.
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
	// The session row is bound, and so locked, before the box row: every path
	// takes the session before the box (lockAgentBoxSession), as a start's
	// authorization transaction does. A start that holds the session FOR
	// SHARE while it writes the box row on another connection
	// (RecordAgentBoxGuest, smithers#4347) never waits on a box row this
	// admission holds while this admission waits on the start.
	if sessionID != "" {
		if _, err := tx.Exec(ctx, `UPDATE agent_sessions s SET workspace_id = w.id, updated_at = NOW()
FROM workspaces w
WHERE w.id = $1::uuid AND s.id::text = $2 AND s.user_id = $3 AND s.repository_id = w.repository_id
  AND s.deleted_at IS NULL AND s.status = 'active' AND (s.workspace_id IS NULL OR s.workspace_id = w.id)`,
			workspaceID, sessionID, userID); err != nil {
			if isAgentBoxLockTimeout(err) {
				admission.Busy = true
				return admission, nil
			}
			return admission, fmt.Errorf("bind the joining agent session: %w", err)
		}
	}
	if IsAgentBoxLease(stage) {
		if _, err := tx.Exec(ctx, `UPDATE workspaces SET provisioning_stage = '', updated_at = NOW() WHERE id = $1::uuid AND provisioning_stage = $2`,
			workspaceID, stage); err != nil {
			if isAgentBoxLockTimeout(err) {
				admission.Busy = true
				return admission, nil
			}
			return admission, fmt.Errorf("end a dead agent box lease: %w", err)
		}
		admission.TookOver = true
	}
	if err := tx.Commit(ctx); err != nil {
		return admission, fmt.Errorf("commit agent box join: %w", err)
	}
	return admission, nil
}

// RevokeStoppedAgentBoxCredentialsParams names the release of a box that is
// not running (suspended, stopped or failed).
type RevokeStoppedAgentBoxCredentialsParams struct {
	WorkspaceID string
	// FinishedSessionID and FinishedRunID are the run whose end releases the
	// box, excluded from its use as in ClaimAgentBoxRelease. CheckUse false
	// (the sweep) excludes nothing.
	FinishedSessionID string
	FinishedRunID     int64
	CheckUse          bool
	// ChildrenTokenName names the box's children credential.
	ChildrenTokenName string
}

// StoppedAgentBoxRevoke is what RevokeStoppedAgentBoxCredentials found.
type StoppedAgentBoxRevoke struct {
	// Status is the box's status; Running is true when it runs (a release
	// then takes the leased path instead).
	Status  string
	Running bool
	// Busy is true when another release holds the box or its lock; Use is
	// what else uses it, when that kept it.
	Busy bool
	Use  AgentWorkspaceUse
	// Revoked is true when every credential class reads back gone.
	Revoked bool
}

// stoppedAgentBoxCredentialsLive is true while a box still names a head
// token, holds its children credential, or any of its Flow host bindings has
// a live control credential or a live landing or cache token. $1 is the
// workspace, $2 the children credential's name, $3 the revoked marker.
const stoppedAgentBoxCredentialsLive = `(
  EXISTS (SELECT 1 FROM workspaces w WHERE w.id = $1::uuid AND w.head_push_token_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM access_tokens t JOIN workspaces w ON w.id = $1::uuid WHERE t.user_id = w.user_id AND t.name = $2)
  OR EXISTS (SELECT 1 FROM flow_runtime_host_bindings b WHERE b.workspace_id = $1::uuid AND b.credential_hash <> $3)
  OR EXISTS (SELECT 1 FROM flow_runtime_host_bindings b JOIN access_tokens t ON t.user_id = b.user_id
             AND t.name IN ('flow-host-landing-' || b.id::text, 'flow-host-cache-' || b.id::text)
             WHERE b.workspace_id = $1::uuid))`

// RevokeStoppedAgentBoxCredentials revokes every credential a box that is not
// running still holds, in one transaction under the box's lock and the same
// finished-run fence as ClaimAgentBoxRelease: its head token, its children
// credential, and each Flow host binding's landing and cache tokens and
// control credential (with the model credential derived from it). It reads
// them back in the same transaction and commits only when all are gone. A box
// that runs, or that a lease or another use holds, is left alone. No other
// connection is acquired while the transaction is open.
func (q *Queries) RevokeStoppedAgentBoxCredentials(ctx context.Context, arg RevokeStoppedAgentBoxCredentialsParams) (StoppedAgentBoxRevoke, error) {
	var out StoppedAgentBoxRevoke
	tx, err := q.BeginTx(ctx)
	if err != nil {
		return out, fmt.Errorf("revoke stopped agent box credentials: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if out.Busy, err = lockAgentBox(ctx, tx, arg.WorkspaceID); err != nil || out.Busy {
		return out, err
	}
	if out.Busy, err = lockAgentBoxSession(ctx, tx, arg.WorkspaceID); err != nil || out.Busy {
		return out, err
	}
	var fresh bool
	err = tx.QueryRow(ctx, `SELECT status, `+agentBoxLeaseFreshSQL+` FROM workspaces WHERE id = $1::uuid AND deleted_at IS NULL`,
		arg.WorkspaceID).Scan(&out.Status, &fresh)
	if errors.Is(err, pgx.ErrNoRows) {
		out.Revoked = true
		return out, nil
	}
	if err != nil {
		return out, fmt.Errorf("read agent box: %w", err)
	}
	if out.Running = out.Status == "running"; out.Running {
		return out, nil
	}
	if fresh {
		out.Busy = true
		return out, nil
	}
	if arg.CheckUse {
		if out.Use, err = agentWorkspaceUse(ctx, tx, arg.WorkspaceID, arg.FinishedSessionID, arg.FinishedRunID); err != nil {
			return out, err
		}
		if out.Use.InUse() {
			return out, nil
		}
	}
	for _, step := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM access_tokens WHERE id = (SELECT head_push_token_id FROM workspaces WHERE id = $1::uuid)`, []any{arg.WorkspaceID}},
		{`UPDATE workspaces SET head_push_token_id = NULL, updated_at = NOW() WHERE id = $1::uuid AND head_push_token_id IS NOT NULL`, []any{arg.WorkspaceID}},
		{`DELETE FROM access_tokens t USING workspaces w WHERE w.id = $1::uuid AND t.user_id = w.user_id AND t.name = $2`, []any{arg.WorkspaceID, arg.ChildrenTokenName}},
		{`DELETE FROM access_tokens t USING flow_runtime_host_bindings b WHERE b.workspace_id = $1::uuid AND t.user_id = b.user_id
		   AND t.name IN ('flow-host-landing-' || b.id::text, 'flow-host-cache-' || b.id::text)`, []any{arg.WorkspaceID}},
		{`UPDATE flow_runtime_host_bindings SET credential_hash = $2, updated_at = clock_timestamp() WHERE workspace_id = $1::uuid AND credential_hash <> $2`,
			[]any{arg.WorkspaceID, flowHostRevokedCredentialHash}},
	} {
		if _, err := tx.Exec(ctx, step.sql, step.args...); err != nil {
			if isAgentBoxLockTimeout(err) {
				out.Busy = true
				return out, nil
			}
			return out, fmt.Errorf("revoke stopped agent box credentials: %w", err)
		}
	}
	var live bool
	if err := tx.QueryRow(ctx, `SELECT `+stoppedAgentBoxCredentialsLive, arg.WorkspaceID, arg.ChildrenTokenName, flowHostRevokedCredentialHash).Scan(&live); err != nil {
		return out, fmt.Errorf("read back stopped agent box credentials: %w", err)
	}
	if live {
		return out, errors.New("revoke stopped agent box credentials: a credential is still live")
	}
	if err := tx.Commit(ctx); err != nil {
		return out, fmt.Errorf("commit stopped agent box revocation: %w", err)
	}
	out.Revoked = true
	return out, nil
}

// AgentBoxCredentialsLive reads back, as RevokeStoppedAgentBoxCredentials
// does (stoppedAgentBoxCredentialsLive), whether a box still names a head
// token or holds a live children, landing, cache or Flow host credential,
// whatever its status.
func (q *Queries) AgentBoxCredentialsLive(ctx context.Context, workspaceID, childrenTokenName string) (bool, error) {
	var live bool
	err := q.db.QueryRow(ctx, `SELECT `+stoppedAgentBoxCredentialsLive, workspaceID, childrenTokenName, flowHostRevokedCredentialHash).Scan(&live)
	return live, err
}

// ListStoppedAgentBoxesWithLiveCredentials lists agent boxes that are not
// running but still hold a credential (stoppedAgentBoxCredentialsLive),
// oldest first. The sweep retries their revocation until none is left: the
// durable retry for a release that failed on a box that is not running.
func (q *Queries) ListStoppedAgentBoxesWithLiveCredentials(ctx context.Context, childrenTokenPrefix string, limit int32) ([]string, error) {
	rows, err := q.db.Query(ctx, `
SELECT w.id::text FROM workspaces w
JOIN users machine ON machine.id = w.user_id AND machine.lower_username = 'smithers-machines' AND machine.user_type = 'service'
WHERE w.deleted_at IS NULL AND w.status IN ('suspended', 'stopped', 'failed')
  AND (w.head_push_token_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM access_tokens t WHERE t.user_id = w.user_id AND t.name = $1 || w.id::text)
    OR EXISTS (SELECT 1 FROM flow_runtime_host_bindings b WHERE b.workspace_id = w.id AND b.credential_hash <> $2)
    OR EXISTS (SELECT 1 FROM flow_runtime_host_bindings b JOIN access_tokens t ON t.user_id = b.user_id
               AND t.name IN ('flow-host-landing-' || b.id::text, 'flow-host-cache-' || b.id::text)
               WHERE b.workspace_id = w.id))
ORDER BY w.updated_at, w.id
LIMIT $3`, childrenTokenPrefix, flowHostRevokedCredentialHash, limit)
	if err != nil {
		return nil, fmt.Errorf("list stopped agent boxes with live credentials: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// AgentSessionWorkspace answers the box an agent session is bound to, or ""
// when it has none.
func (q *Queries) AgentSessionWorkspace(ctx context.Context, sessionID string) (string, error) {
	var workspaceID *string
	err := q.db.QueryRow(ctx, `SELECT workspace_id::text FROM agent_sessions WHERE id::text = $1 AND deleted_at IS NULL`, sessionID).Scan(&workspaceID)
	if errors.Is(err, pgx.ErrNoRows) || workspaceID == nil {
		return "", nil
	}
	return *workspaceID, err
}
