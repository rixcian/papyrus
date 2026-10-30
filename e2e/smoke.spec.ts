import { expect, test } from '@playwright/test'
import { buildReadableEpub } from './book-fixture.ts'

test('create a Profile, upload a book and read it', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Contents' }).click()
  await page.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(page.locator('header').getByText('Chapter Three')).toBeVisible()

  await page.getByRole('button', { name: 'Text and layout' }).click()
  await page.getByRole('button', { name: 'Sepia' }).click()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/reader-sepia.png' })

  expect(errors).toEqual([])
})
