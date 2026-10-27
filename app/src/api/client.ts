// Client for the SDD IApi (REST, SDD 3.2.3). The base URL comes from app/.env (EXPO_PUBLIC_API_URL).
import type {
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

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${getApiBaseUrl()}${path}`, { ...init, signal: controller.signal });
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

/** POST /auth/register with role vendor (US-02) or charity / composting (US-03). */
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
    response = await request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
