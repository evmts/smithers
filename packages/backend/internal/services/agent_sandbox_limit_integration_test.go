package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// ONE BILLING OWNER, ONE MACHINE, HOWEVER MANY TURNS START AT ONCE (QA
// b-jpt11m, Security d-11j1lz item 9). Two turns one person started four
// seconds apart both passed the unlocked plan check and each built a box;
// each box's coding host start then counted the other and refused, and
// neither turn ran. Now the check and the reservation are one locked step per
// billing owner: of N turns started together against a limit of one, exactly
// one gets a box and runs, and every other is refused with the plan's own
// refusal, retryably, before any box exists.

// sandboxLimitBoxes is the real workspace service over a real product
// database, with the box start replaced: each start records the box's
// workspace row, running, as a join does before its guest boots.
type sandboxLimitBoxes struct {
	*WorkspaceService
	pool     *pgxpool.Pool
	machines int64
	created  atomic.Int32
}

func (b *sandboxLimitBoxes) CheckAgentWorkspaceQuota(context.Context, int64) error { return nil }

func (b *sandboxLimitBoxes) CreateAgentWorkspace(ctx context.Context, input CreateAgentWorkspaceInput) (AgentWorkspaceResult, error) {
	b.created.Add(1)
	id := uuid.NewString()
	if _, err := b.pool.Exec(ctx, `INSERT INTO workspaces (id, repository_id, user_id, name, vm_id, status, agent_session_id)
		VALUES ($1, $2, $3, $4, $5, 'running', $6)`, id, input.RepositoryID, b.machines, "box-"+id[:8], "vm-"+id[:8], input.SessionID); err != nil {
		return AgentWorkspaceResult{}, err
	}
	return AgentWorkspaceResult{WorkspaceID: id, VMID: "vm-" + id[:8]}, nil
}

// lockedFlowDispatcher admits every turn, safely across goroutines.
type lockedFlowDispatcher struct {
	mu       sync.Mutex
	launches []flowdispatch.LaunchRequest
}

func (d *lockedFlowDispatcher) Admit(_ context.Context, request flowdispatch.LaunchRequest) (jobs.RequestReceipt, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.launches = append(d.launches, request)
	return jobs.RequestReceipt{OperationID: "operation-" + request.RequestID, RequestID: request.RequestID, State: jobs.StateAccepted}, nil
}

func (d *lockedFlowDispatcher) CancelRequest(_ context.Context, scope jobs.Scope, _ string) (jobs.Operation, error) {
	return jobs.Operation{Scope: scope, State: jobs.StateCancelled}, nil
}

// sandboxLimitOwner is one billing owner on the free plan (one running
// machine) with a repository and the people who start turns on it.
type sandboxLimitOwner struct {
	pool   *pgxpool.Pool
	repo   int64
	slug   db.GetRepoOwnerSlugAndNameByIDRow
	people []int64
	agent  *AgentService
	boxes  *sandboxLimitBoxes
	flows  *lockedFlowDispatcher
}

func insertSandboxLimitUser(t *testing.T, pool *pgxpool.Pool, name string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (username, lower_username, email, lower_email) VALUES ($1, $1, $1 || '@example.test', $1 || '@example.test') RETURNING id`,
		name).Scan(&id))
	return id
}

// newSandboxLimitOwner builds a person's repository, or, with members > 0,
// an organization's repository and that many members.
func newSandboxLimitOwner(t *testing.T, members int) *sandboxLimitOwner {
	t.Helper()
	ctx := context.Background()
	pool := newProductTestPool(t)
	q := db.New(pool)
	f := &sandboxLimitOwner{pool: pool, flows: &lockedFlowDispatcher{}}
	suffix := uuid.NewString()[:8]
	if members == 0 {
		person := insertSandboxLimitUser(t, pool, "person-"+suffix)
		f.people = []int64{person}
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories (user_id, name, lower_name, default_bookmark) VALUES ($1, 'repo', 'repo', 'main') RETURNING id`, person).Scan(&f.repo))
	} else {
		var org int64
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations (name, lower_name) VALUES ($1, $1) RETURNING id`, "org-"+suffix).Scan(&org))
		for i := 0; i < members; i++ {
			member := insertSandboxLimitUser(t, pool, fmt.Sprintf("member%d-%s", i, suffix))
			_, err := pool.Exec(ctx, `INSERT INTO org_members (organization_id, user_id) VALUES ($1, $2)`, org, member)
			require.NoError(t, err)
			f.people = append(f.people, member)
		}
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories (org_id, name, lower_name, default_bookmark) VALUES ($1, 'repo', 'repo', 'main') RETURNING id`, org).Scan(&f.repo))
	}
	slug, err := q.GetRepoOwnerSlugAndNameByID(ctx, f.repo)
	require.NoError(t, err)
	f.slug = slug
	var machines int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username = 'smithers-machines'`).Scan(&machines))
	billing := NewBillingService(q, nil, BillingServiceConfig{})
	f.boxes = &sandboxLimitBoxes{WorkspaceService: newWorkspaceServiceForTests(q, WithWorkspaceBillingPolicy(billing)), pool: pool, machines: machines}
	f.agent = NewAgentServiceWithPool(q, pool, WithAgentDispatchQuerier(q), WithAgentFlowDispatcher(f.flows),
		WithAgentBillingPolicy(billing), WithAgentHostedCodingUsers(config.HostedCodingUsers{Everyone: true}))
	f.agent.SetWorkspaceBackend(f.boxes)
	return f
}

// turn opens a session for person with one message to answer.
func (f *sandboxLimitOwner) turn(t *testing.T, person int64) DispatchAgentRunInput {
	t.Helper()
	ctx := context.Background()
	session, err := f.agent.CreateSession(ctx, CreateAgentSessionInput{RepositoryID: f.repo, UserID: person, Title: "change"})
	require.NoError(t, err)
	_, err = f.agent.AppendMessage(ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: json.RawMessage(`{"value":"make the change"}`)}})
	require.NoError(t, err)
	return DispatchAgentRunInput{SessionID: session.ID, RepositoryID: f.repo, UserID: person, RepoOwner: f.slug.OwnerSlug, RepoName: f.slug.RepoName}
}

// requireSandboxLimitRefusal checks the refusal a turn gets when its owner's
// one machine is taken: the plan's own refusal, which ends the turn as
// sandbox_limit, retryably.
func requireSandboxLimitRefusal(t *testing.T, err error) {
	t.Helper()
	var refusal *pkgerrors.APIError
	require.ErrorAs(t, err, &refusal)
	require.Equal(t, pkgerrors.CodePlanLimitExceeded, refusal.Code)
	require.Equal(t, "concurrent_sandboxes", refusal.LimitKind)
	require.NotNil(t, refusal.Limit)
	require.Equal(t, 1, *refusal.Limit)
	require.NotEmpty(t, refusal.Message)
	require.True(t, agentSessionFailureForError(err).Retryable, "trying again once the other change finishes can succeed")
}

func TestConcurrentTurnsOfOneBillingOwnerGetExactlyOneMachine(t *testing.T) {
	const starts = 10
	for _, tc := range []struct {
		name    string
		members int
	}{{"a person", 0}, {"an organization with two members", 2}} {
		t.Run(tc.name, func(t *testing.T) {
			f := newSandboxLimitOwner(t, tc.members)
			inputs := make([]DispatchAgentRunInput, starts)
			for i := range inputs {
				inputs[i] = f.turn(t, f.people[i%len(f.people)])
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			results := make([]DispatchAgentRunResult, starts)
			errs := make([]error, starts)
			gate := make(chan struct{})
			var wg sync.WaitGroup
			for i := range inputs {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-gate
					results[i], errs[i] = f.agent.DispatchAgentRun(ctx, inputs[i])
				}()
			}
			close(gate)
			wg.Wait()

			winner := -1
			for i, err := range errs {
				if err == nil {
					require.Equal(t, -1, winner, "a second turn of one owner got a machine: %d and %d", winner, i)
					winner = i
					continue
				}
				requireSandboxLimitRefusal(t, err)
			}
			require.NotEqual(t, -1, winner, "one turn runs")
			require.Equal(t, int32(1), f.boxes.created.Load(), "exactly one box start, never a second for the owner")

			var boxes int
			require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM workspaces WHERE repository_id = $1 AND deleted_at IS NULL`, f.repo).Scan(&boxes))
			require.Equal(t, 1, boxes, "one workspace row holds the owner's one machine")
			var boxSession string
			require.NoError(t, f.pool.QueryRow(ctx, `SELECT agent_session_id::text FROM workspaces WHERE repository_id = $1`, f.repo).Scan(&boxSession))
			require.Equal(t, inputs[winner].SessionID, boxSession, "the box is the winner's")

			// The winner proceeds: its turn is admitted to the coding host and
			// its task runs on the box.
			require.NotZero(t, results[winner].WorkflowRunID)
			require.NotEmpty(t, results[winner].OperationID)
			require.Len(t, f.flows.launches, 1, "only the winner's turn reaches the coding host")
			var taskStatus string
			require.NoError(t, f.pool.QueryRow(ctx, `SELECT status FROM workflow_tasks WHERE id = $1`, results[winner].WorkflowTaskID).Scan(&taskStatus))
			require.Equal(t, "running", taskStatus)

			// Every refused turn stopped before its run, its token or its box:
			// its admission rolled back and its session holds nothing.
			var runs int
			require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM workflow_runs WHERE repository_id = $1`, f.repo).Scan(&runs))
			require.Equal(t, 1, runs, "refused turns leave no run")
			for i, input := range inputs {
				var started bool
				var linked *int64
				require.NoError(t, f.pool.QueryRow(ctx, `SELECT started_at IS NOT NULL, workflow_run_id FROM agent_sessions WHERE id = $1`, input.SessionID).Scan(&started, &linked))
				if i == winner {
					require.True(t, started)
					continue
				}
				require.False(t, started, "a refused turn holds no reservation")
				require.Nil(t, linked, "a refused turn links no run")
			}
		})
	}
}

// A turn whose own box still runs is not refused by that box: the box and
// the session count once, as the turn's own, and another turn of the same
// owner is still refused.
func TestATurnsOwnRunningBoxDoesNotCountAgainstIt(t *testing.T) {
	f := newSandboxLimitOwner(t, 0)
	ctx := context.Background()
	own := f.turn(t, f.people[0])
	other := f.turn(t, f.people[0])
	_, err := f.pool.Exec(ctx, `INSERT INTO workspaces (repository_id, user_id, name, vm_id, status, agent_session_id)
		VALUES ($1, $2, 'own-box', 'vm-own', 'running', $3)`, f.repo, f.boxes.machines, own.SessionID)
	require.NoError(t, err)

	_, err = f.agent.DispatchAgentRun(ctx, other)
	requireSandboxLimitRefusal(t, err)
	_, err = f.agent.DispatchAgentRun(ctx, own)
	require.NoError(t, err, "the turn's own box never counts against it")
}
