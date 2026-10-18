package services

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"encoding/json"
	"github.com/smithersai/smithers/packages/backend/credits"
	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/modelprice"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
)

// A TODO run records the model access it used (engineering spec §15.2.1): the
// model_usage rows on its branch machine. The card names each provider, payer
// and model, first used first, and ignores other machines' calls.
func TestTodoCardNamesTheModelAccessItsRunUsed(t *testing.T) {
	pool := newProductTestPool(t)
	ctx := context.Background()
	var userID, repoID int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username) VALUES('owner','owner') RETURNING id`).Scan(&userID))
	_, err := pool.Exec(ctx, `INSERT INTO self_host_owners(singleton,user_id) VALUES(true,$1)`, userID)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES($1,'repo','repo') RETURNING id`, userID).Scan(&repoID))
	q := db.New(pool)
	_, err = q.RequestMythicalBootstrap(ctx, repoID, userID, 1, false)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE mythical_stacks SET state='active' WHERE repository_id=$1`, repoID)
	require.NoError(t, err)
	s := NewMythicalService(pool, nil)
	ctx = middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &db.User{ID: userID}, SessionHash: "session"})
	ctx = registerTestInstallCredential(t, pool, ctx, repoID)
	_, err = s.FileTodo(ctx, repoID, userID, MythicalTodoInput{Title: "One", Prompt: "Change the README", Request: "one"})
	require.NoError(t, err)

	machine, other := uuid.NewString(), uuid.NewString()
	owner := modelproxy.OwnerMeter{DB: pool, DailyTokens: func(context.Context, int64) (int64, error) { return 1_000_000, nil }}
	record := func(workspace, model string, otherRun ...bool) {
		step := "own-root:" + strings.Repeat("a", 64)
		if len(otherRun) > 0 && otherRun[0] {
			step = "other-root:" + strings.Repeat("b", 64)
		}
		caller := modelproxy.Caller{OwnerType: "user", OwnerID: userID, UserID: userID, Source: modelproxy.SourceFlowHost,
			RepositoryID: repoID, WorkspaceID: workspace, Reference: "host", NativeStep: step}
		call := modelproxy.Call{Provider: "vercel", Model: model, Maximum: modelprice.Usage{InputTokens: 100, OutputTokens: 64}}
		require.NoError(t, owner.Execute(ctx, caller, call, func(context.Context) (modelproxy.Result, error) {
			return modelproxy.Result{Outcome: credits.ModelSucceeded, Usage: modelprice.Usage{InputTokens: 9, OutputTokens: 1}, Status: 200}, nil
		}))
	}
	record(machine, "openai/gpt-5.1")
	record(machine, "anthropic/claude-sonnet-4.5")
	record(machine, "openai/gpt-5.1")
	record(other, "openai/gpt-4.1")
	record(machine, "openai/unrelated-run", true)
	// A Smithers-credit call on the same machine, as the metered proxy records it.
	var account, reservation int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO credit_accounts(owner_type, owner_id) VALUES ('user', $1) RETURNING id`, userID).Scan(&account))
	key := uuid.NewString()
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO credit_reservations(account_id, request_key, reserved_nanos) VALUES ($1, $2, 1) RETURNING id`, account, key).Scan(&reservation))
	_, err = pool.Exec(ctx, `INSERT INTO model_usage(request_key, credit_account_id, reservation_id, owner_type, owner_id, source,
		repository_id, workspace_id, provider, model, native_step) VALUES ($1, $2, $3, 'user', $4, 'flow_host', $5, $6, 'cerebras', 'gpt-oss-120b', $7)`,
		key, account, reservation, userID, repoID, machine, "own-root:"+strings.Repeat("a", 64))
	require.NoError(t, err)
	// The paid_by check keeps credit columns and payer consistent.
	_, err = pool.Exec(ctx, `INSERT INTO model_usage(request_key, paid_by, owner_type, owner_id, source, provider, model)
		VALUES ($1, 'credit', 'user', $2, 'app', 'openai', 'gpt-6-sol')`, uuid.NewString(), userID)
	require.ErrorContains(t, err, "model_usage_paid_by_check")

	// Before a run there is no model access.
	card, err := s.Todo(ctx, repoID, 1)
	require.NoError(t, err)
	require.Empty(t, card["evidence"])

	_, err = pool.Exec(ctx, `UPDATE mythical_items SET workspace_id=$2, attempt=1, request_run_id='own-root' WHERE repository_id=$1 AND number=1`, repoID, machine)
	require.NoError(t, err)
	// Only the native monitor is supplied here; metering, ownership checks,
	// retention and card reads use production PostgreSQL paths.
	s.SetTodoRunEvidence(func(ctx context.Context, repository int64, cp flowdispatch.RuntimeCheckpoint) (*TodoRunEvidence, error) {
		models, err := q.MythicalRunModelAccess(ctx, repository, cp.Target.WorkspaceID, []string{"own-root:" + strings.Repeat("a", 64)})
		return &TodoRunEvidence{Tokens: 30, TimeS: 2.5, Models: models}, err
	})
	item, err := q.GetMythicalItemByNumber(ctx, repoID, 1)
	require.NoError(t, err)
	projection, _ := json.Marshal(mythicalProjection{Kind: mythicalBindingKind, ItemID: uuidString(item.ID), Attempt: 1, Generation: item.Generation, Phase: "request"})
	require.NoError(t, s.ProjectFlowRuntime(ctx, flowdispatch.ProjectionUpdate{State: jobs.StateRunning, Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: "own-root", Run: &flowruntime.FlowRuntimeRun{RunID: "own-root", Status: "running"}, Projection: projection, Target: flowruntime.Target{TenantID: fmt.Sprintf("repository:%d", repoID), WorkspaceID: machine}}}))
	card, err = s.Todo(ctx, repoID, 1)
	require.NoError(t, err)
	require.Equal(t, []todoAttemptEvidence{{Attempt: 1, RunID: "own-root", Items: []map[string]any{{"kind": "usage", "tokens": int64(30), "time_s": 2.5}, {"kind": "model_access",
		"label": "AI Gateway · owner key: openai/gpt-5.1, anthropic/claude-sonnet-4.5; Cerebras · Smithers credit: gpt-oss-120b"}}}}, card["evidence"])

	retained := card["evidence"]
	record(machine, "openai/later-call")
	card, err = s.Todo(ctx, repoID, 1)
	require.NoError(t, err)
	require.Equal(t, retained, card["evidence"], "card reads never recompute a retained run snapshot from a changing machine")
}

func TestModelAccessLabel(t *testing.T) {
	require.Empty(t, modelAccessLabel(nil))
	require.Equal(t, "OpenRouter · owner key: anthropic/claude-sonnet-4.5; moonshot · granted: kimi-k3", modelAccessLabel([]db.ModelAccess{
		{PaidBy: "owner", Provider: "openrouter", Model: "anthropic/claude-sonnet-4.5"},
		{PaidBy: "granted", Provider: "moonshot", Model: "kimi-k3"},
	}))
}
