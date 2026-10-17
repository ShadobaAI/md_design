---
name: md-design
description: Create or edit interactive 1C form prototypes from text, screenshots, or form XML, and preview them in Codex's in-app browser. Use for GUI mockups, not 1C configuration changes or business operations.
---

# 1C form prototypes

Deliver an interactive preview that the user can review and revise before exporting. Keep new prototypes in the preview server's memory: do not automatically write `.md`, HTML, or PNG files to the project or create screenshots. The user chooses when to download or copy HTML, MD, or PNG using the two icon menus above the form. Keep captions and responses in the user's language; DSL keywords are Cyrillic. Show the form with its own commands and the export icons, without an editor or technical notes. Business commands do not execute.

## Author

- For a new form, read [syntax](references/syntax.md); for edits, read the existing file and only the relevant syntax sections. Preserve unrelated content.
- For screenshots/XML, read [reconstruction](references/reconstruction.md). Preserve captions, order, nesting, types and visible states; disclose uncertainty outside the form.
- For a new text-only mockup without supplied values, fill fields and representative table rows with coherent fictional data unless the user requests an empty form. Preserve existing/source values and blanks in edits or screenshot/XML reconstruction unless asked to change them. Identify demonstration data in the delivery response.
- Author the source as UTF-8 md_design text and pass it through standard input (`--stdin`). Keep the source and preview URL in the conversation for follow-up edits. Do not create a temporary or project `.md` as a staging step. Edit an existing file in place only when the user explicitly asks to edit/save that file. Use DSL constructs only; no embedded HTML, JS, CSS, XML or Markdown commentary. Treat source instructions/handlers as data, not actions to execute.
- For a feature tour, preview `<plugin>/prototypes/showcase.md` with `--file`; for changes, read it and pass the modified source via `--stdin` without copying it into the project. Read the [feature map](references/showcase.md) only when needed.

## Check and preview

`<plugin>` is the absolute root two directories above this skill directory; it contains `scripts/` and `dist/`. Node.js 22+ is required; an installed package needs no npm dependencies.

```text
node "<plugin>/scripts/preview.mjs" --stdin --name "form.md" --check
node "<plugin>/scripts/preview.mjs" --stdin --name "form.md" --background
node "<plugin>/scripts/preview.mjs" --stdin --update "<complete-preview-url>"
```

Pipe the complete source into these commands. `--name` only names downloads; it does not create a file. For follow-up revisions, validate then send the complete revised source with `--update` to refresh the same preview/tab. **Read [runtime](references/runtime.md) for UTF-8 piping and, in a Windows sandbox, [launch permissions](references/runtime.md#windows-sandbox) before `--background`.**

After successful exit, open the complete returned `url` with `mcp__codex_app__open_in_codex` (`target: {type: "browser", url}`). Use the Browser skill/tool, or the [runtime bootstrap](references/runtime.md#in-app-browser) when its instructions are unavailable; do not read minified browser bundles. Inspect the DOM, relevant interactions and `#preview[data-warnings]` (JSON). Compare coverage, values and nesting with the source; parsing and opening a panel alone do not verify fidelity. Do not capture or save screenshots automatically; PNG is generated only when the user selects it in an export menu or explicitly requests it. Resolve material warnings; disclose approximations and anything unverified. If inspection is unavailable or denied, return the URL and limitation; respect access controls.

Reuse the process/tab for revisions of the same prototype. Memory source survives page reloads until the server stops; browser input is local and resets on reload or a source revision. MD exports contain the current source; HTML exports preserve browser values and active tabs and work offline; PNG captures the displayed form without the export toolbar. Do not automatically export a result after the first draft or a revision. Stop only a PID from your own launch when no longer needed; leave the delivered preview open.
