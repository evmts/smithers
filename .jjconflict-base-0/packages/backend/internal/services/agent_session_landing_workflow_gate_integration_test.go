package services

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// lateWorkflowRuns lets the landing service take a run service built after
// the fixture's database exists.
type lateWorkflowRuns struct{ WorkflowRunService }

// A multitenant deployment refuses an unlisted owner's repository workflow
// runs (ITEM 11), and lane A must not depend on them (PM d-ln8mia). The
// owner's hosted change still opens its GitHub pull request; the
// landing_request run that opening dispatches is refused before any machine,
// with the reason on its job.
func TestUnlistedOwnersHostedChangeOpensItsPullRequestWithTheWorkflowGateOn(t *testing.T) {
	runs := &lateWorkflowRuns{}
	x := newSessionLandingTestFixture(t, WithLandingWorkflowRunService(runs))
	q := db.New(x.pool)
	runs.WorkflowRunService = NewWorkflowRunService(q)
	ctx := context.Background()

	const workflowPath = ".smithers/workflows/ci.tsx"
	def, err := q.UpsertWorkflowDefinition(ctx, db.UpsertWorkflowDefinitionParams{
		RepositoryID: x.f.repoID, Name: "ci", Path: workflowPath,
		Config: json.RawMessage(`{"on":{"landing_request":{}},"jobs":{"build":{"steps":[{"run":"make test"}]}}}`),
	})
	require.NoError(t, err)
	_, err = q.CreateWorkflowTrigger(ctx, db.CreateWorkflowTriggerParams{
		RepositoryID: x.f.repoID, WorkflowDefinitionID: def.ID, WorkflowPath: workflowPath, EventType: "landing_request", Enabled: true,
	})
	require.NoError(t, err)

	reply, err := seedServerCodingResult(t, x.agents, x.pool, ctx, x.session.ID, json.RawMessage(fmt.Sprintf(
		`{"producer":"smithers-server","head_commit":%q,"head_change_id":%q,"test_receipt":{"command":"npm run test","exit_code":0,"commit":%q,"tests_run":2}}`,
		x.head, x.changeID, x.head)))
	require.NoError(t, err)
	opened, err := x.service.Open(ctx, &x.user, "smithers-canary", "smithers", x.session.ID, &reply.ID)
	require.NoError(t, err)
	require.Positive(t, opened.PullNumber)
	require.Equal(t, x.head, x.f.githubRef(opened.Branch))
	require.Len(t, x.f.pullCreates(), 1)

	var runID int64
	var plane, status string
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT id, execution_plane, status FROM workflow_runs WHERE repository_id = $1 AND trigger_event = 'landing_request'`, x.f.repoID).Scan(&runID, &plane, &status))
	require.Equal(t, WorkflowRunPlaneSandbox, plane)
	require.Equal(t, "queued", status)

	guests := &fakeNixCIGuests{polls: map[string]int{}, scripts: map[string]nixCIGuestScript{"build": {exitCode: "0"}}}
	client := guests.client(t)
	worker := NewWorkflowSandboxSchedulerWorker(NewProductWorkflowSandboxScheduler(q), client,
		WithWorkflowSandboxSchedulerGitBaseURL("https://git.example.test"),
		WithWorkflowSandboxSchedulerCIGuests(guests),
		WithWorkflowSandboxSchedulerCIPollInterval(time.Millisecond),
		WithWorkflowSandboxSchedulerOwners(&WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{x.user.ID + 1000}}}),
	)
	require.NoError(t, worker.PollOnce(ctx))
	require.Empty(t, client.createCalls, "a refused run makes no machine")
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT status FROM workflow_runs WHERE id = $1`, runID).Scan(&status))
	require.Equal(t, "failure", status)
	var entry string
	require.NoError(t, x.pool.QueryRow(ctx, `SELECT entry FROM workflow_run_logs WHERE workflow_run_id = $1 AND stream = 'system' ORDER BY id DESC LIMIT 1`, runID).Scan(&entry))
	require.Equal(t, "Repository workflows don't run on smithers.sh yet. Run them locally with npx smthrs@next flow start ci.", entry)
	require.Len(t, x.f.pullCreates(), 1, "the refusal leaves the pull request as it was")
}
