# Budgeted Exposure Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace independent per-chunk effective-reading scoring with a viewport-level reading budget that is allocated across visible chunks.

**Architecture:** The content script will emit one viewport exposure tick for each stable visible-text interval. The domain metric module will compute a single tick budget, allocate it by chunk attention weights, apply session/day caps, and return float deltas. Storage will persist raw exposure, effective reading time, effective words, new/review splits, and vocabulary exposure by coverage.

**Tech Stack:** TypeScript, WXT MV3 content scripts, Dexie IndexedDB, Vitest.

---

### Task 1: Define Budgeted Exposure Behavior

**Files:**
- Modify: `src/domain/metrics.test.ts`
- Modify: `src/domain/metrics.ts`

- [ ] Add failing tests proving multiple visible chunks share one tick budget instead of each receiving a full WPM allowance.
- [ ] Add failing tests for inactive tabs, idle decay, scroll decay, text availability, day/session caps, and new/review split.
- [ ] Replace the old `estimateEffectiveWords` API with a budget allocator that returns float chunk deltas and tick-level effective reading milliseconds.
- [ ] Run `CI=true pnpm vitest run src/domain/metrics.test.ts`.

### Task 2: Emit Viewport Exposure Ticks

**Files:**
- Modify: `src/domain/events.ts`
- Modify: `src/content/collector.ts`
- Modify: `src/content/collector.test.ts`
- Modify: `src/messaging/contracts.ts`
- Modify: `src/messaging/contracts.test.ts`

- [ ] Add a page-scoped `TextViewportExposureTick` event carrying `tickMs`, `baseWordsPerMinute`, active/document visibility, scroll WPM, idle age, and visible chunk snapshots.
- [ ] Flush the current viewport interval before visible chunk composition changes, on interval flush, on page hide, and on stop.
- [ ] Compute per-visible-chunk `centerDistance` and `contentWeight` locally in the collector.
- [ ] Validate viewport tick payloads at the runtime message boundary.
- [ ] Run `CI=true pnpm vitest run src/content/collector.test.ts src/messaging/contracts.test.ts`.

### Task 3: Persist Caps, Reading Time, and Vocabulary Coverage

**Files:**
- Modify: `src/storage/schema.ts`
- Modify: `src/storage/aggregateReading.ts`
- Modify: `src/storage/aggregateReading.test.ts`
- Modify: `src/storage/repositories.ts`
- Modify: `src/storage/repositories.test.ts`
- Modify: `src/storage/readingStats.ts`
- Modify: `src/storage/readingStats.test.ts`

- [ ] Add chunk session/day aggregate tables for session and day caps.
- [ ] Update batch summarization to use persisted session/day/lifetime counters as allocator inputs.
- [ ] Record raw exposure separately from effective reading minutes.
- [ ] Split effective words into new and review words.
- [ ] Update vocabulary exposure by `deltaEffectiveWords / chunk.wordCount` instead of only the first effective chunk read.
- [ ] Run `CI=true pnpm vitest run src/storage/aggregateReading.test.ts src/storage/repositories.test.ts src/storage/readingStats.test.ts`.

### Task 4: Documentation, Status, and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/yuel-v0-architecture.md`
- Modify: `statusquo.md`

- [ ] Document the Budgeted Exposure Model and visible tick semantics.
- [ ] Append the required status log entry.
- [ ] Run targeted tests, full `CI=true pnpm test`, `CI=true pnpm typecheck`, and build.
- [ ] Stage, commit, and push the completed implementation.
