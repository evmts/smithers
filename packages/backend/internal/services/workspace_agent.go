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

// CreateAgentWorkspace attaches this session to the canonical branch machine.
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
	// The join binds this session to the box at the box's fence, before it
	// mints anything (admitAgentBoxJoinLocked).
	ctx = withAgentBoxJoin(ctx, input.SessionID, input.UserID)
	row, err := s.CreateWorkspace(ctx, CreateWorkspaceInput{
		RepositoryID: input.RepositoryID, UserID: input.UserID,
		RepoOwner: input.RepoOwner, RepoName: input.RepoName, SourceBookmark: input.SourceBookmark,
		// The turn runs on the branch's machine as the branch sized it.
		JoinsAnyMachineSize: true,
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

// runForkedWorkspaceCommand mints a short-lived fetch token and runs the
// builder's command as root in the forked VM.
func (s *WorkspaceService) runForkedWorkspaceCommand(ctx context.Context, vmID string, userID int64, build func(token string) string) error {
	execClient, ok := s.sandbox.(sandboxExecClient)
	if !ok {
		return pkgerrors.Internal("sandbox exec client unavailable")
	}
	token, err := issueTemporaryRepoCloneToken(ctx, s.q, userID, "sandbox-fork-fetch")
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
	// The box keeps running with no credential minted for the run: its head
	// token is revoked and its coding hosts are stopped with their tokens
	// retired. The next turn's join mints a fresh head token and starts a
	// fresh host.
	agentWorkspaceQuiesced = "quiesced"
	// The runtime could not confirm the run's processes ended, so the box was
	// retired: its guest and disk are deleted and the next turn rebuilds it
	// from the recorded head (plue#866).
	agentWorkspaceRetired = "retired"
	// The run's processes are unconfirmed and the recorded head is not
	// published, so the box is kept but mints nothing: its next turn is
	// refused until the box is reaped or retired.
	agentWorkspaceUnreaped = "quiesced_unreaped"
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
	// Detail names what keeps a box in use, for the operator log.
	Detail string
}

// agentWorkspaceReleaseStore is what a release, a retirement and a turn's
// join need of the store: the box's fence (db.ClaimAgentBoxRelease) and its
// coding hosts.
type agentWorkspaceReleaseStore interface {
	ClaimAgentBoxRelease(ctx context.Context, arg db.ClaimAgentBoxReleaseParams) (db.AgentBoxClaim, error)
	RenewAgentBoxLease(ctx context.Context, workspaceID, lease string, noHeadToken bool) (string, error)
	EndAgentBoxLease(ctx context.Context, workspaceID, lease, stage string) error
	AdmitAgentBoxJoin(ctx context.Context, workspaceID, sessionID string, userID int64) (db.AgentBoxAdmission, error)
	WithAgentBoxGuest(ctx context.Context, workspaceID, lease, guestID string, act func(context.Context) error) (bool, error)
	ListFlowHostBindingHolders(ctx context.Context, workspaceID string) ([]db.FlowHostBindingHolder, error)
	MarkFlowHostStopPending(ctx context.Context, bindingID string, ownerGeneration int64, pending bool) error
}

// ReleaseAgentWorkspace ends a finished run's hold on its box. finishedRunID
// is that run: the same session's next turn is another run and holds the box.
//
// A box another agent session, a terminal or a stack lane still uses keeps
// running with its credentials: it is a branch machine members share. An
// install leaves the box to its machine lifecycle, which sleeps an idle branch
// after a verified capture. Anywhere else the box is quiesced, not stopped: a
// stopped box can only be woken under machine admission, which only an install
// composes (authorizeWorkspaceResume), so stopping it here would refuse every
// later turn on the branch, and a person cannot start a box the payer account
// owns (PM d-qhgqyv). Quiescing revokes the head token and stops the coding
// hosts before retiring their credentials, so nothing minted for the run stays
// live; the next turn's join mints a fresh head token and starts a fresh host.
//
// Every replica serializes a box with its own in-process lock only, so the
// release holds the box's database lease (db.ClaimAgentBoxRelease), taken in
// the transaction that reads the box unused, for all it revokes, stops, reaps
// or deletes. A turn's join on any replica waits for the lease to end.
func (s *WorkspaceService) ReleaseAgentWorkspace(ctx context.Context, workspaceID, sessionID string, finishedRunID int64) (AgentWorkspaceRelease, error) {
	if s.q == nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, pkgerrors.Internal("workspace store unavailable")
	}
	row, err := s.q.GetWorkspace(ctx, strings.TrimSpace(workspaceID))
	if errors.Is(err, pgx.ErrNoRows) {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAbsent}, nil
	}
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed}, pkgerrors.Internal("load agent workspace: " + err.Error())
	}
	if row.DeletedAt.Valid {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAbsent}, nil
	}
	switch row.Status {
	case "suspended", "stopped", "failed":
		// Whatever stopped it ended its coding hosts; a head token can outlive
		// a stop (ReleaseFailedFlowHostMachine before this change).
		return AgentWorkspaceRelease{Outcome: agentWorkspaceAlreadyReleased, HeadTokenRevoked: s.revokeAgentWorkspaceHeadToken(ctx, row)}, nil
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
	// Until a reap is confirmed the box's state is unknown: every way out
	// short of that leaves it unreaped, and its next turn retires it.
	lease, finalStage := claim.Lease, db.AgentBoxUnreapedStage
	defer func() {
		if err := store.EndAgentBoxLease(context.WithoutCancel(ctx), row.ID, lease, finalStage); err != nil {
			slog.WarnContext(ctx, "end agent box lease failed; it lapses on its own", "workspace_id", row.ID, "error", err)
		}
	}()
	row.HeadPushTokenID, row.ProvisioningStage, row.VmID = claim.HeadPushTokenID, claim.Lease, claim.VmID
	guard := agentBoxGuard{fence: store, workspaceID: row.ID, guest: claim.VmID, lease: &lease}
	lost := func(revoked bool) AgentWorkspaceRelease {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceKeptInUse, HeadTokenRevoked: revoked, Detail: errAgentBoxLost.Error()}
	}

	revoked := s.revokeAgentWorkspaceHeadToken(ctx, row)
	operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "agent-release"))
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: revoked}, err
	}
	s.agentBoxReleasePoint(agentBoxBeforeRuntime, row.ID)
	kept, err := s.stopAgentWorkspaceHosts(operationCtx, row, guard)
	if errors.Is(err, errAgentBoxLost) {
		return lost(revoked), nil
	}
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: revoked}, err
	}
	// A process the run left must not survive into the next turn, where it
	// could read that turn's fresh credentials (plue#866). A box is kept warm
	// only when the runtime confirms every run process ended.
	reapErr := errors.New("the workspace runtime cannot confirm a run's processes ended")
	if reaper, ok := s.runtime.(workspaceapi.WorkspaceRunProcessReaper); ok {
		ran, err := guard.run(operationCtx, func(ctx context.Context) error { return reaper.ReapRunProcesses(ctx, row.ID) })
		if !ran && err == nil {
			return lost(revoked), nil
		}
		reapErr = err
	}
	if reapErr == nil {
		finalStage = ""
		return AgentWorkspaceRelease{Outcome: agentWorkspaceQuiesced, HeadTokenRevoked: revoked, Detail: kept}, nil
	}
	retireStore, ok := s.q.(agentBoxIdleCapStore)
	if !ok {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: revoked, Detail: kept}, reapErr
	}
	retired, err := s.retireAgentBoxLeased(ctx, guard, retireStore, row, "unreaped", agentBoxHeadVerifyAttempts)
	if errors.Is(err, errAgentBoxLost) {
		return lost(revoked), nil
	}
	if err != nil {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceReleaseFailed, HeadTokenRevoked: revoked, Detail: kept}, err
	}
	if retired {
		return AgentWorkspaceRelease{Outcome: agentWorkspaceRetired, HeadTokenRevoked: true, Detail: kept}, nil
	}
	return AgentWorkspaceRelease{Outcome: agentWorkspaceUnreaped, HeadTokenRevoked: revoked, Detail: "run processes unconfirmed: " + reapErr.Error()}, nil
}

// revokeAgentWorkspaceHeadToken revokes the head token row names (and the
// children credential with it) and reports whether the box holds no live head
// token. It never chases a token swapped in after row was read: that one
// belongs to a turn that joined since. The next start mints a fresh one.
func (s *WorkspaceService) revokeAgentWorkspaceHeadToken(ctx context.Context, row db.Workspace) bool {
	ctx = context.WithoutCancel(ctx)
	s.revokeWorkspaceChildrenToken(ctx, row)
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
	return err == nil && !current.HeadPushTokenID.Valid
}

// stopAgentWorkspaceHosts stops every coding host bound to the box and
// retires the landing and cache credentials it was started with. The run is
// over, so its credentials are retired whether or not the stop succeeds: a
// host still running only fails its next call. A host the runtime did not
// stop is marked so the next release retries the stop; a retry that succeeds
// clears the mark. A stopped host is started afresh, with new credentials, by
// the next turn.
//
// It runs under guard: a host or credential of a turn that took the box over
// shares the binding's id and name, so nothing is stopped or retired once the
// release lost the box (errAgentBoxLost). It answers what it left running,
// for the operator log, or "".
func (s *WorkspaceService) stopAgentWorkspaceHosts(ctx context.Context, row db.Workspace, guard agentBoxGuard) (string, error) {
	store, ok := s.q.(agentWorkspaceReleaseStore)
	if !ok {
		return "", nil
	}
	var kept []string
	ran, err := guard.run(ctx, func(ctx context.Context) error {
		detached := context.WithoutCancel(ctx)
		holders, err := store.ListFlowHostBindingHolders(detached, row.ID)
		if err != nil {
			slog.WarnContext(ctx, "list coding hosts of a released agent workspace failed", "workspace_id", row.ID, "error", err)
			kept = append(kept, "coding hosts unread")
			return nil
		}
		for _, holder := range holders {
			stopErr := s.runtime.StopService(ctx, row.ID, holder.ServiceName)
			stopped := stopErr == nil || errors.Is(stopErr, workspaceapi.ErrWorkspaceNotFound) || errors.Is(stopErr, workspaceapi.ErrWorkspaceStopped)
			s.RetireBoxHostCredential(detached, holder.ID, holder.UserID)
			if !stopped {
				slog.WarnContext(ctx, "stop coding host of a released agent workspace failed; the next release retries it",
					"workspace_id", row.ID, "binding_id", holder.ID, "error", stopErr)
				if err := store.MarkFlowHostStopPending(detached, holder.ID, holder.OwnerGeneration, true); err != nil {
					slog.WarnContext(ctx, "record a pending coding host stop failed", "workspace_id", row.ID, "binding_id", holder.ID, "error", err)
				}
				kept = append(kept, "coding host "+holder.ID+" still running, credentials retired, stop retried on the next release")
				continue
			}
			if holder.StopPending {
				if err := store.MarkFlowHostStopPending(detached, holder.ID, holder.OwnerGeneration, false); err != nil {
					slog.WarnContext(ctx, "clear a pending coding host stop failed", "workspace_id", row.ID, "binding_id", holder.ID, "error", err)
				}
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if !ran {
		return "", errAgentBoxLost
	}
	return strings.Join(kept, "; "), nil
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
