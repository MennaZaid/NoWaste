// US-07: the Pending vendor and partner applications on the administrator home (FR-ACC-07). Each one opens the
// application details. The list is loaded again whenever the screen comes back into view, so a decided
// application disappears.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { listApplications, type Application } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';

/** The name an administrator knows the applicant by: the shop or the organisation. */
export function applicantName(application: Application): string {
  return application.vendorProfile?.shopName ?? application.partnerProfile?.organisationName ?? '';
}

/** "Vendor · Informal", "Charity partner" or "Other partner: <written type>". */
export function useApplicantType(): (application: Application) => string {
  const { t } = useTranslation();
  return (application) => {
    if (application.vendorProfile !== null) {
      const type =
        application.vendorProfile.vendorType === 'formal' ? t('vendor.typeFormal') : t('vendor.typeInformal');
      return t('admin.vendorLine', { type });
    }
    if (application.role === 'other') {
      return t('admin.otherPartnerLine', { text: application.partnerProfile?.otherPartnerType ?? '' });
    }
    return t(`accountTypes.${application.role}`);
  };
}

type Load = { kind: 'loading' } | { kind: 'ok'; applications: Application[] } | { kind: 'failed' };

export function ApplicationsList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token, sessionEnded } = useAuth();
  const typeOf = useApplicantType();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const refresh = useCallback(() => {
    if (token === null) return () => undefined;
    let active = true;
    void listApplications(token, 'Pending').then(async (result) => {
      if (!active) return;
      if (result.kind === 'ok') {
        setLoad({ kind: 'ok', applications: result.applications });
      } else if (result.kind === 'unauthorized') {
        await sessionEnded();
        router.replace('/');
      } else {
        setLoad({ kind: 'failed' });
      }
    });
    return () => {
      active = false;
    };
  }, [token, sessionEnded, router]);

  useFocusEffect(refresh);

  if (load.kind === 'loading') return <ActivityIndicator color={colors.primary} />;
  if (load.kind === 'failed') {
    return (
      <View style={styles.list}>
        <Notice tone="error" message={t('admin.loadFailed')} />
        <Button
          variant="secondary"
          label={t('admin.retry')}
          onPress={() => {
            setLoad({ kind: 'loading' });
            refresh();
          }}
        />
      </View>
    );
  }
  if (load.applications.length === 0) return <AppText color="textMuted">{t('admin.empty')}</AppText>;

  return (
    <View testID="applications-list" style={styles.list}>
      {load.applications.map((application) => {
        const name = applicantName(application);
        const type = typeOf(application);
        const address = application.vendorProfile?.address ?? application.partnerProfile?.address ?? '';
        return (
          <Pressable
            key={application.userId}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${type}`}
            onPress={() => {
              router.push({ pathname: '/admin/[userId]', params: { userId: application.userId } });
            }}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <AppText variant="label">{name}</AppText>
            <AppText variant="caption" color="textMuted">
              {type}
            </AppText>
            <AppText variant="caption">{address}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  item: {
    minHeight: minTouchSize,
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  itemPressed: {
    backgroundColor: colors.accent,
  },
});
