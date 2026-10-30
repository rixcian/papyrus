import yazl from 'yazl'

export interface EpubFixture {
  /** Raw `<metadata>` children, e.g. `<dc:title>Dune</dc:title>`. */
  metadata: string
  /** Extra manifest items. */
  manifest?: string
  guide?: string
  files?: Record<string, Buffer | string>
  opfPath?: string
}

/** Builds a minimal epub in memory so extractor tests need no binary fixtures. */
export async function buildEpub({
  metadata,
  manifest = '',
  guide = '',
  files = {},
  opfPath = 'OEBPS/content.opf',
}: EpubFixture): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', { compress: false })
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    'META-INF/container.xml',
  )
  zip.addBuffer(
    Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">${metadata}</metadata>
  <manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>${manifest}</manifest>
  <spine><itemref idref="ch1"/></spine>
  ${guide ? `<guide>${guide}</guide>` : ''}
</package>`),
    opfPath,
  )
  zip.addBuffer(Buffer.from('<html><body><p>Hello</p></body></html>'), 'OEBPS/ch1.xhtml')
  for (const [name, data] of Object.entries(files))
    zip.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data), name)
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** A 1×1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export function multipart(filename: string, data: Buffer) {
  const boundary = `----papyrus${Math.random().toString(16).slice(2)}`
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
