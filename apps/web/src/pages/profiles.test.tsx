import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, route } from '@/test/api'
import { ada, bob } from '@/test/fixtures'
import { renderPage } from '@/test/render'
import { ProfilesPage } from './profiles'
import { WelcomePage } from './welcome'

const location = () => screen.getByTestId('location').textContent

describe('WelcomePage', () => {
  it('creates the first Profile and opens the library', async () => {
    route('GET /api/profiles', { profiles: [] })
    route('POST /api/profiles', ada)
    const { user } = renderPage(<WelcomePage />, { path: '/welcome' })
    await user.type(screen.getByLabelText('Name'), 'Ada')
    route('GET /api/profiles', { profiles: [ada] })
    await user.click(screen.getByRole('button', { name: 'Create Profile' }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(callsTo('POST /api/profiles')[0]?.body).toEqual({ name: 'Ada', colour: 'blue' })
  })

  it('goes to the library when Profiles exist', async () => {
    route('GET /api/profiles', { profiles: [ada] })
    renderPage(<WelcomePage />, { path: '/welcome' })
    await waitFor(() => expect(location()).toBe('/'))
  })
})

describe('ProfilesPage', () => {
  it('switches to the chosen Profile', async () => {
    route('GET /api/profiles', { profiles: [ada, bob] })
    route('GET /api/session', { profile: ada })
    route('PUT /api/session/profile', bob)
    const { user } = renderPage(<ProfilesPage />, { path: '/profiles' })
    await user.click(await screen.findByRole('button', { name: 'Bob' }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(callsTo('PUT /api/session/profile')[0]?.body).toEqual({ profileId: bob.id })
  })

  it('adds a Profile', async () => {
    route('GET /api/profiles', { profiles: [ada] })
    route('GET /api/session', { profile: null })
    route('POST /api/profiles', bob)
    const { user } = renderPage(<ProfilesPage />, { path: '/profiles' })
    await user.click(await screen.findByRole('button', { name: /Add Profile/ }))
    await user.type(await screen.findByLabelText('Name'), 'Bob')
    await user.click(screen.getByRole('button', { name: 'Create Profile' }))
    await waitFor(() => expect(location()).toBe('/'))
  })

  it('sends a device with no Profiles to first run', async () => {
    route('GET /api/profiles', { profiles: [] })
    route('GET /api/session', { profile: null })
    renderPage(<ProfilesPage />, { path: '/profiles' })
    await waitFor(() => expect(location()).toBe('/welcome'))
  })
})
