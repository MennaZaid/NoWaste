// C-27 Data Access: the counts behind the impact numbers (US-44, FR-TGI-07, SDD C-16, decision D-118).
// One collected bag is one meal: a Completed reservation (one bag each), a Donation a charity collected (all its
// bags; Zakat bags arrive this way too) and, for the consumer who paid, their delivered Zakat bags. Money saved is
// the original value minus the price paid, for listings that have an original value (SRS glossary). Compost and
// landfill bags are counted apart.
import { getPool } from './db.js';

export type ImpactScope =
  | { kind: 'platform' }
  | { kind: 'consumer'; userId: string }
  | { kind: 'vendor'; userId: string }
  | { kind: 'partner'; userId: string };

export interface ImpactCounts {
  meals: number;
  moneySaved: number;
  bagsComposted: number;
  bagsLandfill: number;
}

// $1 = the scope kind, $2 = the user (NULL for the platform). Each part says which scopes it counts for.
const SQL = `
WITH
reserved AS (
  SELECT count(*)::int AS meals,
         COALESCE(sum(l.original_value - r.price_paid) FILTER (
           WHERE l.original_value IS NOT NULL AND r.price_paid IS NOT NULL), 0)::float8 AS money
  FROM reservations r JOIN listings l ON l.id = r.listing_id
  WHERE r.status = 'Completed'
    AND ($1 = 'platform' OR ($1 = 'consumer' AND r.consumer_id = $2) OR ($1 = 'vendor' AND l.vendor_id = $2))
),
collected AS (
  SELECT COALESCE(sum(l.bags_total) FILTER (WHERE l.listing_type = 'Donation'), 0)::int AS meals,
         COALESCE(sum(l.bags_total) FILTER (WHERE l.listing_type = 'Compost offer'), 0)::int AS composted
  FROM partner_offers o JOIN listings l ON l.id = o.listing_id
  WHERE o.status = 'Completed'
    AND ($1 = 'platform' OR ($1 = 'vendor' AND l.vendor_id = $2) OR ($1 = 'partner' AND o.partner_id = $2))
),
zakat AS (
  SELECT COALESCE(sum(z.bags) FILTER (WHERE $1 = 'consumer'), 0)::int AS meals,
         COALESCE(sum(l.original_value * z.bags - z.amount) FILTER (WHERE l.original_value IS NOT NULL), 0)::float8
           AS money
  FROM zakat_donations z JOIN listings l ON l.id = z.listing_id
  WHERE z.status = 'Delivered'
    AND ($1 = 'platform' OR ($1 = 'consumer' AND z.consumer_id = $2) OR ($1 = 'vendor' AND l.vendor_id = $2))
),
landfill AS (
  SELECT COALESCE(sum(f.bags), 0)::int AS bags
  FROM landfill_records f JOIN listings l ON l.id = f.listing_id
  WHERE $1 = 'platform' OR ($1 = 'vendor' AND l.vendor_id = $2)
)
SELECT reserved.meals + collected.meals + zakat.meals AS meals,
       reserved.money + zakat.money AS "moneySaved",
       collected.composted AS "bagsComposted",
       landfill.bags AS "bagsLandfill"
FROM reserved, collected, zakat, landfill`;

export async function countImpact(scope: ImpactScope): Promise<ImpactCounts> {
  const userId = scope.kind === 'platform' ? null : scope.userId;
  const result = await getPool().query<ImpactCounts>(SQL, [scope.kind, userId]);
  const row = result.rows[0];
  if (row === undefined) throw new Error('Impact query returned no row');
  return row;
}
