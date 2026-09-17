# GitHub setup

Per Section 0 of the specification, the product lives in a real, continuously maintained
GitHub repository named **`premierwork-all-in-one-personal-finance`** — the source of truth
for the actual implementation.

Git is **not yet installed** on the build machine, so the first commit/push must be done once
Git is available. These are the exact steps.

## 1. Install Git

- Windows: download from <https://git-scm.com/download/win> and install, or
  `winget install --id Git.Git -e`.
- Verify in a new terminal: `git --version`.

## 2. Create the empty GitHub repository

Create a repository named `premierwork-all-in-one-personal-finance` on your GitHub account
(no README/`.gitignore`/license — this project already has them). Copy its remote URL.

## 3. Initialize and push (run from the project folder)

```bash
git init
git add .
git commit -m "Phase 0 + Phase 1: foundation and financial core"
git branch -M main
git remote add origin https://github.com/<your-account>/premierwork-all-in-one-personal-finance.git
git push -u origin main
```

## Suggested commit checkpoints going forward

The current tree is one coherent "Phase 0 + Phase 1" checkpoint. As work continues, use
meaningful checkpoints rather than per-tiny-change commits, e.g.:

- `Local data layer + migration runner`
- `Theme system + application shell`
- `Setup flow`, `Accounts / Money`, `Financial calculations verified`
- `Phase 1 acceptance testing completed`

Do **not** create separate repositories per phase. Phases 2–6 are added to this same
repository only when explicitly authorized by the founder.
