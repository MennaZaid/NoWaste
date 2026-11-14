// Registration input rules shared by the app (C-01) and the Account Service (C-03), US-01.
// Plain CommonJS so the server (Node, ts-jest) and the app (Metro, jest-expo) can use it without a build step.
'use strict';

// Password rules: decision D-11 in PROGRESS.md (closes TBD-4, needs team approval).
// At least 8 characters, at least one letter and at least one digit. Arabic letters and Arabic-Indic digits count.
const PASSWORD_RULES = Object.freeze({ minLength: 8 });
const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

// Phone format: decision D-12 in PROGRESS.md (the SRS gives no format).
// Egyptian mobile numbers: 11 digits starting 010, 011, 012 or 015. Stored as +20 followed by the last 10 digits.
const EGYPT_MOBILE = /^01[0125]\d{8}$/;

// One "@", something before it, and a domain with a dot after it. No spaces.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LANGUAGES = Object.freeze(['ar', 'en']);

/** Converts Arabic-Indic and Eastern Arabic-Indic digits to 0-9, so numbers typed on an Arabic keyboard work. */
function toLatinDigits(text) {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0x0f));
}

/** Which password rules the password meets. Used by the server check and by the live hints under the field. */
function checkPasswordRules(password) {
  const value = typeof password === 'string' ? password : '';
  return {
    minLength: [...value].length >= PASSWORD_RULES.minLength,
    hasLetter: LETTER.test(value),
    hasDigit: DIGIT.test(value),
  };
}

function isValidPassword(password) {
  const rules = checkPasswordRules(password);
  return rules.minLength && rules.hasLetter && rules.hasDigit;
}

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL.test(email.trim());
}

/** Returns the phone in +20 form, or null if it is not a valid Egyptian mobile number. */
function normalizeEgyptianMobile(phone) {
  if (typeof phone !== 'string') return null;
  const digits = toLatinDigits(phone.trim());
  return EGYPT_MOBILE.test(digits) ? `+20${digits.slice(1)}` : null;
}

// Vendor contact phone: decision D-26 in PROGRESS.md (needs team approval). An Egyptian mobile number (D-12) or an
// Egyptian landline: 0, an area code that does not start with 1, and 9 or 10 digits in all (Cairo 02 + 8 digits,
// Alexandria 03 + 7 digits, 3-digit area codes such as 040 + 7 digits). Stored as +20 followed by the digits after 0.
const EGYPT_LANDLINE = /^0[2-9]\d{7,8}$/;

/** Returns a mobile or landline number in +20 form, or null if it is neither. */
function normalizeEgyptianPhone(phone) {
  const mobile = normalizeEgyptianMobile(phone);
  if (mobile !== null) return mobile;
  if (typeof phone !== 'string') return null;
  const digits = toLatinDigits(phone.trim());
  return EGYPT_LANDLINE.test(digits) ? `+20${digits.slice(1)}` : null;
}

/**
 * FR-ACC-04: the login field takes an email address or an Egyptian mobile number. Returns which one it is, in the
 * form it is stored in (trimmed email; phone in +20 form), or null when it is neither.
 */
function parseLoginIdentifier(value) {
  if (typeof value !== 'string') return null;
  if (value.includes('@')) return isValidEmail(value) ? { email: value.trim() } : null;
  const phone = normalizeEgyptianMobile(value);
  return phone === null ? null : { phone };
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Checks a consumer registration (FR-ACC-01, E-ACC-02).
 * Returns every invalid field, so the app and the server can mark all of them at once (IF-UI-06).
 */
function validateRegistration(input) {
  const fields = [];
  const hasEmail = !isBlank(input.email);
  const hasPhone = !isBlank(input.phone);

  if (!hasEmail && !hasPhone) {
    fields.push('email', 'phone');
  } else {
    if (hasEmail && !isValidEmail(input.email)) fields.push('email');
    if (hasPhone && normalizeEgyptianMobile(input.phone) === null) fields.push('phone');
  }
  if (!isValidPassword(input.password)) fields.push('password');
  if (!LANGUAGES.includes(input.language)) fields.push('language');

  if (fields.length > 0) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    value: {
      email: hasEmail ? input.email.trim() : null,
      phone: hasPhone ? normalizeEgyptianMobile(input.phone) : null,
      password: input.password,
      language: input.language,
    },
  };
}

// Roles that can sign up in the app (US-01, US-02, US-03). Administrator accounts are created by the team (SRS 2.7).
// D-31: an Other partner (role other) writes what kind of organisation it is.
const SIGN_UP_ROLES = Object.freeze(['consumer', 'vendor', 'charity', 'composting', 'other']);
const PARTNER_ROLES = Object.freeze(['charity', 'composting', 'other']);
const VENDOR_TYPES = Object.freeze(['formal', 'informal']);

// The six food categories of SRS Appendix A. The database enum food_category holds the same values in the same
// order (a server test checks this); listings and routing use the same list.
const FOOD_CATEGORIES = Object.freeze([
  'bread_and_baked_goods',
  'cooked_meals',
  'fruit_and_vegetables',
  'dairy_and_eggs',
  'meat_poultry_and_fish',
  'packaged_and_dry_food',
]);

// Maximum lengths in characters after trimming: decision D-29 in PROGRESS.md (closes open question 35; like the
// password rule, kept here so the app and the server apply the same limit, see open question 15).
const TEXT_LIMITS = Object.freeze({ name: 80, address: 200, description: 300 });

// D-31: a partner may also tick Other and write the food type; it is stored as text, not as a category.
const OTHER_FOOD_TYPE = 'other';
const ACCEPTED_FOOD_TYPES = Object.freeze([...FOOD_CATEGORIES, OTHER_FOOD_TYPE]);

function isNumberBetween(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Text that is not empty after trimming and has at most `max` characters (Arabic letters count as one). */
function isFilledText(value, max) {
  if (typeof value !== 'string') return false;
  const length = [...value.trim()].length;
  return length > 0 && length <= max;
}

/** Map pin plus written address (docs/feedback-changes.md), shared by vendor and partner profiles. */
function checkLocation(profile, fields) {
  if (!isFilledText(profile.address, TEXT_LIMITS.address)) fields.push('address');
  if (!isNumberBetween(profile.latitude, -90, 90)) fields.push('latitude');
  if (!isNumberBetween(profile.longitude, -180, 180)) fields.push('longitude');
}

/** Optional text: missing or blank is fine; otherwise it must be text within the limit. */
function isValidOptionalText(value, max) {
  return isBlank(value) || isFilledText(value, max);
}

/** D-62: a time of day "H:MM" or "HH:MM" (Arabic-Indic digits allowed), returned as "HH:MM", or null. */
function parseClockTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(toLatinDigits(value.trim()));
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/**
 * D-62: shop opening hours, the same every day, required for every vendor (2026-11-03). Both must be valid times and
 * differ; a closing time earlier than the opening time means after midnight. Returns the invalid fields.
 */
function validateOpeningHours(input) {
  const source = asObject(input);
  const opensAt = parseClockTime(source.opensAt);
  const closesAt = parseClockTime(source.closesAt);
  const fields = [];
  if (opensAt === null) fields.push('opensAt');
  if (closesAt === null || (opensAt !== null && closesAt === opensAt)) fields.push('closesAt');
  return fields.length > 0 ? { ok: false, fields } : { ok: true, value: { opensAt, closesAt } };
}

/** FR-ACC-02 and D-26: shop name, vendor type, location, contact phone, an optional description and hours (D-62). */
// The opening hours are required (D-62, 2026-11-03).
function checkVendorProfile(profile, fields) {
  if (!isFilledText(profile.shopName, TEXT_LIMITS.name)) fields.push('shopName');
  if (!VENDOR_TYPES.includes(profile.vendorType)) fields.push('vendorType');
  checkLocation(profile, fields);
  if (normalizeEgyptianPhone(profile.contact) === null) fields.push('contact');
  if (!isValidOptionalText(profile.description, TEXT_LIMITS.description)) fields.push('description');
  const hours = validateOpeningHours(profile);
  if (!hours.ok) fields.push(...hours.fields);
  // D-64: more branches besides the main shop (optional).
  const branches = profile.branches === undefined ? [] : profile.branches;
  if (!Array.isArray(branches)) {
    fields.push('branches');
  } else {
    branches.forEach((branch, index) => {
      const check = validateBranch(branch);
      if (!check.ok) fields.push(...check.fields.map((field) => `branches.${index}.${field}`));
    });
  }
}

/**
 * FR-ACC-03: organisation name, location and one or more food types (the six categories or Other). D-31: an Other
 * partner writes its type, and ticking Other food asks for the written food type, each up to the name limit.
 */
function checkPartnerProfile(profile, role, fields) {
  if (!isFilledText(profile.organisationName, TEXT_LIMITS.name)) fields.push('organisationName');
  if (role === 'other' && !isFilledText(profile.otherPartnerType, TEXT_LIMITS.name))
    fields.push('otherPartnerType');
  checkLocation(profile, fields);
  const types = profile.acceptedFoodTypes;
  if (!Array.isArray(types) || types.length === 0 || !types.every((t) => ACCEPTED_FOOD_TYPES.includes(t))) {
    fields.push('acceptedFoodTypes');
  } else if (types.includes(OTHER_FOOD_TYPE) && !isFilledText(profile.otherFoodType, TEXT_LIMITS.name)) {
    fields.push('otherFoodType');
  }
}

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

/**
 * Checks a sign-up for any role (FR-ACC-01, FR-ACC-02, FR-ACC-03, E-ACC-02). The account fields use the US-01
 * rules (validateRegistration); a vendor also needs vendorProfile and a charity or composting partner needs
 * partnerProfile. A missing role means consumer. Every invalid field is returned, account fields first.
 */
function validateSignUp(input) {
  const account = validateRegistration(input);
  const fields = account.ok ? [] : [...account.fields];
  const role = input.role === undefined ? 'consumer' : input.role;

  if (!SIGN_UP_ROLES.includes(role)) {
    fields.push('role');
  } else if (role === 'vendor') {
    checkVendorProfile(asObject(input.vendorProfile), fields);
  } else if (PARTNER_ROLES.includes(role)) {
    checkPartnerProfile(asObject(input.partnerProfile), role, fields);
  }

  if (fields.length > 0 || !account.ok) {
    return { ok: false, fields };
  }

  const value = { ...account.value, role, vendorProfile: null, partnerProfile: null };
  if (role === 'vendor') {
    const p = input.vendorProfile;
    value.vendorProfile = {
      shopName: p.shopName.trim(),
      vendorType: p.vendorType,
      address: p.address.trim(),
      latitude: p.latitude,
      longitude: p.longitude,
      contact: normalizeEgyptianPhone(p.contact),
      description: isBlank(p.description) ? null : p.description.trim(),
      // D-62: opening hours ("HH:MM").
      opensAt: validateOpeningHours(p).value.opensAt,
      closesAt: validateOpeningHours(p).value.closesAt,
      // D-64: the extra branches; the main shop itself becomes the first branch on the server.
      branches: (p.branches ?? []).map((branch) => validateBranch(branch).value),
    };
  } else if (PARTNER_ROLES.includes(role)) {
    const p = input.partnerProfile;
    value.partnerProfile = {
      organisationName: p.organisationName.trim(),
      address: p.address.trim(),
      latitude: p.latitude,
      longitude: p.longitude,
      // Stored once each, in the order of SRS Appendix A.
      acceptedFoodTypes: FOOD_CATEGORIES.filter((c) => p.acceptedFoodTypes.includes(c)),
      // Kept only when Other is chosen.
      otherPartnerType: role === 'other' ? p.otherPartnerType.trim() : null,
      otherFoodType: p.acceptedFoodTypes.includes(OTHER_FOOD_TYPE) ? p.otherFoodType.trim() : null,
    };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------------------------------------------
// Listings (US-10, US-11, US-13). Sprint 1 has no AI, so the vendor types every field (E-LST-01 manual path).

// NFR-08a: a listing photo is at most 500 KB (500 × 1024 bytes) when it is uploaded. The server reads the same value
// from the settings row NFR-08a (a server test checks that both match); the app compresses photos to fit.
const PHOTO_MAX_BYTES = 500 * 1024;

/** "Unknown" for the food category, preparation time, storage and expiry (FR-LST-04, SDD 4.2 Listing). */
const UNKNOWN = 'unknown';
const STORAGE_CONDITIONS = Object.freeze(['room_temperature', 'chilled', 'frozen', UNKNOWN]);
const LISTING_FOOD_CATEGORIES = Object.freeze([...FOOD_CATEGORIES, UNKNOWN]);

/** A date and time the app sends in ISO 8601 form, for example 2026-11-01T10:00:00.000Z. */
function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isWholeNumberFrom(value, min) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function isPositiveAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** A UUID such as a branch id. */
function isUuid(value) {
  return (
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** D-63: the listing text is written once, in Arabic or English; the server translates it into the other language. */
/** D-81: optional text: missing or blank gives null, valid text gives it trimmed, anything else undefined (invalid). */
function optionalText(value, max) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
    return null;
  return isFilledText(value, max) ? value.trim() : undefined;
}

function checkListingText(input, fields) {
  if (!isFilledText(input.name, TEXT_LIMITS.name)) fields.push('name');
  if (!isFilledText(input.description, TEXT_LIMITS.description)) fields.push('description');
  if (!LANGUAGES.includes(input.language)) fields.push('language');
}

/**
 * Checks a full listing (FR-LST-01, FR-LST-04 as changed by D-63): photo, name and description in one language,
 * food category, storage, number of bags, original and discounted price, pickup start and the branch. The pick-by
 * time is not sent: the server works it out from the rules and the branch's closing time (D-64). A price of 0 is
 * refused for now (open question 24); the discounted price may not be higher than the original value (E-LST-04).
 */
function validateListing(input) {
  const fields = [];
  if (!isFilledText(input.photoKey, 200)) fields.push('photoKey');
  checkListingText(input, fields);
  if (!LISTING_FOOD_CATEGORIES.includes(input.foodCategory)) fields.push('foodCategory');
  if (!STORAGE_CONDITIONS.includes(input.storage)) fields.push('storage');
  if (!isWholeNumberFrom(input.bagsTotal, 1)) fields.push('bagsTotal');
  const originalOk = isPositiveAmount(input.originalValue);
  if (!originalOk) fields.push('originalValue');
  if (!isPositiveAmount(input.price) || (originalOk && input.price > input.originalValue))
    fields.push('price');
  const start = parseTime(input.pickupStart);
  if (start === null) fields.push('pickupStart');
  // D-69: optional; when given it must be after the start (the server also keeps it within the worked-out limit).
  const end = input.pickupEnd === undefined ? null : parseTime(input.pickupEnd);
  if (input.pickupEnd !== undefined && (end === null || (start !== null && end <= start))) {
    fields.push('pickupEnd');
  }
  if (!isUuid(input.branchId)) fields.push('branchId');
  // D-81 (US-12): the text in the other language, from an accepted or edited AI draft; optional.
  const secondName = optionalText(input.secondName, TEXT_LIMITS.name);
  if (secondName === undefined) fields.push('secondName');
  const secondDescription = optionalText(input.secondDescription, TEXT_LIMITS.description);
  if (secondDescription === undefined) fields.push('secondDescription');

  if (fields.length > 0) return { ok: false, error: 'E-LST-04', fields };
  return {
    ok: true,
    value: {
      secondName,
      secondDescription,
      photoKey: input.photoKey.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      language: input.language,
      foodCategory: input.foodCategory,
      storage: input.storage,
      bagsTotal: input.bagsTotal,
      originalValue: input.originalValue,
      price: input.price,
      pickupStart: new Date(start).toISOString(),
      pickupEnd: end === null ? null : new Date(end).toISOString(),
      branchId: input.branchId,
    },
  };
}

/**
 * Checks a Quick Post (FR-LST-02, with name and description since D-63): photo, name and description in one
 * language, the number of bags, the price and the pickup end time. D-75: the pickup start is optional; without it the
 * pickup starts at the time of posting (`now`, decision D-43), and a start already passed is taken as now. The end
 * must be after the start. The server also checks the opening hours and the 6-hour limit. D-86: like a full listing
 * (D-81), the name and description in the other language from an AI draft are optional.
 */
function validateQuickPost(input, now) {
  const fields = [];
  if (!isFilledText(input.photoKey, 200)) fields.push('photoKey');
  checkListingText(input, fields);
  // D-68: optional; Unknown when not given. It lets charities and composting partners that accept the food match.
  const foodCategory = input.foodCategory === undefined ? 'unknown' : input.foodCategory;
  if (!LISTING_FOOD_CATEGORIES.includes(foodCategory)) fields.push('foodCategory');
  if (!isWholeNumberFrom(input.bagsTotal, 1)) fields.push('bagsTotal');
  if (!isPositiveAmount(input.price)) fields.push('price');
  const chosenStart = input.pickupStart === undefined ? now.getTime() : parseTime(input.pickupStart);
  if (chosenStart === null) fields.push('pickupStart');
  const start = Math.max(chosenStart ?? now.getTime(), now.getTime());
  const end = parseTime(input.pickupEnd);
  if (end === null || end <= start) fields.push('pickupEnd');
  const secondName = optionalText(input.secondName, TEXT_LIMITS.name);
  if (secondName === undefined) fields.push('secondName');
  const secondDescription = optionalText(input.secondDescription, TEXT_LIMITS.description);
  if (secondDescription === undefined) fields.push('secondDescription');
  if (fields.length > 0) return { ok: false, error: 'E-LST-04', fields };
  return {
    ok: true,
    value: {
      photoKey: input.photoKey.trim(),
      name: input.name.trim(),
      description: input.description.trim(),
      language: input.language,
      secondName,
      secondDescription,
      foodCategory,
      bagsTotal: input.bagsTotal,
      price: input.price,
      pickupStart: new Date(start).toISOString(),
      pickupEnd: new Date(end).toISOString(),
    },
  };
}

/**
 * D-64: one shop branch: a name, a written address, a map pin and its own opening hours (D-62 rules). Returns the
 * invalid fields (name, address, latitude, longitude, opensAt, closesAt).
 */
function validateBranch(input) {
  const branch = asObject(input);
  const fields = [];
  // D-69: a branch has no name of its own; it carries the store name (set by the server).
  checkLocation(branch, fields);
  const hours = validateOpeningHours(branch);
  if (!hours.ok) fields.push(...hours.fields);
  if (fields.length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      address: branch.address.trim(),
      latitude: branch.latitude,
      longitude: branch.longitude,
      opensAt: hours.value.opensAt,
      closesAt: hours.value.closesAt,
    },
  };
}

/**
 * D-87 (US-26, FR-RES-01): the consumer's offer filters, both optional. `maxPrice`: the most they will pay for a bag
 * (offers at or below it are shown). `pickupBy`: the time they can come by; offers whose pickup starts by then are
 * shown (one that has already started counts). It must not be in the past. The vendor rating filter waits for ratings.
 */
function validateOfferFilters(input, now) {
  const fields = [];
  const maxPrice = input.maxPrice === undefined ? null : input.maxPrice;
  if (maxPrice !== null && !isPositiveAmount(maxPrice)) fields.push('maxPrice');
  const pickupBy = input.pickupBy === undefined ? null : parseTime(input.pickupBy);
  if (input.pickupBy !== undefined && (pickupBy === null || pickupBy < now.getTime())) fields.push('pickupBy');
  if (fields.length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: { maxPrice, pickupBy: pickupBy === null ? null : new Date(pickupBy).toISOString() },
  };
}

module.exports = {
  PASSWORD_RULES,
  LANGUAGES,
  SIGN_UP_ROLES,
  PARTNER_ROLES,
  VENDOR_TYPES,
  FOOD_CATEGORIES,
  OTHER_FOOD_TYPE,
  ACCEPTED_FOOD_TYPES,
  TEXT_LIMITS,
  checkPasswordRules,
  isValidPassword,
  isValidEmail,
  normalizeEgyptianMobile,
  parseLoginIdentifier,
  normalizeEgyptianPhone,
  validateRegistration,
  validateSignUp,
  parseClockTime,
  validateOpeningHours,
  PHOTO_MAX_BYTES,
  UNKNOWN,
  STORAGE_CONDITIONS,
  LISTING_FOOD_CATEGORIES,
  validateListing,
  validateQuickPost,
  validateBranch,
  validateOfferFilters,
};
