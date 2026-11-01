import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { ada } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { SettingsPage } from './settings'

function setup() {
  route('GET /api/session', { profile: ada })
  route('GET /api/profiles', { profiles: [ada] })
  route('GET /api/imports', { enabled: false, folder: null, pollSeconds: 5, records: [] })
  return renderPage(<SettingsPage />, { path: '/settings' })
}

describe('SettingsPage', () => {
  it('saves the Profile', async () => {
    route('PATCH /api/profiles/me', { ...ada, name: 'Ada L' })
    const { user } = setup()
    const name = await screen.findByLabelText('Name')
    await user.type(name, ' L')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(callsTo('PATCH /api/profiles/me')[0]?.body).toEqual({ name: 'Ada L', colour: 'blue' })
  })

  it('deletes the Profile once its name is typed', async () => {
    route('DELETE /api/profiles/me', reply(204))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Delete Ada' }))
    const confirm = await screen.findByRole('button', { name: 'Delete forever' })
    expect(confirm).toHaveProperty('disabled', true)
    await user.keyboard(' ada ')
    await user.click(confirm)
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/profiles'))
  })

  it('shows why deleting failed', async () => {
    route('DELETE /api/profiles/me', reply(400, { error: 'x', message: 'Name does not match' }))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Delete Ada' }))
    await user.keyboard('Ada')
    await user.click(await screen.findByRole('button', { name: 'Delete forever' }))
    expect(await screen.findByText('Name does not match')).toBeTruthy()
    route('DELETE /api/profiles/me', () => Promise.reject(new Error('x')))
    await user.click(screen.getByRole('button', { name: 'Delete forever' }))
    expect(await screen.findByText('Something went wrong')).toBeTruthy()
  })

  it('shows nothing without an Active Profile', async () => {
    route('GET /api/session', { profile: null })
    const { container } = renderPage(<SettingsPage />)
    await waitFor(() => expect(callsTo('GET /api/session')).toHaveLength(1))
    expect(container.querySelector('h1')).toBeNull()
  })
})
