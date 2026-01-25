import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 33: Auto-scroll on New Message', () => {
  test('new message auto-scrolls to bottom', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('\x1b[5~')
    await terminal.write('\x1b[5~')

    await terminal.write('test message\n')

    await expect(terminal.getByText('test message')).toBeVisible()
  })
})
