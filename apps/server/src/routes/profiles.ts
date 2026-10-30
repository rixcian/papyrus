import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { normaliseProfileName, PROFILE_COLOURS, PROFILE_NAME_MAX } from '@papyrus/shared'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Library } from '../books/library.ts'
import type { Db } from '../db/client.ts'
import { type ProfileRow, profiles } from '../db/schema.ts'
import { AppError } from '../errors.ts'
import { clearActiveProfile, requireProfile, setActiveProfile } from '../session.ts'

const Profile = z.object({ id: z.string(), name: z.string(), colour: z.enum(PROFILE_COLOURS) })
const ProfileName = z
  .string()
  .transform(normaliseProfileName)
  .pipe(z.string().min(1).max(PROFILE_NAME_MAX))
const Colour = z.enum(PROFILE_COLOURS)
const ErrorBody = z.object({ error: z.string(), message: z.string() })

const toProfile = (row: ProfileRow) => ({
  id: row.id,
  name: row.name,
  colour: row.colour as z.infer<typeof Colour>,
})

const nameKey = (name: string) => name.toLocaleLowerCase('en')

function assertNameFree(db: Db, name: string, exceptId?: string) {
  const clash = db
    .select()
    .from(profiles)
    .where(eq(profiles.nameKey, nameKey(name)))
    .get()
  if (clash && clash.id !== exceptId)
    throw new AppError(409, 'name_taken', `A Profile called "${clash.name}" already exists`)
}

export function profileRoutes(db: Db, library: Library): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/api/profiles',
      {
        schema: {
          operationId: 'listProfiles',
          response: { 200: z.object({ profiles: z.array(Profile) }) },
        },
      },
      async () => ({
        profiles: db.select().from(profiles).orderBy(asc(profiles.nameKey)).all().map(toProfile),
      }),
    )

    // Creating a Profile also makes it the device's Active Profile.
    app.post(
      '/api/profiles',
      {
        schema: {
          operationId: 'createProfile',
          body: z.object({ name: ProfileName, colour: Colour }),
          response: { 201: Profile, 409: ErrorBody },
        },
      },
      async (request, reply) => {
        const { name, colour } = request.body
        assertNameFree(db, name)
        const row = db
          .insert(profiles)
          .values({ id: randomUUID(), name, nameKey: nameKey(name), colour, createdAt: Date.now() })
          .returning()
          .get()
        setActiveProfile(reply, row.id)
        return reply.code(201).send(toProfile(row))
      },
    )

    app.get(
      '/api/session',
      {
        schema: {
          operationId: 'getSession',
          response: { 200: z.object({ profile: Profile.nullable() }) },
        },
      },
      async (request) => {
        const id = request.cookies.papyrus_profile
        const row = id ? db.select().from(profiles).where(eq(profiles.id, id)).get() : undefined
        return { profile: row ? toProfile(row) : null }
      },
    )

    app.put(
      '/api/session/profile',
      {
        schema: {
          operationId: 'setActiveProfile',
          body: z.object({ profileId: z.string() }),
          response: { 200: Profile, 404: ErrorBody },
        },
      },
      async (request, reply) => {
        const row = db.select().from(profiles).where(eq(profiles.id, request.body.profileId)).get()
        if (!row) throw new AppError(404, 'not_found', 'Profile not found')
        setActiveProfile(reply, row.id)
        return toProfile(row)
      },
    )

    const me: FastifyPluginAsyncZod = async (scoped) => {
      scoped.addHook('onRequest', requireProfile(db))

      scoped.patch(
        '/api/profiles/me',
        {
          schema: {
            operationId: 'updateMyProfile',
            body: z.object({ name: ProfileName.optional(), colour: Colour.optional() }),
            response: { 200: Profile, 409: ErrorBody },
          },
        },
        async (request) => {
          const { name, colour } = request.body
          if (name !== undefined) assertNameFree(db, name, request.profile.id)
          const row = db
            .update(profiles)
            .set({
              ...(name !== undefined && { name, nameKey: nameKey(name) }),
              ...(colour !== undefined && { colour }),
            })
            .where(eq(profiles.id, request.profile.id))
            .returning()
            .get()
          if (!row) throw new AppError(404, 'not_found', 'Profile not found')
          return toProfile(row)
        },
      )

      // Hard delete: everything the Profile owns cascades through foreign keys (ticket 07).
      scoped.delete(
        '/api/profiles/me',
        {
          schema: {
            operationId: 'deleteMyProfile',
            body: z.object({ confirmName: z.string() }),
            response: { 204: z.null(), 400: ErrorBody },
          },
        },
        async (request, reply) => {
          if (nameKey(normaliseProfileName(request.body.confirmName)) !== request.profile.nameKey)
            throw new AppError(400, 'confirmation_mismatch', 'Type the Profile name to confirm')
          // Book deletion first, so blobs and covers on disk go with the rows.
          library.deleteBooks(library.booksOwnedBy(request.profile.id))
          db.delete(profiles).where(eq(profiles.id, request.profile.id)).run()
          clearActiveProfile(reply)
          return reply.code(204).send(null)
        },
      )
    }
    await app.register(me)
  }
}
