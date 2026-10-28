// US-04: Log out in the header of every screen while logged in (FR-ACC-04, IF-COM-03). It ends the session on the
// server, forgets the token on the phone and returns to the Welcome screen.
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from './Button';

export function LogoutButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token, signOut } = useAuth();
  if (token === null) return null;

  return (
    <Button
      testID="header-logout"
      variant="link"
      label={t('session.logout')}
      accessibilityHint={t('session.logoutHint')}
      onPress={() => {
        void signOut().then(() => {
          router.dismissTo('/');
        });
      }}
    />
  );
}
