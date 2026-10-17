import { afterEach, expect, test, vi } from "vitest"
import { parseForm } from "../parser"
import { renderPreview } from "../preview"
import { captureState, restoreState, setupExports, standaloneHTML } from "../export"
import { toBlob } from "html-to-image"
import { readFileSync } from "node:fs"

vi.mock("html-to-image", () => ({ toBlob: vi.fn() }))
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

function fixture(text = "--- Проверка ---\nНомер: 123") {
  document.body.innerHTML = '<nav id="exports"></nav><main id="preview"></main>'
  const toolbar = document.querySelector<HTMLElement>("nav")!
  const preview = document.querySelector<HTMLElement>("main")!
  renderPreview(preview, parseForm(text))
  const source = { text, name: "форма.md" }
  setupExports(toolbar, preview, () => source)
  return { toolbar, preview, source }
}
function choose(toolbar: HTMLElement, action: string, format: string) {
  toolbar.querySelector<HTMLButtonElement>(`[aria-controls="export-${action}"]`)!.click()
  ;[...toolbar.querySelectorAll<HTMLButtonElement>(`#export-${action} button`)].find(button => button.textContent === format)!.click()
}
async function settled(toolbar: HTMLElement) { await vi.waitFor(() => expect(toolbar.hasAttribute("aria-busy")).toBe(false)) }

test("only user actions generate exports; two labelled icon menus support keyboard and closing", () => {
  const { toolbar } = fixture()
  expect(toBlob).not.toHaveBeenCalled()
  const triggers = toolbar.querySelectorAll<HTMLButtonElement>(".export-trigger")
  expect([...triggers].map(b => b.getAttribute("aria-label"))).toEqual(["Скачать", "Скопировать"])
  expect([...triggers].map(b => b.textContent)).toEqual(["Скачать", "Скопировать"])
  expect(toolbar.querySelectorAll(".export-icon")).toHaveLength(2)
  triggers[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  expect(document.activeElement?.textContent).toBe("HTML")
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  expect(document.activeElement?.textContent).toBe("MD")
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  expect(document.activeElement).toBe(triggers[0])
  expect(triggers[0].getAttribute("aria-expanded")).toBe("false")
  triggers[1].click()
  expect([...toolbar.querySelectorAll("#export-copy button")].map(b => b.textContent)).toEqual(["HTML", "MD", "PNG"])
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
  expect(triggers[1].getAttribute("aria-expanded")).toBe("false")
})

test("standalone HTML embeds escaped source, CSS and runtime, and restores edited controls and cells", async () => {
  const text = "--- Проверка ---\nНомер: 123\n[ ] Флажок\n| Товар |\n| --- |\n| Старый |"
  const { preview, source } = fixture(text)
  preview.querySelector<HTMLInputElement>('.preview-control input')!.value = "456"
  preview.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true
  preview.querySelector<HTMLElement>("td")!.textContent = "Новый"
  const styles = document.createElement("style"); styles.id = "preview-style"; styles.textContent = "body { color: red }"
  const runtime = document.createElement("script"); runtime.id = "preview-runtime"; runtime.type = "text/plain"; runtime.textContent = 'console.log("</script>")'
  document.body.append(styles, runtime)
  const html = await standaloneHTML({ ...source, text: text + '\nОпасное: </script><script>alert(1)</script>' }, preview)
  const doc = new DOMParser().parseFromString(html, "text/html")
  expect(doc.querySelectorAll("script")).toHaveLength(2)
  expect(doc.querySelector("script[src],link[href]")).toBeNull()
  expect(doc.querySelector("#preview-runtime")!.textContent).toContain('<\\/script>')
  expect(doc.querySelector("#preview-style")!.textContent).toBe(styles.textContent)
  const data = JSON.parse(doc.querySelector("#prototype-source")!.textContent!)
  expect(data.text).toContain("</script><script>alert(1)</script>")
  renderPreview(preview, parseForm(text))
  restoreState(preview, data.state)
  expect(preview.querySelector<HTMLInputElement>('.preview-control input')!.value).toBe("456")
  expect(preview.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
  expect(preview.querySelector("td")!.textContent).toBe("Новый")
})

test("state includes active tabs, open details and multiline values", () => {
  const { preview } = fixture()
  preview.innerHTML = '<details><summary>Группа</summary><textarea></textarea></details><button role="tab" aria-selected="true"></button>'
  preview.querySelector("details")!.open = true
  preview.querySelector("textarea")!.value = "две\nстроки"
  const selected = vi.fn()
  preview.querySelector("button")!.addEventListener("click", selected)
  const state = captureState(preview)
  preview.querySelector("details")!.open = false
  preview.querySelector("textarea")!.value = ""
  restoreState(preview, state)
  expect(preview.querySelector("details")!.open).toBe(true)
  expect(preview.querySelector("textarea")!.value).toBe("две\nстроки")
  expect(selected).toHaveBeenCalledOnce()
})

test("exported HTML boots its bundled runtime from embedded source without server requests", async () => {
  const { preview, source } = fixture()
  preview.querySelector<HTMLInputElement>("input")!.value = "789"
  for (const [id, path, tag] of [["preview-style", "dist/preview.css", "style"], ["preview-runtime", "dist/playground.js", "script"]] as const) {
    const asset = document.createElement(tag)
    asset.id = id
    if (asset instanceof HTMLScriptElement) asset.type = "text/plain"
    asset.textContent = readFileSync(path, "utf8")
    document.body.append(asset)
  }
  const html = await standaloneHTML(source, preview)
  const parsed = new DOMParser().parseFromString(html, "text/html")
  const runtime = parsed.querySelector("#preview-runtime")!.textContent!
  document.body.innerHTML = parsed.body.innerHTML
  const fetch = vi.fn(() => { throw new Error("No preview server") })
  vi.stubGlobal("fetch", fetch)
  vi.stubGlobal("ResizeObserver", class { observe() {} })
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } })
  new Function(runtime)()
  await Promise.resolve()
  expect(document.querySelector("#preview h1")!.textContent).toBe("Проверка")
  expect(document.querySelector<HTMLInputElement>("#preview input")!.value).toBe("789")
  expect(document.querySelectorAll(".export-trigger")).toHaveLength(2)
  expect(fetch).not.toHaveBeenCalled()
})

test("MD copies source, PNG copies an image with activation preserved, denial is reported", async () => {
  const { toolbar, preview, source } = fixture("--- Проверка ---\nНомер: 123\n[x] Проверено")
  const write = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("navigator", { clipboard: { write } })
  class Item { constructor(public data: Record<string, Promise<Blob>>) {} }
  vi.stubGlobal("ClipboardItem", Item)
  choose(toolbar, "copy", "MD")
  expect(write).toHaveBeenCalledOnce()
  await settled(toolbar)
  expect(write.mock.calls[0][0][0].data["text/plain"]).toBeInstanceOf(Promise)
  expect(source.text).toContain("Номер: 123")
  const image = new Blob(["png"], { type: "image/png" })
  const check = preview.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  expect(check.hasAttribute("checked")).toBe(false)
  vi.mocked(toBlob).mockImplementation(async () => { expect(check.hasAttribute("checked")).toBe(true); return image })
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } })
  choose(toolbar, "copy", "PNG")
  expect(write).toHaveBeenCalledTimes(2)
  await settled(toolbar)
  expect(toBlob).toHaveBeenLastCalledWith(preview, expect.objectContaining({ pixelRatio: 2 }))
  expect(await write.mock.calls[1][0][0].data["image/png"]).toBe(image)
  expect(check.hasAttribute("checked")).toBe(false)
  expect(check.checked).toBe(true)
  write.mockRejectedValueOnce(new Error("Доступ запрещён"))
  choose(toolbar, "copy", "MD")
  await settled(toolbar)
  expect(toolbar.textContent).toContain("Не удалось скопировать: Доступ запрещён")
})

test("downloads use the selected extension and release object URLs", async () => {
  vi.useFakeTimers()
  const { toolbar } = fixture()
  const create = vi.fn().mockReturnValue("blob:export")
  const revoke = vi.fn()
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke })
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("форма.md") })
  choose(toolbar, "download", "MD")
  await vi.advanceTimersByTimeAsync(0)
  expect(click).toHaveBeenCalledOnce()
  expect(create).toHaveBeenCalledOnce()
  expect(document.querySelector("a[download]")).toBeNull()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(revoke).toHaveBeenCalledWith("blob:export")
})
