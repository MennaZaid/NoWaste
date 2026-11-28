// Pay by card (US-27, FR-RES-02, E-RES-01, decision D-99): the card form for one offer: an 8-digit number, the expiry
// (MM/YY) and the CVV, checked with the shared rules before anything is sent. The card goes only to the pretend bank
// (it stands in for the payment gateway, NFR-10, IF-SW-02), which answers with a one-time token; the reservation is
// made with that token. Approved: the reservation opens with its pickup code. Otherwise the reason is shown here.
// The card is kept only in this form while it is open; it is never saved (decision D-99).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateCardInput, type CardField } from '@nowaste/shared';
import { createCardToken, getOffer, reserveByCard, type Offer, type PaymentFailure } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { listingText } from '@/listings/listingText';
import { colors, spacing } from '@/theme';

type Problem = PaymentFailure | 'soldOut' | 'offerExpired' | 'other';

/** NFR-15: one key per payment attempt, so a retry after a dropped connection is not charged twice. */
function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function PayScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  // US-29: `entry` is the waitlist entry when the consumer accepts a bag set aside for them.
  const { id, entry } = useLocalSearchParams<{ id: string; entry?: string }>();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [invalid, setInvalid] = useState<CardField[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getOffer(token, String(id)).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setOffer(result.offer);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setProblem(result.kind === 'notFound' ? 'soldOut' : 'other');
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;

  async function pay() {
    if (token === null || offer === null) return;
    setProblem(null);
    const card = { number, expiry, cvv };
    const checked = validateCardInput(card);
    if (!checked.ok) {
      setInvalid(checked.fields);
      return;
    }
    setInvalid([]);
    setBusy(true);
    const tokenResult = await createCardToken(token, card);
    if (tokenResult.kind !== 'ok') {
      setBusy(false);
      if (tokenResult.kind === 'invalidCard') setInvalid(tokenResult.fields);
      else if (tokenResult.kind === 'unauthorized' || tokenResult.kind === 'suspended') void signOut();
      else setProblem('other');
      return;
    }
    const result =
      typeof entry === 'string'
        ? await reserveByCard(token, offer.id, tokenResult.token, idempotencyKey.current, entry)
        : await reserveByCard(token, offer.id, tokenResult.token, idempotencyKey.current);
    setBusy(false);
    if (result.kind === 'ok') {
      router.replace({ pathname: '/reservations/[id]', params: { id: result.reservation.id } });
      return;
    }
    // The bank used up the token; the next try is a new payment.
    idempotencyKey.current = newIdempotencyKey();
    if (result.kind === 'paymentFailed') setProblem(result.reason);
    else if (result.kind === 'soldOut' || result.kind === 'notFound') setProblem('soldOut');
    else if (result.kind === 'offerExpired') setProblem('offerExpired');
    else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else setProblem('other');
  }

  const fieldError = (field: CardField, key: string) => (invalid.includes(field) ? t(key) : undefined);
  const name = offer === null ? null : (listingText(offer, language).name ?? t('quickPost.title'));

  return (
    <Screen scroll>
      <View testID="card-form" style={[styles.content, { direction }]}>
        {offer === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {name}
            </AppText>
            <AppText color="textMuted">{offer.place.shopName}</AppText>
            <Notice tone="info" message={t('payment.holdNote')} />
            <TextField
              testID="card-number"
              label={t('payment.number')}
              value={number}
              onChangeText={setNumber}
              keyboardType="number-pad"
              maxLength={9}
              autoComplete="off"
              error={fieldError('number', 'payment.numberInvalid')}
            />
            <TextField
              testID="card-expiry"
              label={t('payment.expiry')}
              placeholder="MM/YY"
              value={expiry}
              onChangeText={setExpiry}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              autoComplete="off"
              error={fieldError('expiry', 'payment.expiryInvalid')}
            />
            <TextField
              testID="card-cvv"
              label={t('payment.cvv')}
              password
              value={cvv}
              onChangeText={setCvv}
              keyboardType="number-pad"
              maxLength={3}
              autoComplete="off"
              error={fieldError('cvv', 'payment.cvvInvalid')}
            />
          </>
        )}
        {problem !== null ? (
          <Notice
            testID="card-problem"
            tone="error"
            message={
              problem === 'soldOut'
                ? t('offers.soldOut')
                : problem === 'offerExpired'
                  ? t('waitlist.expired')
                  : t(`payment.failed.${problem}`)
            }
          />
        ) : null}
        {offer !== null ? (
          <Button
            testID="card-pay"
            label={t('payment.pay', { amount: t('listing.egp', { amount: offer.price }) })}
            busy={busy}
            busyLabel={t('payment.paying')}
            onPress={() => {
              void pay();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
});
