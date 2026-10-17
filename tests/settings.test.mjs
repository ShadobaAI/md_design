import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { loadSettings } from '../scripts/settings.mjs'

async function fixture(t) {
  const codexHome = await mkdtemp(join(tmpdir(), 'md-design-settings-'))
  t.after(() => rm(codexHome, { recursive: true, force: true }))
  await mkdir(join(codexHome, 'md-design'))
  return { codexHome, config: join(codexHome, 'md-design/config.json') }
}

test('default port, persistent user settings and one-launch override', async t => {
  const { codexHome, config } = await fixture(t)
  assert.equal((await loadSettings({ codexHome })).port, 18765)
  await writeFile(config, '\uFEFF' + JSON.stringify({ port: 19765 }))
  assert.equal((await loadSettings({ codexHome })).port, 19765)
  assert.equal((await loadSettings({ codexHome, port: '20765' })).port, 20765)
  assert.equal((await loadSettings({ codexHome, port: '0' })).port, 0)
  assert.equal(JSON.parse((await readFile(config, 'utf8')).replace(/^\uFEFF/, '')).port, 19765)
})

test('invalid settings and invalid port overrides return actionable errors', async t => {
  const { codexHome, config } = await fixture(t)
  for (const content of ['{', 'null', '[]', '{"port":"19765"}', '{"port":-1}', '{"port":65536}', '{"port":1.5}', '{"prot":19765}']) {
    await writeFile(config, content)
    await assert.rejects(loadSettings({ codexHome }), /настроек|Настройки|Параметр port/)
  }
  await writeFile(config, '{}')
  for (const port of ['', '-1', '1.5', '65536', 'NaN']) await assert.rejects(loadSettings({ codexHome, port }), /Порт/)
})

const preview = fileURLToPath(new URL('../scripts/preview.mjs', import.meta.url))
const file = fileURLToPath(new URL('../prototypes/order.md', import.meta.url))

test('background preview reads settings from CODEX_HOME outside the plugin checkout', async t => {
  const { codexHome, config } = await fixture(t)
  await writeFile(config, JSON.stringify({ port: 0 }))
  const result = JSON.parse(execFileSync(process.execPath, [preview, '--file', file, '--background'], {
    cwd: tmpdir(), env: { ...process.env, CODEX_HOME: codexHome }, encoding: 'utf8', timeout: 20000,
  }))
  t.after(() => { try { process.kill(result.pid) } catch (error) { if (error.code !== 'ESRCH') throw error } })
  assert.equal(new URL(result.url).hostname, '127.0.0.1')
  assert.equal(result.file, file)
  const response = await fetch(result.url)
  assert.equal(response.status, 200)
})

test('occupied port fails with the same actionable message in foreground and background', async t => {
  const { codexHome } = await fixture(t)
  const listener = createServer()
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise(resolve => listener.close(resolve)))
  const port = listener.address().port
  for (const extra of [[], ['--background']]) {
    const result = spawnSync(process.execPath, [preview, '--file', file, '--port', String(port), ...extra], {
      cwd: codexHome, env: { ...process.env, CODEX_HOME: codexHome }, encoding: 'utf8', timeout: 20000,
    })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, new RegExp(`Порт ${port} уже занят`))
    assert.match(result.stderr, /--port/)
    assert.equal(result.stdout, '')
  }
})
