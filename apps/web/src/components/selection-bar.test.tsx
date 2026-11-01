import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { ada, bookDetail, bookSummary } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { SelectionBar } from './selection-bar'

const own = bookSummary({ id: 'b1' })
const own2 = bookSummary({ id: 'b2', title: 'Emma' })
const shared = bookSummary({ id: 'b3', owned: false, sharedBy: 'Bob' })
const audio = bookSummary({ id: 'b4', formats: ['audio'] })

function setup(books = [own, shared], hiddenView = false) {
  route('GET /api/session', { profile: ada })
  route('GET /api/profiles', { profiles: [ada] })
  route('GET /api/shelves', { shelves: [] })
  const onClear = vi.fn()
  const page = renderPage(<SelectionBar books={books} hiddenView={hiddenView} onClear={onClear} />)
  return { ...page, onClear }
}

describe('SelectionBar', () => {
  it('counts each action’s Books when the selection is mixed', () => {
    setup()
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeTruthy()
  })

  it('hides Books Shared with the Profile, or unhides them', async () => {
    route('PUT /api/books/:id/hidden', {})
    const { user, onClear } = setup([shared], true)
    await user.click(screen.getByRole('button', { name: 'Unhide' }))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(callsTo('PUT /api/books/:id/hidden')[0]?.body).toEqual({ hidden: false })
    expect(screen.queryByRole('button', { name: /Share/ })).toBeNull()
  })

  it('deletes the Profile’s own Books after confirming', async () => {
    route('DELETE /api/books/:id', reply(204))
    const { user, onClear } = setup([own, own2])
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete 2 Books' }))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(callsTo('DELETE /api/books/:id')).toHaveLength(2)
  })

  it('shares the Profile’s own Books', async () => {
    route('PUT /api/books/:id/share', {})
    const { user, onClear } = setup([own])
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Share 1 Book')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /Everyone/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
  })

  it('saves Books offline straight away', async () => {
    route('GET /api/books/:id', bookDetail({ files: [] }))
    const { user, onClear } = setup([own])
    await user.click(screen.getByRole('button', { name: 'Make available offline' }))
    await waitFor(() => expect(onClear).toHaveBeenCalled())
  })

  it('asks before saving audiobooks offline', async () => {
    let release: () => void = () => {}
    route(
      'GET /api/books/:id',
      () => new Promise((r) => (release = () => r(bookDetail({ files: [] })))),
    )
    const { user, onClear } = setup([audio, { ...audio, id: 'b5' }])
    await user.click(screen.getByRole('button', { name: 'Make available offline' }))
    expect(await screen.findByText('Save 2 audiobooks on this device?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save offline' }))
    expect(await screen.findByRole('button', { name: /Saving…/ })).toBeTruthy()
    release()
    await waitFor(() => expect(callsTo('GET /api/books/:id')).toHaveLength(2))
    release()
    await waitFor(() => expect(onClear).toHaveBeenCalled())
  })

  it('names a single audiobook, and clears the selection', async () => {
    const { user, onClear } = setup([audio])
    await user.click(screen.getByRole('button', { name: 'Make available offline' }))
    expect(await screen.findByText('Save an audiobook on this device?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Save an audiobook on this device?')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(onClear).toHaveBeenCalled()
  })
})
