package services

import (
	"context"
	"errors"
	"net/http"
	"net/url"
)

// GitHubRepoPermission is a person's live permission on a repository.
type GitHubRepoPermission string

const (
	GitHubPermissionAdmin    GitHubRepoPermission = "admin"
	GitHubPermissionMaintain GitHubRepoPermission = "maintain"
	GitHubPermissionWrite    GitHubRepoPermission = "write"
	GitHubPermissionTriage   GitHubRepoPermission = "triage"
	GitHubPermissionRead     GitHubRepoPermission = "read"
	GitHubPermissionNone     GitHubRepoPermission = "none"
)

// CanPush reports push access or higher: admin, maintain or write.
func (p GitHubRepoPermission) CanPush() bool {
	return p == GitHubPermissionAdmin || p == GitHubPermissionMaintain || p == GitHubPermissionWrite
}

// errGitHubIdentityMismatch refuses permission belonging to another account.
var errGitHubIdentityMismatch = errors.New("GitHub permission identity does not match the linked account")

// errGitHubPermissionUnavailable is a transient failure: GitHub did not
// answer, so the caller fails closed and may retry.
var errGitHubPermissionUnavailable = errors.New("GitHub did not answer the repository permission")

// readGitHubRepoPermission reads login's permission on owner/repo with
// GET /repos/{owner}/{repo}/collaborators/{login}/permission. The legacy
// permission field folds maintain into write and triage into read, so
// role_name decides when it names a built-in role; a custom role's role_name
// is its own name, and its base permission decides. A person who is not a
// collaborator has none.
func readGitHubRepoPermission(ctx context.Context, api *landingGitHubAPI, token, owner, repo, login string, expectedUserID ...int64) (GitHubRepoPermission, error) {
	var out struct {
		Permission string `json:"permission"`
		RoleName   string `json:"role_name"`
		User       struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	status, err := api.request(ctx, token, http.MethodGet,
		landingGitHubRepoPath(owner, repo)+"/collaborators/"+url.PathEscape(login)+"/permission", nil, &out)
	if err != nil || gitHubTransient(status) {
		return "", errGitHubPermissionUnavailable
	}
	if status != http.StatusOK {
		return GitHubPermissionNone, nil
	}
	if len(expectedUserID) > 0 && (expectedUserID[0] <= 0 || out.User.ID != expectedUserID[0]) {
		return "", errGitHubIdentityMismatch
	}
	for _, field := range []string{out.RoleName, out.Permission} {
		switch permission := GitHubRepoPermission(field); permission {
		case GitHubPermissionAdmin, GitHubPermissionMaintain, GitHubPermissionWrite,
			GitHubPermissionTriage, GitHubPermissionRead:
			return permission, nil
		}
	}
	return GitHubPermissionNone, nil
}
