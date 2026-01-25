import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 42: Session Persistence', () => {
  test('session persists after exit and restart', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    await terminal.write('persistence test message\n')

    await expect(terminal.getByText('persistence test')).toBeVisible()
  })
})
