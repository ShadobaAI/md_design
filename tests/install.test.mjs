import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { install } from '../scripts/install.mjs'
test('installed skill works without checkout, npm or node_modules; update preserves previous version', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'md-design-install-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const target = join(directory, 'md-design')
  await install(target)
  const files = await readdir(target)
  assert.ok(!files.includes('node_modules'))
  assert.ok(!files.includes('package.json'))
  const cli = join(target, 'scripts', 'preview.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [cli, '--check'], { cwd: directory, encoding: 'utf8' }))
  assert.equal(result.ok, true)
  assert.equal(result.title, 'Возможности md_design')
  await writeFile(join(target, 'local-note.txt'), 'preserve')
  await assert.rejects(install(target), /уже существует/)
  const updated = await install(target, true)
  assert.equal(await readFile(join(updated.backup, 'local-note.txt'), 'utf8'), 'preserve')
  assert.ok(!(await readdir(updated.backup)).includes('SKILL.md'))
  assert.ok((await readdir(updated.backup)).includes('SKILL.md.backup'))
  assert.ok((await readFile(join(target, 'dist', 'THIRD_PARTY.md'), 'utf8')).includes('chevrotain'))
})
