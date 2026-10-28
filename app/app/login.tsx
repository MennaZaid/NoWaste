// Log in screen (US-04, FR-ACC-04). One field takes the email address or the mobile number, plus the password.
// Every wrong login gets the same message, which does not say which credential was wrong; it also covers the
// NFR-09d lockout (E-ACC-03). After login the home screen of the user's role opens in the account's language.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { login } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { spacing } from '@/theme';

type Problem = 'invalid' | 'unreachable' | 'unexpected';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { signIn } = useAuth();
  // The Register screen passes the email or number that is already registered (E-ACC-01).
  const params = useLocalSearchParams<{ identifier?: string }>();
  const [identifier, setIdentifier] = useState(params.identifier ?? '');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<{ identifier: boolean; password: boolean }>({
    identifier: false,
    password: false,
  });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setProblem(null);
    const blank = { identifier: identifier.trim() === '', password: password === '' };
    setMissing(blank);
    if (blank.identifier || blank.password) return;

    setSubmitting(true);
    const result = await login(identifier.trim(), password);
    if (result.kind === 'ok') {
      await signIn(result.token, result.user);
      setSubmitting(false);
      router.replace('/home');
      return;
    }
    setSubmitting(false);
    setProblem(result.kind);
  }

  return (
    <Screen scroll>
      <View testID="login-screen" style={[styles.form, { direction }]}>
        <AppText color="textMuted">{t('login.intro')}</AppText>

        {problem !== null ? (
          <Notice
            testID="login-problem"
            tone="error"
            message={
              problem === 'invalid'
                ? t('errors.loginInvalid')
                : problem === 'unreachable'
                  ? t('errors.unreachable')
                  : t('errors.unexpected')
            }
          />
        ) : null}

        <TextField
          testID="login-identifier"
          label={t('login.identifierLabel')}
          placeholder={t('login.identifierPlaceholder')}
          value={identifier}
          onChangeText={(text) => {
            setIdentifier(text);
            setMissing((current) => ({ ...current, identifier: false }));
          }}
          error={missing.identifier ? t('errors.identifierRequired') : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          testID="login-password"
          label={t('login.passwordLabel')}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setMissing((current) => ({ ...current, password: false }));
          }}
          error={missing.password ? t('errors.passwordRequired') : undefined}
          password
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => {
            void submit();
          }}
        />
        <Button
          testID="login-submit"
          label={t('login.submit')}
          busyLabel={t('login.submitting')}
          busy={submitting}
          onPress={() => {
            void submit();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
});
