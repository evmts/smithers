import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 37: Previous Session', () => {
  test('Ctrl+B, p cycles to previous session', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('c')

    sendCtrlKey(terminal, 'b')
    await terminal.write('p')

    await expect(terminal).toMatchSnapshot()
  })
})
