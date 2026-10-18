package flowdispatch

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/stretchr/testify/require"
)

type workspaceRecordingRuntime struct {
	*recordingRuntime
	workspace string
}

func (r *workspaceRecordingRuntime) RuntimeWorkspaceID() string { return r.workspace }

func TestAgentWorkspaceCheckpointSurvivesReconnect(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(map[bool]string{false: "new", true: "legacy blank checkpoint"}[legacy], func(t *testing.T) {
			store, pool := newFlowDispatchStore(t)
			runtime := &workspaceRecordingRuntime{recordingRuntime: newRecordingRuntime(), workspace: "22222222-2222-4222-8222-222222222222"}
			projector := &recordingProjector{}
			service, err := New(Config{Store: store, Resolver: flowruntime.ResolverFunc(func(_ context.Context, target flowruntime.Target) (flowruntime.Runtime, error) {
				require.True(t, target.WorkspaceID == "" || target.WorkspaceID == runtime.workspace)
				return runtime, nil
			}), Projector: projector, ObservationDelay: time.Millisecond})
			require.NoError(t, err)
			request := testLaunchRequest("workspace", ApprovalAuto)
			receipt, err := service.Admit(t.Context(), request)
			require.NoError(t, err)
			if legacy {
				// A pre-upgrade dispatch already accepted on the host, with no workspace
				// in its durable checkpoint. Reconnect must fill it without relaunching.
				runtime.status = "running"
				cp := RuntimeCheckpoint{Version: 1, Target: request.Target, FlowID: request.FlowID, Projection: request.Projection, RunID: "run-1", Identity: runtime.identity}
				cp.Target.TenantID = request.Scope.TenantID
				cp.Target.PrincipalID = request.Scope.PrincipalID
				_, err = pool.Exec(t.Context(), `UPDATE product_job_dispatches SET external_receipt=$2 WHERE operation_id=$1`, receipt.OperationID, mustJSON(cp))
				require.NoError(t, err)
			}
			startTestWorker(t, service, "workspace")
			op := waitOperation(t, store, request.Scope, receipt.OperationID, func(op jobs.Operation) bool { return op.State.Terminal() })
			require.Equal(t, jobs.StateCompleted, op.State, string(op.TerminalReceipt))
			var cp RuntimeCheckpoint
			require.NoError(t, json.Unmarshal(op.ExternalReceipt, &cp))
			require.Equal(t, runtime.workspace, cp.Target.WorkspaceID)
			runtime.mu.Lock()
			require.GreaterOrEqual(t, runtime.observeCount, 2, "must reconnect through the saved workspace")
			if legacy {
				require.Empty(t, runtime.launches)
			}
			runtime.mu.Unlock()
			projector.mu.Lock()
			defer projector.mu.Unlock()
			for _, update := range projector.updates {
				require.Equal(t, runtime.workspace, update.Checkpoint.Target.WorkspaceID)
			}
		})
	}
}

func TestAgentResolvedWorkspaceCannotReplacePinnedWorkspace(t *testing.T) {
	store, _ := newFlowDispatchStore(t)
	runtime := &workspaceRecordingRuntime{recordingRuntime: newRecordingRuntime(), workspace: "22222222-2222-4222-8222-222222222222"}
	service, err := New(Config{Store: store, Resolver: flowruntime.ResolverFunc(func(context.Context, flowruntime.Target) (flowruntime.Runtime, error) { return runtime, nil })})
	require.NoError(t, err)
	request := testLaunchRequest("workspace-replaced", ApprovalAuto)
	request.Target.WorkspaceID = "33333333-3333-4333-8333-333333333333"
	receipt, err := service.Admit(t.Context(), request)
	require.NoError(t, err)
	startTestWorker(t, service, "workspace-replaced")
	op := waitOperation(t, store, request.Scope, receipt.OperationID, func(op jobs.Operation) bool { return op.State.Terminal() })
	require.Equal(t, jobs.StateFailed, op.State)
	require.Contains(t, string(op.TerminalReceipt), "runtime_workspace_replaced")
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	require.Empty(t, runtime.launches)
}
