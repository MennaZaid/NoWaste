// The product page of an offer (US-26, FR-RES-01, decision D-65), opened from the consumer home: photo, name, food
// category, description, pickup time, bags left, the original price struck through next to the discounted price, and
// the perishability category with "Collect by" (FR-RTE-04, IF-UI-05: how soon to collect, never that the food is
// safe). Place order is shown but ordering is not built yet (US-27, US-28): pressing it says so.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getOffer, type Offer } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ListingPhoto } from '@/components/ListingPhoto';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';

type Problem = 'notFound' | 'unreachable' | 'unexpected';

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.row}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

export default function OfferScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [orderNote, setOrderNote] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getOffer(token, String(id)).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setOffer(result.offer);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else
        setProblem(result.kind === 'notFound' || result.kind === 'unreachable' ? result.kind : 'unexpected');
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;

  const text = offer === null ? null : listingText(offer, language);
  const price = (amount: number) => t('listing.egp', { amount });

  return (
    <Screen scroll>
      <View testID="offer-details" style={[styles.content, { direction }]}>
        {problem !== null ? (
          <Notice testID="offer-problem" tone="error" message={t(`offers.problems.${problem}`)} />
        ) : null}
        {offer === null || text === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            <ListingPhoto
              testID="offer-photo"
              token={token}
              listingId={offer.id}
              source="offer"
              style={styles.photo}
            />
            <AppText testID="offer-name" variant="heading" accessibilityRole="header">
              {text.name ?? t('quickPost.title')}
            </AppText>
            <AppText color="textMuted">{`${offer.place.shopName} · ${offer.place.address}`}</AppText>

            <View
              testID="offer-price"
              style={styles.prices}
              accessible
              accessibilityLabel={
                offer.originalValue === null
                  ? price(offer.price)
                  : t('offers.priceA11y', { was: price(offer.originalValue), now: price(offer.price) })
              }
            >
              {offer.originalValue !== null ? (
                <AppText testID="offer-original-price" color="textMuted" style={styles.struck}>
                  {price(offer.originalValue)}
                </AppText>
              ) : null}
              <AppText testID="offer-discounted-price" variant="heading" color="primary">
                {price(offer.price)}
              </AppText>
            </View>

            <Row
              label={t('listing.categoryLabel')}
              value={
                offer.foodCategory === 'unknown'
                  ? t('listing.unknown')
                  : t(`foodCategories.${offer.foodCategory}`)
              }
            />
            {text.description !== null ? (
              <Row label={t('listing.descriptionLabel')} value={text.description} />
            ) : null}
            <Row
              testID="offer-pickup"
              label={t('offers.pickupLabel')}
              value={t('offers.pickupWindow', {
                start: formatDateTime(offer.pickupStart, language),
                end: formatDateTime(offer.pickupEnd, language),
              })}
            />
            <Row
              testID="offer-bags"
              label={t('offers.bagsLabel')}
              value={localDigits(offer.bagsAvailable, language)}
            />

            {orderNote ? (
              <Notice testID="offer-order-note" tone="info" message={t('offers.orderSoon')} />
            ) : null}
            <Button
              testID="offer-place-order"
              label={t('offers.placeOrder')}
              onPress={() => {
                setOrderNote(true);
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  prices: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  row: {
    gap: 2,
  },
});
