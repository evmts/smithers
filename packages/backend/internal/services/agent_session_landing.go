package services

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// The existing idempotent create identity pins the exact reply, including
// retries after local creation succeeds but the GitHub call fails.
func sessionLandingRequestID(sessionID string, replyID int64) string {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(fmt.Sprintf("session-landing:%s:%d", sessionID, replyID))).String()
}

type sessionLandingSourceKey struct{}
type sessionLandingSource struct{ sessionID, workspaceID string }

// SessionLanding is the pull request for a session's immutable turn head.
type SessionLanding struct {
	LandingNumber int64  `json:"landing_number"`
	Branch        string `json:"branch"`
	PullNumber    int64  `json:"pull_number"`
	PullURL       string `json:"pull_url"`
	HeadCommit    string `json:"head_commit"`
	Tested        bool   `json:"tested"`
	Passed        bool   `json:"passed"`
}

// AgentSessionLandingService connects durable turn receipts to the existing
// landing and GitHub pull services. It never merges or writes main.
type AgentSessionLandingService struct {
	agents    *AgentService
	pulls     *LandingGitHubPullService
	pool      *pgxpool.Pool
	lockSlots chan struct{}
}

// NewAgentSessionLandingService uses the same landing service as POST /landings.
func NewAgentSessionLandingService(agents *AgentService, pulls *LandingGitHubPullService, pool *pgxpool.Pool) *AgentSessionLandingService {
	service := &AgentSessionLandingService{agents: agents, pulls: pulls, pool: pool}
	// This service is process-local. Reserve at least one connection for the
	// landing services' own pool work; the advisory lock still serializes a
	// session across processes. A single-connection pool cannot serve landings.
	if pool != nil && pool.Config().MaxConns > 1 {
		service.lockSlots = make(chan struct{}, int(pool.Config().MaxConns)-1)
	}
	return service
}

// Open requires a person and their push access, and pins both landing and PR
// to the host's recorded head. Session serialization also covers concurrent
// callers and retries after a successful GitHub write but lost HTTP response.
func (s *AgentSessionLandingService) Open(ctx context.Context, actor *db.User, owner, repo, sessionID string, replyID *int64) (SessionLanding, error) {
	refuse := func(code pkgerrors.Code, msg string) (SessionLanding, error) {
		return SessionLanding{}, pkgerrors.New(code, msg)
	}
	if middleware.IsAgentCredential(ctx, actor) {
		return refuse(pkgerrors.CodeAgentCredentialRefused, "Only a person can open this pull request")
	}
	if actor == nil {
		return refuse(pkgerrors.CodeSignInRequired, "Sign in to open a pull request")
	}
	if actor.UserType == "guest" {
		return refuse(pkgerrors.CodeGuestRefused, "Sign in to open a pull request")
	}
	info := middleware.AuthInfoFromContext(ctx)
	if info != nil && info.IsTokenAuth && !info.Scopes.Has(middleware.ScopeWriteRepository) {
		return refuse(pkgerrors.CodePushPermissionRequired, "Repository write scope is required")
	}

	if s == nil || s.pool == nil || s.agents == nil || s.pulls == nil || s.pulls.landings == nil {
		return SessionLanding{}, pkgerrors.Internal("session landing unavailable")
	}
	landings := s.pulls.landings
	repository, err := landings.resolveRepoByOwnerAndName(ctx, owner, repo)
	if err != nil {
		return SessionLanding{}, err
	}
	if info != nil && info.RepositoryRestriction() != 0 && info.RepositoryRestriction() != repository.ID {
		return refuse(pkgerrors.CodePushPermissionRequired, "The credential is restricted to another repository")
	}
	if err = landings.requireWriteAccess(ctx, repository, actor); err != nil {
		var api *pkgerrors.APIError
		if errors.As(err, &api) && api.Status == 403 {
			return refuse(pkgerrors.CodePushPermissionRequired, "Repository push access is required")
		}
		return SessionLanding{}, err
	}
	parsedID, err := uuid.Parse(sessionID)
	if err != nil {
		return refuse(pkgerrors.CodeSessionNotFound, "Session not found")
	}
	sessionID = parsedID.String()
	session, err := s.agents.q.GetAgentSession(ctx, sessionID)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && session.RepositoryID != repository.ID {
		return refuse(pkgerrors.CodeSessionNotFound, "Session not found")
	}
	if err != nil {
		return SessionLanding{}, pkgerrors.Internal("read session").WithCause(err)
	}
	if session.UserID != actor.ID {
		return refuse(pkgerrors.CodeSessionNotFound, "Session not found")
	}
	// Prove GitHub push permission before creating even a local landing. The
	// existing pull service repeats proof before any GitHub write.
	remotes, err := s.pulls.remotes(ctx, actor, repository, owner, repo)
	if err != nil {
		var api *pkgerrors.APIError
		if errors.As(err, &api) && api.Status == 403 {
			return refuse(pkgerrors.CodePushPermissionRequired, "Repository push access is required")
		}
		return SessionLanding{}, err
	}
	defer remotes.close()
	lockConn, err := s.lockSession(ctx, sessionID)
	if err != nil {
		return SessionLanding{}, pkgerrors.Internal("lock session landing").WithCause(err)
	}
	defer s.unlockSession(sessionID, lockConn)
	result, err := s.agents.LatestCodingResult(ctx, repository.ID, sessionID, replyID)
	if errors.Is(err, ErrNoCodingResult) {
		return refuse(pkgerrors.CodeNoCodingResult, "No coding result")
	}
	if err != nil {
		return SessionLanding{}, pkgerrors.Internal("read coding result").WithCause(err)
	}
	if result.HeadCommit == nil || result.HeadChangeID == nil || *result.HeadChangeID == "" || !immutableLandingCommit(*result.HeadCommit) {
		return refuse(pkgerrors.CodeNoTurnHead, "No turn head")
	}
	if result.TestReceipt != nil && !result.Tested() {
		return refuse(pkgerrors.CodeHeadReceiptMismatch, "The test receipt does not match the turn head")
	}
	target := repository.DefaultBookmark
	if target == "" {
		target = "main"
	}
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = "Coding change"
	}
	snapshot := &sessionPullSnapshot{title: title, body: CodingResultSummary(result), target: target, changeID: *result.HeadChangeID}
	var landingID, number int64
	var storedTarget string
	err = lockConn.QueryRow(ctx, `SELECT id, number, target_bookmark FROM landing_requests WHERE repository_id=$1 AND request_id=$2::uuid`, repository.ID, sessionLandingRequestID(sessionID, result.ReplyID)).Scan(&landingID, &number, &storedTarget)
	existed := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SessionLanding{}, pkgerrors.Internal("read session landing").WithCause(err)
	}
	if existed && storedTarget != target {
		return refuse(pkgerrors.CodeHeadReceiptMismatch, "The landing no longer matches the approved turn")
	}
	head, err := landings.repoHost.GetChange(ctx, owner, repo, *result.HeadChangeID)
	if err != nil {
		return SessionLanding{}, mapLandingRepoHostError(err, "read turn head")
	}
	if head.CommitID != *result.HeadCommit {
		return refuse(pkgerrors.CodeHeadReceiptMismatch, "The recorded change no longer matches the turn head")
	}
	if existed {
		pull, err := s.pulls.github.Find(ctx, remotes.token, remotes.githubOwner, remotes.githubRepo, LandingGitHubPullBranch(number))
		if err != nil {
			return SessionLanding{}, err
		}
		if pull != nil {
			if pull.Head.Ref != LandingGitHubPullBranch(number) || pull.Head.SHA != *result.HeadCommit {
				return refuse(pkgerrors.CodeHeadReceiptMismatch, "The pull request no longer matches the turn head")
			}
			response := SessionLanding{LandingNumber: number, Branch: pull.Head.Ref, PullNumber: pull.Number, PullURL: pull.HTMLURL, HeadCommit: pull.Head.SHA, Tested: result.Tested(), Passed: result.Passed()}
			refusal := pkgerrors.New(pkgerrors.CodeAlreadyLanded, fmt.Sprintf("Pull request #%d already exists", pull.Number))
			refusal.Details = response
			return response, refusal
		}
		if session.WorkspaceID.Valid {
			var recorded bool
			if err := lockConn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM landing_source_workspaces WHERE landing_request_id=$1)`, landingID).Scan(&recorded); err != nil {
				return SessionLanding{}, pkgerrors.Internal("read landing provenance").WithCause(err)
			}
			if !recorded {
				return SessionLanding{}, pkgerrors.Internal("landing source is unavailable")
			}
		}
	}
	if !existed {
		createCtx := context.WithValue(ctx, sessionLandingSourceKey{}, sessionLandingSource{sessionID: sessionID, workspaceID: UUIDString(session.WorkspaceID)})
		landing, err := landings.CreateLandingRequest(createCtx, actor, owner, repo, CreateLandingRequestInput{RequestID: sessionLandingRequestID(sessionID, result.ReplyID), Title: title, TargetBookmark: target, ChangeIDs: []string{*result.HeadChangeID}})
		if err != nil {
			return SessionLanding{}, err
		}
		number = landing.Number
	}
	runID := ""
	if session.WorkflowRunID.Valid {
		runID = strconv.FormatInt(session.WorkflowRunID.Int64, 10)
	}
	pull, err := s.pulls.OpenLandingGitHubPull(ctx, actor, owner, repo, number, LandingGitHubPullInput{CommitID: *result.HeadCommit, RunID: runID, approved: snapshot})
	if err != nil {
		var api *pkgerrors.APIError
		if errors.As(err, &api) && errors.Is(api.Cause(), errLandingGitHubHeadMismatch) {
			return refuse(pkgerrors.CodeHeadReceiptMismatch, "The published head no longer matches the turn head")
		}
		return SessionLanding{}, err
	}
	response := SessionLanding{LandingNumber: number, Branch: pull.HeadRef, PullNumber: pull.Number, PullURL: pull.URL, HeadCommit: *result.HeadCommit, Tested: result.Tested(), Passed: result.Passed()}
	if existed && !pull.Created {
		refusal := pkgerrors.New(pkgerrors.CodeAlreadyLanded, fmt.Sprintf("Pull request #%d already exists", pull.Number))
		refusal.Details = response
		return response, refusal
	}
	return response, nil
}

// Each process bounds lock holders below MaxConns. Waiters release their
// connection between attempts, leaving capacity for the winner's pool work.
// Use a session advisory lock, not a transaction: no transaction remains open
// across repo-host or GitHub network calls.
func (s *AgentSessionLandingService) lockSession(ctx context.Context, sessionID string) (*pgxpool.Conn, error) {
	if s.lockSlots == nil {
		return nil, fmt.Errorf("session landing requires at least two pool connections")
	}
	select {
	case s.lockSlots <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	success := false
	defer func() {
		if !success {
			<-s.lockSlots
		}
	}()
	for {
		conn, err := s.pool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		var locked bool
		err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, "session-landing:"+sessionID).Scan(&locked)
		if err == nil && locked {
			success = true
			return conn, nil
		}
		// On an uncertain query outcome, never return a possibly locked
		// connection to the pool. Closing it releases any advisory lock.
		if err != nil {
			_ = conn.Conn().Close(context.Background())
		}
		conn.Release()
		if err != nil {
			return nil, err
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (s *AgentSessionLandingService) unlockSession(sessionID string, conn *pgxpool.Conn) {
	// Request cancellation must not strand a session lock in the pool.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var unlocked bool
	err := conn.QueryRow(ctx, `SELECT pg_advisory_unlock(hashtextextended($1,0))`, "session-landing:"+sessionID).Scan(&unlocked)
	if err != nil || !unlocked {
		_ = conn.Conn().Close(ctx)
	}
	conn.Release()
	<-s.lockSlots
}
