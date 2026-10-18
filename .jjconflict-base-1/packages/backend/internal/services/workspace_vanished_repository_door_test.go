package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// vanishedRepositoryRuntime is the vanished-door box whose repository
// preparation calls report the loss. The readiness check still passes, so the
// door under test is the preparation funnel itself.
type vanishedRepositoryRuntime struct {
	*vanishedDoorRuntime
	listErr error
	readErr error
}

func (r *vanishedRepositoryRuntime) ListFiles(ctx context.Context, id, path string) ([]workspaceapi.FileEntry, error) {
	if r.listErr != nil {
		return nil, r.listErr
	}
	return r.vanishedDoorRuntime.ListFiles(ctx, id, path)
}

func (r *vanishedRepositoryRuntime) ReadFile(ctx context.Context, id, path string) ([]byte, error) {
	if r.readErr != nil {
		return nil, r.readErr
	}
	return r.vanishedDoorRuntime.ReadFile(ctx, id, path)
}

// smithers#3954's funnel, left open by that fix and by the cycle-9 review:
// the repository preparation path every start and every adoption runs reports
// a confirmed machine loss through the bare runtimeOperationError, which has
// no loss arm, so it answered
//
//	500 fault=bug "inspect workspace repository root: runtime: workspace not found: …"
//
// — a bug report carrying the marker's own text, for the same production box
// 8bdcfa88-451a-4afe-a341-2be82227c1a5 whose machine vanished under a running
// row. Its neighbours on the very same path already answer the loss with 409
// workspace_vm_missing and the recovery row (workspace_runtime.go's inspect
// and start arms, and the file and runtime doors). This funnel holds the row
// and the requester, so it can give the same answer, and it must.
func TestARepositoryDoorOnAVanishedMachineNamesTheMachine(t *testing.T) {
	vanished := func() error {
		return fmt.Errorf("runtime: %w", errors.Join(workspaceapi.ErrWorkspaceNotFound,
			&sandbox.StatusError{StatusCode: http.StatusNotFound, Code: "not_found", Message: "sandbox resource was not found"}))
	}
	newService := func(runtime *vanishedRepositoryRuntime) *WorkspaceService {
		runtime.vanishedDoorRuntime = &vanishedDoorRuntime{}
		runtime.authorityRuntime = newAuthorityRuntime(workspaceapi.WorkspaceRunning)
		runtime.repositoryID = 101
		runtime.cloneURL = testWorkspaceGitBaseURL + "/alice/demo.git"
		return newWorkspaceServiceForTests(&repositoryIdentityQuerier{}, WithWorkspaceRuntime(runtime))
	}
	row := sampleDBWorkspace("ws-1")
	row.RepositoryID = 101
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

	// The root inspect the preparation runs first: the funnel root#3954 left open.
	t.Run("the repository root inspect", func(t *testing.T) {
		err := newService(&vanishedRepositoryRuntime{listErr: vanished()}).
			ensureRuntimeWorkspaceRepository(context.Background(), row, row.UserID)
		assertMissingVM(t, err)
	})

	// The guard: an infrastructure fault on the same funnel is not a permanent
	// loss and keeps its own typed answer.
	t.Run("a lost worker keeps its own answer", func(t *testing.T) {
		lost := fmt.Errorf("runtime: %w", &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable,
			Code: "host_lease_lost", Message: "The workspace worker is unavailable. Use another workspace, or retry when this worker is available."})
		err := newService(&vanishedRepositoryRuntime{listErr: lost}).
			ensureRuntimeWorkspaceRepository(context.Background(), row, row.UserID)
		failure := apiErrorOf(t, err)
		assert.Equal(t, pkgerrors.CodeHostLeaseLost, failure.Code)
		assert.Equal(t, pkgerrors.FaultInfra, failure.Fault)
	})
}
