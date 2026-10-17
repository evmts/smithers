package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

const (
	ArchivesPath = "/api/conversation-archives"
	// A chat's turns move to this key when it is archived. No live route
	// resolves it: a branch key never starts with it and an account key is
	// derived from the session.
	archiveKeyPrefix = "archive-"
	maxArchiveLabel  = 200
	maxArchiveTitle  = 400
	maxArchiveList   = 500
)

// Archive is one chat cut from a conversation: where it happened, what it was
// about, and the runs it started. Its entries are read by ArchivedEntries.
type Archive struct {
	ID string `json:"id"`
	// Repository is owner/name; nil is the no-repository group.
	Repository *string        `json:"repository"`
	Branch     *string        `json:"branch"`
	Title      string         `json:"title"`
	Summary    *string        `json:"summary"`
	Runs       []RunReference `json:"runs"`
	Entries    int            `json:"entries"`
	FirstAt    int64          `json:"first_at"`
	LastAt     int64          `json:"last_at"`
	ArchivedAt int64          `json:"archived_at"`
	ArchivedBy string         `json:"archived_by,omitempty"`
}

// ArchiveLabel is what history groups an archived chat by. The browser sends
// the repository and branch its header shows; empty means none.
type ArchiveLabel struct{ Repository, Branch string }

// ArchivedConversation is an archived chat with its read-only entries.
type ArchivedConversation struct {
	Archive      Archive            `json:"archive"`
	Conversation SharedConversation `json:"conversation"`
}

func archiveKey(id string) string { return archiveKeyPrefix + id }

func validArchiveLabel(value string) bool {
	return len(value) <= maxArchiveLabel && utf8.ValidString(value) && !strings.ContainsAny(value, "\x00\r\n")
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// An archive is read by the account that owns a private chat, or by an active
// member of the repository a shared chat belongs to.
const archiveReader = `((a.repository_id=0 AND $1=0 AND a.owner_id=$2) OR (a.repository_id>0 AND a.repository_id=$1))`

const archiveColumns = `a.id,a.repository,a.branch,a.title,a.summary,a.runs,a.entry_count,a.first_at,a.last_at,a.archived_at,coalesce(u.username,'')`

func scanArchive(row pgx.Row) (Archive, error) {
	var archive Archive
	var runs []byte
	var first, last, archived time.Time
	if err := row.Scan(&archive.ID, &archive.Repository, &archive.Branch, &archive.Title, &archive.Summary, &runs, &archive.Entries, &first, &last, &archived, &archive.ArchivedBy); err != nil {
		return Archive{}, err
	}
	if json.Unmarshal(runs, &archive.Runs) != nil {
		return Archive{}, ErrCorrupt
	}
	if archive.Runs == nil {
		archive.Runs = []RunReference{}
	}
	archive.FirstAt, archive.LastAt, archive.ArchivedAt = first.UnixMilli(), last.UnixMilli(), archived.UnixMilli()
	return archive, nil
}

// Archive moves the conversation's turns into history and leaves the branch
// with an empty chat. It returns nil when there is nothing to archive, and
// ErrConflict while a prompt is running or queued: a started turn keeps
// writing to the key it was claimed under.
func (s *Store) Archive(ctx context.Context, scope Scope, branch string, label ArchiveLabel) (*Archive, error) {
	label.Repository, label.Branch = strings.TrimSpace(label.Repository), strings.TrimSpace(label.Branch)
	if scope.RepositoryID < 0 || scope.UserID <= 0 || !validIdentity(branch) || strings.HasPrefix(branch, archiveKeyPrefix) ||
		!validArchiveLabel(label.Repository) || !validArchiveLabel(label.Branch) {
		return nil, ErrInvalidRequest
	}
	if scope.RepositoryID == 0 && branch != accountConversationID(scope.UserID) {
		return nil, ErrInvalidRequest
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if err = activeReader(ctx, tx, scope); err != nil {
		return nil, err
	}
	if scope.RepositoryID > 0 {
		// An install knows its own repository; the browser's label never names another.
		var owner, name string
		err = tx.QueryRow(ctx, `SELECT coalesce(value->>'owner_login',''),coalesce(value->>'repository_name','') FROM install_settings WHERE key='github.repository'`).Scan(&owner, &name)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if owner != "" && name != "" && validArchiveLabel(owner+"/"+name) {
			label.Repository = owner + "/" + name
		}
	}
	// A claim takes this lock before a turn starts, so none starts under the
	// old key while its rows move.
	if err = lockTurnIdentity(ctx, tx, fmt.Sprint(scope.RepositoryID), "conversation:"+branch); err != nil {
		return nil, err
	}
	var open bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM chat_turns WHERE repository_id=$1 AND conversation_id=$2 AND ($1>0 OR user_id=$3) AND NOT terminal)`,
		scope.RepositoryID, branch, scope.UserID).Scan(&open); err != nil {
		return nil, err
	}
	if open {
		return nil, ErrConflict
	}
	rows, err := tx.Query(ctx, `SELECT `+turnColumns+` FROM chat_turns WHERE repository_id=$1 AND conversation_id=$2 AND producer_generation>0 AND state NOT IN ('queued','retired')
	 AND (($1>0 AND request_payload->>'sharedConversation'='true') OR ($1=0 AND user_id=$3 AND request_payload->>'privateConversation'='true')) ORDER BY entry_seq,id`, scope.RepositoryID, branch, scope.UserID)
	if err != nil {
		return nil, err
	}
	turns := []turnRecord{}
	for rows.Next() {
		turn, scanErr := scanTurn(rows)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		turns = append(turns, turn)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if len(turns) == 0 {
		return nil, nil
	}
	title, runs, seen := "", []RunReference{}, map[RunReference]struct{}{}
	first, last := turns[0].CreatedAt, turns[0].UpdatedAt
	for _, turn := range turns {
		if turn.CreatedAt.Before(first) {
			first = turn.CreatedAt
		}
		if turn.UpdatedAt.After(last) {
			last = turn.UpdatedAt
		}
		// A turn whose journal no longer verifies still archives; it only
		// contributes no title and no runs.
		if title == "" {
			if _, prompt, metadataErr := conversationMetadata(turn); metadataErr == nil {
				title = entryTitle(prompt)
			}
		}
		links, linkErr := s.publicRunReferences(ctx, tx, turn)
		if linkErr != nil {
			if errors.Is(linkErr, ErrCorrupt) || errors.Is(linkErr, ErrLimit) || errors.Is(linkErr, ErrForbidden) {
				continue
			}
			return nil, linkErr
		}
		for _, link := range links {
			if _, exists := seen[link]; !exists && len(runs) < 64 {
				seen[link] = struct{}{}
				runs = append(runs, link)
			}
		}
	}
	for len(title) > maxArchiveTitle {
		_, size := utf8.DecodeLastRuneInString(title)
		title = title[:len(title)-size]
	}
	encodedRuns, err := json.Marshal(runs)
	if err != nil {
		return nil, err
	}
	id := uuid.NewString()
	// Every row under the key moves, retired ones too, so the branch's next
	// chat starts from nothing.
	if _, err = tx.Exec(ctx, `UPDATE chat_turns SET conversation_id=$3 WHERE repository_id=$1 AND conversation_id=$2 AND ($1>0 OR user_id=$4)`,
		scope.RepositoryID, branch, archiveKey(id), scope.UserID); err != nil {
		return nil, err
	}
	var owner *int64
	if scope.RepositoryID == 0 {
		owner = &scope.UserID
	}
	if _, err = tx.Exec(ctx, `INSERT INTO chat_archives(id,repository_id,owner_id,archived_by,source_conversation_id,repository,branch,title,runs,entry_count,first_at,last_at)
	 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, id, scope.RepositoryID, owner, scope.UserID, branch, optional(label.Repository), optional(label.Branch), title, encodedRuns, len(turns), first, last); err != nil {
		return nil, err
	}
	// Entry numbers start over in the next chat, and a member's last-seen
	// mark only ever rises: drop it, or the new chat would read as seen.
	if scope.RepositoryID == 0 {
		_, err = tx.Exec(ctx, `UPDATE chat_account_views SET view_state=view_state-'last_seen_seq' WHERE user_id=$1 AND conversation_id=$2`, scope.UserID, branch)
	} else {
		_, err = tx.Exec(ctx, `UPDATE collaborators SET view_state=jsonb_set(view_state,ARRAY[$2],(view_state->$2)-'last_seen_seq')
		 WHERE repository_id=$1 AND jsonb_typeof(view_state->$2)='object'`, scope.RepositoryID, branch)
	}
	if err != nil {
		return nil, err
	}
	archive, err := scanArchive(tx.QueryRow(ctx, `SELECT `+archiveColumns+` FROM chat_archives a LEFT JOIN users u ON u.id=a.archived_by WHERE a.id=$1`, id))
	if err != nil {
		return nil, err
	}
	if s.OnArchive != nil {
		if err = s.OnArchive(ctx, tx, scope, archive.ID); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &archive, nil
}

// Archives lists the reader's archived chats, newest first.
func (s *Store) Archives(ctx context.Context, scope Scope) ([]Archive, error) {
	if scope.RepositoryID < 0 || scope.UserID <= 0 {
		return nil, ErrInvalidRequest
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if err = activeReader(ctx, tx, scope); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT `+archiveColumns+` FROM chat_archives a LEFT JOIN users u ON u.id=a.archived_by WHERE `+archiveReader+`
	 ORDER BY a.archived_at DESC,a.id LIMIT $3`, scope.RepositoryID, scope.UserID, maxArchiveList)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	archives := []Archive{}
	for rows.Next() {
		archive, scanErr := scanArchive(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		archives = append(archives, archive)
	}
	return archives, rows.Err()
}

// ArchivedEntries reads one archived chat. The archive row admits the reader;
// the entries then pass the same projection as a live conversation.
func (s *Store) ArchivedEntries(ctx context.Context, scope Scope, id string) (ArchivedConversation, error) {
	if scope.RepositoryID < 0 || scope.UserID <= 0 || !validIdentity(id) {
		return ArchivedConversation{}, ErrInvalidRequest
	}
	archive, err := scanArchive(s.pool.QueryRow(ctx, `SELECT `+archiveColumns+` FROM chat_archives a LEFT JOIN users u ON u.id=a.archived_by WHERE a.id=$3 AND `+archiveReader,
		scope.RepositoryID, scope.UserID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return ArchivedConversation{}, ErrNotFound
	}
	if err != nil {
		return ArchivedConversation{}, err
	}
	// An archived chat reads as an older client does: answers and cards, no working trace.
	conversation, err := s.sharedEntries(ctx, scope, archiveKey(archive.ID), false)
	if err != nil {
		return ArchivedConversation{}, err
	}
	return ArchivedConversation{Archive: archive, Conversation: conversation}, nil
}

func archiveError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrConflict):
		pkgerrors.WriteError(w, pkgerrors.Conflict("A prompt is running or queued"))
	case errors.Is(err, ErrNotFound):
		pkgerrors.WriteError(w, pkgerrors.NotFound("Archived chat unavailable"))
	case errors.Is(err, ErrForbidden):
		writeProblem(w, http.StatusForbidden, "forbidden")
	default:
		publicError(w, err)
	}
}

// ArchiveConversation is a person's act: an agent credential cannot end the
// chat it is answering in.
func (h *Handler) ArchiveConversation(w http.ResponseWriter, r *http.Request) {
	if auth := middleware.AuthInfoFromContext(r.Context()); auth == nil || auth.IsAgent() {
		writeProblem(w, http.StatusForbidden, "forbidden")
		return
	}
	scope, ok := h.publicScope(w, r)
	if !ok {
		return
	}
	var input struct {
		Repository string `json:"repository"`
		Branch     string `json:"branch"`
	}
	if !decodeBounded(w, r, &input) {
		return
	}
	branch, err := h.branch(w, r, scope)
	if err != nil {
		return
	}
	// A shared chat is archived under the branch it was addressed by.
	if named, unescapeErr := url.PathUnescape(chi.URLParam(r, "b")); unescapeErr == nil && scope.RepositoryID > 0 && strings.TrimSpace(input.Branch) == "" {
		input.Branch = named
	}
	archive, err := h.Store.Archive(r.Context(), scope, branch, ArchiveLabel{Repository: input.Repository, Branch: input.Branch})
	if err != nil {
		archiveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"archive": archive})
}

func (h *Handler) ListArchives(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.publicScope(w, r)
	if !ok {
		return
	}
	archives, err := h.Store.Archives(r.Context(), scope)
	if err != nil {
		archiveError(w, err)
		return
	}
	if h.Store.OnArchivesRead != nil {
		_ = h.Store.OnArchivesRead(r.Context(), scope)
	}
	writeJSON(w, http.StatusOK, map[string]any{"archives": archives})
}

func (h *Handler) ReadArchive(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.publicScope(w, r)
	if !ok {
		return
	}
	id, err := url.PathUnescape(chi.URLParam(r, "id"))
	if err != nil {
		archiveError(w, ErrInvalidRequest)
		return
	}
	result, err := h.Store.ArchivedEntries(r.Context(), scope, id)
	if err != nil {
		archiveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
