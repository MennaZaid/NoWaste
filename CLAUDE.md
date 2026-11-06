# Rules for Claude in the NoWaste repository

## Sources of truth

- "docs/NoWaste Software Requirements Specification(SRS) (1).docx", "docs/NoWaste Software Design Document (SDD) (1).docx" and docs/feedback-changes.md. Never invent requirements, screens, rules or values.
- If something is not specified, stop and ask, and add it to "Open questions" in PROGRESS.md.

## Start of every session

- Read PROGRESS.md, run `npm test`, and report the result before changing anything.

## Layers (SDD 3.1)

- Routes (server/src/api) only validate input, check the role and call a service.
- Business rules live in server/src/services and server/src/domain.
- SQL lives only in server/src/data.
- External services are reached only through adapters (server/src/adapters), each behind an interface.
- The worker (server/src/worker.ts, C-19) is an entry point beside the API (server/src/api.ts, C-02), not a layer under it.

## Rule values

- Times, limits, thresholds and shelf-life values come from the settings or rules tables, never from constants in code.

## Language and wording

- Every user-facing text exists in Arabic and English through i18n (app/src/i18n); no hard-coded text.
- Every screen must work right-to-left in Arabic (NFR-06).
- Never word anything as "the food is safe". AI or estimated values are labelled Estimate or Draft (NFR-05a).

## Errors

- Error responses use the SRS error ID, for example `{"error":"E-ACC-02","fields":["email"]}`.

## Tests

- Every requirement has at least one test whose name starts with its SRS ID (FR-, E-, NFR-, BR-).
- Write the tests from the acceptance criteria first, then the code.
- Never skip, weaken or delete a test to make it pass.
- `npm test` must pass before you finish.

## Packages

- npm workspaces: one package-lock.json at the root. Never run `npm install` inside app/, server/ or shared/.
- Validation rules that the app and the server must both apply live once in shared/ (`@nowaste/shared`).
- Add a package from the root with `npm install <name> -w app` or `npm install <name> -w server`.

## End of every task

- Update PROGRESS.md and docs/traceability.md.

## Git and secrets

- Do not run `git commit` or `git push`; the person commits in GitHub Desktop.
- Never write secrets into the repo; use .env files (only the .env.example files are committed).
