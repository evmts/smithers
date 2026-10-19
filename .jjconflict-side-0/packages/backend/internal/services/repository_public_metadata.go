package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

var publicMetadataPath = regexp.MustCompile(`^(issues|pulls)(/[1-9][0-9]*(/comments)?)?$`)

// ReadPublicRepositoryMetadata reads only anonymously visible GitHub records.
// Local repository access and a unique ready import are checked before any
// upstream request. No caller header or personal credential is forwarded.
func (s *RepoService) ReadPublicRepositoryMetadata(ctx context.Context, viewer *db.User, owner, repo, resource string, query url.Values) (GitHubRepoMetadataResult, error) {
	repository, err := s.resolveReadableRepo(ctx, viewer, owner, repo)
	if err != nil {
		if viewer == nil {
			return GitHubRepoMetadataResult{}, pkgerrors.NotFound("repository not found")
		}
		return GitHubRepoMetadataResult{}, err
	}
	if !repository.IsPublic {
		return GitHubRepoMetadataResult{}, pkgerrors.NotFound("repository not found")
	}
	if !publicMetadataPath.MatchString(resource) {
		return GitHubRepoMetadataResult{}, pkgerrors.BadRequest("invalid repository metadata path")
	}
	source, ambiguous, err := s.githubSource(ctx, repository.ID)
	if err != nil || ambiguous {
		return GitHubRepoMetadataResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "GitHub source unavailable")
	}
	if source == nil {
		return GitHubRepoMetadataResult{}, pkgerrors.NotFound("GitHub source not found")
	}
	normalized, err := normalizeGitHubRepoMetadataQuery(strings.Split(resource, "/")[0], query)
	if err != nil {
		return GitHubRepoMetadataResult{}, err
	}

	if s.pool == nil {
		return GitHubRepoMetadataResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "Metadata mirror unavailable")
	}
	store := db.New(s.pool)
	registry, err := store.GetGitHubSyncedRepo(ctx, db.GetGitHubSyncedRepoParams{OwnerLogin: source.Owner, RepoName: source.Repo})
	if err != nil || !registry.SyncMetadata || registry.SyncState == "disabled" || !registry.LastSyncedAt.Valid {
		return GitHubRepoMetadataResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "Metadata mirror unavailable")
	}
	// The public repository permission above is the authority for this read.
	// This grant is request-local, never persisted as a person's GitHub grant.
	grant := GitHubRepoReadGrant{ok: true, owner: source.Owner, repo: source.Repo}
	reader := NewGitHubSyncedRepoService(store)
	parts := strings.Split(resource, "/")
	if len(parts) == 1 {
		page, ok := reader.ServeMetadata(ctx, grant, resource, normalized, nil)
		if !ok {
			return GitHubRepoMetadataResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "Metadata mirror unavailable")
		}
		link := ""
		if page.Link != "" {
			_, _, pageNumber, perPage := storeMetadataPaging(normalized)
			next := url.Values{}
			for key, values := range normalized {
				next[key] = append([]string(nil), values...)
			}
			next.Set("page", strconv.Itoa(pageNumber+1))
			next.Set("per_page", strconv.Itoa(perPage))
			link = fmt.Sprintf("</api/repos/%s/%s/github/metadata/%s?%s>; rel=\"next\"", url.PathEscape(owner), url.PathEscape(repo), resource, next.Encode())
		}
		return GitHubRepoMetadataResult{Body: page.Body, Link: link, Source: GitHubRepoMetadataSourceStore, SyncedAt: &page.SyncedAt, Stale: page.Stale}, nil
	}
	number, numberErr := strconv.ParseInt(parts[1], 10, 64)
	if numberErr != nil || number > 9007199254740991 {
		return GitHubRepoMetadataResult{}, pkgerrors.BadRequest("invalid metadata number")
	}
	if len(parts) == 3 {
		page, ok := reader.ServeComments(ctx, grant, number, normalized, nil)
		if !ok {
			return GitHubRepoMetadataResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "Comments mirror unavailable")
		}
		return GitHubRepoMetadataResult{Body: page.Body, Source: GitHubRepoMetadataSourceStore, SyncedAt: &page.SyncedAt, Stale: page.Stale}, nil
	}
	var payload json.RawMessage
	err = s.pool.QueryRow(ctx, `SELECT payload FROM github_synced_issues WHERE synced_repo_id=$1 AND resource=$2 AND number=$3`, registry.ID, parts[0], number).Scan(&payload)
	if err != nil {
		return GitHubRepoMetadataResult{}, pkgerrors.NotFound("metadata not found")
	}
	at := registry.LastSyncedAt.Time
	return GitHubRepoMetadataResult{Body: payload, Source: GitHubRepoMetadataSourceStore, SyncedAt: &at, Stale: time.Since(at) > githubSyncedRepoSyncFreshness}, nil
}
