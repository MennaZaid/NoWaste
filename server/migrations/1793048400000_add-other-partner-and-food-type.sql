-- Up Migration

-- Decision D-31: a partner can be of type Other (role other) and can accept an Other food type; in both cases the
-- partner writes what it is. The six food categories (SRS Appendix A) stay unchanged, so Other food is written text
-- beside them. The length limit is checked by @nowaste/shared (validateSignUp); the columns only refuse empty text.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('consumer', 'vendor', 'charity', 'composting', 'other', 'admin'));

ALTER TABLE partner_profiles DROP CONSTRAINT partner_profiles_partner_type_check;
ALTER TABLE partner_profiles DROP CONSTRAINT partner_profiles_accepted_food_types_check;
ALTER TABLE partner_profiles
  ADD COLUMN other_partner_type TEXT NULL CHECK (other_partner_type IS NULL OR btrim(other_partner_type) <> ''),
  ADD COLUMN other_food_type TEXT NULL CHECK (other_food_type IS NULL OR btrim(other_food_type) <> ''),
  ADD CONSTRAINT partner_profiles_partner_type_check
    CHECK (partner_type IN ('charity', 'composting', 'other')),
  -- Only an Other partner has a written type.
  ADD CONSTRAINT partner_profiles_other_type_needs_other_role
    CHECK ((partner_type = 'other') = (other_partner_type IS NOT NULL)),
  -- One or more food types: a category or the written Other food type.
  ADD CONSTRAINT partner_profiles_accepted_food_types_check
    CHECK (cardinality(accepted_food_types) >= 1 OR other_food_type IS NOT NULL);

-- Down Migration

ALTER TABLE partner_profiles DROP CONSTRAINT partner_profiles_accepted_food_types_check;
ALTER TABLE partner_profiles DROP CONSTRAINT partner_profiles_other_type_needs_other_role;
ALTER TABLE partner_profiles DROP CONSTRAINT partner_profiles_partner_type_check;
ALTER TABLE partner_profiles DROP COLUMN other_food_type, DROP COLUMN other_partner_type;
ALTER TABLE partner_profiles
  ADD CONSTRAINT partner_profiles_partner_type_check CHECK (partner_type IN ('charity', 'composting')),
  ADD CONSTRAINT partner_profiles_accepted_food_types_check CHECK (cardinality(accepted_food_types) >= 1);
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('consumer', 'vendor', 'charity', 'composting', 'admin'));
