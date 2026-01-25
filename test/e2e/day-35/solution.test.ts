import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 35: New Session', () => {
  test('Ctrl+B, c creates new session tab', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')
    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible()

    await terminal.write('c')

    await expect(terminal.getByText('tab-')).toBeVisible()
    await expect(terminal).toMatchSnapshot()
  })
})
