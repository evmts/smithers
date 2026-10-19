package compose

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/config"
)

// sessionBoxRoutesFile classifies every served route (hosted and install):
// the check that keeps an agent session's own box to its person, or why the
// route reaches no box. TestEverySessionBoxGateRefusesAnotherPerson
// (internal/services) runs each probe class's check against another person's
// box from this same file.
const sessionBoxRoutesFile = "testdata/session_box_routes.tsv"

// sessionBoxPathBound matches a served path that names a workspace, a
// workspace session or snapshot, an agent session, a run, a branch, a
// conversation, a gateway or a terminal: a door that can reach an agent
// session's own box by its path.
var sessionBoxPathBound = regexp.MustCompile(`/(workspaces|workspace/sessions|workspace-snapshots|agent/sessions|agent-sessions|monitors|branches|terminals|conversations|gateways|runs)/\{|/agent/sessions$`)

// sessionBoxBodyBound are the served routes that name a box in their body or
// query rather than their path. Each must be classified as a door.
var sessionBoxBodyBound = []string{
	"post /api/workflow/provision",
	"post /api/workflow/rpc",
	"post /api/repos/{owner}/{repo}/workspace/sessions",
	"post /api/repos/{owner}/{repo}/workspace-snapshots",
	"post /api/terminals",
	"get /api/ssh",
}

// sessionTranscriptRoutes are the routes PM d-k9xonl makes creator-only (404
// to everyone else); Platform's lane A pass 4 (C) enforces it.
var sessionTranscriptRoutes = []string{
	"get /api/repos/{owner}/{repo}/agent/sessions",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/messages",
	"get /api/repos/{owner}/{repo}/agent/sessions/{id}/stream",
}

const sessionTranscriptClass = "creator-only-lane-a-4c"

type sessionBoxRouteClass struct {
	door  bool
	proof string
}

type sessionBoxRoutes struct {
	classes map[string]sessionBoxRouteClass
	routes  map[string]string
}

func loadSessionBoxRoutes(t *testing.T) sessionBoxRoutes {
	t.Helper()
	file, err := os.Open(sessionBoxRoutesFile)
	require.NoError(t, err)
	defer file.Close()
	parsed, problems := parseSessionBoxRoutes(bufio.NewScanner(file))
	require.Empty(t, problems)
	return parsed
}

func parseSessionBoxRoutes(scanner *bufio.Scanner) (sessionBoxRoutes, []string) {
	parsed := sessionBoxRoutes{classes: map[string]sessionBoxRouteClass{}, routes: map[string]string{}}
	var problems []string
	for line := 1; scanner.Scan(); line++ {
		text := scanner.Text()
		if strings.TrimSpace(text) == "" || strings.HasPrefix(text, "#") {
			continue
		}
		fields := strings.Split(text, "\t")
		switch {
		case fields[0] == "class" && len(fields) == 5 && (fields[2] == "door" || fields[2] == "none"):
			parsed.classes[fields[1]] = sessionBoxRouteClass{door: fields[2] == "door", proof: fields[3]}
		case fields[0] == "route" && len(fields) == 3:
			if _, dup := parsed.routes[fields[1]]; dup {
				problems = append(problems, fmt.Sprintf("line %d: %s is classified twice", line, fields[1]))
			}
			parsed.routes[fields[1]] = fields[2]
		default:
			problems = append(problems, fmt.Sprintf("line %d: malformed: %q", line, text))
		}
	}
	return parsed, problems
}

// sessionBoxRouteProblems checks a composition's served routes against the
// classification: every served route is classified once, by a known class;
// nothing unserved is listed; a route that names a box by its path or body is
// a door; a door says how its check is proven; and the transcript routes
// carry exactly the creator-only class.
func sessionBoxRouteProblems(served []string, bodyBound []string, parsed sessionBoxRoutes) []string {
	var problems []string
	servedSet := map[string]bool{}
	for _, key := range served {
		servedSet[key] = true
		class, ok := parsed.routes[key]
		if !ok {
			problems = append(problems, fmt.Sprintf("served route %s is not classified in %s", key, sessionBoxRoutesFile))
			continue
		}
		definition, known := parsed.classes[class]
		if !known {
			problems = append(problems, fmt.Sprintf("%s has unknown class %q", key, class))
			continue
		}
		_, path, _ := strings.Cut(key, " ")
		if sessionBoxPathBound.MatchString(path) && !definition.door && class != "own-create" {
			problems = append(problems, fmt.Sprintf("%s names a box in its path but is classified %q, which is no door", key, class))
		}
	}
	for _, key := range bodyBound {
		if !servedSet[key] {
			continue
		}
		if definition, ok := parsed.classes[parsed.routes[key]]; !ok || !definition.door {
			problems = append(problems, fmt.Sprintf("%s names a box in its body or query but is classified %q, which is no door", key, parsed.routes[key]))
		}
	}
	for key := range parsed.routes {
		if !servedSet[key] {
			problems = append(problems, fmt.Sprintf("%s lists %s, which no composition serves", sessionBoxRoutesFile, key))
		}
	}
	for name, definition := range parsed.classes {
		proof := definition.proof
		switch {
		case !definition.door && proof != "-":
			problems = append(problems, fmt.Sprintf("class %s is no door but names proof %q", name, proof))
		case definition.door && !(proof == "probe" || strings.HasPrefix(proof, "test:") || strings.HasPrefix(proof, "deferred:") || strings.HasPrefix(proof, "gap:")):
			problems = append(problems, fmt.Sprintf("door class %s names no proof (%q)", name, proof))
		}
	}
	for _, key := range sessionTranscriptRoutes {
		if servedSet[key] && parsed.routes[key] != sessionTranscriptClass {
			problems = append(problems, fmt.Sprintf("%s is an agent session transcript: classify it %s (PM d-k9xonl), not %q", key, sessionTranscriptClass, parsed.routes[key]))
		}
	}
	for key, class := range parsed.routes {
		if class == sessionTranscriptClass && !containsString(sessionTranscriptRoutes, key) {
			problems = append(problems, fmt.Sprintf("%s is classified %s but is no transcript route", key, class))
		}
	}
	sort.Strings(problems)
	return problems
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// EVERY SERVED ROUTE KEEPS A SESSION'S BOX TO ITS PERSON (Security d-b01lum,
// d-nhn9cy finding 3). Every route either composition serves is classified,
// collections and body- or query-bound routes included. A route that names a
// box is a door, and each door's check is run against another person's box:
// by TestEverySessionBoxGateRefusesAnotherPerson for a probe class, or by the
// named test. A new route fails here until it is classified.
func TestSessionBoxRouteAuthorizationCoverage(t *testing.T) {
	routes := servedCompositionRoutes(t, config.AuthModeMultitenant, config.AuthModeSelfHosted)
	served := make([]string, 0, len(routes))
	for key := range routes {
		served = append(served, key)
	}
	parsed := loadSessionBoxRoutes(t)
	for _, problem := range sessionBoxRouteProblems(served, sessionBoxBodyBound, parsed) {
		t.Error(problem)
	}
	for name, definition := range parsed.classes {
		dir, test, ok := strings.Cut(strings.TrimPrefix(definition.proof, "test:"), ":")
		if !strings.HasPrefix(definition.proof, "test:") {
			continue
		}
		require.True(t, ok, "class %s: proof %q is test:<dir>:<Test>", name, definition.proof)
		require.True(t, testDefined(t, filepath.Join("..", "..", dir), test), "class %s: %s does not define %s", name, dir, test)
	}
	doors := 0
	for _, class := range parsed.routes {
		if parsed.classes[class].door {
			doors++
		}
	}
	t.Logf("%d served routes, %d doors to a box", len(served), doors)
}

func testDefined(t *testing.T, dir, name string) bool {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "*_test.go"))
	require.NoError(t, err)
	for _, path := range files {
		data, err := os.ReadFile(path)
		require.NoError(t, err)
		if strings.Contains(string(data), "func "+name+"(t *testing.T)") {
			return true
		}
	}
	return false
}

// The checker fails on the routes it exists to catch (Security d-nhn9cy
// finding 3): an unguarded path-bound route and an unguarded body-bound route
// that nobody classified, a path-bound route classified as no door, and a
// transcript route that lost its class.
func TestSessionBoxRouteCoverageCatchesUnguardedRoutes(t *testing.T) {
	parsed, problems := parseSessionBoxRoutes(bufio.NewScanner(strings.NewReader(strings.Join([]string{
		"class\tworkspace-read\tdoor\tprobe\tcheck",
		"class\tno-box\tnone\t-\tnothing",
		"route\tget /api/repos/{owner}/{repo}/workspaces/{id}\tworkspace-read",
		"route\tget /api/repos/{owner}/{repo}/workspaces/{id}/mislabelled\tno-box",
		"route\tget /api/repos/{owner}/{repo}/agent/sessions/{id}\tno-box",
	}, "\n"))))
	require.Empty(t, problems)

	got := sessionBoxRouteProblems([]string{
		"get /api/repos/{owner}/{repo}/workspaces/{id}",
		"get /api/repos/{owner}/{repo}/workspaces/{id}/unguarded",
		"post /api/unguarded-body",
		"get /api/repos/{owner}/{repo}/workspaces/{id}/mislabelled",
		"get /api/repos/{owner}/{repo}/agent/sessions/{id}",
	}, []string{"post /api/unguarded-body"}, parsed)

	require.Contains(t, got, "served route get /api/repos/{owner}/{repo}/workspaces/{id}/unguarded is not classified in "+sessionBoxRoutesFile, "an unguarded path-bound route fails")
	require.Contains(t, got, "served route post /api/unguarded-body is not classified in "+sessionBoxRoutesFile, "an unguarded body-bound route fails")
	require.Contains(t, got, `post /api/unguarded-body names a box in its body or query but is classified "", which is no door`)
	require.Contains(t, got, `get /api/repos/{owner}/{repo}/workspaces/{id}/mislabelled names a box in its path but is classified "no-box", which is no door`)
	require.Contains(t, got, `get /api/repos/{owner}/{repo}/agent/sessions/{id} is an agent session transcript: classify it creator-only-lane-a-4c (PM d-k9xonl), not "no-box"`)
	require.NotContains(t, strings.Join(got, "\n"), "workspaces/{id} is not classified", "a classified door passes")
}
