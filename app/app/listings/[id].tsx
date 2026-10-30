// The vendor's listing after saving (US-10, US-11): its details and status. A Draft can be published here
// (Draft → Active). Turn 5 adds the perishability confirmation (US-18) and the destination (US-19) before this step.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getListing, publishListing, type Listing } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { formatDateTime } from '@/listings/formatDateTime';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

type Problem = 'notApproved' | 'notDraft' | 'unreachable' | 'unexpected' | 'notFound';

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

export default function ListingScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getListing(token, String(id)).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setListing(result.listing);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else
        setProblem(result.kind === 'notFound' || result.kind === 'unreachable' ? result.kind : 'unexpected');
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  async function publish() {
    setProblem(null);
    setPublishing(true);
    const result = await publishListing(session, String(id));
    setPublishing(false);
    if (result.kind === 'ok') {
      setListing(result.listing);
      setJustPublished(true);
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') {
      await signOut();
    } else {
      setProblem(result.kind);
    }
  }

  const time = (iso: string | null) =>
    iso === null
      ? t('listing.notAsked')
      : iso === 'unknown'
        ? t('listing.unknown')
        : formatDateTime(iso, language);

  return (
    <Screen scroll>
      <View testID="listing-details" style={[styles.content, { direction }]}>
        {problem !== null ? (
          <Notice testID="listing-problem" tone="error" message={t(`listing.problems.${problem}`)} />
        ) : null}
        {listing === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            <AppText testID="listing-status" variant="heading" accessibilityRole="header">
              {t(`listing.status.${listing.status === 'Fully reserved' ? 'FullyReserved' : listing.status}`)}
            </AppText>
            {justPublished || (listing.isQuickPost && listing.status === 'Active') ? (
              <Notice tone="info" message={t('listing.published')} />
            ) : null}
            {listing.isQuickPost ? <Notice tone="info" message={t('quickPost.highlyPerishable')} /> : null}
            <Row label={t('listing.foodTypeLabel')} value={listing.foodType ?? t('quickPost.title')} />
            <Row
              label={t('listing.categoryLabel')}
              value={
                listing.foodCategory === 'unknown'
                  ? t('listing.unknown')
                  : t(`foodCategories.${listing.foodCategory}`)
              }
            />
            {listing.descriptionAr !== null ? (
              <Row label={t('listing.descriptionArLabel')} value={listing.descriptionAr} />
            ) : null}
            {listing.descriptionEn !== null ? (
              <Row label={t('listing.descriptionEnLabel')} value={listing.descriptionEn} />
            ) : null}
            <Row label={t('listing.bagsLabel')} value={String(listing.bagsTotal)} />
            {listing.originalValue !== null ? (
              <Row
                label={t('listing.originalValueLabel')}
                value={t('listing.egp', { amount: listing.originalValue })}
              />
            ) : null}
            <Row label={t('listing.priceLabel')} value={t('listing.egp', { amount: listing.price })} />
            <Row label={t('listing.pickupStartLabel')} value={time(listing.pickupStart)} />
            <Row label={t('listing.pickupEndLabel')} value={time(listing.pickupEnd)} />
            {!listing.isQuickPost ? (
              <>
                <Row label={t('listing.prepTimeLabel')} value={time(listing.prepTime)} />
                <Row
                  label={t('listing.storageLabel')}
                  value={
                    listing.storage === null ? t('listing.notAsked') : t(`listing.storage.${listing.storage}`)
                  }
                />
                <Row label={t('listing.expiryLabel')} value={time(listing.expiryAt)} />
              </>
            ) : null}
            {listing.status === 'Draft' ? (
              <Button
                testID="listing-publish"
                label={t('listing.publish')}
                busyLabel={t('listing.publishing')}
                busy={publishing}
                onPress={() => void publish()}
              />
            ) : null}
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
  row: {
    gap: 2,
  },
});
