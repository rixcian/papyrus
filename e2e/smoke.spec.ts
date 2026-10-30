import { expect, type Page, test } from '@playwright/test'
import { buildReadableEpub } from './book-fixture.ts'

test('create a Profile, upload a book, read it, and resume on another device', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on(
    'console',
    // The browser logs every request that fails while the test is offline on purpose.
    (m) =>
      m.type() === 'error' &&
      !m.text().includes('ERR_INTERNET_DISCONNECTED') &&
      errors.push(m.text()),
  )
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
  await page.locator('input[type=file]').setInputFiles({
    name: 'sietch.epub',
    mimeType: 'application/epub+zip',
    buffer: await buildReadableEpub({
      title: 'Sietch Tales',
      author: 'Other Writer',
      tags: ['Desert'],
    }),
  })
  await expect(page.getByRole('link', { name: /Sietch Tales/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/library.png' })

  // Search, a facet filter and the list layout (ticket 06).
  const arrakis = page.getByRole('link', { name: /Arrakis Notes/ })
  const sietch = page.getByRole('link', { name: /Sietch Tales/ })
  await page.getByLabel('Search the library').fill('sietc')
  await expect(arrakis).toHaveCount(0)
  await expect(sietch).toBeVisible()
  await expect(page).toHaveURL(/q=sietc/)
  await page.getByLabel('Search the library').fill('')
  await expect(arrakis).toBeVisible()
  await page.getByRole('button', { name: /^Desert/ }).click()
  await expect(arrakis).toHaveCount(0)
  await page.getByRole('button', { name: 'List' }).click()
  await page.screenshot({ path: 'test-results/library-list.png' })
  await page.getByRole('button', { name: 'Clear tag filter' }).click()
  await expect(arrakis).toBeVisible()
  await page.getByRole('button', { name: 'Grid' }).click()

  // Multi-select both Books onto a new shelf, then filter by it (ticket 08).
  await page.getByRole('checkbox', { name: 'Select Arrakis Notes' }).click()
  await page.getByRole('checkbox', { name: 'Select Sietch Tales' }).click()
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.screenshot({ path: 'test-results/library-selected.png' })
  await page.getByRole('button', { name: 'Add to shelf' }).click()
  await page.getByRole('menuitem', { name: 'New shelf…' }).click()
  await page.getByLabel('Shelf name').fill('Desert books')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('2 selected')).toHaveCount(0)
  await page.getByRole('button', { name: /^Desert books\s*2$/ }).click()
  await expect(page).toHaveURL(/shelf=/)
  await expect(page.getByText('2 Books')).toBeVisible()
  await page.getByRole('button', { name: 'Clear shelf filter' }).click()
  await arrakis.click()
  await expect(page.getByRole('heading', { name: 'Arrakis Notes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Desert books' })).toBeVisible()
  await page.screenshot({ path: 'test-results/book.png' })

  await page.getByRole('link', { name: 'Read', exact: true }).first().click()
  await expect(page.locator('header').getByText('Chapter One')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'test-results/reader.png' })

  // In-book search streams results; picking one goes there (ticket 12).
  await page.getByRole('button', { name: 'Search in book' }).click()
  await page.getByRole('searchbox', { name: 'Search in this book' }).fill('of chapter two')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('40 results')
  await page.screenshot({ path: 'test-results/reader-search.png' })
  await page.getByRole('button', { name: /Paragraph 3 of Chapter Two/ }).click()
  await expect(page.locator('header').getByText('Chapter Two')).toBeVisible()
  await page.screenshot({ path: 'test-results/reader-search-match.png' })

  // The jump is recorded, and the outbox flushes after a quiet period (ticket 08).
  const synced = waitForSyncWithChanges(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  await page.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(page.locator('header').getByText('Chapter Three')).toBeVisible()
  await synced

  // Highlight a sentence with a Note, then find it in the panel and the export.
  const section = page.frames().find((f) => f.url().startsWith('blob:') && f !== page.mainFrame())
  if (!section) throw new Error('no section iframe')
  const select = () =>
    section.evaluate(() => {
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
  // Highlight first, then select the same words again for the Note: still one Highlight.
  await select()
  await page.getByRole('button', { name: 'Highlight green' }).click()
  await select()
  await page.getByRole('button', { name: 'Note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note' }).fill('Worth remembering')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Bookmark this page' }).click()
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.getByText('Paragraph 2 of Chapter Three', { exact: true })).toHaveCount(1)
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
  // Delete from the panel: the Bookmark goes, the top bar follows.
  await page.getByRole('button', { name: 'Delete bookmark' }).click()
  await expect(page.getByRole('button', { name: 'Delete bookmark' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete highlight' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Bookmark this page' })).toBeVisible()

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

  // Sharing (ticket 06): Bob sees nothing of Alice's until she Shares a Book with him.
  const bob = await (await browser.newContext()).newPage()
  await bob.goto('/')
  await bob.getByRole('button', { name: /Add Profile/ }).click()
  await bob.getByLabel('Name').fill('Bob')
  await bob.getByRole('button', { name: 'Create Profile' }).click()
  await expect(bob.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()

  await page.getByRole('link', { name: /Sietch Tales/ }).click()
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('radio', { name: 'Only these Profiles' }).click()
  await page.getByRole('checkbox', { name: 'Bob' }).click()
  await page.screenshot({ path: 'test-results/share-dialog.png' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Shared with Bob')).toBeVisible()

  await bob.reload()
  await bob.getByRole('link', { name: /Sietch Tales/ }).click()
  await expect(bob.getByText('Shared by Alice')).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Edit metadata' })).toHaveCount(0)
  await bob.getByRole('button', { name: 'Hide from my library' }).click()
  await expect(bob.getByRole('button', { name: 'Unhide' })).toBeVisible()
  await bob.goto('/')
  await expect(bob.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()
  await bob.getByRole('button', { name: 'Show 1 hidden Book' }).click()
  await bob.getByRole('link', { name: /Sietch Tales/ }).click()
  await bob.getByRole('button', { name: 'Unhide' }).click()
  await bob.goto('/')
  await expect(bob.getByRole('link', { name: /Sietch Tales/ })).toBeVisible()
  await bob.screenshot({ path: 'test-results/library-shared.png' })

  // Offline Books (ticket 05): save one, lose the connection, and still read it.
  await page.goto('/')
  await page.locator('a[href^="/books/"]', { hasText: 'Arrakis Notes' }).click()
  await page.getByRole('button', { name: 'Make available offline' }).click()
  await expect(page.getByRole('button', { name: 'Available offline', exact: true })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.context().setOffline(true)
  await page.goto('/')
  await expect(page.getByText(/offline\. These are the Books saved on this device/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Sietch Tales/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/offline-library.png' })
  await page.getByRole('link', { name: /Arrakis Notes/ }).click()
  await page.getByRole('link', { name: 'Read' }).click()
  await expect(page.locator('header').getByText(/Chapter/)).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'test-results/offline-reader.png' })
  await page.context().setOffline(false)

  // Taking a Share back evicts the Recipient's offline copy at the next sync.
  await bob.getByRole('link', { name: /Sietch Tales/ }).click()
  await bob.getByRole('button', { name: 'Make available offline' }).click()
  await expect(bob.getByRole('button', { name: 'Available offline', exact: true })).toBeVisible()
  await page.goto('/')
  await page
    .getByRole('link', { name: /Sietch Tales/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('radio', { name: 'Not shared' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Not shared')).toBeVisible()
  await bob.goto('/settings')
  await expect(bob.getByText('None yet.', { exact: false })).toBeVisible()
  await bob.screenshot({ path: 'test-results/settings-device.png', fullPage: true })

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
