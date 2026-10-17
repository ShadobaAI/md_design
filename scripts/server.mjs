import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
export const MAX_BYTES = 800_000
export function prototypeFromText(text, name = 'prototype.md') {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('Форма превышает лимит 800 000 байт')
  if (text.length > 200_000) throw new Error('Форма превышает лимит 200 000 символов')
  return { text, name: basename(name) }
}
export async function readText(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    stream.on('data', chunk => {
      const buffer = Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BYTES) {
        chunks.length = 0
        reject(new Error('Форма превышает лимит 800 000 байт'))
      } else chunks.push(buffer)
    })
    stream.once('end', () => {
      if (size > MAX_BYTES) return
      try { resolve(prototypeFromText(Buffer.concat(chunks).toString('utf8')).text) }
      catch (error) { reject(error) }
    })
    stream.once('error', reject)
    stream.once('aborted', () => reject(new Error('Передача формы прервана')))
  })
}
export async function readPrototype(file) {
  if ((await stat(file)).size > MAX_BYTES) throw new Error('Файл превышает лимит 800 000 байт')
  const text = await readFile(file, 'utf8')
  return prototypeFromText(text, basename(file))
}
export async function startServer({ file, source, dist, validate = () => {} }) {
  let current = source ? prototypeFromText(source.text, source.name) : await readPrototype(file)
  validate(current.text)
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
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    const address = server.address()
    const host = `127.0.0.1:${address.port}`
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.writeHead(403).end(); return }
    const path = req.url?.split('?')[0]
    if (!path?.startsWith(prefix)) { res.writeHead(404).end(); return }
    const resource = path.slice(prefix.length) || 'index.html'
    if (req.method === 'PUT' && resource === 'prototype' && !file) {
      if (req.headers['x-md-design-update'] !== '1' || req.headers['content-type'] !== 'text/plain; charset=utf-8') { res.writeHead(403).end(); req.resume(); return }
      try {
        const next = prototypeFromText(await readText(req), current.name)
        validate(next.text)
        current = next
        res.writeHead(204).end()
      } catch (error) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.message) }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: file ? 'GET, HEAD' : 'GET, HEAD, PUT' }).end(); return }
    try {
      let data, type
      if (resource === 'prototype') { data = JSON.stringify(file ? await readPrototype(file) : current); type = 'application/json' }
      else if (assets.has(resource)) ({ data, type } = assets.get(resource))
      else { res.writeHead(404).end(); return }
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не удалось прочитать файл формы') }
  })
  server.requestTimeout = 10000
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` }
}
