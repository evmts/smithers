package repohostserver

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/hostexec"
	"github.com/smithersai/smithers/packages/backend/internal/repohost"
)

const commitFormat = "--format=%H%x00%h%x00%an%x00%aI%x00%cI%x00%P%x00%s%x00%b"

// commitGit bounds output as well as process lifetime through the request context.
func commitGit(ctx context.Context, dir string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := hostexec.Git(ctx, append([]string{"--git-dir", dir}, args...)...)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err = cmd.Start(); err != nil {
		return nil, err
	}
	out, readErr := io.ReadAll(io.LimitReader(pipe, (8<<20)+1))
	if len(out) > 8<<20 {
		cancel()
	}
	waitErr := cmd.Wait()
	if len(out) > 8<<20 {
		return nil, fmt.Errorf("commit read exceeds output limit")
	}
	if readErr != nil {
		return nil, readErr
	}
	return out, waitErr
}

func parseRepositoryCommits(out []byte) ([]repohost.RepositoryCommit, error) {
	items := make([]repohost.RepositoryCommit, 0)
	if len(out) == 0 {
		return items, nil
	}
	fields := strings.Split(strings.TrimSuffix(string(out), "\x00"), "\x00")
	if len(fields)%8 != 0 {
		return nil, fmt.Errorf("invalid commit output")
	}
	for i := 0; i < len(fields); i += 8 {
		items = append(items, repohost.RepositoryCommit{SHA: fields[i], ShortSHA: fields[i+1], Author: fields[i+2], AuthoredAt: fields[i+3], CommittedAt: fields[i+4], Parents: strings.Fields(fields[i+5]), Title: fields[i+6], Body: strings.TrimSuffix(fields[i+7], "\n")})
	}
	return items, nil
}

type historyCursor struct {
	Commit string `json:"commit"`
	Path   string `json:"path"`
	Offset int    `json:"offset"`
}

func (s *Server) repositoryHistory(w http.ResponseWriter, r *http.Request) error {
	repoPath, err := s.repoPathFromID(chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	dir := repoGitDir(repoPath)
	unlock, err := s.locks.RLock(r.Context(), repoPath)
	if err != nil {
		return err
	}
	defer unlock()
	q := r.URL.Query()
	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit < 1 || limit > 100 {
		return badRequest("invalid history limit")
	}
	ref, path := q.Get("ref"), q.Get("path")
	if ref == "" || strings.HasPrefix(ref, "-") || strings.ContainsAny(ref, "\x00\r\n") {
		return badRequest("invalid ref")
	}
	if path != "" && (strings.HasPrefix(path, "/") || strings.ContainsAny(path, "\\\x00") || strings.Contains("/"+path+"/", "/../")) {
		return badRequest("invalid path")
	}
	cursor := historyCursor{Path: path}
	if q.Get("cursor") != "" {
		data, decodeErr := base64.RawURLEncoding.DecodeString(q.Get("cursor"))
		if decodeErr != nil || json.Unmarshal(data, &cursor) != nil || !validGitObjectID(cursor.Commit) || cursor.Path != path || cursor.Offset < 1 || cursor.Offset > 10000000 {
			return badRequest("invalid history cursor")
		}
	} else {
		// Resolve a branch before walking; subsequent pages cannot move with it.
		out, resolveErr := commitGit(r.Context(), dir, "rev-parse", "--verify", "--end-of-options", ref+"^{commit}")
		if resolveErr != nil {
			return notFound("unknown ref")
		}
		cursor.Commit = strings.TrimSpace(string(out))
	}
	args := []string{"log", "-z", commitFormat, "--max-count=" + strconv.Itoa(limit+1), "--skip=" + strconv.Itoa(cursor.Offset), cursor.Commit, "--"}
	if path != "" {
		args = append([]string{args[0], "--follow"}, args[1:]...)
		args = append(args, path)
	}
	out, err := commitGit(r.Context(), dir, args...)
	if err != nil {
		return err
	}
	items, err := parseRepositoryCommits(out)
	if err != nil {
		return err
	}
	if path != "" && cursor.Offset == 0 && len(items) == 0 {
		return notFound("unknown path")
	}
	page := repohost.RepositoryCommitPage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		cursor.Offset += limit
		data, _ := json.Marshal(cursor)
		page.NextCursor = base64.RawURLEncoding.EncodeToString(data)
	}
	return json.NewEncoder(w).Encode(page)
}

func (s *Server) repositoryCommit(w http.ResponseWriter, r *http.Request) error {
	repoPath, err := s.repoPathFromID(chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	sha := chi.URLParam(r, "sha")
	if !validGitObjectID(sha) {
		return notFound("unknown commit")
	}
	unlock, err := s.locks.RLock(r.Context(), repoPath)
	if err != nil {
		return err
	}
	defer unlock()
	dir := repoGitDir(repoPath)
	out, err := commitGit(r.Context(), dir, "log", "-z", commitFormat, "-1", sha, "--")
	if err != nil {
		return notFound("unknown commit")
	}
	items, err := parseRepositoryCommits(out)
	if err != nil || len(items) != 1 {
		return notFound("unknown commit")
	}
	detail := repohost.RepositoryCommitDetail{RepositoryCommit: items[0], Files: make([]repohost.RepositoryCommitFile, 0)}
	args := []string{"diff-tree", "--root", "--no-commit-id", "--find-renames", "-r", "-z"}
	if len(detail.Parents) > 0 {
		args = append(args, detail.Parents[0])
	}
	args = append(args, sha)
	stats, err := commitGit(r.Context(), dir, append(args, "--numstat")...)
	if err != nil {
		return err
	}
	status, err := commitGit(r.Context(), dir, append(args, "--name-status")...)
	if err != nil {
		return err
	}
	statuses := strings.Split(strings.TrimSuffix(string(status), "\x00"), "\x00")

	byPath := map[string]string{}
	renamedFrom := map[string]string{}
	for i := 0; i+1 < len(statuses); {
		status, path := statuses[i], statuses[i+1]
		i += 2
		if strings.HasPrefix(status, "R") {
			if i >= len(statuses) {
				return fmt.Errorf("invalid rename summary")
			}
			renamedFrom[statuses[i]] = path
			path = statuses[i]
			i++
			status = "R"
		}
		byPath[path] = status
	}
	records := strings.Split(string(stats), "\x00")
	for i := 0; i < len(records); i++ {
		if records[i] == "" {
			continue
		}
		fields := strings.SplitN(records[i], "\t", 3)
		if len(fields) != 3 {
			return fmt.Errorf("invalid commit file summary")
		}
		filePath := fields[2]
		if filePath == "" {
			if i+2 >= len(records) {
				return fmt.Errorf("invalid rename statistics")
			}
			filePath = records[i+2]
			i += 2
		}
		additions, _ := strconv.Atoi(fields[0])
		deletions, _ := strconv.Atoi(fields[1])
		kind := map[string]string{"A": "added", "D": "deleted", "M": "modified", "T": "modified", "R": "renamed"}[byPath[filePath]]
		if kind == "" {
			return fmt.Errorf("invalid commit file status")
		}
		detail.Files = append(detail.Files, repohost.RepositoryCommitFile{Path: filePath, From: renamedFrom[filePath], Status: kind, Additions: additions, Deletions: deletions})
	}
	return json.NewEncoder(w).Encode(detail)
}
