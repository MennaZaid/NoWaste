// C-27 Data Access: vendor and partner applications (SDD 4.2 "VendorProfile" and "PartnerProfile").
// The user and the profile are written in one transaction, so a failed profile leaves no user behind.
import type { PoolClient } from 'pg';
import type { FoodCategory, PartnerRole, VendorType } from '@nowaste/shared';
import { getPool } from './db.js';
import { withTransaction } from './db.js';
import {
  insertUser,
  type AccountStatus,
  type NewUser,
  type Role,
  type UserRecord,
} from './userRepository.js';

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

export interface ApplicationRecord {
  userId: string;
  role: Role;
  status: AccountStatus;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  vendorProfile: (NewVendorProfile & { description: string | null }) | null;
  partnerProfile:
    | (Omit<NewPartnerProfile, 'partnerType'> & {
        otherPartnerType: string | null;
        otherFoodType: string | null;
      })
    | null;
}

/** Vendor and partner applications in one status, oldest first (US-07), with the pin taken apart by PostGIS. */
export async function listApplications(status: AccountStatus): Promise<ApplicationRecord[]> {
  const result = await getPool().query<ApplicationRecord>(
    `SELECT u.id AS "userId", u.role, u.status, u.email, u.phone, u.created_at AS "createdAt",
       CASE WHEN v.user_id IS NULL THEN NULL ELSE json_build_object(
         'shopName', v.shop_name, 'vendorType', v.vendor_type, 'contact', v.contact, 'description', v.description,
         'address', v.address,
         'latitude', ST_Y(v.location::geometry), 'longitude', ST_X(v.location::geometry)) END AS "vendorProfile",
       CASE WHEN p.user_id IS NULL THEN NULL ELSE json_build_object(
         'organisationName', p.organisation_name, 'otherPartnerType', p.other_partner_type,
         'acceptedFoodTypes', p.accepted_food_types::text[], 'otherFoodType', p.other_food_type,
         'address', p.address,
         'latitude', ST_Y(p.location::geometry), 'longitude', ST_X(p.location::geometry)) END AS "partnerProfile"
     FROM users u
     LEFT JOIN vendor_profiles v ON v.user_id = u.id
     LEFT JOIN partner_profiles p ON p.user_id = u.id
     WHERE u.status = $1 AND u.role IN ('vendor', 'charity', 'composting', 'other')
     ORDER BY u.created_at, u.id`,
    [status],
  );
  return result.rows;
}
