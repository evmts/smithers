package compose

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/stretchr/testify/require"
)

/*
TestInstallRepositoryRunMonitorAuthorizationPostgres qualifies the install's
own policy on the repository-scoped monitor reads.

`GET /api/repos/{owner}/{repo}/monitors[/{id}[/trace]]` is the SAME monitor
read `/api/runs` serves ([#4032](https://github.com/smithersai/smithers/issues/4032)),
so on an install it is the same `monitor` command: the roster, the
credential's scope and the catalog's actors decide it, not repository `read`
alone. A credential that may read the repository is not thereby an install
credential that may read the install's runs — these cells are the ones the
repository ACL on its own would have admitted.

Cloud keeps its own decision: `TestRepositoryRunMonitorsPermissionsPostgres`
reads the same index as a repository collaborator who has no roster row at
all, so this command policy must not follow the route onto a multi-user
deployment.
*/
func TestInstallRepositoryRunMonitorAuthorizationPostgres(t *testing.T) {
	f := newLandingGateFixtureWithFactory(t, nil, "", true)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode, cfg.Auth.SessionCookieName = "selfhost", "session"
	cfg.Server.PublicURL = "http://example.com"
	cfg.Server.AllowedOrigins = []string{cfg.Server.PublicURL}
	scope := jobs.Scope{TenantID: fmt.Sprintf("repository:%d", f.repoID), PrincipalID: fmt.Sprintf("user:%d", f.owner.ID)}
	store, err := jobs.NewStore(f.pool)
	require.NoError(t, err)
	_, err = store.Admit(f.ctx, jobs.Admission{Scope: scope, Operation: flowdispatch.OperationLaunch, RequestID: "repo-monitor-policy", Payload: json.RawMessage(`{}`), AuthorizationContext: json.RawMessage(`{}`), EffectPolicy: jobs.EffectReconcile})
	require.NoError(t, err)
	claim, err := store.Claim(f.ctx, "repo-monitor-policy", time.Minute)
	require.NoError(t, err)
	checkpoint, err := json.Marshal(flowdispatch.RuntimeCheckpoint{RunID: "thrash-run", FlowID: "todo", ExecutionDigest: strings.Repeat("a", 64), Target: flowruntime.Target{TenantID: scope.TenantID, PrincipalID: scope.PrincipalID, WorkspaceID: "monitor-box"}})
	require.NoError(t, err)
	_, err = store.BeginExternal(f.ctx, claim, json.RawMessage(`{"kind":"launching"}`))
	require.NoError(t, err)
	require.NoError(t, store.Park(f.ctx, claim, checkpoint, time.Hour))

	reader := &admissionMonitorReader{}
	router := hostStatusProductionRouter(cfg, f.q, &services.InstallCapacityService{}, conformanceServices{pool: f.pool})
	mountRepositoryRunMonitors(router, cfg, f.q, &runMonitors{pool: f.pool, reader: reader})
	session := func(user db.User, raw string) {
		sum := sha256.Sum256([]byte(raw))
		_, err := f.q.CreateAuthSession(f.ctx, db.CreateAuthSessionParams{UserID: user.ID, Username: user.Username, SessionKey: hex.EncodeToString(sum[:]), ExpiresAt: time.Now().Add(time.Hour)})
		require.NoError(t, err)
	}
	ownerCookie, memberCookie := "repo-monitor-owner", "repo-monitor-member"
	session(f.owner, ownerCookie)
	session(f.other, memberCookie)
	// Every refused credential below may read this repository: a write
	// collaborator's own agent run, its workspace-bound machine, and a
	// delegated agent holding read:repository. Only the install's `monitor`
	// policy tells them apart.
	external := f.token(f.other, "repo-monitor-external", "write:repository,via:codex", true)
	readOnlyAgent := f.token(f.other, "repo-monitor-read-agent", "read:repository,via:codex", true)
	run := f.token(f.owner, "repo-monitor-run", "write:repository", true)
	machine := f.token(f.owner, "repo-monitor-machine", "write:repository,"+middleware.WorkspaceRestrictionScope("11111111-1111-4111-8111-111111111111"), true)
	for _, actor := range []struct {
		name, cookie, token string
		status, decisions   int
	}{
		{"owner", ownerCookie, "", 200, 1},
		{"member", memberCookie, "", 200, 1},
		{"external agent", "", external, 200, 1},
		{"read-scope agent", "", readOnlyAgent, 403, 1},
		{"unbound run", "", run, 403, 1},
		{"unbound machine", "", machine, 403, 1},
		{"anonymous", "", "", 401, 0},
	} {
		for _, path := range []string{
			"/api/repos/gate-owner/app/monitors",
			"/api/repos/gate-owner/app/monitors/thrash-run",
			"/api/repos/gate-owner/app/monitors/monitor-box:thrash-run/trace",
		} {
			t.Run(actor.name+path, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, cfg.Server.PublicURL+path, nil)
				if actor.cookie != "" {
					req.AddCookie(&http.Cookie{Name: "session", Value: actor.cookie})
				}
				if actor.token != "" {
					req.Header.Set("Authorization", "Bearer "+actor.token)
				}
				var commands []string
				req = req.WithContext(services.WithAuthorizationObserver(req.Context(), func(command string) { commands = append(commands, command) }))
				before := reader.calls
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				require.Equal(t, actor.status, out.Code, out.Body.String())
				require.Len(t, commands, actor.decisions)
				if actor.decisions > 0 {
					require.Equal(t, []string{"monitor"}, commands)
				}
				if actor.status == 200 {
					require.Contains(t, out.Body.String(), "thrash-run")
					require.Equal(t, before+1, reader.calls)
					return
				}
				// A refused read reaches no host and discloses no run.
				require.Equal(t, before, reader.calls)
				require.NotContains(t, out.Body.String(), "thrash-run")
				if actor.status == 403 {
					require.Contains(t, out.Body.String(), `"class":"permission"`)
					require.Contains(t, out.Body.String(), `"code":"permission"`)
				}
			})
		}
	}
}
