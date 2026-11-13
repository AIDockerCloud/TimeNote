# TimeNote for SiYuan

TimeNote's timeline and calendar views inside SiYuan. Shares the same renderer,
parser, write-back rules and remote aggregation as the Obsidian build.

> ⚠️ **First release**: implemented against the SiYuan kernel source and covered by
> offline simulation tests, but **not yet verified on a real SiYuan instance**.
> Please run the checklist in `README.zh-CN.md` after installing.
>
> 🔧 **SiYuan 3.8 fix (2026-11-14, DEC-035)**: the original `v1.1.3-beta.1`
> `package.zip` showed only the toolbar buttons with no calendar view — the shared
> dependency-free moment shim lacked `isoWeekday()` and the error was silently
> swallowed. **Download `releases/download/v1.1.3/package.zip` (stable) instead**;
> the beta asset is stale. Any further failure now renders a red error card in the tab.

## Install

1. Build locally with `npm run build:plugins` → `dist/siyuan/package.zip`
   (`plugin.json`'s version is filled from the repository `manifest.json`).
2. Unzip into `<workspace>/data/plugins/timenote-siyuan/` so that `plugin.json`,
   `index.js`, `index.css` and `i18n/` sit directly in that folder.
3. Restart SiYuan and enable the plugin. A calendar icon appears in the top bar.

> **Release status (since v1.1.3-beta.1)**: `.github/workflows/release.yml`
> builds and attaches **`package.zip`** to every `v*` tag release automatically
> (no conflict with Blinko's `release.zip`). **Current stable release: `v1.1.3`** →
> `releases/download/v1.1.3/package.zip`; later stable builds follow
> `releases/download/v<version>/package.zip`. **Pre-release tags carry a suffix**,
> e.g. `releases/download/v1.1.3-beta.1/package.zip` (stale, do not use).

Marketplace installation is not supported in this release: SiYuan requires the
plugin name to match its own repository, while TimeNote keeps all three hosts in
one repository.

## Data model

Records live in **native SiYuan documents**, not in plugin-private files.
One document per day at `/<folder>/YYYY/Daily/MM/YYYY-MM-DD`; one block per
record line. Write-back is a line-level diff mapped to
`updateBlock` / `insertBlock` / `deleteBlock`, so existing block ids and block
references survive. All file access goes through the kernel `/api/*` endpoints.

SiYuan's own daily notes (documents carrying `custom-dailynote-yyyymmdd`) are
also picked up and merged into the same calendar.

## Features

Seven views (day / 3-day / week / month / quarter / year / timeline), block and
compact layouts, drag-to-retime, cross-day moves, task toggles, quick add,
sub-item details, and read-only aggregation of memos / Blinko over HTTP with a
60-second range cache. Quick add now has a required single-line **title** plus an
optional multi-line **body** (each body line is written as a Tab-indented child of
the title, so pressing Enter no longer creates an undated ALL DAY item). Dragging
a slot keeps a pending preview on the calendar that follows the dialog's time
range and title until the dialog is dismissed.

See `README.zh-CN.md` for settings, limits and the verification checklist.
