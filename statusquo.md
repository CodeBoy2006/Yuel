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

## [2026-06-28 04:45] Reading Message Trimmed Field Guard
- **Changes:** Rejected required reading batch strings with leading or trailing whitespace before they become local IDs or metadata keys, with contract coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Content-to-background batches now need canonical trimmed IDs, hashes, domains, language codes, selectors, and event metadata.

## [2026-06-28 04:53] Chunk Event Link Guard
- **Changes:** Required chunk-scoped reading events to include a known `chunkId` at the message contract boundary, with contract coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Text-block visibility, exposure, and save events without chunk links no longer enter the storage pipeline as unusable raw events.

## [2026-06-28 11:12] Exposure Tick Dwell Guard
- **Changes:** Rejected exposure tick messages without positive dwell time at the reading batch contract boundary, with contract coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Malformed exposure ticks that cannot contribute to aggregates no longer enter the raw reading-event table.

## [2026-06-28 11:16] Visibility Ratio Event Guard
- **Changes:** Required text-block visibility and exposure events to carry finite `visibleRatio` values between 0 and 1, with contract and background fixture coverage.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and dashboard presentation edge cases.
- **Context:** Malformed visibility telemetry no longer enters the raw event stream with unusable or out-of-range visibility ratios.

## [2026-06-28 11:19] Selection Telemetry Privacy Guard
- **Changes:** Required `TextSelected` reading events to carry hashed selection metadata with a positive character count and rejected raw `text` payloads at the message contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and explicit saved-selection boundaries.
- **Context:** Ordinary selection telemetry now enforces the README privacy posture: raw selected text only belongs in explicit saved-item records.

## [2026-06-28 11:22] Scroll Velocity Payload Guard
- **Changes:** Required `ScrollVelocityChanged` events to carry collector-shaped movement metadata: at least 1px scroll delta, at least 100ms elapsed time, and nonnegative scroll speed.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and remaining reading event payload boundaries.
- **Context:** Malformed scroll telemetry no longer enters the raw reading-event stream with missing or impossible movement values.

## [2026-06-28 11:25] Activity Idle Duration Guard
- **Changes:** Required `UserIdle` and `UserActive` events to carry finite nonnegative `idleMs` values at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and remaining reading event payload boundaries.
- **Context:** Malformed activity telemetry no longer enters the raw reading-event stream without usable idle-duration metadata.

## [2026-06-28 11:28] Page Lifecycle Payload Guard
- **Changes:** Rejected unexpected `value` payloads on `PageVisible` and `PageHidden` events at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and remaining reading event payload boundaries.
- **Context:** Page lifecycle events now match the collector's payload-free shape instead of accepting arbitrary raw event metadata.

## [2026-06-28 11:33] Exposure Tick Payload Shape Guard
- **Changes:** Required `TextBlockExposureTick` events to carry collector-shaped reading metadata: positive `wordCount`, boolean `activeTab`, nonnegative scroll speed, and boolean `idle`.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and remaining reading event payload boundaries.
- **Context:** Exposure ticks now match the local collector and browser smoke payload shape before entering raw events and aggregate processing.

## [2026-06-28 11:37] Visibility Event Word Count Guard
- **Changes:** Required `TextBlockVisible` and `TextBlockHidden` events to carry positive `wordCount` values alongside bounded `visibleRatio` values.
- **Status:** Completed
- **Next Steps:** Continue tightening local event-write hygiene and remaining reading event payload boundaries.
- **Context:** Text-block visibility events now match the collector payload shape before entering the raw reading-event stream.

## [2026-06-28 11:41] Duplicate Chunk ID Guard
- **Changes:** Rejected reading batches containing duplicate `chunkId` values before local aggregate and text-chunk writes.
- **Status:** Completed
- **Next Steps:** Continue tightening local batch identity hygiene and remaining reading event payload boundaries.
- **Context:** Ambiguous chunk snapshots no longer reach Map-based aggregation or IndexedDB `textChunks` primary-key writes.

## [2026-06-28 11:45] Duplicate Event ID Guard
- **Changes:** Rejected reading batches containing duplicate event IDs before local storage deduplication and aggregate processing.
- **Status:** Completed
- **Next Steps:** Continue tightening local batch identity hygiene and remaining reading event payload boundaries.
- **Context:** Ambiguous event batches no longer rely on repository-level duplicate filtering to decide which raw events contribute to aggregates.

## [2026-06-28 11:48] Event Capture Time Guard
- **Changes:** Rejected reading events whose `occurredAt` timestamp predates the page snapshot `capturedAt` time at the message contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local event chronology and remaining reading event payload boundaries.
- **Context:** Malformed batches can no longer write raw events or daily aggregates that imply reading activity before the page was captured.

## [2026-06-28 11:51] Batch Session Guard
- **Changes:** Rejected reading event batches that mix multiple `sessionId` values before local storage and aggregate processing.
- **Status:** Completed
- **Next Steps:** Continue tightening local event chronology and remaining reading event payload boundaries.
- **Context:** Each content collector lifecycle emits one session, so mixed-session batches are now treated as malformed instead of merging distinct reading sessions.

## [2026-06-28 11:55] Empty Reading Batch Guard
- **Changes:** Rejected reading event batch messages with an empty `events` array at the message contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local event chronology and remaining reading event payload boundaries.
- **Context:** The collector does not send empty event batches, so malformed runtime messages can no longer create page records without a raw reading event.

## [2026-06-28 11:58] Chunk Text Normalization Guard
- **Changes:** Rejected optional chunk `text` values that are blank or include surrounding whitespace at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local text snapshot and event payload boundaries.
- **Context:** Collector-emitted chunk text is normalized before batching, so malformed messages no longer carry unusable raw text into vocabulary analysis.

## [2026-06-28 12:02] Page Event Chunk Link Guard
- **Changes:** Rejected page-level reading events carrying `chunkId` values and required every reading event kind to be explicitly classified as page-scoped or chunk-scoped.
- **Status:** Completed
- **Next Steps:** Continue tightening local event classification and remaining payload boundaries.
- **Context:** Page lifecycle, scroll, activity, selection, lookup, and exclusion events now match the collector shape instead of borrowing a known text chunk link.

## [2026-06-28 12:06] Chunk Event Word Count Guard
- **Changes:** Rejected chunk visibility and exposure events whose payload `wordCount` differs from the linked chunk snapshot.
- **Status:** Completed
- **Next Steps:** Continue tightening local text snapshot and event payload consistency.
- **Context:** Collector-emitted chunk events report the same word count as their source chunk, so malformed messages can no longer skew effective-reading estimates with conflicting counts.

## [2026-06-28 12:11] Page Total Word Count Guard
- **Changes:** Rejected reading batches whose page `totalWords` does not equal the sum of chunk `wordCount` values.
- **Status:** Completed
- **Next Steps:** Continue tightening local page and chunk snapshot consistency.
- **Context:** The content collector derives page totals from collected text chunks, so malformed batches can no longer store page records with conflicting total-word counts.

## [2026-06-28 12:16] Chunk Sentence Count Guard
- **Changes:** Rejected chunk snapshots without positive `sentenceCount` values at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local page and chunk snapshot consistency.
- **Context:** Collector-emitted chunks come from nonblank visible text and carry at least one sentence segment, so malformed snapshots with zero sentences no longer enter local storage.

## [2026-06-28 12:21] Chunk Word Threshold Guard
- **Changes:** Rejected chunk snapshots below the collector's 8-word minimum at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening local page and chunk snapshot consistency.
- **Context:** The content collector filters out tiny text blocks before batching, so malformed messages with sub-threshold chunks no longer enter local storage or aggregate processing.

## [2026-06-28 12:26] Chunk Text Hash Guard
- **Changes:** Rejected chunk snapshots whose optional raw `text` does not match the supplied `textHash`.
- **Status:** Completed
- **Next Steps:** Continue tightening local page and chunk snapshot identity consistency.
- **Context:** Collector-emitted chunks derive `textHash` from normalized text, so malformed messages can no longer pair one raw text body with another hash identity.

## [2026-06-28 12:31] Chunk ID Text Guard
- **Changes:** Rejected chunk snapshots whose optional raw `text` does not match the supplied collector-style `chunkId`.
- **Status:** Completed
- **Next Steps:** Continue tightening local page and chunk snapshot identity consistency.
- **Context:** Collector-emitted chunks derive `chunkId` from `pageId` and normalized text, so malformed messages can no longer attach reading events to a stale chunk identity.

## [2026-06-28 12:44] Chunk Word Analysis Guard
- **Changes:** Rejected chunk snapshots whose optional raw `text` analysis does not match the supplied `wordCount`.
- **Status:** Completed
- **Next Steps:** Continue tightening local text snapshot metrics before broadening user-facing MVP flows.
- **Context:** Collector-emitted chunks derive `wordCount` from `analyzeEnglishText`, so malformed batches can no longer inflate page totals, event word counts, or effective reading estimates with inconsistent text metrics.

## [2026-06-28 12:51] Chunk Sentence Analysis Guard
- **Changes:** Rejected chunk snapshots whose optional raw `text` analysis does not match the supplied `sentenceCount`.
- **Status:** Completed
- **Next Steps:** Continue tightening local text snapshot metrics before broadening user-facing MVP flows.
- **Context:** Collector-emitted chunks derive `sentenceCount` from `analyzeEnglishText`, so malformed batches can no longer store inconsistent text metrics for local page and chunk records.

## [2026-06-28 12:58] Required Chunk Text Guard
- **Changes:** Required every reading batch chunk snapshot to include normalized raw `text` at the message contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening the local event-to-analysis path before broadening user-facing MVP flows.
- **Context:** Chunk text is not stored in IndexedDB, but it must travel through local extension messages so background analysis can update vocabulary exposure and Pack tags.

## [2026-06-28 13:05] Page Domain ID Guard
- **Changes:** Rejected page snapshots whose stored `domain` does not match the collector-style `pageId` prefix.
- **Status:** Completed
- **Next Steps:** Continue tightening page identity and local aggregate boundaries before broadening user-facing MVP flows.
- **Context:** Collector-emitted page IDs include the normalized domain prefix, so malformed batches can no longer attribute one page identity to a different daily top-domain bucket.

## [2026-06-28 13:08] English Page Language Guard
- **Changes:** Rejected reading batch page snapshots whose `language` is not `en`.
- **Status:** Completed
- **Next Steps:** Continue tightening page identity and local aggregate boundaries before broadening user-facing MVP flows.
- **Context:** The MVP collector and analysis pipeline are English-only, so malformed batches can no longer store non-English page records while still running English tokenization and Pack matching.

## [2026-06-28 13:11] Future Event Payload Guard
- **Changes:** Rejected payload objects on currently unshaped `LookupTriggered`, `ChunkSaved`, and `PageExcluded` reading events.
- **Status:** Completed
- **Next Steps:** Continue tightening event payload schemas before broadening user-facing MVP flows.
- **Context:** These event kinds are not emitted by the current collector, so they remain payload-free until a concrete privacy-preserving schema is implemented.

## [2026-06-28 13:16] Supported Event Kind Guard
- **Changes:** Rejected reading event kinds that are not emitted by the current collector, including `LookupTriggered`, `ChunkSaved`, and `PageExcluded`.
- **Status:** Completed
- **Next Steps:** Continue tightening implemented event schemas and user-facing MVP flows.
- **Context:** Future event kinds remain in the domain type for planned features, but they cannot enter raw local event storage until their collectors and privacy-preserving payload schemas exist.

## [2026-06-28 13:20] Hidden Tab Visibility Guard
- **Changes:** Prevented the content collector from emitting an initial `PageVisible` event when it starts in a hidden tab; the event is now deferred until the tab becomes visible.
- **Status:** Completed
- **Next Steps:** Continue tightening collector lifecycle behavior and end-to-end local reading accuracy.
- **Context:** Background-opened or hidden pages should not create misleading visible-reading lifecycle events before the user actually returns to the tab.

## [2026-06-28 13:23] Hidden Tab Idle Guard
- **Changes:** Prevented the content collector from emitting `UserIdle` activity while a tab remains hidden and restarted the idle window when the tab becomes visible.
- **Status:** Completed
- **Next Steps:** Continue tightening collector lifecycle behavior and end-to-end local reading accuracy.
- **Context:** Hidden pages can stay open past the idle timeout without representing active reading, so idle telemetry is now tied to visible reading sessions.

## [2026-06-28 13:26] Hidden Tab Intersection Guard
- **Changes:** Ignored IntersectionObserver visibility updates while a tab is hidden and restored visible block state from layout only after the tab becomes visible.
- **Status:** Completed
- **Next Steps:** Continue tightening hidden-page input handling and end-to-end local reading accuracy.
- **Context:** Hidden pages can receive delayed observer callbacks, so visible-block and exposure telemetry now stays tied to actual visible reading sessions.

## [2026-06-28 13:30] Hidden Tab Scroll Guard
- **Changes:** Ignored scroll velocity updates while a tab is hidden so hidden-page scrolling cannot emit `ScrollVelocityChanged` events.
- **Status:** Completed
- **Next Steps:** Continue tightening hidden-page input handling and end-to-end local reading accuracy.
- **Context:** Scroll telemetry now stays tied to visible reading sessions instead of background or hidden-page movement.

## [2026-06-28 13:33] Hidden Tab Selection Guard
- **Changes:** Ignored selection telemetry while a tab is hidden so hidden-page selection changes cannot emit `TextSelected` events.
- **Status:** Completed
- **Next Steps:** Continue tightening hidden-page input handling and end-to-end local reading accuracy.
- **Context:** Passive selection telemetry stays tied to visible reading sessions; explicit context-menu saves remain handled separately by the background save-selection flow.

## [2026-06-28 13:37] Hidden Tab Activity Guard
- **Changes:** Ignored keyboard and pointer activity while a tab is hidden so hidden-page input cannot emit `UserActive` events.
- **Status:** Completed
- **Next Steps:** Continue tightening hidden-page input handling and end-to-end local reading accuracy.
- **Context:** Activity telemetry now resumes only after the page becomes visible again and restarts the idle window from that visible moment.

## [2026-06-28 13:42] Visibilitychange Exposure Guard
- **Changes:** Preserved `activeTab: true` for the final exposure tick flushed when a visible tab transitions to hidden.
- **Status:** Completed
- **Next Steps:** Continue tightening lifecycle edge cases and end-to-end local reading accuracy.
- **Context:** The final dwell window happened while the page was visible, so it should count as active exposure even though the `visibilitychange` handler runs after the document reports `hidden`.

## [2026-06-28 13:46] Stop Flush Ordering Guard
- **Changes:** Ordered final `TextBlockExposureTick` events before `PageHidden` when the collector is stopped on a visible page.
- **Status:** Completed
- **Next Steps:** Continue tightening lifecycle edge cases and end-to-end local reading accuracy.
- **Context:** Stop-time raw events now preserve the same lifecycle ordering as visibility/pagehide flushes: visible exposure is recorded before the page is marked hidden.

## [2026-06-28 13:52] Collector Snapshot Consistency Guard
- **Changes:** Reused one collected text-block snapshot for both page totals and emitted chunk payloads in the content collector.
- **Status:** Completed
- **Next Steps:** Continue tightening collector-to-storage consistency and end-to-end local reading accuracy.
- **Context:** Dynamic pages can change between DOM extraction passes, so page `totalWords` now stays aligned with the chunks sent in the same reading batch.

## [2026-06-28 13:56] Restored Visibility Ordering Guard
- **Changes:** Ordered resumed `PageVisible` events before restored `TextBlockVisible` events when a hidden tab becomes visible again.
- **Status:** Completed
- **Next Steps:** Continue tightening collector lifecycle ordering and end-to-end local reading accuracy.
- **Context:** Resumed block visibility now follows the page-visible lifecycle event, keeping raw local event streams chronologically coherent.

## [2026-06-28 14:00] Ignored Vocabulary Dashboard Guard
- **Changes:** Omitted ignored vocabulary memories from dashboard vocabulary details and summary-card data.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around user vocabulary status.
- **Context:** Explicit saves already reactivate ignored words as learning, so still-ignored memories should stay out of user-facing vocabulary surfaces.

## [2026-06-28 14:04] Ignored Vocabulary Passive Update Guard
- **Changes:** Prevented passive reading exposure from refreshing ignored vocabulary memories while leaving active and newly discovered vocabulary updates intact.
- **Status:** Completed
- **Next Steps:** Continue tightening vocabulary status boundaries across storage and dashboard surfaces.
- **Context:** Ignored words should remain quiet until the user explicitly saves them again, which already reactivates them through the saved-selection path.

## [2026-06-28 14:07] Visible Block Threshold Contract Guard
- **Changes:** Rejected `TextBlockVisible` events below the collector's 0.15 visibility threshold at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening collector-to-background contract invariants before broadening MVP flows.
- **Context:** Hidden or barely visible blocks can still emit `TextBlockHidden`, but visible-block events now match the collector's actual visibility threshold before entering raw local storage.

## [2026-06-28 14:10] Hidden Block Threshold Contract Guard
- **Changes:** Rejected `TextBlockHidden` events at or above the collector's 0.15 visibility threshold at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening collector-to-background contract invariants before broadening MVP flows.
- **Context:** Hidden-block events now represent the below-threshold side of the collector split, while exposure ticks retain their existing bounded ratio semantics.

## [2026-06-28 14:14] Exposure Threshold Contract Guard
- **Changes:** Rejected `TextBlockExposureTick` events below the collector's 0.15 visibility threshold at the reading batch contract boundary.
- **Status:** Completed
- **Next Steps:** Continue tightening collector-to-background contract invariants before broadening MVP flows.
- **Context:** Exposure ticks are derived from visible-block state, so below-threshold exposure can no longer enter raw local storage through malformed messages.

## [2026-06-28 14:17] Never-Visible Hidden Event Guard
- **Changes:** Prevented the content collector from emitting `TextBlockHidden` events for text blocks that had never entered visible-block state.
- **Status:** Completed
- **Next Steps:** Continue tightening raw collector event lifecycle coherence before broadening MVP flows.
- **Context:** Below-threshold observer callbacks no longer create standalone hidden events; hidden events now close an actual prior visible interval.

## [2026-06-28 14:21] Duplicate Visible Event Guard
- **Changes:** Prevented repeated visible observer updates for the same block from emitting duplicate `TextBlockVisible` lifecycle events.
- **Status:** Completed
- **Next Steps:** Continue tightening collector lifecycle coherence and end-to-end local reading accuracy.
- **Context:** A visible block now emits one visible lifecycle event per visible interval while repeated observer updates still raise the exposure tick's max visible ratio.

## [2026-06-28 14:24] Event Chronology Contract Guard
- **Changes:** Rejected reading event batches whose event timestamps move backward inside a single collector flush.
- **Status:** Completed
- **Next Steps:** Continue tightening event-sourced storage boundaries before expanding user-facing MVP flows.
- **Context:** Equal-timestamp events remain valid, but accepted batches now preserve nondecreasing raw event order for local aggregation and debugging.

## [2026-06-28 14:29] Wildcard Permission Removal Guard
- **Changes:** Removed persisted enabled-site origins when browser host-permission removal events use wildcard host patterns such as `https://*.example.com/*`.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-state cleanup and restart-safe site enablement for the MVP loop.
- **Context:** Exact enabled origins under the revoked wildcard host now disappear from local settings and dynamic content-script registration is refreshed.

## [2026-06-28 14:33] Scheme-Wildcard Permission Removal Guard
- **Changes:** Removed persisted enabled-site origins when browser host-permission removal events use scheme-wildcard host patterns such as `*://*.example.com/*`.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-state cleanup and restart-safe site enablement for the MVP loop.
- **Context:** Scheme-wildcard removals now clear both HTTP and HTTPS exact enabled origins under the revoked host family and refresh dynamic content-script registration.

## [2026-06-28 14:38] Primary Extraction Ancestor Guard
- **Changes:** Applied non-reading ancestor exclusions to primary text-block extraction, not only fallback extraction.
- **Status:** Completed
- **Next Steps:** Continue tightening readable-text capture quality before broadening content-script behavior.
- **Context:** Paragraphs inside `aside`, page chrome, forms, dialogs, or `aria-hidden` containers are no longer collected just because they sit under `main` or other primary selectors.

## [2026-06-28 14:41] Role-Based Extraction Ancestor Guard
- **Changes:** Expanded non-reading ancestor exclusions to role-based page chrome and hidden/inert containers.
- **Status:** Completed
- **Next Steps:** Continue tightening readable-text capture quality before broadening content-script behavior.
- **Context:** Primary extraction now skips navigation, banner, complementary, contentinfo, dialog, search, hidden, and inert wrappers even when their paragraphs match `main` or docs selectors.

## [2026-06-28 14:45] Declared Page Language Guard
- **Changes:** Derived page snapshot language from the document's declared HTML language instead of always reporting English.
- **Status:** Completed
- **Next Steps:** Continue tightening English-only collector boundaries before broadening content-script behavior.
- **Context:** English variants still normalize to `en`, blank declarations default to `en`, and declared non-English pages now produce non-English snapshots that the existing message contract rejects before storage.

## [2026-06-28 14:50] Non-English Collector Start Guard
- **Changes:** Prevented the content collector from starting observers, timers, and reading-event batches on pages that declare a non-English HTML language.
- **Status:** Completed
- **Next Steps:** Continue tightening English-only collector boundaries and readable-text capture before broadening MVP behavior.
- **Context:** Blank language declarations still default to English, while declared `en-*` pages collect normally and declared non-English pages no-op before local text capture begins.

## [2026-06-28 14:53] Local Language Block Guard
- **Changes:** Skipped text-block candidates whose nearest local `lang` declaration is non-English, even when the page itself declares English.
- **Status:** Completed
- **Next Steps:** Continue tightening mixed-language and readable-text capture quality before broadening content-script behavior.
- **Context:** English page and element declarations still collect normally, while locally declared non-English sections no longer enter the English reading analytics pipeline.

## [2026-06-28 14:56] Editable Region Extraction Guard
- **Changes:** Skipped text-block candidates inside editable and textbox regions so user-authored drafts do not become local reading analytics.
- **Status:** Completed
- **Next Steps:** Continue tightening privacy-sensitive extraction boundaries and readable-text capture quality before broadening content-script behavior.
- **Context:** Published page content still collects normally, while `contenteditable` and role-textbox regions are treated like forms and other non-reading UI.

## [2026-06-28 15:00] Reading Event ID Kind Guard
- **Changes:** Required reading event IDs to use a prefix matching their event kind before runtime batches enter local storage.
- **Status:** Completed
- **Next Steps:** Continue tightening event identity and payload boundaries before broadening MVP behavior.
- **Context:** Collector-shaped event IDs such as `TextBlockExposureTick_*` still pass, while kind/ID mismatches are rejected at the message contract boundary.

## [2026-06-28 15:04] Reading Session ID Shape Guard
- **Changes:** Required runtime reading event batches to use collector-shaped `session_*` IDs before entering local storage.
- **Status:** Completed
- **Next Steps:** Continue tightening event identity and payload boundaries before broadening MVP behavior.
- **Context:** Collector sessions still pass, while manual or empty `session_` values are rejected at the message contract boundary.

## [2026-06-28 15:08] Reading Event ID Suffix Guard
- **Changes:** Required reading event IDs to include a non-empty unique suffix after the event-kind prefix.
- **Status:** Completed
- **Next Steps:** Continue tightening event identity and payload boundaries before broadening MVP behavior.
- **Context:** Collector-shaped IDs such as `TextBlockExposureTick_*` still pass, while bare kind prefixes like `TextBlockExposureTick_` are rejected before local storage writes.

## [2026-06-28 15:12] Blank Saved Item Dashboard Guard
- **Changes:** Omitted blank saved-selection records from dashboard details and summary-card data.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around partial or stale local records.
- **Context:** Explicit saved selections with visible text still surface normally, while whitespace-only legacy records no longer make the dashboard appear populated.

## [2026-06-28 15:16] Saved Item Text Normalization
- **Changes:** Normalized saved-selection text in dashboard details by trimming and collapsing whitespace before display and summary-card generation.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around partial or stale local records.
- **Context:** Explicit saved selections keep their meaning, while legacy records with line breaks or repeated spaces now render as readable single-line text.

## [2026-06-28 16:13] Saved Item Tag Normalization
- **Changes:** Normalized saved-selection tags in dashboard details by trimming, dropping blanks, and removing duplicates.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around partial or stale local records.
- **Context:** Valid saved-selection tags still surface in order, while malformed legacy tag arrays no longer create blank or repeated dashboard chips.

## [2026-06-28 16:17] Saved Item Scan Window
- **Changes:** Scanned beyond the five displayed saved selections so blank legacy records do not hide valid older saved selections from dashboard details.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around partial or stale local records.
- **Context:** Dashboard still displays at most five saved selections, but it now scans a wider recent window before filtering blank saved-item records.

## [2026-06-28 16:20] Vocabulary Pack Tag Normalization
- **Changes:** Normalized vocabulary pack tags in dashboard details by trimming, dropping blanks, and removing duplicates through the shared tag helper.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around partial or stale local records.
- **Context:** Vocabulary chips now follow the same dashboard hygiene as saved-selection tags, preventing blank chips and duplicate tag keys from malformed local records.

## [2026-06-28 16:23] Vocabulary Lemma Normalization
- **Changes:** Normalized vocabulary lemmas before dashboard display and ignored blank lemma records when computing dashboard data.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard read-model boundaries around malformed local records before broadening MVP behavior.
- **Context:** Effective or saved vocabulary records with blank lemma text no longer make the dashboard appear populated, while spaced lemmas render consistently in lists and share-card text.

## [2026-06-28 16:27] Dashboard Loading Placeholders
- **Changes:** Rendered loading or unavailable placeholders in dashboard detail panels until local reading details are available.
- **Status:** Completed
- **Next Steps:** Continue tightening dashboard UX states for the local-first MVP loop.
- **Context:** Recent pages, vocabulary exposure, and saved selections no longer show empty-state copy while the dashboard is still loading local data.

## [2026-06-28 16:31] Popup Enabled Sites Loading State
- **Changes:** Added an explicit enabled-sites loading state in the popup and kept failure copy separate from true empty-state copy.
- **Status:** Completed
- **Next Steps:** Continue tightening permission-state UX for the local-first MVP loop.
- **Context:** The popup no longer shows "No custom sites enabled" before persisted site access records have loaded or when that load fails.

## [2026-06-28 16:36] Side Panel Top Domain Loading State
- **Changes:** Rendered a loading value for the side-panel top-domain card until local reading summary data is available.
- **Status:** Completed
- **Next Steps:** Run a bounded final MVP audit before deciding whether more true blockers remain.
- **Context:** The side panel no longer shows "No top domain yet" while local summary data is still loading, but keeps that copy for genuine loaded empty summaries.

## [2026-06-28 18:36] Budgeted Exposure Reading Model
- **Changes:** Replaced per-chunk effective reading scoring with viewport-level budget allocation, added viewport exposure events, session/day chunk caps, raw/effective exposure fields, coverage-based vocabulary updates, and heading/code extraction support.
- **Status:** Completed
- **Next Steps:** Validate the packaged extension smoke flows after typecheck and build.
- **Context:** `TextViewportExposureTick` is now the supported measured-reading event; old `TextBlockExposureTick` events are not part of the message contract.

## [2026-06-28 19:08] Viewport Ratio Snapshot Fix
- **Changes:** Updated content viewport exposure ticks to measure the current layout-visible ratio when each tick closes instead of reusing a historical maximum observer ratio; added a regression test for partially visible text.
- **Status:** Completed
- **Next Steps:** Continue reviewing the remaining Budgeted Exposure Model gaps, especially interaction confidence signals and adaptive WPM.
- **Context:** `TextBlockVisible` lifecycle events still use the observer entry ratio, while `TextViewportExposureTick.visibleChunks[].visibleRatio` now represents the tick-time viewport snapshot used by the reading budget allocator.

## [2026-06-28 19:30] Long Text Chunk Splitting
- **Changes:** Split long readable text elements into bounded sentence-based chunks, kept short trailing body-text sentences during splitting, and updated the collector to emit visibility and viewport exposure for every chunk sharing the same DOM element.
- **Status:** Completed
- **Next Steps:** Continue reviewing Budgeted Exposure Model gaps around interaction confidence signals, quote candidates, and adaptive WPM.
- **Context:** Short UI-like elements under the minimum word threshold are still skipped at the source element level, while long paragraphs can now produce multiple stable `TextViewportExposureTick.visibleChunks` entries instead of one oversized chunk.

## [2026-06-28 19:41] Raw Exposure For Capped Chunks
- **Changes:** Separated chunk raw-exposure aggregation from effective budget allocation so capped visible chunks still receive chunk and chunk-day raw exposure when other visible chunks receive effective words.
- **Status:** Completed
- **Next Steps:** Continue reviewing Budgeted Exposure Model gaps around interaction confidence signals, quote candidates, and adaptive WPM.
- **Context:** `rawExposureMs` now follows viewport visibility, while `effectiveWords`, `newWords`, `reviewWords`, and `effectiveReadingMs` still follow the budget allocator and session/day/lifetime caps.

## [2026-06-28 20:09] Adaptive WPM And Onboarding Calibration
- **Changes:** Added local reading pace profiles, onboarding WPM calibration in the dashboard, adaptive high-confidence viewport-sample updates, and storage aggregation support for calibrated base WPM.
- **Status:** Completed
- **Next Steps:** Continue validating real-page calibration behavior against longer browsing sessions.
- **Context:** Adaptive WPM uses raw viewport sample evidence rather than `effectiveWords / minutes`, and local data clearing now resets reading pace profiles with other local reading data.

## [2026-06-29 18:48] Moonlight UI Responsibilities
- **Changes:** Redesigned Popup, Side Panel, and Dashboard around the new responsibilities: current-site control center, current reading companion, and reading progress instrument panel. Added current-page reading summary data, refreshed UI smoke/browser smoke expectations, updated surface documentation, and unified entrypoint backgrounds.
- **Status:** Completed
- **Next Steps:** Use real reading sessions to tune current-page vocabulary and quote surfacing once page-scoped vocabulary data exists.
- **Context:** Side Panel now shows true current-page progress when the current URL has a local page record; vocabulary and saved highlights still come from existing recent local assets because vocabulary exposure is not page-scoped yet.

## [2026-06-29 19:29] Visible Supply Reading Cap
- **Changes:** Capped effective reading budgets by currently visible weighted word supply, capped per-chunk effective words by visible supply, folded effective reading time from effective words at active WPM, added chunk-level viewport geometry for split long text elements, and updated README/architecture docs.
- **Status:** Completed
- **Next Steps:** Validate real browsing sessions for long paragraphs, documentation pages, and code-heavy pages to tune chunk geometry and content weights.
- **Context:** `rawExposureMs` still records viewport exposure, while `effectiveReadingMs` is now explicitly a WPM-folded output rather than exact eye-on-text dwell time.

## [2026-06-29 19:44] Text Range Visibility
- **Changes:** Replaced height-sliced split-chunk visibility with DOM `Range.getClientRects()` text-level geometry, kept a fallback for unavailable range rects, and updated reading-model documentation.
- **Status:** Completed
- **Next Steps:** Validate on real pages with inline markup, wrapped paragraphs, and mixed text/code blocks to confirm range rects match visible text.
- **Context:** Internal `textRange` objects are stripped before runtime message delivery, so stored chunk snapshots remain structured and serializable.

## [2026-06-29 19:54] Browser DOM Test Harness
- **Changes:** Added a `test:browser-dom` script, a dedicated Vitest config, and a Chrome/CDP smoke harness that serves source modules to a real browser DOM and verifies text block extraction with native layout and `Range` geometry.
- **Status:** Completed
- **Next Steps:** Add more browser DOM fixtures when extraction logic changes in ways jsdom cannot represent accurately.
- **Context:** The browser DOM harness needs Chrome plus a temporary localhost server; sandboxed runs may require elevated permissions for local listening and CDP launch.

## [2026-06-29 20:11] Large Text Stress Scenario
- **Changes:** Added an opt-in `test:stress:large-text` pressure test covering a generated 1,200-paragraph real browser DOM fixture with native `Range` geometry and a 2,000-tick viewport aggregation batch.
- **Status:** Completed
- **Next Steps:** Use this stress script before changing extraction chunking, range geometry, or aggregation loops.
- **Context:** The stress path launches Chrome/CDP and a temporary localhost server, so sandboxed runs may require elevated permissions.

## [2026-06-29 20:43] SPA Dynamic Reading Support
- **Changes:** Added a dynamic-page manager around the content collector to debounce readable DOM mutation refreshes, rebuild same-route snapshots for injected or infinite-scroll content, and restart page snapshots after client-side route changes; added unit and real-browser SPA fixture coverage.
- **Status:** Completed
- **Next Steps:** Validate on real React, Vue, and Next.js pages with nested route transitions and long infinite-scroll feeds.
- **Context:** Client-side route support uses URL polling plus `popstate`/`hashchange` so it does not rely on patching page-world history APIs from the extension isolated world.

## [2026-06-29 21:21] Real Page Corpus Performance
- **Changes:** Added an opt-in `test:real-pages` Chrome/CDP benchmark, live public-page corpus coverage, source-generated extraction benchmark injection, report-file output, and README verification guidance.
- **Status:** Completed
- **Next Steps:** Investigate live sites that return zero readable blocks, starting with developer.chrome.com docs, and consider selector coverage for shadow-DOM or non-semantic documentation layouts.
- **Context:** The benchmark requires network access and uses `YUEL_REAL_PAGE_REPORT_PATH` for reproducible report capture; it is not part of the default unit test suite.

## [2026-06-29 22:10] Real Page Corpus Locale Fix
- **Changes:** Pinned Google-hosted corpus pages to English locale, launched the live-page benchmark Chrome instance with `--lang=en-US`, and asserted the Chrome Extensions tutorial page yields readable blocks.
- **Status:** Completed
- **Next Steps:** Continue treating landing pages separately from article/tutorial pages when expanding the live corpus.
- **Context:** `developer.chrome.com/docs/extensions/get-started` is a localized landing page that can legitimately produce no paragraph-style reading blocks; the corpus now uses the `hello-world` tutorial article instead.

## [2026-06-29 22:20] Text-Based English Detection
- **Changes:** Replaced document-declaration language gating with actual candidate-text English heuristics, updated collector startup behavior, added localized-page regression coverage, and documented the behavior.
- **Status:** Completed
- **Next Steps:** Re-run live corpus when expanding selector coverage to watch for false positives on non-English Latin-script pages.
- **Context:** English articles inside pages declaring another language now collect normally; Chinese prose and localized technology keyword lists remain skipped by token, script-ratio, and English signal-word checks.

## [2026-07-10 15:26] Unified Reading Interface Redesign
- **Changes:** Established shared OKLCH design tokens and UI primitives, redesigned Popup/Side Panel/Dashboard into a quiet reading instrument, localized visible metrics and documents, added responsive/accessibility states, made Side Panel data live and race-safe, corrected Popup busy actions, and hardened calibration timing/session handling. Expanded entrypoint UI coverage for permissions, refresh races, loading/error/empty states, share disclosure, progress semantics, and calibration locking.
- **Status:** Completed
- **Next Steps:** Validate visual density during real reading sessions and tune only from observed usage; the implementation, package build, unit suite, browser DOM/stress checks, and loaded-extension smoke are passing.
- **Context:** `DESIGN.md` is now the interface source of truth. The in-app browser declined the local extension preview under its URL security policy, so no alternate visual-control workaround was used; packaged Chrome smoke and deterministic DOM checks were used for final runtime verification.

## [2026-07-10 17:19] Frontend Compatibility and Technical Debt Hardening
- **Changes:** Removed unused Tailwind and Readability dependencies; centralized formatters, starter-site labels, share-card content, and semantic design tokens; hardened Chrome 116 message responses, dynamic content-script registration, permission/collector lifecycle, Popup/Side Panel/Dashboard async generations, focus restoration, responsive controls, and local-data monotonicity. Added regression coverage for failed message acknowledgements, delayed navigation batches, permission revocation, concurrent site mutations, stale page snapshots, repeated data clears, hung refreshes, and out-of-order UI queries.
- **Status:** Completed
- **Next Steps:** Re-run the loaded-Chrome smoke when the execution environment permits launching Chrome outside the sandbox; no code change is pending from this audit.
- **Context:** Final gates passed with 300 unit/UI tests, strict unused-aware TypeScript checks, the WXT production build, static extension smoke, interface anti-pattern detection, and clean diff validation. The latest loaded-Chrome rerun was blocked before assertions by sandbox `DevToolsActivePort`/localhost restrictions, and the required escalation was rejected because the environment usage limit was reached.

## [2026-07-10 18:56] Unified Brand Icon
- **Changes:** Added the supplied polished SVG as the canonical public logo, generated manifest-ready PNG sizes from it, replaced the shared Popup/Side Panel/Dashboard brand mark, added matching favicons, configured extension and toolbar icons, and extended UI/build smoke coverage for every icon entry point.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Functional action and status icons remain semantic Lucide icons; all brand and application identity surfaces now use the supplied logo artwork. The canonical SVG is byte-for-byte identical to the source file.

## [2026-07-10 19:02] Brand Icon Safe-Area Crop
- **Changes:** Tightened the canonical SVG from a `1254×1254` canvas to a centered `900×900` viewBox and regenerated every manifest PNG size so the brand mark reads larger across the interface, favicon, toolbar, and extension management surfaces.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Logo path geometry and color are unchanged. The revised framing keeps approximately 5.5% vertical and 9.2% horizontal safe space while increasing visible artwork coverage to roughly 89% high and 81% wide.

## [2026-07-10 19:42] Recent Website Favicons
- **Changes:** Added browser-cached website icons to dashboard recent-reading rows, a neutral globe fallback for unavailable icons, the Chrome `favicon` manifest permission, focused component coverage, and privacy documentation.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Icons are resolved through Chrome's local `/_favicon/` extension service, so opening reading history does not directly request icon files from recorded websites.

## [2026-07-10 19:51] Headless Chrome Automation
- **Changes:** Disabled WXT's automatic development-browser launch, made the packaged-extension Chrome smoke suite headless by default, and documented manual dev loading, visible-run opt-in, and process-sandbox requirements.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Chrome 150 and both CDP harnesses are healthy. Sandboxed launch reproduced a missing `DevToolsActivePort`, while the same DOM and packaged-extension suites passed outside the process sandbox; set `YUEL_BROWSER_SMOKE_HEADLESS=false` only when a visible run is intentional.

## [2026-07-10 19:54] Share Card Theme Carousel
- **Changes:** Rebuilt the dashboard check-in card as a manual four-theme carousel with distinct Forest, Mist, Midnight, and Berry compositions, responsive 4:5 previews, accessible theme controls, and theme-specific PNG filenames. Expanded dashboard smoke coverage for selection and selected-card export.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The carousel never auto-advances. TypeScript, all 305 tests, the production build, the interface detector, and live browser checks at desktop, 390px, and 240px widths passed without console errors or horizontal overflow.

## [2026-07-10 20:04] Full-Bleed Share Card Bands
- **Changes:** Unified responsive card units under the carousel viewport so the Mist metrics band and Berry reading panel reach both card edges without residual side gaps.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Live browser geometry reports exact 0px left and right gaps for both themes. The focused carousel test, production build, interface detector, and browser console checks pass.

## [2026-07-10 20:11] Truthful Live Recording Status
- **Changes:** Added a live content-collector status responder, recovered current-page identity when Chrome withholds tab URL metadata, separated unknown tabs from truly unsupported pages, and updated Popup/Side Panel copy to distinguish recording, enabled, no-English, unknown, and unsupported states. Expanded unit, UI, and loaded-Chrome regression coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The fix preserves the existing least-privilege manifest without adding the broad `tabs` metadata permission. All 313 unit/UI tests, TypeScript, the production build, static manifest smoke, interface detector, and three loaded-Chrome smoke flows pass.

## [2026-07-10 20:46] Playwright Browser Test Architecture
- **Changes:** Replaced both raw Chrome/CDP clients with Playwright-managed Chromium, migrated packaged-extension flows to Playwright Test persistent-context fixtures, added isolated profiles and failure traces/screenshots, hardened live-corpus deadlines and dependency injection, and updated browser-test scripts and documentation.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The Playwright version matches the local click2data reference (`1.58.2`). Unit/UI tests, TypeScript, static extension smoke, real DOM, large-text stress, a 22-page live corpus, and three packaged-extension E2E flows pass; process-sandbox launch failures now include the exact browser command, process log, trace, and screenshots.

## [2026-07-10 20:47] Reading Attention Budget V2
- **Changes:** Replaced renewable word budgets with shared attention-time water-filling, added additive Gaussian rect mass, stable sentence-aligned segments, one-second sampling, focus and scroll-expiry gates, bulk segment persistence, model-version coverage migration, same-route episode continuity, rolling-median adaptive samples, and lower comprehension-gated onboarding weights.
- **Status:** Completed
- **Next Steps:** Validate the new metric distribution on an opt-in real-world corpus before tuning thresholds or adding content-specific profiles.
- **Context:** Model version 2 preserves legacy page coverage while preventing migrated words from being counted as new again. All 326 unit/UI tests, TypeScript, production build, static extension smoke, real-browser DOM tests, and the 97k-word/2,000-tick pressure suite pass.

## [2026-07-10 21:57] Share Card Words Label
- **Changes:** Replaced the share card's “个英文词” label with “Words” in both the visual preview and copied summary, and updated matching test expectations.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The preview and clipboard copy continue to use the same terminology.

## [2026-07-10 22:15] Configurable Daily Check-in Goal
- **Changes:** Added a locally persisted daily effective-word goal, threshold-aware completion and streak calculation, historical streak recalculation when the goal changes, dashboard progress and editing UI, goal-gated card actions, responsive validation states, documentation, and focused regression coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The default goal is 500 effective words, the supported user range is 1–100,000 whole words, and reaching the goal counts as success. Clearing reading data preserves the goal setting.

## [2026-07-10 22:35] Dashboard Reading Visualizations
- **Changes:** Added a Monday-aligned 13-week dashboard history model, goal-relative activity heatmap, selectable effective-word trend line, weekday rhythm bars, input-composition ring chart, responsive and high-contrast styling, navigation, documentation, and regression coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** All data remains local. TypeScript, 344 unit/UI tests, the production build, the design detector, and diff checks pass; live screenshots were unavailable because the in-app browser blocks local development URLs and local files.

## [2026-07-10 22:44] Customizable Check-in Share Card
- **Changes:** Added continuous check-in days to the share card, replaced the single-domain footer with a compact one-to-three-site list, added optional Chrome-local favicons, and introduced locally persisted controls for theme, source count, icons, and streak visibility. Kept copied text aligned with the selected visible content and updated card, storage, UI, and accessibility coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** All four themes were visually verified at desktop and 390px widths; the 240px card retained 12px bottom clearance without vertical clipping. The interface detector reported no findings, all 344 unit/UI tests and TypeScript checks passed, and the production extension build succeeded.

## [2026-07-10 22:59] Transparent Check-in Card Export
- **Changes:** Changed the downloaded check-in card PNG canvas from white to transparent and updated the focused export regression test.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Transparent canvas corners now preserve the card's rounded silhouette. The focused image-export test and TypeScript check pass.

## [2026-07-11 00:10] Reading Progress Brand Mark
- **Changes:** Rebuilt the shared BrandLockup as a semantic daily-goal indicator, wired popup/side-panel/dashboard reading totals into it, added bottom-up gray-to-green filling, a one-shot champagne-gold completion bloom with a static finished state, forced-color and reduced-motion handling, product/design documentation, and focused regression coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Approved visual direction A preserves the compact horizontal lockup while increasing the mark to 32px/36px for perception. Visual QA covered 1280px and 320px viewports plus a 240px header, all 347 unit/UI tests and TypeScript checks pass, the design detector reported no findings, the production build succeeds, and all three packaged-extension E2E flows pass outside the Chromium-restricted process sandbox.

## [2026-07-11 02:28] Local Date Consolidation
- **Changes:** Added one pure local-calendar date module and replaced duplicate formatting, previous-day, and next-day helpers across storage and dashboard insights.
- **Status:** Completed
- **Next Steps:** Continue removing test-only fallback branches from production UI dependency contracts.
- **Context:** Five date formatters and three groups of calendar-shift helpers now reduce to two functions. Month/year boundary tests, all 349 unit/UI tests, and TypeScript checks pass; existing share-card work remains unmodified and unstaged.

## [2026-07-11 02:34] Storage Prefetch State Simplification
- **Changes:** Collapsed duplicate chunk/session/day prefetch maps into one map per state dimension, removed unreachable aggregation fallbacks after state cloning, and stopped decoding an unused adaptive field.
- **Status:** Completed
- **Next Steps:** Continue with the SidePanel production dependency contract and test fixture cleanup.
- **Context:** The storage path now uses three maps instead of six and removes 17 net lines without changing bulk-read keys or ordering. All 41 aggregation/repository tests and TypeScript checks pass; existing share-card work remains unstaged.

## [2026-07-11 02:37] Share Card Content Model Simplification
- **Changes:** Removed the unused precomputed copy text and redundant primary-domain alias from the share-card content model; copying continues to format from current user settings at action time.
- **Status:** Completed
- **Next Steps:** Continue with SidePanel dependency cleanup and collector event-envelope consolidation.
- **Context:** The single `domains` field remains the source for preview and copy output, eliminating 14 net lines and a potentially stale default copy snapshot. Focused share-card tests and TypeScript checks pass; existing transparent-export work remains unstaged.

## [2026-07-11 02:40] SidePanel Dependency Contract Simplification
- **Changes:** Made all production SidePanel services required, removed the test-only summary fallback path and optional-service branches, derived summary from the focused details snapshot, and replaced sparse inline test dependencies with one typed fixture factory.
- **Status:** Completed
- **Next Steps:** Apply the same evidence-based contract cleanup to Dashboard after the collector and storage batches.
- **Context:** Production and test code drop 143 net lines, two duplicate states, and an unreachable load path while retaining refresh/enable generation guards. All 55 UI smoke tests, TypeScript checks, and the production extension build pass; the sidepanel bundle decreased from 12.53 kB at baseline to 11.88 kB.

## [2026-07-11 02:42] Dormant Storage Placeholder Removal
- **Changes:** Removed page and chunk difficulty placeholders that were only preserved as zero, plus the never-written saved-item context field; existing IndexedDB rows remain readable because none are indexed or consumed.
- **Status:** Completed
- **Next Steps:** Continue removing other independently proven dead fields in separate commits.
- **Context:** The change removes 13 lines with no replacement abstraction. All 72 repository, reading-stats, and saved-item tests plus TypeScript checks pass; existing transparent-export work remains unstaged.

## [2026-07-11 02:43] Collector Event Envelope Consolidation
- **Changes:** Routed all collector events through one run-local emitter that owns session/page/queue state, reduced helper parameter threading, and added direct visible-to-hidden lifecycle coverage.
- **Status:** Completed
- **Next Steps:** Simplify the observer transition branch now that its event ordering is explicitly protected.
- **Context:** Twelve repeated event envelopes collapse to one construction point while preserving ID/time evaluation order. The new test fixes the `Visible → Exposure → Hidden` sequence and hidden payload; all 35 collector tests and TypeScript checks pass.

## [2026-07-11 02:51] Viewport Exposure Decoder Consolidation
- **Changes:** Replaced separate aggregation and adaptive visible-chunk decoders with one typed viewport-tick decoder, centralizing malformed-value defaults and the legacy content-weight fallback.
- **Status:** Completed
- **Next Steps:** Continue with read-model contract tightening and remaining proven dead fields.
- **Context:** Aggregate now owns budget projection and adaptive logic owns reliability filtering, while production implementation drops 16 net lines across the three modules. Two direct decoder tests plus all 41 aggregation/repository tests and TypeScript checks pass.

## [2026-07-11 02:53] Reading Event Kind Narrowing
- **Changes:** Removed three future event kinds that no collector emits and the runtime validator explicitly rejects, while retaining one raw-message rejection case per unsupported kind.
- **Status:** Completed
- **Next Steps:** Continue removing independently proven dormant model fields.
- **Context:** The domain union now describes only implemented events, and the protocol tests validate the actual unknown-input boundary without typed future payload fixtures. All 48 contract tests and TypeScript checks pass; the change removes 91 net lines.

## [2026-07-11 02:55] Dashboard Dependency Contract Simplification
- **Changes:** Made all Dashboard services required, removed production-inaccessible fallback implementations and aliases, and replaced sparse inline test dependencies with one typed, side-effect-free factory.
- **Status:** Completed
- **Next Steps:** Tighten the reading-summary field contract and remove remaining dormant counters.
- **Context:** Dashboard production and test code drop 162 net lines without changing refresh, clear, calibration, or share-action generation guards. All 55 UI smoke tests, TypeScript checks, and the production build pass; the dashboard chunk decreased from 50.45 kB at baseline to 50.05 kB.

## [2026-07-11 02:57] Collector Visibility Transition Simplification
- **Changes:** Reworked the observer callback into explicit measured visibility transitions, closed each changed viewport interval once, and reused one block-visibility event formatter for observer and layout restoration paths.
- **Status:** Completed
- **Next Steps:** Re-audit the collector after full browser-DOM and pressure verification before considering further changes.
- **Context:** The observer drops from 68 to 41 lines and from 12 to 8 decision points without moving branches into the helper; `collector.ts` removes 10 net lines. All 35 collector tests and TypeScript checks pass, including non-intersecting ratio preservation.

## [2026-07-11 03:09] Reading Summary Contract Simplification
- **Changes:** Removed never-produced advanced-word and expression counters, made check-in/history and read-store capabilities reflect their production guarantees, and removed the corresponding UI/test fallback paths and fixture noise.
- **Status:** Completed
- **Next Steps:** Remove the remaining unused vocabulary lookup counter and consolidate the last exact confidence helper duplicate.
- **Context:** The batch removes 83 net lines. All 57 UI/share-card tests, 70 reading/check-in/repository tests, TypeScript checks, and the production build pass; existing transparent-export work remains unstaged.

## [2026-07-11 03:13] Dormant Vocabulary Counter Removal
- **Changes:** Removed the never-incremented and never-rendered vocabulary lookup counter from storage records, write paths, read summaries, and test fixtures.
- **Status:** Completed
- **Next Steps:** Consolidate the remaining exact duplicate confidence-weighting helper.
- **Context:** The model contracts lose 17 lines without a schema migration because existing IndexedDB objects tolerate ignored properties. All 127 focused storage/UI tests, TypeScript checks, and the production build pass.

## [2026-07-11 03:16] Confidence Weighting Consolidation
- **Changes:** Moved the exact duplicate confidence-weighted average into the domain metrics module and reused it from aggregation and persistence.
- **Status:** Completed
- **Next Steps:** Simplify the remaining repeated Popup test dependency setup, then perform the full verification and repository re-audit.
- **Context:** One shared implementation replaces two identical local helpers for a 13-line net reduction. All 51 related metrics, aggregation, and repository tests plus TypeScript checks pass.

## [2026-07-11 03:22] Popup Test Dependency Simplification
- **Changes:** Replaced 18 repeated Popup dependency objects with one typed default factory and compact supported-site/enable-result builders, keeping each test focused on its behavioral variation.
- **Status:** Completed
- **Next Steps:** Run the complete verification matrix and commission a final evidence-based repository simplification audit.
- **Context:** The UI smoke suite loses 296 net lines and all repeated no-op Popup mocks. All 55 entrypoint behavior tests and TypeScript checks pass.

## [2026-07-11 03:35] Dormant Pack Validator Removal
- **Changes:** Removed the private app's uncalled pack validation result, executable-field scanner, object guard, and their two self-only tests while preserving the static pack matcher used at runtime.
- **Status:** Completed
- **Next Steps:** Finish the independently identified SidePanel fixture and incremental Dexie schema simplifications.
- **Context:** Production has no call or documentation path to the removed exports; the batch removes 60 net lines. The remaining pack matcher test and TypeScript checks pass.

## [2026-07-11 03:38] Incremental Dexie Schema Declarations
- **Changes:** Kept the complete v1 schema and reduced v2-v5 to their newly introduced tables, relying on Dexie's verified cumulative version schema semantics without changing versions or indexes.
- **Status:** Completed
- **Next Steps:** Complete the final SidePanel/UI test fixture deduplication and rerun the full verification matrix.
- **Context:** The schema loses 33 duplicate lines. A Chromium probe confirmed identical fresh-v5 tables/indexes and a v1-to-v5 upgrade with 11 tables, 27 indexes, and preserved legacy records; 72 storage tests, TypeScript checks, and the production build pass.

## [2026-07-11 03:49] Entrypoint Test Fixture Consolidation
- **Changes:** Reused typed site-access, enable-result, reading-pace, microtask-flush, and button-action fixtures across SidePanel and Dashboard behavior tests, retaining only each scenario's meaningful differences.
- **Status:** Completed
- **Next Steps:** Rerun the complete verification matrix, then perform a no-edit final repository audit.
- **Context:** The entrypoint smoke file removes 267 net lines without changing production code. All 55 UI behavior tests, TypeScript checks, and whitespace validation pass; the UI audit found no further evidence-backed simplification above the completion threshold.

## [2026-07-11 04:02] Reading Budget Test Fixture Consolidation
- **Changes:** Added one typed reading-budget input factory and replaced nine repeated seven-field test inputs with scenario-only overrides.
- **Status:** Completed
- **Next Steps:** Rerun the verification matrix affected by the final test-only change, then complete a no-edit stop audit.
- **Context:** The metrics test removes 35 net lines while preserving every boundary value and visible-chunk scenario. All 10 metrics tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:08] Message Contract Test Fixture Consolidation
- **Changes:** Replaced 62 repeated batch-message/payload spread wrappers with one typed payload-override fixture while leaving every malformed nested value explicit in its test.
- **Status:** Completed
- **Next Steps:** Rerun the full affected verification and perform the final no-edit duplication audit.
- **Context:** The contract test removes 112 net lines without changing validators or assertions. All 48 message-contract tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:21] Message Event Fixture Consolidation
- **Changes:** Replaced 44 repeated base-event spreads with one typed shallow event fixture whose override values remain intentionally permissive for malformed-input tests.
- **Status:** Completed
- **Next Steps:** Commit the independently verified collector visibility-entry fixture, then reassess higher-level test wrappers.
- **Context:** The contract test removes another 31 net lines while keeping every invalid event field explicit. All 48 message-contract tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:22] Collector Visibility Test Fixture Consolidation
- **Changes:** Replaced 23 repeated visible IntersectionObserver entries with one typed target/ratio fixture while retaining the sole non-intersecting transition as an explicit object.
- **Status:** Completed
- **Next Steps:** Resolve the independent audit of higher-level test wrappers, then rerun the complete verification matrix.
- **Context:** The collector test removes 81 net lines without hiding visibility transitions or lifecycle actions. All 35 collector tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:28] Invalid Payload Assertion Consolidation
- **Changes:** Replaced 61 identical construct-validate-expect-false wrappers with one typed `expectInvalidPayload` helper, while preserving valid, missing-payload, and raw-unknown paths explicitly.
- **Status:** Completed
- **Next Steps:** Commit the independently verified entrypoint render wrappers, then finish the remaining read-model and collector-fixture review.
- **Context:** The message-contract test removes 240 net lines without changing any malformed inputs, validator calls, or expected results. All 48 contract tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:29] Entrypoint Render Wrapper Consolidation
- **Changes:** Replaced 53 repeated component/dependency-factory/render wrappers with three typed Popup, Dashboard, and SidePanel render helpers.
- **Status:** Completed
- **Next Steps:** Remove the independently confirmed dormant current-page view-model fields and remaining mechanical collector fixtures.
- **Context:** The UI behavior test removes 200 net lines while preserving dependency override order, awaited rendering, and component props. All 55 entrypoint tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:33] Current Page View Model Simplification
- **Changes:** Removed page id, domain, and last-read timestamp from the private current-page summary because SidePanel consumes none of them; the page id remains local to storage lookup.
- **Status:** Completed
- **Next Steps:** Commit the mechanical collector DOM/observer fixtures and finish the remaining dormant read-model review.
- **Context:** The read model and fixtures remove 38 net lines. All 31 reading-stat tests, 55 UI behavior tests, TypeScript checks, production build, and whitespace validation pass; the extension bundle is 544.22 kB.

## [2026-07-11 04:34] Collector DOM and Observer Fixture Consolidation
- **Changes:** Replaced 23 identical guide DOM templates and 20 first-observer visible emits with two narrow helpers, leaving multi-entry, hidden, mutation, and lifecycle-order cases explicit.
- **Status:** Completed
- **Next Steps:** Remove the remaining independently confirmed dormant read-model fields, then run final verification and stop audits.
- **Context:** The collector test removes 120 net lines without absorbing flush, mock-clear, timer, or stop ordering. All 35 collector tests, TypeScript checks, and whitespace validation pass.

## [2026-07-11 04:38] Dormant Read Model Surface Removal
- **Changes:** Removed unconsumed vocabulary-summary counts/timestamps, the unused history-domain projection, and two zero-reference exports while preserving storage records, indexes, and today's domain summary.
- **Status:** Completed
- **Next Steps:** Run the final complete verification matrix and no-edit repository stop audits.
- **Context:** The private read-model surface removes 19 physical lines. All 134 related contract, reading-stat, and UI tests, TypeScript checks, production build, and whitespace validation pass; the bundle is 544.13 kB.

## [2026-07-11 04:46] Invalid Event Assertion Consolidation
- **Changes:** Replaced 36 repeated single-event payload assertion wrappers with one typed `expectInvalidEvent` helper while preserving multi-event, page, chunk, raw-unknown, and valid paths explicitly.
- **Status:** Completed
- **Next Steps:** Run the final unit/type verification and no-edit stop audit, then push the completed refactor series.
- **Context:** The message-contract test removes 132 net lines. All 48 contract tests, TypeScript checks, and whitespace validation pass; the final nested-wrapper scan found no remaining fixture family above the simplification threshold.

## [2026-07-11 04:49] Behavior-Preserving Repository Simplification Complete
- **Changes:** Completed 27 small refactor commits across domain, storage, collector, UI dependency contracts, read models, and test fixtures without changing the persisted event contract or user-facing flows.
- **Status:** Completed
- **Next Steps:** None; future changes should preserve the verified narrow contracts and add complexity only for demonstrated behavior.
- **Context:** Across 31 files, production code removes 391 net lines and tests remove 1,828 net lines, excluding this append-only ledger. All 351 unit tests, normal and strict TypeScript checks, production build, static extension smoke, Chromium DOM and large-text suites, both packaged-extension Playwright gates, real-page corpus, and the Dexie v1-to-v5 upgrade probe pass. Architecture, duplication, and independent final audits all report STOP; existing transparent-export work remains unstaged.

## [2026-07-11 08:37] Chrome Toolbar Reading Progress Logo
- **Changes:** Added a service-worker-rendered Chrome toolbar Logo with 16 bottom-up gray-to-green progress steps, exact daily-goal tooltip text, a static champagne-gold completion outline/glow, and a non-color-only `✓` badge. Centralized updates in the background after stored reading batches, dashboard goal changes, local-data clearing, startup, and local-day rollover; added runtime messaging, focused unit/UI coverage, packaged-extension coverage, and product documentation.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The toolbar uses cached 16/24/32px `ImageData` generated from the canonical Logo geometry and keeps incomplete states visibly short of full fill. All 365 unit tests, TypeScript checks, production build, static extension smoke, four packaged-extension Playwright tests, whitespace checks, the Impeccable detector, and light/dark visual inspection pass.

## [2026-07-11 09:01] Chrome Toolbar Completion Glow Amplification
- **Changes:** Replaced the single soft completion stroke with a three-layer champagne-gold halo, increased the solid edge blur, and inset the completed Logo slightly so the wider falloff remains visible inside 16/24/32px bitmaps. Updated the design-system description to match.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The existing green and gold palette remains unchanged. The targeted toolbar tests, TypeScript checks, production build, whitespace validation, and light/dark visual inspection pass.

## [2026-07-11 11:42] Required Tabs Permission
- **Changes:** Added Chrome's `tabs` permission to the required extension manifest, updated the generated-manifest smoke assertion, and documented why the persistent side panel needs tab URL metadata.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Page-content access remains governed by per-site optional host permissions; `tabs` only removes the frequent unknown-current-page state caused by hidden tab URL metadata.

## [2026-07-11 12:19] Default All-Site Reading Access
- **Changes:** Promoted HTTP/HTTPS host access to required manifest permissions, made the static content script cover all web pages, removed the application-level site allowlist and manual enable/pause UI, and added upgrade cleanup for the legacy dynamic script and stored origins.
- **Status:** Completed
- **Next Steps:** Reload or reinstall the unpacked extension so Chrome applies the new required host permissions.
- **Context:** Chrome remains the authority for global and per-site extension restrictions, which Yuel now reports as browser-controlled access limits. All 322 unit tests, TypeScript checks, production build, generated-manifest smoke, and four packaged-extension Chromium tests pass, including automatic collection on a non-legacy HTTPS domain.

## [2026-07-11 13:07] Vocabulary Exposure Ceiling
- **Changes:** Added a vocabulary-specific count formatter that rounds fractional effective exposures upward, and applied it consistently in the side panel and dashboard with focused formatter and UI coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Other reading metrics retain their existing nearest-integer rounding. The two targeted test files pass with 50 tests, TypeScript checks pass, and whitespace validation is clean.

## [2026-07-12 09:06] Heatmap Month Label Deduplication
- **Changes:** Changed the 13-week heatmap to label a month only in the week containing its first calendar day, while preserving the initial visible month's fallback label. Added a fixed-date rendering regression test for the April-to-July 2026 range.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The previous `day <= 7` check labeled both a cross-month week and the following week for months beginning late in a week. All 324 unit/UI tests, TypeScript checks, the production build, and a packaged-extension Chromium screenshot verification pass.

## [2026-07-12 16:36] Configurable Browser Progress Icon
- **Changes:** Added a locally persisted browser-toolbar progress preference, a reading-profile switch with save and refresh feedback, static Logo/title/badge restoration when disabled, focused unit and UI coverage, packaged-extension coverage, and updated product documentation.
- **Status:** Completed
- **Next Steps:** Reload the unpacked extension before using the new setting.
- **Context:** Progress feedback remains enabled by default and the preference survives local reading-data clearing. All 332 unit/UI tests, TypeScript checks, the production build, generated-extension smoke validation, and four packaged-extension Chromium tests pass; the E2E flow also verifies static-mode action state and preference persistence.

## [2026-07-12 18:44] Reading Recording Controls and Pace Reset
- **Changes:** Added a locally persisted global automatic-recording switch, normalized current-site exclusions in the popup, distinct Chrome/global/site status reporting, content-script and background write-time enforcement, and a reading-speed reset that removes the active profile plus unfinished adaptive episodes. Added a shared switch primitive, focused storage/content/access/UI tests, packaged-extension coverage, and updated README/design documentation.
- **Status:** Completed
- **Next Steps:** Reload the unpacked extension so already installed development builds use the new content script and settings UI.
- **Context:** Global pause preserves site preferences and existing local data; site pause does not change Chrome permissions or explicit selection saving. All 350 unit/UI tests, TypeScript checks, production build, generated-extension smoke validation, four packaged-extension Chromium tests, whitespace checks, the Impeccable detector, and desktop/mobile visual inspection pass.

## [2026-07-14 00:11] Bounded PDF Source Loading
- **Changes:** Added a source-neutral PDF loading boundary with local-file and remote-URL adapters, streamed progress, cancellation, declared and measured byte limits, HTTP and PDF-header validation, immutable metadata, content-derived SHA-256 resource IDs, and explicit buffer release.
- **Status:** Completed
- **Next Steps:** Connect the validated source handle to the locally packaged EmbedPDF PDFium worker and the new reader entrypoint.
- **Context:** Remote loading never delegates URL fetching to EmbedPDF, so the future Range Loader remains isolated behind the same source contract. All 362 unit/UI tests, the focused 12-case source suite, TypeScript checks, and whitespace validation pass.

## [2026-07-14 01:07] Local PDFium Reader Core
- **Changes:** Added the standalone `pdf-reader.html` workspace, exact EmbedPDF 2.14.4 engine/plugin registration, extension-packaged PDFium WASM and Blob workers, local and bounded remote source opening, password retry, virtualized continuous pages, base-plus-tile rendering, page/zoom/fit/rotate controls, keyboard navigation, floating controls, responsive states, MV3 WASM CSP, build-output validation, and packaged-browser pixel coverage.
- **Status:** Completed
- **Next Steps:** Add Popup and Side Panel launch actions, then implement the contextual thumbnail/search panel, text selection, and the PDF-to-Yuel reading analytics bridge.
- **Context:** Remote PDFs still download completely before opening and remain capped by the source adapter; PDF bytes are not persisted and remote font fallback is disabled. The fixed Grid row placement is required so the optional activity banner cannot collapse the reader viewport. All 370 unit/UI tests, TypeScript checks, production build, five packaged-extension Chromium tests, three repeated PDF render runs, and whitespace validation pass.

## [2026-07-14 01:12] PDF Reader Launch Actions
- **Changes:** Added dedicated PDF reader launch actions to the Popup and Side Panel with independent busy and failure states, responsive full-width action placement, injected navigation dependencies, UI behavior coverage, and packaged-extension navigation coverage.
- **Status:** Completed
- **Next Steps:** Implement the reader's contextual thumbnail/search panel and text selection layer.
- **Context:** Both entry surfaces open the same standalone `pdf-reader.html` tab and leave existing site access, statistics refresh, dashboard, share-card, and side-panel actions unchanged. All 56 entrypoint UI tests, TypeScript checks, production build, the packaged navigation test, and whitespace validation pass.

## [2026-07-14 01:33] Contextual PDF Navigation and Selection
- **Changes:** Added exact EmbedPDF 2.14.4 interaction-manager, pan, search, selection, and thumbnail plugins; a single-context thumbnail/search sidebar; virtualized thumbnail navigation; debounced full-text search with flags, grouped results, coordinate-aware jumps, and page highlights; pointer-coordinate providers; text selection with copy feedback; hand-tool panning; search, copy, and pan shortcuts; and a narrow-screen overlay layout.
- **Status:** Completed
- **Next Steps:** Extract stable PDF page/text-block identities and connect PDF visibility, exposure, idle, scroll, and selection events to the existing Yuel reading analytics protocol.
- **Context:** Search cancellation remains owned by the plugin, selection geometry is capped at 24 cached pages, thumbnail buffering is capped at two extra rows, and remote PDFs still use the bounded full-download source adapter. All 376 unit/UI tests, TypeScript checks, production build, whitespace validation, five packaged-extension Chromium tests, and desktop/mobile visual inspection pass.

## [2026-07-14 01:45] Resource-Aware Reading Snapshot Protocol
- **Changes:** Extracted the sentence-aligned 8–24 word splitter into a source-neutral analysis module; added backward-compatible resource and section identities to reading snapshots, message validation, and local storage records; and documented the one-document/physical-section mapping for PDF analytics.
- **Status:** Completed
- **Next Steps:** Build PDFium text-run extraction into stable English chunks with page-coordinate geometry, then connect those chunks to the existing reading event collector semantics.
- **Context:** Existing web batches remain valid without the optional fields, PDF batches require a stable resource identity and a section identity for every chunk, and no Dexie index or schema-version migration is needed. All 385 unit/UI tests, TypeScript checks, production build, and whitespace validation pass.

## [2026-07-14 01:59] Stable PDF Text and Geometry Model
- **Changes:** Added a source-neutral PDF analytics layer that serially extracts PDFium text runs, preserves renderer preemption between pages, joins font-split word runs, filters and chunks English text through the shared 8–24 word model, derives stable document/page/chunk identities, retains bounded source-coordinate rectangles, and projects geometry through intrinsic plus reader rotation.
- **Status:** Completed
- **Next Steps:** Mount the model in the PDF reader lifecycle and translate visible chunk geometry, scroll motion, activity, idle state, and selection changes into the existing Yuel event batches.
- **Context:** Extraction is cancellable and does not retain PDFium run payloads after each page is converted. PDF bytes remain outside storage, source rectangles remain independent of zoom, and malformed or non-English runs cannot create trackable chunks. All 394 unit/UI tests, focused PDF analytics tests, TypeScript checks, production build, and whitespace validation pass.

## [2026-07-14 02:16] Shared Reading Session Runtime
- **Changes:** Extracted the reading lifecycle, ordered batch delivery, visibility transitions, viewport exposure heartbeat, focus and idle state, scroll velocity, selection hashing, and source-neutral viewport geometry into `src/analytics/`; reduced the web collector to DOM extraction and browser-source adapters; and isolated runtime message delivery in a reusable client.
- **Status:** Completed
- **Next Steps:** Mount the PDF text model in the reader and provide projected chunk geometry, reader scroll metrics, visibility transitions, and selected text to the shared session runtime.
- **Context:** Web event ordering and values remain covered by the existing collector suite, overlapping flushes now serialize so a delayed failed batch cannot be overtaken, and PDF resource/section metadata passes the existing message contract unchanged. All 403 unit/UI tests, TypeScript checks, production build, whitespace validation, and five packaged-extension Chromium tests pass.

## [2026-07-14 02:26] PDF Reading Runtime Adapter
- **Changes:** Added a React-independent PDF runtime model that strips source geometry from message chunks, captures mounted virtual page bounds, projects stable PDF coordinates through zoom and rotation into the reader viewport, computes shared exposure measurements, and closes chunk visibility when buffered pages unmount.
- **Status:** Completed
- **Next Steps:** Mount the adapter in the loaded PDF document lifecycle, subscribe to viewport and selection events, and deliver PDF batches through the shared reading session.
- **Context:** Only mounted current and neighboring pages are scanned on scroll; full-document source rectangles remain local to the reader and are never copied into runtime messages. All 408 unit/UI tests, focused geometry and virtualization tests, TypeScript checks, production build, and whitespace validation pass.

## [2026-07-14 02:35] Sparse PDF Reading Event Batches
- **Changes:** Added a PDF-only event-referenced chunk strategy to the shared reading session, allowed validated PDF batches to carry a subset of document chunks while preserving full document word totals, accumulated unique coverage across sparse batches for the same stable PDF resource, and documented the protocol boundary.
- **Status:** Completed
- **Next Steps:** Mount the PDF analytics adapter in the loaded reader lifecycle and connect viewport, scroll, activity, and selection signals to sparse batch delivery.
- **Context:** Existing web batches still require and deliver a complete page snapshot. Page-only PDF lifecycle batches carry no extracted text, event-linked chunks preserve source order, resource changes cannot inherit prior PDF coverage, and metric-model migration baselines remain bounded. All 416 unit/UI tests, TypeScript checks, production build, and whitespace validation pass.

## [2026-07-14 02:54] PDF Reading Analytics Bridge
- **Changes:** Mounted cancellable PDFium text extraction in the loaded reader lifecycle; bridged virtual page visibility, projected chunk measurements, reader scroll metrics, focus/idle handling, and selected text into the shared sparse reading session; refreshed geometry across scrolling, resizing, zoom, rotation, and virtual page mount changes; and extended packaged-extension coverage through dashboard persistence.
- **Status:** Completed
- **Next Steps:** Run final packaged-output and long-document memory checks, then review remaining reader polish and release readiness.
- **Context:** PDF text rectangles are already top-left device coordinates in EmbedPDF 2.14.4 and require no Y-axis inversion. The shared session still batches roughly every 15 seconds or on lifecycle flush; PDF bytes and source rectangles remain outside IndexedDB. All 417 unit/UI tests, focused PDF analytics tests, TypeScript checks, production build, whitespace validation, and five packaged-extension Chromium tests pass.

## [2026-07-14 03:06] Large PDF Reader Stress Baseline
- **Changes:** Added a configurable generated multi-page PDF fixture and an opt-in packaged-extension pressure test that measures sequential analytics extraction, verifies bounded virtual page and image mounts at the document start and end, tracks renderer heap/DOM/document growth, rejects remote requests, and confirms large-PDF exposure reaches the existing dashboard.
- **Status:** Completed
- **Next Steps:** Review release readiness and keep true HTTP Range loading as a separate source-layer enhancement.
- **Context:** The default 160-page / 20,160-word run extracted in 514 ms with pages 1–2 or 159–160 mounted, a 4.65 MiB renderer-heap increase, 248 additional DOM nodes, and no additional document objects. A 500-page / 63,000-word audit extracted in 2.03 s with only pages 1–2 or 499–500 mounted and a 6.55 MiB heap increase. All 417 unit/UI tests, TypeScript checks, production build, generated-output smoke validation, whitespace validation, five packaged-extension Chromium tests, and both PDF stress scales pass.

## [2026-07-14 09:00] PDF Trackpad Content Zoom
- **Changes:** Mounted EmbedPDF's zoom gesture wrapper around the virtual PDF scroller so trackpad pinch and Ctrl/Cmd-wheel gestures update document zoom around the pointer instead of changing Chromium page zoom; added layout support for the wrapper and packaged-extension regression coverage.
- **Status:** Completed
- **Next Steps:** Publish the active PDF resource identity to the side panel so current-document reading progress can be queried without treating the reader as an unsupported browser page.
- **Context:** TypeScript checks and the production build pass. The focused packaged-extension test confirms PDF zoom changes while `devicePixelRatio` and `visualViewport.scale` stay fixed, then completes rendering, search, rotation, selection, responsive navigation, and analytics persistence checks.

## [2026-07-14 09:07] PDF Side Panel Reading Context
- **Changes:** Added a tab-scoped PDF reader session record in `chrome.storage.session`, published and cleared it with the loaded reader lifecycle, exposed direct page-ID reading-summary lookup, and taught the side panel to render the active PDF name, document coverage, and recording state without passing through HTTP site-permission logic.
- **Status:** Completed
- **Next Steps:** Read PDF bookmarks from PDFium and add a hierarchical chapter-outline mode to the existing navigation panel.
- **Context:** The session record contains only stable resource/page identifiers, display name, source domain, and update time; PDF bytes remain in memory. Ninety-four focused unit/UI tests, TypeScript checks, production build, whitespace validation, and the packaged PDF reader test pass. The side-panel bundle keeps the new shared session chunk to 2.85 KB rather than importing the full analytics surface.

## [2026-07-14 09:14] PDF Chapter Outline Navigation
- **Changes:** Added a hierarchical chapter-outline mode backed by PDFium bookmarks, local destination and fit-mode mapping, active-page styling, empty/error states, nested bookmark fixture generation, and packaged-extension navigation coverage.
- **Status:** Completed
- **Next Steps:** Remove the duplicate zoom controls from the floating bottom page-navigation module while preserving the complete toolbar zoom controls.
- **Context:** Only direct and local GoTo destinations are interactive; external actions remain inert. Raw PDF XYZ coordinates are intentionally not forwarded into the reader's top-left scroll coordinate system. Focused outline and plugin tests, TypeScript checks, production build, whitespace validation, and the packaged PDF reader test pass.

## [2026-07-14 09:16] Single PDF Zoom Module
- **Changes:** Reduced the floating bottom reader controls to page navigation only, removed their duplicate zoom buttons, percentage output, divider, and obsolete styles, and added a packaged-extension assertion that only the toolbar zoom module remains.
- **Status:** Completed
- **Next Steps:** Run the complete unit, type, production-build, packaged-extension, and large-PDF verification suite before pushing the branch.
- **Context:** The top toolbar remains the single full zoom module with percentage input and fit modes; trackpad content zoom remains available through the document viewport. Focused tests, TypeScript checks, production build, whitespace validation, and the packaged PDF reader test pass.

## [2026-07-14 09:19] PDF Reader Optimization Verification
- **Changes:** Updated the README to document PDF chapter outlines, content-level trackpad zoom, current-PDF side-panel progress, the single contextual navigation panel, and the expanded packaged-extension verification path.
- **Status:** Completed
- **Next Steps:** Push the verified fine-grained commit series.
- **Context:** All 428 unit/UI tests, TypeScript checks, production builds, whitespace validation, five packaged-extension Chromium tests, and the 160-page / 20,160-word PDF stress test pass. The stress run kept only pages 1–2 or 159–160 mounted, added 4.65 MiB of renderer heap, and created no additional document objects.

## [2026-07-14 10:05] Reading Duration Insights
- **Changes:** Added the Dexie v6 `readingSessions` table, persisted effective-reading intervals with a five-minute same-session merge, composed cross-page focus sessions for dashboard reads, added effective-duration summaries, daily trends, source totals, recent sessions, and page-level duration, and aligned duration labels across extension surfaces and share cards.
- **Status:** Completed
- **Next Steps:** Tune the five-minute session boundary or 30-second display threshold only from observed reading behavior; no historical backfill is planned.
- **Context:** The feature reuses the existing Budgeted Exposure Model's effective attention time and does not introduce a second timer or count page-open duration. All 434 unit/UI tests, TypeScript checks, production build, whitespace validation, design-rule scan, and five packaged-extension Chromium tests pass; desktop and 520px screenshots were inspected without overlap or horizontal overflow.

## [2026-07-14 10:31] Reading Duration Insight Hardening
- **Changes:** Kept horizontally scrollable duration trends aligned with their date axis and focused on the latest days, added a native keyboard/touch/screen-reader disclosure for complete daily duration details, corrected sub-minute trend and source bars to use real positive denominators, and added focused regression coverage for all three cases.
- **Status:** Completed
- **Next Steps:** Keep the five-minute session boundary and 30-second focus-session threshold unchanged until observed reading behavior justifies tuning.
- **Context:** The fixes are split across commits `b074693`, `9c16d91`, and `6580027`. All 437 unit/UI tests, TypeScript checks, production build, whitespace validation, design-rule scan, and five packaged-extension Chromium tests pass.

## [2026-07-14 12:28] PDF Reader Source Backlinks and Resume
- **Changes:** Added annotation-backed PDF selection saving with page/rectangle anchors and Dashboard/Side Panel backlinks; persisted and restored page position, zoom, rotation, scroll strategy, and pan mode; added recent-document reopening with SHA-256 identity checks; enabled embedded links and read-only existing annotations; and added print plus original-name download controls.
- **Status:** Completed
- **Next Steps:** Build the native highlight, note, annotation-sidebar, export, vocabulary, and review loop on top of the new PDF annotation and document-state tables.
- **Context:** Local PDF bytes remain memory-only, so local recents and backlinks require the user to reselect the original file before restoring. Remote documents reopen through the original URL and are accepted only when the resulting content hash matches. All 455 unit/UI tests, TypeScript checks, production build, generated-output smoke validation, whitespace validation, five packaged-extension Chromium tests, the focused PDF workflow E2E, and the 160-page / 20,160-word pressure test pass.

## [2026-07-14 13:58] Safe PDF External Links
- **Changes:** Disabled the annotation plugin's automatic URI opener and added an explicit absolute HTTP/HTTPS allowlist for external PDF links while preserving internal document navigation.
- **Status:** Completed
- **Next Steps:** Render saved PDF source rectangles when a Dashboard or Side Panel backlink reopens the document.
- **Context:** Unsupported schemes, relative paths, and malformed URLs remain inert. Eleven focused link and plugin tests plus TypeScript checks pass.

## [2026-07-14 14:01] PDF Backlink Source Highlight
- **Changes:** Added opaque annotation IDs to reader launch targets, validated annotation/resource/page identity before reading local rectangles, and rendered a scaled non-interactive source highlight after Dashboard or Side Panel backlinks reopen a PDF.
- **Status:** Completed
- **Next Steps:** Harden view-state persistence after zoom and rotation layout changes.
- **Context:** Selected text is not placed in the reader URL. One hundred fifteen focused storage, navigation, aggregation, and UI tests, TypeScript checks, the production build, and the packaged local-PDF backlink workflow pass.

## [2026-07-14 14:09] Precise PDF Rotation Resume
- **Changes:** Changed document-state flushes to sample current scroll metrics instead of reusing the last scroll-event snapshot, preventing rotated layouts from persisting stale page coordinates.
- **Status:** Completed
- **Next Steps:** Run the complete unit, type, production-build, packaged-extension, and large-PDF regression suite before pushing.
- **Context:** The packaged local-PDF workflow now scrolls within a page, rotates it, reloads the reader, reselects the original file, and verifies the normalized visible position restores within two PDF points. The focused workflow passed twice consecutively.

## [2026-07-14 14:12] PDF Reader Batch One Final Verification
- **Changes:** Verified the complete first-batch implementation and the three follow-up hardening commits on the production extension artifact.
- **Status:** Completed
- **Next Steps:** Begin the P1 native highlight, note, annotation-sidebar, export, vocabulary, and review loop as a separate batch.
- **Context:** All 469 unit/UI tests, TypeScript checks, production build, generated-output smoke test, and five packaged-extension Chromium tests pass. The 160-page / 20,160-word pressure test completed extraction in 1,009 ms, kept only pages 1–2 or 159–160 mounted, added 4.81 MiB of renderer heap, and created no additional document objects.

## [2026-07-15 10:18] Dashboard Header Redesign
- **Changes:** Replaced the oversized three-layer dashboard introduction with a compact “阅读记录” heading, converted the large local-data pill into a quiet inline status with full accessible descriptions, tightened spacing, and added responsive behavior that hides redundant status copy on narrow screens.
- **Status:** Completed
- **Next Steps:** Observe the header alongside real reading data and keep future dashboard copy equally concise.
- **Context:** TypeScript checks, all 59 entrypoint smoke tests, the production build, whitespace validation, the packaged-extension page-load test, and desktop/mobile browser geometry checks pass. The 1280px header is 52px high; the 390px layout has no overlap or horizontal overflow.

## [2026-07-15 10:38] Expanded Reading Pace Calibration
- **Changes:** Expanded the onboarding calibration passage from 203 to 340 words across six readable paragraphs, increased the comprehension check from three to five questions, made the question-count heading data-driven, and synchronized focused tests and calibration documentation.
- **Status:** Completed
- **Next Steps:** Observe completion and abandonment rates during real calibration sessions before increasing the passage length again.
- **Context:** Scoring remains unchanged in principle: 5/5 answers use weight 0.35, 4/5 uses 0.15, and two or more wrong answers reject the timing sample. All 70 focused calibration/UI tests, TypeScript checks, the production build, and whitespace validation pass.

## [2026-07-15 10:47] Randomized Reading Pace Materials
- **Changes:** Replaced the single expanded calibration passage with a local pool of four 200–260-word English materials, each with three matched comprehension questions; each calibration session now selects one material at random and keeps it fixed through reading, questions, and saving. Added deterministic selection injection, material validation, random-boundary coverage, selected-material save assertions, and synchronized calibration documentation.
- **Status:** Completed
- **Next Steps:** Observe whether material variety reduces repeat familiarity without increasing calibration abandonment.
- **Context:** The existing 3/3 and 2/3 confidence weights remain unchanged. All 473 unit/UI tests, TypeScript checks, the production build, and whitespace validation pass.

## [2026-07-15 11:41] Reading Pace Calibration Hardening
- **Changes:** Smoothed scroll WPM across complete gestures, separated adaptive fast-jump termination from the earlier engagement-decay threshold, added bounded reverse-scroll hysteresis, paused onboarding timing while hidden or unfocused, made adaptive confidence scale EMA weight, removed the three-sample/default-profile buffer, renamed the accepted-episode counter to `adaptiveSampleCount`, and removed redundant `hasProfile` state.
- **Status:** Completed
- **Next Steps:** Validate the 80–240 px reverse band and `5 x` fast-jump threshold against real mouse-wheel, trackpad, keyboard, and PDF reading sessions before further tuning.
- **Context:** Every accepted adaptive episode now updates the profile once, so the displayed count matches qualified episode usage. All 477 unit/UI tests, TypeScript checks, production builds, generated-extension smoke validation, and whitespace validation pass.

## [2026-07-15 12:28] Adaptive Episode Boundary Fixes
- **Changes:** Reworked adaptive episode parsing to continue after boundaries and apply multiple qualified samples from one batch in order; added a page-scoped scroll-coordinate reset for readable DOM changes, web viewport resizing, and PDF zoom or rotation while preserving accumulated reading evidence; removed the unused public PDF layout-refresh method and synchronized tests and architecture documentation.
- **Status:** Completed
- **Next Steps:** Observe coordinate resets in real dynamic-page and PDF sessions before changing their trigger set.
- **Context:** PDF resize notifications intentionally remain visibility-only because resetting on every resize interfered with rotated-position restoration. All 481 unit/UI tests, TypeScript checks, production build, generated-extension smoke validation, whitespace validation, and five packaged-extension Chromium tests pass; the focused PDF rotation-resume scenario also passed twice consecutively.

## [2026-07-15 13:28] Web Page Snapshot Reference Protocol
- **Changes:** Added deterministic web page snapshot identities, an initial snapshot-registration message, event-only reference batches, automatic re-registration after MV3 worker cache loss, a sender-scoped bounded background snapshot registry, structured delivery responses, backward-compatible legacy batches, and focused protocol/client/background/collector coverage.
- **Status:** Completed
- **Next Steps:** Observe registration churn under real MV3 suspension and tune the 32-entry or 30-minute cache bounds only if measured multi-tab workloads require it.
- **Context:** Web chunk text is serialized once per active snapshot during normal operation. PDF analytics retain their existing event-referenced sparse batches to avoid a full-document registration message. A failed first storage write can retry by reference when the snapshot was already accepted, and duplicate event IDs remain storage-idempotent.

## [2026-07-15 15:54] Chrome Default PDF Handler
- **Changes:** Added a default-on popup preference for opening top-level Chrome PDFs in Yuel, public `chrome.mimeHandler` manifest/API integration with native fallback, conservative response-header DNR rules for current Chrome versions, authenticated redirect-source loading, attachment/download preservation, and focused unit, build-smoke, and packaged-extension coverage.
- **Status:** Completed
- **Next Steps:** Exercise the native one-use stream path in a Chrome build where the public MIME handler feature is enabled; the current packaged-browser run validates the DNR compatibility path.
- **Context:** The DNR fallback handles top-level HTTP/HTTPS GET PDFs only, repeats the origin request with applicable cookies, and leaves attachments, embedded PDFs, POST responses, local files, and blob/data URLs to Chrome. All 517 unit/UI tests, TypeScript checks, production build, generated-extension smoke validation, whitespace validation, and six packaged-extension Chromium tests pass.

## [2026-07-15 16:23] Remove Side Panel Manual PDF Launch
- **Changes:** Removed the generic “Open PDF Reader” action from the Side Panel footer, tightened its PDF navigation dependency to require a concrete document target, and retained saved-excerpt source backlinks.
- **Status:** Completed
- **Next Steps:** Keep manual blank-reader launching in the Popup only; Chrome PDF interception remains the primary network-document entry.
- **Context:** The Popup PDF action, automatic Chrome PDF handling, active PDF status, and anchored excerpt restoration are unchanged. TypeScript checks, 64 entrypoint UI tests, the production build, whitespace validation, and the packaged Side Panel browser check pass.

## [2026-07-15 17:16] Saved Excerpt Library
- **Changes:** Replaced the recent-highlight panel with a full searchable excerpt library; added web/PDF source filtering, tag filtering, time sorting, progressive disclosure, copy and source actions, inline notes and user tags, confirmed deletion, localized web-save feedback, source title/URL retention, and PDF/vocabulary cleanup invariants.
- **Status:** Completed
- **Next Steps:** Observe library size and search latency with long-lived real data before deciding whether IndexedDB pagination or virtualization is necessary.
- **Context:** Exact source metadata is stored only for intentional saves. New sentences and long excerpts no longer turn every contained word into vocabulary memory, while legacy deletion remains backward compatible with historical saved counts. All 529 unit/UI tests, TypeScript checks, the production build, whitespace validation, the design-rule scan, desktop/mobile visual checks, the packaged excerpt-management E2E, and the existing PDF save/backlink E2E pass.

## [2026-07-15 21:09] Adaptive Reading Heatmap Intensity
- **Changes:** Replaced current-goal-relative heat levels with a history-relative four-level scale, using the active-day 95th percentile as an outlier-resistant reference; updated the legend, accessible summary, test selectors, focused utility/UI coverage, and dashboard design documentation.
- **Status:** Completed
- **Next Steps:** Observe real 13-week distributions and tune the percentile only if measured histories still appear flattened or overly saturated.
- **Context:** Changing the current daily goal no longer recolors historical activity. Values above the adaptive reference saturate at level four, while zero remains a distinct inactive state. All 535 unit/UI tests, TypeScript checks, the production build, extension smoke validation, whitespace validation, two packaged-extension Chromium regressions, and desktop/mobile visual checks pass.

## [2026-07-15 21:16] Balanced Toolbar Completion Badge
- **Changes:** Replaced Chrome's oversized native completion badge with a compact circular check medallion drawn inside the toolbar icon; reduced and shifted the completed Logo to counterbalance the lower-right status weight; removed obsolete native-badge color state; updated focused tests, dashboard copy, README, and design documentation.
- **Status:** Completed
- **Next Steps:** Observe the pinned action at common Chrome display scales and adjust the fixed 38% medallion ratio only if browser compositing differs from the verified raster previews.
- **Context:** The Logo remains the primary signal while completion stays distinguishable without color alone. Eleven focused toolbar tests, 66 entrypoint smoke tests, TypeScript checks, the production build, whitespace validation, and 16/24/32px light/dark visual previews pass.

## [2026-07-15 21:45] Dashboard Copy Distillation
- **Changes:** Removed redundant persistent explanations from check-in progress, charts, reading settings, share-card controls, and unfiltered excerpt counts; moved duration methodology into a collapsed disclosure and historical goal recalculation into the edit form; made recording guidance state-aware; removed dead styles and aligned the packaged toolbar assertion with the integrated completion medallion.
- **Status:** Completed
- **Next Steps:** Treat the ready-state “本地数据 · 已读取” trust signal as a separate boundary decision and remove it only if observed use shows that the privacy cue no longer earns its space.
- **Context:** Error, empty, destructive, loading, saving, and share-setting failure copy remains visible; progress and chart meaning remain available through accessible labels. All 537 unit/UI tests, TypeScript checks, the production build, whitespace validation, three packaged-extension Chromium regressions, and desktop/mobile visual checks pass.

## [2026-07-16 17:55] PDF Reading Coverage Map
- **Changes:** Added a live page- and chapter-level PDF reading map backed by the existing full text snapshot and sparse local chunk metrics; introduced coverage, cumulative text, effective-time, and sufficiently sampled pace charts; added explicit loading, extraction-failure, unrecorded, and no-measurable-text states; connected map rows to virtualized page navigation; and documented the new PDF surface.
- **Status:** Completed
- **Next Steps:** Build the next-unread navigator on the shared progress model without introducing a second extraction or coverage pipeline.
- **Context:** The map keeps chapters runtime-derived from top-level PDF bookmarks, requires at least 100 processed words and 30 seconds before showing pace, and retains the existing 256 px sidebar geometry so fit-width position restoration remains within the established tolerance.

## [2026-07-16 18:21] PDF Next Unread Navigation
- **Changes:** Added next-unread PDF navigation on the shared chunk progress model; scans from the current visible reading line, advances beyond the previous target, supports the `N` shortcut, exposes explicit end/complete states with an optional restart from the beginning, and renders a temporary source-rectangle or page-top focus marker.
- **Status:** Completed
- **Next Steps:** Add persistent local highlights with note and tag editing while keeping native PDF annotations read-only and the source PDF bytes unchanged.
- **Context:** Chunks below 90% local coverage are treated as unread, navigation never silently wraps, and no additional extraction or IndexedDB progress table was introduced. All 69 unit/UI test files and 547 tests, TypeScript checks, the production build, whitespace validation, the packaged Chromium reader regression, and desktop/390 px visual checks pass.

## [2026-07-16 18:48] Persistent PDF Highlights
- **Changes:** Added four-color persistent PDF highlights backed by local annotation anchors and saved-item metadata; introduced clickable highlight rectangles across virtualized pages, an adaptive desktop/mobile editor for recoloring, notes, tags, and confirmed deletion, legacy excerpt compatibility, a targeted IndexedDB join index, and packaged-browser coverage for the complete lifecycle.
- **Status:** Completed
- **Next Steps:** Observe real long-document highlight volume before considering page-indexed in-memory grouping or an in-reader annotation list.
- **Context:** Native PDF annotations remain read-only and source PDF bytes are never rewritten. Legacy annotation-backed excerpts render yellow and upgrade atomically when edited. All 70 unit/UI test files and 552 tests, TypeScript checks, the production build, whitespace validation, desktop/390 px visual checks, and the packaged Chromium create/edit/reopen/focus/delete regression pass.

## [2026-07-16 19:27] PDF Rotation and Modal Shortcut Fixes
- **Changes:** Made next-unread navigation compare and order chunk geometry in the page's combined displayed rotation, including 90°, 180°, and 270° views; replaced duplicated editable-target checks with a shared reader-shortcut boundary and marked the persistent-highlight editor as shortcut-disabled; added focused geometry, keyboard-boundary, and packaged-browser regression coverage.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Rotated navigation now uses EmbedPDF's unscaled displayed page offset and `transformRect` projection instead of reducing the viewport boundary to source-space Y. All 71 unit/UI test files and 560 tests, TypeScript checks, the production build, whitespace validation, and the packaged Chromium PDF reader lifecycle pass.

## [2026-07-16 20:47] PDF Selection Companion
- **Changes:** Added a transient "划词伴读" action to PDF text selections with browser-provided English-to-Chinese translation, model-download progress, independent English speech controls, explicit capability/error states, cancellation-safe task handling, focus restoration, responsive page-clamped placement, and local-only privacy copy; added service, component, packaged-extension, and documentation coverage.
- **Status:** Completed
- **Next Steps:** Observe real first-use model download time and translation availability across supported Chrome desktop installations before considering language detection or explanatory AI features.
- **Context:** The feature is progressively enhanced without new extension permissions or a higher manifest minimum; selected text and translations are never persisted. All 73 unit/UI test files and 576 tests, TypeScript checks, production build, extension smoke validation, whitespace validation, design-rule scan, desktop/390 px visual checks, and seven regular packaged Chromium scenarios pass; the opt-in 160-page pressure scenario remains skipped by default.

## [2026-07-16 23:59] Continuous PDF Reading Map
- **Changes:** Rebuilt the PDF coverage panel as a continuous chapter/page reading river with text-weighted segments, coverage fill, effective-time ticks, relative pace markers, a precise current/inspected focus lens, and a full-document position minimap; removed the former four-metric chart switcher and redundant styles; added long-document aggregation, evidence normalization, focused tests, packaged-browser assertions, and updated documentation.
- **Status:** Completed
- **Next Steps:** Observe dense outlines and very long real PDFs before tuning the 90th-percentile visual normalization or the 72-segment overview cap.
- **Context:** The design defaults to chapters when a usable outline exists, distinguishes unrecorded text from pages without measurable text, and widens the desktop instrument panel to 300 px without compatibility branches. TypeScript checks, all 73 test files and 578 tests, the production build, and whitespace validation pass. A packaged Chromium run exercised the new map interactions and produced a clean visual trace; the final rerun timed out while creating the browser context before reaching product assertions.

## [2026-07-16 23:59] PDF Reading Map Final Audit
- **Changes:** Scoped the 300 px desktop width to the reading-map mode while restoring the established 256 px geometry for outline, thumbnail, and search panels; balanced long-document overview buckets so the full 72-segment resolution is used without page gaps; added semantic whole-document coverage progress; aligned the scale control with sibling panel controls; and removed redundant visual-state attributes and hidden marker elements.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The width isolation prevents search-panel geometry from perturbing rotated PDF position restoration while preserving the room required by the continuous map. TypeScript checks, the design-rule scan, all 73 test files and 579 tests, the production build, whitespace validation, and the full packaged Chromium PDF reader regression pass, including reading-map interaction, 300/256 px mode widths, rotation resume, zoom, and narrow-screen behavior.

## [2026-07-17 08:52] PDF Sidebar Motion
- **Changes:** Added coordinated expand and collapse motion for the PDF navigation sidebar and document viewport, retained panel content through the exit transition, and added narrow-screen drawer and backdrop transitions with reduced-motion support.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Desktop panel widths remain 300 px for the reading map and 256 px for outline, thumbnails, and search. TypeScript checks, the production build, whitespace validation, and the packaged Chromium PDF reader regression pass.

## [2026-07-17 11:28] Remove PDF Next-Unread Navigation
- **Changes:** Removed the PDF next-unread toolbar action, `N` shortcut, target navigation and highlight layers, transient notices, dedicated navigation model and tests, E2E helpers and assertions, styles, workspace state and props, and product documentation references.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The reading map, PDF analytics, search, persistent highlights, and saved view-state restoration remain unchanged. The change removes 924 lines before this log entry; all 72 unit test files and 570 tests, TypeScript checks, production builds, whitespace validation, and all seven packaged Chromium extension scenarios pass.

## [2026-07-17 13:15] Typed PDF Downloads
- **Changes:** Replaced the PDF reader's default MIME-less Blob download with a local typed-file path, preserved existing PDF names, appended `.pdf` when a source name lacks an extension, added busy/failure states, and removed the unused framework download utility.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** Downloaded files now use the `application/pdf` MIME type. All 73 unit test files and 572 tests, TypeScript checks, the production build, whitespace validation, and packaged Chromium regressions for extensionless network PDFs and local PDFs pass.

## [2026-07-17 13:28] Visible PDF Text Selection
- **Changes:** Moved active PDF text selection into a dedicated page layer above rendered content, search results, annotations, backlinks, and stored highlights; strengthened the forest-green selection fill; and added packaged-browser assertions for visibility, color, stacking, and pointer-event behavior.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The selection layer remains pointer-transparent while its menu stays interactive, so copy, companion, and persistent-highlight actions continue to work. All 73 unit test files and 572 tests, TypeScript checks, the production build, whitespace validation, and the targeted packaged Chromium PDF reader regression pass.

## [2026-07-17 15:53] PDF Select-All Scope
- **Changes:** Routed `Cmd/Ctrl+A` in the PDF reader to a document-wide selection state instead of browser DOM selection; added virtual-page text highlighting, whole-document copy, click and `Escape` clearing, shared selection color styling, and preserved native select-all behavior inside editable controls.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The implementation uses public PDF engine APIs rather than EmbedPDF private selection methods. Only mounted PDF pages load selection rectangles, while document text extraction is cached for copying. All 74 unit test files and 573 tests, TypeScript checks, the production build, whitespace validation, and the packaged Chromium PDF reader regression pass across both fixture pages.

## [2026-07-17 19:30] Frontend Copy Distillation
- **Changes:** Removed duplicate normal-state explanations, success notices, implementation details, repeated metadata, and redundant status labels across the popup, side panel, dashboard, excerpt library, and PDF reader; shortened visible commands and empty states while preserving complete accessible labels; removed superseded state and style paths and updated smoke and packaged-browser assertions.
- **Status:** Completed
- **Next Steps:** Observe first-use comprehension in real browsing sessions and restore a removed hint only when specific usability evidence shows it is necessary.
- **Context:** Error recovery, permission constraints, privacy guarantees, loading progress, destructive consequences, and first-use guidance remain visible. All 74 unit test files and 574 tests, TypeScript checks, the production build, whitespace validation, and packaged Chromium desktop/mobile visual checks pass without horizontal overflow; the fixed side-panel actions also leave the final content fully reachable.
