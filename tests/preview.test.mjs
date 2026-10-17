import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const preview = fileURLToPath(new URL('../scripts/preview.mjs', import.meta.url))

test('concurrent background previews select separate free ports outside the checkout', async t => {
  const previews = []
  t.after(() => {
    for (const { pid } of previews) {
      try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  })
  for (const name of ['order', 'counterparty']) {
    const file = fileURLToPath(new URL(`../prototypes/${name}.md`, import.meta.url))
    const result = JSON.parse(execFileSync(process.execPath, [preview, '--file', file, '--background'], {
      cwd: tmpdir(), encoding: 'utf8', timeout: 20000,
    }))
    previews.push(result)
    const address = new URL(result.url)
    assert.equal(address.hostname, '127.0.0.1')
    assert.ok(Number(address.port) > 0)
    assert.equal(result.file, file)
  }
  assert.notEqual(new URL(previews[0].url).port, new URL(previews[1].url).port)
  for (const { url } of previews) assert.equal((await fetch(url)).status, 200)
})

test('stdin starts and updates the same memory preview without writing output files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'md-design-memory-'))
  let running
  t.after(async () => {
    if (running) { try { process.kill(running.pid) } catch (error) { if (error.code !== 'ESRCH') throw error } }
    await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  })
  const result = JSON.parse(execFileSync(process.execPath, [preview, '--stdin', '--name', 'новая.md', '--background'], {
    cwd: directory, input: '--- Первая форма ---\nНомер: 123', encoding: 'utf8', timeout: 20000,
  }))
  running = result
  assert.equal(result.storage, 'memory')
  assert.equal(result.name, 'новая.md')
  assert.equal(result.file, undefined)
  assert.deepEqual(await readdir(directory), [])
  const update = JSON.parse(execFileSync(process.execPath, [preview, '--stdin', '--update', result.url], {
    cwd: directory, input: '--- Вторая форма ---\nНомер: 456', encoding: 'utf8', timeout: 10000,
  }))
  assert.equal(update.url, result.url)
  assert.equal((await (await fetch(result.url + 'prototype')).json()).text, '--- Вторая форма ---\nНомер: 456')
  assert.deepEqual(await readdir(directory), [])
})
