// US-22 (FR-RTE-10, FR-RES-10): a pickup the charity accepted: when to collect, where, and the pickup code to show the
// vendor. While it is Scheduled the charity may cancel it; the Donation is then offered to other charities again.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { cancelPartnerPickup, getPartnerPickups, type PartnerPickup } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';

export default function PartnerPickupScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pickup, setPickup] = useState<PartnerPickup | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (token === null || typeof id !== 'string') return;
    void getPartnerPickups(token).then((result) => {
      if (result.kind === 'ok') {
        const found = result.pickups.find((p) => p.id === id);
        if (found === undefined) setFailed(true);
        else setPickup(found);
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
  }, [token, id, signOut]);

  useEffect(load, [load]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  async function cancel(current: PartnerPickup) {
    setBusy(true);
    setMessage(null);
    const result = await cancelPartnerPickup(session, current.id);
    setBusy(false);
    if (result.kind === 'ok') {
      setPickup(result.pickup);
      setMessage({ tone: 'info', text: t('partnerOffers.cancelled') });
    } else if (result.kind === 'notCancellable') {
      setMessage({ tone: 'error', text: t('partnerOffers.notCancellable') });
      load();
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') await signOut();
    else setMessage({ tone: 'error', text: t('partnerOffers.failed') });
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('partnerOffers.pickupTitle') }} />
      <View testID="partner-pickup" style={[styles.content, { direction }]}>
        {failed ? <Notice tone="error" message={t('partnerOffers.failed')} /> : null}
        {pickup === null && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {pickup !== null ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {listingText({ ...pickup, descriptionAr: null, descriptionEn: null, foodType: null }, language)
                .name ?? ''}
            </AppText>
            <AppText testID="partner-pickup-status">{t(`partnerOffers.statuses.${pickup.status}`)}</AppText>
            <AppText>
              {t('partnerOffers.pickupAt', { time: formatDateTime(pickup.pickupTime, language) })}
            </AppText>
            <AppText color="textMuted">{`${pickup.shopName} · ${pickup.address}`}</AppText>
            <AppText>{t('partnerOffers.bags', { count: pickup.bags })}</AppText>
            {pickup.status === 'Accepted' && pickup.pickupCode !== null ? (
              <View style={styles.codeBox}>
                <AppText variant="label">{t('partnerOffers.codeLabel')}</AppText>
                <AppText testID="partner-pickup-code" variant="heading">
                  {localDigits(pickup.pickupCode, language)}
                </AppText>
                <AppText color="textMuted">{t('partnerOffers.codeHint')}</AppText>
              </View>
            ) : null}
            {message !== null ? <Notice tone={message.tone} message={message.text} /> : null}
            {pickup.status === 'Accepted' ? (
              <Button
                testID="partner-cancel"
                variant="secondary"
                label={t('partnerOffers.cancel')}
                busyLabel={t('partnerOffers.cancelling')}
                busy={busy}
                onPress={() => void cancel(pickup)}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  codeBox: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
