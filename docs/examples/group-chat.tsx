// Multi-agent group chat via reactive SQLite
import { Ralph, Claude, Phase, Parallel, useSmithersDB, useQueryValue } from 'smithers'

interface Message { id: number; agent: string; content: string }

function GroupChat({ problem }: { problem: string }) {
  const db = useSmithersDB()
  
  // Create messages table on first run
  db.db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, agent TEXT, content TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  
  // Reactive query - re-renders when messages change
  const { data: messages } = useQueryValue<Message[]>(
    'SELECT * FROM messages ORDER BY ts', [], { db: db.db }
  )
  const { data: done } = useQueryValue<boolean>(
    "SELECT EXISTS(SELECT 1 FROM messages WHERE content LIKE '%SOLVED:%')", [], { db: db.db }
  )
  
  const transcript = (messages ?? []).map(m => `[${m.agent}]: ${m.content}`).join('\n')
  const addMessage = (agent: string, content: string) =>
    db.db.run('INSERT INTO messages (agent, content) VALUES (?, ?)', [agent, content])

  return (
    <Ralph maxIterations={10}>
      {!done && (
        <Phase name="Collaboration">
          <Parallel>
            <Claude 
              model="sonnet" 
              onFinished={(r) => addMessage('Claude', r.response)}
            >
              You are Claude in a group chat solving: {problem}
              
              Chat history:
              {transcript || '(empty - you speak first)'}
              
              Respond with your insight. Say "SOLVED:" when consensus reached.
            </Claude>
            
            <Claude 
              model="gpt-4o" 
              onFinished={(r) => addMessage('GPT-4o', r.response)}
            >
              You are GPT-4o in a group chat solving: {problem}
              
              Chat history:
              {transcript}
              
              Add your perspective. Say "SOLVED:" when consensus reached.
            </Claude>
            
            <Claude 
              model="gpt-5" 
              onFinished={(r) => addMessage('Codex', r.response)}
            >
              You are Codex (GPT-5.2) in a group chat solving: {problem}
              
              Chat history:
              {transcript}
              
              Synthesize insights. Say "SOLVED:" with final answer when ready.
            </Claude>
          </Parallel>
        </Phase>
      )}
      
      {done && <Phase name="Done">✅ Solved via collaboration</Phase>}
    </Ralph>
  )
}

export default () => <GroupChat problem="Fix the React hydration mismatch in Header.tsx" />
