package compose

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowmanifest"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// The organization Flow family is the optional third packaged host
// (flows/organization). The backend authorizes, starts, supervises and relays
// to it exactly as it does the coding and librarian hosts. The host owns its
// runs, schedules and connector sessions in its own Control journal under the
// organization workspace's managed-host state; the backend observes that
// journal through the runtime bridge and adds no second scheduler.
const (
	organizationBindingKind           = "organization"
	organizationRepositoryEnvironment = "SMITHERS_ORGANIZATION_REPOSITORY"
	organizationServiceName           = "smithers-organization-host"
	// The primary workspace kind WorkspaceService.CreateWorkspace reuses for a
	// repository's default bookmark; reads look it up without provisioning.
	organizationWorkspaceKind = "container"
	organizationKeepInterval  = time.Minute
	organizationKeepTimeout   = 5 * time.Minute
)

// errOrganizationUnavailable is the only refusal the relay reports. Every
// reason (unconfigured, another repository, another principal, a missing
// repository) answers the same so callers learn nothing about repositories.
var errOrganizationUnavailable = errors.New("organization Flow family unavailable")

type organizationQueries interface {
	GetSelfHostOwner(context.Context) (db.User, error)
	GetRepoByOwnerAndLowerName(context.Context, db.GetRepoByOwnerAndLowerNameParams) (db.Repository, error)
	GetWorkspaceForUserRepo(context.Context, db.GetWorkspaceForUserRepoParams) (db.Workspace, error)
	GetActiveWorkspaceForUserRepoKind(context.Context, db.GetActiveWorkspaceForUserRepoKindParams) (db.Workspace, error)
}

// organizationFamily holds the operator's organization configuration. It is
// enabled only when the manifest verified an organization host, this is a
// single-owner installation, and SMITHERS_ORGANIZATION_REPOSITORY names the
// one repository whose workspace runs that host.
type organizationFamily struct {
	queries    organizationQueries
	repository string
	owner      string
	name       string
	// disabled explains, for logs, why the family refuses every target.
	disabled string
}

func newOrganizationFamily(registry *flowmanifest.Registry, role topology, queries organizationQueries) (*organizationFamily, error) {
	family := &organizationFamily{queries: queries}
	configured := strings.TrimSpace(os.Getenv(organizationRepositoryEnvironment))
	if configured != "" {
		owner, name, ok := strings.Cut(configured, "/")
		if !browserFlowRepo.MatchString(configured) || !ok || owner == "." || owner == ".." || name == "." || name == ".." {
			return nil, fmt.Errorf("%s must name one repository as owner/name", organizationRepositoryEnvironment)
		}
		family.repository, family.owner, family.name = configured, owner, name
	}
	switch {
	case registry == nil || !registry.HasOrganization:
		family.disabled = "the Flow host manifest has no organization host"
	case role.hosted():
		family.disabled = "the organization host serves single-owner installations only"
	case configured == "":
		family.disabled = organizationRepositoryEnvironment + " is unset"
	case queries == nil:
		family.disabled = "product queries are unavailable"
	}
	return family, nil
}

func (family *organizationFamily) enabled() bool {
	return family != nil && family.disabled == ""
}

// admitOwner authorizes a signed-in product user: only the installation
// owner, only while the family is enabled.
func (family *organizationFamily) admitOwner(ctx context.Context, user *db.User) error {
	if !family.enabled() || user == nil {
		return errOrganizationUnavailable
	}
	owner, err := family.queries.GetSelfHostOwner(ctx)
	if err != nil || owner.ID <= 0 || owner.ID != user.ID {
		return errOrganizationUnavailable
	}
	return nil
}

// admitRepository additionally requires the configured repository, owned by
// that installation owner.
func (family *organizationFamily) admitRepository(ctx context.Context, user *db.User, requested string) error {
	if err := family.admitOwner(ctx, user); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(requested), family.repository) {
		return errOrganizationUnavailable
	}
	return nil
}

func ownsRepository(repository db.Repository, userID int64) bool {
	return repository.ID > 0 && repository.UserID.Valid && repository.UserID.Int64 == userID && !repository.OrgID.Valid
}

// primaryWorkspace reads, without provisioning, the running primary workspace
// the organization binding lives on.
func (family *organizationFamily) primaryWorkspace(ctx context.Context, repositoryID, userID int64) (db.Workspace, error) {
	workspace, err := family.queries.GetActiveWorkspaceForUserRepoKind(ctx, db.GetActiveWorkspaceForUserRepoKindParams{
		RepositoryID: repositoryID, UserID: userID, Kind: organizationWorkspaceKind,
	})
	if err != nil || workspace.Status != "running" || workspace.RepositoryID != repositoryID || workspace.UserID != userID {
		return db.Workspace{}, errors.New("organization workspace is not running")
	}
	return workspace, nil
}

func (family *organizationFamily) target(repositoryID, userID int64, workspaceID string) flowruntime.Target {
	return flowruntime.Target{
		TenantID:    "repository:" + strconv.FormatInt(repositoryID, 10),
		PrincipalID: "user:" + strconv.FormatInt(userID, 10),
		WorkspaceID: workspaceID, BindingKind: organizationBindingKind, BindingID: family.repository,
	}
}

// ResolveFlowHostTarget re-derives the organization authority on every
// resolution: the enabled family, its configured repository, the current
// installation owner, and a running workspace of that repository owned by
// that owner. Nothing from the request is trusted beyond those identifiers.
func (family *organizationFamily) ResolveFlowHostTarget(ctx context.Context, target flowruntime.Target) (flowhost.Authority, error) {
	if target.BindingKind != organizationBindingKind || target.WorkspaceID == "" {
		return flowhost.Authority{}, errors.New("organization Flow target is invalid")
	}
	if !family.enabled() {
		reason := "the organization family is unavailable"
		if family != nil {
			reason = family.disabled
		}
		return flowhost.Authority{}, fmt.Errorf("organization Flow family is disabled: %s", reason)
	}
	if target.BindingID != family.repository {
		return flowhost.Authority{}, errors.New("organization Flow target names another repository")
	}
	owner, err := family.queries.GetSelfHostOwner(ctx)
	if err != nil || owner.ID <= 0 || target.PrincipalID != "user:"+strconv.FormatInt(owner.ID, 10) {
		return flowhost.Authority{}, errors.New("organization Flow principal is not the installation owner")
	}
	repository, err := family.queries.GetRepoByOwnerAndLowerName(ctx, db.GetRepoByOwnerAndLowerNameParams{Owner: family.owner, LowerName: family.name})
	if err != nil || !ownsRepository(repository, owner.ID) || target.TenantID != "repository:"+strconv.FormatInt(repository.ID, 10) {
		return flowhost.Authority{}, errors.New("organization Flow repository is unavailable")
	}
	workspace, err := family.queries.GetWorkspaceForUserRepo(ctx, db.GetWorkspaceForUserRepoParams{
		ID: target.WorkspaceID, RepositoryID: repository.ID, UserID: owner.ID,
	})
	if err != nil || workspace.ID != target.WorkspaceID || workspace.Status != "running" {
		return flowhost.Authority{}, errors.New("organization Flow workspace is unavailable")
	}
	return flowhost.Authority{
		Target: target, RepositoryID: repository.ID, UserID: owner.ID, WorkspaceID: workspace.ID,
		CatalogKey: flowhost.CatalogOrganization, Repository: family.repository,
	}, nil
}

// withOrganizationTargets gives the organization binding kind its own
// resolver, which refuses by name while the family is disabled.
func withOrganizationTargets(base flowhost.TargetResolver, organization flowhost.TargetResolver) flowhost.TargetResolver {
	return flowhost.TargetResolverFunc(func(ctx context.Context, target flowruntime.Target) (flowhost.Authority, error) {
		if target.BindingKind == organizationBindingKind {
			return organization.ResolveFlowHostTarget(ctx, target)
		}
		return base.ResolveFlowHostTarget(ctx, target)
	})
}

func organizationCatalog(registry *flowmanifest.Registry) flowhost.Catalog {
	return flowhost.Catalog{
		Key: flowhost.CatalogOrganization, Family: flowhost.CatalogOrganization,
		Executable: registry.Organization.Executable, ArtifactDigest: registry.Organization.SHA256,
		ServiceName: organizationServiceName, Environment: organizationHostEnvironment(os.Environ()),
	}
}

// organizationHostEnvironment forwards only the names the organization host
// reads: model credentials like the librarian host, and the organization,
// Slack, Google and credential-key settings the operator actually set.
func organizationHostEnvironment(environ []string) map[string]string {
	environment := make(map[string]string)
	for _, entry := range environ {
		name, value, ok := strings.Cut(entry, "=")
		value = strings.TrimSpace(value)
		if !ok || value == "" {
			continue
		}
		switch {
		case name == "OPENAI_API_KEY", name == "ANTHROPIC_API_KEY", name == "AI_GATEWAY_API_KEY",
			name == "SMITHERS_EVALUATOR_BASE_URL", name == "SMITHERS_CREDENTIAL_KEY",
			strings.HasPrefix(name, "SMITHERS_ORGANIZATION_"), strings.HasPrefix(name, "SMITHERS_SLACK_"),
			strings.HasPrefix(name, "SMITHERS_GOOGLE_"):
			environment[name] = value
		}
	}
	return environment
}

type organizationRepos interface {
	GetRepoView(context.Context, *db.User, string, string) (services.RepoView, error)
}

type organizationWorkspaces interface {
	CreateWorkspace(context.Context, services.CreateWorkspaceInput) (services.WorkspaceResponse, error)
}

// organizationKeeper keeps the organization host provisioned and running
// without a browser, so its connectors and schedules keep working. Each pass
// is idempotent: it reuses the primary workspace and asks the same resolver
// durable dispatch uses, which reconnects to a verified live host or starts
// one under a new owner generation.
type organizationKeeper struct {
	family     *organizationFamily
	repos      organizationRepos
	workspaces organizationWorkspaces
	runtime    flowruntime.Resolver

	mu          sync.Mutex
	lastRefusal string
}

func (keeper *organizationKeeper) ensure(ctx context.Context) error {
	if !keeper.family.enabled() {
		return fmt.Errorf("organization Flow family is disabled: %s", keeper.family.disabled)
	}
	owner, err := keeper.family.queries.GetSelfHostOwner(ctx)
	if err != nil || owner.ID <= 0 {
		return errors.New("no installation owner exists yet")
	}
	view, err := keeper.repos.GetRepoView(ctx, &owner, keeper.family.owner, keeper.family.name)
	if err != nil || !view.CanWrite || !ownsRepository(view.Repository, owner.ID) {
		return fmt.Errorf("%s does not name a repository the installation owner owns", organizationRepositoryEnvironment)
	}
	workspace, err := keeper.workspaces.CreateWorkspace(ctx, services.CreateWorkspaceInput{
		RepositoryID: view.Repository.ID, UserID: owner.ID, RepoOwner: keeper.family.owner, RepoName: keeper.family.name,
	})
	if err != nil {
		return fmt.Errorf("organization workspace unavailable: %w", err)
	}
	if workspace.Status != "running" {
		return fmt.Errorf("organization workspace is %s", workspace.Status)
	}
	if _, err := keeper.runtime.ResolveFlowRuntime(ctx, keeper.family.target(view.Repository.ID, owner.ID, workspace.ID)); err != nil {
		return fmt.Errorf("organization host unavailable: %w", err)
	}
	return nil
}

// pass runs one bounded ensure and logs only transitions, so a refusal that
// persists is visible once rather than every minute.
func (keeper *organizationKeeper) pass(ctx context.Context) {
	passCtx, cancel := context.WithTimeout(ctx, organizationKeepTimeout)
	defer cancel()
	err := keeper.ensure(passCtx)
	if ctx.Err() != nil {
		return
	}
	keeper.mu.Lock()
	defer keeper.mu.Unlock()
	refusal := ""
	if err != nil {
		refusal = err.Error()
	}
	if refusal == keeper.lastRefusal {
		return
	}
	keeper.lastRefusal = refusal
	if err != nil {
		slog.Warn("organization Flow host is not running", "repository", keeper.family.repository, "reason", refusal)
		return
	}
	slog.Info("organization Flow host is running", "repository", keeper.family.repository)
}

func (keeper *organizationKeeper) run(ctx context.Context) {
	keeper.pass(ctx)
	ticker := time.NewTicker(organizationKeepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			keeper.pass(ctx)
		}
	}
}
