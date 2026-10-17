# md_design syntax

DSL, not ordinary Markdown. Save the form without code fences, explanatory headings or lists. Based on [upstream syntax](https://github.com/crimsongoldteam/md_design/tree/45e130f14970367c6e38deca937f61eb896ee6db/docs) and the bundled parser/preview. Read the sections needed for the current form.

## Title, labels and commands

```text
--- Заказ покупателя ---
< Записать {КнопкаПоУмолчанию = Истина} | Отмена >
Данные покупателя
```

Title first; a plain line is a label. `< ... >` contains commands separated by `|`; a single command uses the same syntax. `| - |` separates command groups. Menus use dots for nesting:

```text
< Записать | Еще
Еще
. Печать
. -
.. Закрыть >
```

After a menu separator, add one extra dot to its following items. Images may precede/follow captions (`@Печать Печать`, `Сохранить @Записать`); preview uses placeholders. Commands do not execute business operations.

## Fields, checkboxes and radios

```text
Номер: 000001 {Тип = Строка(9)} & Дата: 17.10.2026__В
Организация: ООО Север__ВХ
Склад: Основной__С
Сумма: 1200.50 {Тип = Число(15, 2)}
Время: __В {Тип = Дата(Время)}
Момент: __В {Тип = Дата(ДатаВремя)}
[X] Активен
Флажок справа [ ]
[0| ] Выключено
[ |1] Включено
Вид: (X)Юридическое лицо ( )Физическое лицо
Период: (X)День ( )Неделя {ВидПереключателя = Тумблер}
Комментарий: Первая строка
_____________
_____________
```

`Caption: Value` allows empty values. `&` places controls in one row. Lines of `___` immediately after a field enable multiline input.

Modifiers after `__` are **Cyrillic**: `В` select, `С` dropdown, `Х` clear, `О` open, `Д` stepper. Selection/dropdown/open use local value-entry dialogs; date selection uses a calendar; the stepper adds one. No live reference data or handlers.

Types are inferred from values: dates `dd.mm.yyyy` / `dd.mm.yy`, time `h:mm[:ss]`, datetime with a space, numbers with dot/comma. Empty fields default to string. Specify `Тип = Строка(9)` for identifiers, `Число(15, 2)` for empty numbers, `Дата` for empty dates. Calendar controls need `__В`; `Дата(Время)` / `Дата(ДатаВремя)` select time/datetime mode even when empty. Union types use commas: `{Тип = Строка(100), Число(15, 2)}`. Types do not enforce validation.

## Groups and pages

```text
###Реквизиты
  Номер: 001
  Дата: 17.10.2026

#Левая колонка #Правая колонка
  Имя: Иван    +Город: Москва
  Телефон: 123 +Почта: info@example.test

/Основное
  [X] Использовать
/Дополнительно
  Комментарий:
```

Indent children consistently with two spaces. A group/page at the same indentation starts a sibling. Group headings on one line create columns; `+` separates their contents. Prefer `&` for a simple row.

`#` no emphasis; `##` weak; `###` normal; `####` strong; `#####` collapsible; `######` popup (preview: expandable section). Groups and pages can nest. Tabs start on the first visible page. A page's `Доступность = Ложь` disables its contents, not its tab; preserve page order and disclose unsupported initial states.

## Tables

```text
| Товар | Количество | Цена |
| --- | ---: | ---: |
| Стол | 2 | 15000 |
| . Дочерняя строка | 1 | 3000 |
```

The separator row is required. `:---`, `:---:`, `---:` align columns. Cells support `[X]` / `[ ]`; leading dots set tree depth (preview: indentation without collapse). Column types are inferred from populated cells; mixed text falls back to string. Set header types explicitly for identifiers or important constraints: `Код {Тип = Строка(6)}`.

Grouped headers:

```text
| -Данные- ||
| Код | Наименование |
| --- | --- |
| 001 | Пример |
```

Without hyphens around the parent header, it also holds data in a separate physical line:

```text
| Заказ ||
| Товар | Количество |
| --- | ---: |
| Заказ 001 ||
| Стол | 2 |
```

Every logical record needs all physical lines, including empty continuations. Preserve empty cells for spans; extra nonempty cells and incomplete records are rejected. Cells edit locally. Inspect complex headers and nesting visually.

## Properties, alignment and colors

Properties use `{Имя = Значение; Другое = Значение}`. Keys are case-insensitive; explicit values override shorthand. Common states: `Видимость = Ложь`, `Доступность = Ложь`, `ТолькоПросмотр = Истина`. Parent read-only state propagates to descendants. `ПоложениеЗаголовка = Нет` hides a field caption.

Inline properties follow their element. Properties for a whole table/command bar go on a standalone line **before** it at the same indentation; a trailing line may be discarded:

```text
{ТолькоПросмотр = Истина}
| Код {Тип = Строка(6)} | Сумма |
| --- | ---: |
| 000001 | 123.45 |
```

Alignment: `-> Справа`, `-> По центру <-`. A trailing `->` requests stretch upstream; preview approximates sizing. Spaces/underscores do not guarantee widths.

`ЦветФона` / `ЦветТекста` accept `#RRGGBB` or supported names such as `Коралловый`, `Зеленый`; prefer hex. Cells also support colors and read-only state. `ЦветОбразца` is a **local extension**, not a 1C property:

```text
| Цвет |
| --- |
| Бордовый {ЦветОбразца = #b65b6a} |
```

## Fidelity limits

`# / + & | < > { } _` are structural; quotes do **not** escape them. Check phone numbers with `+`, URLs, and literal `&`, `_`, `|`: parsing can succeed while changing structure. Disclose necessary approximations; never silently replace meaningful text. Typographic punctuation and hex colors are plugin extensions to upstream parsing.

Unknown/context-inappropriate properties can parse without rendering. Inspect `#preview[data-warnings]` and visible states; diagnostics are not exhaustive. Layout approximates 1C; browser values, command captions and rules do not create business logic.

Examples: [order](../../../prototypes/order.md), [counterparty](../../../prototypes/counterparty.md), [colors](../../../prototypes/pricing-zones.md).
