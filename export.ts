import { toBlob } from "html-to-image"

export type Prototype = { text: string; name: string; state?: PreviewState[] }
export type PreviewState = { index: number; value?: string; checked?: boolean; text?: string; open?: boolean; selected?: boolean }
type Format = "html" | "md" | "png"

// Indexes are local to a render of the same source, so exported HTML can recreate listeners.
export function captureState(preview: HTMLElement): PreviewState[] {
  return [...preview.querySelectorAll<HTMLElement>("*")].flatMap<PreviewState>((element, index) => {
    if (element instanceof HTMLInputElement) return [{ index, value: element.value, checked: element.checked }]
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return [{ index, value: element.value }]
    if (element instanceof HTMLDetailsElement) return [{ index, open: element.open }]
    if (element.matches('[role="tab"][aria-selected="true"]')) return [{ index, selected: true }]
    if (element.matches('[contenteditable="plaintext-only"]') && !element.children.length) return [{ index, text: element.textContent ?? "" }]
    return []
  })
}

export function restoreState(preview: HTMLElement, state: PreviewState[]): void {
  const elements = preview.querySelectorAll<HTMLElement>("*")
  for (const saved of state) {
    const element = elements[saved.index]
    if (!element) continue
    if (saved.selected && element.matches('[role="tab"]')) element.click()
    if (element instanceof HTMLDetailsElement && saved.open !== undefined) element.open = saved.open
    if (element instanceof HTMLInputElement) {
      if (saved.value !== undefined) element.value = saved.value
      if (saved.checked !== undefined) element.checked = saved.checked
      if (element.type === "color") element.dispatchEvent(new Event("input"))
    } else if ((element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && saved.value !== undefined) element.value = saved.value
    if (saved.text !== undefined && element.matches('[contenteditable="plaintext-only"]') && !element.children.length) element.textContent = saved.text
  }
}

async function asset(id: string, url: string): Promise<string> {
  const inline = document.getElementById(id)
  if (inline) return inline.textContent ?? ""
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Экспорт: HTTP ${response.status}`)
  return response.text()
}

export async function standaloneHTML(source: Prototype, preview: HTMLElement): Promise<string> {
  const data = JSON.stringify({ ...source, state: captureState(preview) }).replace(/</g, "\\u003c")
  const title = document.title.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
  const [css, runtime] = await Promise.all([asset("preview-style", "./preview.css"), asset("preview-runtime", "./playground.js")])
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style id="preview-style">${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>
<nav id="exports" aria-label="Экспорт макета"></nav><main id="preview" aria-label="Форма"></main>
<p id="errors" role="alert" hidden></p>
<script id="prototype-source" type="application/json">${data}</script>
<script id="preview-runtime" type="module">${runtime.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}

async function exportBlob(format: Format, source: Prototype, preview: HTMLElement): Promise<Blob> {
  if (format === "md") return new Blob([source.text], { type: "text/plain" })
  if (format === "html") return new Blob([await standaloneHTML(source, preview)], { type: "text/plain" })
  await document.fonts.ready
  // SVG serialization needs checked attributes, while live controls store their
  // state in properties. Restore the original attributes after the capture.
  const checks = [...preview.querySelectorAll<HTMLInputElement>('input[type="checkbox"],input[type="radio"]')].map(input => ({ input, attribute: input.getAttribute("checked") }))
  for (const { input } of checks) {
    input.checked = input.checked
    input.toggleAttribute("checked", input.checked)
  }
  try {
    const blob = await toBlob(preview, { backgroundColor: "#ffffff", pixelRatio: 2, skipFonts: true })
    if (!blob) throw new Error("Не удалось создать PNG")
    return blob
  } finally {
    for (const { input, attribute } of checks) {
      if (attribute === null) input.removeAttribute("checked")
      else input.setAttribute("checked", attribute)
    }
  }
}

const icons = {
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
}

export function setupExports(toolbar: HTMLElement, preview: HTMLElement, getSource: () => Prototype | undefined): void {
  const status = document.createElement("span")
  status.className = "export-status"
  status.setAttribute("role", "status")
  let busy = false
  const close = (focus = false) => {
    toolbar.querySelectorAll<HTMLButtonElement>(".export-trigger").forEach(trigger => {
      const popup = document.getElementById(trigger.getAttribute("aria-controls")!)!
      if (!popup.hidden && focus) trigger.focus()
      popup.hidden = true
      trigger.setAttribute("aria-expanded", "false")
    })
  }
  for (const [action, label] of [["download", "Скачать"], ["copy", "Скопировать"]] as const) {
    const menu = document.createElement("div")
    menu.className = "export-menu"
    const trigger = document.createElement("button")
    trigger.type = "button"
    trigger.className = "export-trigger"
    trigger.title = label
    trigger.setAttribute("aria-label", label)
    trigger.setAttribute("aria-haspopup", "menu")
    trigger.setAttribute("aria-expanded", "false")
    trigger.setAttribute("aria-controls", `export-${action}`)
    trigger.innerHTML = `<svg class="export-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[action]}</svg><span>${label}</span><svg class="export-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>`
    const popup = document.createElement("div")
    popup.id = `export-${action}`
    popup.className = "export-popup"
    popup.hidden = true
    popup.setAttribute("role", "menu")
    popup.setAttribute("aria-label", `${label} в формате`)
    const open = () => { close(); popup.hidden = false; trigger.setAttribute("aria-expanded", "true"); popup.querySelector<HTMLButtonElement>("button")!.focus() }
    trigger.addEventListener("click", () => { if (popup.hidden) open(); else close(true) })
    trigger.addEventListener("keydown", event => { if (event.key === "ArrowDown") { event.preventDefault(); open() } })
    for (const format of ["html", "md", "png"] as const) {
      const item = document.createElement("button")
      item.type = "button"
      item.textContent = format.toUpperCase()
      item.setAttribute("role", "menuitem")
      item.addEventListener("click", () => {
        if (busy) return
        close(true)
        const source = getSource()
        if (!source || preview.hidden) { status.textContent = "Нет формы для экспорта"; return }
        busy = true
        toolbar.setAttribute("aria-busy", "true")
        status.textContent = "Подготовка…"
        // Start the clipboard write in the click handler, keeping the user's activation
        // while PNG rendering or HTML asset loading completes asynchronously.
        const run = async () => {
          if (action === "copy" && !navigator.clipboard) throw new Error("Браузер не поддерживает буфер обмена")
          if (action === "copy" && format === "png" && (typeof ClipboardItem === "undefined" || !navigator.clipboard.write)) throw new Error("Браузер не поддерживает копирование PNG")
          const blob = exportBlob(format, source, preview)
          void blob.catch(() => {})
          if (action === "copy") {
            if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
              await navigator.clipboard.write([new ClipboardItem({ [format === "png" ? "image/png" : "text/plain"]: blob })])
            } else {
              if (format === "png") { await blob; throw new Error("Браузер не поддерживает копирование PNG") }
              await navigator.clipboard.writeText(await (await blob).text())
            }
          } else {
            const file = await blob
            const url = URL.createObjectURL(format === "html" ? new Blob([file], { type: "text/html;charset=utf-8" }) : file)
            const link = document.createElement("a")
            link.href = url
            link.download = `${source.name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "prototype"}.${format}`
            document.body.append(link)
            link.click()
            link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
          }
          status.textContent = `${format.toUpperCase()}: ${action === "copy" ? "скопировано" : "скачано"}`
        }
        void run().catch(error => { status.textContent = `Не удалось ${action === "copy" ? "скопировать" : "скачать"}: ${error instanceof Error ? error.message : String(error)}` }).finally(() => {
          busy = false
          toolbar.removeAttribute("aria-busy")
        })
      })
      popup.append(item)
    }
    popup.addEventListener("keydown", event => {
      const items = [...popup.querySelectorAll<HTMLButtonElement>("button")]
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index + items.length - 1) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1
      if (next >= 0) { event.preventDefault(); items[next].focus() }
    })
    menu.append(trigger, popup)
    toolbar.append(menu)
  }
  toolbar.append(status)
  document.addEventListener("pointerdown", event => { if (!toolbar.contains(event.target as Node)) close() })
  toolbar.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); close(true) } })
  toolbar.addEventListener("focusout", event => { if (!toolbar.contains(event.relatedTarget as Node | null)) close() })
}
