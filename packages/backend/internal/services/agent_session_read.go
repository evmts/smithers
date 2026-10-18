package services

import (
	"context"
	"encoding/json"

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
	ID     int64  `json:"id"`
	Status string `json:"status"`
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
	var failure struct {
		Code      *string `json:"failure_reason_code"`
		Reason    *string `json:"failure_reason"`
		Retryable bool    `json:"failure_retryable"`
	}
	if err := json.Unmarshal(metadata, &failure); err != nil {
		return err
	}
	result.ReasonCode, result.Reason, result.Retryable = failure.Code, failure.Reason, failure.Retryable
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
	}
	return nil
}
