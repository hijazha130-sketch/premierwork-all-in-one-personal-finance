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

## Test summary (Phase 1)

`npm run test` → 26 tests across 5 files (money, balance, aggregation, period, data-layer), all passing.

---

# Phase 2 — Recurring & Cash Flow (COMPLETE)

Built per `docs/PHASE-2-ARCHITECTURE.md`, Steps 1–11. Transactions remain the single source of
truth; occurrences are computed, never stored; overrides store exceptions only; screens read
derived state / call the repository and never do inline money math.

| Area | Where |
|---|---|
| §6/§7 Schema (RecurringRule, RecurringOverride, +2 Transaction fields, +Settings) + v2→v3 migration | `domain/types.ts`, `data/db.ts`, `data/backup.ts` |
| §17.2 Repository (rules/overrides CRUD, archive-vs-delete, override uniqueness, `createTransactionFromOccurrence`) | `data/repository.ts` |
| §8.1 Recurrence engine (uncapped week stepping, month clamp, oneTime, endDate) | `domain/recurrence.ts` |
| §8.2 Occurrence status (upcoming/overdue/paid/skipped, paid-by-occurrenceDate) | `domain/occurrences.ts` |
| §8.3/§8.4 Cash-flow projection + Safe to Spend (unpaid-only guard; FD-1/FD-2/FD-5; honest negatives) | `domain/cashflow.ts` |
| §11 Calendar day/week totals (no double count) + month grid | `domain/calendar.ts`, `lib/period.ts` |
| §10 Derived state (occurrences, upcoming, overdue, safeToSpend, cashflow, `occurrencesForRange`) | `state/DataProvider.tsx`, `state/dataContext.ts` |
| §11 UI: Money → Repeating + Calendar; Home Safe to Spend / needs attention / upcoming; Mark as paid / Skip / Adjust; Setup bills step | `screens/Money.tsx`, `RepeatingRules.tsx`, `Calendar.tsx`, `Home.tsx`, `QuickCapture.tsx`, `Setup.tsx`, `components/OccurrenceActions.tsx` |

## §18 Acceptance criteria — all pass

1. Create a repeating bill → appears under Money → Repeating with a correct **next date** — ✅ verified live; `nextUnpaidByRule` (`tests/occurrences.test.ts`)
2. Recurrence dates correct for every frequency incl. 31st→Feb and leap year — ✅ `tests/recurrence.test.ts`
3. Calendar shows each item on its day with per-day/week totals + today marker — ✅ verified live; `tests/calendar.test.ts`, `tests/period.test.ts`
4. Home shows Safe to spend + overdue/needs-attention + upcoming — ✅ verified live
5. Mark as paid → one linked transaction, item flips to **paid**, Safe to Spend + projection consistent, balance updates — ✅ `tests/mark-as-paid.test.ts` + verified live
6. Deleting that transaction returns the item to unpaid/overdue, no orphan state — ✅ `tests/mark-as-paid.test.ts`
7. Skip removes an item from upcoming without a transaction or money movement — ✅ `tests/mark-as-paid.test.ts` + verified live
8. No occurrence double-counted (paid not also projected/reserved) — ✅ `tests/cashflow.test.ts`, `tests/calendar.test.ts`, `tests/mark-as-paid.test.ts`
9. v2→v3 migration additive/non-destructive; export/import incl. rules + overrides — ✅ `tests/data-layer.test.ts`
10. All Phase 1 tests still pass; new engine tests pass; typecheck clean — ✅
11. No banned internal term in any screen (automated) — ✅ `npm run lint:buyer-language` (17 files)
12. Every Phase 2 screen works on phone + desktop, both themes — ✅ verified live

## Test summary (full)

`npm run test` → **84 tests across 11 files**, all passing. New Phase 2 files:
`recurrence`, `occurrences`, `cashflow`, `calendar`, `recurring-repository`, `mark-as-paid`
(+ extended `data-layer` and `period`).

Founder decisions applied: FD-1 endOfMonth (settings-driven), FD-2 income not pre-credited,
FD-3 manual confirmation, FD-4 clamp impossible dates, FD-5 paid independent of cleared,
FD-6 calendar shows planned + actual distinguished. The weekly 52/26/13 cap was dropped by
founder decision (spreadsheet artifact, not a financial rule) — the architecture doc was updated
to match.

---

# Phase 3 — Budgeting (COMPLETE)

Built per `docs/PHASE-3-ARCHITECTURE.md`, Steps 1–7. Transactions stay the single source of
truth; "actual/spent" is always `sumTransactions`, never stored. A `BudgetTemplate` holds the
usual planned amount per category; a `BudgetPeriodLine` stores a per-(month, category) override
only. Screens read derived state (`budgetForPeriod`, `fiftyThirtyTwentyForPeriod`) and do no
inline money math.

Delivered across five step commits on `main`:

| Step | Commit | What shipped |
|---|---|---|
| 3 | `0a07439` | budget engine — carry-over / zero-based / 50-30-20 |
| 4 | `ad840b0` | budget derived state |
| 5 | `c34a8e0` | Plan → Budget monthly view |
| 6 | `d730ad3` | Plan → 50/30/20 view |
| 7 | `2b72657` | Setup budget step, method toggle, polish + verification |

| Area | Where |
|---|---|
| §6/§7 Schema (BudgetTemplate, BudgetPeriodLine `[periodKey+categoryId]`, PeriodKey) + v3→v4 migration | `domain/types.ts`, `data/db.ts`, `data/backup.ts` |
| §17 Repository (template + period-line CRUD, upsert semantics) | `data/repository.ts` |
| §8 Budget engine (effectivePlanned, actualFor via sumTransactions, carry-over walk, computeBudgetPeriod, expectedIncome, leftToAssign, fiftyThirtyTwenty, share) | `domain/budget.ts` |
| §10 Derived state (budgetForPeriod, fiftyThirtyTwentyForPeriod, derived.budget / derived.fiftyThirtyTwenty) | `state/DataProvider.tsx`, `state/dataContext.ts` |
| §11 UI: Plan → Budget (Planned/Spent/Left, inline edit, carry-in note, copy last month, left-to-assign) + 50/30/20; Setup budget step; More budgeting toggle | `screens/Plan.tsx`, `FiftyThirtyTwenty.tsx`, `Setup.tsx`, `More.tsx` |

## §18 Acceptance criteria — 12/12 pass

1. Plan replaces the placeholder with a working Budget + 50/30/20 switch — ✅ verified live
2. Budget view shows Planned / Spent / Left per group and in the summary — ✅ verified live (Rent & Home Planned 15,000 · Spent 8,000 · Left 7,000)
3. Planned is editable inline; writes the usual, or a "just this month" override — ✅ verified live
4. Spent is always real activity (`sumTransactions`), never stored — ✅ `tests/budget.test.ts`
5. Carry-over shows the carried-in / short-by note from last month — ✅ verified live (Oct "carried in Rs 7,000 from last month")
6. Zero-based shows "Left to assign" and no carry-in — ✅ verified live; `tests/budget.test.ts`
7. Month navigation (prev / this month / next) works — ✅ verified live
8. "Copy last month" seeds this month's amounts — ✅ verified live
9. 50/30/20 shows income + needs/wants/savings as a share of income with target markers — ✅ verified live (income 100,000; Needs 8,000 = 8% vs 50%)
10. Untagged groups surface a "Not yet sorted" nudge to /groups — ✅ verified live
11. Setup has an optional, skippable budget step; method + amounts persist at Finish — ✅ verified live
12. Settings (More) exposes the method toggle in plain words, saved live — ✅ verified live

## Test summary (full)

`npm run test` → **104 tests across 13 files**, all passing. New Phase 3 files:
`budget`, `budget-repository` (+ extended `data-layer` for the v3→v4 migration). Typecheck,
buyer-language (19 files) and build all clean.

Founder decisions applied: FD-3.1 paycheck planner deferred to Phase 3b (monthly is primary),
FD-3.2 zero-based expected income = planned income lines (fallback `IncomeSource.defaultAmount`),
FD-3.3 carry-over carries an overspend forward, FD-3.4 savings/debt categories participate in
budget + left-to-assign, FD-3.5 seed a new month from the template plus a "copy last month" action.
The method toggle reads "Roll leftover into next month" (carry-over) vs "Give every rupee a job"
(zero-based) — never internal words. v3→v4 migration is additive / non-destructive.
