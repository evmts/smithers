package services

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// narrowedAgentDispatchStore is a store that keeps every AgentDispatchQuerier
// method and loses the optional ones, exactly as a wrapper embedding an
// interface does: productstore.Product has no BeginTx, so
// hostedProductStore{productstore.Product} and Plue's
// sandboxstore.Store{productstore.Product} both answer no to runnerTxStarter.
// This is the worst case #3959's classification reason describes.
type narrowedAgentDispatchStore struct{ AgentDispatchQuerier }

// The open question the cycle-9 review handed to Will: #3959 classified
// runnerTxStarter as a deployment capability, so a store without BeginTx skips
// the transaction that wraps the run log's advisory lock — and the review read
// that as "#3866's lost line is still possible in a hosted deployment".
//
// Read against real PostgreSQL, the review is right: the race is real, and
// the SQL does not close it. InsertWorkflowRunLogNextSequence takes
// `FOR UPDATE` on the run and `pg_advisory_xact_lock(workflow_run_id)` in the
// SAME statement that reads MAX(sequence)+1, and log_state does select FROM
// sequence_lock — but a data dependency only orders the lock before the read
// within one snapshot, and under READ COMMITTED the statement's snapshot is
// fixed before the lock is ever acquired. So a waiter that blocks on the
// advisory lock and proceeds after the winner commits still reads the winner's
// MAX(sequence) as if the winner's row did not exist, and loses
// UNIQUE (workflow_run_id, sequence). `FOR UPDATE`'s EvalPlanQual re-check
// refreshes the locked workflow_runs row only, never the MAX subquery over
// workflow_run_logs. Measured here on PostgreSQL 18.6 at the default READ
// COMMITTED, with the retry below disabled: 23 of 48 concurrent lines died on
// SQLSTATE 23505 and 25 landed. #3866 fixed this by taking the lock in its own
// statement, which only a transaction can do — serialization lives in the Go
// wrapper, not in the SQL.
//
// So this is the regression that proves the boundary instead of asserting it
// from the absence of a type assertion: the SAME concurrent append storm, once
// through a store that HAS BeginTx (the wiring every shipped deployment gets,
// because resolveProductRuntimeStores injects *db.Queries when
// ports.RuntimeStores.AgentDispatch is nil, as Plue's RuntimeStores leaves it)
// and once through a store that has had it narrowed away. Both must keep every
// line and allocate a dense, unique sequence.
func TestConcurrentRunLogAppendersKeepEveryLineWithAndWithoutBeginTx(t *testing.T) {
	pool := getAgentTestPool(t)
	ctx := context.Background()

	queries := db.New(pool)
	_, isStarter := any(queries).(runnerTxStarter)
	require.True(t, isStarter, "*db.Queries is the store resolveProductRuntimeStores injects; it carries the transaction")
	narrowed := &narrowedAgentDispatchStore{AgentDispatchQuerier: queries}
	_, narrowedIsStarter := any(narrowed).(runnerTxStarter)
	require.False(t, narrowedIsStarter, "a store that embeds the interface loses BeginTx, as productstore.Product does")

	const writers, perWriter = 6, 8
	for _, store := range []struct {
		name  string
		store AgentDispatchQuerier
	}{
		{"the store every deployment gets, with BeginTx", queries},
		{"a store whose BeginTx was narrowed away", narrowed},
	} {
		t.Run(store.name, func(t *testing.T) {
			runID, stepID := agentDispatchLogFixture(t, pool)
			service := &AgentService{dispatchQ: store.store}
			var wg sync.WaitGroup
			errs := make(chan error, writers*perWriter)
			for writer := 0; writer < writers; writer++ {
				wg.Add(1)
				go func(writer int) {
					defer wg.Done()
					for i := 0; i < perWriter; i++ {
						_, err := service.insertAgentDispatchFailureLog(ctx, db.InsertWorkflowRunLogNextSequenceParams{
							WorkflowRunID:  runID,
							WorkflowStepID: stepID,
							Stream:         "system",
							Entry:          fmt.Sprintf("writer %d line %d", writer, i),
						})
						if err != nil {
							errs <- err
						}
					}
				}(writer)
			}
			wg.Wait()
			close(errs)
			for err := range errs {
				t.Errorf("an appender lost its line: %v", err)
			}

			// A lost line shows up as a missing row; a lost race shows up as a
			// duplicate or a gap in the sequence the Steps view reads in order.
			var rows, distinct, maxSequence int64
			require.NoError(t, pool.QueryRow(ctx,
				`SELECT COUNT(*), COUNT(DISTINCT sequence), COALESCE(MAX(sequence), 0)
				 FROM workflow_run_logs WHERE workflow_run_id = $1`, runID).
				Scan(&rows, &distinct, &maxSequence))
			assert.Equal(t, int64(writers*perWriter), rows, "every concurrent append keeps its line")
			assert.Equal(t, rows, distinct, "every line gets its own sequence: the transaction's lock, or the retry where there is no transaction")
			assert.Equal(t, rows, maxSequence, "the sequence the Steps view reads in order is dense")
		})
	}
}

func agentDispatchLogFixture(t *testing.T, pool *pgxpool.Pool) (runID, stepID int64) {
	t.Helper()
	ctx := context.Background()
	name := "agent-log-race-" + uuid.NewString()
	var userID, repoID, definitionID int64
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, lower_username, email, lower_email, display_name)
		 VALUES ($1, $1, $2, $2, $1) RETURNING id`, name, name+"@example.test").Scan(&userID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO repositories (user_id, name, lower_name, description, is_public, default_bookmark)
		 VALUES ($1, $2, $2, '', TRUE, 'main') RETURNING id`, userID, name).Scan(&repoID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workflow_definitions (repository_id, name, path, config)
		 VALUES ($1, 'agent', 'flows/agent/flow.ts', '{}') RETURNING id`, repoID).Scan(&definitionID))
	run, err := db.New(pool).CreateWorkflowRun(ctx, db.CreateWorkflowRunParams{
		RepositoryID: repoID, WorkflowDefinitionID: definitionID,
		Status: "queued", TriggerEvent: "agent_message", ExecutionPlane: WorkflowRunPlaneAgent,
	})
	require.NoError(t, err)
	step, err := db.New(pool).CreateWorkflowStep(ctx, db.CreateWorkflowStepParams{
		WorkflowRunID: run.ID, Name: "dispatch", Position: 1, Status: "running",
	})
	require.NoError(t, err)
	return run.ID, step.ID
}
