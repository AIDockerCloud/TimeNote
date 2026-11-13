# TimeNote for Blinko

TimeNote's timeline and calendar views inside Blinko, sharing the same renderer,
parser, write-back rules and remote aggregation as the Obsidian / SiYuan builds.

> ⚠️ **First release**: implemented against Blinko's plugin runtime source and
> covered by offline simulation tests, but **not yet verified on a real Blinko
> instance**. Run the checklist in `README_zh.md` after installing.

## Install

Blinko downloads `release.zip` from
`https://github.com/AIDockerCloud/TimeNote/releases/download/v<version>/release.zip`.
Since `v1.1.3-beta.1`, `.github/workflows/release.yml` builds and attaches
`dist/blinko/release.zip` (named exactly `release.zip`) to every `v*` tag release
automatically. **Current stable release: `v1.1.3`** (includes the DEC-035 fix for
the "buttons but no view" failure). Latest points at it, so **remote install works**:

1. Settings → Plugins, then **"Install from GitHub"** at the top right of the
   Marketplace tab (TimeNote is not in the official marketplace list);
2. Paste `https://github.com/AIDockerCloud/TimeNote` — **repo URL only, no tag or
   path**. The dialog asks `/releases/latest` for the version (`1.1.3`) and the
   server then fetches `releases/download/v1.1.3/release.zip`;
3. Requires **superAdmin**; the plugin list refreshes automatically afterwards.

Two verified details: the install directory is named after the **repo**
(`.blinko/plugins/TimeNote/`), not the `timenote-blinko` in `plugin.json` — the
server loads by the DB `path`, so this does not affect runtime; and the version
shown in the list comes from the DB metadata written at install time (`1.1.3`).

**Pre-release tags carry a suffix** (e.g. `v1.1.3-beta.1`) and GitHub's `latest`
endpoint always skips pre-releases, so pre-releases **cannot be installed this
way** — download them manually. `v1.1.3-beta.1` is a stale asset without the fix.
`plugin.json.version` is the base version (e.g. `1.1.3`), filled from `manifest.json`.

## Data model

Records are **native Blinko notes**. One note per record line; the date and time
live in the note's first line (`- 09:00 ...`) and in `metadata.timenote`.
Write-back is a line-level diff mapped to `notes.upsert.mutate`; cross-day moves
create a note for the target day and put the source note into the recycle bin
(`trashMany`, recoverable). The plugin uses the logged-in session through
`window.Blinko.api`, so no extra API token is needed for local records.

## Features

Seven views, block / compact layouts, drag-to-retime, cross-day moves, task
toggles, quick add, and read-only aggregation of memos / remote Blinko via HTTP
with a 60-second range cache. Quick add now has a required single-line **title**
plus an optional multi-line **body** (each body line becomes a Tab-indented child
of the title, so pressing Enter no longer creates an undated ALL DAY item), and
dragging a slot keeps a pending preview that follows the dialog's time range.

See `README_zh.md` for settings, limits and the verification checklist.
