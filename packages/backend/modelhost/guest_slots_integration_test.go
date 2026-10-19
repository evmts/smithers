package modelhost

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// acquireAll starts every owner's Acquire at once and returns the releases of
// the slots taken and the refusals, after all of them answered.
func acquireAll(t *testing.T, stores []*ChatGuestSlots, owners []int64) ([]func(context.Context), []error) {
	t.Helper()
	var mu sync.Mutex
	var releases []func(context.Context)
	var refusals []error
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i, owner := range owners {
		store := stores[i%len(stores)]
		wg.Go(func() {
			<-start
			release, err := store.Acquire(t.Context(), owner)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				refusals = append(refusals, err)
				return
			}
			releases = append(releases, release)
		})
	}
	close(start)
	wg.Wait()
	t.Cleanup(func() {
		for _, release := range releases {
			release(context.Background())
		}
	})
	return releases, refusals
}

func liveSlots(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var live int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM chat_guest_slots WHERE expires_at > now()`).Scan(&live))
	return live
}

func newSlots(t *testing.T, pool *pgxpool.Pool, perOwner, fleet int) *ChatGuestSlots {
	t.Helper()
	slots, err := NewChatGuestSlots(pool, perOwner, fleet)
	require.NoError(t, err)
	return slots
}

// The G3i acceptance list (CEO a-94ge9y, Security d-kmefmv), on PostgreSQL:
// the counts hold under concurrency and across replicas, a refusal is typed,
// and a slot frees on release or when its lease lapses.
func TestChatGuestSlots(t *testing.T) {
	t.Run("ten at once from one owner: two slots, eight typed refusals", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t, 24)
		owners := make([]int64, 10)
		for i := range owners {
			owners[i] = 7
		}
		releases, refusals := acquireAll(t, []*ChatGuestSlots{newSlots(t, pool, 2, 4)}, owners)
		require.Len(t, releases, 2)
		require.Len(t, refusals, 8)
		for _, err := range refusals {
			var busy *ports.ModelHostsBusy
			require.ErrorAs(t, err, &busy)
			require.Equal(t, "You have 2 chats answering right now. Wait for one to finish, then try again.", busy.Error())
			require.False(t, sandbox.IsNoCapacity(err), "the owner's cap ends a chat turn; it does not defer it")
		}
		require.Equal(t, 2, liveSlots(t, pool))
	})

	t.Run("twenty from ten owners: the fleet ceiling holds, and defers", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t, 24)
		var owners []int64
		for owner := int64(1); owner <= 10; owner++ {
			owners = append(owners, owner, owner)
		}
		releases, refusals := acquireAll(t, []*ChatGuestSlots{newSlots(t, pool, 2, 4)}, owners)
		require.Len(t, releases, 4)
		require.Len(t, refusals, 16)
		for _, err := range refusals {
			// A refusal is the owner's cap only when that owner already holds
			// two; with four slots in all, most owners meet the fleet ceiling.
			if errors.Is(err, ports.ErrModelHostsBusy) {
				continue
			}
			require.ErrorIs(t, err, ports.ErrModelHostsFull)
			require.True(t, sandbox.IsNoCapacity(err), "a full fleet defers a chat turn on the dispatcher's capacity ladder")
		}
		require.Equal(t, 4, liveSlots(t, pool))
	})

	t.Run("two replicas racing share one count", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t, 24)
		owners := make([]int64, 12)
		for i := range owners {
			owners[i] = 9
		}
		replicas := []*ChatGuestSlots{newSlots(t, pool, 2, 4), newSlots(t, pool, 2, 4)}
		releases, refusals := acquireAll(t, replicas, owners)
		require.Len(t, releases, 2)
		require.Len(t, refusals, 10)
	})

	t.Run("a released slot is free at once, and releasing twice is harmless", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		slots := newSlots(t, pool, 2, 4)
		first, err := slots.Acquire(t.Context(), 7)
		require.NoError(t, err)
		second, err := slots.Acquire(t.Context(), 7)
		require.NoError(t, err)
		_, err = slots.Acquire(t.Context(), 7)
		require.ErrorIs(t, err, ports.ErrModelHostsBusy)
		first(context.Background())
		first(context.Background())
		third, err := slots.Acquire(t.Context(), 7)
		require.NoError(t, err)
		second(t.Context())
		third(t.Context())
		require.Zero(t, liveSlots(t, pool))
	})

	t.Run("a release outlives a cancelled request", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		slots := newSlots(t, pool, 2, 4)
		ctx, cancel := context.WithCancel(t.Context())
		release, err := slots.Acquire(ctx, 7)
		require.NoError(t, err)
		cancel()
		release(ctx)
		require.Zero(t, liveSlots(t, pool))
	})

	t.Run("an expired slot is ignored and swept", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		// A replica that died mid-host stopped renewing these.
		_, err := pool.Exec(t.Context(), `INSERT INTO chat_guest_slots (lease_id, owner_id, expires_at)
			SELECT gen_random_uuid(), 7, now() - interval '1 second' FROM generate_series(1, 6)`)
		require.NoError(t, err)
		slots := newSlots(t, pool, 2, 4)
		for range 2 {
			release, err := slots.Acquire(t.Context(), 7)
			require.NoError(t, err)
			t.Cleanup(func() { release(context.Background()) })
		}
		var rows int
		require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM chat_guest_slots`).Scan(&rows))
		require.Equal(t, 2, rows, "admission deletes lapsed leases")
	})

	t.Run("a live host keeps its slot past the lease; a stopped one loses it", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		slots := newSlots(t, pool, 1, 4)
		slots.lease, slots.renew = 2*time.Second, 200*time.Millisecond
		release, err := slots.Acquire(t.Context(), 7)
		require.NoError(t, err)
		time.Sleep(3 * time.Second)
		require.Equal(t, 1, liveSlots(t, pool), "renewal keeps a running host's slot")
		_, err = slots.Acquire(t.Context(), 7)
		require.ErrorIs(t, err, ports.ErrModelHostsBusy)
		release(t.Context())
		require.Zero(t, liveSlots(t, pool))

		// A replica that dies stops renewing: its row lapses after the lease.
		_, err = pool.Exec(t.Context(), `INSERT INTO chat_guest_slots (lease_id, owner_id, expires_at) VALUES (gen_random_uuid(), 7, now() + interval '1 second')`)
		require.NoError(t, err)
		_, err = slots.Acquire(t.Context(), 7)
		require.ErrorIs(t, err, ports.ErrModelHostsBusy)
		require.Eventually(t, func() bool {
			release, err := slots.Acquire(t.Context(), 7)
			if err != nil {
				return false
			}
			release(t.Context())
			return true
		}, 5*time.Second, 100*time.Millisecond)
	})

	t.Run("a slot whose release never runs lapses after the hold bound", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		slots := newSlots(t, pool, 1, 4)
		slots.lease, slots.renew, slots.maxHold = time.Second, 200*time.Millisecond, time.Second
		_, err := slots.Acquire(t.Context(), 7)
		require.NoError(t, err)
		require.Eventually(t, func() bool { return liveSlots(t, pool) == 0 }, 5*time.Second, 100*time.Millisecond, "renewal stops at the bound, so the lease lapses")
	})

	t.Run("limits must be positive", func(t *testing.T) {
		pool, _ := postgresfixture.NewProductDatabase(t)
		for _, limits := range [][2]int{{0, 4}, {2, 0}, {-1, 4}} {
			_, err := NewChatGuestSlots(pool, limits[0], limits[1])
			require.Error(t, err)
		}
		_, err := NewChatGuestSlots(nil, 2, 4)
		require.Error(t, err)
		_, err = newSlots(t, pool, 2, 4).Acquire(t.Context(), 0)
		require.Error(t, err, "a slot needs an owner")
	})
}
