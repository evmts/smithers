package services

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// A DATABASE LEASE IS KEPT BY RENEWING IT, and ends the moment it cannot be.
//
// Two claims in this package are committed leases with a heartbeat: a
// sandbox-plane workflow run's claim (workflow_sandbox_claims, #3155) and a
// workspace's provisioning claim (workspace_provisioning_leases, #4294).
// Neither holds a connection or a transaction across the work it owns. Both
// renew on an interval, retry a failed renewal while the last confirmed expiry
// still holds, and end ownership locally slightly BEFORE the database expiry,
// so another claimant is never admitted while this holder still acts as owner.

// leaseExpirySafetyMargin is how long before the database expiry a holder
// stops. It absorbs ordinary clock skew and response latency.
const leaseExpirySafetyMargin = 5 * time.Second

// leaseCancellationDeadline returns a conservative local deadline derived from
// the database-authoritative lease expiry. Short test leases use a
// proportional margin so the watchdog remains deterministic.
func leaseCancellationDeadline(expiresAt, now time.Time) time.Time {
	remaining := expiresAt.Sub(now)
	if remaining <= 0 {
		return now
	}
	margin := leaseExpirySafetyMargin
	if proportional := remaining / 4; margin > proportional {
		margin = proportional
	}
	return expiresAt.Add(-margin)
}

// leaseLoss is how keepLease ended.
type leaseLoss int

const (
	// leaseReleased: ctx ended, so the holder finished or shut down. The
	// holder still owns the lease and releases it itself.
	leaseReleased leaseLoss = iota
	// leaseExpired: no renewal was confirmed before the last confirmed
	// expiry's local deadline.
	leaseExpired
	// leaseTaken: a renewal reported the lease gone: it expired in the
	// database or another claimant owns it.
	leaseTaken
)

// errLeaseRenewalWithoutExpiry is what a renewal adapter returns when the
// database answered without an expiry. Ownership cannot be confirmed, so it
// ends the lease as leaseTaken does.
var errLeaseRenewalWithoutExpiry = errors.New("lease renewal returned no expiry")

// keepLease renews a lease every interval until ctx ends or ownership ends,
// and says which. renew returns the new database expiry, or pgx.ErrNoRows (or
// errLeaseRenewalWithoutExpiry) when the lease is no longer the holder's; that
// error is returned beside leaseTaken. Each renewal is bounded by the current
// ownership deadline, so a wedged connection cannot keep the holder past
// ownership. failed hears each renewal error that did not end ownership.
func keepLease(ctx context.Context, interval time.Duration, expiresAt time.Time, renew func(context.Context) (time.Time, error), failed func(error)) (leaseLoss, error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := leaseCancellationDeadline(expiresAt, time.Now())

	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return leaseExpired, nil
		}
		expiryTimer := time.NewTimer(remaining)

		select {
		case <-ctx.Done():
			expiryTimer.Stop()
			return leaseReleased, nil
		case <-expiryTimer.C:
			return leaseExpired, nil
		case <-ticker.C:
			expiryTimer.Stop()
			renewCtx, cancelRenew := context.WithDeadline(ctx, deadline)
			renewedUntil, err := renew(renewCtx)
			cancelRenew()
			if err != nil {
				if ctx.Err() != nil {
					return leaseReleased, nil
				}
				if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, errLeaseRenewalWithoutExpiry) {
					return leaseTaken, err
				}
				failed(err)
				continue
			}
			deadline = leaseCancellationDeadline(renewedUntil, time.Now())
		}
	}
}
