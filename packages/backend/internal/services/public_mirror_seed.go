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
// WHAT THIS PASS DOES. seed() takes a core-pool connection, then a
// SESSION-level advisory lock on that connection with the blocking
// pg_advisory_lock, and then makes every service-account, organization,
// repository, source and pull call through s.queries / s.orgs / s.repos — the
// same pool — while both are held. Every one of those steps used to run on the
// caller's context, and the caller is Start(ctx), whose ctx is the process's.
//
// THE HAZARD, as demonstrated. Both waits were unbounded, so neither was slow
// rather than absorbing: a pass can park in pg_advisory_lock while holding a
// core-pool connection, for as long as whoever holds that lock keeps it; and a
// pass that WINS the lock then needs a SECOND connection from the same pool
// for its own reads, which on a full pool it waits for without limit while
// still holding the first connection and the lock. Nothing refuses, so nothing
// is recorded, and the five-minute tick in Start never comes round again
// because Seed has not returned. Both halves are arranged and measured against
// real PostgreSQL at MaxConns 4 in core_pool_resident_closure_pg_test.go.
//
// WHAT IS NOT CLAIMED. Replicas have DISTINCT pools, so nothing here presents
// a holder in one process and a waiter in another as two connections of one
// pool, and no production connection's owner is identified by this file. The
// per-pass hazard above is what was demonstrated; the live core-pool failure
// is not closed by it.
//
// With the bound, a pass that cannot win the lock or cannot get its nested
// read gives the connection and the lock back and the next tick re-drives:
// seeding is idempotent by construction (it creates only what is missing), so
// a refused pass loses nothing. The budget is longer than the GitHub pull
// request the last step makes and far shorter than the interval.
//
// It bounds the pass, NOT the cleanup after it. The unlock and the connection
// teardown run detached, under their own corePoolRollbackBound, so the worst
// case a caller should expect is this budget PLUS that release budget.
const publicMirrorSeedHoldBudget = 2 * time.Minute

// publicMirrorUnlockOperation is the static name of the one statement the
// cleanup below runs. It is a constant in this file, not rendered SQL and not
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
	// unlock_failed: the statement did not come back with an answer at all —
	// it errored, or it did not complete inside the release budget. This
	// reason does not say which, and does not say why: whether the lock is
	// still held is simply unknown.
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
	// unlockFault is a test-only fault seam; see
	// withPublicMirrorSeedUnlockFault.
	unlockFault func() error
	logger      *slog.Logger
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

// withPublicMirrorSeedUnlockFault makes the unlock report itself unconfirmed,
// so a regression can prove what this pass does with a connection whose lock
// state it cannot confirm. Production leaves it nil.
//
// ITS PROOF LIMIT, stated where the seam is. The fault fires AFTER the real
// pg_advisory_unlock has already run and succeeded, so the lock is in fact
// released and the test is not observing a stuck advisory lock. What it does
// establish is the branch that matters: a pass that cannot confirm its unlock
// discards the session instead of returning it to the pool.
func withPublicMirrorSeedUnlockFault(fault func() error) PublicMirrorSeederOption {
	return func(s *PublicMirrorSeeder) { s.unlockFault = fault }
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
	// bound: the lock wait and every nested acquire this pass makes while
	// holding the connection AND the session lock. See
	// publicMirrorSeedHoldBudget.
	held, endHold := context.WithTimeout(ctx, s.hold)
	defer endHold()

	// Every replica seeds on start. One session lock per mirror keeps two of
	// them from creating the same organization or repository.
	conn, err := s.pool.Acquire(held)
	if err != nil {
		// Nothing is held yet: this is the pool refusing to start the pass.
		if held.Err() != nil && ctx.Err() == nil {
			corePoolDutyStall(s.duty, corePoolDutyPublicMirrorSeed, corePoolStageAcquireConnection)
		}
		return err
	}
	// The duty holds this connection until it actually leaves, so the gauge is
	// registered FIRST and therefore decremented LAST: defers unwind last in,
	// first out, and decrementing before the connection goes back would
	// publish a release the pool has not seen.
	releaseHeld := corePoolDutyHold(s.duty, corePoolDutyPublicMirrorSeed)
	defer func() { releaseHeld() }()

	lock := "smithers.public_mirror:" + strings.ToLower(mirror.String())
	if _, lockErr := conn.Exec(held, `SELECT pg_advisory_lock(hashtextextended($1, 0))`, lock); lockErr != nil {
		// A cancelled lock acquisition can have acquired just before the
		// cancellation, so this connection may be holding the lock: closing it
		// is the only way to be sure the next caller does not inherit the
		// block. Same reasoning and same shape as GitHubMainResetJournal.
		release, cancel := corePoolRelease(ctx)
		_ = conn.Hijack().Close(release)
		cancel()
		// This wait asked the pool for nothing: another session holds the
		// mirror's lock, and this pass held a connection while waiting for a
		// holder that owes it nothing. It is never an exhausted pool.
		if held.Err() != nil && ctx.Err() == nil {
			corePoolDutyStall(s.duty, corePoolDutyPublicMirrorSeed, corePoolStageSessionLock)
		}
		return lockErr
	}
	defer func() {
		// The session lock outlives the bound above it, so the unlock runs
		// detached and finite under its OWN budget: a cancelled caller must
		// still unlock, and an unlock that cannot finish must not become the
		// next hold. This is why a pass costs at most the hold budget plus the
		// release budget, and not the hold budget alone.
		//
		// AN UNCONFIRMED UNLOCK IS A DIRTY CONNECTION. pg_advisory_unlock
		// returning false, or not answering at all, means this session may
		// still hold the mirror's lock; returning it to the pool would hand
		// the next caller a connection that blocks every other replica's
		// seed. Close it instead and let the pool build a clean one.
		release, cancel := corePoolRelease(ctx)
		defer cancel()
		var unlocked bool
		unlockErr := conn.QueryRow(release, `SELECT pg_advisory_unlock(hashtextextended($1, 0))`, lock).Scan(&unlocked)
		if unlockErr == nil && s.unlockFault != nil {
			unlockErr = s.unlockFault()
		}
		if unlockErr != nil || !unlocked {
			// Finite fields only. The duty, the stage, the statement and which
			// of the two closed reasons happened is the whole diagnostic; the
			// mirror is a repository identifier and the driver error is
			// arbitrary prose, so neither is emitted.
			reason := publicMirrorUnlockReturnedFalse
			if unlockErr != nil {
				reason = publicMirrorUnlockFailed
			}
			s.logger.ErrorContext(ctx, "public_mirror.session_lock_unconfirmed",
				"duty", string(corePoolDutyPublicMirrorSeed),
				"stage", string(corePoolStageSessionLock),
				"operation", publicMirrorUnlockOperation,
				"reason", string(reason),
				"unlocked", unlocked)
			_ = conn.Hijack().Close(release)
			return
		}
		conn.Release()
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
