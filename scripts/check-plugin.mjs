import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

// Run against the extracted deliverable, from a directory outside the checkout.
const root = resolve(process.argv[2] || '.build/marketplace/plugins/md-design')
const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'))
assert.equal(manifest.name, 'md-design')
assert.equal(manifest.skills, './skills/')
const skill = await readFile(join(root, 'skills/md-design/SKILL.md'), 'utf8')
assert.match(skill, /^name: md-design$/m)
const referenceRoot = join(root, 'skills/md-design/references')
const documents = [join(root, 'skills/md-design/SKILL.md'), ...(await readdir(referenceRoot)).map(file => join(referenceRoot, file))]
for (const file of documents) {
  const text = await readFile(file, 'utf8')
  for (const link of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(link[1])) continue
    await stat(new URL(link[1], pathToFileURL(file)))
  }
}
const files = await readdir(root)
for (const forbidden of ['node_modules', 'package.json', '.git', 'scripts/install.mjs']) {
  assert.ok(!files.includes(forbidden), `${forbidden} must not ship`)
}
const notices = await readFile(join(root, 'dist/THIRD_PARTY.md'), 'utf8')
assert.match(notices, /chevrotain/)
await stat(join(root, 'vendor/md_design/LICENSE.md'))
const info = JSON.parse(await readFile(join(root, 'build-info.json'), 'utf8'))
assert.equal(info.version, manifest.version)
assert.match(info.revision, /^[a-f0-9]{40}$/)
assert.equal(info.profile, 'release')
assert.ok(!(await readdir(join(root, 'dist'))).some(file => file.endsWith('.map')))
for (const file of await readdir(join(root, 'prototypes'))) {
  const result = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/preview.mjs'), '--file', join(root, 'prototypes', file), '--check'], { cwd: root, encoding: 'utf8' }))
  assert.equal(result.ok, true)
  assert.ok(result.elements > 0)
}
const { startServer } = await import(pathToFileURL(join(root, 'scripts/server.mjs')))
const { server, url } = await startServer({ file: join(root, 'prototypes/showcase.md'), dist: pathToFileURL(join(root, 'dist') + '/') })
try {
  for (const file of ['', 'playground.js', 'preview.css', 'prototype']) {
    const response = await fetch(url + file)
    assert.equal(response.status, 200, file)
    assert.ok((await response.text()).length > 0)
  }
  assert.equal((await fetch(new URL('/', url))).status, 404)
  for (const file of ['playground.js.map', 'parser.mjs.map']) assert.equal((await fetch(url + file)).status, 404)
} finally {
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
console.log(JSON.stringify({ ok: true, plugin: manifest.name, version: manifest.version, profile: info.profile, node: process.version }))
