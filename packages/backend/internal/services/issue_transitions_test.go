package services

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

/*
 * The repository's own declared issue transitions (M-47, #4027).
 *
 * The declaration is read from the repository's COMMITTED default bookmark,
 * never from a request, so what a transition is allowed to do to an issue is
 * the repository's to decide and nobody else's. These cases pin the three
 * rules that decide whether anything leaves for GitHub at all:
 *
 *   - an undeclared transition is refused, and nothing is asked of GitHub;
 *   - a declaration this server could not read is UNKNOWN policy, refused —
 *     not an empty policy, which would read as "nothing is allowed" and, in
 *     the other direction, could read as "no rule applies";
 *   - an agent asking for a move the repository says a person has to make is
 *     refused with the existing permission class.
 */

const issueTransitionsFactory = `{"summary":"S.","flows":[],"on":[],
"github":{"mirror":"pull","issues":"read","changes":"send-upstream"},
"issueTransitions":[
 {"id":"triage","title":"Triage it","to":"needs-triage","actor":"anyone"},
 {"id":"accept","title":"Accept the proposal","from":"proposed","to":"accepted"},
 {"id":"park","title":"Park it","from":"proposed","to":"parked","actor":"person"}]}`

func TestParseFactoryIssueTransitions(t *testing.T) {
	t.Parallel()
	transitions, err := parseFactoryIssueTransitions([]byte(issueTransitionsFactory))
	require.NoError(t, err)
	require.Len(t, transitions, 3)
	assert.Equal(t, IssueTransition{ID: "triage", Title: "Triage it", To: "needs-triage", Actor: "anyone"}, transitions[0])
	assert.Equal(t, IssueTransition{ID: "accept", Title: "Accept the proposal", From: "proposed", To: "accepted"}, transitions[1])
	// An unnamed actor is a PERSON: declaring a transition is not saying an
	// agent may make it.
	assert.False(t, transitions[0].NeedsPerson())
	assert.True(t, transitions[1].NeedsPerson())
	assert.True(t, transitions[2].NeedsPerson())

	// No projection and no key declare none, which is a real answer.
	none, err := parseFactoryIssueTransitions(nil)
	require.NoError(t, err)
	assert.Empty(t, none)
	none, err = parseFactoryIssueTransitions([]byte(`{"summary":"S.","on":[]}`))
	require.NoError(t, err)
	assert.Empty(t, none)
}

func TestParseFactoryIssueTransitionsRefusesAMalformedDeclaration(t *testing.T) {
	t.Parallel()
	refuse := func(body string) string {
		t.Helper()
		_, err := parseFactoryIssueTransitions([]byte(`{"on":[],"issueTransitions":` + body + `}`))
		require.Error(t, err, body)
		return err.Error()
	}
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":"x","state":"open"}]`), "unknown field")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":null}]`), "null to")
	assert.Contains(t, refuse(`[{"id":"A","title":"A","to":"x"}]`), "invalid issue transition id")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":"x"},{"id":"a","title":"B","to":"y"}]`), `"a" twice`)
	assert.Contains(t, refuse(`[{"id":"a","title":" ","to":"x"}]`), "invalid title")
	assert.Contains(t, refuse(`[{"id":"a","title":"A\nB","to":"x"}]`), "invalid title")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":""}]`), "invalid to label")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":" x"}]`), "invalid to label")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","from":" x","to":"y"}]`), "invalid from label")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","from":"Accepted","to":"accepted"}]`), "both from and to")
	assert.Contains(t, refuse(`[{"id":"a","title":"A","to":"x","actor":"agent"}]`), "invalid actor")
	assert.Contains(t, refuse(`["accept"]`), "not an object")
	// An unreadable document is NOT an empty declaration.
	_, err := parseFactoryIssueTransitions([]byte(`{`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "is not valid JSON")

	long := `[{"id":"a","title":"A","to":"` + strings.Repeat("x", 256) + `"}]`
	assert.Contains(t, refuse(long), "invalid to label")
}

func TestParseFactoryIssueTransitionsBoundsTheDeclaration(t *testing.T) {
	t.Parallel()
	rows := make([]string, 0, maximumIssueTransitions+1)
	for index := 0; index <= maximumIssueTransitions; index++ {
		rows = append(rows, `{"id":"t`+string(rune('a'+index%26))+string(rune('a'+index/26))+`","title":"T","to":"x"}`)
	}
	_, err := parseFactoryIssueTransitions([]byte(`{"on":[],"issueTransitions":[` + strings.Join(rows, ",") + `]}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "more than 32 issue transitions")
}

// transitionRepo is a repository whose default bookmark is main.
func transitionRepo() db.Repository {
	return viewRepo(nil)
}

// personContext and agentContext are the two actors, built from the SAME
// credential machinery the HTTP chain uses — a user type and a system-issued
// token, never a field in a payload claiming to be one or the other.
func personContext() context.Context {
	return middleware.ContextWithAuthInfo(context.Background(),
		&middleware.AuthInfo{User: &db.User{ID: 5, Username: "will", LowerUsername: "will", UserType: "user"}})
}

func agentContext() context.Context {
	return middleware.ContextWithAuthInfo(context.Background(),
		&middleware.AuthInfo{User: &db.User{ID: 6, Username: "smithers-bot", LowerUsername: "smithers-bot", UserType: "bot"}})
}

// appAgentContext and externalAgentContext are the two delegated agent kinds,
// told apart the way the confirmation path tells them apart: the stored `via`
// on a system-issued credential, never a field in a payload.
func appAgentContext() context.Context {
	return middleware.ContextWithAuthInfo(context.Background(), &middleware.AuthInfo{
		User:        &db.User{ID: 5, Username: "will", LowerUsername: "will", UserType: "user"},
		IsTokenAuth: true, TokenSystemIssued: true, RawScopes: "read:repository,write:repository,via:smithers",
	})
}

func externalAgentContext() context.Context {
	return middleware.ContextWithAuthInfo(context.Background(), &middleware.AuthInfo{
		User:        &db.User{ID: 5, Username: "will", LowerUsername: "will", UserType: "user"},
		IsTokenAuth: true, TokenSystemIssued: true, RawScopes: "read:repository,write:repository,via:codex",
	})
}

func TestAnUndeclaredIssueTransitionIsRefusedBeforeAnythingIsAsked(t *testing.T) {
	t.Parallel()
	host := &issueViewHost{factory: issueTransitionsFactory}
	_, err := authorizeIssueTransition(personContext(), host, "will", transitionRepo(), "merge")
	require.Error(t, err)
	var control *TodoControlError
	require.ErrorAs(t, err, &control)
	assert.Equal(t, "issue_transition_undeclared", control.Code)
	// The repository's own declaration was read, and nothing else was.
	require.Len(t, host.reads, 1)
	assert.Contains(t, host.reads[0], ".smithers/factory.json")
}

func TestAnUnreadableTransitionDeclarationIsUnknownPolicyNotAnEmptyOne(t *testing.T) {
	t.Parallel()
	for name, host := range map[string]*issueViewHost{
		"unreadable projection": {factory: `{`},
		"unreadable file":       {fileErr: &repohost.StatusError{StatusCode: 500}},
		"binary projection":     {file: &repohost.FileContent{Encoding: "base64", Content: "e30="}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := authorizeIssueTransition(personContext(), host, "will", transitionRepo(), "accept")
			require.Error(t, err)
			var control *TodoControlError
			require.ErrorAs(t, err, &control)
			assert.Equal(t, "issue_transition_policy_unreadable", control.Code)
		})
	}
	// No reader at all is the same answer: unknown, never permission.
	_, err := authorizeIssueTransition(personContext(), nil, "will", transitionRepo(), "accept")
	require.Error(t, err)
}

// A repository that declares NO transitions allows none: every id is
// undeclared, so no label write exists for any of them.
func TestARepositoryWithoutDeclaredTransitionsAllowsNone(t *testing.T) {
	t.Parallel()
	host := &issueViewHost{factory: `{"summary":"S.","flows":[],"on":[],"github":{"mirror":"pull","issues":"read","changes":"send-upstream"}}`}
	_, err := authorizeIssueTransition(personContext(), host, "will", transitionRepo(), "accept")
	var control *TodoControlError
	require.ErrorAs(t, err, &control)
	assert.Equal(t, "issue_transition_undeclared", control.Code)
}

// An agent cannot run a transition the repository says a person has to make.
// The refusal is the EXISTING permission class, decided from the request's
// own credential kind before anything that needs a store, so the
// repository's rule can never be skipped by the authority behind it.
func TestAnAgentCannotRunAPersonOnlyTransition(t *testing.T) {
	t.Parallel()
	host := &issueViewHost{factory: issueTransitionsFactory}
	for _, id := range []string{"accept", "park"} {
		_, err := authorizeIssueTransition(agentContext(), host, "will", transitionRepo(), id)
		require.Error(t, err, id)
		var refusal *AccessError
		require.ErrorAs(t, err, &refusal, id)
		assert.Equal(t, "permission", refusal.Code, id)
		assert.Equal(t, "permission", refusal.Class, id)
	}
	// A person is not refused: the declared transition is answered, and who
	// may write THIS repository is the hosted writer's own live authority
	// (the permission resolver, the credential's scope and binding, and
	// GitHub's own answer), applied on admission and again on the worker.
	declared, err := authorizeIssueTransition(personContext(), host, "will", transitionRepo(), "accept")
	require.NoError(t, err)
	assert.Equal(t, "accepted", declared.To)
	assert.Equal(t, "proposed", declared.From)
}

// A declaration of "anyone" cannot widen past the catalog's own actor list.
// The row for THIS operation (issues.transition) admits a person and the
// app's own agent and nothing else, so an external agent and an agent
// account with no delegation are refused whatever the repository declared.
func TestADeclarationCannotWidenWhoMayWriteAnIssueLabel(t *testing.T) {
	t.Parallel()
	policy, known := OperationPolicy(issueTransitionCommand)
	require.True(t, known, "the transition rides its OWN EXISTING catalog command")
	assert.Equal(t, "confirm", policy.Agent)
	assert.Equal(t, []string{"person", "app_agent"}, policy.Actors)

	transitions, err := parseFactoryIssueTransitions([]byte(issueTransitionsFactory))
	require.NoError(t, err)
	assert.False(t, transitions[0].NeedsPerson(), "triage is the one the repository did not reserve")

	host := &issueViewHost{factory: issueTransitionsFactory}
	// An agent account carrying no delegation names no catalog actor the row
	// lists, so it is refused even for the transition nobody reserved.
	_, err = authorizeIssueTransition(agentContext(), host, "will", transitionRepo(), "triage")
	require.Error(t, err)
	var refusal *AccessError
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, "permission", refusal.Code)
	// So is an EXTERNAL agent: the row does not list that actor.
	_, err = authorizeIssueTransition(externalAgentContext(), host, "will", transitionRepo(), "triage")
	require.Error(t, err)
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, "permission", refusal.Code)
	// The app's own agent is the one kind the row admits, and only for the
	// transition the repository did not reserve.
	declared, err := authorizeIssueTransition(appAgentContext(), host, "will", transitionRepo(), "triage")
	require.NoError(t, err, "M-47: a repository flow makes a transition it declared anyone may make")
	assert.Equal(t, "needs-triage", declared.To)
	_, err = authorizeIssueTransition(appAgentContext(), host, "will", transitionRepo(), "accept")
	require.Error(t, err, "a person-only declaration still narrows the catalog row")
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, "permission", refusal.Code)
	// A person asking for the same transition is answered it.
	declared, err = authorizeIssueTransition(personContext(), host, "will", transitionRepo(), "triage")
	require.NoError(t, err)
	assert.Equal(t, "needs-triage", declared.To)
}

// What the person-only rule itself answers, independently of the catalog: a
// move the repository says a person has to make refuses an agent by the
// request's own credential kind.
func TestThePersonOnlyRuleReadsTheRequestsCredentialKind(t *testing.T) {
	t.Parallel()
	transitions, err := parseFactoryIssueTransitions([]byte(issueTransitionsFactory))
	require.NoError(t, err)
	byID := map[string]IssueTransition{}
	for _, transition := range transitions {
		byID[transition.ID] = transition
	}
	assert.True(t, byID["accept"].NeedsPerson())
	assert.True(t, middleware.AuthInfoFromContext(agentContext()).IsAgent())
	assert.False(t, middleware.AuthInfoFromContext(personContext()).IsAgent())

	refusal := issueTransitionNeedsPerson()
	var access *AccessError
	require.ErrorAs(t, refusal, &access)
	assert.Equal(t, "permission", access.Code)
	// The refusal names no label, route, credential or provider prose.
	for _, forbidden := range []string{"label", "token", "/api/", "github.com", "accepted"} {
		assert.NotContains(t, strings.ToLower(access.Message), forbidden)
	}
}

// GitHub's readback is what makes a transition true. An issue that does not
// carry the declared labels has not moved, whatever the write returned.
func TestOnlyAReadbackThatShowsTheLabelsIsAPerformedTransition(t *testing.T) {
	t.Parallel()
	accept := IssueTransition{ID: "accept", Title: "Accept", From: "proposed", To: "accepted"}
	assert.True(t, issueCarriesTransition(mythicalIssue{Labels: []string{"bug", "Accepted"}}, accept))
	// The label it leaves is still there: the move is not complete.
	assert.False(t, issueCarriesTransition(mythicalIssue{Labels: []string{"Proposed", "accepted"}}, accept))
	// The label it applies is absent: nothing moved.
	assert.False(t, issueCarriesTransition(mythicalIssue{Labels: []string{"bug"}}, accept))
	assert.False(t, issueCarriesTransition(mythicalIssue{}, accept))
	// A transition that leaves no label only has to apply its own.
	triage := IssueTransition{ID: "triage", Title: "Triage", To: "needs-triage"}
	assert.True(t, issueCarriesTransition(mythicalIssue{Labels: []string{"needs-triage"}}, triage))
	assert.False(t, issueCarriesTransition(mythicalIssue{Labels: []string{"proposed"}}, triage))
}

// The attribution names the repository flow, the move, the transition that
// made it and the PERSON who ran it — and carries nothing else.
func TestTheAttributionNamesTheFlowAndThePersonWhoRanIt(t *testing.T) {
	t.Parallel()
	said := issueTransitionAttribution(
		IssueTransition{ID: "accept", Title: "Accept the proposal", From: "proposed", To: "accepted"},
		installIssueWriteJob{Login: "will", Transition: "accept"},
		db.Repository{Name: "flows"},
	)
	assert.Contains(t, said, "Accept the proposal")
	assert.Contains(t, said, "proposed → accepted")
	assert.Contains(t, said, "flows")
	assert.Contains(t, said, `"accept"`)
	assert.Contains(t, said, "@will")
	for _, forbidden := range []string{"token", "Bearer", "/api/", "credential", "installation"} {
		assert.NotContains(t, said, forbidden)
	}
	// A transition that leaves no label says only the label it applied.
	said = issueTransitionAttribution(
		IssueTransition{ID: "triage", Title: "Triage it", To: "needs-triage"},
		installIssueWriteJob{Login: "ana", Transition: "triage"},
		db.Repository{Name: "flows"},
	)
	assert.Contains(t, said, "(needs-triage)")
	assert.NotContains(t, said, "→")
	assert.Contains(t, said, "@ana")
}

// The transition rides the ONE shared durable issue-write worker, under its
// own operation, with the act taken from the operation the lease claimed.
func TestTheTransitionRidesTheSharedIssueWriteWorker(t *testing.T) {
	t.Parallel()
	assert.Contains(t, IssueWriteOperations(), HostedIssueTransitionOperation)
	assert.Equal(t, "transition", issueWriteActs[HostedIssueTransitionOperation])
	assert.Equal(t, issueTransitionCommand, hostedIssueOperationCommands[HostedIssueTransitionOperation])
	// No new catalog operation name exists: every hosted operation maps onto
	// a command the product already authorizes.
	for operation, command := range hostedIssueOperationCommands {
		_, known := OperationPolicy(command)
		assert.True(t, known, operation+" must name an existing catalog command")
	}
}
