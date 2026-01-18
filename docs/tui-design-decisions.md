# TUI Design Decisions & Architecture Notes

## Time-Travel Debugging (Render Frames)

When SmithersProvider mounts, it calls `getCurrentTreeXML()` which serializes the entire in-memory SmithersNode tree to XML, then stores it in the `render_frames` table with an auto-incrementing sequence number and the current Ralph iteration count. Each frame is a complete snapshot of the React tree structure at that moment. The TUI polls this table, loads all frames for the current execution, and lets you navigate forward/backward through frames with `[`/`]` keys - essentially replaying the exact component tree state at each render, like a DVR for your orchestration workflow.

## Polling Strategy

Every TUI hook follows the same pattern:
```typescript
useEffect(() => {
  const poll = () => {
    try {
      const data = db.query(...);
      setState(data)
    } catch {}
  };
  poll();
  const interval = setInterval(poll, 500);
  return () => clearInterval(interval)
}, [db])
```

Query DB immediately on mount, then every 500ms thereafter, swallowing errors if DB isn't ready. Each hook polls independently (no coordination), so 6 active views = 6+ simultaneous queries every 500ms. This creates **500ms lag** but works across process boundaries with zero shared memory. The `reactive-sqlite` module with `useQueryValue` exists to fix this (triggers rerender on DB writes via SQLite update hooks) but TUI hasn't migrated to it yet.

---

## Known Issues (10 total)

1. **Manual polling (500ms lag)** instead of reactive queries via `useQueryValue`
   - Location: All `src/tui/hooks/*.ts`
   - Impact: 500ms delay on seeing updates
   - Fix: Port to reactive-sqlite

2. **Incomplete TypeScript definitions** for OpenTUI
   - Location: `src/tui/opentui.d.ts` (manually maintained)
   - Impact: May break on version updates
   - Fix: Maintain types or wait for official definitions

3. **`<input>` element not officially typed**
   - Location: `src/tui/components/views/ChatInterface.tsx:112`
   - Impact: Type errors, may not work on future OpenTUI versions
   - Fix: Update opentui.d.ts or replace with different approach

4. **Render frames only captured on mount**
   - Location: `src/components/SmithersProvider.tsx` (uses `useMount`)
   - Impact: Can't see intermediate states within Ralph iteration
   - Fix: Ralph component needs to call `captureFrame()` on each loop

5. **Zero test coverage for TUI**
   - Location: No tests in `src/tui/`
   - Impact: Regressions undetected
   - Fix: Add snapshot tests for views

6. **Fixed layout calculations**
   - Location: `src/tui/App.tsx:72` (`const contentHeight = Math.max(height - 6, 10)`)
   - Impact: Breaks if header/footer heights change
   - Fix: Use flexbox `flexGrow` instead

7. **Content truncates if > terminal height**
   - Location: All views with fixed `height - N` calculations
   - Impact: Limited scrolling in some views
   - Fix: Use flexbox properly

8. **No horizontal scrolling**
   - Location: All text elements
   - Impact: Long lines get cut off
   - Fix: Add horizontal scroll support to OpenTUI components

9. **Multiple independent polling intervals**
   - Location: All hooks poll independently
   - Impact: Wasteful, uncoordinated DB access
   - Fix: Centralized polling coordinator or reactive queries

10. **No error retry logic**
    - Location: All hooks swallow errors in `catch {}`
    - Impact: Silently fails if DB temporarily unavailable
    - Fix: Add retry backoff + error reporting

---

## Missing Features (15 total)

1. **Real-time updates** (WebSocket/SSE)
   - Instead of: Polling every 500ms
   - Benefit: Sub-100ms latency

2. **Mouse support**
   - OpenTUI supports it: Not enabled in `createCliRenderer({ useMouse: false })`
   - Would enable: Click navigation, scroll wheel

3. **Copy/paste from views**
   - Workaround: Read DB directly or check log files
   - Would need: Terminal integration

4. **Search within views**
   - Missing: Filter timeline by keyword, search agents by model/status
   - Impact: Must scroll manually through large datasets

5. **Sort controls**
   - Missing: Sort by time, status, type, token count
   - Impact: Hard to find specific items

6. **Graph visualizations**
   - Missing: ASCII dependency trees, state machine diagrams, token usage charts
   - Would show: Execution flow and relationships

7. **Performance metrics dashboard**
   - Missing: Token costs, average latencies, success/failure rates
   - Would track: Trends over time

8. **Log streaming**
   - Missing: Tail agent logs in real-time with syntax highlighting
   - Workaround: Read log files separately

9. **Responsive layout**
   - Missing: Dynamic adjustment to terminal size
   - Current: Fixed height calculations break on resize

10. **Syntax highlighting in XMLViewer**
    - Missing: Color-coded XML in Frame view
    - Location: `src/tui/components/shared/XMLViewer.tsx`
    - Would improve: Readability

11. **Export view to file/clipboard**
    - Missing: Save current view state
    - Would help: Sharing, archiving

12. **Multi-execution view**
    - Missing: Compare multiple runs side-by-side
    - Would show: Differences, improvements

13. **Bookmarks/favorites for frames**
    - Missing: Mark interesting frame states
    - Would help: Rapid navigation

14. **Diff view between frames**
    - Missing: See what changed between frames
    - Would show: Component tree diffs

15. **Persistent UI state**
    - Missing: Remember selected items, sort order, view filters
    - Would improve: UX across restarts

---

## Framework Comparison: Bubbletea vs OpenTUI

### Issues That Are Smithers-Specific (Not Framework Limitations)

**Would be SAME in Bubbletea**:

1. **Polling vs reactive**: SQLite across processes requires polling or file watching regardless of framework
2. **Real-time updates**: WebSocket/SSE works equally well in both (framework-agnostic)
3. **Search/filter/sort**: Implementation choice, not framework limitation
4. **Graph visualizations**: ASCII art works in any TUI framework
5. **Log streaming**: File watching + rendering works in both

### Framework-Specific Differences

| Aspect | OpenTUI (current) | Bubbletea |
|--------|-------------------|-----------|
| **Type Safety** | Incomplete TS types | ✅ Complete Go types |
| **Rendering Model** | React (components + hooks) | Elm Architecture (model → update → view) |
| **Testing Story** | Limited | ✅ Go testing mature |
| **Mouse Support** | Supported, not enabled | Supported |
| **Performance** | Bun/Node interpreted | ✅ Compiled binary |
| **Ecosystem** | Smaller (OpenTUI is newer) | ✅ Mature (Charm tools: Lipgloss, Bubbles) |
| **Language** | JavaScript/TypeScript | Go |
| **Learning Curve** | Shallow (web dev familiar with React) | Steeper (Elm Architecture) |

### Bubbletea Advantages
- ✅ No incomplete type definitions (Go is statically typed)
- ✅ More mature ecosystem (Charm tools)
- ✅ Better for standalone CLI tools
- ✅ Faster rendering (compiled)
- ✅ Simpler state management (Elm Architecture)

### OpenTUI Advantages
- ✅ Familiar React mental model
- ✅ Share components/patterns with orchestration reconciler
- ✅ TypeScript integration with rest of Smithers codebase
- ✅ JavaScript/NPM ecosystem integration

### The Real Blocker

**It's not the framework** - it's the **architectural choice to poll SQLite across processes**.

Both frameworks would need the same fix:
1. **Reactive SQLite triggers** (auto-notify on writes)
2. **File watching** (monitor .db file changes)
3. **IPC layer** (WebSocket, named pipes, gRPC)

The framework choice (React/OpenTUI vs Elm/Bubbletea) is independent of this architecture decision.

---

## Recommendations

### Short-Term (Low Effort)
1. Migrate to `useQueryValue` from reactive-sqlite (remove polling)
2. Add basic snapshot tests for views
3. Fix render frame capture (every Ralph iteration, not just mount)
4. Update opentui.d.ts types

### Medium-Term (Moderate Effort)
1. Enable mouse support
2. Add search/filter to Timeline view
3. Add sort controls
4. Implement copy/paste

### Long-Term (High Effort)
1. Real-time updates via WebSocket
2. Graph visualizations
3. Performance metrics dashboard
4. Multi-execution comparison

---

## Key Files

| File | Purpose |
|------|---------|
| `src/tui/index.tsx:12` | `launchTUI()` entry point |
| `src/tui/App.tsx:39` | Root component with tab routing |
| `src/tui/hooks/` | All polling hooks |
| `src/db/render-frames.ts:63` | Frame storage module |
| `src/reconciler/root.ts:17` | `getCurrentTreeXML()` for serialization |
| `src/tui/opentui.d.ts:1` | OpenTUI type definitions |
| `src/reactive-sqlite/` | Reactive query system (not used in TUI yet) |

---

## Architecture Decision Log

**Decision**: Separate processes (orchestration vs TUI) communicating via SQLite
- **Pros**: Independent crash domains, can restart TUI without stopping orchestration
- **Cons**: Requires polling or IPC for updates, 500ms lag

**Decision**: Polling every 500ms
- **Pros**: Simple, works across process boundaries, zero shared memory
- **Cons**: Lag, wasteful queries, uncoordinated

**Decision**: Use OpenTUI instead of Bubbletea
- **Pros**: React familiar, TypeScript integration, component reuse potential
- **Cons**: Immature library, incomplete types, smaller ecosystem

**Decision**: useState in TUI (vs DB in orchestration)
- **Pros**: Simpler ephemeral UI state, no persistence overhead
- **Cons**: State lost on TUI restart (acceptable for monitoring tool)

---

## Related Docs

- `docs/tui-architecture.md` - Full deep dive with code examples
- `src/tui/README.md` - User-facing TUI documentation
- `src/db/schema.sql` - Database schema
- `src/reconciler/types.ts` - SmithersNode type definitions
