package services

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// Recovery validates an already attached session with one transaction connection.
// Resolving its default bookmark must not borrow a second pool connection.
func TestBranchMachineSessionRecoveryUsesTransactionConnection(t *testing.T) {
	pool := newProductTestPool(t)
	person, repo := setupTestUserAndRepo(t, pool)
	q := db.New(pool)
	row, err := q.CreateWorkspace(t.Context(), db.CreateWorkspaceParams{RepositoryID: repo, UserID: person, TargetBookmark: "main", Kind: "container", Status: "running"})
	require.NoError(t, err)
	sessionID := "33333333-3333-4333-8333-333333333333"
	_, err = q.CreateAgentSession(t.Context(), db.CreateAgentSessionParams{ID: sessionID, RepositoryID: repo, UserID: person, Status: "active"})
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `UPDATE agent_sessions SET workspace_id=$1 WHERE id=$2`, row.ID, sessionID)
	require.NoError(t, err)
	cfg := pool.Config().Copy()
	cfg.MaxConns, cfg.MinConns = 1, 0
	single, err := pgxpool.NewWithConfig(t.Context(), cfg)
	require.NoError(t, err)
	t.Cleanup(single.Close)
	svc := NewWorkspaceService(db.New(single), WithWorkspaceTransactions(single), WithBranchMachineProviders(branchMachineTestProviders()))
	for _, branch := range []string{"", "main", "scratch/other"} {
		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		err := svc.validateBranchMachineSession(ctx, CreateAgentWorkspaceInput{RepositoryID: repo, UserID: person, SessionID: sessionID, SourceBookmark: branch})
		cancel()
		if branch == "scratch/other" {
			require.ErrorContains(t, err, "agent session branch binding denied")
		} else {
			require.NoError(t, err)
		}
	}
}
