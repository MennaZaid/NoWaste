// US-07: one vendor or partner application for the administrator (FR-ACC-07): the details, a map with the pin and
// Approve or Reject. Each decision is confirmed first, because it cannot be undone here (only Pending can change).
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { decideApplication, listApplications, type Application } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { applicantName, useApplicantType } from '@/components/ApplicationsList';
import { Button } from '@/components/Button';
import { MapView } from '@/components/MapView';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

type Decision = 'approve' | 'reject';
type Load =
  { kind: 'loading' } | { kind: 'ok'; application: Application } | { kind: 'gone' } | { kind: 'failed' };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

export default function ApplicationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language, direction } = useLanguage();
  const { token, sessionEnded } = useAuth();
  const typeOf = useApplicantType();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (token === null) return undefined;
      let active = true;
      void listApplications(token, 'Pending').then(async (result) => {
        if (!active) return;
        if (result.kind === 'ok') {
          const found = result.applications.find((item) => item.userId === userId);
          setLoad(found === undefined ? { kind: 'gone' } : { kind: 'ok', application: found });
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
    }, [token, userId, sessionEnded, router]),
  );

  async function decide(decision: Decision) {
    if (token === null) return;
    setBusy(true);
    setMessage(null);
    const result = await decideApplication(token, userId, decision);
    setBusy(false);
    setConfirming(null);
    if (result.kind === 'ok') {
      router.dismissTo({
        pathname: '/home',
        params: { decided: result.status === 'Approved' ? 'approved' : 'rejected' },
      });
    } else if (result.kind === 'conflict') {
      setMessage(t('admin.conflict', { status: t(`statuses.${result.status}`) }));
    } else if (result.kind === 'unauthorized') {
      await sessionEnded();
      router.replace('/');
    } else {
      setMessage(t('admin.decideFailed'));
    }
  }

  if (load.kind === 'loading') {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (load.kind !== 'ok') {
    return (
      <Screen scroll>
        <Notice
          tone={load.kind === 'gone' ? 'info' : 'error'}
          message={t(`admin.${load.kind === 'gone' ? 'gone' : 'loadFailed'}`)}
        />
      </Screen>
    );
  }

  const { application } = load;
  const vendor = application.vendorProfile;
  const partner = application.partnerProfile;
  const place = vendor ?? partner;
  const pin = place === null ? null : { latitude: place.latitude, longitude: place.longitude };
  const separator = language === 'ar' ? '، ' : ', ';
  const foodTypes =
    partner === null
      ? ''
      : [
          ...partner.acceptedFoodTypes.map((type) => t(`foodCategories.${type}`)),
          ...(partner.otherFoodType !== null
            ? [t('admin.otherFoodType', { text: partner.otherFoodType })]
            : []),
        ].join(separator);

  return (
    <Screen scroll>
      <View testID="application-details" style={[styles.content, { direction }]}>
        <AppText variant="heading" accessibilityRole="header">
          {applicantName(application)}
        </AppText>
        <Row label={t('admin.applicantType')} value={typeOf(application)} />
        {application.email !== null ? <Row label={t('admin.loginEmail')} value={application.email} /> : null}
        {application.phone !== null ? <Row label={t('admin.loginPhone')} value={application.phone} /> : null}
        {vendor !== null ? <Row label={t('admin.contact')} value={vendor.contact} /> : null}
        {vendor?.description ? <Row label={t('admin.description')} value={vendor.description} /> : null}
        {partner?.otherPartnerType ? (
          <Row label={t('admin.partnerType')} value={partner.otherPartnerType} />
        ) : null}
        {partner !== null ? <Row label={t('admin.foodTypes')} value={foodTypes} /> : null}
        {place !== null ? <Row label={t('admin.address')} value={place.address} /> : null}
        <Row
          label={t('admin.submittedAt')}
          value={new Date(application.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB')}
        />

        {pin !== null ? (
          <View style={styles.row}>
            <AppText variant="caption" color="textMuted">
              {t('admin.location')}
            </AppText>
            <MapView
              testID="application-map"
              center={pin}
              pin={pin}
              onPinChange={() => undefined}
              readOnly
              accessibilityLabel={t('admin.location')}
            />
            <AppText variant="caption" color="textMuted">
              {t('location.pinAt', {
                latitude: pin.latitude.toFixed(5),
                longitude: pin.longitude.toFixed(5),
              })}
            </AppText>
          </View>
        ) : null}

        {message !== null ? <Notice tone="error" message={message} /> : null}

        {confirming === null ? (
          <View style={styles.actions}>
            <Button
              testID="application-approve"
              label={t('admin.approve')}
              onPress={() => {
                setConfirming('approve');
              }}
            />
            <Button
              testID="application-reject"
              variant="secondary"
              label={t('admin.reject')}
              onPress={() => {
                setConfirming('reject');
              }}
            />
          </View>
        ) : (
          <Notice
            tone="info"
            message={confirming === 'approve' ? t('admin.confirmApprove') : t('admin.confirmReject')}
          >
            <View style={styles.actions}>
              <Button
                testID="application-confirm"
                label={confirming === 'approve' ? t('admin.yesApprove') : t('admin.yesReject')}
                busy={busy}
                onPress={() => {
                  void decide(confirming);
                }}
              />
              <Button
                variant="link"
                label={t('admin.cancel')}
                onPress={() => {
                  setConfirming(null);
                }}
              />
            </View>
          </Notice>
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
  row: {
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.md,
  },
});
