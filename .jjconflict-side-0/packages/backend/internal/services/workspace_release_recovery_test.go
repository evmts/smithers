package services

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// hostedLostRuntimeError is the shape a hosted adapter answers an unreadable
// placement with, and the reason a second ErrWorkspaceNotFound is not a stop
// receipt: the ErrWorkspaceNotFound contract admits a typed host_lease_lost
// alongside it, so one sentinel carries a placement that is genuinely gone
// (404) and a worker this deployment cannot reach (410). The service cannot
// tell those apart, and must not treat either as proof the guest is down.
func hostedLostRuntimeError(status int, code string) error {
	return errors.Join(workspaceapi.ErrWorkspaceNotFound,
		&sandbox.StatusError{StatusCode: status, Code: code, Message: "worker is unavailable"})
}

// releaseRecoveryRuntime answers a recovered release's two reads and its stop,
// in the order the reconciler makes them. The first read is the pre-stop one,
// which the reconciler makes to see whether a guest is there at all; state and
// observedID answer it and every read after it. stopErr is what the adapter
// returns from the stop — stopRuntimeWorkspaceLocked tolerates
// ErrWorkspaceStopped and ErrWorkspaceNotFound as success — and confirmErr, if
// set, is what the CONFIRMING read then answers, which is the shape of a host
// that restarted mid-release.
type releaseRecoveryRuntime struct {
	workspaceapi.WorkspaceRuntime
	state      workspaceapi.WorkspaceState
	observedID string
	stopErr    error
	confirmErr error
	onStop     func()
	stops      atomic.Int32
	inspects   atomic.Int32
	stopsDown  bool
}

func (r *releaseRecoveryRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (r *releaseRecoveryRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	if r.inspects.Add(1) > 1 && r.confirmErr != nil {
		return workspaceapi.Workspace{}, r.confirmErr
	}
	observed := id
	if r.observedID != "" {
		observed = r.observedID
	}
	return workspaceapi.Workspace{ID: observed, State: r.state}, nil
}

func (r *releaseRecoveryRuntime) StopWorkspace(context.Context, string) error {
	r.stops.Add(1)
	if r.onStop != nil {
		r.onStop()
	}
	if r.stopsDown {
		r.state, r.confirmErr, r.observedID = workspaceapi.WorkspaceStopped, nil, ""
	}
	return r.stopErr
}

// releaseRecoveryService wires one releasing workspace to the runtime double.
// The returned pointer is the live row every transition writes through, as the
// production store's row is.
func releaseRecoveryService(t *testing.T, id, vmID string, runtime workspaceapi.WorkspaceRuntime) (*WorkspaceService, *db.Workspace) {
	t.Helper()
	ws := sampleDBWorkspace(id)
	ws.Status, ws.VmID = "releasing", vmID
	ws.UpdatedAt = time.Now().Add(-time.Hour)
	q := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: ws}
	current := ws
	q.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) { return current, nil }
	q.updateWorkspaceStatusFn = func(_ context.Context, arg db.UpdateWorkspaceStatusParams) (db.Workspace, error) {
		current.Status = arg.Status
		return current, nil
	}
	return newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime)), &current
}

// A release the host restart interrupted leaves the row 'releasing', and this
// reconciler owns it. Its terminal 'failed' verdict retains vm_id on purpose —
// the disk and the unfinished capture must survive — and 'failed' with no
// cleanup stage is in no backlog (ListWorkspaceProvisioningRecovery), so the
// verdict is also the last moment anything looks at the placement. Published
// over a stop nothing confirmed, it leaves the owner holding that placement
// and its compute reservation for good.
func TestRecoveredReleaseKeepsReleasingWithoutAStopReceipt(t *testing.T) {
	for _, tc := range []struct {
		name       string
		state      workspaceapi.WorkspaceState
		observedID string
		confirmErr error
		evidence   releaseStopEvidence
	}{
		{
			// The defect this test was written for: the hosted adapter's
			// answer for a retired worker is the same sentinel the stop
			// tolerates as success.
			name:       "worker lease lost is not a stop receipt",
			state:      workspaceapi.WorkspaceRunning,
			confirmErr: hostedLostRuntimeError(http.StatusGone, "host_lease_lost"),
			evidence:   releaseStopAbsenceAmbiguous,
		},
		{
			name:       "placement absence is not a stop receipt either",
			state:      workspaceapi.WorkspaceRunning,
			confirmErr: hostedLostRuntimeError(http.StatusNotFound, "not_found"),
			evidence:   releaseStopAbsenceAmbiguous,
		},
		{
			name:       "typed lost worker",
			state:      workspaceapi.WorkspaceRunning,
			confirmErr: &sandbox.StatusError{StatusCode: http.StatusServiceUnavailable, Code: "host_lease_lost"},
			evidence:   releaseStopWorkerLost,
		},
		{
			name:       "read did not complete",
			state:      workspaceapi.WorkspaceRunning,
			confirmErr: context.DeadlineExceeded,
			evidence:   releaseStopUnreadable,
		},
		{
			name:     "guest still running",
			state:    workspaceapi.WorkspaceRunning,
			evidence: releaseStopObservedRunning,
		},
		{
			name:     "guest still starting",
			state:    workspaceapi.WorkspaceStarting,
			evidence: releaseStopObservedStarting,
		},
		{
			name:     "guest still stopping",
			state:    workspaceapi.WorkspaceStopping,
			evidence: releaseStopObservedStopping,
		},
		{
			name:     "guest needs recovery",
			state:    workspaceapi.WorkspaceRecoveryRequired,
			evidence: releaseStopObservedOther,
		},
		{
			name:       "runtime answered for another workspace",
			state:      workspaceapi.WorkspaceStopped,
			observedID: "ws-somebody-else",
			evidence:   releaseStopIdentityMismatch,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runtime := &releaseRecoveryRuntime{
				state: tc.state, observedID: tc.observedID, confirmErr: tc.confirmErr,
				// The stop itself answered the way the adapter answers one it
				// could not confirm, and the service tolerates it.
				stopErr: workspaceapi.ErrWorkspaceNotFound,
			}
			svc, row := releaseRecoveryService(t, "ws-release-unconfirmed", "vm-release-1", runtime)

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, "releasing", row.Status,
				"a guest no receipt says is down must not be written off as a terminal failure")
			require.Equal(t, "vm-release-1", row.VmID, "the placement is retained either way")
			require.Equal(t, int32(1), runtime.stops.Load())

			evidence, err := svc.confirmRecoveredReleaseStop(context.Background(), *row)
			require.Error(t, err, "an unconfirmed stop is the error that keeps the row releasing")
			require.Equal(t, tc.evidence, evidence)

			// 'releasing' is backlogged, so the backlog is the retry: the next
			// tick converges the row the moment a real receipt exists, instead
			// of stranding the capacity behind a terminal verdict. Here the
			// host is readable again and its stop lands.
			runtime.confirmErr, runtime.stopsDown = nil, true
			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, "failed", row.Status,
				"a confirmed stop publishes the interrupted-release verdict on the next tick")
			require.Equal(t, "vm-release-1", row.VmID, "and still retains the disk")
		})
	}
}

// The two receipts. A positive inspected stop is one. The other is the
// product's own record: an owner that binds no placement has no guest to stop
// and no reservation to discharge, so its verdict strands nothing — and it is
// read from the row, never from the adapter sentinel.
func TestRecoveredReleaseFailsTheBranchOnARealReceipt(t *testing.T) {
	for _, tc := range []struct {
		name       string
		vmID       string
		state      workspaceapi.WorkspaceState
		confirmErr error
		evidence   releaseStopEvidence
	}{
		{
			name: "runtime reports the guest stopped", vmID: "vm-release-2",
			state: workspaceapi.WorkspaceStopped, evidence: releaseStopConfirmedStopped,
		},
		{
			// No placement recorded, so the confirming read is not even made:
			// an adapter that answers ErrWorkspaceNotFound here would be
			// answering about nothing.
			name: "owner records no placement", vmID: "",
			confirmErr: hostedLostRuntimeError(http.StatusNotFound, "not_found"),
			evidence:   releaseStopConfirmedUnbound,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runtime := &releaseRecoveryRuntime{state: tc.state, confirmErr: tc.confirmErr}
			svc, row := releaseRecoveryService(t, "ws-release-confirmed", tc.vmID, runtime)
			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Equal(t, "failed", row.Status)
			require.Equal(t, tc.vmID, row.VmID, "the disk and its unfinished capture are retained")

			evidence, err := svc.confirmRecoveredReleaseStop(context.Background(), *row)
			require.NoError(t, err)
			require.Equal(t, tc.evidence, evidence)
		})
	}
}

// fencedReleaseQuerier is the production store's conditional failure write:
// FailWorkspaceIfUnchanged compares the status, the placement and updated_at
// of the row the decision was made from, and answers no rows when a newer
// transition owns it.
type fencedReleaseQuerier struct {
	*rolloutRecoveryQuerier
	live  *db.Workspace
	fence []db.FailWorkspaceIfUnchangedParams
}

func (q *fencedReleaseQuerier) FailWorkspaceIfUnchanged(_ context.Context, arg db.FailWorkspaceIfUnchangedParams) (db.Workspace, error) {
	q.fence = append(q.fence, arg)
	if arg.ID != q.live.ID || arg.ExpectedStatus != q.live.Status ||
		arg.ExpectedVmID != q.live.VmID || !arg.ExpectedUpdatedAt.Equal(q.live.UpdatedAt) {
		return db.Workspace{}, pgx.ErrNoRows
	}
	q.live.Status = "failed"
	q.live.FailureCode = pgtype.Text{String: arg.FailureCode, Valid: true}
	q.live.UpdatedAt = time.Now()
	return *q.live, nil
}

// The confirmed verdict is still compare-and-set. A release that reads the row,
// confirms the stop, and then finds a newer transition must publish nothing:
// that transition owns the row, and the fence is what stops this reconciler
// from stomping a branch somebody resumed in the meantime.
func TestRecoveredReleaseVerdictIsFencedOnTheExactRowItRead(t *testing.T) {
	for _, tc := range []struct {
		name    string
		advance func(*db.Workspace)
		status  string
		failed  bool
	}{
		{name: "nothing moved", advance: func(*db.Workspace) {}, status: "failed", failed: true},
		{name: "a newer transition resumed it", status: "running",
			advance: func(row *db.Workspace) { row.Status = "running"; row.UpdatedAt = time.Now() }},
		{name: "a newer transition replaced the placement", status: "releasing",
			advance: func(row *db.Workspace) { row.VmID = "vm-release-next"; row.UpdatedAt = time.Now() }},
		{name: "only updated_at moved", status: "releasing",
			advance: func(row *db.Workspace) { row.UpdatedAt = time.Now() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ws := sampleDBWorkspace("ws-release-fenced")
			ws.Status, ws.VmID = "releasing", "vm-release-3"
			ws.UpdatedAt = time.Now().Add(-time.Hour)
			live := ws
			rollout := &rolloutRecoveryQuerier{mockWorkspaceQuerier: provisioningTestQuerier(nil), workspace: ws}
			q := &fencedReleaseQuerier{rolloutRecoveryQuerier: rollout, live: &live}
			rollout.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) {
				return live, nil
			}
			// The reconciler decides from the row it read before the stop; the
			// concurrent transition lands while that stop is in flight.
			runtime := &releaseRecoveryRuntime{state: workspaceapi.WorkspaceStopped}
			runtime.onStop = func() { tc.advance(&live) }
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime))

			require.NoError(t, svc.ReconcileWorkspaceProvisioning(context.Background()))
			require.Len(t, q.fence, 1, "exactly one fenced write is attempted")
			require.Equal(t, "releasing", q.fence[0].ExpectedStatus)
			require.Equal(t, "vm-release-3", q.fence[0].ExpectedVmID)
			require.Equal(t, tc.status, live.Status)
			if tc.failed {
				require.Equal(t, "conflict", live.FailureCode.String)
			} else {
				require.False(t, live.FailureCode.Valid, "the newer transition's row is untouched")
			}
		})
	}
}
