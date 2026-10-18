package db

import "context"

// MayViewWorkflowRun is also used before authentication-only run transports:
// a private turn and a missing ID must both be 404, including for visitors.
func (q *Queries) MayViewWorkflowRun(ctx context.Context, runID, viewerID int64) (bool, error) {
	var visible bool
	err := q.db.QueryRow(ctx, `SELECT COALESCE(may_view_workflow_run($1, $2), false)`, runID, viewerID).Scan(&visible)
	return visible, err
}

// WorkflowRunRepository reuses the existing repository permission resolver in
// the public preflight; ordinary private runs must not become an ID oracle.
func (q *Queries) WorkflowRunRepository(ctx context.Context, runID int64) (Repository, error) {
	var repositoryID int64
	if err := q.db.QueryRow(ctx, `SELECT repository_id FROM workflow_runs WHERE id=$1`, runID).Scan(&repositoryID); err != nil {
		return Repository{}, err
	}
	return q.GetRepoByID(ctx, repositoryID)
}
