# NFR-06 checklist (manual check on the phone)

NFR-06: every screen displays correctly right-to-left in Arabic and left-to-right in English, with no clipped or
overlapping text. Verification (SRS 5.4): a screen-by-screen checklist in both languages on one phone.

How to check: open the app in Expo Go, look at each screen in English, switch to العربية with the language switch
(on the Welcome screen or in the header), and look again. Write ✓ or ✗ and the tester's name and phone model.

Tester: Maryam Phone and OS version: device name "elinx9" (as reported), Android 16, Expo Go Date: 2026-10-24

**Status: the three screens (Welcome, Register, Account created) passed in English and Arabic (N-1). The other
rows are screen states that were not recorded separately and are Not Tested.** Each ✓ names its source in
docs/milestone-2-test-report.md (M- and N- results). "Not Tested" means there is no recorded result for that cell.
Tested on Android only; iOS is Not Tested (N-10).

| Screen                                                 | English OK             | Arabic RTL OK          | No clipped text                                  |
| ------------------------------------------------------ | ---------------------- | ---------------------- | ------------------------------------------------ |
| Welcome                                                | ✓ (N-1; also M-1, M-2) | ✓ (N-1; also M-2)      | ✓ (N-1)                                          |
| Welcome, after pressing Log in (note shown)            | Not Tested             | Not Tested             | Not Tested                                       |
| Register, Email selected                               | ✓ (N-1; also M-2, M-3) | ✓ (N-1; also M-2)      | ✓ (N-1; password rules: English M-6, Arabic N-2) |
| Register, Mobile number selected                       | Not Tested             | Not Tested             | Not Tested                                       |
| Register, password shown (Show/Hide pressed)           | Not Tested             | Not Tested             | Not Tested                                       |
| Register, invalid fields marked (E-ACC-02)             | Not Tested             | Not Tested             | Not Tested                                       |
| Register, already registered notice (E-ACC-01)         | Not Tested             | Not Tested             | Not Tested                                       |
| Register, server not reachable notice                  | Not Tested             | Not Tested             | Not Tested                                       |
| Account created (success)                              | ✓ (N-1)                | ✓ (N-1)                | ✓ (N-1)                                          |
| Header language switch on Register and Account created | ✓ (N-1; Register: M-2) | ✓ (N-1; Register: M-2) | ✓ (N-1)                                          |

### Turn 2 screens (US-02, US-03), added 2026-10-26

Not Tested yet. Record each result in docs/test-execution.md with the date, tester and phone, then fill in the cell.

| Screen                                                                                       | English OK | Arabic RTL OK | No clipped text |
| -------------------------------------------------------------------------------------------- | ---------- | ------------- | --------------- |
| Welcome, role selection (Consumer, Vendor, Partner, Administrator), then Register and Log in | Not Tested | Not Tested    | Not Tested      |
| Welcome, Administrator chosen: admin note and Log in only                                    | Not Tested | Not Tested    | Not Tested      |
| Register, Partner: Charity partner / Composting partner choice                               | Not Tested | Not Tested    | Not Tested      |
| Register, Vendor: shop name, Formal / Informal, contact, description                         | Not Tested | Not Tested    | Not Tested      |
| Register, Vendor or partner: location step with map, pin line, address                       | Not Tested | Not Tested    | Not Tested      |
| Register, location permission denied notice                                                  | Not Tested | Not Tested    | Not Tested      |
| Register, Charity or Composting: organisation name and six food types                        | Not Tested | Not Tested    | Not Tested      |
| Register, application with invalid fields marked (E-ACC-02)                                  | Not Tested | Not Tested    | Not Tested      |
| Application sent (Pending)                                                                   | Not Tested | Not Tested    | Not Tested      |

For the Turn 2 rows, "Arabic RTL OK" also means: the radio and check marks sit on the right of each option, the
pin line and the address field read right-to-left, and the map itself is not mirrored (north stays up).

Notes on the evidence:

- N-1 (2026-10-24): Welcome, Register and Account created were checked in English and Arabic. No visible clipping
  and no RTL issues were observed. N-11: the Arabic text on these three screens was proofread and passed.
- M-1, M-2 and M-3 (first phone session, 2026-10-24) reported the Welcome and Register screens and the language
  switching as passed.
- M-6: the English password rule labels were cut off in the first test and showed in full in the retest after the
  fix. N-2: the Arabic password rule labels were fully visible after the fix.
- M-7, M-8, N-3, N-4 and N-5 confirm that the Log in note, the already-registered notice (mobile number and email),
  the Reset password message and the server connection error appear and work. Their layout in each language was
  not recorded, so those rows stay Not Tested.
- N-6: successful registration, the Account created screen and Back to start worked in English and Arabic.

What "Arabic RTL OK" means:

- Text starts on the right and the layout is mirrored: the language switch sits at the top left of the Welcome
  screen, the back arrow on the Register screen points right and sits on the right, the Show/Hide control is on the
  left end of the password field, and the error mark is on the right of each error message.
- Switching the language does not move the user to another screen and does not clear what was typed.
