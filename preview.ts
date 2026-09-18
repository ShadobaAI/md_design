import { BaseElement, FormElement, InputElement, CommandBarElement, ButtonElement, ButtonGroupElement, OneLineGroupElement, TableElement, TableColumnGroupElement, TableColumnElement, TableRowElement, CheckboxElement, RadioButtonElement, LabelElement, HorizontalGroupElement, VerticalGroupElement, PagesElement, PageElement } from "@/elements"

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  return element
}
const caption = (e: BaseElement): string => String(e.getProperty("Заголовок") ?? "")
const booleanProperty = (e: BaseElement, key: string): boolean | undefined => {
  const value = e.getProperty(key)
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (["истина", "true"].includes(value.toLowerCase())) return true
    if (["ложь", "false"].includes(value.toLowerCase())) return false
  }
  return undefined
}
const colors: Record<string, string> = {
  "бордовый": "#b65b6a", "голубой": "#acd0d8", "ярко-зелёный": "#9ddd89",
  "зелёный": "#b7d9a8", "желтый": "#ffe289", "жёлтый": "#ffe289", "красный": "#e9a6a6",
  "серый": "#888888", "светло-серый": "#f0f0f0", "коралловый": "#ff7f50", "зеленый": "#008000",
}
function colorValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return /^#[0-9a-f]{6}$/i.test(value) ? value : colors[value.toLowerCase()]
}
function applyColors(e: BaseElement, result: HTMLElement, warnings: Set<string>) {
  for (const [property, css] of [["ЦветТекста", "color"], ["ЦветФона", "backgroundColor"]] as const) {
    const value = e.getProperty(property)
    if (value === undefined) continue
    const color = colorValue(value)
    if (color) { result.style[css] = color; if (css === "backgroundColor") result.style.backgroundImage = "none" }
    else warnings.add(`Цвет «${String(value)}» в свойстве ${property} не поддерживается; используй #RRGGBB`)
  }
}
let sequence = 0
// One delegated listener survives rerenders without accumulating per-menu listeners.
document.addEventListener("pointerdown", event => {
  for (const menu of document.querySelectorAll(".preview-menu")) {
    if (!menu.contains(event.target as Node)) menu.dispatchEvent(new Event("close-menu"))
  }
})

/** Local interactions are disposable; Markdown is the source of truth. */
export function renderPreview(container: HTMLElement, form: FormElement | undefined): string[] {
  const warnings = new Set<string>()
  const fragment = document.createDocumentFragment()
  if (form) {
    fragment.append(node("h1", "preview-title", caption(form) || "Новая форма"))
    for (const item of form.items) fragment.append(renderElement(item, warnings))
  }
  container.replaceChildren(fragment)
  return [...warnings]
}

function renderElement(e: BaseElement, warnings: Set<string>): HTMLElement {
  const result = renderContent(e, warnings)
  result.hidden = booleanProperty(e, "Видимость") === false
  if (booleanProperty(e, "Доступность") === false) {
    result.setAttribute("inert", "")
    result.classList.add("preview-disabled")
    if (result instanceof HTMLButtonElement) result.disabled = true
    result.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>("input,button,textarea").forEach(c => c.disabled = true)
  }
  if (booleanProperty(e, "ТолькоПросмотр") === true) {
    result.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea").forEach(c => {
      if (c instanceof HTMLInputElement && ["checkbox", "radio", "color"].includes(c.type)) c.disabled = true
      else c.readOnly = true
    })
    result.querySelectorAll<HTMLButtonElement>(".preview-adornment").forEach(c => c.disabled = true)
    result.querySelectorAll<HTMLElement>("[contenteditable]").forEach(c => c.setAttribute("contenteditable", "false"))
  }
  applyColors(e, result, warnings)
  const alignment = e.alignment
  if (alignment === "Центр") result.style.textAlign = "center"
  if (alignment === "Право") result.style.textAlign = "right"
  // Never inject arbitrary CSS/HTML or silently pretend to support platform properties.
  const supported = new Set(["Заголовок", "Имя", "Видимость", "Доступность", "ТолькоПросмотр", "Тип", "ГоризонтальноеПоложениеВГруппе", "ГоризонтальноеПоложение", "МногострочныйРежим", "Высота", "КнопкаВыбора", "КнопкаВыпадающегоСписка", "КнопкаОчистки", "КнопкаОткрытия", "КнопкаРегулирования", "СписокВыбора", "Отображение", "Поведение", "КнопкаПоУмолчанию", "ПоложениеЗаголовка", "ЦветТекста", "ЦветФона", "ВидФлажка", "ВидПереключателя"])
  for (const key of e.properties.keys()) if (!supported.has(key)) warnings.add(`«${caption(e) || e.type}»: свойство «${key}» не визуализируется`)
  return result
}

function renderContent(e: BaseElement, warnings: Set<string>): HTMLElement {
  if (e instanceof PagesElement) {
    const root = node("div", "preview-pages")
    const tabs = node("div", "preview-tabs")
    tabs.setAttribute("role", "tablist")
    tabs.setAttribute("aria-label", caption(e) || "Страницы формы")
    root.append(tabs)
    const pages = e.items.filter(p => booleanProperty(p, "Видимость") !== false)
    const buttons: HTMLButtonElement[] = []
    const panels: HTMLElement[] = []
    const select = (index: number) => {
      buttons.forEach((b, i) => { b.setAttribute("aria-selected", String(i === index)); b.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index })
    }
    pages.forEach((p, i) => {
      const id = `page-${++sequence}`
      const b = node("button", "preview-tab", caption(p) || `Страница ${i + 1}`)
      b.type = "button"; b.id = `${id}-tab`; b.setAttribute("role", "tab"); b.setAttribute("aria-controls", id)
      b.addEventListener("click", () => select(i))
      b.addEventListener("keydown", event => {
        const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
        const next = offset ? (i + offset + pages.length) % pages.length : event.key === "Home" ? 0 : event.key === "End" ? pages.length - 1 : -1
        if (next >= 0) { event.preventDefault(); select(next); buttons[next].focus() }
      })
      const panel = renderElement(p, warnings)
      panel.id = id; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", b.id)
      buttons.push(b); panels.push(panel); tabs.append(b); root.append(panel)
    })
    select(0)
    return root
  }
  if (e instanceof VerticalGroupElement || e instanceof PageElement) {
    const collapsible = e.getProperty("Поведение") === "Свертываемая" || e.getProperty("Поведение") === "Всплывающая"
    const group = node(collapsible ? "details" : "section", "preview-group")
    const display = e.getProperty("Отображение")
    if (display === "СлабоеВыделение") group.classList.add("group-weak")
    if (display === "ОбычноеВыделение") group.classList.add("group-normal")
    if (display === "СильноеВыделение") group.classList.add("group-strong")
    if (collapsible) {
      group.append(node("summary", "", caption(e) || "Группа"))
      if (e.getProperty("Поведение") === "Всплывающая") warnings.add(`«${caption(e)}»: всплывающая группа показана раскрываемой секцией`)
    } else if (caption(e) && !(e instanceof PageElement)) group.append(node("h2", "", caption(e)))
    for (const item of e.items) group.append(renderElement(item, warnings))
    return group
  }
  if (e instanceof CommandBarElement || e instanceof OneLineGroupElement || e instanceof HorizontalGroupElement || e instanceof ButtonGroupElement) {
    const group = node("div", e instanceof CommandBarElement || e instanceof ButtonGroupElement ? "preview-commands" : "preview-row")
    for (const item of e.items) group.append(renderElement(item, warnings))
    return group
  }
  if (e instanceof ButtonElement) {
    if (e.type === "Подменю") {
      const menu = node("div", "preview-menu")
      const trigger = node("button", "preview-button preview-menu-trigger", caption(e))
      trigger.type = "button"
      trigger.setAttribute("aria-haspopup", "menu")
      trigger.setAttribute("aria-expanded", "false")
      const popup = node("div", "preview-popup")
      popup.id = `menu-${++sequence}`
      popup.setAttribute("role", "menu")
      popup.setAttribute("aria-label", caption(e))
      trigger.setAttribute("aria-controls", popup.id)
      popup.hidden = true
      for (const item of e.items) popup.append(renderElement(item, warnings))
      const items = () => [...popup.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.closest('[role="menu"]') === popup && !button.disabled)
      items().forEach(button => { button.setAttribute("role", "menuitem"); button.tabIndex = -1 })
      const close = (restoreFocus = false) => {
        popup.hidden = true
        trigger.setAttribute("aria-expanded", "false")
        if (restoreFocus) trigger.focus()
      }
      const open = (last = false) => {
        popup.hidden = false
        trigger.setAttribute("aria-expanded", "true")
        const options = items()
        options[last ? options.length - 1 : 0]?.focus()
      }
      trigger.addEventListener("click", () => popup.hidden ? open() : close(true))
      trigger.addEventListener("keydown", event => {
        if (["ArrowDown", "ArrowUp", "ArrowRight"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation(); open(event.key === "ArrowUp")
        }
      })
      popup.addEventListener("keydown", event => {
        if (event.key === "Escape" || event.key === "ArrowLeft") {
          event.preventDefault(); event.stopPropagation(); close(true); return
        }
        if (event.key === "Tab") { close(true); return }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const options = items()
        const current = options.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length
        options[next]?.focus()
      })
      menu.addEventListener("close-menu", () => close())
      menu.addEventListener("prototype-command", () => close(true))
      menu.addEventListener("focusout", event => { if (!menu.contains(event.relatedTarget as Node | null)) close() })
      menu.append(trigger, popup)
      return menu
    }
    const button = node("button", "preview-button", caption(e))
    button.type = "button"
    if (booleanProperty(e, "КнопкаПоУмолчанию") === true) button.classList.add("primary")
    button.title = "Команда макета — без выполнения в 1С"
    const picture = e.getProperty("Картинка")
    if (picture) {
      const icon = node("span", "preview-icon-placeholder", "◇")
      icon.title = `Картинка ${String(picture)} (условное обозначение)`
      icon.setAttribute("aria-hidden", "true")
      if (e.getProperty("ПоложениеКартинки") === "Право") button.append(icon)
      else button.prepend(icon)
    }
    button.addEventListener("click", () => button.dispatchEvent(new CustomEvent("prototype-command", { bubbles: true, detail: caption(e) })))
    return button
  }
  if (e instanceof CheckboxElement) {
    const label = node("label", "preview-check")
    const input = node("input"); input.type = "checkbox"; input.checked = e.value
    if (e.getProperty("ВидФлажка") === "Выключатель") { input.className = "preview-switch"; input.setAttribute("role", "switch") }
    const title = document.createTextNode(caption(e))
    if (e.getProperty("ПоложениеЗаголовка") === "Право") label.append(input, title)
    else label.append(title, input)
    return label
  }
  if (e instanceof RadioButtonElement) {
    const group = node("fieldset", "preview-radio")
    if (e.getProperty("ВидПереключателя") === "Тумблер") group.classList.add("preview-segment")
    group.append(node("legend", "", caption(e)))
    const name = `radio-${++sequence}`
    const items = e.getProperty("СписокВыбора")
    if (Array.isArray(items)) items.forEach((value, i) => {
      const label = node("label", "preview-check")
      const input = node("input"); input.type = "radio"; input.name = name; input.checked = i === e.value
      label.append(input, node("span", "", String(value))); group.append(label)
    })
    return group
  }
  if (e instanceof LabelElement) return node("p", "preview-label-text", caption(e))
  if (e instanceof InputElement) {
    const label = node("label", "preview-field")
    const title = node("span", "preview-label", caption(e))
    title.hidden = e.getProperty("ПоложениеЗаголовка") === "Нет"
    label.append(title)
    const control = node("span", "preview-control")
    const input = booleanProperty(e, "МногострочныйРежим") === true ? node("textarea") : node("input")
    if (input instanceof HTMLTextAreaElement) input.rows = Math.max(2, Math.min(20, Number(e.getProperty("Высота")) || 3))
    input.value = e.value
    input.setAttribute("aria-label", caption(e) || "Поле ввода")
    if (e.typeDescription.types.includes("Число")) input.className = "preview-number"
    control.append(input)
    const icons = [["КнопкаВыпадающегоСписка", "▾"], ["КнопкаВыбора", "…"], ["КнопкаОчистки", "×"], ["КнопкаОткрытия", "↗"], ["КнопкаРегулирования", "↕"]]
    if (e.typeDescription.types.includes("Дата") && booleanProperty(e, "КнопкаВыбора") === true) {
      icons.splice(icons.findIndex(([key]) => key === "КнопкаВыбора"), 1, ["date", "▦"])
    }
    for (const [property, icon] of icons) if (property === "date" || booleanProperty(e, property) === true) {
      const adornment = node("button", "preview-adornment", icon)
      adornment.type = "button"
      adornment.setAttribute("aria-label", `${caption(e)}: ${property === "date" ? "Календарь" : property}`)
      adornment.addEventListener("click", () => {
        if (input.readOnly || input.disabled) return
        if (property === "КнопкаОчистки") { input.value = ""; input.focus(); return }
        if (property === "КнопкаРегулирования") { input.value = String((Number(input.value.replace(",", ".")) || 0) + 1); input.focus(); return }
        const dialog = node("dialog", "preview-dialog")
        const form = node("form"); form.method = "dialog"
        const fieldLabel = node("label", "preview-field", caption(e))
        const field = node("input"); field.value = input.value
        if (property === "date") {
          const match = input.value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{1,2}:\d{2}(?::\d{2})?))?$/)
          if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(input.value)) {
            field.type = "time"; field.step = "1"; field.value = input.value.split(":").map(part => part.padStart(2, "0")).join(":")
          } else {
            field.type = match?.[4] ? "datetime-local" : "date"; field.step = "1"
            field.value = match ? `${match[3]}-${match[2]}-${match[1]}${match[4] ? "T" + match[4] : ""}` : ""
          }
        }
        fieldLabel.append(field)
        const accept = node("button", "preview-button primary", "Выбрать"); accept.type = "submit"
        const cancel = node("button", "preview-button", "Отмена"); cancel.type = "button"
        cancel.addEventListener("click", () => dialog.close())
        form.addEventListener("submit", () => {
          if (property !== "date" || field.type === "time") input.value = field.value
          else {
            const [date, time] = field.value.split("T")
            input.value = date.split("-").reverse().join(".") + (time ? " " + time : "")
          }
        })
        form.append(fieldLabel, accept, cancel); dialog.append(form)
        dialog.addEventListener("close", () => { dialog.remove(); input.focus() })
        document.body.append(dialog); dialog.showModal()
      })
      control.append(adornment)
    }
    label.append(control)
    return label
  }
  if (e instanceof TableElement) {
    type Column = TableColumnElement | TableColumnGroupElement
    const children = (c: Column) => c.items
    const leafCount = (c: Column): number => children(c).length ? children(c).reduce((n, item) => n + leafCount(item), 0) : 1
    const headerDepth = (c: Column): number => 1 + Math.max(0, ...children(c).map(headerDepth))
    const dataDepth = (c: Column): number => (c instanceof TableColumnGroupElement ? 0 : 1) + Math.max(0, ...children(c).map(dataDepth))
    const frame = node("div", "preview-table-frame")
    const table = node("table", "preview-table")
    table.setAttribute("aria-label", caption(e) || "Таблица")
    const header = table.createTHead()
    const height = Math.max(1, ...e.columns.map(headerDepth))
    const headerRows = Array.from({ length: height }, () => header.insertRow())
    const addColumn = (column: Column, level: number) => {
      const cell = node("th", "", caption(column))
      cell.style.textAlign = column.alignment === "Право" ? "right" : column.alignment === "Центр" ? "center" : "left"
      cell.scope = children(column).length ? "colgroup" : "col"
      if (children(column).length) { cell.colSpan = leafCount(column); children(column).forEach(child => addColumn(child, level + 1)) }
      else cell.rowSpan = height - level
      headerRows[level].append(cell)
      for (const key of column.properties.keys()) if (!["Заголовок", "Имя", "ТолькоПросмотр", "Доступность", "ГоризонтальноеПоложение"].includes(key)) warnings.add(`Колонка «${caption(column)}»: свойство «${key}» не визуализируется`)
    }
    e.columns.forEach(c => addColumn(c, 0))
    const body = table.createTBody()
    const rowHeight = Math.max(1, ...e.columns.map(dataDepth))
    let logicalRow = 0
    const addRow = (row: TableRowElement, treeLevel: number) => {
      logicalRow++
      const rowNumber = logicalRow
      const lines = Array.from({ length: rowHeight }, () => body.insertRow())
      const addCells = (columns: Column[], level: number, first: boolean) => {
        columns.forEach((column, index) => {
          if (column instanceof TableColumnGroupElement) { addCells(children(column), level, first && index === 0); return }
          const cell = lines[level].insertCell()
          if (children(column).length) cell.colSpan = leafCount(column)
          else cell.rowSpan = rowHeight - level
          const value = row.getByColumn(column)
          const readOnly = booleanProperty(column, "ТолькоПросмотр") === true || booleanProperty(column, "Доступность") === false || (value && (booleanProperty(value, "ТолькоПросмотр") === true || booleanProperty(value, "Доступность") === false))
          cell.setAttribute("contenteditable", readOnly ? "false" : "plaintext-only")
          cell.tabIndex = 0
          cell.setAttribute("aria-label", `${caption(column)}, строка ${rowNumber}`)
          if (value) {
            applyColors(value, cell, warnings)
            for (const key of value.properties.keys()) if (!["ЦветФона", "ЦветТекста", "ТолькоПросмотр", "Доступность", "ЦветОбразца"].includes(key)) warnings.add(`Ячейка «${value.value}»: свойство «${key}» не визуализируется`)
          }
          cell.style.textAlign = column.alignment === "Право" ? "right" : column.alignment === "Центр" ? "center" : "left"
          if (first && index === 0 && treeLevel) { cell.style.paddingLeft = `${10 + treeLevel * 20}px`; cell.append(document.createTextNode("↳ ")) }
          if (value?.hasCheckbox) {
            const check = node("input"); check.type = "checkbox"; check.checked = value.valueCheckbox; check.disabled = !!readOnly
            check.setAttribute("aria-label", `${caption(column)} ${value.value}`); cell.append(check)
          }
          const swatchValue = value?.getProperty("ЦветОбразца")
          const swatchColor = colorValue(swatchValue)
          if (swatchValue !== undefined && !swatchColor) warnings.add(`ЦветОбразца «${String(swatchValue)}» не распознан`)
          if (swatchColor) {
            cell.setAttribute("contenteditable", "false")
            const swatch = node("input", "preview-color")
            swatch.type = "color"; swatch.value = swatchColor; swatch.disabled = !!readOnly
            swatch.setAttribute("aria-label", `Цвет: ${value?.value || caption(column)}, строка ${rowNumber}`)
            const label = node("span", "", value?.value ?? "")
            swatch.addEventListener("input", () => { label.textContent = swatch.value })
            cell.append(swatch, label)
          } else cell.append(document.createTextNode(value?.value ?? ""))
          if (children(column).length) addCells(children(column), level + 1, first && index === 0)
        })
      }
      addCells(e.columns, 0, true)
      row.rows.forEach(child => addRow(child, treeLevel + 1))
    }
    e.rows.forEach(row => addRow(row, 0))
    frame.append(table)
    return frame
  }
  const message = `Элемент «${e.type}» не поддерживается предпросмотром`
  warnings.add(message)
  return node("p", "preview-unsupported", message)
}
