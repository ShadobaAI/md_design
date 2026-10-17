# Feature tour: showcase.md

[Source](../../../prototypes/showcase.md). This example covers md_design's **GUI description** constructs. Upstream visual editors, BSL scripting, AI chat, configuration export, and copying browser values back into DSL source are not plugin capabilities. Revise the source in memory with `--stdin --update`. The user can download or copy HTML, MD, or PNG at any point using the export icon menus.

| Tab caption in the example | Coverage |
| --- | --- |
| Поля и выборы | Strings, empty fields, numbers, dates, time, datetime, explicit/union types, leading zeros, all five В/С/Х/О/Д modifiers and combinations, multiline input, `&` rows |
| Флажки и переключатели | Checked/unchecked boxes, left/right captions, switches, labelled/unlabelled radios, segmented controls |
| Группы и страницы | Six `#` variants, two `+` columns, nested groups/pages |
| Команды и меню | Command bar, standalone button, separators, dropdown/nested menus, command images, primary/disabled/colored buttons |
| Таблицы | Alignment, checkboxes, tree depth, grouped headers, multilevel data rows, column types, read-only mode |
| Оформление и состояния | Labels, alignment, text/background colors, disabled/hidden fields, hidden captions, swatches, cell restrictions |

Commands do not save or calculate. Selection/open controls show local value-entry dialogs without live reference data or business handlers. Tree rows use indentation without collapse. Popup `######` groups become expandable sections. 1C icons use a diamond placeholder with the image name in a tooltip.

`ЦветОбразца` is a local table-swatch extension, not a platform property. The adapter supports hex colors and typographic punctuation; upstream may parse them differently. Arbitrary platform properties/values have no guaranteed visual support: inspect `data-warnings`.

Keep these limitations outside the delivered UI. The form has no embedded editor, technical-warning panel, or playground controls.
