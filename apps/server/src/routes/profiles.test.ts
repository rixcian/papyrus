import { afterEach, describe, expect, it } from 'vitest'
import { createHarness, Device, type Harness } from '../test/harness.ts'

let h: Harness
afterEach(() => h?.close())

describe('profiles', () => {
  it('starts with no Profiles and no Active Profile', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    expect((await device.request({ url: '/api/profiles' })).json()).toEqual({ profiles: [] })
    expect((await device.request({ url: '/api/session' })).json()).toEqual({ profile: null })
  })

  it('makes a newly created Profile the Active Profile', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    const alice = await device.createProfile('  Alice  ')
    expect(alice.name).toBe('Alice')
    expect((await device.request({ url: '/api/session' })).json().profile.id).toBe(alice.id)
  })

  it('rejects a name already taken, ignoring case', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const res = await device.request({
      method: 'POST',
      url: '/api/profiles',
      payload: { name: 'ALICE', colour: 'red' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('name_taken')
  })

  it('validates name length and colour', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    const long = await device.request({
      method: 'POST',
      url: '/api/profiles',
      payload: { name: 'x'.repeat(33), colour: 'blue' },
    })
    const blank = await device.request({
      method: 'POST',
      url: '/api/profiles',
      payload: { name: '   ', colour: 'blue' },
    })
    const colour = await device.request({
      method: 'POST',
      url: '/api/profiles',
      payload: { name: 'Bob', colour: 'chartreuse' },
    })
    expect([long.statusCode, blank.statusCode, colour.statusCode]).toEqual([400, 400, 400])
  })

  it('switches the Active Profile per device', async () => {
    h = await createHarness()
    const phone = new Device(h.app)
    const laptop = new Device(h.app)
    const alice = await phone.createProfile('Alice')
    const bob = await laptop.createProfile('Bob')
    await phone.request({
      method: 'PUT',
      url: '/api/session/profile',
      payload: { profileId: bob.id },
    })
    expect((await phone.request({ url: '/api/session' })).json().profile.id).toBe(bob.id)
    expect((await laptop.request({ url: '/api/session' })).json().profile.id).toBe(bob.id)
    expect(alice.id).not.toBe(bob.id)
  })

  it('requires an Active Profile to edit "me"', async () => {
    h = await createHarness()
    const res = await new Device(h.app).request({
      method: 'PATCH',
      url: '/api/profiles/me',
      payload: { colour: 'red' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('no_active_profile')
  })

  it('renames and recolours only the Active Profile', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Bob')
    await device.createProfile('Alice')
    const res = await device.request({
      method: 'PATCH',
      url: '/api/profiles/me',
      payload: { name: 'Alicia', colour: 'green' },
    })
    expect(res.json()).toMatchObject({ name: 'Alicia', colour: 'green' })
    const clash = await device.request({
      method: 'PATCH',
      url: '/api/profiles/me',
      payload: { name: 'bob' },
    })
    expect(clash.statusCode).toBe(409)
  })

  it('deletes the Active Profile only when its name is typed', async () => {
    h = await createHarness()
    const device = new Device(h.app)
    await device.createProfile('Alice')
    const wrong = await device.request({
      method: 'DELETE',
      url: '/api/profiles/me',
      payload: { confirmName: 'Alic' },
    })
    expect(wrong.statusCode).toBe(400)
    const ok = await device.request({
      method: 'DELETE',
      url: '/api/profiles/me',
      payload: { confirmName: 'alice' },
    })
    expect(ok.statusCode).toBe(204)
    expect((await device.request({ url: '/api/profiles' })).json()).toEqual({ profiles: [] })
    expect((await device.request({ url: '/api/session' })).json()).toEqual({ profile: null })
  })
})
