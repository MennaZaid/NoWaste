// The consumer's reservation (US-28, FR-RES-03, FR-RES-04, FR-RES-05, E-RES-05): what was reserved, the status, the
// time the bag is held until, the 6-digit pickup code (FR-RES-10, D-92) and "I'm on my way" (once). An ended hold says
// the bag went back on sale, with the notice or warning before the BR-07 no-show block. D-96: a countdown shows the
// time left of the hold (15 minutes, +10 after "I'm on my way"); after the one check-in the button stays, grey and
// disabled. When the countdown reaches zero the reservation is loaded again. D-97: before the chosen pickup slot
// starts, the screen shows when it starts (with a countdown to it) instead of the timer, code and button; at the slot
// start the reservation is loaded again and they appear.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  checkInReservation,
  getNoShowStanding,
  getReservation,
  type NoShowStanding,
  type Reservation,
} from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Countdown, useNow } from '@/components/Countdown';
import { CancelReservation } from '@/components/CancelReservation';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';

type Problem = 'notFound' | 'failed';

export default function ReservationScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  // D-97: ticks every second, so the screen changes when the pickup slot starts.
  const now = useNow();
  const [standing, setStanding] = useState<NoShowStanding | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = useCallback(
    async (result: Awaited<ReturnType<typeof getReservation>>) => {
      if (token === null) return;
      if (result.kind === 'ok') {
        setReservation(result.reservation);
        if (result.reservation.status === 'No-show') {
          const answer = await getNoShowStanding(token);
          if (answer.kind === 'ok') setStanding(answer.standing);
        }
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setProblem(result.kind === 'notFound' ? 'notFound' : 'failed');
    },
    [token, signOut],
  );

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getReservation(token, String(id)).then((result) => {
      if (active) void show(result);
    });
    return () => {
      active = false;
    };
  }, [token, id, show]);

  const reload = useCallback(() => {
    if (token !== null) void getReservation(token, String(id)).then(show);
  }, [token, id, show]);

  // D-97: when the slot starts, load the reservation again once to get the pickup code from the server.
  const slotReached =
    reservation !== null &&
    reservation.status === 'Held' &&
    reservation.slotStart !== null &&
    Date.parse(reservation.slotStart) <= now;
  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (reservation === null || !slotReached || reservation.pickupCode !== null) return;
    const key = `${reservation.id}@${String(reservation.slotStart)}`;
    if (reloadedFor.current === key) return;
    reloadedFor.current = key;
    reload();
  }, [reservation, slotReached, reload]);

  if (token === null) return <Redirect href="/" />;

  async function onMyWay() {
    if (token === null || reservation === null) return;
    setBusy(true);
    const result = await checkInReservation(token, reservation.id);
    setBusy(false);
    if (result.kind === 'ok') {
      setReservation(result.reservation);
    } else if (result.kind === 'refused') {
      setRefused(true);
      await show(await getReservation(token, reservation.id));
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else setProblem('failed');
  }

  const text =
    reservation === null
      ? null
      : listingText(
          { ...reservation.listing, descriptionAr: null, descriptionEn: null, foodType: null },
          language,
        );
  // D-97: the hold, the code and "I'm on my way" start with the chosen slot.
  const waiting =
    reservation !== null &&
    reservation.status === 'Held' &&
    reservation.slotStart !== null &&
    Date.parse(reservation.slotStart) > now;
  const held = reservation !== null && reservation.status === 'Held' && !waiting;
  const active =
    reservation !== null && (reservation.status === 'Held' || reservation.status === 'Confirmed');

  return (
    <Screen scroll>
      <View testID="reservation-details" style={[styles.content, { direction }]}>
        {problem !== null ? (
          <Notice
            testID="reservation-problem"
            tone="error"
            message={problem === 'notFound' ? t('offers.problems.notFound') : t('reservation.failed')}
          />
        ) : null}
        {reservation === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {text?.name ?? t('quickPost.title')}
            </AppText>
            <AppText color="textMuted">{`${reservation.listing.shopName} · ${reservation.listing.address}`}</AppText>
            <View style={styles.row}>
              <AppText variant="caption" color="textMuted">
                {t('reservation.statusLabel')}
              </AppText>
              <AppText testID="reservation-status">{t(`reservation.statuses.${reservation.status}`)}</AppText>
            </View>
            <View style={styles.row}>
              <AppText variant="caption" color="textMuted">
                {t('offers.pickupLabel')}
              </AppText>
              <AppText>
                {t('offers.pickupWindow', {
                  start: formatDateTime(reservation.listing.pickupStart, language),
                  end: formatDateTime(reservation.listing.pickupEnd, language),
                })}
              </AppText>
            </View>

            {waiting && reservation.slotStart !== null ? (
              <View testID="reservation-waiting" style={styles.row}>
                <AppText variant="heading" color="primary">
                  {t('reservation.slotStartsAt', { time: formatDateTime(reservation.slotStart, language) })}
                </AppText>
                <Countdown
                  testID="reservation-starts-in"
                  labelKey="reservation.startsIn"
                  warn={false}
                  until={reservation.slotStart}
                />
                <AppText color="textMuted">{t('reservation.beforeSlot')}</AppText>
              </View>
            ) : null}
            {held && reservation.holdExpiresAt !== null ? (
              <AppText testID="reservation-hold" variant="heading" color="primary">
                {t('reservation.holdUntil', { time: formatDateTime(reservation.holdExpiresAt, language) })}
              </AppText>
            ) : null}
            {held && reservation.holdExpiresAt !== null ? (
              <Countdown
                testID="reservation-countdown"
                variant="heading"
                until={reservation.holdExpiresAt}
                onEnd={reload}
              />
            ) : null}

            {reservation.method === 'card' && reservation.status === 'Confirmed' ? (
              <Notice testID="reservation-paid" tone="info" message={t('reservation.paidByCard')} />
            ) : null}
            {active && reservation.pickupCode !== null ? (
              <View
                style={styles.code}
                accessible
                accessibilityLabel={`${t('reservation.codeLabel')} ${reservation.pickupCode.split('').join(' ')}`}
              >
                <AppText variant="caption" color="textMuted">
                  {t('reservation.codeLabel')}
                </AppText>
                <AppText testID="reservation-code" variant="heading" style={styles.codeText}>
                  {localDigits(reservation.pickupCode, language)}
                </AppText>
                <AppText color="textMuted">{t('reservation.codeHint')}</AppText>
              </View>
            ) : null}

            {reservation.status === 'No-show' ? (
              <Notice testID="reservation-expired" tone="info" message={t('reservation.expired')} />
            ) : null}
            {reservation.status === 'No-show' && standing !== null && standing.level !== 'none' ? (
              <Notice
                testID="reservation-no-show"
                tone={standing.level === 'notice' ? 'info' : 'error'}
                message={t(`noShow.${standing.level}`, {
                  count: standing.count,
                  limit: standing.limit,
                  days: standing.withinDays,
                  blockDays: standing.blockDays,
                })}
              />
            ) : null}

            {held && reservation.checkedIn ? (
              <Notice testID="reservation-checked-in" tone="info" message={t('reservation.checkedIn')} />
            ) : null}
            {refused ? (
              <Notice testID="reservation-refused" tone="error" message={t('reservation.checkInRefused')} />
            ) : null}
            {held ? (
              <Button
                testID="reservation-checkin"
                label={t('reservation.onMyWay')}
                busy={busy}
                disabled={reservation.checkedIn}
                onPress={() => {
                  void onMyWay();
                }}
              />
            ) : null}
            {/* US-35 (FR-RES-12, D-120): cancel before pickup. */}
            <CancelReservation reservation={reservation} onCancelled={setReservation} />
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
  code: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  codeText: {
    letterSpacing: 6,
  },
});
