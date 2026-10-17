// @vitest-environment jsdom
import { expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { parseForm } from "./parser"
import { FormElement } from "@/elements"
import { renderPreview } from "./preview"
function render(text: string) {
  const container = document.createElement("div")
  renderPreview(container, parseForm(text))
  return container
}

test("form properties apply to descendants and reset on rerender", () => {
  const c = render('--- Форма --- {ТолькоПросмотр = Истина; ЦветФона = #ff0000; НеизвестноеСвойство = Значение}\nИмя: Иван__Х')
  expect(c.querySelector('input')?.readOnly).toBe(true)
  expect(c.querySelector<HTMLButtonElement>('.preview-adornment')?.disabled).toBe(true)
  const warnings = renderPreview(c, parseForm('--- Форма --- {Видимость = Ложь; Доступность = Ложь; НеизвестноеСвойство = Значение}\nИмя: Иван'))
  expect(c.hidden).toBe(true)
  expect(c.hasAttribute('inert')).toBe(true)
  expect(warnings.join()).toContain('НеизвестноеСвойство')
  renderPreview(c, parseForm('Имя: Иван__Х'))
  expect(c.hidden).toBe(false)
  expect(c.hasAttribute('inert')).toBe(false)
  expect(c.style.backgroundColor).toBe('')
  expect(c.querySelector('input')?.readOnly).toBe(false)
  expect(c.querySelector<HTMLButtonElement>('.preview-adornment')?.disabled).toBe(false)
})

test("property-only table cells preserve swatches and readonly", () => {
  const c = render('| Цвет |\n| --- |\n| {ЦветОбразца = #ff0000; ТолькоПросмотр = Истина} |')
  const swatch = c.querySelector<HTMLInputElement>('input[type=color]')!
  expect(swatch.value).toBe('#ff0000')
  expect(swatch.disabled).toBe(true)
  expect(c.querySelector('td')?.getAttribute('contenteditable')).toBe('false')
})

test("explicit properties override shorthand regardless of key case", () => {
  const form = parseForm('Имя: Иван__Х {кнопкаочистки = Ложь}')
  expect(form.items[0].getProperty('КнопкаОчистки')).toBe('Ложь')
  const c = document.createElement('div')
  const warnings = renderPreview(c, form)
  expect(c.querySelector('.preview-adornment')).toBeNull()
  expect(warnings).toEqual([])
})

test("extra table values are rejected instead of overwriting another cell", () => {
  expect(() => parseForm('| А | Б |\n| --- | --- |\n| 1 | 2 | 3 |')).toThrow(/лишнюю ячейку|повторное значение/)
  const c = render('| А | Б |\n| --- | --- |\n| 1 | 2 |')
  expect([...c.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['1', '2'])
})

test.each([
  ['| А | Б |\n| --- | --- |\n| | 3 |\n| | 4 |', ['', '3', '', '4']],
  ['| А | Б | В |\n| --- | --- | --- |\n| | | 3 |', ['', '', '3']],
  ['А | Б\n--- | ---\n | 3', ['', '3']],
])("empty leading table cells keep values in their columns: %s", (text, values) => {
  const c = render(text)
  expect([...c.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(values)
})

test("incomplete multiline table records fail instead of silently losing data", () => {
  const header = '| Заказ ||\n| Товар | Количество |\n| --- | --- |\n'
  expect(() => parseForm(header + '| Заказ 001 ||')).toThrow(/Незавершённая многострочная запись/)
  const c = render(header + '| Заказ 001 ||\n| Товар 1 | 3 |')
  expect(c.textContent).toContain('Заказ 001')
  expect(c.textContent).toContain('Товар 1')
  expect(c.textContent).toContain('3')
})

test("empty first cells reset tree depth and multiline continuations preserve it", () => {
  const c = render('| А | Б |\n| --- | --- |\n| Корень | 1 |\n| . Дочерний | 2 |\n| | 3 |')
  const rows = c.querySelectorAll('tbody tr')
  expect(rows[1].querySelector('td')?.style.paddingLeft).toBe('30px')
  expect(rows[2].querySelector('td')?.style.paddingLeft).toBe('')
  expect(rows[2].textContent).toBe('3')
  const multiline = render('| Заказ ||\n| Товар | Количество |\n| --- | --- |\n| Корень ||\n| А | 1 |\n| . Дочерний ||\n| Б | 2 |')
  expect(multiline.querySelectorAll('tbody tr')[2].querySelector('td')?.style.paddingLeft).toBe('30px')
})

test("readonly column groups disable descendant cells and controls", () => {
  const c = render('| -Данные- {ТолькоПросмотр = Истина} ||\n| А | Б |\n| --- | --- |\n| 1 | [X] |')
  expect([...c.querySelectorAll('td')].map(cell => cell.getAttribute('contenteditable'))).toEqual(['false', 'false'])
  expect(c.querySelector<HTMLInputElement>('input[type=checkbox]')?.disabled).toBe(true)
})

test("menu captions matching Object.prototype keys are ordinary text", () => {
  for (const caption of ['constructor', '__proto__', 'toString']) {
    const c = render(`<\n${caption}\n. Action >`)
    expect(c.textContent).toContain(caption)
    expect(c.textContent).toContain('Action')
    expect(c.querySelector('[aria-haspopup=menu]')).not.toBeNull()
  }
})
test("order: captions, values, commands, columns and editable cells", () => {
  const c = render(readFileSync("prototypes/order.md", "utf8"))
  expect(c.querySelector("h1")?.textContent).toBe("Поступление товаров")
  expect([...c.querySelectorAll(".preview-commands button")].map(b => b.textContent)).toEqual(["Записать", "Провести", "Отмена"])
  expect([...c.querySelectorAll("input")].map(i => i.value)).toEqual(["123", "01.01.2025", "ООО «Рога и Копыта»", "Основной"])
  expect([...c.querySelectorAll("th")].map(i => i.textContent)).toEqual(["Товар", "Количество", "Цена", "Сумма"])
  expect(c.querySelectorAll("tbody [contenteditable]")).toHaveLength(8)
})
test("captions remain inert text", () => {
  const form = new FormElement()
  form.setProperty("Заголовок", '<img src=x onerror="alert(1)">')
  const c = document.createElement("div")
  renderPreview(c, form)
  expect(c.querySelector("img")).toBeNull()
  expect(c.textContent).toContain("<img")
})
test("tabs respond to mouse and keyboard; nested controls remain usable", () => {
  const c = render("--- Форма ---\n/Основное\n  [X] Активен\n/Детали\n  Имя: Иван")
  document.body.append(c)
  const tabs = c.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  expect(tabs).toHaveLength(2)
  tabs[1].click()
  expect(tabs[1].getAttribute("aria-selected")).toBe("true")
  expect(c.querySelectorAll<HTMLElement>('[role="tabpanel"]')[0].hidden).toBe(true)
  tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
  expect(tabs[0].getAttribute("aria-selected")).toBe("true")
  const checkbox = c.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  checkbox.click(); expect(checkbox.checked).toBe(false)
  c.remove()
})
test("group, radio, multiline, disabled/hidden controls and clear button", () => {
  const c = render("--- Форма ---\n###Группа\n  Имя: Иван__Х\n  Выбор: (X)Да ( )Нет\n  Описание: текст\n  __________\n  Скрыто: секрет {Видимость = Ложь}\n  Закрыто: текст {Доступность = Ложь}")
  expect(c.querySelector("h2")?.textContent).toBe("Группа")
  expect(c.querySelectorAll('input[type="radio"]')).toHaveLength(2)
  expect(c.querySelector("textarea")).not.toBeNull()
  c.querySelector<HTMLButtonElement>(".preview-adornment")!.click()
  expect(c.querySelector<HTMLInputElement>("input")!.value).toBe("")
  expect(c.querySelector("[hidden]")?.textContent).toContain("Скрыто")
  expect(c.querySelector("input:disabled")).not.toBeNull()
})
test("unsupported properties are reported without CSS injection", () => {
  const c = document.createElement("div")
  const warnings = renderPreview(c, parseForm("Текст {НеизвестноеСвойство = Значение}"))
  expect(warnings.join()).toContain("НеизвестноеСвойство")
})
test("grouped table headers and tree rows preserve data", () => {
  const c = render("| -Группа- ||\n| А | Б |\n| --- | --- |\n| один | два |\n| . три | четыре |")
  expect(c.querySelector('th[colspan="2"]')?.textContent).toBe("Группа")
  expect(c.querySelectorAll("tbody tr")).toHaveLength(2)
  expect(c.textContent).toContain("четыре")
})
test("parse failure is explicit and does not poison the next parse", () => {
  expect(() => parseForm("Имя: значение {Тип = Число(abc}" )).toThrow()
  expect(() => parseForm("Имя: Иван")).not.toThrow()
  expect(() => parseForm("x".repeat(200001))).toThrow(/лимит/)
})

test("XML-derived example preserves pages, commands and table columns", () => {
  const c = render(readFileSync("prototypes/save-report.md", "utf8"))
  expect([...c.querySelectorAll('[role="tab"]')].map(t => t.textContent)).toEqual(["Один вариант отчета", "Несколько вариантов отчетов"])
  expect([...c.querySelectorAll('th')].map(t => t.textContent)).toEqual(["Пометка", "Значение", "Вариант отчета", "Имя файла"])
  expect(c.querySelectorAll('input')).toHaveLength(2)
})
test("screenshot-derived example and typographic captions preserve text", () => {
  const c = render(readFileSync("prototypes/artifacts.md", "utf8"))
  expect(c.querySelector('h1')?.textContent).toBe("Справочник: Магические артефакты")
  expect([...c.querySelectorAll('input:not([type=checkbox])')].map(i => (i as HTMLInputElement).value)).toEqual(["Мантия невидимости", "Иллюзия", "150"])
  expect(c.querySelectorAll('input[type=checkbox]')).toHaveLength(1)
  const quoted = render('Наименование: ООО "Север"')
  expect(quoted.querySelector('input')?.value).toBe('ООО "Север"')
})
test("readonly table columns cannot be edited", () => {
  const c = render('| Название {ТолькоПросмотр = Истина} | Значение |\n| --- | --- |\n| Ключ | 10 |')
  expect(c.querySelectorAll('td')[0].getAttribute('contenteditable')).toBe('false')
  expect(c.querySelectorAll('td')[1].getAttribute('contenteditable')).toBe('plaintext-only')
})

test("command menus overlay the form, support keyboard and dismiss outside", () => {
  const c = render('--- Форма ---\n< Записать | Еще\nЕще\n. Печать\n. История >')
  document.body.append(c)
  const trigger = c.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')!
  const menu = c.querySelector<HTMLElement>('[role=menu]')!
  const items = [...menu.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
  expect(trigger.tagName).toBe('BUTTON')
  expect(menu.hidden).toBe(true)
  trigger.click()
  expect(menu.hidden).toBe(false)
  expect(document.activeElement).toBe(items[0])
  items[0].dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true}))
  expect(document.activeElement).toBe(items[1])
  items[1].dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))
  expect(menu.hidden).toBe(true)
  expect(document.activeElement).toBe(trigger)
  trigger.click(); document.body.dispatchEvent(new Event('pointerdown', {bubbles:true}))
  expect(menu.hidden).toBe(true)
  trigger.click(); items[0].click()
  expect(menu.hidden).toBe(true)
  c.remove()
})

test("menu keyboard navigation skips hidden and unavailable items", ({ onTestFinished }) => {
  const c = render('< Еще\nЕще\n. Скрытый первый {Видимость = Ложь}\n. Первый\n. Скрытый средний {Видимость = Ложь}\n. Недоступный {Доступность = Ложь}\n. Последний >')
  document.body.append(c)
  onTestFinished(() => c.remove())
  const trigger = c.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')!
  trigger.click()
  expect(document.activeElement?.textContent).toBe('Первый')
  const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  press('ArrowDown')
  expect(document.activeElement?.textContent).toBe('Последний')
  press('ArrowDown')
  expect(document.activeElement?.textContent).toBe('Первый')
  press('End')
  expect(document.activeElement?.textContent).toBe('Последний')
  press('Home')
  expect(document.activeElement?.textContent).toBe('Первый')
  press('Escape')
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  expect(document.activeElement?.textContent).toBe('Последний')
})

test("pricing screenshot: six zones, swatches and per-cell readonly boundaries", () => {
  const c = render(readFileSync("prototypes/pricing-zones.md", "utf8"))
  expect(c.querySelectorAll("tbody tr")).toHaveLength(6)
  expect(c.querySelectorAll("th")).toHaveLength(7)
  expect(c.querySelectorAll('input[type=color]')).toHaveLength(6)
  expect(c.querySelector<HTMLInputElement>('input[type=color]')!.value).toBe('#b65b6a')
  const firstRow = c.querySelectorAll('tbody tr')[0]
  expect(firstRow.querySelectorAll('td[contenteditable=false]')).toHaveLength(7)
  expect(firstRow.querySelector('input')!.disabled).toBe(false)
  const thirdRow = c.querySelectorAll('tbody tr')[2]
  expect(thirdRow.querySelectorAll('td[contenteditable="plaintext-only"]')).toHaveLength(3)
  const swatch = firstRow.querySelector<HTMLInputElement>('input')!
  swatch.value = '#123456'; swatch.dispatchEvent(new Event('input'))
  expect(firstRow.textContent).toContain('#123456')
})

test("showcase covers six pages, switches, segmented radios, menus and multiline tables", () => {
  const c = render(readFileSync("prototypes/showcase.md", "utf8"))
  expect(c.querySelectorAll(':scope > .preview-pages > .preview-tabs > [role=tab]')).toHaveLength(6)
  expect(c.querySelectorAll('[role=switch]')).toHaveLength(2)
  expect(c.querySelectorAll('.preview-segment')).toHaveLength(1)
  expect(c.querySelectorAll('[aria-haspopup=menu]').length).toBeGreaterThanOrEqual(4)
  const multiline = render('| Заказ ||\n| Товар | Количество |\n| --- | ---: |\n| Заказ 001 ||\n| Стол | 2 |\n| Заказ 002 ||\n| Стул | 4 |')
  expect(multiline.querySelectorAll('tbody tr')).toHaveLength(4)
  expect(multiline.querySelectorAll('tbody td[colspan="2"]')).toHaveLength(2)
  expect(multiline.textContent).toContain('Стул')
})

test("calendar respects date parts for empty values and accepts documented short dates and hours", ({ onTestFinished }) => {
  // jsdom does not implement the native modal API.
  const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal")
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.open = true } })
  onTestFinished(() => {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, "showModal", original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal")
    document.querySelectorAll("dialog").forEach(dialog => dialog.remove())
  })
  for (const [text, type, value, picked, result] of [
    ['Дата: __В {Тип = Дата}', 'date', '', '2026-10-18', '18.10.2026'],
    ['Время: __В {Тип = Дата(Время)}', 'time', '', '09:30:15', '09:30:15'],
    ['Момент: __В {Тип = Дата(ДатаВремя)}', 'datetime-local', '', '2026-10-18T09:30:15', '18.10.2026 09:30:15'],
    ['Дата: 17.10.26__В', 'date', '2026-10-17', '2026-10-18', '18.10.2026'],
    ['Время: 9:30__В', 'time', '09:30:00', '10:45:00', '10:45:00'],
    ['Момент: 17.10.26 9:30__В', 'datetime-local', '2026-10-17T09:30', '2026-10-18T09:30:15', '18.10.2026 09:30:15'],
  ]) {
    const c = render(text)
    const source = c.querySelector<HTMLInputElement>('input')!
    c.querySelector<HTMLButtonElement>('.preview-adornment')!.click()
    const dialog = document.querySelector('dialog')!
    const picker = dialog.querySelector('input')!
    expect(picker.type).toBe(type)
    expect(picker.value).toBe(value)
    picker.value = picked
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(source.value).toBe(result)
    dialog.remove()
  }
})
