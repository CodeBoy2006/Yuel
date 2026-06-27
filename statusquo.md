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

## [2026-06-28 00:34] Copyable Summary Card
- **Changes:** Added a dashboard summary-card text export that combines reading metrics, vocabulary, and saved selections, plus a tested copy action with clipboard injection.
- **Status:** Completed
- **Next Steps:** Add a visual PNG card export when the summary-card layout stabilizes.
- **Context:** This is a lightweight text export path; it does not yet render an image card.

## [2026-06-28 00:38] PNG Summary Card Export
- **Changes:** Added a tested `html-to-image` wrapper and Dashboard "Download PNG" action for the share card.
- **Status:** Completed
- **Next Steps:** Add browser-loaded extension smoke once a stable automation harness is available, or iterate on the visual card layout after real usage.
- **Context:** The PNG export captures the existing share-card DOM and downloads a local image without sending reading data off-device.

## [2026-06-28 00:52] Browser Loaded Smoke
- **Changes:** Added a Chrome DevTools Protocol smoke test that builds the MV3 output, loads it into a temporary Chrome profile, and verifies dashboard/popup rendering; documented the command and ignored local pnpm store cache.
- **Status:** Completed
- **Next Steps:** Continue tightening the minimal extension loop around real page capture and dashboard export behavior.
- **Context:** Current Chrome did not register unpacked extensions through the CLI load flag in this environment, so the smoke uses `Extensions.loadUnpacked` via CDP for a stable local browser verification path.

## [2026-06-28 00:54] Smoke Config Split
- **Changes:** Narrowed the static extension smoke Vitest config to `extensionBuildSmoke.test.ts` so browser-loaded Chrome verification runs only through its dedicated config.
- **Status:** Completed
- **Next Steps:** Re-run the full verification set before committing.
- **Context:** The browser smoke needs Chrome process access and should not be included in the sandbox-friendly static smoke command.

## [2026-06-28 01:01] Browser Runtime Data Smoke
- **Changes:** Extended the Chrome-loaded extension smoke to send a valid reading batch through `chrome.runtime.sendMessage` and wait for the dashboard to show the resulting local reading data.
- **Status:** Completed
- **Next Steps:** Continue closing the real-page capture path by exercising content-script startup on an enabled or starter site.
- **Context:** The background message listener is intentionally fire-and-forget, so the smoke treats Chrome's no-response port closure as successful delivery and uses dashboard data as the proof of persistence.

## [2026-06-28 01:07] Starter Site Content Script Smoke
- **Changes:** Extended the browser smoke with a local HTTPS page mapped to `developer.mozilla.org`, proving the packaged starter-site content script can auto-capture reading data and surface it on the dashboard.
- **Status:** Completed
- **Next Steps:** Continue tightening the user-enabled-site path, especially optional permission registration and popup-driven enable flows.
- **Context:** The smoke generates a temporary self-signed certificate with `openssl` and uses Chrome host resolver rules so the test remains local while matching the production starter-site manifest pattern.

## [2026-06-28 01:31] Enabled Site Access Hardening
- **Changes:** Normalized optional host permission origins without URL ports and made current-tab lookup prefer the last focused window before falling back to the current window.
- **Status:** Completed
- **Next Steps:** Continue investigating reliable automation or manual QA for the Chrome optional-host permission confirmation path.
- **Context:** Browser smoke can drive the popup to Chrome's permission confirmation boundary, but the local CDP Extensions API does not expose a stable way to accept the browser confirmation prompt.

## [2026-06-28 01:45] Popup Side Panel Launch
- **Changes:** Added a popup action that opens the reading companion side panel through Chrome's `sidePanel.open` API with a sidepanel-page fallback, plus UI smoke coverage and README surface notes.
- **Status:** Completed
- **Next Steps:** Continue tightening first-run/manual QA around user-enabled sites and side-panel behavior in installed Chrome.
- **Context:** `chrome.sidePanel.open` must run from a user gesture, so the default popup implementation calls it directly from the button action before falling back to `sidepanel.html`.

## [2026-06-28 01:50] Browser Side Panel Smoke
- **Changes:** Extended the Chrome-loaded extension smoke to read `sidepanel.html` and assert the reading companion renders, then updated README verification coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level coverage around user-enabled site permission flows where automation is stable.
- **Context:** The smoke still loads side panel content as an extension page; direct Chrome side-panel panel opening remains bound to user gesture constraints.

## [2026-06-28 01:54] Side Panel Dashboard Launch
- **Changes:** Added an "Open dashboard" action to the reading companion side panel with injected-service UI smoke coverage and README surface notes.
- **Status:** Completed
- **Next Steps:** Continue tightening manual and browser-level checks for the user-enabled-site permission path.
- **Context:** The side panel now provides a path from compact live stats into the detailed dashboard without relying on the popup.

## [2026-06-28 01:57] Side Panel Dashboard Error State
- **Changes:** Added busy/error state handling when the side panel cannot open the dashboard, with UI smoke coverage for the visible failure message.
- **Status:** Completed
- **Next Steps:** Continue tightening user-visible recovery states around extension navigation and site enablement.
- **Context:** The side panel now avoids a silent failure if `browser.tabs.create` or an injected dashboard opener rejects.

## [2026-06-28 02:02] Popup Dashboard Error State
- **Changes:** Added busy/error state handling when the popup cannot open the dashboard, with UI smoke coverage for the visible failure message.
- **Status:** Completed
- **Next Steps:** Continue tightening user-visible recovery states around site enablement and extension navigation.
- **Context:** The popup dashboard action now mirrors the side-panel recovery path instead of leaving rejected tab creation invisible to the user.

## [2026-06-28 02:06] Popup Permission Denial Feedback
- **Changes:** Added visible popup feedback when a current-site permission request is denied, plus UI smoke coverage for the denied optional-host flow.
- **Status:** Completed
- **Next Steps:** Continue tightening user-visible recovery states around enabled-site removal and browser-level permission flows.
- **Context:** Denied optional host permission now leaves a clear "Permission was not granted" message instead of returning silently to the pre-request prompt.

## [2026-06-28 02:10] Dashboard Clear Error State
- **Changes:** Added explicit dashboard feedback when clearing local reading data fails, plus UI smoke coverage that preserves the current data after a failed clear.
- **Status:** Completed
- **Next Steps:** Continue tightening recovery states around enabled-site removal and browser-level permission flows.
- **Context:** Clear failures now report "Clear failed; local data was not changed." without marking successfully loaded dashboard data as unavailable.

## [2026-06-28 02:13] Popup Enabled Site Remove Error
- **Changes:** Added explicit popup feedback when removing an enabled site fails, plus UI smoke coverage that keeps current-site access visible.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level verification around optional host permission flows where automation is stable.
- **Context:** Remove failures now report "Remove failed; site is still enabled." without marking the current site's permission status as unavailable.

## [2026-06-28 02:16] Host Permission Removal Guard
- **Changes:** Made enabled-site removal preserve local enablement when the browser refuses to remove the host permission, with permission-service test coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level verification around optional host permission flows where automation is stable.
- **Context:** `disableEnabledSite` now treats a `permissions.remove()` false result as a failure instead of silently unregistering local collection state.

## [2026-06-28 02:20] Pagehide Collector Flush
- **Changes:** Added `pagehide` handling to flush open reading exposure before navigation unloads the page, with collector test coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening real-page capture and browser-level verification around user-enabled sites.
- **Context:** The collector now preserves final visible exposure even when navigation happens before the next interval or a reliable `visibilitychange` flush.

## [2026-06-28 02:25] Saved Vocabulary Counts
- **Changes:** Made explicit selected-text saves increment local vocabulary saved counts for trackable English words, shared the token filter with reading-event aggregation, and updated README behavior notes.
- **Status:** Completed
- **Next Steps:** Surface saved vocabulary counts more clearly in dashboard vocabulary rows.
- **Context:** Raw selected text is still only stored through the context-menu save action; ordinary selection telemetry remains hashed.

## [2026-06-28 02:28] Dashboard Saved Vocabulary Counts
- **Changes:** Surfaced vocabulary `savedCount` in dashboard vocabulary rows and added UI smoke coverage for saved vocabulary counts.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level verification around user-enabled site capture where automation is stable.
- **Context:** Explicitly saved words now show back up in the vocabulary exposure panel instead of only being stored in the local read model.

## [2026-06-28 02:32] Saved-Only Vocabulary Dashboard Data
- **Changes:** Included saved-only vocabulary memories in dashboard details and summary-card vocabulary text, with read-model coverage and README surface notes.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level verification around user-enabled site capture where automation is stable.
- **Context:** A word saved through the context menu can now appear in the vocabulary panel even before it has effective reading exposure.

## [2026-06-28 02:37] Saved Vocabulary Reactivation
- **Changes:** Made explicit saved-word actions reactivate ignored vocabulary memories as learning, with storage test coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening browser-level verification around user-enabled site capture where automation is stable.
- **Context:** Explicit saves now override prior ignored status because the user has intentionally saved the word again.

## [2026-06-28 02:41] Vocabulary Exposure Deduping
- **Changes:** Prevented already-counted chunks from writing duplicate vocabulary exposure when later reading ticks add no new effective words, with storage repository coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening real-page capture and dashboard data quality around repeated page visits.
- **Context:** Vocabulary memory now follows newly credited effective reading instead of every effective-looking tick on a fully counted chunk.

## [2026-06-28 02:44] First Effective Chunk Vocabulary
- **Changes:** Limited reading-derived vocabulary exposure to the first effective read of each text chunk, with repository coverage for partially credited chunks.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard data quality around repeated page visits and long-running reading sessions.
- **Context:** Reading minutes and effective word deltas still accumulate across later ticks, but vocabulary terms are no longer duplicated for the same local chunk.

## [2026-06-28 02:48] Ineffective Page Timestamp Guard
- **Changes:** Preserved an existing page's `lastReadAt` when a batch contains no effective reading activity, with repository coverage for idle or ineffective ticks.
- **Status:** Completed
- **Next Steps:** Continue tightening today-summary accuracy around repeated page visits and mixed effective/ineffective batches.
- **Context:** Opened-only new pages can still be stored locally, but old read pages are no longer refreshed into today's page count by ineffective activity.

## [2026-06-28 02:53] Popup Zero Minute Display
- **Changes:** Made popup reading-time formatting show `0 min read` when local data exists but today's reading minutes are zero, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** Non-time data such as learning words no longer makes the popup imply a sub-minute reading session.

## [2026-06-28 03:00] Popup Metrics Load Failure
- **Changes:** Made all popup reading metric cards show `Unavailable` when local reading stats fail to load, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** A failed summary query no longer leaves Today, Pages, and Learning stuck on loading while Time reports unavailable.

## [2026-06-28 03:04] Side Panel Metrics Load Failure
- **Changes:** Made side panel reading metric cards show `Unavailable` when local reading stats fail to load, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** The compact companion now matches popup failure behavior instead of showing stale loading labels under a local-data error.

## [2026-06-28 03:08] Dashboard Metrics Load Failure
- **Changes:** Made dashboard summary metric cards and share-card preview show unavailable states when local reading details fail to load, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** Dashboard load failures now stop showing placeholder metrics or loading share-card text after the failure is known.

## [2026-06-28 03:11] Popup Enabled Sites Load Failure
- **Changes:** Split popup enabled-site list failures from current-site permission failures, added an explicit enabled-sites unavailable message, and covered the behavior with UI smoke tests.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-flow recovery around enabling, disabling, and external host-permission changes.
- **Context:** A failed enabled-site list query no longer hides a valid current-site access state or blocks the user from seeing whether the active page is tracked.

## [2026-06-28 03:14] Popup Current Tab Injection Failure
- **Changes:** Added popup feedback when enabling a custom site succeeds but the current tab collector injection does not, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening real-page capture and browser-level verification around user-enabled site startup.
- **Context:** The popup now tells users to reload the current tab instead of implying that immediate collection is already active.

## [2026-06-28 03:16] Dashboard Clear Refresh Failure
- **Changes:** Split dashboard clear failures from post-clear refresh failures, cleared stale dashboard details after a successful clear, and added UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local-data recovery states across dashboard export, copy, and clear flows.
- **Context:** If local data is cleared but the dashboard cannot reload, the UI no longer claims data was unchanged or shows the old summary card.

## [2026-06-28 03:19] Dashboard Share State Reset
- **Changes:** Reset dashboard share-card copy/download action states when local data clearing starts, with UI smoke coverage for stale copied state.
- **Status:** Completed
- **Next Steps:** Continue tightening local-data recovery states across dashboard export, copy, and clear flows.
- **Context:** Clearing local data no longer leaves a previous `Copied` status attached to the newly empty share card.

## [2026-06-28 03:23] Side Panel Top Domain Load Failure
- **Changes:** Made the side panel top-domain card show `Unavailable` when local reading stats fail to load, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** A side panel stats load failure no longer looks like an empty-reading-data state in the top-domain card.

## [2026-06-28 03:27] Enabled Site Origin Port Guard
- **Changes:** Filtered stored enabled-site origins that include explicit ports before dynamic content-script registration, with permission-service coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-flow recovery around startup registration and externally changed host permissions.
- **Context:** A malformed stored origin such as `https://example.com:8443/*` no longer reaches Chrome dynamic script registration.

## [2026-06-28 03:30] Popup Stats Load Failure Message
- **Changes:** Added explicit popup feedback when local reading stats fail to load, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** Popup stats failures now show a clear local-data error instead of only unavailable metric values.

## [2026-06-28 03:33] Side Panel Empty Time State
- **Changes:** Made the side panel time metric show `No data` when local reading stats are loaded but empty, with UI smoke coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening empty and partial-data states across popup, side panel, and dashboard.
- **Context:** The side panel no longer presents an empty local-data state as `0 min read`.

## [2026-06-28 03:36] Broad Host Permission Removal Sync
- **Changes:** Cleaned enabled-site records covered by broad browser host-permission removal events, with permission-service coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-flow recovery around externally changed host permissions and currently injected tabs.
- **Context:** A browser event such as `https://*/*` now removes all locally enabled HTTPS sites while preserving unrelated HTTP sites.

## [2026-06-28 03:39] External Permission Removal Collector Stop
- **Changes:** Stopped the current tab collector when externally revoked host permissions cover the current enabled site, with permission-service coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-flow recovery and browser-level checks for user-enabled site lifecycle edges.
- **Context:** External permission removals now best-effort stop an already injected collector instead of only cleaning stored enabled-site records.

## [2026-06-28 03:43] Collector Stop Flush Retry
- **Changes:** Added one immediate retry for the collector's final stop flush when runtime delivery fails, with content collector coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening event delivery around page lifecycle, dynamic content, and browser-level enabled-site flows.
- **Context:** Stopping a collector no longer leaves failed final events pending with no timer left to retry them.

## [2026-06-28 03:47] Background Reading Message Failure Propagation
- **Changes:** Routed reading-event runtime messages through a tested handler that returns the storage write promise and rejects on local write failure.
- **Status:** Completed
- **Next Steps:** Continue tightening event delivery around page lifecycle, dynamic content, and browser-level enabled-site flows.
- **Context:** Content collectors can now observe background storage failures through `sendMessage` and keep their retry path meaningful.

## [2026-06-28 03:52] Collector Stop PageHidden Event
- **Changes:** Emitted a `PageHidden` event when stopping a visible page collector, with content collector coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening event delivery around page lifecycle, dynamic content, and browser-level enabled-site flows.
- **Context:** Disabling or externally stopping a collector now closes the local reading session instead of only flushing exposure ticks.

## [2026-06-28 03:56] Collector Stop Idempotency
- **Changes:** Made collector `stop()` idempotent so repeated cleanup paths do not duplicate final exposure flushes, with content collector coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening event delivery around page lifecycle, dynamic content, and browser-level enabled-site flows.
- **Context:** Calling `stop()` twice no longer creates a second final batch after visible reading exposure has already been flushed.

## [2026-06-28 04:03] Saved Selection Unique IDs
- **Changes:** Added a sequence component to saved selection IDs so repeated saves of the same text in the same millisecond do not overwrite each other, with storage coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening explicit saved-selection storage and dashboard presentation edge cases.
- **Context:** Intentional repeated saves now remain separate local saved-item records even when text and timestamp match.

## [2026-06-28 04:08] Saved Vocabulary Recency Guard
- **Changes:** Preserved newer vocabulary `lastSeenAt` values when saving older selected text, with storage coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening explicit saved-selection storage and dashboard presentation edge cases.
- **Context:** Explicit saves still increment `savedCount`, but no longer move vocabulary recency backward when an older saved selection is processed.

## [2026-06-28 04:11] Saved Selection Source Fallback
- **Changes:** Normalized blank saved-selection source domains to `unknown` in dashboard read models, with storage coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening explicit saved-selection storage and dashboard presentation edge cases.
- **Context:** Older or malformed saved-item records no longer render an empty source field in dashboard consumers.

## [2026-06-28 04:14] Reading Summary Top Domain Cleanup
- **Changes:** Normalized stored top-domain summaries before exposing read models, with storage coverage for trimming, blank filtering, and deduplication.
- **Status:** Completed
- **Next Steps:** Continue tightening local summary read models and dashboard presentation edge cases.
- **Context:** Historical or malformed daily stats no longer leak blank or duplicate top domains into popup, side panel, dashboard, or share-card consumers.

## [2026-06-28 04:17] Recent Page Domain Fallback
- **Changes:** Normalized blank recent-page domains to `unknown` in dashboard read models, sharing the existing display-domain fallback with saved selections.
- **Status:** Completed
- **Next Steps:** Continue tightening local summary read models and dashboard presentation edge cases.
- **Context:** Historical or malformed page records no longer render an empty domain in the recent reading history.

## [2026-06-28 04:21] Stored Page Domain Cleanup
- **Changes:** Normalized blank page domains before writing page records and daily top-domain aggregates, with storage coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** New malformed reading batches no longer create empty-domain page records or daily top-domain entries.

## [2026-06-28 04:33] Existing Top Domain Merge Cleanup
- **Changes:** Cleaned existing daily top-domain aggregates while recording new reading events, with storage coverage for trimming, blank filtering, and deduplication.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Recording a new batch now repairs malformed stored top-domain arrays instead of preserving stale blank or duplicated entries.

## [2026-06-28 04:40] Reading Message Blank Field Guard
- **Changes:** Rejected blank required page, chunk, and event strings at the reading batch message boundary, with contract coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Malformed content-to-background batches with empty IDs, domains, selectors, or required metadata no longer enter the storage pipeline.
