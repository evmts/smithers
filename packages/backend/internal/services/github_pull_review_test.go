package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

/*
 * #4038: one person's verdict reaches the actual GitHub pull request, pinned
 * to the head they reviewed, bound to the text they wrote, and believed only
 * after GitHub is read back — at most ONCE per human intent, however often
 * the verdict is submitted.
 *
 * Every case below runs against a real HTTP GitHub (httptest), the real
 * durable store on an isolated PostgreSQL database, and the real worker
 * handler, so the fences are proved where they are enforced rather than
 * mirrored. Admission and the worker run on SEPARATE service instances
 * wherever replay is at stake: the operation lives in PostgreSQL, not in a
 * process, so a restarted server finishes the admitted intent instead of
 * starting a second one.
 */

const reviewHead = "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6"
const reviewMovedHead = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432"

type reviewGitHub struct {
	mu sync.Mutex
	// requests records method+path in order, so a test can prove how many
	// writes left and in what order the fences ran.
	requests []string
	bodies   []map[string]any

	pull   func() (int, string)
	submit func(attempt int) (int, string)
	list   func(attempt int) (int, string)
	// review answers GET …/pulls/7/reviews/{id}: the stored review, read
	// back by its own id. A `201` is not a readback without it.
	review    func(id int64) (int, string)
	identity  func() (int, string)
	submitted int
	listed    int
	read      int
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
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/reviews/"):
			id, _ := strconv.ParseInt(r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:], 10, 64)
			g.mu.Lock()
			g.read++
			g.mu.Unlock()
			if g.review != nil {
				status, body = g.review(id)
			} else {
				status, body = 200, g.stored(id)
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

// stored is what GitHub answers for one review id: by default the review the
// POST said it created, so the by-id readback agrees with the create.
func (g *reviewGitHub) stored(id int64) string {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.bodies) == 0 {
		return `{}`
	}
	sent := g.bodies[len(g.bodies)-1]
	text, _ := sent["body"].(string)
	commit, _ := sent["commit_id"].(string)
	state := map[string]string{"APPROVE": "APPROVED", "REQUEST_CHANGES": "CHANGES_REQUESTED", "COMMENT": "COMMENTED"}[fmt.Sprint(sent["event"])]
	return fmt.Sprintf(`{"id":%d,"state":%q,"commit_id":%q,"body":%q,"user":{"id":4242}}`, id, state, commit, text)
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

// reviewAccount is the signed-in person's own linked GitHub account. Its
// identity is the one GitHub's `GET /user` answers below, because the worker
// refuses outright when the two disagree.
func reviewAccount() *fakeGitHubUserReposDB {
	queries := newFakeGitHubUserReposDB()
	queries.accounts = []db.OauthAccount{{
		Provider: "github", ProviderUserID: "4242", AccessTokenEncrypted: []byte("encrypted"),
	}}
	return queries
}

// reviewGitHubServer starts the GitHub under test for this case. It is
// started once per case so several service instances share one GitHub, the
// way a restarted server does.
func reviewGitHubServer(t *testing.T, github *reviewGitHub) {
	t.Helper()
	srv := httptest.NewServer(github.handler())
	t.Cleanup(srv.Close)
	t.Setenv(envGitHubAppAPIBaseURL, srv.URL)
}

// reviewService is one service instance on its own jobs.Store over `pool`.
// A test admits through one and runs the worker through another: that is a
// fresh process, not a second code path.
func reviewService(t *testing.T, pool *pgxpool.Pool) *GitHubUserReposService {
	t.Helper()
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	service := NewGitHubUserReposService(reviewAccount(), fakeOAuthTokenDecrypter{token: "gho_user"})
	service.SetGitHubPullReviewJobs(store)
	return service
}

// reviewWorld starts GitHub, an isolated PostgreSQL database and one service.
func reviewWorld(t *testing.T, github *reviewGitHub) (*GitHubUserReposService, *pgxpool.Pool) {
	t.Helper()
	reviewGitHubServer(t, github)
	pool, _ := postgresfixture.NewProductDatabase(t)
	return reviewService(t, pool), pool
}

// settleReview runs the REAL worker handler until the operation is terminal
// and answers the status door's own account-scoped reading of it.
func settleReview(t *testing.T, service *GitHubUserReposService, userID int64, operationID string) GitHubPullReviewStatus {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stopped := make(chan error, 1)
	go func() {
		stopped <- service.createJobs.RunWorker(ctx, jobs.WorkerConfig{
			WorkerID: "github-pull-review-test", Capacity: 1, Lease: 30 * time.Second,
			PollInterval: time.Millisecond, RetryDelay: 10 * time.Millisecond,
			Operations: []string{GitHubUserPullReviewOperation},
		}, service.HandleGitHubUserPullReview)
	}()
	deadline := time.Now().Add(30 * time.Second)
	for {
		status, err := service.GitHubPullReviewStatusOf(context.Background(), userID, operationID)
		require.NoError(t, err)
		if jobs.State(status.State).Terminal() {
			cancel()
			<-stopped
			return status
		}
		if time.Now().After(deadline) {
			cancel()
			<-stopped
			t.Fatalf("review never settled: %+v", status)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// submitReview admits one verdict and settles it on a FRESH service instance.
func submitReview(t *testing.T, github *reviewGitHub, input GitHubPullReviewInput) (GitHubPullReviewStatus, *pgxpool.Pool) {
	t.Helper()
	admitting, pool := reviewWorld(t, github)
	receipt, err := admitting.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
	require.NoError(t, err)
	require.NotEmpty(t, receipt.OperationID)
	require.Equal(t, jobs.StateAccepted, receipt.State, "admission answers before GitHub does")
	require.Equal(t, 0, github.writes(), "admission writes GitHub nothing")
	return settleReview(t, reviewService(t, pool), 42, receipt.OperationID), pool
}

func reviewInput(event string) GitHubPullReviewInput {
	body := ""
	if event != "APPROVE" {
		body = "please rename it"
	}
	return GitHubPullReviewInput{Event: event, Body: body, CommitID: reviewHead}
}

// reviewRow is GitHub's own JSON for one recorded review.
func reviewRow(id int64, state, commit, body string, user int64) string {
	return fmt.Sprintf(`{"id":%d,"state":%q,"commit_id":%q,"body":%q,"user":{"id":%d}}`, id, state, commit, body, user)
}

// The whole act: the identity, the subject, its state and the reviewed head
// are established first, then exactly ONE review is submitted and bound back
// to this intent.
func TestGitHubPullReview_EachVerdictReachesGitHubPinnedToTheReviewedHead(t *testing.T) {
	for event, state := range map[string]string{"APPROVE": "APPROVED", "REQUEST_CHANGES": "CHANGES_REQUESTED", "COMMENT": "COMMENTED"} {
		t.Run(event, func(t *testing.T) {
			input := reviewInput(event)
			github := &reviewGitHub{submit: func(int) (int, string) {
				return 201, reviewRow(55, state, reviewHead, input.Body, 4242)
			}}
			status, _ := submitReview(t, github, input)
			assert.Equal(t, string(jobs.StateCompleted), status.State)
			assert.True(t, status.Verified)
			assert.Equal(t, int64(55), status.ReviewID)
			assert.Equal(t, state, status.ReviewState)
			assert.Equal(t, reviewHead, status.CommitID)
			assert.Equal(t, githubPullReviewStageReadback, status.Stage)
			assert.Empty(t, status.Code)
			// The credential is proved, the head is read, the pre-write
			// witness is read, exactly ONE review is written, and the stored
			// review is read back by its own id before success.
			assert.Equal(t, []string{
				"GET /user",
				"GET /repos/octo/widget/pulls/7",
				"GET /repos/octo/widget/pulls/7/reviews",
				"POST /repos/octo/widget/pulls/7/reviews",
				"GET /repos/octo/widget/pulls/7/reviews/55",
			}, github.seen())
			github.mu.Lock()
			sent := github.bodies[0]
			github.mu.Unlock()
			// Nothing on this wire names an actor, a login or an on-behalf-of.
			assert.Equal(t, map[string]any{"event": event, "commit_id": reviewHead, "body": input.Body}, sent)
		})
	}
}

/*
 * The replay fence (#4038, review lead 1). One human intent, submitted again
 * after a lost acknowledgment, a browser reload or a server restart, is ONE
 * review. The second caller is a different service instance on a different
 * jobs store over the same database — a restarted process.
 */
func TestGitHubPullReview_OneIntentIsOneReviewAcrossAFreshProcess(t *testing.T) {
	github := &reviewGitHub{}
	admitting, pool := reviewWorld(t, github)
	input := reviewInput("APPROVE")

	first, err := admitting.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
	require.NoError(t, err)
	// Pressed again before the worker ran at all.
	second, err := admitting.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
	require.NoError(t, err)
	assert.Equal(t, first.OperationID, second.OperationID, "one intent is one operation")
	assert.True(t, second.Joined)

	// A fresh process runs the admitted intent.
	status := settleReview(t, reviewService(t, pool), 42, first.OperationID)
	require.Equal(t, string(jobs.StateCompleted), status.State)
	assert.Equal(t, 1, github.writes())

	// And pressed again AFTER it completed, by yet another fresh process.
	third, err := reviewService(t, pool).RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
	require.NoError(t, err)
	assert.Equal(t, first.OperationID, third.OperationID)
	assert.Equal(t, 1, github.writes(), "no repeat press records a second review")

	// The status door answers the same operation to a reader with no page
	// state at all, which is what surviving a browser reload means.
	reloaded, err := reviewService(t, pool).GitHubPullReviewStatusOf(context.Background(), 42, first.OperationID)
	require.NoError(t, err)
	assert.Equal(t, status, reloaded)
}

// A different verdict, or different text, on the same pull request at the
// same head is a DIFFERENT intent and gets its own operation.
func TestGitHubPullReview_ADifferentVerdictIsADifferentIntent(t *testing.T) {
	github := &reviewGitHub{submit: func(int) (int, string) {
		return 201, reviewRow(55, "COMMENTED", reviewHead, "please rename it", 4242)
	}}
	service, _ := reviewWorld(t, github)
	approve, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.NoError(t, err)
	comment, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("COMMENT"))
	require.NoError(t, err)
	assert.NotEqual(t, approve.OperationID, comment.OperationID)
	other, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7,
		GitHubPullReviewInput{Event: "COMMENT", Body: "a different sentence", CommitID: reviewHead})
	require.NoError(t, err)
	assert.NotEqual(t, comment.OperationID, other.OperationID, "the text is part of the intent")
}

/*
 * The reviewed-head fence. The head in the intent is the head the person SAW;
 * a pull request that has moved is refused BEFORE the send, and the refusal
 * is a settled failure GitHub proved absent, so the person may review the new
 * head as a new intent.
 */
func TestGitHubPullReview_MovedHeadIsRefusedWithoutWriting(t *testing.T) {
	github := &reviewGitHub{pull: func() (int, string) {
		return 200, fmt.Sprintf(`{"number":7,"state":"open","merged":false,"head":{"sha":%q}}`, reviewMovedHead)
	}}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubPullReviewCodeHeadMoved, status.Code)
	assert.Equal(t, githubPullReviewStageFence, status.Stage)
	assert.False(t, status.Verified)
	assert.Empty(t, status.ReviewID)
	assert.Equal(t, 0, github.writes())
}

func TestGitHubPullReview_ClosedOrOtherSubjectIsRefusedWithoutWriting(t *testing.T) {
	for name, answer := range map[string]struct{ body, code string }{
		"merged":         {fmt.Sprintf(`{"number":7,"state":"closed","merged":true,"head":{"sha":%q}}`, reviewHead), GitHubPullReviewCodeNotOpen},
		"closed":         {fmt.Sprintf(`{"number":7,"state":"closed","merged":false,"head":{"sha":%q}}`, reviewHead), GitHubPullReviewCodeNotOpen},
		"another number": {fmt.Sprintf(`{"number":9,"state":"open","merged":false,"head":{"sha":%q}}`, reviewHead), GitHubPullReviewCodeSubjectMismatch},
	} {
		t.Run(name, func(t *testing.T) {
			github := &reviewGitHub{pull: func() (int, string) { return 200, answer.body }}
			status, _ := submitReview(t, github, reviewInput("APPROVE"))
			assert.Equal(t, string(jobs.StateFailed), status.State)
			assert.Equal(t, answer.code, status.Code)
			assert.Equal(t, 0, github.writes())
		})
	}
}

func TestGitHubPullReview_RevokedAccessIsTypedAndWritesNothing(t *testing.T) {
	for status, expected := range map[int]string{
		http.StatusUnauthorized: GitHubPullReviewCodeReauthorize,
		http.StatusForbidden:    GitHubPullReviewCodePermission,
		http.StatusNotFound:     GitHubPullReviewCodePermission,
	} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			github := &reviewGitHub{submit: func(int) (int, string) { return status, `{"message":"ignored"}` }}
			settled, _ := submitReview(t, github, reviewInput("APPROVE"))
			assert.Equal(t, string(jobs.StateFailed), settled.State)
			assert.Equal(t, expected, settled.Code)
			assert.Equal(t, githubPullReviewStageSubmit, settled.Stage)
			// GitHub's own words never ride out.
			raw, err := json.Marshal(settled)
			require.NoError(t, err)
			assert.NotContains(t, string(raw), "ignored")
			// The refusal had no effect, so nothing is reconciled or resent.
			// The list was read exactly ONCE — the pre-write witness, before
			// the send — and the POST is the last request of all.
			assert.Equal(t, 1, github.writes())
			assert.Equal(t, 1, github.listed)
			seen := github.seen()
			assert.Equal(t, "POST /repos/octo/widget/pulls/7/reviews", seen[len(seen)-1])
		})
	}
}

// A 201 that names another head is not this intent: uncertain, never success,
// and never resent.
func TestGitHubPullReview_ReadbackAtAnotherHeadIsNotSuccess(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) { return 201, reviewRow(55, "APPROVED", reviewMovedHead, "", 4242) },
		list:   func(int) (int, string) { return 200, "[" + reviewRow(55, "APPROVED", reviewMovedHead, "", 4242) + "]" },
	}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.False(t, status.Verified)
	assert.Equal(t, 1, github.writes(), "an unconfirmed review is never resent")
}

func TestGitHubPullReview_AnotherAccountsReviewNeverSettlesMine(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) { return 201, `{"id":0}` },
		list:   func(int) (int, string) { return 200, "[" + reviewRow(77, "APPROVED", reviewHead, "", 9999) + "]" },
	}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.False(t, status.Verified)
	assert.Equal(t, 1, github.writes())
}

/*
 * The false-reconciliation fence (#4038, review lead 2). An OLDER review by
 * the SAME person, at the SAME head, with the SAME verdict but DIFFERENT
 * text, is a different review. It must never verify this one, whose write was
 * never acknowledged.
 */
func TestGitHubPullReview_AnOlderReviewWithDifferentTextNeverSettlesThisOne(t *testing.T) {
	intent := GitHubPullReviewInput{Event: "APPROVE", Body: "the text nobody recorded", CommitID: reviewHead}
	github := &reviewGitHub{
		// The POST left and its answer never arrived.
		submit: func(int) (int, string) { return 502, `{}` },
		list: func(int) (int, string) {
			return 200, "[" + reviewRow(11, "APPROVED", reviewHead, "an older, different review", 4242) + "]"
		},
	}
	status, _ := submitReview(t, github, intent)
	assert.Equal(t, string(jobs.StateUncertain), status.State, "a different review leaves this one unknown")
	assert.False(t, status.Verified)
	assert.Zero(t, status.ReviewID, "an uncertain operation names no review")
	assert.Equal(t, 1, github.writes(), "and is never resent")

	// And the same body IS this review, when it was created after the
	// pre-write witness: the fence binds text, it does not merely forbid
	// reconciliation.
	var sent bool
	older := reviewRow(11, "APPROVED", reviewHead, "an older, different review", 4242)
	exact := &reviewGitHub{
		submit: func(int) (int, string) { sent = true; return 502, `{}` },
		list: func(int) (int, string) {
			if !sent {
				return 200, "[" + older + "]"
			}
			return 200, "[" + older + "," + reviewRow(12, "APPROVED", reviewHead, intent.Body, 4242) + "]"
		},
	}
	settled, _ := submitReview(t, exact, intent)
	assert.Equal(t, string(jobs.StateCompleted), settled.State)
	assert.Equal(t, int64(12), settled.ReviewID, "the review this intent submitted, not the older one")
	assert.True(t, settled.Verified)
	assert.Equal(t, 1, exact.writes())
}

// A 201 is not "read back" on its own: the created review must carry THIS
// intent's text. One that does not sends the worker to GitHub's own list.
func TestGitHubPullReview_ACreatedReviewWithAnotherBodyIsNotThisIntent(t *testing.T) {
	intent := GitHubPullReviewInput{Event: "COMMENT", Body: "the sentence this operation submitted", CommitID: reviewHead}
	github := &reviewGitHub{
		submit: func(int) (int, string) {
			return 201, reviewRow(55, "COMMENTED", reviewHead, "somebody else's sentence", 4242)
		},
		list: func(int) (int, string) {
			return 200, "[" + reviewRow(55, "COMMENTED", reviewHead, "somebody else's sentence", 4242) + "]"
		},
	}
	status, _ := submitReview(t, github, intent)
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.False(t, status.Verified)
	assert.Equal(t, 1, github.writes())
	// The 201 was not taken as proof: GitHub's own list was read.
	assert.Contains(t, strings.Join(github.seen(), ","), "GET /repos/octo/widget/pulls/7/reviews")
}

func TestGitHubPullReview_LostAcknowledgementIsSettledByReadback(t *testing.T) {
	input := reviewInput("APPROVE")
	var sent bool
	github := &reviewGitHub{
		// A 500 is an answer whose meaning for the write is unknown.
		submit: func(int) (int, string) { sent = true; return 500, `{"message":"ignored"}` },
		list: func(int) (int, string) {
			if !sent {
				// The pre-write witness: the pull request carries no review yet.
				return 200, `[]`
			}
			return 200, "[" + reviewRow(88, "APPROVED", reviewHead, input.Body, 4242) + "]"
		},
	}
	status, _ := submitReview(t, github, input)
	require.Equal(t, string(jobs.StateCompleted), status.State)
	assert.Equal(t, int64(88), status.ReviewID)
	assert.Equal(t, reviewHead, status.CommitID)
	assert.True(t, status.Verified)
	assert.Equal(t, 1, github.writes(), "the recorded review is read, not resent")
}

func TestGitHubPullReview_LostAcknowledgementNobodyRecordedStaysUnknown(t *testing.T) {
	github := &reviewGitHub{
		submit: func(int) (int, string) { return 500, `{"message":"ignored"}` },
		list:   func(int) (int, string) { return 200, `[]` },
	}
	status, pool := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateUncertain), status.State,
		"an empty list is not proof the write never happened")
	assert.Equal(t, GitHubPullReviewCodeUncertain, status.Code)
	assert.False(t, status.Verified)
	assert.Equal(t, 1, github.writes())

	// An uncertain attempt is NEVER reopened: the same intent joins it and
	// the reader is sent to GitHub rather than pressing again.
	again, err := reviewService(t, pool).RequestAuthenticatedUserGitHubPullReview(
		context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.NoError(t, err)
	assert.Equal(t, status.OperationID, again.OperationID)
	assert.Equal(t, 1, github.writes(), "uncertain never turns into a fresh retry")
}

func TestGitHubPullReview_TruncatedHistoryIsNotProofOfAbsence(t *testing.T) {
	page := func(int) (int, string) {
		rows := make([]string, 0, githubPullReviewPageSize)
		for i := 0; i < githubPullReviewPageSize; i++ {
			rows = append(rows, reviewRow(int64(i+1), "COMMENTED", reviewHead, "someone else", 9999))
		}
		return 200, "[" + strings.Join(rows, ",") + "]"
	}
	github := &reviewGitHub{submit: func(int) (int, string) { return 500, `{}` }, list: page}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateUncertain), status.State)
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
			service, _ := reviewWorld(t, github)
			_, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, input)
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
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubPullReviewCodeRejected, status.Code)
	raw, err := json.Marshal(status)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "your own pull request")
	assert.Equal(t, 1, github.writes())
}

// GitHub's own answer about whose credential this is fences the write: an
// account whose link now names a different GitHub user writes nothing.
func TestGitHubPullReview_AChangedActorWritesNothing(t *testing.T) {
	github := &reviewGitHub{identity: func() (int, string) { return 200, `{"id":9999,"login":"somebody-else"}` }}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubPullReviewCodeActorChanged, status.Code)
	assert.Equal(t, githubPullReviewStageActor, status.Stage)
	assert.Equal(t, 0, github.writes())
}

func TestGitHubPullReview_UnconnectedAccountNeverWrites(t *testing.T) {
	github := &reviewGitHub{}
	reviewGitHubServer(t, github)
	pool, _ := postgresfixture.NewProductDatabase(t)
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	empty := newFakeGitHubUserReposDB()
	empty.accounts = nil
	service := NewGitHubUserReposService(empty, fakeOAuthTokenDecrypter{token: "gho_user"})
	service.SetGitHubPullReviewJobs(store)
	_, err = service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	assert.Empty(t, github.seen())
}

// Without a durable store the door is unavailable. It never falls back to
// writing GitHub inline from a request.
func TestGitHubPullReview_WithoutTheDurableStoreTheDoorIsUnavailable(t *testing.T) {
	github := &reviewGitHub{}
	reviewGitHubServer(t, github)
	service := NewGitHubUserReposService(reviewAccount(), fakeOAuthTokenDecrypter{token: "gho_user"})
	_, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeServiceUnavailable, apiErr.Code)
	assert.Empty(t, github.seen())
}

// One account's review operation is not readable by another account, and an
// id that names nothing is simply not found.
func TestGitHubPullReview_StatusIsScopedToTheAccount(t *testing.T) {
	github := &reviewGitHub{}
	service, _ := reviewWorld(t, github)
	receipt, err := service.RequestAuthenticatedUserGitHubPullReview(context.Background(), 42, "octo", "widget", 7, reviewInput("APPROVE"))
	require.NoError(t, err)
	_, err = service.GitHubPullReviewStatusOf(context.Background(), 43, receipt.OperationID)
	require.Error(t, err)
	var apiErr *pkgerrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeNotFound, apiErr.Code)
	_, err = service.GitHubPullReviewStatusOf(context.Background(), 42, "not-an-operation")
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, pkgerrors.CodeNotFound, apiErr.Code)
}

// A payload that names another account under this tenant never reaches a
// credential lookup, let alone GitHub.
func TestGitHubPullReview_APoisonedPayloadScopeWritesNothing(t *testing.T) {
	github := &reviewGitHub{}
	service, pool := reviewWorld(t, github)
	payload, err := json.Marshal(githubPullReviewJob{UserID: 99, GitHubUserID: "4242",
		Owner: "octo", Repo: "widget", Number: 7, Event: "APPROVE", CommitID: reviewHead})
	require.NoError(t, err)
	authorization, err := json.Marshal(map[string]any{"user_id": 99, "github_user_id": "4242"})
	require.NoError(t, err)
	receipt, err := service.createJobs.Admit(context.Background(), jobs.Admission{
		Scope: githubPullReviewScope(42), Operation: GitHubUserPullReviewOperation,
		RequestID: "poisoned-scope", Payload: payload,
		AuthorizationContext: authorization, EffectPolicy: jobs.EffectUnsafe,
	})
	require.NoError(t, err)
	status := settleReview(t, reviewService(t, pool), 42, receipt.OperationID)
	assert.Equal(t, string(jobs.StateFailed), status.State)
	assert.Equal(t, GitHubPullReviewCodeInvalid, status.Code)
	assert.Empty(t, github.seen(), "no credential of any account was loaded")
}

/*
 * The person-only rule is structural, not a convention in the handler: the
 * catalog descriptor the route is bound to admits only a person and never a
 * run, so the review-analysis workflow can return findings but no agent
 * credential can reach the door at all — and the request body it would have
 * to forge has no actor field. A queued job holding the original person's
 * fenced authorization does not change that: the worker writes only with
 * that person's own GitHub credential, and refuses when GitHub's own answer
 * names anybody else.
 */
func TestGitHubPullReview_CatalogCommandIsPersonOnly(t *testing.T) {
	policy, ok := OperationPolicy("github.account-review")
	require.True(t, ok, "the review door names a catalog command")
	assert.Equal(t, []string{"person"}, policy.Actors)
	assert.Equal(t, "never", policy.Agent)
	assert.Equal(t, "owner", policy.MinimumRole)
	assert.Equal(t, "write:repository", policy.CredentialScope)

	// The read command it sits beside is unchanged and still read-scoped —
	// and the new status door is a read of the caller's own account surface.
	read, ok := OperationPolicy("github.account-read")
	require.True(t, ok)
	assert.Equal(t, "read:repository", read.CredentialScope)
}

/*
 * The TEMPORAL half of the readback fence. An older review by the SAME
 * person, at the SAME head, with the SAME verdict and the SAME TEXT — a
 * person who already reviewed and then reviewed again with the same words —
 * is still a DIFFERENT review. Only the pre-write witness can tell them
 * apart: GitHub issues review ids in creation order, so this operation's
 * review has an id above every id that existed before the send.
 */
func TestGitHubPullReview_AnIdenticalOlderReviewNeverSettlesThisOne(t *testing.T) {
	intent := GitHubPullReviewInput{Event: "APPROVE", Body: "same words, an hour ago", CommitID: reviewHead}
	older := reviewRow(41, "APPROVED", reviewHead, intent.Body, 4242)
	github := &reviewGitHub{
		// The POST left and its answer never arrived.
		submit: func(int) (int, string) { return 502, `{}` },
		// GitHub's list holds ONLY that older, byte-identical review.
		list: func(int) (int, string) { return 200, "[" + older + "]" },
	}
	status, _ := submitReview(t, github, intent)
	assert.Equal(t, string(jobs.StateUncertain), status.State,
		"an identical earlier review is not proof this one was recorded")
	assert.False(t, status.Verified)
	assert.Zero(t, status.ReviewID)
	assert.Equal(t, 1, github.writes(), "and is never resent")

	// A review created AFTER the witness, with the same text, IS this one.
	var sent bool
	fresh := &reviewGitHub{
		submit: func(int) (int, string) { sent = true; return 502, `{}` },
		list: func(int) (int, string) {
			if !sent {
				// The pre-write witness read: only the older review exists.
				return 200, "[" + older + "]"
			}
			return 200, "[" + older + "," + reviewRow(42, "APPROVED", reviewHead, intent.Body, 4242) + "]"
		},
	}
	settled, _ := submitReview(t, fresh, intent)
	assert.Equal(t, string(jobs.StateCompleted), settled.State)
	assert.Equal(t, int64(42), settled.ReviewID, "the one created after the witness, not the older twin")
	assert.True(t, settled.Verified)
	assert.Equal(t, 1, fresh.writes())
}

// A `201` is not a readback. The review GitHub says it created is read back by
// its own id, and a create whose own answer cannot be read again, or reads
// back as something else, is unverified — never a success.
func TestGitHubPullReview_ACreateIsReadBackByItsOwnID(t *testing.T) {
	input := reviewInput("APPROVE")

	t.Run("the stored review cannot be read", func(t *testing.T) {
		github := &reviewGitHub{review: func(int64) (int, string) { return 500, `{}` }}
		status, _ := submitReview(t, github, input)
		assert.Equal(t, string(jobs.StateUncertain), status.State)
		assert.False(t, status.Verified)
		assert.Equal(t, 1, github.writes())
	})

	t.Run("the stored review is a different review", func(t *testing.T) {
		github := &reviewGitHub{review: func(id int64) (int, string) {
			return 200, reviewRow(id, "APPROVED", reviewHead, "not what this operation submitted", 4242)
		}}
		status, _ := submitReview(t, github, input)
		assert.NotEqual(t, string(jobs.StateCompleted), status.State)
		assert.False(t, status.Verified)
		assert.Equal(t, 1, github.writes())
	})

	t.Run("a created id at or below the witness is not this review", func(t *testing.T) {
		// GitHub answers 201 naming a review that already existed.
		existing := reviewRow(77, "APPROVED", reviewHead, input.Body, 4242)
		github := &reviewGitHub{
			submit: func(int) (int, string) { return 201, existing },
			list:   func(int) (int, string) { return 200, "[" + existing + "]" },
		}
		status, _ := submitReview(t, github, input)
		assert.NotEqual(t, string(jobs.StateCompleted), status.State)
		assert.False(t, status.Verified)
		assert.Equal(t, 1, github.writes())
	})
}

// The pre-write witness is read BEFORE the send, so a refused witness read
// reaches GitHub with no write at all.
func TestGitHubPullReview_AWitnessThatCannotBeEstablishedSettlesNothing(t *testing.T) {
	page := func(int) (int, string) {
		rows := make([]string, 0, githubPullReviewPageSize)
		for i := 0; i < githubPullReviewPageSize; i++ {
			rows = append(rows, reviewRow(int64(i+1), "COMMENTED", reviewHead, "someone else", 9999))
		}
		return 200, "[" + strings.Join(rows, ",") + "]"
	}
	github := &reviewGitHub{submit: func(int) (int, string) { return 500, `{}` }, list: page}
	status, _ := submitReview(t, github, reviewInput("APPROVE"))
	assert.Equal(t, string(jobs.StateUncertain), status.State)
	assert.Equal(t, githubPullReviewReadbackPages, github.listed,
		"the witness read is bounded, and an unestablished witness reconciles nothing")
	assert.Equal(t, 1, github.writes())
}

/*
 * The by-id readback, field by field. Everything below is AFTER a create
 * GitHub answered, so no outcome may be a settled failure: each one settles
 * `uncertain` or `readback_mismatch` and none of them resends.
 *
 * GitHub's own reference for this door: REST "Pulls / Reviews"
 * (api-version 2022-11-28) — `GET /repos/{o}/{r}/pulls/{n}/reviews/{review_id}`
 * reads one stored review, the list is chronological, and `Create a review`
 * answers 200 on the current API version as well as 201.
 */
func TestGitHubPullReview_TheStoredReviewMustStillBeThisIntent(t *testing.T) {
	input := reviewInput("REQUEST_CHANGES")
	for name, answer := range map[string]func(id int64) (int, string){
		"the stored review is gone": func(int64) (int, string) {
			return 404, `{"message":"Not Found"}`
		},
		"the stored review is unreadable": func(int64) (int, string) {
			return 200, `{"id":`
		},
		"the stored review names another id": func(int64) (int, string) {
			return 200, reviewRow(999, "CHANGES_REQUESTED", reviewHead, input.Body, 4242)
		},
		"the stored review sits at another head": func(id int64) (int, string) {
			return 200, reviewRow(id, "CHANGES_REQUESTED", reviewMovedHead, input.Body, 4242)
		},
		"the stored review belongs to another account": func(id int64) (int, string) {
			return 200, reviewRow(id, "CHANGES_REQUESTED", reviewHead, input.Body, 9999)
		},
		"the stored review carries another verdict": func(id int64) (int, string) {
			return 200, reviewRow(id, "APPROVED", reviewHead, input.Body, 4242)
		},
		"the stored review carries other text": func(id int64) (int, string) {
			return 200, reviewRow(id, "CHANGES_REQUESTED", reviewHead, "not what was submitted", 4242)
		},
	} {
		t.Run(name, func(t *testing.T) {
			github := &reviewGitHub{
				submit: func(int) (int, string) {
					return 201, reviewRow(55, "CHANGES_REQUESTED", reviewHead, input.Body, 4242)
				},
				review: answer,
				// The reconcile that follows finds nothing above the witness.
				list: func(int) (int, string) { return 200, `[]` },
			}
			status, _ := submitReview(t, github, input)
			assert.NotEqual(t, string(jobs.StateCompleted), status.State, "an unproved review is never a success")
			assert.NotEqual(t, string(jobs.StateFailed), status.State, "and never a settled failure a client may repeat")
			assert.False(t, status.Verified)
			assert.Zero(t, status.ReviewID)
			assert.Equal(t, 1, github.writes(), "exactly one POST, whatever the readback said")
			// The stored review WAS read: a 2xx create is not the readback.
			assert.Contains(t, strings.Join(github.seen(), ","), "GET /repos/octo/widget/pulls/7/reviews/55")
		})
	}
}

// GitHub's current API version answers `Create a review` with 200; the older
// documented answer was 201. Both are the same act, and both are read back.
func TestGitHubPullReview_ACreateAnsweredTwoHundredIsTheSameAct(t *testing.T) {
	for _, created := range []int{200, 201} {
		t.Run(fmt.Sprint(created), func(t *testing.T) {
			input := reviewInput("COMMENT")
			github := &reviewGitHub{submit: func(int) (int, string) {
				return created, reviewRow(61, "COMMENTED", reviewHead, input.Body, 4242)
			}}
			status, _ := submitReview(t, github, input)
			assert.Equal(t, string(jobs.StateCompleted), status.State)
			assert.True(t, status.Verified)
			assert.Equal(t, int64(61), status.ReviewID)
			assert.Equal(t, 1, github.writes())
			assert.Equal(t, 1, github.read, "the stored review is read back exactly once")
		})
	}
}
