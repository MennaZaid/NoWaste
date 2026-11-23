# NoWaste acceptance tests: Sprint 1

Each test comes only from the story's FR, E- and NFR rows in the SRS (and, where marked, from docs/feedback-changes.md). **Normal** is the everyday flow; **Error** is a defensive case from an E- row. Every test is run at the system/acceptance level on a phone (docs/test-plan.md, section 5) and its result is logged in docs/test-execution.md. Automated tests for the same criteria are named with the SRS ID.

The SRS does not say which story each E- row belongs to; they are placed with the story whose requirement they guard (open question 22). Values that come from decisions still waiting for team approval (D-11, D-12, D-15) are marked.

NFR-06 (every screen correct in Arabic RTL and English LTR, no clipped or overlapping text) applies to every screen below. It is checked once per screen with docs/nfr-06-checklist.md and listed in each story's last test. D-76 (2026-11-05): the accessibility scanner (NFR-07b contrast) is not part of these tests. D-77 (2026-11-05): the API runs over HTTP in development, so AT-US04-08 (HTTPS) stays Not Tested until HTTPS is set up.

## US-01 Consumer registration

| ID         | Type   | Given                                                 | When                                                                                                  | Then                                                                                                | SRS IDs            |
| ---------- | ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| AT-US01-01 | Normal | A person without an account is on the Register screen | They enter a new email address and a password that meets the password rules (D-11) and submit         | A consumer account is created and the Account created screen is shown                               | FR-ACC-01          |
| AT-US01-02 | Normal | A person without an account is on the Register screen | They choose Mobile number, enter a new Egyptian mobile number (D-12) and a valid password and submit  | A consumer account is created                                                                       | FR-ACC-01          |
| AT-US01-03 | Normal | A consumer has registered                             | The team inspects the users table                                                                     | The password is stored only as a salted hash, never in plain text                                   | NFR-09b            |
| AT-US01-04 | Error  | An email address is already registered                | Someone registers with the same email, also in different letter case                                  | The registration is rejected, no account is created, and Log in and Reset password are offered      | E-ACC-01           |
| AT-US01-05 | Error  | A mobile number is already registered                 | Someone registers with the same number                                                                | The registration is rejected, the mobile number is named, and Log in and Reset password are offered | E-ACC-01           |
| AT-US01-06 | Error  | A person is on the Register screen                    | They submit an email without "@", or a password that breaks the rules (D-11)                          | Each invalid field is marked and no account is created                                              | E-ACC-02, IF-UI-06 |
| AT-US01-07 | Error  | A person is on the Register screen                    | They submit a mobile number of 10 or 12 digits, or with a prefix other than 010, 011, 012, 015 (D-12) | The mobile number field is marked and no account is created                                         | E-ACC-02, IF-UI-06 |
| AT-US01-08 | Normal | TalkBack (Android) or VoiceOver (iOS) is on           | A person completes sign-up using only the screen reader                                               | Every field, rule, error and button is announced and the account is created                         | NFR-07a, IF-UI-08  |
| AT-US01-09 | Normal | The Register and Account created screens are open     | They are checked in Arabic and English                                                                | Arabic is right-to-left, English left-to-right, no clipped or overlapping text                      | NFR-06             |

## US-02 Vendor application

Source for the location: docs/feedback-changes.md (map pin stored as PostGIS GEOGRAPHY(Point,4326) plus a written address).

| ID         | Type   | Given                                                                     | When                                                                                                      | Then                                                                                         | SRS IDs                      |
| ---------- | ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| AT-US02-01 | Normal | A formal vendor without an account is on the vendor application screen    | They enter the shop name, type Formal, a map pin and a written address, and contact details, and submit   | The application is saved with status Pending                                                 | FR-ACC-02                    |
| AT-US02-02 | Normal | An informal vendor without an account is on the vendor application screen | They enter the shop name, type Informal, a map pin and a written address, and contact details, and submit | The application is saved with status Pending                                                 | FR-ACC-02                    |
| AT-US02-03 | Normal | A vendor application was submitted                                        | The team inspects the stored application                                                                  | The location is stored as a point (latitude and longitude) together with the written address | FR-ACC-02 (feedback-changes) |
| AT-US02-04 | Error  | An email or mobile number is already registered                           | A vendor applies with it                                                                                  | The application is rejected and Log in and Reset password are offered                        | E-ACC-01                     |
| AT-US02-05 | Error  | A person is on the vendor application screen                              | They submit an invalid email or phone format, or a password that breaks the rules                         | Each invalid field is marked and no application is saved                                     | E-ACC-02, IF-UI-06           |
| AT-US02-06 | Error  | A vendor's application is Pending                                         | The vendor logs in                                                                                        | The application status is shown and posting food is not allowed                              | E-ACC-05                     |
| AT-US02-07 | Normal | The vendor application screens are open                                   | They are checked in Arabic and English                                                                    | Arabic is right-to-left, English left-to-right, no clipped or overlapping text               | NFR-06                       |

## US-03 Partner application

| ID         | Type   | Given                                                                             | When                                                                              | Then                                                                           | SRS IDs            |
| ---------- | ------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| AT-US03-01 | Normal | A charity organisation without an account is on the partner application screen    | It enters the organisation details and the food types it accepts and submits      | The application is saved with status Pending, with the accepted food types     | FR-ACC-03          |
| AT-US03-02 | Normal | A composting organisation without an account is on the partner application screen | It enters the organisation details and the food types it accepts and submits      | The application is saved with status Pending, with the accepted food types     | FR-ACC-03          |
| AT-US03-03 | Error  | An email or mobile number is already registered                                   | A partner applies with it                                                         | The application is rejected and Log in and Reset password are offered          | E-ACC-01           |
| AT-US03-04 | Error  | A person is on the partner application screen                                     | They submit an invalid email or phone format, or a password that breaks the rules | Each invalid field is marked and no application is saved                       | E-ACC-02, IF-UI-06 |
| AT-US03-05 | Error  | A partner's application is Pending                                                | The partner logs in                                                               | The application status is shown and receiving food is not allowed              | E-ACC-05           |
| AT-US03-06 | Normal | The partner application screens are open                                          | They are checked in Arabic and English                                            | Arabic is right-to-left, English left-to-right, no clipped or overlapping text | NFR-06             |

## US-04 Log in/out

| ID         | Type   | Given                                                            | When                                                         | Then                                                                                     | SRS IDs              |
| ---------- | ------ | ---------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------- |
| AT-US04-01 | Normal | A registered consumer is on the login screen                     | They enter their email or mobile number and password         | They are logged in and the consumer home screen opens                                    | FR-ACC-04, IF-UI-01  |
| AT-US04-02 | Normal | An approved vendor (or partner) is on the login screen           | They log in                                                  | The home screen for their role opens and the functions of their role are enabled         | FR-ACC-04, IF-UI-01  |
| AT-US04-03 | Normal | A user is logged in                                              | They select Log out                                          | The session ends, the login screen is shown, and a request with the old token is refused | FR-ACC-04, IF-COM-03 |
| AT-US04-04 | Error  | A registered user is on the login screen                         | They enter a wrong password, and separately an unknown email | Both are rejected with the same message, which does not say which credential was wrong   | E-ACC-03             |
| AT-US04-05 | Error  | A registered user has failed to log in 5 times within 15 minutes | They enter the correct password within 15 minutes            | The login is refused                                                                     | NFR-09d, E-ACC-03    |
| AT-US04-06 | Error  | A vendor or partner whose application is Rejected                | They log in                                                  | The application status is shown and posting or receiving food is not allowed             | E-ACC-05             |
| AT-US04-07 | Error  | A user is logged in with one role's access token                 | They call an endpoint of another role                        | The request receives HTTP 403 (every pair: consumer, vendor, partner, administrator)     | NFR-09c              |
| AT-US04-08 | Error  | The API is reached                                               | A plain HTTP request is sent                                 | The request is refused                                                                   | NFR-09a, IF-COM-01   |
| AT-US04-09 | Normal | The login screen is open                                         | It is checked in Arabic and English                          | Arabic is right-to-left, English left-to-right, no clipped or overlapping text           | NFR-06               |

## US-07 Approve/reject

| ID         | Type   | Given                                                              | When                                                         | Then                                                                           | SRS IDs              |
| ---------- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- |
| AT-US07-01 | Normal | An administrator is logged in and a vendor application is Pending  | The administrator opens pending applications and approves it | The account is set to Approved and the applicant is notified                   | FR-ACC-07            |
| AT-US07-02 | Normal | An administrator is logged in and a partner application is Pending | The administrator rejects it                                 | The account is set to Rejected and the applicant is notified                   | FR-ACC-07            |
| AT-US07-03 | Normal | A vendor's application was approved                                | The vendor logs in                                           | The vendor functions are enabled                                               | FR-ACC-07, FR-ACC-04 |
| AT-US07-04 | Error  | A vendor's application was rejected                                | The vendor logs in                                           | The status Rejected is shown and posting food is not allowed                   | E-ACC-05             |
| AT-US07-05 | Error  | A consumer, vendor or partner is logged in                         | They call the approve or reject endpoint                     | The request receives HTTP 403                                                  | NFR-09c              |
| AT-US07-06 | Normal | The pending applications screen is open                            | It is checked in Arabic and English                          | Arabic is right-to-left, English left-to-right, no clipped or overlapping text | NFR-06               |

## US-09 Arabic/English RTL

| ID         | Type   | Given                                                     | When                                                         | Then                                                                         | SRS IDs                       |
| ---------- | ------ | --------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------- |
| AT-US09-01 | Normal | The app is opened for the first time, nobody is logged in | The user switches to Arabic                                  | Every screen is shown in Arabic, right-to-left                               | FR-ACC-09, IF-UI-02, IF-UI-03 |
| AT-US09-02 | Normal | The app is in Arabic                                      | The user switches to English                                 | Every screen is shown in English, left-to-right                              | FR-ACC-09, IF-UI-02           |
| AT-US09-03 | Normal | The user chose a language                                 | The app is closed and opened again                           | The chosen language is still used                                            | FR-ACC-09                     |
| AT-US09-04 | Normal | All Sprint 1 screens exist                                | Each is checked in both languages (docs/nfr-06-checklist.md) | No clipped or overlapping text, headers and back arrows follow the direction | NFR-06, IF-UI-03              |
| AT-US09-05 | Normal | TalkBack or VoiceOver is on                               | The user switches the language                               | The switch is announced with a label in both languages                       | NFR-07a                       |

## US-10 Create listing

Source for the pickup location: docs/feedback-changes.md (each listing has its own pickup location that starts at the shop pin and the vendor can move).

| ID         | Type   | Given                                          | When                                                                                                                          | Then                                                                                     | SRS IDs                      |
| ---------- | ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| AT-US10-01 | Normal | An approved vendor is logged in                | They take or choose a photo, enter the number of bags, original value, discounted price and pickup window, and publish        | The listing is saved as Active                                                           | FR-LST-01                    |
| AT-US10-02 | Normal | An approved vendor starts a new listing        | The listing form opens                                                                                                        | The pickup location starts at the shop pin, and the vendor can move it before publishing | FR-LST-01 (feedback-changes) |
| AT-US10-03 | Normal | An approved vendor adds a 5 MB photo           | The photo is uploaded                                                                                                         | The photo sent is 500 KB or less                                                         | NFR-08a                      |
| AT-US10-04 | Error  | An approved vendor fills in a listing          | They enter zero bags, a negative price, or a discounted price higher than the original value, or leave a required field empty | Each invalid field is identified and the listing is not published                        | E-LST-04, IF-UI-06           |
| AT-US10-05 | Error  | An approved vendor has entered listing details | The photo upload fails                                                                                                        | The entered details are kept and the vendor can retry                                    | E-LST-02                     |
| AT-US10-06 | Error  | A vendor whose account is Pending or Rejected  | They try to create or publish a listing                                                                                       | The action is refused                                                                    | E-LST-06, E-ACC-05           |
| AT-US10-07 | Normal | The new listing screens are open               | They are checked in Arabic and English                                                                                        | Arabic is right-to-left, English left-to-right, no clipped or overlapping text           | NFR-06                       |

## US-11 Quick Post

| ID         | Type   | Given                                            | When                                                                                  | Then                                                                           | SRS IDs                      |
| ---------- | ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| AT-US11-01 | Normal | An approved informal vendor is logged in         | They open Quick Post                                                                  | The form asks only for a photo, number of bags, price and pickup end time      | FR-LST-02                    |
| AT-US11-02 | Normal | An approved informal vendor fills in Quick Post  | They publish                                                                          | The listing is published and treated as Highly perishable                      | FR-LST-02, FR-RTE-02         |
| AT-US11-03 | Normal | An approved informal vendor opens Quick Post     | The form opens                                                                        | The pickup location starts at the shop pin and can be moved                    | FR-LST-02 (feedback-changes) |
| AT-US11-04 | Error  | An approved informal vendor fills in Quick Post  | They enter zero bags or a negative price, or leave the photo or pickup end time empty | Each invalid field is identified and the listing is not published              | E-LST-04, IF-UI-06           |
| AT-US11-05 | Error  | An informal vendor whose account is not approved | They try to publish a Quick Post                                                      | The action is refused                                                          | E-LST-06                     |
| AT-US11-06 | Normal | The Quick Post screen is open                    | It is checked in Arabic and English                                                   | Arabic is right-to-left, English left-to-right, no clipped or overlapping text | NFR-06                       |

## US-12 AI draft listing (Sprint 2)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US12-01 | Normal | A formal vendor on Create listing has chosen a photo, AI on (mock) | They tap "Fill in with AI draft" | Name, description (both languages) and category are filled and marked Draft (AI); the quantity shows as an Estimate | FR-LST-03, NFR-05a, D-81, D-82 |
| AT-US12-02 | Normal | The draft is shown, app in Arabic | They look at the form | The main fields hold the Arabic draft, the second fields the English one; layout is right-to-left; no text says the food is safe | FR-LST-03, NFR-05a, NFR-06 |
| AT-US12-03 | Error | The draft is shown | They press Save without confirming; then confirm or edit each field and save | Save is stopped and each unconfirmed field says so; after confirming the listing is saved with both languages | NFR-05b |
| AT-US12-04 | Error | AI off (`AI_VISION_MODE` empty) | They tap "Fill in with AI draft" | "No AI draft this time" is shown; they fill the form by hand and save | E-LST-01, NFR-03 |
| AT-US12-05 | Performance | A real provider (TBD-2) | 20 test photos are drafted | At least 18 return a draft within 10 seconds | NFR-02, BR-12 |
| AT-US12-06 | Accuracy | A real provider (TBD-2) | 60 labelled photos are classified | At least 80% get the correct category | NFR-04 |
| AT-US12-07 | Normal | AI-CONFIDENCE 0.7; a draft with low confidence | The vendor keeps the AI category and saves | The listing is Highly perishable | NFR-05d, D-80 |
| AT-US12-08 | Normal | An informal vendor on Quick Post has chosen a photo, AI on | They tap "Fill in with AI draft", confirm or edit each Draft (AI) field, fill bags, price and pickup end, and post | Name, description (both languages) and category were filled and marked Draft (AI); posting is stopped until every one is confirmed or edited; then the Quick Post is published with both languages | FR-LST-02, FR-LST-03, NFR-05b, D-86 |
| AT-US12-09 | Normal | AI on; a formal vendor on Create listing, or an informal vendor on Quick Post | They choose a photo and save or post without tapping "Fill in with AI draft" | It saves or posts normally, with nothing to confirm | NFR-05b, D-84, D-86 |

## US-13 Preparation/storage/expiry

| ID         | Type   | Given                                              | When                                                                     | Then                                                                           | SRS IDs              |
| ---------- | ------ | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- |
| AT-US13-01 | Normal | An approved vendor creates a full listing          | They enter the preparation time, storage conditions and expiry date      | The values are saved and passed to the perishability estimate                  | FR-LST-04            |
| AT-US13-02 | Normal | An approved vendor does not know a value           | They mark preparation time, storage conditions or expiry date as Unknown | The field is saved as Unknown and the listing can still be published           | FR-LST-04            |
| AT-US13-03 | Normal | An informal vendor uses Quick Post                 | The form opens                                                           | Preparation time, storage conditions and expiry date are not asked for         | FR-LST-04, FR-LST-02 |
| AT-US13-04 | Normal | A vendor gave an expiry date and time              | They set a pickup window that ends exactly at the expiry                 | The pickup window is accepted                                                  | NFR-05c              |
| AT-US13-05 | Error  | A vendor gave an expiry date and time              | They set a pickup window that ends after the expiry                      | The pickup window is rejected and a corrected end time is required             | E-LST-03, NFR-05c    |
| AT-US13-06 | Normal | The preparation, storage and expiry screen is open | It is checked in Arabic and English                                      | Arabic is right-to-left, English left-to-right, no clipped or overlapping text | NFR-06               |

## US-18 Category and urgency

Source for the values: SRS 5.5 BR-01, read from database tables (docs/feedback-changes.md), never hard-coded.

| ID         | Type   | Given                                                                                                                                                       | When                                                         | Then                                                                                                                                        | SRS IDs                      |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AT-US18-01 | Normal | A listing with every fact known has 6 hours or less until its applicable limit                                                                              | The vendor finishes the details                              | The estimated category is Highly perishable                                                                                                 | FR-RTE-01, BR-01             |
| AT-US18-02 | Normal | A listing has more than 6 and up to 48 hours until its limit                                                                                                | The vendor finishes the details                              | The estimated category is Short-life                                                                                                        | FR-RTE-01, BR-01             |
| AT-US18-03 | Normal | A listing has more than 48 hours until its limit                                                                                                            | The vendor finishes the details                              | The estimated category is Long-life                                                                                                         | FR-RTE-01, BR-01             |
| AT-US18-04 | Normal | Five listings, each missing a different input: expiry date missing, preparation time Unknown, storage Unknown, food category unknown, AI estimate uncertain | Each is estimated                                            | Each gets Highly perishable                                                                                                                 | FR-RTE-02, NFR-05d           |
| AT-US18-05 | Normal | A Quick Post listing                                                                                                                                        | It is estimated                                              | It gets Highly perishable                                                                                                                   | FR-RTE-02, FR-LST-02         |
| AT-US18-06 | Normal | A listing was estimated Short-life                                                                                                                          | The vendor changes it to Highly perishable before publishing | Removed by D-72: the vendor no longer changes the category; an earlier pickup end is chosen instead                                         | FR-RTE-03                    |
| AT-US18-07 | Error  | A listing was estimated Short-life                                                                                                                          | The vendor tries to change it to Long-life                   | Removed by D-72: the vendor no longer changes the category                                                                                  | FR-RTE-03                    |
| AT-US18-08 | Error  | The perishability estimate fails                                                                                                                            | The vendor finishes the details                              | Highly perishable is assigned and the vendor can continue                                                                                   | E-RTE-01                     |
| AT-US18-09 | Normal | A published listing                                                                                                                                         | A consumer views it                                          | D-73: only the pickup time (start to end) is shown; the perishability category is not shown to consumers, and nothing says the food is safe | FR-RTE-04, NFR-05a, IF-UI-05 |
| AT-US18-10 | Normal | Every Sprint 1 screen that shows the category or another estimated value                                                                                    | The wording is reviewed in both languages                    | No screen states or implies the food is safe, and estimated values are labelled Estimate or Draft                                           | NFR-05a                      |
| AT-US18-11 | Normal | The perishability screen is open                                                                                                                            | It is checked in Arabic and English                          | Arabic is right-to-left, English left-to-right, no clipped or overlapping text                                                              | NFR-06                       |

## US-19 Destination recommendation

| ID         | Type   | Given                             | When                                   | Then                                                                                                                                                                      | SRS IDs   |
| ---------- | ------ | --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AT-US19-01 | Normal | The vendor confirmed the category | The destination screen opens           | The destinations (consumers, charity, composting, landfill) are ranked by distance, time left, food category and accepted food types, and the top recommendation is shown | FR-RTE-05 |
| AT-US19-02 | Normal | The destination screen is open    | The vendor chooses consumers           | The listing type is Discounted Surplus Bag                                                                                                                                | FR-RTE-06 |
| AT-US19-03 | Normal | The destination screen is open    | The vendor chooses charity             | The listing type is Donation                                                                                                                                              | FR-RTE-06 |
| AT-US19-04 | Normal | The destination screen is open    | The vendor chooses composting          | The listing type is Compost offer                                                                                                                                         | FR-RTE-06 |
| AT-US19-05 | Normal | The vendor is creating a listing  | They mark the food as unfit for people | The food is offered only to composting partners                                                                                                                           | FR-RTE-07 |
| AT-US19-06 | Error  | The routing recommendation fails  | The destination screen opens           | The vendor can choose from the eligible destinations without a recommendation                                                                                             | E-RTE-02  |
| AT-US19-07 | Normal | The destination screen is open    | It is checked in Arabic and English    | Arabic is right-to-left, English left-to-right, no clipped or overlapping text                                                                                            | NFR-06    |

## US-20 Highly perishable first, US-21 Rank by distance and time left (Sprint 2)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US20-01 | Normal | A consumer has a Highly perishable offer 6 km away and two others 1 km and 4 km away | They open the map | The Highly perishable offer is listed first, then the 1 km one, then the 4 km one | FR-RTE-08 |
| AT-US20-02 | Normal | The same offers, with a filter on that all three match | They set the filter | The order is the same: Highly perishable first, then by distance | FR-RTE-08, D-87 |
| AT-US21-01 | Normal | Two offers at the same branch whose pickups end at different times | They open the map | The offer whose pickup ends sooner is listed first (distance first, time left breaks ties, D-87) | FR-RTE-09 |

## US-26 Map search and filters (Sprint 2)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US26-01 | Normal | A consumer on the map | They tap the "10 km" chip and move the slider in the sheet | It stops at 1 km and 50 km, starts at 10 km, the map and the offers follow, and the chip shows the new distance | FR-RES-01, D-88 |
| AT-US26-02 | Normal | Offers priced 30, 40 and 45 EGP are in range | They tap the Price chip, type 40 and tap Apply | Only the 30 and 40 EGP offers are shown; the chip says "Up to 40 EGP"; typing without Apply changes nothing | FR-RES-01, D-87, D-88 |
| AT-US26-03 | Normal | Offers whose pickups start in 10 minutes and in 2 hours | They tap the Pickup time chip, choose a day and a time one hour from now, and tap Apply | Only the offer starting in 10 minutes is shown; the field is not marked red while choosing | FR-RES-01, D-87, D-88 |
| AT-US26-04 | Normal | A price and a pickup time are set | They change the distance, then tap Clear in the Price sheet | The filters stay when the distance changes; Clear removes only the price | FR-RES-01, D-87, D-88 |
| AT-US26-05 | Error | A price or pickup sheet is open | They type 0 as the price, or choose a time that has passed, and tap Apply | The field says so, the sheet stays open and the offers are not reloaded | FR-RES-01, D-87 |
| AT-US26-06 | Normal | No offer matches the filters | They set them | "No offers match your filters within 10 km." and a Clear filters button are shown | FR-RES-01, D-87 |
| AT-US26-07 | Normal | The chips and sheets | They are checked in Arabic and with TalkBack | Arabic is right-to-left; each chip is read with what it sets and its value; the slider, fields and buttons are read with their labels | NFR-06, NFR-07a, D-88 |
| AT-US26-08 | Normal | A consumer opens the map | They look at the screen | One row of chips sits over the map, the pins are visible, and the list starts at about a third of the screen and can be pulled up | FR-RES-01, D-88 |


## US-22 Charity pickup (Sprint 3, D-108 to D-110)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US22-01 | Normal | A vendor publishes a listing with destination Charity; an Approved charity accepts its food type | The charity opens Offers | The Donation is listed with store, address, bags, distance and pickup window | FR-RTE-10 |
| AT-US22-02 | Normal | The charity opens the offer | It chooses a time inside the window and taps Accept | The pickup opens as Scheduled with a 6-digit pickup code | FR-RTE-10, BR-09 |
| AT-US22-03 | Normal | A charity that does not accept the food type, or a composting partner | It opens its home | The Donation is not offered | FR-RTE-10, D-108 |
| AT-US22-04 | Normal | A pickup was accepted | The vendor opens the listing | It shows which charity collects it and when, not the code | D-110 |
| AT-US22-05 | Error | The charity opens the offer | It chooses a time before the start or after the end | The time is refused and the allowed times are shown | E-RTE-03 |
| AT-US22-06 | Error | Charity A accepted the Donation | Charity B tries to accept it | B is told another charity accepted it; it is gone from B's offers | E-RTE-04 |
| AT-US22-07 | Alternative | A pickup is Scheduled | The charity taps Cancel pickup | It shows Cancelled, the code disappears and other charities see the offer again | FR-RTE-10 (Partner cancels) |
| AT-US22-08 | Normal | The pickup time has come | The vendor types the charity's code and confirms | The pickup is Collected for the charity and the listing is closed | FR-RES-10, D-110 |
| AT-US22-09 | Normal | The app is in Arabic | The charity uses Offers and My pickups | All texts are Arabic and the layout is right-to-left | NFR-06 |

## US-24 Compost offers (Sprint 3, D-111)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US24-01 | Normal | A vendor publishes a listing with destination Composting; an Approved composting partner accepts its food type | The partner opens Offers | The Compost offer is listed, marked Compost offer | FR-RTE-12 |
| AT-US24-02 | Normal | The composting partner opens it | It chooses a time in the window and accepts | It gets a pickup code; the vendor completes the pickup with it | FR-RTE-12, FR-RES-10 |
| AT-US24-03 | Error | A charity and an "other" partner | They open their homes | The charity does not see the Compost offer; the other partner has no offers | FR-RTE-12, D-111 |

## US-23 Automatic charity offers (Sprint 3, D-112)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US23-01 | Normal | A vendor | They turn on "Offer unreserved bags to charities" on the home | The switch stays on after reopening the app | FR-RTE-11 |
| AT-US23-02 | Normal | Opted in; a consumer listing with unreserved bags; a charity accepts the food | The BR-10 time before the pickup end comes (60 min) | The charity sees a Donation with those bags; the vendor's listing says they were offered | FR-RTE-11, BR-10 |
| AT-US23-03 | Normal | Not opted in, or no unreserved bags, or no charity accepts the food | The time comes | Nothing is offered; the bags stay for consumers | FR-RTE-11, D-112 |
| AT-US23-04 | Normal | The automatic Donation is offered | A charity accepts and the vendor enters its code | The pickup is completed as in US-22 | FR-RTE-11, FR-RTE-10 |

## US-43 Zakat donation and receipt (Sprint 3, D-113 to D-116)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US43-01 | Normal | A consumer opens an offer; a charity accepts its food type | They tap Donate as Zakat, choose 2 bags and the charity, and pay with card 40000000 | The receipt opens: number ZK-…, vendor, food, 2 bags, amount, charity, date, Paid | FR-TGI-05, FR-TGI-06 |
| AT-US43-02 | Error | No charity accepts the food | The consumer opens Donate as Zakat | They are told no charity can take it and cannot pay | FR-TGI-05 |
| AT-US43-03 | Normal | A Paid Zakat donation | The charity accepts the Donation and the vendor enters its code | The receipt shows Delivered with the time | FR-TGI-06 |
| AT-US43-04 | Normal | A receipt is open | The consumer taps Share as PDF | A PDF of the receipt (right to left in Arabic) opens in the share sheet | FR-TGI-06, NFR-06 |
| AT-US43-05 | Error | The consumer pays with the blocked card 40000002 | They pay | The reason is shown; no receipt; the bags are still on offer | E-TGI-02 |
| AT-US43-06 | Error | A Paid donation the charity does not collect | The pickup window ends | The card gets the full amount back; the receipt shows Refunded | E-TGI-03, BR-11 |

## US-27 Card reservation (Sprint 2, D-99; test cards in docs/test-cards.md)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US27-01 | Normal | An offer at 40 EGP | The customer taps Pay by card, types 40000000, 12/30, 123 and taps Pay 40 EGP | The reservation opens: Confirmed, "Paid by card", the 6-digit code at once; no timer, no "I'm on my way"; bags left down by one | FR-RES-02 |
| AT-US27-02 | Normal | The payment above | The team checks the card balance | 10,000 became 9,960 EGP | FR-RES-02 |
| AT-US27-03 | Error | The card form | The customer types 1234, 13/30, 1 | Each field says what is wrong; nothing is sent | E-RES-01 |
| AT-US27-04 | Error | The card form | The customer pays with 40000002, 40000003, 40000004 (10/26), an unknown number, a wrong CVV, and 40000005 (wait 1 minute) | Each time the reason is shown (declined, not enough money, expired, not found, wrong details, no answer in time) and the bag is still on offer | E-RES-01, IF-SW-03 |
| AT-US27-05 | Normal | A card payment was made | The team looks at the reservations and payments tables | No card number, expiry or CVV is there, only the bank reference and amount | NFR-10, IF-SW-02 |
| AT-US27-06 | Error | One bag left, two phones | Both pay by card at the same moment (40000000 and 40000001) | One gets the reservation; the other sees "the last bag was just reserved" and is not charged | E-RES-02, FR-RES-07 |

## US-28 No-card hold and check-in, US-30 No over-reservation (Sprint 2)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US28-01 | Normal | An offer whose pickup starts in 30 minutes | A customer taps Reserve without a card | The reservation screen says the bag is held until 15 minutes after the pickup start, and the bags left go down by one | FR-RES-03, BR-02 |
| AT-US28-02 | Normal | An offer whose pickup has started | A customer reserves | The hold ends 15 minutes from now | FR-RES-03 |
| AT-US28-03 | Boundary | An offer whose pickup ends in 5 minutes | A customer reserves | The hold ends at the pickup end, not later | FR-RES-03 |
| AT-US28-04 | Normal | A reservation was just made | The customer looks at it | A 6-digit pickup code is shown with "Show this code at the shop when you collect." | FR-RES-10, D-92 |
| AT-US28-05 | Normal | A held reservation | The customer taps "I'm on my way" | The hold end moves 10 minutes later (never past the pickup end), a note says it can be done once, and the button goes away | FR-RES-04, BR-03 |
| AT-US28-06 | Error | A reservation whose hold has ended | The customer opens it, or taps "I'm on my way" on a screen left open | It says the hold ended and the bag went back on sale; no code; check-in is refused | E-RES-05, FR-RES-05 |
| AT-US28-07 | Error | A customer already holds a bag of an offer | They tap Reserve on the same offer again | "You already have a bag of this offer on hold." and no second bag is taken | D-91 |
| AT-US28-08 | Normal | A held reservation and the worker running | The hold end passes without pickup | Within a minute the bag is back on the offer (bags left up by one) | FR-RES-05, SDD 3.2.5.5 |
| AT-US28-09 | Normal | The app is in Arabic | The customer reserves and opens the reservation | Everything is Arabic, right-to-left, the code and times in Arabic-Indic digits | NFR-06 |
| AT-US30-01 | Error | An offer with one bag left, two phones on the offer page | Both tap Reserve at the same moment | One gets the reservation; the other sees "Sorry, the last bag was just reserved by someone else." | FR-RES-07, E-RES-02 |
| AT-US28-10 | Normal | A held reservation | The customer opens it | "Time left to collect" counts down every second from 15:00; under 5 minutes it turns red | FR-RES-03, D-96 |
| AT-US28-11 | Normal | A held reservation | The customer taps "I'm on my way" | The countdown jumps 10 minutes up; the button turns grey and nothing happens when it is tapped again, also after leaving and opening the reservation again | FR-RES-04, E-RES-05, D-96 |
| AT-US28-12 | Normal | An offer with pickup from 18:00 to 20:00 | The customer opens it at 17:00 and taps "Choose your pickup time" | The field shows 18:00 – 18:30; the list shows 18:00 – 18:30, 18:30 – 19:00, 19:00 – 19:30, 19:30 – 20:00; the slot chosen is the one reserved | D-97, D-98 |
| AT-US28-13 | Normal | The same offer at 18:40 | The customer opens it | The first slot is 18:30 – 19:00 (the current one); 18:00 – 18:30 is gone. Choosing 18:30 and reserving: the timer shows about 15 minutes from now | D-97, FR-RES-03 |
| AT-US28-14 | Normal | A reservation for the 19:30 slot, opened at 19:00 | The customer looks at it | "Your pickup time starts at 19:30" with "Starts in 30:00" counting down; no code, no timer, no "I'm on my way". At 19:30 the 15-minute timer, the pickup code and the button appear | D-97, FR-RES-04, FR-RES-10 |

## US-31 My reservations and the profile menu (Sprint 2, D-94, D-95)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US31-01 | Normal | A customer with a held reservation | They tap the person icon, then Active reservations | The reservation is listed with its shop, "On hold" and the countdown; tapping it opens it with the pickup code | FR-RES-08, D-94 |
| AT-US31-02 | Normal | A customer whose hold ended | They open Past reservations | It is listed as "Hold ended", without a countdown | FR-RES-08 |
| AT-US31-03 | Normal | A customer with no reservations | They open Active reservations | "You have no active reservations." | FR-RES-08 |
| AT-PROFILE-01 | Normal | A logged-in customer | They open Edit profile, type the current password and a new one that follows the rules, and save | "Your password was changed."; the next log in works only with the new password | FR-ACC-06, D-95 |
| AT-PROFILE-02 | Error | Edit profile | They type a wrong current password, or a new one without a digit | The message is shown next to that field and nothing changes | E-ACC-03, E-ACC-02 |
| AT-PROFILE-03 | Normal | The app is in Arabic | They open the menu and Edit profile | Arabic, right-to-left; the language switch and Log out work | NFR-06, FR-ACC-04, FR-ACC-09 |

## US-32 Vendor reservations, US-33 Pickup code (Sprint 2, D-101)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US32-01 | Normal | A published listing of 3 bags, two customers reserved (one no-card, one card) | The vendor opens My listings | The card says "2 of 3 bags reserved · 0 collected" | FR-RES-09 |
| AT-US32-02 | Normal | The same | The vendor opens the listing | Reservations: "2 reserved · 0 collected · 1 left"; To collect: Reservation #1 (No card · On hold, Slot starts / Hold until ...), Reservation #2 (Card · Confirmed, Any time in the pickup window); no names, phones or codes | FR-RES-09, D-101 |
| AT-US32-03 | Normal | The no-card customer taps "I'm on my way" | The vendor waits up to a minute or taps Refresh | Reservation #1 shows "Hold until ... · On the way" | FR-RES-09 |
| AT-US32-04 | Normal | A no-card hold ends without pickup | The vendor looks at the listing | Reservation #1 moves to Finished as "Hold ended"; one more bag is left | FR-RES-09, FR-RES-05 |
| AT-US32-05 | Normal | A listing of 2 bags; both reserved and both handed over | The vendor opens My listings | Without leaving the app, the vendor goes back to My listings: the listing is in Past as "All collected" with "2 of 2 bags reserved · 2 collected" | FR-RES-09, D-102, D-103 |
| AT-US32-06 | Normal | A paid card bag nobody collects | The pickup end passes | The listing moves to Past as "Ended" with "1 of N bags taken · 0 collected · 1 not collected"; in its Reservations it is under Finished as "Card · Not collected"; the customer sees it in Past reservations as "Not collected", without a code | D-102 |
| AT-US15-D102-01 | Normal | A vendor with an active listing, a draft and an ended listing | They open My listings | Tabs "Active · 1", "Drafts · 1", "Past · 1"; Active is open and shows only the active listing | FR-LST-06, D-102 |
| AT-US15-D102-02 | Normal | The same | They open Past | The ended listing shows "Ended" (not "Active: published"); a draft whose pickup time passed shows "Draft · not published" | D-102 |
| AT-US15-D102-03 | Normal | An active listing | Its pickup end passes and the vendor reopens My listings | It has moved from Active to Past as Ended; customers no longer see it on the map | D-102 |
| AT-US33-01 | Normal | A card reservation during the pickup window | The vendor types the customer's code and taps Check code | "Hand over this bag? Reservation #2 · Card" with Hand over and Cancel; nothing changes yet | FR-RES-10 |
| AT-US33-02 | Normal | The confirmation above | The vendor taps Hand over | "Reservation #2 was handed over."; it moves to Finished as Collected; the customer's reservation shows Collected in Past reservations | FR-RES-10 |
| AT-US33-03 | Error | The same code again, or a wrong code, or a code of another listing | The vendor taps Check code | "This code was already used." / "This code does not match any reservation of this listing." | E-RES-03 |
| AT-US33-04 | Error | A card reservation before the pickup starts, or a no-card one before its slot | The vendor types its code | "Pickup for this reservation starts at 18:00." | E-RES-03, D-101 |
| AT-US33-05 | Normal | The app is in Arabic | The vendor opens the listing and checks a code | Arabic, right-to-left; "الحجز رقم ١"; Arabic digits can be typed | NFR-06 |

## US-35 No-show warning and block (asked for by Maryam, 2026-11-14; BR-07, FR-RES-13)

| ID | Type | Given | When | Then | Requirements |
| -- | ---- | ----- | ---- | ---- | ------------ |
| AT-US35-01 | Normal | A customer has no missed pickups in the last 30 days | Their no-card hold expires without a pickup | They see a notice that the bag went to someone else, with "1 of 3 in 30 days" | BR-07, FR-RES-13 |
| AT-US35-02 | Normal | A customer has 1 missed pickup in the last 30 days | Another no-card hold expires | They see the warning that one more missed pickup in 30 days stops no-card reserving for 14 days, as a notification and on the Reserve screen | BR-07, FR-RES-13 |
| AT-US35-03 | Boundary | A customer missed a pickup 31 days ago and one yesterday | They open the Reserve screen | Only the notice shows (1 counted), not the warning | BR-07 |
| AT-US35-04 | Normal | A customer missed 2 pickups, then collected one, then missed another, all within 30 days | The third hold expires | No-card reserving is blocked (a pickup in between does not reset the count) | BR-07, FR-RES-13 |
| AT-US35-05 | Normal | The admin changes BR-07 to 4 no-shows | A customer has 3 in 30 days | The warning shows at 3, not 2, without a code change | BR-07 |
| AT-US35-06 | Normal | The app is in Arabic | A customer gets the notice, warning or block | The text is Arabic, right-to-left, with Arabic-Indic digits | NFR-06 |

## All stories: regression in CI

| ID        | Type   | Given                            | When                | Then                                                                                                                                   | SRS IDs |
| --------- | ------ | -------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AT-ALL-01 | Normal | A pull request to main is opened | GitHub Actions runs | Migrations, lint, typecheck, build and every automated test run, and a failing test blocks the merge; one approving review is required | NFR-13  |
