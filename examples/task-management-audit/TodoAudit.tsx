/**
 * TodoAudit - Phase 3: Audit TODO.md items
 */

import type { ReactNode } from 'react'
import { Step } from '../../src/components/Step.js'
import { If } from '../../src/components/If.js'
import { Claude } from '../../src/components/Claude.js'
import type { TodoItem } from './types.js'

export interface TodoAuditProps {
  items: TodoItem[]
}

export function TodoAudit({ items }: TodoAuditProps): ReactNode {
  const implemented = items.filter(i => i.implemented)
  const remaining = items.filter(i => !i.implemented)
  
  // Skip PR-related items
  const actionable = remaining.filter(i => 
    !i.category.includes('merge') && 
    !i.category.includes('branches_ready')
  )

  return (
    <phase-content>
      <summary>
        {items.length} TODO items: {implemented.length} done, {remaining.length} remaining, {actionable.length} actionable
      </summary>

      <If condition={implemented.length > 0}>
        <Step name="Clean TODO.md">
          <Claude>
            {`Remove these completed items from TODO.md:
              ${implemented.map(i => `- ${i.description}`).join('\n')}`}
          </Claude>
        </Step>
      </If>

      {actionable.map(item => (
        <Step key={item.id} name={item.description.slice(0, 50)} commitAfter>
          <Claude>
            {`Implement this TODO item on main branch:
              Category: ${item.category}
              Description: ${item.description}
              
              After implementing, remove this item from TODO.md.`}
          </Claude>
        </Step>
      ))}
    </phase-content>
  )
}
