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

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * The three chat-archive doors #3827 added, through the production auth loader
 * and memberCommands on real PostgreSQL.
 *
 * They were served with NO authorization binding: InstallMemberCommand named
 * no command for them, and memberCommands refuses an unnamed install action
 * for every credential — so on a self-hosted install the History card's own
 * reads answered 403 to the owner. This pins the binding they now carry, which
 * is the catalog's own policy for the two flows that run them:
 *
 *   POST /api/conversations/{b}/archive  -> `archive`  (person only, member)
 *   GET  /api/conversation-archives      -> `history`  (person or app agent)
 *   GET  /api/conversation-archives/{id} -> `history`
 *
 * Nothing is widened: `archive` is agent "never", which is the same refusal
 * Handler.ArchiveConversation already writes for an agent credential, and
 * `history` keeps the member minimum and the app-agent-only actor list the
 * /history flow declares. A read-only or off-roster person is still refused.
 */
func TestChatArchiveRoutesAuthorizeByActorPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	user := func(login string) db.User {
		u, err := q.CreateUser(ctx, db.CreateUserParams{Username: login, LowerUsername: login, DisplayName: login})
		require.NoError(t, err)
		return u
	}
	owner, ben, alice, carol := user("maya"), user("ben"), user("alice"), user("carol")
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
		key := u.Username + "-archive-cookie"
		digest := sha256.Sum256([]byte(key))
		_, err := q.CreateAuthSession(ctx, db.CreateAuthSessionParams{UserID: u.ID, Username: u.Username, SessionKey: hex.EncodeToString(digest[:]), ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
		return key
	}
	// A member's own personal access token: install mode classifies it as a
	// delegated credential, which is exactly what person-only refuses.
	raw := fmt.Sprintf("smithers_%040x", alice.ID)
	sum := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(sum[:])
	_, err = q.CreateAccessToken(ctx, db.CreateAccessTokenParams{UserID: alice.ID, Name: "cli", TokenHash: hash, TokenLastEight: hash[len(hash)-8:],
		Scopes: "read:user,write:repository", ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}})
	require.NoError(t, err)

	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = "selfhost"
	cfg.Auth.SessionCookieName = "session"
	router := chi.NewRouter()
	router.Use(authLoader(q, cfg.Auth))
	router.Use(memberCommands(q))
	served := func(w http.ResponseWriter, r *http.Request) {
		// The handler resolves the SAME command the middleware decided, the
		// way chat's own handlers resolve their scope after admission.
		command := middleware.InstallMemberCommand(r.Method, r.URL.EscapedPath())
		_, err := services.Authorize(r.Context(), nil, command)
		require.NoError(t, err)
		w.WriteHeader(http.StatusOK)
	}
	routes := []struct{ method, path, command string }{
		{"POST", "/api/conversations/main/archive", "archive"},
		{"GET", "/api/conversation-archives", "history"},
		{"GET", "/api/conversation-archives/8f1c2b3a", "history"},
	}
	for _, route := range routes {
		require.Equal(t, route.command, middleware.InstallMemberCommand(route.method, route.path), route.path)
		router.MethodFunc(route.method, route.path, served)
	}
	call := func(method, path, cookie, bearer string) (int, map[string]any) {
		request := httptest.NewRequest(method, path, strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
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

	// Every member's own browser session reaches all three, which is the 403
	// the History card used to read instead.
	for _, who := range []string{"owner", "maintainer", "member"} {
		for _, route := range routes {
			status, envelope := call(route.method, route.path, cookies[who], "")
			require.Equal(t, http.StatusOK, status, "%s %s %s %v", who, route.method, route.path, envelope)
		}
	}
	// Somebody who is not on the roster reads no archive and ends no chat.
	for _, route := range routes {
		status, envelope := call(route.method, route.path, cookies["off roster"], "")
		require.Equal(t, http.StatusForbidden, status, route.path)
		// The install's own member boundary refuses before command policy.
		require.Equal(t, "Not a member of this install", envelope["message"], route.path)
	}
	// A member's token is not the member. Archiving is the person's own act,
	// refused `never`; the archive reads need the browser session the
	// /history flow runs in.
	for _, expected := range []struct {
		method, path, class, code string
	}{
		{"POST", "/api/conversations/main/archive", "never", "never"},
		{"GET", "/api/conversation-archives", "permission", "permission"},
		{"GET", "/api/conversation-archives/8f1c2b3a", "permission", "permission"},
	} {
		status, envelope := call(expected.method, expected.path, "", raw)
		require.Equal(t, http.StatusForbidden, status, "%s %s %v", expected.method, expected.path, envelope)
		require.Equal(t, expected.class, envelope["class"], expected.path)
		require.Equal(t, expected.code, envelope["code"], expected.path)
	}
	// A suspended member is refused before command policy, like every other
	// mapped route.
	_, err = pool.Exec(ctx, `UPDATE collaborators SET suspended_at=now() WHERE user_id=$1`, alice.ID)
	require.NoError(t, err)
	for _, route := range routes {
		status, envelope := call(route.method, route.path, cookies["member"], "")
		require.Equal(t, http.StatusUnauthorized, status, route.path)
		require.Equal(t, "unauthenticated", envelope["code"], route.path)
	}
}
