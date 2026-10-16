package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// vanishedDoorRuntime is a box the readiness check finds running and whose next
// call reports the loss: the machine vanished BETWEEN the two. Its first
// inspect answers, every later one is the confirmed loss, so the readiness
// check that #3912 fixed passes and the door behind it is the one under test.
type vanishedDoorRuntime struct {
	*authorityRuntime
	inspects    atomic.Int64
	vanished    error
	accountErr  error
	servicesErr error
}

func (r *vanishedDoorRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	if r.inspects.Add(1) > 1 && r.vanished != nil {
		return workspaceapi.Workspace{}, r.vanished
	}
	return r.authorityRuntime.InspectWorkspace(ctx, id)
}

func (r *vanishedDoorRuntime) ExecuteCommand(ctx context.Context, id string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	if r.accountErr != nil {
		return workspaceapi.CommandResult{}, r.accountErr
	}
	return r.authorityRuntime.ExecuteCommand(ctx, id, command)
}

func (r *vanishedDoorRuntime) ListServices(context.Context, string) ([]workspaceapi.ServiceObservation, error) {
	if r.servicesErr != nil {
		return nil, r.servicesErr
	}
	return nil, nil
}

// smithers#3954. The file doors answer a confirmed machine loss with the
// recovery row; every other door on an already ready box still flattened it to
// 500 fault=bug carrying the marker's own text ("inspect workspace runtime:
// workspace not found: …"). The coding door is the agent chain's own: a
// dispatch resolves the guest layout before it runs anything, so a box whose
// machine vanished after the readiness check answered the turn behind it with a
// bug report instead of the one answer that has a route out — 409
// workspace_vm_missing with WorkspaceRecoveryDetails, which apps/app consumes.
func TestARuntimeDoorOnAVanishedMachineNamesTheMachine(t *testing.T) {
	vanished := func() error {
		return fmt.Errorf("runtime: %w", errors.Join(workspaceapi.ErrWorkspaceNotFound,
			&sandbox.StatusError{StatusCode: http.StatusNotFound, Code: "not_found", Message: "sandbox resource was not found"}))
	}
	newService := func(runtime *vanishedDoorRuntime) *WorkspaceService {
		runtime.authorityRuntime = newAuthorityRuntime(workspaceapi.WorkspaceRunning)
		runtime.repositoryID = 101
		runtime.cloneURL = testWorkspaceGitBaseURL + "/alice/demo.git"
		return newWorkspaceServiceForTests(&repositoryIdentityQuerier{}, WithWorkspaceRuntime(runtime))
	}
	assertMissingVM := func(t *testing.T, err error) {
		t.Helper()
		failure := apiErrorOf(t, err)
		assert.Equal(t, pkgerrors.CodeWorkspaceVMMissing, failure.Code)
		assert.Equal(t, http.StatusConflict, failure.Status)
		assert.NotContains(t, failure.Message, "workspace not found", "the sentence is the machine's loss, not a marker's text")
		assert.Contains(t, failure.Message, "create", "the sentence names the action that helps")
		details, ok := failure.Details.(WorkspaceRecoveryDetails)
		require.True(t, ok, "a missing machine carries its recovery details, got %#v", failure.Details)
		assert.True(t, details.CreateFresh)
	}

	// The guest layout every runtime command resolves first: coding, dispatch,
	// SSH connection info and operation undo all go through it.
	t.Run("the coding door's guest layout", func(t *testing.T) {
		_, err := newService(&vanishedDoorRuntime{vanished: vanished()}).
			ReadCodingRevisions(context.Background(), "ws-1", 101, 1, nil)
		assertMissingVM(t, err)
	})

	// The account half of the same layout, which SSH connection info and the
	// toolchain bootstrap read. Both reach it behind a mutation and a sandbox
	// placement, so the seam is where the classification is worth pinning.
	t.Run("the guest account read", func(t *testing.T) {
		service := newService(&vanishedDoorRuntime{accountErr: vanished()})
		_, err := service.workspaceGuestLayout(context.Background(), sampleDBWorkspace("ws-1"), 1)
		assertMissingVM(t, err)
	})

	t.Run("the service listing", func(t *testing.T) {
		_, err := newService(&vanishedDoorRuntime{servicesErr: vanished()}).
			ListWorkspaceServices(context.Background(), "ws-1", 101, 1)
		assertMissingVM(t, err)
	})

	// The guard: an infrastructure fault is not a permanent loss. A retired
	// worker keeps its own typed answer and its "retry elsewhere" sentence.
	t.Run("a lost worker keeps its own answer", func(t *testing.T) {
		lost := fmt.Errorf("runtime: %w", &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable,
			Code: "host_lease_lost", Message: "The workspace worker is unavailable. Use another workspace, or retry when this worker is available."})
		_, err := newService(&vanishedDoorRuntime{servicesErr: lost}).
			ListWorkspaceServices(context.Background(), "ws-1", 101, 1)
		failure := apiErrorOf(t, err)
		assert.Equal(t, pkgerrors.CodeHostLeaseLost, failure.Code)
		assert.Equal(t, pkgerrors.FaultInfra, failure.Fault)
	})
}
