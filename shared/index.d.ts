// Types for shared/index.js. Keep both files in step.

export type Language = 'ar' | 'en';
export type RegistrationField = 'email' | 'phone' | 'password' | 'language';

export declare const PASSWORD_RULES: Readonly<{ minLength: number }>;
export declare const LANGUAGES: readonly Language[];

export interface PasswordRuleResult {
  minLength: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
}

export declare function checkPasswordRules(password: unknown): PasswordRuleResult;
export declare function isValidPassword(password: unknown): boolean;
export declare function isValidEmail(email: unknown): boolean;
export declare function normalizeEgyptianMobile(phone: unknown): string | null;
/** Egyptian mobile (D-12) or landline (D-26) number in +20 form, or null. */
export declare function normalizeEgyptianPhone(phone: unknown): string | null;

export interface RegistrationInput {
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  language?: unknown;
}

export interface ValidRegistration {
  email: string | null;
  phone: string | null;
  password: string;
  language: Language;
}

export type RegistrationValidation =
  { ok: true; value: ValidRegistration } | { ok: false; fields: RegistrationField[] };

export declare function validateRegistration(input: RegistrationInput): RegistrationValidation;

export type SignUpRole = 'consumer' | 'vendor' | 'charity' | 'composting' | 'other';
export type PartnerRole = 'charity' | 'composting' | 'other';
export type VendorType = 'formal' | 'informal';
export type FoodCategory =
  | 'bread_and_baked_goods'
  | 'cooked_meals'
  | 'fruit_and_vegetables'
  | 'dairy_and_eggs'
  | 'meat_poultry_and_fish'
  | 'packaged_and_dry_food';

export declare const SIGN_UP_ROLES: readonly SignUpRole[];
export declare const PARTNER_ROLES: readonly PartnerRole[];
export declare const VENDOR_TYPES: readonly VendorType[];
export declare const FOOD_CATEGORIES: readonly FoodCategory[];
/** A food type a partner accepts: one of the six categories, or Other with a written food type (D-31). */
export type AcceptedFoodType = FoodCategory | 'other';
export declare const OTHER_FOOD_TYPE: 'other';
export declare const ACCEPTED_FOOD_TYPES: readonly AcceptedFoodType[];
export declare const TEXT_LIMITS: Readonly<{ name: number; address: number; description: number }>;

export type ProfileField =
  | 'role'
  | 'shopName'
  | 'vendorType'
  | 'organisationName'
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'contact'
  | 'acceptedFoodTypes'
  | 'otherPartnerType'
  | 'otherFoodType'
  | 'description';
export type SignUpField = RegistrationField | ProfileField;

export interface SignUpInput extends RegistrationInput {
  role?: unknown;
  vendorProfile?: unknown;
  partnerProfile?: unknown;
}

export interface VendorProfile {
  shopName: string;
  vendorType: VendorType;
  address: string;
  latitude: number;
  longitude: number;
  /** Egyptian mobile or landline; returned by validateSignUp in +20 form. */
  contact: string;
  /** Optional; validateSignUp returns null when it is missing or blank. */
  description?: string | null;
}

export interface PartnerProfile {
  organisationName: string;
  address: string;
  latitude: number;
  longitude: number;
  /** The six categories, plus 'other' when the partner writes an Other food type (D-31). */
  acceptedFoodTypes: AcceptedFoodType[];
  /** Required when the role is other; validateSignUp returns null for other roles. */
  otherPartnerType?: string | null;
  /** Required when 'other' is among the sent food types; validateSignUp returns null otherwise. */
  otherFoodType?: string | null;
}

/** A partner profile as validateSignUp returns it: categories only, Other food as written text. */
export interface ValidPartnerProfile extends Omit<PartnerProfile, 'acceptedFoodTypes'> {
  acceptedFoodTypes: FoodCategory[];
  otherPartnerType: string | null;
  otherFoodType: string | null;
}

export interface ValidSignUp extends ValidRegistration {
  role: SignUpRole;
  vendorProfile: VendorProfile | null;
  partnerProfile: ValidPartnerProfile | null;
}

export type SignUpValidation = { ok: true; value: ValidSignUp } | { ok: false; fields: SignUpField[] };

export declare function validateSignUp(input: SignUpInput): SignUpValidation;

/** FR-ACC-04: an email address or an Egyptian mobile number (returned in +20 form), or null. */
export declare function parseLoginIdentifier(value: unknown): { email: string } | { phone: string } | null;

// Listings (US-10, US-11, US-13).
export declare const PHOTO_MAX_BYTES: number;
export declare const UNKNOWN: 'unknown';
export type Unknown = 'unknown';
export type StorageCondition = 'room_temperature' | 'chilled' | 'frozen' | Unknown;
export type ListingFoodCategory = FoodCategory | Unknown;
export declare const STORAGE_CONDITIONS: readonly StorageCondition[];
export declare const LISTING_FOOD_CATEGORIES: readonly ListingFoodCategory[];

export type ListingField =
  | 'photoKey'
  | 'foodType'
  | 'foodCategory'
  | 'descriptionAr'
  | 'descriptionEn'
  | 'bagsTotal'
  | 'originalValue'
  | 'price'
  | 'pickupStart'
  | 'pickupEnd'
  | 'prepTime'
  | 'storage'
  | 'expiryAt'
  | 'location';

export interface ListingInput {
  photoKey?: unknown;
  foodType?: unknown;
  foodCategory?: unknown;
  descriptionAr?: unknown;
  descriptionEn?: unknown;
  bagsTotal?: unknown;
  originalValue?: unknown;
  price?: unknown;
  pickupStart?: unknown;
  pickupEnd?: unknown;
  prepTime?: unknown;
  storage?: unknown;
  expiryAt?: unknown;
  location?: unknown;
}

export interface ValidListing {
  photoKey: string;
  foodType: string;
  foodCategory: ListingFoodCategory;
  descriptionAr: string;
  descriptionEn: string;
  bagsTotal: number;
  originalValue: number;
  price: number;
  pickupStart: string;
  pickupEnd: string;
  /** null = Unknown. */
  prepTime: string | null;
  storage: StorageCondition;
  /** null = Unknown. */
  expiryAt: string | null;
  /** null = the shop pin. */
  location: { latitude: number; longitude: number } | null;
}

export type ListingValidation =
  | { ok: true; value: ValidListing }
  | { ok: false; error: 'E-LST-04'; fields: ListingField[] }
  | { ok: false; error: 'E-LST-03'; field: 'pickupEnd' };

export declare function validateListing(input: ListingInput): ListingValidation;

export type QuickPostField = 'photoKey' | 'bagsTotal' | 'price' | 'pickupEnd';

export interface ValidQuickPost {
  photoKey: string;
  bagsTotal: number;
  price: number;
  pickupStart: string;
  pickupEnd: string;
}

export declare function validateQuickPost(
  input: { photoKey?: unknown; bagsTotal?: unknown; price?: unknown; pickupEnd?: unknown },
  now: Date,
): { ok: true; value: ValidQuickPost } | { ok: false; error: 'E-LST-04'; fields: QuickPostField[] };
