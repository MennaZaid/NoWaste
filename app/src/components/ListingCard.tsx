// One listing in a list (US-15 My listings): photo, name in the reader's language (D-63), status, perishability category and pickup urgency
// (FR-RTE-04, IF-UI-05: how soon to collect, never a statement that the food is safe), pickup end and price.
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Listing } from '@/api/client';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { categoryText } from '@/listings/perishabilityText';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { ListingPhoto } from './ListingPhoto';

interface ListingCardProps {
  token: string;
  listing: Listing;
  onPress: () => void;
}

export function ListingCard({ token, listing, onPress }: ListingCardProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const text = listingText(listing, language);
  const name = text.name ?? t('quickPost.title');
  const status = t(
    `listing.status.${listing.status === 'Fully reserved' ? 'FullyReserved' : listing.status}`,
  );

  return (
    <Pressable
      testID={`my-listing-${listing.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${status}`}
      accessibilityHint={t('myListings.openHint')}
      onPress={onPress}
      style={styles.card}
    >
      <ListingPhoto
        testID={`my-listing-photo-${listing.id}`}
        token={token}
        listingId={listing.id}
        style={styles.thumbnail}
      />
      <View style={styles.text}>
        <AppText variant="label">{name}</AppText>
        <AppText variant="caption" color="textMuted">
          {status}
        </AppText>
        {listing.perishabilityCategory !== null ? (
          <AppText variant="caption" color="primary">
            {categoryText(t, listing.perishabilityCategory)}
          </AppText>
        ) : null}
        <AppText variant="caption">
          {t('myListings.pickupEnds', { time: formatDateTime(listing.pickupEnd, language) })}
        </AppText>
        <AppText variant="caption">{t('listing.egp', { amount: listing.price })}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumbnail: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
