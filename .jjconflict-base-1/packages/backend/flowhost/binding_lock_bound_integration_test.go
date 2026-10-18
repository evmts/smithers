package flowhost

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// BINDING LOCKS NEVER WAIT OUT ANOTHER HOLDER, plue#839.
//
// On 2026-10-17 an idle-suspend capture on one product worker blocked in
// pg_advisory_lock behind a binding lease that another worker had held for a
// day. The capture kept a core-pool connection, and a snapshot that pinned the
// server's xmin, for the whole wait. These cases hold the binding lock on a
// session of their own and require every maintenance path to refuse by name,
// at its written bound, holding nothing.

// A capture while a start holds the binding answers ErrHostBusy within
// existingLockWait, stops nothing, and leaves no session waiting.
func TestPostgresCaptureRefusesBusyWhileAnotherSessionHoldsTheBinding(t *testing.T) {
	pool, url := postgresfixture.NewProductDatabase(t, 2)
	authority, catalog := hostFixture(t, pool)
	store, err := NewStore(pool, testCodec{})
	require.NoError(t, err)
	created, err := store.Acquire(t.Context(), authority, catalog)
	require.NoError(t, err)
	require.NoError(t, created.Close())

	holder := holdBindingLockOutsidePool(t, url, authority, catalog)
	stops := 0
	stop := stopFunc(func(context.Context, Binding) error { stops++; return nil })
	settled := ActiveRunsFunc(func(context.Context, Binding) (bool, error) { return false, nil })

	refused := make(chan error, 1)
	began := time.Now()
	go func() {
		refused <- store.PrepareWorkspaceCapture(context.Background(), authority.WorkspaceID, stop, settled)
	}()
	waiters := 0
	for done := false; !done; {
		waiters = max(waiters, advisoryWaiters(t, holder))
		select {
		case err = <-refused:
			done = true
		case <-time.After(100 * time.Millisecond):
		}
		if !done && time.Since(began) > existingLockWait+5*time.Second {
			t.Fatal("the capture is still waiting for a lock another session holds")
		}
	}
	require.ErrorIs(t, err, ErrHostBusy)
	require.Less(t, time.Since(began), existingLockWait+time.Second)
	require.Zero(t, stops, "a capture that never held the binding stopped its host")
	require.Zero(t, waiters, "a session is still waiting on the binding lock")
	require.Zero(t, pool.Stat().AcquiredConns(), "the refused capture kept a connection")
}

// The retirement sweep refuses the same way and still reaches later bindings.
func TestPostgresRetirementRefusesBusyWhileAnotherSessionHoldsTheBinding(t *testing.T) {
	pool, url := postgresfixture.NewProductDatabase(t, 2)
	authority, catalog := hostFixture(t, pool)
	store, err := NewStore(pool, testCodec{})
	require.NoError(t, err)
	created, err := store.Acquire(t.Context(), authority, catalog)
	require.NoError(t, err)
	require.NoError(t, created.Close())
	_, err = pool.Exec(t.Context(), `UPDATE flow_runtime_host_bindings SET state='retired'`)
	require.NoError(t, err)

	holdBindingLockOutsidePool(t, url, authority, catalog)
	stops := 0
	stop := stopFunc(func(context.Context, Binding) error { stops++; return nil })
	began := time.Now()
	err = store.ReconcileRetired(context.Background(), stop, 10)
	require.ErrorIs(t, err, ErrHostBusy)
	require.Less(t, time.Since(began), existingLockWait+time.Second)
	require.Zero(t, stops)
	require.Zero(t, pool.Stat().AcquiredConns(), "the refused retirement kept a connection")
}

// A resolve whose work under the lease cannot finish ends at the lease's hold
// budget and gives back its connection and the binding lock. The launcher here
// does what journal provisioning does on a full pool: a second acquire on the
// same pool, on the resolve's context.
func TestPostgresResolveEndsALeaseWhoseNestedAcquireCannotBeServed(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t, 2)
	authority, catalog := hostFixture(t, pool)
	store, err := NewStore(pool, testCodec{})
	require.NoError(t, err)
	duties := &recordedDuties{held: map[string]int{}, stalls: map[string]int{}}
	store.ObserveCorePoolDuties(duties)

	// One ordinary holder, so the lease takes the last connection.
	other, err := pool.Acquire(t.Context())
	require.NoError(t, err)
	defer other.Release()

	launcher := &nestedAcquireLauncher{pool: pool}
	resolver, err := New(Config{Store: store, Launcher: launcher,
		Targets:  TargetResolverFunc(func(context.Context, flowruntime.Target) (Authority, error) { return authority, nil }),
		Catalogs: []Catalog{catalog}})
	require.NoError(t, err)
	resolver.leaseHoldBudget = 500 * time.Millisecond

	resolved := make(chan error, 1)
	began := time.Now()
	go func() {
		_, err := resolver.ResolveFlowRuntime(context.Background(), authority.Target)
		resolved <- err
	}()
	select {
	case err = <-resolved:
	case <-time.After(10 * time.Second):
		t.Fatal("the resolve is still parked in a nested acquire under its lease")
	}
	require.Error(t, err)
	require.Less(t, time.Since(began), 5*time.Second)
	require.Equal(t, 1, launcher.starts(), "the resolve never reached its nested acquire")
	require.Equal(t, int32(1), pool.Stat().AcquiredConns(), "the lease kept its connection")
	require.Equal(t, 1, duties.stall(dutyBindingLease, "locked_work"), "the hold budget's refusal is not published")
	require.Zero(t, duties.heldNow(dutyBindingLease), "the closed lease is still published as holding")

	read, err := store.AcquireExisting(t.Context(), authority, catalog)
	require.NoError(t, err, "the binding lock was not given back")
	require.NoError(t, read.Close())
}

// holdBindingLockOutsidePool takes the binding's owner lock the way another
// replica's lease does, on a session that is not in the pool under test.
func holdBindingLockOutsidePool(t *testing.T, url string, authority Authority, catalog Catalog) *pgx.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, url)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close(context.Background()) })
	_, err = conn.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, bindingLockKey(authority, catalog))
	require.NoError(t, err)
	return conn
}

// advisoryWaiters counts sessions in this database blocked on an advisory lock.
func advisoryWaiters(t *testing.T, observer *pgx.Conn) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var waiters int
	require.NoError(t, observer.QueryRow(ctx, `SELECT count(*) FROM pg_locks l
		JOIN pg_stat_activity a USING (pid)
		WHERE l.locktype = 'advisory' AND NOT l.granted AND a.datname = current_database()`).Scan(&waiters))
	return waiters
}

// nestedAcquireLauncher starts nothing: its start asks the pool for a second
// connection on the resolve's context and keeps it until that context ends.
type nestedAcquireLauncher struct {
	pool    *pgxpool.Pool
	mu      sync.Mutex
	started int
}

func (launcher *nestedAcquireLauncher) starts() int {
	launcher.mu.Lock()
	defer launcher.mu.Unlock()
	return launcher.started
}

func (*nestedAcquireLauncher) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (*nestedAcquireLauncher) InspectFlowHost(context.Context, HostLaunch) (Connection, error) {
	return Connection{}, ErrHostNotRunning
}

func (launcher *nestedAcquireLauncher) StartFlowHost(ctx context.Context, _ HostLaunch) (Connection, error) {
	launcher.mu.Lock()
	launcher.started++
	launcher.mu.Unlock()
	conn, err := launcher.pool.Acquire(ctx)
	if err != nil {
		return Connection{}, err
	}
	conn.Release()
	return Connection{}, ctx.Err()
}

func (*nestedAcquireLauncher) ReleaseFailedFlowHostMachine(context.Context, Binding) error {
	return nil
}

// recordedDuties is the core-pool duty series as an operator reads them.
type recordedDuties struct {
	mu     sync.Mutex
	held   map[string]int
	stalls map[string]int
}

func (d *recordedDuties) BeginCorePoolDutyHold(duty string) func() {
	d.mu.Lock()
	d.held[duty]++
	d.mu.Unlock()
	return func() {
		d.mu.Lock()
		d.held[duty]--
		d.mu.Unlock()
	}
}

func (d *recordedDuties) ObserveCorePoolDutyStall(duty, stage string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.stalls[duty+"/"+stage]++
}

func (*recordedDuties) ObserveAdvisoryLockWait(string, string, float64) {}

func (d *recordedDuties) heldNow(duty string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.held[duty]
}

func (d *recordedDuties) stall(duty, stage string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.stalls[strings.Join([]string{duty, stage}, "/")]
}
