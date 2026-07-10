# Yuel Interface System

## Product scene

A bilingual reader is working through long documentation at a desk and glances at Yuel between paragraphs. The interface should feel like a quiet measurement instrument: fast to scan, truthful about state, and never competitive or performative.

## Design principles

1. **Control, accompany, reflect.** Popup controls the current site, the side panel accompanies the active page, and the dashboard supports reflection. Do not repeat the same hierarchy on every surface.
2. **Evidence over decoration.** Accent color communicates action or state. It is not used as ambient decoration.
3. **One surface, few containers.** Group with spacing and dividers before introducing another card.
4. **Compact, truthful copy.** Labels describe the action that actually happens. Explanatory text is kept to one short sentence at the point of need.
5. **Quiet numbers.** Metrics use tabular numerals but never become a scoreboard-style hero.
6. **Local by default.** Privacy is expressed as a persistent state, not repeated marketing copy.

## Visual language

- **Register:** restrained product UI.
- **Background:** near-neutral with a slight green tint, never cream or parchment.
- **Ink:** deep green-black rather than blue-black.
- **Primary:** forest green, reserved for the current selection and primary action.
- **Signal:** rust orange, reserved for warnings or attention.
- **Geometry:** 10–14px radii for controls and containers; pills only for compact statuses.
- **Elevation:** borders and tonal surfaces do the work. Shadows are limited to the extension popup shell and never paired with a wide blur.
- **Typography:** system sans throughout, with tabular numerals for measured values. Fixed product-scale sizes; no oversized display type.
- **Motion:** 160–220ms state transitions with an exponential ease-out. Reduced-motion users receive instant state changes.

## Tokens

The source of truth lives in `src/ui/foundation.css` and uses OKLCH.

| Role | Token |
|---|---|
| App background | `--y-bg` |
| Primary surface | `--y-surface` |
| Secondary surface | `--y-surface-subtle` |
| Primary ink | `--y-ink` |
| Secondary ink | `--y-ink-secondary` |
| Muted ink | `--y-ink-muted` |
| Divider | `--y-line` |
| Control boundary | `--y-control-line` |
| Primary action | `--y-accent` |
| Warning signal | `--y-signal` |
| Warning text | `--y-signal-ink` |
| Informational state | `--y-info` |
| Destructive action | `--y-danger` |

## Shared components

- `BrandLockup`: one consistent mark and name.
- `ActionButton`: primary, secondary, quiet, and danger variants with complete focus/disabled states.
- `StatusPill`: neutral, positive, warning, and danger states.
- `Metric`: compact label/value pair.
- `SectionHeader`: title plus optional compact metadata.
- `ProgressBar`: semantic progressbar with an accessible value.
- `InlineNotice`: concise live status and recovery feedback.
- `EmptyState`: one-line empty state with an optional next action.

## Surface architecture

### Popup

Current site status first, a compact daily snapshot second, then the two destinations. Enabled-site management remains collapsed and bounded.

### Side panel

Current-page progress is the visual anchor. Daily totals, vocabulary, and the latest excerpt are secondary. Data refreshes while the panel remains open.

### Dashboard

The page is organized as a reading ledger: today summary, goal-based check-in progress, a 13-week reading-rhythm view, recent reading, vocabulary, excerpts, and reading profile. The rhythm view combines a goal-relative activity heatmap with effective-word trends, weekday averages, and first-read/review composition without turning the page into a scoreboard. The reading profile owns the editable daily effective-word goal, while the today ledger reports the remaining words and completed state. The share card is a disclosure available only after the daily goal is reached, calibration becomes a focused full-width flow, and local data management sits in a quiet footer.

## Accessibility baseline

- Chinese UI documents declare `lang="zh-CN"`; English calibration content declares `lang="en"`.
- Body text reaches WCAG AA contrast.
- Every async status is announced through a live region.
- Progress indicators expose `role="progressbar"` and numeric values.
- Focus indicators are explicit and consistent.
- Touch targets are at least 40px in dense desktop UI and 44px for primary actions.
- Long domains, excerpts, and tags wrap or truncate without creating horizontal scroll.
- Motion respects `prefers-reduced-motion`.
