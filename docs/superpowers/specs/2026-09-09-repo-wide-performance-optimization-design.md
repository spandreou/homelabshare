# Repository-Wide Performance Optimization Design

## Goal
Reduce browser JavaScript, server-side work, database over-fetching, and unnecessary background activity without changing user-visible behavior or mixing dependency/security upgrades into the same change set.

## Scope

1. Lazy-load `Lightfall` so the `ogl` WebGL dependency is only requested on devices that actually render the animation.
2. Reduce `/admin/stats` work by removing recursive filesystem traversal from every page render and using database metadata for totals.
3. Reduce `/dashboard` over-fetching by separating summary/recent data from the full File Explorer catalog.
4. Pause admin system-stat polling while the document is hidden and refresh when it becomes visible again.
5. Keep `next.config.ts`, Prisma versions, dependency upgrades, Docker hardening, npm-audit remediation, and CI modernization outside this performance branch unless required for correctness.

## Design

### Lightfall
`ResponsiveLightfall` remains the capability gate. It dynamically imports `Lightfall` only after the media query indicates a desktop/fine-pointer/non-reduced-motion environment. `LightfallProps` becomes a type export so the dynamic boundary remains typed.

### Admin stats
The page must not recurse through the upload directory with `readdir`/`stat` on every request. Total storage usage should come from the persisted `File.size` metadata already used elsewhere. File count should use a database count, while file-type distribution should use only the minimum metadata required.

### Dashboard
The dashboard is a summary surface, not the full file-management surface. It should fetch a bounded recent file list for the `FilesList` section and keep full file retrieval on `/dashboard/files`. Storage insights and totals should be computed from minimal fields/aggregates rather than requiring the whole file catalog payload.

### System polling
The 30-second monitor should stop doing network requests while the page is hidden. On visibility restoration it should refresh immediately and resume the interval.

## Constraints
- Preserve current UI and permissions.
- No Prisma schema changes.
- No package major-version upgrades.
- No `npm audit fix --force`.
- No CI/security bypasses.
- No speculative dead-code deletion without confirmed usage evidence.
- Each optimization must be independently reviewable and reversible.

## Verification
- Inspect branch diff against `main` for scope containment.
- Run repository CI/build checks through the pull request.
- Confirm no unexpected package, lockfile, Dockerfile, Prisma, or workflow changes.
- Review runtime-sensitive changes for equivalent output and authorization behavior.
