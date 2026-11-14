// Client for the SDD IApi (REST, SDD 3.2.3). The base URL comes from app/.env (EXPO_PUBLIC_API_URL).
import { File, Paths } from 'expo-file-system';
import type {
  AcceptedFoodType,
  ListingFoodCategory,
  StorageCondition,
  Language,
  PartnerProfile,
  PartnerRole,
  RegistrationField,
  SignUpField,
  VendorProfile,
} from '@nowaste/shared';

const REQUEST_TIMEOUT_MS = 10000;

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url === undefined || url === '') {
    throw new Error('EXPO_PUBLIC_API_URL is not set. Copy app/.env.example to app/.env.');
  }
  return url.replace(/\/+$/, '');
}

async function request(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  // IF-COM-03: the access token received at login goes with every request.
  if (token !== undefined) headers.set('Authorization', `Bearer ${token}`);
  // JSON unless the caller sent something else (a listing photo is sent as image/jpeg).
  if (init.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'ok' | 'down';
}

/** Calls GET /health. Returns true only when the server and its database are both up. */
export async function isServerHealthy(): Promise<boolean> {
  try {
    const response = await request('/health');
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as HealthResponse;
    return body.status === 'ok' && body.db === 'ok';
  } catch {
    return false;
  }
}

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  language: Language;
}

export type RegisterResult =
  | { kind: 'created'; id: string }
  | { kind: 'invalid'; fields: RegistrationField[] } // E-ACC-02
  | { kind: 'duplicate'; field: 'email' | 'phone' } // E-ACC-01
  | { kind: 'unreachable' }
  | { kind: 'unexpected' };

/** POST /auth/register (US-01). */
export async function registerConsumer(body: RegisterRequest): Promise<RegisterResult> {
  const result = await postRegister(body);
  if (result.kind === 'created') return { kind: 'created', id: result.id };
  if (result.kind === 'invalid') return { kind: 'invalid', fields: result.fields as RegistrationField[] };
  return result;
}

export type ApplicationRequest = RegisterRequest &
  ({ role: 'vendor'; vendorProfile: VendorProfile } | { role: PartnerRole; partnerProfile: PartnerProfile });

export type ApplicationResult =
  | { kind: 'created'; id: string; status: 'Pending' }
  | { kind: 'invalid'; fields: SignUpField[] } // E-ACC-02
  | { kind: 'duplicate'; field: 'email' | 'phone' } // E-ACC-01
  | { kind: 'unreachable' }
  | { kind: 'unexpected' };

/** POST /auth/register with role vendor (US-02) or charity / composting / other (US-03). */
export async function submitApplication(body: ApplicationRequest): Promise<ApplicationResult> {
  const result = await postRegister(body);
  if (result.kind === 'created') {
    return result.status === 'Pending'
      ? { kind: 'created', id: result.id, status: 'Pending' }
      : { kind: 'unexpected' };
  }
  return result;
}

type PostRegisterResult =
  | { kind: 'created'; id: string; status: unknown }
  | { kind: 'invalid'; fields: SignUpField[] }
  | { kind: 'duplicate'; field: 'email' | 'phone' }
  | { kind: 'unreachable' }
  | { kind: 'unexpected' };

async function postRegister(body: object): Promise<PostRegisterResult> {
  let response: Response;
  try {
    response = await request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
  } catch {
    return { kind: 'unreachable' };
  }

  try {
    const data = (await response.json()) as Record<string, unknown>;
    if (response.status === 201 && typeof data.id === 'string') {
      return { kind: 'created', id: data.id, status: data.status };
    }
    if (response.status === 400 && data.error === 'E-ACC-02' && Array.isArray(data.fields)) {
      return { kind: 'invalid', fields: data.fields as SignUpField[] };
    }
    if (
      response.status === 409 &&
      data.error === 'E-ACC-01' &&
      (data.field === 'email' || data.field === 'phone')
    ) {
      return { kind: 'duplicate', field: data.field };
    }
  } catch {
    // Not JSON: fall through.
  }
  return { kind: 'unexpected' };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await response.json();
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type AccountRole = 'consumer' | 'vendor' | 'charity' | 'composting' | 'other' | 'admin';
export type AccountStatus = 'Active' | 'Pending' | 'Approved' | 'Rejected' | 'Suspended' | 'Removed';

export interface SessionUser {
  id: string;
  role: AccountRole;
  status: AccountStatus;
  language: Language;
}

export type LoginResult =
  | { kind: 'ok'; token: string; user: SessionUser }
  | { kind: 'invalid' } // E-ACC-03: wrong credentials or a locked account (NFR-09d), never said which
  | { kind: 'unreachable' }
  | { kind: 'unexpected' };

/** POST /auth/login (US-04). */
export async function login(emailOrPhone: string, password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrPhone, password }),
    });
  } catch {
    return { kind: 'unreachable' };
  }
  const data = await readJson(response);
  if (response.status === 200 && typeof data?.token === 'string' && typeof data.user === 'object') {
    return { kind: 'ok', token: data.token, user: data.user as SessionUser };
  }
  if (response.status === 401 && data?.error === 'E-ACC-03') return { kind: 'invalid' };
  return { kind: 'unexpected' };
}

/** POST /auth/logout (US-04, IF-COM-03). The app forgets the token whatever the answer is. */
export async function logout(token: string): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' }, token);
  } catch {
    // Offline: the token is still deleted on the phone.
  }
}

/** Answers of protected routes: 401 = the session ended, 403 E-ACC-06 = the account is suspended. */
type Protected<T> =
  T | { kind: 'unauthorized' } | { kind: 'suspended' } | { kind: 'unreachable' } | { kind: 'unexpected' };

async function protectedCall(path: string, init: RequestInit, token: string) {
  let response: Response;
  try {
    response = await request(path, init, token);
  } catch {
    return { kind: 'unreachable' } as const;
  }
  const data = await readJson(response);
  if (response.status === 401) return { kind: 'unauthorized' } as const;
  if (response.status === 403 && data?.error === 'E-ACC-06') return { kind: 'suspended' } as const;
  return { kind: 'response', status: response.status, data } as const;
}

/** GET /users/me. */
export async function getMe(token: string): Promise<Protected<{ kind: 'ok'; user: SessionUser }>> {
  const result = await protectedCall('/users/me', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', user: result.data as unknown as SessionUser }
    : { kind: 'unexpected' };
}

/** PATCH /users/me {language} (FR-ACC-09). Returns true when saved. */
export async function updateMyLanguage(token: string, language: Language): Promise<boolean> {
  const result = await protectedCall(
    '/users/me',
    { method: 'PATCH', body: JSON.stringify({ language }) },
    token,
  );
  return result.kind === 'response' && result.status === 200;
}

export interface Application {
  userId: string;
  role: AccountRole;
  status: AccountStatus;
  email: string | null;
  phone: string | null;
  createdAt: string;
  vendorProfile: {
    shopName: string;
    vendorType: 'formal' | 'informal';
    contact: string;
    description: string | null;
    address: string;
    latitude: number;
    longitude: number;
  } | null;
  partnerProfile: {
    organisationName: string;
    otherPartnerType: string | null;
    acceptedFoodTypes: AcceptedFoodType[];
    otherFoodType: string | null;
    address: string;
    latitude: number;
    longitude: number;
  } | null;
}

/** GET /admin/applications?status=… (US-07). */
export async function listApplications(
  token: string,
  status: 'Pending' | 'Approved' | 'Rejected',
): Promise<Protected<{ kind: 'ok'; applications: Application[] }>> {
  const result = await protectedCall(`/admin/applications?status=${status}`, {}, token);
  if (result.kind !== 'response') return result;
  if (result.status === 200 && Array.isArray(result.data)) {
    return { kind: 'ok', applications: result.data as Application[] };
  }
  return { kind: 'unexpected' };
}

/** POST /admin/applications/:userId/approve or /reject (US-07). 409 = it was not Pending any more. */
export async function decideApplication(
  token: string,
  userId: string,
  decision: 'approve' | 'reject',
): Promise<Protected<{ kind: 'ok'; status: AccountStatus } | { kind: 'conflict'; status: AccountStatus }>> {
  const result = await protectedCall(
    `/admin/applications/${encodeURIComponent(userId)}/${decision}`,
    { method: 'POST' },
    token,
  );
  if (result.kind !== 'response') return result;
  const status = result.data?.status as AccountStatus | undefined;
  if (result.status === 200 && status !== undefined) return { kind: 'ok', status };
  if (result.status === 409 && status !== undefined) return { kind: 'conflict', status };
  return { kind: 'unexpected' };
}

// ---------------------------------------------------------------------------------------------------------------
// Listings (US-10, US-11, US-13). Only Approved vendors may create or publish; others get 403 E-LST-06.

/** D-64: a place where the vendor's food is picked up. The shop given at sign-up is the first branch. */
export interface Branch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** "HH:MM" (Egypt time), or null for a branch registered before opening hours were required (D-62). */
  opensAt: string | null;
  closesAt: string | null;
}

export interface Shop {
  shopName: string;
  vendorType: 'formal' | 'informal';
  address: string;
  latitude: number;
  longitude: number;
  /** D-62: opening hours "HH:MM" (Egypt time), or null when the vendor gave none. */
  opensAt: string | null;
  closesAt: string | null;
  /** D-64: the vendor's branches, the shop itself first. */
  branches: Branch[];
}

/** GET /vendors/me: the shop pin (start of the pickup location) and the vendor type (Quick Post). */
export async function getShop(token: string): Promise<Protected<{ kind: 'ok'; shop: Shop }>> {
  const result = await protectedCall('/vendors/me', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', shop: result.data as unknown as Shop }
    : { kind: 'unexpected' };
}

export interface Listing {
  id: string;
  status: 'Draft' | 'Active' | 'Fully reserved' | 'Closed' | 'Cancelled';
  /** Set from the chosen destination (FR-RTE-06); null until then. */
  listingType: 'Discounted Surplus Bag' | 'Donation' | 'Compost offer' | null;
  isQuickPost: boolean;
  foodType: string | null;
  foodCategory: ListingFoodCategory;
  photoKey: string;
  /** D-63: the name and description per language; null when not translated (yet). */
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** The language the vendor wrote in; null for listings made before D-63. */
  sourceLanguage: Language | null;
  /** D-64: where the food is picked up. */
  branchId: string | null;
  bagsTotal: number;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: string;
  /** The pick-by time (D-64). */
  pickupEnd: string;
  storage: StorageCondition | null;
  perishabilityCategory: PerishabilityCategory | null;
  /** How soon to collect (FR-RTE-04); null until the category is confirmed. */
  urgency: Urgency | null;
  unfitForPeople: boolean;
  latitude: number;
  longitude: number;
}

/** US-18: most urgent first. */
export type PerishabilityCategory = 'Highly perishable' | 'Short-life' | 'Long-life';

/** D-61: how soon to collect, as a time: the pickup end, which is never later than the food limit. */
export interface Urgency {
  collectBy: string;
}

/** US-19 destinations, in the SRS order: consumers, charity, composting, landfill last. */
export type Destination = 'consumers' | 'charity' | 'composting' | 'landfill';

export interface DestinationOption {
  destination: Destination;
  partners: number | null;
  nearestPartnerMeters: number | null;
  /** Landfill is shown but cannot be chosen yet (US-25). */
  available: boolean;
}

export interface Destinations {
  options: DestinationOption[];
  /** null when the recommendation failed (E-RTE-02). */
  recommended: Destination | null;
  timeLeftMinutes: number;
}

/** E-LST-06 = the vendor is not Approved. */
type ListingAnswer<T> = Protected<T | { kind: 'notApproved' }>;

function notApproved(result: { status: number; data: Record<string, unknown> | null }): boolean {
  return result.status === 403 && result.data?.error === 'E-LST-06';
}

/**
 * POST /listings/photo with the compressed photo (NFR-08a). E-LST-02: any failure, including no connection, is
 * "failed", so the form can keep its values and offer Retry.
 */
/** US-12 FR-LST-03: the AI draft for a photo. Every value is a Draft or an Estimate for the vendor to confirm. */
export interface AiDraft {
  foodType: string;
  foodCategory: ListingFoodCategory;
  /** D-82: shown only as an Estimate; it does not fill the number of bags. */
  quantity: number | null;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  confidence: number;
}

/** The listing fields an AI draft can fill (D-81). */
export type AiField = 'name' | 'description' | 'secondName' | 'secondDescription' | 'foodCategory';

/**
 * POST /listings/photo. D-84, D-86: `draft: true` only when the vendor tapped "Fill in with AI draft"; otherwise the
 * server does not ask the AI, so a listing saved without a draft has nothing to confirm.
 */
export async function uploadListingPhoto(
  token: string,
  uri: string,
  options: { draft?: boolean } = {},
): Promise<
  ListingAnswer<
    { kind: 'ok'; photoKey: string; draft?: AiDraft | null; draftError?: 'E-LST-01' } | { kind: 'failed' }
  >
> {
  // The file's own bytes are sent (D-50). A Blob from fetch("file://...") could reach the server empty on Android.
  let body: ArrayBuffer;
  try {
    body = await new File(uri).arrayBuffer();
  } catch {
    return { kind: 'failed' };
  }
  const result = await protectedCall(
    options.draft === true ? '/listings/photo?draft=1' : '/listings/photo',
    { method: 'POST', body, headers: { 'Content-Type': 'image/jpeg' } },
    token,
  );
  if (result.kind === 'unreachable') return { kind: 'failed' };
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  const photoKey = result.data?.photoKey;
  if (result.status !== 201 || typeof photoKey !== 'string') return { kind: 'failed' };
  // US-12: E-LST-01 when the AI gave no draft; the vendor fills the form by hand.
  const draft = result.data?.draft;
  if (draft === undefined) return { kind: 'ok', photoKey };
  return typeof draft === 'object' && draft !== null
    ? { kind: 'ok', photoKey, draft: draft as unknown as AiDraft }
    : { kind: 'ok', photoKey, draft: null, draftError: 'E-LST-01' };
}

/** D-63, D-64: the name and description in one language; the pick-by time is worked out by the server. */
export type ListingRequest = {
  photoKey: string;
  name: string;
  description: string;
  language: Language;
  foodCategory: ListingFoodCategory | undefined;
  storage: StorageCondition | undefined;
  bagsTotal: number | undefined;
  originalValue: number | undefined;
  price: number | undefined;
  pickupStart: string | undefined;
  /** D-69: the vendor's end time, or undefined to use the worked-out limit. */
  pickupEnd: string | undefined;
  branchId: string | undefined;
  /** US-12 (D-81): the other-language text from an AI draft, and the AI fields confirmed or edited (NFR-05b). */
  secondName?: string;
  secondDescription?: string;
  confirmedAiFields?: AiField[];
};

export type QuickPostRequest = {
  photoKey: string;
  name: string;
  description: string;
  language: Language;
  /** D-68: optional; Unknown when the vendor does not say. */
  foodCategory: ListingFoodCategory;
  bagsTotal: number | undefined;
  price: number | undefined;
  /** D-75: optional; undefined = the pickup starts when it is posted. */
  pickupStart: string | undefined;
  pickupEnd: string | undefined;
  /** D-86: as for a full listing (D-81), the other-language AI draft text and the AI fields confirmed or edited. */
  secondName?: string;
  secondDescription?: string;
  confirmedAiFields?: AiField[];
};

export type SaveListingResult = ListingAnswer<
  | { kind: 'ok'; listing: Listing }
  // E-LST-04; with the opening hours when the pickup is outside them (D-62).
  | {
      kind: 'invalid';
      fields: string[];
      hours?: { opensAt: string; closesAt: string };
      /** NFR-05b: the fields are AI-filled and were not confirmed. */
      unconfirmedAi?: boolean;
    }
  // E-LST-03; with the latest allowed end when the pickup goes past the food limit (D-61).
  | { kind: 'afterExpiry'; latestPickupEnd?: string }
  | { kind: 'formalVendor' } // Quick Post is for informal vendors only
  | { kind: 'informalVendor' } // D-64: full listings are for formal vendors only
  | { kind: 'hoursRequired' } // D-62: the shop's opening hours must be set first
>;

async function saveListing(path: string, body: object, token: string): Promise<SaveListingResult> {
  const result = await protectedCall(path, { method: 'POST', body: JSON.stringify(body) }, token);
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (notApproved(result)) return { kind: 'notApproved' };
  if (result.status === 201 && data !== null) return { kind: 'ok', listing: data as unknown as Listing };
  if (result.status === 400 && data?.error === 'E-LST-04' && Array.isArray(data.fields)) {
    const hours =
      typeof data.opensAt === 'string' && typeof data.closesAt === 'string'
        ? { hours: { opensAt: data.opensAt, closesAt: data.closesAt } }
        : {};
    const unconfirmed = data.unconfirmedAi === true ? { unconfirmedAi: true } : {};
    return { kind: 'invalid', fields: data.fields as string[], ...hours, ...unconfirmed };
  }
  if (result.status === 400 && data?.error === 'E-LST-03') {
    return typeof data.latestPickupEnd === 'string'
      ? { kind: 'afterExpiry', latestPickupEnd: data.latestPickupEnd }
      : { kind: 'afterExpiry' };
  }
  if (result.status === 403 && data?.error === 'quick_post_informal_only') return { kind: 'formalVendor' };
  if (result.status === 403 && data?.error === 'full_listing_formal_only') return { kind: 'informalVendor' };
  if (result.status === 409 && data?.error === 'opening_hours_required') return { kind: 'hoursRequired' };
  return { kind: 'unexpected' };
}

/** POST /listings: saves a full listing as a Draft (US-10, US-13). */
export function createListing(token: string, body: ListingRequest): Promise<SaveListingResult> {
  return saveListing('/listings', body, token);
}

/** POST /listings/quick: a Quick Post, published at once (US-11). */
export function createQuickPost(token: string, body: QuickPostRequest): Promise<SaveListingResult> {
  return saveListing('/listings/quick', body, token);
}

export interface PickByPreview {
  pickupEnd: string;
  closesAt: string;
  /** True when the rules would give a later time and the branch's closing time was used instead. */
  cappedAtClosing: boolean;
  /** D-74: the estimated category, shown to the vendor as the reason for the window. */
  category: PerishabilityCategory;
}

/**
 * POST /listings/pick-by (D-64): the pick-by time the server will save for this food, start and branch. A start when
 * the branch is closed gives "invalid" with the hours.
 */
export async function previewPickBy(
  token: string,
  body: {
    foodCategory: ListingFoodCategory;
    storage: StorageCondition;
    pickupStart: string;
    branchId: string;
    /** US-12: so an uncertain AI category gives the same window as saving (NFR-05d). */
    photoKey?: string;
  },
): Promise<
  ListingAnswer<
    | { kind: 'ok'; preview: PickByPreview }
    | { kind: 'invalid'; fields: string[]; hours?: { opensAt: string; closesAt: string } }
    | { kind: 'hoursRequired' }
  >
> {
  const result = await protectedCall(
    '/listings/pick-by',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (notApproved(result)) return { kind: 'notApproved' };
  if (result.status === 200 && data !== null && typeof data.pickupEnd === 'string') {
    return { kind: 'ok', preview: data as unknown as PickByPreview };
  }
  if (result.status === 400 && data?.error === 'E-LST-04' && Array.isArray(data.fields)) {
    const hours =
      typeof data.opensAt === 'string' && typeof data.closesAt === 'string'
        ? { hours: { opensAt: data.opensAt, closesAt: data.closesAt } }
        : {};
    return { kind: 'invalid', fields: data.fields as string[], ...hours };
  }
  if (result.status === 409 && data?.error === 'opening_hours_required') return { kind: 'hoursRequired' };
  return { kind: 'unexpected' };
}

/** D-69: a branch carries the store name, so none is sent. */
export type NewBranchRequest = {
  address: string;
  latitude: number | undefined;
  longitude: number | undefined;
  opensAt: string;
  closesAt: string;
};

/** POST /vendors/me/branches (D-64): adds a branch with its own pin and opening hours. */
export async function addBranch(
  token: string,
  branch: NewBranchRequest,
): Promise<Protected<{ kind: 'ok'; branch: Branch } | { kind: 'invalid'; fields: string[] }>> {
  const result = await protectedCall(
    '/vendors/me/branches',
    { method: 'POST', body: JSON.stringify(branch) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 400 && data?.error === 'E-ACC-02' && Array.isArray(data.fields)) {
    return { kind: 'invalid', fields: data.fields as string[] };
  }
  return result.status === 201 && data !== null
    ? { kind: 'ok', branch: data as unknown as Branch }
    : { kind: 'unexpected' };
}

/** PATCH /vendors/me/branches/:id {opensAt, closesAt} (D-64): one branch's opening hours. */
export async function updateBranchHours(
  token: string,
  id: string,
  hours: { opensAt: string; closesAt: string },
): Promise<
  Protected<{ kind: 'ok'; branch: Branch } | { kind: 'invalid'; fields: ('opensAt' | 'closesAt')[] }>
> {
  const result = await protectedCall(
    `/vendors/me/branches/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(hours) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 400 && data?.error === 'E-ACC-02' && Array.isArray(data.fields)) {
    return { kind: 'invalid', fields: data.fields as ('opensAt' | 'closesAt')[] };
  }
  return result.status === 200 && data !== null
    ? { kind: 'ok', branch: data as unknown as Branch }
    : { kind: 'unexpected' };
}

/** GET /listings/:id: the vendor's own listing. */
export async function getListing(
  token: string,
  id: string,
): Promise<ListingAnswer<{ kind: 'ok'; listing: Listing } | { kind: 'notFound' }>> {
  const result = await protectedCall(`/listings/${encodeURIComponent(id)}`, {}, token);
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', listing: result.data as unknown as Listing }
    : { kind: 'unexpected' };
}

/** PATCH /vendors/me {opensAt, closesAt} (D-62): saves the opening hours; both empty removes them. */
export async function updateOpeningHours(
  token: string,
  hours: { opensAt: string; closesAt: string },
): Promise<Protected<{ kind: 'ok'; shop: Shop } | { kind: 'invalid'; fields: ('opensAt' | 'closesAt')[] }>> {
  const result = await protectedCall('/vendors/me', { method: 'PATCH', body: JSON.stringify(hours) }, token);
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 400 && data?.error === 'E-ACC-02' && Array.isArray(data.fields)) {
    return { kind: 'invalid', fields: data.fields as ('opensAt' | 'closesAt')[] };
  }
  return result.status === 200 && data !== null
    ? { kind: 'ok', shop: data as unknown as Shop }
    : { kind: 'unexpected' };
}

/** GET /listings: the vendor's own listings, newest first (US-15, FR-LST-06). */
export async function getMyListings(token: string): Promise<Protected<{ kind: 'ok'; listings: Listing[] }>> {
  const result = await protectedCall('/listings', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && Array.isArray(result.data)
    ? { kind: 'ok', listings: result.data as Listing[] }
    : { kind: 'unexpected' };
}

/**
 * GET /listings/:id/photo, saved in the app's cache; returns the local file to show, or null when it failed.
 * The photo needs the login token, and the phone's Image component drops request headers on Android (D-51), so the
 * file is downloaded here with the token and the screen shows the local copy.
 */
export async function downloadListingPhoto(
  token: string,
  id: string,
  source: 'vendor' | 'offer' = 'vendor',
): Promise<string | null> {
  // D-65: a consumer reads the photo of an offer through /listings/nearby/:id/photo.
  const path =
    source === 'offer' ? `/listings/nearby/${encodeURIComponent(id)}` : `/listings/${encodeURIComponent(id)}`;
  try {
    const file = await File.downloadFileAsync(
      `${getApiBaseUrl()}${path}/photo`,
      new File(Paths.cache, `${source === 'offer' ? 'offer' : 'listing'}-photo-${id}.jpg`),
      { headers: { Authorization: `Bearer ${token}` }, idempotent: true },
    );
    return file.uri;
  } catch {
    return null;
  }
}

/** POST /listings/:id/publish: Draft → Active. */
export async function publishListing(
  token: string,
  id: string,
): Promise<ListingAnswer<{ kind: 'ok'; listing: Listing } | { kind: 'notDraft' } | { kind: 'notReady' }>> {
  const result = await protectedCall(
    `/listings/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  // US-18, US-19: the category must be confirmed and a destination chosen first.
  if (result.status === 409 && result.data?.error === 'not_ready_to_publish') return { kind: 'notReady' };
  if (result.status === 409) return { kind: 'notDraft' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', listing: result.data as unknown as Listing }
    : { kind: 'unexpected' };
}

const listingPath = (id: string, rest: string) => `/listings/${encodeURIComponent(id)}${rest}`;

/** D-70: the BR-01 hours behind the perishability categories. */
export interface CategoryHours {
  highlyPerishableMaxHours: number;
  shortLifeMaxHours: number;
}

/** GET /perishability/categories (D-70). */
export async function getCategoryHours(
  token: string,
): Promise<Protected<{ kind: 'ok'; hours: CategoryHours }>> {
  const result = await protectedCall('/perishability/categories', {}, token);
  if (result.kind !== 'response') return result;
  const data = result.data;
  return result.status === 200 &&
    typeof data?.highlyPerishableMaxHours === 'number' &&
    typeof data.shortLifeMaxHours === 'number'
    ? { kind: 'ok', hours: data as unknown as CategoryHours }
    : { kind: 'unexpected' };
}

/** GET /listings/:id/destinations (US-19, FR-RTE-05, E-RTE-02). */
export async function getDestinations(
  token: string,
  id: string,
): Promise<ListingAnswer<{ kind: 'ok'; destinations: Destinations }>> {
  const result = await protectedCall(listingPath(id, '/destinations'), {}, token);
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  return result.status === 200 && result.data !== null && Array.isArray(result.data.options)
    ? { kind: 'ok', destinations: result.data as unknown as Destinations }
    : { kind: 'unexpected' };
}

/** POST /listings/:id/destination {destination} (US-19, FR-RTE-06). */
export async function chooseDestination(
  token: string,
  id: string,
  destination: Destination,
): Promise<
  ListingAnswer<{ kind: 'ok'; listing: Listing } | { kind: 'notEligible' } | { kind: 'pickupEnded' }>
> {
  const result = await protectedCall(
    listingPath(id, '/destination'),
    { method: 'POST', body: JSON.stringify({ destination }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  // D-68: a Quick Post whose pickup has ended can no longer change its destination.
  if (result.status === 409 && result.data?.error === 'pickup_ended') return { kind: 'pickupEnded' };
  if (result.status === 409) return { kind: 'notEligible' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', listing: result.data as unknown as Listing }
    : { kind: 'unexpected' };
}

/** POST /listings/:id/unfit {unfitForPeople} (US-19, FR-RTE-07). */
export async function markUnfit(
  token: string,
  id: string,
  unfitForPeople: boolean,
): Promise<ListingAnswer<{ kind: 'ok'; listing: Listing }>> {
  const result = await protectedCall(
    listingPath(id, '/unfit'),
    { method: 'POST', body: JSON.stringify({ unfitForPeople }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', listing: result.data as unknown as Listing }
    : { kind: 'unexpected' };
}

// ---------------------------------------------------------------------------------------------------------------
// Consumer offers (US-26, FR-RES-01, FR-RTE-08, FR-RTE-09, decision D-65).

/** Where an offer is picked up; offers with the same key are one pin on the map. */
export interface OfferPlace {
  key: string;
  branchId: string | null;
  shopName: string;
  branchName: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface Offer {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: Language | null;
  foodType: string | null;
  foodCategory: ListingFoodCategory;
  isQuickPost: boolean;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: string;
  pickupEnd: string;
  // D-73: customers are not shown the perishability category; the pickup window says when to come.
  /** null on the product page (no consumer location sent). */
  distanceMeters: number | null;
  place: OfferPlace;
}

/** The distance used and the slider range, from the settings row FR-RES-01. */
export interface SearchRadius {
  km: number;
  defaultKm: number;
  minKm: number;
  maxKm: number;
  stepKm: number;
}

/**
 * GET /listings/nearby: offers near a point, in the FR-RTE-08 / FR-RTE-09 order. Without radiusKm: the default.
 * D-87: optional filters, a maximum price and "I can pick up by" a time.
 */
export async function getNearbyOffers(
  token: string,
  query: { latitude: number; longitude: number; radiusKm?: number; maxPrice?: number; pickupBy?: string },
): Promise<Protected<{ kind: 'ok'; radius: SearchRadius; offers: Offer[] }>> {
  const params = new URLSearchParams({
    latitude: String(query.latitude),
    longitude: String(query.longitude),
  });
  if (query.radiusKm !== undefined) params.set('radiusKm', String(query.radiusKm));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.pickupBy !== undefined) params.set('pickupBy', query.pickupBy);
  const result = await protectedCall(`/listings/nearby?${params.toString()}`, {}, token);
  if (result.kind !== 'response') return result;
  const data = result.data;
  return result.status === 200 && data !== null && Array.isArray(data.offers)
    ? { kind: 'ok', radius: data.radius as SearchRadius, offers: data.offers as Offer[] }
    : { kind: 'unexpected' };
}

/** GET /listings/nearby/:id: the product page; notFound when it is no longer offered. */
export async function getOffer(
  token: string,
  id: string,
): Promise<Protected<{ kind: 'ok'; offer: Offer } | { kind: 'notFound' }>> {
  const result = await protectedCall(`/listings/nearby/${encodeURIComponent(id)}`, {}, token);
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', offer: result.data as unknown as Offer }
    : { kind: 'unexpected' };
}
