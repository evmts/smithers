#!/usr/bin/env bash
#
# Smithers Plugin Dependency Installation Script
#
# This script is run automatically after plugin installation via:
#   claude plugin install smithers-orchestrator

set -euo pipefail

echo "🔧 Installing Smithers Orchestrator dependencies..."
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
  echo "⚠️  Bun is not installed. Smithers requires Bun for execution."
  echo ""
  echo "Install Bun:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  echo ""
  echo "Or use npm (slower):"
  echo "  npm install -g bun"
  echo ""
  exit 1
fi

echo "✓ Bun found: $(bun --version)"
echo ""

# Check if Node.js is installed (fallback)
if command -v node &> /dev/null; then
  echo "✓ Node.js found: $(node --version)"
else
  echo "ℹ️  Node.js not found (not required with Bun)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Smithers Orchestrator plugin installed successfully!"
echo ""
echo "📚 Documentation:"
echo "   • Skill guide: skills/smithers-orchestrator/SKILL.md"
echo "   • API reference: skills/smithers-orchestrator/REFERENCE.md"
echo "   • Examples: skills/smithers-orchestrator/EXAMPLES.md"
echo ""
echo "🚀 Quick start:"
echo "   1. Ask Claude to create a multi-agent workflow"
echo "   2. Review the generated .smithers/main.tsx plan"
echo "   3. Approve and execute"
echo ""
echo "💡 Trigger phrases:"
echo "   • 'Create a multi-agent workflow for...'"
echo "   • 'I need orchestration for...'"
echo "   • 'Set up a Smithers workflow to...'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
