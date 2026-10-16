package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

/*
 * #4038: one person's verdict reaches the actual GitHub pull request, pinned
 * to the head they reviewed, and is believed only after GitHub is read back.
 *
 * Every case below runs against a real HTTP GitHub (httptest) and the real
 * service, so the fences are proved where they are enforced rather than
 * mirrored.
 */

const reviewHead = "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"
const reviewMovedHead = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432"

type reviewGitHub struct {
	mu sync.Mutex
	// requests records method+path in order, so a test can prove how many
	// writes left and in what order the fences ran.
	requests []string
	bodies   []map[string]any

	pull      func() (int, string)
	submit    func(attempt int) (int, string)
	list      func(attempt int) (int, string)
	identity  func() (int, string)
	submitted int
	listed    int
}

func (g *reviewGitHub) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		g.requests = append(g.requests, r.Method+" "+r.URL.Path)
		if r.Method == http.MethodPost {
			raw, _ := io.ReadAll(r.Body)
			var decoded map[string]any
			_ = json.Unmarshal(raw, &decoded)
			g.bodies = append(g.bodies, decoded)
		}
		g.mu.Unlock()
		status, body := 404, `{"message":"no stub"}`
		switch {
		case r.URL.Path == "/user":
			if g.identity != nil {
				status, body = g.identity()
			} else {
				status, body = 200, `{"id":4242,"login":"will"}`
			}
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/reviews"):
			g.mu.Lock()
			attempt := g.submitted
			g.submitted++
			g.mu.Unlock()
			if g.submit != nil {
				status, body = g.submit(attempt)
			} else {
				status, body = 201, fmt.Sprintf(`{"id":55,"state":"APPROVED","commit_id":%q,"user":{"id":4242}}`, reviewHead)
			}
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/reviews"):
			g.mu.Lock()
			attempt := g.listed
			g.listed++
			g.mu.Unlock()
			if g.list != nil {
				status, body = g.list(attempt)
			} else {
				status, body = 200, `[]`
			}
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/pulls/7"):
			if g.pull != nil {
				status, body = g.pull()
			} else {
				status, body = 200, fmt.Sprintf(`{"number":7,"state":"open","merged":false,"head":{"ref":"topic","sha":%q}}`, reviewHead)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	})
}

func (g *reviewGitHub) seen() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]string(nil), g.requests...)
}

func (g *reviewGitHub) writes() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	count := 0
	for _, request := range g.requests {
		if strings.HasPrefix(request, "POST ") {
			count++
		}
	}
	return count
}

func reviewService(t *testing.T, github *reviewGitHub) *GitHubUserReposService {
	t.Helper()
	srv := httptest.NewServer(github.handler())
	t.Cleanup(srv.Close)
	t.Setenv(envGitHubAppAPIBaseURL, srv.URL)
	return NewGitHubUserReposService(newFakeGitHubUserReposDB(), fakeOAuthTokenDecrypter{token: "gho_user"})
}

func reviewInput(event string) GitHubPullReviewInput {
	body := ""
	if event != "APPROVE" {
		body = "please rename it"
	}
	return GitHubPullReviewInput{Event: event, Body: body, CommitID: reviewHead}
}

func TestGitHubPullReview_EachVerdictReachesGitHubPinnedToTheReviewedHead(t *testing.T) {
	for event, state := range map[string]string{"APPROVE": "APPROVED", "REQUEST_CHANGES": "CHANGES_REQUESTED", "COMMENT": "COMMENTED"} {
		t.Run(event, func(t *testing.T) {
			github := &reviewGitHub{submit: func(int) (int, string) {
				return 201, fmt.Sprintf(`{"id":55,"state":%q,"commit_id":%q,"user":{"id":4242}}`, state, reviewHead)
			}}
			service := reviewService(t, github)
			result, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput(event))
			require.NoError(t, err)
			assert.Equal(t, GitHubPullReviewResult{ReviewID: 55, State: state, CommitID: reviewHead, Verified: true}, result)
			// The head is read FIRST, then exactly one review is written.
			assert.Equal(t, []string{"GET /repos/octo/widget/pulls/7", "POST /repos/octo/widget/pulls/7/reviews"}, github.seen())
			github.mu.Lock()
			sent := github.bodies[0]
			github.mu.Unlock()
			// Nothing on this wire names an actor, a login or an on-behalf-of.
			assert.Equal(t, map[string]any{"event": event, "commit_id": reviewHead, "body": reviewInput(event).Body}, sent)
		})
	}
}

func TestGitHubPullReview_MovedHeadIsRefusedWithoutWriting(t *testing.T) {
	github := &reviewGitHub{pull: func() (int, string) {
		return 200, fmt.Sprintf(`{"number":7,"state":"open","merged":false,"head":{"sha":%q}}`, reviewMovedHead)
	}}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeConflict, apiErr.Code)
	assert.Equal(t, 0, github.writes())
}

func TestGitHubPullReview_ClosedOrOtherSubjectIsRefusedWithoutWriting(t *testing.T) {
	for name, answer := range map[string]string{
		"merged":         fmt.Sprintf(`{"number":7,"state":"closed","merged":true,"head":{"sha":%q}}`, reviewHead),
		"closed":         fmt.Sprintf(`{"number":7,"state":"closed","merged":false,"head":{"sha":%q}}`, reviewHead),
		"another number": fmt.Sprintf(`{"number":9,"state":"open","merged":false,"head":{"sha":%q}}`, reviewHead),
		"no head at all": `{"number":7,"state":"open","merged":false}`,
	} {
		t.Run(name, func(t *testing.T) {
			github := &reviewGitHub{pull: func() (int, string) { return 200, answer }}
			service := reviewService(t, github)
			_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
			require.Error(t, err)
			assert.Equal(t, 0, github.writes())
		})
	}
}

func TestGitHubPullReview_RevokedAccessIsTypedAndWritesNothing(t *testing.T) {
	for status, expected := range map[int]pkgerrors.Code{
		http.StatusUnauthorized: pkgerrors.CodeUnauthorized,
		http.StatusForbidden:    pkgerrors.CodeGitHubPermission,
		http.StatusNotFound:     pkgerrors.CodeGitHubPermission,
	} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			github := &reviewGitHub{submit: func(int) (int, string) { return status, `{"message":"ignored"}` }}
			service := reviewService(t, github)
			_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
			require.Error(t, err)
			var apiErr *pkgerrors.APIError
			require.ErrorAs(t, err, &apiErr)
			assert.Equal(t, expected, apiErr.Code)
			// GitHub's own words never ride out.
			assert.NotContains(t, apiErr.Message, "ignored")
			// The refusal had no effect, so nothing is reconciled or resent.
			assert.Equal(t, 1, github.writes())
			assert.NotContains(t, strings.Join(github.seen(), ","), "GET /repos/octo/widget/pulls/7/reviews")
		})
	}
}

func TestGitHubPullReview_ReadbackAtAnotherHeadIsNotSuccess(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) {
			return 201, fmt.Sprintf(`{"id":55,"state":"APPROVED","commit_id":%q,"user":{"id":4242}}`, reviewMovedHead)
		},
		list: func(int) (int, string) {
			return 200, fmt.Sprintf(`[{"id":55,"state":"APPROVED","commit_id":%q,"user":{"id":4242}}]`, reviewMovedHead)
		},
	}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeGitHubUnavailable, apiErr.Code)
	assert.Equal(t, 1, github.writes(), "an unconfirmed review is never resent")
}

func TestGitHubPullReview_AnotherAccountsReviewNeverSettlesMine(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) { return 201, `{"id":0}` },
		list: func(int) (int, string) {
			return 200, fmt.Sprintf(`[{"id":77,"state":"APPROVED","commit_id":%q,"user":{"id":9999}}]`, reviewHead)
		},
	}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	assert.Equal(t, 1, github.writes())
}

func TestGitHubPullReview_LostAcknowledgementIsSettledByReadback(t *testing.T) {
	github := &reviewGitHub{
		// A 500 is an answer whose meaning for the write is unknown.
		submit: func(int) (int, string) { return 500, `{"message":"ignored"}` },
		list: func(int) (int, string) {
			return 200, fmt.Sprintf(`[{"id":88,"state":"APPROVED","commit_id":%q,"user":{"id":4242}}]`, reviewHead)
		},
	}
	service := reviewService(t, github)
	result, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.NoError(t, err)
	assert.Equal(t, GitHubPullReviewResult{ReviewID: 88, State: "APPROVED", CommitID: reviewHead, Verified: true}, result)
	assert.Equal(t, 1, github.writes(), "the recorded review is read, not resent")
}

func TestGitHubPullReview_LostAcknowledgementNobodyRecordedStaysUnknown(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) { return 500, `{"message":"ignored"}` },
		list:   func(int) (int, string) { return 200, `[]` },
	}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeGitHubUnavailable, apiErr.Code)
	assert.Contains(t, apiErr.Message, "re-read the pull request")
	assert.Equal(t, 1, github.writes())
}

func TestGitHubPullReview_TruncatedHistoryIsNotProofOfAbsence(t *testing.T) {
	page := func(int) (int, string) {
		rows := make([]string, 0, githubPullReviewPageSize)
		for i := 0; i < githubPullReviewPageSize; i++ {
			rows = append(rows, fmt.Sprintf(`{"id":%d,"state":"COMMENTED","commit_id":%q,"user":{"id":9999}}`, i+1, reviewHead))
		}
		return 200, "[" + strings.Join(rows, ",") + "]"
	}
	github := &reviewGitHub{submit: func(int) (int, string) { return 500, `{}` }, list: page}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeGitHubUnavailable, apiErr.Code)
	assert.Equal(t, githubPullReviewReadbackPages, github.listed, "the readback is bounded")
	assert.Equal(t, 1, github.writes())
}

func TestGitHubPullReview_InvalidRequestNeverReachesGitHub(t *testing.T) {
	cases := map[string]GitHubPullReviewInput{
		"unknown verdict":              {Event: "MERGE", Body: "x", CommitID: reviewHead},
		"forged lowercase":             {Event: "approve!", CommitID: reviewHead},
		"no reviewed head":             {Event: "APPROVE"},
		"short head":                   {Event: "APPROVE", CommitID: "0d1dc5a"},
		"comment with no text":         {Event: "COMMENT", Body: "   ", CommitID: reviewHead},
		"request changes with no text": {Event: "REQUEST_CHANGES", CommitID: reviewHead},
		"body too long":                {Event: "COMMENT", Body: strings.Repeat("a", githubPullReviewMaxBody+1), CommitID: reviewHead},
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			github := &reviewGitHub{}
			service := reviewService(t, github)
			_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
			require.Error(t, err)
			var apiErr *pkgerrors.APIError
			require.ErrorAs(t, err, &apiErr)
			assert.Equal(t, pkgerrors.CodeBadRequest, apiErr.Code)
			assert.Empty(t, github.seen(), "a refused request reaches no GitHub call at all")
		})
	}
}

func TestGitHubPullReview_GitHubsOwnValidationIsNotUncertainty(t *testing.T) {
	github := &reviewGitHub{submit: func(int) (int, string) {
		return 422, `{"message":"Can not approve your own pull request"}`
	}}
	service := reviewService(t, github)
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeConflict, apiErr.Code)
	assert.NotContains(t, apiErr.Message, "your own pull request")
	assert.Equal(t, 1, github.writes())
}

func TestGitHubPullReview_UnconnectedAccountNeverWrites(t *testing.T) {
	github := &reviewGitHub{}
	srv := httptest.NewServer(github.handler())
	defer srv.Close()
	t.Setenv(envGitHubAppAPIBaseURL, srv.URL)
	empty := newFakeGitHubUserReposDB()
	empty.accounts = nil
	service := NewGitHubUserReposService(empty, fakeOAuthTokenDecrypter{token: "gho_user"})
	_, err := service.SubmitAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	assert.Empty(t, github.seen())
}

/*
 * The person-only rule is structural, not a convention in the handler: the
 * catalog descriptor the route is bound to admits only a person and never a
 * run, so the review-analysis workflow can return findings but no agent
 * credential can reach the door at all — and the request body it would have
 * to forge has no actor field.
 */
func TestGitHubPullReview_CatalogCommandIsPersonOnly(t *testing.T) {
	policy, ok := OperationPolicy("github.account-review")
	require.True(t, ok, "the review door names a catalog command")
	assert.Equal(t, []string{"person"}, policy.Actors)
	assert.Equal(t, "never", policy.Agent)
	assert.Equal(t, "owner", policy.MinimumRole)
	assert.Equal(t, "write:repository", policy.CredentialScope)

	// The read command it sits beside is unchanged and still read-scoped.
	read, ok := OperationPolicy("github.account-read")
	require.True(t, ok)
	assert.Equal(t, "read:repository", read.CredentialScope)
}
