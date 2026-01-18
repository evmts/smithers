# Reconciler review - action items only (1 per item)

## P0: mount never hangs on error
- Risk: mount() awaits completionPromise forever if React throws before orchestration resolves.
- Action: wire root errors to rejection/stop path; never await completionPromise without error path.
- Steps:
  1) In createContainer error callbacks, capture error + reject orchestration promise.
  2) await Promise.race([completionPromise, errorPromise]) and throw if error.
  3) Add test: simulated render error -> mount rejects promptly.

## P0: event priority tracking must work
- Risk: currentUpdatePriority tracked but getCurrentEventPriority returns DefaultEventPriority; priorities ignored.
- Action: return tracked priority; resolveUpdatePriority should use it too.
- Steps:
  1) getCurrentEventPriority() => currentUpdatePriority.
  2) resolveUpdatePriority() => currentUpdatePriority.
  3) Add unit test verifying setCurrentUpdatePriority influences returned priority.

## P0: key model must be coherent
- Risk: SmithersNode.key claims jsx-runtime sets it, but runtime is passthrough; key prop unreachable.
- Action: pick a single model; implement it.
- Steps (Option A preferred):
  1) Wrap jsx/jsxs to copy React key into explicit prop (e.g., __smithersKey).
  2) setProperty reads __smithersKey -> node.key.
  3) Update types/docs to match.

## P0: remove or isolate global singleton root state
- Risk: currentRootNode (and similar globals) break concurrency, cause cross-run leakage.
- Action: scope current tree to root instance; avoid module singletons.
- Steps:
  1) Remove module-level currentRootNode.
  2) Expose per-root toXML() and pass references where needed.
  3) If global needed, make it explicit/opt-in + documented as single-root only.

## P1: deterministic serialization ordering
- Risk: Object.entries preserves insertion order; diffs unstable.
- Action: sort prop keys deterministically.
- Steps:
  1) Sort keys lexicographically before serialization (after filtering).
  2) Keep key first if required, then sorted remainder.

## P1: object prop display policy
- Risk: JSON stringify of arbitrary objects (schemas, tools) is noisy or breaks.
- Action: add formatter for known heavy props; guard circular/huge objects.
- Steps:
  1) Add allowlist/formatter (schema/tools/etc.).
  2) For unknown objects, use stable placeholder (e.g., [Object Type]).
  3) Add tests for schema/tool props.

## P1: removeNode subtree invariants
- Risk: removeNode clears descendants' parent but leaves children arrays; inconsistent invariant.
- Action: choose one model and implement consistently.
- Steps (Model 1 recommended):
  1) Only detach node from parent + set node.parent = null.
  2) Leave child.parent pointers intact (subtree consistent).
  3) Add test for invariant after removal.

## P1: host-config clearContainer must fully detach
- Risk: current clearContainer only clears immediate children; descendants keep parent pointers.
- Action: reuse removeNode for each child or recursively clear.
- Steps:
  1) Copy children list; call removeNode(container, child).
  2) Add test ensuring descendants parent pointers cleared per chosen model.

## P1: license header correction
- Risk: "MIT (public domain)" is legally wrong.
- Action: change to "MIT".
- Steps:
  1) Update header text in hooks file.

## P1: comment correctness on concurrent features
- Risk: comment says "Enable concurrent features" while using LegacyRoot.
- Action: fix comment to match LegacyRoot behavior.
- Steps:
  1) Update comment to "LegacyRoot" or remove misleading text.

## P1: types.ts key doc fix
- Risk: doc claims key set by jsx-runtime; not true.
- Action: update comment to reflect actual key source (or after implementing Option A).
- Steps:
  1) Align types comment with chosen key model.

## P2: serialize side effects clarity
- Risk: serialize mutates warnings; not a pure function.
- Action: either make side effects explicit or move to validateTree().
- Steps:
  1) Choose: keep mutation w/ explicit docs or extract validateTree.
  2) If keep mutation, avoid allocations: delete warnings then set if needed.

## P2: KNOWN_TYPES growth strategy
- Risk: registry drift/maintenance burden.
- Action: define extension strategy (prefix convention or runtime registration).
- Steps:
  1) Decide rule (e.g., smithers-* prefix).
  2) Update warnings logic accordingly.

## P2: reuse vs recreate fiber root
- Risk: recreate each mount is heavy; rootNode identity may leak.
- Action: decide reset semantics; implement consistently.
- Steps:
  1) If reuse root, render top element with changing key to reset state.
  2) If recreate, also recreate rootNode to avoid identity reuse.

## P2: StrictMode safety for hooks
- Risk: useMount/useEffectOnce not truly once in StrictMode.
- Action: guard/document StrictMode usage.
- Steps:
  1) Add explicit warning or runtime guard against StrictMode.
  2) Consider idempotency via execution IDs/content hashes where side effects occur.
