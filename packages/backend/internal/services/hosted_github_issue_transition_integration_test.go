package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
A repository policy flow moves one of its own issues through its own states,
proposed to accepted, on the REAL GitHub tracker (M-47, #4027).

The fixture is lane 64's hosted writer end to end — a real PostgreSQL
database, three people with three GitHub identities, and githubfake over real
HTTP holding GitHub's own issues, labels and comments — plus the one thing a
transition adds: the repository's committed `.smithers/factory.json`, served
through the EXISTING policy reader the stack already reads the factory policy
through (SetPolicyReader).

Every assertion about an act's effect is read back off GitHub's own state,
never off a receipt the product wrote about itself. No live GitHub request is
made, and no mock stands at the authorization or write boundary: the
authority is the product's own resolver and GitHub's own answer.
*/

// transitionPolicyHost serves one factory projection on each repository's
// default bookmark, as the repo host does from a commit.
type transitionPolicyHost struct {
	factory string
	fileErr error
	reads   []string
}

func (h *transitionPolicyHost) GetBookmark(_ context.Context, _, _, name string) (repohost.Bookmark, error) {
	if name != "main" {
		return repohost.Bookmark{}, &repohost.StatusError{StatusCode: 404, Code: "bookmark_not_found"}
	}
	return repohost.Bookmark{Name: "main", TargetCommitID: strings.Repeat("a", 40)}, nil
}

func (h *transitionPolicyHost) GetFileAtChange(context.Context, string, string, string, string) (repohost.FileContent, error) {
	return repohost.FileContent{}, errors.New("a transition reads main's commit, never a change")
}

func (h *transitionPolicyHost) GetFileAtCommit(_ context.Context, owner, repo, commit, path string) (repohost.FileContent, error) {
	h.reads = append(h.reads, fmt.Sprintf("%s/%s@%s:%s", owner, repo, commit[:7], path))
	if h.fileErr != nil {
		return repohost.FileContent{}, h.fileErr
	}
	if h.factory == "" {
		return repohost.FileContent{}, &repohost.StatusError{StatusCode: 404, Code: "file_not_found"}
	}
	return repohost.FileContent{Content: h.factory}, nil
}

// The declaration under test: proposed to accepted is a PERSON's move, and
// triage is the one the repository did not reserve.
const transitionFactory = `{"summary":"How we move issues.","flows":[],"on":[],
"github":{"mirror":"pull","issues":"two-way","changes":"send-upstream"},
"issueTransitions":[
 {"id":"triage","title":"Triage it","to":"needs-triage","actor":"anyone"},
 {"id":"accept","title":"Accept the proposal","from":"proposed","to":"accepted","actor":"person"}]}`

// declare wires the repository's committed declaration into the fixture's
// service through the existing policy reader.
func (f *hostedIssueFixture) declare(factory string) *transitionPolicyHost {
	host := &transitionPolicyHost{factory: factory}
	f.service.SetPolicyReader(host)
	return host
}

// labels is GitHub's own answer about one issue's labels.
func (f *hostedIssueFixture) labels(t *testing.T, repo string, number int64) []string {
	t.Helper()
	issue, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	return issue.Labels
}

// comments is GitHub's own answer about what has been said on one issue.
func (f *hostedIssueFixture) comments(t *testing.T, repo string, number int64) []string {
	t.Helper()
	issue, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	said := make([]string, 0, len(issue.Comments))
	for _, comment := range issue.Comments {
		said = append(said, comment.Body)
	}
	return said
}

// TestDeclaredIssueTransitionReachesGitHubAndIsAttributed is the acceptance
// line: the declared proposed-to-accepted move happens on GitHub's own
// issue, through the repository's existing labels, and the attribution on
// the issue card names the repository flow and the person who ran it.
func TestDeclaredIssueTransitionReachesGitHubAndIsAttributed(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")
	require.Equal(t, []string{"proposed"}, f.labels(t, repo, number))

	receipt, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "accept-1")
	require.NoError(t, err)
	require.Equal(t, "requested", receipt.Kind)
	// The acknowledgment is the ADMISSION: GitHub has not been asked yet.
	require.Equal(t, []string{"proposed"}, f.labels(t, repo, number))
	require.Empty(t, f.comments(t, repo, number))

	// The same key admits the same operation: never a second label write.
	replay, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "accept-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)

	require.Equal(t, jobs.StateCompleted, f.work(t, receipt.OperationID))

	// GitHub's own state: the declared move, on the repository's existing
	// labels. No second issue tracker, no new state field.
	require.Equal(t, []string{"accepted"}, f.labels(t, repo, number))
	issue, ok := f.fake.Issue(repo, number)
	require.True(t, ok)
	assert.Equal(t, "open", issue.State, "a transition never closes, merges or approves anything")

	// The attribution is visible on the issue card and names the repository
	// flow, the move and the person who ran it.
	said := f.comments(t, repo, number)
	require.Len(t, said, 1, "the attribution is said once")
	assert.Contains(t, said[0], "Accept the proposal")
	assert.Contains(t, said[0], "proposed → accepted")
	assert.Contains(t, said[0], `"accept"`)
	assert.Contains(t, said[0], "@will")
	for _, forbidden := range []string{"Bearer", "ghu_", "/api/", "installation"} {
		assert.NotContains(t, said[0], forbidden)
	}

	// And the durable receipt carries the same facts, so attribution survives
	// a reload with no card in memory: this is read straight back out of
	// PostgreSQL.
	status, err := f.service.GitHubIssueRequestStatus(ctx, f.flows, receipt.OperationID)
	require.NoError(t, err)
	require.Equal(t, jobs.StateCompleted, status["state"])
	var stored []byte
	require.NoError(t, f.pool.QueryRow(context.Background(),
		"SELECT terminal_receipt FROM product_job_requests WHERE id=$1", receipt.OperationID).Scan(&stored))
	var durable struct {
		State      string `json:"state"`
		Transition string `json:"transition"`
		Label      string `json:"label"`
		Login      string `json:"login"`
	}
	require.NoError(t, json.Unmarshal(stored, &durable))
	assert.Equal(t, "completed", durable.State)
	assert.Equal(t, "accept", durable.Transition)
	assert.Equal(t, "accepted", durable.Label)
	assert.Equal(t, "will", durable.Login)

	// Repeating the WHOLE act replays the one admitted operation: the labels
	// stand and the attribution is still said exactly once.
	again, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "accept-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, again.OperationID)
	require.Equal(t, []string{"accepted"}, f.labels(t, repo, number))
	require.Len(t, f.comments(t, repo, number), 1)
}

// An UNDECLARED transition changes nothing: it is refused before admission,
// so no durable operation exists for it and GitHub is never asked.
func TestAnUndeclaredTransitionMakesNoExternalRequest(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")
	before := f.admitted(t)

	for _, id := range []string{"merge", "shipped", "accepted"} {
		_, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, id, "undeclared-"+id)
		require.Error(t, err, id)
		var control *TodoControlError
		require.ErrorAs(t, err, &control, id)
		assert.Equal(t, "issue_transition_undeclared", control.Code, id)
	}
	assert.Equal(t, before, f.admitted(t), "a refused transition admits nothing")
	assert.Equal(t, []string{"proposed"}, f.labels(t, repo, number), "the issue's GitHub state is untouched")
	assert.Empty(t, f.comments(t, repo, number))
	// A repository that declares nothing allows nothing, by the same rule.
	f.declare("")
	_, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "nothing-declared")
	require.Error(t, err)
	assert.Equal(t, before, f.admitted(t))
}

// An agent cannot make a move the repository says a person has to make, and
// the refusal happens before admission.
func TestAnAgentCannotRunAPersonOnlyTransitionOnGitHub(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")
	before := f.admitted(t)

	// An agent account, classified by the product's own credential rules.
	_, err := f.pool.Exec(context.Background(), `UPDATE users SET user_type='bot' WHERE id=$1`, f.writer)
	require.NoError(t, err)
	agent := middleware.ContextWithAuthInfo(context.Background(),
		&middleware.AuthInfo{User: &db.User{ID: f.writer, Username: "will", UserType: "bot"}})
	_, err = f.service.RequestGitHubIssueTransition(agent, f.flows, number, "accept", "agent-accept")
	require.Error(t, err)
	var refusal *AccessError
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, "permission", refusal.Code)
	assert.Equal(t, before, f.admitted(t), "a person-only move admits nothing for an agent")
	assert.Equal(t, []string{"proposed"}, f.labels(t, repo, number))
	assert.Empty(t, f.comments(t, repo, number))
}

// A read-only collaborator and a stranger are refused by the product's own
// rules, and a transition can never address another repository.
func TestATransitionRespectsTheExistingIssueWriteAuthority(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")
	before := f.admitted(t)

	// ana reads flows and writes nothing.
	_, err := f.service.RequestGitHubIssueTransition(f.session(f.reader, "ana"), f.flows, number, "accept", "ana-accept")
	require.Error(t, err)
	// zed holds no place on flows at all.
	_, err = f.service.RequestGitHubIssueTransition(f.session(f.stranger, "zed"), f.flows, number, "accept", "zed-accept")
	require.Error(t, err)
	// And will cannot reach a repository that is not theirs.
	_, err = f.service.RequestGitHubIssueTransition(f.session(f.writer, "will"), f.foreign, number, "accept", "will-foreign")
	require.Error(t, err)

	assert.Equal(t, before, f.admitted(t), "no refused actor admits anything")
	assert.Equal(t, []string{"proposed"}, f.labels(t, repo, number))
	assert.Empty(t, f.comments(t, repo, number))
}

// settles waits for one operation to reach any non-running state, including
// the non-terminal `waiting` a parked act rests in.
func (f *hostedIssueFixture) settles(t *testing.T, id string) jobs.State {
	t.Helper()
	worker, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	go func() {
		_ = f.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "transition-" + id, Capacity: 1, Lease: time.Minute,
			PollInterval: 10 * time.Millisecond, Operations: IssueWriteOperations()}, f.service.HandleInstallIssueWrite)
	}()
	var state string
	require.Eventually(t, func() bool {
		if err := f.pool.QueryRow(context.Background(), "SELECT state FROM product_job_requests WHERE id=$1", id).Scan(&state); err != nil {
			return false
		}
		return state == string(jobs.StateCompleted) || state == string(jobs.StateFailed) ||
			state == string(jobs.StateUncertain) || state == string(jobs.StateWaiting)
	}, 15*time.Second, 20*time.Millisecond, "operation %s must settle, last state %q", id, state)
	return jobs.State(state)
}

// A post-write readback that does not show the move is UNCERTAIN, never a
// performed transition: the write may have happened, so the act is PARKED for
// reconciliation rather than completed (which would claim a move GitHub did
// not make) or failed (which would let a client send the same transition
// again). The attribution is not said, because nothing has been confirmed.
//
// The disagreement is produced the way it happens in production: somebody
// re-applies the label the transition leaves, between the write and the
// readback. `OnNextRequest` is githubfake's own hook for exactly that.
func TestATransitionWhoseReadbackDoesNotConfirmIsParkedNotCompleted(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")

	f.fake.OnNextRequest("GET", fmt.Sprintf("/repos/will/flows/issues/%d", number), func() {
		f.fake.LabelIssue(repo, number, "ana", "proposed")
	})

	receipt, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "unconfirmed-1")
	require.NoError(t, err)
	state := f.settles(t, receipt.OperationID)
	assert.Equal(t, jobs.StateWaiting, state,
		"an unconfirmed move is parked for reconciliation, not settled either way")
	assert.NotEqual(t, jobs.StateFailed, state, "a failed generation would permit a duplicate write")
	assert.NotEqual(t, jobs.StateCompleted, state, "nothing may claim a move the readback did not show")

	// Nothing claimed the move happened: no attribution was said.
	assert.Empty(t, f.comments(t, repo, number), "attribution is only true after a readback that confirms")

	// And asking again resumes the ONE admitted operation under its own key.
	replay, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "unconfirmed-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
}

// A label write whose reply is LOST — GitHub applied it and the connection
// died — stays UNCERTAIN, exactly as every other unsafe issue write does
// (lane 64's TestHostedGitHubIssueLostReplyStaysUncertain). It is never a
// settled failure, because a failure would let a client send the same
// transition again, and never a completion, because nothing was confirmed.
// Asking again resumes the ONE admitted operation instead of posting twice.
func TestALostLabelWriteReplyStaysUncertainAndNeverRepeatsThePost(t *testing.T) {
	f := newHostedIssueFixture(t)
	f.declare(transitionFactory)
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")

	f.fake.LoseNextResponses(fmt.Sprintf("/repos/will/flows/issues/%d/labels", number), 1)

	receipt, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "lost-1")
	require.NoError(t, err)
	state := f.settles(t, receipt.OperationID)
	assert.Equal(t, jobs.StateUncertain, state)
	assert.NotEqual(t, jobs.StateFailed, state, "a failed generation would permit a duplicate label write")
	assert.NotEqual(t, jobs.StateCompleted, state, "the reply was lost: nothing confirmed the move")

	// GitHub did take the label, and exactly once: the write was not repeated.
	assert.ElementsMatch(t, []string{"accepted", "proposed"}, f.labels(t, repo, number),
		"the applied label stands; the one the move leaves was never removed, because the act stopped")
	// And nothing claimed the move happened.
	assert.Empty(t, f.comments(t, repo, number), "attribution is only true after a readback that confirms")

	// Asking again resumes the one admitted operation under its own key.
	replay, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "lost-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
	assert.ElementsMatch(t, []string{"accepted", "proposed"}, f.labels(t, repo, number))
	assert.Empty(t, f.comments(t, repo, number))
}

// A declaration this server could not read is UNKNOWN policy: the act is
// refused rather than treated as "nothing declared" (which would allow
// nothing) or as "no rule applies" (which would allow everything).
func TestAnUnreadableDeclarationRefusesRatherThanGuesses(t *testing.T) {
	f := newHostedIssueFixture(t)
	host := f.declare(transitionFactory)
	host.fileErr = &repohost.StatusError{StatusCode: 500}
	ctx := f.session(f.writer, "will")
	const repo = "will/flows"
	number := f.fake.OpenIssue(repo, "will", "A proposal", "Body")
	f.fake.LabelIssue(repo, number, "will", "proposed")
	before := f.admitted(t)

	_, err := f.service.RequestGitHubIssueTransition(ctx, f.flows, number, "accept", "unreadable-1")
	require.Error(t, err)
	var control *TodoControlError
	require.ErrorAs(t, err, &control)
	assert.Equal(t, "issue_transition_policy_unreadable", control.Code)
	assert.Equal(t, before, f.admitted(t))
	assert.Equal(t, []string{"proposed"}, f.labels(t, repo, number))
}

// The declaration is read from the repository's OWN default bookmark, and the
// repository the act names is the one whose declaration decides: a
// transition declared by one repository is not declared by another.
func TestTheDeclarationIsReadFromTheRepositoryTheActNames(t *testing.T) {
	f := newHostedIssueFixture(t)
	host := f.declare(transitionFactory)
	ctx := f.session(f.writer, "will")
	number := f.fake.OpenIssue("will/docs", "will", "A proposal", "Body")
	f.fake.LabelIssue("will/docs", number, "will", "proposed")

	_, err := f.service.RequestGitHubIssueTransition(ctx, f.docs, number, "accept", "docs-accept")
	require.NoError(t, err)
	require.NotEmpty(t, host.reads)
	assert.Contains(t, host.reads[len(host.reads)-1], "will/docs@",
		"the declaration comes off the repository the act names")
	assert.Contains(t, host.reads[len(host.reads)-1], ".smithers/factory.json")
}
