import fs from 'node:fs/promises'
import {
  type Extracted,
  type ExtractedCover,
  type ExtractedMetadata,
  htmlToText,
  normaliseIsbn,
} from './metadata.ts'

// Offsets follow the MobileRead PDB/MOBI wiki and foliate-js mobi.js (ticket 03).
const PDB_HEADER = 78
const MOBI_HEADER_START = 16
const MAX_RECORD_BYTES = 15 * 1024 * 1024

const EXTH = {
  author: 100,
  publisher: 101,
  description: 103,
  isbn: 104,
  subject: 105,
  publishingDate: 106,
  source: 112,
  coverOffset: 201,
  thumbOffset: 202,
  updatedTitle: 503,
  language: 524,
} as const

const NO_IMAGE = 0xffffffff

class PdbFile {
  private readonly file: fs.FileHandle
  readonly offsets: number[]
  readonly size: number

  private constructor(file: fs.FileHandle, offsets: number[], size: number) {
    this.file = file
    this.offsets = offsets
    this.size = size
  }

  static async open(path: string): Promise<PdbFile> {
    const file = await fs.open(path, 'r')
    try {
      const { size } = await file.stat()
      const header = await read(file, 0, PDB_HEADER)
      if (header.length < PDB_HEADER || header.toString('latin1', 60, 68) !== 'BOOKMOBI')
        throw new Error('Not a MOBI file')
      const count = header.readUInt16BE(76)
      const list = await read(file, PDB_HEADER, count * 8)
      if (list.length < count * 8) throw new Error('The record list is truncated')
      const offsets = Array.from({ length: count }, (_, i) => list.readUInt32BE(i * 8))
      return new PdbFile(file, offsets, size)
    } catch (error) {
      await file.close()
      throw error
    }
  }

  async record(index: number): Promise<Buffer> {
    const start = this.offsets[index]
    if (start === undefined) throw new Error(`Record ${index} does not exist`)
    const end = this.offsets[index + 1] ?? this.size
    if (end < start || end - start > MAX_RECORD_BYTES)
      throw new Error(`Record ${index} is not valid`)
    return read(this.file, start, end - start)
  }

  close(): Promise<void> {
    return this.file.close()
  }
}

async function read(file: fs.FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

/** Reads metadata and the cover from a mobi or azw3 File; nothing needs decompressing. */
export async function extractMobi(path: string): Promise<Extracted> {
  const pdb = await PdbFile.open(path)
  try {
    const record0 = await pdb.record(0)
    if (record0.toString('latin1', MOBI_HEADER_START, MOBI_HEADER_START + 4) !== 'MOBI')
      throw new Error('The MOBI header is missing')
    const headerLength = record0.readUInt32BE(MOBI_HEADER_START + 4)
    const decoder = new TextDecoder(record0.readUInt32BE(28) === 65001 ? 'utf-8' : 'windows-1252')
    const exth = readExth(record0, headerLength)
    const strings = (type: number) =>
      (exth.get(type) ?? []).map((b) => decoder.decode(b).trim()).filter(Boolean)
    const first = (type: number) => strings(type)[0]

    const fullNameOffset = record0.readUInt32BE(0x54)
    const fullNameLength = record0.readUInt32BE(0x58)
    const fullName = decoder
      .decode(record0.subarray(fullNameOffset, fullNameOffset + fullNameLength))
      .trim()

    const metadata: ExtractedMetadata = {
      authors: strings(EXTH.author),
      tags: [...new Set(strings(EXTH.subject))],
    }
    const title = first(EXTH.updatedTitle) || fullName
    if (title) metadata.title = title
    const publisher = first(EXTH.publisher)
    if (publisher) metadata.publisher = publisher
    // EXTH descriptions are HTML that is itself HTML-escaped, so decode twice.
    const description = first(EXTH.description)
    if (description) metadata.description = htmlToText(htmlToText(description))
    const date = first(EXTH.publishingDate)
    if (date) metadata.publishedDate = date
    const language = first(EXTH.language)
    if (language) metadata.language = language
    const isbn = [...strings(EXTH.isbn), ...strings(EXTH.source)]
      .map(normaliseIsbn)
      .find((v) => v !== undefined)
    if (isbn) metadata.isbn = isbn
    // MOBI has no series field at all (ticket 03), so series stays editable only.

    const extracted: Extracted = { metadata }
    const cover = await readCover(pdb, record0, exth)
    if (cover) extracted.cover = cover
    return extracted
  } finally {
    await pdb.close()
  }
}

function readExth(record0: Buffer, headerLength: number): Map<number, Buffer[]> {
  const out = new Map<number, Buffer[]>()
  const hasExth = record0.length >= 0x84 && (record0.readUInt32BE(0x80) & 0x40) !== 0
  const start = MOBI_HEADER_START + headerLength
  if (!hasExth || record0.toString('latin1', start, start + 4) !== 'EXTH') return out
  const count = record0.readUInt32BE(start + 8)
  let pos = start + 12
  for (let i = 0; i < count && pos + 8 <= record0.length; i++) {
    const type = record0.readUInt32BE(pos)
    const length = record0.readUInt32BE(pos + 4)
    if (length < 8 || pos + length > record0.length) break
    const list = out.get(type) ?? []
    list.push(record0.subarray(pos + 8, pos + length))
    out.set(type, list)
    pos += length
  }
  return out
}

async function readCover(
  pdb: PdbFile,
  record0: Buffer,
  exth: Map<number, Buffer[]>,
): Promise<ExtractedCover | undefined> {
  const firstImage = record0.length >= 0x70 ? record0.readUInt32BE(0x6c) : NO_IMAGE
  if (firstImage === NO_IMAGE) return undefined
  const offsetOf = (type: number) => {
    const value = exth.get(type)?.[0]
    return value && value.length >= 4 ? value.readUInt32BE(0) : undefined
  }
  const offset = offsetOf(EXTH.coverOffset) ?? offsetOf(EXTH.thumbOffset)
  if (offset === undefined || offset === NO_IMAGE) return undefined
  const data = await pdb.record(firstImage + offset).catch(() => undefined)
  const ext = data && imageType(data)
  return data && ext ? { data, ext } : undefined
}

function imageType(data: Buffer): ExtractedCover['ext'] | undefined {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg'
  if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png'
  if (data.toString('latin1', 0, 4) === 'GIF8') return 'gif'
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP')
    return 'webp'
  return undefined
}
