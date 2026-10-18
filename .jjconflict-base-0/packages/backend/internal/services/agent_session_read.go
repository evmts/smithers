package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// AgentSessionWorkspace is the session's agent box, which can belong to the payer.
type AgentSessionWorkspace struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// AgentSessionRun identifies the latest turn's flow run.
type AgentSessionRun struct {
	ID         int64      `json:"id"`
	Status     string     `json:"status"`
	Model      *string    `json:"model"`
	StartedAt  *time.Time `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
}

type agentSessionReadStore interface {
	GetWorkspace(context.Context, string) (db.Workspace, error)
	GetWorkflowRun(context.Context, db.GetWorkflowRunParams) (db.WorkflowRun, error)
}

func (s *AgentService) enrichSessionRead(ctx context.Context, row db.GetAgentSessionWithMessageCountRow, result *AgentSessionResponse) error {
	if err := s.enrichSessionStage(ctx, row, result); err != nil {
		return err
	}
	store, ok := s.q.(agentSessionReadStore)
	if !ok {
		return nil
	}
	if row.WorkspaceID.Valid {
		workspace, err := store.GetWorkspace(ctx, UUIDString(row.WorkspaceID))
		if err != nil {
			return err
		}
		// Follow the session's binding, not the requesting person's workspace list.
		if workspace.RepositoryID == row.RepositoryID {
			result.Workspace = &AgentSessionWorkspace{ID: workspace.ID, Name: workspace.Name, Status: workspace.Status}
		}
	}
	if row.WorkflowRunID.Valid {
		run, err := store.GetWorkflowRun(ctx, db.GetWorkflowRunParams{ID: row.WorkflowRunID.Int64, RepositoryID: row.RepositoryID})
		if err != nil {
			return err
		}
		result.Run = &AgentSessionRun{ID: run.ID, Status: run.Status}
		if run.StartedAt.Valid && !run.StartedAt.Time.IsZero() {
			result.Run.StartedAt = &run.StartedAt.Time
		}
		if run.CompletedAt.Valid && !run.CompletedAt.Time.IsZero() {
			result.Run.FinishedAt = &run.CompletedAt.Time
		}
		var metadata map[string]any
		// Legacy metadata with another shape has no known model.
		if json.Unmarshal(row.Metadata, &metadata) == nil {
			if model, ok := metadata["model"].(string); ok {
				result.Run.Model = &model
			}
		}
	}
	return nil
}

// Read the latest user message through the session/sequence index, then its
// scoped request through the same unique key as jobs.Store.GetByRequest. One
// snapshot keeps a concurrent claim from mixing queued stage and started state.
func (s *AgentService) enrichSessionStage(ctx context.Context, row db.GetAgentSessionWithMessageCountRow, result *AgentSessionResponse) error {
	if s.messagePool == nil {
		return nil
	}
	var state string
	var accepted time.Time
	var position *int64
	err := s.messagePool.QueryRow(ctx, `
 WITH turn AS (
  SELECT id, created_at FROM agent_messages
  WHERE session_id=$1 AND role='user' ORDER BY sequence DESC LIMIT 1
 )
 SELECT request.state, turn.created_at,
  CASE WHEN request.state='accepted' AND dispatch.status='ready' THEN (
   SELECT count(*) FROM product_job_dispatches ahead
   WHERE ahead.status='ready'
    AND (ahead.next_attempt_at, ahead.operation_id) <= (dispatch.next_attempt_at, dispatch.operation_id)
  ) END
 FROM turn
 JOIN product_job_requests request
  ON request.tenant_id=$2 AND request.principal_id=$3
  AND request.operation=$4 AND request.request_id='agent-message:' || turn.id::text
 LEFT JOIN product_job_dispatches dispatch ON dispatch.operation_id=request.id
 WHERE request.state IN ('accepted','dispatching')`, row.ID,
		fmt.Sprintf("repository:%d", row.RepositoryID), fmt.Sprintf("user:%d", row.UserID), agentMessageDispatchOperation).Scan(&state, &accepted, &position)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if state == "accepted" {
		result.Stage = "queued"
		result.QueuedAt = &accepted
		result.QueuePosition = position
	} else {
		result.Stage = "started"
	}
	return nil
}
