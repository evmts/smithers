package modelhost

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// chatGuestSlotsLock serializes every slot admission across replicas. One
// lock covers the per-owner and the fleet-wide count, which must be read and
// written together.
const chatGuestSlotsLock int64 = 0x63686174677374 // "chatgst"

// ChatGuestSlots is the durable model host cap (G3i: CEO a-94ge9y, Security
// d-kmefmv, PM d-ic6hp3). A chat turn, model stream, wiki selection or model
// test takes one slot before its host is created and frees it when the host
// closes. An owner may hold PerOwner live slots and all owners together
// Fleet, so neither one account nor many accounts can fill the sandbox fleet
// the workspaces share. A slot is a lease: it is renewed while the host lives
// and lapses after Lease once renewals stop, so a replica that dies mid-host
// frees its slots within a minute.
type ChatGuestSlots struct {
	pool     *pgxpool.Pool
	perOwner int
	fleet    int
	lease    time.Duration
	renew    time.Duration
	// maxHold bounds renewal, so a slot whose release never runs still
	// lapses: no model host a chat, stream, selection or test starts runs
	// this long.
	maxHold time.Duration
}

// NewChatGuestSlots caps live model hosts at perOwner per owner and fleet in
// all. Both must be positive.
func NewChatGuestSlots(pool *pgxpool.Pool, perOwner, fleet int) (*ChatGuestSlots, error) {
	if pool == nil || perOwner <= 0 || fleet <= 0 {
		return nil, errors.New("model host slots need a database and positive per-owner and fleet limits")
	}
	return &ChatGuestSlots{pool: pool, perOwner: perOwner, fleet: fleet, lease: time.Minute, renew: 20 * time.Second, maxHold: 30 * time.Minute}, nil
}

// Acquire takes one slot for ownerID before any host exists, or refuses with
// ports.ModelHostsBusy over the owner's cap and ports.ErrModelHostsFull over
// the fleet's. The release it returns stops renewing and deletes the slot.
func (s *ChatGuestSlots) Acquire(ctx context.Context, ownerID int64) (func(context.Context), error) {
	if ownerID <= 0 {
		return nil, errors.New("model host slot needs an owner")
	}
	var leaseID string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, chatGuestSlotsLock); err != nil {
			return err
		}
		var owner, fleet int
		if err := tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE owner_id = $1), count(*) FROM chat_guest_slots WHERE expires_at > now()`, ownerID).Scan(&owner, &fleet); err != nil {
			return err
		}
		if owner >= s.perOwner || fleet >= s.fleet {
			// Sized on Tuesday from these lines (CEO a-3j2m0g): which cap, and how
			// many hosts were live when it refused.
			slog.WarnContext(ctx, "model host refused: slots full", "owner_id", ownerID,
				"owner_live", owner, "owner_limit", s.perOwner, "fleet_live", fleet, "fleet_limit", s.fleet)
			return modelHostsBusy(owner >= s.perOwner, s.perOwner)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM chat_guest_slots WHERE expires_at <= now()`); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `INSERT INTO chat_guest_slots (lease_id, owner_id, expires_at)
VALUES (gen_random_uuid(), $1, now() + make_interval(secs => $2)) RETURNING lease_id::text`, ownerID, s.lease.Seconds()).Scan(&leaseID)
	})
	if err != nil {
		return nil, err
	}
	stop, done := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(s.renew)
		defer ticker.Stop()
		held := time.NewTimer(s.maxHold)
		defer held.Stop()
		for {
			select {
			case <-stop:
				return
			case <-held.C:
				slog.Warn("model host slot held past its bound; renewal stopped", "owner_id", ownerID, "max_hold", s.maxHold)
				return
			case <-ticker.C:
				renewCtx, cancel := context.WithTimeout(context.Background(), s.renew)
				if _, err := s.pool.Exec(renewCtx, `UPDATE chat_guest_slots SET expires_at = now() + make_interval(secs => $2) WHERE lease_id = $1`, leaseID, s.lease.Seconds()); err != nil {
					slog.Warn("model host slot renewal failed", "owner_id", ownerID, "error", err)
				}
				cancel()
			}
		}
	}()
	var once sync.Once
	return func(ctx context.Context) {
		once.Do(func() {
			close(stop)
			<-done
			releaseCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()
			if _, err := s.pool.Exec(releaseCtx, `DELETE FROM chat_guest_slots WHERE lease_id = $1`, leaseID); err != nil {
				// The lease lapses on its own; nothing waits on this row.
				slog.Warn("model host slot release failed", "owner_id", ownerID, "error", err)
			}
		})
	}, nil
}

// modelHostsBusy refuses over the per-owner cap, typed chat_guests_busy, or
// over the fleet ceiling. The fleet refusal is also a sandbox no-capacity
// error: a chat turn defers on the dispatcher's capacity ladder, and the
// routes answer it retryably with no new copy (PM d-ic6hp3).
func modelHostsBusy(owner bool, limit int) error {
	if owner {
		return &ports.ModelHostsBusy{Limit: limit}
	}
	return fmt.Errorf("%w: %w", ports.ErrModelHostsFull, &sandbox.StatusError{StatusCode: 503, Code: sandbox.NoCapacityCode, Message: "every model host the fleet allows is running"})
}
