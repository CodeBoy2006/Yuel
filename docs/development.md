# Development and Verification

## Toolchain

Follow the [build and load instructions](../README.md#build-and-load) for local setup. Yuel uses WXT, React, TypeScript, Dexie, and EmbedPDF/PDFium, with shared CSS tokens and entrypoint styles. Dependency versions are pinned in [package.json](../package.json) and resolved by [pnpm-lock.yaml](../pnpm-lock.yaml); use pnpm rather than generating another lockfile.

Development and distribution remain subject to [LICENSE](../LICENSE); use the [upstream contribution workflow](../CONTRIBUTING.md) for changes intended for this project. `pnpm zip` creates an archive but does not authorize publishing it. Builds and ZIPs include `LICENSE` and its referenced `LICENSES/PolyForm-Strict-1.0.0.txt` from the repository, plus `CONTRIBUTING.md` for the contribution terms. Reload the unpacked extension after rebuilding. WXT's browser auto-launch is disabled in [wxt.config.ts](../wxt.config.ts).

## Choose checks for the changed behavior

The core checks are unit/UI tests, type checking, and the packaged-artifact check:

```bash
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm test:extension-smoke
```

The last command builds before checking output. Add the relevant browser or stress suite below; do not run overlapping commands solely to get a second copy of the same evidence. For documentation-only changes, check links, commands, and claims against their sources; runtime suites are needed only if a behavioral uncertainty requires them.

| Command | What it checks | When to use it |
|---|---|---|
| `pnpm test` / `pnpm test:unit` | `src/**/*.test.ts(x)` in jsdom: domain, storage, runtime adapters, and UI | Changed application logic; neither smoke nor E2E is included |
| `pnpm typecheck` | TypeScript with `--noEmit` | Changed TypeScript or configuration |
| `pnpm test:extension-smoke` | Builds; checks licensing files, manifest, permissions, MIME declaration, CSP, pages, workers, content script, and WASM artifacts | Packaging or release verification; does not launch a browser |
| `pnpm test:browser-dom` | Real Chromium DOM extraction, native `Range` geometry, empty-SPA recovery, route changes, and benchmark-injection dependencies | Web extraction, geometry, or collector changes |
| `pnpm test:e2e` | Builds; runs packaged-extension Playwright specs, including PDF regression and native-selection bridge | Extension integration and release verification; PDF stress is opt-in |
| `pnpm test:extension-browser-smoke` | Builds; runs only `tests/e2e/extension.spec.ts` | Focused main integration flow; a subset of `test:e2e` |
| `pnpm test:stress:large-text` | 1,200-paragraph DOM fixture and 2,000 aggregation ticks with 80 visible chunks each | Chunking, geometry, or aggregation scalability |
| `pnpm test:stress:pdf-reader` | Builds; opens a generated 160-page PDF, checks extraction, bounded mounted pages/DOM/heap, local rendering, and recorded exposure | PDF rendering/analytics scalability |
| `pnpm test:real-pages` | Opt-in live public-site extraction/geometry benchmark | Site compatibility or extraction-performance changes; requires network access |

For a narrow change, run its existing spec directly, for example:

```bash
CI=true pnpm exec vitest run src/domain/metrics.test.ts src/storage/aggregateReading.test.ts
```

### Browser prerequisites and diagnostics

Install Playwright's Chromium once before browser suites:

```bash
pnpm test:browser:install
```

The packaged-extension fixture uses an isolated temporary profile per test and one worker. It discovers the MV3 worker/extension ID and serves a local HTTPS page; `openssl` and localhost access are required. Playwright retains a trace and screenshot on failure under `test-results/playwright/`.

Browser runs are headless by default. Use `pnpm test:e2e:headed` or `YUEL_BROWSER_SMOKE_HEADLESS=false` for visible extension testing. The DOM, large-text, and live-corpus harnesses accept `CHROME_PATH` as an executable override and `YUEL_BROWSER_DOM_HEADLESS=false` for a visible run; these overrides do not select the packaged-extension fixture's browser.

On macOS 26, a shell-launched Chromium process, including headless mode, needs scoped permission outside a process sandbox that blocks LaunchServices/WindowServer. Request that permission before launching; do not retry with `--no-sandbox`. Keep unit, type, and build checks sandboxed. Browser fixtures also need permission to bind localhost ports.

### Coverage boundaries

The main packaged test exercises actual PDFium rendering, DNR routing with a cookie-protected HTTPS PDF, web auto-collection, excerpt management, toolbar progress, PDF navigation/search/highlights, source backlinks, identity checks, and view-state restore. Separate specs cover dense URL chunking and the temporary native-selection DOM range.

Some browser features have narrower evidence:

- Native `chrome.mimeHandler` registration and stream fallback use mocked APIs in unit tests; packaged Chromium coverage exercises the DNR path.
- Companion integration installs Translator and speech stubs. It checks task/UI lifecycle, not real model availability, translation quality, or audible output. Clipboard calls in that fixture are also stubbed.
- The PDF test checks that print is enabled, not an actual print-dialog interaction. Password retry is implemented but has no password-protected E2E fixture.
- Native-selection tests check the DOM hit point, selection contents, and cleanup. Visible operating-system context-menu commands require manual verification.
- Web snapshot registration versus event-only references is asserted in `src/messaging/readingEventsClient.test.ts`; the DOM/SPA smoke checks collection and route behavior.

When changing one of these browser-dependent paths, distinguish mock-backed behavior from a check in a browser that exposes the real feature.

### Stress and live-corpus controls

- PDF stress: `YUEL_PDF_STRESS_PAGES` (default 160), `YUEL_PDF_STRESS_LINES` (6), and `YUEL_PDF_STRESS_MAX_HEAP_MB` (128 MiB of retained heap growth). The script sets `YUEL_PDF_READER_STRESS=1`; ordinary E2E skips that stress case.
- Live corpus: `YUEL_REAL_PAGE_CONCURRENCY` (3), `YUEL_REAL_PAGE_SETTLE_MS` (1,500), and `YUEL_REAL_PAGE_TIMEOUT_MS` (30,000). Set `YUEL_REAL_PAGE_REPORT_PATH=/tmp/yuel-real-pages.txt` to save the report. The script sets `YUEL_REAL_PAGE_CORPUS=1`.

Live-site results depend on availability and changing page content. The local DOM smoke checks benchmark injection dependencies without requiring those sites.

## Keep documentation aligned

[README](../README.md) owns setup/use, limits, and privacy; [architecture](architecture/reading-architecture.md) owns runtime and data semantics; this guide owns verification; [PRODUCT](../PRODUCT.md) owns product intent; [DESIGN](../DESIGN.md) owns interface rules. Update the owning document and link to it instead of repeating the same explanation.

Keep current behavior separate from proposals and test coverage separate from test results. Completed implementation plans that add no lasting rationale can be removed; Git preserves their history. Append substantive task outcomes to the local, ignored `statusquo.md` without committing its contents.
