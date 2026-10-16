package db

import (
	"context"
	"time"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// SumSandboxAwakeSecondsForUserSince returns elapsed seconds clipped to [since, now).
func (q *Queries) SumSandboxAwakeSecondsForUserSince(ctx context.Context, userID int64, since time.Time) (int64, error) {
	owner := sandbox.BillingOwnerFromContext(ctx, userID)
	return q.SumSandboxAwakeSecondsForOwnerSinceRaw(ctx, SumSandboxAwakeSecondsForOwnerSinceRawParams{OwnerID: owner.ID, OwnerType: owner.Type, Since: since})
}

// CountActiveAgentSessionVMsForUser excludes a session when either link direction
// identifies a workspace already included by CountActiveSandboxesForUser:
// (w.id = a.workspace_id OR w.agent_session_id = a.id), w.user_id = userID,
// w.deleted_at IS NULL, and w.status IN ('pending', 'starting', 'running').
// Both links matter during provisioning, before the session backlink is saved.
func (q *Queries) CountActiveAgentSessionVMsForUser(ctx context.Context, userID int64) (int64, error) {
	if sandbox.BillingOwnerFromContext(ctx, userID).Type == "org" {
		return 0, nil
	}
	var count int64
	err := q.db.QueryRow(ctx, `
SELECT COUNT(*) FROM agent_sessions a
WHERE a.user_id = $1 AND a.status = 'active'
  AND a.started_at IS NOT NULL AND a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM workspaces w
    WHERE (w.id = a.workspace_id OR w.agent_session_id = a.id)
      AND w.repository_id IN (SELECT id FROM repositories WHERE user_id=$1) AND w.deleted_at IS NULL
      AND w.status IN ('pending', 'starting', 'running')
  )`, userID).Scan(&count)
	return count, err
}

// These parameters remain the public standalone-user resume contract. Trusted
// repository attribution in ctx selects its payer without changing VM identity.
type CountOtherActiveSandboxesForWorkspaceResumeParams struct {
	UserID      int64  `json:"user_id"`
	WorkspaceID string `json:"workspace_id"`
	VmID        string `json:"vm_id"`
}
type CountOtherActiveSandboxesForWorkspaceResumeRow = CountOtherActiveSandboxesForWorkspaceResumeRawRow

func (q *Queries) CountOtherActiveSandboxesForWorkspaceResume(ctx context.Context, arg CountOtherActiveSandboxesForWorkspaceResumeParams) (CountOtherActiveSandboxesForWorkspaceResumeRow, error) {
	owner := sandbox.BillingOwnerFromContext(ctx, arg.UserID)
	return q.CountOtherActiveSandboxesForWorkspaceResumeRaw(ctx, CountOtherActiveSandboxesForWorkspaceResumeRawParams{UserID: owner.ID, OwnerType: owner.Type, WorkspaceID: arg.WorkspaceID, VmID: arg.VmID})
}
