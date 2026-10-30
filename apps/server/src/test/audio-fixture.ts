import fs from 'node:fs'
import path from 'node:path'

/** Tiny recordings made by `scripts/make-audio-fixtures.sh`, committed so tests need no ffmpeg. */
export const AUDIO_DIR = path.join(import.meta.dirname, 'fixtures', 'audio')

export const audioFixture = (name: string) => fs.readFileSync(path.join(AUDIO_DIR, name))

export const QUIET_SHORE = ['01-arrival.mp3', '02-the-lighthouse.mp3', '03-departure.mp3']

/** Several files in one multipart body, as the web app sends audio. */
export function multipartMany(parts: { filename: string; data: Buffer }[]) {
  const boundary = `----papyrus${Math.random().toString(16).slice(2)}`
  const payload = Buffer.concat([
    ...parts.flatMap((p) => [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${p.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      p.data,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ])
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
