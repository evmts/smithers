# Inconsistency: Task Doc Uses useState and useEffect

## File
`docs/components/task.mdx`

## Issue
Multiple examples use `useState` and `useEffect`:
- Lines 50-79: TaskTracker with useState
- Lines 86-111: PersistentTasks with useState + useEffect
- Lines 117-149: TaskDrivenWorkflow with useState

CLAUDE.md states:
- "NEVER use useState"
- "Avoid using useEffect directly. Use vendored hooks from src/reconciler/hooks"

## Suggested Fix
Update all examples to use:
1. `useQueryValue` for reactive state from SQLite
2. `db.state.set()` for state updates
3. `useMount` instead of useEffect for initialization

Example pattern:
```tsx
function TaskTracker() {
  const { db } = useSmithers();
  
  const tasks = useQueryValue<Task[]>(db.db,
    "SELECT * FROM state WHERE key = 'tasks'") ?? [];
  
  const markDone = (id: number) => {
    const updated = tasks.map(t => 
      t.id === id ? { ...t, done: true } : t
    );
    db.state.set('tasks', updated);
  };
  
  return ...;
}
```
