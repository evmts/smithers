package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

func TestDecodeMainViewPatch(t *testing.T) {
	for _, body := range []string{`{"last_seen_seq":0}`, `{"filter":""}`, `{"filter":"working","maximized":true}`, `{"last_seen_seq":9007199254740991}`, `{}`} {
		t.Run(body, func(t *testing.T) {
			_, err := decodeMainViewPatch(httptest.NewRequest("PUT", "/", strings.NewReader(body)), httptest.NewRecorder())
			require.NoError(t, err)
		})
	}
	for _, body := range []string{`null`, `{"last_seen_seq":-1}`, `{"last_seen_seq":1.5}`, `{"last_seen_seq":9007199254740992}`, `{"filter":"bogus"}`, `{"user_id":2}`, `{} {}`, `{"filter":true}`, strings.Repeat("x", 4097)} {
		t.Run(body, func(t *testing.T) {
			_, err := decodeMainViewPatch(httptest.NewRequest("PUT", "/", strings.NewReader(body)), httptest.NewRecorder())
			require.Error(t, err)
		})
	}
}

func FuzzDecodeMainViewPatch(f *testing.F) {
	for _, seed := range []string{`{}`, `{"last_seen_seq":0}`, `{"filter":"working"}`, `null`, `{} {}`, `{"last_seen_seq":-1}`} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, body string) {
		raw, err := decodeMainViewPatch(httptest.NewRequest("PUT", "/", strings.NewReader(body)), httptest.NewRecorder())
		if err != nil {
			return
		}
		require.True(t, json.Valid(raw))
		var patch mainViewPatch
		require.NoError(t, json.Unmarshal(raw, &patch))
		if patch.LastSeenSeq != nil {
			require.GreaterOrEqual(t, *patch.LastSeenSeq, int64(0))
			require.LessOrEqual(t, *patch.LastSeenSeq, int64(9007199254740991))
		}
	})
}

// Real PostgreSQL and HTTP handler: separate browser members, duplicate/stale
// writes, preservation of other conversations, invalid input and cancellation.
func TestConversationViewStateIntegration(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := context.Background()
	q := db.New(pool)
	var owner, alice, repo int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username,display_name) VALUES ('maya','maya','Maya') RETURNING id`).Scan(&owner))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO users(username,lower_username,display_name) VALUES ('alice','alice','Alice') RETURNING id`).Scan(&alice))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(user_id,name,lower_name) VALUES ($1,'app','app') RETURNING id`, owner).Scan(&repo))
	_, err := pool.Exec(ctx, `INSERT INTO self_host_owners(singleton,user_id) VALUES(true,$1)`, owner)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission,view_state) VALUES ($1,$2,'admin','{"other":{"last_seen_seq":17}}'),($1,$3,'write','{}')`, repo, owner, alice)
	require.NoError(t, err)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: []byte(`{"owner_login":"maya","repository_name":"app"}`)}))
	h := &ConversationViewHandler{Queries: q}
	for _, user := range []int64{owner, alice} {
		_, err := q.CreateAuthSession(ctx, db.CreateAuthSessionParams{UserID: user, Username: fmt.Sprint(user), SessionKey: fmt.Sprint(user), ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
	}
	call := func(user int64, method, body string) (int, string) {
		req := httptest.NewRequest(method, "/api/conversations/main/view-state", strings.NewReader(body))
		req = req.WithContext(middleware.ContextWithAuthInfo(ctx, &middleware.AuthInfo{User: &db.User{ID: user}, SessionHash: fmt.Sprint(user)}))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w.Code, w.Body.String()
	}
	for _, body := range []string{`{"last_seen_seq":5,"filter":"working"}`, `{"last_seen_seq":5}`, `{"last_seen_seq":2}`} {
		code, raw := call(owner, "PUT", body)
		require.Equal(t, 200, code, raw)
		require.Contains(t, raw, `"last_seen_seq":5`)
		require.Contains(t, raw, `"filter":"working"`)
	}
	code, raw := call(alice, "GET", "")
	require.Equal(t, 200, code, raw)
	require.Contains(t, raw, `"last_seen_seq":0`)
	require.NotContains(t, raw, "working")
	code, raw = call(owner, "PUT", `{"user_id":1}`)
	require.Equal(t, 400, code, raw)
	code, raw = call(owner, "GET", "")
	require.Equal(t, 200, code, raw)
	require.Contains(t, raw, `"last_seen_seq":5`)
	var other int
	require.NoError(t, pool.QueryRow(ctx, `SELECT (view_state->'other'->>'last_seen_seq')::int FROM collaborators WHERE repository_id=$1 AND user_id=$2`, repo, owner).Scan(&other))
	require.Equal(t, 17, other)
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = q.SaveMainViewState(canceled, repo, owner, json.RawMessage(`{"last_seen_seq":6}`))
	require.Error(t, err)
	code, raw = call(owner, "GET", "")
	require.Equal(t, 200, code, raw)
	require.Contains(t, raw, `"last_seen_seq":5`)
	// Merge ordering is local to the repo and immutable even if stack rows move.
	_, err = q.RequestMythicalBootstrap(ctx, repo, owner, 1, false)
	require.NoError(t, err)
	for i := 1; i <= 3; i++ {
		item, _, err := q.InsertMythicalItem(ctx, db.MythicalItem{RepositoryID: repo, State: "running"})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `UPDATE mythical_items SET state='landed' WHERE id=$1`, item.ID)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `UPDATE mythical_items SET stack_position=99,merge_seq=777 WHERE id=$1`, item.ID)
		require.NoError(t, err)
		var seq int
		require.NoError(t, pool.QueryRow(ctx, `SELECT merge_seq FROM mythical_items WHERE id=$1`, item.ID).Scan(&seq))
		require.Equal(t, i, seq, fmt.Sprint(item.ID))
	}
	_ = http.MethodPut
}
