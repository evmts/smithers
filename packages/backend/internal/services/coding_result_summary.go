package services

import (
	"fmt"
	"strings"
)

// CodingResultSummary is the line a pull request body and the run card show
// for a coding turn's test receipt. The test ran in the agent's own box,
// which the agent controls, so the line says where it ran and never claims a
// pass; GitHub CI stays the real check (Security d-cey74a).
func CodingResultSummary(result CodingResult) string {
	if !result.Tested() || len(result.TestReceipt.Commit) < 12 {
		return "Tests not run at this commit"
	}
	receipt := result.TestReceipt
	command := markdownCodeSpan(receipt.Command)
	if receipt.TestsRun != nil && *receipt.TestsRun == 0 {
		return command + " ran 0 tests in the agent's sandbox"
	}
	line := fmt.Sprintf("%s exited %d in the agent's sandbox at %s", command, receipt.ExitCode, receipt.Commit[:12])
	switch {
	case receipt.TestsRun == nil:
	case *receipt.TestsRun == 1:
		line += " · 1 test"
	default:
		line += fmt.Sprintf(" · %d tests", *receipt.TestsRun)
	}
	return line
}

// markdownCodeSpan renders text as one inline code span, fenced by more
// backticks than any run inside it.
func markdownCodeSpan(text string) string {
	longest, run := 0, 0
	for _, r := range text {
		if r == '`' {
			run++
			longest = max(longest, run)
		} else {
			run = 0
		}
	}
	fence := strings.Repeat("`", longest+1)
	if longest > 0 || strings.HasPrefix(text, "`") || strings.HasSuffix(text, "`") {
		return fence + " " + text + " " + fence
	}
	return fence + text + fence
}
