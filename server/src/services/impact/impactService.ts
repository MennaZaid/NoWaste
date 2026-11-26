// C-16 Impact Service (SDD 3.2.1, IImpact; US-44, FR-TGI-07, decision D-118): meals rescued, money saved, estimated
// CO2 avoided, bags composted and bags sent to landfill, platform-wide and for the user's own account. The CO2 factor
// is the settings row FR-TGI-07, never a constant in code.
import { countImpact, type ImpactCounts, type ImpactScope } from '../../data/impactRepository.js';
import { getSetting } from '../../data/settingsRepository.js';
import { roleGroupOf } from '../../domain/roles.js';
import type { Role } from '../../data/userRepository.js';

export interface Impact {
  mealsRescued: number;
  moneySaved: number;
  /** An estimate (NFR-05a): meals × the kg per bag in settings. */
  co2AvoidedKg: number;
  bagsComposted: number;
  bagsLandfill: number;
}

export interface ImpactView {
  platform: Impact;
  mine: Impact;
  co2KgPerBag: number;
}

const ZERO: ImpactCounts = { meals: 0, moneySaved: 0, bagsComposted: 0, bagsLandfill: 0 };

async function co2KgPerBag(): Promise<number> {
  const value = ((await getSetting('FR-TGI-07'))?.value as { co2_kg_per_bag?: unknown } | null | undefined)
    ?.co2_kg_per_bag;
  if (typeof value !== 'number' || value < 0) throw new Error('Settings row FR-TGI-07 is missing or invalid');
  return value;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function toImpact(counts: ImpactCounts, factor: number): Impact {
  return {
    mealsRescued: counts.meals,
    moneySaved: round(counts.moneySaved, 2),
    co2AvoidedKg: round(counts.meals * factor, 1),
    bagsComposted: counts.bagsComposted,
    bagsLandfill: counts.bagsLandfill,
  };
}

/** The user's own scope: an administrator has none (D-118). */
function scopeOf(user: { id: string; role: Role }): ImpactScope | null {
  const group = roleGroupOf(user.role);
  return group === 'admin' ? null : { kind: group, userId: user.id };
}

/** GET /impact. */
export async function getImpact(user: { id: string; role: Role }): Promise<ImpactView> {
  const scope = scopeOf(user);
  const [factor, platform, mine] = await Promise.all([
    co2KgPerBag(),
    countImpact({ kind: 'platform' }),
    scope === null ? Promise.resolve(ZERO) : countImpact(scope),
  ]);
  return { platform: toImpact(platform, factor), mine: toImpact(mine, factor), co2KgPerBag: factor };
}
