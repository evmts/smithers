import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 41: Prefix Cancel', () => {
  test('Ctrl+B, q cancels prefix mode without action', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible()

    await terminal.write('q')

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
