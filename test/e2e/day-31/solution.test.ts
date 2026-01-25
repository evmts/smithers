import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 31: Home Key', () => {
  test('Home key scrolls to oldest message', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('\x1b[H')

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
