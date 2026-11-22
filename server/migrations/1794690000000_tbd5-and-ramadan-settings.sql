-- Up Migration

-- SCRUM-73, decision D-106 (Marina, 2026-11-21): TBD-5 is 60 minutes. For vendors who opt in (FR-RTE-11, US-23),
-- unreserved bags are offered as a Donation to charity partners 60 minutes before the pickup window ends. BR-10 is the
-- row the code reads; the TBD-5 row keeps the same value and now says it is decided (open question 9).
UPDATE settings
   SET value = '{"minutes_before_window_end": 60}',
       description = 'Automatic charity offer: 60 minutes before window end (TBD-5 decided, D-106)',
       source = 'SRS 5.5 BR-10; FR-RTE-11; TBD-5; D-106'
 WHERE key = 'BR-10';

UPDATE settings
   SET value = '{"minutes_before_window_end": 60}',
       description = 'Decided on 2026-11-21 (D-106): 60 minutes. The code reads BR-10.',
       source = 'SRS Appendix C TBD-5; FR-RTE-11, 4.3.2, BR-10; D-106'
 WHERE key = 'TBD-5';

-- SCRUM-54 / US-45, decision D-107 (Marina, 2026-11-21): Ramadan mode (FR-TGI-08). The administrator sets today's
-- iftar and suhoor times ("HH:MM", Cairo time) in the app; both start empty, so Ramadan mode says the times are not
-- set yet. A listing is highlighted when its pickup window overlaps the lead_minutes before the next iftar or suhoor.
-- lead_minutes (120) needs team approval (open question 67).
INSERT INTO settings (key, value, description, source) VALUES
  ('FR-TGI-08',
   '{"iftar": null, "suhoor": null, "lead_minutes": 120, "time_zone": "Africa/Cairo"}',
   'Ramadan mode: iftar and suhoor times set by the administrator; listings whose pickup window overlaps the lead_minutes before iftar or suhoor are highlighted (D-107)',
   'SRS FR-TGI-08; US-45');

-- Down Migration

DELETE FROM settings WHERE key = 'FR-TGI-08';

UPDATE settings
   SET value = NULL,
       description = 'How many minutes before the pickup window ends the automatic charity offer is made. Not yet decided (SRS Appendix C).',
       source = 'SRS Appendix C TBD-5; FR-RTE-11, 4.3.2, BR-10'
 WHERE key = 'TBD-5';

UPDATE settings
   SET value = '{"minutes_before_window_end": null}',
       description = 'Automatic charity offer: (TBD-5) minutes before window end. The value is open until TBD-5 is decided.',
       source = 'SRS 5.5 BR-10; FR-RTE-11; TBD-5'
 WHERE key = 'BR-10';
