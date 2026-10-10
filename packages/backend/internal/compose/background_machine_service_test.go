package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/cgi"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/process"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

// Real SQL and process lifecycle, paired with the composed HTTP/SSH refusal
// matrix in TestBackgroundMachineTerminalAdmission. A guest is not required
// to reproduce the service authorization failure that leaked its capacity slot.
func TestBackgroundMachineServiceLifecycle(t *testing.T) {
	for _, kind := range []string{"learning", "review", "mythical-wiki"} {
		t.Run(kind, func(t *testing.T) {
			f := presenceInstall(t)
			q, ctx := db.New(f.pool), t.Context()
			row, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams{RepositoryID: f.row.RepositoryID, UserID: f.user.ID, Name: "background-service", TargetBookmark: "main", Status: "running", Kind: "vm"})
			require.NoError(t, err)
			binding := flowhost.Binding{ID: uuid.NewString(), WorkspaceID: row.ID, RepositoryID: row.RepositoryID, UserID: row.UserID, BindingKind: kind}
			_, err = f.pool.Exec(ctx, `INSERT INTO flow_runtime_host_bindings(id,tenant_id,principal_id,binding_kind,binding_id,repository_id,user_id,workspace_id,catalog_key,service_name,runtime_artifact_digest,source_revision,owner_generation,credential_ciphertext,credential_hash,state) VALUES($1,'test','test',$2,'test',$3,$4,$5,'coding','test',$6,$7,1,'test',decode(repeat('00',32),'hex'),'starting')`, binding.ID, kind, row.RepositoryID, row.UserID, row.ID, strings.Repeat("b", 64), strings.Repeat("a", 40))
			require.NoError(t, err)
			runtime, err := process.New(process.Config{Root: t.TempDir()})
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, runtime.Close()) })
			op := workspaceapi.WithOperation(ctx, workspaceapi.Operation{TenantID: "test", PrincipalID: "test", OperationID: "service-lifecycle"})
			_, err = runtime.CreateWorkspace(op, workspaceapi.WorkspaceSpec{ID: row.ID})
			require.NoError(t, err)
			_, err = runtime.StartWorkspace(op, row.ID)
			require.NoError(t, err)
			receipt, _ := json.Marshal(map[string]any{"version": 1, "workspace_id": row.ID, "repository_id": row.RepositoryID, "source_revision": strings.Repeat("a", 40), "initialized_at": time.Now().UTC()})
			// Initialization receipt is checked by the production composition's
			// service-owned gate, never by the person's workspace loader.
			require.NoError(t, runtime.WriteRepositoryReceipt(op, row.ID, receipt))
			service := services.NewWorkspaceService(q, services.WithWorkspaceRuntime(runtime))
			authority := flowhost.Authority{WorkspaceID: row.ID, RepositoryID: row.RepositoryID, UserID: row.UserID}
			authority.Target.BindingKind = kind
			t.Run("receipt", func(t *testing.T) {
				require.NoError(t, services.FlowHostMachineInitialized(ctx, q, runtime, authority))
				require.NoError(t, service.FlowHostWorkspaceInitialized(ctx, authority))
			})
			t.Run("launcher classification", func(t *testing.T) {
				invoked := services.NewInvokedFlowService(f.pool, nil, nil)
				manual, err := invoked.IsBackgroundFlowHost(ctx, row.ID)
				require.NoError(t, err)
				require.False(t, manual, "pinned background machines are not manual-main hosts")
			})
			t.Run("release-on-failure", func(t *testing.T) {
				require.NoError(t, service.ReleaseFailedFlowHostMachine(context.WithoutCancel(ctx), binding))
			})
			current, err := q.GetWorkspace(ctx, row.ID)
			require.NoError(t, err)
			require.Equal(t, "stopped", current.Status)
			observed, err := runtime.InspectWorkspace(op, row.ID)
			require.NoError(t, err)
			require.Equal(t, workspaceapi.WorkspaceStopped, observed.State, "release confirms the runtime stopped, not just the SQL row")
		})
	}
}

// The production lane adapter binds the background identity before launching
// async provisioning. Real git, jj, PostgreSQL and the process runtime expose
// the exact authorization ordering that left wiki refresh stuck at starting.
func TestBackgroundMachineLaneProvisioning(t *testing.T) {
	for _, kind := range []string{"learning", "review", "mythical-wiki"} {
		t.Run(kind, func(t *testing.T) {
			f := presenceInstall(t)
			ctx, q := t.Context(), db.New(f.pool)
			gitRoot, seed := t.TempDir(), t.TempDir()
			bare := filepath.Join(gitRoot, "api", "presence-owner", "app.git")
			git := func(args ...string) string {
				out, err := exec.Command("git", args...).CombinedOutput()
				require.NoError(t, err, string(out))
				return strings.TrimSpace(string(out))
			}
			require.NoError(t, os.MkdirAll(bare, 0700))
			git("init", "--bare", bare)
			git("init", "-b", "main", seed)
			git("-C", seed, "config", "user.name", "Service rehearsal")
			git("-C", seed, "config", "user.email", "service@example.test")
			require.NoError(t, os.WriteFile(filepath.Join(seed, "README.md"), []byte("background service source\n"), 0600))
			git("-C", seed, "add", ".")
			git("-C", seed, "commit", "-m", "Source")
			git("-C", seed, "push", bare, "HEAD:refs/heads/main", "HEAD:refs/heads/mythical")
			executable, err := exec.LookPath("git")
			require.NoError(t, err)
			server := httptest.NewServer(&cgi.Handler{Path: executable, Args: []string{"http-backend"}, Dir: gitRoot, Env: []string{"GIT_PROJECT_ROOT=" + gitRoot, "GIT_HTTP_EXPORT_ALL=1"}})
			defer server.Close()
			runtime, err := process.New(process.Config{Root: t.TempDir(), Environment: map[string]string{"PATH": os.Getenv("PATH")}})
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, runtime.Close()) })
			service := services.NewWorkspaceService(q, services.WithWorkspaceRuntime(runtime), services.WithWorkspaceTransactions(f.pool), services.WithWorkspaceGitBaseURL(server.URL+"/api"), services.WithBranchMachineProviders(*rehearsalBranchMachines(f.pool)))
			lanes := services.NewWorkspaceMythicalLanes(service)
			repo, err := q.GetRepoByID(ctx, f.row.RepositoryID)
			require.NoError(t, err)
			id, err := lanes.Create(ctx, repo, "presence-owner", f.user.ID, "service-"+kind, services.MythicalPlacement{Kind: "container"}, func(id string) error {
				_, err := f.pool.Exec(ctx, `INSERT INTO flow_runtime_host_bindings(id,tenant_id,principal_id,binding_kind,binding_id,repository_id,user_id,workspace_id,catalog_key,service_name,runtime_artifact_digest,source_revision,owner_generation,credential_ciphertext,credential_hash,state) VALUES($1,'test','test',$2,'test',$3,$4,$5,'coding','test',$6,$7,1,'test',decode(repeat('00',32),'hex'),'starting')`, uuid.NewString(), kind, repo.ID, f.user.ID, id, strings.Repeat("b", 64), strings.Repeat("a", 40))
				return err
			})
			require.NoError(t, err)
			wait, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			require.NoError(t, service.WaitForProvisioning(wait))
			row, err := q.GetWorkspace(ctx, id)
			require.NoError(t, err)
			require.Equal(t, "running", row.Status, "%s: %s", row.ProvisioningStage, row.FailureMessage.String)
			data, err := runtime.ReadFile(ctx, id, "README.md")
			require.NoError(t, err)
			require.Equal(t, "background service source\n", string(data))
			authority := flowhost.Authority{WorkspaceID: id, RepositoryID: repo.ID, UserID: row.UserID}
			authority.Target.BindingKind = kind
			require.NoError(t, services.FlowHostMachineInitialized(ctx, q, runtime, authority))
			// Service work grants no person entry, including the actor whose request
			// created the run and owns a write share on the background lane.
			_, err = service.AuthorizeTerminalBranch(ctx, id, repo.ID, f.user.ID)
			require.ErrorContains(t, err, "background machine belongs to its run")
			// An interrupted provisioning pass restarts under the same private
			// machine authority; it cannot fall back to the person's loader.
			_, err = f.pool.Exec(ctx, `UPDATE workspaces SET status='starting',updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1`, id)
			require.NoError(t, err)
			require.NoError(t, service.ReconcileWorkspaceProvisioning(ctx))
			require.NoError(t, service.WaitForProvisioning(wait))
			recovered, err := q.GetWorkspace(ctx, id)
			require.NoError(t, err)
			require.Equal(t, "running", recovered.Status)
			require.NoError(t, service.ReleaseFailedFlowHostMachine(ctx, flowhost.Binding{WorkspaceID: id, RepositoryID: repo.ID, UserID: f.user.ID, BindingKind: kind}))
			stopped, err := q.GetWorkspace(ctx, id)
			require.NoError(t, err)
			require.Equal(t, "stopped", stopped.Status)
			require.NotEqual(t, fmt.Sprint(f.user.ID), fmt.Sprint(row.UserID), "lane is owned by the machine service, not its request actor")
		})
	}
}

// Capture, sleep and retirement use the same verified service transition.
// The retained-object fixture also checks the composed person's branch door.
func TestBackgroundMachineCaptureSleepRetire(t *testing.T) {
	for _, kind := range []string{"learning", "review", "mythical-wiki"} {
		t.Run(kind, func(t *testing.T) { branchSleepInstall(t, "background-"+kind) })
	}
}

// J10 owns review machine start and failed-start release; J8 owns learning and
// wiki work. Keep every service path in their preflight so widening a person
// classifier cannot leave the journeys green while lifecycle work is refused.
func backgroundMachineServiceRehearsal(t *testing.T) {
	t.Run("start receipt release", TestBackgroundMachineServiceLifecycle)
	t.Run("async provisioning", TestBackgroundMachineLaneProvisioning)
	t.Run("manual-main source mode", TestManualMainFlowHostClassification)
	t.Run("capture sleep retire", TestBackgroundMachineCaptureSleepRetire)
}

func TestManualMainFlowHostClassification(t *testing.T) {
	f := presenceInstall(t)
	ctx := t.Context()
	invoked := services.NewInvokedFlowService(f.pool, nil, nil)
	manual, err := invoked.IsBackgroundFlowHost(ctx, f.row.ID)
	require.NoError(t, err)
	require.False(t, manual, "an ordinary TODO is not an ephemeral main host")
	var definition, run int64
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO workflow_definitions(repository_id,name,path,config) VALUES($1,'manual','.smithers/manual.ts','{}') RETURNING id`, f.row.RepositoryID).Scan(&definition))
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO workflow_runs(repository_id,workflow_definition_id,status,trigger_event,trigger_ref) VALUES($1,$2,'running','manual','main') RETURNING id`, f.row.RepositoryID, definition).Scan(&run))
	_, err = f.pool.Exec(ctx, `INSERT INTO workflow_run_flow_invocations(workflow_run_id,user_id,flow_id,operation_id,background_workspace_id) VALUES($1,$2,'main','manual-source',$3::uuid)`, run, f.user.ID, f.row.ID)
	require.NoError(t, err)
	manual, err = invoked.IsBackgroundFlowHost(ctx, f.row.ID)
	require.NoError(t, err)
	require.True(t, manual, "manual main keeps the launcher's credential-free source mode")
}
