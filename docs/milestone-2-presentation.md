# Milestone 2 presentation: slides and video script (20 minutes)

Facts come from PROGRESS.md, docs/test-plan.md, docs/milestone-2-test-report.md and docs/diagrams/seq-map-browse.drawio.
Items marked **[TEAM]** are not recorded in the repo; fill them in before recording.

| #   | Section                                   | Speaker            | Time  | Grading criterion  |
| --- | ----------------------------------------- | ------------------ | ----- | ------------------ |
| 1   | Intro and sprint backlog                  | [TEAM]             | 2:00  | 1 (1.0 pt)         |
| 2   | Architecture and design changes           | [TEAM]             | 3:00  | 2 (5.5 pt)         |
| 3   | Live demo of the app                      | Maryam             | 5:00  | 2 (5.5 pt)         |
| 4   | Use case: browse offers on the map (seq.) | Person after Maryam| 3:30  | 2 (5.5 pt)         |
| 5   | Testing                                   | [TEAM]             | 3:30  | 3 (2.0 pt)         |
| 6   | SRS / SDD updates with change tracking    | [TEAM]             | 1:00  | 5 (0.5 pt)         |
| 7   | Retrospective and next sprint             | [TEAM]             | 1:30  | 4 (0.5 pt)         |
|     | Closing                                   | [TEAM]             | 0:30  | 6 (0.5 pt)         |

---

## Slide 1 — Title (0:00–0:20)

**On the slide:** NoWaste · Milestone 2: Sprint 1 · team names · course name.

**Script:** "Hello, we are the NoWaste team. NoWaste connects food vendors in Egypt with consumers, charities and composting partners so surplus food is sold, donated or composted instead of thrown away. In the next twenty minutes we will show our first sprint: what we picked, what we built, how we tested it, and what we learned."

## Slide 2 — Sprint backlog (0:20–2:00)

**On the slide:** Sprint 1, 19 Oct – 1 Nov, 40 story points.

| Turn | Stories                                                 | Points |
| ---- | ------------------------------------------------------- | ------ |
| 1    | US-01 Consumer registration, US-09 Arabic/English + RTL | 8      |
| 2    | US-02 Vendor application, US-03 Partner application     | 5      |
| 3    | US-04 Log in/out, US-07 Admin approve/reject            | 8      |
| 4    | US-10 Create listing, US-11 Quick Post, US-13 Prep/storage/expiry | 9 |
| 5    | US-18 Category and urgency, US-19 Destination recommendation | 10 |

Pulled in early after phone testing: US-15 View my listings (D-51), US-26 Browse offers on the map (started, D-65).

**Script:** "From the product backlog we chose the stories that form one complete path through the system. Nobody can list food without an account, nobody can publish without approval, and food cannot be routed until it is listed and classified. So Sprint 1 is: register and apply, log in and get approved, create a listing, then estimate how perishable it is and recommend where it should go. That is forty points across five turns. Two stories were pulled in early because phone testing showed we needed them: vendors could not find their published listings again, so we built US-15, and we started US-26, the consumer map, which you will see in the demo. We deliberately left AI out of this sprint: the vendor picks the food category, and AI drafting, US-12, is in Sprint 2."

## Slide 3 — Architecture (2:00–3:30)

**On the slide:** docs/diagrams/fig-1-subsystems (component diagram) + stack: Expo React Native app · Express 5 + TypeScript API · PostgreSQL 16 + PostGIS · shared validation package.

**Script:** "Our architecture follows the SDD layers. The mobile app, C-01, talks only to the API layer, C-02. Routes only validate input, check the role and call a service. Business rules live in services and domain modules — for example C-05 Listing Service, C-06 Perishability, C-07 Routing and Feed. SQL lives only in the data-access layer, and external services such as photo storage sit behind adapters with an interface, so we can swap the local folder for cloud storage later without touching the services. Validation rules that both the app and the server need — passwords, Egyptian phone numbers, listing fields — live once in a shared package, so the phone and the server can never disagree."

## Slide 4 — Design changes this sprint (3:30–5:00)

**On the slide:** the design changes we made while building:

- Shop and partner location = map pin stored as PostGIS GEOGRAPHY(Point) + written address (feedback, US-02/US-03).
- Every listing has its own pickup location, starting at the shop pin (feedback, US-10/US-11).
- Perishability thresholds and shelf-life values in database tables, not code, so an admin can manage them (feedback, US-18; D-55).
- Worker C-19 is an entry point beside the API, not a layer under it (SDD feedback).
- Shops can have several branches, each with its own pin and opening hours (D-62, D-64).
- New nearby-offers API: GET /listings/nearby, one PostGIS query using a spatial index (D-65).
- Consumers do not see the perishability category; they see the pickup window (D-73).
- Admin approves every listing, Quick Post included — US-50, planned for Sprint 3 (D-79).

**Script:** "Building the sprint changed the lower-level design in several places. Some came from the TA and professor feedback: locations are real map pins stored with PostGIS, each listing has its own pickup point, and all perishability values are rows in the database rather than numbers in the code. Others came from testing on real phones: real shops have several branches with different hours, so we added branches; and we decided customers should see the pickup time, not an internal urgency label. Every one of these is recorded as a numbered decision in our progress log and written back into the SRS and SDD."

## Slide 5 — Demo (5:00–10:00) — Maryam

**On the slide:** "Live demo" + phone frame. Play the recorded video.

**Suggested demo order and narration** (adjust to what you recorded):

1. **Welcome screen, switch to Arabic and back** — "Every screen exists in Arabic and English, and the whole layout flips right-to-left (US-09)."
2. **Register a consumer** — show a weak password and the three password rules, then success (US-01).
3. **Apply as a vendor** — shop name, formal/informal, phone, opening hours, drop the shop pin on the map (US-02).
4. **Admin logs in and approves the vendor** — "Until the admin approves, the vendor cannot publish (US-07, US-04)."
5. **Vendor creates a listing** — photo, food type, category, storage, bags, original value and price, pickup window, pickup pin (US-10, US-13).
6. **Perishability estimate and destination** — "The app shows an *Estimate*, for example Short-life, and recommends a destination; landfill is always last (US-18, US-19)." Then Publish.
7. **Informal vendor Quick Post** — fewer fields, published at once (US-11).
8. **My listings** — the vendor finds the published listing (US-15).
9. **Consumer map** — pins near the consumer, tap a pin, open the offer page — "My colleague will now explain how this screen works inside the system."

## Slide 6 — Use case: Browse offers on the map (10:00–13:30) — person after Maryam

**On the slide:** docs/diagrams/seq-map-browse.drawio (SDD Figure 7, US-26). Participants: Consumer · C-01 Mobile App · C-24 Map View · C-02 API Layer · C-07 Routing & Feed Service · C-27 Data Access · C-28 PostgreSQL + PostGIS · external Map service.

**Script:**

"What you just saw at the end of the demo is user story US-26: as a consumer, I want to browse offers near me on a map. This sequence diagram shows exactly what happens between the tap and the pins.

**Step 1 to 5 — location.** The consumer opens the map. The app reads the GPS location, interface IF-HW-03. There is an *alt* fragment here with two cases. If location is allowed, the map centres on the device. If it is refused, IF-HW-04, the map centres on central Cairo and tells the user that nearby search needs their location. The app keeps working either way.

**Step 6 and 7 — the request.** The app calls GET /listings/nearby with latitude, longitude and radius. The API layer, C-02, does only one thing besides validating: it checks the token belongs to a consumer. Every other role is refused.

**Step 8 to 10 — the radius rule.** The API hands the work to the Routing and Feed Service, C-07. The service does not hard-code the radius. It reads the FR-RES-01 setting from the database: ten kilometres by default, allowed between one and fifty. This follows our rule that every limit is a setting.

**Step 11 to 13 — the query.** Data access, C-27, runs one PostGIS query on the branch locations, using a spatial index — that is how we meet the performance requirement NFR-01. It only returns *Active* offers, with the distance to each.

**Step 15 — ranking.** Back in the service, the offers are ordered: highly perishable food nearby comes first, then by distance and time left — requirements FR-RTE-08 and FR-RTE-09. Food that would expire soonest is shown first, which is the whole point of NoWaste.

**Step 16 and 17 — privacy.** The response contains each offer with its branch, store and address, but *not* the perishability category, because customers see the pickup window instead. And the consumer's location is never stored — NFR-11a.

**Step 18 to 21 — drawing the map.** The app gives the Map View one pin per branch. The external map service is only asked for map tiles. Note at the bottom: the map service only draws tiles; it never stores, searches or ranks listings. So we are not dependent on it for any business logic.

**Step 22 to 30 — opening an offer.** Tapping a pin shows the store name, branch address and that branch's offers. Opening one calls GET /listings/nearby/{id}, and the product page shows the photo, name, food category, description, pickup window, bags left and prices.

So in one diagram you can see our layers in action: the route only checks the role, the rule lives in the service, the SQL lives in the data layer, and the external service is kept behind an interface."

## Slide 7 — Testing methodology (13:30–15:00)

**On the slide:** test plan (docs/test-plan.md), following IEEE 829-style structure: scope, items, approach, levels, techniques, pass/fail criteria.

| Level               | What it checks                                                        |
| ------------------- | --------------------------------------------------------------------- |
| Unit                | Domain rules and shared validators (BR-01 category, routing ranking)  |
| API integration     | Routes + services + SQL on a real test database, SRS error IDs, roles |
| App component       | Screens with the API mocked: fields, translations, RTL, a11y labels   |
| System / acceptance | Acceptance tests on a real phone against the running server           |
| Regression          | All of the above plus lint, typecheck and build on every push (CI)    |

Techniques: equivalence partitioning, boundary-value analysis, decision tables, role × route matrix.

**Script:** "We used a formal, requirement-based method. Every requirement has at least one test whose name starts with its SRS ID, and docs/traceability.md maps each requirement to its tests. We wrote tests from the acceptance criteria first, then the code. Black-box techniques: boundary values — for example the perishability boundaries at 5:59, 6:00, 6:01 and 47:59, 48:00, 48:01 hours; a decision table with eight rules for choosing a destination; and an automatic role matrix that calls every protected route with every role, so a missing permission check fails the build."

## Slide 8 — Test results (15:00–17:00)

**On the slide:**

- Automated: **960 tests** (server 635, app 325), all passing at the latest run. Lint, typecheck and build pass.
- Growth: 155 tests after Turn 1 → 569 after Turn 4 → 960 now.
- Manual phone tests (Expo Go, Android 16): M-1 to M-8 and N-1 to N-6, N-11 Passed.
- Defect found and fixed: **M-6** English password-rule labels cut off — failed, root cause found, fixed, retest passed.
- Open: N-7 TalkBack (blocked, under investigation), N-8 VoiceOver and N-10 iOS Not Tested, N-9 contrast scan deferred.
- Phone-testing defects that changed the design: D-71 (salad wrongly marked Short-life — hours counted from saving instead of pickup), D-72 to D-75.

**Script:** "Here are the documented results. [Read the bullets.] We report honestly: anything not run is marked Not Tested, not Passed. A good example of the process working is M-6: the English password rules were cut off on a real phone. We logged it as failed, found the root cause in the layout, fixed it, and the retest passed. Another is D-71: on the phone a salad was classified Short-life instead of Highly perishable, because the hours were counted from the moment of saving. We fixed the rule and added tests so it cannot come back."

## Slide 9 — Requirements and design documents (17:00–18:00)

**On the slide:** SRS and SDD updated (docs/…(SRS) (1).docx, docs/…(SDD) (1).docx) · 13 new diagrams in docs/diagrams · every change traced to a decision ID (D-xx) in PROGRESS.md and to the requirement in docs/traceability.md.

Examples: D-77 HTTPS stays a requirement (AT-US04-08 restored) · D-78 new admin stories US-46 to US-49 (FR-ACC-10, FR-ACC-11, FR-TGI-09) from TA/professor feedback · D-79 admin approves every listing (US-50, FR-LST-09, E-LST-07).

**Script:** "Every change to requirements or design is tracked. We log it as a decision with an ID and a date, say which SRS or SDD item it changes, then update the documents and the traceability matrix. The SRS and SDD you received are the updated versions, and the thirteen diagrams — components, use cases and sequences — were redrawn to match what we actually built."

## Slide 10 — Retrospective (18:00–19:30)

**On the slide:** [TEAM] confirm or edit each point.

**What went well**

- Clear layering and a shared validation package: one rule, one place.
- Tests written first and named by SRS ID; ~960 automated tests caught regressions.
- Real-phone testing found problems unit tests could not (M-6, D-71).
- Every decision logged with an ID, so the documents stayed in step.

**What could be improved**

- Phone tests for Turns 2–5 were done late; several are still Not Tested.
- iOS and accessibility (TalkBack, VoiceOver, contrast) not covered.
- Many decisions waited for team approval; turns were reassigned between members.
- Open questions (e.g. shelf-life values, photo cloud storage) left blank too long.

**Next sprint**

- Run the phone acceptance tests for every story before merging, on Android and iOS.
- Sprint 2 scope from the backlog, including AI draft listing US-12 and finishing US-26. [TEAM: add the rest of the Sprint 2 stories.]
- Fill the shelf-life table and choose the photo storage provider.
- Sprint 3 already holds the new admin stories US-46 to US-50.

**Script:** read the three columns; one sentence of example for each point.

## Slide 11 — Closing (19:30–20:00)

**Script:** "To sum up: forty points of planned stories built, plus two pulled in from testing; a layered design we could change safely; a formal, traceable testing process with about nine hundred and sixty passing tests; and updated SRS and SDD documents. Thank you — we are happy to take questions."

---

## Likely Q&A (prepare answers)

- **Why no AI in Sprint 1?** D-54: the vendor's chosen category counts as a confident estimate; AI is US-12 in Sprint 2.
- **Why are all listings Highly perishable right now?** The shelf-life table is empty until the team fills it (open question 48); missing data falls back to the most cautious category.
- **What if the map service is down?** It only draws tiles; search and ranking are in our server.
- **Is the consumer's location stored?** No (NFR-11a).
- **How do you know every route checks roles?** rbac.test.ts calls every protected route with every role automatically.
