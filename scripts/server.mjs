import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
export const MAX_BYTES = 800_000
export async function readPrototype(file) {
  if ((await stat(file)).size > MAX_BYTES) throw new Error('Файл превышает лимит 800 000 байт')
  const text = await readFile(file, 'utf8')
  if (text.length > 200_000) throw new Error('Файл превышает лимит 200 000 символов')
  return { text, name: basename(file) }
}
export async function startServer({ file, dist, port = 0 }) {
  await readPrototype(file)
  const assets = new Map()
  for (const [name, type] of [['index.html', 'text/html'], ['playground.js', 'text/javascript'], ['preview.css', 'text/css']]) {
    assets.set(name, { data: await readFile(new URL(name, dist)), type })
  }
  const token = randomBytes(24).toString('hex')
  const prefix = `/${token}/`
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    const address = server.address()
    const host = `127.0.0.1:${address.port}`
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.writeHead(403).end(); return }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return }
    const path = req.url?.split('?')[0]
    if (!path?.startsWith(prefix)) { res.writeHead(404).end(); return }
    const resource = path.slice(prefix.length) || 'index.html'
    try {
      let data, type
      if (resource === 'prototype') { data = JSON.stringify(await readPrototype(file)); type = 'application/json' }
      else if (assets.has(resource)) ({ data, type } = assets.get(resource))
      else { res.writeHead(404).end(); return }
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не удалось прочитать файл формы') }
  })
  server.requestTimeout = 10000
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` }
}
