package services

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
)

const (
	workspaceAgentEnvironmentProfilePath = "/etc/profile.d/10-smithers-agent-environment.sh"
	// Each setup run stages its two files in a fresh directory made by
	// `mktemp -d` (mode 0700) under root-owned /run. No name is known in
	// advance and nobody else can create, replace or link an entry there, so
	// a symlink planted at a fixed name can no longer turn the repository's
	// script into a root-owned file anywhere (Security d-7lu7ja). The
	// developer never opens either file: the wrapper hands the setup script to
	// the developer's shell on standard input.
	workspaceAgentEnvironmentRunDirPrefix = "/run/smithers-agent-environment."
	workspaceAgentEnvironmentSetupName    = "setup.sh"
	workspaceAgentEnvironmentWrapperName  = "setup-with-secrets.sh"
	workspaceAgentEnvironmentRootPath     = "PATH=/run/current-system/sw/bin:/usr/sbin:/usr/bin:/sbin:/bin; export PATH; "
	workspaceAgentEnvironmentTimeoutMS    = int64(15 * 60 * 1000)
)

var workspaceAgentEnvironmentRunDirPattern = regexp.MustCompile(`^/run/smithers-agent-environment\.[A-Za-z0-9]{6,}$`)

// AgentEnvironmentProvisioningProvider is the one internal path allowed to
// retrieve plaintext setup secrets. Implementations must never log or
// serialize the returned config.
type AgentEnvironmentProvisioningProvider interface {
	LoadForProvisioning(ctx context.Context, repositoryID int64) (AgentEnvironmentProvisioningConfig, error)
}

type workspaceAgentEnvironmentVMClient interface {
	WriteFile(ctx context.Context, vmID, path string, req sandbox.WriteFileRequest) error
	Execute(ctx context.Context, vmID string, req sandbox.ExecRequest) (sandbox.ExecResult, error)
}

type workspaceProvisioningStageQuerier interface {
	UpdateWorkspaceProvisioningStage(ctx context.Context, arg db.UpdateWorkspaceProvisioningStageParams) (db.Workspace, error)
}

// runWorkspaceAgentEnvironmentSetup applies persistent nonsecret variables and
// runs the repository setup script with secrets in scope. The secret-bearing
// wrapper is the final file written, owns a cleanup trap, and is also removed
// and absence-checked by a second exec before this method can succeed.
func (s *WorkspaceService) runWorkspaceAgentEnvironmentSetup(ctx context.Context, workspace db.Workspace, vmID string, prepared ...*workspaceProviderBinding) error {
	if s == nil || (s.agentEnvironment == nil && s.providerConnections == nil && !s.providerBootstrap) {
		return nil
	}
	var config AgentEnvironmentProvisioningConfig
	var err error
	if len(prepared) > 0 && prepared[0] != nil {
		config = prepared[0].environment
	} else if s.agentEnvironment != nil {
		config, err = s.agentEnvironment.LoadForProvisioning(ctx, workspace.RepositoryID)
	}
	if err != nil {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return agentEnvironmentLoadError(err)
	}

	client, ok := s.sandbox.(workspaceAgentEnvironmentVMClient)
	if !ok {
		if len(config.Env) == 0 && len(config.ProxyBound) == 0 && strings.TrimSpace(config.SetupScript) == "" {
			return s.setWorkspaceProvisioningStage(ctx, workspace.ID, "ready")
		}
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("agent environment VM setup unavailable")
	}

	// The toolchain bootstrap is its own stage: its failure is not the
	// repository's setup script failing, and its message carries the log tail.
	if err := s.setWorkspaceProvisioningStage(ctx, workspace.ID, "toolchain_bootstrap"); err != nil {
		return err
	}
	if err := waitForWorkspaceArtifactBootstrap(ctx, client, vmID); err != nil {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "toolchain_bootstrap_failed")
		return pkgerrors.Internal(err.Error()).WithCause(err)
	}
	if err := s.setWorkspaceProvisioningStage(ctx, workspace.ID, "environment_setup"); err != nil {
		return err
	}
	profile, err := renderWorkspaceAgentEnvironmentProfile(config.Env, config.ProxyBound)
	if err != nil {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("invalid agent environment for workspace setup").WithCause(err)
	}
	if err := client.WriteFile(ctx, vmID, workspaceAgentEnvironmentProfilePath, sandbox.WriteFileRequest{Content: profile}); err != nil {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("write agent environment variables").WithCause(err)
	}

	if strings.TrimSpace(config.SetupScript) == "" {
		return s.setWorkspaceProvisioningStage(ctx, workspace.ID, "ready")
	}
	setupScript := config.SetupScript
	if !strings.HasPrefix(setupScript, "#!") {
		setupScript = "#!/bin/bash\n" + setupScript
	}
	wrapper, err := renderWorkspaceAgentEnvironmentSetupWrapper(config)
	if err != nil {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("invalid agent environment for workspace setup").WithCause(err)
	}
	prepareResponse, prepareErr := client.Execute(ctx, vmID, sandbox.ExecRequest{
		Command:   workspaceAgentEnvironmentRootPath + "mktemp -d " + shellQuote(workspaceAgentEnvironmentRunDirPrefix+"XXXXXX"),
		TimeoutMS: agentEnvironmentInt64Ptr(30_000),
	})
	runDir := strings.TrimSpace(prepareResponse.Stdout)
	if prepareErr != nil || !successfulExecStatus(prepareResponse) || !workspaceAgentEnvironmentRunDirPattern.MatchString(runDir) {
		s.cleanupWorkspaceAgentEnvironmentFiles(ctx, client, vmID, runDir)
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("prepare agent environment setup")
	}
	setupPath, wrapperPath := runDir+"/"+workspaceAgentEnvironmentSetupName, runDir+"/"+workspaceAgentEnvironmentWrapperName
	if err := client.WriteFile(ctx, vmID, setupPath, sandbox.WriteFileRequest{Content: setupScript}); err != nil {
		s.cleanupWorkspaceAgentEnvironmentFiles(ctx, client, vmID, runDir)
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("stage agent environment setup").WithCause(err)
	}
	if err := client.WriteFile(ctx, vmID, wrapperPath, sandbox.WriteFileRequest{Content: wrapper}); err != nil {
		// No secret-bearing file was successfully staged when WriteFile fails.
		s.cleanupWorkspaceAgentEnvironmentFiles(ctx, client, vmID, runDir)
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("stage agent environment secrets").WithCause(err)
	}

	setupResponse, setupErr := client.Execute(ctx, vmID, sandbox.ExecRequest{
		Command:   workspaceAgentEnvironmentRootPath + "chmod 600 " + shellQuote(wrapperPath) + " && /bin/bash " + shellQuote(wrapperPath) + " " + shellQuote(runDir),
		TimeoutMS: agentEnvironmentInt64Ptr(workspaceAgentEnvironmentTimeoutMS),
	})
	cleanupOK := s.cleanupWorkspaceAgentEnvironmentFiles(ctx, client, vmID, runDir)
	if setupErr != nil || !cleanupOK || !successfulExecStatus(setupResponse) {
		s.setWorkspaceProvisioningStageBestEffort(ctx, workspace.ID, "environment_setup_failed")
		return pkgerrors.Internal("agent environment setup failed")
	}
	return s.setWorkspaceProvisioningStage(ctx, workspace.ID, "ready")
}

// cleanupWorkspaceAgentEnvironmentFiles removes one run's directory after
// confirming both of its files are gone. A run that never got a directory has
// nothing to remove.
func (s *WorkspaceService) cleanupWorkspaceAgentEnvironmentFiles(ctx context.Context, client workspaceAgentEnvironmentVMClient, vmID, runDir string) bool {
	if !workspaceAgentEnvironmentRunDirPattern.MatchString(runDir) {
		return true
	}
	setupPath, wrapperPath := runDir+"/"+workspaceAgentEnvironmentSetupName, runDir+"/"+workspaceAgentEnvironmentWrapperName
	response, err := client.Execute(ctx, vmID, sandbox.ExecRequest{
		Command: workspaceAgentEnvironmentRootPath + "rm -f -- " + shellQuote(wrapperPath) + " " + shellQuote(setupPath) +
			" && test ! -e " + shellQuote(wrapperPath) + " && test ! -e " + shellQuote(setupPath) +
			" && rmdir -- " + shellQuote(runDir),
		TimeoutMS: agentEnvironmentInt64Ptr(30_000),
	})
	return err == nil && successfulExecStatus(response)
}

// renderWorkspaceAgentEnvironmentProfile writes the persistent, nonsecret
// shell profile: the repository's plain variables plus one NAME=NAME
// placeholder per proxy-bound secret. The placeholder is not a secret; it is
// what the per-sandbox egress proxy swaps for the value on requests to the
// bound hosts, so every shell and service in the workspace can use the
// credential without the workspace ever holding it.
func renderWorkspaceAgentEnvironmentProfile(variables []AgentEnvironmentVariable, proxyBound []string) (string, error) {
	variables = append([]AgentEnvironmentVariable(nil), variables...)
	sort.Slice(variables, func(i, j int) bool { return variables[i].Name < variables[j].Name })
	var b strings.Builder
	b.WriteString("# Managed by Smithers: nonsecret repository agent environment.\n")
	seen := make(map[string]struct{}, len(variables))
	for _, variable := range variables {
		if !agentEnvironmentNamePattern.MatchString(variable.Name) {
			return "", fmt.Errorf("invalid variable name")
		}
		seen[variable.Name] = struct{}{}
		fmt.Fprintf(&b, "export %s=%s\n", variable.Name, shellQuote(variable.Value))
	}
	names := append([]string(nil), proxyBound...)
	sort.Strings(names)
	for _, name := range names {
		if !agentEnvironmentNamePattern.MatchString(name) {
			return "", fmt.Errorf("invalid secret name")
		}
		if _, conflict := seen[name]; conflict {
			return "", fmt.Errorf("environment name conflict")
		}
		seen[name] = struct{}{}
		// Placeholder, swapped by the egress proxy; never the value.
		fmt.Fprintf(&b, "export %s=%s\n", name, shellQuote(sandbox.EgressProxyPlaceholder(name)))
	}
	return b.String(), nil
}

func renderWorkspaceAgentEnvironmentSetupWrapper(config AgentEnvironmentProvisioningConfig) (string, error) {
	values := make(map[string]string, len(config.Env)+len(config.Secrets))
	for _, variable := range config.Env {
		if !agentEnvironmentNamePattern.MatchString(variable.Name) {
			return "", fmt.Errorf("invalid variable name")
		}
		values[variable.Name] = variable.Value
	}
	for name, value := range config.Secrets {
		if !agentEnvironmentNamePattern.MatchString(name) {
			return "", fmt.Errorf("invalid secret name")
		}
		if _, conflict := values[name]; conflict {
			return "", fmt.Errorf("environment name conflict")
		}
		values[name] = value
	}
	// Proxy-bound secrets reach the setup run as placeholders only; the
	// sandbox's egress proxy swaps them on the bound hosts. The value is not
	// in this process and never in this file.
	for _, name := range config.ProxyBound {
		if !agentEnvironmentNamePattern.MatchString(name) {
			return "", fmt.Errorf("invalid secret name")
		}
		if _, conflict := values[name]; conflict {
			return "", fmt.Errorf("environment name conflict")
		}
		values[name] = sandbox.EgressProxyPlaceholder(name)
	}
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)

	var b strings.Builder
	b.WriteString("#!/bin/bash\nset -euo pipefail\nexport PATH=/run/current-system/sw/bin:/usr/sbin:/usr/bin:/sbin:/bin\numask 077\n")
	// The run's root-only directory is the wrapper's one argument.
	b.WriteString("run_dir=$1\n")
	b.WriteString("cleanup() {\n  status=$?\n  trap - EXIT HUP INT TERM\n")
	if len(names) > 0 {
		b.WriteString("  unset")
		for _, name := range names {
			b.WriteByte(' ')
			b.WriteString(name)
		}
		b.WriteByte('\n')
	}
	b.WriteString("  rm -f -- \"$run_dir/" + workspaceAgentEnvironmentWrapperName + "\" \"$run_dir/" + workspaceAgentEnvironmentSetupName + "\"\n")
	b.WriteString("  exit \"$status\"\n}\ntrap cleanup EXIT HUP INT TERM\n")
	b.WriteString("export HOME=" + shellQuote(defaultWorkspaceHome) + " USER=" + shellQuote(defaultWorkspaceUser) + " LOGNAME=" + shellQuote(defaultWorkspaceUser) + "\n")
	for _, name := range names {
		fmt.Fprintf(&b, "export %s=%s\n", name, shellQuote(values[name]))
	}
	b.WriteString("workdir=" + shellQuote(defaultWorkspaceClonePath) + "\n")
	b.WriteString("if [ ! -d \"$workdir\" ]; then workdir=" + shellQuote(defaultWorkspaceHome) + "; fi\n")
	// Suppress setup output completely: user scripts may print secrets. Run the
	// setup in its own process group and terminate any descendants it leaves
	// behind before unsetting the secret-bearing wrapper environment.
	b.WriteString("set +e\n")
	// The developer runs the script without opening it: root opens it in the
	// root-only run directory as the shell's standard input, the developer's
	// shell reads it whole, then gives the script /dev/null for input as a
	// background job always had, no positional arguments, and the workdir.
	b.WriteString("setsid runuser -u " + shellQuote(defaultWorkspaceUser) + " --preserve-environment -- /bin/bash -c 'export PATH=/home/agent/.local/bin:/usr/local/bin:$PATH; IFS= read -r -d \"\" smithers_setup || true; exec </dev/null; cd \"$1\" || exit; shift; eval \"$smithers_setup\"' smithers-agent-environment-setup \"$workdir\" <\"$run_dir/" + workspaceAgentEnvironmentSetupName + "\" >/dev/null 2>&1 &\n")
	b.WriteString("setup_pid=$!\nwait \"$setup_pid\"\nsetup_status=$?\nset -e\n")
	b.WriteString("kill -TERM -- \"-$setup_pid\" >/dev/null 2>&1 || true\n")
	b.WriteString("sleep 0.1\nkill -KILL -- \"-$setup_pid\" >/dev/null 2>&1 || true\n")
	b.WriteString("exit \"$setup_status\"\n")
	return b.String(), nil
}

func successfulExecStatus(response sandbox.ExecResult) bool {
	return response.StatusCode != nil && *response.StatusCode == 0
}

func agentEnvironmentInt64Ptr(value int64) *int64 { return &value }

func (s *WorkspaceService) setWorkspaceProvisioningStage(ctx context.Context, workspaceID, stage string) error {
	queries, ok := s.q.(workspaceProvisioningStageQuerier)
	if !ok {
		return nil
	}
	if _, err := queries.UpdateWorkspaceProvisioningStage(ctx, db.UpdateWorkspaceProvisioningStageParams{
		ID:                workspaceID,
		ProvisioningStage: stage,
	}); err != nil {
		return pkgerrors.Internal("update workspace provisioning stage").WithCause(err)
	}
	return nil
}

func (s *WorkspaceService) setWorkspaceProvisioningStageBestEffort(ctx context.Context, workspaceID, stage string) {
	updateCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	_ = s.setWorkspaceProvisioningStage(updateCtx, workspaceID, stage)
}
