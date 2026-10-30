// A stand-in for openlibrary.org and covers.openlibrary.org, so e2e runs never need the
// internet. Started by playwright.config.ts; the server is pointed at it through env.
import http from 'node:http'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const DOC = {
  key: '/works/OL1W',
  title: 'Arrakis Notes',
  author_name: ['Test Author'],
  first_publish_year: 1999,
  publisher: ['Desert Press'],
  isbn: ['9780441172719'],
  cover_i: 4242,
  language: ['eng'],
  subject: ['Deserts'],
}

const port = Number(process.argv[2] ?? 18091)
http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const json = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (url.pathname === '/search.json') return json({ docs: [DOC] })
    if (url.pathname === '/works/OL1W.json')
      return json({ description: 'Field notes from the desert planet.' })
    if (
      url.pathname === '/b/id/4242-S.jpg' ||
      url.pathname === '/b/id/4242-M.jpg' ||
      url.pathname === '/b/id/4242-L.jpg'
    ) {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(PNG)
    }
    if (url.pathname === '/health') return json({ ok: true })
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{}')
  })
  .listen(port)
