import { vi } from 'vitest'

/** A stand-in XMLHttpRequest for uploads; `respond` finishes the request. */
export class FakeXhr {
  static all: FakeXhr[] = []
  status = 200
  response: unknown = null
  responseType = ''
  url = ''
  sent: FormData | undefined
  upload: {
    onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void
  } = {}
  onload?: () => void
  onerror?: () => void

  constructor() {
    FakeXhr.all.push(this)
  }
  open(_method: string, url: string) {
    this.url = url
  }
  send(form: FormData) {
    this.sent = form
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.response = body
    this.onload?.()
  }
  fail() {
    this.onerror?.()
  }
}

export function installFakeXhr() {
  FakeXhr.all = []
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  return FakeXhr.all
}
