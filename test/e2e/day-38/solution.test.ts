import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 38: Switch to Tab 1', () => {
  test('Ctrl+B, 1 switches to first tab', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('1')

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
