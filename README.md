# Yuel Reading

Yuel Reading is a local-first MV3 browser extension for English reading analytics. The current MVP captures visible reading activity on supported or user-enabled sites, stores the event stream and aggregates locally, and surfaces reading stats, recent pages, vocabulary exposure, and Pack tags in extension UI pages.

## Stack

- WXT 0.20 with Chrome MV3 output
- React 19 for popup, side panel, and dashboard pages
- Tailwind CSS 4 through the WXT React module
- Dexie over IndexedDB for local reading data
- Vitest for domain, storage, permission, content, and UI smoke tests

## Development

```bash
pnpm install
CI=true pnpm test
CI=true pnpm test:extension-smoke
CI=true pnpm typecheck
CI=true pnpm build
pnpm dev
```

The production extension output is generated at `.output/chrome-mv3/`.

## Local Extension Flow

Build and load the extension in Chrome-compatible browsers:

```bash
CI=true pnpm build
```

Then open `chrome://extensions`, enable developer mode, choose "Load unpacked", and select `.output/chrome-mv3/`.

The extension can collect reading activity in two ways:

- Starter static matches: MDN, GitHub, Medium, Wikipedia, and arXiv load the content script without asking for broad host access.
- User-enabled sites: open the popup on an `http` or `https` page, choose "Enable current site", and Yuel requests optional host permission only for that origin. Enabled sites are persisted and re-registered on startup.

Once enabled, the content script emits local reading events as visible text blocks enter and leave view. The background worker writes batches to IndexedDB, retries failed collector flushes on the next interval, aggregates effective words and reading minutes, and tags matched vocabulary with the bundled Tech English Pack.

## MVP Surfaces

- Popup: today’s effective words, reading time, page count, learning words, current-site permission state, enabled-site management, and a dashboard link.
- Side panel: compact reading companion summary with today’s metrics and top domain.
- Dashboard: today’s summary, recent measured-reading pages, vocabulary exposure, visible Pack tags such as `architecture` or `performance`, and a local data clear control.

Pages that were opened but have no measured effective reading words can exist in local storage, but they are not counted as read pages or shown as recent reading history.

## Verification

Use these commands before shipping a change:

```bash
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm test:extension-smoke
```

`test:extension-smoke` builds the Chrome MV3 output and validates the generated manifest, optional host permission boundary, core extension pages, background worker, and content script artifacts.

## Architecture

The scaffold follows the event-driven architecture from the product brief:

```text
Content script -> Reading events -> Background router -> IndexedDB -> UI pages
                                      |
                                      v
                              Local analysis / Pack rules
```

Key boundaries:

- `entrypoints/` contains WXT extension entrypoints only.
- `src/content/` extracts DOM text blocks and emits reading events.
- `src/domain/` contains pure types, metrics, and Pack validation.
- `src/analysis/` contains lightweight English tokenization.
- `src/storage/` owns the Dexie schema, write repository, aggregate updates, and read-side stats queries.
- `src/permissions/` owns optional host permission and dynamic content-script registration.
- `src/packs/` contains declarative Pack data examples used for local vocabulary tagging.

## Privacy Posture

The V0.1 manifest avoids mandatory `<all_urls>` access. Broad host access is optional, while the static starter content script covers MDN, GitHub, Medium, Wikipedia, and arXiv for early validation.

By default, page title and URL are stored as hashes. Raw page text is not stored in the chunk table; chunk text is only carried through local extension messages for analysis and vocabulary exposure updates. The dashboard can clear local reading data without changing enabled-site permissions.
