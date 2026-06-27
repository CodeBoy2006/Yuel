# Yuel MV3 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Yuel Reading environment and framework scaffold as a testable local-first MV3 extension.

**Architecture:** WXT owns extension build and manifest generation. Content scripts emit reading events, the MV3 background service worker writes local IndexedDB records through Dexie, and React entrypoints expose popup, side panel, and dashboard shells.

**Tech Stack:** WXT, Chrome MV3, React, Tailwind CSS, TypeScript, Dexie, Vitest.

---

### Task 1: Project Foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `wxt.config.ts`
- Create: `.gitignore`

- [x] Define package scripts for `dev`, `build`, `zip`, `prepare`, `test`, and `typecheck`.
- [x] Pin WXT, React, Tailwind, Dexie, and Vitest versions verified from npm.
- [x] Configure WXT MV3 manifest permissions with broad host access as optional.
- [x] Configure the WXT React module with Tailwind's Vite plugin.

### Task 2: Core Domain and Analysis

**Files:**
- Create: `src/domain/events.ts`
- Create: `src/domain/metrics.ts`
- Create: `src/domain/packs.ts`
- Create: `src/analysis/english.ts`
- Create: `src/domain/metrics.test.ts`
- Create: `src/domain/packs.test.ts`
- Create: `src/analysis/english.test.ts`

- [x] Add typed reading events, page snapshots, chunk snapshots, stable hash helpers, and ID helpers.
- [x] Add effective reading word estimation with confidence levels.
- [x] Add lightweight English tokenization and sentence counting.
- [x] Add Pack validation that rejects executable payload fields.
- [x] Add Pack lexicon and phrase matching tests.

### Task 3: Extension Runtime

**Files:**
- Create: `entrypoints/background.ts`
- Create: `entrypoints/content.ts`
- Create: `src/content/extractBlocks.ts`
- Create: `src/content/collector.ts`
- Create: `src/messaging/contracts.ts`
- Create: `src/storage/schema.ts`
- Create: `src/storage/repositories.ts`

- [x] Add starter content script matches for MDN, GitHub, Medium, Wikipedia, and arXiv.
- [x] Extract visible text block candidates from article, main, docs, markdown, list, and blockquote elements.
- [x] Emit batched local reading events to the background service worker.
- [x] Write page, chunk, event, and vocabulary exposure records into IndexedDB through Dexie.
- [x] Configure side panel behavior on install.

### Task 4: UI Entry Points

**Files:**
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.tsx`
- Create: `entrypoints/popup/App.tsx`
- Create: `entrypoints/popup/style.css`
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`
- Create: `entrypoints/sidepanel/App.tsx`
- Create: `entrypoints/sidepanel/style.css`
- Create: `entrypoints/dashboard/index.html`
- Create: `entrypoints/dashboard/main.tsx`
- Create: `entrypoints/dashboard/App.tsx`
- Create: `entrypoints/dashboard/style.css`

- [x] Add popup with local-first status, starter sites, and dashboard link.
- [x] Add side panel shell for reading companion state.
- [x] Add dashboard shell documenting the V0 architecture pillars.

### Task 5: Documentation and Verification

**Files:**
- Create: `README.md`
- Create: `docs/architecture/yuel-v0-architecture.md`
- Create: `statusquo.md`

- [x] Document setup, scripts, architecture, and privacy posture.
- [x] Run `CI=true pnpm test`.
- [x] Run `CI=true pnpm typecheck`.
- [x] Run `CI=true pnpm build`.
- [x] Inspect generated `.output/chrome-mv3/manifest.json`.
