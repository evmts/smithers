package services

import (
	"log/slog"
	"strconv"
	"strings"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// workspaceRepositoryStepUnverifiedMessage is the sentence
// runtimeRepositoryCommandOutput persists when a repository step's command
// completed and did not verify. It is built here, exactly once, so this
// function IS the stored representation rather than a guess at one:
// pkgerrors.Conflict puts the string in APIError.Message,
// workspaceFailureDetailsFor prefers that field, and
// FailProvisioningWorkspaceIfCurrent writes it verbatim into
// failure_message (the product's normalize trigger only substitutes a default
// for a blank one).
//
// That matters because the sentence is the ONLY thing that identifies this
// writer's rows. markWorkspaceProvisionFailed records whatever cause reached
// it and passes NO cleanup stage, so `failed` + `conflict` + an empty
// provisioning_stage + a bound placement is several writers at once, and only
// the recorded sentence separates them.
func workspaceRepositoryStepUnverifiedMessage(step string) string {
	return "workspace repository " + step + " could not be verified"
}

// workspaceRepositoryAdvertisementStep is the step that asks the product
// remote, with the workspace's own bound credential, whether the repository
// advertises any ref at all (runtimeRepositorySourceEmpty). It is the door
// that stranded the sixteen live guests this recovery reaches.
const workspaceRepositoryAdvertisementStep = "advertisement"

// workspaceRepositoryAdvertisementUnverifiedMessage is that door's stored
// sentence. The const and the constructor above are pinned to each other by
// TestWorkspaceRepositoryAdvertisementMessageIsWhatTheWriterPersists, so a
// reworded verdict fails a test instead of silently making the cohort
// unreachable.
const workspaceRepositoryAdvertisementUnverifiedMessage = "workspace repository advertisement could not be verified"

// workspaceRepositoryCommandSteps is the closed step vocabulary of the
// repository commands whose refusal is persisted as the sentence above, read
// from runtimeRepositoryCommandOutput's own call sites.
//
// It exists for the DIAGNOSTIC, not for the predicate: workspace_head.go
// passes a per-call step that embeds a UUID ("head-report-<uuid>",
// "candidate-tree-<uuid>"), so the step is not a bounded value and must never
// reach a log field as itself. An unregistered step reads
// workspaceRepositoryStepOther.
var workspaceRepositoryCommandSteps = map[string]struct{}{
	workspaceRepositoryAdvertisementStep: {},
	"clone-refs":                         {},
	"empty-jj-changes":                   {},
	"empty-jj-description":               {},
	"empty-jj-history":                   {},
	"empty-jj-parent":                    {},
	"empty-jj-tree":                      {},
	"empty-jj-working-commit":            {},
	"empty-local-objects":                {},
	"empty-local-refs":                   {},
	"head":                               {},
	"origin":                             {},
	"source-revision":                    {},
}

// workspaceRepositoryStepOther labels a step outside the vocabulary above,
// including the UUID-suffixed head and capture steps.
const workspaceRepositoryStepOther = "other"

func workspaceRepositoryStepLabel(step string) string {
	if _, ok := workspaceRepositoryCommandSteps[strings.TrimSpace(step)]; ok {
		return strings.TrimSpace(step)
	}
	return workspaceRepositoryStepOther
}

// workspaceRepositoryExitClass is the closed vocabulary a completed
// repository command's result is reported in. The raw exit status is a
// number the guest chose, so it is classified rather than carried, and no
// stdout, stderr, URL, header or environment value is read at all.
type workspaceRepositoryExitClass string

const (
	// workspaceRepositoryExitOK: status 0 with complete output.
	workspaceRepositoryExitOK workspaceRepositoryExitClass = "ok"
	// workspaceRepositoryExitTruncated: the adapter could not return the
	// command's whole output, so no verdict can be read from it. This is a
	// refusal even at status 0 — see runtimeRepositoryCommandOutput.
	workspaceRepositoryExitTruncated workspaceRepositoryExitClass = "output_truncated"
	// workspaceRepositoryExitFatal: status 128, Git's fatal — the family a
	// transport, authentication or advertisement refusal lands in.
	workspaceRepositoryExitFatal workspaceRepositoryExitClass = "fatal"
	// workspaceRepositoryExitUsage: status 129, Git's usage error.
	workspaceRepositoryExitUsage workspaceRepositoryExitClass = "usage"
	// workspaceRepositoryExitSignaled: a status only a signal or a negative
	// convention produces.
	workspaceRepositoryExitSignaled workspaceRepositoryExitClass = "signaled"
	// workspaceRepositoryExitFailed: any other nonzero status.
	workspaceRepositoryExitFailed workspaceRepositoryExitClass = "failed"
)

func workspaceRepositoryExitClassFor(result workspaceapi.CommandResult) workspaceRepositoryExitClass {
	if result.OutputTruncated {
		return workspaceRepositoryExitTruncated
	}
	switch {
	case result.ExitCode == 0:
		return workspaceRepositoryExitOK
	case result.ExitCode == 128:
		return workspaceRepositoryExitFatal
	case result.ExitCode == 129:
		return workspaceRepositoryExitUsage
	case result.ExitCode < 0 || result.ExitCode > 129:
		return workspaceRepositoryExitSignaled
	default:
		return workspaceRepositoryExitFailed
	}
}

// workspaceRepositoryStepOutcome is everything a collapsed repository-step
// refusal is allowed to say about itself.
//
// It exists because runtimeRepositoryCommandOutput published one sentence per
// step and nothing else: a nonzero status and a truncated output became the
// same `conflict`, the attempt count and the retry classification were
// discarded inside executeRuntimeRepositoryTransfer, and the only surviving
// evidence — the command's own stderr — was never recorded anywhere. So a
// cohort of these rows could be counted but not diagnosed, which is the
// position the sixteen stranded guests were read from.
//
// Every field is finite. The command talks to the product remote over HTTP
// with a bearer credential in its environment, and Git puts the URL and the
// server's own prose in stderr, so no part of stdout, stderr, the argument
// vector or the environment reaches this record. The owner row is named by
// workspaceCorrelationToken, never by its id.
type workspaceRepositoryStepOutcome struct {
	step      string
	exitClass workspaceRepositoryExitClass
	truncated bool
	attempts  int
	// retryable reports whether the FINAL result still matched
	// retryableWorkspaceTransfer. True means the retry budget ran out on a
	// 503/504 admission refusal; false means the refusal was never retryable
	// — an authentication failure, a truncated answer or a command that
	// changes the checkout — and separating those is the whole question when
	// an advertisement cannot be verified.
	retryable bool
}

// Error renders the outcome for the server log through APIError's cause. It
// is the finite labels and nothing else, so attaching it as a cause cannot
// publish anything the fields above do not already allow. APIError has no
// Unwrap, so this changes no errors.Is or errors.As reading anywhere.
func (o workspaceRepositoryStepOutcome) Error() string {
	return "repository step " + o.step + " unverified (" + string(o.exitClass) +
		", attempts=" + strconv.Itoa(o.attempts) + ")"
}

// logArgs renders the outcome for slog, with the owner row identified by a
// stable, non-resolvable correlation token rather than its id.
func (o workspaceRepositoryStepOutcome) logArgs(workspaceID string) []any {
	return []any{
		"workspace", workspaceCorrelationToken(workspaceID),
		"stage", "verify_repository_step",
		"step", o.step,
		"exit_class", string(o.exitClass),
		"output_truncated", o.truncated,
		"attempts", o.attempts,
		"retry_budget_exhausted", o.retryable,
	}
}

func (o workspaceRepositoryStepOutcome) record(workspaceID string) {
	slog.Warn("workspace repository step could not be verified", o.logArgs(workspaceID)...)
}
