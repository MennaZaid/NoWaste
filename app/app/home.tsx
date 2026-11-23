// Home screen after login (US-04), one per role group: consumer, vendor, partner (charity, composting, other) and
// administrator. The consumer home is the map of nearby offers (US-26, D-65); a charity partner gets its Donation
// offers and pickups (US-22, D-108) and a composting partner its Compost offers (US-24, D-111); "other" partners
// still see a placeholder.
// E-ACC-05: a Pending or Rejected vendor or partner sees the application status and no food functions.
// E-ACC-06: a Suspended account sees that it is suspended. The administrator home lists Pending applications (US-07).
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Edge } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { roleGroupOf, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ApplicationsList } from '@/components/ApplicationsList';
import { ConsumerHome } from '@/components/ConsumerHome';
import { Notice } from '@/components/Notice';
import { PartnerHome } from '@/components/PartnerHome';
import { RejectedApplication } from '@/components/RejectedApplication';
import { HomeHeader } from '@/components/HomeHeader';
import { Screen } from '@/components/Screen';
import { VendorHome } from '@/components/VendorHome';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

// No navigation header on this screen (D-53): it pads the top safe area and draws HomeHeader itself.
const EDGES: Edge[] = ['top', 'bottom'];

export default function HomeScreen() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { phase, token, user, suspended } = useAuth();
  // Set by the application details screen after a decision (US-07).
  const { decided } = useLocalSearchParams<{ decided?: string }>();
  const router = useRouter();

  if (phase === 'restoring') {
    return (
      <Screen contentStyle={styles.center} edges={EDGES}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (token === null) return <Redirect href="/" />;

  const box = [styles.content, { direction }];

  if (suspended || user?.status === 'Suspended' || user === null) {
    return (
      <Screen scroll edges={EDGES} header={<HomeHeader />}>
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
      <Screen scroll edges={EDGES} header={<HomeHeader />}>
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
          {/* D-105: the reason, the support contact and Fix and send again. */}
          {user.status === 'Rejected' ? <RejectedApplication /> : null}
        </View>
      </Screen>
    );
  }

  if (group === 'admin') {
    return (
      <Screen scroll edges={EDGES} header={<HomeHeader />}>
        <View testID="home-admin" style={box}>
          <AppText variant="heading" accessibilityRole="header">
            {t('admin.pendingTitle')}
          </AppText>
          {decided === 'approved' || decided === 'rejected' ? (
            <Notice tone="info" message={t(`admin.${decided}`)} />
          ) : null}
          <ApplicationsList />
          {/* US-45 (D-107): the administrator sets the Ramadan iftar and suhoor times. */}
          <Button
            testID="admin-ramadan"
            variant="secondary"
            label={t('ramadan.adminOpen')}
            onPress={() => {
              router.push('/admin/ramadan');
            }}
          />
        </View>
      </Screen>
    );
  }

  // D-65: the consumer home is a full-screen map with a panel at the bottom, so it does not scroll.
  if (group === 'consumer') {
    return (
      <Screen edges={EDGES} header={<HomeHeader profile />}>
        <View testID="home-consumer" style={styles.fill}>
          <ConsumerHome />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={EDGES} header={<HomeHeader />}>
      <View testID={`home-${group}`} style={box}>
        {group === 'vendor' ? (
          <VendorHome />
        ) : user.role === 'charity' || user.role === 'composting' ? (
          <PartnerHome />
        ) : (
          <AppText>{t(`home.${group}`)}</AppText>
        )}
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
  fill: {
    flex: 1,
  },
});
