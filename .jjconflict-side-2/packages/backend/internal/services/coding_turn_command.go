package services

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// codingProjectPath is the repository's coding declaration
// (.smithers/flows/coding/project-config.ts loadProject).
const codingProjectPath = ".smithers/coding-project.json"

// codingTestFileBytes is the detector's read limit (check-detection.ts FILE_BYTES).
const codingTestFileBytes = 256 * 1024

// codingTestFile reads one repository file at the turn's head. exists is false
// only for an absent path; a present file the reader cannot return as text has
// exists true and empty text, which is no evidence, as in detectChecks.
type codingTestFile func(path string) (text string, exists bool, err error)

// resolveCodingTestCommand names the test a turn's head declares, as the
// coding flow detects it. A repository file's detected `checks/test` command
// wins. A file that declares its own checks without one names no command the
// server can run. Otherwise the test kind of check-detection.ts checkCommands
// applies. reason says why there is no command.
func resolveCodingTestCommand(read codingTestFile) (argv []string, reason string, err error) {
	text, exists, err := read(codingProjectPath)
	if err != nil {
		return nil, "", err
	}
	if exists {
		var project struct {
			Detected []struct {
				Flow string   `json:"flow"`
				Argv []string `json:"argv"`
			} `json:"detected"`
			Checks json.RawMessage `json:"checks"`
		}
		if json.Unmarshal([]byte(text), &project) != nil {
			return nil, codingProjectPath + " is not a JSON object", nil
		}
		for _, detected := range project.Detected {
			if detected.Flow == "checks/test" && nonEmptyArgv(detected.Argv) {
				return detected.Argv, "", nil
			}
		}
		if len(project.Checks) > 0 && !bytes.Equal(project.Checks, []byte("null")) {
			return nil, codingProjectPath + " declares checks with no checks/test command", nil
		}
	}
	return detectCodingTestCommand(read)
}

func nonEmptyArgv(argv []string) bool {
	for _, arg := range argv {
		if arg == "" {
			return false
		}
	}
	return len(argv) > 0
}

var (
	noTestSpecified = regexp.MustCompile(`no test specified`)
	makefileTest    = regexp.MustCompile(`(?m)^test\s*:`)
)

// detectCodingTestCommand is the test kind of check-detection.ts checkCommands:
// the first source in its order wins.
func detectCodingTestCommand(read codingTestFile) ([]string, string, error) {
	has := func(path string) (bool, error) {
		_, exists, err := read(path)
		return exists, err
	}
	packageJSON, _, err := read("package.json")
	if err != nil {
		return nil, "", err
	}
	var manifest struct {
		Scripts map[string]json.RawMessage `json:"scripts"`
	}
	_ = json.Unmarshal([]byte(packageJSON), &manifest)
	var script string
	if raw, ok := manifest.Scripts["test"]; ok && json.Unmarshal(raw, &script) == nil && !noTestSpecified.MatchString(script) {
		manager := "npm"
		for _, lock := range []struct{ path, manager string }{{"pnpm-lock.yaml", "pnpm"}, {"yarn.lock", "yarn"}, {"bun.lockb", "bun"}, {"bun.lock", "bun"}} {
			found, err := has(lock.path)
			if err != nil {
				return nil, "", err
			}
			if found {
				manager = lock.manager
				break
			}
		}
		return []string{manager, "run", "test"}, "", nil
	}
	makefile, _, err := read("Makefile")
	if err != nil {
		return nil, "", err
	}
	if makefileTest.MatchString(makefile) {
		return []string{"make", "test"}, "", nil
	}
	for _, source := range []struct {
		paths []string
		argv  []string
	}{
		{[]string{"Cargo.toml"}, []string{"cargo", "test", "--quiet"}},
		{[]string{"go.mod"}, []string{"go", "test", "./..."}},
		{[]string{"pyproject.toml", "setup.py", "pytest.ini"}, []string{"python3", "-m", "pytest", "-q"}},
	} {
		for _, path := range source.paths {
			found, err := has(path)
			if err != nil {
				return nil, "", err
			}
			if found {
				return source.argv, "", nil
			}
		}
	}
	return nil, "the repository declares no test", nil
}

var plainCommandArg = regexp.MustCompile(`^[\w@%+=:,./-]+$`)

// codingCommandLine is a command as a person types it, quoted exactly as
// .smithers/flows/coding/checks.ts commandLine quotes it.
func codingCommandLine(argv []string) string {
	words := make([]string, len(argv))
	for i, arg := range argv {
		if plainCommandArg.MatchString(arg) {
			words[i] = arg
			continue
		}
		var quoted bytes.Buffer
		encoder := json.NewEncoder(&quoted)
		encoder.SetEscapeHTML(false)
		_ = encoder.Encode(arg)
		words[i] = strings.TrimSuffix(quoted.String(), "\n")
	}
	return strings.Join(words, " ")
}

var (
	ansiEscape = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]`)
	// node --test: the spec reporter's `ℹ tests N`, the TAP reporter's `# tests N`.
	nodeTestsLine = regexp.MustCompile(`(?m)^[ℹ#] tests (\d+)\s*$`)
	// vitest: ` Tests  1 failed | 2 passed (3)`; `Test Files` is another line.
	vitestTestsLine  = regexp.MustCompile(`(?m)^\s*Tests\s{2,}(.*\S)\s*$`)
	vitestTotal      = regexp.MustCompile(`\((\d+)\)\s*$`)
	vitestCount      = regexp.MustCompile(`(\d+) (?:passed|failed)`)
	bunRanLine       = regexp.MustCompile(`(?m)^Ran (\d+) tests? across \d+ files?`)
	bunCountLine     = regexp.MustCompile(`(?m)^\s*(\d+) (?:pass|fail)\s*$`)
	pytestSummary    = regexp.MustCompile(`(?m)^(?:=+ )?((?:\d+ [a-z]+(?:, )?)+) in [\d.]+s(?: \([^)]*\))?(?: =+)?\s*$`)
	pytestCount      = regexp.MustCompile(`(\d+) (passed|failed|xfailed|xpassed)\b`)
	pytestNoTestsRan = regexp.MustCompile(`(?m)^(?:=+ )?no tests ran in [\d.]+s`)
	goPackageLine    = regexp.MustCompile(`(?m)^(?:ok|FAIL)\s+\S+\s+(?:[\d.]+s|\(cached\))(.*)$`)
	goNoTestFiles    = regexp.MustCompile(`(?m)^\?\s+\S+\s+\[no test files\]`)
)

// parseCodingTestsRun reads how many tests ran from a runner's own summary
// lines, summed across runs: node --test `ℹ tests N`, vitest `Tests ... (N)`,
// bun test `Ran N tests` or `N pass` plus `N fail`, pytest `N passed`, and one
// per go test package `ok` or `FAIL` line. nil means no runner said.
func parseCodingTestsRun(output string) *int {
	output = ansiEscape.ReplaceAllString(output, "")
	sum := func(matches [][]string) *int {
		if len(matches) == 0 {
			return nil
		}
		total := 0
		for _, match := range matches {
			n, _ := strconv.Atoi(match[1])
			total += n
		}
		return &total
	}
	if n := sum(nodeTestsLine.FindAllStringSubmatch(output, -1)); n != nil {
		return n
	}
	if lines := vitestTestsLine.FindAllStringSubmatch(output, -1); len(lines) > 0 {
		total := 0
		for _, line := range lines {
			if match := vitestTotal.FindStringSubmatch(line[1]); match != nil {
				n, _ := strconv.Atoi(match[1])
				total += n
				continue
			}
			for _, count := range vitestCount.FindAllStringSubmatch(line[1], -1) {
				n, _ := strconv.Atoi(count[1])
				total += n
			}
		}
		return &total
	}
	if n := sum(bunRanLine.FindAllStringSubmatch(output, -1)); n != nil {
		return n
	}
	if n := sum(bunCountLine.FindAllStringSubmatch(output, -1)); n != nil {
		return n
	}
	if lines := pytestSummary.FindAllStringSubmatch(output, -1); len(lines) > 0 || pytestNoTestsRan.MatchString(output) {
		total := 0
		for _, line := range lines {
			for _, count := range pytestCount.FindAllStringSubmatch(line[1], -1) {
				n, _ := strconv.Atoi(count[1])
				total += n
			}
		}
		return &total
	}
	lines := goPackageLine.FindAllStringSubmatch(output, -1)
	if len(lines) == 0 && !goNoTestFiles.MatchString(output) {
		return nil
	}
	packages := 0
	for _, line := range lines {
		if !strings.Contains(line[1], "[no tests to run]") {
			packages++
		}
	}
	return &packages
}
