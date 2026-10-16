package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/runtimeports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// WorkspaceProvisioningReconcileInterval is how often the provisioning
// reconciler re-drives workspaces and sessions a rollout left pending.
const WorkspaceProvisioningReconcileInterval = 5 * time.Second

// WorkspaceProvisioningDrainTimeout bounds the shutdown join of detached
// provisioning goroutines: one full provisioning attempt plus margin.
const WorkspaceProvisioningDrainTimeout = workspaceProvisionTimeout + time.Minute

var errWorkspaceProvisionInProgress = errors.New("workspace provisioning is owned by another API")

// workspaceProvisionInProgress keeps the sentinel for internal callers and
// answers synchronous API callers with a retryable 503.
func workspaceProvisionInProgress(cause error) error {
	err := fmt.Errorf("%w: %w", errWorkspaceProvisionInProgress, pkgerrors.GuestNotReady("workspace is provisioning; retry shortly"))
	if cause != nil {
		return errors.Join(err, cause)
	}
	return err
}

type workspaceProvisionTasks struct {
	slots  chan struct{}
	wg     sync.WaitGroup
	active sync.Map
}

func newWorkspaceProvisionTasks() *workspaceProvisionTasks {
	return &workspaceProvisionTasks{slots: make(chan struct{}, 4)}
}

// trackProvision registers a detached provisioning goroutine so shutdown can
// join it. The returned func must be called when the goroutine exits.
func (s *WorkspaceService) trackProvision() func() {
	if s.provisionTasks == nil {
		return func() {}
	}
	s.provisionTasks.wg.Add(1)
	return s.provisionTasks.wg.Done
}

type workspaceRecoveryQueries interface {
	ListWorkspaceProvisioningRecovery(context.Context) ([]db.ListWorkspaceProvisioningRecoveryRow, error)
	CompletePendingWorkspaceSessions(context.Context, string) ([]string, error)
}

func (s *WorkspaceService) durableProvisioning() bool {
	_, durable := s.q.(workspaceRecoveryQueries)
	return durable
}

// WaitForProvisioning joins detached provisioning goroutines. HTTP shutdown
// cannot see them, so the process joins them before closing the database pool.
func (s *WorkspaceService) WaitForProvisioning(ctx context.Context) error {
	if s == nil || s.provisionTasks == nil {
		return nil
	}
	done := make(chan struct{})
	go func() { s.provisionTasks.wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// WithWorkspaceTransactions lets the service hold a workspace's provisioning
// lock across processes. Without it provisioning is serialized per process.
func WithWorkspaceTransactions(transactions RepositoryJobTransactions) WorkspaceServiceOption {
	return func(s *WorkspaceService) { s.transactions = transactions }
}

// Ownership is a database connection's advisory transaction lock, so an API
// crash releases it immediately. Row age is never evidence of failure.
func (s *WorkspaceService) withWorkspaceProvisionLock(ctx context.Context, workspace db.Workspace, fn func(db.Workspace) (db.Workspace, error)) (db.Workspace, error) {
	if s.transactions == nil || s.provisionTasks == nil {
		return fn(workspace)
	}
	// Keep ownership connections below the pool's query budget.
	select {
	case s.provisionTasks.slots <- struct{}{}:
		defer func() { <-s.provisionTasks.slots }()
	case <-ctx.Done():
		return workspace, ctx.Err()
	}
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return workspace, workspaceProvisionInProgress(err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	acquired, err := db.New(tx).TryLockWorkspaceProvisioning(ctx, workspace.ID)
	if err != nil {
		return workspace, err
	}
	if !acquired {
		return workspace, workspaceProvisionInProgress(nil)
	}
	current, err := s.q.GetWorkspace(ctx, workspace.ID)
	if err != nil {
		return workspace, err
	}
	if current.DeletedAt.Valid {
		return current, pgx.ErrNoRows
	}
	return fn(current)
}

// ReconcileWorkspaceProvisioning re-drives workspaces left pending or starting
// by a stopped API and completes sessions waiting on a running workspace.
func (s *WorkspaceService) ReconcileWorkspaceProvisioning(ctx context.Context) error {
	q, ok := s.q.(workspaceRecoveryQueries)
	if !ok {
		return nil
	}
	rows, err := q.ListWorkspaceProvisioningRecovery(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		ws, err := s.q.GetWorkspace(ctx, row.ID)
		if err != nil {
			continue
		}
		if ws.Status == "failed" && ws.ProvisioningStage == workspaceStartCleanupPending {
			if err := s.reconcileFailedWorkspaceStart(ctx, ws); err != nil {
				slog.Warn("failed workspace cleanup retry failed", "workspace_id", ws.ID, "error", err)
			}
			continue
		}
		if interruptedReleaseStopPending(ws) {
			// The diagnostic is the outcome's finite fields, never the error:
			// see interruptedReleaseStopOutcome.
			if outcome, err := s.reconcileInterruptedReleaseStop(ctx, ws); err != nil {
				slog.Warn("interrupted release stop retry failed", outcome.logArgs(ws.ID)...)
			}
			continue
		}
		if ws.Status == "releasing" {
			if err := s.reconcileWorkspaceRelease(ctx, ws); err != nil {
				slog.Warn("workspace release recovery failed", "workspace_id", ws.ID, "error", err)
			}
			continue
		}
		if s.hostOwnedMachineWaits(ws.ID) {
			continue
		}
		if err := s.provisionPersistedMachineAsync(ctx, ws, CreateWorkspaceSessionInput{RepositoryID: row.RepositoryID, UserID: row.UserID, RepoOwner: row.RepositoryOwner, RepoName: row.RepositoryName, SourceBookmark: row.TargetBookmark}); err != nil {
			return err
		}
	}
	return nil
}

// hostOwnedMachineWaits reports a machine whose owner (a /review or learning
// job) is waiting for it in its own background admission request. Its row is
// starting only because the queue is full, not because an API stopped. A
// second, service-owned request would rank its holder as an unscoped TODO the
// install never grants, and time out into "machine admission unavailable"
// while the job still waits (#3776).
func (s *WorkspaceService) hostOwnedMachineWaits(id string) bool {
	queue, ok := s.runtime.(workspaceMachineQueue)
	if !ok {
		return false
	}
	holder := machineQueueHolder(id)
	for _, row := range queue.AdmissionSnapshot() {
		if row.Holder == holder && row.Class == "background" && (row.State == "waiting" || row.State == "granted") {
			return true
		}
	}
	return false
}

// RunProvisioningReconciler reconciles now and then every
// WorkspaceProvisioningReconcileInterval until ctx is done.
func (s *WorkspaceService) RunProvisioningReconciler(ctx context.Context) {
	runWorkspaceProvisioningReconciler(ctx, WorkspaceProvisioningReconcileInterval, s.ReconcileWorkspaceProvisioning)
}

func runWorkspaceProvisioningReconciler(ctx context.Context, interval time.Duration, reconcile func(context.Context) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("workspace provisioning reconciliation panicked", "panic", r)
				}
			}()
			if err := reconcile(ctx); err != nil && ctx.Err() == nil {
				slog.Error("workspace provisioning reconciliation failed", "error", err)
			}
		}()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *WorkspaceService) completeRecoveredSessions(ctx context.Context, id string) {
	q, ok := s.q.(workspaceRecoveryQueries)
	if !ok {
		return
	}
	// Recovered terminal requests need the same host preparation as fresh ones.
	// Keep their durable pending rows until the real presence provider is ready.
	if s.transactions != nil {
		tx, err := s.transactions.Begin(ctx)
		if err != nil {
			return
		}
		var member int64
		err = tx.QueryRow(ctx, `SELECT user_id FROM workspace_sessions WHERE workspace_id=$1 AND status IN ('pending','starting') AND ssh_connection_info->>'via'='terminal' ORDER BY created_at,id LIMIT 1`, id).Scan(&member)
		_ = tx.Rollback(context.WithoutCancel(ctx))
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return
		}
		if err == nil {
			workspace, err := s.q.GetWorkspace(ctx, id)
			if err != nil || s.branchTerminalHost == nil {
				return
			}
			if err = s.branchTerminalHost(ctx, workspace, member); err != nil {
				slog.Error("prepare recovered terminal host", "workspace_id", id, "error", err)
				return
			}
		}
	}
	ids, err := q.CompletePendingWorkspaceSessions(ctx, id)
	if err != nil {
		slog.Error("complete recovered workspace sessions", "workspace_id", id, "error", err)
		return
	}
	for _, sessionID := range ids {
		s.notifyWorkspaceSession(ctx, sessionID, "running")
	}
}

// Serialize the guest-side clone too: an old exec may still be finishing
// after its API disappeared. Completion lives beside the repository, so retry
// never removes an already initialized working copy.
func workspaceCloneOnce(command, marker string) string {
	return "mkdir -p " + shellQuote(marker) + " || exit $?\n(\nif command -v flock >/dev/null 2>&1; then flock 9 || exit $?; fi\nif [ -f " + shellQuote(marker+"/.complete") + " ]; then exit 0; fi\n(\nset -e\n" + command + "\n)\nrc=$?; [ \"$rc\" = 0 ] || exit \"$rc\"\ntouch " + shellQuote(marker+"/.complete") + "\n) 9>" + shellQuote(marker+"/.lock")
}

const workspaceCloneMarker = "/var/lib/smithers/workspace-clone"

// recoverUnregisteredWorkspaceVM adopts a sandbox the provider accepted before
// the API persisted vm_id. The inventory is deployment-owned, so this runs only
// when the Workspaces store implements runtimeports.WorkspaceSandboxAdoption.
func (s *WorkspaceService) recoverUnregisteredWorkspaceVM(ctx context.Context, workspace db.Workspace) (db.Workspace, error) {
	q, ok := s.q.(runtimeports.WorkspaceSandboxAdoption)
	if !ok || strings.TrimSpace(workspace.VmID) != "" || s.sandbox == nil {
		return workspace, nil
	}
	id, err := q.FindUnregisteredWorkspaceSandbox(ctx, workspace.ID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && strings.TrimSpace(id) == "") {
		return workspace, nil
	}
	if err != nil {
		return workspace, err
	}
	vm, err := s.sandbox.InspectSandbox(ctx, id)
	if err != nil || vm.State != sandbox.StateRunning {
		return workspace, workspaceProvisionInProgress(err)
	}
	updated, _, err := s.registerNewWorkspaceVM(ctx, workspace, id, "starting")
	return updated, err
}

// A crashed release cannot claim a capture it did not finish. Confirm the
// stop and retain the disk/history with a named failure; catalog retirement
// can then move on without inventing a successful final capture.
//
// "Confirm the stop" is load-bearing, and stopRuntimeWorkspaceLocked does not
// supply it: it answers nil for ErrWorkspaceStopped and for
// ErrWorkspaceNotFound, and a hosted adapter is allowed to answer the second
// one for a placement it merely cannot read — the contract on
// ErrWorkspaceNotFound joins a typed host_lease_lost to it — so a stop that
// returned nil is not yet a receipt that the guest is down.
//
// That matters because this verdict is terminal in the strict sense: 'failed'
// with no cleanup stage is in no backlog (ListWorkspaceProvisioningRecovery
// re-lists pending/starting/releasing, and 'failed' only with
// provisioning_stage='start_cleanup_pending'), and the release deliberately
// retains vm_id to keep the disk and the unfinished capture. Published over a
// guest nothing stopped, it leaves an owner holding a placement, and that
// placement's compute reservation, with nothing left to look at either again.
//
// So the verdict now needs a positive receipt, exactly as the live sleep path
// requires one ("successful stop is the receipt"). Without one the call
// returns an error and the row stays 'releasing' — the state this reconciler
// already re-drives every WorkspaceProvisioningReconcileInterval, and already
// the outcome when the stop returns an error at all. Nothing is deleted, no
// status moves on a label or an age, and the fenced FailWorkspaceIfUnchanged
// still refuses to overwrite a newer transition.
func (s *WorkspaceService) reconcileWorkspaceRelease(ctx context.Context, workspace db.Workspace) error {
	if s.runtime == nil {
		return errors.New("workspace release runtime unavailable")
	}
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		current, err := s.q.GetWorkspace(ctx, current.ID)
		if err != nil || current.Status != "releasing" {
			return current, err
		}
		operation, err := s.workspaceRuntimeContext(ctx, current, current.UserID, workspaceLifecycleOperation(current, "recover-release"))
		if err != nil {
			return current, err
		}
		_, err = s.runtime.InspectWorkspace(operation, current.ID)
		if err != nil && !errors.Is(err, workspaceapi.ErrWorkspaceNotFound) {
			return current, err
		}
		// Idempotent stop discharges a reconstructed admission grant too. Inspecting
		// a stopped guest alone must not leave the scheduler's slot occupied.
		if err := s.stopRuntimeWorkspaceLocked(ctx, current, current.UserID, "recover-release"); err != nil {
			return current, err
		}
		if _, err := s.confirmRecoveredReleaseStop(ctx, current); err != nil {
			return current, err
		}
		return s.failWorkspace(ctx, current, pkgerrors.Conflict(workspaceReleaseInterruptedMessage))
	})
	return err
}

// workspaceReleaseInterruptedMessage is the sentence the verdict above
// persists, and it is written here exactly once so the constant IS the stored
// representation rather than a guess at one. pkgerrors.Conflict puts this
// string in APIError.Message, workspaceFailureDetailsFor prefers that field
// over Error() (which returns the same string anyway), and
// FailWorkspaceIfUnchanged writes it verbatim into failure_message; the
// product's normalize trigger only substitutes a default for a blank one.
//
// It matters because this is the ONLY thing that identifies this writer's
// cohort. failure_code is `conflict` for this verdict, and also for any
// provisioning cause whose controller status parses to that code through
// markWorkspaceProvisionFailed -> FailProvisioningWorkspaceIfCurrent, which
// likewise leaves provisioning_stage untouched. So failed + conflict + empty
// stage + a bound placement is TWO writers, and only the recorded sentence
// separates them.
const workspaceReleaseInterruptedMessage = "workspace release interrupted by host restart"

// workspaceReleaseInterruptedStoppedMessage replaces it once, and only once,
// a positive receipt says the guest this verdict stranded is actually down.
// The original intent stays legible in the sentence: the release WAS
// interrupted, the row stays `failed`, the placement stays bound, and the
// disk, history and unfinished capture are still retained. The suffix is also
// what takes the row back out of the recovery backlog, so a confirmed stop is
// never re-driven.
const workspaceReleaseInterruptedStoppedMessage = workspaceReleaseInterruptedMessage + "; guest stop confirmed"

// interruptedReleaseStopPending reports the one cohort reconcileWorkspaceRelease
// could leave behind before it required a stop receipt: a `failed` owner whose
// recorded reason is this writer's own sentence and which still binds the
// placement the release never confirmed down.
//
// Every conjunct is load-bearing, and NONE of them is an age, a label or a
// heuristic:
//
//   - status `failed` with THIS message: the exact writer, not the code class.
//   - an empty provisioning_stage: the cleanup contract never ran, so no other
//     reconciler owns the row (start_cleanup_pending has its own, and
//     start_cleanup_complete is already reaped).
//   - a bound vm_id: there is a placement to stop. An unbound row has no guest
//     and no reservation, so there is nothing to re-drive.
func interruptedReleaseStopPending(row db.Workspace) bool {
	return row.Status == "failed" &&
		strings.TrimSpace(row.ProvisioningStage) == "" &&
		strings.TrimSpace(row.VmID) != "" &&
		row.FailureCode.Valid &&
		strings.TrimSpace(row.FailureCode.String) == string(pkgerrors.CodeConflict) &&
		row.FailureMessage.Valid &&
		strings.TrimSpace(row.FailureMessage.String) == workspaceReleaseInterruptedMessage
}

// reconcileInterruptedReleaseStop finishes the release the verdict above
// published over a guest nothing stopped.
//
// This is NOT a failed-workspace cleanup. It activates on one proved
// predicate — interruptedReleaseStopPending — and it does exactly what the
// interrupted release was already trying to do: stop the guest. It deletes
// nothing, clears no placement, moves no status, invents no capture and frees
// nothing on the strength of the owner having failed. The compute comes back
// through the existing lifecycle: the runtime's stop is the controller's own
// stop operation, which hands the placement's CPU, memory and VM slot back the
// moment the worker confirms the guest is down, and leaves its retained root
// disk charged and its checkpoint in place.
//
// The receipt rules are confirmRecoveredReleaseStop's, unchanged: only an
// inspect that answers for this exact workspace and reports it stopped, or an
// owner row that binds no placement, ends the attempt. An ambiguous absence —
// including the 404/410 conflation ErrWorkspaceNotFound carries — leaves the
// row exactly as it is, and the next reconciler tick retries it. That is the
// retry budget: one stop attempt per row per
// WorkspaceProvisioningReconcileInterval, and no attempt at all once a
// receipt landed.
//
// Each attempt is bounded by TWO SEPARATE deadlines, not one. The reconciler
// tick itself carries no deadline — runWorkspaceProvisioningReconciler passes
// the process-lifetime context straight through — so the attempt is only as
// finite as the calls it makes:
//
//   - the stop is bounded here, by workspaceReleaseStopTimeout.
//     stopRuntimeWorkspaceLocked supplies NO bound of its own: it hands the
//     caller's context to the runtime port unchanged, so an adapter that
//     never answers would hold this tick, and with it every other row in the
//     listing, for as long as the process lives.
//   - the confirming read is bounded separately, inside
//     confirmRecoveredReleaseStop, by workspaceReleaseConfirmTimeout.
//
// So the worst case is the sum of the two, each a written constant; no single
// constant bounds the whole attempt, and the earlier comment that said
// workspaceReleaseConfirmTimeout did was wrong about the stop.
//
// Every write is fenced on the row this attempt read. A newer owner,
// placement, status or transition — a resume, a replacement VM, another
// reconciler — matches nothing, and then this function reports no error and
// changes nothing: that transition owns the row.
//
// The returned outcome is the attempt's diagnostic; see
// interruptedReleaseStopOutcome for why the error itself is never logged.
func (s *WorkspaceService) reconcileInterruptedReleaseStop(ctx context.Context, workspace db.Workspace) (interruptedReleaseStopOutcome, error) {
	outcome := interruptedReleaseStopOutcome{stage: interruptedReleaseStageClaim}
	if s.runtime == nil {
		return outcome.failed(errors.New("workspace release runtime unavailable"))
	}
	conditional, ok := s.q.(workspaceUnchangedFailureQuerier)
	if !ok {
		// Without the fenced write there is no way to record the receipt, and
		// an unrecorded stop would be re-driven on every tick.
		return outcome, nil
	}
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		current, err := s.q.GetWorkspace(ctx, current.ID)
		if err != nil || !interruptedReleaseStopPending(current) {
			return current, err
		}
		// A different placement than the one this attempt was listed for means
		// a provisioner bound a new guest after that read. It owns the row, and
		// stopping its guest because an older owner's release never finished
		// would be this reconciler acting on a placement nobody handed it.
		if current.VmID != workspace.VmID {
			return current, nil
		}
		outcome.stage = interruptedReleaseStageStop
		stop, cancelStop := context.WithTimeout(ctx, workspaceReleaseStopTimeout)
		err = s.stopRuntimeWorkspaceLocked(stop, current, current.UserID, "recover-release")
		cancelStop()
		if err != nil {
			return current, err
		}
		outcome.stage = interruptedReleaseStageConfirm
		if outcome.evidence, err = s.confirmRecoveredReleaseStop(ctx, current); err != nil {
			return current, err
		}
		outcome.stage = interruptedReleaseStageRecord
		// The recorded code is reused, never re-derived: this attempt confirms
		// a stop, it does not re-decide why the release failed.
		updated, err := conditional.FailWorkspaceIfUnchanged(ctx, db.FailWorkspaceIfUnchangedParams{
			FailureCode:       strings.TrimSpace(current.FailureCode.String),
			FailureMessage:    workspaceReleaseInterruptedStoppedMessage,
			ID:                current.ID,
			ExpectedStatus:    current.Status,
			ExpectedVmID:      current.VmID,
			ExpectedUpdatedAt: current.UpdatedAt,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return current, nil
		}
		if err != nil {
			// WithCause, not string concatenation: the store's own sentence
			// can carry a DSN, a host or a constraint's recorded values, and
			// this verdict's Message is published.
			return current, pkgerrors.Internal("record interrupted release stop").WithCause(err)
		}
		s.observeWorkspaceLifecycle("recover-release-stop", nil)
		return updated, nil
	})
	if err != nil {
		return outcome.failed(err)
	}
	return outcome, nil
}

// workspaceReleaseStopTimeout bounds the stop an interrupted-release recovery
// drives. stopRuntimeWorkspaceLocked applies no deadline of its own and the
// reconciler tick has none either, so without this the whole listing waits on
// one unanswering adapter. 30s is the bound this package already gives its
// other detached runtime cleanup calls (reclaimDeletedStart's delete and
// ensureRuntimeWorkspaceRunningLocked's failure cleanup), so a recovery stop
// is not given a different budget than the cleanups beside it.
//
// It is derived from the caller's context rather than detached, unlike those:
// this one runs on a reconciler tick that re-drives the row every
// WorkspaceProvisioningReconcileInterval, so abandoning a blocked stop on
// shutdown loses nothing — the row stays in the cohort and the next process
// picks it up.
const workspaceReleaseStopTimeout = 30 * time.Second

// interruptedReleaseStopStage names the step an attempt did not get past. It
// is a written, finite vocabulary: nothing an adapter, a store or a request
// returns can add a value to it.
type interruptedReleaseStopStage string

const (
	// claim_owner_row: the advisory lock, the re-read inside it, or the
	// placement fence. Nothing was asked of the runtime yet.
	interruptedReleaseStageClaim interruptedReleaseStopStage = "claim_owner_row"
	// stop_guest: the runtime's stop call itself.
	interruptedReleaseStageStop interruptedReleaseStopStage = "stop_guest"
	// confirm_stop: the confirming read. This is the stage that carries an
	// evidence label, and the ten values stay distinguishable.
	interruptedReleaseStageConfirm interruptedReleaseStopStage = "confirm_stop"
	// record_receipt: the fenced write of the stop receipt.
	interruptedReleaseStageRecord interruptedReleaseStopStage = "record_receipt"
)

// interruptedReleaseStopReason is the finite reason an attempt stopped at its
// stage. A REGISTERED pkgerrors code is used verbatim, because that registry
// IS a closed vocabulary with a fixed status and fault per code; anything
// else — an unregistered code, a cancelled or expired deadline, a bare store
// error — maps onto one of the written labels below.
//
// No adapter sentence reaches it. The recovery talks to a hosted runtime over
// HTTP, so an arbitrary error's string can carry a URL, a bearer token, a
// request id, a host name or a customer's own prose, and this reconciler logs
// unconditionally on every tick.
type interruptedReleaseStopReason string

const (
	interruptedReleaseReasonCanceled     interruptedReleaseStopReason = "canceled"
	interruptedReleaseReasonDeadline     interruptedReleaseStopReason = "deadline_exceeded"
	interruptedReleaseReasonRowAbsent    interruptedReleaseStopReason = "owner_row_absent"
	interruptedReleaseReasonUnregistered interruptedReleaseStopReason = "unregistered_code"
	interruptedReleaseReasonUnclassified interruptedReleaseStopReason = "unclassified"
)

func interruptedReleaseStopReasonFor(err error) interruptedReleaseStopReason {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, context.Canceled):
		return interruptedReleaseReasonCanceled
	case errors.Is(err, context.DeadlineExceeded):
		return interruptedReleaseReasonDeadline
	case errors.Is(err, pgx.ErrNoRows):
		return interruptedReleaseReasonRowAbsent
	}
	var api *pkgerrors.APIError
	if errors.As(err, &api) {
		if _, ok := pkgerrors.Lookup(api.Code); ok {
			return interruptedReleaseStopReason(api.Code)
		}
		return interruptedReleaseReasonUnregistered
	}
	return interruptedReleaseReasonUnclassified
}

// interruptedReleaseStopOutcome is everything this recovery is allowed to say
// about an attempt that did not finish: the stage it reached, the finite
// reason it stopped there, the closed stop-evidence label when a confirming
// read produced one, and a correlation token for the owner row.
//
// It exists because the error is not loggable. The attempt's failures come
// from a hosted runtime over HTTP and from the product's own store, so the
// error string is arbitrary runtime text — and this site logs on every
// reconcile tick, for every row in the cohort, with no request to scrub it.
// The ten releaseStopEvidence values are carried through rather than
// collapsed, because "the guest is still running" and "the host did not
// answer" are different operator actions.
type interruptedReleaseStopOutcome struct {
	stage    interruptedReleaseStopStage
	reason   interruptedReleaseStopReason
	evidence releaseStopEvidence
}

func (o interruptedReleaseStopOutcome) failed(err error) (interruptedReleaseStopOutcome, error) {
	o.reason = interruptedReleaseStopReasonFor(err)
	return o, err
}

// logArgs renders the outcome for slog. The owner row is identified by
// workspaceCorrelationToken, never by its id: the attempt's diagnostic value
// is "which row, across ticks", and that does not need an identifier anyone
// can resolve, address or quote back.
func (o interruptedReleaseStopOutcome) logArgs(workspaceID string) []any {
	args := []any{
		"workspace", workspaceCorrelationToken(workspaceID),
		"stage", string(o.stage),
		"reason", string(o.reason),
	}
	if o.evidence != "" {
		args = append(args, "stop_evidence", string(o.evidence))
	}
	return args
}

// workspaceCorrelationToken is a stable, non-resolvable correlation for one
// workspace row: the first 12 hex digits of the SHA-256 of its id. The same
// row reads the same across ticks and across log lines, which is what
// correlating a repeated refusal needs, and the token is not the identifier,
// so it cannot be pasted into an API call, a support thread or a ticket as
// one.
func workspaceCorrelationToken(workspaceID string) string {
	sum := sha256.Sum256([]byte(workspaceID))
	return hex.EncodeToString(sum[:])[:12]
}

// releaseStopEvidence is the closed vocabulary a recovered release's
// confirming read answers in. Exactly two values are receipts; the rest are
// progress labels for a row that stays 'releasing'. It is a diagnostic
// vocabulary and nothing else: it carries no identifier, no adapter message
// and no URL, and it is not part of any wire contract.
type releaseStopEvidence string

const (
	// releaseStopConfirmedStopped: the runtime answered for this exact
	// workspace id and reported it stopped. The only positive stop receipt.
	releaseStopConfirmedStopped releaseStopEvidence = "confirmed_stopped"
	// releaseStopConfirmedUnbound: the owner row records no placement, so
	// there is no guest to stop and no reservation to hand back. The product's
	// own record, not an adapter answer.
	releaseStopConfirmedUnbound releaseStopEvidence = "confirmed_unbound"
	// releaseStopObservedRunning / Starting / Stopping / Other: the runtime
	// answered, and the answer is not a stop.
	releaseStopObservedRunning  releaseStopEvidence = "observed_running"
	releaseStopObservedStarting releaseStopEvidence = "observed_starting"
	releaseStopObservedStopping releaseStopEvidence = "observed_stopping"
	releaseStopObservedOther    releaseStopEvidence = "observed_other"
	// releaseStopIdentityMismatch: the runtime answered for another workspace.
	releaseStopIdentityMismatch releaseStopEvidence = "identity_mismatch"
	// releaseStopAbsenceAmbiguous: ErrWorkspaceNotFound. Not a receipt — see
	// confirmRecoveredReleaseStop.
	releaseStopAbsenceAmbiguous releaseStopEvidence = "absence_ambiguous"
	// releaseStopWorkerLost: the typed host_lease_lost infrastructure failure,
	// which says the worker is unavailable, not that the guest stopped.
	releaseStopWorkerLost releaseStopEvidence = "worker_lost"
	// releaseStopUnreadable: the read did not complete (deadline, transport,
	// or any other failure).
	releaseStopUnreadable releaseStopEvidence = "unreadable"
)

// workspaceReleaseConfirmTimeout bounds the confirming read. The reconciler
// re-drives 'releasing' every WorkspaceProvisioningReconcileInterval, so a
// read that cannot finish quickly is better retried than waited on.
const workspaceReleaseConfirmTimeout = 10 * time.Second

// confirmRecoveredReleaseStop re-reads the runtime after a recovered release's
// stop and answers whether the guest is confirmed down, with the closed label
// that says why.
//
// ErrWorkspaceNotFound is deliberately NOT a receipt. Its contract already
// says an adapter may join a typed host_lease_lost to it, so one sentinel
// carries both "this placement is gone" and "the worker holding it is
// unreachable", and this reconciler runs precisely when a host restart makes
// the second reading the likely one. A second unreadable answer is not better
// evidence than the first; it is the same absence twice. The caller keeps the
// row 'releasing', which is a backlogged state, so the next tick converges it
// the moment a real receipt exists.
//
// The one absence that IS a receipt comes from the product's own record: an
// owner that binds no placement has no guest to stop and no reservation to
// discharge, so the terminal verdict strands nothing. That is read from the
// row, not from an adapter.
func (s *WorkspaceService) confirmRecoveredReleaseStop(ctx context.Context, workspace db.Workspace) (releaseStopEvidence, error) {
	if strings.TrimSpace(workspace.VmID) == "" {
		return s.recordReleaseStopEvidence(releaseStopConfirmedUnbound)
	}
	confirm, cancel := detachedRuntimeContext(ctx, workspaceReleaseConfirmTimeout)
	defer cancel()
	operation, err := s.workspaceRuntimeContext(confirm, workspace, workspace.UserID,
		workspaceLifecycleOperation(workspace, "confirm-recover-release"))
	if err != nil {
		return releaseStopUnreadable, err
	}
	observed, err := s.runtime.InspectWorkspace(operation, workspace.ID)
	if err != nil {
		return s.recordReleaseStopEvidence(releaseStopEvidenceForError(err))
	}
	if observed.ID != workspace.ID {
		return s.recordReleaseStopEvidence(releaseStopIdentityMismatch)
	}
	return s.recordReleaseStopEvidence(releaseStopEvidenceForState(observed.State))
}

// releaseStopEvidenceForError labels a confirming read that did not answer.
func releaseStopEvidenceForError(err error) releaseStopEvidence {
	switch {
	case errors.Is(err, workspaceapi.ErrWorkspaceNotFound):
		return releaseStopAbsenceAmbiguous
	case lostWorkerError(err) != nil:
		return releaseStopWorkerLost
	default:
		return releaseStopUnreadable
	}
}

// releaseStopEvidenceForState maps an answered state onto the closed label.
// An adapter state outside the contract's vocabulary reads observed_other, so
// no stored or invented string reaches the label.
func releaseStopEvidenceForState(state workspaceapi.WorkspaceState) releaseStopEvidence {
	switch state {
	case workspaceapi.WorkspaceStopped:
		return releaseStopConfirmedStopped
	case workspaceapi.WorkspaceRunning:
		return releaseStopObservedRunning
	case workspaceapi.WorkspaceStarting:
		return releaseStopObservedStarting
	case workspaceapi.WorkspaceStopping:
		return releaseStopObservedStopping
	default:
		return releaseStopObservedOther
	}
}

// recordReleaseStopEvidence counts the outcome on the existing lifecycle
// observer — a bounded action and a bounded result, no new metric and no new
// identifier — and turns a non-receipt into the retryable error that keeps
// the row 'releasing'.
func (s *WorkspaceService) recordReleaseStopEvidence(evidence releaseStopEvidence) (releaseStopEvidence, error) {
	if evidence == releaseStopConfirmedStopped || evidence == releaseStopConfirmedUnbound {
		s.observeWorkspaceLifecycle("confirm-release-stop", nil)
		return evidence, nil
	}
	err := pkgerrors.New(pkgerrors.CodeServiceUnavailable,
		"recovered workspace release stop is unconfirmed ("+string(evidence)+"); the branch stays releasing")
	s.observeWorkspaceLifecycle("confirm-release-stop", err)
	return evidence, err
}

func (s *WorkspaceService) reconcileFailedWorkspaceStart(ctx context.Context, workspace db.Workspace) error {
	if s.runtime == nil {
		return errors.New("workspace cleanup runtime unavailable")
	}
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		current, err := s.q.GetWorkspace(ctx, current.ID)
		if err != nil || current.Status != "failed" || current.ProvisioningStage != workspaceStartCleanupPending {
			return current, err
		}
		return current, s.reapFailedRuntimeWorkspaceLocked(ctx, current, current.UserID)
	})
	return err
}
