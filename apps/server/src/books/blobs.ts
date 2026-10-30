import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface StagedFile {
  tempPath: string
  sha256: string
  size: number
}

/** Content-addressed File storage: `blobs/<sha[0..2]>/<sha>` (ticket 09). */
export class BlobStore {
  readonly blobsDir: string
  readonly tmpDir: string

  constructor(dataDir: string) {
    this.blobsDir = path.join(dataDir, 'blobs')
    this.tmpDir = path.join(dataDir, 'tmp')
    fs.mkdirSync(this.blobsDir, { recursive: true })
    fs.rmSync(this.tmpDir, { recursive: true, force: true })
    fs.mkdirSync(this.tmpDir, { recursive: true })
  }

  pathFor(sha256: string): string {
    return path.join(this.blobsDir, sha256.slice(0, 2), sha256)
  }

  /** Streams into a temp file on the same disk, hashing as it goes. */
  async stage(source: NodeJS.ReadableStream): Promise<StagedFile> {
    const tempPath = path.join(this.tmpDir, randomUUID())
    const hash = createHash('sha256')
    let size = 0
    const tap = new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk)
        size += chunk.length
        done(null, chunk)
      },
    })
    try {
      await pipeline(source, tap, fs.createWriteStream(tempPath))
    } catch (error) {
      fs.rmSync(tempPath, { force: true })
      throw error
    }
    return { tempPath, sha256: hash.digest('hex'), size }
  }

  async stageFile(file: string): Promise<StagedFile> {
    return this.stage(fs.createReadStream(file))
  }

  /** Moves a staged file into place; bytes already stored are kept and the temp file dropped. */
  commit(staged: StagedFile): void {
    const target = this.pathFor(staged.sha256)
    if (fs.existsSync(target)) {
      fs.rmSync(staged.tempPath, { force: true })
      return
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.renameSync(staged.tempPath, target)
  }

  discard(staged: StagedFile): void {
    fs.rmSync(staged.tempPath, { force: true })
  }

  remove(sha256: string): void {
    fs.rmSync(this.pathFor(sha256), { force: true })
  }
}
