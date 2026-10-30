/**
 * Regenerates the README screenshots in docs/screenshots: starts the built app on a
 * throwaway data folder, fills it with public-domain classics (covers drawn here, an
 * audiobook made with ffmpeg) and photographs it at phone size.
 *
 *   pnpm build && node scripts/screenshots.ts
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Browser, chromium, type Page } from '@playwright/test'
import yazl from 'yazl'

const ROOT = path.join(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'docs', 'screenshots')
const PORT = 18190
const BASE = `http://localhost:${PORT}`
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true }

interface Classic {
  title: string
  author: string
  year: string
  tags: string[]
  /** Cover background and text colours. */
  bg: string
  fg: string
  chapters: { title: string; paragraphs: string[] }[]
}

const filler = (title: string) =>
  Array.from({ length: 30 }, () => `${title} goes on, page after page, for the reader to find.`)

const PRIDE: Classic = {
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  year: '1813',
  tags: ['Classics', 'Romance'],
  bg: '#e9dcc3',
  fg: '#3b2a1a',
  chapters: [
    {
      title: 'Chapter I',
      paragraphs: [
        'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
        'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
        '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
        'Mr. Bennet replied that he had not.',
        '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”',
        'Mr. Bennet made no answer.',
        '“Do you not want to know who has taken it?” cried his wife impatiently.',
        '“You want to tell me, and I have no objection to hearing it.”',
        'This was invitation enough.',
      ],
    },
    { title: 'Chapter II', paragraphs: filler('Chapter II') },
    { title: 'Chapter III', paragraphs: filler('Chapter III') },
  ],
}

const others = (
  [
    ['Moby-Dick', 'Herman Melville', '1851', ['Classics', 'Adventure'], '#1d3b53', '#e8e2d0'],
    ['Frankenstein', 'Mary Shelley', '1818', ['Classics', 'Horror'], '#2b2b2b', '#c8d6c0'],
    ['The Time Machine', 'H. G. Wells', '1895', ['Science Fiction'], '#d9572b', '#fff4e6'],
    ['Dracula', 'Bram Stoker', '1897', ['Classics', 'Horror'], '#5c1a1b', '#f1d6c8'],
    ['Middlemarch', 'George Eliot', '1871', ['Classics'], '#58704f', '#f4efe2'],
    ['Jane Eyre', 'Charlotte Brontë', '1847', ['Classics', 'Romance'], '#c9b8d8', '#2e2140'],
    ['Walden', 'Henry David Thoreau', '1854', ['Nonfiction', 'Nature'], '#2f5d50', '#e9f0dc'],
    ['The Odyssey', 'Homer', '1614', ['Classics', 'Poetry'], '#0f2a44', '#e6c76a'],
  ] as const
).map(
  ([title, author, year, tags, bg, fg]): Classic => ({
    title,
    author,
    year,
    tags: [...tags],
    bg,
    fg,
    chapters: [1, 2, 3].map((n) => ({ title: `Chapter ${n}`, paragraphs: filler(title) })),
  }),
)

async function epub(book: Classic, cover: Buffer): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  const add = (name: string, body: string | Buffer) =>
    zip.addBuffer(typeof body === 'string' ? Buffer.from(body) : body, name)
  zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', { compress: false })
  add(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  )
  const ids = book.chapters.map((_, i) => `c${i + 1}`)
  add(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${book.title}</dc:title><dc:creator>${book.author}</dc:creator>
    <dc:date>${book.year}</dc:date><dc:language>en</dc:language>
    ${book.tags.map((t) => `<dc:subject>${t}</dc:subject>`).join('')}
    <meta name="cover" content="cover"/>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    ${ids.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
  </manifest>
  <spine>${ids.map((id) => `<itemref idref="${id}"/>`).join('')}</spine>
</package>`,
  )
  add(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${book.chapters.map((c, i) => `<li><a href="c${i + 1}.xhtml">${c.title}</a></li>`).join('')}</ol></nav></body></html>`,
  )
  add('OEBPS/cover.png', cover)
  book.chapters.forEach((c, i) => {
    add(
      `OEBPS/c${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c.title}</title></head><body><h2>${c.title}</h2>${c.paragraphs.map((p) => `<p>${p}</p>`).join('\n')}</body></html>`,
    )
  })
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** A typographic cover, drawn by the browser. */
async function drawCover(page: Page, book: Classic, square = false): Promise<Buffer> {
  const [w, h] = square ? [800, 800] : [600, 900]
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0">
    <div id="c" style="width:${w}px;height:${h}px;background:${book.bg};color:${book.fg};
      display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;
      padding:${square ? 70 : 64}px;font-family:Georgia,'Times New Roman',serif">
      <div style="font-size:22px;letter-spacing:6px;text-transform:uppercase;opacity:.75">${book.author}</div>
      <div>
        <div style="width:72px;height:4px;background:${book.fg};opacity:.6;margin-bottom:28px"></div>
        <div style="font-size:${book.title.length > 14 ? 64 : 80}px;line-height:1.02;font-weight:600">${book.title}</div>
      </div>
      <div style="font-size:20px;letter-spacing:4px;opacity:.6">${square ? 'UNABRIDGED · AUDIOBOOK' : book.year}</div>
    </div></body></html>`)
  return page.locator('#c').screenshot({ type: 'png' })
}

/** About three hours of near-silence in four Chapters, tagged like a real m4b. */
function makeAudiobook(dir: string, book: Classic, cover: Buffer): string {
  const coverPath = path.join(dir, 'cover.png')
  fs.writeFileSync(coverPath, cover)
  const minutes = [52, 48, 47, 54]
  let start = 0
  const chapters = [
    'I. The Inventor',
    'II. The Time Traveller Returns',
    'III. The Eloi',
    'IV. The Morlocks',
  ]
    .map((title, i) => {
      const end = start + (minutes[i] as number) * 60_000
      const block = `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${start}\nEND=${end}\ntitle=${title}\n`
      start = end
      return block
    })
    .join('')
  const meta = path.join(dir, 'meta.txt')
  fs.writeFileSync(
    meta,
    `;FFMETADATA1\ntitle=${book.title}\nalbum=${book.title}\nartist=${book.author}\nalbum_artist=${book.author}\ndate=${book.year}\ngenre=Science Fiction\n${chapters}`,
  )
  const out = path.join(dir, 'the-time-machine.m4b')
  execFileSync('ffmpeg', [
    ...['-hide_banner', '-loglevel', 'error', '-y'],
    ...['-f', 'lavfi', '-i', `anoisesrc=d=${start / 1000}:c=pink:r=8000:a=0.002`],
    ...['-i', meta, '-i', coverPath],
    ...['-map', '0:a', '-map', '2:v', '-map_metadata', '1', '-map_chapters', '1'],
    ...['-c:a', 'aac', '-b:a', '8k', '-ac', '1', '-c:v', 'copy', '-disposition:v', 'attached_pic'],
    ...['-f', 'mp4', out],
  ])
  return out
}

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${url} never came up`)
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-shots-'))
  const server = spawn('node', ['apps/server/dist/index.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(PORT),
      PAPYRUS_DATA_DIR: path.join(tmp, 'data'),
      PAPYRUS_PUBLIC_DIR: 'apps/web/dist',
      LOG_LEVEL: 'warn',
    },
  })
  let browser: Browser | undefined
  try {
    await waitFor(`${BASE}/api/health`)
    browser = await chromium.launch()
    fs.mkdirSync(OUT, { recursive: true })

    const drawing = await browser.newPage()
    const ctx = await browser.newContext({ ...PHONE, baseURL: BASE })
    const page = await ctx.newPage()
    const api = ctx.request

    const profile = await (
      await api.post('/api/profiles', { data: { name: 'Ada', colour: 'purple' } })
    ).json()
    await api.put('/api/session/profile', { data: { profileId: profile.id } })
    const upload = async (name: string, buffer: Buffer, mimeType: string) =>
      (
        await api.post('/api/uploads', { multipart: { file: { name, mimeType, buffer } } })
      ).json() as Promise<{ bookId: string }>

    // Oldest first, so the library's "recently added" puts the favourites on top.
    const ids = new Map<string, string>()
    for (const book of [...others].reverse().concat(PRIDE)) {
      const { bookId } = await upload(
        `${book.title}.epub`,
        await epub(book, await drawCover(drawing, book)),
        'application/epub+zip',
      )
      ids.set(book.title, bookId)
    }
    const timeMachine = others.find((b) => b.title === 'The Time Machine') as Classic
    const m4b = makeAudiobook(tmp, timeMachine, await drawCover(drawing, timeMachine, true))
    await upload('the-time-machine.m4b', fs.readFileSync(m4b), 'audio/mp4')
    await drawing.close()

    const detail = async (title: string) =>
      (await api.get(`/api/books/${ids.get(title)}`)).json() as Promise<{
        files: { id: string; kind: string }[]
      }>
    const fileOf = async (title: string, kind: string) =>
      (await detail(title)).files.find((f) => f.kind === kind)?.id as string
    const hlc = (ago: number) => `${String(Date.now() - ago).padStart(13, '0')}-0000-screenshots`
    const prideFile = await fileOf('Pride and Prejudice', 'text')
    const audioFile = await fileOf('The Time Machine', 'audio')
    const mobyFile = await fileOf('Moby-Dick', 'text')
    await api.post('/api/sync', {
      data: {
        profileId: profile.id,
        deviceId: 'screenshots',
        cursor: 0,
        changes: [
          {
            kind: 'progress',
            fileId: mobyFile,
            cfi: 'epubcfi(/6/4)',
            fraction: 0.62,
            hlc: hlc(9e7),
          },
          {
            kind: 'progress',
            fileId: prideFile,
            cfi: 'epubcfi(/6/2!/4/2)',
            fraction: 0.04,
            hlc: hlc(3e4),
          },
          {
            kind: 'progress',
            fileId: audioFile,
            cfi: 't:4210',
            fraction: 4210 / 12060,
            hlc: hlc(6e4),
          },
          {
            kind: 'readStatus',
            bookId: ids.get('Frankenstein'),
            status: 'finished',
            hlc: hlc(9e8),
          },
          {
            kind: 'highlight',
            id: crypto.randomUUID(),
            fileId: prideFile,
            cfiRange: 'epubcfi(/6/2!/4/4,/1:0,/1:89)',
            colour: 'yellow',
            text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune',
            note: null,
            deleted: false,
            hlc: hlc(5e4),
          },
        ],
      },
    })

    // The reader: open Pride and Prejudice, which also puts it under "Continue reading".
    await page.goto(`/read/${prideFile}`)
    await page.locator('foliate-view').waitFor()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, 'reader.png') })

    await page.goto('/')
    await page.getByRole('heading', { name: 'Continue reading' }).waitFor()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, 'library.png') })

    // The player, with the mini-player left behind for the Book page.
    await page.goto(`/listen/${audioFile}`)
    await page.getByTestId('elapsed').waitFor()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, 'player.png') })

    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.getByRole('link', { name: 'The Time Machine' }).click()
    await page.getByRole('heading', { name: 'The Time Machine' }).waitFor()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, 'book.png') })

    // Contents and highlights in the reader.
    await page.goto(`/read/${prideFile}`)
    await page.locator('foliate-view').waitFor()
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: 'Notes' }).click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(OUT, 'highlights.png') })

    // Dark mode follows the system.
    const dark = await browser.newContext({ ...PHONE, baseURL: BASE, colorScheme: 'dark' })
    await dark.addCookies(await ctx.cookies())
    const night = await dark.newPage()
    await night.goto('/')
    await night.getByRole('heading', { name: 'Continue reading' }).waitFor()
    await night.waitForLoadState('networkidle')
    await night.waitForTimeout(800)
    await night.screenshot({ path: path.join(OUT, 'library-dark.png') })
    console.log(`Screenshots written to ${path.relative(ROOT, OUT)}`)
  } finally {
    await browser?.close()
    server.kill()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

await main()
