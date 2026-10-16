package services

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// THE CORE-POOL INVARIANT every serving background duty has to satisfy, and
// the finite names production needs to tell those duties apart.
//
// A duty that holds a core-pool connection while its own work acquires a
// SECOND connection from the SAME pool is safe only while that second acquire
// is BOUNDED. pgxpool.Acquire waits until its context is done, and a
// background tick carries the process context, so an unbounded acquire made
// underneath a held connection is an absorbing state rather than a slow one:
// nothing is released, no fence is reached, and no refusal is recorded.
//
// TWO such holds are ACTUALLY OBSERVED in production, each named by its own
// source literal in a closed read-only wait aggregate taken while the serving
// background worker was stopped:
//
//	github_app_reconcile_lock  idle_in_transaction  wait=Client  advisory held   6858s
//	GetRepoByID                idle_in_transaction  wait=Client  advisory held   6847s
//	                           namespace=repository_ownership   mode=ShareLock
//	session_advisory_lock      active  wait=Lock  pending=advisory  1 blocker    6859s
//	session_advisory_lock      idle    wait=Client  advisory held
//
// "idle_in_transaction with wait=Client" is the whole finding: the backend has
// no query running and is waiting for its client to send the next one, so the
// goroutine is parked in Go, not in the database.
//
// WHAT THESE ROWS DO NOT SAY, and what nothing in this package asserts: which
// process or goroutine owns any of those connections, or that they are the
// four connections of one worker's pool. pg_stat_activity and pg_locks are a
// SERVER-WIDE census across every process on the server. They cannot be read
// as one pool, and four interesting rows are not one worker's four
// connections. Whether each worker's own dependency cycle closes is a
// production measurement, not something source or these rows establish.
//
// WHAT THEY DO SAY, from the literals plus source, is that two transactions
// each held a core-pool connection and a transaction-scoped advisory lock for
// longer than the interval that could have started them, and that in source
// NEITHER hold had anything that could end it:
//
//   - pg_try_advisory_xact_lock(hashtextextended('github_app_installation_reconcile', 0))
//     is issued by exactly one statement in this program, in
//     PgGitHubAppReconcileLocker, which calls the whole reconcile while its
//     election transaction is open.
//   - pg_advisory_xact_lock_shared(hashtextextended('repository_ownership:' ||
//     ($1::bigint)::text, 0)) is issued by exactly one statement in this
//     program, in RepoOwnershipFence.WithRepoOwnershipShared, which calls its
//     caller's write while its guard transaction is open — and the row that
//     matched it was a GetRepoByID transaction in ShareLock mode, which is
//     that fence's own re-validating read. One reachable caller of it runs on
//     a worker's process-lifetime context:
//     compose launches StartSyncWebhookReconciler(workerCtx, 10m), which for
//     each mirrored row calls EnsureSystemWebhook -> guardedRepoWrite -> this
//     fence, whose write() then makes a SECOND acquire on the SAME pool.
//
// So the fix is a bound on each hold, written down once, applied where a duty
// holds a core-pool connection across work that acquires from the same pool,
// plus the duty attribution the pool's own gauges cannot give.
// smithers_db_connections_active over _max reads 4 of 4 whether a worker is
// working or absorbed, and names nobody.

// corePoolDuty is the closed set of serving background duties this package
// bounds and attributes on the core pool. These are source constants, not
// derived strings: a metric label and a log field can only ever be one of
// them.
type corePoolDuty string

const (
	// github_app_reconcile: one hourly installation-reconcile tick, holding
	// its election transaction's connection while the reconcile itself reads
	// and writes through the same pool.
	corePoolDutyGitHubAppReconcile corePoolDuty = "github_app_reconcile"
	// workspace_provision_backlog: the provisioning reconciler's own listing
	// and per-row read, made BEFORE any claim exists. These hold nothing, but
	// they are where a pool filled by other duties parks the whole loop.
	corePoolDutyWorkspaceProvisionBacklog corePoolDuty = "workspace_provision_backlog"
	// workspace_provision_claim: one admitted provisioning claim, holding its
	// advisory-lock transaction's connection while the fenced read and write
	// inside it acquire from the same pool.
	corePoolDutyWorkspaceProvisionClaim corePoolDuty = "workspace_provision_claim"
	// repository_ownership_guard: one repository-scoped write fenced against a
	// concurrent ownership change, holding its guard transaction's connection
	// and the repository's ownership lock in shared mode while the guarded
	// write acquires from the same pool. This is the second hold the closed
	// aggregate named, by its own ShareLock namespace.
	corePoolDutyRepositoryOwnershipGuard corePoolDuty = "repository_ownership_guard"
)

// corePoolStage is the closed set of places a bound can refuse. A stage names
// an acquire or a hold in this program's source and nothing else.
type corePoolStage string

const (
	// election_lock: the duty could not even begin its election transaction,
	// so the pool had nothing to give it. Nothing was held.
	corePoolStageElectionLock corePoolStage = "election_lock"
	// locked_work: the duty held its election connection and its work did not
	// finish inside the written hold budget. The connection and its advisory
	// lock are released; the next tick re-drives.
	corePoolStageLockedWork corePoolStage = "locked_work"
	// list_backlog: the reconciler's listing read. Nothing was held, and a
	// stall here means the loop never reached a single row.
	corePoolStageListBacklog corePoolStage = "list_backlog"
	// read_backlog_row: the reconciler's per-row read, still before the claim.
	corePoolStageReadBacklogRow corePoolStage = "read_backlog_row"
	// pool_headroom: the duty was refused admission because the pool could not
	// have served the connections it needs at once. This is the stage that
	// keeps a claim from entering and then holding one connection while
	// waiting for a second that is not there.
	corePoolStagePoolHeadroom corePoolStage = "pool_headroom"
	// acquire_connection: the pool itself could not serve an acquire this duty
	// made inside its written bound, either for the transaction that holds the
	// advisory lock or for a read nested inside it.
	corePoolStageAcquireConnection corePoolStage = "acquire_connection"
	// claim_lock: the advisory lock statement a claim issues on the
	// connection its transaction already holds. It asks the pool for nothing,
	// so a refusal here is a network or lock wait and never an exhausted
	// pool — which is why it is a stage of its own rather than
	// acquire_connection.
	corePoolStageClaimLock corePoolStage = "claim_lock"
	// claim_row_read: a read the duty made INSIDE its own hold, after the
	// first fenced read and with the transaction and advisory lock still
	// open. It is distinct from acquire_connection because the hold already
	// existed: this is the stage that used to park forever.
	corePoolStageClaimRowRead corePoolStage = "claim_row_read"
	// claim_receipt_write: the write that records what a duty already did —
	// the fenced receipt of a physical stop that has ALREADY happened. A
	// refusal here means the effect landed and the record did not, so the
	// next tick has to re-drive the row and re-confirm it.
	corePoolStageClaimReceiptWrite corePoolStage = "claim_receipt_write"
	// locked_callback: the guarded callback a duty holds a connection and a
	// lock across did not finish inside its written hold budget. Both are
	// released and the caller's write refuses.
	corePoolStageLockedCallback corePoolStage = "locked_callback"
	// await_claim_slot: the process already has its whole claim budget
	// admitted and this one aged out waiting for a slot. Distinct from
	// pool_headroom: the gate was full, not the pool.
	corePoolStageAwaitClaimSlot corePoolStage = "await_claim_slot"
)

// CorePoolDutyObserver publishes which serving background duty is holding a
// core-pool connection and which bound refused one. The pool's own
// smithers_db_connections_active over _max cannot answer either question: it
// reads 4 of 4 for a worker that is working and for one that is absorbed, and
// it names no duty at all, which is why fifteen minutes of a stopped
// reconciler produced no operable signal.
//
// Both labels come from the closed corePoolDuty and corePoolStage sets above.
// No identifier, error text, SQL, credential or customer value reaches either.
type CorePoolDutyObserver interface {
	AddCorePoolDutyHeld(duty string, delta float64)
	ObserveCorePoolDutyStall(duty string, stage string)
}

// corePoolDutyHold reports a duty holding a core-pool connection for as long
// as the returned release is uncalled. It is the gauge's only writer.
func corePoolDutyHold(observer CorePoolDutyObserver, duty corePoolDuty) (release func()) {
	if observer == nil {
		return func() {}
	}
	observer.AddCorePoolDutyHeld(string(duty), 1)
	var released bool
	return func() {
		if released {
			return
		}
		released = true
		observer.AddCorePoolDutyHeld(string(duty), -1)
	}
}

// corePoolDutyStall records a bound that refused, by duty and stage.
func corePoolDutyStall(observer CorePoolDutyObserver, duty corePoolDuty, stage corePoolStage) {
	if observer == nil {
		return
	}
	observer.ObserveCorePoolDutyStall(string(duty), string(stage))
}

// corePoolCapacityReporter is the capability a pooled source has when it can
// report its own capacity and what it has already handed out. *pgxpool.Pool
// satisfies it; a non-pooled source or a transaction double does not, and then
// a caller keeps its written ceiling rather than guessing.
type corePoolCapacityReporter interface {
	Stat() *pgxpool.Stat
}

// corePoolHeadroom is how many more connections the pool could hand out right
// now, measured rather than assumed. It is the honest answer to "how many of
// this process's connections are already held by duties this package does not
// control": the long-lived session-lock holders, the election transaction, the
// listeners — all of them are already counted in AcquiredConns, so none of
// them has to be named, reserved for, or guessed at.
//
// It is a measurement, so it races by whatever is acquired between the read
// and the acquire. That race is why every acquire underneath it is also
// bounded: the measurement keeps a duty from entering a state it cannot leave,
// and the bound ends the one it could not predict.
func corePoolHeadroom(source any) (headroom int, measured bool) {
	reporter, ok := source.(corePoolCapacityReporter)
	if !ok {
		return 0, false
	}
	stat := reporter.Stat()
	if stat == nil {
		return 0, false
	}
	return int(stat.MaxConns() - stat.AcquiredConns()), true
}

// errCorePoolHeadroom is the cause a duty refused for want of measured
// headroom wraps. It is a sentinel, not a rendered sentence: the finite stage
// and duty names are the diagnostic, and nothing about the pool's contents
// reaches a log or a metric label.
var errCorePoolHeadroom = errors.New("core pool cannot serve this duty whole")

// corePoolRollbackBound is how long releasing a held connection may take. A
// rollback runs on a connection this duty already holds, so it never waits for
// the pool — but it does wait on the network, and an unbounded release would
// keep the very connection the bound above it just decided to give back.
const corePoolRollbackBound = 5 * time.Second

// corePoolRelease is the context a hold's own teardown runs under: detached
// from the caller, because a cancelled caller must still release, and finite,
// because a release that cannot finish must not become the next hold.
func corePoolRelease(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), corePoolRollbackBound)
}
