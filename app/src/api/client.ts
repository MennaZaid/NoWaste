// Client for the SDD IApi (REST, SDD 3.2.3). The base URL comes from app/.env (EXPO_PUBLIC_API_URL).
import type {
  AcceptedFoodType,
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
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
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
