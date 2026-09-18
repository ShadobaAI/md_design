import { parseForm } from "./parser"
import { renderPreview } from "./preview"
const preview = document.querySelector<HTMLElement>("#preview")!
const errors = document.querySelector<HTMLElement>("#errors")!
let lastText: string | undefined
async function refresh() {
  try {
    const response = await fetch("./prototype", { cache: "no-store", signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Загрузка формы: HTTP ${response.status}`)
    const data = await response.json() as { text: string; name: string }
    if (data.text !== lastText) {
      const form = parseForm(data.text)
      const warnings = renderPreview(preview, form)
      // Diagnostics are available to Codex without adding chrome to the form.
      preview.dataset.warnings = JSON.stringify(warnings)
      document.title = String(form.getProperty("Заголовок") || data.name)
      lastText = data.text
    }
    errors.hidden = true
  } catch (error) {
    preview.replaceChildren()
    lastText = undefined
    errors.hidden = false
    errors.textContent = error instanceof Error ? error.message : String(error)
  } finally {
    setTimeout(refresh, 1200)
  }
}
void refresh()
