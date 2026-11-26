// The reservations of one of the vendor's listings (US-32, FR-RES-09) and the pickup code at the counter (US-33,
// FR-RES-10, E-RES-03), decision D-101. At the top the vendor types the code the customer shows; a valid code shows
// which reservation it is ("Reservation #2 · Card") with Hand over and Cancel, and only Hand over marks it collected.
// Below, the bag counts and the reservations: to collect first, then finished. Each row has a number (no customer
// details), the method, the status and the time (slot, hold end, "On the way"); never the pickup code. The list is
// loaded again every minute and after a hand-over, so ended holds move to Finished.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  completePickup,
  getListingReservations,
  verifyPickup,
  type VendorReservationRow,
  type VendorReservations as View_,
} from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { bagCountsText } from '@/listings/bagCounts';
import { formatTime } from '@/listings/formatDateTime';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { useNow } from './Countdown';
import { Notice } from './Notice';
import { TextField } from './TextField';

const REFRESH_MS = 60_000;
// US-22 (D-110): the code may be a charity's, for a Donation.
type Found =
  | { kind: 'reservation'; id: string; number: number; method: 'card' | 'no-card' }
  | { kind: 'partner'; name: string; pickupTime: string };
// The text key and its values, translated when shown, so the message follows a language switch (NFR-06).
type Message = {
  tone: 'info' | 'error';
  key: string;
  values?: Record<string, string | number>;
  startsAt?: string;
};

function isToCollect(row: VendorReservationRow): boolean {
  return row.status === 'Held' || row.status === 'Confirmed';
}

export function VendorReservations({
  token,
  listingId,
  ended = false,
}: {
  token: string;
  listingId: string;
  /** D-102: the pickup has ended (the counts say "not collected" instead of "waiting"). */
  ended?: boolean;
}) {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { signOut } = useAuth();
  const now = useNow();
  const [view, setView] = useState<View_ | null>(null);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback(
    (result: Awaited<ReturnType<typeof getListingReservations>>) => {
      if (result.kind === 'ok') {
        setView(result.view);
        setFailed(false);
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    },
    [signOut],
  );

  const reload = useCallback(() => {
    void getListingReservations(token, listingId).then(show);
  }, [token, listingId, show]);

  useEffect(() => {
    let active = true;
    const load = () => {
      void getListingReservations(token, listingId).then((result) => {
        if (active) show(result);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, listingId, show]);

  const method = (value: 'card' | 'no-card') =>
    t(value === 'card' ? 'vendorReservations.card' : 'vendorReservations.noCard');

  async function check(step: 'verify' | 'complete') {
    setBusy(true);
    setMessage(null);
    const result = await (step === 'verify' ? verifyPickup : completePickup)(token, listingId, code);
    setBusy(false);
    if (result.kind === 'partner') {
      const charity = {
        kind: 'partner' as const,
        name: result.pickup.organisationName,
        pickupTime: result.pickup.pickupTime,
      };
      if (step === 'verify') {
        setFound(charity);
        return;
      }
      setFound(null);
      setCode('');
      setMessage({ tone: 'info', key: 'partnerOffers.charityHandedOver', values: { name: charity.name } });
      reload();
      return;
    }
    if (result.kind === 'ok') {
      if (step === 'verify') {
        setFound({ kind: 'reservation', ...result.reservation });
        return;
      }
      setFound(null);
      setCode('');
      setMessage({
        tone: 'info',
        key: 'vendorReservations.handedOver',
        values: { number: result.reservation.number },
      });
      reload();
      return;
    }
    setFound(null);
    if (result.kind === 'refused') {
      setMessage({
        tone: 'error',
        key: `vendorReservations.refused.${result.reason}`,
        ...(result.startsAt === undefined ? {} : { startsAt: result.startsAt }),
      });
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else setMessage({ tone: 'error', key: 'vendorReservations.failed' });
  }

  function timeOf(row: VendorReservationRow): string | null {
    if (!isToCollect(row)) return null;
    if (row.method === 'card' || row.slotStart === null) return t('vendorReservations.anyTime');
    if (Date.parse(row.slotStart) > now) {
      return t('vendorReservations.slotStarts', { time: formatTime(row.slotStart, language) });
    }
    if (row.holdExpiresAt === null) return null;
    const until = t('vendorReservations.holdUntil', { time: formatTime(row.holdExpiresAt, language) });
    return row.checkedIn ? `${until} · ${t('vendorReservations.onTheWay')}` : until;
  }

  function renderRow(row: VendorReservationRow) {
    const time = timeOf(row);
    return (
      <View key={row.id} testID={`vendor-reservation-${row.id}`} style={styles.row} accessible>
        <AppText variant="label">{t('vendorReservations.number', { number: row.number })}</AppText>
        <AppText>
          {t('vendorReservations.row', {
            method: method(row.method),
            status: t(`reservation.statuses.${row.status}`),
          })}
        </AppText>
        {time !== null ? <AppText color="textMuted">{time}</AppText> : null}
      </View>
    );
  }

  const toCollect = view?.reservations.filter(isToCollect) ?? [];
  const finished = view?.reservations.filter((row) => !isToCollect(row)) ?? [];

  return (
    <View testID="vendor-reservations" style={[styles.section, { direction }]}>
      <AppText variant="heading" accessibilityRole="header">
        {t('vendorReservations.title')}
      </AppText>

      <TextField
        testID="vendor-code"
        label={t('vendorReservations.codeLabel')}
        hint={t('vendorReservations.codeHint')}
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setFound(null);
          setMessage(null);
        }}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="off"
      />
      {found === null ? (
        <Button
          testID="vendor-code-check"
          label={t('vendorReservations.check')}
          busy={busy}
          disabled={code.trim() === ''}
          onPress={() => {
            void check('verify');
          }}
        />
      ) : (
        <View testID="vendor-code-confirm" style={styles.confirm}>
          <AppText variant="label">{t('vendorReservations.confirmTitle')}</AppText>
          <AppText>
            {found.kind === 'partner'
              ? t('partnerOffers.charityFound', {
                  name: found.name,
                  time: formatTime(found.pickupTime, language),
                })
              : `${t('vendorReservations.number', { number: found.number })} · ${method(found.method)}`}
          </AppText>
          <Button
            testID="vendor-code-handover"
            label={t('vendorReservations.handOver')}
            busy={busy}
            onPress={() => {
              void check('complete');
            }}
          />
          <Button
            testID="vendor-code-cancel"
            variant="secondary"
            label={t('vendorReservations.cancel')}
            onPress={() => {
              setFound(null);
            }}
          />
        </View>
      )}
      {message !== null ? (
        <Notice
          testID="vendor-code-message"
          tone={message.tone}
          message={t(message.key, {
            ...message.values,
            time: message.startsAt === undefined ? '' : formatTime(message.startsAt, language),
          })}
        />
      ) : null}

      {failed ? <Notice tone="error" message={t('vendorReservations.failed')} /> : null}
      {view === null ? (
        failed ? null : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : (
        <>
          <AppText color="primary">
            {ended || view.summary.notCollected > 0 || view.summary.available === 0
              ? bagCountsText(t, view.summary, view.summary.bagsTotal)
              : t('vendorReservations.summaryLeft', {
                  counts: bagCountsText(t, view.summary, view.summary.bagsTotal),
                  available: view.summary.available,
                })}
          </AppText>
          {view.reservations.length === 0 ? (
            <AppText color="textMuted">{t('vendorReservations.none')}</AppText>
          ) : null}
          {toCollect.length > 0 ? (
            <View testID="vendor-to-collect" style={styles.group}>
              <AppText variant="label">{t('vendorReservations.toCollect')}</AppText>
              {toCollect.map(renderRow)}
            </View>
          ) : null}
          {finished.length > 0 ? (
            <View testID="vendor-finished" style={styles.group}>
              <AppText variant="label">{t('vendorReservations.finished')}</AppText>
              {finished.map(renderRow)}
            </View>
          ) : null}
        </>
      )}
      <Button
        testID="vendor-reservations-refresh"
        variant="link"
        label={t('vendorReservations.refresh')}
        onPress={reload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  row: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  confirm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
});
