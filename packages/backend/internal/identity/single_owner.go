// Package identity contains product-neutral identity boundaries shared by
// HTTP, Git, SSE, and SSH transports.
package identity

import (
	"context"
	stdErrors "errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// MemberQuerier reads a user's place on the install's roster.
type MemberQuerier interface {
	AuthorizeMemberUser(ctx context.Context, userID int64) (db.AuthorizeMemberUserRow, error)
}

// MemberAuthorizer is the common identity check used by every authenticated
// transport on the install. Resource-scoped credentials such as deploy keys
// are checked by their own member-authorized minting paths and do not
// implement this interface.
type MemberAuthorizer interface {
	AuthorizeMember(ctx context.Context, userID int64) *pkgerrors.APIError
}

// MemberBoundary authorizes a credential only while its user is a member of
// the install: on the roster, not removed and not suspended. A provisional
// owner (claimed, GitHub access not yet confirmed) passes only on a setup
// request (spec §5.1.0). It reads the roster on every check, so a removal or
// verification takes effect on the next request.
type MemberBoundary struct {
	queries MemberQuerier
}

func NewMemberBoundary(queries MemberQuerier) *MemberBoundary {
	return &MemberBoundary{queries: queries}
}

func (b *MemberBoundary) AuthorizeMember(ctx context.Context, userID int64) *pkgerrors.APIError {
	if b == nil || b.queries == nil {
		return pkgerrors.Internal("member authorization is not configured")
	}
	member, err := b.queries.AuthorizeMemberUser(ctx, userID)
	if stdErrors.Is(err, pgx.ErrNoRows) {
		return pkgerrors.New(pkgerrors.CodeNotAMember, "not a member of this install")
	}
	if err != nil {
		return pkgerrors.Internal("failed to authorize member").WithCause(err)
	}
	if member.Provisional && !isSetupRequest(ctx) {
		return pkgerrors.New(pkgerrors.CodeOwnerUnverified, "finish setup: GitHub has not confirmed your push access to the install's repository")
	}
	return nil
}

type setupRequestKey struct{}

// WithSetupRequest marks ctx as serving a setup request, the only kind a
// provisional owner may make.
func WithSetupRequest(ctx context.Context) context.Context {
	return context.WithValue(ctx, setupRequestKey{}, true)
}

// WithoutSetupRequest prevents credential minting from inheriting setup scope.
func WithoutSetupRequest(ctx context.Context) context.Context {
	return context.WithValue(ctx, setupRequestKey{}, false)
}

func isSetupRequest(ctx context.Context) bool {
	setup, _ := ctx.Value(setupRequestKey{}).(bool)
	return setup
}

// IsSetupRequest reports whether an HTTP request is part of setup: install
// status and setup steps, the GitHub sign-in round trip. Git and live streams are never setup.
func IsSetupRequest(method, path string) bool {
	if path == "/api/install" {
		return method == http.MethodGet
	}
	if path == "/api/auth/github" || path == "/api/auth/github/callback" || path == "/setup/github/callback" || path == "/setup/github/installed" {
		return method == http.MethodGet
	}
	if method != http.MethodPost {
		return false
	}
	switch path {
	case "/api/install/setup-session", "/api/install/setup/address", "/api/install/setup/app_manifest", "/api/install/setup/sign_in", "/api/install/setup/repository", "/api/install/setup/models", "/api/install/setup/source", "/api/install/setup/machine":
		return true
	}
	return false
}

// IsPreClaimSetupRequest narrows setup to the three pre-claim steps (§16.2).
func IsPreClaimSetupRequest(method, path string) bool {
	if !IsSetupRequest(method, path) {
		return false
	}
	switch path {
	case "/api/install/setup/repository", "/api/install/setup/models", "/api/install/setup/source", "/api/install/setup/machine":
		return false
	}
	return true
}
