package compose

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * The install's declared issue-transition door (#4067, M-47).
 *
 * The install client addresses every GitHub issue act at `/api/issues{path}`
 * (`IssuesSeam.ts` `githubIssueActUrl`), so `/issues.transition` on an
 * install sends
 *
 *	POST /api/issues/{number}/transitions/{id}
 *
 * The install route group served create, list, get, request-status, comment,
 * close, reopen and comment-edit — and NO transition route. The declared
 * workflow M-47 names was therefore reachable only through the repo-scoped
 * hosted door, so the same declared move had no install HTTP door at all.
 *
 * These two tests are the door's own regression: the composed install router
 * serves exactly the pattern the client builds, and the door carries the SAME
 * `issues.transition` authority its siblings carry on the same writer. No
 * second lifecycle, policy engine, command or action vocabulary exists for
 * it: `issues.transition` is already the action.
 */

// installIssueTransitionPattern is the door the install client's own URL
// builder produces. The client is not changed by this lane; the server grows
// the door it already addresses.
const installIssueTransitionPattern = "/api/issues/{number}/transitions/{id}"

func TestInstallCompositionServesTheDeclaredIssueTransitionDoor(t *testing.T) {
	t.Parallel()
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeSelfHosted
	router := openAPIConformanceRouter(cfg)

	served := map[string]servedRoute{}
	walkServedRoutes(t, router, served)
	require.Contains(t, served, "post "+installIssueTransitionPattern,
		"the install client addresses POST "+installIssueTransitionPattern+"; the install router must serve it")
	// Its siblings on the same durable writer are untouched.
	for _, sibling := range []string{
		"post /api/issues/{number}/close",
		"post /api/issues/{number}/reopen",
		"post /api/issues/{number}/comments",
		"patch /api/issues/comments/{id}",
		"get /api/issues/requests/{id}",
	} {
		require.Contains(t, served, sibling, sibling+" must keep its door")
	}
	// The repo-scoped hosted transition door keeps its own, separate route.
	require.Contains(t, served, "post /api/repos/{owner}/{repo}/github/issues/{number}/transitions/{id}")

	// The concrete URL the client builds reaches a handler rather than the
	// router's 404: a pattern that merely exists under another shape would
	// still leave the client's request unserved.
	for _, path := range []string{"/api/issues/7/transitions/accept", "/api/issues/7/transitions/e2e-accept"} {
		rctx := chi.NewRouteContext()
		require.True(t, router.Match(rctx, http.MethodPost, path), path+" must route to the install transition door")
		require.Equal(t, installIssueTransitionPattern, rctx.RoutePattern(), path)
	}
	// And it is a POST door only: no transition is read, replaced or deleted.
	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete, http.MethodPut} {
		require.False(t, router.Match(chi.NewRouteContext(), method, "/api/issues/7/transitions/accept"),
			method+" must not reach the transition door")
	}
}

// The door's authority, on real PostgreSQL through the production auth loader
// and memberCommands: the command one install request binds is the catalog's
// own `issues.transition`, and every credential's outcome is the outcome its
// siblings on the same writer already give. Nothing is widened for it.
func TestInstallIssueTransitionDoorAuthorizesLikeItsSiblingsPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	person := func(login string) db.User {
		u, err := q.CreateUser(ctx, db.CreateUserParams{Username: login, LowerUsername: login, DisplayName: login})
		require.NoError(t, err)
		return u
	}
	owner, ben, alice, carol := person("maya"), person("ben"), person("alice"), person("carol")
	_, err := pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES($1)`, owner.ID)
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner.ID, Valid: true}, Name: "demo", LowerName: "demo", DefaultBookmark: "main"})
	require.NoError(t, err)
	binding := fmt.Sprintf(`{"owner_login":"maya","repository_name":"demo","repository_id":%d}`, repo.ID)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: []byte(binding)}))
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "owner.access", Value: []byte(binding[:len(binding)-1] + `,"last_access_check_at":"2026-10-05T10:00:00Z"}`)}))
	for _, row := range []struct {
		user       db.User
		permission string
	}{{owner, "admin"}, {ben, "admin"}, {alice, "write"}} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,$3)`, repo.ID, row.user.ID, row.permission)
		require.NoError(t, err)
	}
	session := func(u db.User) string {
		key := u.Username + "-transition-cookie"
		digest := sha256.Sum256([]byte(key))
		_, err := q.CreateAuthSession(ctx, db.CreateAuthSessionParams{UserID: u.ID, Username: u.Username, SessionKey: hex.EncodeToString(digest[:]), ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		return key
	}
	// A member's own personal access token: an install classifies it as a
	// delegated credential, which is what the catalog's actor rule decides on.
	raw := fmt.Sprintf("smithers_%040x", alice.ID)
	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])
	_, err = q.CreateAccessToken(ctx, db.CreateAccessTokenParams{UserID: alice.ID, Name: "cli", TokenHash: hash, TokenLastEight: hash[len(hash)-8:],
		Scopes: "read:user,write:repository,via:codex", ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
	require.NoError(t, err)

	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Auth.SessionCookieName = "session"
	router := chi.NewRouter()
	router.Use(authLoader(q, cfg.Auth))
	router.Use(memberCommands(q))
	// The handler resolves the SAME command the middleware decided, the way
	// the install issue handlers resolve theirs after admission, and reports
	// it so the binding is read off the product rather than asserted twice.
	served := func(w http.ResponseWriter, r *http.Request) {
		command := middleware.InstallMemberCommand(r.Method, r.URL.EscapedPath())
		_, err := services.Authorize(r.Context(), nil, command)
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"command":%q}`, command)
	}
	const transition = "/api/issues/6/transitions/accept"
	// The two siblings on the same durable writer are the ORACLE: the new
	// door may answer each credential exactly as they do, never better.
	siblings := []string{"/api/issues/6/close", "/api/issues/6/reopen"}
	for _, path := range append([]string{transition}, siblings...) {
		router.Post(path, served)
	}
	call := func(path, cookie, bearer string) (int, map[string]any) {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(""))
		request.Header.Set("Idempotency-Key", "transition-door-1")
		if cookie != "" {
			request.AddCookie(&http.Cookie{Name: "session", Value: cookie})
		}
		if bearer != "" {
			request.Header.Set("Authorization", "Bearer "+bearer)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		var envelope map[string]any
		_ = json.Unmarshal(response.Body.Bytes(), &envelope)
		return response.Code, envelope
	}

	cookies := map[string]string{"owner": session(owner), "maintainer": session(ben), "member": session(alice), "off roster": session(carol)}

	// The command one install request binds for this door is the catalog's
	// own transition row, not a label, repository or account command.
	status, envelope := call(transition, cookies["owner"], "")
	require.Equal(t, http.StatusOK, status, envelope)
	require.Equal(t, "issues.transition", envelope["command"])

	// Owner, maintainer and member all reach it, because the row is
	// member-level — the same roles its siblings admit.
	for who, cookie := range map[string]string{"owner": cookies["owner"], "maintainer": cookies["maintainer"], "member": cookies["member"]} {
		for _, path := range append([]string{transition}, siblings...) {
			status, envelope := call(path, cookie, "")
			require.Equal(t, http.StatusOK, status, "%s %s %v", who, path, envelope)
		}
	}

	// Somebody off the roster moves nothing, and is refused by the install's
	// own member boundary before any command policy runs.
	for _, path := range append([]string{transition}, siblings...) {
		status, envelope := call(path, cookies["off roster"], "")
		require.Equal(t, http.StatusForbidden, status, path)
		require.Equal(t, "Not a member of this install", envelope["message"], path)
	}

	// A member's delegated credential meets the SAME answer on the
	// transition door as on its siblings: the door adds no authority of its
	// own and waives nothing either.
	wantStatus, wantEnvelope := call(siblings[0], "", raw)
	// The oracle is a REFUSAL, so the comparison below is not vacuous: an
	// external agent is not on this row's actor list.
	require.Equal(t, http.StatusForbidden, wantStatus, wantEnvelope)
	require.Equal(t, "permission", wantEnvelope["code"], wantEnvelope)
	for _, path := range append([]string{transition}, siblings[1:]...) {
		status, envelope := call(path, "", raw)
		require.Equal(t, wantStatus, status, "%s: %v", path, envelope)
		require.Equal(t, wantEnvelope["code"], envelope["code"], path)
		require.Equal(t, wantEnvelope["class"], envelope["class"], path)
	}

	// A suspended member is refused before command policy, like every other
	// mapped install route.
	_, err = pool.Exec(ctx, `UPDATE collaborators SET suspended_at=now() WHERE user_id=$1`, alice.ID)
	require.NoError(t, err)
	for _, path := range append([]string{transition}, siblings...) {
		status, envelope := call(path, cookies["member"], "")
		require.Equal(t, http.StatusUnauthorized, status, path)
		require.Equal(t, "unauthenticated", envelope["code"], path)
	}
}
