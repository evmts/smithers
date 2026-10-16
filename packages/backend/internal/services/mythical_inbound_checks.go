package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// A fetched check snapshot refreshes owned attempt evidence and wakes the worker;
// it is never approval or proof of readiness.
// The existing merge worker rechecks current authority, head and protection.
// The request and delivery receipt commit together; stale heads wake nothing.
func (s *MythicalService) consumeGitHubCheckTodos(ctx context.Context, tx pgx.Tx, fetched gitHubFetchedObject) (json.RawMessage, error) {
	source, err := lockFetchedRepo(ctx, tx, fetched.Repo)
	if err != nil {
		return nil, err
	}
	if s.installGitHubSync == nil || source.GithubRepositoryID.Int64 != fetched.GitHubRepository || source.InstallationID.Int64 != fetched.Installation {
		return nil, gitHubFetchUnavailable()
	}
	if err := s.installGitHubSync.authorizeFetched(ctx, source); err != nil {
		return nil, err
	}
	var snapshot struct {
		Head string `json:"head"`
	}
	if json.Unmarshal(fetched.Object, &snapshot) != nil || !mythicalHead.MatchString(snapshot.Head) {
		return nil, gitHubFetchUnavailable()
	}
	q := db.New(tx)
	install, err := InstallRepositoryID(ctx, q)
	if err != nil {
		return nil, err
	}
	repositories, err := q.ListRepositoryIDsForGitHubSource(ctx, source.OwnerLogin, source.RepoName)
	if err != nil {
		return nil, err
	}
	woken := 0
	for _, repository := range repositories {
		if repository != install {
			continue
		}
		owner, repo, err := resolveGitHubDestination(ctx, q, nil, 0, repository, "", "")
		if err != nil {
			return nil, err
		}
		if !strings.EqualFold(owner, source.OwnerLogin) || !strings.EqualFold(repo, source.RepoName) {
			continue
		}
		// The stack lock serializes the source self-loop with item transitions.
		if _, err := tx.Exec(ctx, `SELECT repository_id FROM mythical_stacks WHERE repository_id=$1 FOR UPDATE`, repository); err != nil {
			return nil, err
		}
		items, err := q.ListMythicalGitHubBranchItems(ctx, repository)
		if err != nil {
			return nil, err
		}
		owners := 0
		for _, item := range items {
			for _, publication := range mythicalChecksOf(item).Publications {
				if publication.Pull == fetched.Number && publication.Head == snapshot.Head {
					owners++
				}
			}
		}
		for _, item := range items {
			if owners == 1 && mythicalTodo(item) {
				if publication, ok := todoCheckPublication(item, fetched.Number, snapshot.Head); ok {
					gh, err := s.stackGitHub(ctx, repository)
					if err != nil {
						return nil, err
					}
					facts, err := s.github.HeadCheckFacts(ctx, gh, snapshot.Head)
					if err != nil {
						return nil, err
					}
					next := retainTodoGitHubChecks(item, publication, todoGitHubCheckEvidence(facts, fmt.Sprintf("https://github.com/%s/%s/pull/%d/checks", owner, repo, fetched.Number)))
					if !sameMythicalChecks(next, item) {
						item, err = q.SaveMythicalItem(ctx, next)
						if err != nil {
							return nil, err
						}
					}
				}
			}
			if !mythicalTodo(item) || !item.PRNumber.Valid || item.PRNumber.Int64 != fetched.Number || item.PRHead != snapshot.Head || mythicalSettledStates[item.State] {
				continue
			}
			if todoState(item) == "in_review" && item.Number.Valid {
				fact, err := json.Marshal(map[string]any{"item": uuidString(item.ID), "n": item.Number.Int64, "head": snapshot.Head, "from": "in_review", "to": "in_review", "actor": map[string]string{"kind": "system", "id": "smithers"}})
				if err != nil {
					return nil, err
				}
				if _, err := s.recordTodoFact(ctx, tx, item, uuid.NewString(), "todo.checks_updated", "in_review", fact); err != nil {
					return nil, err
				}
			}
			affected, err := q.RequestMythicalStack(ctx, repository)
			if err != nil {
				return nil, err
			}
			woken += int(affected)
			break
		}
	}
	return json.Marshal(map[string]any{"woken": woken, "head": snapshot.Head})
}
