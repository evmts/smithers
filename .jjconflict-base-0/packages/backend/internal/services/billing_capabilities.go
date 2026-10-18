package services

import "strings"

// CommerceCapabilities reflects this actual configured account authority.
// Shared composition and the public facade use the same catalog decision.
// Plans, checkout and the portal are offered only when the deployment opens
// them (G7b lever 2); the overview and the credit balance always are.
func (s *BillingService) CommerceCapabilities() BillingCapabilities {
	if s == nil || s.stripe == nil {
		return BillingCapabilities{}
	}
	open := s.config.PlansOpen
	return BillingCapabilities{Overview: true, Plans: open, Checkout: open && s.hasCheckoutPlan(), Portal: open, Webhook: s.config.StripeWebhookSecret != ""}
}

func (s *BillingService) hasCheckoutPlan() bool {
	if s == nil || s.stripe == nil {
		return false
	}
	for _, plans := range s.checkoutPlans {
		for _, plan := range plans {
			if strings.TrimSpace(plan.PriceID) != "" {
				return true
			}
		}
	}
	return false
}
