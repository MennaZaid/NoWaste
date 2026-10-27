// C-27 Data Access: vendor and partner applications (SDD 4.2 "VendorProfile" and "PartnerProfile").
// The user and the profile are written in one transaction, so a failed profile leaves no user behind.
import type { PoolClient } from 'pg';
import type { FoodCategory, PartnerRole, VendorType } from '@nowaste/shared';
import { withTransaction } from './db.js';
import { insertUser, type NewUser, type UserRecord } from './userRepository.js';

export interface MapPin {
  address: string;
  latitude: number;
  longitude: number;
}

export interface NewVendorProfile extends MapPin {
  shopName: string;
  vendorType: VendorType;
  contact: string;
  description?: string | null;
}

export interface NewPartnerProfile extends MapPin {
  organisationName: string;
  partnerType: PartnerRole;
  acceptedFoodTypes: FoodCategory[];
  otherPartnerType?: string | null;
  otherFoodType?: string | null;
}

// ST_MakePoint takes longitude first.
const point = (lon: string, lat: string) => `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

async function insertVendorProfile(client: PoolClient, userId: string, p: NewVendorProfile): Promise<void> {
  await client.query(
    `INSERT INTO vendor_profiles (user_id, shop_name, vendor_type, address, location, contact, description)
     VALUES ($1, $2, $3, $4, ${point('$5', '$6')}, $7, $8)`,
    [userId, p.shopName, p.vendorType, p.address, p.longitude, p.latitude, p.contact, p.description ?? null],
  );
}

async function insertPartnerProfile(client: PoolClient, userId: string, p: NewPartnerProfile): Promise<void> {
  await client.query(
    `INSERT INTO partner_profiles (user_id, organisation_name, partner_type, accepted_food_types, address, location,
                                   other_partner_type, other_food_type)
     VALUES ($1, $2, $3, $4::food_category[], $5, ${point('$6', '$7')}, $8, $9)`,
    [
      userId,
      p.organisationName,
      p.partnerType,
      p.acceptedFoodTypes,
      p.address,
      p.longitude,
      p.latitude,
      p.otherPartnerType ?? null,
      p.otherFoodType ?? null,
    ],
  );
}

/** Throws DuplicateUserError (from insertUser) when the email or phone is taken. */
export function insertVendorApplication(user: NewUser, profile: NewVendorProfile): Promise<UserRecord> {
  return withTransaction(async (client) => {
    const created = await insertUser(user, client);
    await insertVendorProfile(client, created.id, profile);
    return created;
  });
}

/** Throws DuplicateUserError (from insertUser) when the email or phone is taken. */
export function insertPartnerApplication(user: NewUser, profile: NewPartnerProfile): Promise<UserRecord> {
  return withTransaction(async (client) => {
    const created = await insertUser(user, client);
    await insertPartnerProfile(client, created.id, profile);
    return created;
  });
}
