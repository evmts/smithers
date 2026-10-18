package compose

import (
	"context"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// servicePayerUsageDuty is the worker duty that publishes the machine service
// payer's usage gauges (plue#839), or nil when the install lists no
// organization in billing.service_payer_org_ids: the service user then pays
// for no organization's machines, and a self-hosted install reads nothing for
// it.
func servicePayerUsageDuty(ctx context.Context, cfg *config.Config, policy services.BillingPolicy, store services.ServicePayerUsageStore, observer services.ServicePayerUsageObserver) func() {
	orgs := cfg.Billing.ServicePayerOrgIDs
	if len(orgs) == 0 {
		return nil
	}
	return func() {
		services.RunServicePayerUsageCollector(ctx, policy, store, orgs, observer, services.RuntimeMetricsInterval)
	}
}
