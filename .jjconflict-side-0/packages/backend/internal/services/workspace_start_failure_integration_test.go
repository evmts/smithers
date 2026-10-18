package services

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// A WORKSPACE START THAT FAILS SAYS WHY BEFORE IT IS REAPED (CEO d-eixaew).
//
// Production 2026-10-18 22:28Z, deep canary workspace 6437d2a2, vm
// msb_639e0c21: the start failed, the API's reap then timed out on the
// controller's /stop (context deadline exceeded), the controller logged
// nothing for that VM, and no start error was recorded anywhere a person or an
// operator could read.

// startFailureRuntime is a guest runtime whose controller or worker refuses
// the start, and whose controller does not answer the reap's stop in time.
type startFailureRuntime struct {
	*interruptedReleaseRuntime
	db        *db.Queries
	vm        string
	createErr error
	startErr  error
}

func (r *startFailureRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{}
}

// CreateWorkspace places the guest and, as hosted admission does, publishes
// its vm id on the row before the guest is started.
func (r *startFailureRuntime) CreateWorkspace(ctx context.Context, spec workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
	if r.createErr != nil {
		return workspaceapi.Workspace{}, r.createErr
	}
	if _, err := r.db.UpdateWorkspaceExecutionInfo(ctx, db.UpdateWorkspaceExecutionInfoParams{ID: spec.ID, VmID: r.vm, Status: "starting"}); err != nil {
		return workspaceapi.Workspace{}, err
	}
	return workspaceapi.Workspace{ID: spec.ID, State: workspaceapi.WorkspaceStopped}, nil
}

func (r *startFailureRuntime) StartWorkspace(context.Context, string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{}, r.startErr
}

func TestAFailedWorkspaceStartRecordsWhyBeforeItsReap(t *testing.T) {
	// The refusal text carries credentials, as an adapter's error can.
	const secretURL = "https://ops:hunter2-not-a-real-password@worker-7.internal/v1/boot"
	const secretToken = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"
	for _, tc := range []struct {
		name      string
		createErr error
		startErr  error
		stage     string
		reason    string
		code      string
	}{
		{
			name:      "the controller refuses the create",
			createErr: &sandbox.StatusError{StatusCode: 500, Code: "provisioning_failed", Message: "controller refused the guest: POST " + secretURL + " token " + secretToken},
			stage:     "create",
			reason:    "controller refused the guest",
			code:      "internal",
		},
		{
			name:     "the worker refuses the start",
			startErr: &sandbox.StatusError{StatusCode: 500, Code: "internal", Message: "worker could not boot the guest: GET " + secretURL + " Authorization: Bearer " + secretToken},
			stage:    "start",
			reason:   "worker could not boot the guest",
			code:     "internal",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			pool := newProductTestPool(t)
			q := db.New(pool)
			userID, repoID := setupTestUserAndRepo(t, pool)
			id := uuid.NewString()
			_, err := pool.Exec(ctx, `INSERT INTO workspaces (id, repository_id, user_id, name, kind, provisioning_generation, status, provisioning_stage)
				VALUES ($1,$2,$3,$4,'container',1,'pending','')`, id, repoID, userID, "start-"+id[:8])
			require.NoError(t, err)
			row, err := q.GetWorkspace(ctx, id)
			require.NoError(t, err)
			guest := &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning}
			runtime := &startFailureRuntime{
				interruptedReleaseRuntime: &interruptedReleaseRuntime{guest: guest, stopErrs: []error{context.DeadlineExceeded}},
				db:                        q, vm: "msb_639e0c21-5042-4a04-8a33-69bf6d17a2de",
				createErr: tc.createErr, startErr: tc.startErr,
			}
			svc := realStoreReconciler(t, pool, runtime, newCorePoolDutyRecorder())
			var logs bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
			t.Cleanup(func() { slog.SetDefault(previous) })

			unlock := svc.lockRuntimeWorkspace(id)
			_, startErr := svc.ensureRuntimeWorkspaceRunningLocked(ctx, row, userID)
			unlock()
			require.Error(t, startErr)

			require.Equal(t, int32(1), runtime.stops.Load(), "the failed start is reaped")
			failed, err := q.GetWorkspace(ctx, id)
			require.NoError(t, err)
			require.Equal(t, "failed", failed.Status)
			require.Equal(t, tc.code, failed.FailureCode.String, "the row keeps the start's code")
			require.Contains(t, failed.FailureMessage.String, tc.reason, "the row says why the start failed")
			require.Equal(t, workspaceStartCleanupPending, failed.ProvisioningStage, "a reap that timed out is still owed, and erased nothing")
			for _, secret := range []string{"hunter2-not-a-real-password", secretToken} {
				require.NotContains(t, failed.FailureMessage.String, secret, "the row never holds a credential")
				require.NotContains(t, logs.String(), secret, "the log never holds a credential")
			}

			var line string
			for _, candidate := range strings.Split(logs.String(), "\n") {
				if strings.Contains(candidate, `msg="workspace start failed"`) {
					line = candidate
				}
			}
			require.NotEmpty(t, line, "one structured line records the start failure:\n%s", logs.String())
			require.Contains(t, line, "workspace_id="+id)
			require.Contains(t, line, "stage="+tc.stage)
			require.Contains(t, line, "failure_code="+tc.code)
			require.Contains(t, line, tc.reason)
			if tc.createErr == nil {
				require.Contains(t, line, "vm_id="+runtime.vm)
			}
			reap := strings.Index(logs.String(), "failed to reap failed workspace start")
			require.Greater(t, reap, strings.Index(logs.String(), line), "the reason is recorded before the reap")
		})
	}
}
