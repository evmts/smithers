package sandbox

import (
	"context"
	"fmt"
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
