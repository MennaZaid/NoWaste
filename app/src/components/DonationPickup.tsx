// US-22 (FR-RTE-10, D-110): on the vendor's Donation listing, which charity collects it and when, or that no charity
// has accepted it yet. The vendor types the charity's code in the pickup code box below it.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getListingPartnerPickup, type PartnerPickup } from '@/api/client';
import { AppText } from '@/components/AppText';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { spacing } from '@/theme';

export function DonationPickup({ token, listingId }: { token: string; listingId: string }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [pickup, setPickup] = useState<PartnerPickup | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void getListingPartnerPickup(token, listingId).then((result) => {
      if (active && result.kind === 'ok') setPickup(result.pickup);
    });
    return () => {
      active = false;
    };
  }, [token, listingId]);

  if (pickup === undefined) return null;
  return (
    <View testID="donation-pickup" style={styles.box}>
      <AppText variant="label">{t('partnerOffers.vendorTitle')}</AppText>
      {pickup === null ? (
        <AppText color="textMuted">{t('partnerOffers.vendorNone')}</AppText>
      ) : (
        <>
          <AppText>
            {t('partnerOffers.vendorLine', {
              name: pickup.organisationName,
              time: formatDateTime(pickup.pickupTime, language),
            })}
          </AppText>
          <AppText color="textMuted">{t(`partnerOffers.statuses.${pickup.status}`)}</AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
  },
});
