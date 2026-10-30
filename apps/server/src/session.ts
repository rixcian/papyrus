import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Db } from './db/client.ts'
import { type ProfileRow, profiles } from './db/schema.ts'
import { AppError } from './errors.ts'

export const PROFILE_COOKIE = 'papyrus_profile'

declare module 'fastify' {
  interface FastifyRequest {
    /** The Active Profile; set on every route registered behind `requireProfile`. */
    profile: ProfileRow
  }
}

/** The cookie identifies the Active Profile; it does not secure anything (ticket 07). */
export function requireProfile(db: Db) {
  return async (request: FastifyRequest) => {
    const id = request.cookies[PROFILE_COOKIE]
    const profile = id ? db.select().from(profiles).where(eq(profiles.id, id)).get() : undefined
    if (!profile) throw new AppError(401, 'no_active_profile', 'Pick a Profile first')
    request.profile = profile
  }
}

export function setActiveProfile(reply: FastifyReply, profileId: string): void {
  reply.setCookie(PROFILE_COOKIE, profileId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365 * 10,
  })
}

export function clearActiveProfile(reply: FastifyReply): void {
  reply.clearCookie(PROFILE_COOKIE, { path: '/' })
}
