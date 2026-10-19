package services

import (
	"context"
	"encoding/json"
	"errors"
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

// readAgentSessionFailure follows lane B's persisted failure metadata contract.
// Missing keys remain null; retryable defaults to false for old sessions.
func readAgentSessionFailure(metadata json.RawMessage, result *AgentSessionResponse) error {
	if len(metadata) == 0 {
		return nil
	}
	// Metadata predates these fields and remains repository-authored JSON.
	// Unknown shapes or field types carry no typed failure; they must not
	// prevent an old session from being read.
	var failure map[string]any
	if err := json.Unmarshal(metadata, &failure); err != nil {
		var mismatch *json.UnmarshalTypeError
		if errors.As(err, &mismatch) {
			return nil
		}
		return err
	}
	if code, ok := failure["failure_reason_code"].(string); ok {
		result.ReasonCode = &code
	}
	if reason, ok := failure["failure_reason"].(string); ok {
		result.Reason = &reason
	}
	result.Retryable, _ = failure["failure_retryable"].(bool)

	return nil
}

func (s *AgentService) enrichSessionRead(ctx context.Context, row db.GetAgentSessionWithMessageCountRow, result *AgentSessionResponse) error {
	if err := readAgentSessionFailure(row.Metadata, result); err != nil {
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
