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
  | 'description'
  | 'opensAt'
  | 'closesAt'
  | 'branches'
  // D-64: a field of an extra branch, for example "branches.0.address".
  | `branches.${number}.${BranchField}`;
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
  /** D-62: opening hours ("HH:MM", Egypt time), required; a closing time before the opening time is after midnight. */
  opensAt: string;
  closesAt: string;
  /** D-64: more branches besides the main shop (which becomes the first branch); optional when sending. */
  branches?: Branch[];
}

/** D-64: a shop branch with its own map pin and opening hours. D-69: it carries the store name, so none is sent. */
export interface Branch {
  address: string;
  latitude: number;
  longitude: number;
  opensAt: string;
  closesAt: string;
}

export type BranchField = 'address' | 'latitude' | 'longitude' | 'opensAt' | 'closesAt';

/** D-64: checks one branch. */
export declare function validateBranch(
  input: unknown,
): { ok: true; value: Branch } | { ok: false; fields: BranchField[] };

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

/** D-62: a time of day "H:MM" or "HH:MM" (Arabic-Indic digits allowed), returned as "HH:MM", or null. */
export declare function parseClockTime(value: unknown): string | null;

export interface OpeningHours {
  opensAt: string;
  closesAt: string;
}

/** D-62: required shop opening hours. A closing time before the opening time is after midnight. */
export declare function validateOpeningHours(input: {
  opensAt?: unknown;
  closesAt?: unknown;
}): { ok: true; value: OpeningHours } | { ok: false; fields: ('opensAt' | 'closesAt')[] };

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

/** D-63: the fields of a full listing. */
export type ListingField =
  | 'photoKey'
  | 'name'
  | 'description'
  | 'language'
  | 'foodCategory'
  | 'storage'
  | 'bagsTotal'
  | 'originalValue'
  | 'price'
  | 'pickupStart'
  | 'pickupEnd'
  | 'branchId';

export interface ListingInput {
  photoKey?: unknown;
  name?: unknown;
  description?: unknown;
  language?: unknown;
  foodCategory?: unknown;
  storage?: unknown;
  bagsTotal?: unknown;
  originalValue?: unknown;
  price?: unknown;
  pickupStart?: unknown;
  /** D-69: optional; the vendor's end time, no later than the worked-out limit. */
  pickupEnd?: unknown;
  branchId?: unknown;
}

export interface ValidListing {
  photoKey: string;
  /** Written in `language` and shown as written (D-63, D-66). */
  name: string;
  description: string;
  language: Language;
  foodCategory: ListingFoodCategory;
  storage: StorageCondition;
  bagsTotal: number;
  originalValue: number;
  price: number;
  pickupStart: string;
  /** D-69: the vendor's end time, or null to use the worked-out limit. */
  pickupEnd: string | null;
  branchId: string;
}

export type ListingValidation =
  { ok: true; value: ValidListing } | { ok: false; error: 'E-LST-04'; fields: ListingField[] };

export declare function validateListing(input: ListingInput): ListingValidation;

export type QuickPostField =
  | 'photoKey'
  | 'name'
  | 'description'
  | 'language'
  | 'foodCategory'
  | 'bagsTotal'
  | 'price'
  | 'pickupStart'
  | 'pickupEnd';

export interface ValidQuickPost {
  photoKey: string;
  name: string;
  description: string;
  language: Language;
  /** D-68: optional in the input; 'unknown' when not given. */
  foodCategory: ListingFoodCategory;
  bagsTotal: number;
  price: number;
  pickupStart: string;
  pickupEnd: string;
}

export declare function validateQuickPost(
  input: {
    photoKey?: unknown;
    name?: unknown;
    description?: unknown;
    language?: unknown;
    foodCategory?: unknown;
    bagsTotal?: unknown;
    price?: unknown;
    /** D-75: optional; when the pickup starts. Without it, or when already passed, it is `now`. */
    pickupStart?: unknown;
    pickupEnd?: unknown;
  },
  now: Date,
): { ok: true; value: ValidQuickPost } | { ok: false; error: 'E-LST-04'; fields: QuickPostField[] };
