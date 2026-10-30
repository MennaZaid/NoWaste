// My listings (US-15, FR-LST-06): the vendor's active and previous listings, newest first, each with its photo and
// status. Tapping one opens its details. Reservations on each listing are added with Sprint 2 (decision D-51).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getMyListings, type Listing } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ListingPhoto } from '@/components/ListingPhoto';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { colors, radius, spacing } from '@/theme';

type Problem = 'unreachable' | 'unexpected';

export default function MyListingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Try again loads the list once more by counting up.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getMyListings(token).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setListings(result.listings);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setProblem(result.kind);
    });
    return () => {
      active = false;
    };
  }, [token, signOut, attempt]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  const status = (listing: Listing) =>
    t(`listing.status.${listing.status === 'Fully reserved' ? 'FullyReserved' : listing.status}`);
  const name = (listing: Listing) => listing.foodType ?? t('quickPost.title');

  return (
    <Screen scroll>
      <View testID="my-listings" style={[styles.content, { direction }]}>
        <AppText variant="heading" accessibilityRole="header">
          {t('myListings.title')}
        </AppText>
        {problem !== null ? (
          <>
            <Notice tone="error" message={t(`listing.problems.${problem}`)} />
            <Button
              variant="secondary"
              label={t('myListings.retry')}
              onPress={() => {
                setProblem(null);
                setAttempt((n) => n + 1);
              }}
            />
          </>
        ) : listings === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : listings.length === 0 ? (
          <>
            <AppText color="textMuted">{t('myListings.empty')}</AppText>
            <Button
              label={t('vendorHome.createListing')}
              onPress={() => {
                router.push('/listings/new');
              }}
            />
          </>
        ) : (
          listings.map((listing) => (
            <Pressable
              key={listing.id}
              testID={`my-listing-${listing.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${name(listing)}, ${status(listing)}`}
              accessibilityHint={t('myListings.openHint')}
              onPress={() => {
                router.push(`/listings/${listing.id}`);
              }}
              style={styles.card}
            >
              <ListingPhoto
                testID={`my-listing-photo-${listing.id}`}
                token={session}
                listingId={listing.id}
                style={styles.thumbnail}
              />
              <View style={styles.text}>
                <AppText variant="label">{name(listing)}</AppText>
                <AppText variant="caption" color="textMuted">
                  {status(listing)}
                </AppText>
                <AppText variant="caption">
                  {t('myListings.pickupEnds', { time: formatDateTime(listing.pickupEnd, language) })}
                </AppText>
                <AppText variant="caption">{t('listing.egp', { amount: listing.price })}</AppText>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
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
