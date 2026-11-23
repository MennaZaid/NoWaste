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
  RejectionReason,
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
  /** D-105: the newest rejection; on a Pending application it means the applicant sent it again. */
  lastRejection: LastRejection | null;
}

/** D-105: why an application was rejected. */
export interface LastRejection {
  reason: RejectionReason;
  note: string | null;
  rejectedAt: string;
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
  /** D-105: a rejection carries the reason and an optional note. */
  rejection?: { reason: RejectionReason; note?: string },
): Promise<
  Protected<
    | { kind: 'ok'; status: AccountStatus }
    | { kind: 'conflict'; status: AccountStatus }
    | { kind: 'invalid'; fields: ('reason' | 'note')[] }
  >
> {
  const result = await protectedCall(
    `/admin/applications/${encodeURIComponent(userId)}/${decision}`,
    rejection === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(rejection) },
    token,
  );
  if (result.kind !== 'response') return result;
  const status = result.data?.status as AccountStatus | undefined;
  if (result.status === 200 && status !== undefined) return { kind: 'ok', status };
  if (result.status === 409 && status !== undefined) return { kind: 'conflict', status };
  if (result.status === 400 && Array.isArray(result.data?.fields)) {
    return { kind: 'invalid', fields: result.data.fields as ('reason' | 'note')[] };
  }
  return { kind: 'unexpected' };
}

/** D-105: the applicant's own application (GET /users/me/application). */
export interface MyApplication {
  role: AccountRole;
  status: AccountStatus;
  vendorProfile:
    | (Omit<VendorProfile, 'branches' | 'description'> & {
        description: string | null;
        opensAt: string | null;
        closesAt: string | null;
        branches: {
          address: string;
          latitude: number;
          longitude: number;
          opensAt: string;
          closesAt: string;
        }[];
      })
    | null;
  partnerProfile: {
    organisationName: string;
    partnerType: PartnerRole;
    otherPartnerType: string | null;
    acceptedFoodTypes: AcceptedFoodType[];
    otherFoodType: string | null;
    address: string;
    latitude: number;
    longitude: number;
  } | null;
  /** Only while the application is Rejected. */
  rejection: LastRejection | null;
  supportContact: { email: string };
}

export async function getMyApplication(
  token: string,
): Promise<Protected<{ kind: 'ok'; application: MyApplication }>> {
  const result = await protectedCall('/users/me/application', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', application: result.data as unknown as MyApplication }
    : { kind: 'unexpected' };
}

/** D-105: the fixed application without the login details. */
export type ResendRequest =
  { role: 'vendor'; vendorProfile: VendorProfile } | { role: PartnerRole; partnerProfile: PartnerProfile };

/** POST /users/me/application: a Rejected application sent again; the account is Pending again. */
export async function sendApplicationAgain(
  token: string,
  body: ResendRequest,
): Promise<
  Protected<
    | { kind: 'ok'; user: SessionUser }
    | { kind: 'invalid'; fields: SignUpField[] }
    | { kind: 'notRejected'; status: AccountStatus }
  >
> {
  const result = await protectedCall(
    '/users/me/application',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 200 && data !== null) return { kind: 'ok', user: data as unknown as SessionUser };
  if (result.status === 400 && data?.error === 'E-ACC-02' && Array.isArray(data.fields)) {
    return { kind: 'invalid', fields: data.fields as SignUpField[] };
  }
  if (result.status === 409 && data?.error === 'not_rejected') {
    return { kind: 'notRejected', status: data.status as AccountStatus };
  }
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
  /** D-104: the pickup start may be from now up to maxDaysAhead days ahead. */
  pickupStartRule: { maxDaysAhead: number; pastGraceMinutes: number };
}

/** D-104: why the server refused a pickup start ('past', or more than maxDaysAhead days ahead). */
export type StartRefusal = { startReason?: 'past' | 'too_far'; maxDaysAhead?: number };

function startRefusal(data: Record<string, unknown>): StartRefusal {
  if (data.reason !== 'past' && data.reason !== 'too_far') return {};
  return typeof data.maxDaysAhead === 'number'
    ? { startReason: data.reason, maxDaysAhead: data.maxDaysAhead }
    : { startReason: data.reason };
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
  /** FR-RES-09 (D-101, D-102): the bag counts; on My listings and the listing page. */
  reservations?: BagCounts;
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
  | ({
      kind: 'invalid';
      fields: string[];
      hours?: { opensAt: string; closesAt: string };
      /** NFR-05b: the fields are AI-filled and were not confirmed. */
      unconfirmedAi?: boolean;
    } & StartRefusal)
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
    return {
      kind: 'invalid',
      fields: data.fields as string[],
      ...hours,
      ...unconfirmed,
      ...startRefusal(data),
    };
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
    | ({ kind: 'invalid'; fields: string[]; hours?: { opensAt: string; closesAt: string } } & StartRefusal)
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
    return { kind: 'invalid', fields: data.fields as string[], ...hours, ...startRefusal(data) };
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
): Promise<
  ListingAnswer<
    | { kind: 'ok'; listing: Listing }
    | { kind: 'notDraft' }
    | { kind: 'notReady' }
    // D-104: the Draft's pickup start has passed (or is too far ahead), so it is not published.
    | { kind: 'startPassed' }
    | { kind: 'startTooFar' }
  >
> {
  const result = await protectedCall(
    `/listings/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (notApproved(result)) return { kind: 'notApproved' };
  // US-18, US-19: the category must be confirmed and a destination chosen first.
  if (result.status === 409 && result.data?.error === 'not_ready_to_publish') return { kind: 'notReady' };
  if (result.status === 400 && result.data?.error === 'E-LST-04') {
    return result.data.reason === 'too_far' ? { kind: 'startTooFar' } : { kind: 'startPassed' };
  }
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
  /** D-97: the pickup slot starts a no-card customer can choose now (only on the product page). */
  pickupSlots?: string[];
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

// US-28, US-30 (SDD C-09): no-card reservations, "I'm on my way" and the warning before the BR-07 block.

export interface Reservation {
  id: string;
  method: 'card' | 'no-card';
  /** D-102: "Not collected" = still Held or Confirmed at the pickup end (shown only; the status stays until US-35). */
  status:
    | 'Pending payment'
    | 'Confirmed'
    | 'Held'
    | 'Completed'
    | 'Released'
    | 'Cancelled'
    | 'No-show'
    | 'Not collected';
  holdExpiresAt: string | null;
  /** D-97: the chosen pickup slot. */
  slotStart: string | null;
  checkedIn: boolean;
  /** FR-RES-10: the 6-digit code while the reservation is active and its slot has started (D-97), otherwise null. */
  pickupCode: string | null;
  createdAt: string;
  listing: {
    id: string;
    nameAr: string | null;
    nameEn: string | null;
    sourceLanguage: 'ar' | 'en' | null;
    price: number;
    pickupStart: string;
    pickupEnd: string;
    shopName: string;
    address: string;
  };
}

export interface NoShowStanding {
  level: 'none' | 'notice' | 'warning' | 'blocked';
  count: number;
  leftBeforeBlock: number;
  limit: number;
  withinDays: number;
  blockDays: number;
}

/**
 * POST /reservations (FR-RES-03): reserve one bag without a card. `idempotencyKey` makes a repeated tap or a retry
 * after a dropped connection return the same reservation (NFR-15).
 */
export async function reserveWithoutCard(
  token: string,
  listingId: string,
  slotStart: string,
  idempotencyKey: string,
): Promise<
  Protected<
    | { kind: 'ok'; reservation: Reservation }
    | { kind: 'soldOut' }
    | { kind: 'alreadyReserved' }
    | { kind: 'notFound' }
  >
> {
  const result = await protectedCall(
    '/reservations',
    { method: 'POST', body: JSON.stringify({ listingId, method: 'no-card', slotStart, idempotencyKey }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 409 && result.data?.error === 'E-RES-02') return { kind: 'soldOut' };
  if (result.status === 409 && result.data?.error === 'already_reserved') return { kind: 'alreadyReserved' };
  if (result.status === 404) return { kind: 'notFound' };
  return (result.status === 201 || result.status === 200) && result.data !== null
    ? { kind: 'ok', reservation: result.data as unknown as Reservation }
    : { kind: 'unexpected' };
}

/** GET /reservations/:id */
export async function getReservation(
  token: string,
  id: string,
): Promise<Protected<{ kind: 'ok'; reservation: Reservation } | { kind: 'notFound' }>> {
  const result = await protectedCall(`/reservations/${encodeURIComponent(id)}`, {}, token);
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', reservation: result.data as unknown as Reservation }
    : { kind: 'unexpected' };
}

/** POST /reservations/:id/checkin: "I'm on my way" (FR-RES-04); refused a second time or after the hold (E-RES-05). */
export async function checkInReservation(
  token: string,
  id: string,
): Promise<Protected<{ kind: 'ok'; reservation: Reservation } | { kind: 'refused' } | { kind: 'notFound' }>> {
  const result = await protectedCall(
    `/reservations/${encodeURIComponent(id)}/checkin`,
    { method: 'POST' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 409 && result.data?.error === 'E-RES-05') return { kind: 'refused' };
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', reservation: result.data as unknown as Reservation }
    : { kind: 'unexpected' };
}

/** GET /reservations/no-show-standing: the notice or warning before the BR-07 block. */
export async function getNoShowStanding(
  token: string,
): Promise<Protected<{ kind: 'ok'; standing: NoShowStanding }>> {
  const result = await protectedCall('/reservations/no-show-standing', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', standing: result.data as unknown as NoShowStanding }
    : { kind: 'unexpected' };
}

/** GET /reservations?scope=active|past: the customer's reservations (FR-RES-08, D-94). */
export async function getMyReservations(
  token: string,
  scope: 'active' | 'past',
): Promise<Protected<{ kind: 'ok'; reservations: Reservation[] }>> {
  const result = await protectedCall(`/reservations?scope=${scope}`, {}, token);
  if (result.kind !== 'response') return result;
  const data = result.data;
  return result.status === 200 && data !== null && Array.isArray(data.reservations)
    ? { kind: 'ok', reservations: data.reservations as Reservation[] }
    : { kind: 'unexpected' };
}

/** POST /users/me/password (FR-ACC-06, D-95): E-ACC-03 wrong current password, E-ACC-02 new password breaks the rules. */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<Protected<{ kind: 'ok' } | { kind: 'wrongCurrent' } | { kind: 'invalidNew' }>> {
  const result = await protectedCall(
    '/users/me/password',
    { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 204) return { kind: 'ok' };
  if (result.status === 400 && result.data?.error === 'E-ACC-03') return { kind: 'wrongCurrent' };
  if (result.status === 400 && result.data?.error === 'E-ACC-02') return { kind: 'invalidNew' };
  return { kind: 'unexpected' };
}

// US-27 pay by card (FR-RES-02, E-RES-01), decision D-99.

export type PaymentFailure =
  | 'unknown_card'
  | 'wrong_details'
  | 'expired_card'
  | 'declined'
  | 'insufficient_funds'
  | 'timeout'
  | 'invalid_token';

/**
 * POST /mock-bank/tokens: the card goes to the pretend bank only (it stands in for the payment gateway's card page) and
 * the bank answers with a one-time token. NoWaste never receives the card (NFR-10, IF-SW-02).
 */
export async function createCardToken(
  token: string,
  card: { number: string; expiry: string; cvv: string },
): Promise<
  Protected<{ kind: 'ok'; token: string } | { kind: 'invalidCard'; fields: ('number' | 'expiry' | 'cvv')[] }>
> {
  const result = await protectedCall(
    '/mock-bank/tokens',
    { method: 'POST', body: JSON.stringify(card) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 400 && result.data?.error === 'invalid_card') {
    return { kind: 'invalidCard', fields: (result.data.fields ?? []) as ('number' | 'expiry' | 'cvv')[] };
  }
  return result.status === 201 && typeof result.data?.token === 'string'
    ? { kind: 'ok', token: result.data.token }
    : { kind: 'unexpected' };
}

/** POST /reservations with method "card": only the bank's one-time token is sent (FR-RES-02, NFR-15 key). */
export async function reserveByCard(
  token: string,
  listingId: string,
  paymentToken: string,
  idempotencyKey: string,
): Promise<
  Protected<
    | { kind: 'ok'; reservation: Reservation }
    | { kind: 'paymentFailed'; reason: PaymentFailure }
    | { kind: 'soldOut' }
    | { kind: 'notFound' }
  >
> {
  const result = await protectedCall(
    '/reservations',
    { method: 'POST', body: JSON.stringify({ listingId, method: 'card', paymentToken, idempotencyKey }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 402 && result.data?.error === 'E-RES-01') {
    return { kind: 'paymentFailed', reason: result.data.reason as PaymentFailure };
  }
  if (result.status === 409 && result.data?.error === 'E-RES-02') return { kind: 'soldOut' };
  if (result.status === 404) return { kind: 'notFound' };
  return (result.status === 201 || result.status === 200) && result.data !== null
    ? { kind: 'ok', reservation: result.data as unknown as Reservation }
    : { kind: 'unexpected' };
}

// US-32 the vendor's reservations of a listing and US-33 the pickup code at the counter (FR-RES-09, FR-RES-10), D-101.

/** D-102: taken = waiting + collected + not collected (a released hold gives its bag back). */
export interface BagCounts {
  taken: number;
  collected: number;
  waiting: number;
  notCollected: number;
}

export interface VendorReservationRow {
  id: string;
  /** #1, #2, ... in the order customers reserved; no customer details are given to the vendor. */
  number: number;
  method: 'card' | 'no-card';
  status: Reservation['status'];
  slotStart: string | null;
  holdExpiresAt: string | null;
  checkedIn: boolean;
}

export interface VendorReservations {
  summary: BagCounts & { bagsTotal: number; available: number };
  reservations: VendorReservationRow[];
}

/** GET /listings/:id/reservations (the vendor's own listing). */
export async function getListingReservations(
  token: string,
  listingId: string,
): Promise<Protected<{ kind: 'ok'; view: VendorReservations } | { kind: 'notFound' }>> {
  const result = await protectedCall(`/listings/${encodeURIComponent(listingId)}/reservations`, {}, token);
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null && Array.isArray(result.data.reservations)
    ? { kind: 'ok', view: result.data as unknown as VendorReservations }
    : { kind: 'unexpected' };
}

export type PickupRefusal = 'wrong_code' | 'already_used' | 'expired' | 'not_started' | 'ended' | 'invalid';

type PickupAnswer = Protected<
  | { kind: 'ok'; reservation: Pick<VendorReservationRow, 'id' | 'number' | 'method' | 'status'> }
  // US-22 (D-110): the code was a charity's, for a Donation.
  | { kind: 'partner'; pickup: PartnerPickup }
  | { kind: 'refused'; reason: PickupRefusal; startsAt?: string }
  | { kind: 'notFound' }
>;

async function pickupCall(
  token: string,
  listingId: string,
  step: 'verify' | 'complete',
  code: string,
): Promise<PickupAnswer> {
  const result = await protectedCall(
    `/listings/${encodeURIComponent(listingId)}/pickups/${step}`,
    { method: 'POST', body: JSON.stringify({ code }) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 400) return { kind: 'refused', reason: 'invalid' };
  if (result.status === 409 && result.data?.error === 'E-RES-03') {
    const startsAt = result.data.startsAt;
    return {
      kind: 'refused',
      reason: result.data.reason as PickupRefusal,
      ...(typeof startsAt === 'string' ? { startsAt } : {}),
    };
  }
  if (result.status === 404) return { kind: 'notFound' };
  const partnerPickup = result.data?.partnerPickup;
  if (result.status === 200 && typeof partnerPickup === 'object' && partnerPickup !== null) {
    return { kind: 'partner', pickup: partnerPickup as unknown as PartnerPickup };
  }
  const reservation = result.data?.reservation;
  return result.status === 200 && typeof reservation === 'object' && reservation !== null
    ? {
        kind: 'ok',
        reservation: reservation as Pick<VendorReservationRow, 'id' | 'number' | 'method' | 'status'>,
      }
    : { kind: 'unexpected' };
}

/** POST /listings/:id/pickups/verify: which reservation the typed code belongs to (nothing changes). */
export function verifyPickup(token: string, listingId: string, code: string): Promise<PickupAnswer> {
  return pickupCall(token, listingId, 'verify', code);
}

/** POST /listings/:id/pickups/complete: the bag is handed over (Completed). */
export function completePickup(token: string, listingId: string, code: string): Promise<PickupAnswer> {
  return pickupCall(token, listingId, 'complete', code);
}

/** US-45 Ramadan mode (FR-TGI-08, D-107): the times the administrator set, and the next iftar and suhoor. */
export type RamadanView =
  | { set: false; leadMinutes: number }
  | { set: true; iftar: string; suhoor: string; leadMinutes: number; iftarAt: string; suhoorAt: string };

function isRamadanView(data: unknown): data is RamadanView {
  return typeof data === 'object' && data !== null && typeof (data as { set?: unknown }).set === 'boolean';
}

/** GET /ramadan (consumers and the administrator). */
export async function getRamadan(token: string): Promise<Protected<{ kind: 'ok'; ramadan: RamadanView }>> {
  const result = await protectedCall('/ramadan', {}, token);
  if (result.kind !== 'response') return result;
  return result.status === 200 && isRamadanView(result.data)
    ? { kind: 'ok', ramadan: result.data }
    : { kind: 'unexpected' };
}

/** PATCH /admin/ramadan {iftar, suhoor} (administrator). 400 names the invalid fields. */
export async function setRamadanTimes(
  token: string,
  times: { iftar: string; suhoor: string },
): Promise<
  Protected<{ kind: 'ok'; ramadan: RamadanView } | { kind: 'invalid'; fields: ('iftar' | 'suhoor')[] }>
> {
  const result = await protectedCall(
    '/admin/ramadan',
    { method: 'PATCH', body: JSON.stringify(times) },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 200 && isRamadanView(result.data)) return { kind: 'ok', ramadan: result.data };
  if (result.status === 400 && Array.isArray(result.data?.fields)) {
    return { kind: 'invalid', fields: result.data.fields as ('iftar' | 'suhoor')[] };
  }
  return { kind: 'unexpected' };
}

// US-22 Charity pickup (FR-RTE-10, E-RTE-03, E-RTE-04), decisions D-108 to D-110.

/** A Donation (charities) or Compost offer (composting partners, US-24) a partner can take. */
export interface PartnerOffer {
  listingId: string;
  listingType: 'Donation' | 'Compost offer';
  shopName: string;
  address: string;
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: Language | null;
  foodCategory: string | null;
  bags: number;
  pickupStart: string;
  pickupEnd: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
}

/** A pickup a charity accepted. The vendor gets it without the code. */
export interface PartnerPickup {
  id: string;
  listingId: string;
  organisationName: string;
  status: 'Accepted' | 'Completed' | 'Cancelled';
  listingType: 'Donation' | 'Compost offer';
  pickupTime: string;
  pickupCode: string | null;
  shopName: string;
  address: string;
  nameAr: string | null;
  nameEn: string | null;
  sourceLanguage: Language | null;
  foodCategory: string | null;
  bags: number;
  pickupStart: string;
  pickupEnd: string;
  latitude: number;
  longitude: number;
}

/** GET /partner/offers: not_food_partner for "other" partners (D-111). */
export async function getPartnerOffers(
  token: string,
): Promise<Protected<{ kind: 'ok'; offers: PartnerOffer[] } | { kind: 'notFoodPartner' }>> {
  const result = await protectedCall('/partner/offers', { method: 'GET' }, token);
  if (result.kind !== 'response') return result;
  if (result.status === 403 && result.data?.error === 'not_food_partner') return { kind: 'notFoodPartner' };
  const offers = result.data?.offers;
  return result.status === 200 && Array.isArray(offers)
    ? { kind: 'ok', offers: offers as unknown as PartnerOffer[] }
    : { kind: 'unexpected' };
}

/** GET /partner/offers/:id */
export async function getPartnerOffer(
  token: string,
  listingId: string,
): Promise<Protected<{ kind: 'ok'; offer: PartnerOffer } | { kind: 'notFound' }>> {
  const result = await protectedCall(
    `/partner/offers/${encodeURIComponent(listingId)}`,
    { method: 'GET' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', offer: result.data as unknown as PartnerOffer }
    : { kind: 'unexpected' };
}

/** POST /partner/offers/:id/accept {pickupTime}: E-RTE-03 gives the allowed times, E-RTE-04 that it was taken. */
export async function acceptPartnerOffer(
  token: string,
  listingId: string,
  pickupTime: string,
): Promise<
  Protected<
    | { kind: 'ok'; pickup: PartnerPickup }
    | { kind: 'outsideWindow'; earliest?: string; latest?: string }
    | { kind: 'taken' }
    | { kind: 'notFound' }
  >
> {
  const result = await protectedCall(
    `/partner/offers/${encodeURIComponent(listingId)}/accept`,
    { method: 'POST', body: JSON.stringify({ pickupTime }) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 201 && data !== null) return { kind: 'ok', pickup: data as unknown as PartnerPickup };
  if (result.status === 400 && data?.error === 'E-RTE-03') {
    return {
      kind: 'outsideWindow',
      ...(typeof data.earliest === 'string' ? { earliest: data.earliest } : {}),
      ...(typeof data.latest === 'string' ? { latest: data.latest } : {}),
    };
  }
  if (result.status === 409 && data?.error === 'E-RTE-04') return { kind: 'taken' };
  if (result.status === 404) return { kind: 'notFound' };
  return { kind: 'unexpected' };
}

/** GET /partner/pickups: the charity's pickups, the newest first. */
export async function getPartnerPickups(
  token: string,
): Promise<Protected<{ kind: 'ok'; pickups: PartnerPickup[] } | { kind: 'notFoodPartner' }>> {
  const result = await protectedCall('/partner/pickups', { method: 'GET' }, token);
  if (result.kind !== 'response') return result;
  if (result.status === 403 && result.data?.error === 'not_food_partner') return { kind: 'notFoodPartner' };
  const pickups = result.data?.pickups;
  return result.status === 200 && Array.isArray(pickups)
    ? { kind: 'ok', pickups: pickups as unknown as PartnerPickup[] }
    : { kind: 'unexpected' };
}

/** POST /partner/pickups/:id/cancel ("Partner cancels"). */
export async function cancelPartnerPickup(
  token: string,
  pickupId: string,
): Promise<
  Protected<{ kind: 'ok'; pickup: PartnerPickup } | { kind: 'notCancellable' } | { kind: 'notFound' }>
> {
  const result = await protectedCall(
    `/partner/pickups/${encodeURIComponent(pickupId)}/cancel`,
    { method: 'POST' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 409) return { kind: 'notCancellable' };
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', pickup: result.data as unknown as PartnerPickup }
    : { kind: 'unexpected' };
}

/** GET /listings/:id/partner-pickup: the charity that collects a Donation, for the vendor (no code). */
export async function getListingPartnerPickup(
  token: string,
  listingId: string,
): Promise<Protected<{ kind: 'ok'; pickup: PartnerPickup | null }>> {
  const result = await protectedCall(
    `/listings/${encodeURIComponent(listingId)}/partner-pickup`,
    { method: 'GET' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status !== 200 || result.data === null) return { kind: 'unexpected' };
  const pickup = result.data.pickup;
  return {
    kind: 'ok',
    pickup: typeof pickup === 'object' && pickup !== null ? (pickup as unknown as PartnerPickup) : null,
  };
}

// US-23 Automatic charity offers (FR-RTE-11, D-112).

/** GET /vendors/me/auto-charity */
export async function getAutoCharity(token: string): Promise<Protected<{ kind: 'ok'; optIn: boolean }>> {
  const result = await protectedCall('/vendors/me/auto-charity', { method: 'GET' }, token);
  if (result.kind !== 'response') return result;
  const optIn = result.data?.autoCharityOptIn;
  return result.status === 200 && typeof optIn === 'boolean' ? { kind: 'ok', optIn } : { kind: 'unexpected' };
}

/** PATCH /vendors/me/auto-charity {optIn} */
export async function setAutoCharity(
  token: string,
  optIn: boolean,
): Promise<Protected<{ kind: 'ok'; optIn: boolean }>> {
  const result = await protectedCall(
    '/vendors/me/auto-charity',
    { method: 'PATCH', body: JSON.stringify({ optIn }) },
    token,
  );
  if (result.kind !== 'response') return result;
  const value = result.data?.autoCharityOptIn;
  return result.status === 200 && typeof value === 'boolean'
    ? { kind: 'ok', optIn: value }
    : { kind: 'unexpected' };
}

/** GET /listings/:id/auto-charity: when the unreserved bags were offered to charities, or null. */
export async function getListingAutoOffer(
  token: string,
  listingId: string,
): Promise<Protected<{ kind: 'ok'; offer: { offeredAt: string; bags: number } | null }>> {
  const result = await protectedCall(
    `/listings/${encodeURIComponent(listingId)}/auto-charity`,
    { method: 'GET' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status !== 200 || result.data === null) return { kind: 'unexpected' };
  const offer = result.data.offer as { offeredAt?: unknown; bags?: unknown } | null | undefined;
  return typeof offer?.offeredAt === 'string' && typeof offer.bags === 'number'
    ? { kind: 'ok', offer: { offeredAt: offer.offeredAt, bags: offer.bags } }
    : { kind: 'ok', offer: null };
}

// US-43 Zakat donation and receipt (FR-TGI-05, FR-TGI-06, E-TGI-02), decisions D-113 to D-116.

export interface ZakatCharity {
  id: string;
  name: string;
  distanceMeters: number;
}

export interface ZakatReceipt {
  id: string;
  receiptNumber: string;
  status: 'Paid' | 'Delivered' | 'Refunded';
  shopName: string;
  foodName: string;
  nameAr: string | null;
  nameEn: string | null;
  bags: number;
  amount: number;
  charityName: string;
  createdAt: string;
  deliveredAt: string | null;
  refundedAt: string | null;
}

/** GET /listings/nearby/:id/charities: the charities that accept the offer's food type. */
export async function getZakatCharities(
  token: string,
  listingId: string,
): Promise<Protected<{ kind: 'ok'; charities: ZakatCharity[] } | { kind: 'notFound' }>> {
  const result = await protectedCall(
    `/listings/nearby/${encodeURIComponent(listingId)}/charities`,
    { method: 'GET' },
    token,
  );
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  const charities = result.data?.charities;
  return result.status === 200 && Array.isArray(charities)
    ? { kind: 'ok', charities: charities as unknown as ZakatCharity[] }
    : { kind: 'unexpected' };
}

/** POST /listings/nearby/:id/zakat: pays for the bags with the bank's one-time token and gives them as Zakat. */
export async function donateZakat(
  token: string,
  listingId: string,
  body: { charityId: string; bags: number; paymentToken: string },
): Promise<
  Protected<
    | { kind: 'ok'; receipt: ZakatReceipt }
    | { kind: 'paymentFailed'; reason: PaymentFailure }
    | { kind: 'notEnoughBags' }
    | { kind: 'invalid'; fields: string[] }
    | { kind: 'notFound' }
  >
> {
  const result = await protectedCall(
    `/listings/nearby/${encodeURIComponent(listingId)}/zakat`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
  if (result.kind !== 'response') return result;
  const data = result.data;
  if (result.status === 201 && data !== null) return { kind: 'ok', receipt: data as unknown as ZakatReceipt };
  if (result.status === 402 && data?.error === 'E-TGI-02') {
    return { kind: 'paymentFailed', reason: data.reason as PaymentFailure };
  }
  if (result.status === 409 && data?.error === 'E-RES-02') return { kind: 'notEnoughBags' };
  if (result.status === 400 && Array.isArray(data?.fields))
    return { kind: 'invalid', fields: data.fields as string[] };
  if (result.status === 404) return { kind: 'notFound' };
  return { kind: 'unexpected' };
}

/** GET /zakat: the consumer's Zakat receipts, the newest first. */
export async function getMyZakat(
  token: string,
): Promise<Protected<{ kind: 'ok'; receipts: ZakatReceipt[] }>> {
  const result = await protectedCall('/zakat', { method: 'GET' }, token);
  if (result.kind !== 'response') return result;
  const receipts = result.data?.receipts;
  return result.status === 200 && Array.isArray(receipts)
    ? { kind: 'ok', receipts: receipts as unknown as ZakatReceipt[] }
    : { kind: 'unexpected' };
}

/** GET /zakat/:id: one receipt. */
export async function getZakatReceipt(
  token: string,
  id: string,
): Promise<Protected<{ kind: 'ok'; receipt: ZakatReceipt } | { kind: 'notFound' }>> {
  const result = await protectedCall(`/zakat/${encodeURIComponent(id)}`, { method: 'GET' }, token);
  if (result.kind !== 'response') return result;
  if (result.status === 404) return { kind: 'notFound' };
  return result.status === 200 && result.data !== null
    ? { kind: 'ok', receipt: result.data as unknown as ZakatReceipt }
    : { kind: 'unexpected' };
}
