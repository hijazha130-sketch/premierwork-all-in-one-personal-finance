# Spec → Implementation mapping

How each section of the Phase 0 + Phase 1 Build Specification is implemented, and the status
of every acceptance criterion.

## Phase 0

| Spec section | Where | Status |
|---|---|---|
| §2 Tech stack & application shell | `vite.config.ts`, `src/components/AppShell.tsx` | Done — React+TS+Vite+Tailwind, PWA, persistent shell, always-present add button, global providers, routing for Home/Money/Setup (+ Plan/Grow placeholders) |
| §3 Data & persistence layer | `src/data/db.ts`, `repository.ts`, `backup.ts` | Done — IndexedDB via Dexie, repository abstraction, schema versioning + migration runner, JSON export/import, integrity rules |
| §4 Theme system & design tokens | `src/index.css`, `tailwind.config.ts` | Done — named token set, dark + light cream themes, serif for amounts, Inter for UI, gold accent, reduced-motion |
| §5 Navigation shell & Definition of Done | `src/components/AppShell.tsx` | Done — five destinations, sidebar (desktop) / bottom bar (mobile) with center add button, theme toggle persists |

### Phase 0 — Definition of Done

1. Installs/runs as a PWA on phone, loads on desktop — ✅ (manifest + service worker generated in build)
2. Light + dark themes render from tokens; toggle persists — ✅ (`ThemeProvider`, localStorage)
3. Five-destination responsive nav; add button on every screen — ✅
4. Data layer persists a record and survives restart — ✅ (verified in `tests/data-layer.test.ts`)
5. Migration runner migrates a v1 DB to v2 in a test — ✅ (`tests/data-layer.test.ts` "migrates a v1 database to v2")
6. Full JSON export/import round-trips with no data loss — ✅ (`tests/data-layer.test.ts` "export then import reproduces exact state")
7. Fresh install shows intentional empty states → Setup — ✅ (Home/Money empty states route to Setup)

## Phase 1

| Spec section | Where |
|---|---|
| §6 Concrete data schema | `src/domain/types.ts` (integer minor units, derived-never-stored, planner fields reserved) |
| §7 Core logic modules | `balance.ts`, `aggregation.ts`, `lib/money.ts`, `lib/period.ts`, `lib/validation.ts`, `state/DataProvider.tsx` (derived-state layer) |
| §8 Screens | `Setup.tsx`, `Home.tsx`, `Money.tsx`, `QuickCapture.tsx`, `manage/*` |
| §9 Key interactions (Open→Understand→Act→See) | Quick capture, Home prompt, edit/delete in `QuickCapture` |
| §10 Buyer-language glossary | `scripts/check-buyer-language.mjs` + UI copy |

### Phase 1 — Acceptance criteria

1. New user completes setup, lands on Home — ✅ verified live in browser
2. Add expense in a few taps, amount-only required, defaults pre-filled — ✅ verified live
3. Add/edit/delete updates balances + month figures immediately — ✅ verified live (Rs 50,000 → Rs 48,750 after a Rs 1,250 spend)
4. Balance = opening + cleared in − cleared out (hand-computed fixture) — ✅ `tests/balance.test.ts`
5. Transfer moves balance, shows as one "moved money", excluded from totals — ✅ `tests/balance.test.ts`, `tests/aggregation.test.ts`, `domain/ledger.ts`
6. Minor units; no rounding/float error (adversarial amounts) — ✅ `tests/money.test.ts`
7. Filtering by date/category/account/person returns correct subsets/totals — ✅ `tests/aggregation.test.ts` + Money screen filters
8. In-use dimension cannot be hard-deleted; archiving keeps history — ✅ `tests/data-layer.test.ts`
9. Data survives restart; export/import reproduces exact state — ✅ `tests/data-layer.test.ts`
10. No banned internal term in UI (automated string check) — ✅ `npm run lint:buyer-language`
11. Every screen usable on phone and desktop — ✅ verified live (sidebar ↔ bottom bar)
12. Both themes render every screen — ✅ verified live (Midnight + Soft)

## Test summary

`npm run test` → 26 tests across 5 files (money, balance, aggregation, period, data-layer), all passing.
