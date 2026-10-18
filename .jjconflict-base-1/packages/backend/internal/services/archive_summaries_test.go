package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// archiveTurn commits one finished turn into the scope's live conversation.
func archiveTurn(t *testing.T, store *chat.Store, scope chat.Scope, conversation, run, prompt, answer string) {
	t.Helper()
	ctx := t.Context()
	request, err := json.Marshal(map[string]any{"purpose": "conversation", "sharedConversation": scope.RepositoryID > 0, "privateConversation": scope.RepositoryID == 0,
		"conversationId": conversation, "runId": run, "instructions": "private-canary", "messages": []map[string]string{{"role": "user", "content": prompt}}})
	require.NoError(t, err)
	turn, err := store.Admit(ctx, chat.AdmitInput{Scope: scope, RunID: run, Journal: chat.JournalRequest{Version: 1, LegID: run + "-leg", Token: strings.Repeat("a", 64)}, Request: request})
	require.NoError(t, err)
	grant, err := store.Claim(ctx, scope, turn.TurnID, time.Minute)
	require.NoError(t, err)
	delta, err := json.Marshal(map[string]string{"runId": run, "type": "delta", "kind": "text", "text": answer})
	require.NoError(t, err)
	_, err = store.Commit(ctx, chat.CommitInput{TurnID: turn.TurnID, Generation: grant.Generation, Token: grant.Token, Expected: grant.Cursor, Frames: []json.RawMessage{
		delta, json.RawMessage(fmt.Sprintf(`{"runId":%q,"type":"done","reason":"stop"}`, run)),
	}})
	require.NoError(t, err)
}

func modelReply(text string) io.ReadCloser {
	delta, _ := json.Marshal(map[string]string{"type": "delta", "kind": "text", "text": text})
	return io.NopCloser(strings.NewReader(string(delta) + "\n{\"type\":\"done\"}\n"))
}

// drainArchiveSummaries runs the durable worker until every admitted archive job has settled.
func drainArchiveSummaries(t *testing.T, pool *pgxpool.Pool, summaries *services.ConversationSummaries) {
	t.Helper()
	queue, err := jobs.NewStore(pool)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(t.Context())
	stopped := make(chan error, 1)
	go func() {
		stopped <- queue.RunWorker(ctx, jobs.WorkerConfig{WorkerID: "archive-summary-test", Capacity: 1, Lease: time.Minute, PollInterval: time.Millisecond, Operations: []string{services.ArchiveSummaryOperation}}, summaries.Handle)
	}()
	require.Eventually(t, func() bool {
		var open int
		return pool.QueryRow(t.Context(), `SELECT count(*) FROM product_job_requests WHERE operation=$1 AND state NOT IN ('completed','failed')`, services.ArchiveSummaryOperation).Scan(&open) == nil && open == 0
	}, 10*time.Second, 10*time.Millisecond)
	cancel()
	<-stopped
}

func archiveJobs(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var count int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM product_job_requests WHERE operation=$1`, services.ArchiveSummaryOperation).Scan(&count))
	return count
}

func TestArchiveSummaryIsWrittenOnceAndRetriedAfterAFailure(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	owner, err := seed.CreateUser(ctx, pool, "archive-summary-owner")
	require.NoError(t, err)
	other, err := seed.CreateUser(ctx, pool, "archive-summary-other")
	require.NoError(t, err)
	store, err := chat.NewStore(pool)
	require.NoError(t, err)
	queue, err := jobs.NewStore(pool)
	require.NoError(t, err)
	var calls atomic.Int32
	var fail atomic.Bool
	reply := atomic.Pointer[string]{}
	first := `{"title":"Fix Safari login bug today please now ok extra","summary":"You asked why login failed on Safari.   The cookie flag was fixed.\n A test is still missing. "}`
	reply.Store(&first)
	summaries := &services.ConversationSummaries{Pool: pool, Jobs: queue, Model: func(_ context.Context, user, repository int64, body json.RawMessage) (io.ReadCloser, error) {
		calls.Add(1)
		assert.Equal(t, owner, user)
		assert.Zero(t, repository)
		assert.NotContains(t, string(body), "private-canary")
		assert.NotContains(t, string(body), "Other account")
		var request struct {
			Instructions string `json:"instructions"`
			Messages     []struct {
				Role, Content string
			} `json:"messages"`
			Tools []any `json:"tools"`
		}
		assert.NoError(t, json.Unmarshal(body, &request))
		assert.Empty(t, request.Tools)
		assert.Contains(t, request.Instructions, `"title" and "summary"`)
		assert.Len(t, request.Messages, 1)
		assert.JSONEq(t, `{"turns":[
 {"state":"completed","prompt":"Why does login fail on Safari?","answer":"The session cookie lacks SameSite=None."},
 {"state":"completed","prompt":"Fix it","answer":"Fixed the cookie flag."}]}`, request.Messages[0].Content)
		if fail.Load() {
			return nil, errors.New("provider unavailable")
		}
		return modelReply(*reply.Load()), nil
	}}
	store.OnArchive = func(ctx context.Context, tx pgx.Tx, scope chat.Scope, id string) error {
		return summaries.AdmitArchive(ctx, tx, scope.RepositoryID, scope.UserID, id)
	}
	scope := chat.Scope{UserID: owner, Owner: "archive-summary-owner"}
	key := fmt.Sprintf("account-%d-main", owner)
	archiveTurn(t, store, scope, key, "run-1", "Why does login fail on Safari?", "The session cookie lacks SameSite=None.")
	archiveTurn(t, store, scope, key, "run-2", "Fix it", "Fixed the cookie flag.")
	otherScope := chat.Scope{UserID: other, Owner: "archive-summary-other"}
	archiveTurn(t, store, otherScope, fmt.Sprintf("account-%d-main", other), "run-other", "Other account prompt", "Other account answer")

	// The first call fails: the archive keeps its deterministic title and no summary.
	fail.Store(true)
	archive, err := store.Archive(ctx, scope, key, chat.ArchiveLabel{Repository: "acme/api", Branch: "main"})
	require.NoError(t, err)
	require.Equal(t, "Why does login fail on Safari?", archive.Title)
	require.Equal(t, 1, archiveJobs(t, pool))
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(1), calls.Load())
	listed, err := store.Archives(ctx, scope)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, "Why does login fail on Safari?", listed[0].Title)
	require.Nil(t, listed[0].Summary)

	// A history read retries it, at most once an hour and never while the first attempt is fresh.
	require.NoError(t, summaries.BackfillArchives(ctx, 0, owner))
	require.Equal(t, 1, archiveJobs(t, pool))
	_, err = pool.Exec(ctx, `UPDATE chat_archives SET archived_at=archived_at - interval '2 minutes' WHERE id=$1`, archive.ID)
	require.NoError(t, err)
	require.NoError(t, summaries.BackfillArchives(ctx, 0, other))
	require.Equal(t, 1, archiveJobs(t, pool))
	require.NoError(t, summaries.BackfillArchives(ctx, 0, owner))
	require.NoError(t, summaries.BackfillArchives(ctx, 0, owner))
	require.Equal(t, 2, archiveJobs(t, pool))
	fail.Store(false)
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(2), calls.Load())
	listed, err = store.Archives(ctx, scope)
	require.NoError(t, err)
	require.Equal(t, "Fix Safari login bug today please now ok", listed[0].Title)
	require.Equal(t, "You asked why login failed on Safari. The cookie flag was fixed. A test is still missing.", *listed[0].Summary)

	// A written summary is final: a later job neither calls the model nor replaces it.
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, summaries.AdmitArchive(ctx, tx, 0, owner, archive.ID+"-missing"))
	require.NoError(t, tx.Commit(ctx))
	require.NoError(t, summaries.BackfillArchives(ctx, 0, owner))
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(2), calls.Load())

	// An unusable reply leaves the first prompt as the title.
	archiveTurn(t, store, scope, key, "run-3", "Why does login fail on Safari?", "The session cookie lacks SameSite=None.")
	archiveTurn(t, store, scope, key, "run-4", "Fix it", "Fixed the cookie flag.")
	prose := "Sure! Here is a summary of the chat."
	reply.Store(&prose)
	second, err := store.Archive(ctx, scope, key, chat.ArchiveLabel{})
	require.NoError(t, err)
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(3), calls.Load())
	listed, err = store.Archives(ctx, scope)
	require.NoError(t, err)
	require.Equal(t, second.ID, listed[0].ID)
	require.Equal(t, "Why does login fail on Safari?", listed[0].Title)
	require.Nil(t, listed[0].Summary)
	otherListed, err := store.Archives(ctx, otherScope)
	require.NoError(t, err)
	require.Empty(t, otherListed)
}

func TestInstallArchiveSummaryUsesTheOwnerAndNeedsAFastModel(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	owner, err := seed.CreateUser(ctx, pool, "archive-install-owner")
	require.NoError(t, err)
	member, err := seed.CreateUser(ctx, pool, "archive-install-member")
	require.NoError(t, err)
	q := db.New(pool)
	repo, err := q.CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: owner, Valid: true}, Name: "shop", LowerName: "shop", DefaultBookmark: "main"})
	require.NoError(t, err)
	for _, user := range []int64{owner, member} {
		_, err = pool.Exec(ctx, `INSERT INTO collaborators(repository_id,user_id,permission) VALUES($1,$2,'write')`, repo.ID, user)
		require.NoError(t, err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES($1)`, owner)
	require.NoError(t, err)
	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "github.repository", Value: json.RawMessage(fmt.Sprintf(`{"repository_id":%d,"owner_login":"archive-install-owner","repository_name":"shop"}`, repo.ID))}))
	store, err := chat.NewStore(pool)
	require.NoError(t, err)
	queue, err := jobs.NewStore(pool)
	require.NoError(t, err)
	var calls atomic.Int32
	summaries := &services.ConversationSummaries{Pool: pool, Jobs: queue, Model: func(_ context.Context, user, repository int64, body json.RawMessage) (io.ReadCloser, error) {
		calls.Add(1)
		// The install owner's model access pays for a shared chat's summary, whoever archived it.
		assert.Equal(t, owner, user)
		assert.Equal(t, repo.ID, repository)
		var request struct {
			Model json.RawMessage `json:"model"`
		}
		assert.NoError(t, json.Unmarshal(body, &request))
		assert.JSONEq(t, `{"protocol":"openai-chat","modelId":"test-fast","credential":"TEST_KEY"}`, string(request.Model))
		return modelReply(`{"title":"Ship the checkout fix","summary":"The member asked for the checkout fix and it shipped."}`), nil
	}}
	store.OnArchive = func(ctx context.Context, tx pgx.Tx, scope chat.Scope, id string) error {
		return summaries.AdmitArchive(ctx, tx, scope.RepositoryID, scope.UserID, id)
	}
	scope := chat.Scope{RepositoryID: repo.ID, UserID: member, Owner: "archive-install-member"}

	// No model access: nothing is admitted, and the archive still lists under its first prompt.
	archiveTurn(t, store, scope, "feature", "run-1", "Ship the checkout fix", "Shipped.")
	plain, err := store.Archive(ctx, scope, "feature", chat.ArchiveLabel{Repository: "archive-install-owner/shop", Branch: "feature"})
	require.NoError(t, err)
	require.Zero(t, archiveJobs(t, pool))
	require.Equal(t, "Ship the checkout fix", plain.Title)

	require.NoError(t, q.UpsertInstallSetting(ctx, db.UpsertInstallSettingParams{Key: "agent:coding", Value: json.RawMessage(`{"protocol":"openai-chat","modelId":"test-fast","credential":"TEST_KEY"}`)}))
	archiveTurn(t, store, scope, "feature", "run-2", "Ship the checkout fix again", "Shipped again.")
	summarized, err := store.Archive(ctx, scope, "feature", chat.ArchiveLabel{Repository: "archive-install-owner/shop", Branch: "feature"})
	require.NoError(t, err)
	require.Equal(t, 1, archiveJobs(t, pool))
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(1), calls.Load())
	listed, err := store.Archives(ctx, chat.Scope{RepositoryID: repo.ID, UserID: owner, Owner: "archive-install-owner"})
	require.NoError(t, err)
	require.Len(t, listed, 2)
	require.Equal(t, summarized.ID, listed[0].ID)
	require.Equal(t, "Ship the checkout fix", listed[0].Title)
	require.Equal(t, "The member asked for the checkout fix and it shipped.", *listed[0].Summary)
	require.Nil(t, listed[1].Summary)

	// A suspended owner makes no model call for the install.
	_, err = pool.Exec(ctx, `UPDATE chat_archives SET archived_at=archived_at - interval '2 minutes'`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE users SET prohibit_login=true WHERE id=$1`, owner)
	require.NoError(t, err)
	require.NoError(t, summaries.BackfillArchives(ctx, repo.ID, member))
	require.Equal(t, 2, archiveJobs(t, pool))
	drainArchiveSummaries(t, pool, summaries)
	require.Equal(t, int32(1), calls.Load())
}
