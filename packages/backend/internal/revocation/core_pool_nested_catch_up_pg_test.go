package revocation

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// THE REMAINING CORE-POOL HOLDER, at the serving worker's measured pool size.
//
// Every serving background duty that holds a core-pool connection across work
// which acquires a SECOND connection from the same pool was bounded except
// this one, and this one is a RESIDENT: compose starts it before any topology
// branch, it holds its LISTEN connection from Start to Stop, and once per poll
// interval — once a second in production — its catch-up read asks the SAME
// pool for another connection while that first connection is still held.
//
// So every second a worker replica has this bus's resident connection held AND
// a nested read outstanding against the same pool. Those are two different
// things and these cases keep them apart: the resident is a connection the bus
// HOLDS, while the nested read is an operation IN FLIGHT that may be using a
// second connection or may still be waiting for one. The cases below assert
// exactly that pairing — one resident held, one nested acquire pending — and
// never that the bus occupies two of the four connections.
//
// The catch-up acquire carried the process's own context, which makes a
// saturated pool an absorbing state rather than a slow one: the bus parks
// inside the read holding its LISTEN connection, stops calling
// WaitForNotification entirely, and a revocation published in that window is
// never fanned out — with nothing recorded anywhere, because nothing refused.
//
// These cases hold that against real PostgreSQL at MaxConns = 4, with the real
// product schema, the real shipped insert and the real pool.
//
// WHAT THEY DO NOT PROVE. They do not establish which process owned any
// connection in production's server-wide census, and they are not a physical
// capacity, deploy or guest measurement. The live worker metrics that motivated
// them (4 of 4 acquired on both worker replicas while every attributed duty
// gauge read 0) are production facts recorded elsewhere, not outputs of this
// file.

// residentCorePoolMaxConns is the serving worker's measured core pool:
// smithers_db_connections_max read 4 on both worker replicas. It is the size
// the source has to be correct at, not a number a test may raise.
const residentCorePoolMaxConns = 4

// busObserveBound is how long any observation here may take. An observer that
// can block forever is not an observer, and this file deliberately fills the
// pool it is measuring.
const busObserveBound = 10 * time.Second

// outOfPoolConn opens one connection that does NOT come from the pool under
// test. Every write and read this file makes while the pool is full uses one:
// a connection taken from the measured pool would be the first thing to block,
// and a debugger must not join the starvation it is measuring.
func outOfPoolConn(t *testing.T, databaseURL string) *pgx.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), busObserveBound)
	defer cancel()
	conn, err := pgx.Connect(ctx, databaseURL)
	require.NoError(t, err)
	t.Cleanup(func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), busObserveBound)
		defer closeCancel()
		_ = conn.Close(closeCtx)
	})
	return conn
}

// fillCorePoolAroundTheBus takes every connection the bus is not holding, so
// the bus's NESTED catch-up acquire is the one that cannot be served. The
// connections are taken from outside the bus, as other duties take them in
// production, and the returned release gives them all back.
func fillCorePoolAroundTheBus(t *testing.T, pool *pgxpool.Pool) (release func()) {
	t.Helper()
	var taken []*pgxpool.Conn
	released := false
	release = func() {
		if released {
			return
		}
		released = true
		for _, conn := range taken {
			conn.Release()
		}
	}
	t.Cleanup(release)
	for pool.Stat().AcquiredConns() < pool.Stat().MaxConns() {
		ctx, cancel := context.WithTimeout(context.Background(), busObserveBound)
		conn, err := pool.Acquire(ctx)
		cancel()
		require.NoError(t, err, "the pool could not be filled, so this test proves nothing")
		taken = append(taken, conn)
	}
	require.Equal(t, pool.Stat().MaxConns(), pool.Stat().AcquiredConns())
	return release
}

// startResidentBus starts the bus exactly as compose does — over the product
// pool, with the pool's own queries as its log reader — and waits until it
// holds its LISTEN connection.
func startResidentBus(t *testing.T, pool *pgxpool.Pool, bound time.Duration) *Bus {
	t.Helper()
	bus := NewBus(pool, db.New(pool))
	bus.PollInterval = 100 * time.Millisecond
	bus.catchUpBound = bound
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() {
		cancel()
		select {
		case <-bus.Done():
		case <-time.After(busObserveBound):
			t.Error("the bus did not stop, so it is still holding a pooled connection")
		}
	})
	require.NoError(t, bus.Start(ctx))
	require.Eventually(t, bus.connectedNow, busObserveBound, 5*time.Millisecond,
		"the bus never acquired its resident LISTEN connection")
	return bus
}

func publishUserDisabledOutOfPool(t *testing.T, conn *pgx.Conn, userID int64) db.RevocationEvent {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), busObserveBound)
	defer cancel()
	row, err := db.New(conn).InsertRevocationEvent(ctx, db.InsertRevocationEventParams{
		Kind:       string(KindUserDisabled),
		UserID:     pgtype.Int8{Int64: userID, Valid: true},
		SandboxIds: []string{},
	})
	require.NoError(t, err)
	return row
}

// TestResidentBusRefusesItsNestedCatchUpReadInsteadOfAbsorbingItsListenConnection
// is this duty's hazard end to end: the bus's resident connection, its nested
// acquire under a full pool, the finite refusal — attributed to the pool here
// by CanceledAcquireCount, which the production metric cannot do from a
// deadline alone — and convergence on the very next poll once the pool has
// room again. It closes this duty, not the live failure.
func TestResidentBusRefusesItsNestedCatchUpReadInsteadOfAbsorbingItsListenConnection(t *testing.T) {
	pool, url := postgresfixture.NewProductDatabase(t, residentCorePoolMaxConns)
	require.Equal(t, int32(residentCorePoolMaxConns), pool.Stat().MaxConns())
	observer := outOfPoolConn(t, url)

	// THE RESIDENT. One of four connections, held before any backlog exists,
	// in a composition that has not decided whether it serves HTTP at all.
	bus := startResidentBus(t, pool, 500*time.Millisecond)
	require.Eventually(t, func() bool { return pool.Stat().AcquiredConns() >= 1 }, busObserveBound, 5*time.Millisecond,
		"the bus is connected but holds no pooled connection, so this test is measuring the wrong thing")
	require.True(t, bus.connectedNow())
	require.Zero(t, bus.nestedReads.Load(), "a catch-up read is in flight before the arrangement starts")

	// THE OTHER THREE, taken by duties outside the bus, as production's are.
	release := fillCorePoolAroundTheBus(t, pool)
	refusalsBefore := testutil.ToFloat64(bus.metrics.catchUpRefusals)
	cancellationsBefore := pool.Stat().CanceledAcquireCount()

	// A real revocation lands while the pool is full. The bus must notice it
	// eventually, and must not stop listening in the meantime.
	event := publishUserDisabledOutOfPool(t, observer, 4128)
	require.NotZero(t, event.ID)

	// FINITE REFUSAL, not an absorbing state. Without the bound this acquire
	// waits on the process's own context: no refusal is ever counted, the
	// nested read stays in flight forever, and the bus holds its LISTEN
	// connection without ever returning to WaitForNotification.
	require.Eventually(t, func() bool {
		return testutil.ToFloat64(bus.metrics.catchUpRefusals) > refusalsBefore
	}, busObserveBound, 10*time.Millisecond,
		"the nested catch-up read never refused, so it is parked in the pool holding the LISTEN connection")
	require.Greater(t, pool.Stat().CanceledAcquireCount(), cancellationsBefore,
		"no acquire was cancelled, so the refusal did not come from the pool's own wait")
	require.Eventually(t, func() bool { return bus.nestedReads.Load() == 0 }, busObserveBound, 10*time.Millisecond,
		"a catch-up read that already gave up is still published as in flight")

	// THE HOLD SURVIVES THE REFUSAL. The point of bounding the nested read is
	// that the resident connection keeps doing its job.
	require.True(t, bus.connectedNow(), "the bus dropped its LISTEN connection because a catch-up read refused")
	require.False(t, bus.IsUserDisabled(4128), "an event the bus could not read was applied anyway")
	require.Zero(t, testutil.ToFloat64(bus.metrics.catchUpErrors),
		"this bound's own refusal was published as an unreadable event log")

	// POSITIVE CONVERGENCE, with no bound anywhere as the mechanism: the other
	// duties give their connections back, and the next poll reads the event.
	release()
	require.Eventually(t, func() bool { return bus.IsUserDisabled(4128) }, busObserveBound, 10*time.Millisecond,
		"the bus never caught up after the pool had room again")
	require.GreaterOrEqual(t, bus.Cursor(), event.ID, "the cursor did not advance past the event it applied")
	require.True(t, bus.connectedNow(), "the bus is no longer listening after it converged")
	require.Zero(t, bus.nestedReads.Load(), "a nested read leaked")
}

// TestResidentBusNestedReadIsPublishedWhileItHoldsItsListenConnection is the
// observability half: a process whose pool reads full has to be able to see
// this duty's resident hold and its pending nested read by role, rather than
// assume a resident count. The two are published separately because they are
// not the same quantity and their sum is not an occupancy.
func TestResidentBusNestedReadIsPublishedWhileItHoldsItsListenConnection(t *testing.T) {
	pool, url := postgresfixture.NewProductDatabase(t, residentCorePoolMaxConns)
	observer := outOfPoolConn(t, url)
	bus := startResidentBus(t, pool, 500*time.Millisecond)

	// Hold the row the catch-up read wants to read, from outside the pool, so
	// the read is genuinely in flight and not merely fast.
	publishUserDisabledOutOfPool(t, observer, 4129)
	release := fillCorePoolAroundTheBus(t, pool)
	t.Cleanup(release)

	require.Eventually(t, func() bool { return bus.nestedReads.Load() == 1 }, busObserveBound, time.Millisecond,
		"a catch-up read waiting for a second pooled connection is published as nothing in flight")
	require.True(t, bus.connectedNow(),
		"the resident LISTEN connection is not published as held while its own nested read is in flight")

	// The two series mean different things and this case does not add them:
	// connected is a connection HELD, in flight is an operation that here is
	// WAITING for a connection it does not have. At this instant the pool is
	// full and the pending read owns none of it.
}
