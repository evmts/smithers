package services

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
	"github.com/stretchr/testify/require"
)

type artifactRuntime struct{ workspaceapi.WorkspaceRuntime }

// Fail real artifact doors; all successful staging/publication remains the
// existing recording client. No seam is added to the production logger.
type bootstrapEvidenceClient struct {
	*runtimeArtifactClient
	operation   workspaceArtifactOperation
	cause       error
	exitCode    *int32
	missingExit bool
	stderr      string
}

func (c *bootstrapEvidenceClient) Execute(ctx context.Context, id string, req sandbox.ExecRequest) (sandbox.ExecResult, error) {
	command := strings.TrimPrefix(req.Command, workspaceArtifactGuestPath)
	match := c.operation == workspaceArtifactInspectInstalled && strings.Contains(command, "then printf ready; else printf missing") ||
		c.operation == workspaceArtifactStage && strings.HasPrefix(command, "owner=$(cat ") ||
		c.operation == workspaceArtifactBootstrap && strings.HasPrefix(command, "if ! test -L ") ||
		c.operation == workspaceArtifactVerifyCLI && strings.Contains(command, "workspace CLI missing")
	if match {
		if c.cause != nil {
			return sandbox.ExecResult{}, c.cause
		}
		if c.exitCode != nil || c.missingExit {
			stderr := leakSentence
			if c.stderr != "" {
				stderr = c.stderr
			}
			return sandbox.ExecResult{StatusCode: c.exitCode, Stderr: stderr}, nil
		}
	}
	if strings.HasPrefix(command, "tail -c 4096 ") {
		return sandbox.ExecResult{StatusCode: new(int32), Stdout: leakSentence}, nil
	}
	return c.runtimeArtifactClient.Execute(ctx, id, req)
}

func bootstrapEvidenceFixture(t *testing.T, operation workspaceArtifactOperation) (*WorkspaceService, db.Workspace, *bootstrapEvidenceClient, *[]capturedLog) {
	t.Helper()
	artifactCallsiteFixture(t)
	row := sampleDBWorkspace("bootstrap-private-row")
	row.Status = "starting"
	if operation == workspaceArtifactInspectInstalled {
		row.Status = "running"
	}
	q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
	client := &bootstrapEvidenceClient{runtimeArtifactClient: &runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient(), bootstrapStatus: "done"}, operation: operation}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
	return svc, row, client, captureReconcilerLogs(t)
}

func assertBootstrapEvidence(t *testing.T, records *[]capturedLog, row db.Workspace, operation workspaceArtifactOperation, reason, exit, deadline string) capturedLog {
	t.Helper()
	entries := warnings(records, "workspace runtime bootstrap failed")
	require.Len(t, entries, 1)
	entry := entries[0]
	require.Equal(t, workspaceCorrelationToken(row.ID), entry.attrs["workspace"])
	require.Equal(t, "runtime_bootstrap", entry.attrs["stage"])
	require.Equal(t, string(operation), entry.attrs["operation"])
	require.Equal(t, reason, entry.attrs["reason"])
	require.Equal(t, exit, entry.attrs["exit_code"])
	require.Equal(t, deadline, entry.attrs["deadline_state"])
	for _, key := range []string{"elapsed_ms", "operation_ms", "deadline_remaining_ms"} {
		value, err := strconv.ParseInt(entry.attrs[key], 10, 64)
		require.NoError(t, err)
		require.GreaterOrEqual(t, value, int64(0))
	}
	for _, private := range []string{leakToken, leakURL, leakProse, leakHeader, leakRowID, leakVMID, row.ID, "placed-guest"} {
		require.NotContains(t, entry.text, private)
	}
	return entry
}

func TestRuntimeBootstrapEvidenceExpiredParentSurvivesAPIAndOrdinaryWrapping(t *testing.T) {
	records := captureReconcilerLogs(t)
	ctx, cancel := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer cancel()
	row := sampleDBWorkspace("expired-bootstrap-parent")
	cause := fmt.Errorf("%s: %w", leakSentence, context.DeadlineExceeded)
	api := pkgerrors.New(pkgerrors.CodeServiceUnavailable, leakSentence).WithCause(cause)
	recordWorkspaceBootstrapFailure(ctx, row.ID, workspaceArtifactBootstrap, 3*time.Second, time.Second, fmt.Errorf("%s: %w", leakSentence, api))
	entry := assertBootstrapEvidence(t, records, row, workspaceArtifactBootstrap, "deadline", "-1", "exceeded")
	require.Equal(t, "0", entry.attrs["deadline_remaining_ms"])
	require.Equal(t, "service_unavailable", entry.attrs["error_code"])
}

func TestRuntimeBootstrapEvidenceSurvivesWrappedDeadlineAtEveryDoor(t *testing.T) {
	for _, operation := range []workspaceArtifactOperation{workspaceArtifactInspectInstalled, workspaceArtifactStage, workspaceArtifactBootstrap, workspaceArtifactVerifyCLI} {
		t.Run(string(operation), func(t *testing.T) {
			svc, row, client, records := bootstrapEvidenceFixture(t, operation)
			client.cause = fmt.Errorf("%s: %w", leakSentence, context.DeadlineExceeded)
			err := svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID)
			var api *pkgerrors.APIError
			require.ErrorAs(t, err, &api)
			require.Equal(t, pkgerrors.CodeServiceUnavailable, api.Code)
			entry := assertBootstrapEvidence(t, records, row, operation, "deadline", "-1", "active")
			require.Equal(t, "service_unavailable", entry.attrs["error_code"])
			// The child failed while its parent budget was still live. Our own
			// deferred cancel must not turn that into a cancellation diagnosis.
			require.NotEqual(t, "0", entry.attrs["deadline_remaining_ms"])
		})
	}
}

func TestRuntimeBootstrapEvidenceKeepsExitWithoutGuestOutput(t *testing.T) {
	for _, test := range []struct {
		name         string
		operation    workspaceArtifactOperation
		status       string
		exit         *int32
		missing      bool
		reason, code string
	}{
		{name: "bootstrap", operation: workspaceArtifactBootstrap, status: "failed:23", reason: "bootstrap_exit", code: "23"},
		{name: "CLI", operation: workspaceArtifactVerifyCLI, exit: func() *int32 { value := int32(7); return &value }(), reason: "command_exit", code: "7"},
		{name: "no status", operation: workspaceArtifactVerifyCLI, missing: true, reason: "missing_exit_status", code: "-1"},
	} {
		t.Run(test.name, func(t *testing.T) {
			svc, row, client, records := bootstrapEvidenceFixture(t, test.operation)
			client.exitCode, client.missingExit = test.exit, test.missing
			if test.status != "" {
				client.bootstrapStatus = test.status
			}
			err := svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID)
			require.Error(t, err)
			assertBootstrapEvidence(t, records, row, test.operation, test.reason, test.code, "active")
		})
	}
}

// Canary cleanup deletes the row whose failure message holds the CLI's
// stderr; the log line keeps its masked tail with the ids to find it.
func TestRuntimeCLICheckFailureLogsMaskedOutputTail(t *testing.T) {
	svc, row, client, records := bootstrapEvidenceFixture(t, workspaceArtifactVerifyCLI)
	exit := int32(1)
	client.exitCode = &exit
	const (
		openAIKey     = "sk-proj-plantedopenaikey0123456789abcdefABCDEF"
		gitHubToken   = "ghp_plantedGitHubToken0123456789abcd"
		smithersToken = "smithers_sandbox_planted1.plantedsignature0123"
		urlPassword   = "plantedurlpass"
	)
	client.stderr = strings.Repeat("node:internal/modules/cjs/loader:1228 frame\n", 200) +
		"Error: Cannot find module '/home/developer/.local/lib/smithers/cli.js'\n" + leakToken + "\n" +
		openAIKey + " " + gitHubToken + " " + smithersToken + "\n" +
		"fetch https://cli:" + urlPassword + "@registry.example.test/smithers failed\n"
	require.Error(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
	entries := warnings(records, "workspace runtime CLI check output")
	require.Len(t, entries, 1)
	entry := entries[0]
	require.Equal(t, row.ID, entry.attrs["workspace_id"])
	require.Equal(t, row.VmID, entry.attrs["sandbox_id"])
	require.Equal(t, workspaceCorrelationToken(row.ID), entry.attrs["workspace"])
	require.Equal(t, string(workspaceArtifactVerifyCLI), entry.attrs["operation"])
	require.Equal(t, "1", entry.attrs["exit_code"])
	tail := entry.attrs["output_tail"]
	require.Contains(t, tail, "Error: Cannot find module '/home/developer/.local/lib/smithers/cli.js'")
	require.Contains(t, tail, "Bearer [redacted]")
	for _, secret := range []string{"sk-live-c0ffee-DO-NOT-LOG", openAIKey, gitHubToken, smithersToken, urlPassword, "plantedsignature"} {
		for key, value := range entry.attrs {
			require.NotContains(t, value, secret, key)
		}
	}
	require.LessOrEqual(t, len(tail), 4<<10)
	// The finite bootstrap record still carries no guest output.
	assertBootstrapEvidence(t, records, row, workspaceArtifactVerifyCLI, "command_exit", "1", "active")
}

func TestRuntimeBootstrapEvidenceKeepsActualCancellationAndProviderStatus(t *testing.T) {
	t.Run("cancelled", func(t *testing.T) {
		svc, row, client, records := bootstrapEvidenceFixture(t, workspaceArtifactBootstrap)
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		client.cancel = cancel
		require.Error(t, svc.ensureRuntimeWorkspaceArtifacts(ctx, row, row.UserID))
		assertBootstrapEvidence(t, records, row, workspaceArtifactBootstrap, "cancelled", "-1", "cancelled")
	})
	t.Run("provider", func(t *testing.T) {
		svc, row, client, records := bootstrapEvidenceFixture(t, workspaceArtifactStage)
		client.cause = fmt.Errorf("private wrapper: %w", &sandbox.StatusError{StatusCode: 503, Message: leakSentence})
		require.Error(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
		entry := assertBootstrapEvidence(t, records, row, workspaceArtifactStage, "provider_refusal", "-1", "active")
		require.Equal(t, "503", entry.attrs["provider_status"])
	})
}

func TestRuntimeWorkspaceCLIProbeExecutesGuestBinary(t *testing.T) {
	bin := t.TempDir()
	command := strings.ReplaceAll(workspaceRuntimeCLIProbe(defaultWorkspaceGuestLayout), defaultWorkspaceGuestLayout.localBinDir(), bin)
	output, err := exec.Command("/bin/sh", "-c", command).CombinedOutput()
	require.Error(t, err)
	require.Contains(t, string(output), "workspace CLI missing")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "smithers"), []byte("#!/bin/sh\n[ \"$1\" = --version ] || exit 9\nprintf '1.0.0-rc.0\\n'\n"), 0755))
	require.NoError(t, os.Symlink("smithers", filepath.Join(bin, "smthrs")))
	output, err = exec.Command("/bin/sh", "-c", command).CombinedOutput()
	require.NoError(t, err, string(output))
	require.Equal(t, "1.0.0-rc.0\n", string(output))
	require.NoError(t, os.WriteFile(filepath.Join(bin, "smithers"), []byte("#!/bin/sh\necho guest-smoke-failed >&2\nexit 4\n"), 0755))
	output, err = exec.Command("/bin/sh", "-c", command).CombinedOutput()
	require.Error(t, err)
	require.Contains(t, string(output), "guest-smoke-failed")
}

func (*artifactRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationSandboxed
}
func (*artifactRuntime) Capabilities() workspaceapi.WorkspaceCapabilities {
	return workspaceapi.WorkspaceCapabilities{PersistentFiles: true, Execution: true, FileOperations: true}
}

// The fixture's guest is this backend's own agent guest.
func (*artifactRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: id, Root: defaultWorkspaceClonePath, Home: defaultWorkspaceHome, State: workspaceapi.WorkspaceRunning}, nil
}
func (*artifactRuntime) ExecuteCommand(context.Context, string, workspaceapi.Command) (workspaceapi.CommandResult, error) {
	return workspaceapi.CommandResult{Stdout: "1000\n" + defaultWorkspaceUser + "\n"}, nil
}

func TestRuntimeRepositoryStagesArtifactsBeforeRepositoryAccess(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, kind := range []string{"container", "vm"} {
		t.Run(kind, func(t *testing.T) {
			row := sampleDBWorkspace("runtime-artifacts")
			row.Kind = kind
			row.VmID = "" // CreateWorkspace persists placement after receiving this row.
			q := &mockWorkspaceQuerier{}
			q.getWorkspaceFn = func(context.Context, string) (db.Workspace, error) {
				current := row
				current.VmID = "placed-guest"
				return current, nil
			}
			client := newArtifactRecordingClient()
			client.failWrite = 1
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
			err := svc.ensureRuntimeWorkspaceRepository(t.Context(), row, row.UserID)
			require.ErrorContains(t, err, "transfer interrupted")
			require.Len(t, client.writes, 1)
		})
	}
}

// The recording provider leaves artifact publication mechanics intact while
// controlling only the guest bootstrap status and final executable probe.
type runtimeArtifactClient struct {
	*artifactRecordingClient
	placementIDs    []string
	bootstrapStatus string
	cliFailure      bool
	probeFailure    bool
	cancel          context.CancelFunc
	deadline        time.Time
}

func (c *runtimeArtifactClient) Execute(ctx context.Context, id string, req sandbox.ExecRequest) (sandbox.ExecResult, error) {
	c.deadline, _ = ctx.Deadline()
	if c.probeFailure && strings.Contains(req.Command, "then printf ready; else printf missing") {
		return sandbox.ExecResult{}, errors.New("guest probe unavailable")
	}
	c.placementIDs = append(c.placementIDs, id)
	command := strings.TrimPrefix(req.Command, workspaceArtifactGuestPath)
	if strings.HasPrefix(command, "if ! test -L ") {
		c.commands = append(c.commands, req.Command)
		if c.cancel != nil {
			c.cancel()
			return sandbox.ExecResult{}, ctx.Err()
		}
		return sandbox.ExecResult{StatusCode: new(int32), Stdout: c.bootstrapStatus}, nil
	}
	if strings.Contains(command, "--version") && c.cliFailure {
		c.commands = append(c.commands, req.Command)
		return sandbox.ExecResult{}, errors.New("guest CLI unavailable")
	}
	return c.artifactRecordingClient.Execute(ctx, id, req)
}

func TestRuntimeArtifactsUseDurablePlacementAndAwaitBootstrap(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, outcome := range []string{"ready", "bootstrap failure", "cancelled", "CLI failure"} {
		t.Run(outcome, func(t *testing.T) {
			row := sampleDBWorkspace("artifacts-barrier")
			row.VmID = "stale-placement"
			row.Status = "starting"
			q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) {
				current := row
				current.VmID = "durable-placement"
				return current, nil
			}}
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			client := &runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient(), bootstrapStatus: "done"}
			switch outcome {
			case "bootstrap failure":
				client.bootstrapStatus = "failed:23"
			case "cancelled":
				client.cancel = cancel
			case "CLI failure":
				client.cliFailure = true
			}
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
			err := svc.ensureRuntimeWorkspaceArtifacts(ctx, row, row.UserID)
			switch outcome {
			case "ready":
				require.NoError(t, err)
			case "bootstrap failure":
				require.ErrorContains(t, err, "bootstrap failed (exit 23)")
			case "cancelled":
				var apiErr *pkgerrors.APIError
				require.ErrorAs(t, err, &apiErr)
				require.ErrorIs(t, apiErr.Cause(), context.Canceled)
			case "CLI failure":
				require.ErrorContains(t, err, "guest CLI unavailable")
			}
			require.NotEmpty(t, client.writes)
			require.NotEmpty(t, client.placementIDs)
			require.False(t, client.deadline.IsZero())
			require.LessOrEqual(t, time.Until(client.deadline), workspaceResumeProvisionTimeout)
			for _, id := range client.placementIDs {
				require.Equal(t, "durable-placement", id)
			}
			cliIndex, waitIndex := -1, -1
			for i, command := range client.commands {
				if strings.HasPrefix(strings.TrimPrefix(command, workspaceArtifactGuestPath), "if ! test -L ") {
					waitIndex = i
				}
				if strings.Contains(command, "--version") {
					cliIndex = i
				}
			}
			require.GreaterOrEqual(t, waitIndex, 0)
			if outcome == "ready" || outcome == "CLI failure" {
				require.Greater(t, cliIndex, waitIndex)
			} else {
				require.Equal(t, -1, cliIndex)
			}
		})
	}
}

func TestRuntimeArtifactsRejectMissingOrChangedPlacement(t *testing.T) {
	for _, failure := range []string{"missing placement", "changed owner", "changed repository", "changed identity", "database failure"} {
		t.Run(failure, func(t *testing.T) {
			row := sampleDBWorkspace("artifacts-identity")
			current := row
			switch failure {
			case "missing placement":
				current.VmID = ""
			case "changed owner":
				current.UserID++
			case "changed repository":
				current.RepositoryID++
			case "changed identity":
				current.ID = "another-workspace"
			}
			q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) {
				if failure == "database failure" {
					return db.Workspace{}, errors.New("database unavailable")
				}
				return current, nil
			}}
			client := newArtifactRecordingClient()
			options := []WorkspaceServiceOption{WithWorkspaceRuntime(&artifactRuntime{})}
			options = append(options, WithWorkspaceSandboxClient(client))
			svc := newWorkspaceServiceForTests(q, options...)
			require.Error(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
			require.Empty(t, client.writes)
			require.Empty(t, client.commands)
		})
	}
}

type selfManagedArtifactRuntime struct {
	workspaceapi.WorkspaceRuntime
	t *testing.T
}

func (r *selfManagedArtifactRuntime) Isolation() workspaceapi.IsolationLevel {
	r.t.Fatal("self-managed runtime isolation consulted without a compute provider")
	return workspaceapi.IsolationSandboxed
}

func TestRuntimeArtifactsSelfManagedSandboxSkipsComputeBootstrap(t *testing.T) {
	q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) {
		t.Fatal("self-managed sandbox attempted compute placement lookup")
		return db.Workspace{}, nil
	}}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&selfManagedArtifactRuntime{t: t}))
	require.NoError(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), sampleDBWorkspace("self-managed"), 1))
}

type trustedArtifactRuntime struct{ artifactRuntime }

func (*trustedArtifactRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationTrustedProcess
}
func TestRuntimeArtifactsTrustedProcessSkipsGuestBootstrap(t *testing.T) {
	q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) {
		t.Fatal("trusted runtime attempted guest placement lookup")
		return db.Workspace{}, nil
	}}
	client := newArtifactRecordingClient()
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&trustedArtifactRuntime{}), WithWorkspaceSandboxClient(client))
	require.NoError(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), sampleDBWorkspace("trusted"), 1))
	require.Empty(t, client.writes)
	require.Empty(t, client.commands)
}

func TestRuntimeArtifactsBootstrapMatchesPlacedEnvironment(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, scenario := range []struct{ name, kind, closure, guestKind string }{
		{"container", "container", "", "container"},
		{"VM without closure uses Nix", "vm", "", "vm"},
		{"pinned VM uses Nix", "vm", "closure-sha", "vm"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			row := sampleDBWorkspace("placed-environment")
			row.Status = "starting"
			row.Kind = scenario.kind
			row.EnvironmentClosureHash = scenario.closure
			q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
			client := &runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient(), bootstrapStatus: "done"}
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
			require.NoError(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
			require.Equal(t, workspaceBootstrapScriptForKind(scenario.guestKind, defaultWorkspaceGuestLayout), stagedWorkspaceScript(client.artifactRecordingClient))
		})
	}
}

// This repository-only fixture has no guest transport; explicitly declare its
// trusted process isolation now that repository readiness consults isolation.
func (lostWorkerRepositoryRuntime) Isolation() workspaceapi.IsolationLevel {
	return workspaceapi.IsolationTrustedProcess
}

// A running guest's installed toolchain is pinned until its next resume.
type installedArtifactClient struct{ *runtimeArtifactClient }

func (c *installedArtifactClient) Execute(ctx context.Context, id string, req sandbox.ExecRequest) (sandbox.ExecResult, error) {
	if strings.Contains(req.Command, "then printf ready; else printf missing") {
		c.commands = append(c.commands, req.Command)
		return sandbox.ExecResult{StatusCode: new(int32), Stdout: "ready"}, nil
	}
	return c.runtimeArtifactClient.Execute(ctx, id, req)
}
func TestRuntimeArtifactsRunningGuestKeepsInstalledRelease(t *testing.T) {
	row := sampleDBWorkspace("installed-release")
	q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
	client := &installedArtifactClient{&runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient()}}
	// Even if a new API release has no local bundle, an installed live guest
	// remains usable and must not be modified beneath its running coding host.
	t.Setenv(workspaceCLIPackageEnv, t.TempDir()+"/absent-new-release")
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
	require.NoError(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
	require.Empty(t, client.writes)
	require.Len(t, client.commands, 1)
}
func TestRuntimeArtifactsMissingHostBundleFailsBeforeTransfer(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, artifact := range []struct{ label, env string }{
		{"npm CLI package", workspaceCLIPackageEnv}, {"jj export helper", workspaceJJExportBinaryEnv},
	} {
		t.Run(artifact.label, func(t *testing.T) {
			t.Setenv(artifact.env, t.TempDir()+"/missing")
			row := sampleDBWorkspace("missing-bundle")
			row.Status = "starting"
			q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
			client := newArtifactRecordingClient()
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
			err := svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID)
			var apiErr *pkgerrors.APIError
			require.ErrorAs(t, err, &apiErr)
			require.Equal(t, pkgerrors.CodeServiceUnavailable, apiErr.Code)
			require.Contains(t, apiErr.Message, artifact.label)
			require.Empty(t, client.writes)
			require.Empty(t, client.commands)
		})
	}
}

func TestRuntimeArtifactsOptionalInteractiveHostMayBeAbsent(t *testing.T) {
	artifactCallsiteFixture(t)
	t.Setenv(workspaceCodingHostBinaryEnv, t.TempDir()+"/absent")
	row := sampleDBWorkspace("optional-interactive-host")
	row.Status = "starting"
	q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
	client := &runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient(), bootstrapStatus: "done"}
	svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
	require.NoError(t, svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID))
	require.NotEmpty(t, client.writes)
}

func TestRuntimeArtifactsRunningGuestRepairAndProbeFailure(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, probeFailure := range []bool{false, true} {
		row := sampleDBWorkspace("running-repair")
		q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }}
		client := &runtimeArtifactClient{artifactRecordingClient: newArtifactRecordingClient(), bootstrapStatus: "done", probeFailure: probeFailure}
		svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(&artifactRuntime{}), WithWorkspaceSandboxClient(client))
		err := svc.ensureRuntimeWorkspaceArtifacts(t.Context(), row, row.UserID)
		if probeFailure {
			require.ErrorContains(t, err, "guest probe unavailable")
			require.Empty(t, client.writes)
		} else {
			require.NoError(t, err)
			require.NotEmpty(t, client.writes)
		}
	}
}

type lifecycleArtifactRuntime struct {
	artifactRuntime
	state  workspaceapi.WorkspaceState
	reaped []string
}

// StopWorkspace and DeleteWorkspace record the reap of a failed initial start.
func (r *lifecycleArtifactRuntime) StopWorkspace(_ context.Context, id string) error {
	r.reaped = append(r.reaped, "stop "+id)
	return nil
}
func (r *lifecycleArtifactRuntime) DeleteWorkspace(_ context.Context, id string) error {
	r.reaped = append(r.reaped, "delete "+id)
	return nil
}

func (r *lifecycleArtifactRuntime) InspectWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: id, Root: defaultWorkspaceClonePath, Home: defaultWorkspaceHome, State: r.state}, nil
}
func (*lifecycleArtifactRuntime) CreateWorkspace(_ context.Context, spec workspaceapi.WorkspaceSpec) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: spec.ID, Root: defaultWorkspaceClonePath, Home: defaultWorkspaceHome, State: workspaceapi.WorkspaceRunning}, nil
}
func (*lifecycleArtifactRuntime) StartWorkspace(_ context.Context, id string) (workspaceapi.Workspace, error) {
	return workspaceapi.Workspace{ID: id, Root: defaultWorkspaceClonePath, Home: defaultWorkspaceHome, State: workspaceapi.WorkspaceRunning}, nil
}
func TestRuntimeWorkspaceNeverActivatesBeforeArtifactBootstrap(t *testing.T) {
	artifactCallsiteFixture(t)
	for _, scenario := range []struct {
		status string
		state  workspaceapi.WorkspaceState
	}{{"starting", workspaceapi.WorkspaceRunning}, {"suspended", workspaceapi.WorkspaceStopped}, {"running", workspaceapi.WorkspaceRunning}} {
		t.Run(scenario.status, func(t *testing.T) {
			row := sampleDBWorkspace("lifecycle-bootstrap")
			row.Status = scenario.status
			var statuses []string
			q := &mockWorkspaceQuerier{getWorkspaceFn: func(context.Context, string) (db.Workspace, error) { return row, nil }, updateWorkspaceStatusFn: func(_ context.Context, arg db.UpdateWorkspaceStatusParams) (db.Workspace, error) {
				if arg.Status == "running" {
					t.Fatal("activated before bootstrap")
				}
				statuses = append(statuses, arg.Status)
				failed := row
				failed.Status = arg.Status
				return failed, nil
			}}
			q.updateWorkspaceExecutionInfoFn = func(context.Context, db.UpdateWorkspaceExecutionInfoParams) (db.Workspace, error) {
				t.Fatal("bound runtime before bootstrap")
				return db.Workspace{}, nil
			}
			client := newArtifactRecordingClient()
			client.failWrite = 1
			runtime := &lifecycleArtifactRuntime{state: scenario.state}
			svc := newWorkspaceServiceForTests(q, WithWorkspaceRuntime(runtime), WithWorkspaceSandboxClient(client))
			_, err := svc.ensureRuntimeWorkspaceRunningLocked(t.Context(), row, row.UserID)
			if scenario.status == "suspended" {
				require.ErrorContains(t, err, "branch wake requires admission and validated privileged entry")
				require.Empty(t, client.writes, "unqualified wake cannot reach bootstrap")
			} else {
				require.ErrorContains(t, err, "transfer interrupted")
				require.Len(t, client.writes, 1)
			}
			if scenario.status == "starting" {
				// A failed initial start shows its failure and reaps its
				// machine (59566c2cb3, #3385).
				require.Equal(t, []string{"failed"}, statuses)
				require.Equal(t, []string{"stop " + row.ID, "delete " + row.ID}, runtime.reaped)
			} else {
				require.Empty(t, statuses)
				require.Empty(t, runtime.reaped)
			}
		})
	}
}
