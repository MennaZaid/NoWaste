// US-45 Ramadan mode (FR-TGI-08, decision D-107). The administrator sets today's iftar and suhoor times; the app asks
// for the next iftar and suhoor moments and highlights listings whose pickup window comes before them (shared
// ramadanHighlight). All values live in the settings row FR-TGI-08, never in code.
import { validateRamadanTimes, type RamadanTimes } from '@nowaste/shared';
import { getSetting, setSettingValue } from '../../data/settingsRepository.js';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { nextOccurrence } from '../../domain/ramadan.js';

const KEY = 'FR-TGI-08';

interface RamadanRow {
  iftar: string | null;
  suhoor: string | null;
  lead_minutes: number;
  time_zone: string;
}

async function readRow(): Promise<RamadanRow> {
  const value = (await getSetting(KEY))?.value as Partial<RamadanRow> | null | undefined;
  if (
    value === null ||
    value === undefined ||
    typeof value.lead_minutes !== 'number' ||
    !(value.lead_minutes > 0) ||
    typeof value.time_zone !== 'string'
  ) {
    throw new Error('Settings row FR-TGI-08 is missing or invalid');
  }
  return {
    iftar: typeof value.iftar === 'string' ? value.iftar : null,
    suhoor: typeof value.suhoor === 'string' ? value.suhoor : null,
    lead_minutes: value.lead_minutes,
    time_zone: value.time_zone,
  };
}

export type RamadanView =
  | { set: false; leadMinutes: number }
  | {
      set: true;
      iftar: string;
      suhoor: string;
      leadMinutes: number;
      /** The next iftar and suhoor after now, as ISO times. */
      iftarAt: string;
      suhoorAt: string;
    };

function toView(row: RamadanRow): RamadanView {
  if (row.iftar === null || row.suhoor === null) return { set: false, leadMinutes: row.lead_minutes };
  const now = clock.now();
  return {
    set: true,
    iftar: row.iftar,
    suhoor: row.suhoor,
    leadMinutes: row.lead_minutes,
    iftarAt: nextOccurrence(now, row.iftar, row.time_zone).toISOString(),
    suhoorAt: nextOccurrence(now, row.suhoor, row.time_zone).toISOString(),
  };
}

/** GET /ramadan. */
export async function getRamadan(): Promise<RamadanView> {
  return toView(await readRow());
}

/** PATCH /admin/ramadan {iftar, suhoor}: 400 invalid_input naming the bad fields. */
export async function setRamadanTimes(input: unknown): Promise<RamadanView> {
  const check = validateRamadanTimes(input);
  if (!check.ok) throw new SrsError(400, { error: 'invalid_input', fields: check.fields });
  const row = await readRow();
  const times: RamadanTimes = check.value;
  await setSettingValue(KEY, { ...row, iftar: times.iftar, suhoor: times.suhoor });
  return toView({ ...row, ...times });
}
