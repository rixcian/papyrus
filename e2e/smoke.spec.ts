import { expect, type Page, test } from '@playwright/test'
import { buildReadableEpub } from './book-fixture.ts'

test('create a Profile, upload a book, read it, and resume on another device', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await page.getByLabel('Name').fill('Alice')
  await page.getByRole('button', { name: 'Create Profile' }).click()
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()

  await page.locator('input[type=file]').setInputFiles({
    name: 'arrakis.epub',
    mimeType: 'application/epub+zip',
    buffer: await buildReadableEpub(),
  })
  await expect(page.getByText('New Book')).toBeVisible()
  await page.screenshot({ path: 'test-results/library.png' })
  await page.getByRole('link', { name: /Arrakis Notes/ }).click()
  await expect(page.getByRole('heading', { name: 'Arrakis Notes' })).toBeVisible()
  await page.screenshot({ path: 'test-results/book.png' })

  await page.getByRole('link', { name: 'Read', exact: true }).first().click()
  await expect(page.locator('header').getByText('Chapter One')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'test-results/reader.png' })

  // The jump is recorded, and the outbox flushes after a quiet period (ticket 08).
  const synced = waitForSyncWithChanges(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  await page.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(page.locator('header').getByText('Chapter Three')).toBeVisible()
  await synced

  // Highlight a sentence with a Note, then find it in the panel and the export.
  const section = page.frames().find((f) => f.url().startsWith('blob:') && f !== page.mainFrame())
  if (!section) throw new Error('no section iframe')
  await section.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((el) =>
      el.textContent?.startsWith('Paragraph 2 '),
    )
    const text = p?.firstChild
    if (!text) throw new Error('no paragraph')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 'Paragraph 2 of Chapter Three'.length)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
  })
  await page.getByRole('button', { name: 'Note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note' }).fill('Worth remembering')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Bookmark this page' }).click()
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.getByText('Paragraph 2 of Chapter Three', { exact: true })).toBeVisible()
  await expect(page.getByText('Worth remembering')).toBeVisible()
  await page.screenshot({ path: 'test-results/reader-notes.png' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export highlights (Markdown)' }).click()
  const markdown = await (await download).createReadStream().then(async (stream) => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  })
  expect(markdown).toBe(
    '# Arrakis Notes\n\nby Test Author\n\nParagraph 2 of Chapter Three\n\n> Worth remembering\n',
  )
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Text and layout' }).click()
  await page.getByRole('button', { name: 'Sepia' }).click()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/reader-sepia.png' })

  await page.getByRole('link', { name: '← Back' }).click()
  await expect(page.getByRole('link', { name: /^Continue · \d+%$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reading', pressed: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Continue reading' })).toBeVisible()
  await page.screenshot({ path: 'test-results/library-continue.png' })

  // A second browser is a second device: same Profile, no local copy, so it resumes from the server.
  const other = await (await browser.newContext()).newPage()
  await other.goto('/')
  await other.getByRole('button', { name: 'Alice' }).click()
  await other.getByRole('link', { name: 'Arrakis Notes' }).last().click()
  await other.getByRole('link', { name: /^Continue · / }).click()
  await expect(other.locator('header').getByText('Chapter Three')).toBeVisible({ timeout: 15_000 })

  expect(errors).toEqual([])
})

function waitForSyncWithChanges(page: Page) {
  return page.waitForResponse(
    (res) =>
      res.url().endsWith('/api/sync') &&
      (JSON.parse(res.request().postData() ?? '{}').changes ?? []).length > 0,
    { timeout: 10_000 },
  )
}
