// Package guest implements the install's narrow, sponsored public interaction.
// A guest capability has no user, roster, workspace or general API authority.
package guest

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/credits"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/modelprice"
	"github.com/smithersai/smithers/packages/backend/modelproxy"
)

// Refusal contains only a stable diagnostic code and a sign-in action.
type Refusal string

func (r Refusal) Error() string { return string(r) }
func (r Refusal) ModelRefusal() (int, string, string) {
	status := http.StatusTooManyRequests
	if r == "guest_duplicate" {
		status = http.StatusConflict
	}
	if r == "guest_disabled" || r == "guest_unavailable" || r == "guest_unpriced" {
		status = http.StatusServiceUnavailable
	}
	return status, string(r), "Sign in to continue."
}

// Spend binds one invocation to the operator, never to a guest user identity.
type Spend struct {
	DB                                                *pgxpool.Pool
	Config                                            config.GuestConfig
	ID, SessionHash, IPHash, Key, LandingID, Revision string
	RepositoryID                                      int64
	Now                                               func() time.Time
}

const poolLock = "smithers.guest.spend.v1"

func formatID(id int64) string { return strconv.FormatInt(id, 10) }

// Suspended is read on every admission and during a live provider stream.
// Absence enables the configured allowlist; unavailable storage fails closed.
func Suspended(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var disabled bool
	err := pool.QueryRow(ctx, `SELECT COALESCE((SELECT value::text::boolean FROM install_settings WHERE key='guest.suspended'),false)`).Scan(&disabled)
	return disabled, err
}

// SetSuspended serializes the operator switch with admission across replicas.
func SetSuspended(ctx context.Context, pool *pgxpool.Pool, disabled bool) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, poolLock); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO install_settings(key,value) VALUES ('guest.suspended',to_jsonb($1::boolean)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`, disabled)
		return err
	})
}

func (s *Spend) Execute(ctx context.Context, caller modelproxy.Caller, call modelproxy.Call, spend func(context.Context) (modelproxy.Result, error)) error {
	started := time.Now()
	logger := slog.Default().With("landing_id", s.LandingID, "interaction_id", s.ID, "run_id", s.ID, "reservation_id", s.ID, "repository_id", s.RepositoryID)
	_, price, known := modelproxy.Price(call.Provider, call.Model)
	if !known || call.Model != s.Config.Model || call.Provider != s.Config.Provider {
		return Refusal("guest_unpriced")
	}
	bound, err := modelprice.CostNanos(price, price.Maximum(call.Maximum.PromptTokens(), call.Maximum.OutputTokens))
	if err != nil || bound <= 0 {
		return Refusal("guest_unpriced")
	}
	now := time.Now().UTC()
	if s.Now != nil {
		now = s.Now().UTC()
	}
	start, e1 := time.Parse(time.RFC3339, s.Config.WindowStart)
	end, e2 := time.Parse(time.RFC3339, s.Config.WindowEnd)
	if e1 != nil || e2 != nil || !start.Before(end) || now.Before(start) || !now.Before(end) {
		return Refusal("guest_window_closed")
	}
	if bound > s.Config.RequestNanos {
		return Refusal("guest_request_cap")
	}
	alert := false
	err = pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, poolLock); err != nil {
			return err
		}
		var disabled, duplicate bool
		if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT value::text::boolean FROM install_settings WHERE key='guest.suspended'),false),EXISTS(SELECT 1 FROM guest_reservations WHERE repository_id=$1 AND session_hash=$2 AND request_key=$3)`, s.RepositoryID, s.SessionHash, s.Key).Scan(&disabled, &duplicate); err != nil {
			return err
		}
		if disabled || s.Config.Disabled {
			return Refusal("guest_disabled")
		}
		if duplicate {
			return Refusal("guest_duplicate")
		}
		day := now.Truncate(24 * time.Hour)
		var daily, window, requests int64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(charged_nanos) FILTER(WHERE created_at >= $1 AND created_at < $1 + interval '1 day'),0)::bigint,COALESCE(sum(charged_nanos) FILTER(WHERE created_at >= $2 AND created_at < $3),0)::bigint,count(*) FILTER(WHERE ip_hash=$4 AND created_at >= $1 AND created_at < $1 + interval '1 day') FROM guest_reservations`, day, start, end, s.IPHash).Scan(&daily, &window, &requests); err != nil {
			return err
		}
		if bound > s.Config.DailyNanos || daily > s.Config.DailyNanos-bound {
			return Refusal("guest_daily_cap")
		}
		if bound > s.Config.WindowNanos || window > s.Config.WindowNanos-bound {
			return Refusal("guest_window_cap")
		}
		if requests >= int64(s.Config.RequestsPerIP) {
			return Refusal("guest_ip_cap")
		}
		_, err := tx.Exec(ctx, `INSERT INTO guest_reservations(id,repository_id,sponsor_id,session_hash,ip_hash,request_key,landing_id,revision,model,bound_nanos,charged_nanos,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`, s.ID, s.RepositoryID, s.Config.SponsorID, s.SessionHash, s.IPHash, s.Key, s.LandingID, s.Revision, call.Model, bound, now)
		if err != nil {
			return err
		}
		if daily+bound >= s.Config.DailyNanos/2+s.Config.DailyNanos%2 {
			var exists bool
			dayID := day.Unix() / 86400
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM notifications WHERE source_type='guest_spend' AND source_id=$1)`, dayID).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				q := db.New(tx)
				notice, err := q.CreateNotification(ctx, db.CreateNotificationParams{UserID: s.Config.SponsorID, SourceType: "guest_spend", SourceID: pgtype.Int8{Int64: dayID, Valid: true}, Subject: "Guest spend reached 50%", Body: "Guest spend and reservations reached half the daily cap."})
				if err != nil {
					return err
				}
				if err := q.NotifyUser(ctx, db.NotifyUserParams{UserID: s.Config.SponsorID, Payload: `{"type":"guest_spend","id":` + formatID(notice.ID) + `}`}); err != nil {
					return err
				}
				alert = true
			}
		}
		return nil
	})
	if err != nil {
		var refusal Refusal
		if errors.As(err, &refusal) {
			logger.Info("guest admission refused", "stage", "admission", "code", string(refusal), "duration_ms", time.Since(started).Milliseconds())
			return refusal
		}
		return Refusal("guest_unavailable")
	}
	logger.Info("guest reservation committed", "stage", "reserved", "bound_nanos", bound, "duration_ms", time.Since(started).Milliseconds())
	if alert {
		slog.Warn("guest spend threshold", "stage", "alert", "reservation_id", s.ID, "repository_id", s.RepositoryID, "daily_cap_nanos", s.Config.DailyNanos)
	}
	// A persisted reservation is never retried, even if the process dies now.
	// Polling fences active calls on every replica after an operator switch.
	callCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		timer := time.NewTicker(100 * time.Millisecond)
		defer timer.Stop()
		for {
			select {
			case <-callCtx.Done():
				return
			case <-timer.C:
				check, stop := context.WithTimeout(callCtx, time.Second)
				disabled, err := Suspended(check, s.DB)
				stop()
				if err != nil || disabled {
					cancel()
					return
				}
			}
		}
	}()
	disabled, checkErr := Suspended(callCtx, s.DB)
	var result modelproxy.Result
	var spendErr error
	if checkErr != nil || disabled {
		spendErr = Refusal("guest_disabled")
	} else {
		result, spendErr = spend(callCtx)
	}
	cancel()
	<-done
	charge, state := bound, "uncertain"
	if result.Outcome == credits.ModelSucceeded {
		if actual, err := modelprice.CostNanos(price, result.Usage); err == nil && actual <= bound {
			charge, state = actual, "completed"
		}
	}
	finish, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer stop()
	if _, err := s.DB.Exec(finish, `UPDATE guest_reservations SET charged_nanos=$2,state=$3,finished_at=now() WHERE id=$1 AND state='reserved'`, s.ID, charge, state); err != nil {
		slog.Error("guest settlement retained reservation", "reservation_id", s.ID, "code", "guest_settlement_failed")
	}
	logger.Info("guest reservation settled", "stage", state, "charged_nanos", charge, "duration_ms", time.Since(started).Milliseconds())
	return spendErr
}
