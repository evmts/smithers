package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	stdErrors "errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
 * One person's review verdict on one GitHub pull request (#4038).
 *
 * The read side of an imported pull request already runs on the caller's own
 * GitHub credential (github_repo_metadata.go). A review is the same identity
 * question with an effect: GitHub attributes a review to the token that
 * submitted it, so the person's own credential is the ONLY one that can carry
 * a person's verdict. Nothing on this wire names an actor — there is no field
 * an agent could set to submit someone else's approval.
 *
 * It is a DURABLE operation, not an inline request, for the reason every
 * external write on this service is (github_user_repo_create.go): the
 * acknowledgment must not be the proof, and one human intent must reach
 * GitHub at most once. A review carries no idempotency key of GitHub's own,
 * so the fence is ours:
 *
 *   - the request id is derived from the ACTOR and the INTENT (account,
 *     GitHub identity, repository, number, verdict, text, reviewed head), so
 *     pressing the verdict again — after a lost acknowledgment, a browser
 *     reload or a server restart — joins that ONE operation and reads it
 *     instead of opening a second POST.
 *   - the attempt is committed BEFORE the POST leaves (lease.StartExternal),
 *     so a lost reply is an uncertain attempt rather than an invisible one.
 *   - EffectUnsafe: an attempt whose fate is unknown settles terminal
 *     `uncertain` and is NEVER reclaimed, so no second review can follow it.
 *     Only a refusal GitHub gave BEFORE it could record anything reopens the
 *     key for another press.
 *
 * Four facts are established before the write, and one after it:
 *
 *   1. The account's linked GitHub identity is still the one that asked, and
 *      GitHub's own `GET /user` agrees — that is the credential identity the
 *      readback is allowed to believe.
 *   2. The pull request is the subject the caller named: its own `number`
 *      answers back, and the repository is the one in the operation.
 *   3. It is still open. GitHub accepts a review on a merged or closed pull
 *      request; a person who typed a verdict against an open one did not ask
 *      for that.
 *   4. Its head is the head the person REVIEWED — the head the card they
 *      acted from was showing, carried in the intent. A review that silently
 *      lands on a force-pushed head approves code nobody read, so a moved
 *      head is a refusal before the send, not a retargeting.
 *   5. AFTER the write, the recorded review is bound to THIS intent — and the
 *      binding starts from ATTRIBUTION, not from resemblance:
 *
 *        - the ONLY thing that says a review belongs to this attempt is a
 *          review id THIS operation's own POST receipted. GitHub hands that
 *          id back in its answer to this request and nowhere else.
 *        - a receipted id is then READ BACK BY ID
 *          (`GET …/pulls/{n}/reviews/{id}`), and the STORED review must carry
 *          this operation's id, body, head, verdict and credential identity.
 *          A create whose own answer cannot be read again, or reads back as
 *          something else, is unverified — never a success.
 *        - when no id was receipted, there is NO attribution evidence and the
 *          operation settles `uncertain`. GitHub's history cannot supply it:
 *          fields, age and id ordering all fail the same way. A different
 *          client signed in as the SAME person can record a byte-identical
 *          review — same body, same head, same verdict — between any read
 *          this operation makes and its own POST, so a matching row with an
 *          id above any pre-write maximum is still somebody else's act. The
 *          chronological list GitHub documents is an ORDERING, not an
 *          attribution guarantee, and GitHub offers reviews no idempotency
 *          key. Unknown therefore stays unknown, and is never resent.
 */

// GitHubUserPullReviewOperation is the durable operation one review runs as.
const GitHubUserPullReviewOperation = "github.user.pull.review"

// The three verdicts the product offers, and the review state GitHub records
// for each ("Create a review for a pull request", REST v3).
var githubPullReviewStates = map[string]string{
	"APPROVE":         "APPROVED",
	"REQUEST_CHANGES": "CHANGES_REQUESTED",
	"COMMENT":         "COMMENTED",
}

const (
	// githubPullReviewMaxBody is GitHub's own review body ceiling.
	githubPullReviewMaxBody = 65536
	// githubPullReviewGenerations bounds how many refused attempts one intent
	// may leave behind.
	githubPullReviewGenerations = 32
)

// The stage a receipt reports. Stages name where an attempt stood, with no
// credential, payload, URL, header or upstream prose in them.
const (
	githubPullReviewStageActor    = "resolve-actor"
	githubPullReviewStageFence    = "fence"
	githubPullReviewStageSubmit   = "submit"
	githubPullReviewStageReadback = "readback"
)

// The closed set of reasons one review can refuse with. Each names a
// different act for the reader; none carries GitHub's own words.
const (
	// GitHubPullReviewCodeReauthorize: the linked GitHub credential cannot
	// write. The person re-links GitHub; no scope is widened server-side.
	GitHubPullReviewCodeReauthorize = "reauthorize_github"
	// GitHubPullReviewCodePermission: GitHub refused this credential the
	// pull request or the review.
	GitHubPullReviewCodePermission = "github_permission"
	// GitHubPullReviewCodeActorChanged: the account's GitHub identity is no
	// longer the one that asked.
	GitHubPullReviewCodeActorChanged = "actor_changed"
	// GitHubPullReviewCodeHeadMoved: the pull request moved off the head the
	// person reviewed. Nothing was submitted; the person re-reads it.
	GitHubPullReviewCodeHeadMoved = "review_head_moved"
	// GitHubPullReviewCodeNotOpen: the pull request is merged or closed.
	GitHubPullReviewCodeNotOpen = "pull_request_not_open"
	// GitHubPullReviewCodeSubjectMismatch: GitHub answered with another
	// pull request than the one the operation names.
	GitHubPullReviewCodeSubjectMismatch = "pull_request_mismatch"
	// GitHubPullReviewCodeRejected: GitHub's own rules refused the review
	// (approving your own pull request, for instance). Nothing was recorded.
	GitHubPullReviewCodeRejected = "github_rejected_review"
	// GitHubPullReviewCodeRateLimited: GitHub's limiter answered before it
	// recorded anything.
	GitHubPullReviewCodeRateLimited = "rate_limited"
	// GitHubPullReviewCodeInvalid: the admitted request cannot be run.
	GitHubPullReviewCodeInvalid = "invalid_request"
	// GitHubPullReviewCodeUncertain is what an unsafe operation records when
	// the POST's fate is unknown. It is never a retry.
	GitHubPullReviewCodeUncertain = "github_review_uncertain"
	// GitHubPullReviewCodeReadbackMismatch: the review GitHub answered is not
	// this operation's intent. The POST may have recorded something, so the
	// only honest outcome is uncertain.
	GitHubPullReviewCodeReadbackMismatch = "readback_mismatch"
)

/*
 * githubPullReviewProvedAbsent is the closed set of refusals recorded only
 * where GitHub itself proved nothing was recorded: it answered BEFORE the
 * review left (a refused credential, an actor that changed, a moved head, a
 * closed pull request, another subject, GitHub's own validation, a rate
 * limit, an unrunnable intent). A repeat press may open a new generation of
 * the key for exactly these, and for nothing else. Any other terminal state
 * — uncertain, completed, or a failure whose code is not listed here — is
 * JOINED and read, never repeated.
 */
var githubPullReviewProvedAbsent = map[string]bool{
	GitHubPullReviewCodeReauthorize:     true,
	GitHubPullReviewCodePermission:      true,
	GitHubPullReviewCodeActorChanged:    true,
	GitHubPullReviewCodeHeadMoved:       true,
	GitHubPullReviewCodeNotOpen:         true,
	GitHubPullReviewCodeSubjectMismatch: true,
	GitHubPullReviewCodeRejected:        true,
	GitHubPullReviewCodeRateLimited:     true,
	GitHubPullReviewCodeInvalid:         true,
}

// errGitHubPullReviewUncertain settles the operation uncertain. Returning
// this sentinel — rather than calling lease.Fail — is the canonical unsafe
// external settlement: RunWorker hands the error to Store.Abandon and an
// unsafe operation whose external attempt was already committed becomes
// terminal `uncertain` with this text as its reason (jobs/claims.go
// recoverClaim). Terminal uncertain is never reclaimed and never reopens a
// generation, so no second POST can follow it.
var errGitHubPullReviewUncertain = stdErrors.New(GitHubPullReviewCodeUncertain)

// errGitHubPullReviewReadbackMismatch settles uncertain with the readback
// reason: GitHub answered, and what it answered is not this intent. It must
// never be lease.Fail, because a failed operation is the one state a repeat
// press reopens.
var errGitHubPullReviewReadbackMismatch = stdErrors.New(GitHubPullReviewCodeReadbackMismatch)

var githubCommitSHAPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

// GitHubPullReviewInput is the verdict, its text, and the head commit the
// person reviewed.
type GitHubPullReviewInput struct {
	Event    string `json:"event"`
	Body     string `json:"body"`
	CommitID string `json:"commit_id"`
}

// githubPullReviewJob is the admitted intent. The GitHub identity the
// account's credential resolved to is in it, and the worker proves that
// identity again — against GitHub's own answer — before it writes.
type githubPullReviewJob struct {
	UserID       int64  `json:"user_id"`
	GitHubUserID string `json:"github_user_id"`
	Owner        string `json:"owner"`
	Repo         string `json:"repo"`
	Number       int64  `json:"number"`
	Event        string `json:"event"`
	Body         string `json:"body"`
	CommitID     string `json:"commit_id"`
}

// GitHubPullReviewStatus is the readable state of one review operation. It is
// the door a client whose acknowledgment never arrived reads INSTEAD of
// submitting the verdict again, and it survives a browser reload because the
// operation lives in PostgreSQL.
type GitHubPullReviewStatus struct {
	OperationID string `json:"operation_id"`
	State       string `json:"state"`
	Stage       string `json:"stage,omitempty"`
	Code        string `json:"code,omitempty"`
	// ReviewID, ReviewState and CommitID are GitHub's own, bound to this
	// intent on the readback. Only a completed operation names them.
	ReviewID    int64  `json:"review_id,omitempty"`
	ReviewState string `json:"review_state,omitempty"`
	CommitID    string `json:"commit_id,omitempty"`
	// Verified is true only for a completed operation: GitHub's own answer
	// carried this intent's body, head and verdict under this credential's
	// own GitHub user id.
	Verified bool `json:"verified"`
	// ExternalAttempt is the ORDINAL of the attempt this receipt belongs to,
	// not a count of POSTs (see GitHubRepoCreateStatus.ExternalAttempt).
	ExternalAttempt int `json:"external_attempt,omitempty"`
}

type githubPullReviewRow struct {
	ID       int64  `json:"id"`
	State    string `json:"state"`
	CommitID string `json:"commit_id"`
	Body     string `json:"body"`
	User     struct {
		ID int64 `json:"id"`
	} `json:"user"`
}

type githubPullReviewReceipt struct {
	Code        string `json:"code"`
	Stage       string `json:"stage"`
	Reason      string `json:"reason"`
	ReviewID    int64  `json:"review_id"`
	ReviewState string `json:"review_state"`
	CommitID    string `json:"commit_id"`
}

// githubPullReviewReceiptCode reads the closed reason out of a stored
// receipt. One this module wrote carries `code`; one the store wrote for an
// unsafe settlement carries `reason`, which is this module's own constant.
func githubPullReviewReceiptCode(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var receipt githubPullReviewReceipt
	if json.Unmarshal(raw, &receipt) != nil {
		return ""
	}
	if receipt.Code != "" {
		return receipt.Code
	}
	return receipt.Reason
}

func githubPullReviewRefusal(code, stage string) json.RawMessage {
	receipt, _ := json.Marshal(map[string]string{"code": code, "stage": stage})
	return receipt
}

// githubPullReviewScope keeps one account's reviews in that account's tenant,
// exactly as the account's own repository creates are scoped.
func githubPullReviewScope(userID int64) jobs.Scope {
	return jobs.Scope{TenantID: fmt.Sprintf("user:%d", userID), PrincipalID: "github-pull-review"}
}

// githubPullReviewRequestID is the idempotency key, derived from the actor
// and the intent only. The client sends none, so it can neither fork one
// verdict into two reviews nor join another account's operation. Two presses
// of the SAME verdict, with the same text, on the same pull request at the
// same reviewed head are one intent and one POST.
func githubPullReviewRequestID(job githubPullReviewJob) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{
		GitHubUserPullReviewOperation, strconv.FormatInt(job.UserID, 10), job.GitHubUserID,
		strings.ToLower(job.Owner), strings.ToLower(job.Repo), strconv.FormatInt(job.Number, 10),
		job.Event, job.CommitID, job.Body,
	}, "\x00")))
	return hex.EncodeToString(digest[:])
}

// githubPullReviewNormalizedBody is the text compared on both sides of the
// readback. GitHub stores a body verbatim apart from line endings, so the
// comparison normalizes those and nothing else: it must not be loose enough
// to let a DIFFERENT review's text pass for this one.
func githubPullReviewNormalizedBody(body string) string {
	return strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\r", "\n")
}

// SetGitHubPullReviewJobs wires the durable store one review runs on. It is
// the SAME store the account's repository create runs on, claimed by the same
// one worker (compose/main.go). Without it the door answers unavailable
// rather than writing GitHub inline from a request.
func (s *GitHubUserReposService) SetGitHubPullReviewJobs(store *jobs.Store) { s.createJobs = store }

/*
 * RequestAuthenticatedUserGitHubPullReview admits one review and answers at
 * once. Nothing external happens here: the verdict reaches GitHub on the
 * shared worker, behind the credential reload, the identity re-proof and the
 * head fence.
 */
func (s *GitHubUserReposService) RequestAuthenticatedUserGitHubPullReview(
	ctx context.Context,
	userID int64,
	owner string,
	repo string,
	number int64,
	input GitHubPullReviewInput,
) (jobs.RequestReceipt, error) {
	if s == nil || s.queries == nil || s.decrypter == nil {
		return jobs.RequestReceipt{}, pkgerrors.Internal("github pull review service unavailable")
	}
	if s.createJobs == nil {
		return jobs.RequestReceipt{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github pull request reviews are unavailable")
	}
	if userID <= 0 {
		return jobs.RequestReceipt{}, pkgerrors.Unauthorized("authentication required")
	}
	job, err := validGitHubPullReview(userID, owner, repo, number, input)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	// The GitHub identity is read off the stored link, never off the request.
	identity, err := s.githubAccountIdentity(ctx, userID)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	job.GitHubUserID = identity
	payload, err := json.Marshal(job)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	// The ORIGINAL person's authorization, written from the route's
	// authenticated user. A queued payload is measured against this; holding
	// it does not turn the worker into a person, because only the actor's own
	// credential and GitHub's own answer about it can satisfy the fence.
	authorization, err := json.Marshal(map[string]any{"user_id": userID, "github_user_id": identity})
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	scope := githubPullReviewScope(userID)
	key, err := s.githubPullReviewKey(ctx, scope, job)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	receipt, err := s.createJobs.Admit(ctx, jobs.Admission{
		Scope: scope, Operation: GitHubUserPullReviewOperation,
		RequestID: key, Payload: payload,
		AuthorizationContext: authorization, EffectPolicy: jobs.EffectUnsafe,
	})
	if stdErrors.Is(err, jobs.ErrPayloadConflict) {
		return jobs.RequestReceipt{}, pkgerrors.Conflict("a different review was already requested under this key")
	}
	return receipt, err
}

// validGitHubPullReview is everything this door can refuse without asking
// anybody: the verdict, its text, the reviewed head and the subject.
func validGitHubPullReview(userID int64, owner, repo string, number int64, input GitHubPullReviewInput) (githubPullReviewJob, error) {
	if number <= 0 || number > 9007199254740991 {
		return githubPullReviewJob{}, pkgerrors.BadRequest("invalid github pull request number")
	}
	event := strings.ToUpper(strings.TrimSpace(input.Event))
	if _, known := githubPullReviewStates[event]; !known {
		return githubPullReviewJob{}, pkgerrors.BadRequest("review verdict must be APPROVE, REQUEST_CHANGES or COMMENT")
	}
	body := strings.TrimSpace(input.Body)
	if event != "APPROVE" && body == "" {
		return githubPullReviewJob{}, pkgerrors.BadRequest("a request-changes or comment review needs text")
	}
	if len(body) > githubPullReviewMaxBody {
		return githubPullReviewJob{}, pkgerrors.BadRequest("review text is too long")
	}
	commitID := strings.ToLower(strings.TrimSpace(input.CommitID))
	if !githubCommitSHAPattern.MatchString(commitID) {
		return githubPullReviewJob{}, pkgerrors.BadRequest("the reviewed head commit is required")
	}
	normalizedOwner, err := normalizeGitHubRepoMetadataSegment(owner, "owner")
	if err != nil {
		return githubPullReviewJob{}, err
	}
	normalizedRepo, err := normalizeGitHubRepoMetadataSegment(repo, "repository")
	if err != nil {
		return githubPullReviewJob{}, err
	}
	return githubPullReviewJob{UserID: userID, Owner: normalizedOwner, Repo: normalizedRepo,
		Number: number, Event: event, Body: body, CommitID: commitID}, nil
}

/*
 * githubPullReviewKey turns actor + intent into the request's idempotency key.
 *
 * The first key is the digest itself, so submitting the same verdict twice —
 * a double press, a reload, a restarted server — joins ONE operation: an
 * accepted, running, uncertain or completed review is READ, never repeated.
 * A failed one opens a new generation of the same key ONLY when its own
 * receipt names a refusal from githubPullReviewProvedAbsent. The check is on
 * the receipt, not on the state alone: `failed` is reachable from several
 * places, and reading the state alone would let a review whose POST was
 * answered 201 be pressed again and issue a second POST.
 */
func (s *GitHubUserReposService) githubPullReviewKey(ctx context.Context, scope jobs.Scope, job githubPullReviewJob) (string, error) {
	base := githubPullReviewRequestID(job)
	key := base
	for generation := 1; generation <= githubPullReviewGenerations; generation++ {
		existing, err := s.createJobs.GetByRequest(ctx, scope, GitHubUserPullReviewOperation, key)
		if stdErrors.Is(err, jobs.ErrNotFound) {
			return key, nil
		}
		if err != nil {
			return "", err
		}
		if existing.State != jobs.StateFailed || !githubPullReviewProvedAbsent[githubPullReviewReceiptCode(existing.TerminalReceipt)] {
			return key, nil
		}
		key = base + ":" + strconv.Itoa(generation)
	}
	return "", pkgerrors.Conflict("too many refused reviews of this pull request")
}

// GitHubPullReviewStatusOf reads one of this account's own review operations.
// An operation another account admitted is not found here.
func (s *GitHubUserReposService) GitHubPullReviewStatusOf(ctx context.Context, userID int64, operationID string) (GitHubPullReviewStatus, error) {
	if s == nil || s.createJobs == nil {
		return GitHubPullReviewStatus{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github pull request reviews are unavailable")
	}
	if userID <= 0 {
		return GitHubPullReviewStatus{}, pkgerrors.Unauthorized("authentication required")
	}
	// An id that cannot name an operation is simply not found.
	if uuid.Validate(strings.TrimSpace(operationID)) != nil {
		return GitHubPullReviewStatus{}, pkgerrors.NotFound("review request not found")
	}
	operation, err := s.createJobs.Get(ctx, githubPullReviewScope(userID), operationID)
	if stdErrors.Is(err, jobs.ErrNotFound) || err == nil && operation.Operation != GitHubUserPullReviewOperation {
		return GitHubPullReviewStatus{}, pkgerrors.NotFound("review request not found")
	}
	if err != nil {
		return GitHubPullReviewStatus{}, err
	}
	status := GitHubPullReviewStatus{OperationID: operation.ID, State: string(operation.State), ExternalAttempt: operation.ExternalAttempt}
	var receipt githubPullReviewReceipt
	if len(operation.TerminalReceipt) > 0 && json.Unmarshal(operation.TerminalReceipt, &receipt) == nil {
		status.Stage = receipt.Stage
		status.Code = receipt.Code
		if status.Code == "" {
			status.Code = receipt.Reason
		}
		status.ReviewID, status.ReviewState, status.CommitID = receipt.ReviewID, receipt.ReviewState, receipt.CommitID
	}
	if operation.State != jobs.StateCompleted {
		// Only a completed operation read a review back. No other state may
		// name one, whatever a receipt happens to carry — and `uncertain` in
		// particular is never a cue to submit again.
		status.ReviewID, status.ReviewState, status.CommitID = 0, "", ""
		return status, nil
	}
	status.Verified = true
	return status, nil
}

// githubPullReviewAuthorizes is the admitted authorization context's own
// answer to "is this payload the actor and intent this operation was admitted
// for".
func githubPullReviewAuthorizes(raw json.RawMessage, job githubPullReviewJob) bool {
	var authorization struct {
		UserID       int64  `json:"user_id"`
		GitHubUserID string `json:"github_user_id"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &authorization) != nil {
		return false
	}
	return authorization.UserID == job.UserID && authorization.GitHubUserID == job.GitHubUserID
}

// HandleGitHubUserPullReview runs one admitted review on the durable worker.
func (s *GitHubUserReposService) HandleGitHubUserPullReview(ctx context.Context, lease *jobs.Lease) error {
	claim := lease.Claim()
	refuse := func(code, stage string) error { return lease.Fail(ctx, githubPullReviewRefusal(code, stage)) }
	if claim.Operation != GitHubUserPullReviewOperation {
		return refuse(GitHubPullReviewCodeInvalid, githubPullReviewStageActor)
	}
	var job githubPullReviewJob
	if json.Unmarshal(claim.Payload, &job) != nil {
		return refuse(GitHubPullReviewCodeInvalid, githubPullReviewStageActor)
	}
	if _, err := validGitHubPullReview(job.UserID, job.Owner, job.Repo, job.Number, GitHubPullReviewInput{
		Event: job.Event, Body: job.Body, CommitID: job.CommitID,
	}); err != nil || job.UserID <= 0 || job.GitHubUserID == "" {
		return refuse(GitHubPullReviewCodeInvalid, githubPullReviewStageActor)
	}
	// 0. The fence. The payload names the account whose credential is about
	//    to be loaded, so it must be the account this operation was ADMITTED
	//    for before any credential lookup or external call.
	if claim.Scope != githubPullReviewScope(job.UserID) || !githubPullReviewAuthorizes(claim.AuthorizationContext, job) {
		return refuse(GitHubPullReviewCodeInvalid, githubPullReviewStageActor)
	}

	// 1. The actor, again. The link must still exist, still name the same
	//    GitHub account, and still hold a credential GitHub accepts.
	identity, err := s.githubAccountIdentity(ctx, job.UserID)
	if err != nil {
		if statusOfAPIError(err) == http.StatusUnauthorized {
			return refuse(GitHubPullReviewCodeReauthorize, githubPullReviewStageActor)
		}
		return err
	}
	if identity != job.GitHubUserID {
		return refuse(GitHubPullReviewCodeActorChanged, githubPullReviewStageActor)
	}
	token, _, err := s.resolveUserGitHubAccessToken(ctx, job.UserID)
	if err != nil {
		if statusOfAPIError(err) == http.StatusUnauthorized {
			return refuse(GitHubPullReviewCodeReauthorize, githubPullReviewStageActor)
		}
		return err
	}
	// GitHub's own answer about whose credential this is. It is the ONLY
	// identity the readback may believe, and it proves the credential before
	// anything is written.
	viewer, status, err := s.requestGitHubViewer(ctx, token)
	switch {
	case err != nil:
		return err
	case status == http.StatusUnauthorized:
		return refuse(GitHubPullReviewCodeReauthorize, githubPullReviewStageActor)
	case status == http.StatusForbidden:
		return refuse(GitHubPullReviewCodePermission, githubPullReviewStageActor)
	case status != http.StatusOK || viewer.ID <= 0:
		return pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "github viewer read failed")
	case strconv.FormatInt(viewer.ID, 10) != job.GitHubUserID:
		return refuse(GitHubPullReviewCodeActorChanged, githubPullReviewStageActor)
	}

	// 2. The subject, its state and the head the person reviewed. A refusal
	//    here has had no effect at all.
	root := strings.TrimRight(githubAPIBaseURL(), "/") + "/repos/" +
		url.PathEscape(job.Owner) + "/" + url.PathEscape(job.Repo) + "/pulls" + "/" + strconv.FormatInt(job.Number, 10)
	head, fence, err := s.readGitHubPullReviewHead(ctx, token, root, job.Number)
	switch {
	case fence != "":
		return refuse(fence, githubPullReviewStageFence)
	case err != nil:
		return err
	case head != job.CommitID:
		// The pull request moved off the head the person SAW. No approval of
		// unseen code, ever.
		return refuse(GitHubPullReviewCodeHeadMoved, githubPullReviewStageFence)
	}

	// 3. The write. The attempt is durable BEFORE the POST leaves, so a lost
	//    reply is an uncertain attempt rather than an invisible one.
	evidence, err := json.Marshal(map[string]any{"stage": githubPullReviewStageSubmit})
	if err != nil {
		return err
	}
	if err = lease.StartExternal(ctx, evidence); err != nil {
		return err
	}
	created, sent, err := s.sendGitHubPullReview(ctx, token, root, job.Event, job.Body, job.CommitID)
	if err != nil && !sent {
		// GitHub answered before it could record anything.
		return refuse(githubPullReviewRefusalCode(err), githubPullReviewStageSubmit)
	}
	expectedState := githubPullReviewStates[job.Event]
	// 4. The readback. Everything from here on is after a request that may
	//    have been applied, so no outcome may be a lease.Fail: `failed` is the
	//    one state a repeat press reopens.
	if err != nil || created == nil || created.ID <= 0 {
		// The POST receipted NO review id, so nothing attributes any review
		// on GitHub to this attempt. Resemblance cannot supply it and neither
		// can id ordering: another client signed in as the same person may
		// have recorded a byte-identical review between this operation's
		// reads and its own send. Unknown stays unknown, and is never resent.
		return errGitHubPullReviewUncertain
	}
	// 5. The id THIS POST receipted, read back by that id. GitHub's answer to
	//    the create is taken for the id alone; the STORED review is what has
	//    to carry this operation's intent.
	stored, readErr := s.readGitHubPullReviewByID(ctx, token, root, created.ID)
	if readErr != nil {
		return errGitHubPullReviewUncertain
	}
	if stored.ID != created.ID || !githubPullReviewMatches(&stored, job, viewer.ID, expectedState) {
		return errGitHubPullReviewReadbackMismatch
	}
	return lease.Complete(ctx, githubPullReviewCompletion(&stored, expectedState, job))
}

func githubPullReviewCompletion(row *githubPullReviewRow, expectedState string, job githubPullReviewJob) json.RawMessage {
	receipt, _ := json.Marshal(map[string]any{
		"stage": githubPullReviewStageReadback, "review_id": row.ID,
		"review_state": expectedState, "commit_id": job.CommitID,
	})
	return receipt
}

// githubPullReviewRefusalCode turns one of sendGitHubPullReview's pre-effect
// refusals into this module's own closed reason. It reads the product's own
// closed error code, never the provider's sentence, and no provider prose
// reaches a receipt.
func githubPullReviewRefusalCode(err error) string {
	var apiErr *pkgerrors.APIError
	if !stdErrors.As(err, &apiErr) {
		return GitHubPullReviewCodeRejected
	}
	switch apiErr.Code {
	case pkgerrors.CodeUnauthorized, pkgerrors.CodeInvalidToken:
		return GitHubPullReviewCodeReauthorize
	case pkgerrors.CodeGitHubPermission:
		return GitHubPullReviewCodePermission
	case pkgerrors.CodeGitHubRateLimited:
		return GitHubPullReviewCodeRateLimited
	}
	return GitHubPullReviewCodeRejected
}

/*
 * githubPullReviewMatches is the whole proof that the review GitHub holds is
 * the review THIS operation submitted. Every field of the intent is bound:
 *
 *   - a positive review id. Zero is JSON's default for an absent, null or
 *     malformed field, so it is never read as identity.
 *   - the credential's OWN GitHub user id, read from GitHub's `GET /user`,
 *     never a caller-supplied login.
 *   - the head this operation reviewed.
 *   - the verdict this operation submitted.
 *   - the TEXT this operation submitted. Without it, an OLDER review of the
 *     same verdict at the same head verifies a new one that was never
 *     recorded — a different review standing in for this one.
 */
func githubPullReviewMatches(row *githubPullReviewRow, job githubPullReviewJob, viewerID int64, expectedState string) bool {
	if row == nil || row.ID <= 0 || viewerID <= 0 {
		return false
	}
	return row.User.ID == viewerID &&
		strings.ToLower(strings.TrimSpace(row.CommitID)) == job.CommitID &&
		strings.EqualFold(strings.TrimSpace(row.State), expectedState) &&
		githubPullReviewNormalizedBody(row.Body) == githubPullReviewNormalizedBody(job.Body)
}

// readGitHubPullReviewHead returns the pull request's head SHA. A closed
// refusal names its own reason; anything else is transient and retried.
func (s *GitHubUserReposService) readGitHubPullReviewHead(ctx context.Context, token, root string, number int64) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, root, nil)
	if err != nil {
		return "", "", pkgerrors.Internal("failed to build github pull request request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", GitHubRequestFailure(ctx, "github pull request read failed")
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusUnauthorized:
		return "", GitHubPullReviewCodeReauthorize, nil
	case http.StatusForbidden, http.StatusNotFound:
		return "", GitHubPullReviewCodePermission, nil
	}
	if err := gitHubRepoMetadataUpstreamError(resp, s.now()); err != nil {
		return "", "", err
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, githubRepoMetadataMaxResponseBytes+1))
	if readErr != nil || int64(len(raw)) > githubRepoMetadataMaxResponseBytes {
		return "", "", GitHubRequestFailure(ctx, "failed to read the github pull request response")
	}
	var pull struct {
		Number int64  `json:"number"`
		State  string `json:"state"`
		Merged bool   `json:"merged"`
		Head   struct {
			SHA string `json:"sha"`
		} `json:"head"`
	}
	if json.Unmarshal(raw, &pull) != nil {
		return "", "", pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github pull request response")
	}
	if pull.Number != number {
		return "", GitHubPullReviewCodeSubjectMismatch, nil
	}
	if pull.Merged || !strings.EqualFold(strings.TrimSpace(pull.State), "open") {
		return "", GitHubPullReviewCodeNotOpen, nil
	}
	sha := strings.ToLower(strings.TrimSpace(pull.Head.SHA))
	if !githubCommitSHAPattern.MatchString(sha) {
		return "", "", pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "github named no head commit for the pull request")
	}
	return sha, "", nil
}

// sendGitHubPullReview posts the review once. `sent` reports whether the
// request reached GitHub's answer at all: false means no effect is possible
// and the caller may refuse outright, true means the result must be read.
func (s *GitHubUserReposService) sendGitHubPullReview(
	ctx context.Context,
	token string,
	root string,
	event string,
	body string,
	commitID string,
) (row *githubPullReviewRow, sent bool, err error) {
	payload, marshalErr := json.Marshal(map[string]string{"commit_id": commitID, "body": body, "event": event})
	if marshalErr != nil {
		return nil, false, pkgerrors.Internal("failed to build the github review request").WithCause(marshalErr)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, root+"/reviews", bytes.NewReader(payload))
	if err != nil {
		return nil, false, pkgerrors.Internal("failed to build the github review request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		// The transport failed with the request already written in the general
		// case; GitHub may or may not have recorded it.
		return nil, true, GitHubRequestFailure(ctx, "github review request failed")
	}
	defer func() { _ = resp.Body.Close() }()
	// A rejected or refused credential had no effect: refuse, do not reconcile.
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, false, pkgerrors.Unauthorized("github oauth token was rejected")
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound {
		return nil, false, GitHubResponseFailure(resp.StatusCode, resp.Header, s.now())
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		// GitHub's limiter answers before it records anything.
		return nil, false, GitHubResponseFailure(resp.StatusCode, resp.Header, s.now())
	}
	if resp.StatusCode == http.StatusUnprocessableEntity {
		// GitHub validated the review away (its own rules, e.g. approving your
		// own pull request). Nothing was recorded.
		return nil, false, pkgerrors.Conflict("github refused the review for this pull request")
	}
	if failure := GitHubResponseFailure(resp.StatusCode, resp.Header, s.now()); failure != nil {
		return nil, true, failure
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, githubRepoMetadataMaxResponseBytes+1))
	if readErr != nil || int64(len(raw)) > githubRepoMetadataMaxResponseBytes {
		return nil, true, GitHubRequestFailure(ctx, "failed to read the github review response")
	}
	var created githubPullReviewRow
	if json.Unmarshal(raw, &created) != nil {
		return nil, true, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github review response")
	}
	created.CommitID = strings.ToLower(strings.TrimSpace(created.CommitID))
	return &created, true, nil
}

// readGitHubPullReviewByID reads one stored review back by its own id. It is
// what makes a create answer a readback rather than an acknowledgement, and
// the id it is given is the one THIS operation's own POST receipted: GitHub
// must answer that review again, and it must still be this operation's
// intent. No id is ever guessed out of the pull request's history, because
// nothing in that history names the attempt a review came from.
func (s *GitHubUserReposService) readGitHubPullReviewByID(ctx context.Context, token, root string, id int64) (githubPullReviewRow, error) {
	endpoint := root + "/reviews/" + strconv.FormatInt(id, 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return githubPullReviewRow{}, pkgerrors.Internal("failed to build the github review read request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return githubPullReviewRow{}, GitHubRequestFailure(ctx, "github review read failed")
	}
	defer func() { _ = resp.Body.Close() }()
	if err := gitHubRepoMetadataUpstreamError(resp, s.now()); err != nil {
		return githubPullReviewRow{}, err
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, githubRepoMetadataMaxResponseBytes+1))
	if readErr != nil || int64(len(raw)) > githubRepoMetadataMaxResponseBytes {
		return githubPullReviewRow{}, GitHubRequestFailure(ctx, "failed to read the github review response")
	}
	var row githubPullReviewRow
	if json.Unmarshal(raw, &row) != nil {
		return githubPullReviewRow{}, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github review response")
	}
	return row, nil
}

func setGitHubPullReviewHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "smithers-server")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
}
