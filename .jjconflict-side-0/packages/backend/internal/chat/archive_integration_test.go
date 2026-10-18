package chat

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
)

type archiveReply struct {
	Archive *Archive `json:"archive"`
}

// archiveServer serves the public chat routes as one signed-in person.
func archiveServer(t *testing.T, handler *Handler, userID int64, owner string) *httptest.Server {
	t.Helper()
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			request = request.WithContext(middleware.ContextWithAuthInfo(request.Context(), &middleware.AuthInfo{User: &db.User{ID: userID, Username: owner}, SessionHash: strings.Repeat("a", 64)}))
			next.ServeHTTP(w, request)
		})
	})
	handler.MountPublic(r)
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)
	return server
}

func archiveChat(t *testing.T, server *httptest.Server, branch, body string) (int, *Archive) {
	t.Helper()
	response := postJSON(t, server.Client(), server.URL+"/api/conversations/"+branch+"/archive", []byte(body))
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return response.StatusCode, nil
	}
	var reply archiveReply
	require.NoError(t, json.NewDecoder(response.Body).Decode(&reply))
	return response.StatusCode, reply.Archive
}

func getJSON(t *testing.T, server *httptest.Server, path string, target any) int {
	t.Helper()
	response, err := server.Client().Get(server.URL + path)
	require.NoError(t, err)
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK && target != nil {
		require.NoError(t, json.NewDecoder(response.Body).Decode(target))
	}
	return response.StatusCode
}

func listArchives(t *testing.T, server *httptest.Server) []Archive {
	t.Helper()
	var listing struct {
		Archives []Archive `json:"archives"`
	}
	require.Equal(t, http.StatusOK, getJSON(t, server, ArchivesPath, &listing))
	require.NotNil(t, listing.Archives)
	return listing.Archives
}

func liveEntries(t *testing.T, server *httptest.Server, branch string) []SharedTurn {
	t.Helper()
	var conversation SharedConversation
	require.Equal(t, http.StatusOK, getJSON(t, server, "/api/conversations/"+branch, &conversation))
	return conversation.Entries
}

func runArchiveDispatcher(t *testing.T, store *Store, every time.Duration) *Dispatcher {
	t.Helper()
	dispatcher, err := NewDispatcher(store, streamingHost{store: store, ticks: 1, every: every}, 8, time.Second)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(t.Context())
	finished := make(chan error, 1)
	go func() { finished <- dispatcher.Run(ctx, 2) }()
	t.Cleanup(func() { cancel(); <-finished })
	return dispatcher
}

func TestHostedArchiveMovesTheChatIntoPrivateHistory(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	alice, err := seed.CreateUser(t.Context(), pool, "archive-alice")
	require.NoError(t, err)
	bob, err := seed.CreateUser(t.Context(), pool, "archive-bob")
	require.NoError(t, err)
	handler := &Handler{PrivateConversations: true, Store: store, Dispatcher: runArchiveDispatcher(t, store, time.Millisecond), credentials: newTurnCredentials()}
	a, b := archiveServer(t, handler, alice, "archive-alice"), archiveServer(t, handler, bob, "archive-bob")

	// An empty chat has nothing to move, and leaves no history row behind.
	status, none := archiveChat(t, a, "main", `{}`)
	require.Equal(t, http.StatusOK, status)
	require.Nil(t, none)
	require.Empty(t, listArchives(t, a))

	first := awaitPrompt(t, a, submitPrompt(t, a, "main", "one", "\n  Fix the login bug  \nIt fails on Safari."))
	second := awaitPrompt(t, a, submitPrompt(t, a, "main", "two", "Now add a test"))
	require.Equal(t, int64(1), first.Sequence)
	require.Equal(t, int64(2), second.Sequence)
	awaitPrompt(t, b, submitPrompt(t, b, "main", "one", "Bob keeps his own chat"))
	request, err := http.NewRequest(http.MethodPut, a.URL+"/api/conversations/main/view-state", strings.NewReader(`{"last_seen_seq":2,"toasts_hidden":true}`))
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/json")
	saved, err := a.Client().Do(request)
	require.NoError(t, err)
	saved.Body.Close()
	require.Equal(t, http.StatusOK, saved.StatusCode)

	before := time.Now().Add(-time.Minute).UnixMilli()
	status, archive := archiveChat(t, a, "main", `{"repository":" acme/api ","branch":"feature-x"}`)
	require.Equal(t, http.StatusOK, status)
	require.NotNil(t, archive)
	require.Equal(t, "Fix the login bug", archive.Title)
	require.Equal(t, 2, archive.Entries)
	require.Equal(t, "acme/api", *archive.Repository)
	require.Equal(t, "feature-x", *archive.Branch)
	require.Nil(t, archive.Summary)
	require.Empty(t, archive.Runs)
	require.NotNil(t, archive.Runs)
	require.Equal(t, "archive-alice", archive.ArchivedBy)
	require.GreaterOrEqual(t, archive.FirstAt, before)
	require.LessOrEqual(t, archive.FirstAt, archive.LastAt)
	require.LessOrEqual(t, archive.LastAt, archive.ArchivedAt)

	// The branch starts over: no entries, and the member's read mark no longer hides the next chat.
	require.Empty(t, liveEntries(t, a, "main"))
	var view map[string]any
	require.Equal(t, http.StatusOK, getJSON(t, a, "/api/conversations/main/view-state", &view))
	require.NotContains(t, view, "last_seen_seq")
	require.Equal(t, true, view["toasts_hidden"])
	require.Len(t, liveEntries(t, b, "main"), 1)

	// History belongs to the account that had the chat.
	require.Equal(t, []Archive{*archive}, listArchives(t, a))
	require.Empty(t, listArchives(t, b))
	var read ArchivedConversation
	require.Equal(t, http.StatusOK, getJSON(t, a, ArchivesPath+"/"+archive.ID, &read))
	require.Equal(t, *archive, read.Archive)
	require.Equal(t, "archive-"+archive.ID, read.Conversation.ID)
	require.Len(t, read.Conversation.Entries, 2)
	require.Equal(t, []string{first.ID, second.ID}, []string{read.Conversation.Entries[0].ID, read.Conversation.Entries[1].ID})
	require.Equal(t, "Now add a test", read.Conversation.Entries[1].Prompt)
	require.Equal(t, StateCompleted, read.Conversation.Entries[1].State)
	require.NotEmpty(t, read.Conversation.Entries[1].Frames)
	require.Equal(t, http.StatusNotFound, getJSON(t, b, ArchivesPath+"/"+archive.ID, nil))
	require.Equal(t, http.StatusNotFound, getJSON(t, a, ArchivesPath+"/missing", nil))
	// An archived key is not a branch: no live route reads or archives it.
	require.Equal(t, http.StatusForbidden, getJSON(t, a, "/api/conversations/archive-"+archive.ID, nil))

	// The next chat numbers its entries from one and archives under no repository.
	third := awaitPrompt(t, a, submitPrompt(t, a, "main", "three", "A fresh start"))
	require.Equal(t, int64(1), third.Sequence)
	status, next := archiveChat(t, a, "main", `{"repository":"","branch":"  "}`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "A fresh start", next.Title)
	require.Equal(t, 1, next.Entries)
	require.Nil(t, next.Repository)
	require.Nil(t, next.Branch)
	listed := listArchives(t, a)
	require.Len(t, listed, 2)
	require.Equal(t, []string{next.ID, archive.ID}, []string{listed[0].ID, listed[1].ID})

	for _, body := range []string{`{"repository":"a\nb"}`, `{"branch":"` + strings.Repeat("x", maxArchiveLabel+1) + `"}`, `{"unknown":true}`, `[]`} {
		status, _ = archiveChat(t, a, "main", body)
		require.Equal(t, http.StatusBadRequest, status, body)
	}
	status, _ = archiveChat(t, a, "feature", `{}`)
	require.Equal(t, http.StatusForbidden, status)

	// A suspended account loses its history with its chat.
	_, err = pool.Exec(t.Context(), `UPDATE users SET prohibit_login=true WHERE id=$1`, alice)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, getJSON(t, a, ArchivesPath, nil))
	require.Equal(t, http.StatusForbidden, getJSON(t, a, ArchivesPath+"/"+archive.ID, nil))
	// Deleting the account deletes its history rows.
	_, err = pool.Exec(t.Context(), `DELETE FROM chat_turns WHERE user_id=$1`, alice)
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `DELETE FROM users WHERE id=$1`, alice)
	require.NoError(t, err)
	var remaining int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM chat_archives`).Scan(&remaining))
	require.Zero(t, remaining)
}

func TestArchiveRefusesWhileAPromptIsRunningOrQueued(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := NewStore(pool)
	require.NoError(t, err)
	alice, err := seed.CreateUser(t.Context(), pool, "archive-busy")
	require.NoError(t, err)
	handler := &Handler{PrivateConversations: true, Store: store, Dispatcher: runArchiveDispatcher(t, store, 400*time.Millisecond), credentials: newTurnCredentials()}
	a := archiveServer(t, handler, alice, "archive-busy")
	running := submitPrompt(t, a, "main", "one", "A slow prompt")
	queued := submitPrompt(t, a, "main", "two", "A queued follow-up")
	status, archive := archiveChat(t, a, "main", `{}`)
	require.Equal(t, http.StatusConflict, status)
	require.Nil(t, archive)
	require.Empty(t, listArchives(t, a))
	awaitPrompt(t, a, running)
	awaitPrompt(t, a, queued)
	status, archive = archiveChat(t, a, "main", `{}`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, 2, archive.Entries)
	require.Equal(t, "A slow prompt", archive.Title)
}

func TestInstallArchiveIsSharedByBranchMembers(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	owner, err := seed.CreateUser(ctx, pool, "install-owner")
	require.NoError(t, err)
	member, err := seed.CreateUser(ctx, pool, "install-member")
	require.NoError(t, err)
	outsider, err := seed.CreateUser(ctx, pool, "install-outsider")
	require.NoError(t, err)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner, Valid: true}, Name: "shop", LowerName: "shop", DefaultBookmark: "main"})
	require.NoError(t, err)
	for _, user := range []int64{owner, member} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'write')`, repo.ID, user)
		require.NoError(t, err)
	}
	setting, _ := json.Marshal(map[string]any{"owner_login": "install-owner", "repository_name": "shop", "repository_id": repo.ID})
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: setting}))
	store, err := NewStore(pool)
	require.NoError(t, err)
	var admitted []string
	store.OnArchive = func(_ context.Context, _ pgx.Tx, scope Scope, id string) error {
		require.Equal(t, repo.ID, scope.RepositoryID)
		admitted = append(admitted, id)
		return nil
	}
	handler := &Handler{Store: store, Dispatcher: runArchiveDispatcher(t, store, time.Millisecond), credentials: newTurnCredentials(), ResolveBranch: func(_ context.Context, _ Scope, branch string) (string, error) {
		if branch != "main" && branch != "feature" {
			return "", ErrForbidden
		}
		return branch, nil
	}}
	o, m, x := archiveServer(t, handler, owner, "install-owner"), archiveServer(t, handler, member, "install-member"), archiveServer(t, handler, outsider, "install-outsider")

	awaitPrompt(t, o, submitPrompt(t, o, "feature", "one", "Owner asks on the feature branch"))
	awaitPrompt(t, m, submitPrompt(t, m, "feature", "two", "Member follows up"))
	kept := awaitPrompt(t, o, submitPrompt(t, o, "main", "three", "Main keeps its chat"))

	// The install names its own repository and the addressed branch, whatever the browser sent.
	status, archive := archiveChat(t, m, "feature", `{"repository":"someone/else"}`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, "install-owner/shop", *archive.Repository)
	require.Equal(t, "feature", *archive.Branch)
	require.Equal(t, "Owner asks on the feature branch", archive.Title)
	require.Equal(t, 2, archive.Entries)
	require.Equal(t, "install-member", archive.ArchivedBy)
	require.Equal(t, []string{archive.ID}, admitted)

	// Both members see the same history; the branch is empty for both; main is untouched.
	require.Equal(t, []Archive{*archive}, listArchives(t, o))
	require.Equal(t, []Archive{*archive}, listArchives(t, m))
	require.Empty(t, liveEntries(t, o, "feature"))
	require.Empty(t, liveEntries(t, m, "feature"))
	main := liveEntries(t, m, "main")
	require.Len(t, main, 1)
	require.Equal(t, kept.ID, main[0].ID)
	var read ArchivedConversation
	require.Equal(t, http.StatusOK, getJSON(t, o, ArchivesPath+"/"+archive.ID, &read))
	require.Len(t, read.Conversation.Entries, 2)
	require.Equal(t, "install-member", read.Conversation.Entries[1].AuthorLogin)

	// A person outside the install reads and archives nothing.
	require.Equal(t, http.StatusForbidden, getJSON(t, x, ArchivesPath, nil))
	require.Equal(t, http.StatusForbidden, getJSON(t, x, ArchivesPath+"/"+archive.ID, nil))
	status, _ = archiveChat(t, x, "main", `{}`)
	require.Equal(t, http.StatusForbidden, status)
	require.Len(t, liveEntries(t, o, "main"), 1)

	// Removing the member who archived keeps the shared history.
	_, err = pool.Exec(ctx, `DELETE FROM collaborators WHERE user_id=$1`, member)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `DELETE FROM chat_turns WHERE user_id=$1`, member)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, member)
	require.NoError(t, err)
	after := listArchives(t, o)
	require.Len(t, after, 1)
	require.Equal(t, "", after[0].ArchivedBy)
	require.Equal(t, http.StatusForbidden, getJSON(t, m, ArchivesPath, nil))
}
