# Reconstruction examples

## artifacts.md — upstream screenshot

Source: `docs/_images/readme-example.png` in the pinned md_design upstream. The [prototype](../../../prototypes/artifacts.md) preserves three commands, three fields, list selection, numeric stepper, and checkbox. Shell navigation (back/forward/window close) is outside form content and omitted. The first command retains its coral color; browser viewport/theme determine frame and width. This is an approximation, not a pixel copy.

## save-report.md — EDT XML

Source: `SettingsStorages/ХранилищеВариантовОтчетов/Forms/СохранениеВариантаОтчетаВФайл/Form.form` from the supplied Kafka configuration. The XML is not bundled. The [prototype](../../../prototypes/save-report.md) has no runtime dependency on Kafka paths, modules, or databases.

| Source nodes | Representation |
| --- | --- |
| ВариантыСохранения, ОдинВариантОтчета, НесколькоВариантовОтчетов | Two tabs in source order |
| ИмяФайла, ИмяКаталога | Empty selection fields; XML provides no actual values |
| ПерсональныеНастройки + Пометка/Значение | Two-column table |
| ОписаниеВариантовОтчетов + Ссылка/ИмяФайлаКраткое | Two-column read-only table |
| Сохранить | Primary command |
| CheckAll / UncheckAll | Two commands with descriptive captions instead of platform icons |

The root has no explicit title, so it is derived from the form name. Personal-settings label/group share one heading. Tables stay empty because their contents are generated at runtime. File/directory selection demonstrates value entry, not a system file picker. Command autofill, handlers, extended tooltips, dynamic visibility, and standard table commands do not execute.

## pricing-zones.md — user screenshot

The [prototype](../../../prototypes/pricing-zones.md) preserves four fields, two commands, seven columns, six zones in source order, boundary values, swatches, and Z6/Z1 cell restrictions. Colors approximate the screenshot. Numeric fields align right using the theme. Caption rules are text; percentage limits and recalculation do not execute. Row structure and the first three columns are locked; editable values/colors live only in page memory.
