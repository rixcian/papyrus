import { type Hlc, HlcClock } from '@papyrus/shared'

const DEVICE_KEY = 'papyrus:device-id'
const LAST_HLC_KEY = 'papyrus:last-hlc'

/** A random id per browser; Reading Progress records which device wrote it (ticket 08). */
export function deviceId(storage: Storage = localStorage): string {
  let id = storage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    storage.setItem(DEVICE_KEY, id)
  }
  return id
}

/**
 * The device's hybrid logical clock (ADR 0002). Its last timestamp is persisted so it stays
 * monotonic across reloads, and it folds in every timestamp the server sends back.
 */
export class DeviceClock {
  private readonly clock: HlcClock
  private readonly storage: Storage

  constructor(storage: Storage = localStorage, now: () => number = Date.now) {
    this.storage = storage
    this.clock = new HlcClock(deviceId(storage), now)
    const last = storage.getItem(LAST_HLC_KEY)
    if (last) this.clock.receive(last)
  }

  get node(): string {
    return this.clock.node
  }

  tick(): Hlc {
    const hlc = this.clock.tick()
    this.storage.setItem(LAST_HLC_KEY, hlc)
    return hlc
  }

  observe(remote: Hlc): void {
    this.clock.receive(remote)
  }
}
