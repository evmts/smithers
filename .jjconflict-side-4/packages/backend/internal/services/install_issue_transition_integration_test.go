package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

/*
The install's declared issue transition, end to end (#4067, M-47).

The install client addresses every GitHub issue act at `/api/issues{path}`
(`IssuesSeam.ts` `githubIssueActUrl`), so a declared transition arrives as
`POST /api/issues/{number}/transitions/{id}` — a door the install
composition did not serve, while the identical hosted act did. These tests
are the act's own regression, on the install's AUTHORITY:

  - a real PostgreSQL database and the real durable writer (admission in its
    own transaction, the one shared issue-write worker, the credential
    reload, the actor's re-authorization and the send fence);
  - githubfake over real HTTP holding GitHub's own issues, labels and
    comments, so every effect is read back off GitHub's state rather than off
    a receipt the product wrote about itself;
  - the install's own GitHub destination (`mirror_destination`, through
    `stackGitHub`) and the repository's own committed declaration at its
    DEFAULT BOOKMARK, read through the existing policy reader
    (`SetPolicyReader`).

No mock stands at the authorization or write boundary, and no live GitHub
request is made.
*/

var installTransitionCredentials atomic.Int64

// installTransitionFixture is the install issue-write fixture plus the one
// thing a transition adds: the repository's committed declaration.
type installTransitionFixture struct {
	*issueActsFixture
	policy *transitionPolicyHost
}

func newInstallTransitionFixture(t *testing.T, factory string) *installTransitionFixture {
	t.Helper()
	f := &installTransitionFixture{issueActsFixture: newIssueActsFixture(t)}
	f.policy = &transitionPolicyHost{factory: factory}
	f.service.SetPolicyReader(f.policy)
	return f
}

// installRepo is the GitHub repository THIS install writes, which is the
// install's own mirror destination rather than anything a request names.
const installRepo = "rehearsal-owner/app"

// settles waits for one operation to leave running, including the
// non-terminal `waiting` a parked act rests in. Every operation the shared
// worker claims is registered, the install's and the hosted composition's.
func (f *installTransitionFixture) settles(t *testing.T, id string) jobs.State {
	t.Helper()
	worker, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	go func() {
		_ = f.jobs.RunWorker(worker, jobs.WorkerConfig{WorkerID: "install-transition-" + id, Capacity: 1, Lease: time.Minute,
			PollInterval: 10 * time.Millisecond, Operations: IssueWriteOperations()}, f.service.HandleInstallIssueWrite)
	}()
	var state string
	require.Eventually(t, func() bool {
		if err := f.pool.QueryRow(context.Background(), "SELECT state FROM product_job_requests WHERE id=$1", id).Scan(&state); err != nil {
			return false
		}
		return state == string(jobs.StateCompleted) || state == string(jobs.StateFailed) ||
			state == string(jobs.StateUncertain) || state == string(jobs.StateWaiting)
	}, 25*time.Second, 20*time.Millisecond, "operation %s must settle, last state %q", id, state)
	return jobs.State(state)
}

func (f *installTransitionFixture) admitted(t *testing.T) int64 {
	t.Helper()
	var count int64
	require.NoError(t, f.pool.QueryRow(context.Background(), "SELECT count(*) FROM product_job_requests").Scan(&count))
	return count
}

// labels and comments are GitHub's own answers about one issue.
func (f *installTransitionFixture) labels(t *testing.T, number int64) []string {
	t.Helper()
	issue, ok := f.fake.Issue(installRepo, number)
	require.True(t, ok)
	return issue.Labels
}

func (f *installTransitionFixture) comments(t *testing.T, number int64) []string {
	t.Helper()
	issue, ok := f.fake.Issue(installRepo, number)
	require.True(t, ok)
	said := make([]string, 0, len(issue.Comments))
	for _, comment := range issue.Comments {
		said = append(said, comment.Body)
	}
	return said
}

// proposal is one GitHub issue already carrying the label the declared move
// leaves behind.
func (f *installTransitionFixture) proposal(t *testing.T) int64 {
	t.Helper()
	number := f.fake.OpenIssue(installRepo, "rehearsal-owner", "A proposal", "Body")
	f.fake.LabelIssue(installRepo, number, "rehearsal-owner", "proposed")
	require.Equal(t, []string{"proposed"}, f.labels(t, number))
	return number
}

// agent is one system-issued delegated credential for this install's owner,
// reloaded through the same credential path the HTTP chain uses and bound to
// the install the same way the fixture's person is. `via` is what tells the
// app's own agent apart from an external one.
func (f *installTransitionFixture) agent(t *testing.T, via string) context.Context {
	t.Helper()
	q := db.New(f.pool)
	sum := sha256.Sum256([]byte(fmt.Sprintf("install-agent-%s-%d", via, installTransitionCredentials.Add(1))))
	hash := hex.EncodeToString(sum[:])
	scopes := "read:repository,write:repository,via:" + via
	if via == "smithers" {
		// An app-agent bearer belongs to exactly one LIVE producer
		// generation, so the credential only authenticates while its own
		// turn runs. That is the real credential, not a looser stand-in.
		turn := uuid.NewString()
		_, err := f.pool.Exec(context.Background(), `INSERT INTO chat_turns
 (id,user_id,run_id,leg_id,request_hash,access_hash,state,producer_generation,producer_token_hash,producer_lease_expires_at)
 VALUES($1,$2,$1,'fixture','fixture','fixture','running',1,'fixture',NOW()+interval '1 hour')`, turn, f.userID)
		require.NoError(t, err)
		scopes += ",terminal-session:" + turn + "/1"
	}
	_, err := q.CreateAccessToken(context.Background(), db.CreateAccessTokenParams{
		UserID: f.userID, Name: "install-agent-" + via, TokenHash: hash, TokenLastEight: hash[len(hash)-8:],
		Scopes: scopes, SystemIssued: true,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	})
	require.NoError(t, err)
	info, err := middleware.ReloadCredential(context.Background(), q, middleware.Credential{TokenHash: hash}, time.Now())
	require.NoError(t, err)
	return middleware.ContextWithAuthInfo(context.Background(), info)
}

// The acceptance line: the declared proposed-to-accepted move happens on
// GitHub's own issue through the repository's existing labels, GitHub is read
// back before anything claims it, and the attribution on the issue card names
// the repository transition and the person who ran it.
func TestInstallDeclaredIssueTransitionReachesGitHubAndIsAttributed(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)

	receipt, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "accept-1")
	require.NoError(t, err)
	require.Equal(t, "requested", receipt.Kind, "the acknowledgment precedes the network write")
	require.NotEmpty(t, receipt.OperationID)
	assert.Equal(t, []string{"proposed"}, f.labels(t, number), "admission alone asks nothing of GitHub")
	assert.Empty(t, f.comments(t, number))

	// One key is one operation: the same intent never becomes a second write.
	replay, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "accept-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)

	require.Equal(t, jobs.StateCompleted, f.settles(t, receipt.OperationID))

	// GitHub's own answer: the label the move applies is on, the one it
	// leaves is off.
	assert.Equal(t, []string{"accepted"}, f.labels(t, number))

	// The declaration was read at the repository's own DEFAULT BOOKMARK,
	// both on admission and again on the worker.
	require.NotEmpty(t, f.policy.reads)
	for _, read := range f.policy.reads {
		assert.True(t, strings.HasSuffix(read, ":"+factoryProjectionPath), read)
	}

	// The attribution, said once, and only after the readback confirmed it.
	said := f.comments(t, number)
	require.Len(t, said, 1)
	assert.Contains(t, said[0], "Accept the proposal")
	assert.Contains(t, said[0], "proposed → accepted")
	assert.Contains(t, said[0], `"accept"`)
	assert.Contains(t, said[0], "@rehearsal-owner", "the PERSON who ran it")
	assert.Contains(t, said[0], "smithers", "the repository whose flow made the move")
	for _, forbidden := range []string{"token", "Bearer", "/api/", "credential", "installation", "Idempotency"} {
		assert.NotContains(t, said[0], forbidden)
	}

	// The outcome is readable without repeating the write, through the same
	// request-status door every other install issue act answers on.
	status, err := f.service.InstallIssueCreateStatus(f.ctx, f.repoID, receipt.OperationID)
	require.NoError(t, err)
	assert.Equal(t, jobs.StateCompleted, status["state"])

	// And the same intent again replays the one completed operation: no
	// second label write and no second attribution.
	again, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "accept-1")
	require.NoError(t, err)
	assert.Equal(t, receipt.OperationID, again.OperationID)
	assert.Equal(t, []string{"accepted"}, f.labels(t, number))
	assert.Len(t, f.comments(t, number), 1, "one attribution per operation, never one per request")
}

// Everything the act can refuse, it refuses BEFORE any durable operation
// exists — so nothing is asked of GitHub and the issue's GitHub state is
// untouched by the refusal.
func TestInstallIssueTransitionRefusalsReachGitHubWithNoEffect(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)
	before := f.admitted(t)

	for _, tc := range []struct {
		name, transition, key, code string
		status                      int
		prepare                     func()
	}{
		{name: "a transition the repository does not declare", transition: "promote", key: "undeclared-1",
			status: 404, code: "issue_transition_undeclared"},
		{name: "an id no declaration could carry", transition: "Accept", key: "shape-1",
			status: 404, code: "issue_transition_undeclared"},
		{name: "an empty id", transition: "", key: "shape-2",
			status: 404, code: "issue_transition_undeclared"},
		{name: "a repository that declares nothing", transition: "accept", key: "none-1",
			status: 404, code: "issue_transition_undeclared", prepare: func() { f.policy.factory = "" }},
		{name: "a declaration this server could not read", transition: "accept", key: "unreadable-1",
			status: 422, code: "issue_transition_policy_unreadable",
			prepare: func() { f.policy.fileErr = &repohost.StatusError{StatusCode: 500} }},
		{name: "a malformed declaration", transition: "accept", key: "malformed-1",
			status: 422, code: "issue_transition_policy_unreadable",
			prepare: func() { f.policy.factory, f.policy.fileErr = `{"issueTransitions":[{"id":"accept","to":""}]}`, nil }},
		{name: "a declaration on a bookmark that is not the repository's default", transition: "accept", key: "bookmark-1",
			status: 404, code: "issue_transition_undeclared",
			prepare: func() {
				f.policy.factory, f.policy.fileErr = transitionFactory, nil
				// The declaration lives on `main`; this repository's default
				// bookmark is a release line, so it declares nothing. A
				// branch is not the repository's word.
				_, err := f.pool.Exec(context.Background(), `UPDATE repositories SET default_bookmark='release' WHERE id=$1`, f.repoID)
				require.NoError(t, err)
			}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.prepare != nil {
				tc.prepare()
			}
			_, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, tc.transition, tc.key)
			requireTodoControl(t, err, tc.status, tc.code)
		})
	}

	// An unusable subject is the ordinary issue refusal, not a policy one.
	_, err := f.pool.Exec(context.Background(), `UPDATE repositories SET default_bookmark='main' WHERE id=$1`, f.repoID)
	require.NoError(t, err)
	f.policy.factory, f.policy.fileErr = transitionFactory, nil
	for _, tc := range []struct {
		name, key string
		number    int64
	}{
		{name: "no issue", key: "subject-1", number: 0},
		{name: "no key", key: "", number: number},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, tc.number, "accept", tc.key)
			requireTodoControl(t, err, 400, "invalid_issue_state")
		})
	}

	// A repository that is not the install's own: the number belongs to the
	// install's repository, never to a caller-named one.
	_, err = f.service.RequestInstallIssueTransition(f.ctx, f.repoID+1000, number, "accept", "foreign-1")
	require.Error(t, err)

	assert.Equal(t, before, f.admitted(t), "no refusal admitted a durable operation")
	assert.Equal(t, []string{"proposed"}, f.labels(t, number), "GitHub was never asked")
	assert.Empty(t, f.comments(t, number))
}

// An agent gets no authority of its own on this door. The install's EXISTING
// catalog rule for `issues.transition` decides first — agent "confirm" with
// actors ["person", "app_agent"] — so an external agent is refused outright
// and the app's own agent is routed to a person's confirmation rather than
// writing GitHub itself. Both answers are the ones the install's close door
// already gives the same credential, which is the oracle below: the
// transition door is not a softer way in, and the repository's declaration
// can only narrow this further, never widen it.
func TestInstallIssueTransitionGivesAnAgentNoAuthorityItsSiblingsRefuse(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)
	before := f.admitted(t)

	for _, via := range []string{"codex", "smithers"} {
		t.Run("the "+via+" agent is answered as the close door answers it", func(t *testing.T) {
			agent := registerTestInstallCredential(t, f.pool, f.agent(t, via), f.repoID)
			// The sibling act on the same durable writer, same credential.
			_, sibling := f.service.RequestInstallIssueClose(agent, f.repoID, number, "agent-close-"+via)
			var oracle *AccessError
			require.ErrorAs(t, sibling, &oracle, "the close door must refuse this agent too")

			_, err := f.service.RequestInstallIssueTransition(agent, f.repoID, number, "accept", "agent-accept-"+via)
			var refusal *AccessError
			require.ErrorAs(t, err, &refusal)
			assert.Equal(t, oracle.Status, refusal.Status)
			assert.Equal(t, oracle.Code, refusal.Code)
			assert.Equal(t, oracle.Message, refusal.Message)
			// And the answer is a refusal, so the comparison is not vacuous.
			assert.NotEqual(t, 200, refusal.Status)
			assert.Contains(t, []int{403, 503}, refusal.Status)
		})
	}
	// `triage` is the move the repository left to ANYONE, and an external
	// agent is still refused it: the declaration narrowed nothing here, so
	// the server's own catalog row is what answers.
	external := registerTestInstallCredential(t, f.pool, f.agent(t, "codex"), f.repoID)
	_, err := f.service.RequestInstallIssueTransition(external, f.repoID, number, "triage", "external-triage")
	var refusal *AccessError
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, 403, refusal.Status)
	assert.Equal(t, "permission", refusal.Code)

	// A declaration that says a person must make the move is still the
	// repository's own word, and it is read for the person who may ask.
	declared, err := authorizeIssueTransition(f.ctx, f.policy, "smithers-canary", db.Repository{Name: "smithers", DefaultBookmark: "main"}, "accept")
	require.NoError(t, err)
	assert.True(t, declared.NeedsPerson(), "the repository reserved this move for a person")

	assert.Equal(t, before, f.admitted(t), "a refused agent admitted nothing")
	assert.Equal(t, []string{"proposed"}, f.labels(t, number))
	assert.Empty(t, f.comments(t, number))
}

// The labels come from the DECLARATION, re-read on the worker — so an
// admitted act whose transition the repository has STOPPED declaring is
// refused there too, before any request, rather than carrying stale labels.
func TestInstallIssueTransitionStopsWhenTheDeclarationChanges(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)

	receipt, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "stale-1")
	require.NoError(t, err)

	// The repository withdraws the transition between admission and the send.
	f.policy.factory = `{"issueTransitions":[{"id":"triage","title":"Triage it","to":"needs-triage","actor":"anyone"}]}`

	require.Equal(t, jobs.StateFailed, f.settles(t, receipt.OperationID))
	assert.Equal(t, []string{"proposed"}, f.labels(t, number), "the withdrawn move never reached GitHub")
	assert.Empty(t, f.comments(t, number))

	// The settled refusal names its closed reason code and nothing else.
	var reason []byte
	require.NoError(t, f.pool.QueryRow(context.Background(),
		"SELECT terminal_receipt FROM product_job_requests WHERE id=$1", receipt.OperationID).Scan(&reason))
	assert.Contains(t, string(reason), "issue_transition_undeclared")
	for _, forbidden := range []string{"token", "Bearer", "http", "credential"} {
		assert.NotContains(t, string(reason), forbidden)
	}
}

// A readback that does not show the move is UNCERTAIN, never a performed
// transition: the write may have happened, so the act is PARKED rather than
// completed (which would claim a move GitHub did not make) or failed (which
// would let a client send the same transition again). The attribution is not
// said, because nothing was confirmed.
func TestInstallIssueTransitionWithoutAConfirmingReadbackIsParked(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)
	// The disagreement as it happens in production: somebody re-applies the
	// label the move leaves, between the write and the readback.
	f.fake.OnNextRequest("GET", fmt.Sprintf("/repos/%s/issues/%d", installRepo, number), func() {
		f.fake.LabelIssue(installRepo, number, "rehearsal-owner", "proposed")
	})

	receipt, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "unconfirmed-1")
	require.NoError(t, err)
	state := f.settles(t, receipt.OperationID)
	assert.Equal(t, jobs.StateWaiting, state, "an unconfirmed move is parked for reconciliation")
	assert.NotEqual(t, jobs.StateFailed, state, "a failed generation would permit a duplicate write")
	assert.NotEqual(t, jobs.StateCompleted, state, "nothing may claim a move the readback did not show")
	assert.Empty(t, f.comments(t, number), "attribution is only true after a readback that confirms")

	// Asking again resumes the ONE admitted operation under its own key.
	replay, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "unconfirmed-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
	assert.Empty(t, f.comments(t, number))
}

// A label write whose reply is LOST stays UNCERTAIN, exactly as every other
// unsafe issue write does: never a settled failure, which would let a client
// send the same transition again, and never a completion, because nothing was
// confirmed. Asking again resumes the one admitted operation.
func TestInstallIssueTransitionLostLabelReplyStaysUncertain(t *testing.T) {
	f := newInstallTransitionFixture(t, transitionFactory)
	number := f.proposal(t)
	f.fake.LoseNextResponses(fmt.Sprintf("/repos/%s/issues/%d/labels", installRepo, number), 1)

	receipt, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "lost-1")
	require.NoError(t, err)
	state := f.settles(t, receipt.OperationID)
	assert.Equal(t, jobs.StateUncertain, state)
	assert.NotEqual(t, jobs.StateFailed, state, "a failed generation would permit a duplicate label write")
	assert.NotEqual(t, jobs.StateCompleted, state)

	// GitHub did take the label, and exactly once.
	assert.ElementsMatch(t, []string{"accepted", "proposed"}, f.labels(t, number),
		"the applied label stands; the one the move leaves was never removed, because the act stopped")
	assert.Empty(t, f.comments(t, number))

	// The unresolved outcome is readable rather than re-sent.
	status, err := f.service.InstallIssueCreateStatus(f.ctx, f.repoID, receipt.OperationID)
	require.NoError(t, err)
	assert.Equal(t, jobs.StateUncertain, status["state"])

	replay, err := f.service.RequestInstallIssueTransition(f.ctx, f.repoID, number, "accept", "lost-1")
	require.NoError(t, err)
	require.Equal(t, receipt.OperationID, replay.OperationID)
	assert.ElementsMatch(t, []string{"accepted", "proposed"}, f.labels(t, number))
	assert.Empty(t, f.comments(t, number))
}

// The install transition rides the ONE shared durable issue-write worker,
// under its own operation, with the act taken from the operation the lease
// claimed and the command from the catalog row the product already has.
func TestTheInstallTransitionRidesTheSharedIssueWriteWorker(t *testing.T) {
	t.Parallel()
	assert.Contains(t, IssueWriteOperations(), InstallIssueTransitionOperation)
	assert.Equal(t, "transition", issueWriteActs[InstallIssueTransitionOperation])
	assert.Equal(t, issueTransitionCommand, installIssueOperationCommands[InstallIssueTransitionOperation])
	// No new catalog operation name exists: every install operation maps onto
	// a command the product already authorizes.
	for operation, command := range installIssueOperationCommands {
		_, known := OperationPolicy(command)
		assert.True(t, known, operation+" must name an existing catalog command")
	}
	// The install's and the hosted composition's transitions are two
	// authorities over ONE act, never two implementations of it.
	assert.NotEqual(t, InstallIssueTransitionOperation, HostedIssueTransitionOperation)
	assert.Equal(t, issueWriteActs[HostedIssueTransitionOperation], issueWriteActs[InstallIssueTransitionOperation])
	assert.Equal(t, hostedIssueOperationCommands[HostedIssueTransitionOperation], installIssueOperationCommands[InstallIssueTransitionOperation])
}
