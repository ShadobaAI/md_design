import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readPrototype, readText, prototypeFromText, startServer } from './server.mjs'
const root = new URL('../', import.meta.url)
try {
  const { values } = parseArgs({ options: {
    file: { type: 'string' },
    stdin: { type: 'boolean' }, name: { type: 'string' }, update: { type: 'string' },
    background: { type: 'boolean' }, check: { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log('node preview.mjs --stdin [--name <name>] [--background | --check]\nnode preview.mjs --stdin --update <preview-url>\nnode preview.mjs --file <form.md> [--background | --check]\nThe OS selects a free port for each preview. Standard input stays in memory; no prototype files are written.')
  } else {
    if (values.file && values.stdin) throw new Error('Выбери --file или --stdin')
    if (values.update && (!values.stdin || values.background || values.check)) throw new Error('--update требует --stdin и не совмещается с --background/--check')
    const file = values.stdin ? undefined : values.file ? resolve(values.file) : fileURLToPath(new URL('prototypes/showcase.md', root))
    const { parseForm } = await import(new URL('dist/parser.mjs', root))
    const input = values.stdin ? prototypeFromText(await readText(process.stdin), values.name) : await readPrototype(file)
    const form = parseForm(input.text)
    if (values.update) {
      const url = new URL(values.update)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || !/^\/[a-f0-9]{48}\/$/.test(url.pathname) || url.search || url.hash) throw new Error('Нужен полный URL локального предпросмотра')
      const response = await fetch(new URL('prototype', url), { method: 'PUT', redirect: 'error', headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-MD-Design-Update': '1' }, body: input.text, signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error(`Обновление формы: HTTP ${response.status} ${await response.text()}`)
      console.log(JSON.stringify({ ok: true, url: url.href }))
    } else if (values.check) console.log(JSON.stringify({ ok: true, title: form.getProperty('Заголовок'), elements: form.getAllElements().length }))
    else {
      if (values.background) {
        const args = file ? ['--file', file] : ['--stdin', '--name', input.name]
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { detached: true, windowsHide: true, stdio: [file ? 'ignore' : 'pipe', 'ignore', 'ignore', 'ipc'] })
        if (!file) { child.stdin.on('error', () => {}); child.stdin.end(input.text) }
        let responded = false
        const timer = setTimeout(() => { child.kill(); console.error('Сервер не запустился за 15 секунд'); process.exitCode = 1 }, 15000)
        child.once('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1 })
        child.once('exit', code => { clearTimeout(timer); if (code && !responded) { console.error(`Сервер завершился с кодом ${code}`); process.exitCode = 1 } })
        child.once('message', data => {
          responded = true
          clearTimeout(timer)
          if (data.error) { console.error(data.error); process.exitCode = 1 }
          else console.log(JSON.stringify(data))
          child.disconnect(); child.unref()
        })
      } else {
        const { server, url } = await startServer({ file, source: file ? undefined : input, dist: new URL('dist/', root), validate: parseForm })
        const ready = { url, pid: process.pid, ...(file ? { file } : { name: input.name, storage: 'memory' }) }
        if (process.send) process.send(ready)
        else console.log(JSON.stringify(ready))
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
      }
    }
  }
} catch (error) {
  if (process.send) process.send({ error: error.message })
  else console.error(error.message)
  process.exitCode = 1
}
