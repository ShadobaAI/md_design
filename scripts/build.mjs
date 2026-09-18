import { build } from 'esbuild'
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
const common = { bundle: true, absWorkingDir: root, alias: { '@': resolve(root, 'vendor/md_design/lib') }, target: 'es2022', legalComments: 'linked', metafile: true }
await mkdir(resolve(root, 'dist'), { recursive: true })
const browser = await build({ ...common, entryPoints: ['playground.ts'], outfile: 'dist/playground.js', minify: true, format: 'esm' })
const parser = await build({ ...common, entryPoints: ['parser.ts'], outfile: 'dist/parser.mjs', platform: 'node', format: 'esm' })
await copyFile(resolve(root, 'playground.html'), resolve(root, 'dist/index.html'))
await copyFile(resolve(root, 'preview.css'), resolve(root, 'dist/preview.css'))
const packages = new Set()
for (const file of [...Object.keys(browser.metafile.inputs), ...Object.keys(parser.metafile.inputs)]) {
  const match = file.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)
  if (match) packages.add(match[1])
}
let notices = '# Third-party notices\n\nmd_design parser and visual style: MIT, see vendor/md_design/LICENSE.md and vendor/UPSTREAM.json.\n'
for (const name of [...packages].sort()) {
  const directory = resolve(root, 'node_modules', name)
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
  notices += `\n## ${name} ${metadata.version}\n\n`
  const licenses = (await readdir(directory)).filter(file => /^(license|licence|notice)(\.|$)/i.test(file))
  if (!licenses.length) throw new Error(`Missing license for bundled dependency ${name}`)
  for (const license of licenses) notices += (await readFile(resolve(directory, license), 'utf8')) + '\n'
}
await writeFile(resolve(root, 'dist/THIRD_PARTY.md'), notices)
