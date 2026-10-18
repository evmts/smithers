package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// One declared issue transition, performed on the repository's own GitHub
// tracker (M-47, #4027).
//
// It rides the SAME durable pipeline every other GitHub issue act rides —
// one jobs.Store, the one shared issue-write worker, the credential reload
// and actor re-authorization, the send fence around each external request,
// and one terminal receipt — so no second writer, engine, daemon or
// scheduler exists for it. The act itself is label writes and one
// attribution comment through the EXISTING adapter methods (AddLabel,
// RemoveLabel, Issue, Comment).
//
// What makes it a transition rather than a label edit is that the labels come
// from the repository's OWN committed declaration, re-read on the worker, and
// never from the request: the request names only an issue number and a
// transition id.
const HostedIssueTransitionOperation = "github.issue.transition"

// hostedTransitionRetry is how long an UNCERTAIN transition waits before it
// is reconciled. A readback that does not yet show the declared labels means
// the write may have happened, so the act is parked and re-read — never
// failed, which would let a client send it again.
const hostedTransitionRetry = 30 * time.Second

// RequestGitHubIssueTransition admits one declared transition of one of this
// repository's GitHub issues.
//
// Everything that can refuse the act refuses it HERE, before any durable
// operation exists and therefore before anything could reach GitHub:
//
//   - a transition the repository does not declare (the issue's GitHub state
//     is untouched by the refusal, because no request is made for it);
//   - a declaration this server could not read, which is unknown policy, not
//     an empty one;
//   - a credential the server's own catalog does not admit for an issue
//     label write at all;
//   - an agent asking for a transition the repository says a person has to
//     make, decided from the request's credential kind.
//
// The acknowledgment is the ADMISSION and says nothing about GitHub.
func (s *MythicalService) RequestGitHubIssueTransition(ctx context.Context, repository, number int64, transition, key string) (jobs.RequestReceipt, error) {
	if err := validIssueNumber(number, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	if !issueTransitionID.MatchString(transition) {
		return jobs.RequestReceipt{}, issueTransitionUndeclared(transition)
	}
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, hostedIssueUnavailable()
	}
	repo, owner, err := s.repository(ctx, repository)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	declared, err := authorizeIssueTransition(ctx, s.policyHost(), owner, repo, transition)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	// The id, not the labels: the worker re-reads the declaration, so an
	// admitted act can never carry labels the repository stopped declaring.
	return s.admitHostedIssueWrite(ctx, repository, installIssueWriteJob{Number: number, Transition: declared.ID}, key, HostedIssueTransitionOperation)
}

// policyHost is the repository's committed-file reader — the EXISTING seam
// the stack already reads the owner's committed factory policy through
// (SetPolicyReader, wired to the repo-host client in compose/main.go).
// Without it a transition is refused: an unreadable declaration is unknown
// policy, never permission.
func (s *MythicalService) policyHost() repositoryPolicyHost { return s.policy }

// sendIssueTransition performs one declared transition and records its
// terminal receipt. The order is what makes the attribution truthful:
//
//  1. the declaration is RE-READ on the worker, so a transition the
//     repository no longer declares is refused here too, before any request;
//  2. the actor's authority is re-checked by the shared fence around each
//     external request (handleHostedIssueWrite's fence);
//  3. the label the transition applies goes on, and the label it leaves
//     comes off — both idempotent on GitHub, so a retry repeats neither;
//  4. GitHub is READ BACK. Only an issue that actually carries the declared
//     labels is a performed transition;
//  5. and only then is the attribution said, once per operation key, so the
//     comment on the issue card can never claim a move GitHub did not make.
//
// A readback that does not show the move is UNCERTAIN: the write may have
// happened, so the act parks and is re-read rather than failing (which would
// permit a second attempt from the client) or completing (which would claim
// GitHub did something it may not have).
func (s *MythicalService) sendIssueTransition(
	ctx context.Context, bound context.Context, lease *jobs.Lease,
	gh mythicalGitHubRepo, job installIssueWriteJob, owner string, repo db.Repository,
) error {
	transitions, err := readRepositoryIssueTransitions(bound, s.policyHost(), owner, repo)
	if err != nil {
		// Unknown policy is transient, not a refusal: the act retries rather
		// than being burned on a read that may succeed next time.
		return err
	}
	var declared *IssueTransition
	for index := range transitions {
		if transitions[index].ID == job.Transition {
			declared = &transitions[index]
			break
		}
	}
	if declared == nil {
		return lease.Fail(ctx, json.RawMessage(`{"code":"issue_transition_undeclared","class":"user"}`))
	}

	/*
	 * Each label write goes through the SAME send fence every other issue
	 * write goes through (handleHostedIssueWrite installs it): the actor's
	 * authority and the repository's declaration are re-read under row
	 * locks, the attempt is recorded, and only then does the one request
	 * run. Both writes are idempotent on GitHub — applying a label twice is
	 * a no-op and removing an absent one answers 404, which the adapter
	 * accepts — so a retry repeats neither.
	 */
	if err := sendGitHubIssueWrite(bound, func(send context.Context) error {
		return s.github.AddLabel(send, gh, job.Number, declared.To)
	}); err != nil {
		return err
	}
	if declared.From != "" {
		if err := sendGitHubIssueWrite(bound, func(send context.Context) error {
			return s.github.RemoveLabel(send, gh, job.Number, declared.From)
		}); err != nil {
			return err
		}
	}

	issue, err := s.github.Issue(bound, gh, job.Number)
	if err != nil {
		return err
	}
	if !issueCarriesTransition(issue, *declared) {
		return lease.Defer(ctx, json.RawMessage(`{"state":"uncertain","code":"issue_transition_unconfirmed"}`), hostedTransitionRetry)
	}

	// The attribution, said once per operation key: a retry whose reply was
	// lost edits this comment instead of posting a second one.
	if err := s.github.Comment(bound, gh, job.Number, lease.Claim().OperationID, issueTransitionAttribution(*declared, job, repo)); err != nil {
		return err
	}
	receipt, _ := json.Marshal(map[string]any{
		"state": "completed", "transition": declared.ID, "label": declared.To, "login": job.Login,
	})
	return lease.Complete(ctx, receipt)
}

// issueCarriesTransition is GitHub's own answer to "did the move happen":
// the issue carries the label the transition applies and no longer carries
// the one it leaves. Label comparison is case-insensitive, as GitHub's own
// label identity is.
func issueCarriesTransition(issue mythicalIssue, declared IssueTransition) bool {
	applied := false
	for _, label := range issue.Labels {
		if strings.EqualFold(label, declared.To) {
			applied = true
		}
		if declared.From != "" && strings.EqualFold(label, declared.From) {
			return false
		}
	}
	return applied
}

// issueTransitionAttribution names the repository flow that made the move,
// the version of the declaration it made it by, and the PERSON who ran it.
// The version is the repository's own default-bookmark commit of
// .smithers/factory.json: the declaration IS the flow, so its commit is the
// version that was in force. No credential, token, route, header or internal
// prose appears in it.
func issueTransitionAttribution(declared IssueTransition, job installIssueWriteJob, repo db.Repository) string {
	move := declared.To
	if declared.From != "" {
		move = declared.From + " → " + declared.To
	}
	return fmt.Sprintf("%s (%s) by %s’s %q issue transition, run by @%s",
		declared.Title, move, repo.Name, declared.ID, job.Login)
}

// lockedIssueTransitionAuthority re-checks, inside the shared fence's own
// transaction, that this actor may still ask for THIS transition: the
// repository's declaration and the catalog's actor rule are read again from
// committed state, so a declaration that became person-only — or a
// credential that became an agent's — stops the act before its next external
// request. The repository write authority beside it is the hosted writer's
// own (lockHostedRepositoryWriter), which the fence already took.
func (s *MythicalService) lockedIssueTransitionAuthority(ctx context.Context, owner string, repo db.Repository, transition string) error {
	_, err := authorizeIssueTransition(ctx, s.policyHost(), owner, repo, transition)
	return err
}
