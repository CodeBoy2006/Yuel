# Yuel Reading

Yuel Reading is a local-first MV3 browser extension scaffold for English reading analytics. The first version establishes the framework, storage schema, event pipeline, and pack-safe analysis boundary.

## Stack

- WXT 0.20 with Chrome MV3 output
- React 19 for popup, side panel, and dashboard pages
- Tailwind CSS 4 through the WXT React module
- Dexie over IndexedDB for local reading data
- Vitest for pure domain and analysis tests

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
- `src/storage/` owns the Dexie database schema and write repository.
- `src/packs/` contains declarative Pack data examples.

## Privacy Posture

The V0.1 manifest avoids mandatory `<all_urls>` access. Broad host access is optional, while the static starter content script covers MDN, GitHub, Medium, Wikipedia, and arXiv for early validation.

By default, page title and URL are stored as hashes. Raw page text is not stored in the chunk table; chunk text is only carried through local extension messages for analysis and vocabulary exposure updates.
