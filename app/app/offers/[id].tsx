// The product page of an offer (US-26, FR-RES-01, decision D-65), opened from the consumer home: photo, name, food
// category, description, pickup time, bags left, the original price struck through next to the discounted price, and
// the perishability category with "Collect by" (FR-RTE-04, IF-UI-05: how soon to collect, never that the food is
// safe). US-28 (FR-RES-03): "Reserve without a card" reserves one bag and opens the reservation; card payment is
// US-27. The warning before the BR-07 no-show block is shown above the button. D-97: the customer first chooses a
// pickup slot (the first one is chosen); the hold starts when that slot starts. D-98: the slot is chosen from a drop-down
// list. US-29 (D-117 to D-119): when every bag is reserved the consumer can join the waitlist; a bag set aside for
// them is reserved with the same buttons (the entry id is sent) or passed on.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getMyWaitlist,
  getNoShowStanding,
  getOffer,
  reserveWithoutCard,
  type NoShowStanding,
  type Offer,
  type WaitlistEntry,
} from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ListingPhoto } from '@/components/ListingPhoto';
import { Notice } from '@/components/Notice';
import { SelectField } from '@/components/SelectField';
import { WaitlistBox } from '@/components/WaitlistBox';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime, formatTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';

type Problem = 'notFound' | 'unreachable' | 'unexpected';
type ReserveProblem = 'soldOut' | 'alreadyReserved' | 'reserveFailed' | 'offerExpired';

/** NFR-15: one key per reserve attempt on this page, so a retry after a dropped connection is not a second bag. */
function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

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
  const [standing, setStanding] = useState<NoShowStanding | null>(null);
  const [reserveProblem, setReserveProblem] = useState<ReserveProblem | null>(null);
  const [reserving, setReserving] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);
  // US-29: the consumer's place on this offer's waitlist (Waiting or Offered), if any.
  const [waitEntry, setWaitEntry] = useState<WaitlistEntry | null>(null);

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
    void getNoShowStanding(token).then((result) => {
      if (active && result.kind === 'ok') setStanding(result.standing);
    });
    void getMyWaitlist(token).then((result) => {
      if (!active || result.kind !== 'ok') return;
      const mine = result.entries.find(
        (e) => e.listingId === String(id) && (e.status === 'Waiting' || e.status === 'Offered'),
      );
      setWaitEntry(mine ?? null);
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;

  async function reserve() {
    if (token === null || offer === null || slot === null) return;
    setReserving(true);
    setReserveProblem(null);
    const offeredEntry = waitEntry?.status === 'Offered' ? waitEntry.id : undefined;
    const result =
      offeredEntry === undefined
        ? await reserveWithoutCard(token, offer.id, slot, idempotencyKey.current)
        : await reserveWithoutCard(token, offer.id, slot, idempotencyKey.current, offeredEntry);
    setReserving(false);
    if (result.kind === 'ok') {
      idempotencyKey.current = newIdempotencyKey();
      router.replace({ pathname: '/reservations/[id]', params: { id: result.reservation.id } });
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else if (result.kind === 'soldOut' || result.kind === 'notFound') setReserveProblem('soldOut');
    else if (result.kind === 'alreadyReserved') setReserveProblem('alreadyReserved');
    else if (result.kind === 'offerExpired') {
      setWaitEntry(null);
      setReserveProblem('offerExpired');
    } else setReserveProblem('reserveFailed');
  }

  const text = offer === null ? null : listingText(offer, language);
  const price = (amount: number) => t('listing.egp', { amount });
  // D-97: each slot runs to the next slot start, the last one to the pickup end.
  const slots = offer?.pickupSlots ?? [];
  const slot = chosenSlot !== null && slots.includes(chosenSlot) ? chosenSlot : (slots[0] ?? null);
  const slotOptions = slots.map((start, index) => ({
    value: start,
    label: t('offers.slotRange', {
      start: formatTime(start, language),
      end: formatTime(slots[index + 1] ?? offer?.pickupEnd ?? start, language),
    }),
  }));
  const chooseSlot = (index: number) => {
    const next = slots[index];
    if (next === undefined || next === slot) return;
    setChosenSlot(next);
    idempotencyKey.current = newIdempotencyKey();
  };

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

            {standing?.level === 'warning' ? (
              <Notice
                testID="offer-no-show"
                tone="error"
                message={t('noShow.warning', { days: standing.withinDays, blockDays: standing.blockDays })}
              />
            ) : null}
            {/* US-29: join, wait, or a bag set aside for this consumer. */}
            <WaitlistBox
              listingId={offer.id}
              soldOut={offer.bagsAvailable === 0 || reserveProblem === 'soldOut'}
              entry={waitEntry}
              onChange={setWaitEntry}
            />
            {/* D-99 (US-27): pay by card; the bag is held for the whole pickup time. */}
            <Button
              testID="offer-pay-card"
              label={t('offers.payByCard')}
              onPress={() => {
                router.push({
                  pathname: '/pay/[id]',
                  params:
                    waitEntry?.status === 'Offered'
                      ? { id: offer.id, entry: waitEntry.id }
                      : { id: offer.id },
                });
              }}
            />
            {/* US-43 (FR-TGI-05, D-116): pay for bags and give them to a charity as Zakat. */}
            <Button
              testID="offer-zakat"
              variant="secondary"
              label={t('zakat.donate')}
              onPress={() => {
                router.push({ pathname: '/zakat/new/[id]', params: { id: offer.id } });
              }}
            />
            <AppText variant="label" color="textMuted">
              {t('offers.orReserve')}
            </AppText>
            {slotOptions.length > 0 ? (
              // D-98: the slot is chosen from a drop-down list.
              <SelectField
                testID="offer-slots"
                label={t('offers.slotTitle')}
                placeholder={t('offers.slotTitle')}
                options={slotOptions}
                value={slot}
                onChange={(value) => {
                  chooseSlot(slots.indexOf(value));
                }}
              />
            ) : (
              <Notice testID="offer-no-slots" tone="info" message={t('offers.noSlots')} />
            )}
            {reserveProblem !== null ? (
              <Notice
                testID="offer-reserve-problem"
                tone="error"
                message={
                  reserveProblem === 'offerExpired' ? t('waitlist.expired') : t(`offers.${reserveProblem}`)
                }
              />
            ) : null}
            <Button
              testID="offer-reserve"
              label={t('offers.reserve')}
              busy={reserving}
              disabled={slot === null}
              onPress={() => {
                void reserve();
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
