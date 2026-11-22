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

/** D-105: a vendor or partner application without the login details (a rejected application sent again). */
export interface ApplicationInput {
  role?: unknown;
  vendorProfile?: unknown;
  partnerProfile?: unknown;
}

export interface ValidApplication {
  role: 'vendor' | PartnerRole;
  vendorProfile: VendorProfile | null;
  partnerProfile: ValidPartnerProfile | null;
}

export declare function validateApplication(
  input: ApplicationInput,
): { ok: true; value: ValidApplication } | { ok: false; fields: ProfileField[] };

/** D-105: why an application was rejected. */
export declare const REJECTION_REASONS: readonly [
  'wrong_location',
  'wrong_contact',
  'not_food_business',
  'duplicate_account',
  'other',
];
export type RejectionReason = (typeof REJECTION_REASONS)[number];
export declare const REJECTION_NOTE_MAX: number;

export interface Rejection {
  reason: RejectionReason;
  /** Trimmed; null when none was written. Required for Other. */
  note: string | null;
}

export declare function validateRejection(
  input: unknown,
): { ok: true; value: Rejection } | { ok: false; fields: ('reason' | 'note')[] };

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
  | 'branchId'
  | 'secondName'
  | 'secondDescription';

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
  /** D-81 (US-12): the name and description in the other language, from an AI draft; optional. */
  secondName?: unknown;
  secondDescription?: unknown;
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
  /** D-81: the text in the other language than `language`, or null. */
  secondName: string | null;
  secondDescription: string | null;
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
  | 'pickupEnd'
  | 'secondName'
  | 'secondDescription';

export interface ValidQuickPost {
  photoKey: string;
  name: string;
  description: string;
  language: Language;
  /** D-86: the text in the other language than `language`, from an AI draft, or null. */
  secondName: string | null;
  secondDescription: string | null;
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
    /** D-86: optional; the name and description in the other language, from an AI draft. */
    secondName?: unknown;
    secondDescription?: unknown;
  },
  now: Date,
): { ok: true; value: ValidQuickPost } | { ok: false; error: 'E-LST-04'; fields: QuickPostField[] };

/** D-87 (US-26): the consumer's offer filters; a missing filter is null. */
export interface OfferFilters {
  /** The most the consumer will pay for a bag, in EGP. */
  maxPrice: number | null;
  /** ISO time the consumer can come by: offers whose pickup starts by then. */
  pickupBy: string | null;
}

export type OfferFilterField = 'maxPrice' | 'pickupBy';

/** D-87: checks the filters; `pickupBy` must not be in the past. */
export declare function validateOfferFilters(
  input: { maxPrice?: unknown; pickupBy?: unknown },
  now: Date,
): { ok: true; value: OfferFilters } | { ok: false; fields: OfferFilterField[] };

/** D-99: a well-formed card for the pretend bank (only the format is checked). */
export interface CardInput {
  /** 8 digits. */
  number: string;
  expiryMonth: number;
  /** Four digits, from the two typed (20YY). */
  expiryYear: number;
  /** 3 digits. */
  cvv: string;
}

export type CardField = 'number' | 'expiry' | 'cvv';

/** D-99 (FR-RES-02): checks the card form: 8-digit number, expiry MM/YY, 3-digit CVV. */
export declare function validateCardInput(input: {
  number?: unknown;
  expiry?: unknown;
  cvv?: unknown;
}): { ok: true; value: CardInput } | { ok: false; fields: CardField[] };

/** D-104: the pickup start limits from the settings row LISTING-START. */
export interface PickupStartRule {
  maxDaysAhead: number;
  pastGraceMinutes: number;
}

/** D-104: 'past' (before now minus the grace), 'too_far' (more than maxDaysAhead days ahead) or null when allowed. */
export declare function pickupStartProblem(
  start: number,
  now: number,
  rule: PickupStartRule,
): 'past' | 'too_far' | null;

/** FR-RES-10 (D-101): a typed pickup code of exactly `digits` digits (BR-09), in Western digits, or null. */
export declare function parsePickupCode(value: unknown, digits: number): string | null;

/** D-107 (US-45): administrator-set iftar and suhoor times, "HH:MM". */
export interface RamadanTimes {
  iftar: string;
  suhoor: string;
}
export type RamadanTimesField = 'iftar' | 'suhoor';
export declare function validateRamadanTimes(
  input: unknown,
): { ok: true; value: RamadanTimes } | { ok: false; fields: RamadanTimesField[] };
export type RamadanMeal = 'iftar' | 'suhoor';
/** D-107 (FR-TGI-08): the meal a pickup window comes before (overlaps the lead minutes before it), or null. */
export declare function ramadanHighlight(
  pickupStart: string | Date,
  pickupEnd: string | Date,
  moments: { iftarAt: string | Date; suhoorAt: string | Date },
  leadMinutes: number,
): RamadanMeal | null;
