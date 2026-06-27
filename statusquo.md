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
