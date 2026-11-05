// My listings (US-15, FR-LST-06): the vendor's active and previous listings, newest first, each with its photo,
// status, perishability category and pickup urgency (ListingCard, FR-RTE-04). Tapping one opens its details. Reservations on each listing are added with Sprint 2 (decision D-51).
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getMyListings, getShop, type Listing, type Shop } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ListingCard } from '@/components/ListingCard';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

type Problem = 'unreachable' | 'unexpected';

export default function MyListingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  // D-64: formal vendors post with Create listing, informal vendors with Quick Post; null until known.
  const [vendorType, setVendorType] = useState<Shop['vendorType'] | null>(null);
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

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getShop(token).then((result) => {
      if (active && result.kind === 'ok') setVendorType(result.shop.vendorType);
    });
    return () => {
      active = false;
    };
  }, [token]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

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
            {vendorType === 'informal' ? (
              <>
                <AppText color="textMuted">{t('myListings.emptyInformal')}</AppText>
                <Button
                  label={t('vendorHome.quickPost')}
                  onPress={() => {
                    router.push('/listings/quick');
                  }}
                />
              </>
            ) : vendorType === 'formal' ? (
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
              <ActivityIndicator color={colors.primary} />
            )}
          </>
        ) : (
          listings.map((listing) => (
            <ListingCard
              key={listing.id}
              token={session}
              listing={listing}
              onPress={() => {
                router.push(`/listings/${listing.id}`);
              }}
            />
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
});
