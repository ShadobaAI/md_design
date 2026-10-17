import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

async function readSettings(file, optional = false) {
  let text
  try { text = await readFile(file, 'utf8') }
  catch (error) { if (optional && error.code === 'ENOENT') return {}; throw error }
  let settings
  try { settings = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { throw new Error(`Некорректный JSON настроек: ${file}`) }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some(key => key !== 'port')) {
    throw new Error(`Настройки должны содержать объект с параметром port: ${file}`)
  }
  if ('port' in settings && (!Number.isInteger(settings.port) || settings.port < 0 || settings.port > 65535)) {
    throw new Error(`Параметр port должен быть целым числом от 0 до 65535: ${file}`)
  }
  return settings
}

export async function loadSettings({ port, codexHome = process.env.CODEX_HOME || join(homedir(), '.codex') } = {}) {
  const defaults = await readSettings(new URL('../settings.json', import.meta.url))
  const settings = await readSettings(join(codexHome, 'md-design', 'config.json'), true)
  const selected = port === undefined ? settings.port ?? defaults.port : /^\d+$/.test(port) ? Number(port) : NaN
  if (!Number.isInteger(selected) || selected < 0 || selected > 65535) throw new Error('Порт должен быть целым числом от 0 до 65535')
  return { port: selected }
}
