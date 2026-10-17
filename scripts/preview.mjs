import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readPrototype, startServer } from './server.mjs'
import { loadSettings } from './settings.mjs'
const root = new URL('../', import.meta.url)
let port
try {
  const { values } = parseArgs({ options: {
    file: { type: 'string' }, port: { type: 'string' },
    background: { type: 'boolean' }, check: { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log('node preview.mjs --file <form.md> [--background] [--port <number>]\nnode preview.mjs --file <form.md> --check\nDefault port: 18765. Settings: $CODEX_HOME/md-design/config.json (or ~/.codex/md-design/config.json). --port 0 selects a free port.')
  } else {
    const file = values.file ? resolve(values.file) : fileURLToPath(new URL('prototypes/showcase.md', root))
    const { parseForm } = await import(new URL('dist/parser.mjs', root))
    const input = await readPrototype(file)
    const form = parseForm(input.text)
    if (values.check) console.log(JSON.stringify({ ok: true, title: form.getProperty('Заголовок'), elements: form.getAllElements().length }))
    else {
      port = (await loadSettings({ port: values.port })).port
      if (values.background) {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--file', file, '--port', String(port)], { detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
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
        const { server, url } = await startServer({ file, dist: new URL('dist/', root), port })
        const ready = { url, pid: process.pid, file }
        if (process.send) process.send(ready)
        else console.log(JSON.stringify(ready))
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
      }
    }
  }
} catch (error) {
  const message = error.code === 'EADDRINUSE' ? `Порт ${port} уже занят. Выбери другой port в настройках плагина или передай --port <номер>.` : error.message
  if (process.send) process.send({ error: message })
  else console.error(message)
  process.exitCode = 1
}
