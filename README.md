# Yuel Reading

Yuel Reading is a local-first MV3 browser extension for English reading analytics. The current MVP captures visible reading activity on supported or user-enabled sites, stores the event stream and aggregates locally, and surfaces reading stats, recent pages, vocabulary exposure, saved selections, Pack tags, and copyable/downloadable summary cards in extension UI pages.

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
CI=true pnpm test:browser-dom
CI=true pnpm test:extension-smoke
CI=true pnpm test:extension-browser-smoke
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

Once enabled, the content script emits local reading events as visible text blocks enter and leave view. Viewport exposure is measured with a Budgeted Exposure Model: each tick gets one active WPM-based reading budget capped by the currently visible weighted word supply, then allocates that budget across visible chunks by visibility, viewport position, and content weight. Split chunks from long text elements use DOM `Range.getClientRects()` to measure text-level viewport geometry so hidden portions of a long paragraph do not share the parent element's visible ratio. The storage layer uses the local reading pace profile when one exists, otherwise it falls back to the default 220 WPM collector value. The background worker writes batches to IndexedDB, retries failed collector flushes on the next interval, applies session/day/lifetime caps, records raw viewport exposure separately from effective reading time, and tags matched vocabulary by effective chunk coverage with the bundled Tech English Pack. Effective reading time is a WPM-folded time derived from effective words, not a claim of exact eye-on-text dwell time.

Users can intentionally store raw selected text by highlighting text on a page and choosing "Save selection to Yuel" from the browser context menu. This writes a local `savedItems` record with the selected text, source domain, and a `selection` tag, and increments local vocabulary saved counts for trackable English words; ordinary text selection events remain hashed telemetry and do not store raw text.

## MVP Surfaces

- Popup: a current-site control center with the active site’s recording state first, a compact today summary, side-panel/dashboard launch actions, collapsed enabled-site management, and starter-site guidance only when useful.
- Side panel: the current reading companion, showing current page progress when local page data exists, today’s reading input, recent vocabulary assets, saved highlights, and sticky card/dashboard actions.
- Dashboard: the reading progress instrument panel, with a prominent today hero, share-card preview and export actions, trend bars, recent measured pages, vocabulary assets, saved highlights, reading pace calibration, and a demoted local-data danger zone.
- Context menu: explicit selected-text saving into the local saved-items table.

Pages that were opened but have no measured effective reading words can exist in local storage, but they are not counted as read pages or shown as recent reading history.

## Reading Pace Calibration

The dashboard includes an onboarding reading pace calibration flow. It times a fixed 200-260 word English passage, asks three comprehension questions, and blends the observed WPM with the default pace by answer confidence. Future batches can adapt the same profile with an exponential moving average, but only from high-confidence raw viewport samples: sufficiently long pages, active and visible tab state, normal scroll speed, no long idle interval, and multiple reliable body chunks. Adaptive WPM is not derived from `effectiveWords / minutes`, because those values are already capped and folded outputs of the budget model.

## Verification

Use these commands before shipping a change:

```bash
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm test:browser-dom
CI=true pnpm test:extension-smoke
CI=true pnpm test:extension-browser-smoke
```

`test:browser-dom` launches a temporary local fixture page in Google Chrome through Chrome DevTools Protocol and runs source modules against a real browser DOM. It covers native layout and `Range` geometry used by text block extraction without requiring a packaged extension build. Set `CHROME_PATH` if Chrome is installed outside `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; set `YUEL_BROWSER_DOM_HEADLESS=false` to watch the run.

`test:extension-smoke` builds the Chrome MV3 output and validates the generated manifest, optional host permission boundary, context-menu capability, core extension pages, background worker, and content script artifacts.

`test:extension-browser-smoke` builds the same output, loads it into a temporary Google Chrome profile through Chrome DevTools Protocol, verifies the popup, side panel, and dashboard pages render, records a sample reading batch through the extension runtime, and serves a local HTTPS starter-site page to prove the packaged content script can auto-capture reading data. Set `CHROME_PATH` if Chrome is installed outside `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; the starter-site check also needs `openssl` for a temporary self-signed certificate.

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

By default, page title and URL are stored as hashes. Raw page text is not stored in the chunk table; chunk text is only carried through local extension messages for analysis and vocabulary exposure updates. Raw selected text is stored only when the user explicitly chooses the Yuel context-menu save action. The dashboard can clear local reading data after confirmation without changing enabled-site permissions.
