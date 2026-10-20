package repohost

import (
	"context"
	"encoding/hex"
	"encoding/json"
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
	Patch     string `json:"patch,omitempty"`
	Binary    bool   `json:"binary,omitempty"`
	TooLarge  bool   `json:"too_large,omitempty"`
	From      string `json:"from,omitempty"`
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
	err = c.commitReadJSON(ctx, repoByIDEndpoint(base, owner, repo)+"/history?"+query.Encode(), ref, &out)
	return out, err
}

// GetRepositoryCommit reads one immutable commit and its changed-file summary.
func (c *Client) GetRepositoryCommit(ctx context.Context, owner, repo, sha string) (RepositoryCommitDetail, error) {
	base, err := c.resolver.ResolveURL(ctx, owner, repo)
	if err != nil {
		return RepositoryCommitDetail{}, err
	}
	var out RepositoryCommitDetail
	err = c.commitReadJSON(ctx, repoByIDEndpoint(base, owner, repo)+"/history/"+url.PathEscape(sha), sha, &out)
	return out, err
}

// commitReadJSON retains only successful immutable reads, scoped to this client's
// storage endpoint and credentials. Encoded values prevent callers mutating cache
// entries; failures and mutable refs always reach storage. The bound is 8 MiB.
func (c *Client) commitReadJSON(ctx context.Context, endpoint, sha string, out any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	_, shaErr := hex.DecodeString(sha)
	immutable := (len(sha) == 40 || len(sha) == 64) && shaErr == nil
	if immutable {
		c.immutableFilesMu.Lock()
		data := c.immutableCommits[endpoint]
		c.immutableFilesMu.Unlock()
		if data != nil {
			return json.Unmarshal(data, out)
		}
	}
	if err := c.doJSON(ctx, http.MethodGet, endpoint, nil, http.StatusOK, out); err != nil {
		return err
	}
	if immutable {
		data, err := json.Marshal(out)
		if err != nil {
			return err
		}
		if len(data) <= 65536 {
			c.immutableFilesMu.Lock()
			if c.immutableCommits == nil {
				c.immutableCommits = make(map[string][]byte)
			}
			if len(c.immutableCommits) >= 128 {
				for key := range c.immutableCommits {
					delete(c.immutableCommits, key)
					break
				}
			}
			c.immutableCommits[endpoint] = data
			c.immutableFilesMu.Unlock()
		}
	}
	return nil
}
