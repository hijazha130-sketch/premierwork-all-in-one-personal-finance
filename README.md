# ALL-IN-ONE PERSONAL FINANCE — by PremierWork

A local-first, offline-capable personal money tracker. Your money in one calm place;
every figure is computed from what you record — nothing to maintain.

This repository is the **source of truth** for the product. It currently implements
**Phase 0 (Foundation)** and **Phase 1 (Financial Core)** of the approved Build Specification.

---

## Stack

- **React + TypeScript** — component-heavy UI, strongly-typed money logic
- **Vite** — build tool, with **PWA** (installable, offline-capable)
- **Tailwind CSS** — driven entirely by named design tokens (dark "Midnight" + light "Soft")
- **Dexie / IndexedDB** — local, transactional persistence behind a repository abstraction
- **Vitest** — weighted toward correctness of money math (golden-number fixtures)

All data stays on the device. No login, no backend in v1 — the data layer is abstracted
so a sync backend can be added later without touching UI or logic.

## Getting started

```bash
npm install
npm run dev        # start the app at http://localhost:5173
```

Other scripts:

```bash
npm run build                 # typecheck + production build (+ service worker)
npm run test                  # run the full test suite
npm run typecheck             # TypeScript project check
npm run lint:buyer-language   # fail if a banned internal term appears in UI text
```

## Project structure

```
src/
  lib/            money.ts · period.ts · validation.ts      (pure utilities)
  domain/         types.ts · balance.ts · aggregation.ts · ledger.ts   (typed logic core)
  data/           db.ts · repository.ts · backup.ts · seed.ts          (persistence layer)
  state/          ThemeProvider · DataProvider · CaptureProvider       (React context)
  components/     AppShell · ui · MoneyAmount · EmptyState · RecentActivity
  screens/        Home · Money · Setup · More · ComingSoon · QuickCapture
                  manage/ Accounts · Groups · People
tests/            money · balance · aggregation · period · data-layer
scripts/          gen-icons.mjs · check-buyer-language.mjs
```

## Core rules honored (from the specification)

- **Money is integer minor units** (paisa). No floating-point on currency, ever.
- **Transactions are the single source of truth.** Nothing derived (balances, totals) is
  stored — screens are projections computed from transactions.
- **One canonical Category** carries both its group and its needs/wants/savings tag.
- **Transfers** are a pair of transactions sharing a `transferGroupId`; they net to zero and
  are excluded from spending/income totals.
- **Archive, never hard-delete** anything used by past transactions.
- **Schema versioning** with an ordered, tested migration runner, plus JSON export/import backup.
- **Buyer-language rule:** no internal terms (aggregation, engine, selector, …) in any UI text —
  enforced by an automated check.

See [`docs/SPEC-MAPPING.md`](docs/SPEC-MAPPING.md) for how each spec section maps to code and
which acceptance criteria are verified.

## GitHub

The product is intended to live in the repository
`premierwork-all-in-one-personal-finance`. See [`docs/GITHUB-SETUP.md`](docs/GITHUB-SETUP.md)
for the exact steps to initialize Git and push this project.

## Scope

Phases 2–6 (recurring bills, budgets, goals, debt, net worth, investments, insights) are **out
of scope** for this build and are intentionally not implemented. The schema already reserves the
fields they need (planner links, budget method, period, per-account currency) so no later
migration is required.
