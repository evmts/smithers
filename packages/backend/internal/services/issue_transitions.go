package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

// IssueTransition is one issue transition the repository's factory declares
// (S.Factory({ issueTransitions }) in .smithers/FACTORY.ts, projected to
// .smithers/factory.json): a named move of an issue through the
// repository's OWN states, proposed to accepted among them, beside GitHub's
// open and closed.
//
// The move is carried by the repository's EXISTING labels and nothing else —
// To is the label it applies and From, when named, the label it takes off —
// so no second issue tracker or issue-state database exists anywhere.
//
// Actor is who the REPOSITORY says may ask for it. "person" (the default,
// and what an unnamed actor means) says a person has to make this move.
// "anyone" only says the repository does not itself require one: it grants
// nothing, because the server's own catalog still decides who may write an
// issue label (operationCatalog "labels.create": agent "never", actors
// ["person"]). A declaration can narrow this authority and never widen it.
type IssueTransition struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	From  string `json:"from,omitempty"`
	To    string `json:"to"`
	Actor string `json:"actor,omitempty"`
}

// NeedsPerson reports whether a person has to make this move. An unnamed
// actor is a person: a repository that declared a transition without saying
// an agent may make it has not said so.
func (t IssueTransition) NeedsPerson() bool { return t.Actor != "anyone" }

// issueTransitionID is the id shape @smthrs/targets Factory.IssueTransition
// accepts.
var issueTransitionID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// The bound the declaration side enforces; a projection past it is refused.
const maximumIssueTransitions = 32

// The transition catalog command: the EXISTING operation the product already
// authorizes an issue label write with (middleware/auth.go classifies
// POST /api/repos/{o}/{r}/issues/{n}/labels as labels.create). No new
// catalog operation name, wire field or done code exists for a transition.
const issueTransitionCommand = "labels.create"

// parseFactoryIssueTransitions reads a factory projection's
// issueTransitions. A missing projection or key declares none; an unreadable
// or malformed one is an error, never an empty list — a repository whose
// declaration could not be read has NOT declared that nothing is allowed,
// and a reader that cannot tell the two apart would let an undeclared move
// through as "nothing declared".
func parseFactoryIssueTransitions(projection []byte) ([]IssueTransition, error) {
	if len(projection) == 0 {
		return []IssueTransition{}, nil
	}
	var factory struct {
		IssueTransitions []json.RawMessage `json:"issueTransitions"`
	}
	if err := json.Unmarshal(projection, &factory); err != nil {
		return nil, errors.New(factoryProjectionPath + " is not valid JSON")
	}
	if len(factory.IssueTransitions) > maximumIssueTransitions {
		return nil, fmt.Errorf("%s declares more than %d issue transitions", factoryProjectionPath, maximumIssueTransitions)
	}
	transitions := make([]IssueTransition, 0, len(factory.IssueTransitions))
	seen := map[string]bool{}
	for index, raw := range factory.IssueTransitions {
		// Strict, like the declaration: an unknown or null field never
		// broadens a transition.
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
			return nil, fmt.Errorf("%s issue transition %d is not an object", factoryProjectionPath, index)
		}
		for key, value := range fields {
			if key != "id" && key != "title" && key != "from" && key != "to" && key != "actor" {
				return nil, fmt.Errorf("%s issue transition %d has an unknown field %q", factoryProjectionPath, index, key)
			}
			if string(value) == "null" {
				return nil, fmt.Errorf("%s issue transition %d has a null %s", factoryProjectionPath, index, key)
			}
		}
		var transition IssueTransition
		if err := json.Unmarshal(raw, &transition); err != nil {
			return nil, fmt.Errorf("%s issue transition %d is malformed", factoryProjectionPath, index)
		}
		if !issueTransitionID.MatchString(transition.ID) {
			return nil, fmt.Errorf("%s declares an invalid issue transition id %q", factoryProjectionPath, transition.ID)
		}
		if seen[transition.ID] {
			return nil, fmt.Errorf("%s declares the issue transition %q twice", factoryProjectionPath, transition.ID)
		}
		seen[transition.ID] = true
		if strings.TrimSpace(transition.Title) == "" || strings.ContainsAny(transition.Title, "\r\n") {
			return nil, fmt.Errorf("%s issue transition %q has an invalid title", factoryProjectionPath, transition.ID)
		}
		if err := validIssueTransitionLabel(transition.ID, "to", transition.To); err != nil {
			return nil, err
		}
		if transition.From != "" {
			if err := validIssueTransitionLabel(transition.ID, "from", transition.From); err != nil {
				return nil, err
			}
			if strings.EqualFold(transition.From, transition.To) {
				return nil, fmt.Errorf("%s issue transition %q names %q as both from and to", factoryProjectionPath, transition.ID, transition.To)
			}
		}
		switch transition.Actor {
		case "", "person", "anyone":
		default:
			return nil, fmt.Errorf("%s issue transition %q has an invalid actor %q", factoryProjectionPath, transition.ID, transition.Actor)
		}
		transitions = append(transitions, transition)
	}
	return transitions, nil
}

func validIssueTransitionLabel(id, field, label string) error {
	if label == "" || strings.TrimSpace(label) != label || utf8.RuneCountInString(label) > 255 {
		return fmt.Errorf("%s issue transition %q has an invalid %s label %q", factoryProjectionPath, id, field, label)
	}
	return nil
}

// readRepositoryIssueTransitions is the transition policy the repository
// committed to its own default bookmark. No bookmark or no projection
// declares none; a failed read or a malformed projection is an error, so a
// caller fails CLOSED rather than treating an unreadable declaration as an
// empty one.
func readRepositoryIssueTransitions(ctx context.Context, host repositoryPolicyHost, owner string, repository db.Repository) ([]IssueTransition, error) {
	if host == nil {
		return nil, errors.New("repository transition reader unavailable")
	}
	commit, found, err := bookmarkCommit(ctx, host, owner, repository.Name, repository.DefaultBookmark)
	if err != nil {
		return nil, err
	}
	if !found {
		return []IssueTransition{}, nil
	}
	file, err := host.GetFileAtCommit(ctx, owner, repository.Name, commit, factoryProjectionPath)
	if repohost.IsFileNotFound(err) {
		return []IssueTransition{}, nil
	}
	if err != nil {
		return nil, err
	}
	if file.TooLarge || file.Encoding == "base64" {
		return nil, errors.New(factoryProjectionPath + " is not readable text")
	}
	return parseFactoryIssueTransitions([]byte(file.Content))
}

// ListIssueTransitions is the transitions a readable repository declares, in
// declaration order. It is the list a surface offers; declaring one is not
// permission to run it.
func (s *IssueService) ListIssueTransitions(ctx context.Context, viewer *db.User, owner, repo string) ([]IssueTransition, error) {
	repository, err := s.resolveRepoByOwnerAndName(ctx, owner, repo)
	if err != nil {
		return nil, err
	}
	if err := s.requireReadAccess(ctx, repository, viewer); err != nil {
		return nil, err
	}
	transitions, err := readRepositoryIssueTransitions(ctx, s.factory, owner, repository)
	if err != nil {
		return nil, pkgerrors.UnprocessableEntity(err.Error())
	}
	return transitions, nil
}

// The two refusals a transition makes before anything leaves for GitHub.
// Each names what is true and nothing more: no label, no route, no
// credential, no provider sentence.

// issueTransitionUndeclared is the whole answer to a transition the
// repository does not declare. Nothing is asked of GitHub for one, so the
// issue's GitHub state is untouched by the refusal.
func issueTransitionUndeclared(id string) error {
	return &TodoControlError{Status: http.StatusNotFound, Class: "user", Code: "issue_transition_undeclared",
		Message: fmt.Sprintf("This repository declares no issue transition %q", id)}
}

// issueTransitionNeedsPerson is the refusal an agent meets on a transition
// the repository says a person has to make. It is the existing permission
// refusal class, decided from the request's own credential kind
// (middleware AuthInfo.IsAgent) and the server's catalog — never from a
// field in a payload and never from an instruction in a prompt.
func issueTransitionNeedsPerson() error {
	return &AccessError{Status: http.StatusForbidden, Class: "permission", Code: "permission",
		Message: "A person has to make this transition"}
}

// issueTransitionUnreadable is a declaration this server could not read. It
// is NOT "no transitions declared": the policy is unknown, so the act is
// refused rather than allowed or silently narrowed.
func issueTransitionUnreadable() error {
	return &TodoControlError{Status: http.StatusUnprocessableEntity, Class: "user", Code: "issue_transition_policy_unreadable",
		Message: "This repository's issue transitions could not be read"}
}

// authorizeIssueTransition decides, from committed state alone, WHAT may be
// asked of GitHub and by WHOM:
//
//  1. the repository's own committed declaration names the transition — an
//     undeclared one is refused here, before any external request exists;
//  2. a transition the repository says a person must make refuses an agent,
//     by the request's own credential kind (middleware AuthInfo.IsAgent) —
//     never a field in a payload and never an instruction in a prompt;
//  3. the server's EXISTING catalog rule for an issue label write
//     (issueTransitionCommand, whose row is agent "never") refuses an agent
//     whatever the repository declared, so a declaration of "anyone" grants
//     an agent nothing. A declaration can only narrow.
//
// Who may write THIS repository at all is not decided here and is not this
// lane's to decide: it is the hosted writer's own live authority — the
// repository permission resolver the HTTP chain uses, the credential's
// repository write scope and binding, and GitHub's own answer about the
// actor — applied by admitHostedIssueWrite and again on the worker's fence.
//
// It answers the declared transition, which is what the act then carries:
// the labels come from the DECLARATION, never from the request.
func authorizeIssueTransition(ctx context.Context, host repositoryPolicyHost, owner string, repository db.Repository, id string) (IssueTransition, error) {
	transitions, err := readRepositoryIssueTransitions(ctx, host, owner, repository)
	if err != nil {
		return IssueTransition{}, issueTransitionUnreadable()
	}
	var declared *IssueTransition
	for index := range transitions {
		if transitions[index].ID == id {
			declared = &transitions[index]
			break
		}
	}
	if declared == nil {
		return IssueTransition{}, issueTransitionUndeclared(id)
	}
	agent := middleware.AuthInfoFromContext(ctx).IsAgent()
	if declared.NeedsPerson() && agent {
		return IssueTransition{}, issueTransitionNeedsPerson()
	}
	policy, known := OperationPolicy(issueTransitionCommand)
	if !known {
		return IssueTransition{}, issueTransitionUnreadable()
	}
	if agent && policy.Agent == "never" {
		return IssueTransition{}, issueTransitionNeedsPerson()
	}
	return *declared, nil
}
