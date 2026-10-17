# md_design syntax

Based on md_design 0.15.1, commit `45e130f14970367c6e38deca937f61eb896ee6db`; checked against its [syntax documentation](https://github.com/crimsongoldteam/md_design/tree/45e130f14970367c6e38deca937f61eb896ee6db/docs) and this plugin's parser/renderer. This is a DSL, not ordinary Markdown. Do not wrap the delivered `.md` in a code fence or add explanatory headings/lists.

## Form, labels, commands

```text
--- Заказ покупателя ---
< Записать и закрыть {КнопкаПоУмолчанию = Истина} | Записать | Отмена >
Данные покупателя
```

Place the form title first. A plain line is a label. Commands use `< ... >`, separated by `|`. Multiline menus use dots for nesting:

```text
< Записать | Еще
Еще
. Печать
. История >
```

Use `| - |` between command groups. A menu separator occupies its own dotted line; following items need one extra dot to belong to that separator's group:

```text
< Еще
Еще
. Печать
. -
.. Закрыть >
```

Business buttons are clickable without executing operations; menus expand. Single-button syntax is `< Выполнить >`; it renders in the preview's command container. The parser accepts images before or after a caption (`@Печать Печать`, `Сохранить @Записать`); the 1C image library is not bundled and uses placeholders.

## Fields, checkboxes, radios

```text
Номер: 000001 {Тип = Строка(9)} & Дата: 18.09.2026
Организация: ООО Север__ВХ
Склад: Основной__С
Сумма: 1200.50 {Тип = Число(15, 2)}
[X] Активен
[ ] Пометка
Вид: (X)Юридическое лицо ( )Физическое лицо
Комментарий: Первая строка
_____________
_____________
```

Fields use `Caption: Value`; values may be empty. Types are inferred; explicitly use `Строка` for identifiers with leading zeros. Dates use `dd.mm.yyyy`, times `hh:mm[:ss]`, numbers a decimal dot/comma. Lines of `___` immediately after a field enable multiline input. `&` places elements in one row.

Modifiers after `__` use **Cyrillic** letters: `В` selection, `С` dropdown, `Х` clear, `О` open, `Д` stepper. Selection/dropdown/open show a local value-entry dialog; date selection opens a calendar; stepper adds one. These interactions have no live reference data or server handlers.

An empty value defaults to string, regardless of its caption. Use `Дата: __В {Тип = Дата}` for an empty date with a calendar. A blank numeric field likewise needs explicit `Тип = Число(15, 2)`. Date parts accept `Дата(Дата)`, `Дата(Время)`, `Дата(ДатаВремя)`; calendar mode follows the current value, so empty time/datetime controls do not select their mode from type parameters alone. Types do not enforce business validation or live data binding.

Checkboxes may follow their captions; switches use a `|` with an on/off marker on either side. Radios may omit their caption or use segmented presentation:

```text
Флажок справа [X]
[0| ] Выключено
[ |1] Включено
( )Низкий (X)Обычный ( )Высокий
Период: (X)День ( )Неделя ( )Месяц {ВидПереключателя = Тумблер}
```

## Groups and pages

```text
###Реквизиты
  Номер: 001
  Дата: 18.09.2026

#Левая колонка #Правая колонка
  Имя: Иван    +Город: Москва
  Телефон: 123 +Почта: info@example.test

/Основное
  [X] Использовать
/Дополнительно
  Комментарий:
```

Indent children consistently with two spaces. An unindented group/page ends the previous nesting. Group headings on one line create a horizontal group; `+` splits its content into columns. Prefer `&` for a simple row of fields.

`#` has no emphasis; `##` weak, `###` normal, `####` strong, `#####` collapsible, `######` popup. Preview approximates popup groups as expandable sections. `/Caption` defines a page; pages may nest. Tabs support mouse, arrows, Home, and End. Each tab set starts on its first visible page; a page's `Доступность = Ложь` disables its contents, not its tab button. Report these limits when matching source states; do not reorder pages just to fake the active tab.

## Tables

```text
| Товар | Количество | Цена |
| --- | ---: | ---: |
| Стол | 2 | 15000 |
| Стул | 4 | 3000 |
```

The header separator row is required. `:---`, `:---:`, `---:` set alignment. Cells support `[X]` / `[ ]`. Leading dots indicate tree depth:

```text
| Наименование | Значение |
| --- | --- |
| Группа | |
| . Дочерняя строка | 10 |
```

Grouped headers:

```text
| -Данные- ||
| Код | Наименование |
| --- | --- |
| 001 | Пример |
```

Without hyphens around the parent header, child headers define multilevel data rows rather than a pure column group. Each logical record then requires all of its physical lines, including empty continuation lines; an incomplete final record is rejected:

```text
| Заказ ||
| Товар | Количество |
| --- | ---: |
| Заказ 001 ||
| Стол | 2 |
```

Cells edit locally. Tree rows are indented without expand/collapse. Preserve empty cells used for spans; do not put multiple values into the same merged column. Extra nonempty cells are rejected. Visually verify complex nesting. Set column types explicitly in headers when important, e.g. `Код {Тип = Строка(6)}`: do not rely on upstream's documented automatic column inference, which is not reliable in the bundled parser.

## Properties and parsing limits

Properties use `{Имя = Значение; Другое = Значение}` with `;` separators. Types may have parameters and alternatives: `{Тип = Строка(100), Число(15, 2)}`. Supported interaction properties include `Видимость = Ложь`, `Доступность = Ложь`, `ТолькоПросмотр = Истина`, and `КнопкаПоУмолчанию = Истина`. The renderer normalizes explicit string booleans and shorthand boolean values.

Place inline properties after their element. To target a table or command bar as a whole, put a standalone property line immediately **before** it at the same indentation; a trailing property line may be silently discarded:

```text
{ТолькоПросмотр = Истина}
| Код {Тип = Строка(6)} | Сумма {Тип = Число(15, 2)} |
| --- | ---: |
| 000001 | 123.45 |
```

Property keys are case-insensitive; explicit values override shorthand. Read-only state propagates through form/group descendants and table column groups; a child cannot re-enable editing under a read-only parent. Use `ПоложениеЗаголовка = Нет` to hide a field caption. Unknown or context-inappropriate properties may parse successfully without being rendered; `data-warnings` is not exhaustive, so also compare visible states.

Alignment uses `-> Справа` and `-> По центру <-`. A trailing `->` requests horizontal stretch upstream; preview does not reproduce platform sizing. Underscores/spaces do not guarantee exact widths.

`# / + & | < > { } _` are structural. Quotes do **not** escape them. Check phone numbers containing `+`, URLs with `/`, and text with `&`, `_`, or `|`: a successful parse may still change the hierarchy. Verify the tree and preview; agree on or disclose approximations instead of silently replacing meaningful text.

The adapter preserves quotes and typographic punctuation that upstream dropped; structural grammar is unchanged. Such text may not survive in original upstream. Unknown characters and parse errors stop validation with diagnostics.

Examples: [order](../../../prototypes/order.md), [counterparty](../../../prototypes/counterparty.md). After edits, run `--check`, inspect the form, and read `data-warnings`.

## Colors and table swatches

`ЦветФона` and `ЦветТекста` accept `#RRGGBB` or supported names, e.g. `Коралловый`, `Зеленый`. Prefer hex for exact colors. These properties also apply to cells; individual cells may use `ТолькоПросмотр = Истина`.

`ЦветОбразца` is a **local playground extension**, not a 1C platform property. It renders an editable swatch beside cell text:

```text
| Цвет |
| --- |
| Бордовый {ЦветОбразца = #b65b6a} |
```

Upstream may preserve this property without rendering a swatch. See [pricing zones](../../../prototypes/pricing-zones.md). Boundaries edit locally; rules in captions do not run calculations. Date fields need `__В` for a calendar; otherwise they render as plain input.
