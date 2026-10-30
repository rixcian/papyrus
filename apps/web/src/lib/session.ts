import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isUnreachable, remembered } from './offline'

export type Profile = { id: string; name: string; colour: ProfileColour }
export type { ProfileColour } from '@papyrus/shared'

import type { ProfileColour } from '@papyrus/shared'

export const sessionKeys = {
  profiles: ['profiles'] as const,
  session: ['session'] as const,
}

// The Active Profile cookie is per browser, so every open tab follows a switch (ticket 07).
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('papyrus-profile')
channel?.addEventListener('message', () => window.location.reload())

function announceProfileChange() {
  channel?.postMessage('changed')
}

/** `fresh` refetches on mount, for screens that must list Profiles added on other devices. */
/** Profiles that have been active on this device; offline, only these are offered (ticket 05). */
const DEVICE_PROFILES = 'papyrus:device-profiles'
const LAST_PROFILES = 'papyrus:last-profiles'
const LAST_SESSION = 'papyrus:last-session'
const deviceProfiles = (): string[] => JSON.parse(localStorage.getItem(DEVICE_PROFILES) ?? '[]')

function rememberDeviceProfile(profile: Profile | null) {
  if (profile && !deviceProfiles().includes(profile.id))
    localStorage.setItem(DEVICE_PROFILES, JSON.stringify([...deviceProfiles(), profile.id]))
}

/** `fresh` refetches on mount, for screens that must list Profiles added on other devices. */
export function useProfiles({ fresh = false } = {}) {
  return useQuery({
    queryKey: sessionKeys.profiles,
    queryFn: async () => {
      try {
        const profiles = await unwrap(api.GET('/api/profiles')).then((r) => r.profiles as Profile[])
        localStorage.setItem(LAST_PROFILES, JSON.stringify(profiles))
        return profiles
      } catch (error) {
        const saved = localStorage.getItem(LAST_PROFILES)
        if (saved === null || !isUnreachable(error)) throw error
        const used = new Set(deviceProfiles())
        return (JSON.parse(saved) as Profile[]).filter((p) => used.has(p.id))
      }
    },
    ...(fresh && { refetchOnMount: 'always' as const }),
  })
}

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.session,
    queryFn: async () => {
      const profile = await remembered(LAST_SESSION, () =>
        unwrap(api.GET('/api/session')).then((r) => r.profile as Profile | null),
      )
      rememberDeviceProfile(profile)
      return profile
    },
  })
}

/**
 * Every mutation here changes which Profile is active (or what it looks like). The result
 * goes straight into the session cache, so guards never read a stale Active Profile.
 */
function useSessionMutation<A>(fn: (args: A) => Promise<Profile | null>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (profile) => {
      // Everything cached belongs to the previous Active Profile.
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'profiles',
      })
      queryClient.setQueryData(sessionKeys.session, profile)
      localStorage.setItem(LAST_SESSION, JSON.stringify(profile))
      rememberDeviceProfile(profile)
      await queryClient.invalidateQueries({ queryKey: sessionKeys.profiles })
      announceProfileChange()
    },
  })
}

export function useCreateProfile() {
  return useSessionMutation((body: { name: string; colour: ProfileColour }) =>
    unwrap(api.POST('/api/profiles', { body })).then((p) => p as Profile),
  )
}

export function useSwitchProfile() {
  return useSessionMutation((profileId: string) =>
    unwrap(api.PUT('/api/session/profile', { body: { profileId } })).then((p) => p as Profile),
  )
}

export function useUpdateMyProfile() {
  return useSessionMutation((body: { name?: string; colour?: ProfileColour }) =>
    unwrap(api.PATCH('/api/profiles/me', { body })).then((p) => p as Profile),
  )
}

export function useDeleteMyProfile() {
  return useSessionMutation((confirmName: string) =>
    unwrap(api.DELETE('/api/profiles/me', { body: { confirmName } })).then(() => null),
  )
}
