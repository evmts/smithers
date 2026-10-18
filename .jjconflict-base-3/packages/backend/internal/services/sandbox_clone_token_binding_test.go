package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// A box that clones one repository must hold a credential that reads only
// that repository. These tests read every credential a box path mints and
// require each one to carry the repo:<id> binding of the repository it clones.

// mintedTokens is a fake access-token store that records what it mints and
// what it revokes.
type mintedTokens struct {
	mu      sync.Mutex
	nextID  int64
	created map[int64]db.CreateAccessTokenParams
	revoked []int64
	failOn  func(db.CreateAccessTokenParams) error
}

func newMintedTokens() *mintedTokens {
	return &mintedTokens{nextID: 500, created: map[int64]db.CreateAccessTokenParams{}}
}

func (m *mintedTokens) create(_ context.Context, arg db.CreateAccessTokenParams) (db.AccessToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failOn != nil {
		if err := m.failOn(arg); err != nil {
			return db.AccessToken{}, err
		}
	}
	m.nextID++
	m.created[m.nextID] = arg
	return db.AccessToken{ID: m.nextID, UserID: arg.UserID, Name: arg.Name}, nil
}

func (m *mintedTokens) revoke(_ context.Context, arg db.DeleteAccessTokenParams) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.revoked = append(m.revoked, arg.ID)
	return nil
}

// named returns the ids and scopes of every token minted under name.
func (m *mintedTokens) named(name string) map[int64]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[int64]string{}
	for id, arg := range m.created {
		if arg.Name == name {
			out[id] = arg.Scopes
		}
	}
	return out
}

// scopesOfCloneURL returns the scopes of the token embedded in an
// authenticated clone URL, found by the token's stored hash.
func (m *mintedTokens) scopesOfCloneURL(t *testing.T, raw string) (int64, string) {
	t.Helper()
	parsed, err := url.Parse(raw)
	require.NoError(t, err)
	require.NotNil(t, parsed.User, "clone URL %s carries no credential", parsed.Redacted())
	plaintext, ok := parsed.User.Password()
	require.True(t, ok)
	sum := sha256.Sum256([]byte(plaintext))
	hash := hex.EncodeToString(sum[:])
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, arg := range m.created {
		if arg.TokenHash == hash {
			return id, arg.Scopes
		}
	}
	t.Fatalf("clone URL %s carries a token the store never minted", parsed.Redacted())
	return 0, ""
}

func requireBoundReadScopes(t *testing.T, scopes string, repositoryID int64, msgAndArgs ...any) {
	t.Helper()
	assert.NotEqual(t, string(middleware.ScopeReadRepository), scopes, msgAndArgs...)
	assert.ElementsMatch(t,
		[]string{string(middleware.ScopeReadRepository), middleware.RepositoryRestrictionScope(repositoryID)},
		strings.Split(scopes, ","), msgAndArgs...)
}

type fixedChangesetMaterializer []ChangesetMaterializedMember

func (m fixedChangesetMaterializer) MaterializeChangeset(context.Context, int64, int64) ([]ChangesetMaterializedMember, error) {
	return m, nil
}

func TestAnAgentBoxCloneTokenReadsOnlyTheRepositoryItClones(t *testing.T) {
	t.Parallel()

	tokens := newMintedTokens()
	dq := &mockAgentDispatchQuerier{createAccessTokenFn: tokens.create, deleteAccessTokenFn: tokens.revoke}
	var request sandbox.CreateRequest
	svc := newTestDispatchService(dq, nil)
	svc.sandbox = &mockSandboxVMClient{
		createVMFn: func(_ context.Context, req sandbox.CreateRequest) (sandbox.CreateResult, error) {
			request = req
			return sandbox.CreateResult{ID: "vm-bound-clone"}, nil
		},
	}
	svc.changesetMaterializer = fixedChangesetMaterializer{
		{RepositoryID: 201, Owner: "acme", Repo: "api", CommitID: strings.Repeat("a", 40)},
		{RepositoryID: 202, Owner: "acme", Repo: "web", CommitID: strings.Repeat("b", 40)},
	}

	_, err := svc.DispatchAgentRun(context.Background(), DispatchAgentRunInput{
		SessionID:    "sess-bound-clone",
		RepositoryID: 101,
		UserID:       7,
		RepoOwner:    "alice",
		RepoName:     "demo",
		ChangesetID:  23,
	})
	require.NoError(t, err)

	want := map[string]int64{
		"/workspace":          101,
		"/workspace/acme/api": 201,
		"/workspace/acme/web": 202,
	}
	require.Len(t, request.GitRepos, len(want))
	used := map[int64]bool{}
	for _, repo := range request.GitRepos {
		repositoryID, ok := want[repo.Path]
		require.True(t, ok, "unexpected clone path %s", repo.Path)
		id, scopes := tokens.scopesOfCloneURL(t, repo.Repo)
		requireBoundReadScopes(t, scopes, repositoryID, "clone of %s", repo.Path)
		assert.False(t, used[id], "clone of %s reuses another repository's token", repo.Path)
		used[id] = true
	}

	cloneTokens := tokens.named("sandbox-agent-clone")
	require.Len(t, cloneTokens, len(want), "one clone token per repository")
	var cloneIDs []int64
	for id := range cloneTokens {
		cloneIDs = append(cloneIDs, id)
	}
	assert.ElementsMatch(t, cloneIDs, tokens.revoked, "every clone token is revoked once the box exists, and only they are")
}

func TestAnAgentBoxRevokesEveryCloneTokenWhenAMemberCannotBeBound(t *testing.T) {
	t.Parallel()

	tokens := newMintedTokens()
	dq := &mockAgentDispatchQuerier{createAccessTokenFn: tokens.create, deleteAccessTokenFn: tokens.revoke}
	created := false
	svc := newTestDispatchService(dq, nil)
	svc.sandbox = &mockSandboxVMClient{
		createVMFn: func(context.Context, sandbox.CreateRequest) (sandbox.CreateResult, error) {
			created = true
			return sandbox.CreateResult{ID: "vm-never"}, nil
		},
	}
	svc.changesetMaterializer = fixedChangesetMaterializer{
		{RepositoryID: 201, Owner: "acme", Repo: "api", CommitID: strings.Repeat("a", 40)},
		{Owner: "acme", Repo: "unbound", CommitID: strings.Repeat("c", 40)},
	}

	_, err := svc.DispatchAgentRun(context.Background(), DispatchAgentRunInput{
		SessionID:    "sess-unbound-member",
		RepositoryID: 101,
		UserID:       7,
		RepoOwner:    "alice",
		RepoName:     "demo",
		ChangesetID:  23,
	})
	require.Error(t, err, "a member without a repository id gets no clone token at all")
	assert.False(t, created, "no box starts without a bound token for every member")

	cloneTokens := tokens.named("sandbox-agent-clone")
	for id, scopes := range cloneTokens {
		assert.NotEqual(t, string(middleware.ScopeReadRepository), scopes, "token %d is unbound", id)
	}
	var minted []int64
	for id := range tokens.created {
		minted = append(minted, id)
	}
	assert.ElementsMatch(t, minted, tokens.revoked, "the failed dispatch revokes every token it minted")
}

func TestAColdWorkspaceCloneTokenReadsOnlyItsRepository(t *testing.T) {
	t.Parallel()

	tokens := newMintedTokens()
	q := &mockWorkspaceQuerier{
		createAccessTokenFn: tokens.create,
		deleteAccessTokenFn: tokens.revoke,
		getActiveWorkspaceForUserRepoFn: func(context.Context, db.GetActiveWorkspaceForUserRepoParams) (db.Workspace, error) {
			return db.Workspace{}, pgx.ErrNoRows
		},
		updateWorkspaceExecutionInfoFn: func(_ context.Context, arg db.UpdateWorkspaceExecutionInfoParams) (db.Workspace, error) {
			w := sampleDBWorkspace(arg.ID)
			w.VmID = arg.VmID
			w.Status = arg.Status
			return w, nil
		},
	}
	vm := &mockWorkspaceSandboxVMClient{
		createVMFn: func(context.Context, sandbox.CreateRequest) (sandbox.CreateResult, error) {
			return sandbox.CreateResult{ID: "vm-cold"}, nil
		},
		execAwaitFn: func(context.Context, string, sandbox.ExecRequest) (sandbox.ExecResult, error) {
			zero := int32(0)
			return sandbox.ExecResult{StatusCode: &zero}, nil
		},
	}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(vm))

	workspace := derivedWorkspace("ws-cold", "landing/demo/main")
	workspace.RepositoryID = 303
	input := forkOpenInput("landing/demo/main")
	input.RepositoryID = 303
	got, err := svc.createWorkspaceVM(context.Background(), workspace, input)
	require.NoError(t, err)
	require.Equal(t, "vm-cold", got.VmID)

	cloneTokens := tokens.named("sandbox-workspace-clone")
	require.Len(t, cloneTokens, 1)
	for id, scopes := range cloneTokens {
		requireBoundReadScopes(t, scopes, 303, "workspace clone token")
		assert.Contains(t, tokens.revoked, id, "the clone token is revoked after the clone")
	}
}

func TestAForkedWorkspaceFetchTokenReadsOnlyItsRepository(t *testing.T) {
	t.Parallel()

	tokens := newMintedTokens()
	q := &mockWorkspaceQuerier{
		createAccessTokenFn: tokens.create,
		deleteAccessTokenFn: tokens.revoke,
		getActiveWorkspaceForUserRepoFn: func(context.Context, db.GetActiveWorkspaceForUserRepoParams) (db.Workspace, error) {
			primary := sampleDBWorkspace("ws-primary")
			primary.RepositoryID = 404
			primary.VmID = "vm-primary"
			return primary, nil
		},
		updateWorkspaceExecutionInfoFn: func(_ context.Context, arg db.UpdateWorkspaceExecutionInfoParams) (db.Workspace, error) {
			w := sampleDBWorkspace(arg.ID)
			w.IsFork = true
			w.VmID = arg.VmID
			w.Status = arg.Status
			return w, nil
		},
	}
	vm := &mockWorkspaceSandboxVMClient{
		getVMFn: func(_ context.Context, vmID string) (sandbox.Sandbox, error) {
			return sandbox.Sandbox{ID: vmID, State: sandbox.StateRunning}, nil
		},
		forkVMFn: func(context.Context, string, sandbox.ForkRequest) (sandbox.CreateResult, error) {
			return sandbox.CreateResult{ID: "vm-fork"}, nil
		},
		execAwaitFn: func(context.Context, string, sandbox.ExecRequest) (sandbox.ExecResult, error) {
			zero := int32(0)
			return sandbox.ExecResult{StatusCode: &zero}, nil
		},
	}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceSandboxClient(vm))

	workspace := derivedWorkspace("ws-branch", "landing/demo/main")
	workspace.RepositoryID = 404
	input := forkOpenInput("landing/demo/main")
	input.RepositoryID = 404
	got, err := svc.createWorkspaceVM(context.Background(), workspace, input)
	require.NoError(t, err)
	require.Equal(t, "vm-fork", got.VmID, "the fork path ran")

	fetchTokens := tokens.named("sandbox-fork-fetch")
	require.Len(t, fetchTokens, 1)
	for id, scopes := range fetchTokens {
		requireBoundReadScopes(t, scopes, 404, "fork fetch token")
		assert.Contains(t, tokens.revoked, id, "the fetch token is revoked after the fetch")
	}
}
