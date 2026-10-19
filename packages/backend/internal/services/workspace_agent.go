package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/sandbox"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// CreateAgentWorkspaceInput describes a run attaching to its branch machine.
type CreateAgentWorkspaceInput struct {
	RepositoryID   int64
	UserID         int64
	SessionID      string
	RepoOwner      string
	RepoName       string
	SourceBookmark string
	// EgressSecrets are the run's proxy bindings (platform model seats, the
	// per-run cache token). They are merged over the
	// repository's own bound secrets; the run's bindings win on a name clash.
	EgressSecrets []sandbox.EgressProxySecret
	// Members are cross-repository changeset members to clone beside the
	// primary checkout (authenticated clone URLs, pinned revisions).
	Members []sandbox.GitRepositorySpec
}

// AgentWorkspaceResult is what dispatch needs back.
type AgentWorkspaceResult struct {
	WorkspaceID       string
	VMID              string
	Forked            bool
	SourceWorkspaceID string
}

func pgUUIDFromString(value string) pgtype.UUID {
	parsed, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: parsed, Valid: true}
}

// CheckAgentWorkspaceQuota remains the dispatch admission boundary; branch
// attachment consumes no member quota and never allocates an agent computer.
func (s *WorkspaceService) CheckAgentWorkspaceQuota(ctx context.Context, userID int64) error {
	return s.requireBranchMachineProviders()
}

// CreateAgentWorkspace attaches this session to its own box on the branch
// (plue#869). No other session, member or guest joins it, so nothing one
// turn leaves on its box reaches another person's turn.
func (s *WorkspaceService) CreateAgentWorkspace(ctx context.Context, input CreateAgentWorkspaceInput) (AgentWorkspaceResult, error) {
	if err := s.requireBranchMachineProviders(); err != nil {
		return AgentWorkspaceResult{}, err
	}
	if !pgUUIDFromString(input.SessionID).Valid {
		return AgentWorkspaceResult{}, pkgerrors.BadRequest("session is required")
	}
	// Per-run egress and cross-repository setup cannot mutate a shared machine.
	// Their scoped delivery contract must be available before attachment.
	if len(input.EgressSecrets) != 0 || len(input.Members) != 0 {
		return AgentWorkspaceResult{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "shared run bindings unavailable")
	}
	if err := s.validateBranchMachineSession(ctx, input); err != nil {
		return AgentWorkspaceResult{}, err
	}
	// No turn joins a guest an earlier turn minted on, or a box whose
	// provision failed: it is retired first and this turn builds a fresh one
	// (Security d-am9s3m). Like the fence below, the retirement runs before
	// the join opens its authorization transaction.
	if err := s.retireAgentSessionBoxForTurn(ctx, input.SessionID); err != nil {
		return AgentWorkspaceResult{}, err
	}
	// The session's box passes the fence before the join opens its
	// authorization transaction: no second connection is acquired while that
	// transaction is held (admitAgentBoxJoin).
	if store, ok := s.q.(agentWorkspaceReleaseStore); ok {
		step, cancel := agentBoxStep(ctx)
		box, err := store.AgentSessionWorkspace(step, input.SessionID)
		cancel()
		if err != nil {
			return AgentWorkspaceResult{}, err
		}
		if err := s.admitAgentBoxJoin(ctx, box, input.SessionID, input.UserID); err != nil {
			return AgentWorkspaceResult{}, err
		}
	}
	row, err := s.CreateWorkspace(ctx, CreateWorkspaceInput{
		RepositoryID: input.RepositoryID, UserID: input.UserID,
		RepoOwner: input.RepoOwner, RepoName: input.RepoName, SourceBookmark: input.SourceBookmark,
		AgentSessionID: input.SessionID,
	})
	if err != nil {
		return AgentWorkspaceResult{}, err
	}
	if err := s.attachBranchMachineSession(ctx, row.ID, input); err != nil {
		return AgentWorkspaceResult{}, err
	}
	workspace, err := s.q.GetWorkspace(ctx, row.ID)
	if err != nil {
		return AgentWorkspaceResult{}, err
	}
	return AgentWorkspaceResult{WorkspaceID: row.ID, VMID: workspace.VmID}, nil
}

// runForkedWorkspaceCommand mints a short-lived fetch token bound to the
// workspace's repository and runs the builder's command as root in the forked VM.
func (s *WorkspaceService) runForkedWorkspaceCommand(ctx context.Context, vmID string, userID, repositoryID int64, build func(token string) string) error {
	execClient, ok := s.sandbox.(sandboxExecClient)
	if !ok {
		return pkgerrors.Internal("sandbox exec client unavailable")
	}
	token, err := issueTemporaryBoundRepoCloneToken(ctx, s.q, userID, repositoryID, "sandbox-fork-fetch")
	if err != nil {
		return pkgerrors.Internal("create fork fetch token: " + err.Error())
	}
	defer revokeTemporaryRepoCloneToken(context.WithoutCancel(ctx), s.q, userID, token.ID)
	// Two minutes: shorter than the clone budget so a stuck fork prepare
	// still leaves room for the cold-clone fallback.
	const forkPrepareTimeout = 2 * time.Minute
	timeoutMS := int64(forkPrepareTimeout / time.Millisecond)
	execCtx, cancel := context.WithTimeout(ctx, forkPrepareTimeout)
	defer cancel()
	resp, err := execClient.Execute(execCtx, vmID, sandbox.ExecRequest{
		Command:   build(token.Plaintext),
		TimeoutMS: &timeoutMS,
	})
	if err != nil {
		return pkgerrors.Internal("prepare forked workspace: " + err.Error())
	}
	if resp.StatusCode != nil && *resp.StatusCode != 0 {
		detail := strings.TrimSpace(resp.Stderr)
		if out := strings.TrimSpace(resp.Stdout); out != "" {
			if detail != "" {
				detail += "\n"
			}
			detail += out
		}
		if len(detail) > 1000 {
			detail = detail[len(detail)-1000:]
		}
		return pkgerrors.Internal(fmt.Sprintf("prepare forked workspace failed with status %d: %s", *resp.StatusCode, detail))
	}
	return nil
}

// What ending a run did to its box. The run's own callback and repository
// API tokens are revoked by the session's finalize whatever happens here.
const (
	// QuiesceAgentBox revoked every credential the run was given on the box
	// and stopped its coding hosts; the box keeps running with its guest
	// marked dirty, so its next turn's join retires it.
	agentWorkspaceQuiesced = "quiesced"
	// The box was retired: its credentials are revoked, its coding hosts
	// stopped, and its guest and disk deleted. The next turn builds a fresh
	// guest from the recorded head (plue#866, plue#869).
	agentWorkspaceRetired = "retired"
	// The box's credentials are revoked but its recorded head is not
	// published yet, so its guest is kept, marked dirty: the next turn's join
	// retires it, or is refused retryably while the head is unpublished.
	agentWorkspaceKeptDirty = "kept_dirty"
	// Already asleep, stopped or failed; any head token it kept is revoked.
	agentWorkspaceAlreadyReleased = "already_released"
	// Another session, a terminal or a stack lane still uses it.
	agentWorkspaceKeptInUse = "kept_in_use"
	// An install releases idle branches itself, after a verified capture.
	agentWorkspaceKeptForMachineLifecycle = "kept_for_machine_lifecycle"
	// No workspace runtime or branch providers here to act on it with.
	agentWorkspaceKeptWithoutRuntime = "kept_without_runtime"
	// No such box.
	agentWorkspaceAbsent = "absent"
	// The release could not complete; whatever it revoked is reported.
	agentWorkspaceReleaseFailed = "release_failed"
)

// AgentWorkspaceRelease is what ReleaseAgentWorkspace did to a box.
type AgentWorkspaceRelease struct {
	Outcome string
	// HeadTokenRevoked is true when the box holds no live head token.
	HeadTokenRevoked bool
	// Quiesced is true only when every coding host of the run and the guest's
	// head reporter are stopped and its head, landing and cache tokens, its
	// hosts' control and model credentials and the guest's git credential
	// cache socket are all read back as gone (QuiesceAgentBox). A quiesced
	// release names nothing in Detail; a host or reporter left running is
	// named there and Quiesced is false.
	Quiesced bool
	// Detail names what keeps a box in use, for the operator log.
	Detail string
}

// agentWorkspaceReleaseStore is what a release, a retirement and a turn's
// join need of the store: the box's fence (db.ClaimAgentBoxRelease) and its
// coding hosts.
type agentWorkspaceReleaseStore interface {
	ClaimAgentBoxRelease(ctx context.Context, arg db.ClaimAgentBoxReleaseParams) (db.AgentBoxClaim, error)
	RenewAgentBoxLease(ctx context.Context, workspaceID, lease, guestID string, noHeadToken bool) (string, error)
	EndAgentBoxLease(ctx context.Context, workspaceID, lease, stage string) error
	AdmitAgentBoxJoin(ctx context.Context, workspaceID, sessionID string, userID int64) (db.AgentBoxAdmission, error)
	AgentSessionWorkspace(ctx context.Context, sessionID string) (string, error)
	RevokeStoppedAgentBoxCredentials(ctx context.Context, arg db.RevokeStoppedAgentBoxCredentialsParams) (db.StoppedAgentBoxRevoke, error)
	RetireFlowHostCredentials(ctx context.Context, bindingID string, ownerGeneration, userID int64, names []string) (int64, error)
	ListFlowHostBindingHolders(ctx context.Context, workspaceID string) ([]db.FlowHostBindingHolder, error)
	MarkFlowHostStopPending(ctx context.Context, bindingID string, ownerGeneration int64, pending bool) error
}

// ReleaseAgentWorkspace ends a finished run's hold on its box. finishedRunID
// is that run: the same session's next turn is another run and holds the box.
//
// A box its session's next turn or a terminal still uses keeps running with
// its credentials. An install leaves the box to its machine lifecycle, which
// sleeps an idle branch after a verified capture. Anywhere else the box is
// retired, never kept warm (Security d-am9s3m): QuiesceAgentBox revokes and
// reads back every credential the run was given, and the guest and its disk
// are deleted, whatever a reap could report. The next turn builds a fresh
// guest from the recorded head. A box whose recorded head is not published
// yet keeps its guest, marked dirty, for its next turn's join to retire.
//
// Every replica serializes a box with its own in-process lock only, so the
// release holds the box's database lease (db.ClaimAgentBoxRelease), taken in
// the transaction that reads the box unused, for all it revokes, stops, reaps
// or deletes. A turn's join on any replica waits for the lease to end.
func (s *WorkspaceService) ReleaseAgentWorkspace(ctx context.Context, workspaceID, sessionID string, finishedRunID int64) (AgentWorkspaceRelease, error) {
	return s.releaseAgentBox(ctx, workspaceID, sessionID, finishedRunID, true)
}

// AgentBoxQuiesce is what QuiesceAgentBox did to a box.
type AgentBoxQuiesce = AgentWorkspaceRelease

// QuiesceAgentBox revokes everything finishedRunID, a run of sessionID, was
// given on its box, holding the box's lease, and touches nothing else: the
// box's head token, its coding hosts and their landing and cache credentials,
// the guest's head reporter and its git credential cache, each read back as
// gone. It does not
// retire the box. Its guest stays marked dirty whatever happens: only a
// retirement's new guest clears the mark, so the box's next turn retires it.
// A revocation that is not read back fails the quiesce and the sweep retries
// it. It is idempotent on a quiesced box. A box its session's next turn or a
// terminal uses is kept, as by ReleaseAgentWorkspace.
func (s *WorkspaceService) QuiesceAgentBox(ctx context.Context, workspaceID, sessionID string, finishedRunID int64) (AgentBoxQuiesce, error) {
	return s.releaseAgentBox(ctx, workspaceID, sessionID, finishedRunID, false)
}

// releaseAgentBox is QuiesceAgentBox and, when finish is true, then the
// retirement that replaces the box's guest (ReleaseAgentWorkspace).
func (s *WorkspaceService) releaseAgentBox(ctx context.Context, workspaceID, sessionID string, finishedRunID int64, finish bool) (AgentWorkspaceRelease, error) {
	if s.q == nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, pkgerrors.Internal("workspace store unavailable")
	}
	// A real deadline before the first pool acquisition: a release never
	// waits on an exhausted pool past it (Security G4 finding 5).
	ctx, cancel := context.WithTimeout(ctx, agentBoxReleaseBudget)
	defer cancel()
	row, err := s.q.GetWorkspace(ctx, strings.TrimSpace(workspaceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAbsent}, nil
	}
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, fmt.Errorf("load agent workspace: %w", err)
	}
	if row.DeletedAt.Valid {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAbsent}, nil
	}
	switch row.Status {
	case "suspended", "stopped", "failed":
		return s.releaseStoppedAgentBox(ctx, row, sessionID, finishedRunID)
	case "running":
	default:
		// Another request owns this box's start or release.
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: "box is " + row.Status}, nil
	}
	if s.machineAdmission != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptForMachineLifecycle}, nil
	}
	store, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok || !s.hasWorkspaceRuntime() || s.requireBranchMachineProviders() != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptWithoutRuntime}, nil
	}
	unlock := s.lockRuntimeWorkspace(row.ID)
	defer unlock()
	s.agentBoxReleasePoint(agentBoxBeforeClaim, row.ID)
	claim, err := store.ClaimAgentBoxRelease(ctx, db.ClaimAgentBoxReleaseParams{WorkspaceID: row.ID,
		FinishedSessionID: sessionID, FinishedRunID: finishedRunID, CheckUse: true,
		AfterEmptyUse: func() { s.agentBoxReleasePoint(agentBoxAfterEmptyUse, row.ID) }})
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, err
	}
	switch {
	case claim.Busy:
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: "another release holds the box"}, nil
	case claim.Use.InUse():
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: agentWorkspaceUseDetail(claim.Use)}, nil
	case claim.Lease == "":
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: "box is " + claim.Status}, nil
	}
	// The box's dirty mark stays whatever happens below: only a retirement's
	// new guest clears it, so its next turn retires a guest left here.
	lease := claim.Lease
	defer func() {
		step, cancel := agentBoxStep(ctx)
		defer cancel()
		if err := store.EndAgentBoxLease(step, row.ID, lease, ""); err != nil {
			slog.WarnContext(ctx, "end agent box lease failed; it lapses on its own", "workspace_id", row.ID, "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: store, runtime: s.runtime, workspaceID: row.ID, guest: claim.VmID, lease: &lease, point: s.agentBoxReleasePoint}
	lost := func(revoked bool) AgentWorkspaceRelease {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, HeadTokenRevoked: revoked, Detail: errAgentBoxLost.Error()}
	}
	if finish {
		retireStore, ok := s.q.(agentBoxIdleCapStore)
		if !ok {
			return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptWithoutRuntime}, nil
		}
		// Retiring quiesces first: every credential is revoked and read back
		// before the guest goes (retireAgentBoxLeased).
		retired, kept, err := s.retireAgentBoxLeased(ctx, guard, retireStore, row, agentBoxRetireTurnEnd, agentBoxHeadVerifyAttempts)
		switch {
		case errors.Is(err, errAgentBoxLost):
			return lost(false), nil
		case err != nil:
			return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: s.agentBoxHeadTokenGone(ctx, row), Detail: kept}, err
		case retired:
			// Deleting the guest ended any host a stop missed.
			return AgentWorkspaceRelease{Outcome: agentWorkspaceRetired, HeadTokenRevoked: true, Quiesced: true}, nil
		default:
			// Its recorded head is not published: the guest stays, marked
			// dirty, and is quiesced only if every host stopped.
			return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptDirty, HeadTokenRevoked: true, Quiesced: kept == "", Detail: kept}, nil
		}
	}
	// A credential whose revocation failed or was not confirmed is a working
	// credential the run may have copied: the release fails and the sweep
	// retries it (Security s-50rmyl).
	revoked, kept, err := s.quiesceAgentBoxLeased(ctx, row, guard)
	if errors.Is(err, errAgentBoxLost) {
		return lost(revoked), nil
	}
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: revoked, Detail: kept}, err
	}
	// A coding host whose stop failed still runs: its credentials are
	// revoked, but the box is not quiesced. Its guest stays marked dirty, so
	// its next turn's join retires it.
	if kept != "" {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptDirty, HeadTokenRevoked: revoked, Detail: kept}, nil
	}
	return AgentWorkspaceRelease{Outcome: agentWorkspaceQuiesced, HeadTokenRevoked: revoked, Quiesced: true}, nil
}

// agentBoxHeadTokenGone reports whether the box names no head token now.
func (s *WorkspaceService) agentBoxHeadTokenGone(ctx context.Context, row db.Workspace) bool {
	step, cancel := agentBoxStep(ctx)
	defer cancel()
	current, err := s.q.GetWorkspace(step, row.ID)
	return err == nil && !current.HeadPushTokenID.Valid
}

// releaseStoppedAgentBox revokes every credential a box that is not running
// still holds, under the same finished-run fence as a running box's release,
// and reads them back (db.RevokeStoppedAgentBoxCredentials, Security G4
// finding 2): its head token, its children credential, and each coding
// host's landing and cache tokens and control and model credentials. A
// stopped host's credentials are as live as a running one's. A revocation
// that fails leaves the credentials for the sweep, which retries every box
// that is not running and still holds one.
func (s *WorkspaceService) releaseStoppedAgentBox(ctx context.Context, row db.Workspace, sessionID string, finishedRunID int64) (AgentWorkspaceRelease, error) {
	store, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAlreadyReleased, HeadTokenRevoked: s.revokeAgentWorkspaceHeadToken(ctx, row)}, nil
	}
	got, err := store.RevokeStoppedAgentBoxCredentials(ctx, db.RevokeStoppedAgentBoxCredentialsParams{WorkspaceID: row.ID,
		FinishedSessionID: sessionID, FinishedRunID: finishedRunID, CheckUse: true, ChildrenTokenName: workspaceChildrenTokenName(row.ID)})
	switch {
	case err != nil:
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, fmt.Errorf("revoke a stopped box's credentials; the sweep retries: %w", err)
	case got.Running:
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: "box started since"}, nil
	case got.Busy:
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: "another release holds the box"}, nil
	case got.Use.InUse():
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, Detail: agentWorkspaceUseDetail(got.Use)}, nil
	}
	return AgentWorkspaceRelease{Outcome: agentWorkspaceAlreadyReleased, HeadTokenRevoked: true, Quiesced: true}, nil
}

// quiesceAgentBoxLeased revokes everything a run was given on a box whose
// lease guard holds: the head token (a CAS on the token read, read back), the
// coding hosts and their landing and cache credentials (guarded, read back by
// owner generation), the guest's head reporter, which must read back as not
// running (guarded), and the guest's git credential cache, whose socket must
// be gone (guarded). Unix sockets cross a network namespace, so a command
// that runs in the guest after quiesce could otherwise read the cached
// credential (Security s-j6ein4). It answers whether the head token is
// revoked, what it left running, and an error when any revocation is
// unconfirmed (errAgentBoxLost when the release lost the box).
func (s *WorkspaceService) quiesceAgentBoxLeased(ctx context.Context, row db.Workspace, guard agentBoxGuard) (bool, string, error) {
	revoked := s.revokeAgentWorkspaceHeadToken(ctx, row)
	operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "agent-release"))
	if err != nil {
		return revoked, "", err
	}
	kept, err := s.stopAgentWorkspaceHosts(operationCtx, row, guard)
	if err != nil {
		return revoked, kept, err
	}
	// Before the credential cache, which a running reporter seeds again.
	reporter, err := s.stopAgentBoxHeadReporter(operationCtx, row, guard)
	if kept != "" && reporter != "" {
		kept += "; "
	}
	kept += reporter
	if err != nil {
		return revoked, kept, err
	}
	if err := s.endAgentBoxCredentialCache(operationCtx, row, guard); err != nil {
		return revoked, kept, err
	}
	if !revoked {
		return revoked, kept, errAgentBoxHeadTokenLive
	}
	return revoked, kept, nil
}

// stopAgentBoxHeadReporter stops the guest's head reporter under guard and
// reads it back as not running. The reporter runs jj and git in the checkout
// as the developer, with the network, outside the offline facet the turn's
// test runs in: a .git or .jj config the test planted would run there on its
// next snapshot or push. A box with no guest, or a guest that no longer
// exists, runs none. It answers the reporter it could not confirm stopped,
// for the operator log, or "": the box is then not quiesced, and a
// retirement deleting its guest ends it. errAgentBoxLost is a release that
// lost the box. Nothing starts the reporter again on this guest
// (agentBoxGuestQuiesced).
func (s *WorkspaceService) stopAgentBoxHeadReporter(ctx context.Context, row db.Workspace, guard agentBoxGuard) (string, error) {
	if strings.TrimSpace(guard.guest) == "" {
		return "", nil
	}
	gone := func(err error) bool {
		return errors.Is(err, workspaceapi.ErrWorkspaceNotFound) || errors.Is(err, workspaceapi.ErrWorkspaceStopped)
	}
	var unconfirmed error
	ran, err := guard.run(ctx, agentBoxBeforeHeadReporterStop, false, func(ctx context.Context) error {
		err := s.runtime.StopService(ctx, row.ID, workspaceHeadReporterService)
		switch {
		case errors.Is(err, workspaceapi.ErrGuestGone):
			return err
		case gone(err):
			return nil
		case err != nil:
			unconfirmed = fmt.Errorf("stop: %w", err)
			return nil
		}
		observed, err := s.runtime.InspectService(ctx, row.ID, workspaceHeadReporterService)
		switch {
		case errors.Is(err, workspaceapi.ErrGuestGone):
			return err
		case gone(err):
		case err != nil:
			unconfirmed = fmt.Errorf("read back: %w", err)
		case observed.State == workspaceapi.ServiceRunning:
			unconfirmed = errors.New("read back as running after its stop")
		}
		return nil
	})
	switch {
	case !ran && err == nil:
		return "", errAgentBoxLost
	case err != nil:
		return "", fmt.Errorf("stop the guest's head reporter: %w", err)
	case unconfirmed != nil:
		slog.WarnContext(ctx, "head reporter of a quiesced agent box not confirmed stopped; the box is not quiesced",
			"workspace_id", row.ID, "error", unconfirmed)
		return "head reporter " + workspaceHeadReporterService + " still running", nil
	}
	return "", nil
}

// agentBoxCredentialCacheEnd stops the guest's git credential cache daemon
// and exits 0 only once its socket is gone. A socket no daemon answers on is
// stale and is removed; one a daemon still serves fails the quiesce.
const agentBoxCredentialCacheEnd = `socket="${SMITHERS_WORKSPACE_GIT_CREDENTIAL_SOCKET:?}"
git credential-cache --socket "$socket" exit >/dev/null 2>&1 || true
i=0
while [ -S "$socket" ] && [ "$i" -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
if [ -S "$socket" ] && ! git credential-cache --socket "$socket" exit >/dev/null 2>&1; then rm -f "$socket"; fi
[ ! -S "$socket" ]`

// errAgentBoxCredentialCacheLive is a git credential cache whose socket
// stayed after the quiesce asked its daemon to exit.
var errAgentBoxCredentialCacheLive = errors.New("the guest's git credential cache socket is still present")

// endAgentBoxCredentialCache ends the guest's git credential cache under
// guard and confirms its socket is gone. A guest that no longer exists, or a
// box that never had one, holds no cache.
func (s *WorkspaceService) endAgentBoxCredentialCache(ctx context.Context, row db.Workspace, guard agentBoxGuard) error {
	if strings.TrimSpace(guard.guest) == "" {
		return nil
	}
	var result workspaceapi.CommandResult
	ran, err := guard.run(ctx, agentBoxBeforeCredentialCache, false, func(ctx context.Context) error {
		var err error
		result, err = s.runtime.ExecuteCommand(ctx, row.ID, workspaceapi.Command{
			Args:        []string{"/bin/sh", "-c", agentBoxCredentialCacheEnd},
			Environment: map[string]string{"SMITHERS_WORKSPACE_GIT_CREDENTIAL_SOCKET": workspaceGitCredentialSocket},
		})
		if errors.Is(err, workspaceapi.ErrWorkspaceNotFound) {
			result, err = workspaceapi.CommandResult{}, nil
		}
		return err
	})
	switch {
	case !ran && err == nil:
		return errAgentBoxLost
	case err != nil:
		return fmt.Errorf("end the guest's git credential cache: %w", err)
	case result.ExitCode != 0:
		return errAgentBoxCredentialCacheLive
	}
	return nil
}

// errAgentBoxHeadTokenLive is a head token whose revocation was not
// confirmed.
var errAgentBoxHeadTokenLive = errors.New("the box's head token revocation was not confirmed")

// revokeAgentWorkspaceHeadToken revokes the head token row names (and the
// children credential with it) and reports, by reading both back, that the
// box names no head token and the token row read is gone. It never chases a
// token swapped in after row was read: that one belongs to a turn that joined
// since. The next start mints a fresh one.
func (s *WorkspaceService) revokeAgentWorkspaceHeadToken(ctx context.Context, row db.Workspace) bool {
	ctx, cancel := agentBoxStep(ctx)
	defer cancel()
	s.revokeWorkspaceChildrenToken(ctx, row)
	if err := s.revokeWorkspaceProviderPoolToken(ctx, row); err != nil {
		return false
	}
	if row.HeadPushTokenID.Valid {
		if store, ok := s.q.(workspaceHeadSwapStore); ok {
			won, err := store.SwapWorkspaceHeadPushTokenID(ctx, row.ID, row.UserID, row.HeadPushTokenID, pgtype.Int8{})
			if err != nil || !won {
				// The swap that replaced it revoked it; make sure.
				revokeTemporaryRepoCloneToken(ctx, s.q, row.UserID, row.HeadPushTokenID.Int64)
			}
		} else {
			revokeTemporaryRepoCloneToken(ctx, s.q, row.UserID, row.HeadPushTokenID.Int64)
			if store, ok := s.q.(workspaceHeadStore); ok {
				_ = store.SetWorkspaceHeadPushTokenID(ctx, db.SetWorkspaceHeadPushTokenIDParams{ID: row.ID})
			}
		}
	}
	current, err := s.q.GetWorkspace(ctx, row.ID)
	if err != nil || current.HeadPushTokenID.Valid {
		return false
	}
	if !row.HeadPushTokenID.Valid {
		return true
	}
	tokens, ok := s.q.(interface {
		GetAccessTokenByID(context.Context, int64) (db.AccessToken, error)
	})
	if !ok {
		return false
	}
	_, err = tokens.GetAccessTokenByID(ctx, row.HeadPushTokenID.Int64)
	return errors.Is(err, pgx.ErrNoRows)
}

// stopAgentWorkspaceHosts stops every coding host bound to the box and
// retires the landing and cache credentials it was started with, reading back
// that none is left live. The run is over, so its credentials are retired
// whether or not the stop succeeds: a host still running only fails its next
// call. A host the runtime did not stop is marked so the next release retries
// the stop; a retry that succeeds clears the mark. A stopped host is started
// afresh, with new credentials, by the next turn.
//
// It acts under guard on the hosts it listed while it held the box: a host a
// turn started since shares the binding's id, service and credential names
// but not its owner generation, so it is never stopped or revoked
// (errAgentBoxLost when the release lost the box). A host list it could not
// read, or a credential it could not confirm revoked, is an error: the caller
// keeps the box dirty for the sweep. It answers what it left running, for
// the operator log, or "".
func (s *WorkspaceService) stopAgentWorkspaceHosts(ctx context.Context, row db.Workspace, guard agentBoxGuard) (string, error) {
	store, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return "", errors.New("the workspace store cannot list coding hosts")
	}
	step, cancel := agentBoxStep(ctx)
	holders, err := store.ListFlowHostBindingHolders(step, row.ID)
	cancel()
	if err != nil {
		return "", fmt.Errorf("list coding hosts: %w", err)
	}
	var kept []string
	var failures []error
	if strings.TrimSpace(guard.guest) == "" {
		// No guest runs a host (a provision that failed before its guest
		// existed): its credentials are retired all the same.
		for _, holder := range holders {
			step, cancel := agentBoxStep(ctx)
			if _, err := store.RetireFlowHostCredentials(step, holder.ID, holder.OwnerGeneration, holder.UserID,
				[]string{boxHostLandingTokenName(holder.ID), boxHostCacheTokenName(holder.ID)}); err != nil {
				failures = append(failures, fmt.Errorf("coding host %s: %w", holder.ID, err))
			}
			cancel()
		}
		return "", errors.Join(failures...)
	}
	ran, err := guard.run(ctx, agentBoxBeforeStop, false, func(ctx context.Context) error {
		for _, holder := range holders {
			stopErr := s.runtime.StopService(ctx, row.ID, holder.ServiceName)
			if errors.Is(stopErr, workspaceapi.ErrGuestGone) {
				return stopErr
			}
			stopped := stopErr == nil || errors.Is(stopErr, workspaceapi.ErrWorkspaceNotFound) || errors.Is(stopErr, workspaceapi.ErrWorkspaceStopped)
			// Inside the act each step is bounded by the act's own deadline too.
			step, cancel := context.WithTimeout(ctx, agentBoxStepTimeout)
			if _, err := store.RetireFlowHostCredentials(step, holder.ID, holder.OwnerGeneration, holder.UserID,
				[]string{boxHostLandingTokenName(holder.ID), boxHostCacheTokenName(holder.ID)}); err != nil {
				failures = append(failures, fmt.Errorf("coding host %s: %w", holder.ID, err))
			}
			switch {
			case !stopped:
				slog.WarnContext(ctx, "stop coding host of a released agent workspace failed; the next release retries it",
					"workspace_id", row.ID, "binding_id", holder.ID, "error", stopErr)
				if err := store.MarkFlowHostStopPending(step, holder.ID, holder.OwnerGeneration, true); err != nil {
					slog.WarnContext(ctx, "record a pending coding host stop failed", "workspace_id", row.ID, "binding_id", holder.ID, "error", err)
				}
				kept = append(kept, "coding host "+holder.ID+" still running, credentials retired, stop retried on the next release")
			case holder.StopPending:
				if err := store.MarkFlowHostStopPending(step, holder.ID, holder.OwnerGeneration, false); err != nil {
					slog.WarnContext(ctx, "clear a pending coding host stop failed", "workspace_id", row.ID, "binding_id", holder.ID, "error", err)
				}
			}
			cancel()
		}
		return errors.Join(failures...)
	})
	if !ran && err == nil {
		return "", errAgentBoxLost
	}
	return strings.Join(kept, "; "), err
}

func agentWorkspaceUseDetail(use db.AgentWorkspaceUse) string {
	var parts []string
	if len(use.Sessions) > 0 {
		parts = append(parts, "agent sessions "+strings.Join(use.Sessions, ","))
	}
	if use.Terminals > 0 {
		parts = append(parts, fmt.Sprintf("%d terminal sessions", use.Terminals))
	}
	if use.StackLane {
		parts = append(parts, "a stack lane")
	}
	return strings.Join(parts, "; ")
}

// SnapshotAgentWorkspace snapshots a finished run's computer and returns the
// workspace snapshot id to stamp on the run's revisions.
func (s *WorkspaceService) SnapshotAgentWorkspace(ctx context.Context, workspaceID, name string) (string, error) {
	if s.q == nil {
		return "", pkgerrors.Internal("workspace store unavailable")
	}
	workspace, err := s.q.GetWorkspace(ctx, strings.TrimSpace(workspaceID))
	if err != nil {
		return "", pkgerrors.Internal("load agent workspace: " + err.Error())
	}
	if workspace.Status != "running" || strings.TrimSpace(workspace.VmID) == "" {
		return "", pkgerrors.Conflict("agent workspace is not running")
	}
	snapshot, err := s.CreateWorkspaceSnapshot(ctx, CreateWorkspaceSnapshotInput{
		RepositoryID: workspace.RepositoryID,
		UserID:       workspace.UserID,
		WorkspaceID:  workspace.ID,
		Name:         name,
	})
	if err != nil {
		return "", err
	}
	return snapshot.ID, nil
}

// TouchAgentWorkspace records run activity on the workspace so idle
// suspension does not stop a working agent.
func (s *WorkspaceService) TouchAgentWorkspace(ctx context.Context, workspaceID string) {
	if s.q == nil || strings.TrimSpace(workspaceID) == "" {
		return
	}
	_ = s.q.TouchWorkspaceActivity(ctx, workspaceID)
}

// repositoryDefaultBookmarkResolver is the optional querier surface used to
// pick a run's bookmark when the dispatch names none.
type repositoryDefaultBookmarkResolver interface {
	GetRepoByID(ctx context.Context, id int64) (db.Repository, error)
}

func (s *WorkspaceService) repositoryDefaultBookmark(ctx context.Context, repositoryID int64) string {
	if resolver, ok := s.q.(repositoryDefaultBookmarkResolver); ok {
		if repo, err := resolver.GetRepoByID(ctx, repositoryID); err == nil {
			return targetWorkspaceBookmark(repo.DefaultBookmark)
		}
	}
	return targetWorkspaceBookmark("")
}

// resolveWorkspaceBookmark returns the requested bookmark (or the repository
// default when omitted) together with the repository default. Keeping both
// lets callers distinguish the reusable primary workspace from a derived
// bookmark workspace even when the repository default is not "main".
func (s *WorkspaceService) resolveWorkspaceBookmark(ctx context.Context, repositoryID int64, requested string) (string, string, error) {
	resolver, ok := s.q.(repositoryDefaultBookmarkResolver)
	if !ok {
		return "", "", pkgerrors.Internal("repository default bookmark resolver unavailable")
	}
	return resolveWorkspaceBookmark(ctx, resolver, repositoryID, requested)
}

func resolveWorkspaceBookmark(ctx context.Context, resolver repositoryDefaultBookmarkResolver, repositoryID int64, requested string) (string, string, error) {
	repo, err := resolver.GetRepoByID(ctx, repositoryID)
	if err != nil {
		return "", "", pkgerrors.Internal("load repository default bookmark: " + err.Error())
	}
	defaultBookmark := targetWorkspaceBookmark(repo.DefaultBookmark)
	bookmark := strings.TrimSpace(requested)
	if bookmark == "" {
		bookmark = defaultBookmark
	}
	return targetWorkspaceBookmark(bookmark), defaultBookmark, nil
}
