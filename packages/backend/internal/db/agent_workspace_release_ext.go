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

// AgentWorkspaceUse reads every use of workspaceID other than the agent
// session finishedSessionID. A finished run releases its box only when this
// reads none.
func (q *Queries) AgentWorkspaceUse(ctx context.Context, workspaceID, finishedSessionID string) (AgentWorkspaceUse, error) {
	var use AgentWorkspaceUse
	err := q.db.QueryRow(ctx, `
SELECT
  COALESCE((SELECT array_agg(s.id::text ORDER BY s.id) FROM agent_sessions s
            WHERE s.workspace_id = $1::uuid AND s.status = 'active' AND s.deleted_at IS NULL
              AND s.id::text <> $2), '{}'::text[]),
  (SELECT count(*) FROM workspace_sessions t
    WHERE t.workspace_id = $1::uuid AND t.status IN ('pending', 'starting', 'running')),
  EXISTS (SELECT 1 FROM mythical_lanes l WHERE l.workspace_id = $1::text AND l.retired_at IS NULL)
`, workspaceID, finishedSessionID).Scan(&use.Sessions, &use.Terminals, &use.StackLane)
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
