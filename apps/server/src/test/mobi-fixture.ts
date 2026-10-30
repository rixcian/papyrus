export interface MobiFixture {
  fullName: string
  exth?: [type: number, value: string | Buffer][]
  utf8?: boolean
  /** Image records after the text record; EXTH 201 points into these. */
  images?: Buffer[]
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

/** Builds a minimal PDB/MOBI so extractor tests need no binary fixtures. */
export function buildMobi({ fullName, exth = [], utf8 = true, images = [] }: MobiFixture): Buffer {
  const encode = (s: string) => (utf8 ? Buffer.from(s, 'utf8') : Buffer.from(s, 'latin1'))
  const exthRecords = exth.map(([type, value]) => {
    const data = Buffer.isBuffer(value) ? value : encode(value)
    return Buffer.concat([u32(type), u32(data.length + 8), data])
  })
  const exthBody = Buffer.concat(exthRecords)
  const exthBlock = exth.length
    ? Buffer.concat([Buffer.from('EXTH'), u32(12 + exthBody.length), u32(exth.length), exthBody])
    : Buffer.alloc(0)

  const MOBI_HEADER_LENGTH = 232
  const header = Buffer.alloc(16 + MOBI_HEADER_LENGTH)
  header.write('MOBI', 16, 'latin1')
  header.writeUInt32BE(MOBI_HEADER_LENGTH, 20)
  header.writeUInt32BE(2, 24)
  header.writeUInt32BE(utf8 ? 65001 : 1252, 28)
  header.writeUInt32BE(6, 36)
  const name = encode(fullName)
  header.writeUInt32BE(header.length + exthBlock.length, 0x54)
  header.writeUInt32BE(name.length, 0x58)
  header.writeUInt32BE(images.length ? 2 : 0xffffffff, 0x6c)
  header.writeUInt32BE(exth.length ? 0x40 : 0, 0x80)
  const record0 = Buffer.concat([header, exthBlock, name, Buffer.alloc(2)])

  const records = [record0, Buffer.from('text'), ...images]
  const pdbHeader = Buffer.alloc(78)
  pdbHeader.write(fullName.slice(0, 31), 0, 'latin1')
  pdbHeader.write('BOOKMOBI', 60, 'latin1')
  pdbHeader.writeUInt16BE(records.length, 76)
  let offset = 78 + records.length * 8 + 2
  const list = records.map((r, i) => {
    const entry = Buffer.concat([u32(offset), u32(i)])
    offset += r.length
    return entry
  })
  return Buffer.concat([pdbHeader, ...list, Buffer.alloc(2), ...records])
}
