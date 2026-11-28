// US-29 (FR-RES-06, D-118): on the consumer home, a banner when a freed bag is set aside for this consumer, with the
// time left to accept and a button to the offer. Push waits for a development build, so the app checks every 30 s.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getMyWaitlist, type WaitlistEntry } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Countdown } from './Countdown';

const CHECK_MS = 30_000;

export function WaitlistBanner() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token } = useAuth();
  const [offer, setOffer] = useState<WaitlistEntry | null>(null);

  const load = useCallback(() => {
    if (token === null) return;
    void getMyWaitlist(token).then((result) => {
      if (result.kind === 'ok') setOffer(result.entries.find((e) => e.status === 'Offered') ?? null);
    });
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, CHECK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  if (offer === null || offer.offerExpiresAt === null) return null;
  const name =
    listingText({ ...offer.listing, descriptionAr: null, descriptionEn: null, foodType: null }, language)
      .name ?? '';

  return (
    <View testID="waitlist-banner" style={[styles.banner, { direction }]}>
      <AppText variant="label">{t('waitlist.bannerTitle')}</AppText>
      <AppText>{`${name} · ${offer.listing.shopName}`}</AppText>
      <Countdown
        testID="waitlist-banner-countdown"
        labelKey="waitlist.bannerLeft"
        until={offer.offerExpiresAt}
        onEnd={load}
      />
      <Button
        testID="waitlist-banner-open"
        label={t('waitlist.bannerOpen')}
        onPress={() => {
          router.push({ pathname: '/offers/[id]', params: { id: offer.listingId, entry: offer.id } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
});
