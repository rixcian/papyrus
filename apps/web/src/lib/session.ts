import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'

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

export function useProfiles() {
  return useQuery({
    queryKey: sessionKeys.profiles,
    queryFn: () => unwrap(api.GET('/api/profiles')).then((r) => r.profiles as Profile[]),
  })
}

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.session,
    queryFn: () => unwrap(api.GET('/api/session')).then((r) => r.profile as Profile | null),
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
