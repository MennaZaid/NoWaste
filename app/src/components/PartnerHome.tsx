// US-22, US-24 (FR-RTE-10, FR-RTE-12, D-108, D-111): the charity or composting partner home. "Offers" lists the
// Donations or Compost offers the partner can take, nearest first; "My pickups" lists the pickups it accepted with their
// status. A card opens the offer or the pickup.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getPartnerOffers, getPartnerPickups, type PartnerOffer, type PartnerPickup } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, minTouchSize, radius, spacing } from '@/theme';

type Tab = 'offers' | 'pickups';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFoodPartner' }
  | { kind: 'offers'; offers: PartnerOffer[] }
  | { kind: 'pickups'; pickups: PartnerPickup[] };

export function PartnerHome() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('offers');
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  // Loaded again whenever the home is shown, so an accepted or cancelled pickup appears at once.
  useFocusEffect(
    useCallback(() => {
      if (token === null) return undefined;
      let active = true;
      setLoaded({ kind: 'loading' });
      const done = (next: Loaded) => {
        if (active) setLoaded(next);
      };
      if (tab === 'offers') {
        void getPartnerOffers(token).then((result) => {
          if (result.kind === 'ok') done({ kind: 'offers', offers: result.offers });
          else if (result.kind === 'notFoodPartner') done({ kind: 'notFoodPartner' });
          else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
          else done({ kind: 'failed' });
        });
      } else {
        void getPartnerPickups(token).then((result) => {
          if (result.kind === 'ok') done({ kind: 'pickups', pickups: result.pickups });
          else if (result.kind === 'notFoodPartner') done({ kind: 'notFoodPartner' });
          else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
          else done({ kind: 'failed' });
        });
      }
      return () => {
        active = false;
      };
    }, [token, tab, signOut]),
  );

  const nameOf = (item: PartnerOffer | PartnerPickup) =>
    listingText({ ...item, descriptionAr: null, descriptionEn: null, foodType: null }, language).name ?? '';
  const windowOf = (item: PartnerOffer | PartnerPickup) =>
    t('partnerOffers.window', {
      start: formatDateTime(item.pickupStart, language),
      end: formatDateTime(item.pickupEnd, language),
    });

  return (
    <View testID="partner-home" style={[styles.content, { direction }]}>
      <SegmentedControl<Tab>
        accessibilityLabel={t('partnerOffers.tabsLabel')}
        options={[
          { value: 'offers', label: t('partnerOffers.offersTab') },
          { value: 'pickups', label: t('partnerOffers.pickupsTab') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loaded.kind === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      {loaded.kind === 'failed' ? <Notice tone="error" message={t('partnerOffers.failed')} /> : null}
      {loaded.kind === 'notFoodPartner' ? (
        <Notice tone="info" message={t('partnerOffers.notFoodPartner')} />
      ) : null}
      {loaded.kind === 'offers' && loaded.offers.length === 0 ? (
        <AppText color="textMuted">{t('partnerOffers.offersEmpty')}</AppText>
      ) : null}
      {loaded.kind === 'pickups' && loaded.pickups.length === 0 ? (
        <AppText color="textMuted">{t('partnerOffers.pickupsEmpty')}</AppText>
      ) : null}
      {loaded.kind === 'offers'
        ? loaded.offers.map((offer) => (
            <Pressable
              key={offer.listingId}
              testID={`partner-offer-${offer.listingId}`}
              accessibilityRole="button"
              onPress={() => {
                router.push({ pathname: '/partner/offers/[id]', params: { id: offer.listingId } });
              }}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <AppText variant="caption" color="textMuted">
                {t(`partnerOffers.types.${offer.listingType}`)}
              </AppText>
              <AppText variant="label">{nameOf(offer)}</AppText>
              <AppText color="textMuted">{`${offer.shopName} · ${offer.address}`}</AppText>
              <AppText>
                {`${t('partnerOffers.bags', { count: offer.bags })} · ${t('partnerOffers.distance', {
                  km: (offer.distanceMeters / 1000).toFixed(1),
                })}`}
              </AppText>
              <AppText color="textMuted">{windowOf(offer)}</AppText>
            </Pressable>
          ))
        : null}
      {loaded.kind === 'pickups'
        ? loaded.pickups.map((pickup) => (
            <Pressable
              key={pickup.id}
              testID={`partner-pickup-${pickup.id}`}
              accessibilityRole="button"
              onPress={() => {
                router.push({ pathname: '/partner/pickups/[id]', params: { id: pickup.id } });
              }}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <AppText variant="label">{nameOf(pickup)}</AppText>
              <AppText color="textMuted">{pickup.shopName}</AppText>
              <AppText>{t(`partnerOffers.statuses.${pickup.status}`)}</AppText>
              <AppText color="textMuted">
                {t('partnerOffers.pickupAt', { time: formatDateTime(pickup.pickupTime, language) })}
              </AppText>
            </Pressable>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  card: {
    minHeight: minTouchSize,
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.accent,
  },
});
