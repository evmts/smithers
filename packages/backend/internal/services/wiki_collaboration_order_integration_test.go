package services

import (
	"context"
	"encoding/base64"
	"io"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/blob"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/internal/repohostffi"
	"github.com/smithersai/smithers/packages/backend/internal/repohostserver"
)

type duplicateWikiReadKey struct{}

// Hold only the tagged caller after the real SQL read. All data, receipts,
// writes, authorization and native merges remain the production dependencies.
type heldWikiDocumentRead struct {
	WikiCollaborationStore
	once    sync.Once
	read    chan db.GetWikiDocumentRow
	release chan struct{}
}

func (s *heldWikiDocumentRead) GetWikiDocument(ctx context.Context, input db.GetWikiDocumentParams) (db.GetWikiDocumentRow, error) {
	row, err := s.WikiCollaborationStore.GetWikiDocument(ctx, input)
	if err == nil && ctx.Value(duplicateWikiReadKey{}) == true {
		s.once.Do(func() {
			s.read <- row
			select {
			case <-s.release:
			case <-ctx.Done():
			}
		})
	}
	return row, err
}

func TestWikiCollaboration_DuplicateReceiptCannotReturnEarlierDocument(t *testing.T) {
	library := os.Getenv("SMITHERS_WIKI_TEST_FFI")
	if library == "" {
		t.Skip("SMITHERS_WIKI_TEST_FFI opts into native+Postgres integration")
	}
	pool := getAgentTestPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	q := db.New(pool)
	userID, repoID := setupTestUserAndRepo(t, pool)
	actor, err := q.GetUserByID(ctx, userID)
	require.NoError(t, err)
	repository, err := q.GetRepoByID(ctx, repoID)
	require.NoError(t, err)
	native := repohostffi.New(library)
	require.NoError(t, native.Load())
	backend, err := repohostserver.NewWithFFI(repohostserver.Config{StoragePath: t.TempDir(), AuthToken: "wiki-order-fixture", PushHookCallbackToken: "wiki-order-callback"}, native)
	require.NoError(t, err)
	server := httptest.NewServer(backend.Handler())
	defer server.Close()
	host := repohost.NewClient(&repohost.StaticStorageSetResolver{URL: server.URL}, "wiki-order-fixture")
	content, err := blob.NewFilesystemStore(blob.FilesystemConfig{Root: t.TempDir(), PublicBaseURL: server.URL})
	require.NoError(t, err)
	defer func() { require.NoError(t, content.Close()) }()
	service := NewWikiService(q, nil, WithWikiContent(content), WithWikiCollaboration(q, host))
	page, err := service.CreateWikiPage(ctx, &actor, actor.Username, repository.Name, CreateWikiPageInput{Title: "Ordered note", Body: "Before the accepted edit"})
	require.NoError(t, err)
	initial, err := service.GetWikiDocument(ctx, &actor, actor.Username, repository.Name, page.Slug)
	require.NoError(t, err)
	require.Equal(t, int64(1), initial.Page.Revision)
	replacement := "The accepted edit survives in PostgreSQL and native state 🦉"
	merged, err := host.MergeWikiDocument(ctx, actor.Username, repository.Name, repohost.WikiDocumentRequest{Operation: "replace", State: initial.State, Markdown: &replacement})
	require.NoError(t, err)
	input := WikiUpdateInput{PageID: page.ID, UpdateID: uuid.NewString(), Update: merged.State}
	held := &heldWikiDocumentRead{WikiCollaborationStore: q, read: make(chan db.GetWikiDocumentRow, 1), release: make(chan struct{})}
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(held.release) }) }
	defer release()
	duplicateService := NewWikiService(q, nil, WithWikiContent(content), WithWikiCollaboration(held, host))
	type completion struct {
		reply WikiUpdateResponse
		err   error
	}
	done := make(chan completion, 1)
	finished := make(chan struct{})
	defer func() { cancel(); release(); <-finished }()
	go func() {
		defer close(finished)
		reply, err := duplicateService.ApplyWikiUpdate(context.WithValue(ctx, duplicateWikiReadKey{}, true), &actor, actor.Username, repository.Name, page.Slug, input)
		done <- completion{reply, err}
	}()
	select {
	case captured := <-held.read:
		require.Equal(t, int64(1), captured.Revision)
		require.Equal(t, initial.Page.Body, captured.Body)
	case <-ctx.Done():
		t.Fatal("duplicate caller never reached the actual SQL read barrier")
	}
	accepted, err := service.ApplyWikiUpdate(ctx, &actor, actor.Username, repository.Name, page.Slug, input)
	require.NoError(t, err)
	require.Equal(t, int64(2), accepted.AcceptedRevision)
	require.Equal(t, replacement, accepted.Document.Page.Body)
	release()
	var duplicate completion
	select {
	case duplicate = <-done:
	case <-ctx.Done():
		t.Fatal("duplicate caller never returned after releasing its SQL read")
	}
	require.NoError(t, duplicate.err)
	// Read the durable stores before asserting the response invariant, so a red
	// response is not mislabeled as durable loss.
	stored, err := q.GetWikiDocument(ctx, db.GetWikiDocumentParams{RepositoryID: repoID, Visibility: "public", Slug: page.Slug})
	require.NoError(t, err)
	parsed := uuid.MustParse(input.UpdateID)
	receipt, err := q.GetWikiUpdateReceipt(ctx, db.GetWikiUpdateReceiptParams{PageID: page.ID, UpdateID: pgtype.UUID{Bytes: parsed, Valid: true}})
	require.NoError(t, err)
	count, err := q.CountWikiRevisions(ctx, db.CountWikiRevisionsParams{RepositoryID: repoID, PageID: page.ID})
	require.NoError(t, err)
	restored, err := host.MergeWikiDocument(ctx, actor.Username, repository.Name, repohost.WikiDocumentRequest{Operation: "apply", State: base64.StdEncoding.EncodeToString(stored.CrdtState), Update: initial.State})
	require.NoError(t, err)
	reader, err := content.NewReader(ctx, wikiContentKey(repoID, "public", stored.ContentDigest))
	require.NoError(t, err)
	persistedBody, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	t.Logf("accepted=%d duplicateAccepted=%d duplicateDocument=%d SQLDocument=%d SQLReceipt=%d revisionCount=%d SQLBodyMatches=%t nativeBodyMatches=%t filesystemBodyMatches=%t", accepted.AcceptedRevision, duplicate.reply.AcceptedRevision, duplicate.reply.Document.Page.Revision, stored.Revision, receipt.Revision, count, stored.Body == replacement, restored.Markdown == replacement, string(persistedBody) == replacement)
	assert.Equal(t, int64(2), stored.Revision)
	assert.Equal(t, replacement, stored.Body)
	assert.Equal(t, int64(2), receipt.Revision)
	assert.Equal(t, int64(2), count, "the duplicate must not create another durable revision")
	assert.Equal(t, replacement, restored.Markdown)
	assert.Equal(t, replacement, string(persistedBody))
	assert.Equal(t, input.UpdateID, duplicate.reply.UpdateID)
	assert.Equal(t, accepted.AcceptedRevision, duplicate.reply.AcceptedRevision)
	assert.GreaterOrEqual(t, duplicate.reply.Document.Page.Revision, duplicate.reply.AcceptedRevision, "a receipt must not publish a document older than its accepted edit")
	assert.Equal(t, replacement, duplicate.reply.Document.Page.Body)
	assert.Equal(t, base64.StdEncoding.EncodeToString(stored.CrdtState), duplicate.reply.Document.State)
}
