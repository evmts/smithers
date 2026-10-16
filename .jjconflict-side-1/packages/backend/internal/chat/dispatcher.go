package chat

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// releaseTimeout bounds the lease hand-back a shutting down process makes.
const releaseTimeout = 5 * time.Second

// quarantineDelay keeps a turn Claim cannot take out of recovery. Such a turn
// needs an operator, so a slow recheck costs nothing.
const quarantineDelay = time.Hour

// retryDelay backs off reruns of a turn whose host failed before its provider
// started: 1 s, 2 s, 4 s, ... up to a minute.
func retryDelay(generation int64) time.Duration {
	if generation < 1 {
		generation = 1
	}
	return min(time.Second<<min(generation-1, 6), time.Minute)
}

// chatTurnResourceKind attributes every sandbox allocation a turn makes to
// the turn that asked for it.
//
// Nothing did, until now. The sandbox provider stamps each controller
// mutation with the resource link its caller put on the context, and the
// product's other owners set one: a workspace's create carries
// resource_kind=workspace with the box's id, so the controller's own refusal
// line names the box that is waiting. A chat turn's create carried no link at
// all, so its refusals arrived anonymous — of the 589 "sandbox creation
// deferred: the fleet is full" lines the controller wrote between 12:28:00Z
// and 12:35:00Z on 2026-10-14, around production turn f413964a, 441 name the
// workspace waiting and 7 a snapshot bake, while 141 name nothing at all, and
// no record that outlives the turn says which turn any of those 141 was for.
// That is why that turn's first generation cannot be explained: it spent
// 300 s in sandbox_create, was interrupted for making no progress, and was
// recorded as a host that stalled. Two things happen under that one stage —
// the owner's sandbox entitlement is read, which is four database queries on
// the turn's own context with no deadline, and then the create is sent — and
// no evidence that survives the turn says which of them the 300 s was spent
// in. The provider's own create ladder is ruled out either way: seven
// attempts with a 250 ms doubling is at most ~17 s, which is what generations
// 2 and 3 measured. A create that reaches the controller now says so against
// the turn; one that never arrives leaves that record empty, and those are
// different facts for the first time.
//
// The link is attribution only: the kind is the controller's own lower snake
// case, the id is the turn's, and the fleet already stores both on the
// instance row for every other owner. It carries no prompt, no token and no
// person.
const chatTurnResourceKind = "chat_turn"

// codeHostNoCapacity names a turn whose host could not be launched because no
// sandbox host in the fleet had room for it. It is kept apart from
// host_failed: nothing of the turn ran, so the refusal is a deferral and not
// a fault of the host, the provider or the request.
const codeHostNoCapacity = "host_no_capacity"

// capacityRefusalDelay backs off a rerun of a turn the fleet had no room for.
//
// A full fleet is a transient deferral the product already answers that way
// elsewhere: the workspace pool defers and stays resumable, and the error
// registry publishes one RetryAfter for no_capacity, which is what clients are
// told to wait. A turn refused for capacity is otherwise rerun on the
// host-failure ladder, which starts at a second, and is then sealed failed
// while the only thing wrong is that the fleet is busy.
//
// Measured on turn f413964a, where the fleet had room for exactly one chat
// guest: each refused attempt took ~17 s by itself, which is the provider
// adapter's own create ladder, and the dispatcher's ladder added 1 s after
// generation 1 and 2 s after generation 2. So the five attempts a turn gets
// covered about ninety seconds of shortage, almost none of it chosen here,
// and two of them were spent in the thirty-six seconds while generation 1's
// slot was still held. The registry's interval raises that cover to roughly
// three and a half minutes, at the price of up to this long between a slot
// freeing and the next attempt noticing: in that turn the slot freed within
// seconds of generation 3's refusal, so the same turn would have answered
// about half a minute later than it did. Coverage is the side worth buying,
// because the alternative is a verdict on a host that never started.
//
// The interval is flat because a deferral has no escalating fault to back off
// from: each rerun asks the same question of a fleet whose headroom changes on
// its own.
func capacityRefusalDelay(int64) time.Duration {
	if entry, ok := pkgerrors.Lookup(pkgerrors.CodeNoCapacity); ok && entry.RetryAfter > 0 {
		return time.Duration(entry.RetryAfter) * time.Second
	}
	return 30 * time.Second
}

type Host interface {
	RunTurn(context.Context, ProducerGrant) error
}

type runningTurn struct {
	generation int64
	cancel     context.CancelFunc
}

type Dispatcher struct {
	store   *Store
	host    Host
	lease   time.Duration
	queue   chan Candidate
	logger  *slog.Logger
	metrics *metrics
	// backoff is the rerun delay for a generation. Tests shorten it.
	backoff func(generation int64) time.Duration
	// capacityBackoff is the rerun delay for a turn the fleet had no room for.
	// Tests shorten it.
	capacityBackoff func(generation int64) time.Duration
	// scan is the recovery and interruption poll interval.
	scan time.Duration
	// silence is how long a dispatched host may make no progress before the
	// attempt is interrupted. Tests shorten it.
	silence time.Duration
	mu      sync.Mutex
	running map[string]runningTurn
}

func NewDispatcher(store *Store, host Host, queueSize int, lease time.Duration) (*Dispatcher, error) {
	if store == nil || host == nil || queueSize <= 0 || lease <= 0 {
		return nil, errors.New("invalid chat dispatcher configuration")
	}
	d := &Dispatcher{store: store, host: host, lease: lease, queue: make(chan Candidate, queueSize), logger: slog.Default(), backoff: retryDelay, capacityBackoff: capacityRefusalDelay, scan: time.Second, silence: DefaultHostSilence, running: map[string]runningTurn{}}
	d.metrics = newMetrics(func() float64 { return float64(len(d.queue)) })
	return d, nil
}

// Enqueue never waits for host launch. PostgreSQL recovery picks up a full queue.
func (d *Dispatcher) Enqueue(candidate Candidate) bool {
	select {
	case d.queue <- candidate:
		return true
	default:
		return false
	}
}

func (d *Dispatcher) CancelRunning(turnID string) {
	if d.metrics != nil {
		d.metrics.latencies.stopped(turnID)
	}
	d.mu.Lock()
	running, ok := d.running[turnID]
	d.mu.Unlock()
	if ok {
		running.cancel()
	}
}

func (d *Dispatcher) claim(ctx context.Context, candidate Candidate) (ProducerGrant, bool) {
	grant, err := d.store.Claim(ctx, candidate.Scope, candidate.TurnID, d.lease)
	switch {
	case err == nil:
		d.metrics.claims.Inc()
		return grant, true
	case ctx.Err() != nil, errors.Is(err, ErrProducerBusy), errors.Is(err, ErrTerminal), errors.Is(err, ErrRetired), errors.Is(err, ErrNotFound):
		// Another producer owns the turn, or it has already ended.
	case errors.Is(err, ErrUncertain):
		d.metrics.failures.WithLabelValues("uncertain").Inc()
		d.logger.Warn("chat turn sealed uncertain after its producer stopped", "turn_id", candidate.TurnID)
	case errors.Is(err, ErrCorrupt), errors.Is(err, ErrLimit), errors.Is(err, ErrInvalidRequest):
		// Claim fails the same way every time. Keep the turn out of the
		// oldest-first recovery scan so it cannot starve live turns.
		d.metrics.failures.WithLabelValues("quarantined_" + errorCode(err)).Inc()
		d.logger.Error("chat turn quarantined because it cannot be claimed", "turn_id", candidate.TurnID, "code", errorCode(err), "error", err)
		if quarantineErr := d.store.Quarantine(context.WithoutCancel(ctx), candidate, quarantineDelay); quarantineErr != nil {
			d.logger.Error("chat turn quarantine was not recorded", "turn_id", candidate.TurnID, "code", errorCode(quarantineErr), "error", quarantineErr)
		}
	default:
		d.metrics.failures.WithLabelValues("claim_" + errorCode(err)).Inc()
		d.logger.Error("chat turn claim failed", "turn_id", candidate.TurnID, "code", errorCode(err), "error", err)
	}
	return ProducerGrant{}, false
}

// renew keeps the lease ahead of a healthy host. It cancels the turn when the
// lease is fenced, because another producer may now own it, and when the host
// goes silent: a renewed lease proves the producer lives, never that the turn
// is still moving.
func (d *Dispatcher) renew(ctx context.Context, grant ProducerGrant, lost context.CancelFunc, progress *turnProgress) {
	ticker := time.NewTicker(max(d.lease/4, time.Millisecond))
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		renewal, err := d.store.RenewProducer(ctx, grant, d.lease)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			d.logger.Warn("chat producer lease renewal failed", "turn_id", grant.TurnID, "generation", grant.Generation, "code", errorCode(err), "error", err)
			if errors.Is(err, ErrProducerFenced) {
				lost()
				return
			}
			continue
		}
		// A host that neither reaches a new stage nor commits a batch is
		// wedged: its model stream, its journal callback or its sandbox stopped
		// answering. Interrupt the attempt so the turn ends with a receipt the
		// person sees, instead of renewing its lease for hours.
		if silence := progress.waiting(renewal.HeadBatch); silence > d.silence {
			progress.stall(silence)
			lost()
			return
		}
	}
}

func (d *Dispatcher) fail(ctx context.Context, grant ProducerGrant, code string, cause error) {
	d.metrics.failures.WithLabelValues(code).Inc()
	d.logger.Error("chat turn failed", "turn_id", grant.TurnID, "generation", grant.Generation, "code", code, "error", cause)
	// A provider's refusal ends the turn with the provider's reason.
	var err error
	if refusal := (*ProviderRefusal)(nil); errors.As(cause, &refusal) {
		err = d.store.RefuseProducer(ctx, grant, refusal)
	} else {
		err = d.store.FailProducer(ctx, grant, code)
	}
	if err != nil && !errors.Is(err, ErrProducerFenced) {
		d.logger.Error("chat turn failure was not recorded", "turn_id", grant.TurnID, "generation", grant.Generation, "code", errorCode(err), "error", err)
	}
}

// retry hands a turn whose host failed before its provider started back to
// recovery. The store seals it instead once the provider started or the turn
// is out of attempts.
func (d *Dispatcher) retry(ctx context.Context, grant ProducerGrant, code string, delay time.Duration, cause error) {
	retrying, err := d.store.RetryProducer(ctx, grant, code, delay)
	if err != nil {
		if !errors.Is(err, ErrProducerFenced) {
			d.logger.Error("chat turn failure was not recorded", "turn_id", grant.TurnID, "generation", grant.Generation, "code", errorCode(err), "error", err)
		}
		return
	}
	d.metrics.failures.WithLabelValues(code).Inc()
	if retrying {
		message := "chat turn will rerun after its host failed before the provider started"
		if code == codeHostNoCapacity {
			message = "chat turn deferred: no sandbox host had room for it, and it will rerun"
		}
		d.logger.Warn(message, "turn_id", grant.TurnID, "generation", grant.Generation, "code", code, "delay_ms", delay.Milliseconds(), "error", cause)
		return
	}
	d.logger.Error("chat turn failed", "turn_id", grant.TurnID, "generation", grant.Generation, "code", code, "error", cause)
}

// watchEnded polls for running turns that ended elsewhere. It has its own
// loop because the dispatch loop blocks while every worker is busy.
func (d *Dispatcher) watchEnded(ctx context.Context) {
	ticker := time.NewTicker(d.scan)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.interruptEnded(ctx)
		}
	}
}

// interruptEnded stops local hosts whose turns ended elsewhere, such as a
// cancel or retire that another replica served.
func (d *Dispatcher) interruptEnded(ctx context.Context) {
	if err := d.store.RevokeInactiveAuthors(ctx); err != nil {
		if ctx.Err() == nil {
			d.logger.Warn("chat author recheck failed", "error", err)
		}
		return
	}
	d.mu.Lock()
	ids := make([]string, 0, len(d.running))
	for id := range d.running {
		ids = append(ids, id)
	}
	d.mu.Unlock()
	ended, err := d.store.EndedAmong(ctx, ids)
	if err != nil {
		if ctx.Err() == nil {
			d.logger.Warn("chat running turn check failed", "code", errorCode(err), "error", err)
		}
		return
	}
	for _, id := range ended {
		d.CancelRunning(id)
	}
}

func (d *Dispatcher) runOne(parent context.Context, candidate Candidate) {
	grant, ok := d.claim(parent, candidate)
	if !ok {
		return
	}
	d.metrics.running.Inc()
	defer d.metrics.running.Dec()
	ctx, cancel := context.WithCancel(parent)
	progress := newTurnProgress(grant, d.logger)
	ctx = ports.WithChatProgress(ctx, progress.observe)
	// Every sandbox this attempt asks the fleet for is this turn's, including
	// the ones the fleet refuses: a refusal that names the turn is the only
	// record of a launch that leaves nothing behind.
	ctx = sandbox.WithResourceLink(ctx, chatTurnResourceKind, grant.TurnID)
	ports.ReportChatProgress(ctx, ports.ChatStageDispatch, "")
	d.mu.Lock()
	d.running[candidate.TurnID] = runningTurn{generation: grant.Generation, cancel: cancel}
	d.mu.Unlock()
	var renewals sync.WaitGroup
	defer func() {
		cancel()
		renewals.Wait()
		d.mu.Lock()
		if current, ok := d.running[candidate.TurnID]; ok && current.generation == grant.Generation {
			delete(d.running, candidate.TurnID)
		}
		d.mu.Unlock()
	}()
	renewals.Go(func() { d.renew(ctx, grant, cancel, progress) })
	err := d.host.RunTurn(ctx, grant)
	detached := context.WithoutCancel(parent)
	if parent.Err() != nil {
		// Lifecycle shutdown is not a user cancellation or a terminal provider
		// fact. The host died with this process, so hand the lease back and let
		// recovery decide at once whether the turn reruns or ends uncertain.
		release, stop := context.WithTimeout(detached, releaseTimeout)
		defer stop()
		if releaseErr := d.store.ReleaseProducer(release, grant); releaseErr != nil && !errors.Is(releaseErr, ErrProducerFenced) {
			d.logger.Error("chat producer lease was not released at shutdown", "turn_id", grant.TurnID, "generation", grant.Generation, "code", errorCode(releaseErr), "error", releaseErr)
		}
		return
	}
	if err != nil {
		// An explicit user cancel has already committed its terminal batch
		// before interrupting this host, so the store leaves it unchanged.
		if errors.Is(err, errCommandAPIUnavailable) {
			d.fail(detached, grant, "credential_issuer_unavailable", err)
			return
		}
		if errors.Is(err, ports.ErrModelCredentialMissing) {
			d.fail(detached, grant, "credential_missing", err)
			return
		}
		// The provider answered with a refusal: a rerun meets the same one.
		if refusal := (*ProviderRefusal)(nil); errors.As(err, &refusal) {
			d.fail(detached, grant, refusal.Code, err)
			return
		}
		if progress.silent() {
			// The host was interrupted for making no progress. A started
			// provider seals the turn; a sandbox that never reached one reruns.
			d.retry(detached, grant, "host_stalled", d.backoff(grant.Generation), err)
			return
		}
		// No sandbox host had room: the launch was refused before anything of
		// the turn ran, so it is deferred under its own name rather than
		// recorded as a host that failed.
		if sandbox.IsNoCapacity(err) {
			d.retry(detached, grant, codeHostNoCapacity, d.capacityBackoff(grant.Generation), err)
			return
		}
		d.retry(detached, grant, "host_failed", d.backoff(grant.Generation), err)
		return
	}
	state, terminal, getErr := d.store.GetState(detached, candidate.Scope, candidate.TurnID)
	if getErr != nil {
		d.logger.Error("chat turn state read failed", "turn_id", grant.TurnID, "generation", grant.Generation, "code", errorCode(getErr), "error", getErr)
		return
	}
	if !terminal {
		d.fail(detached, grant, "host_returned_without_receipt", errors.New("model host returned without a terminal batch"))
	} else {
		d.logger.Info("chat turn finished", "turn_id", grant.TurnID, "run_id", grant.RunID, "generation", grant.Generation, "state", state)
	}
}

func (d *Dispatcher) Run(ctx context.Context, concurrency int) error {
	if concurrency <= 0 {
		return errors.New("chat dispatcher concurrency must be positive")
	}
	work := make(chan Candidate)
	var workers sync.WaitGroup
	for range concurrency {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for candidate := range work {
				d.runOne(ctx, candidate)
			}
		}()
	}
	var watcher sync.WaitGroup
	watchCtx, stopWatching := context.WithCancel(ctx)
	watcher.Go(func() { d.watchEnded(watchCtx) })
	ticker := time.NewTicker(d.scan)
	defer ticker.Stop()
	defer func() {
		close(work)
		workers.Wait()
		stopWatching()
		watcher.Wait()
	}()
	for {
		select {
		case <-ctx.Done():
			return nil
		case candidate := <-d.queue:
			select {
			case work <- candidate:
			case <-ctx.Done():
				return nil
			}
		case <-ticker.C:
			candidates, err := d.store.RecoveryCandidates(ctx, 100)
			if err != nil {
				if ctx.Err() == nil {
					d.metrics.recoveryErrors.Inc()
					d.logger.Error("chat recovery scan failed", "code", errorCode(err), "error", err)
				}
				continue
			}
			for _, candidate := range candidates {
				select {
				case work <- candidate:
				case <-ctx.Done():
					return nil
				}
			}
		}
	}
}
