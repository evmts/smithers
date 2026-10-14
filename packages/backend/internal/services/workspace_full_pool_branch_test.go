package services

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
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

// A dispatched agent turn names no workspace size: CreateAgentWorkspace builds
// its CreateWorkspaceInput without Resources, because a branch machine's size
// belongs to the branch, not the turn. The create path's size check resolved
// an unnamed size through resolveWorkspaceResources, so "no preference" read
// as "exactly this deployment's default" and any branch machine of another
// size answered
//
//	workspace <id> exists with different resources; delete it or choose another name
//
// A branch machine is the only machine its repository has, so neither option
// exists. Production 2026-10-14 10:31Z, API 464674fb: workspace 1d7209c4 was
// running at 1 vCPU — the only shape the full fleet could place — and session
// aaf35487's turn was refused by this and nothing else. smithers#3877.
func TestAnUnsizedTurnTakesTheBranchMachineAsItIs(t *testing.T) {
	sized := sizedWorkspace("container", 1, 4096, 32768)
	service := newWorkspaceServiceForTests(resourceIdentityStore(), WithWorkspaceResources(4096, 2))

	require.NoError(t, service.refuseJoinedMachineSizeMismatch(sized, CreateWorkspaceInput{JoinsAnyMachineSize: true}),
		"a dispatched turn joins the machine the branch has")

	// Everything else keeps the contract exactly as it was.
	var api *pkgerrors.APIError
	require.ErrorAs(t, service.refuseJoinedMachineSizeMismatch(sized, CreateWorkspaceInput{}), &api,
		"an ordinary create that names no size still gets this deployment's default, or a refusal")
	assert.Equal(t, 409, api.Status)
	require.ErrorAs(t, service.refuseJoinedMachineSizeMismatch(sized, CreateWorkspaceInput{Resources: WorkspaceResources{CPUs: resourcePtr(4)}}), &api,
		"a request that names a size never silently reuses another")
	require.NoError(t, service.refuseJoinedMachineSizeMismatch(sized, CreateWorkspaceInput{Resources: WorkspaceResources{CPUs: resourcePtr(1)}}),
		"naming the size the machine already has is no mismatch")
}

// The flag above is only worth anything if the dispatch path sets it, so
// assert the wiring against a real sized branch machine rather than the
// helper alone. The attach that follows fails on the absent session row; the
// size check is what must not be the refusal.
func TestAgentWorkspaceJoinIsNotRefusedByTheBranchMachinesSize(t *testing.T) {
	f := newBranchMachineFixture(t)
	const branch = "sized/main"
	sized := f.machine(t, db.CreateWorkspaceParams{
		TargetBookmark: branch, Status: "running",
		VcpuCount: pgtype.Int4{Int32: 1, Valid: true},
		MemoryMb:  pgtype.Int4{Int32: 4096, Valid: true},
		DiskMb:    pgtype.Int4{Int32: 32768, Valid: true},
	})
	f.exec(t, `UPDATE workspaces SET vm_id='vm-sized' WHERE id=$1`, sized.ID)

	const session = "11111111-1111-4111-8111-111111111111"
	f.exec(t, `INSERT INTO agent_sessions (id, repository_id, user_id, status) VALUES ($1,$2,$3,'active')`,
		session, f.repo, f.user)

	runtime := &fullPoolRuntime{deadPrimaryRuntime{state: workspaceapi.WorkspaceRunning}}
	svc := f.service(nil, WithWorkspaceRuntime(runtime), WithWorkspaceResources(4096, 2))

	_, err := svc.CreateAgentWorkspace(context.Background(), CreateAgentWorkspaceInput{
		RepositoryID: f.repo, UserID: f.user, SourceBookmark: branch, SessionID: session,
	})
	if err != nil {
		require.NotContains(t, err.Error(), "exists with different resources",
			"a dispatched turn names no size, so the branch machine's own size cannot refuse it")
		require.NotContains(t, err.Error(), "agent session binding denied",
			"the fixture must reach the size check it is about")
	}
}

// A full pool is a deferral, not a failure (#3874) — but a deferral that
// records NOTHING is indistinguishable from a wedged box. Production
// 2026-10-14: workspace a8eb95e2 sat on `Waking` for more than fifteen
// minutes after an explicit open, with the worker logging ERROR `async
// workspace provisioning failed` every 20-25 s and the row carrying no stage,
// no reason and no queue place, so the cause read as UNCLASSIFIED to an
// operator reading production.
//
// waitForMachine, which owns the waiting_for_machine stage and the
// "Waiting for a machine · #2" place, cannot reach a hosted deployment at all:
// it needs the runtime to satisfy workspaceMachineQueue (Request /
// CancelAdmission / AdmissionSnapshot), which only the in-process
// microsandbox.Runtime does. The hosted runtime's admission queue is the
// controller's, out of process, so `queue, ok := ...; if !ok { return cause }`
// returns immediately and the stage is never written.
//
// So the asynchronous provisioner records the deferral itself, on the one
// field the workspace response already carries.
func TestAFullPoolRecordsTheWaitItLeavesTheBoxIn(t *testing.T) {
	full := &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "no_capacity", Message: "no healthy worker has sufficient capacity"}

	t.Run("a box with no guest records the wait and stays startable", func(t *testing.T) {
		f := newBranchMachineFixture(t)
		machine := f.machine(t, db.CreateWorkspaceParams{TargetBookmark: "deferred/main", Status: "starting"})
		require.Empty(t, machine.VmID, "nothing is created before the pool answers")
		svc := f.service(nil)

		svc.provisionWorkspaceAsyncWithStart(context.Background(), machine, CreateWorkspaceSessionInput{},
			func(context.Context, db.Workspace, CreateWorkspaceSessionInput) (db.Workspace, error) {
				return db.Workspace{}, runtimeOperationError("inspect workspace runtime", full)
			})
		require.NoError(t, svc.WaitForProvisioning(context.Background()))

		after, err := f.q.GetWorkspace(context.Background(), machine.ID)
		require.NoError(t, err)
		assert.NotEqual(t, "failed", after.Status, "a full pool is never a terminal verdict (#3874)")
		assert.Equal(t, workspaceWaitingForMachine, after.ProvisioningStage,
			"a queued box says it is waiting for a machine; without this the card is an unexplained 'Waking'")
	})

	t.Run("the wait is retired when the box actually runs", func(t *testing.T) {
		f := newBranchMachineFixture(t)
		machine := f.machine(t, db.CreateWorkspaceParams{TargetBookmark: "retired/main", Status: "starting"})
		svc := f.service(nil)
		svc.setWorkspaceProvisioningStageBestEffort(context.Background(), machine.ID, workspaceWaitingForMachine)

		deferred, err := f.q.GetWorkspace(context.Background(), machine.ID)
		require.NoError(t, err)
		require.Equal(t, workspaceWaitingForMachine, deferred.ProvisioningStage)

		svc.provisionWorkspaceAsyncWithStart(context.Background(), deferred, CreateWorkspaceSessionInput{},
			func(ctx context.Context, row db.Workspace, _ CreateWorkspaceSessionInput) (db.Workspace, error) {
				running, runErr := f.q.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{ID: row.ID, Status: "running"})
				return running, runErr
			})
		require.NoError(t, svc.WaitForProvisioning(context.Background()))

		after, err := f.q.GetWorkspace(context.Background(), machine.ID)
		require.NoError(t, err)
		assert.Equal(t, "running", after.Status)
		assert.Empty(t, after.ProvisioningStage, "a box that runs is not waiting for a machine")
	})

	t.Run("a stage another path owns is never overwritten by a success", func(t *testing.T) {
		f := newBranchMachineFixture(t)
		machine := f.machine(t, db.CreateWorkspaceParams{TargetBookmark: "owned-stage/main", Status: "starting"})
		svc := f.service(nil)

		svc.clearFullPoolDeferral(context.Background(), db.Workspace{ID: machine.ID, ProvisioningStage: "environment_setup"})

		after, err := f.q.GetWorkspace(context.Background(), machine.ID)
		require.NoError(t, err)
		assert.Empty(t, after.ProvisioningStage,
			"the row is untouched: clearFullPoolDeferral writes nothing for a stage it did not set")
	})
}
