# Sprint 2 plan (2–15 Nov, 45 points)

Source: SRS section 6.2.2 (sprint plan) and the SRS functional requirements table. Jira board items SCRUM-32 to SCRUM-47 and SCRUM-69 to SCRUM-80.
Sprint goal (SRS): "A pickup code can be shown and entered by the end of Sprint 2, so the Sprint 2 demo shows the full main flow."

## 1. Stories and requirements

| Story | Title (Jira)                         | Pts | Requirement (SRS)                                                                                          |
| ----- | ------------------------------------ | --- | ---------------------------------------------------------------------------------------------------------- |
| US-12 | AI draft listing                     | 8   | FR-LST-03: AI identifies food type, category, quantity from the photo; draft in Arabic and English to accept or edit |
| US-20 | Highly perishable listings first     | 3   | FR-RTE-08                                                                                                  |
| US-21 | Rank by distance and time left       | 2   | FR-RTE-09                                                                                                  |
| US-26 | Map search and filters               | 5   | FR-RES-01: pins per branch, distance slider 10 km (1–50), filters price, pickup time, vendor rating        |
| US-27 | Card reservation                     | 8   | FR-RES-02: pay in full by card; confirmed only after the gateway approves; held for the whole window      |
| US-28 | No-card hold and check-in            | 8   | FR-RES-03 (45-min hold), FR-RES-04 ("I'm on my way" +20 min, once), FR-RES-05 (release when hold expires)  |
| US-30 | No over-reservation                  | 3   | FR-RES-07                                                                                                  |
| US-31 | My reservations                      | 3   | FR-RES-08 (current and previous, pickup code for active)                                                  |
| US-32 | Vendor reservations                  | 2   | FR-RES-09                                                                                                  |
| US-33 | Pickup code                          | 3   | FR-RES-10 (6-digit code, Completed when the vendor enters it)                                              |

Not in Sprint 2: the waitlist (US-29, FR-RES-06) and push notifications (FR-RES-11) are Sprint 3, so in FR-RES-05 a released bag goes back to the listing. Admin approval of listings (US-50, D-79) is Sprint 3.

Setup tasks: SCRUM-78 adapter skeletons with mock mode, SCRUM-79 payment and AI sandbox accounts, SCRUM-80 API contract (OpenAPI), SCRUM-69 TBD-1 minimum OS versions, SCRUM-71 TBD-3 manual location entry.

## 2. Who does what

Each person owns one branch and one set of files. Reservations are shared by three people, so Marina builds the reservation base first and merges it early.

| Person | Stories                                    | Pts | Branch                             | Depends on                     |
| ------ | ------------------------------------------ | --- | ---------------------------------- | ------------------------------ |
| Marina | US-28, US-30 + reservation base             | 11  | `sprint2/reservations-core`        | nothing (goes first)           |
| Eman   | US-27 + payment adapter, US-31             | 11  | `sprint2/card-reservation`         | Marina's base for step 2       |
| Farah  | US-33 pickup code + SCRUM-80 OpenAPI       | 3   | `sprint2/pickup-code`              | Marina's base for step 2       |
| Maryam | US-26, US-20, US-21                        | 10  | `sprint2/map-search-ranking`       | nothing                        |
| Menna  | US-12 + AI adapter, US-32                  | 10  | `sprint2/ai-draft-listing`, then `sprint2/vendor-reservations` | Marina's base for US-32 |

Farah's load was reduced on request (2026-11-08): US-31 moved to Eman, US-32 to Menna. Farah's pickup-code API is used by Menna's vendor screen (the vendor enters the code there), so Farah and Menna agree the route first.

SCRUM-69 and SCRUM-71 (decisions, no code): Maryam asks the team and records the answers in PROGRESS.md.

## 2a. Start order

Menna starts first (2026-11-08): the AI adapter and US-12 depend on nobody, so she can begin before the
reservation base exists. Order:

1. **Menna:** prompt 4.1, steps 1 and 2 (AI adapter, US-12). US-32 (step 3) waits for Marina's base.
2. **Marina:** prompt 4.2, step 1 (reservation base) as soon as she can, because Eman, Farah and Menna's US-32 need it.
3. **Maryam:** prompt 4.5 (no dependency).
4. **Eman:** prompt 4.3, step 1 (payment adapter) now; step 2 after Marina's base.
5. **Farah:** prompt 4.4, step 1 (OpenAPI, pickup-code rules) now; step 2 after Marina's base.

Menna's AI work touches the listing form and C-06; nobody else changes those files in Sprint 2, so it does not
block or conflict with the others.

## 3. Timeline

| Dates      | Marina                         | Eman                           | Farah                                 | Maryam                  | Menna                   |
| ---------- | ------------------------------ | ------------------------------ | ------------------------------------- | ----------------------- | ----------------------- |
| 8–10 Nov   | Reservation base → PR, merge   | Payment adapter (mock + sandbox) | OpenAPI contract; pickup-code rules  | Filters and slider      | AI adapter (mock + sandbox) |
| 10–13 Nov  | US-28 check-in, release; US-30 | US-27, then US-31              | US-33 on top of the base              | US-20, US-21 ranking    | US-12 draft screen, then US-32 |
| 13–14 Nov  | Phone tests, PR                | Phone tests, PR                | Phone tests, PR                       | Phone tests, PR         | Phone tests, PR         |
| 15 Nov     | Whole team: merge everything into `main`, run the end-to-end demo flow (section 6) together |

**Merge rule:** after someone merges into `main`, the others pull `main` into their branch, run `npm ci`, `npm run migrate`, `npm run migrate:test` and `npm test`.
**Migration rule:** new migration file names start with the current timestamp, so they never collide.

## 4. Claude Code prompts

Paste the prompt into Claude Code on your laptop, from the repo root, on `main` after pulling.

### 4.1 Menna (starts first): AI adapter, US-12

```
I am Menna. Sprint 2 has started; the plan is docs/sprint-2-plan.md (read it, my part is "Menna").
Create branch sprint2/ai-draft-listing from main.

STEP 1:
- AI adapter in server/src/adapters/ai behind an interface, as SDD 3.2 describes, with a mock mode for tests and
  local runs and a sandbox mode with the provider named in the SRS/SDD (if not named, stop and ask me). Keys only
  in server/.env, listed without values in server/.env.example.
STEP 2 – US-12 / FR-LST-03:
- After the vendor uploads the listing photo, the AI identifies food type, food category and estimated quantity
  and generates a draft name and description in Arabic and English. The vendor accepts or edits every field
  before saving (NFR-05b). AI values are labelled "Estimate" or "Draft" (NFR-05a); never word anything as
  "the food is safe".
- Manual fallback (NFR-03, E-LST-01): if the AI fails, times out or is not confident, the vendor fills the form by
  hand exactly as today. Check D-54 (Sprint 1 treated the vendor's category as confident) and update C-06 so an
  AI category that is not confident is handled as the SRS says.
- The photo limit NFR-08a still applies. Do not change Quick Post unless the SRS says so.
STEP 3 – US-32 / FR-RES-09 (after Marina's reservation base is in main; new branch sprint2/vendor-reservations):
- Vendor sees the reservations of their own listings and their status, and types the pickup code there using
  Farah's US-33 route (agree it with her first). A vendor never sees other vendors' reservations.

Rules: follow CLAUDE.md, tests first, test names start with the SRS ID (FR-LST-03, NFR-03, NFR-05a, NFR-05b, E-LST-01, FR-RES-09).
Ask me about anything not in the SRS/SDD and add it to Open questions.
At the end: npm test, lint, typecheck pass; update PROGRESS.md, docs/traceability.md, docs/acceptance-tests.md
(AT-US12, AT-US32). Do not commit.
```

### 4.2 Marina: reservation base, US-28, US-30

```
I am Marina. Sprint 2 has started; the plan is docs/sprint-2-plan.md (read it, my part is "Marina").
Create branch sprint2/reservations-core from main.

Build, in this order, with tests first from the SRS acceptance criteria (SRS section 4.4 and 6.2.1):

STEP 1 – reservation base (others build on it, so open a PR as soon as it passes):
- Migration: a reservations table as in SDD 4.2 (Reservation entity): listing, consumer, branch, type (card / no_card),
  status, hold_until, pickup code column (Farah fills it in US-33), timestamps. Settings rows for the hold values
  FR-RES-03 (45 minutes), FR-RES-04 (20 minutes); never constants in code.
- Data layer (server/src/data) and a Reservation Service (server/src/services/reservation) with a domain module
  (server/src/domain/reservation.ts) for the pure hold-time rules.
- US-30 / FR-RES-07: never more reservations than bags. Reserving and decreasing bags_available must be one
  transaction with a row lock, and a test must fire parallel requests at the last bag and prove only one wins.
STEP 2 – US-28:
- FR-RES-03 no-card reservation: hold for 45 min from the later of the reservation time and the pickup start,
  never past the pickup end.
- FR-RES-04 "I'm on my way": once per reservation, +20 min, capped at the pickup end.
- FR-RES-05 release when the hold expires without pickup. Waitlist (US-29) is Sprint 3, so the bag goes back to
  the listing. Decide with me whether expiry runs in the worker C-19 (server/src/worker.ts) or is checked when
  read; follow the SDD.
- App: Reserve button on the offer page (no-card), a reservation screen with the hold end time and
  "I'm on my way". All texts in Arabic and English, RTL.
- Error IDs from the SRS (E-RES-...). Add every new route to protectedRoutes.ts so rbac.test.ts covers it.

Rules: follow CLAUDE.md. Test names start with the SRS ID (FR-RES-03, FR-RES-04, FR-RES-05, FR-RES-07, E-RES-..).
Boundary tests: reservation before/after the window start, hold that would pass the window end, second check-in,
check-in after expiry. If anything is not specified in the SRS/SDD, stop and ask me, and add it to Open questions.
At the end: npm test, npm run lint, npm run typecheck pass; update PROGRESS.md, docs/traceability.md and
docs/acceptance-tests.md (AT-US28, AT-US30). Do not commit.
```

### 4.3 Eman: payment adapter, US-27

```
I am Eman. Sprint 2 has started; the plan is docs/sprint-2-plan.md (read it, my part is "Eman").
Create branch sprint2/card-reservation from main.

STEP 1 (can start now, before Marina's reservation base is merged):
- Payment adapter in server/src/adapters/payment behind an interface (IPayment), as SDD 3.2 describes, with a
  mock mode for tests and local runs, and a sandbox mode using the provider in the SRS/SDD (if the provider is not
  named, stop and ask me). Keys only in server/.env and listed in server/.env.example without values.
- Tests for the adapter through its interface: approved, declined, timeout/error.
STEP 2 (after Marina's base is in main; merge main into my branch first):
- US-27 / FR-RES-02: card reservation. Pay the full discounted price; the reservation is confirmed ONLY after the
  gateway approves; a declined or failed payment leaves no reservation and gives the bag back; the bag is held for
  the whole pickup window. Reuse Marina's Reservation Service and its bag lock (FR-RES-07); do not write a second
  one.
- App: choose "Pay by card" or "Reserve without card" on the offer page; card payment screen; clear Arabic and
  English messages for declined and failed payments. Never store card numbers in our database.
- Error IDs from the SRS; new routes in protectedRoutes.ts.
STEP 3 – US-31 / FR-RES-08: consumer "My reservations": current and previous, the pickup code (Farah's US-33)
  shown only for active ones. A consumer never sees another consumer's reservations.

Rules: follow CLAUDE.md, tests first, test names start with the SRS ID (FR-RES-02, FR-RES-08, E-RES-..).
Ask me about anything not in the SRS/SDD and add it to Open questions.
At the end: npm test, lint, typecheck pass; update PROGRESS.md, docs/traceability.md, docs/acceptance-tests.md
(AT-US27, AT-US31). Do not commit.
```

### 4.4 Farah: OpenAPI, US-33

```
I am Farah. Sprint 2 has started; the plan is docs/sprint-2-plan.md (read it, my part is "Farah").
Create branch sprint2/pickup-code from main.

STEP 1 (can start now):
- SCRUM-80: write the API contract docs/openapi.yaml for the routes that exist now plus the Sprint 2 reservation
  routes agreed with Marina and Eman (list them, ask me before inventing any).
- US-33 domain: pickup-code rules in server/src/domain (6-digit code, FR-RES-10) with unit tests.
STEP 2 (after Marina's reservation base is in main; merge main into my branch first):
- US-33 / FR-RES-10: every consumer reservation gets a 6-digit code when it is confirmed; the vendor enters the
  code and the reservation becomes Completed; a wrong code, a code for another vendor's listing, or an expired or
  released reservation is refused with the SRS error ID.
- Only the API and rules: the consumer screen (US-31) is Eman's and the vendor screen where the code is typed
  (US-32) is Menna's. Agree the route and response with Menna before building it, and give her a mock of it.
- New routes in protectedRoutes.ts (only the vendor of that listing may confirm a code).

Rules: follow CLAUDE.md, tests first, test names start with the SRS ID (FR-RES-10, E-RES-..).
Ask me about anything not in the SRS/SDD and add it to Open questions.
At the end: npm test, lint, typecheck pass; update PROGRESS.md, docs/traceability.md, docs/acceptance-tests.md
(AT-US33). Do not commit.
```

### 4.5 Maryam: US-26, US-20, US-21

```
I am Maryam. Sprint 2 has started; the plan is docs/sprint-2-plan.md (read it, my part is "Maryam").
Create branch sprint2/map-search-ranking from main.

The consumer map and GET /listings/nearby already exist (D-65, D-73). Extend them:
- US-26 / FR-RES-01: distance slider (10 km default, 1 to 50 km, from the settings row, not constants); filters by
  price, pickup time and vendor rating; one pin per branch stays. Filters work together and can be cleared.
- US-20 / FR-RTE-08: Highly perishable listings near the consumer come before the others.
- US-21 / FR-RTE-09: the others are ranked by distance and time left in the pickup window.
  Check what the current ordering in the Routing & Feed Service (C-07) already does and only add what is missing.
- Keep D-73: consumers never see the perishability category. Keep NFR-11a: the location is not stored.
- Arabic and English, RTL; the slider and filters must be usable with a screen reader label.

Rules: follow CLAUDE.md, tests first, test names start with the SRS ID (FR-RES-01, FR-RTE-08, FR-RTE-09).
Boundary tests: radius 0, 1, 50, 51; equal distance with different time left; filters with no results.
Ask me about anything not in the SRS/SDD (for example the price and pickup-time filter steps) and add it to Open questions.
At the end: npm test, lint, typecheck pass; update PROGRESS.md, docs/traceability.md, docs/acceptance-tests.md
(AT-US26, AT-US20, AT-US21). Do not commit.
```

## 5. Testing checklist per person

Every person, before opening the PR:

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` exit 0
- [ ] Every new requirement has a test whose name starts with its SRS ID; traceability.md updated
- [ ] Every new route is in protectedRoutes.ts (rbac test passes for all roles)
- [ ] Each screen checked on a phone in English and Arabic (RTL, no clipped text); results logged as Passed / Failed / Not Tested in docs/test-execution.md
- [ ] No secrets in the repo; new keys only in .env.example without values

**Marina (US-28, US-30)**
- [ ] No-card reserve before the window: hold ends 45 min after the window start
- [ ] Reserve inside the window: hold ends 45 min after now; near the end: capped at the window end
- [ ] "I'm on my way" adds 20 min once; the second tap is refused; capped at the window end
- [ ] Hold expires: reservation released, bag count goes back up
- [ ] Two phones reserve the last bag at the same time: only one succeeds (FR-RES-07)
- [ ] Changing the 45/20-minute settings rows changes the behaviour without code changes

**Eman (US-27)**
- [ ] Approved sandbox card: reservation confirmed, held for the whole window
- [ ] Declined card and gateway error: no reservation, bag still available, clear message in both languages
- [ ] Paying for the last bag while someone else takes it: no double booking, no charge kept for a bag not held
- [ ] No card data stored in the database (check the tables)

**Farah (US-33, SCRUM-80)**
- [ ] Every confirmed reservation gets a 6-digit code
- [ ] Right code: Completed; wrong code, another vendor's code, released reservation: refused
- [ ] docs/openapi.yaml opens in an OpenAPI viewer without errors

**Eman, extra (US-31)**
- [ ] My reservations shows current and previous; the code only on active ones; nobody else's reservations

**Menna, extra (US-32)**
- [ ] Vendor list shows only their own listings' reservations with the right status; entering a code there works

**Maryam (US-26, US-20, US-21)**
- [ ] Slider at 1, 10 (default) and 50 km changes the pins
- [ ] Each filter alone and combined; clearing filters; no results message
- [ ] A Highly perishable offer nearby appears before closer non-perishable offers
- [ ] Equal-distance offers: the one with less time left first
- [ ] Category still hidden from consumers; location refused still works (central Cairo)

**Menna (US-12)**
- [ ] Photo of bread/cooked meal: draft fields filled, marked Draft/Estimate, both languages
- [ ] Vendor edits a draft field and saves: the edited value is stored
- [ ] AI turned off / timeout: the manual form works as before
- [ ] Large photo is still compressed under the limit (NFR-08a)

## 6. End-to-end demo flow (15 Nov, whole team)

1. Vendor creates a listing with the AI draft (Menna) and publishes it.
2. Consumer finds it on the map with the slider and a filter (Maryam).
3. Consumer A reserves by card (Eman); consumer B reserves without card and taps "I'm on my way" (Marina).
4. Both see their pickup code in My reservations (Eman, Farah).
5. Vendor opens Vendor reservations and enters A's code: Completed (Menna, Farah).
6. B's hold is left to expire: the bag returns to the listing (Marina).
