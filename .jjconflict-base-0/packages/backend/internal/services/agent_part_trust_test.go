package services

import (
	"context"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Every insertion is reviewed, including future fork/copy/import and flow-host
// paths. Generic sinks must use the rejecting adapter; only completion may
// directly insert a server result. Tests seed trusted rows separately.
func TestAgentPartInsertionTrustInventory(t *testing.T) {
	root := "../.."
	seen := map[string]int{}
	// Discover generated insertion methods from SQL, regardless of names such
	// as ForkSessionParts or ImportHistory. New query families are not exempt.
	writers := map[string]bool{}
	err := filepath.WalkDir(filepath.Join(root, "internal/db"), func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return err
		}
		ast.Inspect(file, func(node ast.Node) bool {
			lit, ok := node.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			value, err := strconv.Unquote(lit.Value)
			if err != nil || !agentPartsInsertionSQL(value) {
				return true
			}
			fields := strings.Fields(value)
			if len(fields) >= 3 && fields[0] == "--" && fields[1] == "name:" {
				writers[fields[2]] = true
			} else {
				t.Errorf("agent_parts insertion lacks a query identity in %s", path)
			}
			return true
		})
		return nil
	})
	require.NoError(t, err)
	require.True(t, writers["CreateAgentPart"], "inventory must find the existing persistence query")
	err = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, source, 0)
		if err != nil {
			return err
		}
		ast.Inspect(file, func(node ast.Node) bool {
			lit, ok := node.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			value, err := strconv.Unquote(lit.Value)
			if err != nil {
				return true
			}
			relative, relErr := filepath.Rel(root, path)
			if relErr != nil {
				t.Error(relErr)
				return false
			}
			if agentPartsInsertionSQL(value) && !strings.HasPrefix(filepath.ToSlash(relative), "internal/db/") {
				t.Errorf("unreviewed raw agent_parts insertion in %s", path)
			}
			return true
		})
		ast.Inspect(file, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			name := selector.Sel.Name
			if !(writers[name] || strings.Contains(name, "AgentPart") && (strings.HasPrefix(name, "Insert") || strings.HasPrefix(name, "Create") || strings.HasPrefix(name, "Copy"))) || strings.HasSuffix(name, "Params") {
				return true
			}
			function := "<package initializer>"
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if ok && fn.Body != nil && fn.Body.Pos() <= selector.Pos() && selector.End() <= fn.Body.End() {
					function = fn.Name.Name
					break
				}
			}
			relative, err := filepath.Rel(root, path)
			if err != nil {
				t.Error(err)
				return false
			}
			key := filepath.ToSlash(relative) + ":" + function
			allowed := key == "internal/services/agent_part_trust.go:createUntrustedAgentPart"
			if key == "internal/services/agent_flow_completion.go:completeCodingTurn" {
				allowed = inlineAgentPartWrite(file, selector, "q", "text", "") || inlineAgentPartWrite(file, selector, "q", "coding_result", "codingResultPartContent")
			}
			if key == "internal/db/agent_session_dispatch_ext.go:RecordAgentSessionFailure" {
				// Main's terminal failure reply is text only. Never grant this
				// function a generic insertion capability or receipt authority.
				allowed = inlineAgentPartWrite(file, selector, "inTx", "text", "")
			}
			if allowed {
				seen[key]++
			} else {
				t.Errorf("unreviewed agent_parts insertion capability %s (%s); reject coding_result or use server completion", key, name)
			}
			return true
		})
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, 1, seen["internal/services/agent_part_trust.go:createUntrustedAgentPart"])
	require.GreaterOrEqual(t, seen["internal/services/agent_flow_completion.go:completeCodingTurn"], 1)
	// Pin the generic adapter's complete body: neither a new branch nor a copy
	// path can silently turn it into a server-result writer.
	raw, err := os.ReadFile("agent_part_trust.go")
	require.NoError(t, err)
	parsed, err := parser.ParseFile(token.NewFileSet(), "agent_part_trust.go", raw, 0)
	require.NoError(t, err)
	var adapter string
	for _, decl := range parsed.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok && fn.Name.Name == "createUntrustedAgentPart" {
			adapter = string(raw[int(fn.Pos())-1 : int(fn.End())-1])
		}
	}
	compact := strings.Join(strings.Fields(adapter), " ")
	require.Equal(t, `func createUntrustedAgentPart(ctx context.Context, writer agentPartWriter, part db.CreateAgentPartParams) (db.AgentPart, error) { if part.PartType == "coding_result" { return db.AgentPart{}, pkgerrors.BadRequest("coding_result is server-only") } return writer.CreateAgentPart(ctx, part) }`, compact)
}

func TestGenericAgentPartInsertionRefusesServerResult(t *testing.T) {
	// A nil writer proves refusal precedes persistence for every public, copy,
	// tool_result, done, import and flow-host caller using the generic adapter.
	for _, raw := range []string{`{}`, `{"producer":"smithers-server"}`, `{"type":"tool_result"}`, `{"type":"done"}`} {
		_, err := createUntrustedAgentPart(context.Background(), nil, db.CreateAgentPartParams{PartType: "coding_result", Content: []byte(raw)})
		require.ErrorContains(t, err, "server-only")
	}
}

// Conservative SQL inventory: any insertion mentioning agent_parts is a
// capability requiring review, including INSERT SELECT, CTE copies and imports.
func agentPartsInsertionSQL(value string) bool {
	sql := strings.ToLower(strings.Join(strings.Fields(value), " "))
	return strings.Contains(sql, "agent_parts") && (strings.Contains(sql, "insert ") || strings.Contains(sql, "copy "))
}

// Require the selector itself to be called with inline literal parameters.
// A method alias or variable parameters would let a later write change its type.
func inlineAgentPartWrite(file *ast.File, selector *ast.SelectorExpr, receiver, partType, contentFunction string) bool {
	ident, ok := selector.X.(*ast.Ident)
	if !ok || ident.Name != receiver || selector.Sel.Name != "CreateAgentPart" {
		return false
	}
	allowed := false
	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || call.Fun != selector || len(call.Args) != 2 {
			return true
		}
		params, ok := call.Args[1].(*ast.CompositeLit)
		if !ok {
			return true
		}
		fixedType, fixedContent := false, contentFunction == ""
		for _, element := range params.Elts {
			field, ok := element.(*ast.KeyValueExpr)
			if !ok {
				continue
			}
			key, ok := field.Key.(*ast.Ident)
			if !ok {
				continue
			}
			if key.Name == "PartType" {
				value, ok := field.Value.(*ast.BasicLit)
				if ok && value.Kind == token.STRING {
					decoded, err := strconv.Unquote(value.Value)
					fixedType = err == nil && decoded == partType
				}
			}
			if key.Name == "Content" && contentFunction != "" {
				value, ok := field.Value.(*ast.CallExpr)
				if ok {
					fn, ok := value.Fun.(*ast.Ident)
					fixedContent = ok && fn.Name == contentFunction
				}
			}
		}
		allowed = fixedType && fixedContent
		return true
	})
	return allowed
}

func TestInlineAgentPartWriteRequiresPinnedLiteralAndContent(t *testing.T) {
	for _, tc := range []struct {
		name, body, partType, content string
		allowed                       bool
	}{
		{"text", `q.CreateAgentPart(ctx, db.CreateAgentPartParams{PartType:"text",Content:content})`, "text", "", true},
		{"receipt", `q.CreateAgentPart(ctx, db.CreateAgentPartParams{PartType:"coding_result",Content:codingResultPartContent(result)})`, "coding_result", "codingResultPartContent", true},
		{"forged receipt", `q.CreateAgentPart(ctx, db.CreateAgentPartParams{PartType:"coding_result",Content:modelData})`, "coding_result", "codingResultPartContent", false},
		{"variable type", `q.CreateAgentPart(ctx, db.CreateAgentPartParams{PartType:kind})`, "text", "", false},
		{"variable parameters", `q.CreateAgentPart(ctx, params)`, "text", "", false},
		{"alias", `write := q.CreateAgentPart; write(ctx, db.CreateAgentPartParams{PartType:"text"})`, "text", "", false},
		{"other receiver", `other.CreateAgentPart(ctx, db.CreateAgentPartParams{PartType:"text"})`, "text", "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file, err := parser.ParseFile(token.NewFileSet(), "guard.go", "package p; func complete() { "+tc.body+" }", 0)
			require.NoError(t, err)
			found := false
			ast.Inspect(file, func(node ast.Node) bool {
				if selector, ok := node.(*ast.SelectorExpr); ok && selector.Sel.Name == "CreateAgentPart" {
					found = true
					require.Equal(t, tc.allowed, inlineAgentPartWrite(file, selector, "q", tc.partType, tc.content))
				}
				return true
			})
			require.True(t, found)
		})
	}
}
