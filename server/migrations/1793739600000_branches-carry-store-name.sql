-- Up Migration

-- Decision D-69 (2026-11-04): a branch has no name of its own; every branch carries its store's name and is told
-- apart by its address. Branches added earlier with their own name are renamed to the store name.
UPDATE vendor_branches b
SET name = v.shop_name
FROM vendor_profiles v
WHERE v.user_id = b.vendor_id AND b.name <> v.shop_name;

-- Down Migration

-- The earlier branch names are not kept, so nothing is undone.
SELECT 1;
