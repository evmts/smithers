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
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
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
			sql := strings.ToLower(strings.Join(strings.Fields(value), " "))
			if (strings.Contains(sql, "insert into agent_parts") || strings.Contains(sql, "copy agent_parts")) && !strings.HasSuffix(filepath.ToSlash(path), "internal/db/agent.sql.go") {
				t.Errorf("unreviewed raw agent_parts insertion in %s", path)
			}
			return true
		})
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}
			ast.Inspect(fn.Body, func(node ast.Node) bool {
				selector, ok := node.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				name := selector.Sel.Name
				if !(strings.Contains(name, "AgentPart") && (strings.HasPrefix(name, "Insert") || strings.HasPrefix(name, "Create") || strings.HasPrefix(name, "Copy"))) {
					return true
				}
				// Params are data, never a write capability.
				if strings.HasSuffix(name, "Params") {
					return true
				}
				relative, err := filepath.Rel(root, path)
				if err != nil {
					t.Error(err)
					return false
				}
				key := filepath.ToSlash(relative) + ":" + fn.Name.Name
				if strings.Contains(path, "internal/db/") && fn.Name.Name == "CreateAgentPart" {
					return true
				}
				switch key {
				case "internal/services/agent_part_trust.go:createUntrustedAgentPart", "internal/services/agent_flow_completion.go:completeCodingTurn":
					seen[key]++
				default:
					t.Errorf("unreviewed agent_parts insertion capability %s (%s); reject coding_result or use server completion", key, name)
				}
				return true
			})
		}
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, 1, seen["internal/services/agent_part_trust.go:createUntrustedAgentPart"])
	require.Equal(t, 1, seen["internal/services/agent_flow_completion.go:completeCodingTurn"])
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
