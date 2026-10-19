package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/revocation"
)

// BranchMachineProviders are activation contracts. The install composes them
// on its microVM runtime (InstallBranchMachineProviders); without them every
// machine stays dark. Membership must hold current collaborator authority in
// tx until commit; Authorize consumes the actual stored credential, never the
// machine's database owner. LaneBinding answers for the branch's machine,
// workspaceID, or "" for a machine about to be created: it refuses an item
// branch without its existing lane. MicroVM validates R1–R5; SessionIdentity
// requires distinct non-root/no-sudo execution identities.
type BranchMachineProviders struct {
	Membership      func(context.Context, pgx.Tx, int64, int64) error
	Authorize       func(context.Context, pgx.Tx, string, int64, string, int64) error
	LaneBinding     func(ctx context.Context, tx pgx.Tx, repositoryID int64, branch, workspaceID string) error
	MicroVM         func(context.Context) error
	SessionIdentity func(context.Context) error
}

type stackLaneCreationKey struct{}

// withStackLaneCreation marks the stack service creating one of its own lanes
// (workspaceMythicalLanes.Create). A lane is created before BindMythicalLane
// records it, so no binding exists yet to admit it. Only the stack sets this
// value; no request can.
func withStackLaneCreation(ctx context.Context) context.Context {
	return context.WithValue(ctx, stackLaneCreationKey{}, true)
}

// StackLaneCreation reports whether ctx is the stack service creating a lane.
func StackLaneCreation(ctx context.Context) bool {
	creating, _ := ctx.Value(stackLaneCreationKey{}).(bool)
	return creating
}

func WithBranchMachineProviders(providers BranchMachineProviders) WorkspaceServiceOption {
	return func(s *WorkspaceService) { s.branchMachineProviders = providers }
}

func (s *WorkspaceService) requireBranchMachineProviders() error {
	p := s.branchMachineProviders
	if s.transactions == nil || p.Membership == nil || p.Authorize == nil ||
		p.LaneBinding == nil || p.MicroVM == nil || p.SessionIdentity == nil {
		return pkgerrors.New(pkgerrors.CodeServiceUnavailable, "branch machine providers unavailable")
	}
	return nil
}

// The machine-service identity skips member grants, not runtime qualification.
// Keep this gate common to member admission and internal lifecycle mutations.
func (s *WorkspaceService) requireBranchMachineRuntime(ctx context.Context) error {
	if err := s.requireBranchMachineProviders(); err != nil {
		return err
	}
	if err := s.branchMachineProviders.MicroVM(ctx); err != nil {
		return err
	}
	return s.branchMachineProviders.SessionIdentity(ctx)
}

var errBranchMachineAdmission = errors.New("branch machine admission refused")

func (s *WorkspaceService) authorizeBranchMachine(ctx context.Context, tx pgx.Tx, repositoryID, actorID int64, branch, workspaceID string) (retErr error) {
	defer func() {
		if retErr != nil {
			retErr = fmt.Errorf("%w: %w", errBranchMachineAdmission, retErr)
		}
	}()

	if err := s.requireBranchMachineProviders(); err != nil {
		return err
	}
	// The machine service owns every branch machine and is no member: it
	// cannot sign in, so only the product's own steps (the box's head reporter
	// and coding runtime) act as it.
	// Admission already holds a transaction (and may hold the branch lock).
	// Borrowing another pool connection here can deadlock concurrent joins.
	service, ownerErr := func() (bool, error) {
		if tx != nil {
			return branchMachineOwnerMatches(ctx, db.New(tx), actorID)
		}
		return s.branchMachineOwned(ctx, actorID)
	}()
	if ownerErr == nil && service {
		return s.requireBranchMachineRuntime(ctx)
	}
	p := s.branchMachineProviders
	if err := p.Membership(ctx, tx, repositoryID, actorID); err != nil {
		return err
	}
	if err := p.Authorize(ctx, tx, "branch.join", repositoryID, branch, actorID); err != nil {
		return err
	}
	if workspaceID != "" {
		box, err := s.requireSessionBoxPerson(ctx, tx, workspaceID, actorID)
		if err != nil {
			return err
		}
		if box {
			// A session's box answers to its branch's lane authority.
			workspaceID = ""
		}
	}
	// A join by branch name resolves its existing lane before asking for
	// lane authority. Only the stack's fresh lane creation uses an empty ID.
	if workspaceID == "" && !StackLaneCreation(ctx) && tx != nil {
		var err error
		if workspaceID, err = branchMachineID(ctx, tx, repositoryID, branch); err != nil {
			return err
		}
	}

	if err := p.LaneBinding(ctx, tx, repositoryID, branch, workspaceID); err != nil {
		return err
	}
	return s.requireBranchMachineRuntime(ctx)
}

// Every creation source uses this transaction, including fork, snapshot and
// pushed-ref rows that the legacy active index excludes. The existing runtime
// provisioning lock subsequently owns VM creation for this one durable row.
func (s *WorkspaceService) createBranchMachineRow(ctx context.Context, arg db.CreateWorkspaceParams) (db.Workspace, error) {
	if err := s.requireBranchMachineProviders(); err != nil {
		return db.Workspace{}, err
	}
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return db.Workspace{}, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	actorID := arg.UserID
	branch := targetWorkspaceBookmark(arg.TargetBookmark)
	// Every stack lane works from the stack's bookmark, yet each is its own
	// branch machine: its identity is its lane name, unique to its item and
	// attempt (the lane binding, spec §8.1.2), so a second TODO never joins
	// the first one's machine.
	lane := strings.TrimSpace(arg.Name)
	stackLane := branch == MythicalBookmark && StackLaneCreation(ctx) && lane != ""
	session := UUIDString(arg.AgentSessionID)
	identity := fmt.Sprintf("branch-machine:%d:%s", arg.RepositoryID, branch)
	switch {
	case session != "":
		// An agent session's own box (plue#869): no other session, member or
		// guest ever joins it. Git refuses ":" in a branch name, so no branch
		// spells this key.
		stackLane = false
		identity = fmt.Sprintf("branch-machine:%d:session:%s", arg.RepositoryID, session)
	case stackLane:
		// Git refuses ":" in a branch name, so no branch spells this key.
		identity += ":lane:" + lane
	}
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", identity); err != nil {
		return db.Workspace{}, err
	}
	if err := s.authorizeBranchMachine(ctx, tx, arg.RepositoryID, arg.UserID, branch, ""); err != nil {
		return db.Workspace{}, err
	}
	q := db.New(tx)
	owner, err := q.GetBranchMachineOwner(ctx)
	if err != nil {
		return db.Workspace{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "branch machine owner unavailable").WithCause(err)
	}
	var row db.Workspace
	switch {
	case session != "":
		row, err = sessionBoxWorkspace(ctx, tx, q, arg.RepositoryID, actorID, branch, session)
	case stackLane:
		row, err = stackLaneWorkspace(ctx, tx, q, arg.RepositoryID, lane)
	default:
		row, err = q.GetBranchWorkspace(ctx, db.GetBranchWorkspaceParams{RepositoryID: arg.RepositoryID, TargetBookmark: branch})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		arg.UserID, arg.TargetBookmark, arg.AgentSessionID = owner, branch, pgUUIDFromString(session)
		row, err = q.CreateWorkspace(ctx, arg)
	} else if err == nil {
		row, err = joinBranchMachine(ctx, tx, q, row, arg, owner)
	}
	if err != nil {
		return db.Workspace{}, err
	}
	if err := ensureWorkspaceShare(ctx, q, row, actorID); err != nil {
		return db.Workspace{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Workspace{}, err
	}
	return row, nil
}

// stackLaneWorkspace is the lane's own machine, created earlier under the same
// lock when a crash came between its insert and its binding.
func stackLaneWorkspace(ctx context.Context, tx pgx.Tx, q *db.Queries, repositoryID int64, lane string) (db.Workspace, error) {
	var id string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM workspaces
        WHERE repository_id = $1 AND target_bookmark = $2 AND name = $3
        AND agent_session_id IS NULL AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, repositoryID, MythicalBookmark, lane).Scan(&id); err != nil {
		return db.Workspace{}, err
	}
	return q.GetWorkspace(ctx, id)
}

// branchMachineID is the branch's own machine, never a session's box, or "".
func branchMachineID(ctx context.Context, tx pgx.Tx, repositoryID int64, branch string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `SELECT id::text FROM workspaces
        WHERE repository_id=$1 AND target_bookmark=$2 AND agent_session_id IS NULL AND deleted_at IS NULL`, repositoryID, branch).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// sessionBoxWorkspace is the agent session's own box, or pgx.ErrNoRows before
// its first turn. Only the session's person creates or joins it, on the
// branch and repository the session is bound to.
func sessionBoxWorkspace(ctx context.Context, tx pgx.Tx, q *db.Queries, repositoryID, actorID int64, branch, session string) (db.Workspace, error) {
	var person, sessionRepository int64
	if err := tx.QueryRow(ctx, `SELECT user_id, repository_id FROM agent_sessions
        WHERE id = $1 AND deleted_at IS NULL FOR SHARE`, session).Scan(&person, &sessionRepository); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Workspace{}, pkgerrors.Forbidden("agent session binding denied")
		}
		return db.Workspace{}, err
	}
	if person != actorID || sessionRepository != repositoryID {
		return db.Workspace{}, pkgerrors.Forbidden("agent session binding denied")
	}
	var id string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM workspaces
        WHERE agent_session_id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE`, session).Scan(&id); err != nil {
		return db.Workspace{}, err
	}
	row, err := q.GetWorkspace(ctx, id)
	if err != nil {
		return db.Workspace{}, err
	}
	if row.RepositoryID != repositoryID || row.TargetBookmark != branch {
		return db.Workspace{}, pkgerrors.Forbidden("agent session branch binding denied")
	}
	return row, nil
}

// requireSessionBoxPerson refuses actorID on an agent session's box unless
// it is that session's person; the machine service is admitted before this
// is asked. It reports whether workspaceID is a session's box.
func (s *WorkspaceService) requireSessionBoxPerson(ctx context.Context, tx pgx.Tx, workspaceID string, actorID int64) (bool, error) {
	var box bool
	var person int64
	if tx != nil {
		err := tx.QueryRow(ctx, `SELECT w.agent_session_id IS NOT NULL, COALESCE(a.user_id, 0)
            FROM workspaces w LEFT JOIN agent_sessions a ON a.id = w.agent_session_id
            WHERE w.id::text = $1`, workspaceID).Scan(&box, &person)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
	} else {
		row, err := s.q.GetWorkspace(ctx, workspaceID)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if box = row.AgentSessionID.Valid; box {
			if sessions, ok := s.q.(interface {
				GetAgentSession(context.Context, string) (db.AgentSession, error)
			}); ok {
				if session, err := sessions.GetAgentSession(ctx, UUIDString(row.AgentSessionID)); err == nil {
					person = session.UserID
				}
			}
		}
	}
	if box && (person == 0 || person != actorID) {
		return true, pkgerrors.Forbidden("access denied")
	}
	return box, nil
}

// joinBranchMachine admits this create to the branch's existing machine.
//
// A machine that never had a guest adopts the first size a person asks for.
// Its size is otherwise unreachable: the import provisions the machine itself
// and names no size, so it boots at this deployment's default; DELETE answers
// "machine is retained"; there is no resize route; and after RFD-004 there is
// no second machine to create instead. On a full fleet that is terminal — the
// repository holds a machine nothing can place and its owner cannot ask for
// one that fits. Adopting the size erases nothing: the row has no guest, no
// disk and no session, and a machine that ever booted keeps its size (#3885).
func joinBranchMachine(ctx context.Context, tx pgx.Tx, q *db.Queries, row db.Workspace, arg db.CreateWorkspaceParams, owner int64) (db.Workspace, error) {
	err := branchMachineCompatible(row, arg, owner)
	if err == nil || branchMachineHasGuest(row) || !branchMachineSizeDiffers(row, arg) {
		return row, err
	}
	// Only the size may be adopted. Anything else this machine disagrees
	// with is still the refusal, including a size on a retained machine.
	sized := branchMachineSized(row, arg)
	if other := branchMachineCompatible(sized, arg, owner); other != nil {
		return row, other
	}
	if _, execErr := tx.Exec(ctx, `UPDATE workspaces SET vcpu_count=$2, memory_mb=$3, disk_mb=$4, updated_at=NOW()
        WHERE id=$1 AND vm_id='' AND started_at IS NULL AND deleted_at IS NULL`,
		row.ID, sized.VcpuCount, sized.MemoryMb, sized.DiskMb); execErr != nil {
		return row, execErr
	}
	adopted, getErr := q.GetWorkspace(ctx, row.ID)
	if getErr != nil {
		return row, getErr
	}
	if branchMachineSizeDiffers(adopted, arg) {
		// A guest appeared under us; the machine keeps the size it booted.
		return adopted, err
	}
	return adopted, nil
}

// branchMachineHasGuest is true for a machine a guest was ever created for:
// its id, or any of the stamps a start, resume or suspend leaves. Only such a
// machine can hold a disk a worker retains.
func branchMachineHasGuest(row db.Workspace) bool {
	return strings.TrimSpace(row.VmID) != "" || row.StartedAt.Valid || row.ResumedAt.Valid || row.SuspendedAt.Valid
}

// branchMachineSized is row at the size this create names; a field the create
// leaves unnamed keeps the machine's own.
func branchMachineSized(row db.Workspace, arg db.CreateWorkspaceParams) db.Workspace {
	if arg.VcpuCount.Valid {
		row.VcpuCount = arg.VcpuCount
	}
	if arg.MemoryMb.Valid {
		row.MemoryMb = arg.MemoryMb
	}
	if arg.DiskMb.Valid {
		row.DiskMb = arg.DiskMb
	}
	return row
}

func branchMachineSizeDiffers(row db.Workspace, arg db.CreateWorkspaceParams) bool {
	return arg.VcpuCount.Valid && arg.VcpuCount != row.VcpuCount ||
		arg.MemoryMb.Valid && arg.MemoryMb != row.MemoryMb ||
		arg.DiskMb.Valid && arg.DiskMb != row.DiskMb
}

// branchMachineRetainedMessage is the one refusal a machine the branch retains
// answers, for a failed provision and for a stop alike.
const branchMachineRetainedMessage = "branch machine is retained; recover it before joining"

// errBranchMachineRetainedFailure marks that refusal when the retained machine
// is a failed provision rather than a stopped one. A stop is the owner's own
// action and its machine can still be started; a failure cannot be joined,
// replaced or deleted, which is the difference a dispatch reports.
var errBranchMachineRetainedFailure = errors.New("branch machine retained after a failed provision")

// errBranchMachineStopped marks the same refusal when the retained machine is
// stopped rather than a failed provision. A stop is the one retained state its
// owner can undo, so a dispatch names the start instead of a retry the join
// refuses for as long as the row is stopped.
var errBranchMachineStopped = errors.New("branch machine retained while stopped")

func branchMachineCompatible(row db.Workspace, arg db.CreateWorkspaceParams, owner int64) error {
	if row.RebuildRequiredAt.Valid {
		return pkgerrors.New(pkgerrors.CodeWorkspaceRebuildRequired, "branch machine requires rebuild")
	}
	if row.UserID != owner {
		return pkgerrors.Conflict("branch machine owner requires migration")
	}
	if row.Status == "failed" {
		// A retained failure refuses every later join, and GetBranchWorkspace
		// returns it on purpose ("none permit replacement"), so the refusal is
		// permanent: resume answers its own "create a fresh workspace"
		// conflict and DELETE answers "machine is retained". The sentinel is
		// what the agent dispatch classifies on, so a turn stops promising a
		// retry that cannot work (#3890's rule). The HTTP shape is unchanged.
		return fmt.Errorf("%w: %w", errBranchMachineRetainedFailure,
			pkgerrors.Conflict(branchMachineRetainedMessage))
	}
	if row.Status == "stopped" {
		// Also permanent for a retry: the join is refused for as long as the
		// row is stopped, so the dispatch never reaches the wake that would
		// have started the machine. Starting it is what makes the next turn
		// join, and that is what the sentinel lets a dispatch say.
		return fmt.Errorf("%w: %w", errBranchMachineStopped,
			pkgerrors.Conflict(branchMachineRetainedMessage))
	}
	if arg.SourceCommit != "" && arg.SourceCommit != row.SourceCommit ||
		arg.SourceSnapshotID.Valid && arg.SourceSnapshotID != row.SourceSnapshotID ||
		arg.ParentWorkspaceID.Valid && arg.ParentWorkspaceID != row.ParentWorkspaceID ||
		arg.ForkedFromItem.Valid && arg.ForkedFromItem != row.ForkedFromItem ||
		arg.ForkedFromBase != "" && arg.ForkedFromBase != row.ForkedFromBase {
		return pkgerrors.Conflict("branch already has a different machine source")
	}
	if branchMachineSizeDiffers(row, arg) {
		return pkgerrors.Conflict("branch already has different machine resources")
	}
	return nil
}

// Restored workspace-share producer, adapted from a73a77de36. Current member
// authority is locked by authorizeBranchMachine in the enclosing transaction.
func ensureWorkspaceShare(ctx context.Context, q *db.Queries, row db.Workspace, actorID int64) error {
	if actorID == row.UserID {
		return nil
	}
	share, err := q.GetWorkspaceShare(ctx, db.GetWorkspaceShareParams{WorkspaceID: row.ID, GranteeUserID: actorID})
	if err == nil && share.OwnerUserID == row.UserID && share.Level == string(WorkspaceAccessWrite) {
		return nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	_, err = q.UpsertWorkspaceShare(ctx, db.UpsertWorkspaceShareParams{
		WorkspaceID: row.ID, OwnerUserID: row.UserID, GranteeUserID: actorID, Level: string(WorkspaceAccessWrite),
	})
	return err
}

func (s *WorkspaceService) attachBranchMachineSession(ctx context.Context, workspaceID string, input CreateAgentWorkspaceInput) error {
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	q := db.New(tx)
	row, err := q.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	if row.RepositoryID != input.RepositoryID {
		return pkgerrors.Forbidden("agent session repository binding denied")
	}
	// A session binds only its own box (plue#869).
	if !row.AgentSessionID.Valid || row.AgentSessionID != pgUUIDFromString(input.SessionID) {
		return pkgerrors.Forbidden("agent session binding denied")
	}
	if err := s.authorizeBranchMachine(ctx, tx, row.RepositoryID, input.UserID, row.TargetBookmark, row.ID); err != nil {
		return err
	}
	// No cross-session or cross-repository fallback. A session rebinds only
	// from a box that no longer exists to its own.
	result, err := tx.Exec(ctx, `UPDATE agent_sessions SET workspace_id=$1, updated_at=NOW()
        WHERE id=$2 AND repository_id=$3 AND user_id=$4 AND deleted_at IS NULL AND status='active'
        AND (workspace_id IS NULL OR workspace_id=$1 OR NOT EXISTS (SELECT 1 FROM workspaces o
            WHERE o.id=agent_sessions.workspace_id AND o.deleted_at IS NULL))`,
		pgUUIDFromString(workspaceID), pgUUIDFromString(input.SessionID), row.RepositoryID, input.UserID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return pkgerrors.Forbidden("agent session binding denied")
	}
	return tx.Commit(ctx)
}

// Existing hosted/mocked legacy rows are not branch machines. The service
// identity is read from the migrated database, never inferred from request IDs.
type branchMachineOwnerStore interface {
	GetBranchMachineOwner(context.Context) (int64, error)
}

func (s *WorkspaceService) branchMachineOwned(ctx context.Context, ownerID int64) (bool, error) {
	store, ok := s.q.(branchMachineOwnerStore)
	if !ok {
		if s.branchMachineProviders.Membership != nil {
			return false, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "branch machine owner store unavailable")
		}
		return false, nil
	}
	return branchMachineOwnerMatches(ctx, store, ownerID)
}

func branchMachineOwnerMatches(ctx context.Context, store branchMachineOwnerStore, ownerID int64) (bool, error) {
	owner, err := store.GetBranchMachineOwner(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return owner == ownerID, err
}

// preflightBranchMachine authorizes actorID on branch's machine, workspaceID,
// or "" before the machine exists.
func (s *WorkspaceService) preflightBranchMachine(ctx context.Context, repositoryID, actorID int64, branch, workspaceID string) error {
	if err := s.requireBranchMachineProviders(); err != nil {
		return err
	}
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	return s.authorizeBranchMachine(ctx, tx, repositoryID, actorID, branch, workspaceID)
}

func (s *WorkspaceService) withBranchMachineMutation(ctx context.Context, row db.Workspace, actorID int64, fn func(context.Context) error) error {
	if err := s.requireBranchMachineProviders(); err != nil {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
	}
	authority := workspaceMutationAuthority{workspaceID: row.ID, userID: actorID}
	if held, ok := ctx.Value(workspaceMutationAuthorityKey{}).(workspaceMutationAuthority); ok && held == authority {
		return fn(ctx)
	}
	// The machine service mutates its own machine without a member's share.
	if owned, err := s.branchMachineOwned(ctx, actorID); err != nil {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
	} else if owned && actorID == row.UserID {
		if err := s.requireBranchMachineRuntime(ctx); err != nil {
			return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
		}
		return fn(ctx)
	}
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if err := s.authorizeBranchMachine(ctx, tx, row.RepositoryID, actorID, row.TargetBookmark, row.ID); err != nil {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
	}
	level, err := db.New(tx).LockWorkspaceShareForMutation(ctx, db.LockWorkspaceShareForMutationParams{WorkspaceID: row.ID, GranteeUserID: actorID})
	if errors.Is(err, pgx.ErrNoRows) || err == nil && level != string(WorkspaceAccessWrite) {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, pkgerrors.Forbidden("access denied"))
	}
	if err != nil {
		return fmt.Errorf("%w: %w", errBranchMachineAdmission, err)
	}
	return commitWorkspaceMutation(ctx, tx, authority, fn)
}

// RevokeBranchMachineShare composes with T-ACC-02's authorized member-removal
// transaction. The caller holds the collaborator's removal lock in this same
// tx. Deleting the share waits for the existing mutation grant lock; durable
// revocation and NOTIFY become visible only when the caller commits.
func RevokeBranchMachineShare(ctx context.Context, tx pgx.Tx, workspaceID string, memberID int64) error {
	q := db.New(tx)
	row, err := q.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	owner, err := q.GetBranchMachineOwner(ctx)
	if err != nil {
		return err
	}
	if row.UserID != owner {
		return pkgerrors.Conflict("workspace is not a branch machine")
	}
	return revokeWorkspaceShare(ctx, q, row, memberID)
}

func revokeWorkspaceShare(ctx context.Context, q *db.Queries, row db.Workspace, memberID int64) error {
	if err := q.DeleteWorkspaceShare(ctx, db.DeleteWorkspaceShareParams{WorkspaceID: row.ID, GranteeUserID: memberID}); err != nil {
		return err
	}
	return publishWorkspaceShareRevocation(ctx, q, row, memberID)
}

func publishWorkspaceShareRevocation(ctx context.Context, q *db.Queries, row db.Workspace, memberID int64) error {
	event := revocation.Event{Kind: revocation.KindWorkspaceShareRemoved, UserID: memberID, WorkspaceID: row.ID, Reason: "workspace share removed"}
	if row.VmID != "" {
		event.SandboxIDs = []string{row.VmID}
	}
	return revocation.NewTransactionalDBPublisher(q).Publish(ctx, event)
}

func (s *WorkspaceService) validateBranchMachineSession(ctx context.Context, input CreateAgentWorkspaceInput) error {
	tx, err := s.transactions.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	session, err := db.New(tx).GetAgentSession(ctx, input.SessionID)
	if err != nil {
		return pkgerrors.Forbidden("agent session binding denied")
	}
	if session.RepositoryID != input.RepositoryID || session.UserID != input.UserID || session.Status != "active" {
		return pkgerrors.Forbidden("agent session binding denied")
	}
	if session.WorkspaceID.Valid {
		row, err := db.New(tx).GetWorkspace(ctx, UUIDString(session.WorkspaceID))
		if errors.Is(err, pgx.ErrNoRows) {
			// Its box is gone; the turn creates the session's next one.
			return nil
		}
		if err != nil {
			return err
		}
		bookmark, _, err := resolveWorkspaceBookmark(ctx, db.New(tx), input.RepositoryID, input.SourceBookmark)
		if err != nil {
			return err
		}
		if row.TargetBookmark != bookmark {
			return pkgerrors.Forbidden("agent session branch binding denied")
		}
	}
	return nil
}
