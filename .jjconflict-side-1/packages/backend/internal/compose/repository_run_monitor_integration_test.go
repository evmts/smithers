package compose

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/stretchr/testify/require"
)

// repositoryMonitorReader is Control's monitor read, and ONLY that read.
//
// `monitorReader` is the whole surface `runMonitors` holds, so no index read
// can reach a create, resume or start even by mistake; this fixture records
// what was actually asked of the live host so a test can say which runs were
// reached at all, and refuses the runs a test declares cold.
type repositoryMonitorReader struct {
	mu      sync.Mutex
	asked   []string
	refuse  map[string]bool
	state   map[string]string
	journal map[string][]map[string]any
}

func (r *repositoryMonitorReader) Monitor(_ context.Context, target flowruntime.Target, run string, at *int64) (json.RawMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.asked = append(r.asked, target.WorkspaceID+":"+run)
	if r.refuse[run] {
		return nil, fmt.Errorf("host unreachable")
	}
	state := r.state[run]
	if state == "" {
		state = "running"
	}
	value := map[string]any{
		"id": run, "flow": "todo", "title": "Ship the monitor", "version": "", "state": state,
		"attempts": []any{map[string]any{"n": 1, "run_id": run, "graph": []any{}, "steps": []any{}, "phases": []any{}}},
		"waits":    []any{}, "tokens": 0, "time_s": 0, "cost_usd": 0, "engine": []any{},
	}
	if at != nil || r.journal[run] != nil {
		rows := []map[string]any{}
		for _, row := range r.journal[run] {
			if at == nil || row["seq"].(int64) <= *at {
				rows = append(rows, row)
			}
		}
		value["journal"] = rows
	}
	return json.Marshal(value)
}

func (r *repositoryMonitorReader) reached() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.asked...)
}

func (r *repositoryMonitorReader) forget() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.asked = nil
}

// repositoryMonitorFixture is the deployed multi-user composition: real
// PostgreSQL, the production router, Cloud auth, and no install binding.
type repositoryMonitorFixture struct {
	t        *testing.T
	ctx      context.Context
	q        *db.Queries
	pool     *pgxpool.Pool
	router   http.Handler
	reader   *repositoryMonitorReader
	store    *jobs.Store
	origin   string
	private  int64
	public   int64
	cookies  map[string]string
	claimSeq int
}

func newRepositoryMonitorFixture(t *testing.T) *repositoryMonitorFixture {
	t.Helper()
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	q := db.New(pool)
	f := &repositoryMonitorFixture{t: t, ctx: ctx, q: q, pool: pool, origin: "https://cloud.test", cookies: map[string]string{}}
	f.reader = &repositoryMonitorReader{refuse: map[string]bool{}, state: map[string]string{}, journal: map[string][]map[string]any{}}

	owner := f.user("monitor-owner")
	collaborator := f.user("monitor-collaborator")
	outsider := f.user("monitor-outsider")
	f.private = ciTestRepo(t, pool, owner.ID, "app")
	f.public = ciTestRepo(t, pool, owner.ID, "docs")
	_, err := pool.Exec(ctx, `UPDATE repositories SET is_public = TRUE WHERE id = $1`, f.public)
	require.NoError(t, err)
	// A read collaborator is the actor the install roster has no row for.
	_, err = pool.Exec(ctx, `INSERT INTO collaborators (repository_id, user_id, permission) VALUES ($1, $2, 'read')`, f.private, collaborator.ID)
	require.NoError(t, err)
	_ = outsider

	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	cfg.Auth.SessionCookieName = "session"
	cfg.Server.PublicURL = f.origin
	cfg.Server.AllowedOrigins = []string{f.origin}
	require.False(t, config.IsSingleOwner(cfg.Auth), "this fixture must be the multi-user composition")

	monitors := &runMonitors{pool: pool, reader: f.reader}
	router := hostStatusProductionRouter(cfg, q, &services.InstallCapacityService{}, conformanceServices{pool: pool})
	mountRepositoryRunMonitors(router, cfg, q, monitors)
	f.router = router
	f.store, err = jobs.NewStore(pool)
	require.NoError(t, err)
	return f
}

func (f *repositoryMonitorFixture) user(name string) db.User {
	f.t.Helper()
	user, err := f.q.CreateUser(f.ctx, db.CreateUserParams{Username: name, LowerUsername: name, DisplayName: name})
	require.NoError(f.t, err)
	raw := name + "-session"
	sum := sha256.Sum256([]byte(raw))
	_, err = f.q.CreateAuthSession(f.ctx, db.CreateAuthSessionParams{
		UserID: user.ID, Username: user.Username, SessionKey: hex.EncodeToString(sum[:]), ExpiresAt: time.Now().Add(time.Hour),
	})
	require.NoError(f.t, err)
	f.cookies[name] = raw
	return user
}

// admit parks one run's admission checkpoint: the authority every monitor read
// resolves through. This is the canonical dispatch record, not a second engine.
func (f *repositoryMonitorFixture) admit(repo int64, workspace, run, status string) {
	f.t.Helper()
	f.claimSeq++
	scope := jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repo), PrincipalID: "user:1"}
	request := fmt.Sprintf("monitor-%s-%d", run, f.claimSeq)
	_, err := f.store.Admit(f.ctx, jobs.Admission{
		Scope: scope, Operation: flowdispatch.OperationLaunch, RequestID: request,
		Payload: json.RawMessage(`{}`), AuthorizationContext: json.RawMessage(`{}`), EffectPolicy: jobs.EffectReconcile,
	})
	require.NoError(f.t, err)
	claim, err := f.store.Claim(f.ctx, request, time.Minute)
	require.NoError(f.t, err)
	checkpoint := flowdispatch.RuntimeCheckpoint{
		RunID: run, FlowID: "todo", ExecutionDigest: strings.Repeat("a", 64),
		Target: flowruntime.Target{TenantID: scope.TenantID, PrincipalID: scope.PrincipalID, WorkspaceID: workspace},
	}
	if status != "" {
		checkpoint.Run = &flowruntime.FlowRuntimeRun{RunID: run, Status: status}
	}
	raw, err := json.Marshal(checkpoint)
	require.NoError(f.t, err)
	_, err = f.store.BeginExternal(f.ctx, claim, json.RawMessage(`{"kind":"launching"}`))
	require.NoError(f.t, err)
	require.NoError(f.t, f.store.Park(f.ctx, claim, raw, time.Hour))
}

// retain writes the answer the dispatcher keeps when a branch settles, so the
// run reads back cold without any host being reached.
func (f *repositoryMonitorFixture) retain(repo int64, workspace, run, status, state string) {
	f.t.Helper()
	monitor := fmt.Sprintf(`{"id":%q,"flow":"todo","title":"Earlier run","version":"","state":%q,"attempts":[{"n":1,"run_id":%q,"graph":[],"steps":[],"phases":[]}],"waits":[],"tokens":0,"time_s":0,"cost_usd":0,"engine":[]}`, run, state, run)
	_, err := f.pool.Exec(f.ctx, `INSERT INTO run_archives (repository_id, workspace_id, run_id, flow_id, status, summary, tree, monitor)
		VALUES ($1,$2,$3,'todo',$4,'{}'::jsonb,'[]'::jsonb,$5::jsonb)`, repo, workspace, run, status, monitor)
	require.NoError(f.t, err)
}

func (f *repositoryMonitorFixture) get(as, path string) *httptest.ResponseRecorder {
	f.t.Helper()
	req := httptest.NewRequest(http.MethodGet, f.origin+path, nil)
	if as != "" {
		req.AddCookie(&http.Cookie{Name: "session", Value: f.cookies[as]})
	}
	out := httptest.NewRecorder()
	f.router.ServeHTTP(out, req)
	return out
}

// admissions counts every record a launch would write. An index read must not
// move any of them: listing answers whether runs exist, it does not make one.
func (f *repositoryMonitorFixture) admissions() [3]int64 {
	f.t.Helper()
	var counts [3]int64
	for i, query := range []string{
		`SELECT count(*) FROM product_job_requests`,
		`SELECT count(*) FROM product_job_dispatches`,
		`SELECT count(*) FROM workspaces`,
	} {
		require.NoError(f.t, f.pool.QueryRow(f.ctx, query).Scan(&counts[i]))
	}
	return counts
}

func monitorRows(t *testing.T, out *httptest.ResponseRecorder) []map[string]any {
	t.Helper()
	require.Equal(t, 200, out.Code, out.Body.String())
	var rows []map[string]any
	require.NoError(t, json.Unmarshal(out.Body.Bytes(), &rows), out.Body.String())
	return rows
}

func monitorIDs(rows []map[string]any) []string {
	ids := []string{}
	for _, row := range rows {
		ids = append(ids, fmt.Sprint(row["id"]))
	}
	return ids
}

/*
TestRepositoryRunMonitorsPermissionsPostgres is the multi-user boundary the
hosted monitor was missing.

[#4032](https://github.com/smithersai/smithers/issues/4032): the only run index
the app could read resolved a single-owner INSTALL binding, so on the deployed
Cloud backend every reader got `code: "permission"` and the app had no answer to
show. This qualifies the repository's own index against the real router: who may
read it, what an unreadable run answers, and that reading never admits anything.
*/
func TestRepositoryRunMonitorsPermissionsPostgres(t *testing.T) {
	f := newRepositoryMonitorFixture(t)
	f.admit(f.private, "box-a", "live-run", "running")
	f.admit(f.private, "box-b", "cold-run", "completed")
	f.admit(f.private, "box-c", "blind-run", "running")
	f.admit(f.public, "box-d", "docs-run", "running")
	// The settled branch answers from its retained monitor; its host refuses.
	f.retain(f.private, "box-b", "cold-run", "completed", "done")
	f.reader.refuse["cold-run"] = true
	// Nothing retained this one and its host cannot be reached either.
	f.reader.refuse["blind-run"] = true

	before := f.admissions()

	t.Run("the owner reads every run of the repository", func(t *testing.T) {
		rows := monitorRows(t, f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors"))
		require.ElementsMatch(t, []string{"box-a:live-run", "box-b:cold-run", "box-c:blind-run"}, monitorIDs(rows))
	})

	t.Run("a read collaborator reads the same index", func(t *testing.T) {
		rows := monitorRows(t, f.get("monitor-collaborator", "/api/repos/monitor-owner/app/monitors"))
		require.ElementsMatch(t, []string{"box-a:live-run", "box-b:cold-run", "box-c:blind-run"}, monitorIDs(rows))
	})

	t.Run("a signed-in outsider reaches no private run", func(t *testing.T) {
		out := f.get("monitor-outsider", "/api/repos/monitor-owner/app/monitors")
		require.Equal(t, 404, out.Code)
		require.NotContains(t, out.Body.String(), "live-run")
		out = f.get("monitor-outsider", "/api/repos/monitor-owner/app/monitors/box-a:live-run")
		require.Equal(t, 404, out.Code)
		require.NotContains(t, out.Body.String(), "live-run")
	})

	t.Run("an unauthenticated reader is asked to sign in, never answered empty", func(t *testing.T) {
		for _, path := range []string{"/api/repos/monitor-owner/app/monitors", "/api/repos/monitor-owner/docs/monitors", "/api/repos/monitor-owner/docs/monitors/box-d:docs-run"} {
			out := f.get("", path)
			require.Equal(t, 401, out.Code, path)
			require.NotEqual(t, "[]\n", out.Body.String(), path)
		}
	})

	t.Run("a public repository's runs are readable by whoever reads the repository", func(t *testing.T) {
		rows := monitorRows(t, f.get("monitor-outsider", "/api/repos/monitor-owner/docs/monitors"))
		require.Equal(t, []string{"box-d:docs-run"}, monitorIDs(rows))
	})

	t.Run("one repository's run is not found under another", func(t *testing.T) {
		out := f.get("monitor-owner", "/api/repos/monitor-owner/docs/monitors/box-a:live-run")
		require.Equal(t, 404, out.Code, out.Body.String())
		require.NotContains(t, out.Body.String(), "Ship the monitor")
		out = f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors/box-d:docs-run")
		require.Equal(t, 404, out.Code, out.Body.String())
	})

	t.Run("a repository nobody has is not found", func(t *testing.T) {
		require.Equal(t, 404, f.get("monitor-owner", "/api/repos/monitor-owner/absent/monitors").Code)
	})

	t.Run("a settled run reads back without its host being reached", func(t *testing.T) {
		f.reader.forget()
		out := f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors/box-b:cold-run")
		require.Equal(t, 200, out.Code, out.Body.String())
		require.Contains(t, out.Body.String(), `"state":"done"`)
		require.NotContains(t, f.reader.reached(), "box-b:cold-run")
	})

	t.Run("a run nobody could read says so, and does not claim to be no run", func(t *testing.T) {
		rows := monitorRows(t, f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors"))
		var blind map[string]any
		for _, row := range rows {
			if row["id"] == "box-c:blind-run" {
				blind = row
			}
		}
		require.NotNil(t, blind, "an unreadable run keeps its row")
		require.Equal(t, true, blind["unavailable"])
		require.Equal(t, "running", blind["state"], "the row keeps the admission's last observation")
		require.Nil(t, blind["attempts"], "a refused read grants no monitor data")
	})

	t.Run("a replay position this build cannot parse is refused", func(t *testing.T) {
		out := f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors/box-a:live-run?at=-3")
		require.Equal(t, 400, out.Code, out.Body.String())
	})

	t.Run("reading the index admitted, created and resumed nothing", func(t *testing.T) {
		require.Equal(t, before, f.admissions())
	})
}

/*
TestRepositoryRunMonitorsProgressPostgres follows one admitted run through the
same door the app reads it with: running, finished, failed, and read again.

The card is the SAME card each time — one id, one monitor model, one
checkpoint authority — because a hosted reader must not get a different run
shape from an install's reader.
*/
func TestRepositoryRunMonitorsProgressPostgres(t *testing.T) {
	f := newRepositoryMonitorFixture(t)
	f.admit(f.private, "box-a", "live-run", "running")
	before := f.admissions()
	path := "/api/repos/monitor-owner/app/monitors/box-a:live-run"

	stateOf := func(out *httptest.ResponseRecorder) string {
		t.Helper()
		require.Equal(t, 200, out.Code, out.Body.String())
		var value map[string]any
		require.NoError(t, json.Unmarshal(out.Body.Bytes(), &value))
		require.Equal(t, "box-a:live-run", value["id"], "the qualified id the app opened is the id it reads back")
		return fmt.Sprint(value["state"])
	}

	for _, step := range []struct{ reported, read string }{
		{"running", "running"}, {"done", "done"}, {"failed", "failed"},
	} {
		f.reader.state["live-run"] = step.reported
		require.Equal(t, step.read, stateOf(f.get("monitor-owner", path)), "reported %q", step.reported)
		rows := monitorRows(t, f.get("monitor-owner", "/api/repos/monitor-owner/app/monitors"))
		require.Equal(t, []string{"box-a:live-run"}, monitorIDs(rows))
		require.Equal(t, step.read, fmt.Sprint(rows[0]["state"]), "the index and the card agree")
	}

	t.Run("the failure trace reads its journal, and reload reads the same card", func(t *testing.T) {
		f.reader.journal["live-run"] = []map[string]any{
			{"seq": int64(1), "at": "2026-10-16T00:00:01Z", "type": "control.engine.event", "text": `{"version":1,"executionId":"native-1","eventType":"flows.engine.node-settled","payload":{"nodeId":"step","action":"coding/check-command","outcome":"built","result":{"preview":"{\"checkId\":\"unit\",\"status\":\"failed\"}","truncated":false}}}`},
		}
		first := f.get("monitor-owner", path+"/trace")
		require.Equal(t, 200, first.Code, first.Body.String())
		require.Contains(t, first.Body.String(), `"journal"`)
		require.Contains(t, first.Body.String(), `"replay"`)
		second := f.get("monitor-owner", path+"/trace")
		require.JSONEq(t, first.Body.String(), second.Body.String(), "a reload reads the same persisted card")
	})

	t.Run("following a run admitted, created and resumed nothing", func(t *testing.T) {
		require.Equal(t, before, f.admissions())
	})
}
