import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 39: Switch to Tab 2', () => {
  test('Ctrl+B, 2 switches to second tab', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('2')

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
