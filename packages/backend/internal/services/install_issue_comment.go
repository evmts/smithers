package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

const InstallIssueCommentOperation = "install.issue.comment"
const InstallIssueCreateOperation = "install.issue.create"

// The remaining ordinary GitHub issue acts ride the SAME durable pipeline as
// the create and the comment above: one admission, one worker, one send
// fence. Each act is its own operation so the worker's command never comes
// from the payload an admission wrote — only from the operation it claimed.
const (
	InstallIssueCloseOperation       = "install.issue.close"
	InstallIssueReopenOperation      = "install.issue.reopen"
	InstallIssueCommentEditOperation = "install.issue.comment.edit"
)

// installIssueOperationCommands maps each operation to the ONE catalog command
// that authorizes it, on admission and again on the worker.
var installIssueOperationCommands = map[string]string{
	InstallIssueCommentOperation:     "issue.comment",
	InstallIssueCreateOperation:      "issue.new",
	InstallIssueCloseOperation:       "issues.close",
	InstallIssueReopenOperation:      "issues.reopen",
	InstallIssueCommentEditOperation: "issue.comment",
}

type installIssueWriteJob struct {
	Repository int64  `json:"repository"`
	Requester  int64  `json:"requester"`
	Number     int64  `json:"number"`
	Body       string `json:"body"`
	Login      string `json:"login"`
	Title      string `json:"title,omitempty"`
	// Comment is the GitHub comment id install.issue.comment.edit replaces.
	// A legacy create or comment job carries none and decodes as before.
	Comment int64 `json:"comment,omitempty"`
	// Transition is the id of the declared issue transition
	// github.issue.transition performs. Only the ID is carried: the worker
	// re-reads the repository's own declaration for the labels, so an
	// admitted act can never carry labels the repository stopped declaring.
	// Every other job carries none and decodes exactly as before.
	Transition string `json:"transition,omitempty"`
}

func (s *MythicalService) SetInstallIssueJobs(store *jobs.Store) { s.issueJobs = store }

func validIssueComment(number int64, body, key string) error {
	if number <= 0 || strings.TrimSpace(body) == "" || len(body) > 65536 || key == "" || len(key) > 256 {
		return &TodoControlError{Status: 400, Code: "invalid_issue_comment", Class: "user", Message: "Invalid issue comment"}
	}
	return nil
}

// RequestInstallIssueComment admits a durable write without waiting on GitHub.
// A private delegated confirmation uses admitIssueComment in its own transaction.
func (s *MythicalService) RequestInstallIssueComment(ctx context.Context, repository, number int64, body, key string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, issuesUnavailable()
	}
	decision, err := Authorize(ctx, s.queries(), "issue.comment")
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	ctx = WithInstallAuthorization(ctx, "issue.comment", decision)
	if err = validIssueComment(number, body, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	var receipt jobs.RequestReceipt
	err = pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		var err error
		receipt, err = s.admitIssueComment(ctx, tx, repository, number, body, key)
		return err
	})
	return receipt, err
}

func (s *MythicalService) admitIssueComment(ctx context.Context, tx pgx.Tx, repository, number int64, body, key string) (jobs.RequestReceipt, error) {
	if s.issueJobs == nil || s.github == nil {
		return jobs.RequestReceipt{}, confirmationUnavailable()
	}
	if err := validIssueComment(number, body, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	return s.admitIssueWrite(ctx, tx, repository, installIssueWriteJob{Number: number, Body: body}, key, "issue.comment", InstallIssueCommentOperation)
}

func (s *MythicalService) admitIssueWrite(ctx context.Context, tx pgx.Tx, repository int64, job installIssueWriteJob, key, command, operation string) (jobs.RequestReceipt, error) {
	info := middleware.AuthInfoFromContext(ctx)
	bound, currentRepository, err := lockInstallWriteCredential(ctx, tx, info)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	if currentRepository != repository {
		return jobs.RequestReceipt{}, confirmationPermission()
	}
	if _, err = Authorize(bound, db.New(tx), command); err != nil {
		return jobs.RequestReceipt{}, err
	}
	identity, _ := json.Marshal(middleware.CredentialOf(info))
	digest := sha256.Sum256(identity)
	job.Repository, job.Requester, job.Login = repository, info.User.ID, info.User.Username
	payload, _ := json.Marshal(job)
	receipt, err := s.issueJobs.AdmitInTx(bound, tx, jobs.Admission{
		Scope:     jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repository), PrincipalID: "credential:" + hex.EncodeToString(digest[:])},
		Operation: operation, RequestID: key, Payload: payload,
		AuthorizationContext: identity, EffectPolicy: jobs.EffectUnsafe,
	})
	if errors.Is(err, jobs.ErrPayloadConflict) {
		return jobs.RequestReceipt{}, todoRequestMismatch()
	}
	return receipt, err
}

// HandleInstallIssueWrite delivers every ordinary GitHub issue act on the one
// shared worker — the install's and the hosted composition's. Unsafe delivery
// records uncertainty after a lost reply and never blindly repeats a write
// whose acceptance GitHub may have hidden.
//
// The command comes from the operation the lease CLAIMED, so a payload can
// neither name the act nor move it between the two authorities.
func (s *MythicalService) HandleInstallIssueWrite(ctx context.Context, lease *jobs.Lease) error {
	claim := lease.Claim()
	var job installIssueWriteJob
	var credential middleware.Credential
	if json.Unmarshal(claim.Payload, &job) != nil || json.Unmarshal(claim.AuthorizationContext, &credential) != nil {
		return lease.Fail(ctx, json.RawMessage(`{"code":"invalid_issue_comment"}`))
	}

	// A hosted act's authority is the actor's live repository permission and
	// their own GitHub write access, so it never reads an install role.
	if _, hosted := hostedIssueOperationCommands[claim.Operation]; hosted {
		return s.handleHostedIssueWrite(ctx, lease, job, credential)
	}
	command, known := installIssueOperationCommands[claim.Operation]
	if !known {
		return lease.Fail(ctx, json.RawMessage(`{"code":"invalid_issue_operation"}`))
	}
	info, err := middleware.ReloadCredential(ctx, s.queries(), credential, time.Now())
	if err != nil && !errors.Is(err, middleware.ErrCredentialGone) {
		return err
	}
	if err != nil || !middleware.BindInstallCredential(info) {
		return lease.Fail(ctx, json.RawMessage(`{"code":"unauthenticated","class":"permission"}`))
	}
	bound := middleware.ContextWithAuthInfo(ctx, info)
	subject := InstallSubject{RepositoryID: job.Repository}
	decision, err := Authorize(bound, s.queries(), command, subject)
	if err != nil {
		return lease.Fail(ctx, json.RawMessage(`{"code":"permission","class":"permission"}`))
	}
	bound = WithInstallAuthorization(bound, command, decision, subject)
	gh, err := s.stackGitHub(bound, job.Repository)
	if err != nil {
		return err
	}
	// The App writer may look up a prior marker and mint its narrow token.
	// Fence only its actual send: slow reads hold no credential/roster locks.
	bound = context.WithValue(bound, gitHubIssueSendKey{}, gitHubIssueSendFence(func(send func(context.Context) error) error {
		tx, err := s.store.Begin(bound)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(context.WithoutCancel(bound)) }()
		current, repository, err := lockInstallCredential(bound, tx, info, false)
		if err != nil {
			return err
		}
		if repository != job.Repository || decision.UserID != job.Requester {
			return confirmationPermission()
		}
		if _, err = Authorize(current, db.New(tx), command, subject); err != nil {
			return err
		}
		if err = lease.StartExternal(current, json.RawMessage(`{"state":"sending"}`)); err != nil {
			return err
		}
		if err = send(current); err != nil {
			return err
		}
		return tx.Commit(current)
	}))
	return s.sendIssueWriteAct(ctx, bound, lease, gh, job, claim.Operation)
}

// sendIssueWriteAct performs the one external request the claimed operation
// names and records its terminal receipt. Both authorities share it, so the
// GitHub-side behaviour of each act — a close recording `state_reason:
// completed`, a reopen carrying none, a text edit naming no state and so
// unable to reopen a closed issue, a keyed comment said once — is literally
// the same code in the install and in the hosted composition.
func (s *MythicalService) sendIssueWriteAct(ctx context.Context, bound context.Context, lease *jobs.Lease, gh mythicalGitHubRepo, job installIssueWriteJob, operation string) error {
	body := job.Body + "\n\nRequested by @" + job.Login
	var err error
	switch issueWriteActs[operation] {
	case "create":
		var created mythicalIssue
		created, err = s.github.CreateIssue(bound, gh, job.Title, body)
		if err == nil {
			receipt, _ := json.Marshal(map[string]any{"state": "completed", "number": created.Number})
			return lease.Complete(ctx, receipt)
		}
	case "close":
		err = s.github.UpdateIssue(bound, gh, job.Number, mythicalIssueEdit{State: "closed"})
	case "reopen":
		err = s.github.UpdateIssue(bound, gh, job.Number, mythicalIssueEdit{State: "open"})
	case "comment.edit":
		// The edit keeps the attribution line the original comment carried,
		// so rewriting the text never drops who asked for it.
		err = s.github.UpdateIssueComment(bound, gh, job.Comment, body)
	default:
		// The keyed comment is said once per operation: a retry after a post
		// whose reply was lost edits that comment instead of repeating it.
		err = s.github.Comment(bound, gh, job.Number, lease.Claim().OperationID, body)
	}
	if err != nil {
		return err
	}
	return lease.Complete(ctx, json.RawMessage(`{"state":"completed"}`))
}

// The provider owns marker lookup/token minting; the worker fences the exact
// write before it starts. Other stack comment callers retain their own guards.
type gitHubIssueSendKey struct{}
type gitHubIssueSendFence func(func(context.Context) error) error

func sendGitHubIssueWrite(ctx context.Context, send func(context.Context) error) error {
	if fence, ok := ctx.Value(gitHubIssueSendKey{}).(gitHubIssueSendFence); ok {
		return fence(send)
	}
	return send(ctx)
}

func (s *MythicalService) prepareIssueCommentConfirmation(ctx context.Context, tx pgx.Tx, repository int64, input ConfirmationInput, inspect bool) (preparedConfirmation, error) {
	p := preparedConfirmation{}
	if s.issueJobs == nil || s.github == nil {
		return p, confirmationUnavailable()
	}
	var subject struct {
		Kind string `json:"kind"`
		Ref  string `json:"ref"`
	}
	var request struct {
		Body string `json:"body"`
	}
	if confirmationJSON(input.Subject, &subject) != nil || subject.Kind != "issue" || confirmationJSON(input.Payload, &request) != nil {
		return p, invalidConfirmation()
	}
	number, err := strconv.ParseInt(subject.Ref, 10, 64)
	if err != nil || subject.Ref != strconv.FormatInt(number, 10) || validIssueComment(number, request.Body, input.Key) != nil {
		return p, invalidConfirmation()
	}
	p.subject, _ = json.Marshal(subject)
	p.input, _ = json.Marshal(request)
	p.revision = fmt.Sprintf("%d:%d", repository, number)
	p.title = "#" + subject.Ref
	p.comment = &installIssueWriteJob{Number: number, Body: request.Body}
	if inspect {
		p.card = map[string]any{"kind": "one_click", "action": map[string]string{"tag": "issue.comment", "verb": "Comment"}, "summary": p.title,
			"subject": map[string]string{"kind": "issue", "ref": subject.Ref, "revision": p.revision}, "text": request.Body, "asked_by": todoActor(ctx, *middleware.AuthInfoFromContext(ctx).User)}
	}
	return p, nil
}

// InstallIssueCreateInput is the catalog issue.new payload.
type InstallIssueCreateInput struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func validInstallIssueCreate(input InstallIssueCreateInput, key string) error {
	if strings.TrimSpace(input.Title) == "" || len(input.Title) > 256 || len(input.Body) > 65536 || key == "" || len(key) > 256 || validWikiBody(input.Title) != nil || validWikiBody(input.Body) != nil {
		return &TodoControlError{Status: 400, Class: "user", Code: "invalid_issue", Message: "Invalid issue"}
	}
	return nil
}
func (s *MythicalService) RequestInstallIssueCreate(ctx context.Context, repository int64, input InstallIssueCreateInput, key string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, issuesUnavailable()
	}
	decision, err := Authorize(ctx, s.queries(), "issue.new")
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	ctx = WithInstallAuthorization(ctx, "issue.new", decision)
	if err = validInstallIssueCreate(input, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	var receipt jobs.RequestReceipt
	err = pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		var err error
		receipt, err = s.admitIssueWrite(ctx, tx, repository, installIssueWriteJob{Title: input.Title, Body: input.Body}, key, "issue.new", InstallIssueCreateOperation)
		return err
	})
	return receipt, err
}
func (s *MythicalService) prepareIssueCreateConfirmation(ctx context.Context, tx pgx.Tx, repository int64, input ConfirmationInput, inspect bool) (preparedConfirmation, error) {
	p := preparedConfirmation{}
	if s.issueJobs == nil || s.github == nil {
		return p, confirmationUnavailable()
	}
	var subject struct {
		Kind string `json:"kind"`
		Ref  string `json:"ref"`
	}
	var request InstallIssueCreateInput
	if confirmationJSON(input.Subject, &subject) != nil || subject.Kind != "issue" || subject.Ref != "new" || confirmationJSON(input.Payload, &request) != nil || validInstallIssueCreate(request, input.Key) != nil {
		return p, invalidConfirmation()
	}
	p.subject, _ = json.Marshal(subject)
	p.input, _ = json.Marshal(request)
	p.revision = fmt.Sprintf("%d:new", repository)
	p.title = request.Title
	p.comment = &installIssueWriteJob{Title: request.Title, Body: request.Body}
	if inspect {
		p.card = map[string]any{"kind": "one_click", "action": map[string]string{"tag": "issue.new", "verb": "Create"}, "summary": p.title, "subject": map[string]string{"kind": "issue", "ref": "new", "revision": p.revision}, "text": request.Body, "asked_by": todoActor(ctx, *middleware.AuthInfoFromContext(ctx).User)}
	}
	return p, nil
}

// InstallIssueCreateStatus answers the state of one admitted issue write —
// the create's new number once GitHub has given one. It is the door a client
// whose acknowledgment never arrived reads instead of repeating the write.
func (s *MythicalService) InstallIssueCreateStatus(ctx context.Context, repository int64, id string) (map[string]any, error) {
	if s == nil || s.issueJobs == nil {
		return nil, issuesUnavailable()
	}
	if _, err := Authorize(ctx, s.queries(), "issue.read"); err != nil {
		return nil, err
	}
	info := middleware.AuthInfoFromContext(ctx)
	var result map[string]any
	err := pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		bound, current, err := lockInstallCredential(ctx, tx, info, false)
		if err != nil {
			return err
		}
		if current != repository {
			return confirmationPermission()
		}
		identity, _ := json.Marshal(middleware.CredentialOf(info))
		digest := sha256.Sum256(identity)
		operation, err := s.issueJobs.GetInTx(bound, tx, jobs.Scope{TenantID: fmt.Sprintf("repository:%d", repository), PrincipalID: "credential:" + hex.EncodeToString(digest[:])}, id)
		// Every issue write this pipeline admits is readable here: a client
		// whose POST reply was lost reads its outcome rather than sending the
		// write a second time.
		if errors.Is(err, jobs.ErrNotFound) || err == nil && installIssueOperationCommands[operation.Operation] == "" {
			return &TodoControlError{Status: 404, Class: "user", Code: "issue_request_not_found", Message: "Issue request unavailable"}
		}
		if err != nil {
			return err
		}
		result = map[string]any{"state": operation.State}
		var receipt struct {
			Number int64 `json:"number"`
		}
		if operation.State == jobs.StateCompleted && json.Unmarshal(operation.TerminalReceipt, &receipt) == nil && receipt.Number > 0 {
			result["number"] = receipt.Number
		}
		return nil
	})
	return result, err
}

// InstallIssueStateInput is the state an issue should hold: open or closed.
// It is the whole body of the close and reopen doors, which carry no text.
type InstallIssueStateInput struct {
	State string `json:"state"`
}

// RequestInstallIssueClose and RequestInstallIssueReopen admit the ordinary
// close and reopen of the install repository's GitHub issue, on the same
// durable pipeline as the create and the comment: the acknowledgment is
// immediate, the send happens once on the worker behind the same credential
// reload, actor re-authorization and send fence, and an outcome GitHub never
// confirmed stays visible as uncertain rather than being POSTed again.
func (s *MythicalService) RequestInstallIssueClose(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return s.requestInstallIssueState(ctx, repository, number, key, InstallIssueCloseOperation)
}

func (s *MythicalService) RequestInstallIssueReopen(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error) {
	return s.requestInstallIssueState(ctx, repository, number, key, InstallIssueReopenOperation)
}

func validIssueNumber(number int64, key string) error {
	if number <= 0 || key == "" || len(key) > 256 {
		return &TodoControlError{Status: 400, Code: "invalid_issue_state", Class: "user", Message: "Invalid issue"}
	}
	return nil
}

func (s *MythicalService) requestInstallIssueState(ctx context.Context, repository, number int64, key, operation string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, issuesUnavailable()
	}
	command := installIssueOperationCommands[operation]
	decision, err := Authorize(ctx, s.queries(), command)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	ctx = WithInstallAuthorization(ctx, command, decision)
	if err = validIssueNumber(number, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	var receipt jobs.RequestReceipt
	err = pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		var err error
		receipt, err = s.admitIssueWrite(ctx, tx, repository, installIssueWriteJob{Number: number}, key, command, operation)
		return err
	})
	return receipt, err
}

// RequestInstallIssueCommentEdit admits an edit of one comment the install's
// App wrote. GitHub only lets a comment's own author edit it, so a person's
// own comment answers the provider's refusal rather than being rewritten by
// the App on their behalf.
func (s *MythicalService) RequestInstallIssueCommentEdit(ctx context.Context, repository, comment int64, body, key string) (jobs.RequestReceipt, error) {
	if s == nil || s.store == nil || s.github == nil || s.issueJobs == nil {
		return jobs.RequestReceipt{}, issuesUnavailable()
	}
	const command = "issue.comment"
	decision, err := Authorize(ctx, s.queries(), command)
	if err != nil {
		return jobs.RequestReceipt{}, err
	}
	ctx = WithInstallAuthorization(ctx, command, decision)
	if err = validIssueComment(comment, body, key); err != nil {
		return jobs.RequestReceipt{}, err
	}
	var receipt jobs.RequestReceipt
	err = pgx.BeginFunc(ctx, s.store, func(tx pgx.Tx) error {
		var err error
		receipt, err = s.admitIssueWrite(ctx, tx, repository, installIssueWriteJob{Comment: comment, Body: body}, key, command, InstallIssueCommentEditOperation)
		return err
	})
	return receipt, err
}

// InstallIssueStateWriter is the close and reopen pair the route calls. One
// interface keeps the two doors literally the same code path apart from the
// operation each admits.
type InstallIssueStateWriter interface {
	RequestInstallIssueClose(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error)
	RequestInstallIssueReopen(ctx context.Context, repository, number int64, key string) (jobs.RequestReceipt, error)
}
