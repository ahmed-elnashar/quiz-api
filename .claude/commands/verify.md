---
description: Run typecheck, Vitest, and oxlint, and report whether the project is clean
allowed-tools: Bash(npx --no-install tsc:*), Bash(npx --no-install vitest:*), Bash(npx --no-install oxlint:*)
---

Run these three checks from the project root, in order. Run all three even if an earlier one fails.

1. Typecheck: `npx --no-install tsc --noEmit`
2. Tests: `npx --no-install vitest run`
3. Lint: `npx --no-install oxlint`

`--no-install` makes a missing tool fail instead of being downloaded. If a tool is not installed, report that check as failed and say which package is missing. Do not install it without asking the user.

Then report:

- One line per check: pass or fail.
- For each failure, the relevant errors with `file:line`.
- A final verdict: **VERIFIED** only if all three passed, otherwise **NOT VERIFIED**.

Do not fix anything as part of this command unless the user asked for fixes.
