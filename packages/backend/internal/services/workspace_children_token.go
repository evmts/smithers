package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// A running workspace spawns its own children (#2802) with a credential that
// can do nothing else: it is bound to one repository and one workspace, marked
// for the children routes only, and reads the repository only so its routes
// can resolve it: it cannot push, and reaches none of the owner's other
// resources. It is minted on every
// machine start, revoked on the next start and when the workspace stops, and
// withheld from any workspace another person may write into.
const (
	workspaceChildrenTokenPath    = defaultWorkspaceHome + "/.config/smithers/workspace-children-token"
	workspaceChildrenTokenTTL     = 24 * time.Hour
	workspaceChildrenTokenEnv     = "SMITHERS_WORKSPACE_CHILDREN_TOKEN"
	workspaceChildrenTokenTimeout = 30 * time.Second
)

// workspaceChildrenTokenStore is the token surface the credential needs.
type workspaceChildrenTokenStore interface {
	accessTokenStore
	DeleteSystemAccessTokensByName(context.Context, db.DeleteSystemAccessTokensByNameParams) error
	HasWritableWorkspaceShares(context.Context, string) (bool, error)
}

var _ workspaceChildrenTokenStore = (*db.Queries)(nil)

func workspaceChildrenTokenName(workspaceID string) string {
	return "sandbox-workspace-children-" + strings.ToLower(strings.TrimSpace(workspaceID))
}

// workspaceChildrenTokenScopes grants the workspace scope bound to one
// repository and one workspace, marked for its children routes. Reading the
// repository lets the routes resolve a private repository.
func workspaceChildrenTokenScopes(repositoryID int64, workspaceID string) string {
	return string(middleware.ScopeReadRepository) + "," + string(middleware.ScopeWriteWorkspace) + "," +
		middleware.RepositoryRestrictionScope(repositoryID) + "," +
		middleware.WorkspaceRestrictionScope(workspaceID) + "," +
		middleware.WorkspaceChildrenCredentialScope()
}

// workspaceChildrenTokenInstallCommand writes the credential from the exec's
// secret environment, never its command line, readable by the workspace user
// alone. The workspace user writes it: root never creates, chowns or moves a
// file in a directory the developer controls, where the developer could swap
// the entry for a symlink or a hardlink between two root steps (Security
// d-7lu7ja). The token reaches the developer's shell on standard input only
// (printf is a shell builtin), and env -i keeps the secret variable out of the
// developer's environment.
func workspaceChildrenTokenInstallCommand(user string) string {
	dir := workspaceChildrenTokenPath[:strings.LastIndex(workspaceChildrenTokenPath, "/")]
	asDeveloper := strings.Join([]string{
		"umask 077",
		"mkdir -p " + shellQuote(dir),
		"chmod 700 " + shellQuote(dir),
		"tmp=$(mktemp " + shellQuote(dir+"/.token.XXXXXX") + ")",
		`cat >"$tmp"`,
		`chmod 600 "$tmp"`,
		`mv -f "$tmp" ` + shellQuote(workspaceChildrenTokenPath),
	}, " && ")
	return strings.Join([]string{
		"set -eu",
		`printf '%s' "$` + workspaceChildrenTokenEnv + `" | runuser -u ` + shellQuote(user) + ` -- env -i HOME=` + shellQuote(defaultWorkspaceHome) +
			` PATH=/run/current-system/sw/bin:/usr/bin:/bin /bin/sh -c ` + shellQuote(asDeveloper),
	}, "\n")
}

// A workspace that cannot spawn children, or that another person may write
// into, gets none.
func (s *WorkspaceService) installWorkspaceChildrenToken(ctx context.Context, workspace db.Workspace, vmID string) error {
	store, ok := s.q.(workspaceChildrenTokenStore)
	execClient, execOK := s.sandbox.(sandboxExecClient)
	if !ok || !execOK || s.transactions == nil || strings.TrimSpace(vmID) == "" || !workspaceKindForksCleanly(workspace.Kind) {
		return nil
	}
	s.revokeWorkspaceChildrenToken(ctx, workspace)
	if workspace.IsFork {
		// A child never spawns children: its snapshot copy of the parent's
		// credential is scrubbed and no credential of its own is minted.
		child, err := s.isWorkspaceChild(ctx, workspace.ID)
		if err != nil || child {
			return err
		}
	}
	shared, err := store.HasWritableWorkspaceShares(ctx, workspace.ID)
	if err != nil {
		return fmt.Errorf("check workspace shares: %w", err)
	}
	if shared {
		return nil
	}
	token, err := issueTemporaryRepoTokenWithTTL(ctx, store, workspace.UserID, workspaceChildrenTokenName(workspace.ID),
		workspaceChildrenTokenScopes(workspace.RepositoryID, workspace.ID), workspaceChildrenTokenTTL)
	if err != nil {
		return fmt.Errorf("mint workspace children token: %w", err)
	}
	user := strings.TrimSpace(s.workspaceUsername)
	if user == "" {
		user = defaultWorkspaceUser
	}
	installCtx, cancel := context.WithTimeout(ctx, workspaceChildrenTokenTimeout)
	defer cancel()
	timeoutMS := int64(workspaceChildrenTokenTimeout / time.Millisecond)
	result, err := execClient.Execute(installCtx, vmID, sandbox.ExecRequest{
		Command: workspaceChildrenTokenInstallCommand(user), TimeoutMS: &timeoutMS,
		Secrets: map[string]string{workspaceChildrenTokenEnv: token.Plaintext},
	})
	if err == nil && !successfulExecStatus(result) {
		err = errors.New(strings.TrimSpace(result.Stderr))
	}
	if err != nil {
		revokeTemporaryRepoCloneToken(ctx, store, workspace.UserID, token.ID)
		return fmt.Errorf("install workspace children token: %w", err)
	}
	return nil
}

// revokeWorkspaceChildrenToken revokes every children credential minted for
// the workspace. Best effort, like the head token: the credential expires.
func (s *WorkspaceService) revokeWorkspaceChildrenToken(ctx context.Context, workspace db.Workspace) {
	store, ok := s.q.(workspaceChildrenTokenStore)
	if !ok || strings.TrimSpace(workspace.ID) == "" {
		return
	}
	revokeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), temporaryRepoTokenRevokeTimeout)
	defer cancel()
	_ = store.DeleteSystemAccessTokensByName(revokeCtx, db.DeleteSystemAccessTokensByNameParams{
		UserID: workspace.UserID, Name: workspaceChildrenTokenName(workspace.ID),
	})
}
