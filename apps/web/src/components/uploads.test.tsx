import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderPage } from '@/test/render'
import { installFakeXhr } from '@/test/xhr'
import { UploadProvider, useUploads } from './uploads'

function Picker({ files }: { files: File[] }) {
  const { addFiles } = useUploads()
  return (
    <button type="button" onClick={() => addFiles(files)}>
      Add
    </button>
  )
}

const epub = (name: string) => new File(['x'], name)

describe('UploadProvider', () => {
  it('uploads ebooks one per request, three at a time, and reports each result', async () => {
    const xhrs = installFakeXhr()
    const files = ['a.epub', 'b.epub', 'c.epub', 'd.epub'].map(epub)
    const { user, queryClient } = renderPage(
      <UploadProvider>
        <Picker files={[...files, new File(['1'], '1.mp3'), new File(['2'], '2.mp3')]} />
      </UploadProvider>,
    )
    queryClient.setQueryData(['books', 'list'], {})
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(xhrs).toHaveLength(3))
    expect(screen.getByText('Uploads 0/5')).toBeTruthy()
    expect(screen.getByText('2 recordings')).toBeTruthy()

    act(() => xhrs[0]?.progress(1, 2))
    act(() => xhrs[0]?.respond(200, { status: 'created', bookId: 'b1', title: 'A' }))
    await waitFor(() => expect(xhrs).toHaveLength(4))
    expect(await screen.findByText('New Book')).toBeTruthy()
    expect(queryClient.getQueryState(['books', 'list'])?.isInvalidated).toBe(true)

    act(() => xhrs[1]?.respond(200, { status: 'attached', bookId: 'b2', title: 'Dune' }))
    act(() => xhrs[2]?.respond(200, { status: 'duplicate', bookId: 'b3', title: 'Emma' }))
    await waitFor(() => expect(xhrs).toHaveLength(5))
    act(() => xhrs[3]?.fail())
    expect(xhrs[4]?.url).toBe('/api/uploads/audio')
    act(() =>
      xhrs[4]?.respond(200, {
        results: [{ status: 'created', bookId: 'b5', title: 'Quiet Shore' }],
      }),
    )

    expect(await screen.findByText('Added to Dune')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Emma' })).toBeTruthy()
    expect(screen.getByText('Failed: Network error')).toBeTruthy()
    expect(screen.getByText('New audiobook Quiet Shore')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Clear finished' }))
    expect(screen.queryByText(/Uploads/)).toBeNull()
  })

  it('leaves the library alone when every upload failed', async () => {
    const xhrs = installFakeXhr()
    const { user, queryClient } = renderPage(
      <UploadProvider>
        <Picker files={[epub('bad.epub')]} />
      </UploadProvider>,
    )
    queryClient.setQueryData(['books', 'list'], {})
    await user.click(screen.getByRole('button', { name: 'Add' }))
    act(() => xhrs[0]?.respond(415, { message: 'Not a book' }))
    expect(await screen.findByText('Failed: Not a book')).toBeTruthy()
    expect(queryClient.getQueryState(['books', 'list'])?.isInvalidated).toBe(false)
  })

  it('ignores an empty pick', async () => {
    installFakeXhr()
    const { user } = renderPage(
      <UploadProvider>
        <Picker files={[]} />
      </UploadProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.queryByText(/Uploads/)).toBeNull()
  })

  it('accepts files dropped anywhere on the page', async () => {
    const xhrs = installFakeXhr()
    renderPage(
      <UploadProvider>
        <p>Library</p>
      </UploadProvider>,
    )
    const files = [epub('dropped.epub')]
    const withFiles = { dataTransfer: { types: ['Files'], files } }
    const notFiles = { dataTransfer: { types: ['text/plain'], files: [] } }

    fireEvent.dragEnter(window, notFiles)
    expect(screen.queryByText('Drop to add to your library')).toBeNull()
    fireEvent.dragEnter(window, withFiles)
    fireEvent.dragEnter(window, withFiles)
    expect(screen.getByText('Drop to add to your library')).toBeTruthy()
    fireEvent.dragLeave(window)
    expect(screen.getByText('Drop to add to your library')).toBeTruthy()
    fireEvent.dragLeave(window)
    expect(screen.queryByText('Drop to add to your library')).toBeNull()

    fireEvent.dragOver(window, withFiles)
    fireEvent.drop(window, notFiles)
    fireEvent.dragEnter(window, withFiles)
    fireEvent.drop(window, withFiles)
    expect(screen.queryByText('Drop to add to your library')).toBeNull()
    await waitFor(() => expect(xhrs).toHaveLength(1))
    expect(screen.getByText('dropped.epub')).toBeTruthy()
  })

  it('must be used inside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useUploads())).toThrow('useUploads outside UploadProvider')
    vi.restoreAllMocks()
  })
})
