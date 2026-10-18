package services

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

var publicMetadataPath = regexp.MustCompile(`^(issues|pulls)(/[1-9][0-9]*)?(/comments|/commits)?$`)

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
	reader := &GitHubUserReposService{httpClient: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, now: time.Now}
	top := byte('[')
	parts := strings.Split(resource, "/")
	if len(parts) == 2 {
		top = '{'
	}
	endpoint := strings.TrimRight(githubAPIBaseURL(), "/") + "/repos/" + url.PathEscape(source.Owner) + "/" + url.PathEscape(source.Repo) + "/" + resource
	if encoded := normalized.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}
	return reader.requestGitHubRepoRaw(ctx, "", endpoint, top)
}
