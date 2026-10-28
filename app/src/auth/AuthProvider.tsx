// US-04: the login session for the whole app (FR-ACC-04, FR-ACC-09, IF-COM-03, E-ACC-06). The token lives in
// expo-secure-store; on start a saved token is checked with GET /users/me.
// Decision D-39: logging in never changes the language. The app keeps the language the user is using on the phone,
// and the account is updated to it (PATCH /users/me) when it differs, as is any language chosen while logged in.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Language } from '@nowaste/shared';
import { getMe, logout as logoutOnServer, updateMyLanguage, type SessionUser } from '@/api/client';
import { useLanguage } from '@/i18n/LanguageProvider';
import { deleteToken, loadToken, saveToken } from './tokenStorage';

type Phase = 'restoring' | 'ready';

interface AuthContextValue {
  phase: Phase;
  token: string | null;
  /** Null while signed out, and for a saved session of an account that is now suspended. */
  user: SessionUser | null;
  /** E-ACC-06: the server refused the saved session because the account is suspended. */
  suspended: boolean;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  /** Ends the session on the server (when reachable) and forgets the token on the phone. */
  signOut: () => Promise<void>;
  /** The server said the session has ended (401): forget it without calling the server. */
  sessionEnded: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface State {
  phase: Phase;
  token: string | null;
  user: SessionUser | null;
  suspended: boolean;
}

const signedOut: State = { phase: 'ready', token: null, user: null, suspended: false };

export function AuthProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [state, setState] = useState<State>({ ...signedOut, phase: 'restoring' });
  // The language the account has on the server (FR-ACC-09). When the phone's language differs, the effect below
  // saves the phone's language on the account.
  const accountLanguage = useRef<Language | null>(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      const token = await loadToken();
      if (token === null) {
        if (active) setState(signedOut);
        return;
      }
      const result = await getMe(token);
      if (!active) return;
      if (result.kind === 'ok') {
        accountLanguage.current = result.user.language;
        if (active) setState({ phase: 'ready', token, user: result.user, suspended: false });
      } else if (result.kind === 'suspended') {
        setState({ phase: 'ready', token, user: null, suspended: true });
      } else {
        // IF-COM-03: an ended session is forgotten. Offline: the token is kept for the next start.
        if (result.kind === 'unauthorized') await deleteToken();
        if (active) setState(signedOut);
      }
    }
    void restore();
    return () => {
      active = false;
    };
    // Restore once, when the app starts.
  }, []);

  // FR-ACC-09 (D-39): the phone's language is saved on the account after login, and whenever it is switched while
  // logged in.
  const { token, user } = state;
  useEffect(() => {
    if (token === null || user === null || accountLanguage.current === language) return;
    accountLanguage.current = language;
    void updateMyLanguage(token, language);
  }, [language, token, user]);

  const signIn = useCallback(async (nextToken: string, nextUser: SessionUser) => {
    await saveToken(nextToken);
    // D-39: keep the language the user is using; the effect above updates the account if it differs.
    accountLanguage.current = nextUser.language;
    setState({ phase: 'ready', token: nextToken, user: nextUser, suspended: false });
  }, []);

  const sessionEnded = useCallback(async () => {
    await deleteToken();
    setState(signedOut);
  }, []);

  const signOut = useCallback(async () => {
    if (token !== null) await logoutOnServer(token);
    await sessionEnded();
  }, [token, sessionEnded]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, sessionEnded }),
    [state, signIn, signOut, sessionEnded],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The four role groups (NFR-09c); charity, composting and other partners share the partner screens. */
export type RoleGroup = 'consumer' | 'vendor' | 'partner' | 'admin';

export function roleGroupOf(role: SessionUser['role']): RoleGroup {
  return role === 'charity' || role === 'composting' || role === 'other' ? 'partner' : role;
}
