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

/** FR-ACC-02 and D-26: shop name, vendor type, location, contact phone and an optional description. */
function checkVendorProfile(profile, fields) {
  if (!isFilledText(profile.shopName, TEXT_LIMITS.name)) fields.push('shopName');
  if (!VENDOR_TYPES.includes(profile.vendorType)) fields.push('vendorType');
  checkLocation(profile, fields);
  if (normalizeEgyptianPhone(profile.contact) === null) fields.push('contact');
  if (!isValidOptionalText(profile.description, TEXT_LIMITS.description)) fields.push('description');
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
  normalizeEgyptianPhone,
  validateRegistration,
  validateSignUp,
};
