package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/smithersai/smithers/packages/backend/internal/database"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/githubrepo"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// A public mirror is a public GitHub repository a hosted deployment always
// serves, signed out, under the same owner and name. The deployment names its
// mirrors in SMITHERS_PUBLIC_MIRRORS and the seeder creates each one that is
// missing on every start, so a mirror depends on no person's account, import
// or token and exists on a database that began empty. The seeder never changes
// what it finds: a private organization or repository stays private and is
// reported.
//
// The seeder writes rows only. History arrives through the GitHub main pull
// (github_main_pull.go), which creates the default bookmark of the empty
// repository at GitHub's tip and follows it from then on. That requires the
// GitHub repository to declare `mirror: "pull"` in .smithers/factory.json.

// publicMirrorSeedHoldBudget bounds ONE seed pass from its first acquire to
// the end of its locked work, and it exists because this pass is a core-pool
// duty that holds a connection across work which acquires from the SAME pool.
//
// WHAT THIS PASS DOES. seed() takes the mirror's SESSION-level advisory lock
// on a core-pool connection (database.AcquireSessionLock) and then makes every
// service-account, organization, repository, source and pull call through
// s.queries / s.orgs / s.repos, the same pool, while both are held.
//
// ONE WINNER, NO WAITER (plue#839). Every replica seeds on start and every five
// minutes. The lock is a single try: the replica that wins seeds, and every
// other replica skips the pass without holding a connection, a lock or a
// snapshot. On 2026-10-17 the blocking pg_advisory_lock made the losing
// replica hold a core-pool connection, and a snapshot that pinned the server's
// xmin, for as long as the winner kept the lock, and the winner was itself
// parked in a nested read on a full pool.
//
// THE WINNER'S HAZARD remains: having won, it needs a SECOND connection from
// the same pool for its reads, and on a full pool that wait used to be
// unbounded while it held the first connection and the lock. This budget ends
// it: a pass that cannot finish gives the lock and the connection back, and
// the next tick re-drives. Seeding is idempotent by construction (it creates
// only what is missing), so a refused or skipped pass loses nothing. The
// budget is longer than the GitHub pull request the last step makes and far
// shorter than the interval.
//
// It bounds the pass, NOT the unlock after it, which SessionLock.Release runs
// detached under its own short bound.
const publicMirrorSeedHoldBudget = 2 * time.Minute

// publicMirrorUnlockOperation is the static name of the one statement the
// unlock runs. It is a constant in this file, not rendered SQL and not
// derived from anything a connection carried.
const publicMirrorUnlockOperation = "pg_advisory_unlock"

// publicMirrorUnlockReason is the closed set of ways a seed pass can fail to
// confirm it gave the mirror's session lock back. A driver error string is not
// one of them: the reason a diagnostic needs is which of these two happened,
// and the raw text can carry a host, a parameter or a credential.
type publicMirrorUnlockReason string

const (
	// unlock_returned_false: the statement answered, and the answer was that
	// this session did not hold the lock it tried to release.
	publicMirrorUnlockReturnedFalse publicMirrorUnlockReason = "unlock_returned_false"
	// unlock_failed: the statement did not come back with an answer at all.
	// Whether the lock is still held is unknown.
	publicMirrorUnlockFailed publicMirrorUnlockReason = "unlock_failed"
)

// publicMirrorSeedInterval is how often the seeder rechecks its mirrors: a
// mirror that failed to seed or was deleted converges within one interval.
const publicMirrorSeedInterval = 5 * time.Minute

// PublicMirror names one mirrored GitHub repository.
type PublicMirror struct {
	Owner string
	Repo  string
}

func (m PublicMirror) String() string { return m.Owner + "/" + m.Repo }

// ParsePublicMirrors reads owner/repo entries. A malformed entry is an
// error: a deployment that names a mirror must not start without it.
func ParsePublicMirrors(values []string) ([]PublicMirror, error) {
	mirrors := make([]PublicMirror, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		// The entry keeps its case: it is also the name a created
		// organization and repository are given.
		owner, repo, found := strings.Cut(strings.TrimSpace(value), "/")
		if _, _, err := githubrepo.NormalizeRef(owner, repo); !found || err != nil {
			return nil, fmt.Errorf("public mirror %q must be owner/repo", value)
		}
		if err := validateOwnerSegment("Organization", "name", owner); err != nil {
			return nil, fmt.Errorf("public mirror %q: %w", value, err)
		}
		if err := validateRepoName(repo); err != nil {
			return nil, fmt.Errorf("public mirror %q: %w", value, err)
		}
		key := strings.ToLower(owner + "/" + repo)
		if seen[key] {
			continue
		}
		seen[key] = true
		mirrors = append(mirrors, PublicMirror{Owner: owner, Repo: repo})
	}
	return mirrors, nil
}

// publicMirrorPulls starts a repository's GitHub main pull.
// *GitHubMainPullService implements it.
type publicMirrorPulls interface {
	Request(ctx context.Context, repositoryID int64) (GitHubMainPullStatus, error)
}

// PublicMirrorSeeder creates a hosted deployment's missing public mirrors.
type PublicMirrorSeeder struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	orgs     *OrgService
	repos    *RepoService
	pulls    publicMirrorPulls
	mirrors  []PublicMirror
	interval time.Duration
	hold     time.Duration
	duty     CorePoolDutyObserver
	logger   *slog.Logger
}

// PublicMirrorSeederOption configures a seeder.
type PublicMirrorSeederOption func(*PublicMirrorSeeder)

// WithPublicMirrorSeedCorePoolObserver publishes which core-pool connection
// this duty is holding and which written bound refused one. Without it the
// pool's own active-over-max gauge is the only signal, and that reads full for
// a worker that is seeding and for one that is parked, naming neither.
func WithPublicMirrorSeedCorePoolObserver(observer CorePoolDutyObserver) PublicMirrorSeederOption {
	return func(s *PublicMirrorSeeder) { s.duty = observer }
}

// withPublicMirrorSeedHoldBudget shortens the hold for tests that have to
// observe a refusal.
func withPublicMirrorSeedHoldBudget(hold time.Duration) PublicMirrorSeederOption {
	return func(s *PublicMirrorSeeder) { s.hold = hold }
}

func NewPublicMirrorSeeder(pool *pgxpool.Pool, orgs *OrgService, repos *RepoService, pulls publicMirrorPulls, mirrors []PublicMirror, opts ...PublicMirrorSeederOption) *PublicMirrorSeeder {
	seeder := &PublicMirrorSeeder{pool: pool, queries: db.New(pool), orgs: orgs, repos: repos, pulls: pulls, mirrors: mirrors, interval: publicMirrorSeedInterval, hold: publicMirrorSeedHoldBudget, logger: slog.Default()}
	for _, opt := range opts {
		opt(seeder)
	}
	return seeder
}

// Start seeds now and again every interval until ctx ends.
func (s *PublicMirrorSeeder) Start(ctx context.Context) {
	if s == nil || len(s.mirrors) == 0 {
		return
	}
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	// A mirror that cannot be seeded stays that way until someone acts, so a
	// failure is logged when it first appears or changes, and once when it ends.
	reported := ""
	for {
		err := s.Seed(ctx)
		failure := ""
		if err != nil {
			failure = err.Error()
		}
		if ctx.Err() == nil && failure != reported {
			if err != nil {
				s.logger.ErrorContext(ctx, "public_mirror.seed_failed", "error", err)
			} else {
				s.logger.InfoContext(ctx, "public_mirror.seed_recovered")
			}
			reported = failure
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Seed creates what each mirror is missing. One mirror's failure does not
// stop the others; the errors are joined.
func (s *PublicMirrorSeeder) Seed(ctx context.Context) error {
	var failures []error
	for _, mirror := range s.mirrors {
		if err := s.seed(ctx, mirror); err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", mirror, err))
		}
	}
	return errors.Join(failures...)
}

func (s *PublicMirrorSeeder) seed(ctx context.Context, mirror PublicMirror) (err error) {
	// Everything from the acquire below to the unlock runs under one written
	// bound: the lock attempt and every nested acquire this pass makes while
	// holding the connection AND the session lock. See
	// publicMirrorSeedHoldBudget.
	held, endHold := context.WithTimeout(ctx, s.hold)
	defer endHold()

	lock, err := database.AcquireSessionLock(held, s.pool, database.SessionLockRequest{
		Duty: string(corePoolDutyPublicMirrorSeed), Key: "smithers.public_mirror:" + strings.ToLower(mirror.String()),
		Observer: s.duty,
	})
	if errors.Is(err, database.ErrSessionLockBusy) {
		// Another replica is seeding this mirror right now. This one holds
		// nothing and the next tick checks again.
		return nil
	}
	if err != nil {
		if held.Err() != nil && ctx.Err() == nil {
			stage := corePoolStageSessionLock
			if errors.Is(err, database.ErrSessionLockNoConnection) {
				stage = corePoolStageAcquireConnection
			}
			corePoolDutyStall(s.duty, corePoolDutyPublicMirrorSeed, stage)
		}
		return err
	}
	defer func() {
		// AN UNCONFIRMED UNLOCK IS A DIRTY CONNECTION, so Release closed it
		// instead of handing every other replica's next seed a blocked lock.
		releaseErr := lock.Release()
		if releaseErr == nil {
			return
		}
		// Finite fields only. The mirror is a repository identifier and the
		// driver error is arbitrary prose, so neither is emitted.
		reason := publicMirrorUnlockFailed
		if errors.Is(releaseErr, database.ErrSessionUnlockReturnedFalse) {
			reason = publicMirrorUnlockReturnedFalse
		}
		s.logger.ErrorContext(ctx, "public_mirror.session_lock_unconfirmed",
			"duty", string(corePoolDutyPublicMirrorSeed),
			"stage", string(corePoolStageSessionLock),
			"operation", publicMirrorUnlockOperation,
			"reason", string(reason))
	}()
	// Whatever the locked work returns, say whether this bound is why.
	defer func() {
		if held.Err() != nil && ctx.Err() == nil && err != nil {
			corePoolDutyStall(s.duty, corePoolDutyPublicMirrorSeed, corePoolStageLockedWork)
		}
	}()

	actor, err := s.serviceAccount(held)
	if err != nil {
		return err
	}
	org, err := s.organization(held, actor, mirror.Owner)
	if err != nil {
		return err
	}
	repository, created, err := s.repository(held, actor, org, mirror)
	if err != nil {
		return err
	}
	if !repository.IsPublic {
		// It was private before this deployment named it, so it may hold
		// history nobody chose to publish. Its owners decide, not a setting.
		return errors.New("the repository is private; an owner makes it public")
	}
	sourced, err := s.source(held, repository, mirror)
	if err != nil {
		return err
	}
	if created || sourced {
		// Start the first pull now instead of on the pull's next discovery.
		if _, err := s.pulls.Request(held, repository.ID); err != nil {
			return fmt.Errorf("request the GitHub pull: %w", err)
		}
		s.logger.InfoContext(ctx, "public_mirror.seeded", "repository", mirror.String(), "repository_id", repository.ID, "created", created)
	}
	return nil
}

// serviceAccount is the deployment's own account (migration 0108). It creates
// what the seeder creates and owns a seeded organization until a person is
// made its owner. It cannot sign in and none of its tokens authenticate.
func (s *PublicMirrorSeeder) serviceAccount(ctx context.Context) (*db.User, error) {
	id, err := s.queries.GetBranchMachineOwner(ctx)
	if err != nil {
		return nil, fmt.Errorf("load the deployment service account: %w", err)
	}
	user, err := s.queries.GetUserByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("load the deployment service account: %w", err)
	}
	return &user, nil
}

// organization returns the mirror's owner, creating it as a public
// organization when nothing holds the name. An existing organization is used
// as it is; a private one is refused, because its repositories are not listed
// signed out and its visibility is its owners' decision.
func (s *PublicMirrorSeeder) organization(ctx context.Context, actor *db.User, name string) (db.Organization, error) {
	lower := strings.ToLower(name)
	org, err := s.queries.GetOrgByLowerName(ctx, lower)
	if errors.Is(err, pgx.ErrNoRows) {
		org, err = s.orgs.createOrgWithOwner(ctx, actor.ID, db.CreateOrganizationParams{Name: name, LowerName: lower, Visibility: "public"})
		var refusal *pkgerrors.APIError
		if errors.As(err, &refusal) && refusal.Status == http.StatusConflict {
			// Organizations and users share one namespace.
			return db.Organization{}, fmt.Errorf("%q is a user account, not an organization", name)
		}
		if err != nil {
			return db.Organization{}, fmt.Errorf("create the organization: %w", err)
		}
		s.logger.InfoContext(ctx, "public_mirror.organization_created", "organization", org.Name, "organization_id", org.ID)
	} else if err != nil {
		return db.Organization{}, fmt.Errorf("load the organization: %w", err)
	}
	if org.Visibility != "public" {
		return db.Organization{}, fmt.Errorf("organization %q is %s; a public mirror needs a public organization", org.Name, org.Visibility)
	}
	return org, nil
}

func (s *PublicMirrorSeeder) repository(ctx context.Context, actor *db.User, org db.Organization, mirror PublicMirror) (db.Repository, bool, error) {
	repository, err := s.queries.GetRepoByOwnerAndLowerName(ctx, db.GetRepoByOwnerAndLowerNameParams{Owner: org.LowerName, LowerName: strings.ToLower(mirror.Repo)})
	if err == nil {
		return repository, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Repository{}, false, fmt.Errorf("load the repository: %w", err)
	}
	// Empty on purpose: the GitHub pull creates the default bookmark.
	repository, err = s.repos.createOrgRepository(ctx, actor, org, mirror.Repo, "Imported from github.com/"+mirror.String(), true, "", false, time.Now().UTC())
	if err != nil {
		return db.Repository{}, false, fmt.Errorf("create the repository: %w", err)
	}
	return repository, true, nil
}

// source records the mirror's GitHub repository on a repository that names
// none, which is what the GitHub main pull follows. A repository that already
// follows another GitHub repository is not this mirror and is refused.
func (s *PublicMirrorSeeder) source(ctx context.Context, repository db.Repository, mirror PublicMirror) (bool, error) {
	sources := []string{}
	if destination := strings.TrimSpace(repository.MirrorDestination); destination != "" {
		owner, repo, err := githubrepo.ParseMirrorDestination(destination)
		if err != nil {
			return false, fmt.Errorf("read the repository's mirror destination: %w", err)
		}
		sources = append(sources, owner+"/"+repo)
	} else {
		rows, err := s.queries.ListRepositoryGitHubSources(ctx, repository.ID)
		if err != nil {
			return false, fmt.Errorf("load the repository's GitHub source: %w", err)
		}
		for _, row := range rows {
			sources = append(sources, row.GithubOwner+"/"+row.GithubRepo)
		}
	}
	for _, source := range sources {
		if !strings.EqualFold(source, mirror.String()) {
			return false, fmt.Errorf("the repository follows github.com/%s", source)
		}
	}
	if len(sources) > 0 {
		return false, nil
	}
	if _, err := s.pool.Exec(ctx, `UPDATE repositories SET mirror_destination = $2, updated_at = NOW() WHERE id = $1`,
		repository.ID, "https://github.com/"+mirror.String()); err != nil {
		return false, fmt.Errorf("record the GitHub source: %w", err)
	}
	return true, nil
}
