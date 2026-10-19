package db

import (
	"context"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

func (q *Queries) CountConnectedReposForUser(ctx context.Context, userID int64) (int, error) {
	var count int
	err := q.db.QueryRow(ctx, `
SELECT COUNT(*)
FROM repo_connections
WHERE user_id = $1
`, userID).Scan(&count)
	return count, err
}

// CountVisibleActiveWorkflowRunsForUser is the public count; capacity accounting
// below intentionally keeps counting all runs on dispatchable repositories.
func (q *Queries) CountVisibleActiveWorkflowRunsForUser(ctx context.Context, userID, viewerID int64) (int, error) {
	return q.countActiveWorkflowRunsForUser(ctx, userID, viewerID, true)
}

func (q *Queries) CountActiveWorkflowRunsForUser(ctx context.Context, userID int64) (int, error) {
	return q.countActiveWorkflowRunsForUser(ctx, userID, userID, false)
}

func (q *Queries) countActiveWorkflowRunsForUser(ctx context.Context, userID, viewerID int64, restrictVisibility bool) (int, error) {
	// The per-user concurrent-run cap gates workflow dispatch on EVERY repo the
	// user can dispatch to, so the footprint must cover org-member and
	// collaborator repos too — counting only personally-owned repos made the
	// cap a no-op for org/collaborator dispatches (a user could stack unbounded
	// concurrent runs on an org repo while their personal count stayed 0).
	// workflow_runs has no dispatching-user attribution column, so this counts
	// active runs across the user's whole dispatchable surface; on busy shared
	// repos that errs conservative (a teammate's runs count against you), which
	// is the right failure mode for a runner-capacity safety cap.
	var count int
	err := q.db.QueryRow(ctx, `
SELECT COUNT(*)
FROM workflow_runs wr
JOIN repositories r ON r.id = wr.repository_id
WHERE wr.status IN ('queued', 'running')
 AND (NOT $2::boolean OR may_view_workflow_run(wr.id, $3))
  AND (
    r.user_id = $1
    OR r.org_id IN (SELECT organization_id FROM org_members WHERE user_id = $1)
    OR r.id IN (SELECT repository_id FROM collaborators WHERE user_id = $1)
  )
`, userID, restrictVisibility, viewerID).Scan(&count)
	return count, err
}

// CountActiveSandboxesForUser counts product workspace reservations. Hosted
// deployments override this through deploymentdb to include private gateways.
// Child workspaces (#2802) have their own plan limit and are not counted.
// Until organizations have plans (mvp.md M-09), the machine service user pays
// for the machines of the organizations ctx lists (sandbox.WithServicePayerOrgs,
// plue#839) and of no other organization.
func (q *Queries) CountActiveSandboxesForUser(ctx context.Context, userID int64) (int, error) {
	var count int
	err := q.db.QueryRow(ctx, `
SELECT COUNT(*) FROM workspaces w JOIN repositories r ON r.id=w.repository_id
WHERE (($2='user' AND (r.user_id=$1 OR (r.org_id = ANY($3::bigint[]) AND EXISTS (SELECT 1 FROM users m WHERE m.id=$1
    AND m.lower_username='smithers-machines' AND m.user_type='service' AND m.prohibit_login AND m.deleted_at IS NULL))))
  OR ($2='org' AND r.org_id=$1)) AND w.deleted_at IS NULL
  AND w.status IN ('pending', 'starting', 'running')
  AND NOT EXISTS (SELECT 1 FROM workspace_children c WHERE c.workspace_id = w.id)
`, userID, sandbox.BillingOwnerFromContext(ctx, userID).Type, sandbox.ServicePayerOrgsFromContext(ctx)).Scan(&count)
	return count, err
}
