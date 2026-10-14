package services

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A repository has exactly one machine per bookmark, and a failed machine is
// retained: the join refuses it (branchMachineCompatible) and the start
// answers "create a fresh workspace" (ensureRuntimeWorkspaceRunningLocked).
// Both are right for a machine that holds something. Neither is survivable for
// a machine a BUSY POOL failed, because the pool clears itself in seconds and
// the branch has no second machine to create instead.
//
// runtimeOperationError recognised only the runtime's own microVM-count
// refusal and flattened the hosted runtime's typed no_capacity 503 into
// Internal(op + ": " + err). Everything that keeps a full pool non-terminal
// keys off that type, so the type loss alone turned "the pool is busy" into a
// terminal verdict. Production 2026-10-14, repository 112345, branch machine
// 5c21a98a:
//
//	failure_message: inspect workspace runtime: microsandbox api returned
//	                 status 503 (no_capacity): no healthy Microsandbox worker
//	                 has sufficient capacity
//
// which is that Internal() call, verbatim. smithers#3874.
func TestAFullPoolNeverFailsTheBranchMachineTerminally(t *testing.T) {
	full := &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "no_capacity", Message: "no healthy worker has sufficient capacity"}
	require.True(t, isNoCapacityError(full), "the fixture is the refusal the hosted runtime answers")

	t.Run("the refusal stays typed through the runtime boundary", func(t *testing.T) {
		mapped := runtimeOperationError("inspect workspace runtime", full)
		require.True(t, isNoCapacityError(mapped),
			"a start that cannot tell a full pool from a broken runtime fails the row terminally")
		var api *pkgerrors.APIError
		require.ErrorAs(t, mapped, &api)
		assert.Equal(t, workspaceNoCapacityMessage, api.Message,
			"the person reads the product's sentence, not the provider's")
		assert.Same(t, error(full), api.Cause(), "the provider refusal is kept for the log")

		assert.False(t, isNoCapacityError(runtimeOperationError("inspect workspace runtime", errors.New("timeout"))),
			"an ordinary runtime failure is still a failure")
	})

	t.Run("a busy pool leaves the machine startable", func(t *testing.T) {
		f := newBranchMachineFixture(t)
		const branch = "full-pool/main"
		machine := f.machine(t, db.CreateWorkspaceParams{TargetBookmark: branch, Status: "starting"})
		require.Empty(t, machine.VmID, "nothing is created before the pool answers")

		runtime := &fullPoolRuntime{deadPrimaryRuntime{state: workspaceapi.WorkspaceRunning, createFn: func(context.Context, workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
			return workspaceapi.Workspace{}, full
		}}}
		svc := f.service(nil, WithWorkspaceRuntime(runtime))

		_, err := svc.ensureRuntimeWorkspaceRunningLocked(context.Background(), machine, f.user)
		require.Error(t, err)
		assert.True(t, isNoCapacityError(err), "the caller learns the pool is full, retryably")

		after, getErr := f.q.GetWorkspace(context.Background(), machine.ID)
		require.NoError(t, getErr)
		assert.NotEqual(t, "failed", after.Status,
			"a terminal verdict strands the branch: the join then refuses it as retained and the start answers \"create a fresh workspace\", which a branch cannot have")

		// The machine is still joinable, which is the whole point.
		joined, joinErr := svc.findOrCreatePrimaryWorkspace(context.Background(), f.repo, f.user, "", branch, workspaceCreateMetadata{})
		require.NoError(t, joinErr)
		assert.Equal(t, machine.ID, joined.ID)
	})
}

// fullPoolRuntime is deadPrimaryRuntime with the capability answer a start
// consults; the probe double stops short of one.
type fullPoolRuntime struct{ deadPrimaryRuntime }

func (*fullPoolRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{}
}
