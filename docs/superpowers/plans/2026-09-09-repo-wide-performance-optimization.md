# Repository-Wide Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HomeLabShare lighter by reducing browser JavaScript, server filesystem work, database over-fetching, and unnecessary polling while preserving behavior.

**Architecture:** Keep full file-management work on `/dashboard/files`, make `/dashboard` a bounded summary, move WebGL behind a runtime dynamic import, and replace expensive page-load filesystem accounting with persisted database metadata. Avoid dependency/security changes so performance regressions can be isolated.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-09-09-repo-wide-performance-optimization-design.md`

## Global Constraints
- Preserve current UI and permissions.
- No Prisma schema changes.
- No package major-version upgrades.
- No `npm audit fix --force`.
- No CI/security bypasses.
- No speculative dead-code deletion without confirmed usage evidence.
- Each optimization must be independently reviewable and reversible.

---

### Task 1: Lazy-load Lightfall/OGL

**Files:**
- Modify: `src/components/Lightfall.tsx`
- Modify: `src/components/ResponsiveLightfall.tsx`

**Interfaces:**
- Produces: exported `LightfallProps` type and a dynamically imported `Lightfall` client chunk.

- [ ] Export `LightfallProps` from `Lightfall.tsx` without changing runtime behavior.
- [ ] Replace the static `Lightfall` import in `ResponsiveLightfall.tsx` with `next/dynamic` and `ssr: false`.
- [ ] Keep the existing media-query gate so the dynamic chunk is only requested when `shouldAnimate` is true.
- [ ] Verify the diff contains no other component behavior changes.

### Task 2: Remove per-request recursive filesystem accounting from admin stats

**Files:**
- Modify: `src/app/admin/stats/page.tsx`

**Interfaces:**
- Consumes: Prisma `File.size`, `File.name`, current auth/session queries.
- Produces: the same rendered statistics with storage totals sourced from DB metadata.

- [ ] Remove `readdir`, `stat`, `path`, `UPLOAD_ROOT`, and `getDirectoryUsageBytes` from the page.
- [ ] Query total file count and total size via Prisma aggregate/count operations.
- [ ] Fetch only `name` values needed for file-type distribution.
- [ ] Keep active-session and user-storage UI output unchanged.

### Task 3: Bound dashboard file retrieval

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Produces: bounded recent files for `FilesList`, DB-backed storage totals, existing favorites/recent sections.

- [ ] Replace the unbounded `db.file.findMany` used by the dashboard file list with a bounded recent selection.
- [ ] Use database aggregate/grouping-friendly metadata for total storage insight calculations instead of retaining a full file catalog in memory.
- [ ] Keep `/dashboard/files` as the full File Explorer route.
- [ ] Preserve current serialization shape expected by `FilesList`.

### Task 4: Pause hidden-tab system polling

**Files:**
- Modify: `src/app/admin/SystemStats.tsx`

**Interfaces:**
- Produces: the same 30-second visible-tab refresh behavior with no hidden-tab polling.

- [ ] Wrap refresh calls with a `document.visibilityState === "visible"` guard.
- [ ] Add a `visibilitychange` listener that refreshes immediately when the tab becomes visible.
- [ ] Clean up the interval and event listener on unmount.

### Task 5: Verification and PR

**Files:**
- No production files added beyond Tasks 1-4.

- [ ] Compare `main...perf/repo-wide-optimization` and confirm no dependency, Prisma, Docker, workflow, or lockfile changes.
- [ ] Open a PR against `main` with before/after rationale and scope constraints.
- [ ] Inspect all GitHub Actions checks and distinguish pre-existing security failures from regressions caused by this branch.
- [ ] Do not merge if build/type/lint behavior regresses.
