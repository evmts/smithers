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
	limit  int
	wg     sync.WaitGroup
	active sync.Map

	// mu guards reserved, and is held ACROSS the pool measurement that
	// justifies a reservation: see reserve.
	mu sync.Mutex
	// reserved is how many core-pool connections this process's admitted
	// claims still need and have not acquired yet. It is the difference
	// between a check and a reservation.
	reserved int
}

func newWorkspaceProvisionTasks() *workspaceProvisionTasks {
	return &workspaceProvisionTasks{slots: make(chan struct{}, workspaceProvisionMaxClaims), limit: workspaceProvisionMaxClaims}
}

// THE CONNECTION BUDGET, written down, because the gate in front of these
// claims used to be a bare constant that did not know the pool's size.
//
// One claim needs TWO core-pool connections at the same time and holds the
// first while it waits for the second: withWorkspaceProvisionLock begins a
// transaction (connection one), takes the provisioning advisory lock on it,
// and then every read and fenced write inside the callback goes through s.q,
// which is the SAME pool (compose/main.go hands one pool to both). Holding a
// connection while acquiring another is only safe while the pool can serve
// both, and pgxpool.Acquire waits until its context is done — a reconciler
// tick carries no deadline — so past that point the claim parks forever with
// its transaction, and its advisory lock, still open. That is the core-pool
// invariant in core_pool_duty.go, and this is one of the duties that has to
// satisfy it.
//
// What this file does NOT claim: that a provisioning claim is what absorbed
// the serving worker. The closed wait aggregate named the long-held operations
// and none of them was this one — no TryLockWorkspaceProvisioning row appears
// in it at all, and its four interesting connections are a server-wide census
// that attributes nothing to one process or one pool. What is proved here is a
// general hazard in this claim path, reproduced against real PostgreSQL at the
// shipped pool size, and that a pool filled by ANY other duty used to park
// this reconciler silently. The duties the aggregate did name are bounded
// where this process owns them: see GitHubAppInstallationReconcileHoldBudget.
const (
	// workspaceProvisionConnectionsPerClaim is how many core-pool connections
	// one admitted claim can need at once: the transaction holding the
	// advisory lock, plus the deepest query the callback makes through the
	// store while that transaction is still open.
	workspaceProvisionConnectionsPerClaim = 2

	// workspaceProvisionMaxClaims is the ceiling the gate keeps when the pool
	// is large enough to serve more. It is the value the gate used
	// unconditionally before, so a well-sized pool behaves exactly as it did.
	workspaceProvisionMaxClaims = 4
)

// workspaceProvisionAcquireTimeout bounds each core-pool acquire a claim
// makes, and each one the reconcile loop makes before any claim exists. It is
// the difference between a slow pool and an absorbing one: with no bound, an
// exhausted pool parks the goroutine in Acquire while whatever it already
// holds stays held, nothing is ever released, the reconcile loop never
// completes another iteration, and no fence is ever reached that could record
// a reason — which is exactly why fifteen minutes of production stall produced
// no log line at all. With it, exhaustion is a finite, classified refusal, any
// transaction and advisory lock are released, and the next tick re-drives.
const workspaceProvisionAcquireTimeout = 15 * time.Second

// workspaceProvisionClaimBudget is the gate's ceiling for a pool of maxConns:
// the most claims that pool could serve if nothing else in the process used
// it. It is arithmetic over the source's own requirement — two connections per
// claim — and nothing else. It deliberately does NOT subtract a guess at what
// other duties hold: how many connections flowhost's binding lease, the
// journal session locks, the listeners and the election transactions are
// sitting on is not a constant this package can know, and asserting one from a
// server-wide census would be inventing a number. That question is answered by
// measuring instead, at admission, against the pool itself: see
// corePoolHeadroom and admitProvisionClaim.
//
// The floor is one: one claim at a time still converges a backlog, and
// refusing every claim would strand it.
func workspaceProvisionClaimBudget(maxConns int32) int {
	servable := int(maxConns) / workspaceProvisionConnectionsPerClaim
	if servable > workspaceProvisionMaxClaims {
		return workspaceProvisionMaxClaims
	}
	if servable < 1 {
		return 1
	}
	return servable
}

// RESERVING IS NOT CHECKING, and a check is what this used to be.
//
// admitProvisionClaim read corePoolHeadroom and returned. Two of this
// process's own claimants could therefore both observe the same two free
// connections, both pass, both begin a transaction, both take one of those
// two, and then both wait for a second connection that the other one is
// holding. The written bounds make that finite — neither parks forever — but
// two claimants that refuse together and are re-driven together by the same
// ticker is a cycle that converges only by luck. A stall with a timer on it is
// still a stall.
//
// So admission is a RESERVATION taken under the same lock as the measurement
// that justifies it. The second claimant is refused BEFORE it holds anything,
// the first one runs to completion, and the next tick admits the second: the
// backlog converges one claim at a time instead of two claimants trading
// deadlines. Nothing is enlarged and no bound is relaxed; what changes is that
// the decision and the commitment are one step.
//
// reserveProvisionClaim returns the reservation to release when the claim ends.
// A source that cannot report its capacity is admitted on the gate alone, as
// it always was; only a real pool can be measured.
func (s *WorkspaceService) reserveProvisionClaim() (*provisionClaimReservation, bool) {
	if s.provisionTasks == nil {
		return nil, true
	}
	if !s.provisionTasks.reserve(workspaceProvisionConnectionsPerClaim, func() (int, bool) {
		return corePoolHeadroom(s.transactions)
	}) {
		return nil, false
	}
	return &provisionClaimReservation{
		tasks: s.provisionTasks, outstanding: workspaceProvisionConnectionsPerClaim}, true
}

// reserve admits need connections only if the pool, measured right now, can
// serve them ALONGSIDE every connection already reserved by an admitted
// claim. The measurement runs under the lock, so no two claimants can be
// admitted against the same free connections.
func (t *workspaceProvisionTasks) reserve(need int, measure func() (headroom int, measured bool)) bool {
	if t == nil {
		return true
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	headroom, measured := measure()
	if measured && headroom-t.reserved < need {
		return false
	}
	t.reserved += need
	return true
}

func (t *workspaceProvisionTasks) releaseReserved(connections int) {
	if t == nil || connections <= 0 {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.reserved -= connections
	if t.reserved < 0 {
		t.reserved = 0
	}
}

// reservedConnections is what admitted claims still need. It exists so a
// regression can state the reservation rather than infer it.
func (t *workspaceProvisionTasks) reservedConnections() int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.reserved
}

// provisionClaimReservation is one admitted claim's core-pool connections that
// it has not acquired yet.
//
// Each acquire the claim actually makes converts one reserved connection into
// a measured one: from then on the pool's own AcquiredConns counts it, so
// counting it here as well would refuse the next claimant a connection the
// pool can serve. acquired() is that conversion, and release() gives back
// whatever the claim never took.
type provisionClaimReservation struct {
	tasks       *workspaceProvisionTasks
	outstanding int
}

func (r *provisionClaimReservation) acquired() {
	if r == nil || r.outstanding <= 0 {
		return
	}
	r.tasks.releaseReserved(1)
	r.outstanding--
}

func (r *provisionClaimReservation) release() {
	if r == nil || r.outstanding <= 0 {
		return
	}
	r.tasks.releaseReserved(r.outstanding)
	r.outstanding = 0
}

// resize sets the gate to the budget the composed pool can actually serve. It
// runs while the service is being constructed, before any claim exists.
func (t *workspaceProvisionTasks) resize(limit int) {
	if t == nil || limit < 1 || limit == t.limit {
		return
	}
	t.slots, t.limit = make(chan struct{}, limit), limit
}

// WorkspaceProvisionClaimMetricsObserver publishes the gate's budget. The
// claims held against it and the refusals they stall on are published per
// duty, through CorePoolDutyObserver, because the question production could
// not answer was never how many claims this process admits: it was which duty
// is sitting on the pool. smithers_db_connections_active over _max reads 4 of
// 4 for a worker that is working and for one that is absorbed, and names
// nobody, which is why fifteen minutes of a stopped reconciler produced no
// operable signal.
type WorkspaceProvisionClaimMetricsObserver interface {
	SetWorkspaceProvisionClaimBudget(claims float64)
}

func (s *WorkspaceService) provisionClaimMetrics() WorkspaceProvisionClaimMetricsObserver {
	metrics, ok := s.sandboxMetrics.(WorkspaceProvisionClaimMetricsObserver)
	if !ok {
		return nil
	}
	return metrics
}

// corePoolDuties attributes this service's core-pool holds and refusals. It is
// the same recorder the sandbox metrics arrive on; absent it, the bounds still
// apply and only the attribution is missing.
func (s *WorkspaceService) corePoolDuties() CorePoolDutyObserver {
	observer, ok := s.sandboxMetrics.(CorePoolDutyObserver)
	if !ok {
		return nil
	}
	return observer
}

func (s *WorkspaceService) observeProvisionClaimStall(duty corePoolDuty, stage corePoolStage) {
	corePoolDutyStall(s.corePoolDuties(), duty, stage)
}

// workspaceProvisionClaimStall is a step of a claim that did not finish inside
// workspaceProvisionAcquireTimeout. It carries the sub-stage so the refusal
// names which step stalled, because "claim_owner_row" covered the slot wait,
// the connection acquire, the advisory lock and the fenced re-read alike — and
// a pool stall and a contended lock are different operator actions. The cause
// is wrapped, never rendered: see interruptedReleaseStopOutcome.
//
// THE STAGE IS NOT THE EVIDENCE, and this type carries only the stage.
//
// A bound that refused says only that a step did not finish inside it. It does
// NOT say the core pool had nothing to give. Three separate reasons why:
//
//   - A step that already holds its connection — the advisory lock statement,
//     or any statement on the claim's own transaction — asks the pool for
//     nothing at all.
//   - pgxpool.Begin is an Acquire AND a BEGIN on the connection it got, and a
//     query through the pool is an Acquire AND a round trip, so an opaque
//     deadline over either cannot say which half did not finish.
//   - Reading the pool's own Stat AFTER a deadline is a coincidence, not a
//     cause: a query that acquired at once and then blocked on a row lock
//     while other duties filled the rest of the pool measures zero headroom
//     at refusal, and the pool is not why it waited.
//
// So this package claims core_pool_exhausted in exactly ONE place: the
// measured-headroom refusal, which IS a pool measurement taken BEFORE
// anything is held and which refuses rather than waits. It travels as the
// errCorePoolHeadroom cause, so the evidence cannot be set by hand. Every
// other bounded refusal keeps its real stage and the ordinary deadline reason.
type workspaceProvisionClaimStall struct {
	stage interruptedReleaseStopStage
	cause error
}

func (e workspaceProvisionClaimStall) Error() string {
	return "workspace provisioning claim stalled at " + string(e.stage)
}

func (e workspaceProvisionClaimStall) Unwrap() error { return e.cause }

// workspaceProvisionClaimStage refines a refusal's stage when the claim named
// the step it stalled in.
func workspaceProvisionClaimStage(err error) (interruptedReleaseStopStage, bool) {
	var stall workspaceProvisionClaimStall
	if errors.As(err, &stall) {
		return stall.stage, true
	}
	return "", false
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
	return func(s *WorkspaceService) {
		s.transactions = transactions
		// The gate in front of the claims has to know the pool it will be
		// acquiring from; this is where that pool arrives.
		if pool, ok := transactions.(corePoolCapacityReporter); ok {
			s.provisionTasks.resize(workspaceProvisionClaimBudget(pool.Stat().MaxConns()))
		}
	}
}

// Ownership is a database connection's advisory transaction lock, so an API
// crash releases it immediately. Row age is never evidence of failure.
func (s *WorkspaceService) withWorkspaceProvisionLock(ctx context.Context, workspace db.Workspace, fn func(claim context.Context, current db.Workspace) (db.Workspace, error)) (db.Workspace, error) {
	if s.transactions == nil || s.provisionTasks == nil {
		return fn(ctx, workspace)
	}
	// Keep admitted claims inside the pool's real query budget, and bound
	// every acquire they make: see workspaceProvisionClaimBudget and
	// workspaceProvisionAcquireTimeout for why an unbounded acquire here is an
	// absorbing state rather than a slow one.
	gate, cancelGate := context.WithTimeout(ctx, workspaceProvisionAcquireTimeout)
	defer cancelGate()
	select {
	case s.provisionTasks.slots <- struct{}{}:
		defer func() { <-s.provisionTasks.slots }()
	case <-ctx.Done():
		return workspace, ctx.Err()
	case <-gate.Done():
		// The gate is derived from ctx, so a cancelled caller closes both and
		// this branch can win the race. Shutdown is shutdown: reporting it as
		// a pool stall would put an operator on the wrong trail and inflate
		// the stall counter on every deploy.
		if ctx.Err() != nil {
			return workspace, ctx.Err()
		}
		s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, corePoolStageAwaitClaimSlot)
		// The gate was full, so the pool was never asked: this is the
		// process's own claim budget, not an exhausted pool. The stage says
		// so, and the reason stays an ordinary deadline.
		return workspace, workspaceProvisionInProgress(workspaceProvisionClaimStall{
			stage: interruptedReleaseStageAwaitClaimSlot, cause: gate.Err()})
	}
	// Measured, not assumed: a claim the pool cannot serve WHOLE is refused
	// before it begins a transaction, so it never holds one connection and an
	// advisory lock while waiting for a second that other duties are sitting
	// on. See admitProvisionClaim.
	reservation, admitted := s.reserveProvisionClaim()
	if !admitted {
		s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, corePoolStagePoolHeadroom)
		// This refusal IS a pool measurement, taken before anything is held
		// and committed under the same lock. It is the one place in this
		// package that claims core_pool_exhausted, and errCorePoolHeadroom is
		// the evidence it travels on.
		return workspace, workspaceProvisionInProgress(workspaceProvisionClaimStall{
			stage: interruptedReleaseStageAcquireConnection, cause: errCorePoolHeadroom})
	}
	defer reservation.release()
	tx, err := s.transactions.Begin(gate)
	if err != nil {
		if gate.Err() != nil && ctx.Err() == nil {
			s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, corePoolStageAcquireConnection)
			// Begin is an acquire followed by a BEGIN on the connection it
			// got, so an opaque deadline over it cannot say which half did
			// not finish. The stage names the step; the reason stays the
			// ordinary deadline.
			err = workspaceProvisionClaimStall{stage: interruptedReleaseStageAcquireConnection, cause: err}
		}
		return workspace, workspaceProvisionInProgress(err)
	}
	// One reserved connection is now a real one, counted by the pool itself.
	reservation.acquired()
	releaseHeld := corePoolDutyHold(s.corePoolDuties(), corePoolDutyWorkspaceProvisionClaim)
	defer releaseHeld()
	defer func() {
		// Detached, because a cancelled caller must still release the lock,
		// and finite, because an unbounded release keeps the very connection
		// it was called to give back.
		release, cancel := corePoolRelease(ctx)
		defer cancel()
		_ = tx.Rollback(release)
	}()
	// The lock statement runs on the connection this transaction already
	// holds, so it asks the pool for nothing — but it still waits on the
	// network under a context that, on a reconciler tick, is the process's.
	// It gets the claim's written budget like every other step.
	claimLock, cancelClaimLock := context.WithTimeout(ctx, workspaceProvisionAcquireTimeout)
	defer cancelClaimLock()
	acquired, err := db.New(tx).TryLockWorkspaceProvisioning(claimLock, workspace.ID)
	if err != nil {
		if claimLock.Err() != nil && ctx.Err() == nil {
			// THIS STEP ASKS THE POOL FOR NOTHING. It runs on the connection
			// the transaction above already holds, so its deadline is a
			// network or lock wait and never an exhausted pool. Reporting it
			// as acquire_connection/core_pool_exhausted sent an operator to
			// the pool gauges for a claim that already had its connection.
			s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, corePoolStageClaimLock)
			err = workspaceProvisionInProgress(workspaceProvisionClaimStall{
				stage: interruptedReleaseStageClaimLock, cause: err})
		}
		return workspace, err
	}
	if !acquired {
		return workspace, workspaceProvisionInProgress(nil)
	}
	// The fenced re-read is the claim's SECOND core-pool acquire, made while
	// this transaction still holds the first one and the advisory lock. It is
	// bounded on its own budget rather than the gate's remainder, so a slot
	// that waited does not shorten the read that actually fences the row.
	read, cancelRead := context.WithTimeout(ctx, workspaceProvisionAcquireTimeout)
	defer cancelRead()
	current, err := s.q.GetWorkspace(read, workspace.ID)
	if err != nil {
		if read.Err() != nil && ctx.Err() == nil {
			// A whole query, not an acquire: it may have had its connection
			// at once and then waited on SQL or a row lock.
			s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, corePoolStageClaimRowRead)
			err = workspaceProvisionInProgress(workspaceProvisionClaimStall{
				stage: interruptedReleaseStageClaimRowRead, cause: err})
		}
		return workspace, err
	}
	if current.DeletedAt.Valid {
		return current, pgx.ErrNoRows
	}
	// THE CLAIM CONTEXT IS HANDED TO THE CALLBACK, not kept here.
	//
	// Everything above this line is bounded, and everything below it used to
	// be a closure over whatever context its enclosing function happened to
	// hold — on a reconciler tick, the process's. The claim's transaction, its
	// connection and its advisory lock are all still open while fn runs, so an
	// unbounded database acquire inside fn parks exactly like the one before
	// Begin did, except now it parks while HOLDING. A timeout created here and
	// not passed to fn would bound nothing at all, which is why fn receives
	// the claim context and bounds each of its own steps on it: see
	// insideClaim.
	//
	// The claim context carries no single whole-callback deadline, and must
	// not: fn is also the provisioning path, which boots a guest under its own
	// workspaceProvisionTimeout, and the recovery path, whose physical stop
	// and confirming read keep their own separate written budgets. One
	// deadline over all of them would either break provisioning or silently
	// shorten a physical stop.
	return fn(ctx, current)
}

// insideClaim runs ONE database step of a claim that is ALREADY holding a
// core-pool connection and an advisory lock, on the claim's own written
// acquire bound.
//
// It is the bound the claim path was missing. The gate, the headroom
// measurement and the fenced re-read all protect a claim that has not started;
// this protects the steps a started claim makes, which are the ones that park
// while holding. A refusal here releases the transaction, the connection and
// the advisory lock, names the duty and the stage, and leaves the row for the
// next tick — including when the physical effect has already happened and only
// its receipt is missing, which is a state the next tick re-confirms rather
// than re-decides.
// The refusal names the STEP, not an acquire. A bound over a whole query
// cannot tell an acquire that never completed from a query that acquired at
// once and then waited on SQL, a row lock or the network, so the stage is the
// step's own name and core_pool_exhausted is reported only when the pool is
// measured to have had nothing left.
func (s *WorkspaceService) insideClaim(claim context.Context, stage corePoolStage, step func(context.Context) error) error {
	bounded, cancel := context.WithTimeout(claim, workspaceProvisionAcquireTimeout)
	defer cancel()
	err := step(bounded)
	if err != nil && bounded.Err() != nil && claim.Err() == nil {
		s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionClaim, stage)
		return workspaceProvisionClaimStall{stage: insideClaimRefusalStage(stage), cause: err}
	}
	return err
}

// insideClaimRefusalStage maps a step's metric stage onto the recovery's own
// finite log stage, so the series and the record name the same step. Both sets
// are written constants; an unmapped stage keeps the general claim stage
// rather than inventing a label.
func insideClaimRefusalStage(stage corePoolStage) interruptedReleaseStopStage {
	switch stage {
	case corePoolStageClaimRowRead:
		return interruptedReleaseStageClaimRowRead
	case corePoolStageClaimReceiptWrite:
		return interruptedReleaseStageClaimReceiptWrite
	case corePoolStageClaimLock:
		return interruptedReleaseStageClaimLock
	default:
		return interruptedReleaseStageClaim
	}
}

// ReconcileWorkspaceProvisioning re-drives workspaces left pending or starting
// by a stopped API and completes sessions waiting on a running workspace.
func (s *WorkspaceService) ReconcileWorkspaceProvisioning(ctx context.Context) error {
	q, ok := s.q.(workspaceRecoveryQueries)
	if !ok {
		return nil
	}
	// THE LOOP'S OWN ACQUIRES, bounded before any claim exists.
	//
	// These two reads hold nothing, which is why they were easy to leave
	// unbounded — and why leaving them unbounded was the part that made a full
	// pool silent. They are the FIRST core-pool acquires a tick makes, so when
	// the pool is already held by other duties the tick parks here, before the
	// claim gate, before any advisory lock, and before any fence that could
	// record a reason. RunProvisioningReconciler reads its ticker only after
	// reconcile RETURNS, so a tick parked here is not a slow loop: it is the
	// last iteration the loop ever runs. Fifteen elapsed minutes were never
	// 180 completed ticks.
	//
	// Bounded, they refuse finitely and the tick-level log names the stage,
	// which is the difference between an operable signal and fifteen minutes
	// of nothing at all.
	list, cancelList := context.WithTimeout(ctx, workspaceProvisionAcquireTimeout)
	defer cancelList()
	rows, err := q.ListWorkspaceProvisioningRecovery(list)
	if err != nil {
		if list.Err() != nil && ctx.Err() == nil {
			s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionBacklog, corePoolStageListBacklog)
			// The loop's own listing read, named as itself: an opaque query
			// deadline is not evidence about the pool.
			return workspaceProvisionClaimStall{stage: interruptedReleaseStageListBacklog, cause: err}
		}
		return err
	}
	for _, row := range rows {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		ws, err := s.readProvisioningBacklogRow(ctx, row.ID)
		if err != nil {
			continue
		}
		if ws.Status == "failed" && ws.ProvisioningStage == workspaceStartCleanupPending {
			if err := s.reconcileFailedWorkspaceStart(ctx, ws); err != nil {
				// Finite fields, never the error: see workspaceRecoveryRefusal.
				slog.Warn("failed workspace cleanup retry failed",
					workspaceRecoveryRefusal(interruptedReleaseStageReapFailedStart, ws.ID, err)...)
			}
			continue
		}
		if door, ok := retainedGuestStopPending(ws); ok {
			// The diagnostic is the outcome's finite fields, never the error:
			// see interruptedReleaseStopOutcome.
			if outcome, err := s.reconcileRetainedGuestStop(ctx, ws, door); err != nil {
				slog.Warn(door.logMessage, outcome.logArgs(ws.ID)...)
			}
			continue
		}
		if ws.Status == "releasing" {
			if err := s.reconcileWorkspaceRelease(ctx, ws); err != nil {
				// Finite fields, never the error: see workspaceRecoveryRefusal.
				slog.Warn("workspace release recovery failed",
					workspaceRecoveryRefusal(interruptedReleaseStageRecoverRelease, ws.ID, err)...)
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

// readProvisioningBacklogRow re-reads one listed row on the loop's own written
// acquire bound. It holds nothing, so a refusal here costs only this row: the
// tick continues to the next one and the loop keeps ticking, which is what a
// pool held by other duties used to make impossible.
func (s *WorkspaceService) readProvisioningBacklogRow(ctx context.Context, id string) (db.Workspace, error) {
	read, cancel := context.WithTimeout(ctx, workspaceProvisionAcquireTimeout)
	defer cancel()
	ws, err := s.q.GetWorkspace(read, id)
	if err != nil && read.Err() != nil && ctx.Err() == nil {
		s.observeProvisionClaimStall(corePoolDutyWorkspaceProvisionBacklog, corePoolStageReadBacklogRow)
	}
	return ws, err
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
	// Published here rather than where the budget is computed: the pool
	// arrives with WithWorkspaceTransactions and the metrics with
	// WithWorkspaceSandboxMetrics, in no guaranteed order, and this runs once
	// the service is whole. It is a constant for the life of the process, so
	// one write is the whole story.
	if metrics := s.provisionClaimMetrics(); metrics != nil && s.provisionTasks != nil {
		metrics.SetWorkspaceProvisionClaimBudget(float64(s.provisionTasks.limit))
	}
	runWorkspaceProvisioningReconciler(ctx, WorkspaceProvisioningReconcileInterval, s.ReconcileWorkspaceProvisioning)
}

func runWorkspaceProvisioningReconciler(ctx context.Context, interval time.Duration, reconcile func(context.Context) error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		func() {
			defer func() {
				if r := recover(); r != nil {
					// A panic value is whatever panicked: an adapter error, a
					// formatted sentence, a store's own text. Its TYPE is a
					// name from this program's source, so it says which
					// failure family this was without publishing anything the
					// value carries. The row-level records above are where a
					// per-row refusal is already diagnosed.
					slog.Error("workspace provisioning reconciliation panicked",
						"panic_type", fmt.Sprintf("%T", r))
				}
			}()
			if err := reconcile(ctx); err != nil && ctx.Err() == nil {
				// This tick-level error is the listing, the context or an
				// admission refusal; every per-row refusal is recorded by the
				// loop itself. The reason is the same finite classification.
				slog.Error("workspace provisioning reconciliation failed",
					"reason", string(interruptedReleaseStopReasonFor(err)))
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
//
// The attempt is also FINITE. Its three runtime calls each carry a written
// bound — the opening read and the confirming read
// workspaceReleaseConfirmTimeout, the stop workspaceReleaseStopTimeout — so a
// per-row attempt is bounded by their sum, and one unanswering adapter can no
// longer hold the tick, its provisioning slot and every other row in the
// listing for the life of the process. The two bounds derived here come from
// the caller's context, so shutdown still reaches a blocked call: the attempt
// is abandoned, nothing is recorded, and the row stays 'releasing' for the
// next process to re-drive.
func (s *WorkspaceService) reconcileWorkspaceRelease(ctx context.Context, workspace db.Workspace) error {
	if s.runtime == nil {
		return errors.New("workspace release runtime unavailable")
	}
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(claim context.Context, current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		// Bounded on the claim this read is nested INSIDE: the transaction,
		// the connection and the advisory lock are all held while it runs.
		if err := s.insideClaim(claim, corePoolStageClaimRowRead, func(read context.Context) error {
			var err error
			current, err = s.q.GetWorkspace(read, current.ID)
			return err
		}); err != nil {
			return current, err
		}
		if current.Status != "releasing" {
			return current, nil
		}
		// Both runtime calls below are bounded, and bounded from the
		// CALLER's context rather than detached, for the same reason the
		// retained-guest stop is: this runs on a reconciler tick that carries
		// no deadline of its own, re-drives the row every
		// WorkspaceProvisioningReconcileInterval, and holds a provisioning
		// slot and the per-row locks while it waits. The runtime port applies
		// no deadline of its own, so an adapter that never answers would
		// otherwise hold this tick — and with it every other row in the
		// listing — for as long as the process lives, which is exactly the
		// starvation the bounds on the new interrupted/failed branch already
		// rule out. The existing constants are reused: the opening read is a
		// read, like the confirming one, and the stop gets the stop's budget.
		inspect, cancelInspect := context.WithTimeout(claim, workspaceReleaseConfirmTimeout)
		operation, err := s.workspaceRuntimeContext(inspect, current, current.UserID, workspaceLifecycleOperation(current, "recover-release"))
		if err == nil {
			_, err = s.runtime.InspectWorkspace(operation, current.ID)
		}
		cancelInspect()
		if err != nil && !errors.Is(err, workspaceapi.ErrWorkspaceNotFound) {
			return current, err
		}
		// Idempotent stop discharges a reconstructed admission grant too. Inspecting
		// a stopped guest alone must not leave the scheduler's slot occupied.
		stop, cancelStop := context.WithTimeout(claim, workspaceReleaseStopTimeout)
		err = s.stopRuntimeWorkspaceLocked(stop, current, current.UserID, "recover-release")
		cancelStop()
		if err != nil {
			return current, err
		}
		if _, err := s.confirmRecoveredReleaseStop(claim, current); err != nil {
			return current, err
		}
		// The verdict is this attempt's RECEIPT: the stop above already
		// happened, so a write that parks here strands a stopped guest with no
		// record of it. Bounded, the next tick re-drives the row and
		// re-confirms it instead.
		verdict := current
		if err := s.insideClaim(claim, corePoolStageClaimReceiptWrite, func(write context.Context) error {
			var err error
			verdict, err = s.failWorkspace(write, current, pkgerrors.Conflict(workspaceReleaseInterruptedMessage))
			return err
		}); err != nil {
			return current, err
		}
		return verdict, nil
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
	door, ok := retainedGuestStopPending(row)
	return ok && door.reason == workspaceReleaseInterruptedMessage
}

// retainedGuestStopDoor is ONE writer that can publish a terminal `failed`
// verdict over an owner that still binds a live guest, identified by the
// exact sentence it stores.
//
// A door is a remediation and a sentence is not, which is why the registry
// below is keyed on sentences but shaped by doors: each entry names the one
// verdict whose own intent is finished by stopping the guest, carries the
// receipt that records the stop, and says nothing about any other failure.
// `failed` + `conflict` + an empty provisioning_stage + a bound placement is
// several writers at once — markWorkspaceProvisionFailed records whatever
// cause reached it and passes no cleanup stage — so the recorded sentence is
// the only thing that separates them, and a failed label is never authority
// on its own.
type retainedGuestStopDoor struct {
	// reason is the exact stored sentence. Whole-string equality, never a
	// prefix and never the code class.
	reason string
	// confirmed is the sentence once a positive receipt says the guest is
	// down. It keeps the original verdict legible and is also what takes the
	// row out of the recovery backlog, so a confirmed stop is never re-driven.
	confirmed string
	// action labels the runtime lifecycle operation this recovery drives.
	action string
	// metric is the existing lifecycle observer's action label. No new metric.
	metric string
	// logMessage is the operator record for an attempt that did not finish.
	// The outcome's finite fields are the diagnostic; this is only its name.
	logMessage string
}

// retainedGuestStopDoors is the complete set of doors this recovery
// activates on. Each one is PROVED: a writer that records its sentence with
// no cleanup stage while deliberately keeping vm_id, so its row was in no
// backlog and its guest kept running and kept its compute reservation.
//
// Adding a door is a deliberate act with a receipt behind it, not a widening
// of a failed-workspace sweep. Nothing here deletes, purges a disk, clears a
// placement, resets a generation, moves a status or invents a capture.
var retainedGuestStopDoors = []retainedGuestStopDoor{
	{
		reason:     workspaceReleaseInterruptedMessage,
		confirmed:  workspaceReleaseInterruptedStoppedMessage,
		action:     "recover-release",
		metric:     "recover-release-stop",
		logMessage: "interrupted release stop retry failed",
	},
	// The repository-advertisement door. runtimeRepositorySourceEmpty asks
	// the product remote, with the workspace's own bound credential, whether
	// the repository advertises any ref at all — and it runs INSIDE
	// ensureRuntimeWorkspaceRunningLocked, after the guest is already up and
	// reported running. Its refusal is a `conflict`, so the start fails with
	// the guest alive; markWorkspaceProvisionFailed then publishes that
	// sentence with NO cleanup stage and reaps nothing.
	//
	// These rows carry user work by definition — repository materialization
	// is the subject, and the reclaimed-disk restore that reaches this writer
	// most often is a retained branch's own history — so a STOP is the most
	// that may ever be considered here and a delete is never it. That is also
	// why this door is not routed into the failed-start cleanup backlog:
	// reapFailedRuntimeWorkspaceLocked stops AND DELETES, and a delete takes
	// the disk, the history and the unfinished capture with it.
	{
		reason:     workspaceRepositoryAdvertisementUnverifiedMessage,
		confirmed:  workspaceRepositoryAdvertisementStoppedMessage,
		action:     "recover-provision",
		metric:     "recover-provision-stop",
		logMessage: "repository advertisement stop retry failed",
	},
}

// workspaceRepositoryAdvertisementStoppedMessage is the advertisement door's
// receipt. Same shape as the release door's: the original verdict stays
// legible, the row stays `failed`, the placement stays bound, and the disk,
// history and capture are still retained.
const workspaceRepositoryAdvertisementStoppedMessage = workspaceRepositoryAdvertisementUnverifiedMessage + "; guest stop confirmed"

// retainedGuestStopPending reports the door whose cohort this row is in, if
// any. Every conjunct is load-bearing, and NONE of them is an age, a label or
// a heuristic:
//
//   - status `failed` with a REGISTERED sentence: the exact writer, not the
//     code class.
//   - failure_code `conflict`: the same sentence under another code was not
//     written by that door.
//   - an empty provisioning_stage: the cleanup contract never ran, so no
//     other reconciler owns the row (start_cleanup_pending has its own, and
//     start_cleanup_complete is already reaped).
//   - a bound vm_id: there is a placement to stop. An unbound row has no
//     guest and no reservation, so there is nothing to re-drive.
//
// The two emptiness tests take the STRICTER of the lister's reading and a
// trimmed one, in the direction that refuses. The stage is compared exactly,
// the way the lister compares provisioning_stage to the empty string, so a
// padded stage is not read as "no reconciler owns this row". The placement is
// compared trimmed, so a whitespace-only binding is not read as a guest to
// stop even though the lister's own non-empty test would list it. The
// registered sentence and code go through workspaceStoredFailureText, which
// is the writer's own btrim.
func retainedGuestStopPending(row db.Workspace) (retainedGuestStopDoor, bool) {
	if row.Status != "failed" ||
		row.ProvisioningStage != "" ||
		strings.TrimSpace(row.VmID) == "" ||
		!row.FailureCode.Valid ||
		workspaceStoredFailureText(row.FailureCode.String) != string(pkgerrors.CodeConflict) ||
		!row.FailureMessage.Valid {
		return retainedGuestStopDoor{}, false
	}
	reason := workspaceStoredFailureText(row.FailureMessage.String)
	for _, door := range retainedGuestStopDoors {
		if reason == door.reason {
			return door, true
		}
	}
	return retainedGuestStopDoor{}, false
}

// workspaceStoredFailureText normalizes a stored failure_code or
// failure_message exactly as far as the writer that stored it does, and no
// further, so this predicate and the SQL lister read ONE contract.
//
// The product's normalize_workspace_failure_details trigger stores
// btrim(NEW.failure_message), and btrim's default character set is SPACES
// only. So a space-padded reason cannot reach the column at all — the stored
// bytes are the bare sentence, which is why trimming spaces here is both
// harmless and exact — while a TAB- or newline-padded reason IS stored with
// its padding, and the lister's own `failure_message = '<sentence>'`
// comparison then does not match it.
//
// strings.TrimSpace also trims tabs, newlines, vertical tabs, form feeds,
// carriage returns and the Unicode spaces, so using it here admitted as a
// REGISTERED door a stored reason the backlog does not list and this writer
// could not have produced: one tab in front of the sentence was enough.
// Trimming exactly what btrim trims makes that fail closed instead.
func workspaceStoredFailureText(stored string) string {
	return strings.Trim(stored, " ")
}

// retainedGuestTransitionUnchanged reports that the row this attempt holds
// under the advisory lock is still the TRANSITION it was listed for.
//
// It exists because every other conjunct can read identical across a real
// advance. The listing read is taken before the lock, and the cohort's own
// shape is sticky: a second provisioning attempt that reaches the same door
// with the same retained placement writes the same status, the same
// `conflict`, the same registered sentence and the same empty stage over the
// same vm_id. So "the door is still this door" and "the placement is still
// this placement" are satisfied by a row that has since been re-driven, and
// NEITHER of them is a fence on the transition — which is what a stale
// attempt must not act on, because it would stop a guest and seal a receipt
// for a start it never observed.
//
// The transition is the owner, the repository, the provisioning generation
// and the recorded updated_at. The generation is the provisioner's own
// counter; updated_at is set by every writer on this path
// (FailProvisioningWorkspaceIfCurrent and FailWorkspaceIfUnchanged both write
// `updated_at = NOW()`); and the owner and repository say the row is still
// the same ownership this attempt was listed under. Any of them moving means
// the row belongs to that writer.
//
// Refusing is not giving up: the row stays in the cohort, and the NEXT tick
// lists it again with a fresh snapshot and converges it normally. This is a
// fence on the generation and the owner, taken BEFORE any physical effect —
// not the post-stop CAS, which can only decline to record a receipt for a
// stop that already happened.
func retainedGuestTransitionUnchanged(listed, current db.Workspace) bool {
	return current.UserID == listed.UserID &&
		current.RepositoryID == listed.RepositoryID &&
		current.ProvisioningGeneration == listed.ProvisioningGeneration &&
		current.UpdatedAt.Equal(listed.UpdatedAt)
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
// Every write is fenced on the row this attempt read, and so is the physical
// effect: the door, the placement and the transition are all re-checked under
// the lock BEFORE the stop, because a CAS can only decline to record a
// receipt for a guest that is already down. A newer owner, placement, status,
// generation or transition — a resume, a replacement VM, another reconciler —
// matches nothing, and then this function reports no error, stops nothing and
// changes nothing: that transition owns the row.
//
// The returned outcome is the attempt's diagnostic; see
// interruptedReleaseStopOutcome for why the error itself is never logged.
// reconcileInterruptedReleaseStop keeps the release door's own name for its
// recovery. It is the generalized attempt below, bound to that one door.
func (s *WorkspaceService) reconcileInterruptedReleaseStop(ctx context.Context, workspace db.Workspace) (interruptedReleaseStopOutcome, error) {
	return s.reconcileRetainedGuestStop(ctx, workspace, retainedGuestStopDoors[0])
}

func (s *WorkspaceService) reconcileRetainedGuestStop(ctx context.Context, workspace db.Workspace, door retainedGuestStopDoor) (interruptedReleaseStopOutcome, error) {
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
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(claim context.Context, current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		// The row this attempt fences on, read INSIDE the claim it already
		// holds. Unbounded, this is where a claim parked forever with its
		// transaction and advisory lock open, after the pool had been filled
		// by other duties between the gate and here.
		if err := s.insideClaim(claim, corePoolStageClaimRowRead, func(read context.Context) error {
			var err error
			current, err = s.q.GetWorkspace(read, current.ID)
			return err
		}); err != nil {
			return current, err
		}
		// The door is re-derived from the row this attempt holds, and must
		// still be the one it was listed for. A row whose recorded sentence
		// moved to another door — or out of the cohort entirely — belongs to
		// whatever wrote it, not to this attempt.
		if live, ok := retainedGuestStopPending(current); !ok || live.reason != door.reason {
			return current, nil
		}
		// A different placement than the one this attempt was listed for means
		// a provisioner bound a new guest after that read. It owns the row, and
		// stopping its guest because an older owner's release never finished
		// would be this reconciler acting on a placement nobody handed it.
		if current.VmID != workspace.VmID {
			return current, nil
		}
		// ... and the SAME placement under the same door is not evidence that
		// the row did not move. See retainedGuestTransitionUnchanged: the
		// listing read happens before the advisory lock, so a transition can
		// land in between that leaves every conjunct above reading identical.
		if !retainedGuestTransitionUnchanged(workspace, current) {
			return current, nil
		}
		outcome.stage = interruptedReleaseStageStop
		stop, cancelStop := context.WithTimeout(claim, workspaceReleaseStopTimeout)
		err := s.stopRuntimeWorkspaceLocked(stop, current, current.UserID, door.action)
		cancelStop()
		if err != nil {
			return current, err
		}
		outcome.stage = interruptedReleaseStageConfirm
		if outcome.evidence, err = s.confirmRecoveredReleaseStop(claim, current); err != nil {
			return current, err
		}
		outcome.stage = interruptedReleaseStageRecord
		// The recorded code is reused, never re-derived: this attempt confirms
		// a stop, it does not re-decide why the release failed.
		// THE RECEIPT, bounded. The guest is already down at this point, so a
		// write that parks here leaves a stopped guest with no record that it
		// stopped — and leaves the claim holding its connection and advisory
		// lock while it waits. Bounded, the compute stays back, the row stays
		// in the cohort, and the next tick re-confirms and records it.
		var updated db.Workspace
		err = s.insideClaim(claim, corePoolStageClaimReceiptWrite, func(write context.Context) error {
			var err error
			updated, err = conditional.FailWorkspaceIfUnchanged(write, db.FailWorkspaceIfUnchangedParams{
				FailureCode:       strings.TrimSpace(current.FailureCode.String),
				FailureMessage:    door.confirmed,
				ID:                current.ID,
				ExpectedStatus:    current.Status,
				ExpectedVmID:      current.VmID,
				ExpectedUpdatedAt: current.UpdatedAt,
			})
			return err
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return current, nil
		}
		if err != nil {
			// A pool refusal is already a classified diagnostic — stage
			// record_receipt, reason pool_exhausted — and wrapping it as an
			// internal store failure would lose which bound actually refused.
			if _, pool := workspaceProvisionClaimStage(err); pool {
				return current, err
			}
			// WithCause, not string concatenation: the store's own sentence
			// can carry a DSN, a host or a constraint's recorded values, and
			// this verdict's Message is published.
			return current, pkgerrors.Internal("record retained guest stop").WithCause(err)
		}
		s.observeWorkspaceLifecycle(door.metric, nil)
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
//
// The first four values are the steps of a retained-guest stop. The rest name
// the other attempts this reconcile loop makes, and the provisioning
// boundary's, which record their refusals through the same finite shape — see
// workspaceRecoveryRefusal.
type interruptedReleaseStopStage string

const (
	// claim_owner_row: the advisory lock, the re-read inside it, or the
	// placement fence. Nothing was asked of the runtime yet.
	interruptedReleaseStageClaim interruptedReleaseStopStage = "claim_owner_row"
	// await_claim_slot: the claim never entered. The process already has
	// workspaceProvisionClaimBudget claims admitted, and this one aged out of
	// the gate waiting for one of them to release a core-pool connection.
	// Distinct from acquire_connection: the pool was never asked.
	interruptedReleaseStageAwaitClaimSlot interruptedReleaseStopStage = "await_claim_slot"
	// acquire_connection: the core pool itself could not serve this claim
	// inside workspaceProvisionAcquireTimeout, either for the transaction that
	// holds the advisory lock or for the fenced re-read nested inside it.
	//
	// This is the stage the serving worker's stall had no name for. Its whole
	// census was connections acquired by THIS process and never returned, and
	// smithers_db_connections_active 4 of max 4 cannot say whether a claim is
	// working, queued, or parked in Acquire behind a lease that will not end.
	//
	// It is used for the two steps whose FIRST act is an acquire: the
	// measured-headroom refusal and the transaction that holds the advisory
	// lock. A step that already has its connection gets its own stage below.
	interruptedReleaseStageAcquireConnection interruptedReleaseStopStage = "acquire_connection"
	// claim_lock: the advisory lock statement itself. It runs on the
	// connection the claim's transaction already holds, so it asks the pool
	// for nothing and its refusal is a network or lock wait — never an
	// exhausted pool.
	interruptedReleaseStageClaimLock interruptedReleaseStopStage = "claim_lock"
	// claim_row_read: a read the claim made INSIDE its own hold, with its
	// transaction and advisory lock still open. Distinct from
	// acquire_connection because the hold already existed, and distinct from
	// the pool's own refusal because a read can acquire at once and then wait
	// on SQL or a row lock.
	interruptedReleaseStageClaimRowRead interruptedReleaseStopStage = "claim_row_read"
	// list_backlog: the reconcile loop's own listing read, made before any
	// claim exists and holding nothing. A refusal here means the tick reached
	// no row at all.
	interruptedReleaseStageListBacklog interruptedReleaseStopStage = "list_backlog"
	// claim_receipt_write: the fenced write that records what the claim
	// already did. The physical effect has landed by then, so a refusal here
	// means the next tick re-confirms and re-records it. A contended row and
	// an exhausted pool are different operator actions, which is why the
	// reason is measured rather than assumed.
	interruptedReleaseStageClaimReceiptWrite interruptedReleaseStopStage = "claim_receipt_write"
	// stop_guest: the runtime's stop call itself.
	interruptedReleaseStageStop interruptedReleaseStopStage = "stop_guest"
	// confirm_stop: the confirming read. This is the stage that carries an
	// evidence label, and the ten values stay distinguishable.
	interruptedReleaseStageConfirm interruptedReleaseStopStage = "confirm_stop"
	// record_receipt: the fenced write of the stop receipt.
	interruptedReleaseStageRecord interruptedReleaseStopStage = "record_receipt"
	// reap_failed_start: the failed-start cleanup contract's own retry
	// (reconcileFailedWorkspaceStart), which stops AND deletes a row that
	// already records start_cleanup_pending.
	interruptedReleaseStageReapFailedStart interruptedReleaseStopStage = "reap_failed_start"
	// recover_release: the original interrupted-release recovery
	// (reconcileWorkspaceRelease), the whole attempt. Which of its three
	// steps refused is not separated here; its reason does distinguish the
	// unconfirmed stop (service_unavailable, from recordReleaseStopEvidence)
	// from a read or stop refusal.
	interruptedReleaseStageRecoverRelease interruptedReleaseStopStage = "recover_release"
	// provision_async: a detached provisioning attempt that failed, recorded
	// by the async wrapper before it publishes the terminal verdict.
	interruptedReleaseStageProvisionAsync interruptedReleaseStopStage = "provision_async"
	// record_provision_failure: the write of that terminal verdict itself,
	// when the store refused it.
	interruptedReleaseStageRecordFailure interruptedReleaseStopStage = "record_provision_failure"
)

// workspaceRecoveryRefusal renders an attempt that did not finish in the SAME
// finite shape as a retained-guest stop: the owner row by its stable,
// non-resolvable correlation token, a written stage, and a reason that is
// either a REGISTERED pkgerrors code or one of the written labels.
//
// The reconcile loop's other two records, and the provisioning boundary's,
// dumped the owner id and the raw error. All of those paths end in a hosted
// runtime or store call, so the sentence can carry an endpoint, a bearer
// credential, a request id, a host name or a customer's own prose — and these
// sites log unconditionally, the reconcile loop on every tick until the row
// converges. Nothing useful is dropped: the stage says which attempt refused,
// the reason says what kind of refusal it was, and the token correlates the
// repeats of the same row across ticks.
func workspaceRecoveryRefusal(stage interruptedReleaseStopStage, workspaceID string, err error) []any {
	return interruptedReleaseStopOutcome{stage: stage, reason: interruptedReleaseStopReasonFor(err)}.logArgs(workspaceID)
}

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
	// core_pool_exhausted: the process's own database pool had no connection
	// to give this attempt inside its written acquire budget. It is reported
	// separately from deadline_exceeded, which the caller's context produces,
	// because the operator action differs: one is this process holding its own
	// connections, the other is the work being abandoned.
	interruptedReleaseReasonPoolExhausted interruptedReleaseStopReason = "core_pool_exhausted"
)

func interruptedReleaseStopReasonFor(err error) interruptedReleaseStopReason {
	if err == nil {
		return ""
	}
	// Checked before the context cases below, because a claim the pool is
	// MEASURED to have been unable to serve is classified by what it ran out
	// of rather than by the deadline underneath it: that deadline is this
	// package's own acquire budget, never the caller's.
	//
	// Only the measured-headroom refusal gets here, and it is identified by
	// its own cause rather than by a flag any caller could set. A bounded step
	// that refused without that evidence — the advisory lock on a connection
	// already held, an opaque Begin, a read or a fenced write that waited on
	// SQL, a row lock or the network, the gate that was full while the pool
	// was never asked — falls through to deadline_exceeded and is told apart
	// by its stage. Classifying all of them as an exhausted pool sent an
	// operator to the pool gauges for a contended row, and reading the pool's
	// Stat after the deadline would only have made the coincidence look like
	// evidence.
	if errors.Is(err, errCorePoolHeadroom) {
		return interruptedReleaseReasonPoolExhausted
	}
	switch {
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
	// A claim that stalled on an acquire names the acquire, not the whole
	// claim: claim_owner_row covered the slot wait, the connection, the
	// advisory lock and the re-read alike.
	if stage, ok := workspaceProvisionClaimStage(err); ok && o.stage == interruptedReleaseStageClaim {
		o.stage = stage
	}
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
	_, err := s.withWorkspaceProvisionLock(ctx, workspace, func(claim context.Context, current db.Workspace) (db.Workspace, error) {
		unlock := s.lockRuntimeWorkspace(current.ID)
		defer unlock()
		// Nested inside the claim this attempt holds, so bounded like every
		// other step a holder makes. The cleanup itself keeps its own
		// lifetime: it is physical work, not an acquire.
		if err := s.insideClaim(claim, corePoolStageClaimRowRead, func(read context.Context) error {
			var err error
			current, err = s.q.GetWorkspace(read, current.ID)
			return err
		}); err != nil {
			return current, err
		}
		if current.Status != "failed" || current.ProvisioningStage != workspaceStartCleanupPending {
			return current, nil
		}
		return current, s.reapFailedRuntimeWorkspaceLocked(claim, current, current.UserID)
	})
	return err
}
