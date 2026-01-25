import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 32: End Key', () => {
  test('End key scrolls to newest message', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('\x1b[5~')
    await terminal.write('\x1b[5~')

    await terminal.write('\x1b[F')

    await expect(terminal).toMatchSnapshot()
  })
})
