import { test, expect } from '@microsoft/tui-test'
import { tuiBinary, sendCtrlKey } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 34: Prefix Mode', () => {
  test('Ctrl+B enters prefix mode and shows indicator', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    sendCtrlKey(terminal, 'b')

    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible()
    await expect(terminal).toMatchSnapshot()
  })
})
