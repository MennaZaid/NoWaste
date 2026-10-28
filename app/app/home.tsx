// Home screen after login (US-04), one per role group: consumer, vendor, partner (charity, composting, other) and
// administrator. The consumer, vendor and partner homes are placeholders until their stories (US-10 onwards).
// E-ACC-05: a Pending or Rejected vendor or partner sees the application status and no food functions.
// E-ACC-06: a Suspended account sees that it is suspended. The administrator home lists Pending applications (US-07).
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { roleGroupOf, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { ApplicationsList } from '@/components/ApplicationsList';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { phase, token, user, suspended } = useAuth();
  // Set by the application details screen after a decision (US-07).
  const { decided } = useLocalSearchParams<{ decided?: string }>();

  if (phase === 'restoring') {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (token === null) return <Redirect href="/" />;

  const box = [styles.content, { direction }];

  if (suspended || user?.status === 'Suspended' || user === null) {
    return (
      <Screen scroll>
        <View testID="home-suspended" style={box}>
          <AppText variant="heading" accessibilityRole="header">
            {t('home.suspendedTitle')}
          </AppText>
          <Notice tone="error" message={t('home.suspended')} />
        </View>
      </Screen>
    );
  }

  const group = roleGroupOf(user.role);

  if ((group === 'vendor' || group === 'partner') && user.status !== 'Approved') {
    return (
      <Screen scroll>
        <View testID="home-application-status" style={box}>
          <AppText variant="heading" accessibilityRole="header">
            {t('home.applicationTitle')}
          </AppText>
          <Notice
            tone={user.status === 'Rejected' ? 'error' : 'info'}
            message={
              user.status === 'Rejected' ? t('home.applicationRejected') : t('home.applicationPending')
            }
          />
          <AppText color="textMuted">{t('home.noFoodUntilApproved')}</AppText>
        </View>
      </Screen>
    );
  }

  if (group === 'admin') {
    return (
      <Screen scroll>
        <View testID="home-admin" style={box}>
          <AppText variant="heading" accessibilityRole="header">
            {t('admin.pendingTitle')}
          </AppText>
          {decided === 'approved' || decided === 'rejected' ? (
            <Notice tone="info" message={t(`admin.${decided}`)} />
          ) : null}
          <ApplicationsList />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View testID={`home-${group}`} style={box}>
        <AppText>{t(`home.${group}`)}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    gap: spacing.lg,
  },
});
