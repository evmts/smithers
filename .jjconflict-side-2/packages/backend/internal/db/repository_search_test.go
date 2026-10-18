package db

import (
	"context"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestRepositorySearchIsolation(t *testing.T) {
	q, pool := newQueries(t)
	owner := mustCreateUser(t, pool, "scoped-search-owner")
	first, err := q.CreateRepo(context.Background(), CreateRepoParams{UserID: pgtype.Int8{Int64: owner, Valid: true}, Name: "first", LowerName: "first", IsPublic: true, DefaultBookmark: "main"})
	require.NoError(t, err)
	second, err := q.CreateRepo(context.Background(), CreateRepoParams{UserID: pgtype.Int8{Int64: owner, Valid: true}, Name: "second", LowerName: "second", IsPublic: true, DefaultBookmark: "main"})
	require.NoError(t, err)
	for _, id := range []int64{first.ID, second.ID} {
		_, err = q.CreateIssue(context.Background(), CreateIssueParams{RepositoryID: id, Title: "scopedneedle", Body: "search", AuthorID: owner})
		require.NoError(t, err)
		_, err = q.UpsertCodeSearchDocument(context.Background(), UpsertCodeSearchDocumentParams{RepositoryID: id, FilePath: "a.ts", Content: "scopedneedle"})
		require.NoError(t, err)
	}
	count, err := q.CountSearchCodeFTS(context.Background(), CountSearchCodeFTSParams{Query: "scopedneedle", RepositoryID: first.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
	rows, err := q.SearchCodeFTS(context.Background(), SearchCodeFTSParams{Query: "scopedneedle", RepositoryID: first.ID, PageSize: 1})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, first.ID, rows[0].RepositoryID)
	rows, err = q.SearchCodeFTS(context.Background(), SearchCodeFTSParams{Query: "scopedneedle", RepositoryID: first.ID, PageSize: 1, PageOffset: 1})
	require.NoError(t, err)
	require.Empty(t, rows)
	issueCount, err := q.CountSearchIssuesFTS(context.Background(), CountSearchIssuesFTSParams{Query: "scopedneedle", RepositoryID: first.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), issueCount)
	issues, err := q.SearchIssuesFTS(context.Background(), SearchIssuesFTSParams{Query: "scopedneedle", RepositoryID: first.ID, PageSize: 1})
	require.NoError(t, err)
	require.Len(t, issues, 1)
	require.Equal(t, first.ID, issues[0].RepositoryID)
}
