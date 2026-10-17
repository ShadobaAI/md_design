import { expect, test } from "vitest"
import { parseForm } from "./parser"
import { HorizontalGroupElement, PagesElement, VerticalGroupElement } from "@/elements"

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
