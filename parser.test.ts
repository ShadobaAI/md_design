import { expect, test } from "vitest"
import { parseForm } from "./parser"
import { HorizontalGroupElement, InputElement, PagesElement, TableColumnElement, TableElement, VerticalGroupElement } from "@/elements"

test("successive group headers create sibling sections and preserve their own state", () => {
  const form = parseForm("###А {ТолькоПросмотр = Истина}\n  Имя: Иван\n###Б\n  Город: Москва")
  expect(form.items).toHaveLength(2)
  const groups = form.items.map(item => (item as HorizontalGroupElement).items[0] as VerticalGroupElement)
  expect(groups.map(group => group.getProperty("Заголовок"))).toEqual(["А", "Б"])
  expect(groups.map(group => group.items.map(item => item.getProperty("Заголовок")))).toEqual([["Имя"], ["Город"]])
  expect(groups[1].getProperty("ТолькоПросмотр")).toBeUndefined()
})

test("a section after pages is outside the page set; pages after a section are siblings", () => {
  const form = parseForm("/Первая\n  Имя: Иван\n/Вторая\n  Город: Москва\n###Итоги\n  Сумма: 10\n/Третья\n  Номер: 001")
  expect(form.items.map(item => item.type)).toEqual(["Страницы", "ГоризонтальнаяГруппа", "Страницы"])
  expect((form.items[0] as PagesElement).items.map(page => page.getProperty("Заголовок"))).toEqual(["Первая", "Вторая"])
  expect((form.items[1] as HorizontalGroupElement).items[0].getProperty("Заголовок")).toBe("Итоги")
  expect((form.items[2] as PagesElement).items[0].getProperty("Заголовок")).toBe("Третья")
})

test("nested sections and pages stay inside their parent when sibling headers follow", () => {
  const form = parseForm("###Родитель\n  ###Вложенная А\n    Имя: Иван\n  ###Вложенная Б\n    Город: Москва\n  /Детали\n    Номер: 1\n  /Заметки\n    Текст: Да\n###Сосед\n  Сумма: 10")
  expect(form.items).toHaveLength(2)
  const parent = (form.items[0] as HorizontalGroupElement).items[0] as VerticalGroupElement
  expect(parent.items.map(item => item.type)).toEqual(["ГоризонтальнаяГруппа", "ГоризонтальнаяГруппа", "Страницы"])
  expect((parent.items[2] as PagesElement).items.map(page => page.getProperty("Заголовок"))).toEqual(["Детали", "Заметки"])
  expect((form.items[1] as HorizontalGroupElement).items[0].getProperty("Заголовок")).toBe("Сосед")
})

test("horizontal header columns keep their fields in the matching column", () => {
  const form = parseForm("#Левая #Правая\n  Имя: Иван +Город: Москва\n  Телефон: 123 +Почта: example")
  const columns = (form.items[0] as HorizontalGroupElement).items as VerticalGroupElement[]
  expect(columns.map(column => column.items.map(item => item.getProperty("Заголовок")))).toEqual([["Имя", "Телефон"], ["Город", "Почта"]])
})

test("column types follow populated cells, including nested headers, and preserve explicit types", () => {
  const form = parseForm('| -Данные- ||||\n| Число | Дата | Смешанный | Код {Тип = Строка(6)} |\n| --- | --- | --- | --- |\n| 10 | 17.10.2026 | 1 | 000001 |\n| 1,25 | 18.10.2026 9:30 | текст | 000002 |\n| | | | |')
  const table = form.items[0] as TableElement
  const columns = table.columns[0].items.filter((column): column is TableColumnElement => column instanceof TableColumnElement)
  expect(columns).toHaveLength(4)
  expect(columns.map(column => column.typeDescription.types)).toEqual([["Число"], ["Дата"], ["Строка"], ["Строка"]])
  expect(columns[0].typeDescription.fractionDigits).toBe(2)
  expect(columns[1].typeDescription.dateFractions).toBe("ДатаВремя")
  expect(columns[3].typeDescription.length).toBe(6)
  expect(table.rows[0].getByColumn(columns[3])?.value).toBe("000001")
})

test("type parameters apply independently of type name case", () => {
  const form = parseForm('Число: 1 {Тип = число(12, 3)}\nКод: 001 {Тип = сТрОкА(6)}\nВремя: __В {Тип = дата(Время)}')
  const types = (form.items as InputElement[]).map(field => field.typeDescription)
  expect(types[0]).toMatchObject({ types: ["Число"], digits: 12, fractionDigits: 3 })
  expect(types[1]).toMatchObject({ types: ["Строка"], length: 6 })
  expect(types[2]).toMatchObject({ types: ["Дата"], dateFractions: "Время" })
})
