package sandbox

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// BillingOwner identifies the repository account paying for a sandbox. It is
// independent of the service identity that owns the machine and its placement.
type BillingOwner struct {
	Type string
	ID   int64
}

func (o BillingOwner) Valid() bool   { return (o.Type == "user" || o.Type == "org") && o.ID > 0 }
func (o BillingOwner) Scope() string { return fmt.Sprintf("%s:%d", o.Type, o.ID) }

type billingOwnerKey struct{}

// WithBillingOwner carries trusted product billing attribution to host adapters.
// It does not authorize access to a repository or a placement.
func WithBillingOwner(ctx context.Context, owner BillingOwner) context.Context {
	return context.WithValue(ctx, billingOwnerKey{}, owner)
}

// BillingOwnerFromContext defaults legacy standalone sandboxes to their user.
func BillingOwnerFromContext(ctx context.Context, userID int64) BillingOwner {
	if owner, ok := ctx.Value(billingOwnerKey{}).(BillingOwner); ok {
		return owner
	}
	return BillingOwner{Type: "user", ID: userID}
}

type servicePayerOrgsKey struct{}

// WithServicePayerOrgs carries the organizations whose repositories' machines
// the machine service user pays for (billing.service_payer_org_ids, plue#839)
// to the queries that count that payer's sandboxes. Without it, the service
// user's counts include no organization's machines.
func WithServicePayerOrgs(ctx context.Context, orgs []int64) context.Context {
	return context.WithValue(ctx, servicePayerOrgsKey{}, slices.Clone(orgs))
}

// ServicePayerOrgsFromContext is never nil, so a query binds an empty array.
func ServicePayerOrgsFromContext(ctx context.Context) []int64 {
	if orgs, ok := ctx.Value(servicePayerOrgsKey{}).([]int64); ok && orgs != nil {
		return orgs
	}
	return []int64{}
}

// ParseServicePayerOrgIDs reads the organizations the machine service user
// pays for from comma- or space-separated values (SMITHERS_BILLING_SERVICE_PAYER_ORG_IDS).
// Every entry must be a positive decimal organization ID; the result is
// sorted, without duplicates, and nil when nothing is listed.
func ParseServicePayerOrgIDs(values ...string) ([]int64, error) {
	var orgs []int64
	for _, value := range values {
		for _, field := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || unicode.IsSpace(r) }) {
			id, err := strconv.ParseInt(field, 10, 64)
			if err != nil || id <= 0 {
				return nil, fmt.Errorf("want positive organization IDs separated by commas, got %q", field)
			}
			orgs = append(orgs, id)
		}
	}
	slices.Sort(orgs)
	return slices.Compact(orgs), nil
}
