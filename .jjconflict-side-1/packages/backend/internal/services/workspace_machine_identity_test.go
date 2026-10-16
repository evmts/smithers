package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// identityStubRuntime is a runtime that names no machine of its own: the
// optional WorkspaceMachineIdentity port is deliberately absent.
type identityStubRuntime struct {
	workspaceapi.WorkspaceRuntime
	isolation workspaceapi.IsolationLevel
}

func (r *identityStubRuntime) Isolation() workspaceapi.IsolationLevel { return r.isolation }

// namedMachineRuntime is the same runtime with the port composed.
type namedMachineRuntime struct {
	identityStubRuntime
	machine string
}

func (r *namedMachineRuntime) WorkspaceMachineIdentity(context.Context, string) (string, error) {
	return r.machine, nil
}

// The machine identity is what the start path writes into workspaces.vm_id,
// and an isolated runtime reads that column back as the name of the guest it
// must reach. The workspace id is the right answer only for a runtime whose
// machine *is* the workspace: a trusted process. For an isolated runtime it is
// an id its machine provider never minted, so every later door answers "no
// such machine" for a placement the controller cannot match, and the claim
// that would have repaired the row only fills an empty vm_id.
//
// Production 2026-10-15T05:15Z: box 1d7209c4-1915-4433-bc2b-c15376574147 held
// a 36-character vm_id with no provider prefix, equal to its own workspace id
// (journeys/continuation12/receipts/67-vmid-shape.json). Its file door
// answered 409 workspace_vm_missing and its DELETE was refused as retained, so
// no supported route could reach, stop or free it.
func TestAnIsolatedRuntimeNeverPublishesTheWorkspaceIDOverItsPlacement(t *testing.T) {
	const id = "1d7209c4-1915-4433-bc2b-c15376574147"
	observed := workspaceapi.Workspace{ID: id, State: workspaceapi.WorkspaceRunning}
	placed := db.Workspace{ID: id, VmID: "msb_placed"}

	unplaced := &mockWorkspaceQuerier{getWorkspaceFn: func(_ context.Context, workspaceID string) (db.Workspace, error) {
		return db.Workspace{ID: workspaceID}, nil
	}}
	isolated := newWorkspaceServiceForTests(unplaced,
		WithWorkspaceRuntime(&identityStubRuntime{isolation: workspaceapi.IsolationSandboxed}))
	machine, err := isolated.runtimeMachineIdentity(context.Background(), placed, observed)
	require.NoError(t, err, "a placement already on the row is the best name this deployment has")
	assert.Equal(t, placed.VmID, machine)
	assert.NotEqual(t, id, machine, "the workspace id is never published as an isolated machine's name")

	// A create takes its placement inside the runtime's call, after this start
	// read the row: the current row is read rather than the box refused.
	created := newWorkspaceServiceForTests(&mockWorkspaceQuerier{
		getWorkspaceFn: func(_ context.Context, workspaceID string) (db.Workspace, error) {
			return db.Workspace{ID: workspaceID, VmID: "msb_just_placed"}, nil
		},
	}, WithWorkspaceRuntime(&identityStubRuntime{isolation: workspaceapi.IsolationSandboxed}))
	machine, err = created.runtimeMachineIdentity(context.Background(), db.Workspace{ID: id}, observed)
	require.NoError(t, err)
	assert.Equal(t, "msb_just_placed", machine)

	// With no placement anywhere, nothing has named a machine and the
	// workspace id stays this port's documented answer: a runtime whose
	// provider mints its own ids refuses in its own port, where the shape of
	// an id is known. The common path does not guess on its behalf — and has
	// nothing to overwrite here either.
	machine, err = isolated.runtimeMachineIdentity(context.Background(), db.Workspace{ID: id}, observed)
	require.NoError(t, err)
	assert.Equal(t, id, machine)

	// A trusted-process runtime is its own machine; its behaviour is unchanged.
	trusted := newWorkspaceServiceForTests(unplaced,
		WithWorkspaceRuntime(&identityStubRuntime{isolation: workspaceapi.IsolationTrustedProcess}))
	machine, err = trusted.runtimeMachineIdentity(context.Background(), db.Workspace{ID: id}, observed)
	require.NoError(t, err)
	assert.Equal(t, id, machine)

	// A runtime that names its machine answers with that name, prefix and all.
	named := newWorkspaceServiceForTests(unplaced, WithWorkspaceRuntime(&namedMachineRuntime{
		identityStubRuntime: identityStubRuntime{isolation: workspaceapi.IsolationSandboxed},
		machine:             "msb_" + id,
	}))
	machine, err = named.runtimeMachineIdentity(context.Background(), placed, observed)
	require.NoError(t, err)
	assert.Equal(t, "msb_"+id, machine)
	assert.NotEqual(t, id, machine)
}

// identityWakeRuntime is an isolated runtime whose machine has a name of its
// own, and which answers the identity port only for an admitted operation —
// as a hosted placement store must, because it resolves the machine through
// the caller's own tenant-fenced row.
type identityWakeRuntime struct {
	workspaceapi.WorkspaceRuntime
	admissionGranting
	machine      string
	bookmark     string
	repositoryID int64
	tenant       string
	asked        int
}

func (*identityWakeRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (*identityWakeRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{PersistentFiles: true, Execution: true, FileOperations: true}
}

func (*identityWakeRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: id, State: workspaceapi.WorkspaceStopped}, nil
}

func (*identityWakeRuntime) StartWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: id, State: workspaceapi.WorkspaceRunning}, nil
}

func (*identityWakeRuntime) ListFiles(_ context.Context, _, dir string) ([]workspaceapi.FileEntry, error) {
	if dir == ".git" {
		return []workspaceapi.FileEntry{{Name: "smithers-workspace-initialization.json"}}, nil
	}
	return []workspaceapi.FileEntry{{Name: ".git", IsDir: true}, {Name: ".jj", IsDir: true}}, nil
}

func (r *identityWakeRuntime) ReadFile(_ context.Context, workspaceID, _ string) ([]byte, error) {
	return json.Marshal(workspaceRepositoryReceipt{Version: workspaceRepositoryReceiptVersion, WorkspaceID: workspaceID,
		RepositoryID: r.repositoryID, CloneURL: testWorkspaceGitBaseURL + "/alice/demo.git", SourceBookmark: r.bookmark,
		SourceRevision: strings.Repeat("a", 40), InitializedAt: time.Now().UTC()})
}

func (*identityWakeRuntime) ExecuteCommand(_ context.Context, _ string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	if len(command.Args) >= 2 && command.Args[0] == "git" && command.Args[1] == "remote" {
		return workspaceapi.CommandResult{Stdout: testWorkspaceGitBaseURL + "/alice/demo.git\n"}, nil
	}
	return workspaceapi.CommandResult{}, nil
}

func (r *identityWakeRuntime) WorkspaceMachineIdentity(ctx context.Context, _ string) (string, error) {
	operation, ok := workspaceapi.OperationFromContext(ctx)
	if !ok || operation.TenantID == "" {
		return "", errors.New("admitted workspace operation identity is required")
	}
	r.asked++
	r.tenant = operation.TenantID
	return r.machine, nil
}

// The wake writes the machine's own name into workspaces.vm_id, and asks for
// it with the operation the start is already admitted under. A hosted runtime
// answers that port out of the caller's tenant-fenced placement row, so a
// context with no admitted operation is the same as no machine: the start
// fails, loudly, instead of publishing a name the machine provider never
// minted.
func TestAWakeWritesTheMachineNameTheRuntimeAnswersWith(t *testing.T) {
	pool := newProductTestPool(t)
	row := runtimeWakeRow(t, pool, "runtime-identity", "suspended", "msb_before")
	runtime := &identityWakeRuntime{machine: "msb_" + row.ID, bookmark: row.TargetBookmark, repositoryID: row.RepositoryID}
	var wrote []db.UpdateWorkspaceExecutionInfoParams
	q := &lostWorkerRuntimeQuerier{mockWorkspaceQuerier: &mockWorkspaceQuerier{
		getWorkspaceFn: func(_ context.Context, id string) (db.Workspace, error) {
			current := row
			current.ID = id
			return current, nil
		},
		updateWorkspaceExecutionInfoFn: func(_ context.Context, arg db.UpdateWorkspaceExecutionInfoParams) (db.Workspace, error) {
			wrote = append(wrote, arg)
			updated := row
			updated.VmID, updated.Status = arg.VmID, arg.Status
			return updated, nil
		},
	}}
	svc := composeRuntimeWake(newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime),
		WithWorkspaceGitBaseURL(testWorkspaceGitBaseURL)), pool, &countedResumePolicy{})

	_, err := svc.ensureRuntimeWorkspaceRunningLocked(context.Background(), row, row.UserID)
	require.NoError(t, err)
	require.Positive(t, runtime.asked, "the wake asks the runtime what its machine is called")
	assert.NotEmpty(t, runtime.tenant, "the identity port is asked under the admitted operation")
	require.NotEmpty(t, wrote, "the wake publishes the machine binding")
	for _, write := range wrote {
		assert.Equal(t, runtime.machine, write.VmID)
		assert.NotEqual(t, row.ID, write.VmID,
			"a row holding its own workspace id sends every later door to a machine the provider never minted")
	}
}
