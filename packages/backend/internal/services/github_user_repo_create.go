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
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
 * Creating a REAL repository on the caller's own GitHub account.
 *
 * The Smithers Cloud create (POST /api/user/repos -> services/repo.go) writes
 * a Smithers repository row and calls GitHub never. This is the other act: one
 * POST https://api.github.com/user/repos made with the signed-in person's OWN
 * GitHub credential (the same resolver every read on this service uses), so
 * the repository GitHub ends up with belongs to that person and no service
 * credential, App JWT or installation token can stand in for it.
 *
 * It is a durable job, not an inline request, for the reason every external
 * write here is: the acknowledgment must not be the proof. Admission commits
 * the intent and answers immediately; the worker re-authorizes the actor,
 * commits the attempt BEFORE the POST, and only an answer GitHub itself
 * repeated on a readback is reported as a created repository.
 *
 *   - EffectUnsafe: a create whose reply was lost settles `uncertain` and is
 *     NEVER retried. A repeat press carries the same server-derived
 *     idempotency key (actor + intent), so it joins that one operation
 *     instead of opening a second POST.
 *   - The owner is never a request field. The payload carries the account and
 *     the GitHub identity the credential resolved to; the worker refuses when
 *     that identity changed, so a receipt can never name another account's
 *     repository.
 *   - Creating a GitHub repository imports nothing and installs nothing. The
 *     receipt states the repository, and the import/installation steps stay
 *     the person's own next act.
 */

// GitHubUserRepoCreateOperation is the durable operation one create runs as.
const GitHubUserRepoCreateOperation = "github.user.repo.create"

// The stage a receipt reports. Stages name where an attempt stood, with no
// credential, payload, URL, header or upstream prose in them.
const (
	githubRepoCreateStageActor    = "resolve-actor"
	githubRepoCreateStageCreate   = "create"
	githubRepoCreateStageReadback = "readback"
)

// The closed set of reasons one create can refuse with. Each one names a
// different act for the reader; none of them carries GitHub's own words.
const (
	// GitHubRepoCreateCodeExists: the account already has a repository by that
	// name. Nothing was created and nothing was overwritten.
	GitHubRepoCreateCodeExists = "repository_exists"
	// GitHubRepoCreateCodeReauthorize: the linked GitHub credential cannot
	// write. The person re-links GitHub; no scope is widened server-side.
	GitHubRepoCreateCodeReauthorize = "reauthorize_github"
	// GitHubRepoCreateCodePermission: GitHub refused the create for this
	// credential (a restriction on the account, not a missing link).
	GitHubRepoCreateCodePermission = "github_permission"
	// GitHubRepoCreateCodeActorChanged: the account's GitHub identity is no
	// longer the one that asked. The result is ignored, the receipt kept.
	GitHubRepoCreateCodeActorChanged = "actor_changed"
	// GitHubRepoCreateCodeReadbackMismatch: GitHub answered with a repository
	// that is not the one this operation asked for.
	GitHubRepoCreateCodeReadbackMismatch = "readback_mismatch"
	// GitHubRepoCreateCodeRateLimited: GitHub's own limiter refused the call
	// before it created anything, so the person may try again later.
	GitHubRepoCreateCodeRateLimited = "rate_limited"
	// GitHubRepoCreateCodeInvalid: the admitted request cannot be run.
	GitHubRepoCreateCodeInvalid = "invalid_request"
	// GitHubRepoCreateCodeUncertain is the reason an unsafe operation records
	// when the POST's fate is unknown. It is never a retry.
	GitHubRepoCreateCodeUncertain = "github_create_uncertain"
)

// errGitHubRepoCreateUncertain settles the operation uncertain. Its text is the
// only thing stored as the reason, so no upstream prose can reach a receipt.
var errGitHubRepoCreateUncertain = stdErrors.New(GitHubRepoCreateCodeUncertain)

// githubRepoCreateJob is the admitted intent. The owner is NOT in it: the
// account and the GitHub identity its credential resolved to are, and the
// worker proves the identity again before it writes.
type githubRepoCreateJob struct {
	UserID       int64  `json:"user_id"`
	GitHubUserID string `json:"github_user_id"`
	Name         string `json:"name"`
	Private      bool   `json:"private"`
}

// GitHubRepoCreateStatus is the readable state of one create.
type GitHubRepoCreateStatus struct {
	OperationID string `json:"operation_id"`
	State       string `json:"state"`
	Stage       string `json:"stage,omitempty"`
	Code        string `json:"code,omitempty"`
	// FullName and RepositoryID are GitHub's own, read back after the create.
	FullName     string `json:"full_name,omitempty"`
	RepositoryID int64  `json:"repository_id,omitempty"`
	// ExternalAttempt is how many times a POST was committed. One uncertain
	// attempt is the reader's cue to look at GitHub, never to press again.
	ExternalAttempt int `json:"external_attempt,omitempty"`
}

// SetGitHubRepoCreateJobs wires the durable store the create runs on. Without
// it the door answers unavailable rather than writing inline.
func (s *GitHubUserReposService) SetGitHubRepoCreateJobs(store *jobs.Store) { s.createJobs = store }

// githubRepoCreateScope keeps one account's creates in that account's tenant.
func githubRepoCreateScope(userID int64) jobs.Scope {
	return jobs.Scope{TenantID: fmt.Sprintf("user:%d", userID), PrincipalID: "github-repo-create"}
}

// githubRepoCreateRequestID is the idempotency key, derived from the actor and
// the intent only. The client sends none, so it can neither fork one intent
// into two repositories nor join another account's operation.
func githubRepoCreateRequestID(job githubRepoCreateJob) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{
		GitHubUserRepoCreateOperation, strconv.FormatInt(job.UserID, 10),
		job.GitHubUserID, strings.ToLower(job.Name), strconv.FormatBool(job.Private),
	}, "\x00")))
	return hex.EncodeToString(digest[:])
}

// selectGitHubOAuthAccount prefers a real provider="github" account. "workos"
// is a fallback ONLY because that path is GitHub-backed (it stores a gho_*
// token); a WorkOS account must never shadow a real GitHub credential.
func selectGitHubOAuthAccount(accounts []db.OauthAccount) *db.OauthAccount {
	var selected *db.OauthAccount
	for i := range accounts {
		switch strings.ToLower(strings.TrimSpace(accounts[i].Provider)) {
		case "github":
			selected = &accounts[i]
		case "workos":
			if selected == nil {
				selected = &accounts[i]
			}
		}
		if selected != nil && strings.EqualFold(strings.TrimSpace(selected.Provider), "github") {
			return selected
		}
	}
	return selected
}

// githubAccountIdentity is the GitHub account this Smithers account is linked
// to, read from the stored link rather than from anything the client sent.
func (s *GitHubUserReposService) githubAccountIdentity(ctx context.Context, userID int64) (string, error) {
	accounts, err := s.queries.ListUserOAuthAccounts(ctx, userID)
	if err != nil {
		return "", pkgerrors.Internal("failed to load github oauth account").WithCause(err)
	}
	selected := selectGitHubOAuthAccount(accounts)
	if selected == nil {
		return "", pkgerrors.Unauthorized("github oauth account is not connected")
	}
	identity := strings.TrimSpace(selected.ProviderUserID)
	if identity == "" {
		return "", pkgerrors.Unauthorized("the linked github account has no identity")
	}
	return identity, nil
}

// RequestGitHubUserRepoCreate admits one create and answers at once. The
// repository exists only when the operation completes; the receipt's state is
// read back through GitHubUserRepoCreateStatus, so a lost acknowledgment is a
// READ and never a second POST.
func (s *GitHubUserReposService) RequestGitHubUserRepoCreate(ctx context.Context, userID int64, name string, private bool) (jobs.RequestReceipt, error) {
	if s == nil || s.queries == nil || s.decrypter == nil || s.createJobs == nil {
		return jobs.RequestReceipt{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github repository creation is unavailable")
	}
	if userID <= 0 {
		return jobs.RequestReceipt{}, pkgerrors.Unauthorized("authentication required")
	}
	normalized, err := normalizeGitHubRepoMetadataSegment(name, "repository")
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	identity, err := s.githubAccountIdentity(ctx, userID)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	job := githubRepoCreateJob{UserID: userID, GitHubUserID: identity, Name: normalized, Private: private}
	payload, err := json.Marshal(job)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	authorization, err := json.Marshal(map[string]any{"user_id": userID, "github_user_id": identity})
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	scope := githubRepoCreateScope(userID)
	key, err := s.githubRepoCreateKey(ctx, scope, job)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	receipt, err := s.createJobs.Admit(ctx, jobs.Admission{
		Scope: scope, Operation: GitHubUserRepoCreateOperation,
		RequestID: key, Payload: payload,
		AuthorizationContext: authorization, EffectPolicy: jobs.EffectUnsafe,
	})
	if stdErrors.Is(err, jobs.ErrPayloadConflict) {
		return jobs.RequestReceipt{}, pkgerrors.Conflict("a different repository was already requested under this key")
	}
	return receipt, err
}

// githubRepoCreateGenerations bounds how many refused attempts one name may
// leave behind before the person is asked to pick a different one.
const githubRepoCreateGenerations = 32

/*
 * githubRepoCreateKey turns actor + intent into the request's idempotency key.
 *
 * The first key is the digest itself, so pressing Create twice on one intent
 * joins ONE operation: an accepted, running, uncertain or completed create is
 * read, never repeated. A FAILED one is the single case that opens a new
 * generation of the same key, and it is safe by construction — every refusal
 * this module records (a refused credential, a refused create, a name GitHub
 * already has, an actor that changed) is one where GitHub created nothing.
 * An uncertain attempt, which MAY have created the repository, is never
 * reopened; it keeps its receipt and sends the reader to GitHub.
 */
func (s *GitHubUserReposService) githubRepoCreateKey(ctx context.Context, scope jobs.Scope, job githubRepoCreateJob) (string, error) {
	base := githubRepoCreateRequestID(job)
	key := base
	for generation := 1; generation <= githubRepoCreateGenerations; generation++ {
		existing, err := s.createJobs.GetByRequest(ctx, scope, GitHubUserRepoCreateOperation, key)
		if stdErrors.Is(err, jobs.ErrNotFound) {
			return key, nil
		}
		if err != nil {
			return "", err
		}
		if existing.State != jobs.StateFailed {
			return key, nil
		}
		key = base + ":" + strconv.Itoa(generation)
	}
	return "", pkgerrors.Conflict("too many refused creations of this repository name")
}

// GitHubUserRepoCreateStatus reads one of this account's own create operations.
// An operation another account admitted is not found here.
func (s *GitHubUserReposService) GitHubUserRepoCreateStatus(ctx context.Context, userID int64, operationID string) (GitHubRepoCreateStatus, error) {
	if s == nil || s.createJobs == nil {
		return GitHubRepoCreateStatus{}, pkgerrors.New(pkgerrors.CodeServiceUnavailable, "github repository creation is unavailable")
	}
	if userID <= 0 {
		return GitHubRepoCreateStatus{}, pkgerrors.Unauthorized("authentication required")
	}
	// An id that cannot name an operation is simply not found: the store's own
	// identifier shape is not a reason to answer differently.
	if uuid.Validate(strings.TrimSpace(operationID)) != nil {
		return GitHubRepoCreateStatus{}, pkgerrors.NotFound("repository request not found")
	}
	operation, err := s.createJobs.Get(ctx, githubRepoCreateScope(userID), operationID)
	if stdErrors.Is(err, jobs.ErrNotFound) || err == nil && operation.Operation != GitHubUserRepoCreateOperation {
		return GitHubRepoCreateStatus{}, pkgerrors.NotFound("repository request not found")
	}
	if err != nil {
		return GitHubRepoCreateStatus{}, err
	}
	status := GitHubRepoCreateStatus{OperationID: operation.ID, State: string(operation.State), ExternalAttempt: operation.ExternalAttempt}
	var receipt struct {
		Code         string `json:"code"`
		Stage        string `json:"stage"`
		Reason       string `json:"reason"`
		FullName     string `json:"full_name"`
		RepositoryID int64  `json:"repository_id"`
	}
	if len(operation.TerminalReceipt) > 0 && json.Unmarshal(operation.TerminalReceipt, &receipt) == nil {
		status.Stage, status.FullName, status.RepositoryID = receipt.Stage, receipt.FullName, receipt.RepositoryID
		status.Code = receipt.Code
		if status.Code == "" {
			// An unsafe operation the store settled itself records the reason
			// its worker returned; that reason is this module's own code.
			status.Code = receipt.Reason
		}
	}
	return status, nil
}

func githubRepoCreateRefusal(code, stage string) json.RawMessage {
	receipt, _ := json.Marshal(map[string]string{"code": code, "stage": stage})
	return receipt
}

// HandleGitHubUserRepoCreate runs one admitted create on the durable worker.
func (s *GitHubUserReposService) HandleGitHubUserRepoCreate(ctx context.Context, lease *jobs.Lease) error {
	claim := lease.Claim()
	if claim.Operation != GitHubUserRepoCreateOperation {
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeInvalid, githubRepoCreateStageActor))
	}
	var job githubRepoCreateJob
	if json.Unmarshal(claim.Payload, &job) != nil || job.UserID <= 0 || job.GitHubUserID == "" {
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeInvalid, githubRepoCreateStageActor))
	}
	if _, err := normalizeGitHubRepoMetadataSegment(job.Name, "repository"); err != nil {
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeInvalid, githubRepoCreateStageActor))
	}

	// 1. The actor, again. The link must still exist, still name the same
	//    GitHub account, and still hold a credential GitHub accepts.
	identity, err := s.githubAccountIdentity(ctx, job.UserID)
	if err != nil {
		if statusOfAPIError(err) == http.StatusUnauthorized {
			return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeReauthorize, githubRepoCreateStageActor))
		}
		return err
	}
	if identity != job.GitHubUserID {
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeActorChanged, githubRepoCreateStageActor))
	}
	token, _, err := s.resolveUserGitHubAccessToken(ctx, job.UserID)
	if err != nil {
		if statusOfAPIError(err) == http.StatusUnauthorized {
			return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeReauthorize, githubRepoCreateStageActor))
		}
		return err
	}
	// The login is GitHub's, not the client's: it is the owner the readback
	// uses, and the same read proves the credential before anything is written.
	viewer, status, err := s.requestGitHubViewer(ctx, token)
	switch {
	case err != nil:
		return err
	case status == http.StatusUnauthorized:
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeReauthorize, githubRepoCreateStageActor))
	case status == http.StatusForbidden:
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodePermission, githubRepoCreateStageActor))
	case status != http.StatusOK || viewer.Login == "":
		return pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "github viewer read failed")
	case strconv.FormatInt(viewer.ID, 10) != job.GitHubUserID:
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeActorChanged, githubRepoCreateStageActor))
	}

	// 2. The write. The attempt is durable BEFORE the POST leaves, so a lost
	//    reply is an uncertain attempt rather than an invisible one.
	if err = lease.StartExternal(ctx, json.RawMessage(`{"stage":"`+githubRepoCreateStageCreate+`"}`)); err != nil {
		return err
	}
	created, status, err := s.requestGitHubRepoCreate(ctx, token, job.Name, job.Private)
	switch {
	case err != nil:
		// The POST may have been applied. Unsafe operations settle uncertain
		// here: nothing is repeated, and the reader is sent to GitHub.
		return errGitHubRepoCreateUncertain
	case status == http.StatusUnauthorized:
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeReauthorize, githubRepoCreateStageCreate))
	case status == http.StatusForbidden:
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodePermission, githubRepoCreateStageCreate))
	case status == http.StatusUnprocessableEntity:
		// GitHub refuses a name the account already uses. Nothing was created,
		// so this is not a success, and the existing repository is not touched.
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeExists, githubRepoCreateStageCreate))
	case status == http.StatusTooManyRequests:
		// GitHub's limiter answers before it creates anything, so this is a
		// refusal the person can act on rather than an unconfirmed attempt.
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeRateLimited, githubRepoCreateStageCreate))
	case status != http.StatusCreated:
		// Anything else GitHub answered with (a 5xx, an unexpected status) may
		// have been applied after it was accepted. Unconfirmed, never repeated.
		return errGitHubRepoCreateUncertain
	}

	// 3. The readback. The repository is reported only because GitHub answered
	//    it again, under this actor's own login and account id.
	readback, status, err := s.requestGitHubRepoIdentity(ctx, token, viewer.Login, job.Name)
	if err != nil || status != http.StatusOK {
		return errGitHubRepoCreateUncertain
	}
	expected := viewer.Login + "/" + job.Name
	if !strings.EqualFold(readback.FullName, expected) || readback.Owner.ID != viewer.ID ||
		created.FullName != "" && !strings.EqualFold(created.FullName, expected) {
		return lease.Fail(ctx, githubRepoCreateRefusal(GitHubRepoCreateCodeReadbackMismatch, githubRepoCreateStageReadback))
	}
	receipt, err := json.Marshal(map[string]any{
		"stage": githubRepoCreateStageReadback, "full_name": readback.FullName, "repository_id": readback.ID,
	})
	if err != nil {
		return err
	}
	return lease.Complete(ctx, receipt)
}

type githubRepoIdentity struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Owner    struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	} `json:"owner"`
}

type githubViewer struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

// requestGitHubViewer reads GET /user with the person's own credential.
func (s *GitHubUserReposService) requestGitHubViewer(ctx context.Context, token string) (githubViewer, int, error) {
	var viewer githubViewer
	status, err := s.requestGitHubJSON(ctx, http.MethodGet, strings.TrimRight(githubAPIBaseURL(), "/")+"/user", token, nil, &viewer)
	return viewer, status, err
}

// requestGitHubRepoCreate performs the ONE POST /user/repos. `auto_init` gives
// the new repository a first commit, so a reader opening it sees a tree.
func (s *GitHubUserReposService) requestGitHubRepoCreate(ctx context.Context, token, name string, private bool) (githubRepoIdentity, int, error) {
	body, err := json.Marshal(map[string]any{"name": name, "private": private, "auto_init": true})
	if err != nil {
		return githubRepoIdentity{}, 0, err
	}
	var created githubRepoIdentity
	status, err := s.requestGitHubJSON(ctx, http.MethodPost, strings.TrimRight(githubAPIBaseURL(), "/")+"/user/repos", token, body, &created)
	return created, status, err
}

// requestGitHubRepoIdentity reads the repository back under the owner GitHub
// itself named for this credential.
func (s *GitHubUserReposService) requestGitHubRepoIdentity(ctx context.Context, token, owner, repo string) (githubRepoIdentity, int, error) {
	endpoint := strings.TrimRight(githubAPIBaseURL(), "/") + "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo)
	var readback githubRepoIdentity
	status, err := s.requestGitHubJSON(ctx, http.MethodGet, endpoint, token, nil, &readback)
	return readback, status, err
}

// requestGitHubJSON is the one transport these three calls share. It returns
// the status so the caller classifies it; a transport failure and an
// unreadable body are errors, and no response header or body text escapes.
func (s *GitHubUserReposService) requestGitHubJSON(ctx context.Context, method, endpoint, token string, body []byte, out any) (int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return 0, pkgerrors.Internal("failed to build github request").WithCause(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "smithers-server")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, GitHubRequestFailure(ctx, "github request failed")
	}
	defer func() { _ = resp.Body.Close() }()
	payload, readErr := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if readErr != nil || len(payload) > 1<<20 {
		return resp.StatusCode, GitHubRequestFailure(ctx, "github returned an incomplete response")
	}
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		if err := json.Unmarshal(payload, out); err != nil {
			return resp.StatusCode, GitHubRequestFailure(ctx, "github returned an unreadable response")
		}
	}
	return resp.StatusCode, nil
}
