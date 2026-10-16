package services

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
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
 * Three facts are established before the write, and one after it:
 *
 *   1. The pull request is the subject the caller named: its own `number`
 *      answers back, and the repository is the one in the path.
 *   2. It is still open. GitHub accepts a review on a merged or closed pull
 *      request; a person who typed a verdict against an open one did not ask
 *      for that.
 *   3. Its head is the head the person reviewed. A review that silently
 *      lands on a force-pushed head approves code nobody read, so a moved
 *      head is a refusal, not a retargeting.
 *   4. AFTER the write, the recorded review is read back — from the create
 *      response, or (when the acknowledgement was lost) from GitHub's own
 *      review list. Success is never claimed from having sent a request.
 *
 * A review carries no idempotency key, so a lost acknowledgement is NEVER
 * replayed here: it is reconciled by reading, and stays unknown when reading
 * cannot settle it.
 */

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
	// githubPullReviewReadbackPages bounds the reconciliation read at 500
	// reviews. A truncated history is not proof that a lost write was absent,
	// so exhausting the bound leaves the result unknown.
	githubPullReviewReadbackPages = 5
	githubPullReviewPageSize      = 100
)

var githubCommitSHAPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

// GitHubPullReviewInput is the verdict, its text, and the head commit the
// person reviewed.
type GitHubPullReviewInput struct {
	Event    string `json:"event"`
	Body     string `json:"body"`
	CommitID string `json:"commit_id"`
}

// GitHubPullReviewResult is the review GitHub recorded, as read back.
// `verified` is true only when that readback matched the submitted verdict at
// the submitted head.
type GitHubPullReviewResult struct {
	ReviewID int64  `json:"review_id"`
	State    string `json:"state"`
	CommitID string `json:"commit_id"`
	Verified bool   `json:"verified"`
}

type githubPullReviewRow struct {
	ID       int64  `json:"id"`
	State    string `json:"state"`
	CommitID string `json:"commit_id"`
	User     struct {
		ID int64 `json:"id"`
	} `json:"user"`
}

// githubPullReviewUnacknowledged is the one honest answer for a write whose
// acceptance GitHub neither confirmed nor denied.
func githubPullReviewUnacknowledged() error {
	return pkgerrors.New(pkgerrors.CodeGitHubUnavailable,
		"GitHub did not confirm the review; re-read the pull request before reviewing it again")
}

// SubmitAuthenticatedUserGitHubPullReview submits one review to one GitHub
// pull request with the caller's own GitHub credential and returns it only
// after reading it back.
func (s *GitHubUserReposService) SubmitAuthenticatedUserGitHubPullReview(
	ctx context.Context,
	userID int64,
	owner string,
	repo string,
	number int64,
	input GitHubPullReviewInput,
) (GitHubPullReviewResult, error) {
	if s == nil || s.queries == nil || s.decrypter == nil {
		return GitHubPullReviewResult{}, pkgerrors.Internal("github pull review service unavailable")
	}
	if userID <= 0 {
		return GitHubPullReviewResult{}, pkgerrors.Unauthorized("authentication required")
	}
	if number <= 0 || number > 9007199254740991 {
		return GitHubPullReviewResult{}, pkgerrors.BadRequest("invalid github pull request number")
	}
	event := strings.ToUpper(strings.TrimSpace(input.Event))
	expectedState, known := githubPullReviewStates[event]
	if !known {
		return GitHubPullReviewResult{}, pkgerrors.BadRequest("review verdict must be APPROVE, REQUEST_CHANGES or COMMENT")
	}
	body := strings.TrimSpace(input.Body)
	if event != "APPROVE" && body == "" {
		return GitHubPullReviewResult{}, pkgerrors.BadRequest("a request-changes or comment review needs text")
	}
	if len(body) > githubPullReviewMaxBody {
		return GitHubPullReviewResult{}, pkgerrors.BadRequest("review text is too long")
	}
	commitID := strings.ToLower(strings.TrimSpace(input.CommitID))
	if !githubCommitSHAPattern.MatchString(commitID) {
		return GitHubPullReviewResult{}, pkgerrors.BadRequest("the reviewed head commit is required")
	}
	normalizedOwner, err := normalizeGitHubRepoMetadataSegment(owner, "owner")
	if err != nil {
		return GitHubPullReviewResult{}, err
	}
	normalizedRepo, err := normalizeGitHubRepoMetadataSegment(repo, "repository")
	if err != nil {
		return GitHubPullReviewResult{}, err
	}

	token, account, err := s.resolveUserGitHubAccessToken(ctx, userID)
	if err != nil {
		return GitHubPullReviewResult{}, err
	}
	root := strings.TrimRight(githubAPIBaseURL(), "/") + "/repos/" + url.PathEscape(normalizedOwner) + "/" + url.PathEscape(normalizedRepo) + "/pulls/" + strconv.FormatInt(number, 10)

	// Fence first: the subject, its state and its head. A rejected credential
	// here has had no effect, so the single reactive refresh is safe.
	head, err := s.readGitHubPullReviewHead(ctx, token, root, number)
	if err != nil && isGitHubTokenExpired(err) {
		refreshed, refreshErr := s.refreshUserGitHubToken(ctx, account)
		if refreshErr != nil {
			return GitHubPullReviewResult{}, refreshErr
		}
		token = refreshed
		head, err = s.readGitHubPullReviewHead(ctx, token, root, number)
	}
	if err != nil {
		return GitHubPullReviewResult{}, err
	}
	if head != commitID {
		return GitHubPullReviewResult{}, pkgerrors.Conflict("the pull request moved to a new head commit; re-read it before reviewing")
	}

	// One send. Past this point a replay could double-review, so every
	// recovery below READS.
	created, sent, err := s.sendGitHubPullReview(ctx, token, root, event, body, commitID)
	if err != nil && !sent {
		return GitHubPullReviewResult{}, err
	}
	if err == nil && created != nil && created.CommitID == commitID && strings.EqualFold(created.State, expectedState) && created.ID > 0 {
		return GitHubPullReviewResult{ReviewID: created.ID, State: expectedState, CommitID: commitID, Verified: true}, nil
	}

	// The request left and its acceptance is not established. Read GitHub's
	// own review list and let it settle the question.
	recorded, settled, readErr := s.reconcileGitHubPullReview(ctx, token, root, commitID, expectedState)
	if readErr != nil {
		return GitHubPullReviewResult{}, githubPullReviewUnacknowledged()
	}
	if !settled {
		return GitHubPullReviewResult{}, githubPullReviewUnacknowledged()
	}
	return GitHubPullReviewResult{ReviewID: recorded.ID, State: expectedState, CommitID: commitID, Verified: true}, nil
}

// readGitHubPullReviewHead returns the pull request's head SHA, refusing a
// subject that is not the named number or is no longer open.
func (s *GitHubUserReposService) readGitHubPullReviewHead(ctx context.Context, token, root string, number int64) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, root, nil)
	if err != nil {
		return "", pkgerrors.Internal("failed to build github pull request request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", GitHubRequestFailure(ctx, "github pull request read failed")
	}
	defer func() { _ = resp.Body.Close() }()
	if err := gitHubRepoMetadataUpstreamError(resp, s.now()); err != nil {
		return "", err
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, githubRepoMetadataMaxResponseBytes+1))
	if readErr != nil || int64(len(raw)) > githubRepoMetadataMaxResponseBytes {
		return "", GitHubRequestFailure(ctx, "failed to read the github pull request response")
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
		return "", pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github pull request response")
	}
	if pull.Number != number {
		return "", pkgerrors.Conflict("github answered with a different pull request")
	}
	if pull.Merged || !strings.EqualFold(strings.TrimSpace(pull.State), "open") {
		return "", pkgerrors.Conflict("the pull request is no longer open for review")
	}
	sha := strings.ToLower(strings.TrimSpace(pull.Head.SHA))
	if !githubCommitSHAPattern.MatchString(sha) {
		return "", pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "github named no head commit for the pull request")
	}
	return sha, nil
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

// reconcileGitHubPullReview answers whether GitHub holds the caller's own
// review of this verdict at this head. It never writes.
func (s *GitHubUserReposService) reconcileGitHubPullReview(
	ctx context.Context,
	token string,
	root string,
	commitID string,
	expectedState string,
) (githubPullReviewRow, bool, error) {
	me, err := s.readGitHubTokenUserID(ctx, token)
	if err != nil {
		return githubPullReviewRow{}, false, err
	}
	var match githubPullReviewRow
	found := false
	for page := 1; page <= githubPullReviewReadbackPages; page++ {
		rows, err := s.readGitHubPullReviewPage(ctx, token, root, page)
		if err != nil {
			return githubPullReviewRow{}, false, err
		}
		for _, row := range rows {
			if row.User.ID != me || row.ID <= 0 {
				continue
			}
			if strings.ToLower(strings.TrimSpace(row.CommitID)) != commitID {
				continue
			}
			if !strings.EqualFold(strings.TrimSpace(row.State), expectedState) {
				continue
			}
			if row.ID > match.ID {
				match, found = row, true
			}
		}
		if found {
			return match, true, nil
		}
		if len(rows) < githubPullReviewPageSize {
			// The whole list was read and the review is not in it.
			return githubPullReviewRow{}, false, nil
		}
	}
	// The bound was reached with pages still to come: absence is not proved.
	return githubPullReviewRow{}, false, githubPullReviewUnacknowledged()
}

func (s *GitHubUserReposService) readGitHubPullReviewPage(ctx context.Context, token, root string, page int) ([]githubPullReviewRow, error) {
	endpoint := root + "/reviews?per_page=" + strconv.Itoa(githubPullReviewPageSize) + "&page=" + strconv.Itoa(page)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, pkgerrors.Internal("failed to build the github review readback request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, GitHubRequestFailure(ctx, "github review readback failed")
	}
	defer func() { _ = resp.Body.Close() }()
	if err := gitHubRepoMetadataUpstreamError(resp, s.now()); err != nil {
		return nil, err
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, githubRepoMetadataMaxResponseBytes+1))
	if readErr != nil || int64(len(raw)) > githubRepoMetadataMaxResponseBytes {
		return nil, GitHubRequestFailure(ctx, "failed to read the github review readback response")
	}
	var rows []githubPullReviewRow
	if json.Unmarshal(raw, &rows) != nil {
		return nil, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github review readback response")
	}
	return rows, nil
}

// readGitHubTokenUserID names whose reviews the readback may believe: the
// GitHub account the credential itself belongs to, never a caller-supplied
// login.
func (s *GitHubUserReposService) readGitHubTokenUserID(ctx context.Context, token string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(githubAPIBaseURL(), "/")+"/user", nil)
	if err != nil {
		return 0, pkgerrors.Internal("failed to build the github identity request").WithCause(err)
	}
	setGitHubPullReviewHeaders(req, token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, GitHubRequestFailure(ctx, "github identity read failed")
	}
	defer func() { _ = resp.Body.Close() }()
	if err := gitHubRepoMetadataUpstreamError(resp, s.now()); err != nil {
		return 0, err
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if readErr != nil {
		return 0, GitHubRequestFailure(ctx, "failed to read the github identity response")
	}
	var account struct {
		ID int64 `json:"id"`
	}
	if json.Unmarshal(raw, &account) != nil || account.ID <= 0 {
		return 0, pkgerrors.New(pkgerrors.CodeGitHubUnavailable, "failed to decode the github identity response")
	}
	return account.ID, nil
}

func setGitHubPullReviewHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "smithers-server")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
}
