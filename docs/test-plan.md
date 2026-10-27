# NoWaste test plan: Sprint 1

Outline: ISO/IEC/IEEE 29119-3 test plan. Sources: SRS 4.1 to 4.3, 5 and 5.5; SDD 2.4, 3.2.2, 3.3, 7 and 8.1; docs/feedback-changes.md; decisions in PROGRESS.md. This plan adds no requirements. Where a source leaves a value open, the plan says so and the item is listed under "Open questions" in PROGRESS.md.

## 1. Context

- **Project:** NoWaste, Sprint 1 (19 Oct to 1 Nov 2026, SRS 6.2.2): accounts, approval, Arabic/English, listings without AI, perishability and routing.
- **Test plan owner:** the Turn 2 owner (Menna). Each story owner keeps the parts for their story up to date.
- **Related documents:** docs/acceptance-tests.md (acceptance tests per story), docs/traceability.md (requirement to test), docs/test-execution.md (manual results), docs/nfr-06-checklist.md (screen-by-screen language check).

## 2. Scope

### 2.1 Stories in scope (SRS 6.2.2, Sprint 1)

| Story | Title (SRS 6.2.1)          | Functional requirements (SDD 7.1)          | Error conditions             |
| ----- | -------------------------- | ------------------------------------------ | ---------------------------- |
| US-01 | Consumer registration      | FR-ACC-01                                  | E-ACC-01, E-ACC-02           |
| US-02 | Vendor application         | FR-ACC-02                                  | E-ACC-02                     |
| US-03 | Partner application        | FR-ACC-03                                  | E-ACC-02                     |
| US-04 | Log in/out                 | FR-ACC-04                                  | E-ACC-03, E-ACC-05           |
| US-07 | Approve/reject             | FR-ACC-07                                  | E-ACC-05                     |
| US-09 | Arabic/English RTL         | FR-ACC-09                                  | –                            |
| US-10 | Create listing             | FR-LST-01                                  | E-LST-02, E-LST-04, E-LST-06 |
| US-11 | Quick Post                 | FR-LST-02                                  | E-LST-04, E-LST-06           |
| US-13 | Preparation/storage/expiry | FR-LST-04                                  | E-LST-03                     |
| US-18 | Category and urgency       | FR-RTE-01, FR-RTE-02, FR-RTE-03, FR-RTE-04 | E-RTE-01                     |
| US-19 | Destination recommendation | FR-RTE-05, FR-RTE-06, FR-RTE-07            | E-RTE-02                     |

The SRS lists error conditions per feature, not per story. Each E- row is placed with the story whose requirement it guards (open question 22). E-ACC-02 applies to US-02 and US-03 only for the fields the SRS names (email, phone, password); see open question 23.

### 2.2 Nonfunctional requirements in scope

NFR-05 (a to d), NFR-06, NFR-07 (a, b), NFR-08a, NFR-09 (a to d) and NFR-13, plus business rule BR-01 (SRS 5.5). Section 6 of this plan shows which story each applies to.

### 2.3 Out of scope for Sprint 1

- Every other story (SRS 6.2.2 puts them in Sprints 2 and 3), including the AI draft (US-12), so no AI-filled field exists in Sprint 1 listings.
- E-ACC-04 (password reset, US-05), E-ACC-06 (suspend or remove, US-08), E-LST-01 (AI time limit, US-12), E-LST-05 (cancel listing, US-14), E-RTE-03 and E-RTE-04 (partner pickups, US-22 and US-24).
- Other NFRs (NFR-01 to 04, NFR-08b, NFR-08c, NFR-10 to 12, NFR-14). NFR-14 is still a goal of the manual tests (section 8.3).

## 3. Test items

| Item                   | Component (SDD)                                                              | Location                           |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| Mobile app             | C-01                                                                         | app/                               |
| API layer              | C-02 (routes, input checks, role checks)                                     | server/src/api                     |
| Account Service        | C-03 (US-01 to US-04)                                                        | server/src/services/account        |
| Admin & Approval       | C-04 (US-07)                                                                 | server/src/services/admin-approval |
| Listing Service        | C-05 (US-10, US-11, US-13)                                                   | server/src/services/listing        |
| Perishability Service  | C-06 (US-18)                                                                 | server/src/services/perishability  |
| Routing & Feed Service | C-07 (US-18 display, US-19)                                                  | server/src/services/routing-feed   |
| Shared validation      | `@nowaste/shared`                                                            | shared/                            |
| Data access, database  | C-27, C-28 (PostgreSQL 16 + PostGIS 3), migrations, settings and rule tables | server/src/data, server/migrations |
| Storage adapter        | C-26 (listing photo, US-10), tested through its interface with a mock        | server/src/adapters/storage        |

## 4. Approach

- **Tests first:** for each story the owner writes the tests from the acceptance criteria in docs/acceptance-tests.md, then the code (CLAUDE.md).
- **Naming:** every automated test name starts with the SRS ID it checks (FR-, E-, NFR-, BR-), so docs/traceability.md can find it.
- **Rule values:** tests read times, limits and thresholds from the settings or rule tables, as the code does; a test never relies on a constant that the code would also need (CLAUDE.md, docs/feedback-changes.md for US-18).
- **Layers (SDD 3.3.1):** business rules are unit-tested without a database or network; SQL and constraints are tested against the real test database; external services are replaced by mock adapters behind their interfaces (SDD 3.3.2, Adapter pattern).
- **Wording:** tests check that no screen says the food is safe, and that estimated values are labelled Estimate or Draft (NFR-05a).
- **Errors:** API tests check the SRS error ID in the body, for example `{"error":"E-ACC-02","fields":["email"]}`.
- **Never** skip, weaken or delete a test to make it pass.

## 5. Test levels

| Level               | What it checks                                                                                                                              | Tools                                                           | Where it runs          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| Unit                | Domain rules and validators with no database or network: perishability category (BR-01), routing ranking, shared validators                 | Jest + ts-jest (server), Jest (shared)                          | Laptop, CI             |
| API integration     | Routes, services and SQL together against the real `nowaste_test` database: status codes, SRS error IDs, role checks (NFR-09c), stored data | Jest + Supertest                                                | Laptop (Docker), CI    |
| App component       | Screens with the API mocked: fields, invalid-field marking (IF-UI-06), translations, RTL direction, accessibility labels                    | jest-expo + React Native Testing Library                        | Laptop, CI             |
| System / acceptance | The acceptance tests in docs/acceptance-tests.md on a real phone against the running API and database                                       | Expo Go, TalkBack, VoiceOver; results in docs/test-execution.md | Android and iOS phones |
| Regression in CI    | All unit, integration and component tests, lint, typecheck and build on every push and pull request (NFR-13)                                | GitHub Actions (.github/workflows/ci.yml)                       | GitHub                 |

## 6. Test design techniques

| Technique                | Where it is used                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equivalence partitioning | Email and phone formats (E-ACC-02); roles for each endpoint (NFR-09c: consumer, vendor, partner, administrator); vendor type formal / informal (FR-ACC-02); partner type charity / composting (FR-ACC-03); storage conditions and Unknown values (FR-LST-04); destinations (FR-RTE-06); language ar / en (FR-ACC-09)                                                            |
| Boundary value analysis  | Every limit in section 7: password length, phone length, number of bags, prices, pickup window end against expiry, perishability thresholds (BR-01), photo size (NFR-08a), failed login attempts and lockout time (NFR-09d), contrast ratio (NFR-07b)                                                                                                                           |
| Decision tables          | Highly perishable default (FR-RTE-02, NFR-05d: expiry missing, preparation time Unknown, storage Unknown, Quick Post, food category unknown, AI uncertain); listing type from destination and "unfit for people" (FR-RTE-06, FR-RTE-07); who may publish (E-LST-06: account status × role); which login result a vendor or partner gets (E-ACC-05: Pending, Rejected, Approved) |
| State-transition testing | Account states (SDD 3.2.2): Pending → Approved or Rejected, and that no other transition is allowed in Sprint 1 (US-07); session: logged out → logged in → logged out, with the ended token refused (US-04, IF-COM-03); listing Draft → Active on publish (US-10, US-11); category may move only to a more perishable one (FR-RTE-03); language en ↔ ar (US-09)                 |

## 7. Boundaries to test

Values below, on and just above each limit. Where the limit is a decision that still needs team approval or an open question, the row says so; those values are tested as the decision states and change if the decision changes. Time steps of one minute are a test design choice, not a requirement.

| Requirement                     | Input                                                                      | Values to test (just below, on, just above)                  | Expected                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| E-ACC-02 (D-11, needs approval) | Password length (with a letter and a digit)                                | 7, 8, 9 characters                                           | 7 rejected; 8 and 9 accepted                                                                     |
| E-ACC-02 (D-12, needs approval) | Egyptian mobile number length (prefix 010, 011, 012, 015)                  | 10, 11, 12 digits                                            | 10 and 12 rejected; 11 accepted                                                                  |
| E-LST-04                        | Number of bags (US-10, US-11)                                              | 0, 1, 2                                                      | 0 rejected (SRS example "zero bags"); 1 and 2 accepted                                           |
| E-LST-04                        | Price / discounted price (US-10, US-11)                                    | −0.01, 0, 0.01 EGP                                           | −0.01 rejected (SRS example "negative price"); 0 open (open question 24); 0.01 accepted          |
| E-LST-04                        | Discounted price against original value (US-10)                            | original − 0.01, equal to original, original + 0.01          | below accepted; above rejected ("higher than the original value"); equal open (open question 24) |
| E-LST-03, NFR-05c               | Pickup window end against expiry date and time (US-13)                     | 1 minute before expiry, at expiry, 1 minute after expiry     | before and at expiry accepted ("no later than", NFR-05c); after rejected                         |
| FR-RTE-01, BR-01                | Time remaining until the applicable limit (Highly perishable / Short-life) | 5 h 59 min, 6 h 0 min, 6 h 1 min                             | Highly perishable, Highly perishable ("6 hours or less"), Short-life                             |
| FR-RTE-01, BR-01                | Time remaining (Short-life / Long-life)                                    | 47 h 59 min, 48 h 0 min, 48 h 1 min                          | Short-life, Short-life ("up to 48 hours"), Long-life                                             |
| NFR-08a                         | Photo size sent after compression (US-10)                                  | 499 KB, 500 KB, 501 KB; plus the SRS check with a 5 MB photo | 499 and 500 KB allowed; 501 KB is a failure; the 5 MB photo is sent at 500 KB or less            |
| NFR-09d, E-ACC-03               | Failed login attempts on one account within 15 minutes (US-04)             | 4, 5, 6 failed attempts, then the correct password           | after 4 the correct password logs in; after 5 and 6 it is refused                                |
| NFR-09d                         | Time since the lockout started (US-04)                                     | 14 min 59 s, 15 min 0 s, 15 min 1 s                          | refused at 14:59; at 15:00 open (open question 25); allowed at 15:01                             |
| NFR-07b                         | Text contrast ratio (all Sprint 1 screens)                                 | 4.49:1, 4.50:1, 4.51:1                                       | 4.49 fails; 4.50 and 4.51 pass ("at least 4.5:1")                                                |

## 8. Test environment

### 8.1 Laptop

- Windows, macOS or Linux with Node.js 24 or later and the root `package-lock.json` (`npm ci` at the root only).
- Local PostgreSQL 16 + PostGIS 3 in Docker (`docker-compose.yml`, service `db`), with the separate `nowaste_test` database. Automated tests always use `nowaste_test` (`NODE_ENV=test`).
- Migrations applied with `npm run migrate:test` before `npm test`.

### 8.2 CI

- GitHub Actions (`.github/workflows/ci.yml`) on every push and every pull request to main, with a `postgis/postgis:16-3.4` service: migrations, lint, typecheck, build, tests (NFR-13).

### 8.3 Phones, platforms and accessibility

- The goal is to test every story on one Android phone and one iOS phone (NFR-14), and to walk through its screens with TalkBack on Android and VoiceOver on iOS (NFR-07a, IF-UI-08).
- The app runs in Expo Go against the API on the laptop (`app/.env`: laptop Wi-Fi address); phone and laptop on the same Wi-Fi.
- Any platform or accessibility test that was not performed is recorded as **Not Tested** or **Blocked** in docs/test-execution.md, never as Passed, and is disclosed in the pull request.
- Manual results are recorded in docs/test-execution.md by the person who performed the test.

### 8.4 Test data

- Automated tests create their own data and clear it between tests (server/tests/helpers/database.ts).
- Manual tests use invented test accounts only, never real personal data or real passwords. Administrator accounts are created by the team directly (SRS 2.7).

## 9. Entry and exit criteria

### 9.1 Entry (before a story's tests are written and run)

- The story's FR, E- and NFR rows are read, and its acceptance tests are in docs/acceptance-tests.md.
- Anything the SRS, SDD or docs/feedback-changes.md does not specify is listed under "Open questions" in PROGRESS.md.
- `npm test` passes on the branch before any change (CLAUDE.md).
- For manual tests: the Docker database is running, migrations are applied, the API is running, and the build under test is the branch being reviewed.

### 9.2 Exit (before a story's pull request is merged)

- Every FR, E- and NFR row of the story has at least one automated test named with its SRS ID, and all pass.
- `npm test`, `npm run lint` and `npm run typecheck` pass on the laptop, and the CI run on the pull request passes (NFR-13).
- The story's acceptance tests are run on a phone and logged in docs/test-execution.md; every test not performed is Not Tested or Blocked and is listed in the pull request.
- No open defect of severity High on the story (section 10).
- docs/traceability.md and PROGRESS.md are updated.
- One approving code review (NFR-13), by the reviewer in section 11.

## 10. Defect reporting

- Every defect found by a test is a GitHub Issue in MennaZaid/NoWaste.
- **Title:** the test ID and a short description, for example "AT-US02-03: map pin not saved".
- **Body:** SRS IDs, steps, expected result, actual result, device and platform (or "automated, CI run link"), date, tester, screenshots if useful.
- **Labels:** `bug`, the story (for example `US-02`), and a severity: High (a requirement fails or data is wrong), Medium (works with a workaround), Low (cosmetic).
- The fix links the issue from its pull request; the person who reported it retests and records the retest in docs/test-execution.md as a new row.

## 11. Roles

| Role            | Who                                 | Responsibility                                                                                |
| --------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Story owner     | Owner of the turn (PROGRESS.md)     | Writes the acceptance tests and automated tests for the story, runs them, logs manual results |
| Reviewer        | The next person in the turn order   | Reviews the tests and code in the pull request and approves (NFR-13)                          |
| Manual tester   | Story owner, or a named team member | Runs acceptance tests on a phone; records only tests they performed personally                |
| Test plan owner | Turn 2 owner                        | Keeps this plan, docs/acceptance-tests.md and docs/traceability.md consistent                 |

Turn order (PROGRESS.md): Turn 1 Maryam, Turn 2 Menna (taken over from Marina), Turn 3 Menna, Turn 4 Eman, Turn 5 Farah. The reviewer of Turn 5 is the Turn 1 owner. Turns 2 and 3 now have the same owner, so the reviewer of Turn 2 must be agreed by the team (open question 26).

## 12. Risks (testing)

| Risk                                                                          | Source                       | Mitigation                                                                                           |
| ----------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| No iOS device available, so NFR-14 and VoiceOver (NFR-07a) cannot be checked  | SDD T-13, Turn 1 N-8 to N-10 | Record as Not Tested and disclose in the pull request; ask the team for an iOS device or emulator    |
| TalkBack walkthrough blocked by extra announcements in Expo Go                | Turn 1 N-7, open question 21 | Record as Blocked; team decides whether to investigate text styling or retest in a development build |
| Role-based access mistakes                                                    | SDD T-11                     | API test for every pair of roles that each endpoint refuses with 403 (NFR-09c)                       |
| Perishability wrong or too optimistic                                         | SDD T-02                     | Decision-table tests for every Highly perishable default (NFR-05d); boundary tests on BR-01          |
| Values decided only by proposals awaiting approval (D-11, D-12) or still open | PROGRESS.md decisions        | Boundary tests follow the current decision; update the tests if the decision changes                 |
| Late integration and merge conflicts                                          | SRS 6.2.3 risk 3             | Small pull requests; CI on every push; run the main flows weekly                                     |
| Tests pass on Jest but text is still clipped on a real phone                  | Turn 1 issue M-6             | Manual screen-by-screen check in both languages (docs/nfr-06-checklist.md)                           |

## 13. Deliverables

- This test plan (docs/test-plan.md).
- Acceptance tests per story (docs/acceptance-tests.md).
- Traceability from every Sprint 1 FR, E- and NFR row to its tests (docs/traceability.md).
- Automated tests in server/tests, app/\_\_tests\_\_ and shared validator tests.
- Manual test log (docs/test-execution.md) and the NFR-06 checklist (docs/nfr-06-checklist.md).
- CI results on each pull request, and GitHub Issues for defects.
