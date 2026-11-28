// US-35 (FR-RES-12, FR-RES-13, D-120): cancel a reservation before pickup. The consumer confirms first: a card payment
// comes back in full only within the refund time (BR-06, checked by the server); a no-card reservation cancelled after
// its slot started counts as a no-show. The result says what happened.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cancelReservation, type Reservation } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';

type Outcome = { tone: 'info' | 'error'; key: string; values?: Record<string, string | number> } | null;

export function CancelReservation({
  reservation,
  onCancelled,
}: {
  reservation: Reservation;
  onCancelled: (next: Reservation) => void;
}) {
  const { t } = useTranslation();
  const { token, signOut } = useAuth();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const open = reservation.status === 'Held' || reservation.status === 'Confirmed';

  async function confirm() {
    if (token === null) return;
    setBusy(true);
    const result = await cancelReservation(token, reservation.id);
    setBusy(false);
    setAsking(false);
    if (result.kind === 'ok') {
      const { refund, noShow } = result.result;
      if (refund.refunded) {
        setOutcome({
          tone: 'info',
          key: 'cancel.refunded',
          values: { amount: t('listing.egp', { amount: refund.amount }) },
        });
      } else if (noShow) setOutcome({ tone: 'error', key: 'cancel.noShow' });
      else if (reservation.method === 'card') setOutcome({ tone: 'info', key: 'cancel.notRefunded' });
      else setOutcome({ tone: 'info', key: 'cancel.cancelled' });
      onCancelled(result.result.reservation);
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else if (result.kind === 'notCancellable') setOutcome({ tone: 'error', key: 'cancel.notCancellable' });
    else if (result.kind === 'refundFailed') setOutcome({ tone: 'error', key: 'cancel.refundFailed' });
    else setOutcome({ tone: 'error', key: 'waitlist.failed' });
  }

  return (
    <View testID="reservation-cancel" style={styles.box}>
      {outcome !== null ? (
        <Notice testID="cancel-outcome" tone={outcome.tone} message={t(outcome.key, outcome.values)} />
      ) : null}
      {open && !asking ? (
        <Button
          testID="cancel-open"
          variant="secondary"
          label={t('cancel.button')}
          onPress={() => {
            setOutcome(null);
            setAsking(true);
          }}
        />
      ) : null}
      {open && asking ? (
        <>
          <AppText>
            {t(reservation.method === 'card' ? 'cancel.confirmCard' : 'cancel.confirmNoCard')}
          </AppText>
          <Button
            testID="cancel-yes"
            label={t('cancel.yes')}
            busy={busy}
            busyLabel={t('cancel.cancelling')}
            onPress={() => void confirm()}
          />
          <Button
            testID="cancel-no"
            variant="secondary"
            label={t('cancel.no')}
            onPress={() => {
              setAsking(false);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
  },
});
