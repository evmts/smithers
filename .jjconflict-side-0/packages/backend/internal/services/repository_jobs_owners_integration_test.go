package services

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A repository job runs its registration's checks as shell on a box, so a
// multitenant deployment runs repository jobs only for the item 11 owners
// (gate 2b). An unlisted owner's admitted event is skipped with the typed
// reason and launches nothing; a listed owner's launches as before. A run
// admitted earlier gets no host once its owner is unlisted.
func TestRepositoryJobsRunOnlyForWorkflowOwnersPostgres(t *testing.T) {
	for _, listed := range []bool{false, true} {
		pool, _, service, gateway, input := repositoryJobFixture(t)
		ctx := context.Background()
		registration, err := service.Register(ctx, "gateway", "token", "issues", input)
		require.NoError(t, err)
		unlisted := &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{gateway.target.UserID + 1000}}}
		owners := unlisted
		if listed {
			owners = &WorkflowOwners{Users: config.HostedWorkspaceUsers{UserIDs: []int64{gateway.target.UserID}}}
		}
		service.RunOnlyForWorkflowOwners(owners)

		repositoryJobAdmit(t, service, gateway.target.RepositoryID, fmt.Sprintf("owners-%t", listed), 41, "issues", "opened")
		repositoryJobPoll(t, service, gateway)
		var dispatchID, status, message string
		require.NoError(t, pool.QueryRow(ctx, `SELECT id, status, error FROM repository_job_dispatches WHERE registration_id = $1`, registration.ID).Scan(&dispatchID, &status, &message))
		if !listed {
			require.Equal(t, "skipped", status)
			require.Equal(t, "repository_jobs_unavailable: Repository jobs don't run on smithers.sh yet.", message)
			require.Empty(t, gateway.launches, "no flow launched, so no check ran")
			continue
		}
		require.NotEqual(t, "skipped", status)
		require.Len(t, gateway.launches, 1)

		service.RunOnlyForWorkflowOwners(unlisted)
		resolver, err := NewRepositoryJobFlowHostTargetResolver(service)
		require.NoError(t, err)
		_, err = resolver.ResolveFlowHostTarget(ctx, flowruntime.FlowRuntimeTarget{
			TenantID: fmt.Sprintf("repository:%d", gateway.target.RepositoryID), PrincipalID: fmt.Sprintf("user:%d", gateway.target.UserID),
			BindingKind: repositoryJobFlowBindingKind, BindingID: dispatchID,
		})
		var failure repositoryJobFlowFailure
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "repository_jobs_unavailable", failure.code)
		require.False(t, failure.retryable)
		current, err := service.q.GetRepositoryJobRegistration(ctx, registration.ID)
		require.NoError(t, err)
		_, err = service.admitRepositoryJobLaunch(ctx, current, db.RepositoryJobDispatch{ID: dispatchID})
		require.ErrorIs(t, err, errRepositoryJobsUnavailable)
	}
}
