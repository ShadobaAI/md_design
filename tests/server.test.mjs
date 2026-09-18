import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, readPrototype } from '../scripts/server.mjs'
import http from 'node:http'
const dist = new URL('../dist/', import.meta.url)
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
