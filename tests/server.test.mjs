import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, readPrototype, prototypeFromText } from '../scripts/server.mjs'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
const dist = process.env.MD_DESIGN_DIST ? pathToFileURL(process.env.MD_DESIGN_DIST.replace(/\\/g, '/') + '/') : new URL('../dist/', import.meta.url)
test('server exposes only the selected file; reload, HEAD, Host/Origin/method and token isolation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'md-design-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'форма с пробелом.md')
  await writeFile(file, '--- Первая ---')
  const { server, url } = await startServer({ file, dist })
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  assert.equal((await fetch(url)).status, 200)
  assert.equal((await (await fetch(url + 'prototype')).json()).text, '--- Первая ---')
  await writeFile(file, '--- Вторая ---')
  assert.equal((await (await fetch(url + 'prototype')).json()).text, '--- Вторая ---')
  for (const path of ['package.json', '../prototype', '%2e%2e/prototype', 'C:/Windows/win.ini']) assert.equal((await fetch(url + path)).status, 404)
  assert.equal((await fetch(new URL('/', url))).status, 404)
  assert.equal((await fetch(url, { method: 'POST' })).status, 405)
  assert.equal((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status, 403)
  const badHost = await new Promise((resolve, reject) => {
    http.get(url, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject)
  })
  assert.equal(badHost, 403)
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(await head.text(), '')
  assert.match(head.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal((await fetch(url + 'playground.js.map')).status, 404)
  assert.equal((await fetch(url + 'parser.mjs.map')).status, 404)
  assert.equal(head.headers.get('access-control-allow-origin'), null)
  await rm(file)
  assert.equal((await fetch(url + 'prototype')).status, 500)
})
test('read limit is enforced', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'md-design-size-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'large.md')
  await writeFile(file, 'x'.repeat(200001))
  await assert.rejects(readPrototype(file), /лимит/)
})

test('memory previews update without a file and reject invalid, oversized or cross-origin writes', async t => {
  const { server, url } = await startServer({ source: { text: 'Первая', name: 'форма.md' }, dist, validate: text => { if (text === 'invalid') throw new Error('Invalid DSL') } })
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'X-MD-Design-Update': '1' }
  assert.deepEqual(await (await fetch(url + 'prototype')).json(), { text: 'Первая', name: 'форма.md' })
  assert.equal((await fetch(url + 'prototype', { method: 'PUT', headers, body: 'Вторая' })).status, 204)
  assert.equal((await (await fetch(url + 'prototype')).json()).text, 'Вторая')
  for (const body of ['invalid', 'x'.repeat(200001), 'x'.repeat(800001)]) {
    assert.equal((await fetch(url + 'prototype', { method: 'PUT', headers, body })).status, 400)
    assert.equal((await (await fetch(url + 'prototype')).json()).text, 'Вторая')
  }
  assert.equal((await fetch(url + 'prototype', { method: 'PUT', body: 'Подмена' })).status, 403)
  assert.equal((await fetch(url + 'prototype', { method: 'PUT', headers: { ...headers, Origin: 'https://evil.example' }, body: 'Подмена' })).status, 403)
  assert.equal((await fetch(url + 'preview.css', { method: 'PUT', headers, body: 'Подмена' })).status, 405)
  assert.equal((await (await fetch(url + 'prototype')).json()).text, 'Вторая')
  assert.throws(() => prototypeFromText('я'.repeat(400001)), /800 000/)
})
