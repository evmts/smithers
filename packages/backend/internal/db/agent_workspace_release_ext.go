package db

import (
	"context"
	"fmt"
)

// AgentWorkspaceUse is what still works on a box when one agent run ends: the
// other active agent sessions attached to it, its live terminal sessions, and
// whether the stack binds it as a TODO lane.
type AgentWorkspaceUse struct {
	Sessions  []string
	Terminals int64
	StackLane bool
}

// InUse reports whether anything but the finished run still uses the box.
func (u AgentWorkspaceUse) InUse() bool {
	return len(u.Sessions) > 0 || u.Terminals > 0 || u.StackLane
}

// agentWorkspaceUse reads every use of workspaceID other than the finished
// run: the agent session finishedSessionID while its current run is still
// finishedRunID or it has none. The same session's next turn is a different
// run and counts as use. A finishedRunID of 0 excludes the session outright.
// A finished run releases its box only when this reads none.
func agentWorkspaceUse(ctx context.Context, conn DBTX, workspaceID, finishedSessionID string, finishedRunID int64) (AgentWorkspaceUse, error) {
	var use AgentWorkspaceUse
	err := conn.QueryRow(ctx, `
SELECT
  COALESCE((SELECT array_agg(s.id::text ORDER BY s.id) FROM agent_sessions s
            WHERE s.workspace_id = $1::uuid AND s.status = 'active' AND s.deleted_at IS NULL
              AND NOT (s.id::text = $2 AND ($3::bigint <= 0 OR s.workflow_run_id IS NULL OR s.workflow_run_id = $3::bigint))), '{}'::text[]),
  (SELECT count(*) FROM workspace_sessions t
    WHERE t.workspace_id = $1::uuid AND t.status IN ('pending', 'starting', 'running')),
  EXISTS (SELECT 1 FROM mythical_lanes l WHERE l.workspace_id = $1::text AND l.retired_at IS NULL)
`, workspaceID, finishedSessionID, finishedRunID).Scan(&use.Sessions, &use.Terminals, &use.StackLane)
	if err != nil {
		return AgentWorkspaceUse{}, fmt.Errorf("read agent workspace use: %w", err)
	}
	return use, nil
}

// FlowHostStopPending marks a Flow host binding whose guest service a
// release could not stop; the next release retries the stop.
const FlowHostStopPending = "host_stop_pending"

// FlowHostBindingHolder names one Flow host bound to a workspace: its guest
// service, the user its per-start credentials were minted for, and whether a
// stop is still owed.
type FlowHostBindingHolder struct {
	ID              string
	UserID          int64
	ServiceName     string
	OwnerGeneration int64
	StopPending     bool
}

// ListFlowHostBindingHolders lists the live Flow host bindings of workspaceID,
// so a released box can stop their services and retire the credentials they
// were started with.
func (q *Queries) ListFlowHostBindingHolders(ctx context.Context, workspaceID string) ([]FlowHostBindingHolder, error) {
	rows, err := q.db.Query(ctx, `
SELECT id::text, user_id, service_name, owner_generation, last_error_code = $2
FROM flow_runtime_host_bindings
WHERE workspace_id = $1::uuid AND state <> 'retired'
ORDER BY id`, workspaceID, FlowHostStopPending)
	if err != nil {
		return nil, fmt.Errorf("list flow host bindings: %w", err)
	}
	defer rows.Close()
	var holders []FlowHostBindingHolder
	for rows.Next() {
		var holder FlowHostBindingHolder
		if err := rows.Scan(&holder.ID, &holder.UserID, &holder.ServiceName, &holder.OwnerGeneration, &holder.StopPending); err != nil {
			return nil, err
		}
		holders = append(holders, holder)
	}
	return holders, rows.Err()
}

// MarkFlowHostStopPending records, or clears, that a released box still owes
// a stop of this Flow host. It writes only the binding generation the release
// read, and clears only its own mark, so a host a later turn started again is
// never touched.
func (q *Queries) MarkFlowHostStopPending(ctx context.Context, bindingID string, ownerGeneration int64, pending bool) error {
	if pending {
		_, err := q.db.Exec(ctx, `
UPDATE flow_runtime_host_bindings SET last_error_code = $3, updated_at = clock_timestamp()
WHERE id = $1::uuid AND owner_generation = $2 AND state <> 'retired'`, bindingID, ownerGeneration, FlowHostStopPending)
		return err
	}
	_, err := q.db.Exec(ctx, `
UPDATE flow_runtime_host_bindings SET last_error_code = '', updated_at = clock_timestamp()
WHERE id = $1::uuid AND owner_generation = $2 AND last_error_code = $3`, bindingID, ownerGeneration, FlowHostStopPending)
	return err
}

// AgentBoxRetiredStage is the provisioning stage a retired agent box records:
// its guest and disk are gone, and the next turn builds a new box from the
// branch head it recorded.
const AgentBoxRetiredStage = "agent_box_retired"

// ListIdleAgentBoxes lists running branch boxes an agent turn used that have
// had no turn, no activity, no live terminal and no stack lane for at least
// idleSeconds. A box with an active agent session is never listed.
func (q *Queries) ListIdleAgentBoxes(ctx context.Context, idleSeconds int64, limit int32) ([]string, error) {
	rows, err := q.db.Query(ctx, `
SELECT w.id::text FROM workspaces w
JOIN users machine ON machine.id = w.user_id
WHERE w.status = 'running' AND w.deleted_at IS NULL AND w.disk_reclaimed_at IS NULL
  AND machine.lower_username = 'smithers-machines' AND machine.user_type = 'service'
  AND w.last_activity_at < NOW() - make_interval(secs => $1::double precision)
  AND EXISTS (SELECT 1 FROM agent_sessions s WHERE s.workspace_id = w.id)
  AND NOT EXISTS (SELECT 1 FROM agent_sessions s WHERE s.workspace_id = w.id AND s.deleted_at IS NULL
                  AND (s.status = 'active' OR s.finished_at > NOW() - make_interval(secs => $1::double precision)))
  AND NOT EXISTS (SELECT 1 FROM workspace_sessions t WHERE t.workspace_id = w.id AND t.status IN ('pending', 'starting', 'running'))
  AND NOT EXISTS (SELECT 1 FROM mythical_lanes l WHERE l.workspace_id = w.id::text AND l.retired_at IS NULL)
ORDER BY w.last_activity_at, w.id
LIMIT $2`, idleSeconds, limit)
	if err != nil {
		return nil, fmt.Errorf("list idle agent boxes: %w", err)
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

// RetireAgentBox records a running agent box retired after its guest was
// deleted: asleep with no guest and no head token, marked for reconstruction
// from its recorded branch head. It writes only while the release still holds
// lease and the box names no head token, the one the release revoked: a token
// named since belongs to a turn the release must not touch. Returns false
// otherwise.
func (q *Queries) RetireAgentBox(ctx context.Context, workspaceID, lease string) (bool, error) {
	tag, err := q.db.Exec(ctx, `
UPDATE workspaces
SET status = 'suspended', vm_id = '', disk_reclaimed_at = NOW(),
    suspended_at = NOW(), provisioning_stage = $2, updated_at = NOW()
WHERE id = $1::uuid AND status = 'running' AND deleted_at IS NULL
  AND provisioning_stage = $3 AND head_push_token_id IS NULL`, workspaceID, AgentBoxRetiredStage, lease)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// AgentBoxUnreapedStage marks a running agent box whose run processes could
// not be confirmed ended and which could not be retired either. Its next turn
// is refused until the box is reaped or retired, so no credential is minted
// beside a process the last run left.
const AgentBoxUnreapedStage = "agent_box_unreaped"
