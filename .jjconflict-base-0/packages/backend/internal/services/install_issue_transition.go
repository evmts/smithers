package services

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// One declared issue transition on an INSTALL (#4067, M-47).
//
// It is the same act as the hosted one and rides the same durable pipeline:
// one jobs.Store, the one shared issue-write worker, the credential reload
// and actor re-authorization, the send fence around each external request,
// and one terminal receipt. No second lifecycle, policy engine, scheduler,
// command or action vocabulary exists for it — `issues.transition` is
// already the action, and the labels still come from the repository's OWN
// committed declaration rather than from the request.
//
// Only the AUTHORITY differs from the hosted act, exactly as it does for the
// install's create, comment, close, reopen and comment-edit beside it: an
// install writes as its one bound repository's owner, read off
// install_settings, so the actor's install role decides rather than a
// per-repository collaborator grant.
const InstallIssueTransitionOperation = "install.issue.transition"

// InstallIssueTransitionWriter is the one door the install transition route
// calls. It is a separate interface so the route can refuse a composition
// that has no transition writer instead of silently serving a 500.
type InstallIssueTransitionWriter interface {
	RequestInstallIssueTransition(ctx context.Context, repository, number int64, transition, key string) (jobs.RequestReceipt, error)
}

// RequestInstallIssueTransition admits one declared transition of the install
// repository's GitHub issue.
//
// Everything that can refuse the act refuses it HERE, before any durable
// operation exists and therefore before anything could reach GitHub — the
// same four refusals the hosted door makes, through the same authority:
//
//   - a transition the repository does not declare;
//   - a declaration this server could not read, which is unknown policy and
//     never an empty one;
//   - the install's own catalog decision for `issues.transition`;
//   - an agent asking for a transition the repository says a person has to
//     make, decided from the request's credential kind.
//
// The declaration is read at the repository's own DEFAULT BOOKMARK through
// the existing policy reader (SetPolicyReader), so a branch declares nothing.
// The acknowledgment is the ADMISSION and says nothing about GitHub.
func (s *MythicalService) RequestInstallIssueTransition(ctx context.Context, repository, number int64, transition, key string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, issuesUnavailable()
	}
	decision, err := Authorize(ctx, s.queries(), issueTransitionCommand)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	ctx = WithInstallAuthorization(ctx, issueTransitionCommand, decision)
	if err = validIssueNumber(number, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	if !issueTransitionID.MatchString(transition) {
		return jobs.RequestReceipt{}, issueTransitionUndeclared(transition)
	}
	repo, owner, err := s.repository(ctx, repository)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	declared, err := authorizeIssueTransition(ctx, s.policyHost(), owner, repo, transition)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	var receipt jobs.RequestReceipt
	// The id, not the labels: the worker re-reads the declaration, so an
	// admitted act can never carry labels the repository stopped declaring.
	err = pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		var err error
		receipt, err = s.admitIssueWrite(ctx, tx, repository,
			installIssueWriteJob{Number: number, Transition: declared.ID}, key, issueTransitionCommand, InstallIssueTransitionOperation)
		return err
	})
	return receipt, err
}
