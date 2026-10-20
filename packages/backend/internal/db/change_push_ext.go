package db

import (
	"context"
	"encoding/json"
)

// listRecordedPushChanges mirrors every write the push recorder makes for a
// change (services.ChangeService.recordChange) and returns a change only when
// each of those writes would leave its rows as they are:
//
//   - RecordChangeRevision: a non-undo revision already holds the commit, so
//     the upsert would hit its ON CONFLICT arm (idx_change_revisions_non_undo_commit);
//   - replaceChangeConflicts for a clean change: no conflict rows to delete;
//   - UpdateLandingRequestsTurnForRevision: no open landing request whose
//     turn this commit's revision would still advance (same predicate);
//   - replaceIssueChangeLinks: issue_links lists the stored links, with an
//     empty number for a link the recorder could not recreate, so the caller
//     compares them with the description's trailers.
//
// The caller compares the remaining UpsertChange columns with the pushed
// change and requires the pushed change to be clean.
const listRecordedPushChanges = `
SELECT
    c.change_id,
    c.commit_id,
    c.description,
    c.author_name,
    c.author_email,
    c.has_conflict,
    c.is_empty,
    c.parent_change_ids,
    COALESCE((
        SELECT array_agg(
            CASE
                WHEN i.id IS NOT NULL AND i.kind <> 'chat' AND i.repository_id = l.repository_id
                    THEN i.number::text
                ELSE ''
            END || ':' || l.link_type
        )
        FROM issue_change_links AS l
        LEFT JOIN issues AS i ON i.id = l.issue_id
        WHERE l.repository_id = c.repository_id
          AND l.change_id = c.change_id
    ), '{}'::text[]) AS issue_links
FROM changes AS c
WHERE c.repository_id = $1
  AND c.change_id = ANY($2::text[])
  AND EXISTS (
      SELECT 1
      FROM change_revisions AS cr
      WHERE cr.repository_id = c.repository_id
        AND cr.change_id = c.change_id
        AND cr.commit_id = c.commit_id
        AND cr.source <> 'undo'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM conflicts AS cf
      WHERE cf.repository_id = c.repository_id
        AND cf.change_id = c.change_id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM landing_request_changes AS lrc
      JOIN landing_requests AS lr ON lr.id = lrc.landing_request_id
      JOIN change_revisions AS cr
        ON cr.repository_id = c.repository_id
       AND cr.change_id = lrc.change_id
       AND cr.commit_id = c.commit_id
      WHERE lrc.change_id = c.change_id
        AND lr.repository_id = c.repository_id
        AND lr.state NOT IN ('closed', 'merged')
        AND cr.id > lr.turn_revision_id
        AND cr.created_at >= lr.turn_since
  )
`

// RecordedPushChange is a change whose current commit the push recorder has
// already written in full. IssueLinks holds "<issue number>:<link type>"
// entries in no particular order.
type RecordedPushChange struct {
	ChangeID        string
	CommitID        string
	Description     string
	AuthorName      string
	AuthorEmail     string
	HasConflict     bool
	IsEmpty         bool
	ParentChangeIds json.RawMessage
	IssueLinks      []string
}

// ListRecordedPushChanges returns the given changes whose stored commit,
// revision, conflict cache and landing turn a repeat push would not change.
// A change missing from the result must be recorded.
func (q *Queries) ListRecordedPushChanges(ctx context.Context, repositoryID int64, changeIDs []string) ([]RecordedPushChange, error) {
	rows, err := q.db.Query(ctx, listRecordedPushChanges, repositoryID, changeIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]RecordedPushChange, 0, len(changeIDs))
	for rows.Next() {
		var item RecordedPushChange
		if err := rows.Scan(
			&item.ChangeID,
			&item.CommitID,
			&item.Description,
			&item.AuthorName,
			&item.AuthorEmail,
			&item.HasConflict,
			&item.IsEmpty,
			&item.ParentChangeIds,
			&item.IssueLinks,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
