import yazl from 'yazl'

const chapter = (n: number, title: string) => {
  const paragraphs = Array.from(
    { length: 40 },
    (_, i) =>
      `<p>Paragraph ${i + 1} of ${title}. The spice must flow, and the sand remembers every step taken across it.</p>`,
  ).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1 id="c${n}">${title}</h1>${paragraphs}</body></html>`
}

/** A small but real epub: three chapters, an EPUB 3 nav, enough text to paginate. */
export async function buildReadableEpub({
  title = 'Arrakis Notes',
  author = 'Test Author',
  tags = [] as string[],
} = {}): Promise<Buffer> {
  const titles = ['Chapter One', 'Chapter Two', 'Chapter Three']
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', { compress: false })
  zip.addBuffer(
    Buffer.from(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'META-INF/container.xml',
  )
  const items = titles
    .map(
      (_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('')
  const spine = titles.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')
  zip.addBuffer(
    Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:3f1c2d4e-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>${title}</dc:title><dc:creator>${author}</dc:creator>${tags.map((t) => `<dc:subject>${t}</dc:subject>`).join('')}<dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest>
  <spine>${spine}</spine>
</package>`),
    'OEBPS/content.opf',
  )
  const navItems = titles.map((t, i) => `<li><a href="c${i + 1}.xhtml">${t}</a></li>`).join('')
  zip.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol>${navItems}</ol></nav></body></html>`,
    ),
    'OEBPS/nav.xhtml',
  )
  titles.forEach((t, i) => {
    zip.addBuffer(Buffer.from(chapter(i + 1, t)), `OEBPS/c${i + 1}.xhtml`)
  })
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}
