package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

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
	agents *AgentService
	pulls  *LandingGitHubPullService
	pool   *pgxpool.Pool
}

// NewAgentSessionLandingService uses the same landing service as POST /landings.
func NewAgentSessionLandingService(agents *AgentService, pulls *LandingGitHubPullService, pool *pgxpool.Pool) *AgentSessionLandingService {
	return &AgentSessionLandingService{agents: agents, pulls: pulls, pool: pool}
}

// Open requires a person and their push access, and pins both landing and PR
// to the host's recorded head. Session serialization also covers concurrent
// callers and retries after a successful GitHub write but lost HTTP response.
func (s *AgentSessionLandingService) Open(ctx context.Context, actor *db.User, owner, repo, sessionID string, replyID *int64) (SessionLanding, error) {
	refuse := func(code pkgerrors.Code, msg string) (SessionLanding, error) {
		return SessionLanding{}, pkgerrors.New(code, msg)
	}
	if middleware.AgentTokenFromContext(ctx) != "" || actsAsAgent(ctx, actor) {
		return refuse(pkgerrors.CodeAgentCredentialRefused, "Only a person can open this pull request")
	}
	if actor == nil {
		return refuse(pkgerrors.CodeSignInRequired, "Sign in to open a pull request")
	}
	if actor.UserType == "guest" {
		return refuse(pkgerrors.CodeGuestRefused, "Sign in to open a pull request")
	}
	if s == nil || s.pool == nil || s.agents == nil || s.pulls == nil || s.pulls.landings == nil {
		return SessionLanding{}, pkgerrors.Internal("session landing unavailable")
	}
	landings := s.pulls.landings
	repository, err := landings.resolveRepoByOwnerAndName(ctx, owner, repo)
	if err != nil {
		return SessionLanding{}, err
	}
	if err = landings.requireWriteAccess(ctx, repository, actor); err != nil {
		return refuse(pkgerrors.CodePushPermissionRequired, "Repository push access is required")
	}
	session, err := s.agents.q.GetAgentSession(ctx, sessionID)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && session.RepositoryID != repository.ID {
		return refuse(pkgerrors.CodeSessionNotFound, "Session not found")
	}
	if err != nil {
		return SessionLanding{}, pkgerrors.Internal("read session").WithCause(err)
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
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SessionLanding{}, pkgerrors.Internal("lock session landing").WithCause(err)
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "session-landing:"+sessionID); err != nil {
		return SessionLanding{}, pkgerrors.Internal("lock session landing").WithCause(err)
	}
	var number int64
	err = tx.QueryRow(ctx, `SELECT number FROM landing_requests WHERE repository_id=$1 AND author_agent_session_id=$2 ORDER BY number DESC LIMIT 1`, repository.ID, sessionID).Scan(&number)
	existed := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SessionLanding{}, pkgerrors.Internal("read session landing").WithCause(err)
	}
	if existed {
		pull, err := s.pulls.github.Find(ctx, remotes.token, remotes.githubOwner, remotes.githubRepo, LandingGitHubPullBranch(number))
		if err != nil {
			return SessionLanding{}, err
		}
		if pull != nil {
			if pull.Head.Ref != LandingGitHubPullBranch(number) {
				return SessionLanding{}, pkgerrors.Conflict("The pull request branch changed")
			}
			var raw []byte
			err = tx.QueryRow(ctx, `SELECT content FROM agent_parts WHERE repository_id=$1 AND session_id=$2 AND part_type='coding_result' AND content->>'head_commit'=$3 ORDER BY message_id DESC, part_index DESC LIMIT 1`, repository.ID, sessionID, pull.Head.SHA).Scan(&raw)
			var original CodingResult
			if err != nil {
				return SessionLanding{}, pkgerrors.Internal("read landed coding result").WithCause(err)
			}
			if err = json.Unmarshal(raw, &original); err != nil {
				return SessionLanding{}, pkgerrors.Internal("decode landed coding result").WithCause(err)
			}
			response := SessionLanding{LandingNumber: number, Branch: pull.Head.Ref, PullNumber: pull.Number, PullURL: pull.HTMLURL, HeadCommit: pull.Head.SHA, Tested: original.Tested(), Passed: original.Passed()}
			refusal := pkgerrors.New(pkgerrors.CodeAlreadyLanded, fmt.Sprintf("Pull request #%d already exists", pull.Number))
			refusal.Details = response
			return response, refusal
		}
	}
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
	if !existed {
		head, err := landings.repoHost.GetChange(ctx, owner, repo, *result.HeadChangeID)
		if err != nil {
			return SessionLanding{}, mapLandingRepoHostError(err, "read turn head")
		}
		if head.CommitID != *result.HeadCommit {
			return refuse(pkgerrors.CodeHeadReceiptMismatch, "The recorded change no longer matches the turn head")
		}
		target := repository.DefaultBookmark
		if target == "" {
			target = "main"
		}
		createCtx := context.WithValue(ctx, sessionLandingSourceKey{}, sessionLandingSource{sessionID: sessionID, workspaceID: UUIDString(session.WorkspaceID)})
		landing, err := landings.CreateLandingRequest(createCtx, actor, owner, repo, CreateLandingRequestInput{Title: session.Title, TargetBookmark: target, ChangeIDs: []string{*result.HeadChangeID}})
		if err != nil {
			return SessionLanding{}, err
		}
		number = landing.Number
	}
	// TODO(lane B3): compose from this session's coding_result, using exactly:
	// `<command>` exited 0 · <tests_run> tests passed at <commit[:12]>
	// `<command>` exited <exit_code> · <tests_run> tests at <commit[:12]>
	// `<command>` exited <exit_code> at <commit[:12]>
	// <command> ran 0 tests
	// Tests not run at this commit
	runID := ""
	if session.WorkflowRunID.Valid {
		runID = strconv.FormatInt(session.WorkflowRunID.Int64, 10)
	}
	pull, err := s.pulls.OpenLandingGitHubPull(ctx, actor, owner, repo, number, LandingGitHubPullInput{CommitID: *result.HeadCommit, RunID: runID})
	if err != nil {
		return SessionLanding{}, err
	}
	response := SessionLanding{LandingNumber: number, Branch: pull.HeadRef, PullNumber: pull.Number, PullURL: pull.URL, HeadCommit: *result.HeadCommit, Tested: result.Tested(), Passed: result.Passed()}
	if err = tx.Commit(ctx); err != nil {
		return SessionLanding{}, pkgerrors.Internal("finish session landing").WithCause(err)
	}
	if existed && !pull.Created {
		refusal := pkgerrors.New(pkgerrors.CodeAlreadyLanded, fmt.Sprintf("Pull request #%d already exists", pull.Number))
		refusal.Details = response
		return response, refusal
	}
	return response, nil
}
