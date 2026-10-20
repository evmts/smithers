package services

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/runtimeports"
)

// ownerGateWorker claims one run of a one-job graph in repository 100, which
// user 9 owns, and runs it with owners listed.
func ownerGateWorker(t *testing.T, row runtimeports.ClaimQueuedWorkflowRunsRow, owners *WorkflowOwners) (*mockWorkflowSandboxSchedulerQuerier, *WorkflowSandboxSchedulerWorker, *mockWorkflowSandboxVMClient) {
	t.Helper()
	base := nixCIQuerier([]db.WorkflowTask{nixCITaskRow(1, 11, "build", nil)})
	base.workflowName = "ci"
	guests := &fakeNixCIGuests{polls: map[string]int{}, scripts: map[string]nixCIGuestScript{"build": {exitCode: "0"}}}
	client := guests.client(t)
	worker := NewWorkflowSandboxSchedulerWorker(
		badClaimSchedulerQuerier{mockWorkflowSandboxSchedulerQuerier: base, rows: []runtimeports.ClaimQueuedWorkflowRunsRow{row}},
		client,
		WithWorkflowSandboxSchedulerGitBaseURL("https://git.example.test"),
		WithWorkflowSandboxSchedulerCIGuests(guests),
		WithWorkflowSandboxSchedulerCIPollInterval(time.Millisecond),
		WithWorkflowSandboxSchedulerOwners(owners),
	)
	return base, worker, client
}

// Every trigger's run reaches a machine only through this scheduler's claim:
// push, dispatch, schedules, webhooks, landing and stack events, downstream
// runs, and a rerun or ResumeRun's later claim. An unlisted owner's run is
// refused there, before any machine, with the reason on its first job.
func TestWorkflowSandboxSchedulerRefusesUnlistedOwnersOnEveryTrigger(t *testing.T) {
	staff := &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{1, 24, 60}}}
	for _, trigger := range []string{"push", "workflow_dispatch", "schedule", "pull_request", "issues", "issue_comment", "landing_request", "stack_submit", "workflow_run"} {
		for _, generation := range []int64{1, 2} {
			row := testWorkflowSandboxClaimRow(db.WorkflowRun{ID: 42, RepositoryID: 100, WorkflowDefinitionID: 5, TriggerEvent: trigger, TriggerRef: "main", TriggerCommitSha: "cafebabe"})
			row.ClaimGeneration = generation
			base, worker, client := ownerGateWorker(t, row, staff)

			require.NoError(t, worker.PollOnce(context.Background()))
			assert.Empty(t, client.createCalls, "%s generation %d made a machine", trigger, generation)
			assert.Equal(t, []int64{42}, base.markFailureIDs, trigger)
			assert.Empty(t, base.markSuccessIDs, trigger)
			require.Len(t, base.logInserts, 1, trigger)
			assert.Equal(t, db.InsertWorkflowRunLogNextSequenceParams{
				WorkflowRunID: 42, WorkflowStepID: 11, Stream: "system",
				Entry: "Repository workflows don't run on smithers.sh yet. Run them locally with npx smthrs@next flow start ci.",
			}, base.logInserts[0], trigger)
			assert.Equal(t, []db.UpdateWorkflowStepStatusTerminalParams{{StepID: 11, Status: "failure"}}, base.terminalSteps, trigger)
			for _, event := range base.runNotifies {
				assert.NotContains(t, event.Payload, "workflow_sandbox.running", "a refused run never reports running")
			}
		}
	}
}

// A listed owner's run of an event that runs only members' code boots its
// machine as before.
func TestWorkflowSandboxSchedulerRunsListedOwnersMemberCode(t *testing.T) {
	for _, trigger := range []string{"push", "system_push", "schedule", "workflow_dispatch", "manual_dispatch", "landing_request", "stack_submit", "issues", "issue", "issue_comment", "monitoring_alert"} {
		row := testWorkflowSandboxClaimRow(db.WorkflowRun{ID: 42, RepositoryID: 100, WorkflowDefinitionID: 5, TriggerEvent: trigger, TriggerRef: "main", TriggerCommitSha: "cafebabe"})
		base, worker, client := ownerGateWorker(t, row, &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{1, 9}}})

		require.NoError(t, worker.PollOnce(context.Background()))
		assert.Len(t, client.createCalls, 1, trigger)
		assert.Equal(t, []int64{42}, base.markSuccessIDs, trigger)
		assert.Empty(t, base.markFailureIDs, trigger)
	}
}

// A fork's pull request carries its author's head: on a public repository any
// GitHub user can open one, and a review, check suite or check run of it, or a
// run chained from it, executes the same code. A multitenant deployment
// refuses those for listed owners too, before any machine.
func TestWorkflowSandboxSchedulerRefusesForkPullRequestCodeForListedOwners(t *testing.T) {
	for _, trigger := range []string{"pull_request", "pull_request_review", "check_suite", "check_run", "workflow_run", "workflow_artifact", ""} {
		row := testWorkflowSandboxClaimRow(db.WorkflowRun{ID: 42, RepositoryID: 100, WorkflowDefinitionID: 5, TriggerEvent: trigger, TriggerRef: "feature", TriggerCommitSha: "f0f0f0f"})
		base, worker, client := ownerGateWorker(t, row, &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{1, 9}}})

		require.NoError(t, worker.PollOnce(context.Background()))
		assert.Empty(t, client.createCalls, "%q made a machine", trigger)
		assert.Equal(t, []int64{42}, base.markFailureIDs, trigger)
		require.Len(t, base.logInserts, 1, trigger)
		assert.Equal(t, "Repository workflows don't run on smithers.sh yet. Run them locally with npx smthrs@next flow start ci.", base.logInserts[0].Entry, trigger)
	}
}

// A single-owner install sets no list: every owner's run of every event,
// a pull request's included, boots its machine as before.
func TestWorkflowSandboxSchedulerWithoutAListRunsEveryTrigger(t *testing.T) {
	for _, trigger := range []string{"push", "pull_request", "workflow_run"} {
		row := testWorkflowSandboxClaimRow(db.WorkflowRun{ID: 42, RepositoryID: 100, WorkflowDefinitionID: 5, TriggerEvent: trigger, TriggerRef: "main", TriggerCommitSha: "cafebabe"})
		base, worker, client := ownerGateWorker(t, row, nil)

		require.NoError(t, worker.PollOnce(context.Background()))
		assert.Len(t, client.createCalls, 1, trigger)
		assert.Equal(t, []int64{42}, base.markSuccessIDs, trigger)
	}
}

// An organization's repository runs only if the organization itself is
// listed. Anyone can create an organization and add a staff user as its owner
// without that user's acceptance, so no member or credential owner admits it.
func TestWorkflowSandboxSchedulerAdmitsOrganizationsOnlyByTheirOwnID(t *testing.T) {
	for _, tc := range []struct {
		name        string
		org         int64
		credential  int64
		missing     bool
		wantMachine bool
	}{
		{name: "listed organization", org: 2, credential: 9, wantMachine: true},
		{name: "unlisted org with a staff user as owner is refused", org: 7, credential: 1},
		{name: "unlisted org with no credential owner", org: 7, missing: true},
	} {
		row := testWorkflowSandboxClaimRow(db.WorkflowRun{ID: 42, RepositoryID: 100, WorkflowDefinitionID: 5, TriggerEvent: "push", TriggerRef: "main", TriggerCommitSha: "cafebabe"})
		base, worker, client := ownerGateWorker(t, row, &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{1, 24, 60}}, Orgs: []int64{2, 4}})
		base.getRepoByIDFn = func(context.Context, int64) (db.Repository, error) {
			return db.Repository{ID: 100, Name: "demo", OrgID: pgtype.Int8{Int64: tc.org, Valid: true}}, nil
		}
		base.getOrgByIDFn = func(context.Context, int64) (db.Organization, error) {
			return db.Organization{ID: tc.org, Name: "acme"}, nil
		}
		base.getOrgCredentialOwnerIDFn = func(context.Context, int64) (int64, error) {
			if tc.missing {
				return 0, pgx.ErrNoRows
			}
			return tc.credential, nil
		}

		require.NoError(t, worker.PollOnce(context.Background()))
		if tc.wantMachine {
			assert.Len(t, client.createCalls, 1, tc.name)
			assert.Equal(t, []int64{42}, base.markSuccessIDs, tc.name)
			continue
		}
		assert.Empty(t, client.createCalls, tc.name)
		assert.Equal(t, []int64{42}, base.markFailureIDs, tc.name)
	}
}
