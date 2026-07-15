# Yuel Reading

Yuel Reading is a local-first MV3 browser extension for English reading analytics. The current MVP captures visible reading activity on HTTP and HTTPS pages where Chrome permits extension access and Yuel recording remains enabled, stores the event stream and aggregates locally, and surfaces reading stats, effective-duration trends and focus sessions, global and per-site recording controls, configurable daily check-in goals, 13-week reading visualizations, recent pages, vocabulary exposure, saved selections, Pack tags, and copyable/downloadable summary cards in extension UI pages. It also includes a standalone PDF reader that can open top-level network PDFs from Chrome by default and renders local or bounded remote documents through extension-packaged PDFium WASM workers with virtualized pages, chapter outlines, thumbnails, full-text search, text selection, and pan navigation.

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
CI=true pnpm test:stress:pdf-reader
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
- `declarativeNetRequestWithHostAccess`: installs narrowly scoped response-header rules for the PDF fallback path on Chrome versions where the public MIME handler API is unavailable.
- The static content script uses the same matches, so supported pages begin collecting by default without a Yuel-specific allow step.
- The dashboard reading profile can pause or resume all automatic recording. The popup can independently pause the exact current site; this preference does not remove Chrome permissions or delete existing records.
- Chrome remains the separate authority for extension site access and can restrict access globally or for an individual site. The popup and side panel distinguish browser restrictions from Yuel's global and current-site pauses.

On an accessible and enabled HTTP or HTTPS page, the content script emits local reading events as visible text segments enter and leave view. It watches the local recording setting and stops or restarts the collector immediately when the global or current-site preference changes; the background worker independently checks the same settings before every batch write. It identifies English reading content from the actual candidate text instead of trusting page-level `lang` declarations, so English articles embedded in localized or translated pages remain eligible while non-English prose and localized technology keyword lists are skipped. It supports SPA-style dynamic pages by watching readable DOM mutations, debouncing same-route content refreshes such as infinite-scroll additions, and polling/listening for client-side route changes so React, Vue, and Next.js pages can rebuild page snapshots after `pushState`, hash, or popstate navigation. Each web snapshot sends its complete page metadata and chunk text once in a registration message; later flushes carry only the registered `snapshotId` and events. The background keeps this registration in a bounded sender-scoped memory cache, and a suspended MV3 worker can request an automatic re-registration without changing event IDs. Viewport exposure uses the version 2 Budgeted Exposure Model: a one-second heartbeat creates one engagement-gated attention-time budget, then capped weighted water-filling distributes that time across sentence-aligned segments targeting 16–24 words, with an 8-word minimum, using additive Gaussian-weighted text geometry from `Range.getClientRects()`. Each segment converts its allocated attention time to effective words once, using the active reading pace and a local content-rate multiplier; code, headings, lists, and body prose therefore consume the same shared time without pretending they are read at the same word rate. Document visibility and window focus gate effective attention, and stale scroll velocity expires after a short quiet period. The storage layer uses the local reading pace profile when one exists, otherwise it falls back to 220 WPM. The background worker persists batches roughly every 15 seconds, retries failed collector flushes, applies segment-level session/day/lifetime caps, records raw viewport exposure separately from effective attention time, merges effective intervals on the same page and technical session when their gap is at most five minutes, and tags matched vocabulary by effective segment coverage with the bundled Tech English Pack. Dashboard reads merge nearby page records again into cross-page focus sessions while preserving source and page counts. Effective reading time is an explainable attention estimate, not a claim of exact eye-on-text dwell time.

Users can intentionally store raw selected text by highlighting text on a page and choosing "Save selection to Yuel" from the browser context menu. This writes a local `savedItems` record with the selected text, source domain, and a `selection` tag, and increments local vocabulary saved counts for trackable English words; ordinary text selection events remain hashed telemetry and do not store raw text. PDF selections can be saved from the in-reader selection menu. Those records keep a separate local PDF annotation anchor with the stable document ID, page index, source rectangles, and text hash, so Dashboard and Side Panel excerpts can reopen the reader at the source without exposing the quote in the URL.

## MVP Surfaces

- Popup: a current-site control center with an exact-site recording switch and distinct active, Yuel-paused, or browser-restricted state first, a compact today summary, a switch for choosing Yuel or Chrome as the top-level network PDF handler, and side-panel/dashboard launch actions.
- Side panel: the current reading companion, showing current web-page or PDF-document progress when local reading data exists, today’s reading input, recent vocabulary assets, saved highlights, and sticky card/dashboard actions.
- Dashboard: a reading ledger with a compact today summary, a global automatic-recording switch, configurable effective-word check-in goal and progress, a 13-week activity heatmap, effective-word trend, weekday rhythm, input-composition charts, effective-duration summaries and daily trends, source breakdowns, recent focus sessions, goal-gated share-card preview and export actions, recent measured pages with browser-cached site icons, vocabulary assets, saved highlights, reading pace calibration/reset, and quiet local-data management.
- PDF reader: a standalone workspace launched from the Popup, a saved-excerpt source backlink, or a supported top-level Chrome PDF navigation, with local-file and bounded remote-URL loading, password retry, virtualized continuous scrolling, page navigation, fit-width/fit-page/custom zoom, content-level trackpad gestures, rotation, keyboard controls, hand-tool panning, low-resolution base pages, high-resolution visible tiles, a single-context chapter-outline/thumbnail/search panel, full-text result navigation and highlighting, clickable embedded links and read-only existing annotations, text selection with copy or local excerpt saving, print and original-name download actions, recent documents, and restoration of page position, zoom, rotation, and reading mode. Remote recent documents reopen from their stored URL and are accepted only when their content hash still matches. Because Yuel does not retain local PDF bytes, local recent documents and excerpt backlinks ask the user to reselect the original file before the hash-verified restore. PDFium text runs feed the same local reading-session protocol as web pages, including page lifecycle, visible text blocks, viewport exposure, scroll velocity, idle/activity state, and hashed selection telemetry.
- Context menu: explicit selected-text saving into the local saved-items table.

Pages that were opened but have no measured effective reading words can exist in local storage, but they are not counted as read pages or shown as recent reading history.

## Chrome PDF Handling

The popup preference "Default to Yuel" is enabled by default. The background worker feature-detects Chrome's public `chrome.mimeHandler` API instead of relying on a hard-coded browser version:

- When the native API is available, Yuel registers `application/pdf`, synchronizes Chrome's per-MIME enabled option, and consumes the browser-provided one-use stream. If stream acquisition or validation fails, the reader asks Chrome to fall back to its native handler.
- Otherwise, Yuel installs dynamic Declarative Net Request rules for top-level HTTP or HTTPS `GET` navigations. A standard `application/pdf` response is redirected to the reader; `.pdf` URLs served as `application/octet-stream` are also supported.
- Responses marked `Content-Disposition: attachment` remain downloads. Embedded PDFs, `POST` responses, local `file://` URLs, and `blob:` or `data:` documents are not intercepted by the fallback path.
- The fallback must request the PDF URL again because DNR cannot transfer the first response body into the extension page. That second request includes applicable Chrome cookies, but single-use download URLs can still fail. The native stream path does not repeat the origin request.

Turning the popup preference off removes the fallback rules or disables the native MIME registration, returning subsequent PDFs to Chrome. Existing reader tabs and locally stored reading records are unchanged.

## Daily Check-in Goal

The daily check-in goal defaults to 500 effective words and can be changed in the dashboard reading profile to any whole-word value from 1 to 100,000. A day counts toward the streak only when its effective-word total reaches the active goal. Saving a new goal recalculates historical streaks against that goal, while the setting itself remains local and is preserved when reading data is cleared. The share card stays unavailable until the current day has reached the goal, then lets the user choose a theme, show one to three reading domains, and toggle source icons or the streak; these card preferences are stored locally.

Across the popup, side panel, and dashboard, the shared Yuel Logo also acts as a glanceable daily-goal indicator: unread capacity remains gray, effective reading fills the mark green from bottom to top, and reaching the goal adds a bounded champagne-gold completion glow. The same component exposes numeric progress semantics to assistive technology and keeps a static completed treatment when reduced motion is requested.

The Chrome toolbar Logo mirrors the same local daily state in 16 legible progress steps sized for the 16-DIP browser action. Its tooltip exposes the exact effective-word total and active goal, while completion adds a static gold outline plus a `✓` badge so the state does not depend on color alone. The reading profile includes a local switch for this progress feedback; turning it off restores the static green Logo, default tooltip, and empty badge without changing reading collection. The preference survives local reading-data clearing. The background refreshes the active icon mode after stored reading batches, goal or toolbar-setting changes, data clearing, extension startup, and the next local-day rollover.

## Reading Pace Calibration

The dashboard includes an onboarding reading pace calibration flow. Each run randomly selects one of four 200–260-word English passages and asks three comprehension questions matched to that material. The timer accumulates only while the dashboard is visible and focused; hidden-tab, unfocused-window, and question-answering time are excluded. A 3/3 result blends the observed pace at 0.35 weight, 2/3 uses 0.15, and lower comprehension rejects the timing sample; every passage word count uses the same tokenizer as page metrics. A calibrated profile can be restored to the 220 WPM default; reset also clears unfinished adaptive episodes so an old partial sample cannot immediately recreate the removed pace.

Automatic adaptation accepts progression episodes on sufficiently long pages: prose segments must dwell in the central attention band, progress toward the top, and meet minimum completed-word, segment-count, and active-time thresholds across persisted batches. Continuous scroll events share one gesture-speed baseline until 750 ms of quiet, so trackpad bursts are not reinterpreted from each roughly 100 ms event interval. Forward scrolling ends an episode only above `5 ×` the active reading pace; the existing engagement model can still reduce effective attention between `1.6 ×` and `5 ×`. A reverse correction is tolerated while the page remains within `1.5%` of its furthest scroll progress, bounded to 80–240 px; a larger retreat ends the episode. Readable DOM changes, web viewport resizing, and PDF zoom or rotation reset only the absolute scroll-coordinate baseline, preserving valid episode evidence across layout changes. Page hiding, focus loss, idle time, or a ten-minute ceiling ends the current episode, while later valid events in the same stored batch can begin the next one.

Every qualified episode produces a confidence score from completed words, completed segments, and active duration. That confidence directly scales the existing `0.12 / 0.06 / 0.03` EMA step, and `adaptiveSampleCount` records the number of accepted adaptive episodes. When one batch completes multiple qualified episodes, their EMA updates are applied in event order. There is no default-profile buffer or three-sample warm-up. Static visible viewports do not calibrate speed, and adaptive WPM is never derived from the budget model's own `effectiveWords / minutes` output.

## Verification

Use these commands before shipping a change:

```bash
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm test:e2e
CI=true pnpm test:browser-dom
CI=true pnpm test:stress:large-text
CI=true pnpm test:stress:pdf-reader
CI=true pnpm test:real-pages
CI=true pnpm test:extension-smoke
CI=true pnpm test:extension-browser-smoke
```

`test:browser-dom` launches a temporary local fixture page in Playwright-managed Chromium and runs source modules against a real browser DOM. It covers native layout and `Range` geometry used by text block extraction without requiring a packaged extension build. The default browser is Playwright's bundled Chromium, so system Chrome is not required; `CHROME_PATH` remains an optional override for the non-extension DOM and corpus harnesses. Set `YUEL_BROWSER_DOM_HEADLESS=false` to watch the run.

The browser DOM smoke suite also runs a source-module collector fixture with a `wxt/browser` runtime stub to verify SPA content injection and client-side route replacement in real Chromium.

`test:stress:large-text` is an opt-in pressure test for large reading documents. It loads a generated 1,200-paragraph browser DOM fixture, verifies extraction and native `Range` geometry against roughly 97k words while filtering excluded page chrome, and runs a 2,000-tick aggregation batch with 80 visible chunks per tick. It uses the same Playwright-managed Chromium runtime as `test:browser-dom`.

`test:stress:pdf-reader` builds the packaged extension and opens a generated 160-page local PDF by default. It waits for sequential PDFium analytics extraction, verifies that the virtual scroller keeps at most four page shells mounted at the beginning and after a last-page jump, bounds renderer DOM and retained JavaScript heap growth, confirms no remote requests, and flushes measured PDF exposure through the existing dashboard. Tune it with `YUEL_PDF_STRESS_PAGES`, `YUEL_PDF_STRESS_LINES`, or `YUEL_PDF_STRESS_MAX_HEAP_MB`.

`test:real-pages` is an opt-in live-site benchmark. It opens a public English documentation/article corpus in Playwright-managed Chromium, injects a benchmark script generated from the current `src/content/extractBlocks.ts` source, and reports per-page text extraction time, range-geometry time, block count, and word count. It requires network access and can be tuned with `YUEL_REAL_PAGE_CONCURRENCY`, `YUEL_REAL_PAGE_SETTLE_MS`, and `YUEL_REAL_PAGE_TIMEOUT_MS`; set `YUEL_REAL_PAGE_REPORT_PATH=/tmp/yuel-real-pages.txt` to write the report to a file.

`test:extension-smoke` builds the Chrome MV3 output and validates the generated manifest, required HTTP/HTTPS host permissions, PDF MIME registration and fallback permission, web-accessible reader entrypoint, all-site content-script matches, context-menu capability, core extension pages including `pdf-reader.html`, the PDFium-compatible extension CSP, the bundled WASM asset, background worker, and content script artifacts.

`test:e2e` and `test:extension-browser-smoke` build the same output and run the packaged extension through Playwright Test. A custom fixture launches bundled Chromium with one isolated temporary profile per test, discovers the MV3 service worker and extension ID, verifies the popup, side panel, dashboard, and PDF reader pages, confirms that an authenticated top-level HTTPS PDF opens in Yuel by default and returns to Chrome when the preference is disabled, renders a generated two-page local PDF through packaged PDFium with pixel evidence and no remote requests, exercises nested chapter outlines, embedded link navigation, thumbnail navigation, content-level trackpad zoom, search highlighting, pan-mode switching, text selection/copy/save, PDF download, Dashboard source backlinks, local-file identity checks, recent-document reopening, view-state restoration, and responsive panel geometry, verifies the PDF side-panel context and dashboard exposure through the extension runtime, records a sample web runtime batch, and serves a local HTTPS reading page to prove the packaged all-site content script can auto-capture reading data. The runner uses one worker and retains a trace plus screenshot on failure. It runs headlessly by default; use `pnpm test:e2e:headed` or set `YUEL_BROWSER_SMOKE_HEADLESS=false` for an intentional visible run. The local HTTPS check needs `openssl` for its temporary self-signed certificate. Browser suites must run outside process sandboxes that block Chromium startup or localhost ports.

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
- `src/content/` extracts DOM text blocks and adapts browser geometry, scrolling, and selection into the shared reading session.
- `src/analytics/` owns the source-neutral reading session lifecycle, ordered batch delivery, visibility transitions, viewport exposure heartbeat, focus and idle state, scroll velocity, selection telemetry, and viewport geometry.
- `src/domain/` contains pure types, metrics, and Pack validation.
- `src/analysis/` contains lightweight English tokenization and the shared sentence-aligned 8–24 word chunking used by every reading source.
- `src/storage/` owns the Dexie schema, write repository, aggregate updates, and read-side stats queries.
- `src/background/pdfHandler.ts` owns native MIME option synchronization, conservative DNR fallback registration, and PDF handler preference changes.
- `src/permissions/` combines current-tab Chrome host access with Yuel's global and exact-site recording state.
- `src/packs/` contains declarative Pack data examples used for local vocabulary tagging.
- `src/pdf/source/` owns bounded local-file and remote-URL acquisition, validation, progress, cancellation, and stable resource IDs.
- `src/pdf/engine/` owns EmbedPDF plugin registration and the packaged PDFium WASM URL boundary.
- `src/pdf/viewer/` owns the standalone reader workspace, document lifecycle, rendering and interaction layers, contextual chapter-outline/thumbnail/search navigation, controls, and reader states.
- `src/pdf/analytics/` owns sequential PDFium text-run extraction, stable document/page/chunk identities, shared English chunking, source-coordinate rectangles, rotation-aware projection, event-safe chunk snapshots, the virtualized reader-layout adapter, and the bridge into the source-neutral reading session.

Reading batches remain backward compatible with legacy full web snapshots while supporting resource-backed readers through optional `resourceType` and `resourceId` page metadata. New web collectors register the full current-page snapshot with their first event batch, then send event-only references for the lifetime of that snapshot. The registration cache is ephemeral, sender-scoped, capped at 32 entries, and expires inactive entries after 30 minutes; cache loss returns `snapshot-missing` so the collector can re-register and replay safely. PDF batches keep the document-level `totalWords` but may include only chunks referenced by that batch's visibility events, so long documents do not resend all extracted text on every flush; storage accumulates unique coverage only while the stable PDF resource identity matches. One PDF document maps to one existing page-level reading aggregate, and its physical pages are stable sections referenced by `sectionId` on text chunks. These fields are stored without new Dexie indexes or a database-version migration.

## Privacy Posture

The manifest requires access to all HTTP and HTTPS pages so reading collection starts without a Yuel-specific per-site allow step. Yuel adds a local global recording switch and exact-site exclusions, while Chrome remains the authority for browser-level extension site access and can restrict Yuel globally or for an individual site.

By default, page title and URL are stored as hashes. Raw page text is not stored in the chunk table; chunk text is only carried through local extension messages for analysis and vocabulary exposure updates. Raw selected text is stored only when the user explicitly chooses the Yuel context-menu save action. The dashboard can clear local reading data after confirmation without changing the global recording switch, exact-site preferences, or Chrome's extension site-access settings.

Recent-page icons use Chrome's local favicon service through the manifest's `favicon` permission. Opening the dashboard does not fetch icon files directly from the recorded websites.

PDF bytes remain in the reader page and worker lifecycle and are not written to the Yuel database. Remote PDF URLs currently download the complete file before PDFium opens it, with declared and measured size limits; true HTTP Range loading remains a separate future source adapter. The DNR fallback repeats the intercepted top-level request with applicable Chrome cookies but does not store credentials itself. As with manually opened remote PDFs, the source URL may be retained locally for recent-document reopening. PDFium WASM and executable workers are served from the extension package, and the reader disables remote font fallback.
