package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// ServicePayerUsageObserver publishes the machine service payer's use of its
// plan (plue#839). payer is the fixed "service"; resource is "concurrency" or
// "egress".
type ServicePayerUsageObserver interface {
	SetSandboxPayerUsageRatio(payer, resource string, ratio float64)
	ObserveRuntimeMetricsCollectionFailure(collector string)
}

// ServicePayerUsageStore reads the machine service user and a payer's egress
// on one day. The generated product queries satisfy it.
type ServicePayerUsageStore interface {
	GetBranchMachineOwner(ctx context.Context) (int64, error)
	GetSandboxEgressDailyBytes(ctx context.Context, arg db.GetSandboxEgressDailyBytesParams) (int64, error)
}

// RunServicePayerUsageCollector refreshes the service payer's usage gauges
// immediately and then every interval until ctx is cancelled. Signup is open,
// and the payer's plan carries every listed organization's machines, so an
// alert reads these before the plan refuses a lane (Security s-6tctk6).
func RunServicePayerUsageCollector(ctx context.Context, policy BillingPolicy, store ServicePayerUsageStore, servicePayerOrgs []int64, observer ServicePayerUsageObserver, interval time.Duration) {
	if policy == nil || store == nil || observer == nil || interval <= 0 {
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for ctx.Err() == nil {
		collectServicePayerUsage(ctx, policy, store, servicePayerOrgs, observer, runtimeMetricsTimeout)
		select {
		case <-ctx.Done():
		case <-ticker.C:
		}
	}
}

// collectServicePayerUsage publishes running sandboxes over the plan's
// concurrent sandboxes, and today's charged egress over its daily egress. A
// plan without a limit publishes zero. A failed read keeps the last values.
func collectServicePayerUsage(ctx context.Context, policy BillingPolicy, store ServicePayerUsageStore, servicePayerOrgs []int64, observer ServicePayerUsageObserver, timeout time.Duration) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	concurrency, egress, ok, err := servicePayerUsage(ctx, policy, store, servicePayerOrgs)
	if err != nil {
		observer.ObserveRuntimeMetricsCollectionFailure("service_payer_usage")
		slog.Warn("runtime metrics collection failed", "metric", "service_payer_usage", "error", err)
		return
	}
	if ok {
		observer.SetSandboxPayerUsageRatio("service", "concurrency", concurrency)
		observer.SetSandboxPayerUsageRatio("service", "egress", egress)
	}
}

func servicePayerUsage(ctx context.Context, policy BillingPolicy, store ServicePayerUsageStore, servicePayerOrgs []int64) (concurrency, egress float64, ok bool, err error) {
	service, err := store.GetBranchMachineOwner(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, false, nil
	}
	if err != nil {
		return 0, 0, false, err
	}
	payer := sandbox.BillingOwner{Type: BillingOwnerTypeUser, ID: service}
	day := time.Now().UTC().Truncate(24 * time.Hour)
	used, err := store.GetSandboxEgressDailyBytes(ctx, db.GetSandboxEgressDailyBytesParams{Scope: payer.Scope(), Day: pgtype.Date{Time: day, Valid: true}})
	if err != nil {
		return 0, 0, false, err
	}
	entitlement, err := policy.SandboxEntitlement(sandbox.WithServicePayerOrgs(sandbox.WithBillingOwner(ctx, payer), servicePayerOrgs), service)
	if err != nil {
		return 0, 0, false, err
	}
	if limit, finite := entitlement.ConcurrentLimit(); finite && limit > 0 {
		concurrency = float64(entitlement.ConcurrentInUse) / float64(limit)
	}
	if entitlement.EgressBytesPerDay > 0 {
		egress = float64(used) / float64(entitlement.EgressBytesPerDay)
	}
	return concurrency, egress, true, nil
}
