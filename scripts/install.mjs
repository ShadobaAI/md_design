import { cp, lstat, mkdir, mkdtemp, rename, access, readFile } from 'node:fs/promises'
import { resolve, dirname, join, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
const source = fileURLToPath(new URL('../', import.meta.url))
export async function install(destination, replace = false) {
  const target = resolve(destination)
  if (target === resolve(source) || resolve(source).startsWith(target + sep)) throw new Error('Каталог установки содержит исходники')
  const files = ['SKILL.md', 'references', 'scripts/preview.mjs', 'scripts/server.mjs', 'dist', 'prototypes', 'vendor/UPSTREAM.json', 'vendor/md_design/LICENSE.md']
  for (const file of files) await access(join(source, file))
  let existing
  try { existing = await lstat(target) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (existing && (!replace || !existing.isDirectory() || existing.isSymbolicLink())) throw new Error(`Каталог уже существует: ${target}. Для обновления обычного каталога используй --replace; предыдущая версия будет сохранена рядом.`)
  if (existing) {
    const skill = await readFile(join(target, 'SKILL.md'), 'utf8')
    if (!/^name: md-design\s*$/m.test(skill)) throw new Error('В указанном каталоге нет установленного md-design; обновление отменено')
  }
  await mkdir(dirname(target), { recursive: true })
  const stage = await mkdtemp(join(dirname(target), '.md-design-stage-'))
  for (const file of files) {
    await mkdir(dirname(join(stage, file)), { recursive: true })
    await cp(join(source, file), join(stage, file === 'SKILL.md' ? 'SKILL.md.pending' : file), { recursive: true, errorOnExist: true, force: false })
  }
  let backup, backupDisabled = false, activated = false
  try {
    if (existing) {
      const candidate = `${target}.backup-${Date.now()}-${process.pid}`
      await rename(target, candidate)
      backup = candidate
      // Backups inside a skills directory must not register a duplicate skill.
      await rename(join(backup, 'SKILL.md'), join(backup, 'SKILL.md.backup'))
      backupDisabled = true
    }
    await rename(stage, target)
    activated = true
    await rename(join(target, 'SKILL.md.pending'), join(target, 'SKILL.md'))
  } catch (error) {
    if (activated) await rename(target, stage)
    if (backup) {
      if (backupDisabled) await rename(join(backup, 'SKILL.md.backup'), join(backup, 'SKILL.md'))
      await rename(backup, target)
    }
    throw error
  }
  return { installed: target, ...(backup ? { backup } : {}) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { destination: { type: 'string' }, replace: { type: 'boolean' } } })
    console.log(JSON.stringify(await install(values.destination || join(homedir(), '.agents', 'skills', 'md-design'), values.replace)))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
