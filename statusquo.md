## [2026-06-27 20:39] Yuel MV3 Scaffold
- **Changes:** Initialized a WXT/React MV3 extension with Tailwind, Dexie storage schema, content-script reading event collection, background message routing, Pack validation, UI shells, tests, and documentation.
- **Status:** Completed
- **Next Steps:** Build the runtime whitelist flow and replace starter-site static matching with user-controlled optional host permission registration.
- **Context:** Use `CI=true` with pnpm commands in this environment. The generated manifest keeps broad hosts in `optional_host_permissions`; current static content-script matches cover only starter reading sites.

## [2026-06-27 21:16] Reading Exposure Aggregates
- **Changes:** Added `TextBlockExposureTick` events, periodic content-script exposure ticks, pure reading batch aggregation tests, and repository updates that accumulate chunk/page/daily reading stats from measured exposure.
- **Status:** Completed
- **Next Steps:** Connect popup, side panel, or dashboard UI to IndexedDB so users can see today’s real reading totals.
- **Context:** Effective words are capped per text chunk during storage updates; vocabulary exposure updates now only run for chunks that had measurable exposure in the batch.

## [2026-06-27 21:20] Popup Reading Stats
- **Changes:** Added a tested `readingStats` query layer for today’s local reading summary and wired popup metrics to real IndexedDB-backed values instead of static placeholders.
- **Status:** Completed
- **Next Steps:** Add a dashboard or side panel detail view for recent pages, top domains, and vocabulary exposure so the local data pipeline has a richer user-facing surface.
- **Context:** Popup now reports loading, empty, and unavailable states while keeping the query logic isolated in `src/storage/readingStats.ts`.

## [2026-06-27 21:24] Dashboard Reading Details
- **Changes:** Extended the `readingStats` query layer with dashboard details for recent pages and vocabulary exposure, then replaced the dashboard’s static scaffold-first view with real local reading metrics and detail lists.
- **Status:** Completed
- **Next Steps:** Add a user-controlled site enablement flow so the extension can move beyond starter-site static matches while preserving optional host permissions.
- **Context:** Dashboard detail queries intentionally expose only hashed-page-safe metadata, domains, counters, and vocabulary lemmas already stored in local IndexedDB.

## [2026-06-27 21:29] Current Site Enablement
- **Changes:** Added a tested `siteAccess` permission service, popup current-site enablement controls, optional host permission request handling, content-script injection, and a `startReadingCollectorOnce` guard to avoid duplicate collectors after dynamic injection.
- **Status:** Completed
- **Next Steps:** Replace static starter-site matching with persisted user-enabled site registration or startup-time rehydration so enabled sites continue collecting after reload.
- **Context:** The generated manifest still uses broad hosts only under `optional_host_permissions`; this slice does not add mandatory host access.

## [2026-06-27 21:35] Enabled Site Script Registration
- **Changes:** Added a tested dynamic content-script registration service, rehydrated enabled-site scripts from background install/startup, and refreshed registrations immediately after a site is enabled.
- **Status:** Completed
- **Next Steps:** Add a user-facing enabled-sites management view so users can inspect and remove granted sites.
- **Context:** Dynamic scripts are registered from `yuel.enabledSiteOrigins` and use the existing guarded collector entrypoint, keeping broad host access optional rather than mandatory.

## [2026-06-27 21:40] Enabled Site Management
- **Changes:** Added tested enabled-site listing and removal flows, including storage updates, optional host permission removal, dynamic content-script refresh, and popup controls for removing enabled sites.
- **Status:** Completed
- **Next Steps:** Add a browser runtime smoke test for the enable/remove flow against the built extension.
- **Context:** Removing a site updates `yuel.enabledSiteOrigins`, calls `permissions.remove`, and refreshes dynamic content scripts while keeping starter static matches unchanged.

## [2026-06-27 21:46] Extension Build Smoke Test
- **Changes:** Added a dedicated `test:extension-smoke` script, smoke Vitest config, and build artifact validator that checks the Chrome MV3 manifest, permission boundary, core extension pages, background worker, and content script output.
- **Status:** Completed
- **Next Steps:** Add an actual browser-loaded extension smoke test for popup and dashboard rendering once a stable browser automation harness is available.
- **Context:** The smoke test runs `pnpm build` first and validates `.output/chrome-mv3`; regular `pnpm test` remains focused on unit tests under `src/`.

## [2026-06-27 21:53] UI Runtime Smoke Tests
- **Changes:** Added jsdom render smoke coverage for popup and dashboard entrypoint components with injectable service dependencies.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Component dependencies default to production services; tests inject local stubs to avoid real IndexedDB and extension APIs.

## [2026-06-27 21:56] Collector Flush Retry
- **Changes:** Added a collector regression test for runtime message delivery failure and kept pending reading events queued for retry when a flush cannot reach the background service worker.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Failed sends now restore the attempted batch to the front of the queue, preserving event order for the next flush interval.

## [2026-06-27 22:00] Measured Reading Stats
- **Changes:** Added stats query coverage for opened-but-unread pages and filtered today page counts plus dashboard recent pages to only include pages with measured effective reading words.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Page records with zero effective words can still exist locally, but user-facing reading summaries no longer treat them as completed reading activity.

## [2026-06-27 22:03] Side Panel Reading Summary
- **Changes:** Wired the side panel companion to the local reading summary query and extended UI render smoke coverage for side-panel metrics and top-domain display.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Side panel dependencies default to production IndexedDB-backed stats while tests inject local stubs.

## [2026-06-27 22:09] Pack Tagged Vocabulary
- **Changes:** Added repository coverage for bundled Tech English Pack vocabulary tags and stored matched Pack tags on vocabulary exposure records, including merges into existing records.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Pack matching remains local and data-only; exposure records now surface Pack context through existing dashboard vocabulary fields.

## [2026-06-27 22:12] Dashboard Pack Tags
- **Changes:** Displayed vocabulary Pack tags in the dashboard vocabulary list and extended UI render smoke coverage to assert Pack context is visible.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Dashboard vocabulary entries already receive `packTags` from the local query layer; this slice makes that Pack signal visible to users.

## [2026-06-27 22:15] MVP Usage Documentation
- **Changes:** Updated README setup, local extension loading, MVP surfaces, verification commands, and architecture boundaries to match the current capture-to-display loop.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Documentation now describes optional site enablement, local aggregation, Pack-tagged vocabulary, and the current smoke-test gate.

## [2026-06-27 22:22] Message Contract Guard
- **Changes:** Added reading batch message contract tests and tightened the runtime type guard to validate page, chunk, and reading event payload structure before background storage writes.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Background routing now ignores malformed batch-shaped messages instead of passing incomplete payloads into the IndexedDB repository path.

## [2026-06-27 22:28] Plain Page Text Extraction
- **Changes:** Added text-block extraction coverage and a fallback that collects direct body paragraphs/list items when user-enabled pages lack article, main, section, markdown, or docs wrappers.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Targeted article/docs selectors still take precedence; fallback only runs when no structured reading blocks are found.

## [2026-06-27 22:34] Nested Plain Text Extraction
- **Changes:** Extended fallback extraction coverage and collection to nested body paragraphs/list items while excluding navigation, header, footer, aside, form, dialog, and aria-hidden regions.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** This improves user-enabled arbitrary sites that wrap article-like text in generic div containers instead of semantic reading landmarks.

## [2026-06-27 22:43] Removed Host Permission Sync
- **Changes:** Added tested cleanup for externally removed host permissions and wired the background listener to remove matching enabled sites before refreshing dynamic content scripts.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** If users revoke a site permission outside the popup, `yuel.enabledSiteOrigins` now drops that origin so startup/runtime registration does not retain stale site access state.

## [2026-06-27 22:49] Scroll Velocity Reading Events
- **Changes:** Added tested content-script scroll velocity sampling, batched `ScrollVelocityChanged` events, and attached `scrollSpeedWordsPerMinute` to exposure ticks for existing effective-reading scoring.
- **Status:** Completed
- **Next Steps:** Add idle/active state sampling so exposure ticks can distinguish unattended visible pages from active reading sessions.
- **Context:** Scroll velocity is estimated locally from page scroll progress and detected page word count; no raw page text is persisted beyond existing local batch analysis.

## [2026-06-27 22:54] Idle Active Reading Signals
- **Changes:** Added tested content-script idle/active sampling with `UserIdle` and `UserActive` events, plus `idle` flags on exposure ticks for effective-reading scoring.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening content-script signal quality.
- **Context:** The collector defaults to a 45-second idle threshold and resets to active on pointer, keyboard, scroll, or text-selection activity.

## [2026-06-27 22:59] Reading Event Retention
- **Changes:** Added tested pruning of raw `readingEvents` older than seven days after each recorded batch while preserving aggregate tables and vocabulary memory.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or expose local data management controls for users.
- **Context:** This keeps the local event-sourcing table short-lived as intended by the architecture while leaving report-facing summaries intact.

## [2026-06-27 23:10] Scheduled Event Maintenance
- **Changes:** Added a tested maintenance alarm handler, exported reading-event pruning for reuse, and wired the background hourly alarm to prune expired raw events even when no new reading batches arrive.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or expose local data management controls for users.
- **Context:** The existing hourly alarm now performs concrete local database maintenance instead of only being created on install.

## [2026-06-27 23:15] Local Reading Data Clear
- **Changes:** Added a tested local reading-data clear API, wired the dashboard to clear IndexedDB reading tables, refreshed dashboard metrics after clearing, and documented the control.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Clearing local reading data does not remove enabled-site permissions or optional host grants; it only resets the local reading database tables.

## [2026-06-27 23:18] Confirmed Data Clear
- **Changes:** Added tested confirmation handling before dashboard local-data clearing, including a cancel path that leaves IndexedDB untouched, and updated documentation.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** The default confirmation explains that enabled sites and browser permissions remain unchanged.

## [2026-06-27 23:23] Recent Measured Page Scan
- **Changes:** Updated dashboard detail queries to scan more recent page records before filtering out opened-only pages, then cap the visible recent measured pages at five.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available.
- **Context:** Recently opened pages without effective reading no longer hide slightly older pages that have actual measured reading exposure.

## [2026-06-27 23:27] Batch Link Validation
- **Changes:** Tightened reading batch contract validation so chunks must belong to the batch page and events must reference the batch page plus known chunks.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue hardening local data integrity checks.
- **Context:** Malformed runtime messages with cross-page records or unknown chunk references are now rejected before they reach IndexedDB writes.

## [2026-06-27 23:32] Disabled Site Collector Stop
- **Changes:** Stopped the active tab's existing reading collector before removing a matching enabled-site host permission, and covered the injected stop function with permission-service tests.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening runtime enable/disable behavior.
- **Context:** Dynamic content-script unregistration prevents future injections, but already-running collectors need an explicit stop path on the current tab.

## [2026-06-27 23:37] Starter Site Access State
- **Changes:** Centralized starter content-script match definitions, marked starter sites as already enabled in current-site access checks, avoided optional permission requests for them, and updated popup smoke coverage.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening runtime enable/disable behavior.
- **Context:** Default starter sites now show as tracked by default in the popup instead of asking users for redundant host permission.

## [2026-06-27 23:41] Visibility Resume Exposure
- **Changes:** Restored visible text-block tracking from layout when a hidden tab becomes visible again, so exposure ticks continue even if IntersectionObserver does not re-emit entries.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening content-script signal quality.
- **Context:** The collector still clears open exposure when a tab hides; this slice restarts timing for currently visible blocks on return to the tab.

## [2026-06-27 23:44] Nonnegative Batch Numbers
- **Changes:** Tightened reading batch contract validation to reject negative page totals, chunk counts, and event timestamps before background storage writes.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue hardening local data integrity checks.
- **Context:** Runtime batch messages still tolerate optional event value details, but persisted record/index fields now must be finite and nonnegative.

## [2026-06-27 23:48] Effective Vocabulary Exposure
- **Changes:** Limited vocabulary exposure writes to chunks that produced positive effective reading words, with repository coverage for ineffective exposure ticks.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue hardening local data integrity checks.
- **Context:** Low-quality or idle exposure can still update raw event/chunk telemetry, but it no longer creates dashboard vocabulary memory without effective reading.

## [2026-06-27 23:52] Duplicate Event Aggregation Guard
- **Changes:** Filtered already-stored reading event IDs before local aggregation writes, with repository coverage to prevent duplicate batches from re-counting pages, chunks, daily stats, or vocabulary.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue hardening local data integrity checks.
- **Context:** Raw event `bulkPut` already overwrote duplicate IDs, but aggregate calculations now also ignore those duplicates before they affect user-facing stats.

## [2026-06-27 23:59] Effective Daily Minutes
- **Changes:** Updated reading aggregation so daily reading minutes are recorded only for exposure ticks that produce positive effective reading words, with coverage for ineffective exposure.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening content-script signal quality.
- **Context:** Chunk-level exposure seconds are still retained for telemetry, but user-facing daily minutes now track effective reading instead of idle or low-quality exposure.

## [2026-06-28 00:11] Effective Vocabulary History
- **Changes:** Updated dashboard recent vocabulary details to scan a wider history window, show only records with positive effective exposure, and ignore ineffective vocabulary-only history when deciding whether dashboard data exists.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or continue tightening dashboard data quality around old local records.
- **Context:** This keeps old opened-only vocabulary telemetry from appearing as learning history while still allowing slightly older effective records to surface.

## [2026-06-28 00:24] Save Selection Context Menu
- **Changes:** Added an explicit "Save selection to Yuel" context-menu path that stores selected text as local saved items, wired background registration, updated MV3 permissions, and documented the privacy boundary.
- **Status:** Completed
- **Next Steps:** Surface saved items in the dashboard or card/export flow so the intentional save path is visible after capture.
- **Context:** Ordinary selection telemetry still stores only hashes; raw selected text is written only through the explicit context-menu action.

## [2026-06-28 00:30] Saved Selections Dashboard
- **Changes:** Added recent saved selections to the dashboard read model and UI, with coverage for saved-only local data and render smoke output.
- **Status:** Completed
- **Next Steps:** Add a lightweight card/export surface that can reuse reading stats, vocabulary exposure, and saved selections.
- **Context:** The explicit context-menu save path is now visible in the dashboard instead of only writing to IndexedDB.
