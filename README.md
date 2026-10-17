# Накидка — прототипы форм 1С

Плагин для Codex: создаёт интерактивный макет формы 1С по описанию, скриншоту или XML и открывает его во встроенном браузере.

## Установка

1. Установи настольное приложение Codex со встроенным браузером.
2. Установи **Node.js 22 или новее** с [официального сайта](https://nodejs.org/en/download). Если не знаешь, установлен ли Node.js, попроси Codex проверить его версию. После установки перезапусти Codex.
3. В Codex открой **Плагины (Plugins)** → **Добавить (Add)** → **Добавить магазин (Add Marketplace)** → **Из репозитория (Add from a repository)**. Вставь адрес и нажми **Синхронизировать (Sync)**:

   ```text
   https://github.com/ShadobaAI/md_design-mkt
   ```

4. В добавленном магазине найди **Накидку**, нажми **Установить (Install)** и убедись, что плагин включён.
5. Начни новый чат в папке своего проекта и отправь:

   ```text
   Используй Накидку. Создай форму поступления: номер, дата,
   контрагент, склад и таблица с товаром, количеством и ценой.
   Открой форму во встроенном браузере.
   ```

При запросе доступа разреши запуск локального предпросмотра и открытие его страницы. Если доступ к странице заблокирован, проверь **Настройки → Браузер → Разрешения для сайтов (Settings → Browser → Agent permissions)** для указанного адреса. Организационные ограничения меняет администратор. Подробнее: [установка плагинов](https://learn.chatgpt.com/docs/plugins), [разрешения браузера](https://learn.chatgpt.com/docs/reference/settings#browser).

## Использование

Опиши форму обычными словами, приложи скриншот или XML. Изменения тоже можно задавать словами: «Добавь поле договора после контрагента». Для знакомства попроси: «Покажи пример showcase из Накидки».

Форма сохраняется в `.md` в папке проекта. Для постоянных изменений попроси Codex изменить этот файл. Ввод в браузере временный и сбрасывается при перезагрузке или изменении файла. Команды макета не выполняют операции в 1С.

Если предпросмотр перестал открываться, попроси Codex запустить его заново.

## Обновление и удаление

Для обновления отправь Codex:

```text
Обнови магазин Накидки командой:
codex plugin marketplace upgrade shadobaai-md-design
```

Дождись успешного обновления, перезапусти приложение и начни новый чат. Команда описана в [справочнике Codex CLI](https://learn.chatgpt.com/docs/cli/reference#codex-plugin-marketplace).

Для удаления попроси Codex остановить предпросмотры, затем удали **Накидку** в разделе **Плагины**. Сохранённые файлы форм останутся в проекте.

## Для разработчика

Нужны Git, Node.js 22+ с npm и Python 3.12+. Клонируй репозиторий и выполни:

```powershell
git clone https://github.com/ShadobaAI/md_design.git
cd md_design
npm.cmd ci
npm.cmd run build
npm.cmd test
python -m unittest discover -s tests -p "test_*.py"
```

В macOS/Linux используй `npm` вместо `npm.cmd`.

Проверка и открытие формы:

```powershell
node scripts/preview.mjs --file prototypes/order.md --check
node scripts/preview.mjs --file prototypes/order.md --background
```

Открой полный `url` из ответа. Для остановки используй возвращённый `pid`. При запуске из песочницы Codex в Windows см. [разрешения запуска](skills/md-design/references/runtime.md#windows-sandbox).

Локальный пакет для проверки установки:

```powershell
npm.cmd run package:plugin -- --version 0.1.0
npm.cmd run check:plugin
```

ZIP-файлы и `SHA256SUMS` появятся в `.build`, локальный магазин — в `.build/marketplace`. Добавь этот каталог как локальный источник плагинов для проверки установки; [инструкция OpenAI](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli).

Для выпуска:

1. Создай репозиторий `ShadobaAI/md_design-mkt`. В настройках Actions этого репозитория исходников добавь secret `MARKETPLACE_TOKEN`: fine-grained GitHub token с доступом только к `md_design-mkt` и правом **Contents: Read and write**. Ветка `main` магазина должна разрешать push владельцу токена.
2. Отправь проверенные исходники в `main`.
3. Создай тег свободной версии в формате `MAJOR.MINOR.PATCH`, без префикса `v`, и отправь его:

   ```powershell
   git tag 0.1.0
   git push origin 0.1.0
   ```

4. Дождись успешных **Build md-design plugin** и **Publish md-design marketplace** в Actions. При сбое публикации повтори её workflow с `build_run_id` успешной сборки тега.

CI проверяет pull request и стабильные теги; обычный push ветки сборку не запускает. Версия релиза берётся из тега. Готовый плагин публикуется в `main` репозитория `md_design-mkt`.

Материалы: [навык](skills/md-design/SKILL.md), [синтаксис](skills/md-design/references/syntax.md), [скриншоты и XML](skills/md-design/references/reconstruction.md), [примеры](prototypes/), [upstream и локальные патчи](vendor/UPSTREAM.json).

## Лицензия

Собственные материалы — [MPL 2.0](LICENSE). Исходный [md_design](https://github.com/crimsongoldteam/md_design) — [MIT](vendor/md_design/LICENSE.md). Лицензии сторонних компонентов включены в сборку.
