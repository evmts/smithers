package services

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// recordedMirrorPulls is the GitHub main pull as the seeder sees it.
type recordedMirrorPulls struct {
	mu        sync.Mutex
	requested []int64
	err       error
}

func (p *recordedMirrorPulls) Request(_ context.Context, repositoryID int64) (GitHubMainPullStatus, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.requested = append(p.requested, repositoryID)
	return GitHubMainPullStatus{}, p.err
}

type publicMirrorFixture struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	pulls   *recordedMirrorPulls
	// inits are the repositories created on the repository host, as
	// owner/repo with the autoInit flag.
	inits  []string
	seeder *PublicMirrorSeeder
}

func newPublicMirrorFixture(t *testing.T, pool *pgxpool.Pool, mirrors ...string) *publicMirrorFixture {
	t.Helper()
	parsed, err := ParsePublicMirrors(mirrors)
	require.NoError(t, err)
	f := &publicMirrorFixture{pool: pool, queries: db.New(pool), pulls: &recordedMirrorPulls{}}
	var mu sync.Mutex
	host := &mockRepoHostClient{initRepoFn: func(_ context.Context, owner, repo, bookmark string, autoInit bool) error {
		mu.Lock()
		defer mu.Unlock()
		assert.Equal(t, "main", bookmark)
		assert.False(t, autoInit, "a mirror starts empty; GitHub's history is its first commit")
		f.inits = append(f.inits, owner+"/"+repo)
		return nil
	}}
	f.seeder = NewPublicMirrorSeeder(pool, NewOrgServiceWithPool(f.queries, pool), NewRepoService(f.queries, host, "s1"), f.pulls, parsed)
	return f
}

func (f *publicMirrorFixture) repository(t *testing.T, owner, name string) db.Repository {
	t.Helper()
	repository, err := f.queries.GetRepoByOwnerAndLowerName(context.Background(), db.GetRepoByOwnerAndLowerNameParams{Owner: owner, LowerName: name})
	require.NoError(t, err)
	return repository
}

func (f *publicMirrorFixture) catalog(t *testing.T) []string {
	t.Helper()
	rows, err := f.queries.ListPublicRepositoryCatalog(context.Background())
	require.NoError(t, err)
	names := []string{}
	for _, row := range rows {
		names = append(names, row.Name)
	}
	return names
}

func (f *publicMirrorFixture) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, f.pool.QueryRow(context.Background(), query, args...).Scan(&n))
	return n
}

// The whole point: a database that holds nothing but the product schema ends
// up serving the mirror signed out, and the GitHub pull knows to fill it.
func TestPublicMirrorSeedOnAnEmptyDatabase(t *testing.T) {
	f := newPublicMirrorFixture(t, newProductTestPool(t), "smithersai/smithers")
	ctx := context.Background()
	require.Zero(t, f.count(t, `SELECT count(*) FROM users WHERE user_type <> 'service'`), "no person has an account")
	require.Empty(t, f.catalog(t))

	require.NoError(t, f.seeder.Seed(ctx))

	org, err := f.queries.GetOrgByLowerName(ctx, "smithersai")
	require.NoError(t, err)
	assert.Equal(t, "public", org.Visibility)
	assert.Equal(t, 1, f.count(t, `SELECT count(*) FROM org_members m JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1 AND m.role = 'owner' AND u.lower_username = 'smithers-machines'`, org.ID),
		"the deployment's service account owns an organization it created")
	repository := f.repository(t, "smithersai", "smithers")
	assert.True(t, repository.IsPublic)
	assert.Equal(t, org.ID, repository.OrgID.Int64)
	assert.Equal(t, "main", repository.DefaultBookmark)
	assert.Equal(t, "Imported from github.com/smithersai/smithers", repository.Description)
	assert.Equal(t, "https://github.com/smithersai/smithers", repository.MirrorDestination)
	assert.Equal(t, []string{"smithersai/smithers"}, f.inits)
	assert.Equal(t, []string{"smithersai/smithers"}, f.catalog(t), "a signed-out visitor is offered the mirror")
	assert.Equal(t, []int64{repository.ID}, f.pulls.requested, "the first pull starts at once")
	sourced, err := f.queries.ListRepositoryIDsForGitHubSource(ctx, "smithersai", "smithers")
	require.NoError(t, err)
	assert.Equal(t, []int64{repository.ID}, sourced, "the GitHub main pull follows the repository from then on")

	// Every later start and tick finds it in place and writes nothing.
	require.NoError(t, f.seeder.Seed(ctx))
	require.NoError(t, f.seeder.Seed(ctx))
	assert.Equal(t, []string{"smithersai/smithers"}, f.inits)
	assert.Equal(t, []int64{repository.ID}, f.pulls.requested)
	assert.Equal(t, repository.UpdatedAt, f.repository(t, "smithersai", "smithers").UpdatedAt)
	assert.Equal(t, 1, f.count(t, `SELECT count(*) FROM organizations`))
	assert.Equal(t, 1, f.count(t, `SELECT count(*) FROM repositories`))
}

// Production's shape on 2026-10-13: a person's organization already holds
// the repository, imported from GitHub while private, with workspace
// snapshots and work branches nobody chose to publish.
func TestPublicMirrorSeedNeverPublishesAnExistingPrivateRepository(t *testing.T) {
	pool := newProductTestPool(t)
	f := newPublicMirrorFixture(t, pool, "smithersai/smithers")
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users(id, username, lower_username) VALUES (1001, 'will', 'will')`)
	require.NoError(t, err)
	var org, repository int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name, lower_name, visibility) VALUES ('smithersai', 'smithersai', 'public') RETURNING id`).Scan(&org))
	_, err = pool.Exec(ctx, `INSERT INTO org_members(organization_id, user_id, role) VALUES ($1, 1001, 'owner')`, org)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id, name, lower_name, is_public) VALUES ($1, 'smithers', 'smithers', FALSE) RETURNING id`, org).Scan(&repository))
	_, err = pool.Exec(ctx, `INSERT INTO import_jobs (user_id, github_owner, github_repo, repo_owner, repo_name, branch, status, repository_id)
		VALUES (1001, 'smithersai', 'smithers', 'smithersai', 'smithers', 'main', 'ready', $1)`, repository)
	require.NoError(t, err)
	before := f.repository(t, "smithersai", "smithers")

	err = f.seeder.Seed(ctx)

	require.ErrorContains(t, err, "smithersai/smithers: the repository is private; an owner makes it public")
	assert.Equal(t, before, f.repository(t, "smithersai", "smithers"), "the repository is untouched")
	assert.Empty(t, f.catalog(t))
	assert.Empty(t, f.inits)
	assert.Empty(t, f.pulls.requested)
	assert.Equal(t, 1, f.count(t, `SELECT count(*) FROM org_members WHERE organization_id = $1`, org), "the organization's members are untouched")

	// Once an owner publishes it, the mirror is in place and the seeder
	// still writes nothing: the import already names the GitHub source.
	_, err = pool.Exec(ctx, `UPDATE repositories SET is_public = TRUE WHERE id = $1`, repository)
	require.NoError(t, err)
	published := f.repository(t, "smithersai", "smithers")
	require.NoError(t, f.seeder.Seed(ctx))
	assert.Equal(t, published, f.repository(t, "smithersai", "smithers"))
	assert.Equal(t, []string{"smithersai/smithers"}, f.catalog(t))
	assert.Empty(t, f.pulls.requested, "the pull already follows an imported repository")
}

// A repository someone created by hand with no GitHub source gets the
// mirror's, so the pull fills it.
func TestPublicMirrorSeedRecordsTheSourceOfAnUnsourcedRepository(t *testing.T) {
	pool := newProductTestPool(t)
	f := newPublicMirrorFixture(t, pool, "smithersai/smithers")
	ctx := context.Background()
	var org, repository int64
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO organizations(name, lower_name, visibility) VALUES ('smithersai', 'smithersai', 'public') RETURNING id`).Scan(&org))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repositories(org_id, name, lower_name, is_public) VALUES ($1, 'smithers', 'smithers', TRUE) RETURNING id`, org).Scan(&repository))

	require.NoError(t, f.seeder.Seed(ctx))

	assert.Equal(t, "https://github.com/smithersai/smithers", f.repository(t, "smithersai", "smithers").MirrorDestination)
	assert.Equal(t, []int64{repository}, f.pulls.requested)
	assert.Empty(t, f.inits)
}

func TestPublicMirrorSeedRefusesWhatIsNotItsMirror(t *testing.T) {
	for _, test := range []struct {
		name, setup, refusal string
		// existing is what a signed-out visitor was already offered.
		existing []string
	}{
		{
			name:    "the owner is a person",
			setup:   `INSERT INTO users(id, username, lower_username) VALUES (1001, 'smithersai', 'smithersai')`,
			refusal: `"smithersai" is a user account, not an organization`,
		},
		{
			name:    "the organization is private",
			setup:   `INSERT INTO organizations(name, lower_name, visibility) VALUES ('smithersai', 'smithersai', 'private')`,
			refusal: `organization "smithersai" is private`,
		},
		{
			name: "the repository follows another GitHub repository",
			setup: `WITH o AS (INSERT INTO organizations(name, lower_name, visibility) VALUES ('smithersai', 'smithersai', 'public') RETURNING id)
				INSERT INTO repositories(org_id, name, lower_name, is_public, mirror_destination)
				SELECT id, 'smithers', 'smithers', TRUE, 'https://github.com/someone/fork' FROM o`,
			refusal:  "the repository follows github.com/someone/fork",
			existing: []string{"smithersai/smithers"},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			pool := newProductTestPool(t)
			f := newPublicMirrorFixture(t, pool, "smithersai/smithers")
			_, err := pool.Exec(context.Background(), test.setup)
			require.NoError(t, err)
			repositories := f.count(t, `SELECT count(*) FROM repositories`)

			err = f.seeder.Seed(context.Background())

			require.ErrorContains(t, err, "smithersai/smithers: ")
			require.ErrorContains(t, err, test.refusal)
			assert.ElementsMatch(t, test.existing, f.catalog(t), "nothing became public")
			assert.Equal(t, repositories, f.count(t, `SELECT count(*) FROM repositories`))
			assert.Zero(t, f.count(t, `SELECT count(*) FROM repositories WHERE updated_at > created_at`), "nothing was written")
			assert.Empty(t, f.inits)
			assert.Empty(t, f.pulls.requested)
		})
	}
}

func TestPublicMirrorSeedSeedsTheOthersWhenOneFails(t *testing.T) {
	pool := newProductTestPool(t)
	f := newPublicMirrorFixture(t, pool, "taken/tool", "Effect-TS/effect")
	_, err := pool.Exec(context.Background(), `INSERT INTO users(id, username, lower_username) VALUES (1001, 'taken', 'taken')`)
	require.NoError(t, err)

	err = f.seeder.Seed(context.Background())

	require.ErrorContains(t, err, `taken/tool: "taken" is a user account`)
	assert.Equal(t, []string{"effect-ts/effect"}, f.catalog(t))
	org, err := f.queries.GetOrgByLowerName(context.Background(), "effect-ts")
	require.NoError(t, err)
	assert.Equal(t, "Effect-TS", org.Name, "a created organization keeps the configured case")
}

// Every API replica seeds on start.
func TestPublicMirrorSeedFromConcurrentReplicasCreatesOneMirror(t *testing.T) {
	pool := newProductTestPool(t)
	first := newPublicMirrorFixture(t, pool, "smithersai/smithers")
	second := newPublicMirrorFixture(t, pool, "smithersai/smithers")
	var wg sync.WaitGroup
	failures := make(chan error, 8)
	for _, f := range []*publicMirrorFixture{first, second, first, second} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			failures <- f.seeder.Seed(context.Background())
		}()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		require.NoError(t, err)
	}
	assert.Equal(t, 1, first.count(t, `SELECT count(*) FROM organizations`))
	assert.Equal(t, 1, first.count(t, `SELECT count(*) FROM repositories`))
	assert.Len(t, append(first.inits, second.inits...), 1)
	assert.Len(t, append(first.pulls.requested, second.pulls.requested...), 1)
}

func TestPublicMirrorSeedReportsAPullItCouldNotRequest(t *testing.T) {
	f := newPublicMirrorFixture(t, newProductTestPool(t), "smithersai/smithers")
	f.pulls.err = assert.AnError

	require.ErrorIs(t, f.seeder.Seed(context.Background()), assert.AnError)

	assert.True(t, f.repository(t, "smithersai", "smithers").IsPublic)
	// The pull's own discovery tracks the sourced repository regardless.
	n, err := f.queries.RequestUntrackedGithubMainPulls(context.Background(), 50)
	require.NoError(t, err)
	assert.EqualValues(t, 1, n)
}

func TestParsePublicMirrors(t *testing.T) {
	mirrors, err := ParsePublicMirrors([]string{"smithersai/smithers", " Effect-TS/effect ", "SmithersAI/Smithers", "jj-vcs/jj"})
	require.NoError(t, err)
	assert.Equal(t, []PublicMirror{{Owner: "smithersai", Repo: "smithers"}, {Owner: "Effect-TS", Repo: "effect"}, {Owner: "jj-vcs", Repo: "jj"}}, mirrors,
		"case is kept and a repeated repository is one mirror")

	empty, err := ParsePublicMirrors(nil)
	require.NoError(t, err)
	assert.Empty(t, empty)

	for _, malformed := range []string{"", "smithers", "smithersai/", "/smithers", "a/b/c", "https://github.com/smithersai/smithers", "smithersai/smithers.git/", "bad owner/repo", "-owner/repo", "owner/.github"} {
		_, err := ParsePublicMirrors([]string{"smithersai/smithers", malformed})
		assert.Error(t, err, "%q", malformed)
	}
}

func TestPublicMirrorSeederWithoutMirrorsNeverStarts(t *testing.T) {
	var seeder *PublicMirrorSeeder
	seeder.Start(context.Background())
	NewPublicMirrorSeeder(nil, nil, nil, nil, nil).Start(context.Background())
}

func TestPublicMirrorSeederStartSeedsUntilItsContextEnds(t *testing.T) {
	f := newPublicMirrorFixture(t, newProductTestPool(t), "smithersai/smithers")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		f.seeder.Start(ctx)
	}()
	require.Eventually(t, func() bool { return len(f.catalog(t)) == 1 }, 10*time.Second, 20*time.Millisecond)
	cancel()
	<-done
}
