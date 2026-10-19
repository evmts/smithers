package database

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

// SESSION ADVISORY LOCKS ON A SHARED POOL, written once (plue#839).
//
// A session-level advisory lock serializes work across replicas, and every
// replica takes it on a connection from its own small core pool. The blocking
// form, pg_advisory_lock, made three failures out of one wait:
//
//   - the waiter held a pooled connection for as long as ANOTHER process held
//     the lock, so one wedged replica emptied the healthy replica's pool too;
//   - the blocked statement held its snapshot for the whole wait, which pinned
//     the server's xmin and let dead rows pile up in every hot table;
//   - a cancelled wait could have been granted just before the cancel, so the
//     connection's lock state was unknown and it had to be closed.
//
// AcquireSessionLock replaces it. Each attempt takes a connection, asks
// pg_try_advisory_lock once, and gives the connection back when the lock is
// held elsewhere: a waiter holds no connection and no snapshot between
// attempts, every answer is definite, and the wait ends at a written bound
// with ErrSessionLockBusy instead of at the holder's convenience.
//
// SessionLock.Release is the one unlock: it runs detached under its own short
// bound, and it returns the connection to the pool only when PostgreSQL
// confirms the unlock. Any other answer closes the session, which is the only
// way to be sure the next borrower does not inherit the lock.

// CorePoolDutyObserver publishes which serving background duty holds a pooled
// connection, since when, which written bound refused one, and how each
// advisory lock wait ended. Every label is a closed source constant: no
// identifier, lock key, SQL, error text or customer value reaches one.
type CorePoolDutyObserver interface {
	// BeginCorePoolDutyHold reports duty holding one connection until the
	// returned end runs. end is called exactly once.
	BeginCorePoolDutyHold(duty string) (end func())
	ObserveCorePoolDutyStall(duty, stage string)
	ObserveAdvisoryLockWait(duty, outcome string, seconds float64)
}

// CorePoolStageLockedWork is the stall stage of a duty whose work under a held
// connection did not finish inside its written hold budget.
const CorePoolStageLockedWork = "locked_work"

// The closed set of ways one AcquireSessionLock call ends.
const (
	AdvisoryLockAcquired = "acquired"
	// busy: another session held the lock for the whole written wait.
	AdvisoryLockBusy = "busy"
	// no_connection: the pool could not serve an attempt before the bound.
	AdvisoryLockNoConnection = "no_connection"
	// cancelled: the caller's context ended between attempts.
	AdvisoryLockCancelled = "cancelled"
	// failed: the lock statement itself errored. The connection is closed.
	AdvisoryLockFailed = "failed"
)

var (
	// ErrSessionLockBusy is a definite refusal: another session holds the
	// lock, this caller holds nothing, and retrying later is safe.
	ErrSessionLockBusy = errors.New("session advisory lock is held by another session")
	// ErrSessionLockNoConnection wraps the pool's refusal of an attempt.
	ErrSessionLockNoConnection = errors.New("no pooled connection for a session advisory lock attempt")
	// ErrSessionUnlockReturnedFalse: PostgreSQL answered that this session
	// did not hold the lock it released. The session was closed.
	ErrSessionUnlockReturnedFalse = errors.New("session advisory unlock returned false")
	// ErrSessionUnlockFailed: the unlock did not answer inside its bound.
	// Whether the lock was still held is unknown; the session was closed.
	ErrSessionUnlockFailed = errors.New("session advisory unlock did not complete")
)

// sessionLockReleaseBound is how long an unlock may take. It runs on a
// connection the caller already holds, so it waits on the network only.
const sessionLockReleaseBound = 5 * time.Second

// Attempts back off from the first to the last interval; the ceiling keeps a
// long wait to about two statements a second.
const (
	sessionLockFirstPoll = 25 * time.Millisecond
	sessionLockLastPoll  = 500 * time.Millisecond
)

// SessionLockRequest names one lock: hashtextextended(Key, Seed), the same
// key the blocking statements it replaces computed, so replicas of either
// version exclude each other during a rollout.
type SessionLockRequest struct {
	// Duty is a closed source constant naming the caller in every metric.
	Duty string
	Key  string
	Seed int64
	// Wait bounds how long the caller waits for another session to let go.
	// Zero is one attempt.
	Wait     time.Duration
	Observer CorePoolDutyObserver
}

// SessionLock is a pooled connection holding one session advisory lock.
type SessionLock struct {
	conn    *pgxpool.Conn
	request SessionLockRequest
	endHold func()
}

// AcquireSessionLock returns a connection from pool holding the request's
// lock. Each attempt's pool acquire is bounded by ctx, which every caller
// bounds; the wait for another session to let go is bounded by req.Wait. It
// returns ErrSessionLockBusy when the lock stayed held elsewhere for the whole
// wait, and the caller's context error when ctx was cancelled first.
func AcquireSessionLock(ctx context.Context, pool *pgxpool.Pool, req SessionLockRequest) (*SessionLock, error) {
	began := time.Now()
	deadline := began.Add(req.Wait)
	poll := sessionLockFirstPoll
	finish := func(outcome string) {
		if req.Observer != nil {
			req.Observer.ObserveAdvisoryLockWait(req.Duty, outcome, time.Since(began).Seconds())
		}
	}
	for {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				finish(AdvisoryLockCancelled)
				return nil, ctx.Err()
			}
			finish(AdvisoryLockNoConnection)
			return nil, fmt.Errorf("%w: %w", ErrSessionLockNoConnection, err)
		}
		var locked bool
		if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1, $2))`, req.Key, req.Seed).Scan(&locked); err != nil {
			// The reply may have been lost after the lock was granted, so this
			// session's lock state is unknown: never return it to the pool.
			release, cancelRelease := context.WithTimeout(context.WithoutCancel(ctx), sessionLockReleaseBound)
			_ = conn.Hijack().Close(release)
			cancelRelease()
			finish(AdvisoryLockFailed)
			return nil, err
		}
		if locked {
			finish(AdvisoryLockAcquired)
			lock := &SessionLock{conn: conn, request: req, endHold: func() {}}
			if req.Observer != nil {
				lock.endHold = req.Observer.BeginCorePoolDutyHold(req.Duty)
			}
			return lock, nil
		}
		// A definite no: this session holds nothing, so the connection goes
		// back and the wait costs the pool nothing.
		conn.Release()
		remaining := time.Until(deadline)
		if remaining <= 0 {
			finish(AdvisoryLockBusy)
			return nil, ErrSessionLockBusy
		}
		timer := time.NewTimer(min(poll, remaining))
		select {
		case <-ctx.Done():
			timer.Stop()
			finish(AdvisoryLockCancelled)
			return nil, ctx.Err()
		case <-timer.C:
		}
		poll = min(2*poll, sessionLockLastPoll)
	}
}

// Conn is the connection that holds the lock. It is valid until Release.
func (l *SessionLock) Conn() *pgxpool.Conn { return l.conn }

// Release unlocks and returns the connection to the pool, or closes it when
// the unlock is not confirmed, and reports which. It is safe to call again.
func (l *SessionLock) Release() error {
	if l == nil || l.conn == nil {
		return nil
	}
	conn := l.conn
	l.conn = nil
	defer l.endHold()
	ctx, cancel := context.WithTimeout(context.Background(), sessionLockReleaseBound)
	defer cancel()
	var unlocked bool
	err := conn.QueryRow(ctx, `SELECT pg_advisory_unlock(hashtextextended($1, $2))`, l.request.Key, l.request.Seed).Scan(&unlocked)
	if err == nil && unlocked {
		conn.Release()
		return nil
	}
	_ = conn.Hijack().Close(ctx)
	if err != nil {
		return ErrSessionUnlockFailed
	}
	return ErrSessionUnlockReturnedFalse
}

// CorePoolDutyHolds is the registry behind smithers_core_pool_duty_connections_held
// and smithers_core_pool_duty_oldest_hold_seconds. Both are computed from the
// live holds at scrape time, so a count cannot drift from the holds it counts,
// and the age names a holder that never lets go: the 10-17 mirror seed would
// have read about 92,000 seconds.
type CorePoolDutyHolds struct {
	mu     sync.Mutex
	next   uint64
	holds  map[string]map[uint64]time.Time
	now    func() time.Time
	held   *prometheus.Desc
	oldest *prometheus.Desc
}

func NewCorePoolDutyHolds() *CorePoolDutyHolds {
	return &CorePoolDutyHolds{
		holds: map[string]map[uint64]time.Time{},
		now:   time.Now,
		held: prometheus.NewDesc("smithers_core_pool_duty_connections_held",
			"Core-pool database connections held right now by each serving background duty.", []string{"duty"}, nil),
		oldest: prometheus.NewDesc("smithers_core_pool_duty_oldest_hold_seconds",
			"Age of the oldest core-pool connection each serving background duty holds right now; zero when it holds none.", []string{"duty"}, nil),
	}
}

// Begin records one hold by duty until the returned end runs.
func (h *CorePoolDutyHolds) Begin(duty string) (end func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	id := h.next
	if h.holds[duty] == nil {
		h.holds[duty] = map[uint64]time.Time{}
	}
	h.holds[duty][id] = h.now()
	var once sync.Once
	return func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			delete(h.holds[duty], id)
		})
	}
}

func (h *CorePoolDutyHolds) Describe(ch chan<- *prometheus.Desc) {
	ch <- h.held
	ch <- h.oldest
}

// Collect publishes every duty that has ever held, so a duty that let go reads
// zero rather than vanishing.
func (h *CorePoolDutyHolds) Collect(ch chan<- prometheus.Metric) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.now()
	for duty, holds := range h.holds {
		oldest := 0.0
		for _, since := range holds {
			oldest = max(oldest, now.Sub(since).Seconds())
		}
		ch <- prometheus.MustNewConstMetric(h.held, prometheus.GaugeValue, float64(len(holds)), duty)
		ch <- prometheus.MustNewConstMetric(h.oldest, prometheus.GaugeValue, oldest, duty)
	}
}
