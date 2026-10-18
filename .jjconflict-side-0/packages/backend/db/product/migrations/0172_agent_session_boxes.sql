-- One agent box per agent session (plue#869). A turn ran on its branch's
-- shared machine, so one member's turn could read another's worktree, home,
-- process environment and planted startup files. Each session now has its own
-- box, owned by the machine service like every branch machine.

-- The guest whose run minted tokens on the box. A join of a box whose mark
-- equals its live guest retires the guest first; only recording a new guest
-- on a retired box clears it.
ALTER TABLE workspaces ADD COLUMN agent_box_dirty_vm_id text NOT NULL DEFAULT '';

-- No session may keep pointing at a shared branch machine or a stack lane:
-- its next turn creates its own box. There are no outside users yet.
UPDATE agent_sessions a SET workspace_id = NULL, updated_at = now()
FROM workspaces w
WHERE w.id = a.workspace_id AND w.agent_session_id IS NULL;

-- 0108 dropped this with the per-session agent workspaces it indexed.
CREATE UNIQUE INDEX uq_workspaces_agent_session ON workspaces (agent_session_id)
WHERE agent_session_id IS NOT NULL AND deleted_at IS NULL;
