package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestArchiveSummaryTextIsSealedPlainText(t *testing.T) {
	long := strings.Repeat("One short sentence here. ", 40)
	for _, tc := range []struct{ name, output, title, summary string }{
		{"title and summary", `{"title":"Fix Safari login","summary":"You asked why login failed. The cookie flag was fixed."}`, "Fix Safari login", "You asked why login failed. The cookie flag was fixed."},
		{"whitespace and markup", "  {\"title\":\"**Fix login**\\nsecond line\",\"summary\":\"  `You asked` \\n\\n twice.  \"}  ", "Fix login", "You asked` twice."},
		{"title word cap", `{"title":"one two three four five six seven eight nine","summary":"Done."}`, "one two three four five six seven eight", "Done."},
		{"summary keeps whole sentences within the limit", `{"title":"Long","summary":"` + long + `"}`, "Long", strings.TrimSpace(strings.Repeat("One short sentence here. ", 24))},
		{"missing title keeps the summary", `{"summary":"Only a summary."}`, "", "Only a summary."},
		{"commands remain data", `{"title":"rm -rf /","summary":"import repo/flow.ts; tool()"}`, "rm -rf /", "import repo/flow.ts; tool()"},
		{"missing summary", `{"title":"Fix login"}`, "Fix login", ""},
		{"prose envelope", "Here is the summary: fixed login", "", ""},
		{"wrong type", `{"title":1,"summary":"Done."}`, "", ""},
		{"array", `["Fix login","Done."]`, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			title, summary := archiveSummaryText(tc.output)
			require.Equal(t, tc.title, title)
			require.Equal(t, tc.summary, summary)
			require.LessOrEqual(t, len([]rune(summary)), archiveSummaryRunes)
		})
	}
}

func TestClipBytesNeverTearsACharacter(t *testing.T) {
	require.Equal(t, "", clipBytes("", 4))
	require.Equal(t, "abc", clipBytes("abc", 3))
	require.Equal(t, "ab", clipBytes("abc", 2))
	require.Equal(t, "é", clipBytes("éé", 3))
	require.Equal(t, "", clipBytes("é", 1))
	require.Equal(t, "日", clipBytes("日本", 5))
	require.Equal(t, "", clipBytes("abc", 0))
}
