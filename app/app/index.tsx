// Welcome screen (US-09, US-01, US-02, US-03): logo, welcome message, English / العربية switch, the role selection
// (Consumer, Vendor, Partner, Administrator), then Register and Log in.
// The language can be switched here before registration or login (FR-ACC-09, IF-UI-02).
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Logo } from '@/components/Logo';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { Screen } from '@/components/Screen';
import { ServerStatus } from '@/components/ServerStatus';
import { colors, radius, spacing } from '@/theme';

// D-30: the user first says who they are, then registers or logs in. Partners choose Charity or Composting on the
// Register screen. Administrators only log in: their accounts are created by the team (SRS 2.7).
const WELCOME_ROLES = ['consumer', 'vendor', 'partner', 'admin'] as const;
type WelcomeRole = (typeof WELCOME_ROLES)[number];

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [role, setRole] = useState<WelcomeRole | null>(null);
  const [showLoginNote, setShowLoginNote] = useState(false);

  return (
    <Screen edges={['top']} backgroundColor={colors.primary}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.hero}>
          <View style={styles.topBar}>
            <LanguageSwitch tone="onDark" compact />
          </View>
          <Logo width={180} />
        </View>

        <View style={styles.card}>
          <View style={styles.texts}>
            <AppText variant="title">{t('welcome.title')}</AppText>
            <AppText color="textMuted">{t('welcome.message')}</AppText>
          </View>

          <OptionList<WelcomeRole>
            testID="welcome-roles"
            label={t('welcome.roleLabel')}
            options={WELCOME_ROLES.map((value) => ({
              value,
              label: t(`welcome.roles.${value}`),
              description: t(`welcome.roles.${value}Description`),
            }))}
            selected={role === null ? [] : [role]}
            onToggle={(next) => {
              setRole(next);
              setShowLoginNote(false);
            }}
          />

          {role !== null ? (
            <View style={styles.actions}>
              {role === 'admin' ? (
                <Notice tone="info" message={t('welcome.adminNote')} />
              ) : (
                <Button
                  testID="welcome-register"
                  label={t('welcome.register')}
                  accessibilityHint={t('welcome.registerHint')}
                  onPress={() => {
                    router.push({ pathname: '/register', params: { role } });
                  }}
                />
              )}
              {/* Log in is US-04 (turn 3). Until then the button only explains that it is coming. */}
              <Button
                testID="welcome-login"
                variant="secondary"
                label={t('welcome.login')}
                accessibilityHint={t('welcome.loginHint')}
                onPress={() => {
                  setShowLoginNote(true);
                }}
              />
              {showLoginNote ? <Notice tone="info" message={t('welcome.loginComingSoon')} /> : null}
            </View>
          ) : null}

          <View style={styles.footer}>
            <ServerStatus />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  card: {
    flex: 1,
    marginTop: -spacing.xl,
    backgroundColor: colors.background,
    borderTopStartRadius: radius.lg + 8,
    borderTopEndRadius: radius.lg + 8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  texts: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.md,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
