package identity_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/identity"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

const memberID, strangerID, provisionalID = 7, 8, 9

// roster answers AuthorizeMemberUser from a set the test edits, and serves
// the token and repository reads every transport needs before the boundary.
// provisional marks a claimed owner GitHub has not yet confirmed.
type roster struct {
	members     map[int64]bool
	provisional map[int64]bool
	err         error
	reads       int
}

func (r *roster) AuthorizeMemberUser(_ context.Context, userID int64) (db.AuthorizeMemberUserRow, error) {
	r.reads++
	if r.err != nil {
		return db.AuthorizeMemberUserRow{}, r.err
	}
	if !r.members[userID] {
		return db.AuthorizeMemberUserRow{}, pgx.ErrNoRows
	}
	return db.AuthorizeMemberUserRow{ID: userID, Provisional: r.provisional[userID]}, nil
}

// Each token names its user: "token-7" belongs to user 7.
func (r *roster) GetAuthInfoByTokenHash(_ context.Context, tokenHash string) (db.GetAuthInfoByTokenHashRow, error) {
	for _, id := range []int64{memberID, strangerID, provisionalID} {
		if tokenHash == hashToken(tokenFor(id)) {
			return db.GetAuthInfoByTokenHashRow{ID: id, Username: "user", IsActive: true, TokenID: id, TokenScopes: "read:repository,read:user"}, nil
		}
	}
	return db.GetAuthInfoByTokenHashRow{}, pgx.ErrNoRows
}

func (r *roster) GetAuthSessionBySessionKey(context.Context, string) (db.AuthSession, error) {
	return db.AuthSession{}, pgx.ErrNoRows
}
func (r *roster) RefreshAuthSession(context.Context, db.RefreshAuthSessionParams) (db.AuthSession, error) {
	return db.AuthSession{}, pgx.ErrNoRows
}
func (r *roster) GetFirstPartyOAuth2AccessTokenByHash(context.Context, string) (db.Oauth2AccessToken, error) {
	return db.Oauth2AccessToken{}, pgx.ErrNoRows
}
func (r *roster) UpdateAccessTokenLastUsed(context.Context, int64) error { return nil }
func (r *roster) GetUserByID(_ context.Context, id int64) (db.User, error) {
	return db.User{ID: id, Username: "user", IsActive: true}, nil
}
func (r *roster) GetRepoByOwnerAndLowerName(context.Context, db.GetRepoByOwnerAndLowerNameParams) (db.Repository, error) {
	return db.Repository{ID: 1, Name: "repo", LowerName: "repo"}, nil
}
func (r *roster) ListAllProtectedBookmarksByRepo(context.Context, int64) ([]db.ProtectedBookmark, error) {
	return nil, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func tokenFor(userID int64) string {
	return fmt.Sprintf("smithers_%040d", userID)
}

func TestMemberBoundaryAdmitsOnlyMembers(t *testing.T) {
	ctx := context.Background()
	r := &roster{members: map[int64]bool{memberID: true}}
	boundary := identity.NewMemberBoundary(r)

	require.Nil(t, boundary.AuthorizeMember(ctx, memberID))
	refused := boundary.AuthorizeMember(ctx, strangerID)
	require.NotNil(t, refused)
	assert.Equal(t, http.StatusForbidden, refused.Status)
	assert.Equal(t, pkgerrors.CodeNotAMember, refused.Code)

	// The roster is read on every check: a removal applies at once.
	delete(r.members, memberID)
	require.NotNil(t, boundary.AuthorizeMember(ctx, memberID))
	assert.Equal(t, 3, r.reads)
}

func TestMemberBoundaryFailsClosed(t *testing.T) {
	ctx := context.Background()
	outage := identity.NewMemberBoundary(&roster{members: map[int64]bool{memberID: true}, err: errors.New("database down")})
	err := outage.AuthorizeMember(ctx, memberID)
	require.NotNil(t, err)
	assert.Equal(t, http.StatusInternalServerError, err.Status)

	unconfigured := identity.NewMemberBoundary(nil)
	require.NotNil(t, unconfigured.AuthorizeMember(ctx, memberID))
	var nilBoundary *identity.MemberBoundary
	require.NotNil(t, nilBoundary.AuthorizeMember(ctx, memberID))
}

// The one boundary guards every transport on the install: HTTP credentials,
// SSE tickets and git over HTTP.
func TestMemberBoundaryRefusesNonMembersOnEveryTransport(t *testing.T) {
	r := &roster{members: map[int64]bool{memberID: true}}
	boundary := identity.NewMemberBoundary(r)

	t.Run("http", func(t *testing.T) {
		for _, tc := range []struct {
			user int64
			want int
		}{{memberID, http.StatusNoContent}, {strangerID, http.StatusForbidden}} {
			handler := middleware.AuthLoader(r, config.AuthConfig{Mode: config.AuthModeSelfHosted}, boundary)(
				http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
			request := httptest.NewRequest(http.MethodGet, "/api/user", nil)
			request.Header.Set("Authorization", "Bearer "+tokenFor(tc.user))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assert.Equal(t, tc.want, response.Code, "user %d: %s", tc.user, response.Body.String())
		}
	})

	t.Run("sse ticket", func(t *testing.T) {
		for _, tc := range []struct {
			user int64
			want int
		}{{memberID, http.StatusNoContent}, {strangerID, http.StatusForbidden}} {
			validator := ticketFor(tc.user)
			handler := middleware.SSETicketAuth(validator, nil, boundary)(
				http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/notifications/stream?ticket=t", nil))
			assert.Equal(t, tc.want, response.Code, "user %d: %s", tc.user, response.Body.String())
		}
	})

	t.Run("git over http", func(t *testing.T) {
		for _, tc := range []struct {
			user   int64
			admits bool
		}{{memberID, true}, {strangerID, false}} {
			repoHost := &repoHostFake{}
			proxy := services.NewGitHTTPProxyService(r, allowAll{}, repoHost, services.WithGitHTTPMemberBoundary(r))
			_, err := proxy.ProxyInfoRefs(context.Background(), "owner", "repo", "git-upload-pack", tokenFor(tc.user), io.Discard)
			if tc.admits {
				require.NoError(t, err)
				assert.Equal(t, 1, repoHost.calls)
				continue
			}
			var apiErr *pkgerrors.APIError
			require.ErrorAs(t, err, &apiErr)
			assert.Equal(t, pkgerrors.CodeNotAMember, apiErr.Code)
			assert.Zero(t, repoHost.calls, "a non-member never reaches the repository")
		}
	})
}

// A provisional owner may run setup and nothing else, on any transport
// (spec §5.1.0): git and live streams are never setup.
func TestMemberBoundaryKeepsAProvisionalOwnerToSetup(t *testing.T) {
	r := &roster{members: map[int64]bool{provisionalID: true}, provisional: map[int64]bool{provisionalID: true}}
	boundary := identity.NewMemberBoundary(r)

	t.Run("http", func(t *testing.T) {
		for _, tc := range []struct {
			method, path string
			want         int
		}{
			{http.MethodGet, "/api/user", http.StatusForbidden},
			{http.MethodGet, "/api/install", http.StatusNoContent},
			{http.MethodPost, "/api/install/setup/repository", http.StatusNoContent},
			{http.MethodGet, "/api/auth/github", http.StatusNoContent},
			{http.MethodGet, "/setup/github/callback", http.StatusNoContent},
			{http.MethodGet, "/setup/github/installed", http.StatusNoContent},
			{http.MethodGet, "/setup/github/other", http.StatusForbidden},
			{http.MethodPost, "/api/auth/logout", http.StatusForbidden},
			{http.MethodPatch, "/api/user", http.StatusForbidden},
			{http.MethodGet, "/api/user/repos", http.StatusForbidden},
			{http.MethodGet, "/api/todos", http.StatusForbidden},
			{http.MethodPost, "/api/todos", http.StatusForbidden},
			{http.MethodGet, "/api/installation", http.StatusForbidden},
			{http.MethodPost, "/api/install/quiesce", http.StatusForbidden},
			{http.MethodDelete, "/api/install", http.StatusForbidden},
			{http.MethodGet, "/api/install/setup/repository", http.StatusForbidden},
			{http.MethodPost, "/api/install/setup/unknown", http.StatusForbidden},
		} {
			handler := middleware.AuthLoader(r, config.AuthConfig{Mode: config.AuthModeSelfHosted}, boundary)(
				http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
			request := httptest.NewRequest(tc.method, tc.path, nil)
			request.Header.Set("Authorization", "Bearer "+tokenFor(provisionalID))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assert.Equal(t, tc.want, response.Code, "%s %s: %s", tc.method, tc.path, response.Body.String())
			if tc.want == http.StatusForbidden {
				assert.Contains(t, response.Body.String(), `"code":"owner_unverified"`)
			}
		}
	})

	t.Run("sse ticket", func(t *testing.T) {
		handler := middleware.SSETicketAuth(ticketFor(provisionalID), nil, boundary)(
			http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/notifications/stream?ticket=t", nil))
		assert.Equal(t, http.StatusForbidden, response.Code, response.Body.String())
		assert.Contains(t, response.Body.String(), `"code":"owner_unverified"`)
	})

	t.Run("git over http", func(t *testing.T) {
		repoHost := &repoHostFake{}
		proxy := services.NewGitHTTPProxyService(r, allowAll{}, repoHost, services.WithGitHTTPMemberBoundary(r))
		_, err := proxy.ProxyInfoRefs(context.Background(), "owner", "repo", "git-upload-pack", tokenFor(provisionalID), io.Discard)
		var apiErr *pkgerrors.APIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, pkgerrors.CodeOwnerUnverified, apiErr.Code)
		assert.Zero(t, repoHost.calls)
	})

	// Verification ends the provisional phase on the next request.
	delete(r.provisional, provisionalID)
	require.Nil(t, boundary.AuthorizeMember(context.Background(), provisionalID))
}

type ticketFor int64

func (u ticketFor) ValidateTicket(context.Context, string) (*middleware.SSETicketPrincipal, error) {
	return &middleware.SSETicketPrincipal{User: &db.User{ID: int64(u), Username: "user"}}, nil
}

type allowAll struct{}

func (allowAll) Authorize(context.Context, int64, string, string, services.AccessMode) error {
	return nil
}

type repoHostFake struct{ calls int }

func (f *repoHostFake) InfoRefs(_ context.Context, _, _, _ string, stdout io.Writer) (string, error) {
	f.calls++
	_, _ = io.Copy(stdout, bytes.NewBufferString("advertisement"))
	return "application/x-git-upload-pack-advertisement", nil
}
func (f *repoHostFake) ProxyUploadPack(context.Context, string, string, io.Reader, io.Writer) error {
	return nil
}
func (f *repoHostFake) ProxyReceivePack(context.Context, string, string, io.Reader, io.Writer, ...repohost.ReceivePackMetadata) error {
	return nil
}

// §5.1.0: credential minting is never a provisional setup step.
func TestMemberBoundaryMintDropsSetupScope(t *testing.T) {
	r := &roster{members: map[int64]bool{provisionalID: true}, provisional: map[int64]bool{provisionalID: true}}
	boundary := identity.NewMemberBoundary(r)
	ctx := identity.WithSetupRequest(context.Background())
	require.Nil(t, boundary.AuthorizeMember(ctx, provisionalID))
	err := boundary.AuthorizeMember(identity.WithoutSetupRequest(ctx), provisionalID)
	require.NotNil(t, err)
	require.Equal(t, pkgerrors.CodeOwnerUnverified, err.Code)
	require.Nil(t, boundary.AuthorizeMember(ctx, provisionalID), "removing scope cannot mutate the parent request")
}
