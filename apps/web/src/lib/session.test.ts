import { act, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, reply, route } from '@/test/api'
import { ada, bob } from '@/test/fixtures'
import { renderQueryHook } from '@/test/render'
import {
  sessionKeys,
  useCreateProfile,
  useDeleteMyProfile,
  useProfiles,
  useSession,
  useSwitchProfile,
  useUpdateMyProfile,
} from './session'

describe('useProfiles', () => {
  it('lists the Profiles and remembers them', async () => {
    route('GET /api/profiles', { profiles: [ada, bob] })
    const { result } = renderQueryHook(() => useProfiles())
    await waitFor(() => expect(result.current.data).toEqual([ada, bob]))
    expect(JSON.parse(localStorage.getItem('papyrus:last-profiles') ?? '')).toEqual([ada, bob])
  })

  it('offline, offers only the remembered Profiles used on this device', async () => {
    localStorage.setItem('papyrus:last-profiles', JSON.stringify([ada, bob]))
    localStorage.setItem('papyrus:device-profiles', JSON.stringify([bob.id]))
    route('GET /api/profiles', reply(503))
    const { result } = renderQueryHook(() => useProfiles({ fresh: true }))
    await waitFor(() => expect(result.current.data).toEqual([bob]))
  })

  it('fails when nothing is remembered', async () => {
    route('GET /api/profiles', reply(503))
    const { result } = renderQueryHook(() => useProfiles())
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('fails on a real error even with remembered Profiles', async () => {
    localStorage.setItem('papyrus:last-profiles', JSON.stringify([ada]))
    route('GET /api/profiles', reply(400, { error: 'bad', message: 'Bad' }))
    const { result } = renderQueryHook(() => useProfiles())
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useSession', () => {
  it('returns the Active Profile and records it as used on this device', async () => {
    route('GET /api/session', { profile: ada })
    const { result } = renderQueryHook(() => useSession())
    await waitFor(() => expect(result.current.data).toEqual(ada))
    expect(JSON.parse(localStorage.getItem('papyrus:device-profiles') ?? '')).toEqual([ada.id])
  })

  it('records a Profile on this device only once', async () => {
    localStorage.setItem('papyrus:device-profiles', JSON.stringify([ada.id]))
    route('GET /api/session', { profile: ada })
    const { result } = renderQueryHook(() => useSession())
    await waitFor(() => expect(result.current.data).toEqual(ada))
    expect(JSON.parse(localStorage.getItem('papyrus:device-profiles') ?? '')).toEqual([ada.id])
  })

  it('has no Profile when none is active', async () => {
    route('GET /api/session', { profile: null })
    const { result } = renderQueryHook(() => useSession())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe('session mutations', () => {
  function setupMutation<T>(hook: () => T) {
    route('GET /api/profiles', { profiles: [ada, bob] })
    const rendered = renderQueryHook(hook)
    rendered.queryClient.setQueryData(['books', 'list'], { books: [] })
    rendered.queryClient.setQueryData(sessionKeys.session, ada)
    return rendered
  }

  it('switching sets the session, forgets the old Profile’s data and remembers the new one', async () => {
    route('PUT /api/session/profile', bob)
    const { result, queryClient } = setupMutation(() => useSwitchProfile())
    await act(() => result.current.mutateAsync(bob.id))
    expect(callsTo('PUT /api/session/profile')[0]?.body).toEqual({ profileId: bob.id })
    expect(queryClient.getQueryData(sessionKeys.session)).toEqual(bob)
    expect(queryClient.getQueryData(['books', 'list'])).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('papyrus:last-session') ?? '')).toEqual(bob)
  })

  it('creates a Profile', async () => {
    route('POST /api/profiles', bob)
    const { result, queryClient } = setupMutation(() => useCreateProfile())
    await act(() => result.current.mutateAsync({ name: 'Bob', colour: 'green' }))
    expect(callsTo('POST /api/profiles')[0]?.body).toEqual({ name: 'Bob', colour: 'green' })
    expect(queryClient.getQueryData(sessionKeys.session)).toEqual(bob)
  })

  it('updates the Active Profile', async () => {
    route('PATCH /api/profiles/me', { ...ada, name: 'Ada L' })
    const { result, queryClient } = setupMutation(() => useUpdateMyProfile())
    await act(() => result.current.mutateAsync({ name: 'Ada L' }))
    expect(queryClient.getQueryData(sessionKeys.session)).toMatchObject({ name: 'Ada L' })
  })

  it('deleting leaves no Active Profile', async () => {
    route('DELETE /api/profiles/me', reply(204))
    const { result, queryClient } = setupMutation(() => useDeleteMyProfile())
    await act(() => result.current.mutateAsync('Ada'))
    expect(callsTo('DELETE /api/profiles/me')[0]?.body).toEqual({ confirmName: 'Ada' })
    expect(queryClient.getQueryData(sessionKeys.session)).toBeNull()
  })
})
