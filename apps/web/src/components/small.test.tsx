import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { offlineStore } from '@/sync'
import { renderPage } from '@/test/render'
import { BookCover } from './book-cover'
import { ConfirmDialog } from './confirm-dialog'
import { OfflineLibrary } from './offline-library'
import { ProfileAvatar } from './profile-avatar'
import { ProfileForm } from './profile-form'

describe('BookCover', () => {
  it('shows the cover image, or the title when there is none', () => {
    const { container, rerender } = render(<BookCover title="Dune" coverUrl="/c.jpg" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/c.jpg')
    rerender(<BookCover title="Dune" coverUrl={null} progress={0.5} audio />)
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Has audiobook' })).toBeTruthy()
    expect(container.querySelector<HTMLElement>('[style]')?.style.width).toBe('50%')
  })
})

describe('ProfileAvatar', () => {
  it.each(['sm', 'md', 'lg'] as const)('shows the initial at size %s', (size) => {
    render(<ProfileAvatar name="ada" colour="teal" size={size} />)
    expect(screen.getByText('A')).toBeTruthy()
  })
})

describe('ProfileForm', () => {
  it('submits the name and chosen colour', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<ProfileForm submitLabel="Create" onSubmit={onSubmit} />)
    const submit = screen.getByRole('button', { name: 'Create' })
    expect(submit).toHaveProperty('disabled', true)
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    await userEvent.click(screen.getByRole('button', { name: 'teal' }))
    expect(screen.getByRole('button', { name: 'teal' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', colour: 'teal' })
  })

  it('starts from the initial values and shows server errors', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(409, 'taken', 'That name is taken')
    })
    render(
      <ProfileForm
        initial={{ name: 'Bob', colour: 'red' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Bob')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('That name is taken')).toBeTruthy()
  })

  it('shows a generic message for other errors', async () => {
    render(
      <ProfileForm
        initial={{ name: 'Bob', colour: 'red' }}
        submitLabel="Save"
        onSubmit={() => Promise.reject(new Error('x'))}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Something went wrong')).toBeTruthy()
  })
})

describe('ConfirmDialog', () => {
  function setup(onConfirm: () => Promise<unknown>) {
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete Dune?"
        description="It goes for good."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    )
    return onOpenChange
  }

  it('confirms and closes', async () => {
    const onConfirm = vi.fn(async () => {})
    const onOpenChange = setup(onConfirm)
    expect(screen.getByText('It goes for good.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open and explains a failure', async () => {
    const onOpenChange = setup(() => Promise.reject(new ApiError(403, 'no', 'Not yours')))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Not yours')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('has a generic message for unexpected failures, and a plain confirm button', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Restore?"
        description="."
        confirmLabel="Restore"
        destructive={false}
        onConfirm={() => Promise.reject(new Error('x'))}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Something went wrong')).toBeTruthy()
  })
})

describe('OfflineLibrary', () => {
  it('lists the Books saved on this device', async () => {
    await offlineStore.save('p-ol', {
      id: 'b1',
      title: 'Dune',
      authors: ['Frank Herbert', 'Brian Herbert'],
      coverUrl: null,
      sharedBy: null,
      files: [],
    })
    renderPage(<OfflineLibrary profileId="p-ol" />)
    const link = await screen.findByRole('link', { name: /Frank Herbert, Brian Herbert/ })
    expect(link.getAttribute('href')).toBe('/books/b1')
  })

  it('says when nothing is saved', async () => {
    renderPage(<OfflineLibrary profileId="p-none" />)
    await waitFor(() => expect(screen.getByText(/No Books are saved on this device/)).toBeTruthy())
  })
})
