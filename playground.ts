import { parseForm } from "./parser"
import { alignPreviewFields, renderPreview } from "./preview"
import { restoreState, setupExports, type Prototype } from "./export"
const preview = document.querySelector<HTMLElement>("#preview")!
const errors = document.querySelector<HTMLElement>("#errors")!
let lastText: string | undefined
let source: Prototype | undefined
const embedded = document.getElementById("prototype-source")
setupExports(document.querySelector<HTMLElement>("#exports")!, preview, () => source)
new ResizeObserver(() => alignPreviewFields(preview)).observe(preview)
void document.fonts.ready.then(() => alignPreviewFields(preview))
async function refresh() {
  try {
    let data: Prototype
    if (embedded) data = JSON.parse(embedded.textContent!) as Prototype
    else {
      const response = await fetch("./prototype", { cache: "no-store", signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error(`Загрузка формы: HTTP ${response.status}`)
      data = await response.json() as Prototype
    }
    if (data.text !== lastText) {
      const form = parseForm(data.text)
      const warnings = renderPreview(preview, form)
      if (data.state) restoreState(preview, data.state)
      // Diagnostics are available to Codex without adding chrome to the form.
      preview.dataset.warnings = JSON.stringify(warnings)
      document.title = String(form.getProperty("Заголовок") || data.name)
      lastText = data.text
    }
    source = data
    errors.hidden = true
  } catch (error) {
    preview.replaceChildren()
    lastText = undefined
    source = undefined
    errors.hidden = false
    errors.textContent = error instanceof Error ? error.message : String(error)
  } finally {
    if (!embedded) setTimeout(refresh, 1200)
  }
}
void refresh()
