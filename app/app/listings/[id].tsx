// The vendor's listing after saving (US-10, US-11) or from My listings (US-15): its photo, details and status (D-51).
// A full Draft is published here (Draft → Active) after the vendor confirms the perishability category (US-18) and
// chooses a destination (US-19) in PublishSteps; Publish stays disabled until both are done (FR-RTE-03, FR-RTE-06).
// The confirmed category is shown; the pickup urgency is not repeated here, because it is the pickup end shown above
// (D-69). Customers see it with the category (FR-RTE-04, IF-UI-05).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getListing, publishListing, type Listing } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { AutoOfferNote } from '@/components/AutoOfferNote';
import { DonationPickup } from '@/components/DonationPickup';
import { LandfillSection, showsLandfill } from '@/components/LandfillSection';
import { VendorReservations } from '@/components/VendorReservations';
import { Button } from '@/components/Button';
import { ListingPhoto } from '@/components/ListingPhoto';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { useCategoryHours } from '@/listings/categoryHours';
import { categoryWithHours, listingTypeText } from '@/listings/perishabilityText';
import { PublishSteps } from '@/listings/PublishSteps';
import { QuickPostDestination } from '@/listings/QuickPostDestination';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, radius, spacing } from '@/theme';

type Problem =
  | 'notApproved'
  | 'notDraft'
  | 'notReady'
  | 'unreachable'
  | 'unexpected'
  | 'notFound'
  // D-104: the Draft's pickup start has passed or is too far ahead.
  | 'startPassed'
  | 'startTooFar';

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

export default function ListingScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const hours = useCategoryHours();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  // US-25: the time the page opened, to tell whether the pickup has ended (as My listings does, D-102).
  const [now] = useState(() => Date.now());

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

  const sessionEnded = useCallback(() => {
    void signOut();
  }, [signOut]);

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

  const text = listing === null ? null : listingText(listing, language);
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
            <ListingPhoto
              testID="listing-photo"
              token={session}
              listingId={listing.id}
              style={styles.photo}
            />
            <Row label={t('listing.nameLabel')} value={text?.name ?? t('quickPost.title')} />
            {text?.description != null ? (
              <Row label={t('listing.descriptionLabel')} value={text.description} />
            ) : null}
            <Row
              label={t('listing.categoryLabel')}
              value={
                listing.foodCategory === 'unknown'
                  ? t('listing.unknown')
                  : t(`foodCategories.${listing.foodCategory}`)
              }
            />
            <Row label={t('listing.bagsLabel')} value={localDigits(listing.bagsTotal, language)} />
            {listing.originalValue !== null ? (
              <Row
                label={t('listing.originalValueLabel')}
                value={t('listing.egp', { amount: listing.originalValue })}
              />
            ) : null}
            <Row label={t('listing.priceLabel')} value={t('listing.egp', { amount: listing.price })} />
            {/* US-16 (FR-LST-07, IF-UI-04): the kept calorie estimate, labelled Estimate. */}
            {listing.calorieMin != null && listing.calorieMax != null ? (
              <Row
                testID="listing-calories"
                label={t('calories.label')}
                value={t('calories.estimate', { min: listing.calorieMin, max: listing.calorieMax })}
              />
            ) : null}
            <Row label={t('listing.pickupStartLabel')} value={time(listing.pickupStart)} />
            <Row
              label={listing.isQuickPost ? t('listing.pickupEndLabel') : t('listing.pickByLabel')}
              value={time(listing.pickupEnd)}
            />
            {!listing.isQuickPost ? (
              <Row
                label={t('listing.storageLabel')}
                value={
                  listing.storage === null ? t('listing.notAsked') : t(`listing.storage.${listing.storage}`)
                }
              />
            ) : null}
            {listing.perishabilityCategory !== null ? (
              <Row
                label={t('perishability.categoryLabel')}
                value={categoryWithHours(t, listing.perishabilityCategory, hours)}
              />
            ) : null}
            {listing.listingType !== null ? (
              <Row label={t('routing.listingTypeLabel')} value={listingTypeText(t, listing.listingType)} />
            ) : null}
            {listing.isQuickPost && listing.status === 'Active' ? (
              <QuickPostDestination
                token={session}
                listing={listing}
                onChange={setListing}
                onSessionEnded={sessionEnded}
              />
            ) : null}
            {/* US-23 (D-112): unreserved bags offered to charities automatically. */}
            {listing.status !== 'Draft' && listing.listingType === 'Discounted Surplus Bag' ? (
              <AutoOfferNote token={session} listingId={listing.id} />
            ) : null}
            {/* US-22 (D-110): the charity that collects a published Donation. */}
            {listing.status !== 'Draft' && listing.listingType === 'Donation' ? (
              <DonationPickup token={session} listingId={listing.id} />
            ) : null}
            {/* US-32, US-33 (D-101): the reservations of a published listing and the pickup code. */}
            {listing.status !== 'Draft' ? (
              <VendorReservations
                token={session}
                listingId={listing.id}
                ended={listing.status === 'Closed'}
              />
            ) : null}
            {/* US-25 (FR-RTE-13, D-117): after the pickup window, the bags nobody took as landfill. */}
            {showsLandfill(listing, now) ? (
              <LandfillSection token={session} listing={listing} onSessionEnded={sessionEnded} />
            ) : null}
            {listing.status === 'Draft' ? (
              <>
                <PublishSteps
                  token={session}
                  listing={listing}
                  onChange={setListing}
                  onSessionEnded={sessionEnded}
                />
                {listing.perishabilityCategory === null || listing.listingType === null ? (
                  <AppText color="textMuted">{t('listing.publishNeeds')}</AppText>
                ) : null}
                <Button
                  testID="listing-publish"
                  label={t('listing.publish')}
                  busyLabel={t('listing.publishing')}
                  busy={publishing}
                  disabled={listing.perishabilityCategory === null || listing.listingType === null}
                  onPress={() => void publish()}
                />
              </>
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
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
});
