// US-22 (FR-RTE-10, E-RTE-03, E-RTE-04): a Donation offer for a charity partner. The charity chooses when it will
// collect the food (inside the pickup window) and accepts; the server issues the pickup code and the pickup opens.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { acceptPartnerOffer, getPartnerOffer, type PartnerOffer } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, spacing } from '@/theme';

export default function PartnerOfferScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<PartnerOffer | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pickupTime, setPickupTime] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token === null || typeof id !== 'string') return;
    let active = true;
    void getPartnerOffer(token, id).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setOffer(result.offer);
      else if (result.kind === 'notFound') setGone(true);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  const fmt = (iso: string) => formatDateTime(iso, language);

  async function accept(current: PartnerOffer) {
    if (pickupTime === null) {
      setProblem(t('partnerOffers.chooseTime'));
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await acceptPartnerOffer(session, current.listingId, pickupTime);
    setBusy(false);
    switch (result.kind) {
      case 'ok':
        router.replace({ pathname: '/partner/pickups/[id]', params: { id: result.pickup.id } });
        return;
      case 'outsideWindow':
        setProblem(
          t('partnerOffers.outsideWindow', {
            start: fmt(result.earliest ?? current.pickupStart),
            end: fmt(result.latest ?? current.pickupEnd),
          }),
        );
        return;
      case 'taken':
        setProblem(t('partnerOffers.taken'));
        return;
      case 'notFound':
        setGone(true);
        return;
      case 'unauthorized':
      case 'suspended':
        await signOut();
        return;
      default:
        setProblem(t('partnerOffers.failed'));
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('partnerOffers.offerTitle') }} />
      <View testID="partner-offer" style={[styles.content, { direction }]}>
        {gone ? <Notice tone="info" message={t('partnerOffers.notFound')} /> : null}
        {failed ? <Notice tone="error" message={t('partnerOffers.failed')} /> : null}
        {offer === null && !gone && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {offer !== null && !gone ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {listingText({ ...offer, foodType: null }, language).name ?? ''}
            </AppText>
            {listingText({ ...offer, foodType: null }, language).description !== null ? (
              <AppText>{listingText({ ...offer, foodType: null }, language).description}</AppText>
            ) : null}
            <AppText color="textMuted">{`${offer.shopName} · ${offer.address}`}</AppText>
            {offer.foodCategory !== null ? (
              <AppText>{t(`foodCategories.${offer.foodCategory}`)}</AppText>
            ) : null}
            <AppText>{t('partnerOffers.bags', { count: offer.bags })}</AppText>
            <AppText>
              {t('partnerOffers.window', { start: fmt(offer.pickupStart), end: fmt(offer.pickupEnd) })}
            </AppText>
            <DateTimeField
              testID="partner-pickup-time"
              label={t('partnerOffers.pickupTimeLabel')}
              hint={t('partnerOffers.pickupTimeHint', {
                start: fmt(offer.pickupStart),
                end: fmt(offer.pickupEnd),
              })}
              value={pickupTime}
              onChange={(iso) => {
                setPickupTime(iso);
                setProblem(null);
              }}
            />
            {problem !== null ? (
              <Notice testID="partner-offer-problem" tone="error" message={problem} />
            ) : null}
            <Button
              testID="partner-accept"
              label={t('partnerOffers.accept')}
              busyLabel={t('partnerOffers.accepting')}
              busy={busy}
              onPress={() => void accept(offer)}
            />
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
});
