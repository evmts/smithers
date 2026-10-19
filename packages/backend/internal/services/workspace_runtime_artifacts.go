package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// Isolated runtime creation persists its sandbox placement independently of
// the product row loaded by the caller. Re-read that placement before using
// the shared artifact installer; readiness is evidence from the guest, not
// merely a running VM. Trusted process runtimes use the operator's toolchain.
func (s *WorkspaceService) ensureRuntimeWorkspaceArtifacts(ctx context.Context, row db.Workspace, requesterID int64) (resultErr error) {
	// Without a compute provider, the isolated runtime owns its toolchain
	// (the single-owner microVM adapter stages its packaged host itself).
	if s.sandbox == nil {
		return nil
	}
	if s.runtime.Isolation() != workspaceapi.IsolationSandboxed {
		return nil
	}
	started, operationStarted := time.Now(), time.Now()
	operation := workspaceArtifactPreflight
	diagnosticCtx := ctx
	var cancel context.CancelFunc
	defer func() {
		if resultErr != nil {
			recordWorkspaceBootstrapFailure(diagnosticCtx, row.ID, operation, time.Since(started), time.Since(operationStarted), resultErr)
		}
		// Record the real context state before our own cleanup cancels it.
		if cancel != nil {
			cancel()
		}
	}()
	begin := func(next workspaceArtifactOperation) { operation, operationStarted = next, time.Now() }
	current, err := s.currentRuntimeWorkspaceLocked(ctx, row)
	if err != nil {
		return err
	}
	client, ok := s.sandbox.(workspaceArtifactClient)
	if !ok || client == nil {
		return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "workspace artifact transport unavailable")
	}
	if strings.TrimSpace(current.VmID) == "" {
		return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "workspace sandbox placement unavailable")
	}
	// The toolchain belongs to the runtime guest's account and home.
	layout, err := s.workspaceGuestLayout(ctx, current, requesterID)
	if err != nil {
		return err
	}
	bootstrapCtx, err := s.workspaceRuntimeContext(ctx, current, requesterID, workspaceLifecycleOperation(current, "bootstrap"))
	if err != nil {
		return err
	}
	// The deferred cleanup above calls cancel on every path.
	timed, stop := context.WithTimeout(bootstrapCtx, workspaceResumeProvisionTimeout)
	bootstrapCtx, cancel = timed, stop
	diagnosticCtx = bootstrapCtx
	command := workspaceRuntimeCLIProbe(layout)
	// A healthy running guest keeps its installed release. API deploys must
	// not replace tools beneath an active coding host. An unbootstrapped old
	// guest is repaired; suspended guests refresh on their next resume.
	if current.Status == "running" {
		begin(workspaceArtifactInspectInstalled)
		probe := "if test -f " + shellQuote(workspaceArtifactCurrent+"/bootstrap.done") + " && (" + command + ") >/dev/null 2>&1; then printf ready; else printf missing; fi"
		result, err := artifactCommand(bootstrapCtx, client, current.VmID, probe, 30_000)
		if err != nil {
			return workspaceArtifactRuntimeFailure(bootstrapCtx, "inspect workspace artifacts", err)
		}
		if strings.TrimSpace(result.Stdout) == "ready" {
			return nil
		}
	}
	begin(workspaceArtifactValidateHost)
	for _, artifact := range workspaceArtifactSources() {
		// The interactive coding host is optional; hosted Flow composition
		// ships its own host. CLI and native export remain required here.
		if artifact.target == path.Base(workspaceCodingHostB64Path) {
			continue
		}
		info, err := os.Stat(artifact.source)
		if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			return pkgerrors.New(pkgerrors.CodeServiceUnavailable, fmt.Sprintf("workspace %s artifact unavailable on host", artifact.label)).WithCause(err)
		}
	}
	begin(workspaceArtifactStage)
	if err := finishWorkspaceArtifacts(bootstrapCtx, client, current.VmID, workspaceBootstrapScriptForKind(current.Kind, layout)); err != nil {
		return workspaceArtifactRuntimeFailure(bootstrapCtx, "stage workspace artifacts", err)
	}
	begin(workspaceArtifactBootstrap)
	if err := waitForWorkspaceArtifactBootstrap(bootstrapCtx, client, current.VmID); err != nil {
		return workspaceArtifactRuntimeFailure(bootstrapCtx, "bootstrap workspace artifacts", err)
	}
	begin(workspaceArtifactVerifyCLI)
	if result, err := artifactCommand(bootstrapCtx, client, current.VmID, command, 30_000); err != nil {
		logWorkspaceCLICheckOutput(row.ID, current.VmID, result)
		return workspaceArtifactRuntimeFailure(bootstrapCtx, "verify workspace CLI", err)
	}
	return nil
}

const (
	// workspaceCLICheckOutputLines and workspaceCLICheckOutputBytes bound the
	// guest output a failed CLI check logs: a Node stack fits, and with the
	// leading ellipsis the field stays under 4 KiB.
	workspaceCLICheckOutputLines = 64
	workspaceCLICheckOutputBytes = 4000
)

// logWorkspaceCLICheckOutput logs the masked tail of a failed CLI check's
// output. The row's failure message carries a shorter diagnosis, but canary
// cleanup deletes the row; this line outlives it. The finite bootstrap record
// below stays free of guest output.
func logWorkspaceCLICheckOutput(workspaceID, sandboxID string, result sandbox.ExecResult) {
	exitCode := -1
	if result.StatusCode != nil {
		exitCode = int(*result.StatusCode)
	}
	output := strings.TrimSpace(result.Stdout + "\n" + result.Stderr)
	slog.Warn("workspace runtime CLI check output", "workspace", workspaceCorrelationToken(workspaceID),
		"workspace_id", workspaceID, "sandbox_id", sandboxID, "operation", string(workspaceArtifactVerifyCLI),
		"exit_code", exitCode, "output_tail", workspaceGuestOutputTail(output, workspaceCLICheckOutputLines, workspaceCLICheckOutputBytes))
}

type workspaceArtifactOperation string

const (
	workspaceArtifactPreflight        workspaceArtifactOperation = "preflight"
	workspaceArtifactInspectInstalled workspaceArtifactOperation = "inspect_installed"
	workspaceArtifactValidateHost     workspaceArtifactOperation = "validate_host_artifacts"
	workspaceArtifactStage            workspaceArtifactOperation = "stage_artifacts"
	workspaceArtifactBootstrap        workspaceArtifactOperation = "bootstrap"
	workspaceArtifactVerifyCLI        workspaceArtifactOperation = "verify_cli"
)

// The row's verdict may include a redacted guest diagnostic, but the row can
// disappear during cleanup. Persist only finite evidence here: never render an
// error sentence, response, command, path, or guest output into this record.
func recordWorkspaceBootstrapFailure(ctx context.Context, workspaceID string, operation workspaceArtifactOperation, elapsed, operationElapsed time.Duration, err error) {
	switch operation {
	case workspaceArtifactPreflight, workspaceArtifactInspectInstalled, workspaceArtifactValidateHost, workspaceArtifactStage, workspaceArtifactBootstrap, workspaceArtifactVerifyCLI:
	default:
		operation = "unknown"
	}
	reason, exitCode, code, providerStatus := "other", -1, "unknown", 0
	// APIError deliberately has no Unwrap. Inspect its explicit Cause without
	// changing that public contract; bound this explicit Cause traversal.
	for depth := 0; err != nil && depth < 8; depth++ {
		if errors.Is(err, context.DeadlineExceeded) {
			reason = "deadline"
			break
		}
		if errors.Is(err, context.Canceled) {
			reason = "cancelled"
			break
		}
		var exit *workspaceArtifactExitFailure
		if errors.As(err, &exit) {
			switch exit.kind {
			case "command":
				reason = "command_exit"
			case "bootstrap":
				reason = "bootstrap_exit"
			}
			if exit.hasExit {
				exitCode = exit.exitCode
			} else {
				reason = "missing_exit_status"
			}
			break
		}
		var provider *sandbox.StatusError
		if errors.As(err, &provider) {
			reason = "provider_refusal"
			if provider.StatusCode >= 400 && provider.StatusCode <= 599 {
				providerStatus = provider.StatusCode
			}
			break
		}
		var api *pkgerrors.APIError
		if !errors.As(err, &api) {
			break
		}
		if parsed, ok := pkgerrors.ParseCode(string(api.Code)); ok {
			code = string(parsed)
		}
		err = api.Cause()
	}
	deadline, remainingMS := "none", int64(0)
	if until, ok := ctx.Deadline(); ok {
		deadline, remainingMS = "active", max(0, time.Until(until).Milliseconds())
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		deadline = "exceeded"
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		deadline = "cancelled"
	}
	slog.Warn("workspace runtime bootstrap failed", "workspace", workspaceCorrelationToken(workspaceID),
		"stage", "runtime_bootstrap", "operation", string(operation), "reason", reason,
		"error_code", code, "exit_code", exitCode, "provider_status", providerStatus,
		"deadline_state", deadline, "deadline_remaining_ms", remainingMS,
		"elapsed_ms", max(0, elapsed.Milliseconds()), "operation_ms", max(0, operationElapsed.Milliseconds()))
}

func workspaceArtifactRuntimeFailure(ctx context.Context, operation string, err error) error {
	if cancelled := ctx.Err(); cancelled != nil {
		if errors.Is(cancelled, context.DeadlineExceeded) {
			return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "workspace bootstrap timed out").WithCause(cancelled)
		}
		return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "workspace bootstrap cancelled").WithCause(cancelled)
	}
	if lost := lostWorkerError(err); lost != nil {
		return lost
	}
	return pkgerrors.New(pkgerrors.CodeServiceUnavailable, operation+": "+workspaceBootstrapDiagnostic(err.Error())).WithCause(err)
}

// workspaceRuntimeCLIProbe runs the CLI installed in layout's home. The
// controller execs it as root, and ~/.local/bin is the developer's, so a root
// caller drops to the developer with an explicit PATH first: root never runs a
// binary from a developer-writable directory. The direct branch serves
// non-root callers and guests without runuser.
func workspaceRuntimeCLIProbe(layout workspaceGuestLayout) string {
	bin := layout.localBinDir()
	check := "if ! test -x " + shellQuote(bin+"/smithers") + " || ! test -x " + shellQuote(bin+"/smthrs") + "; then echo 'workspace CLI missing: smithers or smthrs' >&2; exit 1; fi; " + shellQuote(bin+"/smithers") + " --version"
	asDeveloper := "runuser -u " + shellQuote(layout.User) + " -- env -i HOME=" + shellQuote(layout.Home) + " USER=" + shellQuote(layout.User) + " LOGNAME=" + shellQuote(layout.User) +
		" PATH=" + shellQuote(bin+":/run/current-system/sw/bin:/usr/local/bin:/usr/bin:/bin") + " /bin/sh -c " + shellQuote(check)
	return "if [ \"$(id -u)\" = 0 ] && command -v runuser >/dev/null 2>&1; then exec " + asDeveloper + "; fi; " +
		"PATH=" + shellQuote(bin+":/usr/local/bin") + ":$PATH; export PATH; " + check
}
