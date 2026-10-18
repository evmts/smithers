package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/sync/singleflight"

	"github.com/smithersai/smithers/packages/backend/internal/credentialscan"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

const (
	// codingResultProducer marks the coding_result part only
	// completeCodingTurn writes; no route can set it.
	codingResultProducer = "smithers-server"
	// codingTurnTestTimeout bounds the declared test the API runs in an
	// agent's box at turn end. The hosted worker allows one exec 30 minutes.
	codingTurnTestTimeout = 10 * time.Minute
	// codingResultTailBytes caps a receipt's masked output tail.
	codingResultTailBytes = 4 << 10
	// codingTurnHeadWait bounds waiting for the box's head reporter to
	// publish the turn's last commit; codingTurnHeadStable is how long the
	// published head must stay unchanged to count as the last (the reporter
	// publishes within about 2 seconds of a change).
	codingTurnHeadWait   = 30 * time.Second
	codingTurnHeadStable = 4 * time.Second
	// codingTurnObservationTimeout bounds a whole observation: every read, the
	// wait and the exec. A stalled step leaves the receipt null.
	codingTurnObservationTimeout = 12 * time.Minute
)

// CodingTurn identifies the completed turn whose box the server observes.
type CodingTurn struct {
	RepositoryID  int64
	SessionID     string
	WorkspaceID   string
	WorkflowRunID int64
	// Current reports whether the session still holds this completed run,
	// uncommitted. Nothing runs in the box once it is false.
	Current func(context.Context) bool
}

// Why a coding turn has no test receipt (CodingTestNotRun.ReasonCode).
const (
	codingTestNotRunEnv                = codingTestEnvUnavailable
	codingTestNotRunNoDeclaredTest     = "no_declared_test"
	codingTestNotRunTreeNotHead        = "tree_not_head"
	codingTestNotRunTimedOut           = "test_timed_out"
	codingTestNotRunBoxNotQuiesced     = "box_not_quiesced"
	codingTestNotRunOfflineUnavailable = "runtime_offline_unavailable"
	codingTestNotRunExecFailed         = "exec_failed"
	codingTestNotRunHeadNotPublished   = "head_not_published"
)

func notRun(result CodingResult, code, reason string) CodingResult {
	result.TestReceipt = nil
	result.TestNotRun = &CodingTestNotRun{ReasonCode: code, Reason: reason}
	return result
}

// CodingTurnObserver reads a completed turn's head and test receipt from
// server-observed sources only: the repo host's recorded ref for the box and
// a test the API itself runs in the box. It never fails; a field it cannot
// observe is null and the reason is logged.
type CodingTurnObserver interface {
	ObserveCodingTurn(ctx context.Context, turn CodingTurn) CodingResult
}

// SetCodingTurnObserver makes every completed coding turn's last reply carry
// a coding_result part.
func (s *AgentService) SetCodingTurnObserver(observer CodingTurnObserver) {
	if s != nil {
		s.codingTurns = observer
	}
}

// codingTurnObservations shares one observation among concurrent replays of
// the same turn in this process.
var codingTurnObservations singleflight.Group

// observeCodingTurn runs before completeCodingTurn's transaction, so no
// database transaction waits on the box or the repo host.
func (s *AgentService) observeCodingTurn(ctx context.Context, owner db.AgentSession, projection agentFlowProjection) *CodingResult {
	if s == nil || s.codingTurns == nil {
		return nil
	}
	turn := CodingTurn{RepositoryID: owner.RepositoryID, SessionID: owner.ID, WorkspaceID: UUIDString(owner.WorkspaceID), WorkflowRunID: projection.WorkflowRunID,
		Current: func(ctx context.Context) bool {
			current, err := s.dispatchQ.GetAgentSessionForFlowProjection(ctx, db.GetAgentSessionForFlowProjectionParams{
				SessionID: projection.SessionID, WorkflowRunID: projection.WorkflowRunID, WorkflowTaskID: projection.WorkflowTaskID,
			})
			return err == nil && current.Status == "active" && current.WorkspaceID == owner.WorkspaceID
		}}
	observed, _, _ := codingTurnObservations.Do(projection.SessionID+":"+strconv.FormatInt(projection.WorkflowRunID, 10), func() (any, error) {
		bounded, cancel := context.WithTimeout(context.WithoutCancel(ctx), codingTurnObservationTimeout)
		defer cancel()
		return s.codingTurns.ObserveCodingTurn(bounded, turn), nil
	})
	result := observed.(CodingResult)
	return &result
}

// codingResultPartContent is the stored coding_result part: the record with
// the producer marker the reader requires, which only this server path sets.
func codingResultPartContent(result CodingResult) json.RawMessage {
	result.Producer = codingResultProducer
	// Strings, ints and pointers to them always marshal.
	raw, _ := json.Marshal(result)
	return raw
}

// codingTurnRepoHost is the repo-host surface the observer reads.
type codingTurnRepoHost interface {
	InfoRefs(ctx context.Context, owner, repo, service string, stdout io.Writer) (string, error)
	GetChange(ctx context.Context, owner, repo, changeID string) (repohost.Change, error)
	GetFileAtCommit(ctx context.Context, owner, repo, commit, path string) (repohost.FileContent, error)
}

// codingTurnBox quiesces the box and runs the declared test in it
// (WorkspaceService).
type codingTurnBox interface {
	CodingTurnGuest(ctx context.Context, workspaceID string) (string, error)
	CodingTurnRunsOffline() bool
	QuiesceAgentBox(ctx context.Context, workspaceID, sessionID string, finishedRunID int64) (AgentBoxQuiesce, error)
	RunCodingTurnTest(ctx context.Context, workspaceID, guest, head string, argv []string) (CodingTurnExec, error)
}

type codingTurnRepositories interface {
	GetRepoOwnerSlugAndNameByID(ctx context.Context, repositoryID int64) (db.GetRepoOwnerSlugAndNameByIDRow, error)
}

type codingTurnSecrets interface {
	RepositorySecrets(ctx context.Context, repositoryID int64, mainTrusted bool) (RepositorySecretSnapshot, error)
}

// CodingTurnObservation is the production CodingTurnObserver.
type CodingTurnObservation struct {
	repositories codingTurnRepositories
	host         codingTurnRepoHost
	box          codingTurnBox
	secrets      codingTurnSecrets
	now          func() time.Time
	sleep        func(context.Context, time.Duration) error
}

func NewCodingTurnObservation(repositories codingTurnRepositories, host codingTurnRepoHost, box codingTurnBox, secrets codingTurnSecrets) *CodingTurnObservation {
	return &CodingTurnObservation{repositories: repositories, host: host, box: box, secrets: secrets, now: time.Now, sleep: sleepContext}
}

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (o *CodingTurnObservation) ObserveCodingTurn(ctx context.Context, turn CodingTurn) CodingResult {
	logger := slog.With("agent_session_id", turn.SessionID, "workflow_run_id", turn.WorkflowRunID, "workspace_id", turn.WorkspaceID)
	result := o.observe(ctx, logger, turn)
	if result.TestNotRun != nil {
		logger.Warn("coding result has no test receipt", "head_commit", result.HeadCommit, "reason_code", result.TestNotRun.ReasonCode, "reason", result.TestNotRun.Reason)
	}
	return result
}

func (o *CodingTurnObservation) observe(ctx context.Context, logger *slog.Logger, turn CodingTurn) CodingResult {
	if turn.WorkspaceID == "" {
		return notRun(CodingResult{}, codingTestNotRunTreeNotHead, "the turn had no sandbox")
	}
	// The guest first, while the session still holds this run: every later
	// step acts only on the guest that ended this turn.
	guest, err := o.box.CodingTurnGuest(ctx, turn.WorkspaceID)
	if err == nil && turn.Current != nil && !turn.Current(ctx) {
		err = errors.New("a later turn holds the session")
	}
	guestErr := err
	names, err := o.repositories.GetRepoOwnerSlugAndNameByID(ctx, turn.RepositoryID)
	if err != nil {
		logger.Warn("coding result has no head: repository unavailable", "error", err)
		return notRun(CodingResult{}, codingTestNotRunExecFailed, "the repository couldn't be read")
	}
	owner, repo := names.OwnerSlug, names.RepoName
	ref := repohost.BranchHeadRef(turn.WorkspaceID)
	// 1. Server-side, before anything runs in the box and while the head
	// token still works: the head the repo host records once the box's head
	// reporter stops publishing. Nothing runs in the box until it is quiesced.
	head, err := o.awaitStableRef(ctx, owner, repo, ref)
	if err != nil {
		logger.Warn("coding result has no head: the repo host did not answer", "ref", ref, "error", err)
		return notRun(CodingResult{}, codingTestNotRunTreeNotHead, "the sandbox's commit couldn't be read")
	}
	if head == "" {
		logger.Warn("coding result has no head: the box published no head", "ref", ref)
		return notRun(CodingResult{}, codingTestNotRunHeadNotPublished, "the sandbox published no commit")
	}
	// Until the box proves its working commit is head, head is the
	// server-observed ref, recorded only beside a reason no test ran.
	result := o.head(ctx, logger, owner, repo, head)
	argv, reason, err := resolveCodingTestCommand(o.fileAt(ctx, owner, repo, head))
	if err != nil {
		logger.Warn("coding test command unresolved", "head_commit", head, "error", err)
		return notRun(result, codingTestNotRunExecFailed, "the repository couldn't be read at this commit")
	}
	if argv == nil {
		logger.Info("coding result has no declared test", "head_commit", head, "reason", reason)
		return notRun(result, codingTestNotRunNoDeclaredTest, "the repository declares no test")
	}
	if guestErr != nil {
		logger.Warn("coding test has no guest", "error", guestErr)
		return notRun(result, codingTestNotRunExecFailed, "the sandbox stopped before the test")
	}
	if !o.box.CodingTurnRunsOffline() {
		return notRun(result, codingTestNotRunOfflineUnavailable, "this sandbox can't run tests offline")
	}
	// 2. The test is agent code and runs as the coding host's account: only a
	// box with no host and no live token of the run may run it.
	quiesce, err := o.box.QuiesceAgentBox(ctx, turn.WorkspaceID, turn.SessionID, turn.WorkflowRunID)
	// Detail names a coding host the runtime did not stop.
	if err != nil || !quiesce.Quiesced || quiesce.Detail != "" || turn.Current != nil && !turn.Current(ctx) {
		logger.Warn("coding test box not quiesced", "outcome", quiesce.Outcome, "detail", quiesce.Detail, "head_token_revoked", quiesce.HeadTokenRevoked, "error", err)
		return notRun(result, codingTestNotRunBoxNotQuiesced, "the sandbox couldn't be isolated from the agent's credentials")
	}
	// 3. In the confined exec, the box's working commit must be head and its
	// tree exactly head's before the test runs.
	outcome, err := o.box.RunCodingTurnTest(ctx, turn.WorkspaceID, guest, head, argv)
	switch {
	case errors.Is(err, errCodingTurnOfflineUnavailable):
		return notRun(result, codingTestNotRunOfflineUnavailable, "this sandbox can't run tests offline")
	case errors.Is(err, errCodingTurnGuestChanged):
		return notRun(result, codingTestNotRunExecFailed, "the sandbox was replaced before the test")
	case err != nil:
		logger.Warn("coding test exec failed", "head_commit", head, "error", err)
		return notRun(result, codingTestNotRunExecFailed, "the sandbox didn't report a result")
	}
	switch {
	case outcome.At != "" || outcome.Refusal == "tree dirty":
		// The final work is not what the repo host recorded: never record
		// the published commit as this turn's work.
		logger.Info("coding test refused: the turn's final work was not published", "published_commit", head, "box_commit", outcome.At, "refusal", outcome.Refusal)
		return notRun(CodingResult{}, codingTestNotRunHeadNotPublished, "the sandbox's last changes weren't published")
	case strings.HasPrefix(outcome.Refusal, "tree "):
		logger.Warn("coding test refused: the box's tree could not be read", "head_commit", head, "refusal", outcome.Refusal)
		return notRun(result, codingTestNotRunExecFailed, "the sandbox's files couldn't be read")
	case outcome.Refusal == "timeout":
		return notRun(result, codingTestNotRunTimedOut, fmt.Sprintf("the test ran longer than %d minutes", int(codingTurnTestTimeout/time.Minute)))
	case outcome.Refusal != "":
		return notRun(result, codingTestNotRunExecFailed, "the sandbox didn't report a result")
	}
	if outcome.Truncated {
		logger.Info("coding result output truncated to its tail", "head_commit", head, "truncated", true)
	}
	if reason, env := classifyCodingTestEnvironment(outcome.ExitCode, string(outcome.Tail)); env {
		logger.Info("coding test could not run in the sandbox", "head_commit", head, "exit_code", outcome.ExitCode, "reason", reason)
		return notRun(result, codingTestNotRunEnv, reason)
	}
	finished := o.now().UTC().Format(time.RFC3339)
	raw := outcome.Tail
	if outcome.Truncated {
		// The cut may fall inside a secret; its fragment must not survive
		// masking, so the partial first line goes before anything is masked.
		if i := bytes.IndexByte(raw, '\n'); i >= 0 {
			raw = raw[i+1:]
		} else {
			raw = nil
		}
	}
	tail, err := o.maskTail(ctx, turn.RepositoryID, raw)
	if err != nil {
		logger.Warn("coding result output withheld: secrets unavailable for masking", "error", err)
	}
	result.TestReceipt = &CodingTestReceipt{
		Command: codingCommandLine(argv), ExitCode: outcome.ExitCode, Commit: head,
		FinishedAt: finished, OutputTail: tail, TestsRun: parseCodingTestsRun(string(outcome.Tail)),
	}
	return result
}

// head is the repo host's own record of head: the commit and its change.
func (o *CodingTurnObservation) head(ctx context.Context, logger *slog.Logger, owner, repo, head string) CodingResult {
	commit := head
	result := CodingResult{HeadCommit: &commit}
	change, err := o.host.GetChange(ctx, owner, repo, head)
	if err != nil || change.CommitID != head || !codingChangeID.MatchString(change.ChangeID) {
		logger.Warn("coding result has no change id: the repo host did not resolve the head", "head_commit", head, "error", err)
		return result
	}
	changeID := change.ChangeID
	result.HeadChangeID = &changeID
	return result
}

func (o *CodingTurnObservation) fileAt(ctx context.Context, owner, repo, commit string) codingTestFile {
	return func(path string) (string, bool, error) {
		file, err := o.host.GetFileAtCommit(ctx, owner, repo, commit, path)
		if repohost.IsFileNotFound(err) {
			return "", false, nil
		}
		if err != nil {
			return "", false, err
		}
		if file.TooLarge {
			return "", true, nil
		}
		text := file.Content
		if file.Encoding == "base64" {
			raw, err := base64.StdEncoding.DecodeString(file.Content)
			if err != nil {
				return "", true, nil
			}
			text = string(raw)
		}
		if len(text) > codingTestFileBytes {
			return "", true, nil
		}
		return text, true, nil
	}
}

// awaitStableRef reads ref until it has not changed for
// codingTurnHeadStable, or codingTurnHeadWait passes, and returns the last
// commit it read ("" when the ref is absent). A turn's intermediate commits
// are passed over: only the head the reporter stopped at is returned.
func (o *CodingTurnObservation) awaitStableRef(ctx context.Context, owner, repo, ref string) (string, error) {
	deadline := o.now().Add(codingTurnHeadWait)
	head, err := advertisedRefCommit(ctx, o.host, owner, repo, ref)
	if err != nil {
		return "", err
	}
	since := o.now()
	for o.now().Before(since.Add(codingTurnHeadStable)) && o.now().Before(deadline) {
		if err := o.sleep(ctx, time.Second); err != nil {
			return "", err
		}
		current, err := advertisedRefCommit(ctx, o.host, owner, repo, ref)
		if err != nil {
			return "", err
		}
		if current != head {
			head, since = current, o.now()
		}
	}
	return head, nil
}

// maskTail masks the repository's secret values, then any line that looks
// like a credential, then keeps the last codingResultTailBytes on a UTF-8
// boundary. Without the secret values it keeps nothing.
func (o *CodingTurnObservation) maskTail(ctx context.Context, repositoryID int64, raw []byte) (string, error) {
	if len(raw) == 0 {
		return "", nil
	}
	if o.secrets == nil {
		return "", errors.New("no secret source")
	}
	snapshot, err := o.secrets.RepositorySecrets(ctx, repositoryID, true)
	if err != nil {
		return "", err
	}
	values := make(map[string]string, len(snapshot.Secrets)+len(snapshot.Bound))
	for name, value := range snapshot.Secrets {
		values[name] = value
	}
	for _, bound := range snapshot.Bound {
		values["bound:"+bound.Name] = bound.Value
	}
	return maskCodingOutput(values, raw), nil
}

var (
	// codingOutputTokens are credential shapes a box holds or a test may
	// print: Smithers, GitHub, OpenAI and Anthropic, Slack and AWS keys.
	codingOutputTokens = regexp.MustCompile(`\b(?:smithers_[A-Za-z0-9_.\-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_\-]{16,}|xox[abposr]-[A-Za-z0-9\-]{10,}|(?:AKIA|ASIA)[0-9A-Z]{16})`)
	// codingOutputUserinfo is a URL's user[:password]@.
	codingOutputUserinfo = regexp.MustCompile(`([A-Za-z][A-Za-z0-9+.\-]*://)[^\s/@]+@`)
)

// maskCodingOutput masks secret values, credential shapes and URL userinfo
// in place, then whole lines that still look like credentials, and keeps the
// last codingResultTailBytes on a UTF-8 boundary.
func maskCodingOutput(secrets map[string]string, raw []byte) string {
	text := strings.ToValidUTF8(strings.ReplaceAll(string(raw), "\x00", ""), "�")
	text = RedactSecretValues(secrets, text)
	text = codingOutputTokens.ReplaceAllString(text, redactedSecretValue)
	text = codingOutputUserinfo.ReplaceAllString(text, "${1}"+redactedSecretValue+"@")
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if credentialscan.ScanForCredentialMaterial(line) != nil {
			lines[i] = redactedSecretValue
		}
	}
	text = strings.Join(lines, "\n")
	if len(text) <= codingResultTailBytes {
		return text
	}
	text = text[len(text)-codingResultTailBytes:]
	for text != "" && !utf8.RuneStart(text[0]) {
		text = text[1:]
	}
	return text
}

// advertisedRefCommit reads one ref's commit from the repo host's upload-pack
// advertisement, or "" when the ref is absent.
func advertisedRefCommit(ctx context.Context, host interface {
	InfoRefs(ctx context.Context, owner, repo, service string, stdout io.Writer) (string, error)
}, owner, repo, ref string) (string, error) {
	var out bytes.Buffer
	if _, err := host.InfoRefs(ctx, owner, repo, "git-upload-pack", &out); err != nil {
		return "", err
	}
	for _, line := range strings.Split(out.String(), "\n") {
		line = strings.TrimSuffix(line, "\r")
		if i := strings.IndexByte(line, 0); i >= 0 {
			line = line[:i]
		}
		fields := strings.Fields(line)
		if len(fields) != 2 || fields[1] != ref {
			continue
		}
		sha := fields[0]
		if len(sha) > 40 {
			sha = sha[len(sha)-40:] // strip the pkt-line length prefix
		}
		if mythicalSHA.MatchString(sha) {
			return sha, nil
		}
	}
	return "", nil
}
