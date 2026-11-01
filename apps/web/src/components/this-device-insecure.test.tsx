import { screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderPage } from '@/test/render'
import { ThisDevice } from './this-device'

vi.mock('@/lib/offline', async (original) => ({
  ...(await original<typeof import('@/lib/offline')>()),
  offlineSupported: false,
}))

it('explains that Offline Books need a secure connection', () => {
  renderPage(<ThisDevice profileId="p-insecure" />)
  expect(screen.getByText(/Offline Books need a secure connection/)).toBeTruthy()
})
