package services

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/machined"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/testdb"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// ADMIN STOP DECIDES ITS VERDICT BEFORE ANY SIDE EFFECT (plue#839).
//
// On 2026-10-18 an operator could not stop 13 leaked guests through
// POST /api/admin/workspaces/{id}/stop. Each was a branch machine written off
// `failed` with its guest still bound, so the stop entered capture-and-sleep:
// it stopped the flow host and the head reporter, and only then read the
// status and refused "branch is not awake". The guests kept running until
// they were stopped at the controller by hand.

// verdictRuntime is the guest runtime double. It stops its one guest and
// counts every call capture-and-sleep makes, so a refusal can be shown to
// have reached nothing.
type verdictRuntime struct {
	*interruptedReleaseRuntime
	inspects     atomic.Int32
	serviceStops atomic.Int32
	fences       atomic.Int32
}

func (r *verdictRuntime) InspectWorkspace(ctx context.Context, id string) (workspaceapi.Workspace, error) {
	r.inspects.Add(1)
	return r.interruptedReleaseRuntime.InspectWorkspace(ctx, id)
}

func (r *verdictRuntime) StopService(context.Context, string, string) error {
	r.serviceStops.Add(1)
	return nil
}

func (r *verdictRuntime) WithCaptureWritersExcluded(ctx context.Context, _ string, fn func(context.Context) error) error {
	r.fences.Add(1)
	return fn(ctx)
}

func (r *verdictRuntime) calls() int32 {
	return r.stops.Load() + r.deletes.Load() + r.snapshots.Load() + r.inspects.Load() + r.serviceStops.Load() + r.fences.Load()
}

// verdictHeads and verdictCapture compose the capture seams; nothing these
// tests reach reads a head, and a capture refuses.
type verdictHeads struct{ workspaceSnapshotStore }

type verdictCapture struct{}

func (verdictCapture) Capture(context.Context, string) (machined.CaptureResult, error) {
	return machined.CaptureResult{}, errors.New("capture refused by the test double")
}

type adminStopVerdict struct {
	pool     *pgxpool.Pool
	admin    *AdminManageService
	service  *WorkspaceService
	runtime  *verdictRuntime
	guest    *interruptedReleaseGuest
	prepares atomic.Int32
	machines int64
	repo     int64
	ctx      context.Context
}

// newAdminStopVerdict composes the admin service over the real store, the
// real workspace service and a real product database. The machine service
// owns every branch machine it seeds, as in production.
func newAdminStopVerdict(t *testing.T) *adminStopVerdict {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	pool, err := postgresfixture.Open(ctx, testdb.NewFromTemplate(t, productTemplateName(t)).URL, 8)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	f := &adminStopVerdict{pool: pool, ctx: ctx}
	f.guest = &interruptedReleaseGuest{state: workspaceapi.WorkspaceRunning, disk: "retained-working-copy"}
	f.runtime = &verdictRuntime{interruptedReleaseRuntime: &interruptedReleaseRuntime{guest: f.guest}}
	f.service = realStoreReconciler(t, pool, f.runtime, newCorePoolDutyRecorder())
	// Production composes every branch machine provider; each admits here.
	f.service.branchMachineProviders = BranchMachineProviders{
		Membership:      func(context.Context, pgx.Tx, int64, int64) error { return nil },
		Authorize:       func(context.Context, pgx.Tx, string, int64, string, int64) error { return nil },
		LaneBinding:     func(context.Context, pgx.Tx, int64, string, string) error { return nil },
		MicroVM:         func(context.Context) error { return nil },
		SessionIdentity: func(context.Context) error { return nil },
	}
	// So are the capture seams. Capture itself refuses, so a running branch
	// goes as far as its capture and is put back.
	f.service.branchHeads = verdictHeads{}
	f.service.branchCapture = verdictCapture{}
	f.service.SetFlowHostCapturePreparation(func(context.Context, string) error {
		f.prepares.Add(1)
		return nil
	})
	q := db.New(pool)
	f.admin = NewAdminManageService(q, nil, f.service)
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&f.machines))
	f.repo = realRepository(t, pool, "verdict").ID
	operator, err := q.CreateUser(ctx, db.CreateUserParams{Username: "verdict-admin", LowerUsername: "verdict-admin", DisplayName: "Admin"})
	require.NoError(t, err)
	f.ctx = ContextWithAdminAuditActor(ctx, AdminAuditActor{UserID: operator.ID, Username: operator.Username})
	return f
}

// branchMachine seeds one machine-owned workspace in the given state.
func (f *adminStopVerdict) branchMachine(t *testing.T, status, vm, failure string) db.Workspace {
	t.Helper()
	id := uuid.NewString()
	var code, message *string
	if failure != "" {
		conflict := string(pkgerrors.CodeConflict)
		code, message = &conflict, &failure
	}
	_, err := f.pool.Exec(f.ctx, `INSERT INTO workspaces
		(id, repository_id, user_id, name, kind, vm_id, provisioning_generation, status, failure_code, failure_message, provisioning_stage)
		VALUES ($1,$2,$3,$4,'container',$5,3,$6,$7,$8,'')`,
		id, f.repo, f.machines, "verdict-"+id[:8], vm, status, code, message)
	require.NoError(t, err)
	row, err := db.New(f.pool).GetWorkspace(f.ctx, id)
	require.NoError(t, err)
	return row
}

func (f *adminStopVerdict) audits(t *testing.T, id string) []string {
	t.Helper()
	rows, err := f.pool.Query(f.ctx, `SELECT metadata->>'outcome' FROM audit_log WHERE event_type='admin.workspace.stop' AND target_name=$1 ORDER BY id`, id)
	require.NoError(t, err)
	outcomes, err := pgxCollectStrings(rows)
	require.NoError(t, err)
	return outcomes
}

func pgxCollectStrings(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}) ([]string, error) {
	defer rows.Close()
	var out []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, rows.Err()
}

func requireConflict(t *testing.T, err error) {
	t.Helper()
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api)
	require.Equal(t, 409, api.Status, "verdict: %v", err)
}

// `failed` with a bound guest stops that guest through the retained-guest
// stop the reconciler drives, with its confirmed receipt, and calls nothing
// capture-and-sleep would.
func TestAdminStopOfAFailedBranchMachineStopsItsRetainedGuest(t *testing.T) {
	f := newAdminStopVerdict(t)
	row := f.branchMachine(t, "failed", "vm-verdict-door", workspaceRepositoryAdvertisementUnverifiedMessage)
	door, listed := retainedGuestStopPending(row)
	require.True(t, listed)

	result, err := f.admin.StopWorkspace(f.ctx, row.ID)
	require.NoError(t, err, "the operator could not stop a failed branch machine's guest")
	require.Equal(t, "failed", result.Status, "the failed verdict is kept, not re-decided")

	require.Equal(t, int32(1), f.runtime.stops.Load(), "the retained guest was not stopped")
	require.Equal(t, workspaceapi.WorkspaceStopped, f.guest.state)
	require.Zero(t, f.prepares.Load(), "a failed branch stopped its flow host")
	require.Zero(t, f.runtime.serviceStops.Load(), "a failed branch stopped its head reporter")
	require.Zero(t, f.runtime.fences.Load(), "a failed branch entered the capture fence")
	require.Zero(t, f.runtime.deletes.Load(), "a stop deleted the guest")
	require.Zero(t, f.runtime.snapshots.Load(), "a stop invented a capture")
	after, err := db.New(f.pool).GetWorkspace(f.ctx, row.ID)
	require.NoError(t, err)
	require.Equal(t, "failed", after.Status)
	require.Equal(t, "vm-verdict-door", after.VmID, "the placement stays bound")
	require.Equal(t, door.confirmed, after.FailureMessage.String, "no receipt records the confirmed stop")
	require.Equal(t, []string{"attempted", "succeeded"}, f.audits(t, row.ID))

	// The receipt takes the row out of the cohort: a second stop is refused
	// and reaches nothing.
	_, err = f.admin.StopWorkspace(f.ctx, row.ID)
	requireConflict(t, err)
	_, err = f.service.StopRetainedGuest(f.ctx, row.ID)
	requireConflict(t, err)
	require.Equal(t, int32(1), f.runtime.stops.Load())
}

// Every other state is refused with 409 before any runtime call and before
// the audit row an operation writes.
func TestAdminStopRefusesEveryOtherStateWithoutARuntimeCall(t *testing.T) {
	f := newAdminStopVerdict(t)
	for _, tc := range []struct{ name, status, vm, failure string }{
		{"pending", "pending", "vm-pending", ""},
		{"starting", "starting", "vm-starting", ""},
		{"releasing", "releasing", "vm-releasing", ""},
		{"suspended", "suspended", "vm-suspended", ""},
		{"stopped", "stopped", "vm-stopped", ""},
		{"running without a guest", "running", "", ""},
		{"failed without a guest", "failed", "", workspaceRepositoryAdvertisementUnverifiedMessage},
		{"failed outside every retained-guest door", "failed", "vm-other-failure", "the start failed for another reason"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			row := f.branchMachine(t, tc.status, tc.vm, tc.failure)
			before, prepared := f.runtime.calls(), f.prepares.Load()
			_, err := f.admin.StopWorkspace(f.ctx, row.ID)
			requireConflict(t, err)
			require.Equal(t, before, f.runtime.calls(), "a refused stop called the runtime")
			require.Equal(t, prepared, f.prepares.Load(), "a refused stop stopped a flow host")
			require.Empty(t, f.audits(t, row.ID), "a refused stop was recorded as an operation")
			after, err := db.New(f.pool).GetWorkspace(f.ctx, row.ID)
			require.NoError(t, err)
			require.Equal(t, tc.status, after.Status)
		})
	}
}

// `running` with a guest takes capture-and-sleep, as before.
func TestAdminStopOfARunningBranchMachineTakesCaptureAndSleep(t *testing.T) {
	f := newAdminStopVerdict(t)
	row := f.branchMachine(t, "running", "vm-running", "")
	_, _ = f.admin.StopWorkspace(f.ctx, row.ID)
	require.Equal(t, int32(1), f.prepares.Load(), "a running branch did not prepare its flow host for capture")
	require.Equal(t, int32(1), f.runtime.serviceStops.Load(), "a running branch did not stop its head reporter before capture")
	require.Equal(t, []string{"attempted"}, f.audits(t, row.ID)[:1])
}

// Capture-and-sleep itself reads the status first: a branch that is not
// awake is refused before its flow host or head reporter is touched.
func TestCaptureAndSleepRefusesABranchThatIsNotAwakeBeforeAnySideEffect(t *testing.T) {
	f := newAdminStopVerdict(t)
	for _, status := range []string{"failed", "pending", "starting", "releasing"} {
		t.Run(status, func(t *testing.T) {
			row := f.branchMachine(t, status, "vm-"+status, "")
			before, prepared := f.runtime.calls(), f.prepares.Load()
			requireConflict(t, f.service.captureAndSleep(f.ctx, row, false))
			require.Equal(t, before, f.runtime.calls(), "capture-and-sleep called the runtime for a branch that is not awake")
			require.Equal(t, prepared, f.prepares.Load(), "capture-and-sleep stopped the flow host of a branch that is not awake")
		})
	}
	for _, status := range []string{"suspended", "stopped"} {
		t.Run(status, func(t *testing.T) {
			row := f.branchMachine(t, status, "vm-"+status, "")
			before, prepared := f.runtime.calls(), f.prepares.Load()
			require.NoError(t, f.service.captureAndSleep(f.ctx, row, false), "an asleep branch is already captured")
			require.Equal(t, before, f.runtime.calls())
			require.Equal(t, prepared, f.prepares.Load())
		})
	}
}
