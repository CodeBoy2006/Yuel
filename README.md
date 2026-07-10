# Yuel Reading

Yuel Reading is a local-first MV3 browser extension for English reading analytics. The current MVP captures visible reading activity on supported or user-enabled sites, stores the event stream and aggregates locally, and surfaces reading stats, configurable daily check-in goals, recent pages, vocabulary exposure, saved selections, Pack tags, and copyable/downloadable summary cards in extension UI pages.

## Stack

- WXT 0.20 with Chrome MV3 output
- React 19 for popup, side panel, and dashboard pages
- Shared CSS design tokens with entrypoint-specific styles
- Dexie over IndexedDB for local reading data
- Vitest for domain, storage, permission, content, and UI smoke tests
- Playwright Test for packaged-extension E2E and Playwright-managed Chromium for browser fixtures

## Development

```bash
pnpm install
pnpm test:browser:install
CI=true pnpm test
CI=true pnpm test:e2e
CI=true pnpm test:browser-dom
CI=true pnpm test:stress:large-text
CI=true pnpm test:real-pages
CI=true pnpm test:extension-smoke
CI=true pnpm test:extension-browser-smoke
CI=true pnpm typecheck
CI=true pnpm build
pnpm dev
```

The production extension output is generated at `.output/chrome-mv3/`.
`pnpm dev` keeps the WXT watcher running without automatically opening Chrome; load `.output/chrome-mv3-dev/` manually when interactive browser testing is needed.

## Local Extension Flow

Build and load the extension in Chrome-compatible browsers:

```bash
CI=true pnpm build
```

Then open `chrome://extensions`, enable developer mode, choose "Load unpacked", and select `.output/chrome-mv3/`.

The extension can collect reading activity in two ways:

- Starter static matches: MDN, GitHub, Medium, Wikipedia, and arXiv load the content script without asking for broad host access.
- User-enabled sites: open the popup on an `http` or `https` page, choose "Enable current site", and Yuel requests optional host permission only for that origin. Enabled sites are persisted and re-registered on startup.

Once enabled, the content script emits local reading events as visible text segments enter and leave view. It identifies English reading content from the actual candidate text instead of trusting page-level `lang` declarations, so English articles embedded in localized or translated pages remain eligible while non-English prose and localized technology keyword lists are skipped. It supports SPA-style dynamic pages by watching readable DOM mutations, debouncing same-route content refreshes such as infinite-scroll additions, and polling/listening for client-side route changes so React, Vue, and Next.js pages can rebuild page snapshots after `pushState`, hash, or popstate navigation. Viewport exposure uses the version 2 Budgeted Exposure Model: a one-second heartbeat creates one engagement-gated attention-time budget, then capped weighted water-filling distributes that time across sentence-aligned segments targeting 16–24 words, with an 8-word minimum, using additive Gaussian-weighted text geometry from `Range.getClientRects()`. Each segment converts its allocated attention time to effective words once, using the active reading pace and a local content-rate multiplier; code, headings, lists, and body prose therefore consume the same shared time without pretending they are read at the same word rate. Document visibility and window focus gate effective attention, and stale scroll velocity expires after a short quiet period. The storage layer uses the local reading pace profile when one exists, otherwise it falls back to 220 WPM. The background worker persists batches roughly every 15 seconds, retries failed collector flushes, applies segment-level session/day/lifetime caps, records raw viewport exposure separately from effective attention time, and tags matched vocabulary by effective segment coverage with the bundled Tech English Pack. Effective reading time is an explainable attention estimate, not a claim of exact eye-on-text dwell time.

Users can intentionally store raw selected text by highlighting text on a page and choosing "Save selection to Yuel" from the browser context menu. This writes a local `savedItems` record with the selected text, source domain, and a `selection` tag, and increments local vocabulary saved counts for trackable English words; ordinary text selection events remain hashed telemetry and do not store raw text.

## MVP Surfaces

- Popup: a current-site control center with the active site’s recording state first, a compact today summary, side-panel/dashboard launch actions, collapsed enabled-site management, and starter-site guidance only when useful.
- Side panel: the current reading companion, showing current page progress when local page data exists, today’s reading input, recent vocabulary assets, saved highlights, and sticky card/dashboard actions.
- Dashboard: a reading ledger with a compact today summary, configurable effective-word check-in goal and progress, goal-gated share-card preview and export actions, recent measured pages with browser-cached site icons, vocabulary assets, saved highlights, reading pace calibration, and quiet local-data management.
- Context menu: explicit selected-text saving into the local saved-items table.

Pages that were opened but have no measured effective reading words can exist in local storage, but they are not counted as read pages or shown as recent reading history.

## Daily Check-in Goal

The daily check-in goal defaults to 500 effective words and can be changed in the dashboard reading profile to any whole-word value from 1 to 100,000. A day counts toward the streak only when its effective-word total reaches the active goal. Saving a new goal recalculates historical streaks against that goal, while the setting itself remains local and is preserved when reading data is cleared. The share card stays unavailable until the current day has reached the goal.

## Reading Pace Calibration

The dashboard includes an onboarding reading pace calibration flow. It times a fixed 200–260-word English passage and asks three comprehension questions. A 3/3 result blends the observed pace at 0.35 weight, 2/3 uses 0.15, and lower comprehension rejects the timing sample; the passage word count uses the same tokenizer as page metrics. Automatic adaptation only accepts forward-reading episodes on sufficiently long pages: prose segments must dwell in the central attention band, progress toward the top during normal forward scrolling, and meet minimum completed-word, segment-count, and active-time thresholds across persisted batches. Page hiding, focus loss, idle time, fast jumps, reverse reading, or a ten-minute ceiling ends an episode. The most recent five qualified episode rates are retained, a rolling median becomes eligible after three samples, and that robust value enters the existing slow `0.12 / 0.06 / 0.03` EMA. Static visible viewports do not calibrate speed, and adaptive WPM is never derived from the budget model's own `effectiveWords / minutes` output.

## Verification

Use these commands before shipping a change:

```bash
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm test:e2e
CI=true pnpm test:browser-dom
CI=true pnpm test:stress:large-text
CI=true pnpm test:real-pages
CI=true pnpm test:extension-smoke
CI=true pnpm test:extension-browser-smoke
```

`test:browser-dom` launches a temporary local fixture page in Playwright-managed Chromium and runs source modules against a real browser DOM. It covers native layout and `Range` geometry used by text block extraction without requiring a packaged extension build. The default browser is Playwright's bundled Chromium, so system Chrome is not required; `CHROME_PATH` remains an optional override for the non-extension DOM and corpus harnesses. Set `YUEL_BROWSER_DOM_HEADLESS=false` to watch the run.

The browser DOM smoke suite also runs a source-module collector fixture with a `wxt/browser` runtime stub to verify SPA content injection and client-side route replacement in real Chromium.

`test:stress:large-text` is an opt-in pressure test for large reading documents. It loads a generated 1,200-paragraph browser DOM fixture, verifies extraction and native `Range` geometry against roughly 97k words while filtering excluded page chrome, and runs a 2,000-tick aggregation batch with 80 visible chunks per tick. It uses the same Playwright-managed Chromium runtime as `test:browser-dom`.

`test:real-pages` is an opt-in live-site benchmark. It opens a public English documentation/article corpus in Playwright-managed Chromium, injects a benchmark script generated from the current `src/content/extractBlocks.ts` source, and reports per-page text extraction time, range-geometry time, block count, and word count. It requires network access and can be tuned with `YUEL_REAL_PAGE_CONCURRENCY`, `YUEL_REAL_PAGE_SETTLE_MS`, and `YUEL_REAL_PAGE_TIMEOUT_MS`; set `YUEL_REAL_PAGE_REPORT_PATH=/tmp/yuel-real-pages.txt` to write the report to a file.

`test:extension-smoke` builds the Chrome MV3 output and validates the generated manifest, optional host permission boundary, context-menu capability, core extension pages, background worker, and content script artifacts.

`test:e2e` and `test:extension-browser-smoke` build the same output and run the packaged extension through Playwright Test. A custom fixture launches bundled Chromium with one isolated temporary profile per test, discovers the MV3 service worker and extension ID, verifies the popup, side panel, and dashboard pages, records a sample runtime batch, and serves a local HTTPS starter-site page to prove the packaged content script can auto-capture reading data. The runner uses one worker and retains a trace plus screenshot on failure. It runs headlessly by default; use `pnpm test:e2e:headed` or set `YUEL_BROWSER_SMOKE_HEADLESS=false` for an intentional visible run. The starter-site check needs `openssl` for its temporary self-signed certificate. Browser suites must run outside process sandboxes that block Chromium startup or localhost ports.

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

Recent-page icons use Chrome's local favicon service through the manifest's `favicon` permission. Opening the dashboard does not fetch icon files directly from the recorded websites.
