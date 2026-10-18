package repohost

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// RepositoryCommit is an immutable Git commit from the repository's existing object store.
type RepositoryCommit struct {
	SHA         string   `json:"sha"`
	ShortSHA    string   `json:"short_sha"`
	Title       string   `json:"title"`
	Body        string   `json:"body"`
	Author      string   `json:"author"`
	AuthoredAt  string   `json:"authored_at"`
	CommittedAt string   `json:"committed_at"`
	Parents     []string `json:"parents"`
}

// RepositoryCommitFile summarizes the first-parent change (the empty tree for a root commit).
type RepositoryCommitFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// RepositoryCommitDetail includes changed paths without fetching file contents.
type RepositoryCommitDetail struct {
	RepositoryCommit
	Files []RepositoryCommitFile `json:"files"`
}

// RepositoryCommitPage pins pagination to the first request's immutable commit.
type RepositoryCommitPage struct {
	Items      []RepositoryCommit `json:"items"`
	NextCursor string             `json:"next_cursor,omitempty"`
}

// ListRepositoryCommits reads history through the same repository host as contents.
func (c *Client) ListRepositoryCommits(ctx context.Context, owner, repo, ref, path, cursor string, limit int) (RepositoryCommitPage, error) {
	base, err := c.resolver.ResolveURL(ctx, owner, repo)
	if err != nil {
		return RepositoryCommitPage{}, err
	}
	query := url.Values{"ref": {ref}, "path": {path}, "cursor": {cursor}, "limit": {strconv.Itoa(limit)}}
	var out RepositoryCommitPage
	err = c.doJSON(ctx, http.MethodGet, repoByIDEndpoint(base, owner, repo)+"/history?"+query.Encode(), nil, http.StatusOK, &out)
	return out, err
}

// GetRepositoryCommit reads one immutable commit and its changed-file summary.
func (c *Client) GetRepositoryCommit(ctx context.Context, owner, repo, sha string) (RepositoryCommitDetail, error) {
	base, err := c.resolver.ResolveURL(ctx, owner, repo)
	if err != nil {
		return RepositoryCommitDetail{}, err
	}
	var out RepositoryCommitDetail
	err = c.doJSON(ctx, http.MethodGet, repoByIDEndpoint(base, owner, repo)+"/history/"+url.PathEscape(sha), nil, http.StatusOK, &out)
	return out, err
}
