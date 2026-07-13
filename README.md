# Yuel Reading

Yuel Reading is a local-first MV3 browser extension for English reading analytics. The current MVP captures visible reading activity on HTTP and HTTPS pages where Chrome permits extension access and Yuel recording remains enabled, stores the event stream and aggregates locally, and surfaces reading stats, global and per-site recording controls, configurable daily check-in goals, 13-week reading visualizations, recent pages, vocabulary exposure, saved selections, Pack tags, and copyable/downloadable summary cards in extension UI pages. It also includes a standalone PDF reader core that renders local or bounded remote documents through extension-packaged PDFium WASM workers.

## Stack

- WXT 0.20 with Chrome MV3 output
- React 19 for popup, side panel, and dashboard pages
- EmbedPDF Headless 2.14.4 with locally packaged PDFium WASM workers
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

The extension requests required host access for all HTTP and HTTPS pages:

- `host_permissions`: `http://*/*` and `https://*/*`.
- The static content script uses the same matches, so supported pages begin collecting by default without a Yuel-specific allow step.
- The dashboard reading profile can pause or resume all automatic recording. The popup can independently pause the exact current site; this preference does not remove Chrome permissions or delete existing records.
- Chrome remains the separate authority for extension site access and can restrict access globally or for an individual site. The popup and side panel distinguish browser restrictions from Yuel's global and current-site pauses.

On an accessible and enabled HTTP or HTTPS page, the content script emits local reading events as visible text segments enter and leave view. It watches the local recording setting and stops or restarts the collector immediately when the global or current-site preference changes; the background worker independently checks the same settings before every batch write. It identifies English reading content from the actual candidate text instead of trusting page-level `lang` declarations, so English articles embedded in localized or translated pages remain eligible while non-English prose and localized technology keyword lists are skipped. It supports SPA-style dynamic pages by watching readable DOM mutations, debouncing same-route content refreshes such as infinite-scroll additions, and polling/listening for client-side route changes so React, Vue, and Next.js pages can rebuild page snapshots after `pushState`, hash, or popstate navigation. Viewport exposure uses the version 2 Budgeted Exposure Model: a one-second heartbeat creates one engagement-gated attention-time budget, then capped weighted water-filling distributes that time across sentence-aligned segments targeting 16–24 words, with an 8-word minimum, using additive Gaussian-weighted text geometry from `Range.getClientRects()`. Each segment converts its allocated attention time to effective words once, using the active reading pace and a local content-rate multiplier; code, headings, lists, and body prose therefore consume the same shared time without pretending they are read at the same word rate. Document visibility and window focus gate effective attention, and stale scroll velocity expires after a short quiet period. The storage layer uses the local reading pace profile when one exists, otherwise it falls back to 220 WPM. The background worker persists batches roughly every 15 seconds, retries failed collector flushes, applies segment-level session/day/lifetime caps, records raw viewport exposure separately from effective attention time, and tags matched vocabulary by effective segment coverage with the bundled Tech English Pack. Effective reading time is an explainable attention estimate, not a claim of exact eye-on-text dwell time.

Users can intentionally store raw selected text by highlighting text on a page and choosing "Save selection to Yuel" from the browser context menu. This writes a local `savedItems` record with the selected text, source domain, and a `selection` tag, and increments local vocabulary saved counts for trackable English words; ordinary text selection events remain hashed telemetry and do not store raw text.

## MVP Surfaces

- Popup: a current-site control center with an exact-site recording switch and distinct active, Yuel-paused, or browser-restricted state first, a compact today summary, and side-panel/dashboard launch actions.
- Side panel: the current reading companion, showing current page progress when local page data exists, today’s reading input, recent vocabulary assets, saved highlights, and sticky card/dashboard actions.
- Dashboard: a reading ledger with a compact today summary, a global automatic-recording switch, configurable effective-word check-in goal and progress, a 13-week activity heatmap, effective-word trend, weekday rhythm, input-composition charts, goal-gated share-card preview and export actions, recent measured pages with browser-cached site icons, vocabulary assets, saved highlights, reading pace calibration/reset, and quiet local-data management.
- PDF reader: a standalone workspace launched from the Popup or Side Panel, with local-file and bounded remote-URL loading, password retry, continuous scrolling, page navigation, fit-width/fit-page/custom zoom, rotation, keyboard controls, low-resolution base pages, high-resolution visible tiles, and locally packaged WASM/Worker execution. Search, thumbnails, text selection, and reading-event integration remain follow-up slices.
- Context menu: explicit selected-text saving into the local saved-items table.

Pages that were opened but have no measured effective reading words can exist in local storage, but they are not counted as read pages or shown as recent reading history.

## Daily Check-in Goal

The daily check-in goal defaults to 500 effective words and can be changed in the dashboard reading profile to any whole-word value from 1 to 100,000. A day counts toward the streak only when its effective-word total reaches the active goal. Saving a new goal recalculates historical streaks against that goal, while the setting itself remains local and is preserved when reading data is cleared. The share card stays unavailable until the current day has reached the goal, then lets the user choose a theme, show one to three reading domains, and toggle source icons or the streak; these card preferences are stored locally.

Across the popup, side panel, and dashboard, the shared Yuel Logo also acts as a glanceable daily-goal indicator: unread capacity remains gray, effective reading fills the mark green from bottom to top, and reaching the goal adds a bounded champagne-gold completion glow. The same component exposes numeric progress semantics to assistive technology and keeps a static completed treatment when reduced motion is requested.

The Chrome toolbar Logo mirrors the same local daily state in 16 legible progress steps sized for the 16-DIP browser action. Its tooltip exposes the exact effective-word total and active goal, while completion adds a static gold outline plus a `✓` badge so the state does not depend on color alone. The reading profile includes a local switch for this progress feedback; turning it off restores the static green Logo, default tooltip, and empty badge without changing reading collection. The preference survives local reading-data clearing. The background refreshes the active icon mode after stored reading batches, goal or toolbar-setting changes, data clearing, extension startup, and the next local-day rollover.

## Reading Pace Calibration

The dashboard includes an onboarding reading pace calibration flow. It times a fixed 200–260-word English passage and asks three comprehension questions. A 3/3 result blends the observed pace at 0.35 weight, 2/3 uses 0.15, and lower comprehension rejects the timing sample; the passage word count uses the same tokenizer as page metrics. A calibrated profile can be restored to the 220 WPM default; reset also clears unfinished adaptive episodes so an old partial sample cannot immediately recreate the removed pace. Automatic adaptation can build a new profile later and only accepts forward-reading episodes on sufficiently long pages: prose segments must dwell in the central attention band, progress toward the top during normal forward scrolling, and meet minimum completed-word, segment-count, and active-time thresholds across persisted batches. Page hiding, focus loss, idle time, fast jumps, reverse reading, or a ten-minute ceiling ends an episode. The most recent five qualified episode rates are retained, a rolling median becomes eligible after three samples, and that robust value enters the existing slow `0.12 / 0.06 / 0.03` EMA. Static visible viewports do not calibrate speed, and adaptive WPM is never derived from the budget model's own `effectiveWords / minutes` output.

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

`test:extension-smoke` builds the Chrome MV3 output and validates the generated manifest, required HTTP/HTTPS host permissions, all-site content-script matches, context-menu capability, core extension pages including `pdf-reader.html`, the PDFium-compatible extension CSP, the bundled WASM asset, background worker, and content script artifacts.

`test:e2e` and `test:extension-browser-smoke` build the same output and run the packaged extension through Playwright Test. A custom fixture launches bundled Chromium with one isolated temporary profile per test, discovers the MV3 service worker and extension ID, verifies the popup, side panel, dashboard, and PDF reader pages, renders a generated local PDF through packaged PDFium with pixel evidence and no remote requests, records a sample runtime batch, and serves a local HTTPS reading page to prove the packaged all-site content script can auto-capture reading data. The runner uses one worker and retains a trace plus screenshot on failure. It runs headlessly by default; use `pnpm test:e2e:headed` or set `YUEL_BROWSER_SMOKE_HEADLESS=false` for an intentional visible run. The local HTTPS check needs `openssl` for its temporary self-signed certificate. Browser suites must run outside process sandboxes that block Chromium startup or localhost ports.

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
- `src/permissions/` combines current-tab Chrome host access with Yuel's global and exact-site recording state.
- `src/packs/` contains declarative Pack data examples used for local vocabulary tagging.
- `src/pdf/source/` owns bounded local-file and remote-URL acquisition, validation, progress, cancellation, and stable resource IDs.
- `src/pdf/engine/` owns EmbedPDF plugin registration and the packaged PDFium WASM URL boundary.
- `src/pdf/viewer/` owns the standalone reader workspace, document lifecycle, rendering layers, controls, and reader states.

## Privacy Posture

The manifest requires access to all HTTP and HTTPS pages so reading collection starts without a Yuel-specific per-site allow step. Yuel adds a local global recording switch and exact-site exclusions, while Chrome remains the authority for browser-level extension site access and can restrict Yuel globally or for an individual site.

By default, page title and URL are stored as hashes. Raw page text is not stored in the chunk table; chunk text is only carried through local extension messages for analysis and vocabulary exposure updates. Raw selected text is stored only when the user explicitly chooses the Yuel context-menu save action. The dashboard can clear local reading data after confirmation without changing the global recording switch, exact-site preferences, or Chrome's extension site-access settings.

Recent-page icons use Chrome's local favicon service through the manifest's `favicon` permission. Opening the dashboard does not fetch icon files directly from the recorded websites.

PDF bytes remain in the reader page and worker lifecycle and are not written to the Yuel database. Remote PDF URLs currently download the complete file before PDFium opens it, with declared and measured size limits; true HTTP Range loading remains a separate future source adapter. PDFium WASM and executable workers are served from the extension package, and the reader disables remote font fallback.
