import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { reply, route } from '@/test/api'
import { ada } from '@/test/fixtures'
import { setViewport } from '@/test/media'
import { testQueryClient } from '@/test/render'
import { router } from './router'

vi.mock('@/vendor/foliate-js/view.js', () => import('@/test/foliate'))
vi.mock('@/vendor/foliate-js/overlayer.js', () => import('@/test/foliate'))

async function open(path: string) {
  setViewport(1200)
  render(
    <QueryClientProvider client={testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await act(() => router.navigate(path))
}

describe('router', () => {
  it('sends a device with no Profiles to first run', async () => {
    route('GET /api/profiles', { profiles: [] })
    route('GET /api/session', { profile: null })
    await open('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'))
  })

  it('sends a device with no Active Profile to the picker', async () => {
    route('GET /api/profiles', { profiles: [ada] })
    route('GET /api/session', { profile: null })
    await open('/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/profiles'))
  })

  it('opens the library for the Active Profile, and sends unknown paths home', async () => {
    route('GET /api/profiles', { profiles: [ada] })
    route('GET /api/session', { profile: ada })
    route('GET /api/books/facets', {
      authors: [],
      series: [],
      tags: [],
      shared: 0,
      hidden: 0,
      audio: 0,
    })
    route('GET /api/shelves', { shelves: [] })
    route('GET /api/books', { books: [], total: 0, nextCursor: null })
    await open('/nowhere')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByText('Your library is empty')).toBeTruthy()
  })

  it('says when the server cannot be reached', async () => {
    route('GET /api/profiles', reply(500))
    route('GET /api/session', reply(500))
    await open('/')
    expect(await screen.findByText("Can't reach the Papyrus server.")).toBeTruthy()
  })
})
